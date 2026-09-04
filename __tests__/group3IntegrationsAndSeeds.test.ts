import { describe, it, expect, vi, beforeEach } from 'vitest'
import { seedQuestionBankIfNeeded } from '@/lib/seeds/curricularQuestionBankSeed'
import {
  saveGclassConfig,
  getGclassConfig,
  fetchGclassCourses,
  publishAssignmentToGclass
} from '@/lib/lmsGoogleClassroom'
import { DICTIONARY, t } from '@/lib/i18n'
import type { SupportedLang } from '@/lib/i18n'

describe('Group 3 - Integrations, Seeding and Institutional Analytics', () => {
  describe('1. Curricular Question Bank Auto-Seeding (Item 3)', () => {
    it('popula banco quando estiver vazio e preserva psicometria calibrada', () => {
      const empty: any[] = []
      const seeded = seedQuestionBankIfNeeded(empty)
      expect(seeded.length).toBeGreaterThanOrEqual(3)
      expect(seeded.some(q => q.id === 'seed_eng_01')).toBe(true)
      const q1 = seeded.find(q => q.id === 'seed_eng_01')
      expect(q1?.psychometrics?.discriminationIndex).toBeDefined()
      expect(q1?.psychometrics?.pValue).toBe(0.70)
    })

    it('nao duplica questoes ja existentes no banco', () => {
      const existing = [{ id: 'seed_eng_01', statement: 'Custom', type: 'mc' as const, createdAt: 1000 }]
      const result = seedQuestionBankIfNeeded(existing as any)
      const count = result.filter(q => q.id === 'seed_eng_01').length
      expect(count).toBe(1)
    })
  })

  describe('2. Google Classroom OAuth and CourseWork LMS Integration (Item 5)', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
    })

    it('salva e recupera a configuracao do Google Classroom com persistencia em memoria/storage', () => {
      saveGclassConfig({
        clientId: 'gclass-client-id-test.apps.googleusercontent.com',
        accessToken: 'ya29.test_token_sample',
        expiresAt: Date.now() + 3600000
      })
      const cfg = getGclassConfig()
      expect(cfg).not.toBeNull()
      expect(cfg?.clientId).toBe('gclass-client-id-test.apps.googleusercontent.com')
      expect(cfg?.accessToken).toBe('ya29.test_token_sample')
    })

    it('busca cursos ativos via Google Classroom API', async () => {
      const mockCourses = [
        { id: 'c101', name: '9 Ano A - Lingua Inglesa', courseState: 'ACTIVE' },
        { id: 'c102', name: '1 EM - Gramatica Avancada', courseState: 'ACTIVE' }
      ]
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ courses: mockCourses })
      } as Response)

      const courses = await fetchGclassCourses('valid-mock-token')
      expect(courses).toHaveLength(2)
      expect(courses[0].name).toBe('9 Ano A - Lingua Inglesa')
    })

    it('publica atividade (coursework) com titulo e pontuacao maxima', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'assignment-778' })
      } as Response)

      const result = await publishAssignmentToGclass('valid-mock-token', 'c101', {
        title: 'Avaliacao Diagnostica 1 Trimestre',
        description: 'Realize o teste com base na leitura da unidade 2.',
        maxPoints: 10,
        dueDate: { year: 2026, month: 9, day: 15 }
      })

      expect(result.success).toBe(true)
      expect(result.id).toBe('assignment-778')
    })
  })

  describe('3. Dicionario i18n Expandido (Item 17)', () => {
    it('suporta os 3 idiomas base: pt, en e es', () => {
      expect(DICTIONARY['pt']).toBeDefined()
      expect(DICTIONARY['en']).toBeDefined()
      expect(DICTIONARY['es']).toBeDefined()
    })

    it('traduz chaves criticas de navegacao e botoes em todos os idiomas', () => {
      const langs: SupportedLang[] = ['pt', 'en', 'es']
      for (const lang of langs) {
        expect(t('save', lang)).toBeTruthy()
        expect(t('cancel', lang)).toBeTruthy()
        expect(t('dashboard', lang)).toBeTruthy()
        expect(t('students', lang)).toBeTruthy()
        expect(t('gradebook', lang)).toBeTruthy()
      }
    })
  })
})