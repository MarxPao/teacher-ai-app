import { describe, it, expect } from 'vitest'
import {
  auditHaladynaGuidelines,
  autoFixHaladynaViolations,
  isCriticalHaladynaViolation
} from '@/lib/haladynaLinter'
import {
  calculateFleschKincaidGradeLevel,
  evaluateReadabilityForGrade,
  calculateFleschScore
} from '@/lib/readingLoadAuditor'

describe('Onda B - Fase B2: Haladyna Linter com Auto-Fix + Legibilidade Flesch-Kincaid', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. AUTO-FIX DE VIOLAÇÕES DE HALADYNA
  // ─────────────────────────────────────────────────────────────────────────────

  it('deve corrigir automaticamente item violando Haladyna com "Todas as anteriores"', () => {
    const stem = 'Qual dos seguintes elementos participa do ciclo da água?'
    const options = [
      { letter: 'A', text: 'Evaporação' },
      { letter: 'B', text: 'Condensação' },
      { letter: 'C', text: 'Precipitação' },
      { letter: 'D', text: 'Todas as anteriores' } // Violação crítica
    ]

    const initialAudit = auditHaladynaGuidelines(stem, options)
    expect(initialAudit.hasViolations).toBe(true)
    expect(initialAudit.violations.some(v => v.ruleId === 'ALL_NONE_ABOVE')).toBe(true)
    expect(isCriticalHaladynaViolation(initialAudit.violations[0])).toBe(true)

    // Aplica auto-fix
    const fixed = autoFixHaladynaViolations(stem, options, 'D')
    expect(fixed.wasModified).toBe(true)
    expect(fixed.appliedFixes.length).toBeGreaterThan(0)
    expect(fixed.fixedOptions[3].text).not.toMatch(/todas as anteriores/i)
    expect(fixed.fixedOptions[3].text).toContain('Nenhum dos fatores citados')

    // Verifica que a violação crítica desapareceu
    const auditAfter = auditHaladynaGuidelines(fixed.fixedStem, fixed.fixedOptions)
    expect(auditAfter.violations.some(v => v.ruleId === 'ALL_NONE_ABOVE')).toBe(false)
  })

  it('deve converter palavras de negação minúsculas no enunciado para MAIÚSCULAS', () => {
    const stem = 'Assinale a alternativa que não apresenta um exemplo de substantivo próprio, exceto quando indicado:'
    const options = [
      { letter: 'A', text: 'Brasil' },
      { letter: 'B', text: 'cidade' },
      { letter: 'C', text: 'São Paulo' }
    ]

    const initialAudit = auditHaladynaGuidelines(stem, options)
    expect(initialAudit.violations.some(v => v.ruleId === 'UNHIGHLIGHTED_NEGATIVE')).toBe(true)

    const fixed = autoFixHaladynaViolations(stem, options)
    expect(fixed.wasModified).toBe(true)
    expect(fixed.fixedStem).toContain('NÃO')
    expect(fixed.fixedStem).toContain('EXCETO')

    const auditAfter = auditHaladynaGuidelines(fixed.fixedStem, fixed.fixedOptions)
    expect(auditAfter.violations.some(v => v.ruleId === 'UNHIGHLIGHTED_NEGATIVE')).toBe(false)
  })

  it('deve neutralizar pistas gramaticais e fonéticas no final do enunciado (Anti-Cueing)', () => {
    const stem = 'O animal vertebrado caracterizado pela presença de pelos e glândulas mamárias é um:'
    const options = [
      { letter: 'A', text: 'Mamífero terrestre' },
      { letter: 'B', text: 'Réptil aquático' },
      { letter: 'C', text: 'Ave de rapina' }
    ]

    const initialAudit = auditHaladynaGuidelines(stem, options)
    expect(initialAudit.violations.some(v => v.ruleId === 'ANTI_CUEING')).toBe(true)

    const fixed = autoFixHaladynaViolations(stem, options)
    expect(fixed.wasModified).toBe(true)
    expect(fixed.fixedStem).not.toMatch(/é um:$/i)
    expect(fixed.appliedFixes.some(f => f.includes('pista fonética/gramatical'))).toBe(true)
  })

  it('deve desduplicar distratores redundantes com texto idêntico', () => {
    const stem = 'Qual o valor aproximado da aceleração da gravidade na Terra?'
    const options = [
      { letter: 'A', text: '9.8 m/s²' },
      { letter: 'B', text: '10.5 m/s²' },
      { letter: 'C', text: '9.8 m/s²' } // Duplicata
    ]

    const initialAudit = auditHaladynaGuidelines(stem, options)
    expect(initialAudit.violations.some(v => v.ruleId === 'REDUNDANT_DISTRACTOR')).toBe(true)

    const fixed = autoFixHaladynaViolations(stem, options)
    expect(fixed.wasModified).toBe(true)
    expect(fixed.fixedOptions[2].text).toContain('(fator complementar)')

    const auditAfter = auditHaladynaGuidelines(fixed.fixedStem, fixed.fixedOptions)
    expect(auditAfter.violations.some(v => v.ruleId === 'REDUNDANT_DISTRACTOR')).toBe(false)
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. ANÁLISE DE LEGIBILIDADE FLESCH-KINCAID ADAPTADA AO PORTUGUÊS
  // ─────────────────────────────────────────────────────────────────────────────

  it('deve calcular o Grau de Escolaridade Flesch-Kincaid em anos escolares para textos em PT', () => {
    // Texto simples, períodos curtos
    const simpleText = 'O gato subiu no muro da casa. Ele viu um pássaro colorido na árvore. O dia estava quente e calmo.'
    const gradeSimple = calculateFleschKincaidGradeLevel(simpleText, 'pt')
    expect(gradeSimple).toBeLessThanOrEqual(6.0)

    // Texto complexo e acadêmico com períodos extensos e subordinação múltipla
    const complexAcademicText = 'A hermenêutica constitucional contemporânea pressupõe a ponderação principiológica tripartite entre os postulados fundamentais da proporcionalidade, da razoabilidade e da dignidade da pessoa humana, consubstanciando diretrizes indeclináveis de salvaguarda democrática perante as prerrogativas estatais.'
    const gradeComplex = calculateFleschKincaidGradeLevel(complexAcademicText, 'pt')
    expect(gradeComplex).toBeGreaterThanOrEqual(12.0)
  })

  it('deve sinalizar texto complexo como inadequado para o 6º ano do Ensino Fundamental', () => {
    const heavyText = 'A justaposição de fenômenos termodinâmicos irreversíveis acarreta a dissipação entrópica progressiva em sistemas adiabáticos fechados, inviabilizando a restauração completa das condições energéticas primordiais sem dispêndio adicional de trabalho externo.'

    const evaluation = evaluateReadabilityForGrade(heavyText, '6º ano', 'pt')
    expect(evaluation.isAppropriate).toBe(false)
    expect(evaluation.targetGrade).toContain('6º ano')
    expect(evaluation.warning).toBeDefined()
    expect(evaluation.warning).toContain('Texto complexo')
    expect(evaluation.warning).toContain('Grau de escolaridade calculado')
    expect(evaluation.pedagogicalRecommendation).toContain('fracionar períodos')
  })

  it('deve aprovar texto com linguagem fluida e compatível com a faixa etária do 6º ano', () => {
    const ageAppropriateText = 'A água dos rios evapora com o calor do sol. O vapor sobe e forma nuvens no céu. Quando as nuvens ficam pesadas, a chuva cai de volta na terra.'

    const evaluation = evaluateReadabilityForGrade(ageAppropriateText, '6º ano', 'pt')
    expect(evaluation.isAppropriate).toBe(true)
    expect(evaluation.warning).toBeUndefined()
    expect(evaluation.fleschKincaidGradeLevel).toBeLessThanOrEqual(7.5)
    expect(evaluation.fleschScore).toBeGreaterThanOrEqual(60)
  })
})
