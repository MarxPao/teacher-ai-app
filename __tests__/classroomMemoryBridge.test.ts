import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { bridgeClassroomHighlightToMemory } from '@/lib/classroomMemoryBridge'
import { getTeacherMemoryFacts } from '@/lib/longTermMemory'

describe('Classroom Memory Bridge — Integração com Memory Engine e Human-in-the-Loop', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} },
    })
    vi.stubGlobal('window', {
      dispatchEvent: () => true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GATILHO HUMAN-IN-THE-LOOP: rejeita escrita e não altera memórias se userApproved for false', async () => {
    const candidate = {
      sessionId: 'session_100',
      highlightId: 'hl_1',
      pedagogicalInsight: 'Turma hesitou na diferença entre Since e For.',
      schoolId: 'Machado Sobrinho'
    }

    const res = await bridgeClassroomHighlightToMemory(candidate, 'teacher_1', false)

    expect(res.ok).toBe(false)
    expect(res.actionTaken).toBe('SKIPPED_UNAPPROVED')
    expect(res.message).toContain('aprovação explícita do professor é obrigatória')

    // Verifica que nenhuma memória foi gravada
    const facts = getTeacherMemoryFacts()
    expect(facts.length).toBe(0)
  })

  it('consolida insight de turma como class_insight com taskBinding lesson_planner quando aprovado', async () => {
    const candidate = {
      sessionId: 'session_100',
      highlightId: 'hl_1',
      pedagogicalInsight: 'Turma do 9B necessita de reforço em conectivos temporais.',
      schoolId: 'Machado Sobrinho',
      operationalContext: 'planning' as const
    }

    const res = await bridgeClassroomHighlightToMemory(candidate, 'teacher_1', true)

    expect(res.ok).toBe(true)
    expect(res.actionTaken).toBe('ADD')

    const facts = getTeacherMemoryFacts()
    expect(facts.length).toBe(1)
    expect(facts[0].category).toBe('class_insight')
    expect(facts[0].sourceType).toBe('inferred')
    expect(facts[0].sourceRef).toBe('class_session:session_100#highlight:hl_1')
    expect(facts[0].taskBinding).toBe('lesson_planner')
  })

  it('consolida fato de aluno como student_fact com taskBinding omnigrader para contexto avaliativo', async () => {
    const candidate = {
      sessionId: 'session_100',
      highlightId: 'hl_2',
      pedagogicalInsight: 'Pedro demonstrou domínio completo de irregular verbs ao responder prontamente.',
      schoolId: 'Machado Sobrinho',
      targetStudentId: 'st_pedro_123',
      targetStudentName: 'Pedro Henrique',
      operationalContext: 'assessment' as const
    }

    const res = await bridgeClassroomHighlightToMemory(candidate, 'teacher_1', true)

    expect(res.ok).toBe(true)
    expect(res.actionTaken).toBe('ADD')

    const facts = getTeacherMemoryFacts()
    expect(facts.length).toBe(1)
    expect(facts[0].category).toBe('student_fact')
    expect(facts[0].studentId).toBe('st_pedro_123')
    expect(facts[0].studentName).toBe('Pedro Henrique')
    expect(facts[0].taskBinding).toBe('omnigrader')
    expect(facts[0].sourceType).toBe('inferred')
  })
})
