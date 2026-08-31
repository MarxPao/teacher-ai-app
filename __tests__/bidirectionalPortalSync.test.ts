import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createBrowserTask,
  updateBrowserTask,
  DiffItem
} from '../lib/browserAutomationClient'
import {
  sanitizeOutboundPayload,
  logTeacherSyncRecord,
  getTeacherSyncLogs
} from '../lib/portalSanitizer'

describe('Sincronização Bidirecional de Escrita (Notas & Diário) e Auditoria LGPD', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} }
    })
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      CustomEvent: class CustomEvent {
        constructor(public type: string, public detail?: any) {}
      }
    })
    vi.clearAllMocks()
  })

  it('deve gerar tarefa de escrita de notas (write_grades) com DiffItem estruturado e aprovável', async () => {
    const diff: DiffItem[] = [
      { studentName: 'João da Silva', field: 'Nota - Simulado 1', beforeValue: '', afterValue: '8.5', approved: true },
      { studentName: 'Maria Oliveira', field: 'Nota - Simulado 1', beforeValue: '', afterValue: '9.0', approved: true }
    ]

    const cleanPayload = sanitizeOutboundPayload({
      platform: 'machadosobrinho.paineldoaluno.com.br',
      actionType: 'write_grades',
      title: 'Lançar Notas do 9º Ano B',
      classRef: '9º Ano B',
      diff
    })

    const task = await createBrowserTask({
      portal: 'machadosobrinho.paineldoaluno.com.br',
      actionType: 'write_grades',
      payload: cleanPayload,
      approvalMode: 'batch',
      classRef: '9º Ano B',
      studentCount: 2
    })

    expect(task).toBeDefined()
    expect(task.action_type).toBe('write_grades')
    expect(task.status).toBe('drafted')
    expect(task.payload?.diff).toHaveLength(2)

    // Professor aprova a execução no AutomationDiffModal
    const updated = await updateBrowserTask(task.id, {
      status: 'approved',
      payload: {
        ...task.payload,
        approved_items_count: 2,
        approved_at: new Date().toISOString()
      }
    })

    expect(updated?.status).toBe('approved')
    expect(updated?.payload?.approved_items_count).toBe(2)
  })

  it('deve gerar tarefa de diário de classe (diary) com sequência didática higienizada', async () => {
    const diff: DiffItem[] = [
      { studentName: 'Diário de Classe', field: 'Tema', beforeValue: '', afterValue: 'Present Perfect vs Simple Past', approved: true },
      { studentName: 'Diário de Classe', field: 'Data', beforeValue: '', afterValue: '2026-08-30', approved: true },
      { studentName: 'Diário de Classe', field: 'Habilidade', beforeValue: '', afterValue: 'Speaking & Reading', approved: true },
      { studentName: 'Diário de Classe', field: 'Metodologia', beforeValue: '', afterValue: 'Warm-up -> Apresentação -> Prática', approved: true }
    ]

    const task = await createBrowserTask({
      portal: 'santacatarina',
      actionType: 'diary',
      payload: {
        platform: 'santacatarina',
        actionType: 'diary',
        title: 'Lançar Diário — Present Perfect',
        date: '2026-08-30',
        classRef: '8º Ano A',
        diff
      },
      approvalMode: 'batch',
      classRef: '8º Ano A',
      studentCount: 1
    })

    expect(task.action_type).toBe('diary')
    expect(task.payload?.diff).toHaveLength(4)
    expect(task.class_ref).toBe('8º Ano A')
  })

  it('deve persistir e recuperar registros de teacher_sync_log com contadores e rastreabilidade', async () => {
    expect(getTeacherSyncLogs()).toEqual([])

    const record = await logTeacherSyncRecord({
      portal: 'machado',
      portalName: 'Machado Sobrinho',
      classRef: '9º Ano B',
      actionType: 'read_roster',
      importedCount: 15,
      mergedCount: 5,
      conflictsCount: 0,
      unmatchedLocalCount: 2,
      summaryDetails: { total: 22, created: 15, merged: 5, preserved: 2 }
    })

    expect(record.id).toContain('sync_')
    expect(record.importedCount).toBe(15)
    expect(record.mergedCount).toBe(5)
    expect(record.unmatchedLocalCount).toBe(2)

    const logs = getTeacherSyncLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].portalName).toBe('Machado Sobrinho')
    expect(logs[0].classRef).toBe('9º Ano B')
  })
})
