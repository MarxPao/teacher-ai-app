/**
 * browserAutomationClient.ts — Cliente para orquestração de tarefas de automação de navegador (CDP)
 * Interage com o Supabase (PostgreSQL, RLS e Realtime)
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

function getSupabaseUrlAndKey(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://parxakvjvuvsmvbvrshk.supabase.co'
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcnhha3ZqdnV2c212YnZyc2hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNjgyMDcsImV4cCI6MjA5Mzg0NDIwN30.m7usRhAT6Z_wHxZsykPjV_op5GyRscz3Gnu9teKTMoM'
  return { url, anonKey }
}

/**
 * Cria uma nova tarefa de automação no Supabase
 */
export async function createBrowserTask(params: {
  portal: string
  actionType: string
  payload: Record<string, unknown>
  approvalMode?: ApprovalMode
  classRef?: string
  studentCount?: number
}): Promise<BrowserAutomationTask | null> {
  const config = getSupabaseUrlAndKey()
  const token = await getValidAccessToken()
  const user = getCurrentUser()

  if (!config || !token || !user?.id) {
    console.error('Sessão Supabase ausente para criar tarefa de automação.')
    return null
  }

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

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('Erro ao inserir tarefa de automação:', err)
      return null
    }

    const data = await res.json()
    return Array.isArray(data) ? data[0] : data
  } catch (e) {
    console.error('Falha de rede ao criar browser_automation_task:', e)
    return null
  }
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
  const config = getSupabaseUrlAndKey()
  const token = await getValidAccessToken()
  if (!config || !token) return null

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

    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data) ? data[0] : data
  } catch {
    return null
  }
}

/**
 * Busca uma tarefa pelo ID
 */
export async function getBrowserTaskById(taskId: string): Promise<BrowserAutomationTask | null> {
  const config = getSupabaseUrlAndKey()
  const token = await getValidAccessToken()
  if (!config || !token) return null

  try {
    const res = await fetch(`${config.url}/rest/v1/browser_automation_tasks?id=eq.${taskId}&select=*`, {
      method: 'GET',
      headers: {
        'apikey': config.anonKey,
        'Authorization': `Bearer ${token}`
      }
    })

    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data) && data.length > 0 ? data[0] : null
  } catch {
    return null
  }
}

/**
 * Assina atualizações de uma tarefa com polling resiliente (fallback transparente para Realtime)
 */
export function subscribeToBrowserTask(
  taskId: string,
  onUpdate: (task: BrowserAutomationTask) => void,
  intervalMs = 1500
): () => void {
  let active = true

  const poll = async () => {
    if (!active) return
    const task = await getBrowserTaskById(taskId)
    if (task && active) {
      onUpdate(task)
      // Se terminou em done, error ou aborted, reduz a frequência ou encerra
      if (['done', 'error', 'aborted'].includes(task.status)) {
        return
      }
    }
    if (active) {
      setTimeout(poll, intervalMs)
    }
  }

  // Inicia polling inicial
  poll()

  return () => {
    active = false
  }
}

/**
 * Busca os logs de auditoria de uma tarefa
 */
export async function getBrowserAuditLogs(taskId: string): Promise<BrowserAutomationAuditLog[]> {
  const config = getSupabaseUrlAndKey()
  const token = await getValidAccessToken()
  if (!config || !token) return []

  try {
    const res = await fetch(`${config.url}/rest/v1/browser_automation_audit_logs?task_id=eq.${taskId}&select=*&order=created_at.desc`, {
      method: 'GET',
      headers: {
        'apikey': config.anonKey,
        'Authorization': `Bearer ${token}`
      }
    })

    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}
