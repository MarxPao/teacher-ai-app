/**
 * portalDiscoveryEngine.test.ts
 * Testa o tipo DiscoveredPortalMap e os helpers TypeScript de discovered_portal_maps.
 * Usa um cliente Supabase mockado em memória para isolar completamente do banco.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { DiscoveredPortalMap } from '@/lib/portalActionsEngine'
import { getDiscoveredPortalMap, saveDiscoveredPortalMap } from '@/lib/portalActionsEngine'

// ---------------------------------------------------------------------------
// Mock de cliente Supabase
// ---------------------------------------------------------------------------

function createMockSupabase() {
  const db: Record<string, any[]> = { discovered_portal_maps: [] }
  let idCounter = 0

  const buildQuery = (table: string) => {
    let rows = [...(db[table] || [])]
    let filters: Array<(r: any) => boolean> = []
    let insertData: any = null
    let limitN = 1000

    const q: any = {
      select: () => q,
      eq: (col: string, val: any) => { filters.push(r => r[col] === val); return q },
      is: (col: string, val: any) => {
        if (val === null || val === 'null') filters.push(r => r[col] == null)
        else filters.push(r => r[col] === val)
        return q
      },
      limit: (n: number) => { limitN = n; return q },
      single: async () => {
        const result = rows.filter(r => filters.every(f => f(r))).slice(0, limitN)
        if (result.length === 0) return { data: null, error: { message: 'not found' } }
        return { data: result[0], error: null }
      },
      insert: (data: any) => {
        insertData = Array.isArray(data) ? data[0] : data
        return {
          select: () => ({
            single: async () => {
              idCounter++
              const newRow = { ...insertData, id: `mock-uuid-${idCounter}` }
              db[table].push(newRow)
              return { data: newRow, error: null }
            }
          })
        }
      },
      update: (data: any) => ({
        eq: () => ({ execute: async () => ({ data: null, error: null }) })
      }),
    }
    return q
  }

  return {
    from: (table: string) => buildQuery(table),
    _db: db,
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validMap: Omit<DiscoveredPortalMap, 'id' | 'discovered_at' | 'last_validated_at' | 'validation_failures' | 'superseded_by'> = {
  portal_domain: 'sandbox.escolateste.com.br',
  portal_display_name: 'Escola Teste Sandbox',
  discovered_selectors: {
    roster_table: 'table#roster-alunos',
    name_column: 1,
    id_column: 0,
    status_column: 3,
    nee_selector: '.badge-nee',
    header_rows: 1,
  },
  pagination_strategy: {
    type: 'next_button',
    nextSelector: "a.next[rel='next']",
    maxPages: 10,
    delayBetweenPagesMs: 1000,
  },
  discovery_confidence: 'high',
  discovered_by_teacher_id: 'teacher-uuid-test',
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('DiscoveredPortalMap — tipo e helpers', () => {
  let supabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    supabase = createMockSupabase()
  })

  // ── Testes de tipo ──────────────────────────────────────────────────────

  it('deve aceitar um mapa com todos os campos opcionais', () => {
    const full: DiscoveredPortalMap = {
      id: 'uuid-1',
      portal_domain: 'paineldoaluno.com.br',
      portal_display_name: 'Machado Sobrinho',
      discovered_selectors: {
        roster_table: 'table#alunos',
        name_column: 1,
        id_column: 0,
        status_column: 2,
        nee_selector: '.nee-badge',
        header_rows: 1,
      },
      pagination_strategy: {
        type: 'next_button',
        nextSelector: '.pagination .next',
        maxPages: 10,
        delayBetweenPagesMs: 1000,
      },
      discovery_confidence: 'high',
      discovered_by_teacher_id: 'teacher-x',
      discovered_at: new Date().toISOString(),
      last_validated_at: new Date().toISOString(),
      validation_failures: 0,
      superseded_by: undefined,
    }
    expect(full.portal_domain).toBe('paineldoaluno.com.br')
    expect(full.discovery_confidence).toBe('high')
    expect(full.discovered_selectors.roster_table).toBe('table#alunos')
  })

  it('deve aceitar um mapa mínimo (sem opcionais)', () => {
    const minimal: DiscoveredPortalMap = {
      portal_domain: 'escola.edu.br',
      discovered_selectors: {
        roster_table: 'table',
        name_column: 0,
        id_column: 1,
      },
      discovery_confidence: 'low',
    }
    expect(minimal.discovery_confidence).toBe('low')
    expect(minimal.pagination_strategy).toBeUndefined()
  })

  it('discovery_confidence deve aceitar apenas high, medium, low', () => {
    const high: DiscoveredPortalMap['discovery_confidence'] = 'high'
    const medium: DiscoveredPortalMap['discovery_confidence'] = 'medium'
    const low: DiscoveredPortalMap['discovery_confidence'] = 'low'
    expect(['high', 'medium', 'low']).toContain(high)
    expect(['high', 'medium', 'low']).toContain(medium)
    expect(['high', 'medium', 'low']).toContain(low)
  })

  // ── saveDiscoveredPortalMap ──────────────────────────────────────────────

  it('saveDiscoveredPortalMap deve persistir e retornar um ID', async () => {
    const id = await saveDiscoveredPortalMap(validMap, supabase)
    expect(id).toBeTruthy()
    expect(typeof id).toBe('string')
    expect(id).toContain('mock-uuid')
  })

  it('saveDiscoveredPortalMap deve retornar null sem roster_table', async () => {
    const mapSemTabela = {
      ...validMap,
      discovered_selectors: { ...validMap.discovered_selectors, roster_table: '' },
    }
    const id = await saveDiscoveredPortalMap(mapSemTabela, supabase)
    expect(id).toBeNull()
  })

  it('saveDiscoveredPortalMap deve retornar null sem supabase', async () => {
    const id = await saveDiscoveredPortalMap(validMap, null)
    expect(id).toBeNull()
  })

  it('saveDiscoveredPortalMap define last_validated_at automaticamente', async () => {
    const id = await saveDiscoveredPortalMap(validMap, supabase)
    expect(id).toBeTruthy()
    const saved = supabase._db.discovered_portal_maps[0]
    expect(saved?.last_validated_at).toBeTruthy()
    expect(saved?.validation_failures).toBe(0)
  })

  // ── getDiscoveredPortalMap ───────────────────────────────────────────────

  it('getDiscoveredPortalMap deve retornar mapa salvo', async () => {
    await saveDiscoveredPortalMap(validMap, supabase)
    const found = await getDiscoveredPortalMap('sandbox.escolateste.com.br', supabase)
    expect(found).not.toBeNull()
    expect(found?.portal_domain).toBe('sandbox.escolateste.com.br')
    expect(found?.discovery_confidence).toBe('high')
    expect(found?.discovered_selectors.roster_table).toBe('table#roster-alunos')
  })

  it('getDiscoveredPortalMap deve retornar null para domínio desconhecido', async () => {
    const found = await getDiscoveredPortalMap('naoexiste.com.br', supabase)
    expect(found).toBeNull()
  })

  it('getDiscoveredPortalMap deve retornar null sem supabase', async () => {
    const found = await getDiscoveredPortalMap('qualquer.com.br', null)
    expect(found).toBeNull()
  })

  it('getDiscoveredPortalMap deve retornar null sem domínio', async () => {
    const found = await getDiscoveredPortalMap('', supabase)
    expect(found).toBeNull()
  })

  // ── Integração: save → get round-trip ───────────────────────────────────

  it('round-trip save → get deve preservar todos os campos essenciais', async () => {
    const id = await saveDiscoveredPortalMap(validMap, supabase)
    expect(id).toBeTruthy()

    const found = await getDiscoveredPortalMap(validMap.portal_domain, supabase)
    expect(found).not.toBeNull()
    expect(found!.portal_domain).toBe(validMap.portal_domain)
    expect(found!.discovered_selectors.name_column).toBe(1)
    expect(found!.discovered_selectors.id_column).toBe(0)
    expect(found!.pagination_strategy?.type).toBe('next_button')
    expect(found!.discovered_by_teacher_id).toBe('teacher-uuid-test')
  })

  // ── Campos de rastreabilidade ──────────────────────────────────────────

  it('mapa deve ter campos de rastreabilidade definidos após save', async () => {
    await saveDiscoveredPortalMap(validMap, supabase)
    const found = await getDiscoveredPortalMap(validMap.portal_domain, supabase)
    expect(found!.validation_failures).toBe(0)
    expect(found!.last_validated_at).toBeTruthy()
    // superseded_by não deve estar preenchido em mapa novo
    expect(found!.superseded_by).toBeFalsy()
  })
})
