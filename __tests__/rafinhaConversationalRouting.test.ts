/**
 * rafinhaConversationalRouting.test.ts — FASE 3: Roteamento Conversacional da Rafinha
 *
 * CRITÉRIOS DE ACEITE EXIGIDOS:
 * 1. Teste: comando "Rafinha, lê meus alunos" com 1 conector ativo com read_roster -> resolve automaticamente.
 * 2. Teste: mesmo comando com 2 conectores ativos com read_roster -> Rafinha pergunta qual usar, não adivinha.
 * 3. Teste: comando citando plataforma específica -> vai direto, sem perguntar.
 * 4. Remoção real (não depreciação) de read_page_content e prepare_browser de agentTools.ts e RafinhaChat.tsx.
 * 5. Registro de invoke_teacher_capability no catálogo oficial AGENT_TOOLS.
 */

import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest'
import {
  registerConnector,
  registerCapabilityHandler,
  _resetEngineForTests,
  resolveAndInvokeCapability,
  syncConnectorsFromStorage,
  type Connector,
  type CapabilityResult,
} from '@/lib/connectorEngine'
import { AGENT_TOOLS, TOOL_DISPLAY_NAMES } from '@/lib/agentTools'
import { executeTool } from '@/components/RafinhaChat'

// ─── MOCKS ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/portalConnectionService', () => ({
  listPortalConnections: vi.fn(() => []),
  getPortalConnection: vi.fn(),
}))

vi.mock('@/lib/trelloClient', () => ({
  isTrelloConnected: vi.fn(() => false),
  getTrelloConfig: vi.fn(() => null),
  fetchTrelloBoards: vi.fn(),
  fetchTrelloCardsFromBoard: vi.fn(),
  fetchTrelloLists: vi.fn(),
}))

// Mock do fetch global para chamadas ao sidecar via /api/sidecar-task
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockSidecarSuccess() {
  mockFetch.mockResolvedValue({
    status: 200,
    ok: true,
    json: async () => ({
      success: true,
      students: [
        { name: 'Ana Lima', rollNumber: '101' },
        { name: 'Bruno Santos', rollNumber: '102' },
      ],
      total: 2,
      layer_used: 'layer_1_deterministic',
      map_source: 'known_map',
      status: 'mapped_validated',
      discovered_map: null,
      structured_log: [],
      immediate_verification_passed: true,
      page_title: 'Colégio Machado Sobrinho',
      page_url: 'https://machadosobrinho.paineldoaluno.com.br/professor_notas',
      section_used: '#roster-table',
    }),
  })
}

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
    { name: 'read_board', direction: 'read', requires_human_approval: false, output_schema: 'TrelloBoard[]' },
    { name: 'read_roster', direction: 'read', requires_human_approval: false, output_schema: 'StudentRecord[]' },
  ],
  api_config: { base_url: 'https://api.trello.com/1', auth_type: 'api_key' }
}

// ─── SETUP ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  _resetEngineForTests()
  vi.clearAllMocks()

  // Mock do sidecar
  mockSidecarSuccess()

  // Handlers simulados para os testes
  registerCapabilityHandler('agentic_browser', 'read_roster', async (conn, params) => ({
    success: true,
    requires_review: false,
    layer_used: 'layer_1_deterministic',
    data: {
      students: [
        { name: 'Ana Lima', rollNumber: '101' },
        { name: 'Bruno Santos', rollNumber: '102' },
      ],
      total: 2,
    }
  }))

  registerCapabilityHandler('api', 'read_roster', async (conn, params) => ({
    success: true,
    requires_review: false,
    layer_used: 'api',
    data: {
      students: [
        { name: 'Carlos Eduardo', portal_native_id: 'card_carlos' },
        { name: 'Daniela Rocha', portal_native_id: 'card_daniela' },
      ],
      total: 2,
    }
  }))

  registerCapabilityHandler('api', 'read_board', async (conn, params) => ({
    success: true,
    requires_review: false,
    layer_used: 'api',
    data: {
      boards: [
        { id: 'b1', name: 'Planejamento 2026' },
        { id: 'b2', name: 'Avaliações' }
      ],
      total_boards: 2
    }
  }))
})

// ─── TESTE 1: REMOÇÃO REAL DAS FERRAMENTAS ANTIGAS ────────────────────────────

describe('Auditoria de Catálogo — Remoção Real e Registro da Nova Ferramenta', () => {
  it('AGENT_TOOLS NÃO CONTÉM read_page_content (removida de fato)', () => {
    const found = AGENT_TOOLS.find(t => t.name === 'read_page_content')
    expect(found).toBeUndefined()
  })

  it('AGENT_TOOLS NÃO CONTÉM prepare_browser (removida de fato)', () => {
    const found = AGENT_TOOLS.find(t => t.name === 'prepare_browser')
    expect(found).toBeUndefined()
  })

  it('TOOL_DISPLAY_NAMES não contém as ferramentas removidas', () => {
    expect((TOOL_DISPLAY_NAMES as any).read_page_content).toBeUndefined()
    expect((TOOL_DISPLAY_NAMES as any).prepare_browser).toBeUndefined()
  })

  it('AGENT_TOOLS CONTÉM invoke_teacher_capability com schema correto', () => {
    const tool = AGENT_TOOLS.find(t => t.name === 'invoke_teacher_capability')
    expect(tool).toBeDefined()
    expect(tool?.input_schema.properties.capability).toBeDefined()
    expect(tool?.input_schema.properties.connector_hint).toBeDefined()
    expect(tool?.input_schema.properties.params).toBeDefined()
    expect(tool?.input_schema.required).toContain('capability')
  })

  it('TOOL_DISPLAY_NAMES contém invoke_teacher_capability com rótulo amigável', () => {
    expect(TOOL_DISPLAY_NAMES.invoke_teacher_capability).toEqual({
      label: 'Acessando Plataforma',
      icon: 'ti-plug-connected',
      color: '#8b5e3c'
    })
  })
})

// ─── TESTE 2: CENÁRIO 1 — 1 CONECTOR ATIVO COM read_roster ───────────────────

describe('Cenário 1 — Comando "Rafinha, lê meus alunos" com 1 conector ativo', () => {
  it('resolve automaticamente para o conector ativo sem fazer perguntas', async () => {
    // Apenas Machado Sobrinho registrado e ativo
    registerConnector(machadoConnector)

    const resolution = await resolveAndInvokeCapability({
      capability: 'read_roster'
    })

    expect(resolution.status).toBe('resolved')
    expect(resolution.connector?.id).toBe('machado_sobrinho')
    expect(resolution.connector?.display_name).toBe('Colégio Machado Sobrinho')
    expect(resolution.result?.success).toBe(true)
    expect((resolution.result?.data as any).total).toBe(2)
  })

  it('executeTool em RafinhaChat executa a resolução automática e abre tela de revisão', async () => {
    registerConnector(machadoConnector)

    const output = await executeTool('invoke_teacher_capability', {
      capability: 'read_roster'
    })

    expect(output).toContain('2 alunos identificados em "Colégio Machado Sobrinho"')
    expect(output).toContain('Abrindo tela de revisão para sua conferência')
  })
})

// ─── TESTE 3: CENÁRIO 2 — 2 CONECTORES ATIVOS COM read_roster (AMBIGUIDADE) ──

describe('Cenário 2 — Mesmo comando com 2 conectores ativos (Ambiguidade)', () => {
  it('detecta ambiguidade e pergunta qual usar — NUNCA adivinha', async () => {
    // 2 conectores com read_roster ativos
    registerConnector(machadoConnector)
    registerConnector(trelloConnector)

    const resolution = await resolveAndInvokeCapability({
      capability: 'read_roster'
    })

    // Deve ser 'ambiguous', NÃO 'resolved'
    expect(resolution.status).toBe('ambiguous')
    // NÃO executou nenhum dos dois
    expect(resolution.result).toBeUndefined()
    // Lista os candidatos disponíveis
    expect(resolution.availableConnectors).toHaveLength(2)
    // Pergunta educadamente para a professora
    expect(resolution.message).toContain('Você tem mais de uma plataforma conectada com a capacidade de ler alunos')
    expect(resolution.message).toContain('Colégio Machado Sobrinho')
    expect(resolution.message).toContain('Trello')
    expect(resolution.message).toContain('Em qual delas você gostaria que eu fizesse a leitura?')
  })

  it('executeTool em RafinhaChat retorna a pergunta clarificadora sem chamar conectores', async () => {
    registerConnector(machadoConnector)
    registerConnector(trelloConnector)

    const output = await executeTool('invoke_teacher_capability', {
      capability: 'read_roster'
    })

    expect(output).toContain('Você tem mais de uma plataforma conectada com a capacidade de ler alunos: Colégio Machado Sobrinho e Trello')
    expect(output).toContain('Em qual delas você gostaria que eu fizesse a leitura?')
  })
})

// ─── TESTE 4: CENÁRIO 3 — COMANDO CITANDO PLATAFORMA ESPECÍFICA ───────────────

describe('Cenário 3 — Comando citando plataforma específica', () => {
  beforeEach(() => {
    // Ambos continuam ativos no sistema
    registerConnector(machadoConnector)
    registerConnector(trelloConnector)
  })

  it('com connector_hint "Machado Sobrinho", vai direto sem perguntar', async () => {
    const resolution = await resolveAndInvokeCapability({
      capability: 'read_roster',
      connector_hint: 'Machado Sobrinho'
    })

    expect(resolution.status).toBe('resolved')
    expect(resolution.connector?.id).toBe('machado_sobrinho')
    expect(resolution.result?.success).toBe(true)
    expect((resolution.result?.data as any).students[0].name).toBe('Ana Lima')
  })

  it('com connector_hint "machado" (parcial/minúsculo), resolve por tolerância', async () => {
    const resolution = await resolveAndInvokeCapability({
      capability: 'read_roster',
      connector_hint: 'machado'
    })

    expect(resolution.status).toBe('resolved')
    expect(resolution.connector?.id).toBe('machado_sobrinho')
  })

  it('com connector_hint "Trello", vai direto para o Trello sem perguntar', async () => {
    const resolution = await resolveAndInvokeCapability({
      capability: 'read_roster',
      connector_hint: 'Trello'
    })

    expect(resolution.status).toBe('resolved')
    expect(resolution.connector?.id).toBe('trello_main')
    expect(resolution.result?.success).toBe(true)
    expect((resolution.result?.data as any).students[0].name).toBe('Carlos Eduardo')
  })

  it('executeTool via RafinhaChat respeita o hint específico e retorna o resultado correto', async () => {
    const output = await executeTool('invoke_teacher_capability', {
      capability: 'read_roster',
      connector_hint: 'Machado Sobrinho'
    })

    expect(output).toContain('2 alunos identificados em "Colégio Machado Sobrinho"')
  })
})

// ─── TESTE 5: TRATAMENTO DE ERROS E CASOS DE BORDA ────────────────────────────

describe('Casos de Borda e Validação Defensiva', () => {
  it('retorna status "no_connector" se a plataforma especificada não existir', async () => {
    registerConnector(machadoConnector)

    const resolution = await resolveAndInvokeCapability({
      capability: 'read_roster',
      connector_hint: 'Portal Fantasma'
    })

    expect(resolution.status).toBe('no_connector')
    expect(resolution.message).toContain('Não encontrei a plataforma "Portal Fantasma" conectada')
    expect(resolution.message).toContain('Colégio Machado Sobrinho')
  })

  it('retorna status "error" se a plataforma existe mas não oferece a capacidade', async () => {
    registerConnector(machadoConnector) // Machado NÃO oferece read_board

    const resolution = await resolveAndInvokeCapability({
      capability: 'read_board',
      connector_hint: 'Machado Sobrinho'
    })

    expect(resolution.status).toBe('error')
    expect(resolution.message).toContain('não oferece a capacidade de ler quadros')
  })

  it('retorna status "no_connector" amigável se nenhum conector estiver ativo', async () => {
    // Zero conectores
    const resolution = await resolveAndInvokeCapability({
      capability: 'read_roster'
    })

    expect(resolution.status).toBe('no_connector')
    expect(resolution.message).toContain('Nenhuma plataforma conectada ativa')
  })

  it('ignora conector com status "never_connected" na resolução automática', async () => {
    const inactiveConnector: Connector = {
      ...machadoConnector,
      id: 'portal_inativo',
      display_name: 'Portal Inativo',
      status: 'never_connected',
    }
    registerConnector(inactiveConnector)

    const resolution = await resolveAndInvokeCapability({
      capability: 'read_roster'
    })

    expect(resolution.status).toBe('no_connector')
    expect(resolution.message).toContain('Portal Inativo')
    expect(resolution.message).toContain('ainda não foi conectada')
  })
})

// ─── TESTE 6: TRANSCRIPT REAL DE CONVERSA (PROVA COMPLETA DOS 3 CENÁRIOS) ──────

describe('Prova Conversacional — Transcript dos 3 Cenários Exigidos', () => {
  it('executa e valida o transcript conversacional dos 3 cenários em sequência', async () => {
    const transcript: Array<{ speaker: string; text: string }> = []

    // ── CENÁRIO 1: 1 conector ativo ──────────────────────────────────────────
    _resetEngineForTests()
    registerConnector(machadoConnector)

    transcript.push({ speaker: 'Professora', text: 'Rafinha, lê meus alunos' })
    const r1 = await executeTool('invoke_teacher_capability', { capability: 'read_roster' })
    transcript.push({ speaker: 'Rafinha (Cenário 1 - 1 ativo)', text: r1 })

    expect(r1).toContain('Colégio Machado Sobrinho')
    expect(r1).not.toContain('Em qual delas você gostaria')

    // ── CENÁRIO 2: 2 conectores ativos (sem hint -> ambiguidade) ─────────────
    registerConnector(trelloConnector)

    transcript.push({ speaker: 'Professora', text: 'Rafinha, lê meus alunos' })
    const r2 = await executeTool('invoke_teacher_capability', { capability: 'read_roster' })
    transcript.push({ speaker: 'Rafinha (Cenário 2 - Ambiguidade)', text: r2 })

    expect(r2).toContain('Você tem mais de uma plataforma conectada com a capacidade de ler alunos: Colégio Machado Sobrinho e Trello')
    expect(r2).toContain('Em qual delas você gostaria que eu fizesse a leitura?')

    // ── CENÁRIO 3: 2 conectores ativos com hint específico ───────────────────
    transcript.push({ speaker: 'Professora', text: 'No Machado Sobrinho' })
    const r3 = await executeTool('invoke_teacher_capability', {
      capability: 'read_roster',
      connector_hint: 'Machado Sobrinho'
    })
    transcript.push({ speaker: 'Rafinha (Cenário 3 - Direto via hint)', text: r3 })

    expect(r3).toContain('Colégio Machado Sobrinho')
    expect(r3).not.toContain('Em qual delas')

    // Validação estrutural do transcript
    expect(transcript).toHaveLength(6)
    console.log('\n=== TRANSCRIPT REAL DE CONVERSA (FASE 3) ===')
    for (const entry of transcript) {
      console.log(`[${entry.speaker}]: ${entry.text}`)
    }
    console.log('============================================\n')
  })
})
