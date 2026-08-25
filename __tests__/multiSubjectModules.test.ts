import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { checkOptionParallelism } from '../lib/itemQualityChecker'
import {
  getSubjectProfile,
  getAllSubjectProfiles,
  getLevelIds,
  getLevelGatingRule,
  getDistractorBlock
} from '../lib/subjectProfile'
import '../lib/subjects/english'
import '../lib/subjects/portuguese'
import {
  getTeacherStyleProfile,
  saveTeacherStyleProfile,
  updateTeacherProfileFromLessonPlan
} from '../lib/teacherStyleProfile'
import { getTeacherPreferenceProfile, buildTeacherStylePromptDirective } from '../lib/teacherProfile'

describe('Engine Multi-Matéria e Perfil Unificado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockStorage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('1. ItemQualityChecker — Paralelismo Sintático Multi-Matéria', () => {
    it('reconhece paralelismo de sintagmas nominais em inglês e português', () => {
      const enOptions = ['A) The old library', 'B) The new stadium', 'C) A quiet classroom', 'D) An empty hall']
      const ptOptions = ['A) O livro antigo', 'B) A nova biblioteca', 'C) Um aluno dedicado', 'D) Uma sala ampla']

      expect(checkOptionParallelism(enOptions).isParallel).toBe(true)
      expect(checkOptionParallelism(ptOptions).isParallel).toBe(true)
    })

    it('reconhece paralelismo de verbos no infinitivo em inglês e português', () => {
      const enOptions = ['A) to go to school', 'B) to study hard', 'C) to play soccer', 'D) to write letters']
      const ptOptions = ['A) viajar para o campo', 'B) estudar com dedicação', 'C) escrever um relatório', 'D) propor novas soluções']

      expect(checkOptionParallelism(enOptions).isParallel).toBe(true)
      expect(checkOptionParallelism(ptOptions).isParallel).toBe(true)
    })

    it('detecta quebra de paralelismo sintático misturado', () => {
      const mixed = [
        'A) O livro de matemática.',
        'B) Ele estava correndo no parque.',
        'C) Rapidamente pela manhã.',
        'D) Cantar uma canção.'
      ]
      const res = checkOptionParallelism(mixed)
      expect(res.isParallel).toBe(false)
      expect(res.warning).toContain('estruturas sintáticas mistas')
    })
  })

  describe('2. SubjectProfile — Perfis de Inglês e Língua Portuguesa', () => {
    it('carrega perfis de inglês e português no registro global', () => {
      const profiles = getAllSubjectProfiles()
      const ids = profiles.map(p => p.id)
      expect(ids).toContain('english')
      expect(ids).toContain('portuguese')
    })

    it('retorna níveis corretos para cada matéria', () => {
      const enProfile = getSubjectProfile('english')
      const ptProfile = getSubjectProfile('portuguese')

      const enLevels = getLevelIds(enProfile)
      const ptLevels = getLevelIds(ptProfile)

      expect(enLevels).toContain('B1')
      expect(ptLevels).toContain('6ano')
      expect(ptLevels).toContain('9ano')
    })

    it('fornece regras de gating e distratores específicos para Língua Portuguesa', () => {
      const ptProfile = getSubjectProfile('portuguese')
      const gating = getLevelGatingRule(ptProfile, '6ano')
      const distractorBlock = getDistractorBlock(ptProfile)

      expect(gating).toContain('6º ANO ENSINO FUNDAMENTAL')
      expect(distractorBlock).toContain('DESIGN DIAGNÓSTICO DE DISTRATORES')
      expect(distractorBlock).toContain('Concordância')
    })
  })

  describe('3. Perfil Unificado do Professor e Adaptabilidade de Planos de Aula', () => {
    it('atualiza métricas adaptativas de plano de aula no teacherStyleProfile', () => {
      updateTeacherProfileFromLessonPlan({
        methodology: 'TBLT',
        timingTotal: 50,
        stagesCount: 4,
        hasHomework: true
      })

      const p = getTeacherStyleProfile()
      expect(p.totalPlansCreated).toBe(1)
      expect(p.methodologyWeights['TBLT']).toBeGreaterThanOrEqual(1)
    })

    it('mantém total compatibilidade através do adaptador teacherProfile.ts', () => {
      const legacyProfile = getTeacherPreferenceProfile()
      expect(legacyProfile.typicalLessonDurationMin).toBeDefined()
      expect(legacyProfile.methodologyWeights).toBeDefined()

      const directive = buildTeacherStylePromptDirective()
      expect(directive).toContain('DIRETRIZES')
    })
  })
})
