import { describe, it, expect } from 'vitest'
import {
  computeSpeakingRatio,
  computeTeacherQuestions,
  computeWaitTime,
  computeLongestMonologue,
  computeStudentQuestions,
  computeStudentResponseRate,
  computeSessionPedagogicalReport,
  estimateRealQuestionsRange
} from '../../lib/conversationData/pedagogicalMetrics'
import { fixtureAula50Min } from '../../lib/conversationData/fixtures'
import type { TurnRecord, EventRecord, SessionRecord } from '../../lib/conversationData/types'

// Constrói dados da fixture canônica para os testes
function buildFixtureRecords(): { session: SessionRecord; turns: TurnRecord[]; events: EventRecord[] } {
  const roleMap: Record<string, any> = {
    spk_prof: 'professor',
    spk_aluno_arthur: 'aluno',
    spk_aluno_beatriz: 'aluno',
    spk_aluno_carlos: 'aluno'
  }

  const session: SessionRecord = {
    id: fixtureAula50Min.sessionId,
    title: fixtureAula50Min.title,
    session_type: 'aula',
    total_duration_ms: fixtureAula50Min.totalDurationMs
  }

  const turns: TurnRecord[] = fixtureAula50Min.turns.map((t, idx) => ({
    id: `turn_${idx}`,
    session_id: fixtureAula50Min.sessionId,
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
      session_id: fixtureAula50Min.sessionId,
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
      session_id: fixtureAula50Min.sessionId,
      turn_id: `turn_${idx}`,
      type: 'pergunta',
      subtype: 'conteudo',
      confidence: 1.0,
      evidence_span: turns[idx].text,
      start_ms: turns[idx].start_ms,
      end_ms: turns[idx].end_ms
    })
  })

  return { session, turns, events }
}

describe('I1: Camada de Métricas Pedagógicas Determinísticas por Sessão', () => {
  const { session, turns, events } = buildFixtureRecords()

  describe('1. Proporção de Tempo de Fala (TTT / STT)', () => {
    it('calcula tempos e percentuais exatos sobre a fixture canônica', () => {
      const res = computeSpeakingRatio(turns)
      expect(res.value.teacherMs).toBe(501000)
      expect(res.value.studentMs).toBe(66000)
      expect(res.value.totalSpeakingMs).toBe(567000)
      expect(res.value.teacherPct).toBe(88.4)
      expect(res.value.studentPct).toBe(11.6)
      expect(res.n).toBe(18)
      expect(res.asRealValidationSeal).toBe('[NÃO VALIDADO EM ASR REAL]')
    })

    it('invariante: percentuais somam 100.0%', () => {
      const res = computeSpeakingRatio(turns)
      const sum = Number((res.value.teacherPct + res.value.studentPct + res.value.otherPct).toFixed(1))
      expect(sum).toBe(100.0)
    })

    it('mutação: adicionar 10 segundos a um turno docente altera o TTT determinísticamente', () => {
      const mutatedTurns = turns.map((t, i) => i === 0 ? { ...t, end_ms: t.end_ms + 10000 } : t)
      const res = computeSpeakingRatio(mutatedTurns)
      expect(res.value.teacherMs).toBe(511000)
      expect(res.value.studentMs).toBe(66000)
      expect(res.value.totalSpeakingMs).toBe(577000)
      expect(res.value.teacherPct).toBe(88.6)
    })
  })

  describe('2. Perguntas Docentes e Correção de Erro de Classificador', () => {
    it('calcula taxa por minuto e quebra por subtipo e formato', () => {
      const res = computeTeacherQuestions(turns, events, session.total_duration_ms)
      expect(res.value.totalObserved).toBe(5)
      // 50 minutos -> 5 / 50 = 0.10 perguntas / minuto
      expect(res.value.ratePerMinute).toBe(0.10)
      expect(res.value.bySubtype.conteudo).toBe(3)
      expect(res.value.bySubtype.checagem).toBe(1)
      expect(res.value.bySubtype.administrativa).toBe(1)
    })

    it('invariante: a soma dos subtipos e dos formatos é idêntica ao total observado', () => {
      const res = computeTeacherQuestions(turns, events, session.total_duration_ms)
      const sumSubtypes = res.value.bySubtype.conteudo + res.value.bySubtype.checagem + res.value.bySubtype.administrativa
      expect(sumSubtypes).toBe(res.value.totalObserved)

      const sumFormats = res.value.byFormat.aberta + res.value.byFormat.fechada + res.value.byFormat.nao_distinguido
      expect(sumFormats).toBe(res.value.totalObserved)
    })

    it('estimativa honesta de perguntas reais: limite inferior é N_obs e intervalo reflete Wilson', () => {
      const est = estimateRealQuestionsRange(5)
      expect(est.minObserved).toBe(5)
      // ceil(5 / 0.910) = 6; ceil(5 / 0.548) = 10
      expect(est.estLower).toBe(6)
      expect(est.estUpper).toBe(10)
    })
  })

  describe('3. Wait-Time I (Tempo de Espera Pós-Pergunta)', () => {
    it('calcula média 3.8s, mediana 3.0s e identifica 3 pausas deliberadas >= 3.0s', () => {
      const res = computeWaitTime(turns, events, 3.0)
      expect(res.value.countMeasured).toBe(5)
      expect(res.value.meanSec).toBe(3.8)
      expect(res.value.medianSec).toBe(3.0)
      expect(res.value.distributionSec).toEqual([6.5, 2.0, 5.5, 3.0, 2.0])
      expect(res.value.pausesAboveThreshold).toBe(3)
      expect(res.value.thresholdOrigin).toContain('Mary Budd Rowe')
      expect(res.value.thresholdOrigin).toContain('[CITAÇÃO NÃO VERIFICADA]')
    })

    it('permite limiar configurável marcando definição a validar pela dona', () => {
      const res = computeWaitTime(turns, events, 4.0)
      expect(res.value.thresholdUsedSec).toBe(4.0)
      expect(res.value.pausesAboveThreshold).toBe(2) // 6.5s e 5.5s
      expect(res.value.thresholdOrigin).toContain('[DEFINIÇÃO A VALIDAR (dono)]')
    })
  })

  describe('4. Maior Monólogo Docente', () => {
    it('identifica corretamente o monólogo de 90 segundos no turno 7', () => {
      const res = computeLongestMonologue(turns, session.total_duration_ms)
      expect(res.value.turnIndex).toBe(7)
      expect(res.value.durationSec).toBe(90.0)
      expect(res.value.durationMs).toBe(90000)
      expect(res.value.startMs).toBe(265000)
      expect(res.value.endMs).toBe(355000)
    })
  })

  describe('5. Perguntas de Alunos e Dúvidas sem Retorno', () => {
    it('calcula 2 perguntas discentes e distribuição por aluno sem ranking nominal', () => {
      const res = computeStudentQuestions(turns, events)
      expect(res.value.totalObserved).toBe(2)
      expect(res.value.uniqueAskingStudentsCount).toBe(2)
      expect(res.value.distributionBySpeaker).toEqual({
        spk_aluno_carlos: 1,
        spk_aluno_beatriz: 1
      })
      // Na fixture, ambas as dúvidas de alunos foram respondidas pelo professor no turno seguinte
      expect(res.value.unansweredQuestionsCount).toBe(0)
    })

    it('detecta dúvida sem resposta se o professor não falar nos próximos 2 turnos', () => {
      // Simula uma aula onde um aluno pergunta e outro aluno fala depois, sem resposta docente
      const modifiedTurns = [...turns]
      modifiedTurns[7] = { ...modifiedTurns[7], role: 'aluno', speaker_label: 'spk_aluno_arthur' }
      modifiedTurns[8] = { ...modifiedTurns[8], role: 'aluno', speaker_label: 'spk_aluno_beatriz' }

      const res = computeStudentQuestions(modifiedTurns, events)
      expect(res.value.unansweredQuestionsCount).toBeGreaterThanOrEqual(1)
      expect(res.value.unansweredTurnIndices).toContain(6)
    })
  })

  describe('6. Taxa de Resposta Discente após Pergunta Docente', () => {
    it('calcula 100% de resposta discente na fixture canônica (todas as 5 seguidas por aluno)', () => {
      const res = computeStudentResponseRate(turns, events)
      expect(res.value.teacherQuestionsCount).toBe(5)
      expect(res.value.answeredByStudentCount).toBe(5)
      expect(res.value.selfAnsweredOrFollowupCount).toBe(0)
      expect(res.value.responseRatePct).toBe(100.0)
    })

    it('mutação: quando o professor fala após sua própria pergunta, a taxa de resposta cai', () => {
      // Turno 3 (resposta do Arthur) é mutado para o professor continuar falando
      const mutatedTurns = turns.map((t, idx) => idx === 3 ? { ...t, role: 'professor' as const, speaker_label: 'spk_prof' } : t)
      const res = computeStudentResponseRate(mutatedTurns, events)
      expect(res.value.teacherQuestionsCount).toBe(5)
      expect(res.value.answeredByStudentCount).toBe(4)
      expect(res.value.selfAnsweredOrFollowupCount).toBe(1)
      expect(res.value.responseRatePct).toBe(80.0)
    })
  })

  describe('7. Relatório Agregado da Sessão', () => {
    it('gera relatório consolidado contendo todas as 6 métricas com selo ASR', () => {
      const report = computeSessionPedagogicalReport({ session, turns, events })
      expect(report.sessionId).toBe('aula_50min_bio')
      expect(report.sessionDurationMs).toBe(3000000)
      expect(report.speakingRatio.asRealValidationSeal).toBe('[NÃO VALIDADO EM ASR REAL]')
      expect(report.teacherQuestions.asRealValidationSeal).toBe('[NÃO VALIDADO EM ASR REAL]')
      expect(report.waitTime.asRealValidationSeal).toBe('[NÃO VALIDADO EM ASR REAL]')
      expect(report.longestMonologue.asRealValidationSeal).toBe('[NÃO VALIDADO EM ASR REAL]')
      expect(report.studentQuestions.asRealValidationSeal).toBe('[NÃO VALIDADO EM ASR REAL]')
      expect(report.studentResponseRate.asRealValidationSeal).toBe('[NÃO VALIDADO EM ASR REAL]')
    })
  })
})
