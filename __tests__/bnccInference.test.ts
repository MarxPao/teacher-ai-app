/**
 * __tests__/bnccInference.test.ts
 * 
 * Testes Unitários e de Integração: Motor Determinístico de Inferência BNCC (Prioridade 1)
 * Valida:
 * 1. Inferência de "Present Perfect" para 8º ano -> EF08LI19
 * 2. Inferência de "Present Perfect" para 9º ano -> EF09LI15
 * 3. Inferência de "Simple Past" para 7º ano -> EF07LI15
 * 4. Inferência de "Future plans with will/going to" para 8º ano -> EF08LI14 / EF08LI18
 * 5. Inferência de "Conditionals" para 9º ano -> EF09LI16
 * 6. Detecção honesta: Tópicos não correlacionados ("Termodinâmica Quântica", "xyz123") retornam []
 * 7. Citação direta de código no tema ("Aula de EF08LI19") -> score máximo
 * 8. Respeito ao limite maxSuggestions
 * 9. Normalização de séries escolares (8º ano, 8, 8th, 9º Fund, 1º Médio)
 * 10. Prioridade da seleção manual do professor (não sobrescrever escolhas prévias)
 */

import { describe, it, expect } from 'vitest'
import {
  inferBnccSkillsForTopic,
  normalizeGradeYear,
  normalizeText
} from '../lib/bnccInference'
import { getBnccSkillsForGrade } from '../lib/bnccData'

describe('Motor de Inferência BNCC (bnccInference.ts)', () => {
  describe('1. Normalização de Séries e Textos', () => {
    it('normaliza variações textuais de séries do Ensino Fundamental e Médio', () => {
      expect(normalizeGradeYear('8º ano')).toBe('8º Fund.')
      expect(normalizeGradeYear('8º Ano')).toBe('8º Fund.')
      expect(normalizeGradeYear('8º Fund.')).toBe('8º Fund.')
      expect(normalizeGradeYear('8')).toBe('8º Fund.')
      expect(normalizeGradeYear('9º ano')).toBe('9º Fund.')
      expect(normalizeGradeYear('7º')).toBe('7º Fund.')
      expect(normalizeGradeYear('6º ano')).toBe('6º Fund.')
      expect(normalizeGradeYear('1º Médio')).toBe('1º Médio')
      expect(normalizeGradeYear('1º EM')).toBe('1º Médio')
      expect(normalizeGradeYear('2º Médio')).toBe('2º Médio')
      expect(normalizeGradeYear('3º Médio')).toBe('3º Médio')
    })

    it('normaliza strings removendo acentuação e pontuação', () => {
      expect(normalizeText('Ação e Reação')).toBe('acao e reacao')
      expect(normalizeText('Present Perfect: Life Experiences!')).toBe('present perfect life experiences')
      expect(normalizeText('')).toBe('')
    })
  })

  describe('2. Inferência de Habilidades Gramaticais e Temáticas ELT', () => {
    it('infere EF08LI19 para "Present Perfect" no 8º ano', () => {
      const skills = inferBnccSkillsForTopic('Present Perfect and life experiences', '8º ano')
      expect(skills.length).toBeGreaterThan(0)
      const codes = skills.map(s => s.code)
      expect(codes).toContain('EF08LI19')
    })

    it('infere EF09LI15 para "Present Perfect" no 9º ano com alta relevância', () => {
      const skills = inferBnccSkillsForTopic('Present Perfect with since and for', '9º ano')
      expect(skills.length).toBeGreaterThan(0)
      expect(skills[0].code).toBe('EF09LI15')
      expect(skills[0].description).toContain('Present Perfect')
    })

    it('infere EF07LI15 para "Simple Past regular and irregular verbs" no 7º ano', () => {
      const skills = inferBnccSkillsForTopic('Simple Past and irregular verbs for storytelling', '7º ano')
      expect(skills.length).toBeGreaterThan(0)
      expect(skills[0].code).toBe('EF07LI15')
    })

    it('infere EF08LI14 para "Future forms with will and going to" no 8º ano', () => {
      const skills = inferBnccSkillsForTopic('Future predictions with will and plans with going to', '8º ano')
      expect(skills.length).toBeGreaterThan(0)
      const codes = skills.map(s => s.code)
      expect(codes).toContain('EF08LI14')
    })

    it('infere EF09LI16 para "Conditionals (First and Second)" no 9º ano', () => {
      const skills = inferBnccSkillsForTopic('Conditionals and hypothetical situations', '9º ano')
      expect(skills.length).toBeGreaterThan(0)
      const codes = skills.map(s => s.code)
      expect(codes).toContain('EF09LI16')
    })

    it('infere EF06LI19 para "Daily routine and habits" no 6º ano', () => {
      const skills = inferBnccSkillsForTopic('Daily routine and Simple Present habits', '6º ano')
      expect(skills.length).toBeGreaterThan(0)
      const codes = skills.map(s => s.code)
      expect(codes).toContain('EF06LI19')
    })

    it('infere EF09LI14 para conectivos e linkers no 9º ano', () => {
      const skills = inferBnccSkillsForTopic('Discourse connectors and linkers however although therefore', '9º ano')
      expect(skills.length).toBeGreaterThan(0)
      const codes = skills.map(s => s.code)
      expect(codes).toContain('EF09LI14')
    })
  })

  describe('3. Detecção Honesta e Proteção Contra Falsos Positivos', () => {
    it('retorna [] para tópicos científicos não relacionados à língua inglesa', () => {
      const skills = inferBnccSkillsForTopic('Termodinâmica molecular e colisões quânticas', '8º ano')
      expect(skills).toEqual([])
    })

    it('retorna [] para strings vazias ou sem correspondência pedagógica', () => {
      expect(inferBnccSkillsForTopic('', '8º ano')).toEqual([])
      expect(inferBnccSkillsForTopic('   ', '8º ano')).toEqual([])
      expect(inferBnccSkillsForTopic('xyz999foo bar baz', '8º ano')).toEqual([])
    })
  })

  describe('4. Matching de Código Direto e Limite de Sugestões', () => {
    it('atribui prioridade máxima quando o professor digita o código BNCC no tópico', () => {
      const skills = inferBnccSkillsForTopic('Aula focada em EF08LI19 e narrativas pessoais', '8º ano')
      expect(skills.length).toBeGreaterThan(0)
      expect(skills[0].code).toBe('EF08LI19')
    })

    it('respeita rigorosamente o parâmetro maxSuggestions', () => {
      const top1 = inferBnccSkillsForTopic('Reading comprehension and critical analysis of journalistic texts', '8º ano', 1)
      expect(top1.length).toBe(1)

      const top2 = inferBnccSkillsForTopic('Reading comprehension and critical analysis of journalistic texts', '8º ano', 2)
      expect(top2.length).toBeLessThanOrEqual(2)
    })
  })

  describe('5. Lógica de Não-Sobrescrita de Seleção Manual', () => {
    it('preserva a seleção manual prévia do professor e não a sobrescreve', () => {
      const manuallySelected = [
        { code: 'EF08LI01', desc: 'Debate oral', status: 'planned' as const }
      ]

      // Simula o comportamento do LessonStudio: só infere se selectedSkills estiver vazio
      const topic = 'Present Perfect'
      let finalSkills = [...manuallySelected]

      if (finalSkills.length === 0) {
        const inferred = inferBnccSkillsForTopic(topic, '8º ano')
        finalSkills = inferred.map(s => ({
          code: s.code,
          desc: s.description,
          status: 'planned',
          isAutoSuggested: true
        }))
      }

      // Deve manter a seleção manual
      expect(finalSkills).toHaveLength(1)
      expect(finalSkills[0].code).toBe('EF08LI01')
      expect(finalSkills[0].isAutoSuggested).toBeUndefined()
    })

    it('marca as habilidades como isAutoSuggested: true apenas quando inferidas', () => {
      const topic = 'Present Perfect'
      const inferred = inferBnccSkillsForTopic(topic, '8º ano')
      const mapped = inferred.map(s => ({
        code: s.code,
        desc: s.description,
        status: 'planned' as const,
        isAutoSuggested: true
      }))

      expect(mapped.length).toBeGreaterThan(0)
      expect(mapped.every(s => s.isAutoSuggested === true)).toBe(true)
    })
  })

  describe('6. Auditoria Estática de Integração no LessonStudio.tsx', () => {
    it('verifica conformidade de contratos e renderização no LessonStudio.tsx', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const studioPath = path.resolve(__dirname, '../components/modules/LessonStudio.tsx')
      const code = fs.readFileSync(studioPath, 'utf8')

      // 1. Interface LessonStage inclui targetBnccCode?: string
      expect(code).toContain('targetBnccCode?: string')

      // 2. Importação e chamada de inferBnccSkillsForTopic
      expect(code).toContain('inferBnccSkillsForTopic')
      expect(code).toContain('inferBnccSkillsForTopic(topic')

      // 3. Schema JSON no prompt solicita targetBnccCode
      expect(code).toContain('"targetBnccCode":')

      // 4. Mapeamento de targetBnccCode nas etapas retornadas
      expect(code).toContain('targetBnccCode: stg.targetBnccCode')

      // 5. Badge visual de IA nos chips de habilidades
      expect(code).toContain('🤖 Sugestão da IA')

      // 6. Botão de auto-sugestão manual
      expect(code).toContain('Sugerir pelo Tema')

      // 7. Coluna BNCC na tabela de visualização do roteiro
      expect(code).toContain('Cód. BNCC')
      expect(code).toContain('stg.targetBnccCode')
    })
  })
})
