/**
 * connectorEngine.test.ts — FASE 0: Testes unitários do Connector Engine
 *
 * Cobre:
 * - Registro de conector
 * - Busca por id e por capability
 * - Registro de handlers e roteamento por tier
 * - Todos os caminhos de erro de invokeCapability
 * - Garantia de ZERO lógica de negócio no engine (só roteamento)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  registerConnector,
  unregisterConnector,
  listConnectors,
  getConnector,
  getConnectorsByCapability,
  getActiveConnectorsByCapability,
  registerCapabilityHandler,
  getCapabilityHandler,
  invokeCapability,
  engineDiagnostics,
  _resetEngineForTests,
  type Connector,
  type CapabilityResult,
} from '@/lib/connectorEngine'

// ─── FIXTURES ────────────────────────────────────────────────────────────────

const machadoConnector: Connector = {
  id: 'machado_sobrinho',
  display_name: 'Colégio Machado Sobrinho',
  tier: 'agentic_browser',
  status: 'mapped_validated',
  capabilities: [
    { name: 'read_roster', direction: 'read', requires_human_approval: false, output_schema: 'StudentRecord[]' },
    { name: 'read_grades', direction: 'read', requires_human_approval: false, output_schema: 'GradeRecord[]' },
  ],
  browser_config: { domain: 'machadosobrinho.paineldoaluno.com.br' }
}

const trelloConnector: Connector = {
  id: 'trello_main',
  display_name: 'Trello',
  tier: 'api',
  status: 'mapped_validated',
  capabilities: [
    { name: 'read_board', direction: 'read', requires_human_approval: false, output_schema: 'TrelloBoard' },
  ],
  api_config: { base_url: 'https://api.trello.com/1', auth_type: 'api_key' }
}

const neverConnectedConnector: Connector = {
  id: 'google_classroom',
  display_name: 'Google Classroom',
  tier: 'api',
  status: 'never_connected',
  capabilities: [
    { name: 'read_roster', direction: 'read', requires_human_approval: false, output_schema: 'StudentRecord[]' },
  ],
  api_config: { base_url: 'https://classroom.googleapis.com', auth_type: 'oauth2' }
}

// ─── SETUP ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  _resetEngineForTests()
})

// ─── REGISTRO DE CONECTORES ───────────────────────────────────────────────────

describe('Registro de Conectores', () => {
  it('registra um conector e retorna via getConnector(id)', () => {
    registerConnector(machadoConnector)
    expect(getConnector('machado_sobrinho')).toEqual(machadoConnector)
  })

  it('listConnectors() retorna todos os conectores registrados', () => {
    registerConnector(machadoConnector)
    registerConnector(trelloConnector)
    const list = listConnectors()
    expect(list).toHaveLength(2)
    expect(list.map(c => c.id)).toContain('machado_sobrinho')
    expect(list.map(c => c.id)).toContain('trello_main')
  })

  it('re-registrar o mesmo id atualiza o registro (idempotente)', () => {
    registerConnector(machadoConnector)
    const updated: Connector = { ...machadoConnector, display_name: 'Machado Sobrinho ATUALIZADO' }
    registerConnector(updated)
    expect(getConnector('machado_sobrinho')?.display_name).toBe('Machado Sobrinho ATUALIZADO')
    expect(listConnectors()).toHaveLength(1)
  })

  it('unregisterConnector() remove o conector e retorna true', () => {
    registerConnector(machadoConnector)
    const removed = unregisterConnector('machado_sobrinho')
    expect(removed).toBe(true)
    expect(getConnector('machado_sobrinho')).toBeUndefined()
  })

  it('unregisterConnector() retorna false para id inexistente', () => {
    expect(unregisterConnector('nao_existe')).toBe(false)
  })

  it('getConnector() retorna undefined para id inexistente', () => {
    expect(getConnector('nao_existe')).toBeUndefined()
  })

  it('lança erro ao registrar conector sem id', () => {
    expect(() => registerConnector({ ...machadoConnector, id: '' })).toThrow('[ConnectorEngine]')
  })

  it('lança erro ao registrar conector sem capabilities', () => {
    expect(() => registerConnector({ ...machadoConnector, capabilities: null as any })).toThrow('[ConnectorEngine]')
  })
})

// ─── BUSCA POR CAPABILITY ─────────────────────────────────────────────────────

describe('Busca por Capability', () => {
  beforeEach(() => {
    registerConnector(machadoConnector)
    registerConnector(trelloConnector)
    registerConnector(neverConnectedConnector)
  })

  it('getConnectorsByCapability("read_roster") retorna Machado + Google Classroom', () => {
    const results = getConnectorsByCapability('read_roster')
    expect(results).toHaveLength(2)
    expect(results.map(c => c.id)).toContain('machado_sobrinho')
    expect(results.map(c => c.id)).toContain('google_classroom')
  })

  it('getConnectorsByCapability("read_board") retorna apenas Trello', () => {
    const results = getConnectorsByCapability('read_board')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('trello_main')
  })

  it('getConnectorsByCapability("post_grade") retorna lista vazia se ninguém oferece', () => {
    expect(getConnectorsByCapability('post_grade')).toHaveLength(0)
  })

  it('getActiveConnectorsByCapability() exclui conectores never_connected', () => {
    // Machado está mapped_validated, Google Classroom está never_connected
    const active = getActiveConnectorsByCapability('read_roster')
    expect(active).toHaveLength(1)
    expect(active[0].id).toBe('machado_sobrinho')
  })

  it('getActiveConnectorsByCapability() inclui todos os status exceto never_connected', () => {
    const discovering: Connector = {
      ...machadoConnector,
      id: 'portal_discovering',
      status: 'discovering'
    }
    registerConnector(discovering)
    const active = getActiveConnectorsByCapability('read_roster')
    expect(active.map(c => c.id)).toContain('portal_discovering')
  })
})

// ─── REGISTRO DE HANDLERS ─────────────────────────────────────────────────────

describe('Registro de Handlers', () => {
  it('registerCapabilityHandler registra e getCapabilityHandler recupera o handler', () => {
    const handler = vi.fn(async (): Promise<CapabilityResult> => ({
      success: true, requires_review: false
    }))
    registerCapabilityHandler('agentic_browser', 'read_roster', handler)
    const recovered = getCapabilityHandler('agentic_browser', 'read_roster')
    expect(recovered).toBe(handler)
  })

  it('getCapabilityHandler retorna undefined para tier+capability sem handler', () => {
    expect(getCapabilityHandler('api', 'read_board')).toBeUndefined()
  })

  it('re-registrar o mesmo tier+capability substitui o handler anterior', () => {
    const handlerA = vi.fn(async (): Promise<CapabilityResult> => ({ success: true, requires_review: false }))
    const handlerB = vi.fn(async (): Promise<CapabilityResult> => ({ success: false, requires_review: false }))
    registerCapabilityHandler('api', 'read_board', handlerA)
    registerCapabilityHandler('api', 'read_board', handlerB)
    expect(getCapabilityHandler('api', 'read_board')).toBe(handlerB)
  })

  it('handlers de tiers diferentes são independentes', () => {
    const browserHandler = vi.fn(async (): Promise<CapabilityResult> => ({ success: true, requires_review: true }))
    const apiHandler = vi.fn(async (): Promise<CapabilityResult> => ({ success: true, requires_review: false }))
    registerCapabilityHandler('agentic_browser', 'read_roster', browserHandler)
    registerCapabilityHandler('api', 'read_roster', apiHandler)
    expect(getCapabilityHandler('agentic_browser', 'read_roster')).toBe(browserHandler)
    expect(getCapabilityHandler('api', 'read_roster')).toBe(apiHandler)
  })
})

// ─── invokeCapability — ROTEAMENTO CENTRAL ───────────────────────────────────

describe('invokeCapability — Roteamento e Execução', () => {
  it('roteia para o handler correto por tier e retorna o resultado padronizado', async () => {
    registerConnector(machadoConnector)
    const handler = vi.fn(async (_conn, _params): Promise<CapabilityResult> => ({
      success: true,
      data: [{ name: 'Ana Lima', rollNumber: '101' }],
      requires_review: false,
      layer_used: 'layer_1_deterministic'
    }))
    registerCapabilityHandler('agentic_browser', 'read_roster', handler)

    const result = await invokeCapability('machado_sobrinho', 'read_roster', { classRef: '8A' })

    expect(result.success).toBe(true)
    expect(result.layer_used).toBe('layer_1_deterministic')
    expect(result.requires_review).toBe(false)
    expect(handler).toHaveBeenCalledOnce()
    // O handler recebe o connector completo e os params
    expect(handler).toHaveBeenCalledWith(machadoConnector, { classRef: '8A' })
  })

  it('roteia para handler api (Trello) com os mesmos tipos de retorno', async () => {
    registerConnector(trelloConnector)
    const handler = vi.fn(async (): Promise<CapabilityResult> => ({
      success: true,
      data: { board_id: 'abc', name: 'Turma 8A' },
      requires_review: false,
      layer_used: 'api'
    }))
    registerCapabilityHandler('api', 'read_board', handler)

    const result = await invokeCapability('trello_main', 'read_board', { board_id: 'abc' })

    expect(result.success).toBe(true)
    expect(result.layer_used).toBe('api')
    expect(result.requires_review).toBe(false)
  })

  it('PROVA DE CONTRATO ÚNICO: lote misto agentic_browser + api retornam mesmo formato', async () => {
    registerConnector(machadoConnector)
    registerConnector(trelloConnector)

    const browserResult: CapabilityResult = {
      success: true, data: [{ name: 'Ana Lima' }], requires_review: true, layer_used: 'layer_2_vision'
    }
    const apiResult: CapabilityResult = {
      success: true, data: { board_id: 'xyz' }, requires_review: false, layer_used: 'api'
    }
    registerCapabilityHandler('agentic_browser', 'read_roster', async () => browserResult)
    registerCapabilityHandler('api', 'read_board', async () => apiResult)

    const [r1, r2] = await Promise.all([
      invokeCapability('machado_sobrinho', 'read_roster'),
      invokeCapability('trello_main', 'read_board')
    ])

    // Ambos têm as mesmas chaves de contrato
    expect(r1).toHaveProperty('success')
    expect(r1).toHaveProperty('requires_review')
    expect(r1).toHaveProperty('layer_used')
    expect(r2).toHaveProperty('success')
    expect(r2).toHaveProperty('requires_review')
    expect(r2).toHaveProperty('layer_used')
  })
})

// ─── invokeCapability — CAMINHOS DE ERRO ─────────────────────────────────────

describe('invokeCapability — Caminhos de Erro', () => {
  it('retorna erro padronizado (não exceção) quando conector não existe', async () => {
    const result = await invokeCapability('conector_fantasma', 'read_roster')
    expect(result.success).toBe(false)
    expect(result.requires_review).toBe(false)
    expect(result.error).toContain('Conector não encontrado')
    expect(result.error).toContain('conector_fantasma')
  })

  it('retorna erro padronizado quando o conector não oferece a capability', async () => {
    registerConnector(machadoConnector) // Machado não tem read_board
    const result = await invokeCapability('machado_sobrinho', 'read_board')
    expect(result.success).toBe(false)
    expect(result.error).toContain('não oferece a capability')
    expect(result.error).toContain('read_board')
  })

  it('retorna erro padronizado quando não há handler registrado para o tier+capability', async () => {
    registerConnector(machadoConnector) // capability existe, mas handler não foi registrado
    const result = await invokeCapability('machado_sobrinho', 'read_roster')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Nenhum handler registrado')
    expect(result.error).toContain('agentic_browser')
    expect(result.error).toContain('read_roster')
  })

  it('captura exceção interna do handler e retorna CapabilityResult de erro (não propaga)', async () => {
    registerConnector(machadoConnector)
    registerCapabilityHandler('agentic_browser', 'read_roster', async () => {
      throw new Error('Falha catastrófica simulada no handler')
    })
    const result = await invokeCapability('machado_sobrinho', 'read_roster')
    expect(result.success).toBe(false)
    expect(result.requires_review).toBe(false)
    expect(result.error).toContain('lançou exceção')
    expect(result.error).toContain('Falha catastrófica simulada no handler')
  })
})

// ─── ENGINE DIAGNOSTICS ───────────────────────────────────────────────────────

describe('engineDiagnostics()', () => {
  it('retorna contagem correta de conectores e lista de handlers', () => {
    registerConnector(machadoConnector)
    registerConnector(trelloConnector)
    registerCapabilityHandler('agentic_browser', 'read_roster', async () => ({ success: true, requires_review: false }))
    registerCapabilityHandler('api', 'read_board', async () => ({ success: true, requires_review: false }))

    const diag = engineDiagnostics()
    expect(diag.connectors).toBe(2)
    expect(diag.handlers).toContain('agentic_browser:read_roster')
    expect(diag.handlers).toContain('api:read_board')
  })

  it('após _resetEngineForTests(), estado é zero', () => {
    registerConnector(machadoConnector)
    _resetEngineForTests()
    const diag = engineDiagnostics()
    expect(diag.connectors).toBe(0)
    expect(diag.handlers).toHaveLength(0)
  })
})

// ─── GARANTIA: ZERO LÓGICA DE NEGÓCIO NO ENGINE ──────────────────────────────

describe('Garantia de Isolamento (Zero lógica de negócio no engine)', () => {
  it('o engine não conhece portais, Trello ou nenhuma plataforma — só roteia', async () => {
    // Registramos um conector fictício com nome absurdo: o engine não liga
    const alienConnector: Connector = {
      id: 'alien_plataforma',
      display_name: 'Plataforma Alienígena',
      tier: 'api',
      status: 'mapped_validated',
      capabilities: [
        { name: 'read_calendar', direction: 'read', requires_human_approval: false, output_schema: 'CalendarEvent[]' }
      ]
    }
    registerConnector(alienConnector)
    registerCapabilityHandler('api', 'read_calendar', async (_conn, params) => ({
      success: true,
      data: { events: params['count'] ?? 0 },
      requires_review: false,
      layer_used: 'api'
    }))

    const result = await invokeCapability('alien_plataforma', 'read_calendar', { count: 42 })
    expect(result.success).toBe(true)
    expect((result.data as any).events).toBe(42)
  })
})
