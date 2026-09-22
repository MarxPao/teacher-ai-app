import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST, DELETE, OPTIONS } from '../app/api/agent/dossier/route'

describe('Dossier API Route (/api/agent/dossier)', () => {
  it('deve responder OPTIONS com status 204 e headers CORS liberados', async () => {
    const res = await OPTIONS()
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET, POST, DELETE')
  })

  it('deve criar e atualizar dossiê de aluno via POST e consultá-lo via GET com normalização', async () => {
    const postReq = new NextRequest('http://localhost:3000/api/agent/dossier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName: 'Alice Souza',
        score: 9.0,
        feedback: 'Excelente redação dissertativa.',
        strengths: ['Coesão', 'Argumentação'],
        accommodation: 'Tempo extra'
      })
    })

    const postRes = await POST(postReq)
    expect(postRes.status).toBe(201)
    const postData = await postRes.json()
    expect(postData.ok).toBe(true)
    expect(postData.dossier.studentNameClean).toBe('alice souza')
    expect(postData.dossier.pedagogicalProfile.strengths).toContain('Coesão')
    expect(postData.dossier.pedagogicalProfile.accommodations).toContain('Tempo extra')

    // Consulta com acentuação ou caixa diferente
    const getReq = new NextRequest('http://localhost:3000/api/agent/dossier?student=Álice%20Souza')
    const getRes = await GET(getReq)
    const getData = await getRes.json()
    expect(getData.ok).toBe(true)
    expect(getData.dossier).not.toBeNull()
    expect(getData.dossier.studentNameClean).toBe('alice souza')

    // Purga LGPD via DELETE
    const delReq = new NextRequest('http://localhost:3000/api/agent/dossier?student=alice%20souza', {
      method: 'DELETE'
    })
    const delRes = await DELETE(delReq)
    const delData = await delRes.json()
    expect(delData.ok).toBe(true)
    expect(delData.purged).toBe(true)
  })
})
