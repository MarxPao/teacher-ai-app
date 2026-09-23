/**
 * __tests__/onda2ScientificAssessment.test.ts — Suíte de Testes da Onda 2
 * 
 * Cobertura Completa dos Pilares Dependentes de Volume de Dado (com Gates de Suficiência Estatística):
 * 
 * 1. Fase 2.1 — Pilar I: CDM / DINA Model (de la Torre, 2009) & Q-Matrix (J x K)
 *    - Estrutura da Q-Matrix e atributos cognitivos binários
 *    - Indicador determinístico de resposta ideal eta_ij
 *    - Probabilidade DINA com slippage (s_j) e guessing (g_j)
 *    - Gating de Suficiência Amostral: bloqueio de calibração empírica quando N < 30
 *    - Calibração empírica liberada quando N >= 30
 *    - Estimação MAP do perfil cognitivo latente do aluno
 *    - Rótulo e status honesto de maturidade de dados
 * 
 * 2. Fase 2.2 — Pilar IV: MIRT, Sympson-Hetter e Mantel-Haenszel DIF
 *    - MIRT 2PL Compensatório em D dimensões
 *    - Matriz de Informação Multidimensional de Fisher (MFI) e D-optimality
 *    - Controle de Exposição Sympson-Hetter (1985) com sorteio de Bernoulli
 *    - Ajuste adaptativo do parâmetro k_j contra fadiga de itens
 *    - Gating de Poder Estatístico para Mantel-Haenszel DIF (N_ref >= 30, N_foc >= 30)
 *    - Classificação ETS Classe A (Negligível / Item Justo)
 *    - Detecção de Viés Crítico ETS Classe C (|Delta_MH| >= 1.5, p < 0.05) com bloqueio
 */

import { describe, it, expect } from 'vitest'
import {
  computeIdealResponseEta,
  calculateDINAProbability,
  calibrateDINAItemParameters,
  estimateStudentAttributeProfile,
  DINA_MIN_RESPONSES_FOR_CALIBRATION,
  DINA_THEORETICAL_PRIORS,
  STANDARD_COGNITIVE_ATTRIBUTES,
  QMatrixItemEntry,
  StudentItemResponse
} from '../lib/qMatrixEngine'

import {
  calculateMirtProbability,
  calculateMirtFisherInformation,
  evaluateDOptimality,
  applySympsonHetterGate,
  updateSympsonHetterParameter,
  selectAdaptiveMirtQuestion,
  MirtItemParameters
} from '../lib/mirtAndExposureEngine'

import {
  selectNextCatQuestionWithSympsonHetter
} from '../lib/catEngine'

import {
  analyzeItemDifferentialFunctioning,
  simulateClassroomDIFAndExposureProgression,
  DIF_MIN_GROUP_SAMPLE_SIZE,
  StudentExamRecord
} from '../lib/difAnalysis'

describe('Onda 2 — Pilares Dependentes de Volume de Dado (com Gates de Suficiência Estatística)', () => {

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 2.1 — PILAR I: CDM / DINA MODEL & Q-MATRIX (de la Torre, 2009)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Fase 2.1 — Q-Matrix & Modelo DINA (de la Torre, 2009)', () => {
    
    it('1. valida catálogo de atributos cognitivos fundamentais mapeados à BNCC', () => {
      expect(STANDARD_COGNITIVE_ATTRIBUTES.length).toBeGreaterThanOrEqual(8)
      const mathAttrs = STANDARD_COGNITIVE_ATTRIBUTES.filter(a => a.subject === 'math')
      const ptAttrs = STANDARD_COGNITIVE_ATTRIBUTES.filter(a => a.subject === 'portuguese')
      const enAttrs = STANDARD_COGNITIVE_ATTRIBUTES.filter(a => a.subject === 'english')

      expect(mathAttrs.length).toBeGreaterThanOrEqual(3)
      expect(ptAttrs.length).toBeGreaterThanOrEqual(3)
      expect(enAttrs.length).toBeGreaterThanOrEqual(2)

      expect(mathAttrs.map(a => a.code)).toContain('MATH-A1')
      expect(ptAttrs.map(a => a.code)).toContain('LP-A1')
    })

    it('2. calcula o indicador de resposta ideal eta_ij: domina todos os atributos requeridos => 1, caso falte ao menos um => 0', () => {
      const required = ['ATTR_MATH_FRACTION_OPS', 'ATTR_MATH_COMMON_DENOMINATOR']

      // Aluno que domina ambos os atributos
      const studentFullMastery = {
        'ATTR_MATH_FRACTION_OPS': 1,
        'ATTR_MATH_COMMON_DENOMINATOR': 1,
        'ATTR_MATH_SIMPLIFICATION': 0
      }
      expect(computeIdealResponseEta(studentFullMastery, required)).toBe(1)

      // Aluno que domina apenas o primeiro atributo
      const studentPartialMastery = {
        'ATTR_MATH_FRACTION_OPS': 1,
        'ATTR_MATH_COMMON_DENOMINATOR': 0,
        'ATTR_MATH_SIMPLIFICATION': 1
      }
      expect(computeIdealResponseEta(studentPartialMastery, required)).toBe(0)

      // Aluno sem nenhum atributo
      const studentNoMastery = {
        'ATTR_MATH_FRACTION_OPS': 0,
        'ATTR_MATH_COMMON_DENOMINATOR': 0
      }
      expect(computeIdealResponseEta(studentNoMastery, required)).toBe(0)
    })

    it('3. calcula a probabilidade condicional DINA com slippage (s_j) e guessing (g_j)', () => {
      const s = 0.10 // 10% de deslize mesmo dominando
      const g = 0.20 // 20% de acerto casual sem dominar

      // Se eta = 1 => P(X = 1) = 1 - s = 0.90
      const pDomina = calculateDINAProbability(1, s, g)
      expect(pDomina).toBeCloseTo(0.90, 4)

      // Se eta = 0 => P(X = 1) = g = 0.20
      const pNaoDomina = calculateDINAProbability(0, s, g)
      expect(pNaoDomina).toBeCloseTo(0.20, 4)
    })

    it('4. GATE DE SUFICIÊNCIA AMOSTRAL: bloqueia calibração empírica quando N < 30 e usa priors teóricos canônicos', () => {
      // Cria apenas 18 respostas observadas (< 30)
      const mockResponses = Array.from({ length: 18 }, (_, i) => ({
        isCorrect: i % 2 === 0,
        idealEta: i % 3 === 0 ? 1 : 0
      }))

      const result = calibrateDINAItemParameters('item_teste_01', mockResponses)

      expect(result.sampleSufficiency).toBe('insufficient')
      expect(result.isEmpirical).toBe(false)
      expect(result.sampleCount).toBe(18)
      expect(result.slippage_s).toBe(DINA_THEORETICAL_PRIORS.slippage_s)
      expect(result.guessing_g).toBe(DINA_THEORETICAL_PRIORS.guessing_g)
      expect(result.notice).toContain('Dados insuficientes para calibração DINA (N = 18 / 30)')
      expect(result.notice).toContain('Usando priors teóricos')
    })

    it('5. calibração empírica liberada quando N >= 30, calculando s_j e g_j com dados reais e restrição de monotonicidade', () => {
      // Cria 40 respostas observadas (>= 30)
      // No grupo eta = 1 (20 alunos), 18 acertam e 2 erram => s_j ≈ (2+1)/(20+2) ≈ 0.136
      // No grupo eta = 0 (20 alunos), 4 acertam e 16 erram => g_j ≈ (4+1)/(20+2) ≈ 0.227
      const mockResponses: Array<{ isCorrect: boolean; idealEta: number }> = []

      for (let i = 0; i < 20; i++) {
        mockResponses.push({ isCorrect: i < 18, idealEta: 1 })
      }
      for (let i = 0; i < 20; i++) {
        mockResponses.push({ isCorrect: i < 4, idealEta: 0 })
      }

      const result = calibrateDINAItemParameters('item_calibrado_01', mockResponses)

      expect(result.sampleSufficiency).toBe('sufficient')
      expect(result.isEmpirical).toBe(true)
      expect(result.sampleCount).toBe(40)
      expect(result.slippage_s).toBeLessThan(0.30)
      expect(result.guessing_g).toBeLessThan(0.35)
      expect(result.notice).toContain('Calibração DINA estável (N = 40 respostas observadas)')
    })

    it('6. estima o perfil cognitivo latente do aluno via MAP / verossimilhança sobre a Q-Matrix', () => {
      const qMatrix: QMatrixItemEntry[] = [
        { itemId: 'q1', subject: 'math', requiredAttributeIds: ['ATTR_MATH_FRACTION_OPS'] },
        { itemId: 'q2', subject: 'math', requiredAttributeIds: ['ATTR_MATH_COMMON_DENOMINATOR'] },
        { itemId: 'q3', subject: 'math', requiredAttributeIds: ['ATTR_MATH_FRACTION_OPS', 'ATTR_MATH_COMMON_DENOMINATOR'] }
      ]

      // Aluno acerta q1 (só fração básica), mas erra q2 e q3 (que exigem denominador comum)
      const responses: StudentItemResponse[] = [
        { studentId: 'aluno_lucas', itemId: 'q1', isCorrect: true },
        { studentId: 'aluno_lucas', itemId: 'q2', isCorrect: false },
        { studentId: 'aluno_lucas', itemId: 'q3', isCorrect: false }
      ]

      const profile = estimateStudentAttributeProfile({
        studentId: 'aluno_lucas',
        responses,
        qMatrix
      })

      expect(profile.studentId).toBe('aluno_lucas')
      expect(profile.attributeVector.length).toBe(2)

      const attrOps = profile.attributeVector.find(a => a.attributeId === 'ATTR_MATH_FRACTION_OPS')
      const attrDenom = profile.attributeVector.find(a => a.attributeId === 'ATTR_MATH_COMMON_DENOMINATOR')

      expect(attrOps).toBeDefined()
      expect(attrDenom).toBeDefined()

      // A probabilidade de dominar operações básicas deve ser estritamente superior à de dominar denominador comum
      expect(attrOps!.posteriorProbability).toBeGreaterThan(attrDenom!.posteriorProbability)
      expect(attrOps!.mastered).toBe(true)
      expect(attrDenom!.mastered).toBe(false)
    })

    it('7. reporta honestamente o status amostral e a badge correspondente quando itens usam priors teóricos', () => {
      const qMatrix: QMatrixItemEntry[] = [
        { itemId: 'q1', subject: 'math', requiredAttributeIds: ['ATTR_MATH_FRACTION_OPS'] }
      ]
      const responses: StudentItemResponse[] = [
        { studentId: 'aluno_01', itemId: 'q1', isCorrect: true }
      ]

      const profile = estimateStudentAttributeProfile({
        studentId: 'aluno_01',
        responses,
        qMatrix
      })

      expect(profile.sampleStatus.isEmpiricallyCalibrated).toBe(false)
      expect(profile.sampleStatus.badgeLabel).toBe('🧭 DINA (Priors Teóricos)')
      expect(profile.sampleStatus.notice).toContain('N < 30 respostas')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 2.2 — PILAR IV: TRI MULTIDIMENSIONAL & CONTROLE SYMPSON-HETTER
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Fase 2.2 — MIRT & Controle de Exposição Sympson-Hetter (1985)', () => {

    it('8. calcula probabilidade MIRT 2PL Compensatória em 2 dimensões', () => {
      const item2D: MirtItemParameters = {
        itemId: 'mirt_item_1',
        dimensionNames: ['Cálculo', 'Interpretação'],
        discriminations_a: [1.2, 0.8],
        intercept_d: -0.5
      }

      // Aluno com proficiências médias em ambas as dimensões (theta = [0, 0])
      // exponent = -0.5 => P = 1 / (1 + exp(0.5)) ≈ 0.3775
      const pZero = calculateMirtProbability([0.0, 0.0], item2D)
      expect(pZero).toBeCloseTo(0.3775, 2)

      // Aluno de alta proficiência (theta = [1.5, 1.5])
      // exponent = 1.2*1.5 + 0.8*1.5 - 0.5 = 1.8 + 1.2 - 0.5 = 2.5 => P = 1 / (1 + exp(-2.5)) ≈ 0.924
      const pAlto = calculateMirtProbability([1.5, 1.5], item2D)
      expect(pAlto).toBeGreaterThan(0.90)
    })

    it('9. calcula a Matriz de Informação Multidimensional de Fisher (MFI) 2x2 e avalia D-optimality', () => {
      const item2D: MirtItemParameters = {
        itemId: 'mirt_item_1',
        dimensionNames: ['Dim1', 'Dim2'],
        discriminations_a: [1.5, 1.0],
        intercept_d: 0.0
      }

      const theta = [0.0, 0.0]
      const mfi = calculateMirtFisherInformation(theta, item2D)

      expect(mfi.length).toBe(2)
      expect(mfi[0].length).toBe(2)

      // Informação deve ser simétrica: MFI[0][1] == MFI[1][0]
      expect(mfi[0][1]).toBeCloseTo(mfi[1][0], 5)

      // Avaliação de D-optimality conjunta
      const baseInfo = [
        [0.5, 0.0],
        [0.0, 0.5]
      ]
      const dOpt = evaluateDOptimality(baseInfo, item2D, theta)
      expect(dOpt).toBeGreaterThan(0.25)
    })

    it('10. CONTROLE DE EXPOSIÇÃO SYMPSON-HETTER: bloqueia administração quando o sorteio uniforme excede k_j', () => {
      const itemProtegido: MirtItemParameters = {
        itemId: 'item_famoso_01',
        dimensionNames: ['Geral'],
        discriminations_a: [1.5],
        intercept_d: 0.0,
        exposureControl_k: 0.30 // Apenas 30% de chance de liberação
      }

      // Sorteio de 0.15 <= 0.30 => Aprovado
      const decisionAprovada = applySympsonHetterGate(itemProtegido, 0.15)
      expect(decisionAprovada.isApprovedForAdministration).toBe(true)
      expect(decisionAprovada.rejectionReason).toBeUndefined()

      // Sorteio de 0.75 > 0.30 => Bloqueado
      const decisionBloqueada = applySympsonHetterGate(itemProtegido, 0.75)
      expect(decisionBloqueada.isApprovedForAdministration).toBe(false)
      expect(decisionBloqueada.rejectionReason).toContain('bloqueado pelo controle Sympson-Hetter')
    })

    it('11. ajusta dinamicamente o parâmetro k_j quando a taxa observada excede a taxa máxima permitida (r_target = 0.25)', () => {
      // Item selecionado 50 vezes e administrado 40 vezes em 100 exames
      // Taxa observada = 40/100 = 0.40 > 0.25
      const itemSuperexposto: MirtItemParameters = {
        itemId: 'item_super',
        dimensionNames: ['Geral'],
        discriminations_a: [1.0],
        intercept_d: 0.0,
        timesSelected: 50,
        timesAdministered: 40
      }

      const novoK = updateSympsonHetterParameter(itemSuperexposto, 100, { targetMaxExposureRate: 0.25, defaultControlParameter_k: 1.0 })
      // novoK = 0.25 / (50/100) = 0.25 / 0.50 = 0.50
      expect(novoK).toBeCloseTo(0.50, 2)
      expect(novoK).toBeLessThan(1.0)
    })

    it('12. algoritmo adaptativo integrado com Sympson-Hetter: descarta o primeiro candidato bloqueado e entrega o próximo disponível', () => {
      const pool: MirtItemParameters[] = [
        {
          itemId: 'cand_1_otimo',
          dimensionNames: ['Dim1'],
          discriminations_a: [2.0],
          intercept_d: 0.0,
          exposureControl_k: 0.20 // Será bloqueado pelo roll
        },
        {
          itemId: 'cand_2_subotimo',
          dimensionNames: ['Dim1'],
          discriminations_a: [1.5],
          intercept_d: 0.0,
          exposureControl_k: 0.80 // Será aprovado pelo roll
        }
      ]

      const accumulated = [[0.1]]
      const theta = [0.0]

      // Força roll 0.60 para cand_1 (> 0.20 => bloqueia) e 0.30 para cand_2 (<= 0.80 => aprova)
      const result = selectAdaptiveMirtQuestion({
        theta,
        accumulatedInfo: accumulated,
        availablePool: pool,
        forcedRandomRolls: {
          'cand_1_otimo': 0.60,
          'cand_2_subotimo': 0.30
        }
      })

      expect(result.selectedItem?.itemId).toBe('cand_2_subotimo')
      expect(result.attemptedCandidatesCount).toBe(2)
      expect(result.allDecisions[0].isApprovedForAdministration).toBe(false)
      expect(result.allDecisions[1].isApprovedForAdministration).toBe(true)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 2.2 — PILAR IV: MANTEL-HAENSZEL DIF (Holland & Thayer, 1988)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Fase 2.2 — Detecção de DIF via Mantel-Haenszel (Holland & Thayer, 1988)', () => {

    it('13. GATE DE PODER ESTATÍSTICO OBRIGATÓRIO: bloqueia cálculo quando N_ref < 30 ou N_foc < 30 e declara amostra insuficiente', () => {
      // 25 alunos no grupo de referência e 15 no de foco (< 30)
      const mockRecords: StudentExamRecord[] = []

      for (let i = 0; i < 25; i++) {
        mockRecords.push({
          studentId: `ref_${i}`,
          group: 'reference',
          totalScore: 5,
          itemResponses: { 'item_dif_teste': i % 2 === 0 }
        })
      }
      for (let i = 0; i < 15; i++) {
        mockRecords.push({
          studentId: `foc_${i}`,
          group: 'focus',
          totalScore: 5,
          itemResponses: { 'item_dif_teste': i % 3 === 0 }
        })
      }

      const result = analyzeItemDifferentialFunctioning('item_dif_teste', mockRecords)

      expect(result.hasStatisticalPower).toBe(false)
      expect(result.classification).toBe('insufficient_data')
      expect(result.sampleReference).toBe(25)
      expect(result.sampleFocus).toBe(15)
      expect(result.minRequiredSample).toBe(DIF_MIN_GROUP_SAMPLE_SIZE)
      expect(result.auditNotice).toContain('Poder estatístico insuficiente para análise DIF (N_ref = 25, N_foc = 15). Mínimo exigido: 30 por grupo.')
    })

    it('14. executa Mantel-Haenszel com poder estatístico adequado (N >= 30 por grupo) e classifica item justo como Classe A (Negligível)', () => {
      // 35 alunos em referência e 35 em foco com desempenho pareado idêntico por estrato
      const mockRecords: StudentExamRecord[] = []

      for (let i = 0; i < 35; i++) {
        const score = (i % 5) + 1
        // Em cada estrato, taxa de acerto idêntica em ambos os grupos
        const hit = i % 2 === 0
        mockRecords.push({
          studentId: `ref_${i}`,
          group: 'reference',
          totalScore: score,
          itemResponses: { 'item_equitativo': hit }
        })
        mockRecords.push({
          studentId: `foc_${i}`,
          group: 'focus',
          totalScore: score,
          itemResponses: { 'item_equitativo': hit }
        })
      }

      const result = analyzeItemDifferentialFunctioning('item_equitativo', mockRecords)

      expect(result.hasStatisticalPower).toBe(true)
      expect(result.sampleReference).toBe(35)
      expect(result.sampleFocus).toBe(35)
      expect(result.classification).toBe('classe_A_negligivel')
      expect(Math.abs(result.delta_MH)).toBeLessThan(1.0)
      expect(result.isPedagogicallyCritical).toBe(false)
      expect(result.auditNotice).toContain('Item justo (DIF Classe A / Negligível')
    })

    it('15. identifica e emite alerta crítico psicométrico para item com viés estatisticamente severo contra o grupo focal (Classe C, |Delta_MH| >= 1.5, p < 0.05)', () => {
      // 40 alunos em referência e 40 em foco com o mesmo escore total, mas grupo de foco sistematicamente prejudicado no item
      const mockRecords: StudentExamRecord[] = []

      for (let i = 0; i < 40; i++) {
        const score = (i % 4) + 1
        // Grupo de Referência acerta 90% das vezes
        const refHit = i < 36
        // Grupo de Foco acerta apenas 15% das vezes no mesmo nível de habilidade total
        const focHit = i < 6

        mockRecords.push({
          studentId: `ref_${i}`,
          group: 'reference',
          totalScore: score,
          itemResponses: { 'item_viesado': refHit }
        })
        mockRecords.push({
          studentId: `foc_${i}`,
          group: 'focus',
          totalScore: score,
          itemResponses: { 'item_viesado': focHit }
        })
      }

      const result = analyzeItemDifferentialFunctioning('item_viesado', mockRecords)

      expect(result.hasStatisticalPower).toBe(true)
      expect(result.sampleReference).toBe(40)
      expect(result.sampleFocus).toBe(40)
      expect(result.classification).toBe('classe_C_severo')
      expect(result.isPedagogicallyCritical).toBe(true)
      expect(Math.abs(result.delta_MH)).toBeGreaterThanOrEqual(1.5)
      expect(result.isStatisticallySignificant).toBe(true)
      expect(result.auditNotice).toContain('ALERTA PSICOMÉTRICO CRÍTICO: Item com viés severo (DIF Classe C')
    })

    it('16. simula a progressão realista de uma escola comum (turmas de 30 alunos) demonstrando bloqueio do DIF e estabilidade de Sympson-Hetter até N >= 30 por grupo', () => {
      const sim = simulateClassroomDIFAndExposureProgression()

      expect(sim.milestones.length).toBe(4)
      expect(sim.activationStage).toBe('Sem 3 (3 Turmas)')

      // Sem 1 (1 Turma, 20 ref / 10 foco): Bloqueio estrito
      const m1 = sim.milestones[0]
      expect(m1.hasDIFPower).toBe(false)
      expect(m1.difClassification).toBe('insufficient_data')
      expect(m1.difNotice).toContain('Poder estatístico insuficiente para análise DIF (N_ref = 20, N_foc = 10). Mínimo exigido: 30 por grupo.')
      expect(m1.exposure_k).toBe(1.0) // Sem estrangulamento precoce de itens

      // Sem 2 (2 Turmas, 40 ref / 20 foco): Foco ainda < 30 => Continua bloqueado honestamente
      const m2 = sim.milestones[1]
      expect(m2.hasDIFPower).toBe(false)
      expect(m2.sampleFoc).toBe(20)
      expect(m2.difClassification).toBe('insufficient_data')

      // Sem 3 (3 Turmas, 60 ref / 30 foco): Ativação honesta do DIF
      const m3 = sim.milestones[2]
      expect(m3.hasDIFPower).toBe(true)
      expect(m3.sampleRef).toBe(60)
      expect(m3.sampleFoc).toBe(30)
      expect(m3.difClassification).toBe('classe_A_negligivel')

      // Sem 4 (4 Turmas, 80 ref / 40 foco): Sympson-Hetter ajusta k_j contra superexposição
      const m4 = sim.milestones[3]
      expect(m4.hasDIFPower).toBe(true)
      expect(m4.exposure_k).toBeLessThan(1.0)

      // Saída bruta e literal no stdout do terminal para auditoria
      console.log('\n--- SIMULAÇÃO DE SALA DE AULA REAL: GATING DE PODER DIF & SYMPSON-HETTER ---')
      console.log(`Cenário Escolar: Turmas de ~30 alunos (20 Ref / 10 Foco) | Ativação do DIF: ${sim.activationStage}`)
      console.log('| Estágio          | Turmas | N_ref | N_foc | Total | DIF Poder     | Classificação  | Expos k | Comportamento no Sistema                                           |')
      console.log('|------------------|--------|-------|-------|-------|---------------|----------------|---------|--------------------------------------------------------------------|')
      sim.milestones.forEach(m => {
        const pwr = m.hasDIFPower ? 'SIM (Ativado)  ' : 'NÃO (Bloqueado)';
        const cls = m.difClassification.padEnd(14);
        console.log(`| ${m.stage.padEnd(16)} | ${m.classroomsCount.toString().padEnd(6)} | ${m.sampleRef.toString().padEnd(5)} | ${m.sampleFoc.toString().padEnd(5)} | ${m.totalStudents.toString().padEnd(5)} | ${pwr} | ${cls} | ${m.exposure_k.toFixed(2).padEnd(7)} | ${m.systemBehavior.padEnd(66)} |`)
      })
      console.log('------------------------------------------------------------------------------------------------------------------------\n')
    })
  })
})
