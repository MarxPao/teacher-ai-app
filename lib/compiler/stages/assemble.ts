// lib/compiler/stages/assemble.ts
// Montagem da árvore de nós, mapeamentos canônicos e paginação do SkillGraph v2

import type { Node } from '../../contracts/skillgraph/nodes'
import type { CanonicalMapping, PaginationConfig } from '../../contracts/skillgraph/graph'
import type { Anchor } from '../../contracts/skillgraph/anchors'
import type { Trace } from '../../recorder/traceSchema'
import type { CompilerDecisions } from '../decisions'
import type { SegmentedTrace } from './segment'
import type { ParameterContext } from './parametrize'
import { buildTableAnchor, buildAnchorFromDescriptor } from './anchors'
import { buildCheckpointNode } from './safety'
import { buildCanonicalMapping } from './canonicalMapping'
import { buildPreambleNodes, type PlannedNode } from './assemblePreamble'
import type { CompilerIssue } from '../report'

export interface AssembledGraphResult {
  entry_node: string
  nodes: Record<string, Node>
  canonical_mapping: CanonicalMapping
  pagination?: PaginationConfig
  anchor_library?: Record<string, Anchor>
  warnings: CompilerIssue[]
}

export function assembleGraph(
  trace: Trace,
  segmented: SegmentedTrace,
  decisions: CompilerDecisions,
  paramContext: ParameterContext
): AssembledGraphResult {
  const nodes: Record<string, Node> = {}
  const warnings: CompilerIssue[] = []
  let nodeCount = 0
  const nextId = () => `n${++nodeCount}`

  let tableAnchor: Anchor | undefined
  if (segmented.tableStep && 'descriptor' in segmented.tableStep) {
    tableAnchor = buildTableAnchor((segmented.tableStep as any).descriptor)
  } else {
    tableAnchor = buildTableAnchor()
  }

  // 1. Nós Iniciais (Handoff, Navegação, Abas)
  const plannedNodes: PlannedNode[] = buildPreambleNodes(trace, segmented, decisions, paramContext, nextId)

  // 2. Execução da Tarefa
  const isWriteTask = decisions.task_id === 'lancar_falta' || decisions.task_id === 'lancar_nota'

  if (decisions.task_id === 'read_roster') {
    plannedNodes.push({
      id: nextId(),
      build: (next) => ({
        type: 'READ',
        label: 'Extrair Lista de Alunos e Dados da Turma',
        source: {
          kind: 'table',
          anchor: tableAnchor!,
          skip_empty_rows: true,
        },
        into: 'roster',
        paginate: !!segmented.paginationStep,
        skip_empty_rows: true,
        retry: { max_attempts: 2, backoff_ms: 500 },
        timeout_ms: 10000,
        postconditions: [],
        on_success: next,
        on_fail: '$abort',
      }),
    })
  } else if (isWriteTask) {
    if (segmented.actionSteps.length > 1) {
      warnings.push({
        code: 'W_BATCH_PATTERN_IGNORED',
        message: 'Múltiplas interações gravadas em lote detectadas. O fluxo foi abstraído para execução unitária por parâmetro.',
      })
    }

    // CHECKPOINT Obrigatório
    plannedNodes.push({
      id: nextId(),
      build: (next) =>
        buildCheckpointNode({
          nodeId: 'n_cp',
          taskId: decisions.task_id,
          on_success: next,
          on_reject: '$abort',
        }),
    })

    // Nó WRITE
    const actionStep = segmented.actionSteps[0]
    const fieldAnchor = buildAnchorFromDescriptor(
      actionStep.descriptor,
      decisions.task_id === 'lancar_falta' ? 'Campo de frequência do aluno' : 'Campo de nota do aluno',
      tableAnchor,
      decisions,
      paramContext
    )

    plannedNodes.push({
      id: nextId(),
      build: (next) => ({
        type: 'WRITE',
        label: decisions.task_id === 'lancar_falta' ? 'Lançar Frequência do Aluno' : 'Lançar Nota do Aluno',
        anchor: fieldAnchor,
        value: paramContext.getWriteValueRef(decisions.task_id),
        method: decisions.task_id === 'lancar_falta' ? 'set_checked' : 'set_value_dispatch',
        semantic: decisions.task_id === 'lancar_falta' ? 'attendance' : 'grade',
        read_back: true,
        retry: { max_attempts: 2, backoff_ms: 500 },
        timeout_ms: 5000,
        postconditions: [],
        on_success: next,
        on_fail: '$abort',
      }),
    })

    // Nó CLICK de Submissão (se houver)
    if (segmented.submitStep) {
      const submitAnchor = buildAnchorFromDescriptor(
        segmented.submitStep.descriptor,
        'Botão de Gravar/Confirmar Lançamento',
        undefined,
        decisions,
        paramContext
      )
      plannedNodes.push({
        id: nextId(),
        build: (next) => ({
          type: 'CLICK',
          label: 'Confirmar e Salvar Alterações',
          anchor: submitAnchor,
          is_submit_action: true,
          expect_navigation: false,
          retry: { max_attempts: 2, backoff_ms: 500 },
          timeout_ms: 10000,
          postconditions: [],
          on_success: next,
          on_fail: '$abort',
        }),
      })
    }
  }

  // Encadeamento sequencial
  for (let i = 0; i < plannedNodes.length; i++) {
    const cur = plannedNodes[i]
    const nextSuccess = i === plannedNodes.length - 1 ? '$end' : plannedNodes[i + 1].id
    nodes[cur.id] = cur.build(nextSuccess)
  }

  // Canonical Mapping
  const columnHeaders = segmented.tableStep && 'descriptor' in segmented.tableStep && segmented.tableStep.descriptor.rowContext
    ? segmented.tableStep.descriptor.rowContext.headers
    : segmented.actionSteps[0]?.descriptor.rowContext?.headers || []

  const canonical_mapping = buildCanonicalMapping(columnHeaders, decisions)

  // Paginação
  let pagination: PaginationConfig | undefined
  if (segmented.paginationStep && 'descriptor' in segmented.paginationStep) {
    const nextAnchor = buildAnchorFromDescriptor(
      segmented.paginationStep.descriptor,
      'Botão de próxima página',
      undefined,
      decisions,
      paramContext
    )
    pagination = {
      type: 'next_button',
      next: nextAnchor,
      max_pages: 50,
      delay_ms: { min: 300, max: 1000 },
    }
  }

  return {
    entry_node: plannedNodes[0]?.id || 'n1',
    nodes,
    canonical_mapping,
    pagination,
    warnings,
  }
}
