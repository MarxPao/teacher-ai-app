import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST, PATCH, DELETE, OPTIONS } from '../app/api/agent/tasks/route'

describe('Tasks API Route (/api/agent/tasks)', () => {
  beforeEach(async () => {
    // Limpar tarefas criando e deletando se necessário
  })

  it('deve responder OPTIONS com status 204 e headers CORS liberados', async () => {
    const res = await OPTIONS()
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET, POST, PATCH, DELETE')
  })

  it('deve extrair e criar uma tarefa a partir de texto livre via POST', async () => {
    const req = new NextRequest('http://localhost:3000/api/agent/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'preciso lançar a chamada do 3º ano amanhã às 15h'
      })
    })

    const res = await POST(req)
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.isTask).toBe(true)
    expect(data.task.title).toContain('Lançar a chamada do 3º ano')
    expect(data.task.status).toBe('pendente')
  })

  it('deve criar tarefa estruturada direta via POST e recuperá-la via GET', async () => {
    const createReq = new NextRequest('http://localhost:3000/api/agent/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Reunião com Coordenação Pedagógica',
        priority: 'alta'
      })
    })

    const createRes = await POST(createReq)
    const createData = await createRes.json()
    expect(createData.ok).toBe(true)
    const taskId = createData.task.id

    // Consulta via GET
    const getReq = new NextRequest('http://localhost:3000/api/agent/tasks')
    const getRes = await GET(getReq)
    const getData = await getRes.json()
    expect(getData.ok).toBe(true)
    const found = getData.tasks.find((t: any) => t.id === taskId)
    expect(found).toBeDefined()
    expect(found.title).toBe('Reunião com Coordenação Pedagógica')
    expect(found.priority).toBe('alta')

    // Atualização via PATCH
    const patchReq = new NextRequest('http://localhost:3000/api/agent/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: taskId,
        status: 'concluida'
      })
    })
    const patchRes = await PATCH(patchReq)
    const patchData = await patchRes.json()
    expect(patchData.ok).toBe(true)
    expect(patchData.task.status).toBe('concluida')
    expect(patchData.task.completedAt).toBeDefined()

    // Exclusão via DELETE
    const deleteReq = new NextRequest(`http://localhost:3000/api/agent/tasks?id=${taskId}`, {
      method: 'DELETE'
    })
    const deleteRes = await DELETE(deleteReq)
    const deleteData = await deleteRes.json()
    expect(deleteData.ok).toBe(true)
    expect(deleteData.deleted).toBe(true)
  })
})
