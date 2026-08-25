import { describe, it, expect, beforeEach } from 'vitest'
import {
  getSubjectProfile,
  getSubjectProfileById,
  getAllSubjectProfiles,
  getExamSections,
  getLevelIds,
  getLevelGatingRule,
  getDistractorBlock
} from '../lib/subjectProfile'
import '../lib/subjects/english'
import '../lib/subjects/portuguese'
import { migrateLocalDataForTeacher } from '../lib/authMigration'

// Mock localStorage for test environment
const mockStorage: Record<string, string> = {}
global.localStorage = {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, value: string) => { mockStorage[key] = value },
  removeItem: (key: string) => { delete mockStorage[key] },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]) },
  key: (index: number) => Object.keys(mockStorage)[index] || null,
  length: 0
} as any

describe('SubjectProfile Multi-Subject Engine Suite', () => {
  it('registra e recupera perfis de Inglês e Português', () => {
    const all = getAllSubjectProfiles()
    expect(all.length).toBeGreaterThanOrEqual(2)

    const eng = getSubjectProfileById('english')
    expect(eng).not.toBeNull()
    expect(eng?.name).toBe('Língua Inglesa')
    expect(eng?.levelFramework.name).toBe('CEFR')

    const pt = getSubjectProfileById('portuguese')
    expect(pt).not.toBeNull()
    expect(pt?.name).toBe('Língua Portuguesa')
    expect(pt?.levelFramework.name).toBe('Ano Escolar BNCC')
  })

  it('perfil de Língua Portuguesa contém 18 distratores diagnósticos reais', () => {
    const pt = getSubjectProfileById('portuguese')
    expect(pt?.distractorPatterns.length).toBe(18)
    
    // Verifica presença de distratores conceituais específicos
    const patterns = pt?.distractorPatterns.map(d => d.id) || []
    expect(patterns).toContain('conc_verbal_composto')
    expect(patterns).toContain('regencia_assistir')
    expect(patterns).toContain('crase_feminino')
    expect(patterns).toContain('mas_mais')
    expect(patterns).toContain('porque_formas')
  })

  it('gera seções e níveis de prova dinâmicos baseados no perfil ativo', () => {
    const pt = getSubjectProfileById('portuguese')!
    const sections = getExamSections(pt)
    expect(sections.length).toBe(4) // 4 eixos BNCC
    expect(sections.map(s => s.key)).toContain('leitura')
    expect(sections.map(s => s.key)).toContain('analise_linguistica')

    const levels = getLevelIds(pt)
    expect(levels).toEqual(['6ano', '7ano', '8ano', '9ano', 'em'])

    const gating = getLevelGatingRule(pt, '6ano')
    expect(gating).toContain('6º ANO ENSINO FUNDAMENTAL')
    expect(gating).toContain('PROIBIDO')

    const distractorBlock = getDistractorBlock(pt)
    expect(distractorBlock).toContain('DESIGN DIAGNÓSTICO DE DISTRATORES — LP')
  })

  it('migra dados locais associando ao teacher_id no primeiro login', () => {
    mockStorage['teacher_classes'] = JSON.stringify([
      { id: 'c1', name: 'Turma A', grade: '9º Fund.' }
    ])
    mockStorage['teacher_cfg'] = JSON.stringify({ school: 'Escola Modelo' })

    const res = migrateLocalDataForTeacher({
      id: 'teacher_uid_999',
      email: 'prof@escola.com.br',
      name: 'Prof. Teste'
    })

    expect(res.migrated).toBe(true)
    expect(res.count).toBe(1)

    const updatedClasses = JSON.parse(mockStorage['teacher_classes'])
    expect(updatedClasses[0].teacherId).toBe('teacher_uid_999')

    const updatedCfg = JSON.parse(mockStorage['teacher_cfg'])
    expect(updatedCfg.teacher).toBe('Prof. Teste')
  })
})
