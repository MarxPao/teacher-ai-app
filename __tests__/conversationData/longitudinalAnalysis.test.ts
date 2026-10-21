import { describe, it, expect } from 'vitest'
import {
  analyzeLongitudinalCohort,
  LONGITUDINAL_DEFAULTS
} from '../../lib/conversationData/longitudinalAnalysis'
import { computeSessionPedagogicalReport } from '../../lib/conversationData/pedagogicalMetrics'
import { fixtureAula50Min } from '../../lib/conversationData/fixtures'
import type { TurnRecord, EventRecord, SessionRecord } from '../../lib/conversationData/types'

function makeMockReport(sessionId: string, teacherPct: number, meanWaitSec: number, studentQCount: number) {
  const session: SessionRecord = {
    id: sessionId,
    title: `Aula ${sessionId}`,
    session_type: 'aula',
    total_duration_ms: 3000000
  }

  const turns: TurnRecord[] = [
    { id: `${sessionId}_t1`, session_id: sessionId, speaker_label: 'p', role: 'professor', start_ms: 0, end_ms: teacherPct * 1000, text: 'Fala prof', turn_index: 0 },
    { id: `${sessionId}_t2`, session_id: sessionId, speaker_label: 'a1', role: 'aluno', start_ms: teacherPct * 1000 + 1000, end_ms: 100000, text: 'Fala aluno', turn_index: 1 }
  ]

  const events: EventRecord[] = []
  for (let i = 0; i < studentQCount; i++) {
    events.push({
      id: `${sessionId}_ev_${i}`,
      session_id: sessionId,
      turn_id: `${sessionId}_t2`,
      type: 'pergunta',
      subtype: 'conteudo',
      confidence: 1.0,
      evidence_span: 'duvida',
      start_ms: 1000,
      end_ms: 2000
    })
  }

  const baseReport = computeSessionPedagogicalReport({ session, turns, events })
  // Injeta valores para teste de série longitudinal
  baseReport.speakingRatio.value.teacherPct = teacherPct
  baseReport.speakingRatio.value.studentPct = Number((100 - teacherPct).toFixed(1))
  baseReport.waitTime.value.meanSec = meanWaitSec
  baseReport.studentQuestions.value.totalObserved = studentQCount

  return baseReport
}

describe('I4: Análise Longitudinal de Séries Históricas de Sessões', () => {
  describe('1. Requisito de Coorte Homogênea e Mínimo de Sessões', () => {
    it('retorna hasSufficientData: false se houver menos de k = 3 sessões da mesma turma/tipo', () => {
      const reports = [
        {
          report: makeMockReport('s1', 85.0, 2.5, 2),
          classId: 'turma_9A',
          sessionType: 'aula',
          sessionDate: '2026-10-01'
        },
        {
          report: makeMockReport('s2', 80.0, 3.0, 3),
          classId: 'turma_9A',
          sessionType: 'aula',
          sessionDate: '2026-10-08'
        }
      ]

      const res = analyzeLongitudinalCohort({
        reports,
        targetClassId: 'turma_9A',
        targetSessionType: 'aula'
      })

      expect(res.hasSufficientData).toBe(false)
      expect(res.sessionsCount).toBe(2)
      expect(res.warningMessage).toContain('requer pelo menos 3 sessões')
      expect(res.trends).toHaveLength(0)
    })

    it('não mistura tipos de sessão diferentes (ex: aula vs reuniao) nem turmas diferentes', () => {
      const reports = [
        { report: makeMockReport('s1', 85.0, 2.5, 2), classId: 'turma_9A', sessionType: 'aula', sessionDate: '2026-10-01' },
        { report: makeMockReport('s2', 80.0, 3.0, 3), classId: 'turma_9A', sessionType: 'reuniao', sessionDate: '2026-10-08' }, // tipo diferente
        { report: makeMockReport('s3', 75.0, 3.5, 4), classId: 'turma_9B', sessionType: 'aula', sessionDate: '2026-10-15' },   // turma diferente
        { report: makeMockReport('s4', 70.0, 3.8, 5), classId: 'turma_9A', sessionType: 'aula', sessionDate: '2026-10-22' }
      ]

      const res = analyzeLongitudinalCohort({
        reports,
        targetClassId: 'turma_9A',
        targetSessionType: 'aula'
      })

      // Apenas s1 e s4 atendem à turma 9A + aula => total 2 sessões
      expect(res.sessionsCount).toBe(2)
      expect(res.hasSufficientData).toBe(false)
    })
  })

  describe('2. Evolução Lado a Lado e Detecção Prudente de Mudança (Sem p-valor)', () => {
    it('com k = 3 sessões da mesma turma, computa deltas e detecta variação significativa com limiar', () => {
      const reports = [
        { report: makeMockReport('s1', 88.0, 2.0, 2), classId: 'turma_9A', sessionType: 'aula', sessionDate: '2026-10-01' },
        { report: makeMockReport('s2', 80.0, 3.0, 3), classId: 'turma_9A', sessionType: 'aula', sessionDate: '2026-10-08' },
        { report: makeMockReport('s3', 72.0, 3.8, 5), classId: 'turma_9A', sessionType: 'aula', sessionDate: '2026-10-15' }
      ]

      const res = analyzeLongitudinalCohort({
        reports,
        targetClassId: 'turma_9A',
        targetSessionType: 'aula'
      })

      expect(res.hasSufficientData).toBe(true)
      expect(res.sessionsCount).toBe(3)
      expect(res.trends).toHaveLength(3)

      const tttTrend = res.trends.find(t => t.metricName === 'teacher_speaking_pct')!
      expect(tttTrend.baselineValue).toBe(88.0)
      expect(tttTrend.latestValue).toBe(72.0)
      expect(tttTrend.absoluteDelta).toBe(-16.0)
      expect(tttTrend.relativeDeltaPct).toBe(-18.2)
      expect(tttTrend.isMeaningfulChange).toBe(true) // |relativeDelta| >= 10%
      expect(tttTrend.observation).toContain('redução de 16% (18.2% relativo)')
      expect(tttTrend.prudentialNote).toContain('Variações descritivas entre aulas')
    })

    it('mantém isMeaningfulChange: false quando a variação está abaixo do limiar (ex: delta < 10%)', () => {
      const reports = [
        { report: makeMockReport('s1', 80.0, 3.0, 3), classId: 'turma_9A', sessionType: 'aula', sessionDate: '2026-10-01' },
        { report: makeMockReport('s2', 81.0, 3.1, 3), classId: 'turma_9A', sessionType: 'aula', sessionDate: '2026-10-08' },
        { report: makeMockReport('s3', 82.0, 3.0, 3), classId: 'turma_9A', sessionType: 'aula', sessionDate: '2026-10-15' }
      ]

      const res = analyzeLongitudinalCohort({
        reports,
        targetClassId: 'turma_9A',
        targetSessionType: 'aula',
        config: { meaningfulDeltaPct: 10.0 }
      })

      const tttTrend = res.trends.find(t => t.metricName === 'teacher_speaking_pct')!
      expect(tttTrend.absoluteDelta).toBe(2.0)
      expect(tttTrend.relativeDeltaPct).toBe(2.5)
      expect(tttTrend.isMeaningfulChange).toBe(false)
    })
  })

  describe('3. Integração com Rótulos Reais da Professora', () => {
    const baseReports = [
      { report: makeMockReport('s1', 85.0, 2.5, 2), classId: 'turma_9A', sessionType: 'aula', sessionDate: '2026-10-01' },
      { report: makeMockReport('s2', 80.0, 3.0, 3), classId: 'turma_9A', sessionType: 'aula', sessionDate: '2026-10-08' },
      { report: makeMockReport('s3', 75.0, 3.5, 4), classId: 'turma_9A', sessionType: 'aula', sessionDate: '2026-10-15' }
    ]

    it('usa calibração sintética Holdout 4 quando n de rótulos da professora é < 100', () => {
      const res = analyzeLongitudinalCohort({
        reports: baseReports,
        targetClassId: 'turma_9A',
        userLabelingStats: { n: 45, precision: 0.95, recall: 0.85 }
      })

      expect(res.calibrationSource.type).toBe('benchmark_sintetico_holdout4')
      expect(res.calibrationSource.seal).toBe('[NÃO VALIDADO EM ASR REAL]')
      expect(res.calibrationSource.effectiveRecall).toBe(0.778)
      expect(res.calibrationSource.note).toContain('insuficiente (n = 45 < 100)')
    })

    it('substitui por rótulos reais da professora quando n >= 100', () => {
      const res = analyzeLongitudinalCohort({
        reports: baseReports,
        targetClassId: 'turma_9A',
        userLabelingStats: { n: 120, precision: 0.96, recall: 0.88 }
      })

      expect(res.calibrationSource.type).toBe('rotulos_reais_professora')
      expect(res.calibrationSource.seal).toBe('[CALIBRADO COM RÓTULOS REAIS DA PROFESSORA (n = 120)]')
      expect(res.calibrationSource.effectiveRecall).toBe(0.88)
      expect(res.calibrationSource.effectivePrecision).toBe(0.96)
      expect(res.calibrationSource.nLabelsEvaluated).toBe(120)
    })
  })
})
