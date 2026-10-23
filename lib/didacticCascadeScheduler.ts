/**
 * Motor de Reagendamento em Cascata na Sequência Didática (R5)
 * Empurra automaticamente as datas/semanas planejadas e reais das unidades seguintes
 * quando ocorre um feriado, evento escolar, atestado ou revisão extra, e alerta sobre
 * compressão de habilidades BNCC antes do fechamento do bimestre/trimestre.
 */

export interface SchedulableDidacticUnit {
  id: string
  quarter: '1º Trimestre' | '2º Trimestre' | '3º Trimestre'
  title: string
  topics: string[]
  bnccCodes: string[]
  plannedWeekStart: number
  plannedWeekEnd: number
  actualWeekStart: number
  actualWeekEnd: number
  status: 'completed' | 'on-track' | 'delayed' | 'upcoming' | 'current' | string
  description: string
  lessonsCount: number
}

export type UnforeseenEventReason =
  | 'Feriado / Recesso Escolar'
  | 'Evento Escolar / Feira / Gincana'
  | 'Revisão Extra para Fixação da Turma'
  | 'Atestado / Imprevisto Docente'

export interface BnccCompressionWarning {
  unitId: string
  unitTitle: string
  quarter: string
  newPlannedWeekEnd: number
  quarterMaxWeekLimit: number
  overflowWeeks: number
  affectedBnccCodes: string[]
  recommendation: string
}

export interface CascadeRescheduleResult<T extends SchedulableDidacticUnit> {
  updatedUnits: T[]
  shiftedUnitIds: string[]
  weeksDelta: number
  reason: UnforeseenEventReason
  customNote: string
  bnccCompressionWarnings: BnccCompressionWarning[]
  summaryMessage: string
}

const QUARTER_MAX_WEEK_LIMIT: Record<'1º Trimestre' | '2º Trimestre' | '3º Trimestre', number> = {
  '1º Trimestre': 15,
  '2º Trimestre': 28,
  '3º Trimestre': 42
}

/**
 * Reagenda em cascata uma unidade e todas as unidades subsequentes na Sequência Didática.
 */
export function applyCascadeRescheduleToUnits<T extends SchedulableDidacticUnit>(
  units: T[],
  options: {
    startFromUnitId?: string
    weeksDelta: number // ex.: 1 ou 2 semanas
    reason: UnforeseenEventReason
    customNote?: string
  }
): CascadeRescheduleResult<T> {
  const delta = Math.max(1, Math.min(8, Math.round(options.weeksDelta || 1)))
  const customNote = (options.customNote || '').trim()
  const dateLabel = new Date().toLocaleDateString('pt-BR')

  // Localiza índice de início (ou primeira unidade não concluída)
  let startIdx = 0
  if (options.startFromUnitId) {
    const found = units.findIndex(u => u.id === options.startFromUnitId)
    startIdx = found >= 0 ? found : 0
  } else {
    const firstNonCompleted = units.findIndex(u => u.status !== 'completed')
    startIdx = firstNonCompleted >= 0 ? firstNonCompleted : 0
  }

  const shiftedUnitIds: string[] = []
  const bnccCompressionWarnings: BnccCompressionWarning[] = []

  const updatedUnits = units.map((unit, idx) => {
    if (idx < startIdx) return unit

    shiftedUnitIds.push(unit.id)
    const isOriginUnit = idx === startIdx
    const nextPlannedStart = isOriginUnit ? unit.plannedWeekStart : unit.plannedWeekStart + delta
    const nextPlannedEnd = unit.plannedWeekEnd + delta
    const nextActualStart = isOriginUnit ? unit.actualWeekStart : unit.actualWeekStart + delta
    const nextActualEnd = unit.actualWeekEnd + delta

    const auditStamp = isOriginUnit
      ? ` [Reagendado +${delta} sem. em ${dateLabel}: ${options.reason}${customNote ? ` — ${customNote}` : ''}]`
      : ` [Cascata +${delta} sem. (${options.reason})]`

    const maxWeekLimit = QUARTER_MAX_WEEK_LIMIT[unit.quarter] || 42
    if (nextPlannedEnd > maxWeekLimit) {
      const overflowWeeks = nextPlannedEnd - maxWeekLimit
      bnccCompressionWarnings.push({
        unitId: unit.id,
        unitTitle: unit.title,
        quarter: unit.quarter,
        newPlannedWeekEnd: nextPlannedEnd,
        quarterMaxWeekLimit: maxWeekLimit,
        overflowWeeks,
        affectedBnccCodes: unit.bnccCodes || [],
        recommendation: `Compactar ${overflowWeeks} semana(s) de atividades ou integrar as habilidades ${(
          unit.bnccCodes || []
        ).join(', ')} em estudo dirigido para caber no fechamento do ${unit.quarter} (limite: Semana ${maxWeekLimit}).`
      })
    }

    return {
      ...unit,
      plannedWeekStart: nextPlannedStart,
      plannedWeekEnd: nextPlannedEnd,
      actualWeekStart: nextActualStart,
      actualWeekEnd: nextActualEnd,
      status: unit.status === 'completed' ? 'completed' : isOriginUnit ? 'delayed' : unit.status,
      description: `${unit.description || ''}${auditStamp}`.trim()
    }
  })

  const summaryMessage =
    bnccCompressionWarnings.length > 0
      ? `${shiftedUnitIds.length} unidade(s) reagendadas em cascata (+${delta} sem. por ${options.reason}). Atenção: ${bnccCompressionWarnings.length} unidade(s) apresentam alerta de compressão BNCC no fim do período!`
      : `${shiftedUnitIds.length} unidade(s) reagendadas em cascata (+${delta} sem. por ${options.reason}) dentro da margem segura do calendário.`

  return {
    updatedUnits,
    shiftedUnitIds,
    weeksDelta: delta,
    reason: options.reason,
    customNote,
    bnccCompressionWarnings,
    summaryMessage
  }
}
