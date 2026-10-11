// lib/compiler/analyze.ts
// Análise pura do trace gravado para inferência de padrões e sugestões de decisões

import type { Trace, TraceStep } from '../recorder/traceSchema'
import type { CompilerDecisions } from './decisions'
import { isSensitiveField } from '../recorder/sensitiveRules'

export interface TraceDetections {
  hasTable: boolean
  tableHeaders: string[]
  hasWrites: boolean
  hasChecks: boolean
  hasLogin: boolean
  hasPagination: boolean
  repeatedPattern: boolean
  detectedHosts: string[]
  suggestedPolarity: 'checked_is_absent' | 'checked_is_present' | null
  suggestedGradeScale: { min: number; max: number } | null
  suggestedKeyColumn: string | null
  classFilterDetection: {
    mode: 'query' | 'tab_click' | 'unsupported_select' | 'none'
    queryParam?: string
    stepId?: string
    value?: string
  }
}

export interface AnalyzeResult {
  detections: TraceDetections
  defaultDecisions: Partial<CompilerDecisions>
  pendingDecisions: Array<'attendance_polarity' | 'grade_scale' | 'row_key_column' | 'allowed_hosts'>
}

export function analyzeTrace(trace: Trace): AnalyzeResult {
  const hosts = new Set<string>()
  let hasTable = false
  let tableHeaders: string[] = []
  let hasWrites = false
  let hasChecks = false
  let hasLogin = false
  let hasPagination = false
  const writeRowIndices = new Set<number>()

  let lastFilterStep: TraceStep | null = null
  let classFilter: TraceDetections['classFilterDetection'] = { mode: 'none' }
  let observedGradeVal: number | null = null

  for (let i = 0; i < trace.steps.length; i++) {
    const step = trace.steps[i]
    if (step.host) hosts.add(step.host)

    if (step.kind === 'sensitive_field') {
      hasLogin = true
    }

    if (step.kind === 'mark_table') {
      hasTable = true
      if (step.descriptor.rowContext?.headers) {
        tableHeaders = step.descriptor.rowContext.headers
      }
    }

    if (step.kind === 'mark_next_page') {
      hasPagination = true
    }

    if (step.kind === 'click') {
      if (step.descriptor.text && /pr[oó]xim[ao]|next|seguir/i.test(step.descriptor.text)) {
        hasPagination = true
      }
      if (step.descriptor.role === 'tab' || /turma\s+[0-9A-Z]|[0-9][A-Z]\b/i.test(step.descriptor.text || '')) {
        classFilter = {
          mode: 'tab_click',
          stepId: step.id,
          value: step.descriptor.text?.trim(),
        }
      }
    }

    if (step.kind === 'select') {
      lastFilterStep = step
    }

    if (step.kind === 'navigate' && lastFilterStep) {
      try {
        const u = new URL(step.url, 'http://localhost')
        const entries = Array.from(u.searchParams.entries())
        if (entries.length > 0) {
          const matchedParam = entries.find(([k, v]) => v === (lastFilterStep as any).value) || entries[0]
          classFilter = {
            mode: 'query',
            queryParam: matchedParam[0],
            stepId: lastFilterStep.id,
            value: matchedParam[1],
          }
        }
      } catch {}
      lastFilterStep = null
    }

    if (step.kind === 'input') {
      hasWrites = true
      if (step.descriptor.rowContext) {
        hasTable = true
        if (tableHeaders.length === 0) tableHeaders = step.descriptor.rowContext.headers
        writeRowIndices.add(step.descriptor.rowContext.column_index)
      }
      const num = parseFloat(step.value.replace(',', '.'))
      if (!isNaN(num)) observedGradeVal = num
    }

    if (step.kind === 'check') {
      hasChecks = true
      if (step.descriptor.rowContext) {
        hasTable = true
        if (tableHeaders.length === 0) tableHeaders = step.descriptor.rowContext.headers
        writeRowIndices.add(step.descriptor.rowContext.column_index)
      }
    }
  }

  // Se houve um select que não resultou em navigate com query e nem foi aba:
  if (lastFilterStep && classFilter.mode === 'none') {
    classFilter = {
      mode: 'unsupported_select',
      stepId: lastFilterStep.id,
    }
  }

  // Chave de linha preferencial
  let suggestedKey: string | null = null
  for (const h of tableHeaders) {
    if (/\b(matricula|ra|codigo|registro|enrollment|id)\b/i.test(h)) {
      suggestedKey = h
      break
    }
  }
  if (!suggestedKey) {
    for (const h of tableHeaders) {
      if (/\b(nome|aluno|estudante|name|student)\b/i.test(h)) {
        suggestedKey = h
        break
      }
    }
  }

  // Sugestão de polaridade (apenas sugestão visual)
  let suggestedPolarity: 'checked_is_absent' | 'checked_is_present' | null = null
  if (hasChecks) {
    suggestedPolarity = 'checked_is_present' // Padrão clássico escolar
  }

  // Sugestão de escala de nota
  let suggestedGradeScale: { min: number; max: number } | null = null
  if (observedGradeVal !== null) {
    suggestedGradeScale = observedGradeVal <= 10 ? { min: 0, max: 10 } : { min: 0, max: 100 }
  }

  const detections: TraceDetections = {
    hasTable,
    tableHeaders,
    hasWrites,
    hasChecks,
    hasLogin,
    hasPagination,
    repeatedPattern: writeRowIndices.size > 1,
    detectedHosts: Array.from(hosts),
    suggestedPolarity,
    suggestedGradeScale,
    suggestedKeyColumn: suggestedKey,
    classFilterDetection: classFilter,
  }

  const pendingDecisions: AnalyzeResult['pendingDecisions'] = []
  if (hasChecks) pendingDecisions.push('attendance_polarity')
  if (hasWrites) pendingDecisions.push('grade_scale')
  if (hasTable) pendingDecisions.push('row_key_column')
  if (detections.detectedHosts.length === 0) pendingDecisions.push('allowed_hosts')

  return {
    detections,
    defaultDecisions: {
      portal_id: detections.detectedHosts[0] ? detections.detectedHosts[0].replace(/[^a-zA-Z0-9_]/g, '_') : 'portal_escolar',
      allowed_hosts: detections.detectedHosts,
      row_key_column: suggestedKey || undefined,
    },
    pendingDecisions,
  }
}
