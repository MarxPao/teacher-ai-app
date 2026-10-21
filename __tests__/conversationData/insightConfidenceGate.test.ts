import { describe, it, expect } from 'vitest'
import {
  runInsightConfidenceGate,
  isDemoOrMockSession,
  calculateMaxGapMs
} from '../../lib/conversationData/insightConfidenceGate'
import { computeSessionPedagogicalReport } from '../../lib/conversationData/pedagogicalMetrics'
import { fixtureAula50Min } from '../../lib/conversationData/fixtures'
import type { TurnRecord, EventRecord, SessionRecord } from '../../lib/conversationData/types'

function getFixtureData() {
  const roleMap: Record<string, any> = {
    spk_prof: 'professor',
    spk_aluno_arthur: 'aluno',
    spk_aluno_beatriz: 'aluno',
    spk_aluno_carlos: 'aluno'
  }

  const session: SessionRecord = {
    id: 'aula_real_9ano_ingles',
    title: 'Aula de Inglês 9º Ano - Environmental Issues',
    session_type: 'aula',
    total_duration_ms: fixtureAula50Min.totalDurationMs
  }

  const turns: TurnRecord[] = fixtureAula50Min.turns.map((t, idx) => ({
    id: `turn_${idx}`,
    session_id: session.id,
    speaker_label: t.speaker,
    role: roleMap[t.speaker] || 'aluno',
    start_ms: t.startMs,
    end_ms: t.endMs,
    text: t.text,
    turn_index: idx
  }))

  const teacherQIndices = [2, 4, 8, 13, 15]
  const studentQIndices = [6, 10]

  const events: EventRecord[] = []
  teacherQIndices.forEach(idx => {
    events.push({
      id: `ev_q_${idx}`,
      session_id: session.id,
      turn_id: `turn_${idx}`,
      type: 'pergunta',
      subtype: idx === 13 ? 'administrativa' : idx === 4 ? 'checagem' : 'conteudo',
      confidence: 1.0,
      evidence_span: turns[idx].text,
      start_ms: turns[idx].start_ms,
      end_ms: turns[idx].end_ms
    })
  })

  studentQIndices.forEach(idx => {
    events.push({
      id: `ev_q_stu_${idx}`,
      session_id: session.id,
      turn_id: `turn_${idx}`,
      type: 'pergunta',
      subtype: 'conteudo',
      confidence: 1.0,
      evidence_span: turns[idx].text,
      start_ms: turns[idx].start_ms,
      end_ms: turns[idx].end_ms
    })
  })

  const pedagogicalReport = computeSessionPedagogicalReport({ session, turns, events })
  return { session, turns, events, pedagogicalReport }
}

describe('I3: Gate de Confiança Pré-Insight', () => {
  describe('1. Detecção de Dados Mock e Demonstração Sintética', () => {
    it('detecta IDs e títulos de sessões de teste ou demo', () => {
      expect(isDemoOrMockSession({ id: 'demo_session_1', title: 'Aula', session_type: 'aula', total_duration_ms: 1000 })).toBe(true)
      expect(isDemoOrMockSession({ id: 'mock_aula', title: 'Aula', session_type: 'aula', total_duration_ms: 1000 })).toBe(true)
      expect(isDemoOrMockSession({ id: 's1', title: 'Aula de Teste [DEMO]', session_type: 'aula', total_duration_ms: 1000 })).toBe(true)
      expect(isDemoOrMockSession({ id: 's1', title: 'Aula 9º Ano B', session_type: 'aula', total_duration_ms: 1000 })).toBe(false)
    })

    it('rejeita sessões demo no Gate com reasonCode E_DEMO_DATA_EXCLUDED e zero insights emitidos', () => {
      const { session, turns, pedagogicalReport } = getFixtureData()
      const demoSession = { ...session, id: 'demo_aula_sintetica' }

      const result = runInsightConfidenceGate({
        session: demoSession,
        turns,
        pedagogicalReport
      })

      expect(result.passed).toBe(false)
      expect(result.reasonCode).toBe('E_DEMO_DATA_EXCLUDED')
      expect(result.insights).toHaveLength(0)
      expect(result.message).toContain('demonstração')
    })
  })

  describe('2. Barreira de Duração e Amostragem Mínima', () => {
    it('rejeita sessão com duração inferior a 5 minutos (E_SESSION_TOO_SHORT)', () => {
      const { session, turns, events } = getFixtureData()
      const shortSession = { ...session, total_duration_ms: 180000 } // 3 minutos
      const shortReport = computeSessionPedagogicalReport({ session: shortSession, turns, events })

      const result = runInsightConfidenceGate({
        session: shortSession,
        turns,
        pedagogicalReport: shortReport
      })

      expect(result.passed).toBe(false)
      expect(result.reasonCode).toBe('E_SESSION_TOO_SHORT')
      expect(result.insights).toHaveLength(0)
      expect(result.message).toContain('inferior ao mínimo de 5 minutos')
    })

    it('rejeita sessão com menos de 5 turnos de fala (E_INSUFFICIENT_TURNS)', () => {
      const { session, pedagogicalReport } = getFixtureData()
      const fewTurns: TurnRecord[] = [
        { id: 't1', session_id: 's', speaker_label: 'p', role: 'professor', start_ms: 0, end_ms: 1000, text: 'Olá', turn_index: 0 },
        { id: 't2', session_id: 's', speaker_label: 'a', role: 'aluno', start_ms: 1100, end_ms: 2000, text: 'Oi', turn_index: 1 }
      ]

      const result = runInsightConfidenceGate({
        session,
        turns: fewTurns,
        pedagogicalReport
      })

      expect(result.passed).toBe(false)
      expect(result.reasonCode).toBe('E_INSUFFICIENT_TURNS')
      expect(result.insights).toHaveLength(0)
      expect(result.message).toContain('apenas 2 turno(s)')
    })
  })

  describe('3. Barreira de Integridade da Transcrição (Hiato / Gaps)', () => {
    it('calcula o maior hiato de silêncio contínuo entre turnos', () => {
      const turns: TurnRecord[] = [
        { id: 't1', session_id: 's', speaker_label: 'p', role: 'professor', start_ms: 0, end_ms: 10000, text: 'a', turn_index: 0 },
        { id: 't2', session_id: 's', speaker_label: 'p', role: 'professor', start_ms: 30000, end_ms: 40000, text: 'b', turn_index: 1 } // gap = 20000ms
      ]
      expect(calculateMaxGapMs(turns)).toBe(20000)
    })

    it('rejeita transcrição com buraco anômalo superior a 40 minutos (E_TRANSCRIPTION_GAPS_DETECTED)', () => {
      const { session, turns, events } = getFixtureData()
      // Insere um hiato gigante de 50 minutos (3,000,000 ms) entre o turno 2 e 3
      const corruptedTurns = turns.map((t, i) => i >= 3 ? { ...t, start_ms: t.start_ms + 3000000, end_ms: t.end_ms + 3000000 } : t)
      const report = computeSessionPedagogicalReport({ session, turns: corruptedTurns, events })

      const result = runInsightConfidenceGate({
        session,
        turns: corruptedTurns,
        pedagogicalReport: report
      })

      expect(result.passed).toBe(false)
      expect(result.reasonCode).toBe('E_TRANSCRIPTION_GAPS_DETECTED')
      expect(result.insights).toHaveLength(0)
      expect(result.message).toContain('hiato anômalo')
    })
  })

  describe('4. Sessão Íntegra e Qualificada', () => {
    it('aprova sessão íntegra de 50 minutos, anexa ressalva honesta e retorna insights com selos', () => {
      const { session, turns, pedagogicalReport } = getFixtureData()

      const result = runInsightConfidenceGate({
        session,
        turns,
        pedagogicalReport
      })

      expect(result.passed).toBe(true)
      expect(result.insights.length).toBeGreaterThanOrEqual(1)
      expect(result.classifierDisclaimer).toContain('[NÃO VALIDADO EM ASR REAL]')
      expect(result.metadata.turnsCount).toBe(18)
      expect(result.metadata.durationMs).toBe(3000000)
    })
  })
})
