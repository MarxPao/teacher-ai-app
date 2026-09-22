import { describe, it, expect } from 'vitest'
import {
  DEFAULT_BKT_PARAMS,
  BKT_MASTERY_THRESHOLD,
  updateBKTOpportunity,
  calculateStudentMastery,
  evaluateStudentTopicMastery,
  simulateClassroomCATReadiness,
  getBKTParamsForQuestionType,
  simulateBimestreClassroomProgression
} from '../lib/bktEngine'

describe('Bayesian Knowledge Tracing Engine (BKT) — Corbett & Anderson (1995)', () => {

  describe('Parâmetros e Atualização Monotônica', () => {
    it('inicia com prior padrão P(L0) = 0.20', () => {
      expect(DEFAULT_BKT_PARAMS.pL0).toBe(0.20)
      expect(DEFAULT_BKT_PARAMS.pT).toBe(0.15)
      expect(DEFAULT_BKT_PARAMS.pS).toBe(0.10)
      expect(DEFAULT_BKT_PARAMS.pG).toBe(0.25)
    })

    it('eleva a probabilidade de domínio monotonicamente com acertos consecutivos', () => {
      const step1 = updateBKTOpportunity(0.20, true)
      expect(step1.nextPrior).toBeGreaterThan(0.20)

      const step2 = updateBKTOpportunity(step1.nextPrior, true)
      expect(step2.nextPrior).toBeGreaterThan(step1.nextPrior)

      const step3 = updateBKTOpportunity(step2.nextPrior, true)
      expect(step3.nextPrior).toBeGreaterThan(step2.nextPrior)
      expect(step3.nextPrior).toBeGreaterThanOrEqual(BKT_MASTERY_THRESHOLD)
    })

    it('reduz a probabilidade com erro mas amortece por slip P(S) = 0.10 (sem colapso a zero)', () => {
      // Aluno com domínio prévio alto (0.80) erra uma questão
      const step = updateBKTOpportunity(0.80, false)
      expect(step.posteriorKnown).toBeLessThan(0.80)
      // Graças ao Slip, a probabilidade não zera bruscamente
      expect(step.nextPrior).toBeGreaterThan(0.20)
    })

    it('amortece acertos casuais através do Guess P(G) = 0.25 (um chute não garante domínio)', () => {
      // Aluno com domínio baixo (0.10) acerta uma questão por chute
      const step = updateBKTOpportunity(0.10, true)
      // O posterior aumenta, mas não atinge mastery
      expect(step.nextPrior).toBeLessThan(BKT_MASTERY_THRESHOLD)
      expect(step.nextPrior).toBeLessThan(0.60)
    })
  })

  describe('Sequências Realistas de Aprendizagem (Não Apenas Caminho Feliz)', () => {
    it('traça trajetória realista de aluno que erra inicialmente e consolida aprendizado ([false, false, true, true, true])', () => {
      const result = calculateStudentMastery([false, false, true, true, true])
      // Início: cai por erros
      expect(result.history[1]).toBeLessThan(result.history[0])
      expect(result.history[2]).toBeLessThan(result.history[1])
      // Recuperação: sobe progressivamente
      expect(result.history[3]).toBeGreaterThan(result.history[2])
      expect(result.history[4]).toBeGreaterThan(result.history[3])
      expect(result.history[5]).toBeGreaterThan(result.history[4])
      expect(result.finalMastery).toBeGreaterThan(0.70)
    })

    it('trata adequadamente aluno de alto domínio com deslize isolado ([true, true, true, false, true])', () => {
      const result = calculateStudentMastery([true, true, true, false, true])
      // Antes do deslize: quase dominado
      const preSlip = result.history[3]
      expect(preSlip).toBeGreaterThan(0.80)
      // No erro do passo 4: reduz, mas sem colapso
      const postSlip = result.history[4]
      expect(postSlip).toBeLessThan(preSlip)
      expect(postSlip).toBeGreaterThan(0.40)
      // No passo 5: recupera a maestria
      expect(result.finalMastery).toBeGreaterThanOrEqual(BKT_MASTERY_THRESHOLD)
      expect(result.isMastered).toBe(true)
    })

    it('impede falsa maestria para aluno com oscilação aleatória ([false, true, false, true, false])', () => {
      const result = calculateStudentMastery([false, true, false, true, false])
      expect(result.isMastered).toBe(false)
      expect(result.finalMastery).toBeLessThan(0.50)
      expect(result.confidence).toBe('preliminary')
    })
  })

  describe('Calibração de Parâmetros por Tipologia de Questão', () => {
    it('ajusta P(Guess) conforme o formato: 50% em True/False, 25% em MC, 5% em Discursiva', () => {
      const tfParams = getBKTParamsForQuestionType('true_false')
      expect(tfParams.pG).toBe(0.50)

      const mcParams = getBKTParamsForQuestionType('multiple_choice')
      expect(mcParams.pG).toBe(0.25)

      const discParams = getBKTParamsForQuestionType('discursive')
      expect(discParams.pG).toBe(0.05)

      // Na discursiva, um acerto aumenta muito mais a probabilidade que em True/False
      const stepDisc = updateBKTOpportunity(0.20, true, discParams)
      const stepTF = updateBKTOpportunity(0.20, true, tfParams)
      expect(stepDisc.nextPrior).toBeGreaterThan(stepTF.nextPrior)
    })
  })

  describe('Cálculo de Sequência e Níveis de Confiança Amostral', () => {
    it('classifica confiança como insuficiente para N < 3', () => {
      const result = calculateStudentMastery([true, true])
      expect(result.opportunitiesCount).toBe(2)
      expect(result.confidence).toBe('insufficient')
    })

    it('classifica confiança como preliminar para 3 <= N < 10', () => {
      const result = calculateStudentMastery([true, true, true, false, true])
      expect(result.opportunitiesCount).toBe(5)
      expect(result.confidence).toBe('preliminary')
    })

    it('classifica confiança como estável para N >= 10', () => {
      const answers = [true, true, true, true, false, true, true, true, false, true, true]
      const result = calculateStudentMastery(answers)
      expect(result.opportunitiesCount).toBe(11)
      expect(result.confidence).toBe('stable')
    })

    it('identifica corretamente o status de maestria (isMastered)', () => {
      const strongStudent = calculateStudentMastery([true, true, true, true])
      expect(strongStudent.isMastered).toBe(true)

      const strugglingStudent = calculateStudentMastery([false, false, false])
      expect(strugglingStudent.isMastered).toBe(false)
    })
  })

  describe('Avaliação com Metadados de Aluno e Tópico', () => {
    it('processa respostas reais com timestamp e retorna StudentTopicMastery', () => {
      const responses = [
        { isCorrect: true, timestamp: 1000 },
        { isCorrect: true, timestamp: 2000 },
        { isCorrect: false, timestamp: 3000 },
        { isCorrect: true, timestamp: 4000 }
      ]

      const masteryState = evaluateStudentTopicMastery('student_123', 'Present Perfect', responses)
      expect(masteryState.studentId).toBe('student_123')
      expect(masteryState.topic).toBe('Present Perfect')
      expect(masteryState.opportunitiesCount).toBe(4)
      expect(masteryState.confidenceLevel).toBe('preliminary')
      expect(masteryState.masteryHistory.length).toBe(5) // Prior inicial + 4 passos
      expect(masteryState.lastUpdated).toBe(4000)
    })
  })

  describe('Simulação de Sala de Aula e Prontidão CAT (N >= 10)', () => {
    it('indica não-prontidão para CAT quando oportunidades por aluno < 10', () => {
      const sim = simulateClassroomCATReadiness(30, 5, 0.70)
      expect(sim.isCATReady).toBe(false)
      expect(sim.statusLabel).toContain('Em Calibração Preliminar')
      expect(sim.timelineMessage).toContain('Faltam 5 oportunidades')
    })

    it('atinge prontidão para CAT e estabilidade de variância quando N >= 10', () => {
      const sim = simulateClassroomCATReadiness(30, 12, 0.75)
      expect(sim.isCATReady).toBe(true)
      expect(sim.totalInteractions).toBe(360)
      expect(sim.statusLabel).toContain('Estabilidade Psicométrica Atingida')
      expect(sim.variance).toBeLessThan(0.05)
      expect(sim.timelineMessage).toContain('Volume empírico suficiente')
    })

    it('simula a progressão longitudinal de 1 bimestre escolar (30 alunos, 8 semanas) demonstrando prontidão CAT na semana 5', () => {
      const simBimestre = simulateBimestreClassroomProgression(30, 8, 2)
      expect(simBimestre.studentCount).toBe(30)
      expect(simBimestre.weeks).toBe(8)
      expect(simBimestre.totalItemsBimestre).toBe(16)
      expect(simBimestre.catReadinessWeek).toBe(5) // Na semana 5 (5 semanas * 2 itens = 10 oportunidades = N>=10)

      // Log estruturado no stdout do terminal para auditoria
      console.log('\n--- BIMESTRE LONGITUDINAL SIMULATION OUTPUT ---')
      console.log(`Turma: ${simBimestre.studentCount} alunos | Semanas: ${simBimestre.weeks} | Total Itens: ${simBimestre.totalItemsBimestre} | CAT Readiness: Semana ${simBimestre.catReadinessWeek}`)
      console.log('| Semana | N/aluno | Respostas Acumuladas | Domínio Médio | Variância | Confiança    | CAT Ready       |')
      simBimestre.milestones.forEach(m => {
        console.log(`| Sem ${m.week}   | N=${m.opportunitiesPerStudent.toString().padEnd(2)}   | ${m.totalResponsesCollected.toString().padEnd(20)} | ${m.averageMastery.toFixed(4)}        | ${m.variance.toFixed(4)}    | ${m.confidenceLevel.padEnd(12)} | ${m.isCATReady ? 'SIM (Ativado)' : 'NÃO (Bloqueado)'} |`)
      })
      console.log('------------------------------------------------\n')

      // Verifica marcos
      const week1 = simBimestre.milestones[0]
      expect(week1.confidenceLevel).toBe('insufficient')
      expect(week1.isCATReady).toBe(false)

      const week3 = simBimestre.milestones[2]
      expect(week3.confidenceLevel).toBe('preliminary')
      expect(week3.isCATReady).toBe(false)

      const week5 = simBimestre.milestones[4]
      expect(week5.confidenceLevel).toBe('stable')
      expect(week5.isCATReady).toBe(true)
      expect(week5.totalResponsesCollected).toBe(300) // 30 alunos * 10 itens

      const week8 = simBimestre.milestones[7]
      expect(week8.totalResponsesCollected).toBe(480) // 30 alunos * 16 itens
      expect(week8.isCATReady).toBe(true)
    })
  })
})
