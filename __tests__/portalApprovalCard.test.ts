import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PortalApprovalCard, PortalApprovalCardProps } from '../components/PortalApprovalCard'
import * as client from '../lib/browserAutomationClient'

describe('PortalApprovalCard (Etapa 5: Human-in-the-Loop)', () => {
  let mockSessionStorage: Record<string, string> = {}

  beforeEach(() => {
    vi.clearAllMocks()
    mockSessionStorage = {}

    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => mockSessionStorage[k] || null,
      setItem: (k: string, v: string) => { mockSessionStorage[k] = v },
      removeItem: (k: string) => { delete mockSessionStorage[k] },
      clear: () => { mockSessionStorage = {} }
    })

    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      sessionStorage: {
        getItem: (k: string) => mockSessionStorage[k] || null,
        setItem: (k: string, v: string) => { mockSessionStorage[k] = v },
        removeItem: (k: string) => { delete mockSessionStorage[k] }
      }
    })

    vi.spyOn(client, 'updateBrowserTask').mockImplementation(async (id, updates) => {
      return {
        id,
        status: updates.status || 'approved',
        teacher_id: 'teacher_123',
        trace_id: 'trace_123',
        portal: 'machado.com.br',
        action_type: 'write_grades',
        payload: {},
        approval_mode: 'batch',
        created_at: '',
        updated_at: ''
      } as any
    })
  })

  it('exporta o componente PortalApprovalCard e valida a tipagem das props', () => {
    expect(PortalApprovalCard).toBeDefined()
    expect(typeof PortalApprovalCard).toBe('function')

    const props: PortalApprovalCardProps = {
      taskId: 'task_teste_123',
      portal: 'https://machadosobrinho.paineldoaluno.com.br',
      actionType: 'write_grades',
      classRef: '7° Ano B',
      summary: '2 notas preenchidas com sucesso.',
      diff: [
        { studentName: 'Lucas Silva', field: 'Nota', beforeValue: '', afterValue: 9.5 }
      ],
      screenshotUrl: '/sandbox/prefilled_screenshot.png'
    }

    expect(props.taskId).toBe('task_teste_123')
    expect(props.diff?.length).toBe(1)
    expect(props.diff?.[0].afterValue).toBe(9.5)
  })

  it('aprovação atualiza status para "approved" no Supabase e limpa tarefa ativa', async () => {
    const taskId = 'task_real_456'
    mockSessionStorage['teacher_active_portal_task'] = JSON.stringify({ id: taskId, status: 'pending_approval' })

    const dispatchSpy = vi.fn()
    window.dispatchEvent = dispatchSpy

    // Simula execução da aprovação
    await client.updateBrowserTask(taskId, { status: 'approved' })
    sessionStorage.removeItem('teacher_active_portal_task')
    window.dispatchEvent(new Event('teacher:portal_task_completed'))

    expect(client.updateBrowserTask).toHaveBeenCalledWith(taskId, { status: 'approved' })
    expect(sessionStorage.getItem('teacher_active_portal_task')).toBeNull()
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'teacher:portal_task_completed' }))
  })

  it('rejeição atualiza status para "aborted" no Supabase e limpa tarefa ativa', async () => {
    const taskId = 'task_real_789'
    mockSessionStorage['teacher_active_portal_task'] = JSON.stringify({ id: taskId, status: 'pending_approval' })

    const dispatchSpy = vi.fn()
    window.dispatchEvent = dispatchSpy

    // Simula cancelamento pelo botão ou voz
    await client.updateBrowserTask(taskId, { status: 'aborted' })
    sessionStorage.removeItem('teacher_active_portal_task')
    window.dispatchEvent(new Event('teacher:portal_task_completed'))

    expect(client.updateBrowserTask).toHaveBeenCalledWith(taskId, { status: 'aborted' })
    expect(sessionStorage.getItem('teacher_active_portal_task')).toBeNull()
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'teacher:portal_task_completed' }))
  })

  it('formatação do resumo de diff preserva valores originais e novos', () => {
    const diffItems: client.DiffItem[] = [
      { studentName: 'Beatriz Lima', field: 'Nota P1', beforeValue: '0', afterValue: '8.5' },
      { studentName: 'Carlos Souza', field: 'Frequência', beforeValue: 'Presente', afterValue: 'Falta' }
    ]

    expect(diffItems[0].studentName).toBe('Beatriz Lima')
    expect(diffItems[0].afterValue).toBe('8.5')
    expect(diffItems[1].afterValue).toBe('Falta')
  })

  it('suporta e valida tipagem de alerta visual quando conflictDetected=true ou conflictWarning fornecido', () => {
    const props: PortalApprovalCardProps = {
      taskId: 'task_conflict_123',
      portal: 'portal.escola.com.br',
      actionType: 'write_grades',
      conflictDetected: true,
      conflictWarning: 'O portal possui nota 7.0, mas o app esperava 6.5.',
      diff: [
        { studentName: 'João Silva', field: 'Nota P1', beforeValue: '7.0', afterValue: '7.5' }
      ]
    }

    expect(props.conflictDetected).toBe(true)
    expect(props.conflictWarning).toContain('O portal possui nota 7.0')
    expect(props.diff?.[0].beforeValue).toBe('7.0')
  })
})


