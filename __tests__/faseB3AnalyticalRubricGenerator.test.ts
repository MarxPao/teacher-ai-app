import { describe, it, expect } from 'vitest'
import {
  generateAnalyticalRubric,
  auditVagueAdjectivesInRubric,
  FORBIDDEN_VAGUE_ADJECTIVES,
  AnalyticalRubric
} from '@/lib/analyticalRubricGenerator'

describe('Onda B - Fase B3: Gerador de Rubricas Analíticas com Escala Likert Ancorada em Evidências', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. GERAÇÃO DE RUBRICAS ANALÍTICAS COM 4 NÍVEIS
  // ─────────────────────────────────────────────────────────────────────────────

  it('deve gerar rubrica analítica com exatamente 4 níveis Likert e pesos percentuais calibrados', () => {
    const questionStem = 'Explique as causas socioeconômicas da Revolução Francesa de 1789, destacando a crise fiscal da monarquia e a divisão estamental da sociedade.'

    const rubric: AnalyticalRubric = generateAnalyticalRubric({
      questionStem,
      subject: 'História',
      topic: 'Revolução Francesa'
    })

    expect(rubric).toBeDefined()
    expect(rubric.questionStem).toBe(questionStem)
    expect(rubric.criteria.length).toBeGreaterThanOrEqual(3)

    // Verifica que cada critério possui exatamente 4 níveis Likert
    rubric.criteria.forEach(criterion => {
      expect(criterion.levels.length).toBe(4)

      const [l1, l2, l3, l4] = criterion.levels
      expect(l1.level).toBe(1)
      expect(l1.levelKey).toBe('insufficient')
      expect(l1.pointsPercent).toBe(0.25)

      expect(l2.level).toBe(2)
      expect(l2.levelKey).toBe('basic')
      expect(l2.pointsPercent).toBe(0.50)

      expect(l3.level).toBe(3)
      expect(l3.levelKey).toBe('proficient')
      expect(l3.pointsPercent).toBe(0.75)

      expect(l4.level).toBe(4)
      expect(l4.levelKey).toBe('advanced')
      expect(l4.pointsPercent).toBe(1.00)
    })

    // A soma dos pesos dos critérios deve ser 100%
    const totalWeight = rubric.criteria.reduce((acc, c) => acc + c.weight, 0)
    expect(totalWeight).toBe(100)
  })

  it('deve conter descritores comportamentais observáveis e exemplos de evidências em todos os níveis', () => {
    const questionStem = 'Justifique por que a mitose é essencial para o crescimento e a regeneração tecidual em organismos multicelulares.'

    const rubric = generateAnalyticalRubric({
      questionStem,
      subject: 'Biologia',
      topic: 'Divisão Celular'
    })

    rubric.criteria.forEach(criterion => {
      criterion.levels.forEach(level => {
        // Descritor observável deve ser claro e substancial (> 20 caracteres)
        expect(level.observableDescriptor.length).toBeGreaterThan(20)
        // Exemplos de evidências concretas
        expect(level.evidenceExamples.length).toBeGreaterThanOrEqual(1)
        level.evidenceExamples.forEach(ex => {
          expect(ex.trim().length).toBeGreaterThan(5)
        })
      })
    })

    expect(rubric.expectedKeyPoints.length).toBeGreaterThan(0)
    expect(rubric.expectedKeyPoints.some(kp => kp.toLowerCase().includes('justificativa'))).toBe(true)
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. AUDITORIA DE ADJETIVOS VAGOS E SUBJETIVOS (Popham, 1997; Andrade, 2005)
  // ─────────────────────────────────────────────────────────────────────────────

  it('deve validar que nenhum nível da rubrica gerada contém adjetivos vagos não ancorados', () => {
    const questionStem = 'Compare o modelo atômico de Thomson com o modelo de Rutherford, indicando o experimento crucial que refutou o pudim de passas.'

    const rubric = generateAnalyticalRubric({
      questionStem,
      subject: 'Química',
      topic: 'Modelos Atômicos'
    })

    // Auditoria embutida na rubrica
    expect(rubric.vagueAdjectiveAudit.hasUnanchoredVagueAdjectives).toBe(false)
    expect(rubric.vagueAdjectiveAudit.detectedVagueWords).toEqual([])

    // Verificação cruzada em todos os descritores e exemplos
    rubric.criteria.forEach(c => {
      c.levels.forEach(l => {
        const check = auditVagueAdjectivesInRubric(l.observableDescriptor)
        expect(check.hasUnanchoredVagueAdjectives).toBe(false)
        expect(check.detectedVagueWords).toHaveLength(0)

        l.evidenceExamples.forEach(ex => {
          const exCheck = auditVagueAdjectivesInRubric(ex)
          expect(exCheck.hasUnanchoredVagueAdjectives).toBe(false)
        })
      })
    })
  })

  it('deve detectar adjetivos vagos quando fornecido texto subjetivo não ancorado', () => {
    const badRubricText = 'O aluno apresentou um bom raciocínio, com argumentação razoável e domínio satisfatório dos conceitos, mas a conclusão foi fraca e mais ou menos coerente.'

    const audit = auditVagueAdjectivesInRubric(badRubricText)
    expect(audit.hasUnanchoredVagueAdjectives).toBe(true)
    expect(audit.detectedVagueWords).toContain('bom')
    expect(audit.detectedVagueWords).toContain('razoável')
    expect(audit.detectedVagueWords).toContain('satisfatório')
    expect(audit.detectedVagueWords).toContain('fraca')
    expect(audit.detectedVagueWords).toContain('mais ou menos')
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. FORMATAÇÃO E ESTRUTURA VISUAL
  // ─────────────────────────────────────────────────────────────────────────────

  it('deve produzir Markdown estruturado com tabela Likert de 4 colunas de proficiência', () => {
    const questionStem = 'Discuta as consequências geopolíticas da queda do Muro de Berlim em 1989 para a ordem mundial bipolar.'

    const rubric = generateAnalyticalRubric({ questionStem })

    expect(rubric.formattedMarkdown).toContain('### 📊 Rubrica Analítica de Correção (Escala Likert 4 Níveis)')
    expect(rubric.formattedMarkdown).toContain('1 - Insuficiente (25%)')
    expect(rubric.formattedMarkdown).toContain('2 - Básico (50%)')
    expect(rubric.formattedMarkdown).toContain('3 - Proficiente (75%)')
    expect(rubric.formattedMarkdown).toContain('4 - Avançado (100%)')
    expect(rubric.formattedMarkdown).toContain('Domínio Conceitual & Precisão Técnica')
    expect(rubric.formattedMarkdown).toContain('Raciocínio & Relação Causa-Efeito')
    expect(rubric.formattedMarkdown).toContain('Clareza Textual & Coesão')
  })
})
