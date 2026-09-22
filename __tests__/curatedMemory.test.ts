import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  getCuratedTeacherProfile,
  saveCuratedTeacherProfile,
  recordCuratedFact,
  exportCuratedMemoryMarkdown,
  buildCuratedSystemPromptContext
} from '../lib/curatedMemory'
import { getTeacherCalibrations } from '../lib/teacherCalibrations'
import { getTeacherStyleProfile } from '../lib/teacherStyleProfile'

describe('curatedMemory — Single Source of Truth para Memória Semântica', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    vi.clearAllMocks()
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} }
    })
    vi.stubGlobal('window', {
      dispatchEvent: () => true
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('deve reconciliar perfil inicial a partir das fontes padrão', () => {
    const profile = getCuratedTeacherProfile()
    expect(profile.defaultSubject).toBe('english')
    expect(profile.gradingRigor).toBe(3)
    expect(profile.preferredTone).toBe('afetuoso_construtivo')
    expect(profile.typicalLessonDurationMin).toBe(50)
  })

  it('deve sincronizar bidirecionalmente atualizações entre calibrações e perfil de estilo', () => {
    saveCuratedTeacherProfile({
      teacherName: 'Profa. Mariana Silva',
      schoolName: 'Colégio Alpha',
      gradingRigor: 5,
      typicalLessonDurationMin: 60,
      preferredTone: 'direto_tecnico'
    })

    // Verifica no curatedMemory
    const curated = getCuratedTeacherProfile()
    expect(curated.teacherName).toBe('Profa. Mariana Silva')
    expect(curated.schoolName).toBe('Colégio Alpha')
    expect(curated.gradingRigor).toBe(5)
    expect(curated.typicalLessonDurationMin).toBe(60)

    // Verifica que refletiu em teacherCalibrations
    const cal = getTeacherCalibrations()
    expect(cal.teacherName).toBe('Profa. Mariana Silva')
    expect(cal.grading.gradingRigor).toBe(5)
    expect(cal.planner.defaultDurationMinutes).toBe(60)

    // Verifica que refletiu em teacherStyleProfile
    const style = getTeacherStyleProfile()
    expect(style.teacherName).toBe('Profa. Mariana Silva')
    expect(style.gradingRigor).toBe(5)
    expect(style.typicalLessonDurationMin).toBe(60)
  })

  it('deve registrar e acumular fatos curados sem duplicação', () => {
    const f1 = recordCuratedFact('Usa o livro Interchange 2 com a turma do 9º ano', 'teacher_preference')
    expect(f1.fact).toContain('Interchange 2')
    expect(f1.confidence).toBe(0.9)

    // Ao tentar salvar o mesmo fato, reforça confiança sem duplicar
    const f2 = recordCuratedFact('Usa o livro Interchange 2 com a turma do 9º ano', 'teacher_preference')
    expect(f2.confidence).toBe(1.0)

    const profile = getCuratedTeacherProfile()
    const matching = profile.facts.filter(f => f.fact.includes('Interchange 2'))
    expect(matching.length).toBe(1)
  })

  it('deve exportar visualização canônica formato MEMORY.md', () => {
    saveCuratedTeacherProfile({
      teacherName: 'Prof. Carlos',
      schoolName: 'Escola Machado',
      gradingRigor: 4
    })
    recordCuratedFact('Turma B tem aula às terças e quintas', 'class_insight')

    const md = exportCuratedMemoryMarkdown()
    expect(md).toContain('# MEMORY.md — Perfil Curado e Fatos da Professora')
    expect(md).toContain('Prof. Carlos')
    expect(md).toContain('Escola Machado')
    expect(md).toContain('Nível 4/5')
    expect(md).toContain('Turma B tem aula às terças e quintas')
  })

  it('deve gerar o bloco de prompt contextual consolidado', () => {
    const prompt = buildCuratedSystemPromptContext()
    expect(prompt).toContain('=== MEMÓRIA CURADA DO PROFESSOR')
    expect(prompt).toContain('MEMORY.md')
  })
})
