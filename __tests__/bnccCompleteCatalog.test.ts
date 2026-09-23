/**
 * __tests__/bnccCompleteCatalog.test.ts
 *
 * Teste de Validação Rigorosa: Catálogo Completo da BNCC de Língua Inglesa (MEC)
 *
 * Valida:
 * 1. Presença de todas as 88 habilidades do Ensino Fundamental (EF06LI01-26, EF07LI01-23, EF08LI01-20, EF09LI01-19).
 * 2. Presença de todas as 18 habilidades do Ensino Médio (EM13LGG101-704).
 * 3. Total de 106 habilidades oficiais de Língua Inglesa em DEFAULT_BNCC_SKILLS.
 * 4. Integridade dos 5 eixos organizadores da BNCC de Língua Inglesa.
 * 5. Corretude dos filtros por série via getBnccSkillsForGrade.
 * 6. Novas inferências temáticas no ELT_THESAURUS (Imperativo, Present/Past Continuous, Modais, etc.).
 */

import { describe, it, expect } from 'vitest'
import { DEFAULT_BNCC_SKILLS, getBnccSkillsForGrade, getStoredBnccSkills } from '../lib/bnccData'
import { inferBnccSkillsForTopic } from '../lib/bnccInference'

describe('Catálogo Oficial Completo da BNCC — Língua Inglesa (MEC)', () => {
  describe('1. Contagem e Completude Geral', () => {
    it('contém exatamente 106 habilidades de Língua Inglesa no catálogo padrão', () => {
      expect(DEFAULT_BNCC_SKILLS.length).toBe(106)
    })

    it('contém 88 habilidades de Ensino Fundamental e 18 de Ensino Médio', () => {
      const efSkills = DEFAULT_BNCC_SKILLS.filter(s => s.code.startsWith('EF'))
      const emSkills = DEFAULT_BNCC_SKILLS.filter(s => s.code.startsWith('EM'))

      expect(efSkills.length).toBe(88)
      expect(emSkills.length).toBe(18)
    })

    it('todas as habilidades possuem código, descrição, eixo e série não-vazios', () => {
      DEFAULT_BNCC_SKILLS.forEach(skill => {
        expect(skill.code).toBeTruthy()
        expect(skill.code.trim().length).toBeGreaterThan(0)
        expect(skill.description).toBeTruthy()
        expect(skill.description.trim().length).toBeGreaterThan(10)
        expect(skill.axis).toBeTruthy()
        expect(skill.gradeYear).toBeTruthy()
      })
    })
  })

  describe('2. Verificação Detalhada por Ano do Ensino Fundamental', () => {
    it('6º Ano: contém todas as 26 habilidades (EF06LI01 a EF06LI26)', () => {
      const skills6th = DEFAULT_BNCC_SKILLS.filter(s => s.gradeYear === '6º Fund.')
      expect(skills6th.length).toBe(26)

      for (let i = 1; i <= 26; i++) {
        const expectedCode = `EF06LI${String(i).padStart(2, '0')}`
        const found = skills6th.find(s => s.code === expectedCode)
        expect(found, `Habilidade ${expectedCode} ausente no 6º ano`).toBeDefined()
      }
    })

    it('7º Ano: contém todas as 23 habilidades (EF07LI01 a EF07LI23)', () => {
      const skills7th = DEFAULT_BNCC_SKILLS.filter(s => s.gradeYear === '7º Fund.')
      expect(skills7th.length).toBe(23)

      for (let i = 1; i <= 23; i++) {
        const expectedCode = `EF07LI${String(i).padStart(2, '0')}`
        const found = skills7th.find(s => s.code === expectedCode)
        expect(found, `Habilidade ${expectedCode} ausente no 7º ano`).toBeDefined()
      }
    })

    it('8º Ano: contém todas as 20 habilidades (EF08LI01 a EF08LI20)', () => {
      const skills8th = DEFAULT_BNCC_SKILLS.filter(s => s.gradeYear === '8º Fund.')
      expect(skills8th.length).toBe(20)

      for (let i = 1; i <= 20; i++) {
        const expectedCode = `EF08LI${String(i).padStart(2, '0')}`
        const found = skills8th.find(s => s.code === expectedCode)
        expect(found, `Habilidade ${expectedCode} ausente no 8º ano`).toBeDefined()
      }
    })

    it('9º Ano: contém todas as 19 habilidades (EF09LI01 a EF09LI19)', () => {
      const skills9th = DEFAULT_BNCC_SKILLS.filter(s => s.gradeYear === '9º Fund.')
      expect(skills9th.length).toBe(19)

      for (let i = 1; i <= 19; i++) {
        const expectedCode = `EF09LI${String(i).padStart(2, '0')}`
        const found = skills9th.find(s => s.code === expectedCode)
        expect(found, `Habilidade ${expectedCode} ausente no 9º ano`).toBeDefined()
      }
    })
  })

  describe('3. Verificação do Ensino Médio (LGG)', () => {
    it('contém as 18 competências e habilidades específicas de linguagens com foco em Língua Inglesa', () => {
      const emSkills = DEFAULT_BNCC_SKILLS.filter(s => s.code.startsWith('EM13LGG'))
      expect(emSkills.length).toBe(18)

      const expectedCodes = [
        'EM13LGG101', 'EM13LGG102', 'EM13LGG103', 'EM13LGG104', 'EM13LGG105',
        'EM13LGG201', 'EM13LGG202', 'EM13LGG204',
        'EM13LGG301', 'EM13LGG302', 'EM13LGG303',
        'EM13LGG401', 'EM13LGG402', 'EM13LGG403',
        'EM13LGG604',
        'EM13LGG701', 'EM13LGG703', 'EM13LGG704'
      ]

      expectedCodes.forEach(code => {
        const found = emSkills.find(s => s.code === code)
        expect(found, `Competência ${code} ausente no Ensino Médio`).toBeDefined()
      })
    })
  })

  describe('4. Cobertura dos 5 Eixos Oficiais da BNCC de Língua Inglesa', () => {
    const OFFICIAL_AXES = [
      'Oralidade',
      'Leitura',
      'Escrita',
      'Conhecimentos Linguísticos',
      'Dimensão Intercultural'
    ]

    OFFICIAL_AXES.forEach(axis => {
      it(`possui habilidades no eixo "${axis}"`, () => {
        const inAxis = DEFAULT_BNCC_SKILLS.filter(s => s.axis === axis)
        expect(inAxis.length).toBeGreaterThan(0)
      })
    })
  })

  describe('5. Filtros por Série via getBnccSkillsForGrade', () => {
    it('filtra corretamente habilidades do 6º ano', () => {
      const skills = getBnccSkillsForGrade('6º Fund.')
      expect(skills.length).toBe(26)
      expect(skills.every(s => s.gradeYear === '6º Fund.')).toBe(true)
    })

    it('filtra corretamente habilidades do 7º ano', () => {
      const skills = getBnccSkillsForGrade('7º Fund.')
      expect(skills.length).toBe(23)
      expect(skills.every(s => s.gradeYear === '7º Fund.')).toBe(true)
    })

    it('filtra corretamente habilidades do 8º ano', () => {
      const skills = getBnccSkillsForGrade('8º Fund.')
      expect(skills.length).toBe(20)
      expect(skills.every(s => s.gradeYear === '8º Fund.')).toBe(true)
    })

    it('filtra corretamente habilidades do 9º ano', () => {
      const skills = getBnccSkillsForGrade('9º Fund.')
      expect(skills.length).toBe(19)
      expect(skills.every(s => s.gradeYear === '9º Fund.')).toBe(true)
    })

    it('retorna todas as 106 habilidades quando gradeYear é "all"', () => {
      const skills = getBnccSkillsForGrade('all')
      expect(skills.length).toBe(106)
    })
  })

  describe('6. Inferência com os Novos Tópicos Expandidos do Thesaurus', () => {
    it('infere EF06LI18 para tópicos com "imperative and classroom instructions" no 6º ano', () => {
      const skills = inferBnccSkillsForTopic('Imperative and classroom instructions', '6º ano')
      expect(skills.length).toBeGreaterThan(0)
      expect(skills.map(s => s.code)).toContain('EF06LI18')
    })

    it('infere EF06LI20 para "present continuous and actions in progress" no 6º ano', () => {
      const skills = inferBnccSkillsForTopic('Present continuous actions in progress now', '6º ano')
      expect(skills.length).toBeGreaterThan(0)
      expect(skills.map(s => s.code)).toContain('EF06LI20')
    })

    it('infere EF07LI18 para "past continuous and while/when narrative sequences" no 7º ano', () => {
      const skills = inferBnccSkillsForTopic('Past continuous and simple past with while and when', '7º ano')
      expect(skills.length).toBeGreaterThan(0)
      expect(skills.map(s => s.code)).toContain('EF07LI18')
    })

    it('infere EF06LI23 para "modal verbs can for abilities" no 6º ano', () => {
      const skills = inferBnccSkillsForTopic('Modal verb can for abilities and permissions', '6º ano')
      expect(skills.length).toBeGreaterThan(0)
      expect(skills.map(s => s.code)).toContain('EF06LI23')
    })

    it('infere EF06LI21 para "genitive case and family possession" no 6º ano', () => {
      const skills = inferBnccSkillsForTopic('Genitive case and possession in family relationships', '6º ano')
      expect(skills.length).toBeGreaterThan(0)
      expect(skills.map(s => s.code)).toContain('EF06LI21')
    })

    it('infere EF09LI17 para "passive voice" no 9º ano', () => {
      const skills = inferBnccSkillsForTopic('Passive voice in historical news articles', '9º ano')
      expect(skills.length).toBeGreaterThan(0)
      expect(skills.map(s => s.code)).toContain('EF09LI17')
    })

    it('infere EF08LI13 para "word formation prefixes and suffixes" no 8º ano', () => {
      const skills = inferBnccSkillsForTopic('Word formation with prefixes and suffixes', '8º ano')
      expect(skills.length).toBeGreaterThan(0)
      expect(skills.map(s => s.code)).toContain('EF08LI13')
    })
  })
})
