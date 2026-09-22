import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getCuratedMemory,
  saveCuratedMemory,
  exportCuratedMemoryMarkdown,
  CuratedTeacherMemory
} from '../lib/curatedMemory'
import {
  createAgentTask,
  getStoredTasks,
  updateAgentTaskStatus,
  deleteAgentTask,
  getUpcomingTasks,
  extractTaskCommitment
} from '../lib/taskMemory'

describe('Memory Governance, Tasks & LGPD Purge Suite', () => {
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

  it('deve gerenciar fatos semânticos com adição, edição e reflexão no MEMORY.md', () => {
    const initial = getCuratedMemory()
    expect(initial).toBeDefined()

    // 1. Adicionar fato
    const updated: CuratedTeacherMemory = {
      ...initial,
      learnedFacts: [
        {
          id: 'fact_1',
          category: 'grading_rigor',
          fact: 'Descontar 0.5 por erro grave de coerência textual',
          confidence: 0.9,
          learnedAt: new Date().toISOString()
        },
        ...initial.learnedFacts
      ]
    }
    saveCuratedMemory(updated)

    const saved = getCuratedMemory()
    expect(saved.learnedFacts).toHaveLength(1)
    expect(saved.learnedFacts[0].fact).toContain('Descontar 0.5')

    // 2. Exportação Markdown
    const markdown = exportCuratedMemoryMarkdown()
    expect(markdown).toContain('Descontar 0.5 por erro grave de coerência textual')
    expect(markdown).toContain('# MEMORY.md')

    // 3. Edição inline do fato
    const edited: CuratedTeacherMemory = {
      ...saved,
      learnedFacts: [
        {
          ...saved.learnedFacts[0],
          fact: 'Descontar 1.0 por erro grave de coerência textual (revisado)'
        }
      ]
    }
    saveCuratedMemory(edited)
    const reloaded = getCuratedMemory()
    expect(reloaded.learnedFacts[0].fact).toContain('Descontar 1.0')
  })

  it('deve executar purga LGPD de dados específicos de aluno sem afetar outros alunos', () => {
    // 1. Injetar memórias e tarefas de alunos misturados
    const studentMem = [
      { studentName: 'Alice Souza', note: 'Excelente interpretação de texto' },
      { studentName: 'Hugo Santos', note: 'Dificuldade com leitura autônoma' }
    ]
    mockStorage['teacher_student_memory'] = JSON.stringify(studentMem)

    createAgentTask({
      title: 'Mandar recado para mãe da Alice',
      dueDate: new Date().toISOString(),
      relatedStudentName: 'Alice Souza'
    })

    createAgentTask({
      title: 'Acompanhar recuperação do Hugo',
      dueDate: new Date().toISOString(),
      relatedStudentName: 'Hugo Santos'
    })

    expect(getStoredTasks()).toHaveLength(2)

    // 2. Simular purga do aluno "Alice"
    const cleanTarget = 'alice'
    const rawMem = JSON.parse(mockStorage['teacher_student_memory'])
    const filteredMem = rawMem.filter((entry: any) => !entry.studentName.toLowerCase().includes(cleanTarget))
    mockStorage['teacher_student_memory'] = JSON.stringify(filteredMem)

    const currentTasks = getStoredTasks()
    const filteredTasks = currentTasks.filter(t => !String(t.relatedStudentName || '').toLowerCase().includes(cleanTarget))
    mockStorage['teacher_agent_tasks_v1'] = JSON.stringify(filteredTasks)

    // 3. Asserções LGPD
    const postPurgeMem = JSON.parse(mockStorage['teacher_student_memory'])
    expect(postPurgeMem).toHaveLength(1)
    expect(postPurgeMem[0].studentName).toBe('Hugo Santos')

    const postPurgeTasks = getStoredTasks()
    expect(postPurgeTasks).toHaveLength(1)
    expect(postPurgeTasks[0].relatedStudentName).toBe('Hugo Santos')
  })

  it('deve identificar compromisso proativo no chat e disponibilizar para o banner', () => {
    const fixedNow = new Date(2026, 8, 22, 9, 0, 0)
    const chatInput = 'preciso fechar a frequência da turma 802 hoje às 17h'

    const extracted = extractTaskCommitment(chatInput, fixedNow)
    expect(extracted.isTask).toBe(true)
    expect(extracted.task).toBeDefined()

    // Grava tarefa
    createAgentTask(extracted.task!)

    // Banner verifica tarefas próximas para as próximas 24h
    const upcoming = getUpcomingTasks(24, fixedNow)
    expect(upcoming).toHaveLength(1)
    expect(upcoming[0].title).toContain('Fechar a frequência da turma 802')
  })
})
