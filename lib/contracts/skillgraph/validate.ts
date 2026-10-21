// CONTRATO v2.0 — mudanças exigem bump de spec_version e aprovação do dono
import type { SkillGraphV2 } from './graph'
import {
  SENTINEL_END,
  SENTINEL_ABORT,
  SENTINEL_CONTINUE,
} from './nodes'
import type { ValueRef, Condition, TextSpec, Fingerprint } from './primitives'
import type { Anchor, Candidate, AnchorOrRef, AnchorScope, RowScope } from './anchors'

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
    | 'E_CSS_PARAM'
    | 'W_HOMONYM_RISK'
    | 'W_UNREACHABLE_NODE'
    | 'W_FOOTER_ROW_RISK'
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
const ID_KEYWORD_REGEX = /matricula|matrícula|portal_id|id|código|codigo|ra|registro/i

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
    const rootParam = val.param.split('.')[0]
    if (!graph.params || !(rootParam in graph.params)) {
      issues.push({ code: 'E_UNDECLARED_PARAM', nodeId, message: `Parâmetro "${val.param}" (raiz: "${rootParam}") não declarado no grafo` })
    }
  } else if ('var' in val) {
    const rootVar = val.var.split('.')[0]
    if (!declaredVars.has(rootVar) && !(graph.params && rootVar in graph.params)) {
      issues.push({ code: 'E_UNDECLARED_VAR', nodeId, message: `Variável "${val.var}" usada antes de ser produzida` })
    }
  }
}

function inspectTextSpec(spec: TextSpec, nodeId: string | undefined, graph: SkillGraphV2, declaredVars: Set<string>, issues: Issue[]) {
  if (typeof spec === 'string') {
    checkPIIText(spec, nodeId, issues)
  } else {
    inspectValueRef(spec, nodeId, graph, declaredVars, issues)
  }
}

function inspectAnchor(
  anchor: AnchorOrRef,
  nodeId: string | undefined,
  graph: SkillGraphV2,
  declaredVars: Set<string>,
  issues: Issue[],
  warnings: Issue[]
) {
  if ('ref' in anchor) {
    if (!graph.anchor_library || !(anchor.ref in graph.anchor_library)) {
      issues.push({ code: 'E_UNKNOWN_ANCHOR_REF', nodeId, message: `Referência a âncora "${anchor.ref}" não encontrada na anchor_library` })
    }
    return
  }

  for (const c of anchor.candidates || []) {
    if (c.strategy === 'css') {
      const sel: any = (c as any).selector
      if (typeof sel !== 'string' || (typeof sel === 'object' && ('param' in sel || 'var' in sel || 'lit' in sel))) {
        issues.push({ code: 'E_CSS_PARAM', nodeId, message: 'Candidato CSS não pode ser parametrizável com ValueRef' })
      } else {
        checkPIIText(sel, nodeId, issues)
      }
    } else if (c.strategy === 'role_name') inspectTextSpec(c.name, nodeId, graph, declaredVars, issues)
    else if (c.strategy === 'label_text') inspectTextSpec(c.label, nodeId, graph, declaredVars, issues)
    else if (c.strategy === 'aria_label') inspectTextSpec(c.aria_label, nodeId, graph, declaredVars, issues)
    else if (c.strategy === 'placeholder') inspectTextSpec(c.placeholder, nodeId, graph, declaredVars, issues)
    else if (c.strategy === 'test_id') inspectTextSpec(c.test_id, nodeId, graph, declaredVars, issues)
    else if (c.strategy === 'text') inspectTextSpec(c.text, nodeId, graph, declaredVars, issues)
    else if (c.strategy === 'column_header') inspectTextSpec(c.column_label, nodeId, graph, declaredVars, issues)
    else if (c.strategy === 'structural_relative') inspectAnchor(c.to, nodeId, graph, declaredVars, issues, warnings)
  }

  if (anchor.scope?.within) {
    const within = anchor.scope.within
    if ('ref' in within) {
      if (!graph.anchor_library || !(within.ref in graph.anchor_library)) {
        issues.push({ code: 'E_UNKNOWN_ANCHOR_REF', nodeId, message: `Referência de escopo "${within.ref}" ausente em anchor_library` })
      }
    } else if ('table' in within) {
      inspectAnchor(within.table, nodeId, graph, declaredVars, issues, warnings)
      inspectValueRef(within.key.equals, nodeId, graph, declaredVars, issues)
      if (within.key.secondary_key) {
        inspectValueRef(within.key.secondary_key.equals, nodeId, graph, declaredVars, issues)
      } else {
        const hasId = within.key.column_labels.some(l => ID_KEYWORD_REGEX.test(l))
        if (!hasId) {
          warnings.push({ code: 'W_HOMONYM_RISK', nodeId, message: 'RowScope usa apenas nome do aluno sem secondary_key (risco de homônimos)' })
        }
      }
    }
  }
}

function inspectCondition(
  cond: Condition,
  nodeId: string | undefined,
  graph: SkillGraphV2,
  declaredVars: Set<string>,
  issues: Issue[],
  warnings: Issue[]
) {
  if (cond.op === 'all' || cond.op === 'any') {
    for (const c of cond.conditions) inspectCondition(c, nodeId, graph, declaredVars, issues, warnings)
  } else if (cond.op === 'not') {
    inspectCondition(cond.condition, nodeId, graph, declaredVars, issues, warnings)
  } else if ('anchor' in cond) {
    inspectAnchor(cond.anchor, nodeId, graph, declaredVars, issues, warnings)
    if ('value' in cond) inspectValueRef(cond.value, nodeId, graph, declaredVars, issues)
  } else if ('var' in cond) {
    const rootVar = cond.var.split('.')[0]
    if (!declaredVars.has(rootVar) && !(graph.params && rootVar in graph.params)) {
      issues.push({ code: 'E_UNDECLARED_VAR', nodeId, message: `Variável "${cond.var}" em Condition usada antes de ser produzida` })
    }
    if ('value' in cond) inspectValueRef(cond.value, nodeId, graph, declaredVars, issues)
  }
}

function inspectFingerprint(fp: Fingerprint | undefined, nodeId: string | undefined, graph: SkillGraphV2, declaredVars: Set<string>, issues: Issue[], warnings: Issue[]) {
  if (!fp) return
  for (const lm of fp.landmarks || []) inspectAnchor(lm, nodeId, graph, declaredVars, issues, warnings)
  for (const fl of fp.forbidden_landmarks || []) inspectAnchor(fl, nodeId, graph, declaredVars, issues, warnings)
}

export function validateGraph(graph: SkillGraphV2): ValidationReport {
  const errors: Issue[] = []
  const warnings: Issue[] = []

  // 1. Limites Globais
  const nodeCount = Object.keys(graph.nodes || {}).length
  if (nodeCount > 200) errors.push({ code: 'E_LIMITS', message: `Grafo excede o teto de 200 nós (atual: ${nodeCount})` })
  const serialized = JSON.stringify(graph)
  const byteLength = typeof Buffer !== 'undefined' ? Buffer.byteLength(serialized, 'utf-8') : new TextEncoder().encode(serialized).length
  if (byteLength > 262144) {
    errors.push({ code: 'E_LIMITS', message: 'Tamanho serializado do grafo excede o teto de 256 KB' })
  }

  // 2. Nó de Entrada
  if (!graph.nodes || !(graph.entry_node in graph.nodes)) {
    errors.push({ code: 'E_NO_ENTRY', message: `Nó de entrada "${graph.entry_node}" não encontrado em nodes` })
    return { valid: false, errors, warnings }
  }

  // 3. Coleta de variáveis produzidas
  const declaredVars = new Set<string>(['item', 'record', 'row', 'index'])
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    if (node.type === 'READ') declaredVars.add(node.into)
    if (node.type === 'LOOP') declaredVars.add(node.as)
    if (node.type === 'DOWNLOAD') declaredVars.add(node.into)
  }

  // 4. Varredura de anchor_library e fingerprints
  if (graph.anchor_library) {
    for (const [name, anc] of Object.entries(graph.anchor_library)) {
      inspectAnchor(anc, `anchor_library.${name}`, graph, declaredVars, errors, warnings)
    }
  }
  inspectFingerprint(graph.entry_fingerprint, 'entry_fingerprint', graph, declaredVars, errors, warnings)

  // 5. Verificação Estática de Nós
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    if (graph.safety.side_effect_level === 'read') {
      if (node.type === 'WRITE' || node.type === 'UPLOAD' || (node.type === 'CLICK' && node.is_submit_action)) {
        errors.push({ code: 'E_READONLY_VIOLATION', nodeId, message: `Nó mutador "${node.type}" proibido em grafo read-only` })
      }
    }

    if (node.type === 'NAVIGATE' && node.host && !graph.safety.allowed_hosts.includes(node.host)) {
      errors.push({ code: 'E_HOST_NOT_ALLOWED', nodeId, message: `Host "${node.host}" não permitido em safety.allowed_hosts` })
    }

    // Inspeção de âncoras e valores
    if ('anchor' in node) inspectAnchor(node.anchor, nodeId, graph, declaredVars, errors, warnings)
    if (node.type === 'READ') inspectAnchor(node.source.anchor, nodeId, graph, declaredVars, errors, warnings)
    if (node.type === 'WRITE') inspectValueRef(node.value, nodeId, graph, declaredVars, errors)
    if (node.type === 'UPLOAD') {
      inspectAnchor(node.input, nodeId, graph, declaredVars, errors, warnings)
      inspectValueRef(node.source, nodeId, graph, declaredVars, errors)
    }
    if (node.type === 'DOWNLOAD') inspectAnchor(node.trigger, nodeId, graph, declaredVars, errors, warnings)
    if (node.type === 'CHECKPOINT') {
      for (const item of node.summary) inspectValueRef(item.value, nodeId, graph, declaredVars, errors)
    }
    if (node.type === 'BRANCH') inspectCondition(node.condition, nodeId, graph, declaredVars, errors, warnings)
    if (node.type === 'WAIT' && node.until) inspectCondition(node.until, nodeId, graph, declaredVars, errors, warnings)
    if (node.type === 'HANDOFF_HUMAN') inspectCondition(node.resume_when, nodeId, graph, declaredVars, errors, warnings)
    for (const pc of node.postconditions || []) inspectCondition(pc, nodeId, graph, declaredVars, errors, warnings)
    inspectFingerprint(node.expect_fingerprint, nodeId, graph, declaredVars, errors, warnings)

    // Sentinelas e Arestas
    const validSentinels = new Set([SENTINEL_END, SENTINEL_CONTINUE])
    if (node.type === 'BRANCH') {
      for (const edge of [node.on_true, node.on_false]) {
        if (!validSentinels.has(edge) && edge !== SENTINEL_ABORT && !(edge in graph.nodes)) {
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

  // 6. Verificação de Ciclos (DAG)
  const visited = new Set<string>()
  const recStack = new Set<string>()
  function detectCycle(u: string) {
    visited.add(u)
    recStack.add(u)
    const n = graph.nodes[u]
    if (n) {
      const neighbors: string[] = []
      if (n.type === 'BRANCH') {
        if (n.on_true in graph.nodes) neighbors.push(n.on_true)
        if (n.on_false in graph.nodes) neighbors.push(n.on_false)
      } else {
        if (n.on_success in graph.nodes) neighbors.push(n.on_success)
        if (n.on_fail in graph.nodes) neighbors.push(n.on_fail)
      }
      for (const v of neighbors) {
        if (!visited.has(v)) detectCycle(v)
        else if (recStack.has(v)) {
          errors.push({ code: 'E_CYCLE', nodeId: u, message: `Ciclo detectado envolvendo nós "${u}" e "${v}"` })
        }
      }
    }
    recStack.delete(u)
  }
  for (const n of Object.keys(graph.nodes)) {
    if (!visited.has(n)) detectCycle(n)
  }

  // 7. E_WRITE_WITHOUT_CHECKPOINT (Sem checkpoints, checa alcance de nós arriscados)
  const reachableWithoutCheckpoint = new Set<string>()
  const q: string[] = [graph.entry_node]
  while (q.length > 0) {
    const curId = q.shift()!
    if (reachableWithoutCheckpoint.has(curId)) continue
    reachableWithoutCheckpoint.add(curId)
    const n = graph.nodes[curId]
    if (!n || n.type === 'CHECKPOINT') continue

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
    if (n && (n.type === 'WRITE' || n.type === 'UPLOAD' || (n.type === 'CLICK' && n.is_submit_action))) {
      errors.push({ code: 'E_WRITE_WITHOUT_CHECKPOINT', nodeId, message: `Nó arriscado "${nodeId}" alcançável sem CHECKPOINT prévio` })
    }
  }

  // 8. Loop Body Escape & Limites
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    if (node.type === 'LOOP') {
      if (node.max_iterations <= 0 || node.max_iterations > 1000) {
        errors.push({ code: 'E_LOOP_UNBOUNDED', nodeId, message: 'LOOP deve ter max_iterations entre 1 e 1000' })
      }
      if (!(node.body_entry in graph.nodes)) {
        errors.push({ code: 'E_DANGLING_REF', nodeId, message: `body_entry "${node.body_entry}" não existe no grafo` })
      } else if (node.over.kind === 'table_rows') {
        const hasSkip =
          (Array.isArray((node as any).skip_rows) && (node as any).skip_rows.length > 0) ||
          (Array.isArray((node.over as any).skip_rows) && (node.over as any).skip_rows.length > 0)

        if (!hasSkip) {
          // Checa se o corpo do laço alcança nó arriscado (WRITE, UPLOAD, CLICK com is_submit_action)
          const bq: string[] = [node.body_entry]
          const visitedBody = new Set<string>()
          let reachesRisky = false

          while (bq.length > 0) {
            const curId = bq.shift()!
            if (curId === SENTINEL_CONTINUE || curId === SENTINEL_ABORT || curId === SENTINEL_END) continue
            if (visitedBody.has(curId)) continue
            visitedBody.add(curId)

            const target = graph.nodes[curId]
            if (!target) continue

            if (
              target.type === 'WRITE' ||
              target.type === 'UPLOAD' ||
              (target.type === 'CLICK' && target.is_submit_action)
            ) {
              reachesRisky = true
              break
            }

            if (target.type === 'BRANCH') {
              if (target.on_true in graph.nodes) bq.push(target.on_true)
              if (target.on_false in graph.nodes) bq.push(target.on_false)
            } else {
              if (target.on_success in graph.nodes) bq.push(target.on_success)
              if (target.on_fail in graph.nodes) bq.push(target.on_fail)
              if (target.type === 'LOOP' && target.body_entry in graph.nodes) bq.push(target.body_entry)
            }
          }

          if (reachesRisky) {
            warnings.push({
              code: 'W_FOOTER_ROW_RISK',
              nodeId,
              message: `LOOP sobre table_rows "${nodeId}" alcança nó arriscado sem skip_rows configurado (risco de interagir com linha de rodapé/total)`,
            })
          }
        }
      }
    }
  }

  // 9. Warning: W_UNREACHABLE_NODE
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

  return { valid: errors.length === 0, errors, warnings }
}
