/**
 * lib/extensionSyncBus.ts — Barramento de Livre Intercâmbio Bidirecional Extensão ↔ App
 *
 * Implementa sincronização em tempo real (0ms de latência) entre o TeacherAI Web App
 * e a Extensão Chrome (content.js, side_panel.js, background.js), espelhando o modelo
 * de sucesso Trello ↔ Checklist:
 *
 * 1. Sincronia de Roster & Turmas com Reconciliador 4 Vias (rosterReconciler.ts).
 * 2. Conversão de pendências do portal em ChecklistTodo com tags e tópicos pedagógicos.
 * 3. Consulta em tempo real de tarefas da turma ativa para o Side Panel da extensão.
 * 4. Dossiê pedagógico do aluno (studentMemory.ts) exibido diretamente no Side Panel.
 * 5. Conclusão automática de tarefas no Checklist após execução no portal.
 */

import { getStudents, setStudents, getClasses, setClasses, safeGet, safeSet, KEYS } from './localDB'
import { loadChecklistTodos, saveChecklistTodos, ChecklistTodo } from './checklistManager'
import { addObservation, getStudentMemory, StudentMemory } from './studentMemory'
import { reconcileRosterBatch, ScrapedStudent, LocalStudentRecord } from './rosterReconciler'

export const ENTITY_BUS_CHANNEL_NAME = 'teacher_entity_bus'

export interface PortalRosterSyncPayload {
  className: string
  portalName: string
  students: ScrapedStudent[]
  pageUrl?: string
  classId?: string
}

export interface PortalPendencyItem {
  id: string
  title: string
  actionType?: 'diario' | 'notas' | 'chamada' | 'recuperacao' | 'outro'
  dueDate?: string
  url?: string
}

export interface PortalPendenciesSyncPayload {
  portalName: string
  className: string
  pendencies: PortalPendencyItem[]
}

export interface PortalActionExecutedPayload {
  action: 'lancar_nota' | 'lancar_falta' | 'salvar_diario' | string
  className: string
  studentName?: string
  date?: string
  details?: Record<string, any>
}

class ExtensionSyncBus {
  private channel: BroadcastChannel | null = null
  private isInitialized = false

  public init(): void {
    if (this.isInitialized || typeof window === 'undefined') return
    this.isInitialized = true

    // 1. Inicia BroadcastChannel nativo do navegador
    try {
      if ('BroadcastChannel' in window) {
        this.channel = new BroadcastChannel(ENTITY_BUS_CHANNEL_NAME)
        this.channel.onmessage = (ev) => this.handleIncomingMessage(ev.data)
      }
    } catch (e) {
      console.warn('[ExtensionSyncBus] BroadcastChannel não disponível, usando postMessage.', e)
    }

    // 2. Listener para window.addEventListener('message') de content.js
    window.addEventListener('message', (ev) => {
      // Aceita mensagens de localhost e extensões Chrome
      if (!ev.data || typeof ev.data !== 'object') return
      if (ev.data.bus === ENTITY_BUS_CHANNEL_NAME) {
        this.handleIncomingMessage(ev.data)
      }
    })

    // 3. Listener para eventos customizados da aplicação
    window.addEventListener('teacher:dispatch_to_extension', (ev: any) => {
      if (ev.detail) {
        this.broadcast(ev.detail.type, ev.detail.payload)
      }
    })

    // Avisa que o App TeacherAI está online e pronto para receber dados
    this.broadcast('APP_READY', { timestamp: Date.now(), origin: window.location.origin })
    console.log('[ExtensionSyncBus] 🚀 Barramento de Livre Intercâmbio Ativado!')
  }

  public broadcast(type: string, payload: any): void {
    const message = { bus: ENTITY_BUS_CHANNEL_NAME, type, payload, timestamp: Date.now() }
    
    // Broadcast via BroadcastChannel
    if (this.channel) {
      try {
        this.channel.postMessage(message)
      } catch (e) {}
    }

    // Broadcast via window.postMessage (para content scripts locais)
    if (typeof window !== 'undefined') {
      try {
        window.postMessage(message, '*')
      } catch (e) {}
    }
  }

  private handleIncomingMessage(msg: any): void {
    if (!msg || !msg.type) return

    switch (msg.type) {
      case 'PING_APP': {
        this.broadcast('PONG_APP', { ready: true, time: Date.now() })
        break
      }

      case 'PORTAL_ROSTER_SYNC': {
        this.handlePortalRosterSync(msg.payload)
        break
      }

      case 'PORTAL_PENDENCIES_SYNC': {
        this.handlePortalPendenciesSync(msg.payload)
        break
      }

      case 'PORTAL_ACTION_EXECUTED': {
        this.handlePortalActionExecuted(msg.payload)
        break
      }

      case 'REQUEST_ACTIVE_CLASS_TODOS': {
        this.handleRequestActiveTodos(msg.payload)
        break
      }

      case 'TOGGLE_TODO_FROM_EXTENSION': {
        this.handleToggleTodoFromExtension(msg.payload)
        break
      }

      case 'REQUEST_STUDENT_DOSSIER': {
        this.handleRequestStudentDossier(msg.payload)
        break
      }

      case 'RECORD_STUDENT_OBSERVATION_FROM_EXTENSION': {
        this.handleRecordObservation(msg.payload)
        break
      }

      case 'EXECUTE_APP_TOOL': {
        this.handleExecuteAppTool(msg.payload)
        break
      }
    }
  }

  /**
   * Processa sincronização de lista de chamada (Roster) com reconciliação em 4 vias
   */
  public handlePortalRosterSync(payload: PortalRosterSyncPayload): { success: boolean; merged: number; added: number } {
    if (!payload || !Array.isArray(payload.students) || payload.students.length === 0) {
      return { success: false, merged: 0, added: 0 }
    }

    const className = (payload.className || 'Turma do Portal').trim()
    const portalName = payload.portalName || 'Portal Escolar'

    // 1. Busca ou cria a turma em teacher_classes
    const currentClasses = getClasses<any[]>()
    let targetClass = currentClasses.find(c => (c.name || '').toLowerCase() === className.toLowerCase())

    if (!targetClass) {
      targetClass = {
        id: payload.classId || 'cls_' + Date.now().toString(36),
        name: className,
        schoolName: portalName,
        source: 'portal_scrape',
        createdAt: new Date().toISOString()
      }
      currentClasses.push(targetClass)
      setClasses(currentClasses)
    }

    // 2. Executa Reconciliação em 4 Vias via rosterReconciler.ts
    const localStudents = getStudents<LocalStudentRecord[]>()
    const recResult = reconcileRosterBatch(payload.students, localStudents, { targetClassRef: className })

    let addedCount = 0
    let mergedCount = 0

    // Aplica as decisões de reconciliação
    const updatedStudents = [...localStudents]

    for (const item of recResult.items) {
      if (item.status === 'auto_merged' && item.matchedLocalStudent && item.portalStudent) {
        // Match Exato: atualiza dados oficiais preservando notas locais
        const idx = updatedStudents.findIndex(s => s.id === item.matchedLocalStudent!.id)
        if (idx >= 0) {
          updatedStudents[idx] = {
            ...updatedStudents[idx],
            className,
            classId: targetClass.id,
            rollNumber: item.portalStudent.rollNumber || item.portalStudent.matricula || updatedStudents[idx].rollNumber,
            portal_native_id: item.portalStudent.portal_native_id || item.portalStudent.matricula,
            sync_status: 'synced',
            last_synced_at: new Date().toISOString(),
          }
          mergedCount++
        }
      } else if (item.status === 'new_from_portal' && item.portalStudent) {
        // Novo do Portal: cadastra novo aluno com badge portal_scrape
        const rawMat = item.portalStudent.rollNumber || item.portalStudent.matricula || ''
        const newStuId = rawMat ? `stu_mat_${rawMat}` : `stu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
        
        // Evita duplicatas se já inserido no mesmo lote
        if (!updatedStudents.some(s => s.id === newStuId)) {
          updatedStudents.push({
            id: newStuId,
            name: item.portalStudent.name,
            className,
            classId: targetClass.id,
            rollNumber: rawMat,
            portal_native_id: rawMat,
            source_type: 'portal_scrape',
            source_portal: portalName,
            sync_status: 'synced',
            last_synced_at: new Date().toISOString(),
            grades: {},
            metrics: {}
          })
          addedCount++
        }
      }
    }

    // 3. Salva no localDB e dispara reatividade global
    setStudents(updatedStudents)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'))
      window.dispatchEvent(new CustomEvent('teacher:data_changed', {
        detail: { type: 'roster_synced', className, added: addedCount, merged: mergedCount }
      }))
    }

    // 4. Confirma recepção para a extensão
    this.broadcast('PORTAL_ROSTER_SYNC_ACK', {
      success: true,
      className,
      classId: targetClass.id,
      added: addedCount,
      merged: mergedCount,
      totalClassStudents: updatedStudents.filter(s => s.classId === targetClass!.id).length
    })

    return { success: true, merged: mergedCount, added: addedCount }
  }

  /**
   * Converte pendências do portal em tarefas no Checklist do App (Inspirado no Trello)
   */
  public handlePortalPendenciesSync(payload: PortalPendenciesSyncPayload): void {
    if (!payload || !Array.isArray(payload.pendencies) || payload.pendencies.length === 0) return

    const { portalName, className, pendencies } = payload
    const currentTodos = loadChecklistTodos()
    let modified = false

    for (const p of pendencies) {
      const todoId = `portal_todo_${p.id || (portalName + '_' + className + '_' + p.title).replace(/[\s\W]+/g, '_').toLowerCase()}`
      
      const exists = currentTodos.some(t => t.id === todoId || (t.text === p.title && t.subtopic === className))
      if (!exists) {
        currentTodos.unshift({
          id: todoId,
          text: p.title,
          done: false,
          category: 'imported',
          source: 'portal',
          tag: portalName,
          topic: 'Pendências do Portal',
          subtopic: className,
          priority: 'high',
          actionLabel: 'Abrir no Portal',
          actionTarget: p.url,
          createdAt: Date.now()
        })
        modified = true
      }
    }

    if (modified) {
      saveChecklistTodos(currentTodos)
      this.broadcast('ACTIVE_CLASS_TODOS_UPDATED', { className, count: currentTodos.length })
    }
  }

  /**
   * Quando uma ação é executada no portal, conclui a tarefa no Checklist e adiciona observação
   */
  public handlePortalActionExecuted(payload: PortalActionExecutedPayload): void {
    if (!payload || !payload.className) return

    const { action, className, studentName, date, details } = payload
    const currentTodos = loadChecklistTodos()
    let todoCompleted = false

    // 1. Procura tarefa correspondente no checklist
    for (const t of currentTodos) {
      if (!t.done && (t.subtopic === className || t.text.toLowerCase().includes(className.toLowerCase()))) {
        const textLow = t.text.toLowerCase()
        if (
          (action === 'lancar_nota' && (textLow.includes('nota') || textLow.includes('avalia'))) ||
          (action === 'lancar_falta' && (textLow.includes('falta') || textLow.includes('chamada') || textLow.includes('frequên'))) ||
          (action === 'salvar_diario' && textLow.includes('diário'))
        ) {
          t.done = true
          t.completedAt = new Date().toISOString()
          todoCompleted = true
          break
        }
      }
    }

    if (todoCompleted) {
      saveChecklistTodos(currentTodos)
    }

    // 2. Adiciona observação pedagógica se houver aluno específico
    if (studentName) {
      const allStudents = getStudents<LocalStudentRecord[]>()
      const match = allStudents.find(s => s.name.toLowerCase() === studentName.toLowerCase())
      const studentId = match ? match.id : ''
      
      const note = `Ação executada no portal escolar (${action}) para a turma ${className}${date ? ' na data ' + date : ''}.`
      addObservation(studentId, studentName, note, 'Avaliação', undefined, 'system')
    }

    this.broadcast('PORTAL_ACTION_RECORDED', { success: true, action, className, studentName })
  }

  /**
   * Responde ao Side Panel com as tarefas pendentes da turma ativa
   */
  public handleRequestActiveTodos(payload: { className: string }): void {
    if (!payload || !payload.className) return
    const target = payload.className.toLowerCase()

    const todos = loadChecklistTodos().filter(t => {
      const sub = (t.subtopic || '').toLowerCase()
      const text = (t.text || '').toLowerCase()
      const tag = (t.tag || '').toLowerCase()
      return sub === target || text.includes(target) || tag.includes(target)
    })

    this.broadcast('ACTIVE_CLASS_TODOS_RESPONSE', {
      className: payload.className,
      todos: todos.slice(0, 10) // Retorna até 10 tarefas da turma
    })
  }

  /**
   * Altera status de uma tarefa disparado pelo Side Panel da extensão
   */
  public handleToggleTodoFromExtension(payload: { todoId: string; done: boolean }): void {
    if (!payload || !payload.todoId) return
    const todos = loadChecklistTodos()
    const target = todos.find(t => t.id === payload.todoId)
    if (target) {
      target.done = payload.done
      target.completedAt = payload.done ? new Date().toISOString() : undefined
      saveChecklistTodos(todos)
      this.broadcast('ACTIVE_CLASS_TODOS_UPDATED', { todoId: payload.todoId, done: payload.done })
    }
  }

  /**
   * Retorna o Dossiê Pedagógico do aluno para exibição no Side Panel da extensão
   */
  public handleRequestStudentDossier(payload: { studentName: string; matricula?: string }): void {
    if (!payload || !payload.studentName) return

    const allStudents = getStudents<LocalStudentRecord[]>()
    const sClean = payload.studentName.toLowerCase()

    const matched = allStudents.find(s => 
      s.name.toLowerCase() === sClean || 
      (payload.matricula && (s.rollNumber === payload.matricula || s.portal_native_id === payload.matricula))
    )

    let memory: StudentMemory | null = null
    if (matched) {
      memory = getStudentMemory(matched.id) || null
    }

    this.broadcast('STUDENT_DOSSIER_RESPONSE', {
      studentName: payload.studentName,
      found: Boolean(matched),
      student: matched || null,
      memory: memory ? {
        observations: (memory.observations || []).slice(0, 5),
        summary: memory.summary || null,
        recentExams: (memory.examHistory || []).slice(0, 3)
      } : null
    })
  }

  /**
   * Salva observação pedagógica rápida vinda do Side Panel
   */
  public handleRecordObservation(payload: { studentName: string; note: string; category?: string }): void {
    if (!payload || !payload.studentName || !payload.note) return
    const allStudents = getStudents<LocalStudentRecord[]>()
    const matched = allStudents.find(s => s.name.toLowerCase() === payload.studentName.toLowerCase())
    const studentId = matched ? matched.id : ''

    addObservation(
      studentId,
      payload.studentName,
      payload.note,
      (payload.category as any) || 'general',
      undefined,
      'teacher'
    )

    this.broadcast('STUDENT_OBSERVATION_SAVED', {
      studentName: payload.studentName,
      success: true
    })
  }

  /**
   * Executa ferramenta Tipo (a) delegada pelo Side Panel da Extensão (Arquitetura Unificada)
   */
  public handleExecuteAppTool(payload: { tool: string; params: Record<string, unknown>; source?: string }): void {
    if (!payload || !payload.tool) return

    const { tool, params } = payload

    if (tool === 'add_todo' && params?.text) {
      const currentTodos = loadChecklistTodos()
      const newTodo: ChecklistTodo = {
        id: `todo_${Date.now()}`,
        text: String(params.text),
        done: false,
        category: 'one_off',
        source: 'extension_relay',
        createdAt: Date.now()
      }
      currentTodos.unshift(newTodo)
      saveChecklistTodos(currentTodos)
      this.broadcast('ACTIVE_CLASS_TODOS_UPDATED', { todos: currentTodos })
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('storage'))
      return
    }

    if (tool === 'create_calendar_task' && params?.title && params?.date) {
      try {
        const raw = localStorage.getItem('teacher_calendar_tasks')
        const tasks = raw ? JSON.parse(raw) : []
        tasks.push({
          id: `task_${Date.now()}`,
          title: params.title,
          date: params.date,
          classRef: params.classRef || '',
          type: params.type || 'tarefa',
          description: params.description || '',
          createdAt: new Date().toISOString()
        })
        localStorage.setItem('teacher_calendar_tasks', JSON.stringify(tasks))
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('storage'))
          window.dispatchEvent(new CustomEvent('teacher:calendar_task_created'))
        }
      } catch {}
      return
    }

    if (tool === 'create_lesson_plan' && params?.title && params?.subject) {
      try {
        const raw = localStorage.getItem('teacher_lesson_plans')
        const plans = raw ? JSON.parse(raw) : []
        plans.push({
          id: `plan_${Date.now()}`,
          title: params.title,
          subject: params.subject,
          objectives: params.objectives || '',
          className: params.className || '',
          school: params.school || '',
          duration: params.duration || '50',
          createdAt: new Date().toISOString()
        })
        localStorage.setItem('teacher_lesson_plans', JSON.stringify(plans))
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('storage'))
      } catch {}
      return
    }

    // Dispara evento para qualquer outra ferramenta Tipo (a)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('teacher:execute_agent_tool', { detail: payload }))
      window.dispatchEvent(new Event('storage'))
    }
  }
}

export const extensionSyncBus = new ExtensionSyncBus()

// Auto-inicialização segura no navegador
if (typeof window !== 'undefined') {
  extensionSyncBus.init()
}
