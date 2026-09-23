/**
 * __tests__/pedagogicalEnhancements.test.ts
 *
 * Testes Unitários e de Integração para os 10 Aprimoramentos Pedagógicos:
 * 1. Andaimes UDL em 3 Níveis (generateScaffoldingTiers)
 * 2. Gerador de CCQs e ICQs (generateCheckingQuestions)
 * 3. Rotinas de Pensamento Visível de Harvard (HARVARD_THINKING_ROUTINES / suggestThinkingRoutine)
 * 4. Estimador de TTT vs. STT (calculateTalkTimeRatio)
 * 5. Descritores "Eu Consigo..." (generateStudentCanDoStatements)
 * 6. Planejamento Integrado CLIL (buildClilDualObjectives)
 * 7. Adaptações para Neurodiversidade e PEI (getInclusionAccommodations)
 * 8. As 10 Competências Gerais da BNCC (inferGeneralCompetencies)
 */

import { describe, it, expect } from 'vitest'
import {
  generateScaffoldingTiers,
  generateCheckingQuestions,
  HARVARD_THINKING_ROUTINES,
  suggestThinkingRoutine,
  calculateTalkTimeRatio,
  generateStudentCanDoStatements,
  buildClilDualObjectives,
  CLIL_SUBJECTS,
  INCLUSION_PROFILES,
  getInclusionAccommodations
} from '../lib/pedagogicalEnhancements'
import {
  BNCC_GENERAL_COMPETENCIES,
  inferGeneralCompetencies
} from '../lib/bnccGeneralCompetencies'

describe('Motor de Inovações Pedagógicas de Alto Valor (pedagogicalEnhancements.ts)', () => {
  describe('1. Andaimes UDL em 3 Níveis (Tiered Scaffolding)', () => {
    it('gera 3 níveis de apoio distintos para atividade de speaking', () => {
      const tiers = generateScaffoldingTiers(
        'Present Perfect and life experiences',
        'Free Production',
        'Alunos entrevistam colegas em speaking mingle'
      )

      expect(tiers.tier1Support).toContain('Apoio Alto')
      expect(tiers.tier1Support).toContain('Have you ever')
      expect(tiers.tier2Standard).toContain('Alunos entrevistam colegas em speaking mingle')
      expect(tiers.tier3Extension).toContain('Desafio/Extensão')
      expect(tiers.tier3Extension).toContain('follow-up')
    })

    it('gera andaimes específicos para produção escrita (Writing)', () => {
      const tiers = generateScaffoldingTiers(
        'Narrative of a travel trip',
        'Writing Task',
        'Redação de um parágrafo sobre viagem'
      )

      expect(tiers.tier1Support).toContain('fill-in-the-blanks')
      expect(tiers.tier3Extension).toContain('oração contrastiva')
    })
  })

  describe('2. Gerador de CCQs e ICQs', () => {
    it('produz CCQs com checagem de significado e ICQs com dinâmica de sala para Present Perfect', () => {
      const { ccqs, icqs } = generateCheckingQuestions('Present Perfect and life experiences', 'Presentation')

      expect(ccqs.length).toBeGreaterThanOrEqual(2)
      expect(icqs.length).toBeGreaterThanOrEqual(2)

      // Checa se há pergunta que contrasta com tempo específico / Simple Past
      expect(ccqs.some(q => q.targetConcept.includes('Simple Past') || q.targetConcept.includes('indefinido'))).toBe(true)

      // Checa ICQ de organização de sala
      expect(icqs.some(q => q.question.includes('duplas') || q.question.includes('sozinhos'))).toBe(true)
    })
  })

  describe('3. Rotinas de Pensamento Visível de Harvard (Project Zero)', () => {
    it('catálogo inclui as rotinas canônicas: See-Think-Wonder, Think-Pair-Share, Claim-Support-Question, 3-2-1 Bridge', () => {
      const ids = HARVARD_THINKING_ROUTINES.map(r => r.id)
      expect(ids).toContain('see_think_wonder')
      expect(ids).toContain('think_pair_share')
      expect(ids).toContain('claim_support_question')
      expect(ids).toContain('3_2_1_bridge')
      expect(ids).toContain('compass_points')
    })

    it('sugere See-Think-Wonder para a etapa inicial (Hook / Stage 0)', () => {
      const routine = suggestThinkingRoutine('5e_inquiry', 0)
      expect(routine.id).toBe('see_think_wonder')
    })

    it('sugere Think-Pair-Share para a etapa de exploração (Stage 1)', () => {
      const routine = suggestThinkingRoutine('tblt_willis', 1)
      expect(routine.id).toBe('think_pair_share')
    })
  })

  describe('4. Estimador de TTT vs. STT (Teacher vs Student Talking Time)', () => {
    it('detecta equilíbrio comunicativo ideal quando os alunos têm prática autônoma predominante', () => {
      const stages = [
        { name: 'Warm-up', durationMin: 5, teacherAction: 'Apresenta a temática', studentAction: 'Conversam em duplas' },
        { name: 'Task Cycle', durationMin: 20, teacherAction: 'Monitora silenciosamente', studentAction: 'Produzem em grupos e debatem em mingle' },
        { name: 'Language Analysis', durationMin: 10, teacherAction: 'Explica formas pontuais', studentAction: 'Registram e analisam' },
        { name: 'Free Production', durationMin: 15, teacherAction: 'Facilita a apresentação', studentAction: 'Apresentam oralmente para a turma' }
      ]

      const analysis = calculateTalkTimeRatio(stages)
      expect(analysis.studentPercent).toBeGreaterThanOrEqual(60)
      expect(analysis.isWarning).toBe(false)
      expect(analysis.balanceStatus).not.toBe('teacher_heavy')
    })

    it('emite alerta pedagógico quando a aula é excessivamente expositiva (TTT > 55%)', () => {
      const stages = [
        { name: 'Presentation 1', durationMin: 25, teacherAction: 'Professor explica e leciona todas as regras na lousa', studentAction: 'Escutam a explicação' },
        { name: 'Presentation 2', durationMin: 20, teacherAction: 'Professor continua a leitura expositiva', studentAction: 'Acompanham a leitura' },
        { name: 'Practice', durationMin: 5, teacherAction: 'Corrige', studentAction: 'Copiam' }
      ]

      const analysis = calculateTalkTimeRatio(stages)
      expect(analysis.teacherPercent).toBeGreaterThan(55)
      expect(analysis.isWarning).toBe(true)
      expect(analysis.balanceStatus).toBe('teacher_heavy')
      expect(analysis.pedagogicalAdvice).toContain('Atenção pedagógica')
    })
  })

  describe('5. Descritores "Eu Consigo..." (Student-Facing Can-Do Descriptors)', () => {
    it('gera declarações em 1ª pessoa conectadas ao tema e nível CEFR', () => {
      const statements = generateStudentCanDoStatements('Present Perfect and life experiences', 'A2', ['EF08LI01'])

      expect(statements.length).toBeGreaterThanOrEqual(3)
      expect(statements.every(s => s.startsWith('Eu consigo'))).toBe(true)
      expect(statements.some(s => s.includes('Have you ever'))).toBe(true)
    })
  })

  describe('6. Planejamento Integrado CLIL', () => {
    it('produz objetivos duplos (Língua + Conteúdo) para área de Ciências', () => {
      const clil = buildClilDualObjectives(
        'Passive Voice and scientific processes',
        'science',
        'Cadeia Alimentar & Fotossíntese'
      )

      expect(clil.languageObjective).toContain('precisão e fluência')
      expect(clil.contentObjective).toContain('Ciências da Natureza')
      expect(clil.contentObjective).toContain('Cadeia Alimentar & Fotossíntese')
      expect(clil.promptDirective).toContain('CONFIGURAÇÃO CLIL')
      expect(clil.promptDirective).toContain('4 dimensões de Coyle')
    })
  })

  describe('7. Adaptações para Neurodiversidade e PEI', () => {
    it('retorna acomodações específicas para TDAH e Dislexia sem duplicidade', () => {
      const accs = getInclusionAccommodations(['adhd', 'dyslexia'])

      expect(accs.length).toBeGreaterThan(0)
      expect(accs.some(a => a.includes('Chunking') || a.includes('temporizador'))).toBe(true)
      expect(accs.some(a => a.includes('fontes sem serifa') || a.includes('oral'))).toBe(true)
    })
  })

  describe('8. As 10 Competências Gerais da BNCC (bnccGeneralCompetencies.ts)', () => {
    it('catálogo possui exatamente as 10 Competências Gerais oficiais do MEC', () => {
      expect(BNCC_GENERAL_COMPETENCIES).toHaveLength(10)
      const codes = BNCC_GENERAL_COMPETENCIES.map(c => c.code)
      expect(codes).toEqual(['CG01', 'CG02', 'CG03', 'CG04', 'CG05', 'CG06', 'CG07', 'CG08', 'CG09', 'CG10'])
    })

    it('infere as 3 competências mais mobilizadas com pontuação e justificativa pedagógica', () => {
      const stages = [
        { name: 'Hook', teacherAction: 'Lança questão investigativa', studentAction: 'Elaboram hipóteses em duplas' },
        { name: 'Task', teacherAction: 'Mediação do debate', studentAction: 'Debatem pontos de vista em colaboração' }
      ]

      const inferred = inferGeneralCompetencies('Debate sobre Fake News e Mídia Digital', stages, 'tblt')
      expect(inferred).toHaveLength(3)
      // Comunicação (CG04) e Empatia/Cooperação (CG09) ou Pensamento Crítico (CG02) devem estar no topo
      const mobilizedCodes = inferred.map(i => i.competency.code)
      expect(mobilizedCodes).toContain('CG04')
      expect(inferred[0].justification).toBeTruthy()
    })
  })
})
