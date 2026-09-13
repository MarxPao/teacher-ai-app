import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Write-Through Synchronization & Audit Verification', () => {
  let mockFetch: any
  let fetchCalls: Array<{ url: string; options: any }> = []

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://parxakvjvuvsmvbvrshk.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock_test_key_service_role'
    fetchCalls = []
    mockFetch = vi.fn(async (url: string, options: any) => {
      fetchCalls.push({ url, options })

      // Simula consulta de matrícula ou nome
      if (url.includes('/rest/v1/students?or=')) {
        if (url.includes('stu_mat_202601') || url.includes('202601')) {
          return {
            ok: true,
            json: async () => [{
              id: 'stu_mat_202601',
              name: 'Hugo Henrique Lima',
              class_name: '9º Ano A',
              grades: { 'Nota P1': '8.0' },
              metrics: { matricula: '202601', portal_native_id: '202601' }
            }]
          }
        }
        return { ok: true, json: async () => [] }
      }

      if (url.includes('/rest/v1/students?name=ilike.')) {
        if (url.includes('Hugo%20Ambiguo')) {
          return {
            ok: true,
            json: async () => [
              { id: 'stu_1', name: 'Hugo Ambiguo', class_name: 'Turma A', grades: {} },
              { id: 'stu_2', name: 'Hugo Ambiguo', class_name: 'Turma B', grades: {} }
            ]
          }
        }
        return {
          ok: true,
          json: async () => [{
            id: 'stu_123',
            name: 'Hugo Henrique',
            class_name: '9º Ano A',
            grades: { 'Nota 1': 7.0 },
            metrics: {}
          }]
        }
      }

      // Simula PATCH ou POST
      return {
        ok: true,
        text: async () => 'OK',
        json: async () => [{ id: 'mock_result', ok: true }]
      }
    })

    vi.stubGlobal('fetch', mockFetch)
  })

  it('1. POST /api/students/write-through atualiza grades no aluno existente por matrícula', async () => {
    const { POST } = await import('../app/api/students/write-through/route')

    const req = {
      json: async () => ({
        taskId: 'task_wt_001',
        portal: 'Machado Sobrinho',
        actionType: 'lancar_nota',
        classRef: '9º Ano A',
        diff: [
          { studentName: 'Hugo Henrique Lima', matricula: '202601', field: 'Nota P2', afterValue: '9.5' }
        ]
      })
    } as any

    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.updatedCount).toBe(1)
    expect(json.persisted).toBe(true)

    // Verifica que houve PATCH com o novo campo em grades
    const patchCall = fetchCalls.find(c => c.options?.method === 'PATCH')
    expect(patchCall).toBeDefined()
    const patchBody = JSON.parse(patchCall?.options?.body)
    expect(patchBody.grades['Nota P2']).toBe('9.5')
    expect(patchBody.grades['Nota P1']).toBe('8.0') // Preserva notas prévias

    // Verifica que gerou log em portal_execution_logs
    const logCall = fetchCalls.find(c => c.url.includes('/rest/v1/portal_execution_logs'))
    expect(logCall).toBeDefined()
    const logBody = JSON.parse(logCall?.options?.body)
    expect(logBody.action_type).toBe('lancar_nota')
    expect(logBody.filled_count).toBe(1)
  })

  it('2. POST /api/students/write-through bloqueia alteração silenciosa se houver homônimos sem turma ou matrícula', async () => {
    const { POST } = await import('../app/api/students/write-through/route')

    const req = {
      json: async () => ({
        taskId: 'task_wt_002',
        portal: 'Machado Sobrinho',
        actionType: 'lancar_nota',
        // Sem classRef e sem matrícula
        diff: [
          { studentName: 'Hugo Ambiguo', field: 'Nota P1', afterValue: '10.0' }
        ]
      })
    } as any

    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.updatedCount).toBe(0) // Não aplicou silenciosamente!
    expect(json.results[0].status).toBe('ambiguous')
    expect(json.results[0].error).toContain('Homônimos')

    // Confirma que NÃO executou PATCH em nenhum dos dois homônimos
    const patchCall = fetchCalls.find(c => c.options?.method === 'PATCH')
    expect(patchCall).toBeUndefined()
  })

  it('3. POST /api/students/write-through cria aluno write-through se não existir previamente', async () => {
    const { POST } = await import('../app/api/students/write-through/route')

    // Mock para retornar vazio na busca por matrícula e nome
    mockFetch.mockImplementation(async (url: string, options: any) => {
      fetchCalls.push({ url, options })
      if (options?.method === 'GET' || !options?.method) {
        return { ok: true, json: async () => [] }
      }
      return { ok: true, json: async () => [{ id: 'new_stu_created' }] }
    })

    const req = {
      json: async () => ({
        taskId: 'task_wt_003',
        portal: 'Machado Sobrinho',
        classRef: '7º Ano C',
        studentName: 'Novo Aluno Inédito',
        matricula: '2026-999',
        field: 'Nota Simulado',
        value: '9.0'
      })
    } as any

    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.updatedCount).toBe(1)

    const insertCall = fetchCalls.find(c => c.options?.method === 'POST' && c.url.includes('/rest/v1/students'))
    expect(insertCall).toBeDefined()
    const insertBody = JSON.parse(insertCall?.options?.body)[0]
    expect(insertBody.name).toBe('Novo Aluno Inédito')
    expect(insertBody.grades['Nota Simulado']).toBe('9.0')
    expect(insertBody.metrics.matricula).toBe('2026-999')
  })

  it('4. Proteção Anti-Corrida: Read-Through (/api/students/import) não sobrescreve notas recém gravadas via Write-Through', async () => {
    const { POST: importPost } = await import('../app/api/students/import/route')

    // Simula que no banco já existe um aluno com write_lock_until ativo (Write-Through recente de 9.5)
    mockFetch.mockImplementation(async (url: string, options: any) => {
      fetchCalls.push({ url, options })

      if (url.includes('/rest/v1/classes')) {
        return { ok: true, json: async () => [{ id: 'cls_9a', name: '9º Ano A' }] }
      }

      // Consulta de alunos existentes na turma
      if (url.includes('/rest/v1/students?class_id=eq.')) {
        return {
          ok: true,
          json: async () => [{
            id: 'stu_mat_202601',
            name: 'Hugo Henrique Lima',
            grades: { 'Nota P1': '9.5' }, // Nota garantida pelo write-through
            metrics: {
              matricula: '202601',
              portal_native_id: '202601',
              last_write_through_at: new Date().toISOString(),
              write_lock_until: new Date(Date.now() + 50000).toISOString() // Lock ativo por 50s
            }
          }]
        }
      }

      return { ok: true, json: async () => [{ id: 'ok' }] }
    })

    // Chega uma leitura concorrente do portal (scrape) que leu o portal antes do write ser gravado ou sem notas
    const importReq = {
      json: async () => ({
        className: '9º Ano A',
        portalName: 'Machado Sobrinho',
        students: [
          {
            name: 'Hugo Henrique Lima',
            matricula: '202601',
            grades: { 'Nota P1': '0.0' } // Leitura defasada do scrape!
          }
        ]
      })
    } as any

    const res = await importPost(importReq)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)

    // O payload enviado no upsert para o Supabase DEVE ter preservado 9.5 graças ao write-through lock
    const upsertCall = fetchCalls.find(c => c.options?.method === 'POST' && c.url.includes('/rest/v1/students'))
    expect(upsertCall).toBeDefined()
    const upsertRows = JSON.parse(upsertCall?.options?.body)
    expect(upsertRows[0].grades['Nota P1']).toBe('9.5') // NÃO foi sobrescrito pelo 0.0 do scrape!
    expect(upsertRows[0].metrics.anti_race_protected).toBe(true)
  })
})

