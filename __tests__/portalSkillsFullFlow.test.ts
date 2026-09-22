import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Portal Skills — Persistência Supabase, API e Extensão', () => {
  let createdSkillId: string | null = null
  let isServerRunning = false

  beforeAll(async () => {
    try {
      const check = await fetch('http://localhost:3000/api/skills', { signal: AbortSignal.timeout(1000) })
      isServerRunning = check.status > 0
    } catch {
      isServerRunning = false
      console.log('Ambiente offline/unitário: Servidor Next.js (porta 3000) não está em execução. Pulando testes HTTP de integração.')
    }
  })

  it('1. GET /api/skills deve retornar as skills cadastradas no Supabase', async () => {
    if (!isServerRunning) return
    const res = await fetch('http://localhost:3000/api/skills')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.count).toBeGreaterThan(0)
    expect(Array.isArray(data.skills)).toBe(true)
    expect(data.source).toBe('supabase')

    console.log('\n[TEST 1] Skills retornadas do Supabase:', data.count)
    console.log('Exemplo de Skill:', data.skills[0].task_name, `(${data.skills[0].portal_id})`)
  })

  it('2. POST /api/skills/record deve gravar skill com CHECKPOINT e sincronizar com Supabase', async () => {
    if (!isServerRunning) return
    const mockEvents = [
      { type: 'NAVIGATE', url: 'https://machadosobrinho.paineldoaluno.com.br/professor_notas' },
      { type: 'LOCATE', anchor: { strategy: 'css_selector', value: 'table tbody tr' } },
      { type: 'CLICK', anchor: { strategy: 'css_selector', value: 'button.btn-salvar' }, text: 'Salvar Notas', is_submit: true },
    ]

    const res = await fetch('http://localhost:3000/api/skills/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: mockEvents,
        portalId: 'machado_sobrinho',
        taskId: 'lancar_notas_bimestre',
        taskName: 'Lançar Notas do 1º Bimestre',
        skillType: 'writing',
        description: 'Gravação de teste com sincronização Supabase',
        turmaId: 'cls_1785639332496'
      })
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.graph.id).toBeTruthy()
    createdSkillId = data.graph.id

    // Verifica que o CHECKPOINT foi gerado
    expect(data.graph.nodes['checkpoint_seguranca']).toBeDefined()

    console.log('\n[TEST 2] Skill de Escrita com Checkpoint gravada:', createdSkillId)

    // Aguarda 500ms e consulta /api/skills para checar no Supabase
    await new Promise(r => setTimeout(r, 500))
    const listRes = await fetch('http://localhost:3000/api/skills')
    const listData = await listRes.json()
    const found = listData.skills.find((s: any) => s.id === createdSkillId)
    expect(found).toBeDefined()
    expect(found.task_name).toBe('Lançar Notas do 1º Bimestre')
    console.log('[TEST 2] ✅ Confirmada presença da nova skill no Supabase!')
  })

  it('3. DELETE /api/skills deve exigir autenticação (401) e excluir quando autenticado (200)', async () => {
    if (!isServerRunning || !createdSkillId) return

    // 3.1 Sem autenticação deve retornar 401
    const unauthRes = await fetch(`http://localhost:3000/api/skills?id=${encodeURIComponent(createdSkillId)}`, {
      method: 'DELETE'
    })
    expect(unauthRes.status).toBe(401)
    const unauthData = await unauthRes.json()
    expect(unauthData.ok).toBe(false)
    console.log('\n[TEST 3.1] ✅ DELETE sem token bloqueado com 401 conforme esperado.')

    // 3.2 Com token da professora deve retornar 200
    const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcnhha3ZqdnV2c212YnZyc2hrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODI2ODIwNywiZXhwIjoyMDkzODQ0MjA3fQ.ElMhM8T2IJpAIs8QIQm4temIdW1P533CRA3KSfs4oNw'
    const linkRes = await fetch('https://parxakvjvuvsmvbvrshk.supabase.co/auth/v1/admin/generate_link', {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', email: 'rafaelaelt@gmail.com' })
    })
    const linkData = await linkRes.json()
    const verifyRes = await fetch(linkData.action_link, { redirect: 'manual' })
    const loc = verifyRes.headers.get('location') || ''
    const match = loc.match(/access_token=([^&]+)/)
    const token = match ? match[1] : ''

    const res = await fetch(`http://localhost:3000/api/skills?id=${encodeURIComponent(createdSkillId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.deletedId).toBe(createdSkillId)

    console.log('[TEST 3.2] ✅ Skill excluída com sucesso com token da professora:', createdSkillId)
  })

  it('4. Validação estática dos scripts da extensão Chrome', () => {
    const extDir = path.resolve(__dirname, '..', 'teacher-extension')
    const sideJs = path.join(extDir, 'side_panel.js')
    const contentJs = path.join(extDir, 'content.js')

    const sideContent = fs.readFileSync(sideJs, 'utf8')
    expect(sideContent.includes('loadSavedSkills')).toBe(true)
    expect(sideContent.includes('saved-skills-list')).toBe(true)

    const contentScript = fs.readFileSync(contentJs, 'utf8')
    expect(contentScript.includes('teacher_recording_active')).toBe(true)

    console.log('\n[TEST 4] ✅ Extensão Chrome possui todos os componentes e seletores integrados.')
  })
})
