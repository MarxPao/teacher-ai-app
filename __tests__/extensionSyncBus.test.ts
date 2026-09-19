import { describe, it, expect, beforeEach, vi } from 'vitest'
import { extensionSyncBus, PortalRosterSyncPayload, PortalPendenciesSyncPayload } from '../lib/extensionSyncBus'
import { getStudents, setStudents, getClasses, setClasses, safeSet, KEYS } from '../lib/localDB'
import { loadChecklistTodos, saveChecklistTodos } from '../lib/checklistManager'
import { getStudentMemory } from '../lib/studentMemory'

describe('ExtensionSyncBus — Livre Intercâmbio Extensão ↔ App', () => {
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
      location: { origin: 'http://localhost:3000' }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('1. Reconcilia roster do portal e cadastra alunos e turmas com autoridade em 4 vias', () => {
    // Estado inicial: 1 aluno local
    setStudents([
      { id: 'stu_1', name: 'Lucas Silva', className: '8º Ano B', rollNumber: '101' }
    ])

    const payload: PortalRosterSyncPayload = {
      className: '8º Ano B',
      portalName: 'Machado Sobrinho',
      students: [
        { name: 'Lucas Silva', rollNumber: '101', matricula: '101' }, // Match exato
        { name: 'Mariana Costa Pereira', rollNumber: '102', matricula: '102' } // Novo aluno do portal
      ]
    }

    const result = extensionSyncBus.handlePortalRosterSync(payload)

    expect(result.success).toBe(true)
    expect(result.merged).toBe(1)
    expect(result.added).toBe(1)

    // Confere se turma foi registrada
    const classes = getClasses<any[]>()
    expect(classes.some(c => c.name === '8º Ano B')).toBe(true)

    // Confere se alunos estão em teacher_students
    const students = getStudents<any[]>()
    expect(students.length).toBe(2)
    const lucas = students.find(s => s.name === 'Lucas Silva')
    const mariana = students.find(s => s.name === 'Mariana Costa Pereira')
    expect(lucas.sync_status).toBe('synced')
    expect(mariana.source_type).toBe('portal_scrape')
  })

  it('2. Converte pendências do portal em ChecklistTodo com tópicos pedagógicos e idempotência', () => {
    const payload: PortalPendenciesSyncPayload = {
      portalName: 'Machado Sobrinho',
      className: '9º Ano A',
      pendencies: [
        { id: 'pend_1', title: 'Lançar notas da P1 - 9º Ano A', actionType: 'notas', url: 'https://portal/notas' },
        { id: 'pend_2', title: 'Preencher diário de 18/09 - 9º Ano A', actionType: 'diario', url: 'https://portal/diario' }
      ]
    }

    // Primeira sincronia
    extensionSyncBus.handlePortalPendenciesSync(payload)
    let todos = loadChecklistTodos()
    expect(todos.length).toBe(2)
    expect(todos[0].category).toBe('imported')
    expect(todos[0].source).toBe('portal')
    expect(todos[0].topic).toBe('Pendências do Portal')
    expect(todos[0].subtopic).toBe('9º Ano A')
    expect(todos[0].tag).toBe('Machado Sobrinho')

    // Segunda sincronia idempotente: não duplica
    extensionSyncBus.handlePortalPendenciesSync(payload)
    todos = loadChecklistTodos()
    expect(todos.length).toBe(2)
  })

  it('3. Marca tarefa como concluída no Checklist e gera observação após ação no portal', () => {
    saveChecklistTodos([
      {
        id: 'todo_diario_8b',
        text: 'Preencher diário de 18/09 - 8º Ano B',
        done: false,
        category: 'imported',
        subtopic: '8º Ano B'
      }
    ])
    setStudents([
      { id: 'stu_gabriel', name: 'Gabriel Santos', className: '8º Ano B' }
    ])

    extensionSyncBus.handlePortalActionExecuted({
      action: 'salvar_diario',
      className: '8º Ano B',
      studentName: 'Gabriel Santos',
      date: '2026-09-18'
    })

    const todos = loadChecklistTodos()
    const task = todos.find(t => t.id === 'todo_diario_8b')
    expect(task?.done).toBe(true)
    expect(task?.completedAt).toBeDefined()

    // Confere registro em studentMemory
    const mem = getStudentMemory('stu_gabriel')
    expect(mem).toBeDefined()
    expect(mem?.observations.some(o => o.note.includes('salvar_diario'))).toBe(true)
  })

  it('4. Responde ao Side Panel com tarefas filtradas da turma ativa', () => {
    saveChecklistTodos([
      { id: 't1', text: 'Entregar redação', done: false, subtopic: '8º Ano B' },
      { id: 't2', text: 'Prova de recuperação', done: false, subtopic: '9º Ano A' }
    ])

    const broadcastSpy = vi.spyOn(extensionSyncBus, 'broadcast')
    extensionSyncBus.handleRequestActiveTodos({ className: '8º Ano B' })

    expect(broadcastSpy).toHaveBeenCalledWith(
      'ACTIVE_CLASS_TODOS_RESPONSE',
      expect.objectContaining({
        className: '8º Ano B',
        todos: expect.arrayContaining([expect.objectContaining({ id: 't1' })])
      })
    )
  })
})
