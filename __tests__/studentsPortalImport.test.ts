import { describe, it, expect, beforeEach, vi } from 'vitest'
import { reconcileRosterBatch, applyReconciliationDecisions, LocalStudentRecord, ScrapedStudentRecord } from '../lib/rosterReconciler'
import { createBrowserTask } from '../lib/browserAutomationClient'
import { sanitizeOutboundPayload } from '../lib/portalSanitizer'

describe('Students.tsx Portal Import Integration Suite (Machado Sobrinho)', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} }
    })
    vi.clearAllMocks()
  })

  it('1. Prepara payload correto para a URL real do Machado Sobrinho', () => {
    const rawPayload = {
      platform: 'machadosobrinho.paineldoaluno.com.br',
      actionType: 'read_roster',
      title: 'Importar Roster de Alunos — Machado Sobrinho',
      classRef: 'all',
      url: 'https://machadosobrinho.paineldoaluno.com.br/professor_notas',
      read_only: true,
      pagination: {
        type: 'next_button',
        nextSelector: '.pagination .next, a[rel="next"]',
        maxPages: 10,
        delayBetweenPagesMs: 1000
      }
    }

    const clean = sanitizeOutboundPayload(rawPayload)
    expect(clean.platform).toBe('machadosobrinho.paineldoaluno.com.br')
    expect(clean.actionType).toBe('read_roster')
    expect(clean.url).toBe('https://machadosobrinho.paineldoaluno.com.br/professor_notas')
    expect(clean.read_only).toBe(true)
  })

  it('2. Cria browser_automation_task de leitura do roster no Supabase / Client', async () => {
    const task = await createBrowserTask({
      portal: 'machadosobrinho.paineldoaluno.com.br',
      actionType: 'read_roster',
      payload: {
        url: 'https://machadosobrinho.paineldoaluno.com.br/professor_notas',
        class_ref: 'all',
        read_only: true
      },
      approvalMode: 'batch',
      classRef: 'all',
      studentCount: 2
    })

    expect(task).toBeDefined()
    expect(task?.portal).toBe('machadosobrinho.paineldoaluno.com.br')
    expect(task?.action_type).toBe('read_roster')
    expect((task?.payload as any)?.read_only).toBe(true)
  })

  it('3. Reconcilia alunos lidos com a base local e aplica decisões com rastreabilidade', () => {
    // Alunos existentes locais
    const currentStudents: LocalStudentRecord[] = [
      {
        id: 'stu_1',
        name: 'Ana Júlia Ferreira',
        classId: 'cls_1',
        className: 'Turma Piloto',
        schoolId: 'sch_1',
        notes: 'Aluna muito participativa',
        level: 'B1',
        grades: { 'Av1': '9.5' },
        source_type: 'manual_entry',
        sync_status: 'local_only'
      },
      {
        id: 'stu_local_only',
        name: 'Zuleica Santos',
        classId: 'cls_1',
        className: 'Turma Piloto',
        schoolId: 'sch_1',
        notes: 'Aluno particular',
        level: 'A2',
        source_type: 'manual_entry',
        sync_status: 'local_only'
      }
    ]

    // Alunos raspados do portal oficial do Machado Sobrinho
    const scrapedFromPortal: ScrapedStudentRecord[] = [
      {
        name: 'Ana Júlia Ferreira',
        rollNumber: '01',
        portal_native_id: 'MAT_MACHADO_001',
        status: 'active',
        nee_flag: true,
        classRef: 'Turma Piloto'
      },
      {
        name: 'Bruno Henrique Lima',
        rollNumber: '02',
        portal_native_id: 'MAT_MACHADO_002',
        status: 'active',
        nee_flag: false,
        classRef: 'Turma Piloto'
      }
    ]

    // Executa reconciliação
    const recResult = reconcileRosterBatch(scrapedFromPortal, currentStudents, { portalName: 'Machado Sobrinho' })

    expect(recResult.totalPortalCount).toBe(2)
    expect(recResult.autoMergedCount).toBe(1) // Ana Júlia Ferreira
    expect(recResult.newImportedCount).toBe(1)   // Bruno Henrique Lima
    expect(recResult.unmatchedLocalCount).toBe(1) // Zuleica Santos

    // Aplica as decisões de reconciliação
    const { updatedStudents, logSummary } = applyReconciliationDecisions(
      recResult.items,
      currentStudents,
      'Machado Sobrinho'
    )

    expect(logSummary.total).toBe(3) // 1 mesclado + 1 novo + 1 preservado

    // Verifica aluno mesclado (Ana Júlia): dados do portal atualizados + dados pedagógicos preservados
    const ana = updatedStudents.find(s => s.name === 'Ana Júlia Ferreira')
    expect(ana).toBeDefined()
    expect(ana?.portal_native_id).toBe('MAT_MACHADO_001')
    expect(ana?.source_type).toBe('portal_scrape')
    expect(ana?.source_portal).toBe('Machado Sobrinho')
    expect(ana?.sync_status).toBe('synced')
    expect(ana?.notes).toBe('Aluna muito participativa') // Preservado
    expect(ana?.grades).toEqual({ 'Av1': '9.5' })        // Preservado

    // Verifica novo aluno importado (Bruno Henrique)
    const bruno = updatedStudents.find(s => s.name === 'Bruno Henrique Lima')
    expect(bruno).toBeDefined()
    expect(bruno?.portal_native_id).toBe('MAT_MACHADO_002')
    expect(bruno?.source_type).toBe('portal_scrape')
    expect(bruno?.source_portal).toBe('Machado Sobrinho')
    expect(bruno?.sync_status).toBe('synced')

    // Verifica aluno local não vinculado (Zuleica): preservado como local_only
    const zuleica = updatedStudents.find(s => s.name === 'Zuleica Santos')
    expect(zuleica).toBeDefined()
    expect(zuleica?.sync_status).toBe('local_only')
  })
})
