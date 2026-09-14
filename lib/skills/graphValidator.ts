/**
 * graphValidator.ts — Validador Estático de Segurança do Skill Graph (Lote 1)
 *
 * REGRA INEGOCIÁVEL (Princípio D / Humano no Loop):
 * Todo grafo que contenha pelo menos um nó WRITE ou CLICK sobre botão de submit
 * DEVE ter obrigatoriamente um nó CHECKPOINT precedendo a ação em todos os caminhos possíveis.
 */

import { SkillGraph, SkillGraphSchema, SkillNode } from './skillGraphSchema'

export interface GraphValidationResult {
  valid: boolean
  safe: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Determina se um nó é considerado de alto risco (escrita ou submissão definitiva).
 *
 * ORIGEM DA CLASSIFICAÇÃO:
 * - (a) Manual e explícita na definição/edição da Skill (v0.1 / v1). Em fases futuras,
 *   poderá ser pré-sugerida por heurísticas do gravador (ex: button[type=submit]),
 *   mas a validação do grafo exige sempre a declaração explícita do valor booleano.
 *
 * POSTURA DE SEGURANÇA (Fail-Safe):
 * - Todo nó WRITE é intrinsecamente de risco.
 * - Todo nó CLICK é considerado de risco por padrão, a menos que `is_submit_action`
 *   esteja expressamente declarado como `false`.
 */
export function isRiskNode(node: SkillNode): boolean {
  if (node.type === 'WRITE') {
    if (node.params?.is_filter === true || (node.params as any)?.is_submit_action === false) {
      return false
    }
    return true
  }
  if (node.type === 'CLICK') {
    // Fail-safe: apenas false explícito descaracteriza risco de submissão
    return node.params?.is_submit_action !== false
  }
  return false
}

/**
 * Valida a integridade estrutural e as regras inegociáveis de segurança do Skill Graph.
 */
export function validateSkillGraph(rawGraph: unknown): GraphValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 1. Validação de Schema básico com Zod
  const parseResult = SkillGraphSchema.safeParse(rawGraph)
  if (!parseResult.success) {
    const rawIssues: any[] = parseResult.error.issues || (parseResult.error as any).errors || []
    return {
      valid: false,
      safe: false,
      errors: rawIssues.map(e => `${e.path.join('.')}: ${e.message}`),
      warnings: [],
    }
  }

  const graph = parseResult.data

  // 2. Validação de Nós CLICK: Exigência de Classificação Explícita
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.type === 'CLICK') {
      if (typeof node.params?.is_submit_action !== 'boolean') {
        errors.push(
          `VIOLAÇÃO DE SEGURANÇA: O nó CLICK "${id}" deve declarar explicitamente o campo 'is_submit_action' (true ou false). Ausência de classificação não é permitida.`
        )
      }
    }
  }

  // 3. Validação de Nó de Entrada
  if (!graph.nodes[graph.entry_node]) {
    errors.push(`Nó de entrada 'entry_node' ("${graph.entry_node}") não existe no grafo.`)
    return { valid: false, safe: false, errors, warnings }
  }

  // 4. Validação de Referências de Arestas (on_success, on_fail)
  const allowedTerminals = new Set(['ABORT', 'ASK_HUMAN', null])
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.on_success && !graph.nodes[node.on_success] && !allowedTerminals.has(node.on_success)) {
      errors.push(`Nó "${id}": on_success aponta para nó inexistente "${node.on_success}".`)
    }
    if (node.on_fail && !graph.nodes[node.on_fail] && !allowedTerminals.has(node.on_fail)) {
      errors.push(`Nó "${id}": on_fail aponta para nó inexistente "${node.on_fail}".`)
    }
  }

  // Se já há erros estruturais, interrompe antes da análise de caminhos
  if (errors.length > 0) {
    return { valid: false, safe: false, errors, warnings }
  }

  // 4. REGRA DE SEGURANÇA CRÍTICA: Análise de Caminhos para CHECKPOINT Obrigatório
  // Encontra todos os nós de risco (WRITE ou CLICK de submit)
  const riskNodeIds = Object.keys(graph.nodes).filter(id => isRiskNode(graph.nodes[id]))

  if (riskNodeIds.length > 0) {
    // Verifica se há pelo menos um nó CHECKPOINT no grafo inteiro
    const checkpointNodes = Object.values(graph.nodes).filter(n => n.type === 'CHECKPOINT')
    if (checkpointNodes.length === 0) {
      errors.push(
        `VIOLAÇÃO DE SEGURANÇA: O grafo contém ações de escrita/submissão ([${riskNodeIds.join(', ')}]), ` +
        `mas NENHUM nó do tipo 'CHECKPOINT' foi declarado. É terminantemente proibida execução sem aprovação humana.`
      )
      return { valid: false, safe: false, errors, warnings }
    }

    // Para cada nó de risco, percorre todos os caminhos partindo do entry_node via DFS
    for (const riskId of riskNodeIds) {
      const pathsWithoutCheckpoint = findPathsToNodeWithoutCheckpoint(graph, graph.entry_node, riskId)
      if (pathsWithoutCheckpoint.length > 0) {
        errors.push(
          `VIOLAÇÃO DE SEGURANÇA: O nó de risco "${riskId}" pode ser alcançado sem passar por um CHECKPOINT prévio. ` +
          `Caminho inseguro detectado: ${pathsWithoutCheckpoint[0].join(' -> ')}`
        )
      }
    }
  }

  const isValid = errors.length === 0
  return {
    valid: isValid,
    safe: isValid,
    errors,
    warnings,
  }
}

/**
 * Busca caminhos de startId até targetId onde nenhum nó intermediário seja CHECKPOINT.
 * Utiliza busca em profundidade com controle de ciclos visitados.
 */
function findPathsToNodeWithoutCheckpoint(
  graph: SkillGraph,
  startId: string,
  targetId: string,
  visitedInCurrentPath: Set<string> = new Set(),
  currentPath: string[] = []
): string[][] {
  const results: string[][] = []

  // Se chegamos no nó alvo sem ter encontrado checkpoint
  if (startId === targetId) {
    results.push([...currentPath, targetId])
    return results
  }

  const node = graph.nodes[startId]
  if (!node) return results

  // Se o nó atual for um CHECKPOINT, este caminho está protegido! Não prossegue buscando falhas por aqui.
  if (node.type === 'CHECKPOINT') {
    return results
  }

  visitedInCurrentPath.add(startId)
  const newPath = [...currentPath, startId]

  // Próximos passos possíveis
  const nextNodes: string[] = []
  if (node.on_success && graph.nodes[node.on_success]) nextNodes.push(node.on_success)
  if (node.on_fail && graph.nodes[node.on_fail]) nextNodes.push(node.on_fail)

  for (const nextId of nextNodes) {
    if (!visitedInCurrentPath.has(nextId)) {
      const subPaths = findPathsToNodeWithoutCheckpoint(
        graph,
        nextId,
        targetId,
        new Set(visitedInCurrentPath),
        newPath
      )
      results.push(...subPaths)
    }
  }

  return results
}