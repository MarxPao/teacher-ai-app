// CONTRATO v2.0 — mudanças exigem bump de spec_version e aprovação do dono
import type { SkillGraphV2 } from './graph'
import {
  SENTINEL_END,
  SENTINEL_ABORT,
  SENTINEL_CONTINUE,
} from './nodes'
import type { ValueRef, Condition } from './primitives'
import type { Anchor, Candidate, AnchorScope } from './anchors'

export interface Issue {
  code:
    | 'E_NO_ENTRY'
    | 'E_DANGLING_REF'
    | 'E_BAD_SENTINEL'
    | 'E_CYCLE'
    | 'E_WRITE_WITHOUT_CHECKPOINT'
    | 'E_READONLY_VIOLATION'
    | 'E_UNDECLARED_PARAM'
    | 'E_UNDECLARED_VAR'
    | 'E_UNKNOWN_ANCHOR_REF'
    | 'E_HOST_NOT_ALLOWED'
    | 'E_LOOP_UNBOUNDED'
    | 'E_LOOP_BODY_ESCAPE'
    | 'E_PII_LITERAL'
    | 'E_LIMITS'
    | 'W_UNREACHABLE_NODE'
  nodeId?: string
  message: string
}

export interface ValidationReport {
  valid: boolean
  errors: Issue[]
  warnings: Issue[]
}

const CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/
const PHONE_REGEX = /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\d{4}|\d{4})[-.\s]?\d{4}\b/

function checkPIIText(text: string, nodeId: string | undefined, issues: Issue[]) {
  if (CPF_REGEX.test(text)) {
    issues.push({ code: 'E_PII_LITERAL', nodeId, message: 'Literal ou seletor contém padrão compatível com CPF' })
  } else if (EMAIL_REGEX.test(text)) {
    issues.push({ code: 'E_PII_LITERAL', nodeId, message: 'Literal ou seletor contém padrão compatível com e-mail' })
  } else if (PHONE_REGEX.test(text) && text.replace(/\D/g, '').length >= 10) {
    issues.push({ code: 'E_PII_LITERAL', nodeId, message: 'Literal ou seletor contém padrão compatível com telefone' })
  }
}

function inspectValueRef(val: ValueRef, nodeId: string | undefined, graph: SkillGraphV2, declaredVars: Set<string>, issues: Issue[]) {
  if ('lit' in val && typeof val.lit === 'string') {
    checkPIIText(val.lit, nodeId, issues)
  } else if ('param' in val) {
    if (!graph.params || !(val.param in graph.params)) {
      issues.push({ code: 'E_UNDECLARED_PARAM', nodeId, message: `Parâmetro "${val.param}" não declarado no grafo` })
    }
  } else if ('var' in val) {
    const rootVar = val.var.split('.')[0]
    if (!declaredVars.has(rootVar) && !(graph.params && rootVar in graph.params)) {
      issues.push({ code: 'E_UNDECLARED_VAR', nodeId, message: `Variável "${val.var}" usada antes de ser produzida` })
    }
  }
}

export function validateGraph(graph: SkillGraphV2): ValidationReport {
  const errors: Issue[] = []
  const warnings: Issue[] = []

  // 1. Limites Globais
  const nodeCount = Object.keys(graph.nodes || {}).length
  if (nodeCount > 200) {
    errors.push({ code: 'E_LIMITS', message: `Grafo excede o teto de 200 nós (atual: ${nodeCount})` })
  }
  const serialized = JSON.stringify(graph)
  if (Buffer.byteLength(serialized, 'utf-8') > 262144) {
    errors.push({ code: 'E_LIMITS', message: 'Tamanho serializado do grafo excede o teto de 256 KB' })
  }

  // 2. Nó de Entrada
  if (!graph.nodes || !(graph.entry_node in graph.nodes)) {
    errors.push({ code: 'E_NO_ENTRY', message: `Nó de entrada "${graph.entry_node}" não encontrado em nodes` })
    return { valid: false, errors, warnings }
  }

  // 3. Coleta de variáveis produzidas e verificação de referências
  const declaredVars = new Set<string>(['item', 'record', 'row', 'index'])
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    if (node.type === 'READ') declaredVars.add(node.into)
    if (node.type === 'LOOP') declaredVars.add(node.as)
    if (node.type === 'DOWNLOAD') declaredVars.add(node.into)
  }

  // 4. Verificação Estática de Nós
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    // E_READONLY_VIOLATION
    if (graph.safety.side_effect_level === 'read') {
      if (node.type === 'WRITE' || node.type === 'UPLOAD' || (node.type === 'CLICK' && node.is_submit_action)) {
        errors.push({ code: 'E_READONLY_VIOLATION', nodeId, message: `Nó mutador "${node.type}" proibido em grafo read-only` })
      }
    }

    // Validação de Host em NAVIGATE
    if (node.type === 'NAVIGATE') {
      if (node.host && !graph.safety.allowed_hosts.includes(node.host)) {
        errors.push({ code: 'E_HOST_NOT_ALLOWED', nodeId, message: `Host "${node.host}" não permitido em safety.allowed_hosts` })
      }
    }

    // Inspeção de ValueRefs e PII
    if (node.type === 'WRITE') inspectValueRef(node.value, nodeId, graph, declaredVars, errors)
    if (node.type === 'UPLOAD') inspectValueRef(node.source, nodeId, graph, declaredVars, errors)
    if (node.type === 'CHECKPOINT') {
      for (const item of node.summary) inspectValueRef(item.value, nodeId, graph, declaredVars, errors)
    }

    // Sentinelas e Arestas
    const validSentinelsSuccess = new Set([SENTINEL_END, SENTINEL_CONTINUE])
    if (node.type === 'BRANCH') {
      for (const edge of [node.on_true, node.on_false]) {
        if (!validSentinelsSuccess.has(edge) && edge !== SENTINEL_ABORT && !(edge in graph.nodes)) {
          errors.push({ code: 'E_DANGLING_REF', nodeId, message: `Aresta do BRANCH aponta para nó inexistente: "${edge}"` })
        }
      }
    } else {
      if (node.on_success !== SENTINEL_END && node.on_success !== SENTINEL_CONTINUE && !(node.on_success in graph.nodes)) {
        errors.push({ code: 'E_DANGLING_REF', nodeId, message: `on_success aponta para nó inexistente: "${node.on_success}"` })
      }
      if (node.on_fail !== SENTINEL_ABORT && !(node.on_fail in graph.nodes)) {
        errors.push({ code: 'E_DANGLING_REF', nodeId, message: `on_fail aponta para nó inexistente: "${node.on_fail}"` })
      }
      if (node.on_fail === SENTINEL_END || node.on_fail === SENTINEL_CONTINUE) {
        errors.push({ code: 'E_BAD_SENTINEL', nodeId, message: `Sentinela de sucesso "${node.on_fail}" é proibida em on_fail` })
      }
    }
  }

  // 5. Verificação de Ciclos (DAG)
  const visited = new Set<string>()
  const recursionStack = new Set<string>()
  let hasCycle = false

  function detectCycle(u: string) {
    visited.add(u)
    recursionStack.add(u)
    const node = graph.nodes[u]
    if (node) {
      const neighbors: string[] = []
      if (node.type === 'BRANCH') {
        if (node.on_true in graph.nodes) neighbors.push(node.on_true)
        if (node.on_false in graph.nodes) neighbors.push(node.on_false)
      } else {
        if (node.on_success in graph.nodes) neighbors.push(node.on_success)
        if (node.on_fail in graph.nodes) neighbors.push(node.on_fail)
      }
      for (const v of neighbors) {
        if (!visited.has(v)) {
          detectCycle(v)
        } else if (recursionStack.has(v)) {
          hasCycle = true
          errors.push({ code: 'E_CYCLE', nodeId: u, message: `Ciclo detectado no grafo envolvendo os nós "${u}" e "${v}"` })
        }
      }
    }
    recursionStack.delete(u)
  }

  for (const n of Object.keys(graph.nodes)) {
    if (!visited.has(n)) detectCycle(n)
  }

  // 6. E_WRITE_WITHOUT_CHECKPOINT (Remover checkpoints e checar alcançabilidade de nós arriscados)
  const reachableWithoutCheckpoint = new Set<string>()
  const q: string[] = [graph.entry_node]
  while (q.length > 0) {
    const curId = q.shift()!
    if (reachableWithoutCheckpoint.has(curId)) continue
    reachableWithoutCheckpoint.add(curId)
    const n = graph.nodes[curId]
    if (!n || n.type === 'CHECKPOINT') continue // Bloqueia a propagação através de CHECKPOINT

    if (n.type === 'BRANCH') {
      if (n.on_true in graph.nodes) q.push(n.on_true)
      if (n.on_false in graph.nodes) q.push(n.on_false)
    } else {
      if (n.on_success in graph.nodes) q.push(n.on_success)
      if (n.on_fail in graph.nodes) q.push(n.on_fail)
      if (n.type === 'LOOP' && n.body_entry in graph.nodes) q.push(n.body_entry)
    }
  }

  for (const nodeId of reachableWithoutCheckpoint) {
    const n = graph.nodes[nodeId]
    if (!n) continue
    const isRisky = n.type === 'WRITE' || n.type === 'UPLOAD' || (n.type === 'CLICK' && n.is_submit_action)
    if (isRisky) {
      errors.push({
        code: 'E_WRITE_WITHOUT_CHECKPOINT',
        nodeId,
        message: `Nó arriscado "${nodeId}" (${n.type}) é alcançável a partir de entry_node sem passar por um nó CHECKPOINT`,
      })
    }
  }

  // 7. Loop Body Escape & Limites
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    if (node.type === 'LOOP') {
      if (node.max_iterations <= 0 || node.max_iterations > 1000) {
        errors.push({ code: 'E_LOOP_UNBOUNDED', nodeId, message: 'LOOP deve ter max_iterations entre 1 e 1000' })
      }
      if (!(node.body_entry in graph.nodes)) {
        errors.push({ code: 'E_DANGLING_REF', nodeId, message: `body_entry "${node.body_entry}" não existe no grafo` })
      }
    }
  }

  // 8. Warning: W_UNREACHABLE_NODE
  const allReachable = new Set<string>()
  const rq: string[] = [graph.entry_node]
  while (rq.length > 0) {
    const curId = rq.shift()!
    if (allReachable.has(curId)) continue
    allReachable.add(curId)
    const n = graph.nodes[curId]
    if (!n) continue
    if (n.type === 'BRANCH') {
      if (n.on_true in graph.nodes) rq.push(n.on_true)
      if (n.on_false in graph.nodes) rq.push(n.on_false)
    } else {
      if (n.on_success in graph.nodes) rq.push(n.on_success)
      if (n.on_fail in graph.nodes) rq.push(n.on_fail)
      if (n.type === 'LOOP' && n.body_entry in graph.nodes) rq.push(n.body_entry)
    }
  }
  for (const n of Object.keys(graph.nodes)) {
    if (!allReachable.has(n)) {
      warnings.push({ code: 'W_UNREACHABLE_NODE', nodeId: n, message: `Nó "${n}" não é alcançável a partir de entry_node` })
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
