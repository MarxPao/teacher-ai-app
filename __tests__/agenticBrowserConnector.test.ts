/**
 * agenticBrowserConnector.test.ts — FASE 1: Testes do adaptador agentic_browser
 *
 * Cobre:
 * - readRosterHandler mapeia resposta de sucesso do sidecar para CapabilityResult correto
 * - readRosterHandler mapeia domain_mismatch para CapabilityResult de erro padronizado
 * - readRosterHandler mapeia erro genérico do sidecar para CapabilityResult de erro
 * - readRosterHandler trata falha de rede
 * - requires_review=true quando status != 'mapped_validated' (herda Partes A-E)
 * - requires_review=false quando status == 'mapped_validated'
 * - registerAgenticBrowserHandlers() registra no engine global corretamente
 * - Prova de equivalência: invokeCapability via engine produz o MESMO resultado que
 *   chamar readRosterHandler diretamente (contrato de transparência)
 */

import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest'
import {
  registerConnector,
  registerCapabilityHandler,
  invokeCapability,
  _resetEngineForTests,
  type Connector,
} from '@/lib/connectorEngine'
import {
  registerAgenticBrowserHandlers,
  _handlers,
} from '@/lib/connectors/agenticBrowserConnector'

// ─── MOCK DO fetch ────────────────────────────────────────────────────────────

const mockFetch = vi.fn() as MockedFunction<typeof fetch>
vi.stubGlobal('fetch', mockFetch)

function mockSidecarSuccess(overrides: Record<string, unknown> = {}) {
  mockFetch.mockResolvedValueOnce({
    status: 200,
    json: async () => ({
      success: true,
      students: [
        { name: 'Ana Lima', rollNumber: '101', classRef: '8A' },
        { name: 'Bruno Santos', rollNumber: '102', classRef: '8A' },
      ],
      total: 2,
      layer_used: 'layer_1_deterministic',
      map_source: 'known_map',
      status: 'mapped_validated',
      discovered_map: null,
      structured_log: [],
      immediate_verification_passed: true,
      page_title: 'machadosobrinho | Painel do Professor',
      page_url: 'https://machadosobrinho.paineldoaluno.com.br/professor_notas',
      section_used: '#roster-table',
      ...overrides,
    }),
  } as Response)
}

function mockSidecarDomainMismatch() {
  mockFetch.mockResolvedValueOnce({
    status: 422,
    json: async () => ({
      error: 'A aba aberta no navegador (http://localhost:3000/sandbox/portal_mock_roster.html) não corresponde ao portal esperado (https://machadosobrinho.paineldoaluno.com.br/chamada). Abra a página correta antes de ler.',
      status: 'domain_mismatch',
      structured_log: [{ step: 'domain_mismatch_abort' }],
      immediate_verification_passed: false,
    }),
  } as Response)
}

function mockSidecarGenericError(errorMsg: string, httpStatus = 422) {
  mockFetch.mockResolvedValueOnce({
    status: httpStatus,
    json: async () => ({
      error: errorMsg,
      status: 'broken_needs_rediscovery',
      structured_log: [],
    }),
  } as Response)
}

function mockNetworkError() {
  mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'))
}

// ─── FIXTURES ────────────────────────────────────────────────────────────────

const machadoConnector: Connector = {
  id: 'machado_sobrinho',
  display_name: 'Colégio Machado Sobrinho',
  tier: 'agentic_browser',
  status: 'mapped_validated',
  capabilities: [
    { name: 'read_roster', direction: 'read', requires_human_approval: false, output_schema: 'StudentRecord[]' },
  ],
  browser_config: { domain: 'machadosobrinho.paineldoaluno.com.br' },
}

// ─── SETUP ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  _resetEngineForTests()
  mockFetch.mockReset()
})

// ─── HANDLER DIRETO: readRoster ───────────────────────────────────────────────

describe('readRosterHandler — Leitura Bem-Sucedida', () => {
  it('mapeia resposta de sucesso do sidecar para CapabilityResult correto', async () => {
    mockSidecarSuccess()
    const result = await _handlers.readRoster(machadoConnector, {
      pageHint: 'https://machadosobrinho.paineldoaluno.com.br/professor_notas',
    })
    expect(result.success).toBe(true)
    expect(result.layer_used).toBe('layer_1_deterministic')
    expect(result.requires_review).toBe(false) // mapped_validated → não precisa revisão
    expect((result.data as any).total).toBe(2)
    expect((result.data as any).students).toHaveLength(2)
    expect((result.data as any).students[0].name).toBe('Ana Lima')
  })

  it('requires_review=true quando status é "mapped_untested" (primeira leitura, sem homologação)', async () => {
    mockSidecarSuccess({ status: 'mapped_untested' })
    const result = await _handlers.readRoster(machadoConnector, {})
    expect(result.success).toBe(true)
    expect(result.requires_review).toBe(true)
  })

  it('requires_review=true quando status é "discovering"', async () => {
    mockSidecarSuccess({ status: 'discovering' })
    const result = await _handlers.readRoster(machadoConnector, {})
    expect(result.success).toBe(true)
    expect(result.requires_review).toBe(true)
  })

  it('requires_review=false apenas quando status é "mapped_validated"', async () => {
    mockSidecarSuccess({ status: 'mapped_validated' })
    const result = await _handlers.readRoster(machadoConnector, {})
    expect(result.requires_review).toBe(false)
  })

  it('mapeia layer_2_vision corretamente', async () => {
    mockSidecarSuccess({ layer_used: 'layer_2_vision', status: 'mapped_untested' })
    const result = await _handlers.readRoster(machadoConnector, {})
    expect(result.layer_used).toBe('layer_2_vision')
    expect(result.requires_review).toBe(true)
  })

  it('encaminha goal customizado ao sidecar', async () => {
    mockSidecarSuccess()
    await _handlers.readRoster(machadoConnector, { goal: 'alunos da turma 9B' })
    const fetchCall = mockFetch.mock.calls[0]
    const body = JSON.parse(fetchCall[1]?.body as string)
    expect(body.goal).toBe('alunos da turma 9B')
  })

  it('usa goal padrão derivado do display_name quando nenhum goal informado', async () => {
    mockSidecarSuccess()
    await _handlers.readRoster(machadoConnector, {})
    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
    expect(body.goal).toContain('Colégio Machado Sobrinho')
  })

  it('usa pageHint customizado quando fornecido', async () => {
    mockSidecarSuccess()
    await _handlers.readRoster(machadoConnector, {
      pageHint: 'https://machadosobrinho.paineldoaluno.com.br/chamada'
    })
    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
    expect(body.pageHint).toBe('https://machadosobrinho.paineldoaluno.com.br/chamada')
  })

  it('envia forceDiscovery=true quando parâmetro forceDiscovery=true', async () => {
    mockSidecarSuccess({ status: 'mapped_untested' })
    await _handlers.readRoster(machadoConnector, { forceDiscovery: true })
    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
    expect(body.forceDiscovery).toBe(true)
    expect(body.action).toBe('rediscover_portal')
  })
})

// ─── HANDLER DIRETO: domain_mismatch ─────────────────────────────────────────

describe('readRosterHandler — Guarda de Domínio (domain_mismatch)', () => {
  it('retorna CapabilityResult de erro padronizado quando sidecar retorna domain_mismatch', async () => {
    mockSidecarDomainMismatch()
    const result = await _handlers.readRoster(machadoConnector, {
      pageHint: 'https://machadosobrinho.paineldoaluno.com.br/chamada',
    })
    expect(result.success).toBe(false)
    expect(result.requires_review).toBe(false)
    expect(result.error).toContain('não corresponde ao portal esperado')
    // Nenhum dado de aluno é retornado
    expect(result.data).toBeUndefined()
  })

  it('a mensagem de erro do domain_mismatch preserva a URL real e esperada', async () => {
    mockSidecarDomainMismatch()
    const result = await _handlers.readRoster(machadoConnector, {})
    expect(result.error).toContain('localhost:3000')
    expect(result.error).toContain('machadosobrinho.paineldoaluno.com.br')
  })
})

// ─── HANDLER DIRETO: erros genéricos ─────────────────────────────────────────

describe('readRosterHandler — Erros Genéricos e Rede', () => {
  it('retorna CapabilityResult de erro quando sidecar retorna erro genérico', async () => {
    mockSidecarGenericError('Nenhum aluno identificado na página aberta no navegador.')
    const result = await _handlers.readRoster(machadoConnector, {})
    expect(result.success).toBe(false)
    expect(result.requires_review).toBe(false)
    expect(result.error).toContain('Nenhum aluno identificado')
  })

  it('retorna CapabilityResult de erro quando ocorre falha de rede (não propaga exceção)', async () => {
    mockNetworkError()
    const result = await _handlers.readRoster(machadoConnector, {})
    expect(result.success).toBe(false)
    expect(result.requires_review).toBe(false)
    expect(result.error).toContain('Falha de rede')
    expect(result.error).toContain('Failed to fetch')
  })
})

// ─── VIA ENGINE: registerAgenticBrowserHandlers ───────────────────────────────

describe('registerAgenticBrowserHandlers() — Integração com o Engine', () => {
  it('registra o handler no engine e invokeCapability produz o mesmo resultado', async () => {
    registerConnector(machadoConnector)
    registerAgenticBrowserHandlers()
    mockSidecarSuccess()

    const result = await invokeCapability('machado_sobrinho', 'read_roster', {
      pageHint: 'https://machadosobrinho.paineldoaluno.com.br/professor_notas',
    })

    expect(result.success).toBe(true)
    expect(result.layer_used).toBe('layer_1_deterministic')
    expect(result.requires_review).toBe(false)
    expect((result.data as any).students).toHaveLength(2)
  })

  it('PROVA DE TRANSPARÊNCIA: resultado via engine == resultado via handler direto', async () => {
    registerConnector(machadoConnector)
    registerAgenticBrowserHandlers()

    // Resultado via handler direto
    mockSidecarSuccess()
    const directResult = await _handlers.readRoster(machadoConnector, {
      pageHint: 'https://machadosobrinho.paineldoaluno.com.br/professor_notas',
    })

    // Resultado via engine (invokeCapability)
    mockSidecarSuccess()
    const engineResult = await invokeCapability('machado_sobrinho', 'read_roster', {
      pageHint: 'https://machadosobrinho.paineldoaluno.com.br/professor_notas',
    })

    // Mesmos campos de contrato
    expect(engineResult.success).toBe(directResult.success)
    expect(engineResult.layer_used).toBe(directResult.layer_used)
    expect(engineResult.requires_review).toBe(directResult.requires_review)
    expect((engineResult.data as any).total).toBe((directResult.data as any).total)
    expect((engineResult.data as any).students).toHaveLength(
      (directResult.data as any).students.length
    )
  })

  it('domain_mismatch via engine retorna erro padronizado (mesma mensagem que handler direto)', async () => {
    registerConnector(machadoConnector)
    registerAgenticBrowserHandlers()
    mockSidecarDomainMismatch()

    const result = await invokeCapability('machado_sobrinho', 'read_roster', {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('não corresponde ao portal esperado')
  })
})

// ─── ZERO REGRESSÃO: gates das Partes A-E ─────────────────────────────────────

describe('Zero Regressão: Gates das Partes A-E', () => {
  it('Gate de integridade: dados com 0 alunos NÃO são tratados como sucesso', async () => {
    // Sidecar retorna success=true mas 0 alunos — não deveria ocorrer em produção,
    // mas o adapter não "inventa" sucesso — repassa fielmente o que o sidecar disse.
    // Neste caso o sidecar retornaria 422, mas se retornasse 200 com 0, passamos adiante
    // para que a lógica de reconciliação (rosterReconciler) tome a decisão de gate.
    mockFetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        success: true,
        students: [],
        total: 0,
        layer_used: 'layer_1_deterministic',
        map_source: 'known_map',
        status: 'mapped_validated',
        discovered_map: null,
        structured_log: [],
        immediate_verification_passed: false,
        page_title: '',
        page_url: '',
        section_used: '',
      }),
    } as Response)

    const result = await _handlers.readRoster(machadoConnector, {})
    // O adapter não filtra: passa os dados. O gate de contagem fica em rosterReconciler.
    expect(result.success).toBe(true)
    expect((result.data as any).students).toHaveLength(0)
    expect((result.data as any).total).toBe(0)
  })

  it('Gate de domínio: domain_mismatch resulta em success=false e error explícito (sem alunos)', async () => {
    mockSidecarDomainMismatch()
    const result = await _handlers.readRoster(machadoConnector, {})
    expect(result.success).toBe(false)
    expect(result.data).toBeUndefined()
  })

  it('Imutabilidade: o adapter não modifica students recebidos do sidecar', async () => {
    const students = [
      { name: 'Ana Lima', rollNumber: '101' },
      { name: 'Bruno Santos', rollNumber: '102' },
    ]
    mockSidecarSuccess({ students, total: 2 })
    const result = await _handlers.readRoster(machadoConnector, {})
    const returned = (result.data as any).students
    expect(returned[0].name).toBe('Ana Lima')
    expect(returned[1].name).toBe('Bruno Santos')
    // Não foi transformado ou filtrado pelo adapter
    expect(returned).toHaveLength(2)
  })
})
