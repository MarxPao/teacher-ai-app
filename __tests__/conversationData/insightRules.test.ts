import { describe, it, expect } from 'vitest'
import {
  INSIGHT_RULES,
  evaluateInsightRules,
  meetsSampleMinimum
} from '../../lib/conversationData/insightRules'
import { computeSessionPedagogicalReport } from '../../lib/conversationData/pedagogicalMetrics'
import { fixtureAula50Min } from '../../lib/conversationData/fixtures'
import type { TurnRecord, EventRecord, SessionRecord } from '../../lib/conversationData/types'

function getFixtureReport() {
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

  return computeSessionPedagogicalReport({ session, turns, events })
}

describe('I2: Banco de Regras Teórico Formal (insightRules)', () => {
  const canonicalReport = getFixtureReport()

  describe('1. Integridade do Catálogo de Regras', () => {
    it('todas as regras contêm id, teoria, fonte e definição clara de evidência', () => {
      expect(INSIGHT_RULES.length).toBeGreaterThanOrEqual(4)
      for (const rule of INSIGHT_RULES) {
        expect(rule.id).toBeDefined()
        expect(rule.titulo).toBeDefined()
        expect(rule.teoria).toBeDefined()
        expect(rule.fonte).toBeDefined()
        expect(['verificada', 'nao_verificada']).toContain(rule.evidencia)
        expect(['descritivo', 'prescritivo']).toContain(rule.tipo)
      }
    })

    it('regra não verificada (Mary Budd Rowe) é estritamente descritiva e não prescreve ação', () => {
      const roweRule = INSIGHT_RULES.find(r => r.id === 'rule_wait_time_reflection')!
      expect(roweRule).toBeDefined()
      expect(roweRule.evidencia).toBe('nao_verificada')
      expect(roweRule.tipo).toBe('descritivo')

      const insight = roweRule.gerarInsight(canonicalReport)
      expect(insight.seloEvidencia).toBe('[CITAÇÃO NÃO VERIFICADA]')
      expect(insight.acaoSugerida).toBeNull() // Sem prescrição para evidência não verificada
    })
  })

  describe('2. Disparo e Mínimo Amostral por Regra', () => {
    it('regra TTT/STT: dispara na fixture canônica (88.4% > 80.0%)', () => {
      const rule = INSIGHT_RULES.find(r => r.id === 'rule_teacher_speaking_ratio')!
      expect(rule.condicao(canonicalReport)).toBe(true)

      const insight = rule.gerarInsight(canonicalReport)
      expect(insight.tipo).toBe('prescritivo')
      expect(insight.seloEvidencia).toBe('[FONTE CIENTÍFICA VERIFICADA]')
      expect(insight.acaoSugerida).toContain('think-pair-share')
    })

    it('regra TTT/STT: NÃO dispara quando o tempo de fala docente está abaixo do limiar (ex: 70%)', () => {
      const rule = INSIGHT_RULES.find(r => r.id === 'rule_teacher_speaking_ratio')!
      const reportCopy = JSON.parse(JSON.stringify(canonicalReport))
      reportCopy.speakingRatio.value.teacherPct = 65.0
      expect(rule.condicao(reportCopy)).toBe(false)
    })

    it('regra TTT/STT: NÃO dispara abaixo do mínimo amostral (ex: menos de 10 turnos)', () => {
      const rule = INSIGHT_RULES.find(r => r.id === 'rule_teacher_speaking_ratio')!
      const reportCopy = JSON.parse(JSON.stringify(canonicalReport))
      reportCopy.speakingRatio.n = 5 // apenas 5 turnos
      expect(meetsSampleMinimum(reportCopy, rule.minimoAmostral)).toBe(false)
    })

    it('regra de dúvidas de alunos: NÃO dispara na fixture porque todas foram respondidas', () => {
      const rule = INSIGHT_RULES.find(r => r.id === 'rule_unanswered_student_questions')!
      expect(rule.condicao(canonicalReport)).toBe(false)
    })

    it('regra de dúvidas de alunos: dispara quando há perguntas sem retorno', () => {
      const rule = INSIGHT_RULES.find(r => r.id === 'rule_unanswered_student_questions')!
      const reportCopy = JSON.parse(JSON.stringify(canonicalReport))
      reportCopy.studentQuestions.value.unansweredQuestionsCount = 1
      reportCopy.studentQuestions.value.unansweredTurnIndices = [6]
      expect(rule.condicao(reportCopy)).toBe(true)

      const insight = rule.gerarInsight(reportCopy)
      expect(insight.observacao).toContain('1 dúvida(s)')
      expect(insight.acaoSugerida).toContain('warm-up')
    })
  })

  describe('3. Avaliação Agregada do Catálogo (evaluateInsightRules)', () => {
    it('avalia o relatório da fixture canônica gerando os insights qualificados quando no escopo de L2', () => {
      // 1. Em aula de L2 (Inglês): Swain dispara pois fala discente é 11.6% (< 30.0%)
      const l2Insights = evaluateInsightRules(canonicalReport, undefined, { discipline: 'Língua Inglesa' })
      expect(l2Insights.length).toBeGreaterThanOrEqual(1)

      const swainInsight = l2Insights.find(i => i.ruleId === 'swain_1985_output_hypothesis' || i.ruleId === 'rule_teacher_speaking_ratio')
      expect(swainInsight).toBeDefined()
      expect(swainInsight?.observacao).toContain('11.6%')

      // Nenhum insight usa termos proibidos ou linguagem imperativa
      for (const ins of l2Insights) {
        expect(ins.observacao).not.toMatch(/prejudica|errado|inadequado|falhou|reflete|ideal|deveria/i)
        expect(ins.significadoPotencial).toMatch(/pode indicar|pode|vale observar/i)
      }

      // 2. Em aula de Biologia: Swain fica fora de escopo e nenhuma regra dispara
      const bioInsights = evaluateInsightRules(canonicalReport, undefined, { discipline: 'Biologia' })
      expect(bioInsights).toHaveLength(0)
    })
  })
})
