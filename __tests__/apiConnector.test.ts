/**
 * apiConnector.test.ts — FASE 2: Testes do adaptador api (Trello como tier api)
 *
 * Cobre:
 * - readBoardHandler lista boards quando boardId omitido
 * - readBoardHandler retorna listas + cartões quando boardId fornecido
 * - readRosterFromTrelloHandler mapeia cartões para StudentRecord
 * - Erros de credencial ausente retornam CapabilityResult padronizado
 * - Erros de API Trello retornam CapabilityResult padronizado (não propagam)
 * - boardId obrigatório ausente em read_roster retorna erro
 * - registerApiHandlers() registra no engine e invokeCapability roteia corretamente
 *
 * PROVA CENTRAL (Fase 2):
 *   invokeCapability('machado_sobrinho', 'read_roster') e
 *   invokeCapability('trello_main', 'read_board') retornam EXATAMENTE o mesmo
 *   formato de CapabilityResult, apesar de internamente serem mecanismos opostos
 *   (CDP sidecar vs REST API Trello).
 */

import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest'
import {
  registerConnector,
  invokeCapability,
  _resetEngineForTests,
  type Connector,
} from '@/lib/connectorEngine'
import { registerApiHandlers, _handlers } from '@/lib/connectors/apiConnector'
import {
  registerAgenticBrowserHandlers,
  _handlers as _browserHandlers,
} from '@/lib/connectors/agenticBrowserConnector'

// ─── MOCKS ───────────────────────────────────────────────────────────────────

// Mock do trelloClient — não fazemos chamadas reais à API do Trello
vi.mock('@/lib/trelloClient', () => ({
  getTrelloConfig: vi.fn(),
  fetchTrelloBoards: vi.fn(),
  fetchTrelloCardsFromBoard: vi.fn(),
  fetchTrelloLists: vi.fn(),
}))

import {
  getTrelloConfig,
  fetchTrelloBoards,
  fetchTrelloCardsFromBoard,
  fetchTrelloLists,
} from '@/lib/trelloClient'

const mockGetTrelloConfig = getTrelloConfig as MockedFunction<typeof getTrelloConfig>
const mockFetchBoards     = fetchTrelloBoards as MockedFunction<typeof fetchTrelloBoards>
const mockFetchCards      = fetchTrelloCardsFromBoard as MockedFunction<typeof fetchTrelloCardsFromBoard>
const mockFetchLists      = fetchTrelloLists as MockedFunction<typeof fetchTrelloLists>

// Mock do fetch global (para o agenticBrowserConnector no teste de prova central)
const mockFetch = vi.fn() as MockedFunction<typeof fetch>
vi.stubGlobal('fetch', mockFetch)

// ─── FIXTURES ────────────────────────────────────────────────────────────────

const trelloConnector: Connector = {
  id: 'trello_main',
  display_name: 'Trello da Professora',
  tier: 'api',
  status: 'mapped_validated',
  capabilities: [
    { name: 'read_board', direction: 'read', requires_human_approval: false, output_schema: 'TrelloBoard[]' },
    { name: 'read_roster', direction: 'read', requires_human_approval: false, output_schema: 'StudentRecord[]' },
  ],
  api_config: {
    base_url: 'https://api.trello.com/1',
    auth_type: 'api_key',
  },
}

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

const FAKE_CREDS = { apiKey: 'test_key', apiToken: 'test_token' }

const SAMPLE_BOARDS = [
  { id: 'board1', name: 'Turmas 2026', desc: '', closed: false, url: 'https://trello.com/b/abc', shortUrl: 'https://trello.com/b/abc' },
  { id: 'board2', name: 'Avaliações', desc: '', closed: false, url: 'https://trello.com/b/def', shortUrl: 'https://trello.com/b/def' },
]

const SAMPLE_LISTS = [
  { id: 'list1', name: '8A', idBoard: 'board1', closed: false, pos: 1 },
  { id: 'list2', name: '9B', idBoard: 'board1', closed: false, pos: 2 },
]

const SAMPLE_CARDS = [
  { id: 'card1', name: 'Ana Lima', desc: '', due: null, dueComplete: false, idList: 'list1', idBoard: 'board1', shortUrl: 'https://trello.com/c/c1', url: '', labels: [] },
  { id: 'card2', name: 'Bruno Santos', desc: '', due: null, dueComplete: false, idList: 'list1', idBoard: 'board1', shortUrl: 'https://trello.com/c/c2', url: '', labels: [] },
]

// ─── SETUP ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  _resetEngineForTests()
  vi.clearAllMocks()
  mockGetTrelloConfig.mockReturnValue(FAKE_CREDS as any)
})

// ─── readBoardHandler — lista de boards ──────────────────────────────────────

describe('readBoardHandler — listagem de todos os boards', () => {
  it('retorna todos os boards quando boardId não fornecido', async () => {
    mockFetchBoards.mockResolvedValueOnce(SAMPLE_BOARDS as any)
    const result = await _handlers.readBoard(trelloConnector, {})

    expect(result.success).toBe(true)
    expect(result.layer_used).toBe('api')
    expect(result.requires_review).toBe(false)
    expect((result.data as any).total_boards).toBe(2)
    expect((result.data as any).boards).toHaveLength(2)
    expect((result.data as any).boards[0].name).toBe('Turmas 2026')
  })

  it('retorna listas + cartões quando boardId fornecido', async () => {
    mockFetchLists.mockResolvedValueOnce(SAMPLE_LISTS as any)
    mockFetchCards.mockResolvedValueOnce(SAMPLE_CARDS as any)

    const result = await _handlers.readBoard(trelloConnector, { boardId: 'board1' })

    expect(result.success).toBe(true)
    expect(result.layer_used).toBe('api')
    expect(result.requires_review).toBe(false)
    expect((result.data as any).board_id).toBe('board1')
    expect((result.data as any).total_lists).toBe(2)
    expect((result.data as any).total_cards).toBe(2)
    expect((result.data as any).lists[0].name).toBe('8A')
    expect((result.data as any).cards[0].name).toBe('Ana Lima')
  })

  it('retorna erro padronizado quando credenciais não encontradas', async () => {
    mockGetTrelloConfig.mockReturnValue(null)
    const result = await _handlers.readBoard({ ...trelloConnector, api_config: { base_url: '', auth_type: 'api_key' } }, {})

    expect(result.success).toBe(false)
    expect(result.requires_review).toBe(false)
    expect(result.error).toContain('Credenciais do Trello não encontradas')
  })

  it('retorna erro padronizado quando API do Trello lança exceção (sem propagar)', async () => {
    mockFetchBoards.mockRejectedValueOnce(new Error('Erro na API do Trello (401): unauthorized'))
    const result = await _handlers.readBoard(trelloConnector, {})

    expect(result.success).toBe(false)
    expect(result.requires_review).toBe(false)
    expect(result.error).toContain('Falha ao chamar API do Trello')
    expect(result.error).toContain('401')
  })
})

// ─── readRosterFromTrelloHandler ──────────────────────────────────────────────

describe('readRosterFromTrelloHandler — cartões como roster', () => {
  it('mapeia cartões para StudentRecord padronizado', async () => {
    mockFetchCards.mockResolvedValueOnce(SAMPLE_CARDS as any)
    const result = await _handlers.readRosterFromTrello(trelloConnector, { boardId: 'board1' })

    expect(result.success).toBe(true)
    expect(result.layer_used).toBe('api')
    expect(result.requires_review).toBe(false)
    expect((result.data as any).total).toBe(2)
    const students = (result.data as any).students
    expect(students[0].name).toBe('Ana Lima')
    expect(students[0].portal_native_id).toBe('card1')
    expect(students[1].name).toBe('Bruno Santos')
  })

  it('retorna erro padronizado quando boardId ausente', async () => {
    const result = await _handlers.readRosterFromTrello(trelloConnector, {})

    expect(result.success).toBe(false)
    expect(result.error).toContain('boardId')
  })

  it('retorna erro padronizado quando credenciais ausentes', async () => {
    mockGetTrelloConfig.mockReturnValue(null)
    const result = await _handlers.readRosterFromTrello(
      { ...trelloConnector, api_config: { base_url: '', auth_type: 'api_key' } },
      { boardId: 'board1' }
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('Credenciais do Trello não encontradas')
  })

  it('retorna erro padronizado quando API lança exceção', async () => {
    mockFetchCards.mockRejectedValueOnce(new Error('Network error'))
    const result = await _handlers.readRosterFromTrello(trelloConnector, { boardId: 'board1' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Falha ao buscar cartões do Trello')
  })

  it('credenciais embutidas no Connector têm prioridade sobre localStorage', async () => {
    mockFetchCards.mockResolvedValueOnce(SAMPLE_CARDS as any)
    const connWithCreds: Connector = {
      ...trelloConnector,
      api_config: {
        base_url: 'https://api.trello.com/1',
        auth_type: 'api_key',
        credentials: { apiKey: 'embedded_key', apiToken: 'embedded_token' },
      },
    }
    await _handlers.readRosterFromTrello(connWithCreds, { boardId: 'board1' })
    // fetchTrelloCardsFromBoard deve ter sido chamado com as credenciais embutidas
    expect(mockFetchCards).toHaveBeenCalledWith('board1', 'embedded_key', 'embedded_token')
  })
})

// ─── VIA ENGINE ───────────────────────────────────────────────────────────────

describe('registerApiHandlers() — Integração com o Engine', () => {
  it('registra handlers e invokeCapability roteia para read_board', async () => {
    registerConnector(trelloConnector)
    registerApiHandlers()
    mockFetchBoards.mockResolvedValueOnce(SAMPLE_BOARDS as any)

    const result = await invokeCapability('trello_main', 'read_board', {})

    expect(result.success).toBe(true)
    expect(result.layer_used).toBe('api')
    expect((result.data as any).total_boards).toBe(2)
  })

  it('registra handlers e invokeCapability roteia para read_roster (Trello)', async () => {
    registerConnector(trelloConnector)
    registerApiHandlers()
    mockFetchCards.mockResolvedValueOnce(SAMPLE_CARDS as any)

    const result = await invokeCapability('trello_main', 'read_roster', { boardId: 'board1' })

    expect(result.success).toBe(true)
    expect((result.data as any).total).toBe(2)
  })
})

// ─── PROVA CENTRAL DA FASE 2: CONTRATO ÚNICO ENTRE TIERS OPOSTOS ─────────────

describe('PROVA CENTRAL — Mesmo CapabilityResult de mecanismos completamente diferentes', () => {
  it('read_roster via agentic_browser (sidecar CDP) e read_board via api (REST Trello) têm o MESMO formato de contrato', async () => {
    // Registra ambos os conectores
    registerConnector(machadoConnector)
    registerConnector(trelloConnector)
    registerAgenticBrowserHandlers()
    registerApiHandlers()

    // Simula resposta do sidecar (CDP / browser automation)
    mockFetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        success: true,
        students: [{ name: 'Ana Lima', rollNumber: '101' }],
        total: 1,
        layer_used: 'layer_1_deterministic',
        map_source: 'known_map',
        status: 'mapped_validated',
        discovered_map: null,
        structured_log: [],
        immediate_verification_passed: true,
        page_title: '',
        page_url: '',
        section_used: '',
      }),
    } as Response)

    // Simula resposta da API REST do Trello
    mockFetchBoards.mockResolvedValueOnce(SAMPLE_BOARDS as any)

    // Dispara ambos concorrentemente
    const [browserResult, apiResult] = await Promise.all([
      invokeCapability('machado_sobrinho', 'read_roster'),
      invokeCapability('trello_main', 'read_board'),
    ])

    // Ambos devem ter as MESMAS chaves do contrato
    for (const result of [browserResult, apiResult]) {
      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('requires_review')
      expect(result).toHaveProperty('layer_used')
      expect(result).toHaveProperty('data')
      expect(typeof result.success).toBe('boolean')
      expect(typeof result.requires_review).toBe('boolean')
    }

    // Valores específicos de cada tier
    expect(browserResult.success).toBe(true)
    expect(browserResult.layer_used).toBe('layer_1_deterministic')
    expect(browserResult.requires_review).toBe(false)  // mapped_validated

    expect(apiResult.success).toBe(true)
    expect(apiResult.layer_used).toBe('api')
    expect(apiResult.requires_review).toBe(false)      // API é sempre determinística

    // O consumidor não precisa saber como cada um funciona internamente
    const rosters = [
      (browserResult.data as any).students,
      (apiResult.data as any).boards,
    ]
    expect(Array.isArray(rosters[0])).toBe(true)
    expect(Array.isArray(rosters[1])).toBe(true)
  })
})
