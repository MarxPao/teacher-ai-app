// lib/compiler/stages/segment.ts
// Segmentação determinística dos passos do trace gravado em blocos lógicos

import type {
  Trace,
  TraceStep,
  StepClick,
  StepInput,
  StepCheck,
  StepSelect,
  StepMarkTable,
  StepMarkNextPage,
  StepSensitiveField,
} from '../../recorder/traceSchema'
import type { CompilerDecisions } from '../decisions'
import { CompilerError } from '../report'

export interface SegmentedTrace {
  initialNav?: TraceStep
  loginSteps: StepSensitiveField[]
  filterStep?: {
    mode: 'query' | 'tab_click'
    step: TraceStep
    queryParam?: string
    value?: string
  }
  tableStep?: StepMarkTable | TraceStep
  actionSteps: (StepInput | StepCheck | StepSelect | StepClick)[]
  submitStep?: StepClick
  paginationStep?: StepMarkNextPage | StepClick
}

export function segmentTrace(trace: Trace, decisions: CompilerDecisions): SegmentedTrace {
  const loginSteps: StepSensitiveField[] = []
  const actionSteps: (StepInput | StepCheck | StepSelect | StepClick)[] = []
  let tableStep: StepMarkTable | TraceStep | undefined
  let paginationStep: StepMarkNextPage | StepClick | undefined
  let submitStep: StepClick | undefined
  let initialNav: TraceStep | undefined

  // Detecção de seletor não suportado em grafos read-only
  let hasSelectWithoutQuery = false
  let lastSelectStep: StepSelect | null = null

  for (let i = 0; i < trace.steps.length; i++) {
    const step = trace.steps[i]

    if (step.kind === 'navigate' && !initialNav) {
      initialNav = step
    }

    if (step.kind === 'sensitive_field') {
      loginSteps.push(step)
    }

    if (step.kind === 'select') {
      lastSelectStep = step
      hasSelectWithoutQuery = true
      if (decisions.task_id !== 'read_roster') {
        actionSteps.push(step)
        if (!tableStep && step.descriptor.rowContext) {
          tableStep = step
        }
      }
    }

    if (step.kind === 'navigate' && lastSelectStep) {
      // Se a navegação subsequente mudou a query URL, foi suportado
      try {
        const u = new URL(step.url, 'http://localhost')
        if (Array.from(u.searchParams.keys()).length > 0) {
          hasSelectWithoutQuery = false
        }
      } catch {}
    }

    if (step.kind === 'mark_table') {
      tableStep = step
    }

    if (step.kind === 'mark_next_page') {
      paginationStep = step
    }

    if (step.kind === 'click') {
      const text = step.descriptor.text || ''
      const isSubmit =
        step.is_submit_action ||
        /\b(salvar|gravar|confirmar|concluir|submit|save|enviar|publicar|post|send)\b/i.test(text)

      if (isSubmit) {
        submitStep = step
      } else if (/\b(pr[oó]xim[ao]|next|seguir)\b/i.test(text)) {
        if (!paginationStep) paginationStep = step
      } else {
        // Pode ser ação na tabela ou navegação de aba
        actionSteps.push(step)
      }
    }

    if (step.kind === 'input') {
      actionSteps.push(step)
      if (!tableStep && step.descriptor.rowContext) {
        tableStep = step
      }
    }

    if (step.kind === 'check') {
      actionSteps.push(step)
      if (!tableStep && step.descriptor.rowContext) {
        tableStep = step
      }
    }
  }

  // Tratamento da Decisão de Filtro de Turma
  let filterStep: SegmentedTrace['filterStep'] | undefined
  if (decisions.class_filter && decisions.class_filter.mode !== 'none') {
    if (decisions.class_filter.mode === 'query') {
      // Procura o passo de navegação com query
      const navWithQuery = trace.steps.find((s) => {
        if (s.kind !== 'navigate') return false
        try {
          const u = new URL(s.url, 'http://localhost')
          return decisions.class_filter?.query_param
            ? u.searchParams.has(decisions.class_filter.query_param)
            : Array.from(u.searchParams.keys()).length > 0
        } catch {
          return false
        }
      })
      if (navWithQuery && navWithQuery.kind === 'navigate') {
        const u = new URL(navWithQuery.url, 'http://localhost')
        const qParam = decisions.class_filter.query_param || Array.from(u.searchParams.keys())[0]
        filterStep = {
          mode: 'query',
          step: navWithQuery,
          queryParam: qParam,
          value: u.searchParams.get(qParam) || undefined,
        }
      }
    } else if (decisions.class_filter.mode === 'tab_click') {
      const tabClick = trace.steps.find((s) => {
        if (s.kind !== 'click') return false
        if (decisions.class_filter?.tab_step_id) {
          return s.id === decisions.class_filter.tab_step_id
        }
        return s.descriptor.role === 'tab' || /turma\s+[0-9A-Z]|[0-9][A-Z]\b/i.test(s.descriptor.text || '')
      })
      if (tabClick) {
        filterStep = {
          mode: 'tab_click',
          step: tabClick,
          value: (tabClick as StepClick).descriptor.text?.trim(),
        }
      }
    }
  } else if (hasSelectWithoutQuery && decisions.task_id === 'read_roster') {
    throw new CompilerError(
      'E_UNSUPPORTED_PATTERN',
      'O portal utiliza seleção por dropdown (<select>) que não altera a URL. ' +
        'O contrato congelado v2.0 não suporta filtros por mutação em grafos read-only (adiado para v2.1/Fase 4).'
    )
  }

  // Validação de requisitos de escrita vs leitura
  // Selects sem rowContext são filtros de navegação (SELECT_FILTER), não lançamentos pedagógicos
  const hasWriteAction = actionSteps.some(
    s => s.kind === 'input' || s.kind === 'check' ||
    (s.kind === 'select' && !!(s.descriptor as any).rowContext)
  )
  const isWriteTask =
    decisions.task_id === 'lancar_falta' ||
    decisions.task_id === 'lancar_nota' ||
    hasWriteAction ||
    !!submitStep
  if (isWriteTask && !hasWriteAction && !submitStep) {
    throw new CompilerError(
      'E_NO_WRITE_STEP',
      `A tarefa de escrita "${decisions.task_id}" requer pelo menos um passo de marcação ou digitação gravado.`
    )
  }

  const requiresTable = decisions.task_id === 'read_roster' || decisions.task_id === 'lancar_falta' || decisions.task_id === 'lancar_nota'
  if (requiresTable && !tableStep) {
    throw new CompilerError(
      'E_NO_TABLE_MARKED',
      'Nenhuma tabela de alunos foi marcada no trace (necessário marcar tabela ou interagir com linha de aluno).'
    )
  }

  return {
    initialNav,
    loginSteps,
    filterStep,
    tableStep,
    actionSteps,
    submitStep,
    paginationStep,
  }
}
