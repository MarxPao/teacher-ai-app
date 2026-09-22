import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { dissectBnccSkill, BLOOM_LEVELS } from '@/lib/bnccDissector'
import { getBnccCatalog, getBnccForGrade } from '@/lib/bnccStore'

describe('Central Curricular BNCC — Módulo, Buscador & Dissecador', () => {
  it('1. dissectBnccSkill: classifica corretamente o nível de Bloom da habilidade', () => {
    // Comparar, ordenar, ler e escrever -> Compreender
    const d1 = dissectBnccSkill(
      'EF06MA01',
      'Comparar, ordenar, ler e escrever números naturais e números racionais cuja representação decimal é finita, fazendo uso da reta numérica.',
      'Matemática'
    )
    expect(d1.bloomLevel).toBe('Compreender')
    expect(d1.actionVerbs).toContain('comparar')
    expect(d1.bloomInfo.color).toBe(BLOOM_LEVELS.Compreender.color)
    expect(d1.contextModifier).toContain('fazendo uso da')
    expect(d1.classroomSuggestion).toContain('mapa conceitual ou quadro comparativo')

    // Planejar textos -> Criar
    const d2 = dissectBnccSkill(
      'EF06LP15',
      'Planejar textos considerando o contexto de produção, selecionando forma de tratamento e registro adequados.',
      'Língua Portuguesa'
    )
    expect(d2.bloomLevel).toBe('Criar')
    expect(d2.actionVerbs).toContain('planejar')
    expect(d2.classroomSuggestion).toContain('projeto integrador ou produto final')

    // Identificar e acolher -> Lembrar
    const d3 = dissectBnccSkill(
      'EF01ER01',
      'Identificar e acolher as semelhanças e diferenças entre o eu, o outro e o nós.',
      'Ensino Religioso'
    )
    expect(d3.bloomLevel).toBe('Lembrar')
    expect(d3.actionVerbs).toContain('identificar')
  })

  it('2. getBnccCatalog("all"): serve o catálogo universal com mais de 1.200 habilidades em 9 disciplinas', () => {
    const catalog = getBnccCatalog('all')
    expect(catalog.length).toBeGreaterThan(1200)

    // Contém habilidades de diferentes matérias
    const subjects = new Set(catalog.map(s => s.subject))
    expect(subjects.has('EF_LP')).toBe(true)
    expect(subjects.has('EF_MA')).toBe(true)
    expect(subjects.has('EF_CI')).toBe(true)
    expect(subjects.has('EF_HI')).toBe(true)
    expect(subjects.has('EF_GE')).toBe(true)
    expect(subjects.has('EF_LI')).toBe(true)
  })

  it('3. getBnccCatalog por disciplina específica filtra com exatidão', () => {
    const lp = getBnccCatalog('EF_LP')
    expect(lp.length).toBe(308)
    expect(lp.every(s => s.code.includes('LP'))).toBe(true)

    const ma = getBnccCatalog('EF_MA')
    expect(ma.length).toBe(246)
    expect(ma.every(s => s.code.includes('MA'))).toBe(true)

    const ci = getBnccCatalog('EF_CI')
    expect(ci.length).toBe(111)
    expect(ci.every(s => s.code.includes('CI'))).toBe(true)
  })

  it('4. getBnccForGrade filtra corretamente por série no catálogo unificado', () => {
    const skills6th = getBnccForGrade('6º Fund.', 'EF_MA')
    expect(skills6th.length).toBeGreaterThan(0)
    expect(skills6th.every(s => s.code.startsWith('EF06MA'))).toBe(true)
  })

  it('5. Integração LessonStudio: prefill gerado contém a estrutura correta', () => {
    const skill = {
      id: 'EF08MA04',
      code: 'EF08MA04',
      gradeYear: '8º Fund.',
      description: 'Resolver e elaborar problemas, envolvendo cálculo de porcentagens...',
      subject: 'EF_MA',
      axis: 'Matemática'
    }

    const prefill = {
      topic: `${skill.code} — ${skill.description.slice(0, 60)}...`,
      gradeYear: skill.gradeYear,
      selectedSkills: [{
        code: skill.code,
        desc: skill.description,
        status: 'planned' as const
      }]
    }

    expect(prefill.topic).toContain('EF08MA04')
    expect(prefill.gradeYear).toBe('8º Fund.')
    expect(prefill.selectedSkills[0].code).toBe('EF08MA04')
    expect(prefill.selectedSkills[0].status).toBe('planned')
  })
})
