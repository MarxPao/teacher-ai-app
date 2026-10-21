import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isSupabaseConfigured,
  fetchStudentsFromSupabase,
  upsertStudentToSupabase,
  deleteStudentFromSupabase,
  saveStudentMetricsToSupabase
} from '@/lib/supabaseClient'

describe('Students Supabase Sync - Salvaguarda LGPD Trilho 1 (Bloqueio Fail-Closed)', () => {
  const originalFetch = global.fetch
  const mockSupabaseUrl = 'https://parxakvjvuvsmvbvrshk.supabase.co'
  const mockAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock_key'

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', mockSupabaseUrl)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', mockAnonKey)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => []
    } as any)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('1. isSupabaseConfigured retorna true quando URL e anonKey estão configuradas', () => {
    expect(isSupabaseConfigured()).toBe(true)
  })

  it('2. fetchStudentsFromSupabase bloqueia consulta de alunos em nuvem e retorna lista vazia (zero fetch)', async () => {
    const result = await fetchStudentsFromSupabase()
    // Fail-Closed: dados de discentes não são buscados da nuvem
    expect(result).toEqual([])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('3. upsertStudentToSupabase rejeita gravação de PII em nuvem com erro LGPD e emite ZERO fetch', async () => {
    const studentToSave = {
      id: 'stu_200',
      name: 'João Pedro',
      classId: 'cls_3em',
      schoolId: 'sc_2',
      grades: { prova1: 7.5 },
      metrics: { academic: 7.5 }
    }

    const res = await upsertStudentToSupabase(studentToSave)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('Bloqueio de Segurança LGPD (Trilho 1)')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('4. deleteStudentFromSupabase não emite requisição DELETE à nuvem (gestão estritamente local)', async () => {
    const success = await deleteStudentFromSupabase('stu_del_999')
    expect(success).toBe(true)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('5. saveStudentMetricsToSupabase bloqueia gravação de métricas discentes em nuvem e emite ZERO fetch', async () => {
    const newMetrics = { academic: 9.0, progression: 8.5 }
    const success = await saveStudentMetricsToSupabase('stu_200', newMetrics)
    expect(success).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
