import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  loadChecklistTodos,
  saveChecklistTodos,
  getCompletedSystemTodoIds,
  saveCompletedSystemTodoIds,
  loadChecklistHistory,
  recordChecklistHistory,
  clearChecklistHistory,
  deleteChecklistHistoryItem,
  toggleSystemAiTodo,
  toggleRegularTodo,
  toggleTodoSubtask,
  updateTodoTag,
  exportChecklistHistoryCSV,
  getTodayKey,
  isDateInPeriod,
  formatRecurrenceText,
  ChecklistTodo,
} from '../lib/checklistManager'

describe('Checklist & History Manager', () => {
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

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('tarefas pendentes (done: false) duram indefinidamente na lista ativa', () => {
    const oldCreated = Date.now() - 60 * 86400000 // criada há 60 dias
    const todos: ChecklistTodo[] = [
      { id: 'todo_pending', text: 'Tarefa não concluída antiga', done: false, category: 'one_off', createdAt: oldCreated },
    ]

    saveChecklistTodos(todos)
    const loaded = loadChecklistTodos()

    expect(loaded.length).toBe(1)
    expect(loaded[0].id).toBe('todo_pending')
    expect(loaded[0].done).toBe(false)
  })

  it('tarefas concluídas duram 24 horas na lista ativa e depois expiram automaticamente', () => {
    const now = Date.now()
    const recentCompletedTime = new Date(now - 2 * 3600000).toISOString() // 2h atrás (< 24h)
    const expiredCompletedTime = new Date(now - 26 * 3600000).toISOString() // 26h atrás (> 24h)

    const todos: ChecklistTodo[] = [
      { id: 'todo_recent_done', text: 'Concluída há 2h', done: true, category: 'one_off', completedAt: recentCompletedTime },
      { id: 'todo_expired_done', text: 'Concluída há 26h', done: true, category: 'one_off', completedAt: expiredCompletedTime },
      { id: 'todo_still_pending', text: 'Pendente', done: false, category: 'one_off' },
    ]

    saveChecklistTodos(todos)
    const loaded = loadChecklistTodos()

    // Deve manter a concluída recente (2h) e a pendente, descartando a concluída há mais de 24h
    expect(loaded.length).toBe(2)
    expect(loaded.some(t => t.id === 'todo_recent_done')).toBe(true)
    expect(loaded.some(t => t.id === 'todo_still_pending')).toBe(true)
    expect(loaded.some(t => t.id === 'todo_expired_done')).toBe(false)
  })

  it('classifica períodos corretamente: dia, semana, mes, trimestre e ano', () => {
    const now = new Date()
    const todayStr = now.toISOString()
    const threeDaysAgoStr = new Date(now.getTime() - 3 * 86400000).toISOString()
    const twentyDaysAgoStr = new Date(now.getTime() - 20 * 86400000).toISOString()
    const sixtyDaysAgoStr = new Date(now.getTime() - 60 * 86400000).toISOString()
    const twoHundredDaysAgoStr = new Date(now.getTime() - 200 * 86400000).toISOString()
    const fiveHundredDaysAgoStr = new Date(now.getTime() - 500 * 86400000).toISOString()

    // Dia (Hoje)
    expect(isDateInPeriod(todayStr, 'dia', now)).toBe(true)
    expect(isDateInPeriod(threeDaysAgoStr, 'dia', now)).toBe(false)

    // Semana (7 dias)
    expect(isDateInPeriod(threeDaysAgoStr, 'semana', now)).toBe(true)
    expect(isDateInPeriod(twentyDaysAgoStr, 'semana', now)).toBe(false)

    // Mês (30 dias)
    expect(isDateInPeriod(twentyDaysAgoStr, 'mes', now)).toBe(true)
    expect(isDateInPeriod(sixtyDaysAgoStr, 'mes', now)).toBe(false)

    // Trimestre (90 dias)
    expect(isDateInPeriod(sixtyDaysAgoStr, 'trimestre', now)).toBe(true)
    expect(isDateInPeriod(twoHundredDaysAgoStr, 'trimestre', now)).toBe(false)

    // Ano (365 dias)
    expect(isDateInPeriod(twoHundredDaysAgoStr, 'ano', now)).toBe(true)
    expect(isDateInPeriod(fiveHundredDaysAgoStr, 'ano', now)).toBe(false)

    // Aceita data de referência em formato string sem quebrar
    expect(isDateInPeriod(todayStr, 'dia', '2026-08-30')).toBeDefined()
    expect(isDateInPeriod(todayStr, 'semana', '2026-08-30')).toBeDefined()
  })

  it('permite alternar estado de pendências da IA sem navegação e registra no histórico', () => {
    const today = getTodayKey()
    const sysId = 'sys_plan_cls_123'

    const isNowDone = toggleSystemAiTodo(sysId, { text: 'Aula 8º Ano sem plano', tag: 'Plano de Aula' }, today)
    expect(isNowDone).toBe(true)

    const completed = getCompletedSystemTodoIds(today)
    expect(completed).toContain(sysId)

    const history = loadChecklistHistory()
    expect(history.length).toBe(1)
    expect(history[0].todoId).toBe(sysId)
    expect(history[0].category).toBe('system_ai')
  })

  it('exporta histórico de tarefas para formato CSV legível', () => {
    recordChecklistHistory({
      todoId: 'rec_1',
      text: 'Conferir frequência da turma',
      category: 'recurrent',
      tag: 'Chamada',
    })

    const history = loadChecklistHistory()
    const csv = exportChecklistHistoryCSV(history)

    expect(csv).toContain('Data / Hora')
    expect(csv).toContain('Conferir frequência da turma')
    expect(csv).toContain('Rotina Diária')
  })

  it('formata adequadamente todas as regras de recorrência', () => {
    // 1. Pontual
    expect(formatRecurrenceText(null)).toBe('Pontual')
    expect(formatRecurrenceText({ type: 'none' })).toBe('Pontual')

    // 2. Diária
    expect(formatRecurrenceText({ type: 'daily' })).toBe('Diária (Todo dia)')

    // 3. Dias Úteis
    expect(formatRecurrenceText({ type: 'weekdays' })).toBe('Dias Úteis (Seg a Sex)')

    // 4. Dia Específico (ex: Toda Terça-feira)
    expect(formatRecurrenceText({ type: 'specific_day', daysOfWeek: [2] })).toBe('Toda Terça-feira')
    expect(formatRecurrenceText({ type: 'specific_day', daysOfWeek: [4] })).toBe('Toda Quinta-feira')

    // 5. Dias Personalizados (ex: Seg, Qua, Sex)
    expect(formatRecurrenceText({ type: 'custom_days', daysOfWeek: [1, 3, 5] })).toBe('Personalizado: Seg, Qua, Sex')

    // 6. Mensal
    expect(formatRecurrenceText({ type: 'monthly', dayOfMonth: 15 })).toBe('Mensal (Todo dia 15)')
  })

  it('salva e recupera tarefas com regras de recorrência personalizadas', () => {
    const todoWithRecurrence: ChecklistTodo = {
      id: 'rec_terca_1',
      text: 'Enviar relatório pedagógico',
      done: false,
      category: 'recurrent',
      priority: 'high',
      tag: 'Coordenação',
      recurrence: {
        type: 'specific_day',
        daysOfWeek: [2], // Terça-feira
      },
    }

    saveChecklistTodos([todoWithRecurrence])
    const loaded = loadChecklistTodos()

    expect(loaded.length).toBe(1)
    expect(loaded[0].text).toBe('Enviar relatório pedagógico')
    expect(loaded[0].recurrence?.type).toBe('specific_day')
    expect(loaded[0].recurrence?.daysOfWeek).toEqual([2])
    expect(formatRecurrenceText(loaded[0].recurrence)).toBe('Toda Terça-feira')
  })

  it('alterna o estado de subtarefas individuais de um cartão', () => {
    const todoWithSubtasks: ChecklistTodo = {
      id: 'todo_trello_1',
      text: 'English Week',
      done: false,
      tag: 'Machado Sobrinho',
      subtasks: [
        { id: 'st_1', text: 'Marcar reunião', done: false },
        { id: 'st_2', text: 'Comprar materiais', done: false }
      ]
    }

    saveChecklistTodos([todoWithSubtasks])
    const updated = toggleTodoSubtask('todo_trello_1', 'st_1')

    expect(updated[0].subtasks?.[0].done).toBe(true)
    expect(updated[0].subtasks?.[1].done).toBe(false)
    expect(updated[0].done).toBe(false)

    // Se marcar a segunda subtarefa, todo o cartão é marcado como done
    const allDone = toggleTodoSubtask('todo_trello_1', 'st_2', updated)
    expect(allDone[0].subtasks?.[1].done).toBe(true)
    expect(allDone[0].done).toBe(true)
  })

  it('atualiza o tópico/tag para mover cartões entre colunas no Kanban', () => {
    const todo: ChecklistTodo = {
      id: 'todo_mov',
      text: 'Preparar Prova 3º Bimestre',
      done: false,
      tag: 'Santa Catarina'
    }

    saveChecklistTodos([todo])
    const updated = updateTodoTag('todo_mov', 'Machado Sobrinho')

    expect(updated[0].tag).toBe('Machado Sobrinho')
  })
})
