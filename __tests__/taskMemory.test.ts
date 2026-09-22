import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getStoredTasks,
  saveStoredTasks,
  createAgentTask,
  updateAgentTaskStatus,
  editAgentTask,
  deleteAgentTask,
  getUpcomingTasks,
  extractTaskCommitment,
  AgentTask
} from '../lib/taskMemory'

describe('taskMemory — Gerenciador de Tarefas e Compromissos Temporais', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => { mockStorage[key] = val },
      removeItem: (key: string) => { delete mockStorage[key] },
      clear: () => { mockStorage = {} },
      length: 0,
      key: () => null
    })
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn()
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('deve criar uma tarefa e recuperá-la com campos gerados automaticamente', () => {
    const task = createAgentTask({
      title: 'Lançar notas do 9º ano A',
      dueDate: new Date('2026-09-25T18:00:00.000Z').toISOString(),
      priority: 'alta'
    })

    expect(task.id).toMatch(/^task_\d+/)
    expect(task.title).toBe('Lançar notas do 9º ano A')
    expect(task.priority).toBe('alta')
    expect(task.status).toBe('pendente')
    expect(task.createdAt).toBeDefined()

    const all = getStoredTasks()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe(task.id)
  })

  it('deve atualizar o status de uma tarefa e registrar completedAt ao concluir', () => {
    const task = createAgentTask({
      title: 'Mandar recado para a mãe do Pedro',
      dueDate: new Date().toISOString()
    })

    const updated = updateAgentTaskStatus(task.id, 'concluida')
    expect(updated).not.toBeNull()
    expect(updated?.status).toBe('concluida')
    expect(updated?.completedAt).toBeDefined()

    const all = getStoredTasks()
    expect(all[0].status).toBe('concluida')
  })

  it('deve editar campos parciais de uma tarefa existente', () => {
    const task = createAgentTask({
      title: 'Reunião de Pais',
      dueDate: new Date().toISOString(),
      priority: 'media'
    })

    const edited = editAgentTask(task.id, {
      title: 'Reunião de Pais e Mestres (Auditório)',
      priority: 'alta'
    })

    expect(edited?.title).toBe('Reunião de Pais e Mestres (Auditório)')
    expect(edited?.priority).toBe('alta')
  })

  it('deve remover tarefa permanentemente', () => {
    const task = createAgentTask({
      title: 'Tarefa a ser deletada',
      dueDate: new Date().toISOString()
    })

    const deleted = deleteAgentTask(task.id)
    expect(deleted).toBe(true)
    expect(getStoredTasks()).toHaveLength(0)
  })

  it('deve filtrar tarefas próximas (upcoming) respeitando o prazo em horas', () => {
    const baseDate = new Date('2026-09-22T10:00:00.000Z')

    // Tarefa 1: em 12 horas (dentro da janela de 24h)
    createAgentTask({
      title: 'Urgente hoje à noite',
      dueDate: new Date('2026-09-22T22:00:00.000Z').toISOString()
    })

    // Tarefa 2: em 30 horas (fora da janela de 24h, dentro de 48h)
    createAgentTask({
      title: 'Amanhã à tarde',
      dueDate: new Date('2026-09-23T16:00:00.000Z').toISOString()
    })

    // Tarefa 3: já concluída (deve ser ignorada)
    const task3 = createAgentTask({
      title: 'Já resolvida',
      dueDate: new Date('2026-09-22T11:00:00.000Z').toISOString()
    })
    updateAgentTaskStatus(task3.id, 'concluida')

    const upcoming24h = getUpcomingTasks(24, baseDate)
    expect(upcoming24h).toHaveLength(1)
    expect(upcoming24h[0].title).toBe('Urgente hoje à noite')

    const upcoming48h = getUpcomingTasks(48, baseDate)
    expect(upcoming48h).toHaveLength(2)
  })

  describe('extractTaskCommitment — Heurísticas NLU em Português', () => {
    const fixedNow = new Date(2026, 8, 22, 10, 0, 0) // Terça-feira, 22 de Setembro de 2026

    it('deve extrair compromisso com "amanhã às 15h"', () => {
      const result = extractTaskCommitment('preciso lançar a chamada do 3º ano amanhã às 15h', fixedNow)
      expect(result.isTask).toBe(true)
      expect(result.task).toBeDefined()
      expect(result.task?.title).toContain('Lançar a chamada do 3º ano')
      
      const due = new Date(result.task!.dueDate)
      expect(due.getDate()).toBe(23) // 22 + 1
      expect(due.getHours()).toBe(15)
      expect(due.getMinutes()).toBe(0)
    })

    it('deve extrair compromisso para "sexta" com horário padrão e prioridade alta se urgente', () => {
      const result = extractTaskCommitment('lembre-me de fechar as notas da recuperação na sexta urgente', fixedNow)
      expect(result.isTask).toBe(true)
      expect(result.task?.priority).toBe('alta')
      expect(result.task?.title).toContain('Fechar as notas da recuperação')

      const due = new Date(result.task!.dueDate)
      expect(due.getDay()).toBe(5) // Sexta-feira
      expect(due.getHours()).toBe(18) // Default 18h
    })

    it('deve extrair compromisso com data específica "dia 25"', () => {
      const result = extractTaskCommitment('lembrete: cobrar a autorização do passeio no dia 25', fixedNow)
      expect(result.isTask).toBe(true)
      const due = new Date(result.task!.dueDate)
      expect(due.getDate()).toBe(25)
    })

    it('deve ignorar mensagens casuais que não contêm gatilhos temporais', () => {
      expect(extractTaskCommitment('Olá Rafinha, tudo bem?').isTask).toBe(false)
      expect(extractTaskCommitment('Como faço para calcular a média ponderada?').isTask).toBe(false)
      expect(extractTaskCommitment('Muito obrigado pela ajuda!').isTask).toBe(false)
    })
  })
})
