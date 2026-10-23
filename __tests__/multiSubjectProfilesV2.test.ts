import { describe, it, expect } from 'vitest'
import {
  getAllSubjectProfiles,
  getSubjectProfileById,
  validatePresentationTriad,
  getTimeBalanceMetric,
  getUdlScaffolding
} from '../lib/subjectProfile'
import { ALL_CANONICAL_SUBJECT_IDS } from '../lib/subjects'
import { GATING_RULES_CATALOG } from '../lib/curriculumGating'
import { MISCONCEPTION_CATALOG } from '../lib/misconceptionCatalog'

describe('Pacotes 1 e 2 — Perfis Epistemológicos de Matérias (V2)', () => {
  it('registra e recupera todos os 9 perfis curriculares canônicos', () => {
    const all = getAllSubjectProfiles()
    const allIds = all.map(p => p.id)
    
    for (const expectedId of ALL_CANONICAL_SUBJECT_IDS) {
      expect(allIds).toContain(expectedId)
      const profile = getSubjectProfileById(expectedId)
      expect(profile).not.toBeNull()
      expect(profile?.name).toBeTruthy()
      expect(profile?.taxonomy.length).toBeGreaterThan(0)
      expect(profile?.levelFramework.levels.length).toBeGreaterThan(0)
    }
  })

  it('cada perfil possui uma Tríade de Apresentação específica com 3 componentes epistemológicos', () => {
    for (const subjectId of ALL_CANONICAL_SUBJECT_IDS) {
      const profile = getSubjectProfileById(subjectId)!
      expect(profile.presentationTriad).toBeDefined()
      expect(profile.presentationTriad?.name).toBeTruthy()
      expect(profile.presentationTriad?.components.length).toBe(3)
      expect(profile.presentationTriad?.promptDirective).toBeTruthy()

      // Testa a validação determinística da tríade
      const dummyPlan = `
        Plano de Aula:
        Dimensões contempladas:
        - ${profile.presentationTriad!.components[0]}
        - ${profile.presentationTriad!.components[1]}
        - ${profile.presentationTriad!.components[2]}
      `
      const validation = validatePresentationTriad(profile, dummyPlan)
      expect(validation.compliant).toBe(true)
      expect(validation.missing.length).toBe(0)
    }
  })

  it('detecta componentes faltantes na Tríade de Apresentação', () => {
    const math = getSubjectProfileById('math')!
    const incompletePlan = 'Esta aula foca apenas em equações abstratas e algoritmos simbólicos.'
    const validation = validatePresentationTriad(math, incompletePlan)
    expect(validation.compliant).toBe(false)
    expect(validation.missing.length).toBeGreaterThan(0)
  })

  it('aplica métricas corretas de equilíbrio de tempo (IET vs AET ou TTT vs STT)', () => {
    const eng = getSubjectProfileById('english')!
    const engMetric = getTimeBalanceMetric(eng)
    expect(engMetric.primaryMetric).toBe('TTT_STT')
    expect(engMetric.teacherRoleLabel).toContain('Teacher Talking Time')
    expect(engMetric.targetRatio.studentMin).toBeGreaterThanOrEqual(70)

    const mat = getSubjectProfileById('math')!
    const matMetric = getTimeBalanceMetric(mat)
    expect(matMetric.primaryMetric).toBe('IET_AET')
    expect(matMetric.teacherRoleLabel).toContain('Instrução Expositiva')
    expect(matMetric.studentRoleLabel).toContain('Atividade Efetiva')
    expect(matMetric.targetRatio.studentMin).toBeGreaterThanOrEqual(65)
  })

  it('fornece suporte UDL triplo (percepção, expressão e engajamento) para todas as matérias', () => {
    for (const subjectId of ALL_CANONICAL_SUBJECT_IDS) {
      const profile = getSubjectProfileById(subjectId)!
      const udl = getUdlScaffolding(profile)
      expect(udl).not.toBeNull()
      expect(udl!.perception.length).toBeGreaterThan(0)
      expect(udl!.expression.length).toBeGreaterThan(0)
      expect(udl!.engagement.length).toBeGreaterThan(0)
    }
  })

  it('configura renderizadores especiais conforme a natureza da disciplina', () => {
    const math = getSubjectProfileById('math')!
    expect(math.specialRenderers?.hasMathJaxOrLatex).toBe(true)

    const physics = getSubjectProfileById('physics')!
    expect(physics.specialRenderers?.hasMathJaxOrLatex).toBe(true)

    const chem = getSubjectProfileById('chemistry')!
    expect(chem.specialRenderers?.hasChemicalFormulas).toBe(true)

    const bio = getSubjectProfileById('biology')!
    expect(bio.specialRenderers?.hasPunnettSquares).toBe(true)

    const geo = getSubjectProfileById('geography')!
    expect(geo.specialRenderers?.hasMapsOrCartography).toBe(true)

    const hist = getSubjectProfileById('history')!
    expect(hist.specialRenderers?.hasHistoricalTimelines).toBe(true)
  })

  it('vincula regras de gating válidas que existem no catálogo GATING_RULES_CATALOG', () => {
    for (const subjectId of ALL_CANONICAL_SUBJECT_IDS) {
      const profile = getSubjectProfileById(subjectId)!
      if (profile.gatingRuleIds) {
        for (const ruleId of profile.gatingRuleIds) {
          const ruleExists = GATING_RULES_CATALOG.some(r => r.id === ruleId)
          expect(ruleExists, `Regra de gating ${ruleId} do perfil ${subjectId} deve existir no catálogo`).toBe(true)
        }
      }
    }
  })
})
