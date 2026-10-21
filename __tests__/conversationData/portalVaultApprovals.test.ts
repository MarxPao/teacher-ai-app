/**
 * __tests__/conversationData/portalVaultApprovals.test.ts
 *
 * Testes estritos da Opção B (Write-Through 100% no cofre local seguro / SQLite).
 * Garante:
 * 1. Roundtrip cifrado com AES-256-GCM via dataKey (nomes, matrículas e notas).
 * 2. Varredura binária (.db, -wal, -journal) sem nenhum texto em claro (UTF-8 e UTF-16LE) com controle positivo.
 * 3. Estado 'pending' com approved_at NULL e restrição CHECK que exige approved_at quando status = 'approved'.
 * 4. Roteamento via canal IPC nativo com allowlist estrita.
 * 5. Sanitização de portal_execution_logs na nuvem (apenas contagens anônimas, zero PII).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import { NodeSqliteDriver } from '../../desktop/db/nodeSqliteDriver'
import { initConversationVault, ConversationVaultRepository } from '../../lib/conversationData/schema'
import { executeConversationMethod } from '../../lib/conversationData/desktopIpc'
import { savePortalExecutionLogToSupabase } from '../../lib/supabaseClient'
import type { PortalApprovalRecord } from '../../lib/conversationData/types'

describe('Tarefa 3 (R4): Opção B — Espelho de Aprovação no Cofre Local Seguro', () => {
  let tmpDir: string
  let dbPath: string
  let driver: NodeSqliteDriver
  let dataKey: Buffer

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault_approvals_test_'))
    dbPath = path.join(tmpDir, 'test_vault.db')
    driver = new NodeSqliteDriver(dbPath)
    await initConversationVault(driver)
    dataKey = crypto.randomBytes(32)
  })

  afterEach(() => {
    try {
      driver.close()
    } catch {}
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  it('1. Roundtrip Cifrado: persiste aprovação com PII e recupera exatamente os dados decifrados', async () => {
    const repo = new ConversationVaultRepository(driver, dataKey)

    const approval: PortalApprovalRecord = {
      id: 'appr_task_100',
      task_id: 'task_portal_launch_1',
      portal_id: 'machado_sobrinho',
      portal_name: 'Machado Sobrinho',
      action_type: 'write_grades',
      class_ref: '8º Ano B',
      status: 'approved',
      diff: [
        {
          studentName: 'Canário Arthur Pendente',
          matricula: '20260088',
          field: 'nota_trimestre_1',
          value: 9.5,
          beforeValue: 8.0
        },
        {
          studentName: 'Canário Beatriz Silveira',
          matricula: '20260089',
          field: 'nota_trimestre_1',
          value: 10.0,
          beforeValue: 9.0
        }
      ],
      screenshot_hash: 'sha256_mock_hash_da_tela_de_conferencia',
      total_items: 2,
      created_at: '2026-10-21T10:00:00.000Z',
      approved_at: '2026-10-21T10:05:00.000Z'
    }

    await repo.savePortalApproval(approval)

    // Recupera por ID
    const retrieved = await repo.getPortalApproval('appr_task_100')
    expect(retrieved).not.toBeNull()
    expect(retrieved?.task_id).toBe('task_portal_launch_1')
    expect(retrieved?.status).toBe('approved')
    expect(retrieved?.diff).toHaveLength(2)
    expect(retrieved?.diff[0].studentName).toBe('Canário Arthur Pendente')
    expect(retrieved?.diff[0].matricula).toBe('20260088')
    expect(retrieved?.diff[0].value).toBe(9.5)
    expect(retrieved?.approved_at).toBe('2026-10-21T10:05:00.000Z')

    // Recupera por Task ID
    const retrievedByTask = await repo.getPortalApprovalByTask('task_portal_launch_1')
    expect(retrievedByTask?.id).toBe('appr_task_100')
    expect(retrievedByTask?.diff[1].studentName).toBe('Canário Beatriz Silveira')
  })

  it('2. Varredura Binária do Banco: asserta ausência de nomes canários em UTF-8 e UTF-16LE com controle positivo', async () => {
    const repo = new ConversationVaultRepository(driver, dataKey)

    const canarioName = 'Canário Ultrassecreto Silva'
    const canarioMat = 'MATRICULA_CANARIO_99999'

    const approval: PortalApprovalRecord = {
      id: 'appr_vault_canario_01',
      task_id: 'task_canario_audit',
      portal_id: 'portal_teste',
      portal_name: 'Portal Teste',
      action_type: 'write_grades',
      status: 'approved',
      diff: [
        {
          studentName: canarioName,
          matricula: canarioMat,
          field: 'nota',
          value: 8.5
        }
      ],
      total_items: 1,
      approved_at: new Date().toISOString()
    }

    await repo.savePortalApproval(approval)

    // Checkpoint para garantir que dados foram escritos no arquivo em disco
    await driver.execute('PRAGMA wal_checkpoint(TRUNCATE);')

    // Lê os arquivos físicos (.db, -wal, -journal)
    const filesToScan = [
      dbPath,
      `${dbPath}-wal`,
      `${dbPath}-journal`
    ].filter(f => fs.existsSync(f))

    expect(filesToScan.length).toBeGreaterThan(0)

    for (const filePath of filesToScan) {
      const fileBytes = fs.readFileSync(filePath)
      const utf8Text = fileBytes.toString('utf8')
      const utf16leText = fileBytes.toString('utf16le')

      // Assertiva Negativa Estrita: O nome canário e matrícula NUNCA devem aparecer no disco
      expect(utf8Text).not.toContain(canarioName)
      expect(utf8Text).not.toContain(canarioMat)
      expect(utf16leText).not.toContain(canarioName)
      expect(utf16leText).not.toContain(canarioMat)

      // Controle Positivo: O envelope cifrado enc:v1: DEVE estar presente no disco
      if (filePath === dbPath) {
        expect(utf8Text).toContain('enc:v1:')
      }
    }
  })

  it('3. Estado "pending" com approved_at NULL e restrição CHECK que exige approved_at em status "approved"', async () => {
    const repo = new ConversationVaultRepository(driver, dataKey)

    // Caso A: Estado 'pending' é válido com approved_at NULL
    const pendingApproval: PortalApprovalRecord = {
      id: 'appr_pending_01',
      task_id: 'task_pending_1',
      portal_id: 'portal_escolar',
      portal_name: 'Portal Escolar',
      action_type: 'write_frequencia',
      status: 'pending',
      diff: [{ studentName: 'Aluno X', field: 'presenca', value: 'P' }],
      total_items: 1,
      approved_at: null
    }

    await expect(repo.savePortalApproval(pendingApproval)).resolves.not.toThrow()
    const fetchedPending = await repo.getPortalApproval('appr_pending_01')
    expect(fetchedPending?.status).toBe('pending')
    expect(fetchedPending?.approved_at).toBeNull()

    // Caso B: Inserção direta de status='approved' com approved_at=NULL viola o CHECK do SQLite
    await expect(
      driver.execute(
        `INSERT INTO portal_write_approvals (
          id, task_id, portal_id, portal_name, action_type, status, diff_encrypted, total_items, approved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['appr_invalid_check', 'task_x', 'p1', 'Portal 1', 'write', 'approved', 'enc:v1:dummy', 1, null]
      )
    ).rejects.toThrow(/CHECK constraint failed/)
  })

  it('4. Canal IPC nativo aceita métodos de aprovação e rejeita métodos fora da allowlist', async () => {
    const approval: PortalApprovalRecord = {
      id: 'appr_ipc_01',
      task_id: 'task_ipc_1',
      portal_id: 'portal_ipc',
      portal_name: 'Portal IPC',
      action_type: 'write_grades',
      status: 'approved',
      diff: [{ studentName: 'Aluno IPC', field: 'nota', value: 9.0 }],
      total_items: 1,
      approved_at: new Date().toISOString()
    }

    // 1. Salva via método IPC autorizado
    const saveRes = await executeConversationMethod(
      'conversation.portal.saveApproval',
      { approval },
      driver,
      dataKey
    )
    expect(saveRes.success).toBe(true)
    expect(saveRes.id).toBe('appr_ipc_01')

    // 2. Consulta via método IPC autorizado
    const getRes = await executeConversationMethod(
      'conversation.portal.getApproval',
      { id: 'appr_ipc_01' },
      driver,
      dataKey
    )
    expect(getRes.success).toBe(true)
    expect(getRes.approval.task_id).toBe('task_ipc_1')
    expect(getRes.approval.diff[0].studentName).toBe('Aluno IPC')

    // 3. Lista via método IPC autorizado
    const listRes = await executeConversationMethod(
      'conversation.portal.listApprovals',
      { status: 'approved' },
      driver,
      dataKey
    )
    expect(listRes.success).toBe(true)
    expect(listRes.approvals.length).toBeGreaterThan(0)

    // 4. Rejeição categórica de método desconhecido / fora da allowlist
    await expect(
      executeConversationMethod('conversation.portal.unauthorizedHack', {}, driver, dataKey)
    ).rejects.toThrow(/Método de conversação desconhecido/)
  })

  it('5. portal_execution_logs na nuvem: extrai e envia APENAS contagens anônimas, zero PII no extracted_data', async () => {
    const originalFetch = global.fetch
    const originalEnvUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const originalEnvKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-key'

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as any)
    global.fetch = fetchMock

    try {
      await savePortalExecutionLogToSupabase({
        portalId: 'portal_machado',
        portalName: 'Machado Sobrinho',
        actionType: 'write_grades',
        title: 'Lançamento de Notas',
        filledCount: 25,
        extractedData: {
          taskId: 'task_audit_10',
          // Dados sensíveis que devem ser categoricamente eliminados do envio
          writeItems: [{ studentName: 'Canário Proibido', matricula: '999', value: 10 }],
          students: ['Canário Proibido'],
          diff: [{ name: 'Canário Proibido', nota: 10 }],
          studentName: 'Canário Proibido',
          metricSummary: { media: 8.5 }
        }
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, options] = fetchMock.mock.calls[0]
      expect(String(url)).toContain('/rest/v1/portal_execution_logs')

      const bodyStr = String(options.body)
      // Zero PII na nuvem
      expect(bodyStr).not.toContain('Canário Proibido')
      expect(bodyStr).not.toContain('writeItems')
      expect(bodyStr).not.toContain('studentName')
      // Metadados agregados permitidos
      expect(bodyStr).toContain('"filled_count":25')
      expect(bodyStr).toContain('"metricSummary"')
    } finally {
      global.fetch = originalFetch
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnvUrl
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalEnvKey
    }
  })
})
