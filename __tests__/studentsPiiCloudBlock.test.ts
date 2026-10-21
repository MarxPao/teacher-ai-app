import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST, DELETE } from '../app/api/students/route'
import { POST as importStudentsPOST } from '../app/api/students/import/route'
import { POST as rosterSyncPOST } from '../app/api/portal/roster-sync/route'
import {
  upsertStudentToSupabase,
  saveStudentToSupabase,
  saveStudentMetricsToSupabase,
  deleteStudentFromSupabase,
  syncToSupabase
} from '../lib/supabaseClient'

describe('T1. Salvaguarda LGPD: Bloqueio Fail-Closed de PII em Nuvem (/api/students)', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('POST /api/students rejeita envio de PII com HTTP 403 e NÃO emite fetch para Supabase', async () => {
    const piiPayload = {
      id: 'stu_canario_01',
      name: 'Canário Arthur de Souza',
      email: 'arthur.canario@escola.edu.br',
      grades: { bimestre1: 9.5, simulado: 8.0 },
      notes: 'Aluno com alta participação em ciências',
      nee_flag: false
    }

    const req = new NextRequest('http://localhost:3000/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(piiPayload)
    })

    const res = await POST(req)
    const json = await res.json()

    // 1. Resposta fail-closed com status 403
    expect(res.status).toBe(403)
    expect(json.ok).toBe(false)
    expect(json.code).toBe('E_STUDENT_PII_CLOUD_DISABLED')
    expect(json.error).toContain('Bloqueio de Segurança LGPD (Trilho 1)')
    expect(json.error).toContain('cofre SQLite local cifrado')

    // 2. Prova cabal: nenhuma chamada de rede / fetch para Supabase foi emitida
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('GET /api/students bloqueia consulta de PII em nuvem e NÃO emite fetch', async () => {
    const req = new NextRequest('http://localhost:3000/api/students?classId=turma_9a', {
      method: 'GET'
    })

    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.ok).toBe(false)
    expect(json.code).toBe('E_STUDENT_PII_CLOUD_DISABLED')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('DELETE /api/students bloqueia mutação de dados em nuvem e NÃO emite fetch', async () => {
    const req = new NextRequest('http://localhost:3000/api/students?id=stu_canario_01', {
      method: 'DELETE'
    })

    const res = await DELETE(req)
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.ok).toBe(false)
    expect(json.code).toBe('E_STUDENT_PII_CLOUD_DISABLED')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('H2: POST /api/students/import bloqueia envio de alunos para nuvem com HTTP 403 e NÃO emite fetch', async () => {
    const importPayload = {
      className: '6º Ano B - Ciências',
      portalName: 'Machado Sobrinho',
      students: [
        { name: 'Canário Beatriz Lima', matricula: '2026001' },
        { name: 'Canário Carlos Eduardo', matricula: '2026002' }
      ]
    }

    const req = new NextRequest('http://localhost:3000/api/students/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(importPayload)
    })

    const res = await importStudentsPOST(req)
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.ok).toBe(false)
    expect(json.code).toBe('E_STUDENT_PII_CLOUD_DISABLED')
    expect(json.error).toContain('Sincronização de dados de estudantes com a nuvem está desativada por política de privacidade e LGPD')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('H2: POST /api/portal/roster-sync bloqueia reconciliação em nuvem com HTTP 403 e NÃO emite fetch', async () => {
    const rosterPayload = {
      className: '7º Ano A',
      portalName: 'Portal Escolar',
      students: [
        { name: 'Canário Daniel Alves', rollNumber: '1', portalStudentId: 'std_01' }
      ]
    }

    const req = new NextRequest('http://localhost:3000/api/portal/roster-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rosterPayload)
    })

    const res = await rosterSyncPOST(req)
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.ok).toBe(false)
    expect(json.code).toBe('E_STUDENT_PII_CLOUD_DISABLED')
    expect(json.error).toContain('Sincronização de lista de alunos com a nuvem está desativada por política de privacidade e LGPD')
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('H3. Desativação de PII de Estudantes no Supabase (lib/supabaseClient)', () => {
  const originalFetch = global.fetch
  const originalEnvUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalEnvKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key'
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => []
    } as any)
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnvUrl
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalEnvKey
    vi.restoreAllMocks()
  })

  it('upsertStudentToSupabase e saveStudentToSupabase bloqueiam envio e emitem ZERO fetch', async () => {
    const student = {
      id: 'stu_canario_99',
      name: 'Canário Mariana Silva',
      email: 'mariana.canario@escola.br',
      grades: { b1: 9.0, b2: 8.5 },
      metrics: { autonomy: 85, focus: 90 },
      nee_flag: true
    }

    const res1 = await upsertStudentToSupabase(student)
    expect(res1.ok).toBe(false)
    expect(res1.error).toContain('Bloqueio de Segurança LGPD')
    expect(global.fetch).not.toHaveBeenCalled()

    const res2 = await saveStudentToSupabase(student)
    expect(res2.ok).toBe(false)
    expect(res2.error).toContain('Bloqueio de Segurança LGPD')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('saveStudentMetricsToSupabase e deleteStudentFromSupabase emitem ZERO fetch', async () => {
    const resMetrics = await saveStudentMetricsToSupabase('stu_canario_99', { focus: 95 })
    expect(resMetrics).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()

    const resDelete = await deleteStudentFromSupabase('stu_canario_99')
    expect(resDelete).toBe(true)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('syncToSupabase expurga teacher_students e teacher_private_students com ZERO envio de PII na rede', async () => {
    const payload = {
      teacher_schools: [{ id: 'sch_1', name: 'Escola Modelo' }],
      teacher_classes: [{ id: 'cls_1', name: '8º Ano A', schoolId: 'sch_1' }],
      teacher_saved_lessons: [{ id: 'les_1', title: 'Fotossíntese', topic: 'Biologia' }],
      teacher_students: [
        {
          id: 'stu_canario_1',
          name: 'Canário Pedro',
          email: 'pedro@canario.edu.br',
          phone: '(11) 99999-0000',
          parent_name: 'Canário Pai',
          grades: { p1: 8.0 },
          metrics: { engajamento: 80 },
          nee_flag: true
        }
      ],
      teacher_private_students: [
        {
          id: 'priv_canario_1',
          name: 'Canário Júlia Particular',
          guardian_name: 'Responsável Canário',
          phone: '(11) 98888-7777',
          email: 'julia@canario.edu.br',
          monthly_fee: 450
        }
      ]
    }

    const res = await syncToSupabase(payload as any)
    expect(res.ok).toBe(true)

    const fetchCalls = (global.fetch as any).mock.calls
    expect(fetchCalls.length).toBeGreaterThan(0)

    for (const [url, options] of fetchCalls) {
      const urlStr = String(url)
      // 1. NUNCA deve chamar as rotas relacionais de students ou private_students
      expect(urlStr).not.toContain('/rest/v1/students')
      expect(urlStr).not.toContain('/rest/v1/private_students')

      // 2. O corpo da requisição NUNCA deve conter dados ou campos sensíveis de alunos
      const bodyStr = options?.body ? String(options.body) : ''
      expect(bodyStr).not.toContain('Canário Pedro')
      expect(bodyStr).not.toContain('pedro@canario.edu.br')
      expect(bodyStr).not.toContain('Canário Júlia Particular')
      expect(bodyStr).not.toContain('teacher_students')
      expect(bodyStr).not.toContain('teacher_private_students')
      expect(bodyStr).not.toContain('guardian_name')
      expect(bodyStr).not.toContain('parent_name')
    }

    // 3. Prova positiva: turmas, escolas e aulas continuam sendo enviadas
    const requestedUrls = fetchCalls.map((c: any) => String(c[0]))
    expect(requestedUrls.some((u: string) => u.includes('/rest/v1/schools'))).toBe(true)
    expect(requestedUrls.some((u: string) => u.includes('/rest/v1/classes'))).toBe(true)
    expect(requestedUrls.some((u: string) => u.includes('/rest/v1/lessons'))).toBe(true)
  })
})
