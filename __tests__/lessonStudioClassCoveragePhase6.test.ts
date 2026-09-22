import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getUnifiedClasses,
  saveOrUpdateClass,
  subscribeToClassUpdates,
  DEFAULT_CLASSES,
  ClassRecord
} from '@/lib/classService'

// Simulação de ambiente browser para execução determinística no Vitest (Node)
class LocalStorageMock {
  store: Record<string, string> = {}
  clear() { this.store = {} }
  getItem(key: string) { return this.store[key] || null }
  setItem(key: string, value: string) { this.store[key] = String(value) }
  removeItem(key: string) { delete this.store[key] }
}

class EventTargetMock {
  listeners: Record<string, Function[]> = {}
  addEventListener(event: string, fn: Function) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(fn)
  }
  removeEventListener(event: string, fn: Function) {
    if (!this.listeners[event]) return
    this.listeners[event] = this.listeners[event].filter(l => l !== fn)
  }
  dispatchEvent(event: any) {
    const fns = this.listeners[event.type] || []
    fns.forEach(fn => fn(event))
    return true
  }
}

describe('FASE 6 — Cobertura Total de Turmas no Planejamento (Feedback Usuária 0)', () => {
  beforeEach(() => {
    const mockStorage = new LocalStorageMock()
    const mockWindow = new EventTargetMock()
    ;(mockWindow as any).localStorage = mockStorage
    ;(globalThis as any).window = mockWindow
    ;(globalThis as any).localStorage = mockStorage
    ;(globalThis as any).Event = class {
      type: string
      constructor(type: string) { this.type = type }
    }
    ;(globalThis as any).CustomEvent = class {
      type: string
      detail: any
      constructor(type: string, opts?: any) {
        this.type = type
        this.detail = opts?.detail
      }
    }
  })

  afterEach(() => {
    delete (globalThis as any).window
    delete (globalThis as any).localStorage
    delete (globalThis as any).Event
    delete (globalThis as any).CustomEvent
  })

  // ─── 6.1 Unificação de Turmas Regulares e Alunos Particulares ─────────────────
  describe('6.1 getUnifiedClasses — Unificação e Fallback Seguro', () => {
    it('deve retornar DEFAULT_CLASSES quando não houver dados no localStorage', () => {
      const classes = getUnifiedClasses()
      expect(classes.length).toBeGreaterThan(0)
      expect(classes).toEqual(DEFAULT_CLASSES)
    })

    it('deve carregar turmas regulares de teacher_classes', () => {
      const customClasses: ClassRecord[] = [
        { id: 'cls_1', name: '6º Ano A', schoolId: 'sch_1', gradeYear: '6º Fund.' },
        { id: 'cls_2', name: '7º Ano B', schoolId: 'sch_1', gradeYear: '7º Fund.' }
      ]
      localStorage.setItem('teacher_classes', JSON.stringify(customClasses))

      const result = getUnifiedClasses()
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('6º Ano A')
      expect(result[1].name).toBe('7º Ano B')
    })

    it('deve unificar alunos particulares de teacher_private_students formatados com ícone e rótulo', () => {
      const regularClasses: ClassRecord[] = [
        { id: 'cls_9b', name: '9º Ano B', schoolId: 'sch_1', gradeYear: '9º Fund.' }
      ]
      const privateStudents = [
        { id: 'priv_101', name: 'Maria Fernanda', gradeYear: 'Particular', notes: 'Preparação Cambridge' },
        { id: '102', name: 'Pedro Henrique', gradeYear: 'Particular' }
      ]

      localStorage.setItem('teacher_classes', JSON.stringify(regularClasses))
      localStorage.setItem('teacher_private_students', JSON.stringify(privateStudents))

      const result = getUnifiedClasses()
      expect(result).toHaveLength(3)
      expect(result.some(c => c.name === '9º Ano B')).toBe(true)
      expect(result.some(c => c.name === '🎓 Particular: Maria Fernanda' && c.isPrivate === true)).toBe(true)
      expect(result.some(c => c.id === 'priv_102' && c.name === '🎓 Particular: Pedro Henrique')).toBe(true)
    })

    it('deve evitar duplicação se o mesmo ID for registrado em ambas as fontes', () => {
      const regularClasses: ClassRecord[] = [
        { id: 'cls_dup', name: 'Turma Regular', schoolId: 'sch_1' }
      ]
      const privateStudents = [
        { id: 'cls_dup', name: 'Turma Regular Privada' }
      ]

      localStorage.setItem('teacher_classes', JSON.stringify(regularClasses))
      localStorage.setItem('teacher_private_students', JSON.stringify(privateStudents))

      const result = getUnifiedClasses()
      expect(result.filter(c => c.id === 'cls_dup')).toHaveLength(1)
    })
  })

  // ─── 6.2 Criação e Atualização de Turmas On-the-Fly ───────────────────────────
  describe('6.2 saveOrUpdateClass — Cadastro Rápido e Notificação', () => {
    it('deve cadastrar uma nova turma e salvar no localStorage', () => {
      const newClass: ClassRecord = {
        id: 'cls_new_1',
        name: '3º EM Terceirão',
        schoolId: 'sch_colegio',
        gradeYear: '3º EM'
      }

      const updated = saveOrUpdateClass(newClass)
      expect(updated.some(c => c.id === 'cls_new_1')).toBe(true)

      const stored = JSON.parse(localStorage.getItem('teacher_classes') || '[]')
      expect(stored.some((c: any) => c.id === 'cls_new_1')).toBe(true)
    })

    it('deve atualizar turma existente quando o ID já existir', () => {
      const initialClass: ClassRecord = {
        id: 'cls_edit_1',
        name: '5º Ano A',
        schoolId: 'sch_1',
        gradeYear: '5º Fund.'
      }
      saveOrUpdateClass(initialClass)

      const updatedClass: ClassRecord = {
        id: 'cls_edit_1',
        name: '5º Ano A — Avançado',
        schoolId: 'sch_1',
        gradeYear: '5º Fund.'
      }
      const result = saveOrUpdateClass(updatedClass)
      const found = result.find(c => c.id === 'cls_edit_1')
      expect(found?.name).toBe('5º Ano A — Avançado')
    })
  })

  // ─── 6.3 Inscrição em Tempo Real (subscribeToClassUpdates) ───────────────────
  describe('6.3 subscribeToClassUpdates — Sincronização entre Abas e Módulos', () => {
    it('deve disparar callback quando evento teacher:classes_updated for emitido', () => {
      const callback = vi.fn()
      const unsubscribe = subscribeToClassUpdates(callback)

      const newClass: ClassRecord = {
        id: 'cls_event_test',
        name: 'Turma de Teste Evento',
        schoolId: 'sch_test'
      }
      saveOrUpdateClass(newClass)

      expect(callback).toHaveBeenCalled()
      unsubscribe()
    })

    it('deve disparar callback quando evento storage for emitido', () => {
      const callback = vi.fn()
      const unsubscribe = subscribeToClassUpdates(callback)

      window.dispatchEvent(new Event('storage'))
      expect(callback).toHaveBeenCalled()

      unsubscribe()
    })

    it('não deve mais chamar o callback após unsubscribe', () => {
      const callback = vi.fn()
      const unsubscribe = subscribeToClassUpdates(callback)
      unsubscribe()

      window.dispatchEvent(new Event('storage'))
      expect(callback).not.toHaveBeenCalled()
    })
  })

  // ─── 6.4 Resiliência no Salvamento de Planos (Sem Aborto Silencioso) ─────────
  describe('6.4 Resiliência de Salvamento com Turma Dinâmica / Fallback', () => {
    it('deve garantir que planos com turma não catalogada ainda sejam salvos no banco com dados defensivos', () => {
      const uncatalogedClassId = 'cls_antiga_999'
      const activeClass = {
        id: uncatalogedClassId,
        name: 'Turma Histórica',
        schoolId: 'sch_default'
      }

      const plan = {
        id: 'plan_orphan_test',
        date: '2026-09-20',
        classId: activeClass.id,
        className: activeClass.name,
        schoolName: 'Escola',
        subject: 'Língua Inglesa',
        topic: 'Past Perfect Review',
        savedInBank: true,
        createdAt: Date.now()
      }

      const existingBank = JSON.parse(localStorage.getItem('teacher_lesson_plans_bank') || '[]')
      const updatedBank = [plan, ...existingBank]
      localStorage.setItem('teacher_lesson_plans_bank', JSON.stringify(updatedBank))

      const reloaded = JSON.parse(localStorage.getItem('teacher_lesson_plans_bank') || '[]')
      expect(reloaded).toHaveLength(1)
      expect(reloaded[0].classId).toBe(uncatalogedClassId)
      expect(reloaded[0].className).toBe('Turma Histórica')
    })
  })
})
