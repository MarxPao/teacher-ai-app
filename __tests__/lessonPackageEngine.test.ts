import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  buildPackageQuestionsPrompt,
  buildPackageParentCommsPrompt,
  saveLessonPackage,
  getLessonPackage,
  getActiveLessonPackage,
  getAllLessonPackages,
  LessonPackage
} from '../lib/lessonPackageEngine'

describe('LessonPackageEngine — Pacote de Aula em 1 Clique', () => {
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
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  it('1. buildPackageQuestionsPrompt extrai o contexto real do plano (não genérico)', () => {
    const prompt = buildPackageQuestionsPrompt({
      topic: 'Present Perfect and life experiences',
      className: '8º Ano A',
      gradeYear: '8º Fund.',
      assessmentEvidence: 'Mystery Partner Mingle com Have you ever...',
      activeProfileName: 'Língua Inglesa',
      stages: [
        { name: 'Hook', teacherAction: 'Mostra 3 experiências pessoais', studentAction: 'Adivinham a mentira', targetBnccCode: 'EF08LI02' },
        { name: 'Equip', teacherAction: 'Apresenta verbos no particípio', studentAction: 'Completam drills', targetBnccCode: 'EF08LI19' }
      ]
    })

    expect(prompt).toContain('Present Perfect and life experiences')
    expect(prompt).toContain('Mystery Partner Mingle com Have you ever...')
    expect(prompt).toContain('8º Ano A')
    expect(prompt).toContain('5 QUESTÕES RÁPIDAS')
    expect(prompt).toContain('Mostra 3 experiências pessoais')
    expect(prompt).toContain('Completam drills')
  })

  it('2. buildPackageParentCommsPrompt redige comunicado carinhoso ancorado nas evidências', () => {
    const prompt = buildPackageParentCommsPrompt({
      topic: 'Present Perfect and life experiences',
      className: '8º Ano A',
      gradeYear: '8º Fund.',
      assessmentEvidence: 'Alunos conseguiram entrevistar colegas em inglês usando Have you ever',
      homework: 'Escrever 3 frases sobre viagens no caderno',
      tone: 'acolhedor',
      activeProfileName: 'Língua Inglesa'
    })

    expect(prompt).toContain('Present Perfect and life experiences')
    expect(prompt).toContain('8º Ano A')
    expect(prompt).toContain('COMUNICADO AOS PAIS E FAMILIARES')
    expect(prompt).toContain('acolhedor')
    expect(prompt).toContain('Escrever 3 frases sobre viagens no caderno')
    expect(prompt).toContain('Alunos conseguiram entrevistar colegas em inglês usando Have you ever')
  })

  it('3. saveLessonPackage persiste o pacote completo e sincroniza os 3 módulos', () => {
    const pkg: LessonPackage = {
      id: 'pkg_12345',
      createdAt: '2026-09-19T20:00:00.000Z',
      topic: 'Present Perfect and life experiences',
      className: '8º Ano A',
      gradeYear: '8º Fund.',
      methodologyId: 'ubd_backward',
      methodologyName: 'Backward Design / UbD',
      plan: {
        topic: 'Present Perfect and life experiences',
        durationMinutes: 50,
        guidingQuestions: ['How do we share experiences?'],
        assessmentEvidence: 'Mystery Partner interview rubric',
        stages: [
          { name: 'Hook', durationMin: 8, teacherAction: 'Prompt', studentAction: 'Reaction', targetBnccCode: 'EF08LI02' }
        ],
        homework: 'Caderno 3 frases'
      },
      worksheet: {
        title: '5 Questões: Present Perfect',
        targetLevel: '8º Fund.',
        summary: 'Avaliação formativa rápida',
        questions: [
          { id: 'q1', number: 1, stem: 'Have you ever ___ to London?', options: ['A) be', 'B) been', 'C) was', 'D) went'], answerKey: 'B', difficulty: 'Fácil' }
        ]
      },
      parentCommunication: {
        title: 'Comunicado aos Pais — Present Perfect',
        studentOrClassRef: '8º Ano A',
        draftMessage: 'Queridas famílias! Hoje aprendemos a falar sobre experiências com o Present Perfect!',
        tone: 'acolhedor',
        status: 'draft',
        safeNotice: 'Aguardando revisão manual',
        generatedAt: Date.now()
      }
    }

    saveLessonPackage(pkg)

    // 1. Pacote persistido individualmente
    const loaded = getLessonPackage('pkg_12345')
    expect(loaded).toBeTruthy()
    expect(loaded?.topic).toBe('Present Perfect and life experiences')
    expect(loaded?.worksheet.questions.length).toBe(1)

    // 2. Índice central
    const all = getAllLessonPackages()
    expect(all.length).toBe(1)
    expect(all[0].id).toBe('pkg_12345')

    // 3. Pacote ativo
    const active = getActiveLessonPackage()
    expect(active?.id).toBe('pkg_12345')

    // 4. Ponte com QuickGenerate / TestAndWorksheets
    const quickPrefill = JSON.parse(mockStorage['teacher_quick_prefill'])
    expect(quickPrefill.packageId).toBe('pkg_12345')
    expect(quickPrefill.topic).toBe('Present Perfect and life experiences')
    expect(quickPrefill.questions.length).toBe(1)

    // 5. Ponte com ParentCommunicator — REQUISITO DE SEGURANÇA NÃO NEGOCIÁVEL
    const parentPrefill = JSON.parse(mockStorage['teacher_parent_comms_prefill'])
    expect(parentPrefill.packageId).toBe('pkg_12345')
    expect(parentPrefill.status).toBe('draft')
    expect(parentPrefill.draftMessage).toContain('Queridas famílias!')

    // 6. Confirmação de disparo de eventos para os outros módulos
    expect(window.dispatchEvent).toHaveBeenCalled()
  })

  it('4. Requisito de Segurança: o comunicado aos pais NUNCA assume status de enviado automaticamente', () => {
    const pkg: LessonPackage = {
      id: 'pkg_safety_check',
      createdAt: new Date().toISOString(),
      topic: 'Simple Past',
      className: '7º Ano B',
      gradeYear: '7º Fund.',
      methodologyId: 'ppp',
      methodologyName: 'PPP',
      plan: { topic: 'Simple Past', durationMinutes: 50, guidingQuestions: [], assessmentEvidence: 'Quiz', stages: [] },
      worksheet: { title: 'Exs', targetLevel: '7º', summary: '', questions: [] },
      parentCommunication: {
        title: 'Aviso',
        studentOrClassRef: '7º Ano B',
        draftMessage: 'Aviso aos pais',
        tone: 'formal',
        status: 'draft',
        safeNotice: 'Rascunho seguro para aprovação manual',
        generatedAt: Date.now()
      }
    }

    saveLessonPackage(pkg)

    const saved = getLessonPackage('pkg_safety_check')
    expect(saved?.parentCommunication.status).toBe('draft')
    expect(saved?.parentCommunication.status).not.toBe('sent')
  })
})
