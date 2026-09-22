import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { purgeExpiredClassroomAudio } from '@/lib/classroomAudioPurge'

describe('Classroom Audio Purge — Conformidade LGPD & Zero-Retention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retorna contagem zero quando nenhuma gravação está expirada', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/rest/v1/class_recording_sessions')) {
        return {
          ok: true,
          status: 200,
          json: async () => []
        }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', mockFetch)

    const report = await purgeExpiredClassroomAudio({
      supabaseUrl: 'https://test.supabase.co',
      serviceKey: 'test-key'
    })

    expect(report.expiredSessionsCount).toBe(0)
    expect(report.purgedSessionsCount).toBe(0)
    expect(report.deletedFilesCount).toBe(0)
    expect(report.summary).toContain('Nenhuma gravação de aula com prazo de retenção expirado')
  })

  it('MODO DRY-RUN: mapeia sessões e arquivos expirados sem executar deleção física', async () => {
    const mockSessions = [
      {
        id: 'sess_exp_1',
        audio_storage_path: 'recordings/sess_exp_1/full.opus',
        created_at: '2026-09-01T10:00:00Z',
        audio_retained_until: '2026-09-08T10:00:00Z'
      }
    ]

    const mockChunks = [
      { id: 'chk_1', storage_path: 'recordings/sess_exp_1/chunk_0.opus' },
      { id: 'chk_2', storage_path: 'recordings/sess_exp_1/chunk_1.opus' }
    ]

    const callsMade: { url: string; method: string }[] = []

    const mockFetch = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      const method = opts?.method || 'GET'
      callsMade.push({ url, method })

      if (url.includes('/rest/v1/class_recording_sessions')) {
        return { ok: true, status: 200, json: async () => mockSessions }
      }
      if (url.includes('/rest/v1/class_recording_chunks')) {
        return { ok: true, status: 200, json: async () => mockChunks }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', mockFetch)

    const report = await purgeExpiredClassroomAudio({
      dryRun: true,
      supabaseUrl: 'https://test.supabase.co',
      serviceKey: 'test-key'
    })

    expect(report.dryRun).toBe(true)
    expect(report.expiredSessionsCount).toBe(1)
    expect(report.deletedFilesCount).toBe(3) // 1 full + 2 chunks
    expect(report.deletedStoragePaths).toEqual([
      'recordings/sess_exp_1/full.opus',
      'recordings/sess_exp_1/chunk_0.opus',
      'recordings/sess_exp_1/chunk_1.opus'
    ])
    expect(report.summary).toContain('[SIMULAÇÃO]')

    // Confirma que NÃO houve chamada DELETE no Storage nem PATCH no banco
    const deleteCalls = callsMade.filter(c => c.method === 'DELETE')
    const patchCalls = callsMade.filter(c => c.method === 'PATCH')
    expect(deleteCalls.length).toBe(0)
    expect(patchCalls.length).toBe(0)
  })

  it('EXECUÇÃO REAL: descarta arquivos no Storage e atualiza audio_purged_at no DB', async () => {
    const mockSessions = [
      {
        id: 'sess_exp_2',
        audio_storage_path: 'recordings/sess_exp_2/master.opus',
        created_at: '2026-09-01T10:00:00Z',
        audio_retained_until: '2026-09-08T10:00:00Z'
      }
    ]

    const storagePayloads: any[] = []
    const patchPayloads: any[] = []

    const mockFetch = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      const method = opts?.method || 'GET'

      if (url.includes('/rest/v1/class_recording_sessions') && method === 'GET') {
        return { ok: true, status: 200, json: async () => mockSessions }
      }
      if (url.includes('/rest/v1/class_recording_chunks') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 'chk_10', storage_path: 'recordings/sess_exp_2/chunk_0.opus' }]
        }
      }
      if (url.includes('/storage/v1/object/class-recordings') && method === 'DELETE') {
        storagePayloads.push(JSON.parse(opts?.body as string))
        return { ok: true, status: 200, json: async () => ({ message: 'Deleted' }) }
      }
      if (url.includes('/rest/v1/class_recording_sessions') && method === 'PATCH') {
        patchPayloads.push(JSON.parse(opts?.body as string))
        return { ok: true, status: 200, json: async () => ({}) }
      }
      if (url.includes('/rest/v1/class_recording_chunks') && method === 'PATCH') {
        return { ok: true, status: 200, json: async () => ({}) }
      }

      return { ok: true, status: 200, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', mockFetch)

    const report = await purgeExpiredClassroomAudio({
      dryRun: false,
      supabaseUrl: 'https://test.supabase.co',
      serviceKey: 'test-key'
    })

    expect(report.dryRun).toBe(false)
    expect(report.expiredSessionsCount).toBe(1)
    expect(report.purgedSessionsCount).toBe(1)
    expect(report.deletedFilesCount).toBe(2)
    expect(report.errors.length).toBe(0)
    expect(report.summary).toContain('[PURGA CONCLUÍDA]')

    // Valida payload de exclusão no bucket
    expect(storagePayloads.length).toBe(1)
    expect(storagePayloads[0].prefixes).toEqual([
      'recordings/sess_exp_2/master.opus',
      'recordings/sess_exp_2/chunk_0.opus'
    ])

    // Valida anulação no DB
    expect(patchPayloads.length).toBe(1)
    expect(patchPayloads[0].audio_storage_path).toBeNull()
    expect(patchPayloads[0].audio_purged_at).toBeDefined()
  })
})
