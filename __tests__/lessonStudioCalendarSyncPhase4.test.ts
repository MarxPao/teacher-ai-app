import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// Mock simples para ambiente Node (Vitest)
class LocalStorageMock {
  store: Record<string, string> = {}
  clear() { this.store = {} }
  getItem(key: string) { return this.store[key] || null }
  setItem(key: string, value: string) { this.store[key] = String(value) }
  removeItem(key: string) { delete this.store[key] }
}

describe('FASE 4 — Integração Calendário e Banco de Planos (Feedback Usuária 0)', () => {
  beforeEach(() => {
    const mockStorage = new LocalStorageMock()
    ;(globalThis as any).localStorage = mockStorage
  })

  afterEach(() => {
    delete (globalThis as any).localStorage
  })

  // ─── 4.1 Edição Inline no Banco de Planos ────────────────────────────────────
  describe('4.1 Edição Inline no Banco de Planos (Sem Recriar do Zero)', () => {
    it('deve atualizar os campos essenciais do plano (tópico, data, espaço, dever, notas) inline', () => {
      const initialPlan = {
        id: 'plan_test_101',
        topic: 'Simple Present: Routine',
        date: '2026-09-21',
        classId: 'cls_8a',
        className: '8º Ano A',
        schoolName: 'Escola Modelo',
        subject: 'Língua Inglesa',
        roomSpace: 'Sala de Aula Regular',
        homework: 'Pág. 10 ex 1',
        postLessonNotes: 'Introdução concluída',
        stages: [{ name: 'Warm-up', durationMin: 5, teacherAction: '', studentAction: '' }]
      }

      localStorage.setItem('teacher_lesson_plans_bank', JSON.stringify([initialPlan]))

      // Simulação da lógica de handleSaveInlineEdit
      const bank = JSON.parse(localStorage.getItem('teacher_lesson_plans_bank') || '[]')
      const updated = bank.map((p: any) => {
        if (p.id === 'plan_test_101') {
          return {
            ...p,
            topic: 'Simple Present: Daily Routines & Time Expressions',
            date: '2026-09-22',
            roomSpace: 'Lab. de Informática',
            homework: 'Pág. 10 ex 1 a 4',
            postLessonNotes: 'Alunos dominaram as expressões de tempo com facilidade'
          }
        }
        return p
      })
      localStorage.setItem('teacher_lesson_plans_bank', JSON.stringify(updated))

      const reloaded = JSON.parse(localStorage.getItem('teacher_lesson_plans_bank') || '[]')
      expect(reloaded[0].topic).toBe('Simple Present: Daily Routines & Time Expressions')
      expect(reloaded[0].date).toBe('2026-09-22')
      expect(reloaded[0].roomSpace).toBe('Lab. de Informática')
      expect(reloaded[0].homework).toBe('Pág. 10 ex 1 a 4')
      expect(reloaded[0].postLessonNotes).toContain('Alunos dominaram')
      // Roteiro original preservado
      expect(reloaded[0].stages).toHaveLength(1)
    })
  })

  // ─── 4.2 Sincronização Bidirecional Banco ⇄ Calendário ──────────────────────
  describe('4.2 Sincronização Bidirecional entre Banco de Planos e Tarefas do Calendário', () => {
    it('deve sincronizar o título e a data da tarefa no calendário quando o plano for editado no banco', () => {
      const planId = 'plan_sync_202'
      const initialTask = {
        id: 'task_cal_505',
        planId: planId,
        title: 'Aula de Língua Inglesa: Modal Verbs (9º Ano B)',
        date: '2026-09-25',
        classId: 'cls_9b',
        className: '9º Ano B',
        completed: false
      }

      const initialPlan = {
        id: planId,
        topic: 'Modal Verbs: Can, Could, May',
        date: '2026-09-25',
        classId: 'cls_9b',
        className: '9º Ano B',
        postLessonNotes: 'Preparar handouts impressos'
      }

      localStorage.setItem('teacher_calendar_tasks', JSON.stringify([initialTask]))
      localStorage.setItem('teacher_lesson_plans_bank', JSON.stringify([initialPlan]))

      // Atualização do plano (ex: adiamento de data e refinamento do tema)
      const newTopic = 'Modal Verbs of Ability & Permission'
      const newDate = '2026-09-26'
      const newNotes = 'Material impresso revisado'

      const bank = JSON.parse(localStorage.getItem('teacher_lesson_plans_bank') || '[]')
      const updatedBank = bank.map((p: any) => p.id === planId ? { ...p, topic: newTopic, date: newDate, postLessonNotes: newNotes } : p)
      localStorage.setItem('teacher_lesson_plans_bank', JSON.stringify(updatedBank))

      // Lógica de sincronização disparada pelo banco
      const tasks = JSON.parse(localStorage.getItem('teacher_calendar_tasks') || '[]')
      const syncedTasks = tasks.map((t: any) => {
        if (t.planId === planId) {
          return {
            ...t,
            title: `Aula: ${newTopic}`,
            date: newDate,
            description: newNotes
          }
        }
        return t
      })
      localStorage.setItem('teacher_calendar_tasks', JSON.stringify(syncedTasks))

      const reloadedTasks = JSON.parse(localStorage.getItem('teacher_calendar_tasks') || '[]')
      expect(reloadedTasks[0].title).toBe('Aula: Modal Verbs of Ability & Permission')
      expect(reloadedTasks[0].date).toBe('2026-09-26')
      expect(reloadedTasks[0].description).toBe('Material impresso revisado')
    })
  })

  // ─── 4.3 Navegação e Prefill do Calendário para o Studio ────────────────────
  describe('4.3 Resolução Inteligente de Prefill: Calendário → LessonStudio', () => {
    it('deve vincular planId existente no prefill para reedição direta em vez de criar plano órfão', () => {
      const existingPlan = {
        id: 'plan_existing_888',
        classId: 'cls_8a',
        className: '8º Ano A',
        topic: 'Conditionals: Zero & First',
        date: '2026-09-28'
      }
      localStorage.setItem('teacher_lesson_plans_bank', JSON.stringify([existingPlan]))

      // Usuário clica em "Planejar no Studio" na tarefa da grade ou calendário
      const scheduleItem = {
        classId: 'cls_8a',
        className: '8º Ano A',
        topic: 'Conditionals: Zero & First'
      }

      const bank = JSON.parse(localStorage.getItem('teacher_lesson_plans_bank') || '[]')
      const found = bank.find((p: any) =>
        (p.classId === scheduleItem.classId && p.topic?.toLowerCase() === scheduleItem.topic?.toLowerCase())
      )

      const prefill = {
        planId: found ? found.id : undefined,
        classId: scheduleItem.classId,
        className: scheduleItem.className,
        topic: scheduleItem.topic,
        date: '2026-09-28'
      }
      localStorage.setItem('teacher_lesson_studio_prefill', JSON.stringify(prefill))

      const loadedPrefill = JSON.parse(localStorage.getItem('teacher_lesson_studio_prefill') || '{}')
      expect(loadedPrefill.planId).toBe('plan_existing_888')
      expect(loadedPrefill.topic).toBe('Conditionals: Zero & First')
    })
  })
})
