import { describe, it, expect } from 'vitest'
import {
  CANONICAL_MULTI_SUBJECT_ITEMS,
  validateItemBankQuality
} from '../lib/itemBankModel'
import {
  SUBJECT_RUBRICS_CATALOG,
  reconcileRubricScores,
  SubjectRubricEvaluation
} from '../lib/rubrics/subjectRubrics'
import { MISCONCEPTION_CATALOG } from '../lib/misconceptionCatalog'

describe('Pacote 6 — Banco de Itens com MIS-ID & Rubricas Analíticas com Reconciliação', () => {
  describe('1. Banco de Itens com Vinculação Diagnóstica (MIS-ID)', () => {
    it('carrega 8 itens canônicos oficiais cobrindo todas as áreas', () => {
      expect(CANONICAL_MULTI_SUBJECT_ITEMS.length).toBe(8)
      const subjects = CANONICAL_MULTI_SUBJECT_ITEMS.map(i => i.subject)
      expect(subjects).toContain('portuguese')
      expect(subjects).toContain('math')
      expect(subjects).toContain('history')
      expect(subjects).toContain('geography')
      expect(subjects).toContain('physics')
      expect(subjects).toContain('chemistry')
      expect(subjects).toContain('biology')
      expect(subjects).toContain('science')
    })

    it('todos os itens canônicos passam com 100% de conformidade no validateItemBankQuality', () => {
      for (const item of CANONICAL_MULTI_SUBJECT_ITEMS) {
        const quality = validateItemBankQuality(item)
        expect(quality.valid, `Item ${item.id} deve ser válido: ${quality.issues.join(', ')}`).toBe(true)
        expect(quality.issues.length).toBe(0)
      }
    })

    it('todos os distratores diagnósticos apontam para códigos existentes no MISCONCEPTION_CATALOG', () => {
      for (const item of CANONICAL_MULTI_SUBJECT_ITEMS) {
        const distractors = item.options.filter(o => !o.isCorrect)
        for (const d of distractors) {
          if (d.misconceptionCode) {
            const exists = MISCONCEPTION_CATALOG.some(m => m.code === d.misconceptionCode)
            expect(exists, `Misconception ${d.misconceptionCode} no item ${item.id} deve existir no catálogo oficial`).toBe(true)
          }
        }
      }
    })

    it('todos os itens canônicos possuem calibração psicométrica adequada (p e r_pb)', () => {
      for (const item of CANONICAL_MULTI_SUBJECT_ITEMS) {
        expect(item.difficultyIndex).toBeDefined()
        expect(item.difficultyIndex!).toBeGreaterThanOrEqual(0.30)
        expect(item.difficultyIndex!).toBeLessThanOrEqual(0.85)

        expect(item.discriminationIndex).toBeDefined()
        expect(item.discriminationIndex!).toBeGreaterThanOrEqual(0.35) // Excelente poder de discriminação
      }
    })
  })

  describe('2. Rubricas Analíticas e Motor de Reconciliação Inter-Avaliadores', () => {
    it('disponibiliza 8 rubricas analíticas com descritores explícitos 5, 3, 1 e 0', () => {
      expect(SUBJECT_RUBRICS_CATALOG.length).toBe(8)
      
      for (const rubric of SUBJECT_RUBRICS_CATALOG) {
        expect(rubric.criteria.length).toBeGreaterThanOrEqual(3)
        for (const crit of rubric.criteria) {
          expect(crit.maxScore).toBe(5)
          expect(crit.descriptors['5']).toBeTruthy()
          expect(crit.descriptors['3']).toBeTruthy()
          expect(crit.descriptors['1']).toBeTruthy()
          expect(crit.descriptors['0']).toBeTruthy()
        }
      }
    })

    it('reconcilia avaliações com consenso perfeito ou discrepância <= 1 ponto via média', () => {
      const evalA: SubjectRubricEvaluation = {
        evaluatorId: 'prof_a',
        rubricId: 'MAT-R1',
        scores: [
          { criterionId: 'c1_compreensao', score: 5, feedback: 'Excelente' },
          { criterionId: 'c2_plano', score: 4, feedback: 'Bom plano' },
          { criterionId: 'c3_execucao', score: 4, feedback: 'Quase perfeito' },
          { criterionId: 'c4_retrospecto', score: 3, feedback: 'Adequado' }
        ]
      }

      const evalB: SubjectRubricEvaluation = {
        evaluatorId: 'prof_b',
        rubricId: 'MAT-R1',
        scores: [
          { criterionId: 'c1_compreensao', score: 5, feedback: 'Perfeito' },
          { criterionId: 'c2_plano', score: 3, feedback: 'Aceitável' },
          { criterionId: 'c3_execucao', score: 5, feedback: 'Muito bom' },
          { criterionId: 'c4_retrospecto', score: 3, feedback: 'Adequado' }
        ]
      }

      const reconciled = reconcileRubricScores(evalA, evalB)
      expect(reconciled.needsArbitration).toBe(false)
      expect(reconciled.criteriaScores[0].reconciliationMethod).toBe('consensus')
      expect(reconciled.criteriaScores[0].finalScore).toBe(5)
      expect(reconciled.criteriaScores[1].reconciliationMethod).toBe('average')
      expect(reconciled.criteriaScores[1].finalScore).toBe(3.5)
      expect(reconciled.totalFinalScore).toBe(16)
    })

    it('sinaliza necessidade de arbitragem quando discrepância >= 2 pontos e resolve com terceiro avaliador', () => {
      const evalA: SubjectRubricEvaluation = {
        evaluatorId: 'prof_a',
        rubricId: 'HIS-R1',
        scores: [
          { criterionId: 'c1_critica_fontes', score: 5, feedback: 'Excelente' },
          { criterionId: 'c2_temporalidade_anacronismo', score: 5, feedback: 'Sem anacronismo' },
          { criterionId: 'c3_multiperspectividade', score: 4, feedback: 'Bom' }
        ]
      }

      const evalB: SubjectRubricEvaluation = {
        evaluatorId: 'prof_b',
        rubricId: 'HIS-R1',
        scores: [
          { criterionId: 'c1_critica_fontes', score: 2, feedback: 'Muito frágil' }, // Discrepância = 3
          { criterionId: 'c2_temporalidade_anacronismo', score: 4, feedback: 'Bom' },
          { criterionId: 'c3_multiperspectividade', score: 4, feedback: 'Bom' }
        ]
      }

      // Sem árbitro -> pendente de arbitragem
      const withoutArb = reconcileRubricScores(evalA, evalB)
      expect(withoutArb.needsArbitration).toBe(true)
      expect(withoutArb.auditReport).toContain('PENDENTE DE ARBITRAGEM')

      // Com árbitro terceiro sênior
      const arbitrator: SubjectRubricEvaluation = {
        evaluatorId: 'coordenador_pedagogico',
        rubricId: 'HIS-R1',
        scores: [
          { criterionId: 'c1_critica_fontes', score: 4, feedback: 'Desempate: estudante fundamentou em duas fontes primárias.' },
          { criterionId: 'c2_temporalidade_anacronismo', score: 4, feedback: 'Ok' },
          { criterionId: 'c3_multiperspectividade', score: 4, feedback: 'Ok' }
        ]
      }

      const withArb = reconcileRubricScores(evalA, evalB, arbitrator)
      expect(withArb.needsArbitration).toBe(false)
      expect(withArb.criteriaScores[0].reconciliationMethod).toBe('arbitrated')
      expect(withArb.criteriaScores[0].finalScore).toBe(4)
      expect(withArb.auditReport).toContain('RECONCILIAÇÃO CONCLUÍDA')
    })
  })
})
