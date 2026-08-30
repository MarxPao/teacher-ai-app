/**
 * browserAutomationClient.ts — Cliente para orquestração de tarefas de automação de navegador (CDP)
 * Interage com o Supabase (PostgreSQL, RLS e Realtime) com fallback local 100% resiliente e reativo.
 */

import { getValidAccessToken, getCurrentUser } from './supabaseAuth'

export type TaskStatus =
  | 'drafted'
  | 'pending_approval'
  | 'approved'
  | 'running'
  | 'done'
  | 'error'
  | 'aborted'

export type ApprovalMode = 'item' | 'batch'
export type ConfidenceFlag = 'seletor_mapeado' | 'visual_inferido'

export interface DiffItem {
  studentName: string
  field: string
  beforeValue: string | number
  afterValue: string | number
  approved?: boolean
  error?: string
}

export interface BrowserAutomationTask {
  id: string
  teacher_id: string
  trace_id: string
  portal: string
  action_type: string
  status: TaskStatus
  payload: {
    diff?: DiffItem[]
    confidence_flag?: ConfidenceFlag
    rejection_reason?: string
    error_message?: string
    [key: string]: unknown
  }
  approval_mode: ApprovalMode
  class_ref?: string
  student_count?: number
  created_at: string
  updated_at: string
}

export interface BrowserAutomationAuditLog {
  id: string
  task_id: string
  trace_id: string
  teacher_id: string
  before_state?: Record<string, unknown>
  after_state?: Record<string, unknown>
  diff?: DiffItem[]
  screenshot_url?: string
  model_used?: string
  confidence_flag?: ConfidenceFlag
  created_at: string
}

const LOCAL_TASKS_KEY = 'teacher_browser_automation_tasks'
const LOCAL_AUDIT_KEY = 'teacher_browser_automation_audit_logs'

function getSupabaseUrlAndKey(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://parxakvjvuvsmvbvrshk.supabase.co'
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcnhha3ZqdnV2c212YnZyc2hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNjgyMDcsImV4cCI6MjA5Mzg0NDIwN30.m7usRhAT6Z_wHxZsykPjV_op5GyRscz3Gnu9teKTMoM'
  return { url, anonKey }
}

function getLocalTasks(): BrowserAutomationTask[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LOCAL_TASKS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalTask(task: BrowserAutomationTask): void {
  if (typeof window === 'undefined') return
  try {
    const list = getLocalTasks()
    const idx = list.findIndex(t => t.id === task.id)
    if (idx >= 0) {
      list[idx] = task
    } else {
      list.unshift(task)
    }
    localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(list))
    window.dispatchEvent(new CustomEvent('teacher:browser_task_updated', { detail: task }))
  } catch {}
}

/**
 * Cria uma nova tarefa de automação (salva localmente e sincroniza com o Supabase quando disponível)
 */
export async function createBrowserTask(params: {
  portal: string
  actionType: string
  payload: Record<string, unknown>
  approvalMode?: ApprovalMode
  classRef?: string
  studentCount?: number
}): Promise<BrowserAutomationTask | null> {
  const user = getCurrentUser()
  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const traceId = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  
  const localTask: BrowserAutomationTask = {
    id: taskId,
    teacher_id: user?.id || 'local_teacher',
    trace_id: traceId,
    portal: params.portal,
    action_type: params.actionType,
    status: 'drafted' as TaskStatus,
    payload: params.payload,
    approval_mode: params.approvalMode || 'batch',
    class_ref: params.classRef,
    student_count: params.studentCount,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  // Persiste imediatamente no armazenamento local
  saveLocalTask(localTask)

  const config = getSupabaseUrlAndKey()
  const token = await getValidAccessToken()

  if (config && token && user?.id) {
    const row = {
      teacher_id: user.id,
      portal: params.portal,
      action_type: params.actionType,
      status: 'drafted' as TaskStatus,
      payload: params.payload,
      approval_mode: params.approvalMode || 'batch',
      class_ref: params.classRef || null,
      student_count: params.studentCount || null,
    }

    try {
      const res = await fetch(`${config.url}/rest/v1/browser_automation_tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.anonKey,
          'Authorization': `Bearer ${token}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(row)
      })

      if (res.ok) {
        const data = await res.json()
        const remoteTask = Array.isArray(data) ? data[0] : data
        if (remoteTask && remoteTask.id) {
          saveLocalTask(remoteTask)
          return remoteTask
        }
      }
    } catch {
      // Fallback local silencioso
    }
  }

  return localTask
}

/**
 * Atualiza o status e payload de uma tarefa existente
 */
export async function updateBrowserTask(
  taskId: string,
  updates: {
    status?: TaskStatus
    payload?: Record<string, unknown>
    approval_mode?: ApprovalMode
  }
): Promise<BrowserAutomationTask | null> {
  const localList = getLocalTasks()
  const existingLocal = localList.find(t => t.id === taskId)
  let updatedTask: BrowserAutomationTask | null = null

  if (existingLocal) {
    updatedTask = {
      ...existingLocal,
      ...(updates.status ? { status: updates.status } : {}),
      ...(updates.approval_mode ? { approval_mode: updates.approval_mode } : {}),
      payload: {
        ...existingLocal.payload,
        ...(updates.payload || {})
      },
      updated_at: new Date().toISOString()
    }
    saveLocalTask(updatedTask)
  }

  const config = getSupabaseUrlAndKey()
  const token = await getValidAccessToken()

  if (config && token) {
    const body: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    }
    if (updates.status) body.status = updates.status
    if (updates.payload) body.payload = updates.payload
    if (updates.approval_mode) body.approval_mode = updates.approval_mode

    try {
      const res = await fetch(`${config.url}/rest/v1/browser_automation_tasks?id=eq.${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.anonKey,
          'Authorization': `Bearer ${token}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(body)
      })

      if (res.ok) {
        const data = await res.json()
        const remoteTask = Array.isArray(data) ? data[0] : data
        if (remoteTask) {
          saveLocalTask(remoteTask)
          return remoteTask
        }
      }
    } catch {}
  }

  return updatedTask || (existingLocal ? existingLocal : null)
}

/**
 * Busca uma tarefa pelo ID
 */
export async function getBrowserTaskById(taskId: string): Promise<BrowserAutomationTask | null> {
  const localList = getLocalTasks()
  const localTask = localList.find(t => t.id === taskId)
  if (localTask) return localTask

  const config = getSupabaseUrlAndKey()
  const token = await getValidAccessToken()

  if (config && token) {
    try {
      const res = await fetch(`${config.url}/rest/v1/browser_automation_tasks?id=eq.${taskId}&select=*`, {
        method: 'GET',
        headers: {
          'apikey': config.anonKey,
          'Authorization': `Bearer ${token}`
        }
      })

      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          saveLocalTask(data[0])
          return data[0]
        }
      }
    } catch {}
  }

  return null
}

/**
 * Assina atualizações de uma tarefa com barramento de eventos locais reativo e fallback transparente
 */
export function subscribeToBrowserTask(
  taskId: string,
  onUpdate: (task: BrowserAutomationTask) => void,
  intervalMs = 2500
): () => void {
  let active = true
  let isRemotePollingDisabled = false

  // Se já existe localmente, dispara imediatamente
  const initial = getLocalTasks().find(t => t.id === taskId)
  if (initial) {
    onUpdate(initial)
  }

  // Listener para eventos locais em tempo real (0ms latência e zero requisições HTTP)
  const handleLocalUpdate = (e: Event) => {
    if (!active) return
    const customEvt = e as CustomEvent<BrowserAutomationTask>
    if (customEvt.detail && customEvt.detail.id === taskId) {
      onUpdate(customEvt.detail)
    } else {
      const task = getLocalTasks().find(t => t.id === taskId)
      if (task) onUpdate(task)
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('teacher:browser_task_updated', handleLocalUpdate)
    window.addEventListener('storage', handleLocalUpdate)
  }

  // Polling apenas para tarefas remotas de nuvem
  const poll = async () => {
    if (!active || isRemotePollingDisabled) return
    
    try {
      const config = getSupabaseUrlAndKey()
      const token = await getValidAccessToken()
      if (!config || !token) {
        isRemotePollingDisabled = true
        return
      }

      const res = await fetch(`${config.url}/rest/v1/browser_automation_tasks?id=eq.${taskId}&select=*`, {
        method: 'GET',
        headers: {
          'apikey': config.anonKey,
          'Authorization': `Bearer ${token}`
        }
      })

      if (res.status === 401 || res.status === 403 || res.status === 404) {
        // Desativa polling imediatamente ao receber 401/403/404 para evitar poluir o console
        isRemotePollingDisabled = true
        return
      }

      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0 && active) {
          saveLocalTask(data[0])
          onUpdate(data[0])
          if (['done', 'error', 'aborted'].includes(data[0].status)) {
            return
          }
        }
      }
    } catch {
      isRemotePollingDisabled = true
    }

    if (active && !isRemotePollingDisabled) {
      setTimeout(poll, intervalMs)
    }
  }

  // Se não foi desabilitado, agenda o próximo poll
  if (!isRemotePollingDisabled) {
    setTimeout(poll, intervalMs)
  }

  return () => {
    active = false
    if (typeof window !== 'undefined') {
      window.removeEventListener('teacher:browser_task_updated', handleLocalUpdate)
      window.removeEventListener('storage', handleLocalUpdate)
    }
  }
}

/**
 * Busca os logs de auditoria de uma tarefa
 */
export async function getBrowserAuditLogs(taskId: string): Promise<BrowserAutomationAuditLog[]> {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_AUDIT_KEY)
      if (raw) {
        const list: BrowserAutomationAuditLog[] = JSON.parse(raw)
        const localFound = list.filter(l => l.task_id === taskId)
        if (localFound.length > 0) return localFound
      }
    } catch {}
  }

  const config = getSupabaseUrlAndKey()
  const token = await getValidAccessToken()

  if (config && token) {
    try {
      const res = await fetch(`${config.url}/rest/v1/browser_automation_audit_logs?task_id=eq.${taskId}&select=*&order=created_at.desc`, {
        method: 'GET',
        headers: {
          'apikey': config.anonKey,
          'Authorization': `Bearer ${token}`
        }
      })

      if (res.ok) {
        const data = await res.json()
        return Array.isArray(data) ? data : []
      }
    } catch {}
  }

  return []
}

/**
 * Grava um novo log de auditoria
 */
export async function createBrowserAuditLog(params: {
  taskId: string
  traceId: string
  beforeState?: Record<string, unknown>
  afterState?: Record<string, unknown>
  diff?: DiffItem[]
  screenshotUrl?: string
  modelUsed?: string
  confidenceFlag?: ConfidenceFlag
}): Promise<BrowserAutomationAuditLog | null> {
  const user = getCurrentUser()
  const auditId = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  
  const logObj: BrowserAutomationAuditLog = {
    id: auditId,
    task_id: params.taskId,
    trace_id: params.traceId,
    teacher_id: user?.id || 'local_teacher',
    before_state: params.beforeState,
    after_state: params.afterState,
    diff: params.diff,
    screenshot_url: params.screenshotUrl,
    model_used: params.modelUsed,
    confidence_flag: params.confidenceFlag,
    created_at: new Date().toISOString(),
  }

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_AUDIT_KEY)
      const list: BrowserAutomationAuditLog[] = raw ? JSON.parse(raw) : []
      list.unshift(logObj)
      localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(list))
    } catch {}
  }

  const config = getSupabaseUrlAndKey()
  const token = await getValidAccessToken()

  if (config && token && user?.id) {
    try {
      await fetch(`${config.url}/rest/v1/browser_automation_audit_logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.anonKey,
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(logObj)
      })
    } catch {}
  }

  return logObj
}
