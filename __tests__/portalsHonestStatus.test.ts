import { describe, it, expect } from 'vitest'
import { GET as getPortalsStatus } from '../app/api/portals/status/route'
import { NextRequest } from 'next/server'

describe('Central de Portais Conectados — Honestidade de Status & Grid (Itens 2, 3 e 4)', () => {
  const BASE_URL = 'http://localhost:3000'

  async function fetchStatus() {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 1500)
      const res = await fetch(`${BASE_URL}/api/portals/status`, { signal: controller.signal })
      clearTimeout(timeoutId)
      if (res.ok) {
        return { ok: true, data: await res.json() }
      }
    } catch {}

    const req = new NextRequest(`${BASE_URL}/api/portals/status`)
    const res = await getPortalsStatus(req)
    return { ok: res.ok, data: await res.json() }
  }

  it('1. GET /api/portals/status retorna portais com mapeamento e métricas de honestidade', async () => {
    const { ok, data } = await fetchStatus()
    expect(ok).toBe(true)

    expect(data.ok).toBe(true)
    expect(Array.isArray(data.portals)).toBe(true)
    expect(data.portals.length).toBeGreaterThanOrEqual(4)

    const machado = data.portals.find((p: any) => p.id === 'machado_sobrinho')
    expect(machado).toBeDefined()

    // Status de mapeamento (Item 2)
    expect(machado.isMapped).toBe(true)
    expect(machado.mappingStrategy).toBe('table_rows')

    // Status de conexão atual: deliberadamente omitido (Item 0 e Item 2)
    expect(machado.isConnectedNow).toBeUndefined()
    expect(machado.connected_now).toBeUndefined()

    // Contagens de skills (Item 2)
    expect(machado.totalSkills).toBeGreaterThanOrEqual(2)
    expect(machado.provenSkillsCount).toBeGreaterThanOrEqual(1)
    expect(machado.unprovenOrBrokenSkillsCount).toBe(machado.totalSkills - machado.provenSkillsCount)
  })

  it('2. Portais não mapeados exibem isMapped=false e contagem zerada', async () => {
    const { data } = await fetchStatus()

    const redeSc = data.portals.find((p: any) => p.id === 'redesantacatarina')
    expect(redeSc).toBeDefined()
    expect(redeSc.isMapped).toBe(false)
    expect(redeSc.mappingStrategy).toBeNull()
    expect(redeSc.totalSkills).toBe(0)
    expect(redeSc.provenSkillsCount).toBe(0)
    expect(redeSc.unprovenOrBrokenSkillsCount).toBe(0)

    const plural = data.portals.find((p: any) => p.id === 'plural')
    expect(plural).toBeDefined()
    expect(plural.isMapped).toBe(false)

    const cambridge = data.portals.find((p: any) => p.id === 'cambridge')
    expect(cambridge).toBeDefined()
    expect(cambridge.isMapped).toBe(false)
  })

  it('3. Regra de Honestidade (Item 4): Skills sem execução ou com falha NUNCA são "proven"', async () => {
    const { data } = await fetchStatus()

    const machado = data.portals.find((p: any) => p.id === 'machado_sobrinho')
    expect(machado.skills.length).toBeGreaterThan(0)

    // Skill com execução comprovada no DOM
    const inicioSkill = machado.skills.find((s: any) => s.task_id === 'inicio')
    expect(inicioSkill).toBeDefined()
    expect(inicioSkill.statusBadge).toBe('proven')
    expect(inicioSkill.statusLabel).toBe('Comprovada')
    expect(inicioSkill.lastVerified).toBe(true)

    // Skill com falha na última execução
    const faltaSkill = machado.skills.find((s: any) => s.task_id === 'lancar_falta')
    expect(faltaSkill).toBeDefined()
    expect(faltaSkill.statusBadge).toBe('failing')
    expect(faltaSkill.statusLabel).toBe('Falhando')
    expect(faltaSkill.lastVerified).toBe(false)

    // Skills nunca executadas devem ter badge neutro/cinza, NUNCA 'proven'
    const unexecutedSkills = machado.skills.filter((s: any) => s.executionsCount === 0)
    expect(unexecutedSkills.length).toBeGreaterThan(0)
    for (const skill of unexecutedSkills) {
      expect(skill.statusBadge).toBe('never_executed')
      expect(skill.statusLabel).toBe('Nunca executada')
      expect(skill.statusBadge).not.toBe('proven')
    }
  })

  it('4. Histórico cronológico reverso do portal possui metadados exigidos (Item 3)', async () => {
    const { data } = await fetchStatus()

    const machado = data.portals.find((p: any) => p.id === 'machado_sobrinho')
    expect(machado.history.length).toBeGreaterThanOrEqual(2)

    // Verifica ordenação cronológica reversa
    const t0 = new Date(machado.history[0].executed_at).getTime()
    const t1 = new Date(machado.history[1].executed_at).getTime()
    expect(t0).toBeGreaterThanOrEqual(t1)

    // Verifica campos obrigatórios de cada linha do histórico
    for (const h of machado.history) {
      expect(h.executed_at).toBeDefined()
      expect(h.task_name).toBeDefined()
      expect(['verified_dom', 'unverified_success', 'failed']).toContain(h.statusBadge)
      expect(h.verification_method).toBeDefined()
      expect(typeof h.duration_seconds).toBe('number')
      expect(['Extensão', 'Sidecar', 'Manual']).toContain(h.source)
    }
  })
})
