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
  const writeActionSteps = segmented.actionSteps.filter(s => s.kind === 'input' || s.kind === 'check')
  const navClickSteps = segmented.actionSteps.filter(
    s => s.kind === 'click' && s.id !== (segmented.filterStep?.step as any)?.id
  )
  const isWriteTask =
    decisions.task_id === 'lancar_falta' ||
    decisions.task_id === 'lancar_nota' ||
    writeActionSteps.length > 0 ||
    !!segmented.submitStep

  // Cliques intermediários de navegação (ex.: menus, links, sub-abas)
  for (const clickStep of navClickSteps) {
    const clickAnchor = buildAnchorFromDescriptor(
      clickStep.descriptor,
      clickStep.descriptor.text ? `Menu ${clickStep.descriptor.text}` : 'Elemento de navegação',
      undefined,
      decisions,
      paramContext
    )
    const expectNav = Boolean((clickStep.descriptor as any).href || clickStep.descriptor.tag === 'a')
    plannedNodes.push({
      id: nextId(),
      build: (next) => ({
        type: 'CLICK',
        label: clickStep.descriptor.text ? `Clicar em ${clickStep.descriptor.text}` : 'Navegar pelo Menu',
        anchor: clickAnchor,
        is_submit_action: false,
        expect_navigation: expectNav,
        retry: { max_attempts: 2, backoff_ms: 500 },
        timeout_ms: 8000,
        postconditions: [],
        on_success: next,
        on_fail: '$abort',
      }),
    })
  }

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
    const seenFieldKeys = new Set<string>()
    const distinctWriteSteps: typeof writeActionSteps = []
    for (const ws of writeActionSteps) {
      const d = ws.descriptor as any
      const fieldKey = d.rowContext
        ? `table_col_${d.rowContext.column_index ?? 0}_${ws.kind}`
        : `${ws.kind}_${d.id || d.aria_label || d.label_text || d.accessible_name || d.placeholder || d.name || d.tag}`
      if (!seenFieldKeys.has(fieldKey)) {
        seenFieldKeys.add(fieldKey)
        distinctWriteSteps.push(ws)
      }
    }

    if (distinctWriteSteps.length < writeActionSteps.length) {
      warnings.push({
        code: 'W_BATCH_PATTERN_IGNORED',
        message: 'Múltiplas interações gravadas em lote detectadas. O fluxo foi abstraído para execução unitária por parâmetro.',
      })
    }

    const firstStep = distinctWriteSteps[0]
    const isAttendance =
      decisions.task_id === 'lancar_falta' ||
      decisions.attendance_polarity !== undefined ||
      firstStep?.kind === 'check'
    const isGrade = decisions.task_id === 'lancar_nota' || decisions.grade_scale !== undefined

    // CHECKPOINT Obrigatório
    plannedNodes.push({
      id: nextId(),
      build: (next) =>
        buildCheckpointNode({
          nodeId: 'n_cp',
          taskId: decisions.task_id,
          on_success: next,
          on_reject: '$abort',
          hasSubmit: !!segmented.submitStep,
          isText: !isAttendance && !isGrade,
        }),
    })

    // Nós WRITE (suporta múltiplos campos distintos em formulários/wizards)
    for (const actionStep of distinctWriteSteps) {
      const stepIsCheck = actionStep.kind === 'check' || isAttendance
      const stepLabel =
        (actionStep.descriptor as any).aria_label ||
        (actionStep.descriptor as any).label_text ||
        (actionStep.descriptor as any).accessible_name ||
        decisions.task_name
      const fieldAnchor = buildAnchorFromDescriptor(
        actionStep.descriptor,
        stepIsCheck
          ? 'Campo de frequência do aluno'
          : isGrade
          ? 'Campo de nota do aluno'
          : `Campo de texto de ${stepLabel}`,
        tableAnchor,
        decisions,
        paramContext
      )

      plannedNodes.push({
        id: nextId(),
        build: (next) => ({
          type: 'WRITE',
          label: stepIsCheck
            ? 'Lançar Frequência do Aluno'
            : isGrade
            ? 'Lançar Nota do Aluno'
            : `Registrar ${stepLabel}`,
          anchor: fieldAnchor,
          value: paramContext.getWriteValueRef(decisions.task_id),
          method: stepIsCheck ? 'set_checked' : 'set_value_dispatch',
          semantic: stepIsCheck ? 'attendance' : isGrade ? 'grade' : 'text',
          read_back: true,
          retry: { max_attempts: 2, backoff_ms: 500 },
          timeout_ms: 5000,
          postconditions: [],
          on_success: next,
          on_fail: '$abort',
        }),
      })
    }

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
