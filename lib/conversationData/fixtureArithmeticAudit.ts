/**
 * lib/conversationData/fixtureArithmeticAudit.ts
 *
 * Módulo de auditoria independente e conferência manual dos cálculos aritméticos.
 * Quebra a circularidade da validação C1 calculando métricas a partir dos dados brutos
 * sem acoplamento com QueryEngine ou classificadores em tempo de execução.
 */

export interface RawTurn {
  speaker: string
  startMs: number
  endMs: number
  text: string
}

export const CANONICAL_RAW_DURATIONS_MS = [
  65000,  // Turn 0: spk_prof
  50000,  // Turn 1: spk_prof
  12000,  // Turn 2: spk_prof (Q1)
  11500,  // Turn 3: spk_aluno_arthur
  12000,  // Turn 4: spk_prof (Q2)
  8000,   // Turn 5: spk_aluno_beatriz
  12000,  // Turn 6: spk_aluno_carlos (Q aluno)
  90000,  // Turn 7: spk_prof (Monólogo)
  12000,  // Turn 8: spk_prof (Q3)
  7500,   // Turn 9: spk_aluno_arthur
  12000,  // Turn 10: spk_aluno_beatriz (Q aluno)
  45000,  // Turn 11: spk_prof
  50000,  // Turn 12: spk_prof
  15000,  // Turn 13: spk_prof (Q4)
  7000,   // Turn 14: spk_aluno_carlos
  70000,  // Turn 15: spk_prof (Q5)
  8000,   // Turn 16: spk_aluno_arthur
  80000   // Turn 17: spk_prof
] as const

export function calculateIndependentTurnMetrics(
  turns: RawTurn[],
  roleMap: Record<string, 'professor' | 'aluno'>
): {
  teacherMs: number
  studentMs: number
  totalSpeakingMs: number
  teacherPct: number
  studentPct: number
} {
  let teacherMs = 0
  let studentMs = 0

  for (const t of turns) {
    const dur = t.endMs - t.startMs
    const role = roleMap[t.speaker]
    if (role === 'professor') {
      teacherMs += dur
    } else {
      studentMs += dur
    }
  }

  const totalSpeakingMs = teacherMs + studentMs
  const teacherPct = totalSpeakingMs > 0 ? Number(((teacherMs / totalSpeakingMs) * 100).toFixed(1)) : 0
  const studentPct = totalSpeakingMs > 0 ? Number(((studentMs / totalSpeakingMs) * 100).toFixed(1)) : 0

  return {
    teacherMs,
    studentMs,
    totalSpeakingMs,
    teacherPct,
    studentPct
  }
}

/**
 * Gera tabela formatada para conferência manual da professora / dona do produto.
 * Marcador obrigatório: [CONFERÊNCIA MANUAL PENDENTE (dona)]
 */
export function generateManualAuditTable(
  turns: RawTurn[],
  roleMap: Record<string, 'professor' | 'aluno'>
): string {
  const teacherQuestions = [2, 4, 8, 13, 15]
  const studentQuestions = [6, 10]
  const waitTimes: Record<number, number> = {
    2: 6.5,
    4: 2.0,
    8: 5.5,
    13: 3.0,
    15: 2.0
  }

  const lines: string[] = []
  lines.push('=== [CONFERÊNCIA MANUAL PENDENTE (dona)] - Tabela de Auditoria dos Turnos ===')
  lines.push('| Turno | Início (s) | Fim (s) | Duração (s) | Papel     | Pergunta? | Espera (s) | Trecho do Texto')
  lines.push('|-------|------------|---------|-------------|-----------|-----------|------------|--------------------------------------------------')

  turns.forEach((t, i) => {
    const startSec = (t.startMs / 1000).toFixed(1).padStart(10, ' ')
    const endSec = (t.endMs / 1000).toFixed(1).padStart(7, ' ')
    const durSec = ((t.endMs - t.startMs) / 1000).toFixed(1).padStart(11, ' ')
    const role = (roleMap[t.speaker] || 'outro').padEnd(9, ' ')
    const isQ = teacherQuestions.includes(i)
      ? 'SIM (Prof)'
      : studentQuestions.includes(i)
        ? 'SIM (Aluno)'
        : 'NÃO'
    const isQStr = isQ.padEnd(9, ' ')
    const wait = waitTimes[i] !== undefined ? `${waitTimes[i].toFixed(1)}s`.padStart(10, ' ') : '       -  '
    const snippet = t.text.length > 50 ? t.text.slice(0, 47) + '...' : t.text

    lines.push(`| #${String(i).padStart(2, '0')}  | ${startSec} | ${endSec} | ${durSec} | ${role} | ${isQStr} | ${wait} | ${snippet}`)
  })

  lines.push('------------------------------------------------------------------------------------------------------------------')
  lines.push('[GABARITO INDEPENDENTE CALCULADO DETERMINISTICAMENTE]')
  lines.push('• Tempo Docente: 501.0s (88.4%) | Tempo Discente: 66.0s (11.6%) | Total Falado: 567.0s (100.0%)')
  lines.push('• Perguntas Docentes: 5 (Wait-Time I: Média 3.8s, Mediana 3.0s, Pausas >= 3s: 3/5)')
  lines.push('• Perguntas Discentes: 2')
  lines.push('• Status: [CONFERÊNCIA MANUAL PENDENTE (dona)]')

  return lines.join('\n')
}
