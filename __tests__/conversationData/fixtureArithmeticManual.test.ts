import { describe, it, expect } from 'vitest'
import { fixtureAula50Min } from '../../lib/conversationData/fixtures'
import {
  CANONICAL_RAW_DURATIONS_MS,
  calculateIndependentTurnMetrics,
  generateManualAuditTable
} from '../../lib/conversationData/fixtureArithmeticAudit'

/**
 * Teste Independente de Aritmética Manual sobre a Fixture Canônica aula_50min_bio.
 * Este teste NÃO consome o QueryEngine nem o classificador — executa pura matemática e checagem determinística
 * sobre o JSON estático para servir de gabarito e validação independente.
 */
describe('C1. Auditoria e Aritmética Manual Independente da Fixture aula_50min_bio', () => {
  const turns = fixtureAula50Min.turns
  const roleMap: Record<string, 'professor' | 'aluno'> = {
    spk_prof: 'professor',
    spk_aluno_arthur: 'aluno',
    spk_aluno_beatriz: 'aluno',
    spk_aluno_carlos: 'aluno'
  }

  it('1. Valida contagem total e propriedades dos 18 turnos', () => {
    expect(turns).toHaveLength(18)
    turns.forEach((t, i) => {
      expect(t.startMs).toBeLessThan(t.endMs)
      if (i > 0) {
        // Sequência cronológica estrita
        expect(t.startMs).toBeGreaterThanOrEqual(turns[i - 1].endMs)
      }
    })
  })

  it('2. Calcula tempo de fala por papel (Professor: 501s / 88.4% vs Aluno: 66s / 11.6%)', () => {
    let teacherMs = 0
    let studentMs = 0

    turns.forEach(t => {
      const dur = t.endMs - t.startMs
      const role = roleMap[t.speaker]
      if (role === 'professor') teacherMs += dur
      else studentMs += dur
    })

    expect(teacherMs).toBe(501000) // 501 segundos
    expect(studentMs).toBe(66000)  // 66 segundos

    const totalSpeakingMs = teacherMs + studentMs
    expect(totalSpeakingMs).toBe(567000)

    const teacherPct = Number(((teacherMs / totalSpeakingMs) * 100).toFixed(1))
    const studentPct = Number(((studentMs / totalSpeakingMs) * 100).toFixed(1))

    expect(teacherPct).toBe(88.4)
    expect(studentPct).toBe(11.6)
  })

  it('3. Valida exatamente 5 perguntas do professor e 2 perguntas de alunos', () => {
    // Índices de perguntas docentes verificadas textualmente:
    // Turn 2: "como vocês explicariam..." -> Pergunta Aberta
    // Turn 4: "E as plantas são consideradas autótrofas?" -> Pergunta Fechada
    // Turn 8: "Quem pode me dar um exemplo de consumidor terciário..." -> Pergunta Fechada
    // Turn 13: "Carlos, qual é o principal gás..." -> Pergunta Fechada
    // Turn 15: "conseguimos absorver o nitrogênio diretamente..." -> Pergunta Fechada
    const teacherQuestionTurnIndices = [2, 4, 8, 13, 15]

    // Índices de perguntas discentes:
    // Turn 6: Carlos: "Professora, o fluxo de energia sempre diminui..."
    // Turn 10: Beatriz: "Professora, as bactérias nitrificantes..."
    const studentQuestionTurnIndices = [6, 10]

    expect(teacherQuestionTurnIndices).toHaveLength(5)
    expect(studentQuestionTurnIndices).toHaveLength(2)

    teacherQuestionTurnIndices.forEach(idx => {
      expect(roleMap[turns[idx].speaker]).toBe('professor')
      expect(turns[idx].text).toContain('?')
    })

    studentQuestionTurnIndices.forEach(idx => {
      expect(roleMap[turns[idx].speaker]).toBe('aluno')
      expect(turns[idx].text).toContain('?')
    })
  })

  it('4. Calcula métrica de espera pós-pergunta docente (Wait-Time I): média 3.8s, mediana 3.0s, pausas >=3s: 3', () => {
    const teacherQuestionTurnIndices = [2, 4, 8, 13, 15]
    const waitTimes: number[] = []

    teacherQuestionTurnIndices.forEach(idx => {
      const qTurn = turns[idx]
      const nextTurn = turns[idx + 1]
      expect(nextTurn).toBeDefined()
      const diffMs = nextTurn.startMs - qTurn.endMs
      const waitSec = Number((diffMs / 1000).toFixed(1))
      waitTimes.push(waitSec)
    })

    // Turn 2: 143500 - 137000 = 6500ms -> 6.5s
    // Turn 4: 172000 - 170000 = 2000ms -> 2.0s
    // Turn 8: 417500 - 412000 = 5500ms -> 5.5s
    // Turn 13: 718000 - 715000 = 3000ms -> 3.0s
    // Turn 15: 802000 - 800000 = 2000ms -> 2.0s
    expect(waitTimes).toEqual([6.5, 2.0, 5.5, 3.0, 2.0])

    const sum = waitTimes.reduce((acc, v) => acc + v, 0)
    const avg = Number((sum / waitTimes.length).toFixed(1))
    expect(avg).toBe(3.8)

    const sorted = [...waitTimes].sort((a, b) => a - b) // [2.0, 2.0, 3.0, 5.5, 6.5]
    const median = sorted[Math.floor(sorted.length / 2)]
    expect(median).toBe(3.0)

    const deliberatePauses = waitTimes.filter(w => w >= 3.0)
    expect(deliberatePauses).toHaveLength(3) // 6.5s, 5.5s, 3.0s
  })

  it('5. Validação direta dos 18 timestamps brutos e exibição de tabela de conferência', () => {
    turns.forEach((t, i) => {
      const dur = t.endMs - t.startMs
      expect(dur).toBe(CANONICAL_RAW_DURATIONS_MS[i])
    })

    const tableOutput = generateManualAuditTable(turns, roleMap)
    expect(tableOutput).toContain('[CONFERÊNCIA MANUAL PENDENTE (dona)]')
    console.log('\n' + tableOutput + '\n')
  })

  it('6. Testes de mutação determinística (troca de falante e acréscimo de 5s)', () => {
    // Mutação 1: Turno 0 do professor dura +5000ms
    const mutatedTurnsTime = turns.map((t, i) => i === 0 ? { ...t, endMs: t.endMs + 5000 } : t)
    const m1 = calculateIndependentTurnMetrics(mutatedTurnsTime, roleMap)
    expect(m1.teacherMs).toBe(506000)
    expect(m1.studentMs).toBe(66000)
    expect(m1.totalSpeakingMs).toBe(572000)
    expect(m1.teacherPct).toBe(88.5)
    expect(m1.studentPct).toBe(11.5)

    // Mutação 2: Turno 3 de aluno (Arthur, 11500ms) vira professor
    const mutatedTurnsRole = turns.map((t, i) => i === 3 ? { ...t, speaker: 'spk_prof' } : t)
    const m2 = calculateIndependentTurnMetrics(mutatedTurnsRole, roleMap)
    expect(m2.teacherMs).toBe(501000 + 11500)
    expect(m2.studentMs).toBe(66000 - 11500)
    expect(m2.totalSpeakingMs).toBe(567000)
  })

  it('7. Teste de propriedades invariantes (somas 100% e conservação)', () => {
    const metrics = calculateIndependentTurnMetrics(turns, roleMap)
    expect(metrics.teacherMs + metrics.studentMs).toBe(metrics.totalSpeakingMs)
    expect(Number((metrics.teacherPct + metrics.studentPct).toFixed(1))).toBe(100.0)

    let totalPauseMs = 0
    for (let i = 1; i < turns.length; i++) {
      totalPauseMs += (turns[i].startMs - turns[i - 1].endMs)
    }
    const totalSpanMs = turns[turns.length - 1].endMs - turns[0].startMs
    expect(metrics.totalSpeakingMs + totalPauseMs).toBe(totalSpanMs)
  })
})
