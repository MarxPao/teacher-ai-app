import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  parseTodoHierarchy,
  groupTodosByHierarchy,
  loadChecklistTodos,
  saveChecklistTodos,
  ChecklistTodo,
} from '../lib/checklistManager'

describe('Checklist Hierarchy & Multi-Tier Grouping', () => {
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

  describe('parseTodoHierarchy', () => {
    it('mantém topic e subtopic explícitos quando já definidos', () => {
      const todo: Partial<ChecklistTodo> = {
        text: 'Lançar notas',
        topic: 'Colégio Santa Catarina',
        subtopic: '9º Ano A',
        tag: 'Ignorado',
      }
      const res = parseTodoHierarchy(todo)
      expect(res.topic).toBe('Colégio Santa Catarina')
      expect(res.subtopic).toBe('9º Ano A')
    })

    it('extrai topic e subtopic de tag legada com separador de barra "/"', () => {
      const todo: Partial<ChecklistTodo> = {
        text: 'Reunião de Pais',
        tag: 'Escola Modelo / 3º Ano',
      }
      const res = parseTodoHierarchy(todo)
      expect(res.topic).toBe('Escola Modelo')
      expect(res.subtopic).toBe('3º Ano')
    })

    it('extrai topic e subtopic de tag legada com separador de dois pontos ":"', () => {
      const todo: Partial<ChecklistTodo> = {
        text: 'Preparar Laboratório',
        tag: 'Física : Mecânica Quântica',
      }
      const res = parseTodoHierarchy(todo)
      expect(res.topic).toBe('Física')
      expect(res.subtopic).toBe('Mecânica Quântica')
    })

    it('extrai topic com subtopic "Tarefas Gerais" para tag única sem separador', () => {
      const todo: Partial<ChecklistTodo> = {
        text: 'Comprar materiais',
        tag: 'Administrativo',
      }
      const res = parseTodoHierarchy(todo)
      expect(res.topic).toBe('Administrativo')
      expect(res.subtopic).toBe('Tarefas Gerais')
    })

    it('aplica "Rotina Diária" / "Tarefas Gerais" para tarefas recorrentes sem tag', () => {
      const todo: Partial<ChecklistTodo> = {
        text: 'Chamada diária',
        category: 'recurrent',
      }
      const res = parseTodoHierarchy(todo)
      expect(res.topic).toBe('Rotina Diária')
      expect(res.subtopic).toBe('Tarefas Gerais')
    })

    it('aplica "Geral" / "Tarefas Gerais" para tarefas pontuais sem tag', () => {
      const todo: Partial<ChecklistTodo> = {
        text: 'Anotação rápida',
        category: 'one_off',
      }
      const res = parseTodoHierarchy(todo)
      expect(res.topic).toBe('Geral')
      expect(res.subtopic).toBe('Tarefas Gerais')
    })
  })

  describe('groupTodosByHierarchy', () => {
    it('agrupa tarefas hierarquicamente por Tópico -> Subtópico', () => {
      const todos: ChecklistTodo[] = [
        {
          id: 't1',
          text: 'Prova bimestral',
          done: false,
          topic: 'Matemática',
          subtopic: '8º Ano',
        },
        {
          id: 't2',
          text: 'Exercícios complementares',
          done: true,
          topic: 'Matemática',
          subtopic: '8º Ano',
        },
        {
          id: 't3',
          text: 'Recuperação',
          done: false,
          topic: 'Matemática',
          subtopic: '9º Ano',
        },
        {
          id: 't4',
          text: 'Reunião pedagógica',
          done: false,
          tag: 'Coordenação / Geral',
        },
      ]

      const grouped = groupTodosByHierarchy(todos)

      expect(Object.keys(grouped)).toContain('Matemática')
      expect(Object.keys(grouped)).toContain('Coordenação')

      // Verificação em Matemática
      expect(Object.keys(grouped['Matemática'])).toEqual(['8º Ano', '9º Ano'])
      expect(grouped['Matemática']['8º Ano'].length).toBe(2)
      expect(grouped['Matemática']['9º Ano'].length).toBe(1)

      // Verificação em Coordenação
      expect(Object.keys(grouped['Coordenação'])).toEqual(['Geral'])
      expect(grouped['Coordenação']['Geral'].length).toBe(1)
      expect(grouped['Coordenação']['Geral'][0].id).toBe('t4')
    })
  })

  describe('loadChecklistTodos com retrocompatibilidade hierárquica', () => {
    it('carrega dados legados do localStorage e popula topic e subtopic sem perda', () => {
      const legacyRaw = [
        {
          id: 'leg_1',
          text: 'Correção de redações',
          done: false,
          tag: 'Português / Redação ENEM',
        },
        {
          id: 'leg_2',
          text: 'Café com professores',
          done: false,
          tag: 'Social',
        },
      ]
      mockStorage['teacher_dashboard_todos'] = JSON.stringify(legacyRaw)

      const loaded = loadChecklistTodos()

      expect(loaded.length).toBe(2)
      expect(loaded[0].topic).toBe('Português')
      expect(loaded[0].subtopic).toBe('Redação ENEM')
      expect(loaded[1].topic).toBe('Social')
      expect(loaded[1].subtopic).toBe('Tarefas Gerais')
    })
  })
})
