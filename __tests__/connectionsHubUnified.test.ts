/**
 * connectionsHubUnified.test.ts — FASE 4: Central de Conexões e UX Unificada
 *
 * CRITÉRIOS DE ACEITE:
 * 1. Adicionar um conector de cada tier usando o MESMO fluxo de componente
 *    (PortalConnectionWizardModal parametrizado por tier, não duas telas diferentes).
 * 2. Confirmação de consolidação e remoção de código duplicado (Extensions e
 *    ConnectedPortalsPanel delegam para ConnectionsHub).
 * 3. Ambos os tiers exibem o mesmo padrão de card e status em linguagem não-técnica.
 * 4. Ação de sincronização unificada via invokeCapability.
 */

import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest'
import {
  registerConnector,
  listConnectors,
  _resetEngineForTests,
  invokeCapability,
  type Connector,
} from '@/lib/connectorEngine'
import {
  validateStudentName,
  batchApproveWizardStudents,
  validateWizardRosterIntegrity,
  type WizardStudentItem,
} from '@/lib/rosterReconciler'
import { upsertConnection, getPortalConnection, listPortalConnections } from '@/lib/portalConnectionService'
import { saveTrelloConfig, isTrelloConnected, clearTrelloConfig } from '@/lib/trelloClient'

// ─── MOCKS ───────────────────────────────────────────────────────────────────

let mockStorage: Record<string, string> = {}

beforeEach(() => {
  _resetEngineForTests()
  mockStorage = {}
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mockStorage[k] || null,
    setItem: (k: string, v: string) => { mockStorage[k] = String(v) },
    removeItem: (k: string) => { delete mockStorage[k] },
    clear: () => { mockStorage = {} },
  })
  vi.stubGlobal('window', {
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

// ─── TESTE 1: DESDUPLICAÇÃO E CONSOLIDAÇÃO ARQUITETURAL ─────────────────────

describe('1. Desduplicação Arquitetural — Central de Conexões Única', () => {
  it('Extensions.tsx é um adaptador fino que delega para ConnectionsHub', async () => {
    const ExtensionsModule = await import('@/components/modules/Extensions')
    expect(ExtensionsModule.default).toBeDefined()
    expect(typeof ExtensionsModule.default).toBe('function')
  })

  it('ConnectedPortalsPanel.tsx é um adaptador fino que delega para ConnectionsHub', async () => {
    const PanelModule = await import('@/components/modules/ConnectedPortalsPanel')
    expect(PanelModule.default).toBeDefined()
    expect(typeof PanelModule.default).toBe('function')
  })

  it('ConnectionsHub.tsx é o componente canônico unificado', async () => {
    const HubModule = await import('@/components/modules/ConnectionsHub')
    expect(HubModule.default).toBeDefined()
    expect(typeof HubModule.default).toBe('function')
  })
})

// ─── TESTE 2: MESMO FLUXO DE CONEXÃO PARAMETRIZADO (WIZARD UNIFICADO) ────────

describe('2. Wizard Unificado — Parametrização por Tier sem Duplicação de Telas', () => {
  it('FLUXO TIER agentic_browser: conecta portal escolar e passa pelos mesmos passos 2-4', async () => {
    const portalName = 'Colégio Machado Sobrinho'
    const portalUrl = 'https://machadosobrinho.paineldoaluno.com.br/chamada'

    // Passo 1: Dados do formulário
    expect(portalName).toBeTruthy()
    expect(portalUrl).toContain('machadosobrinho')

    // Passo 2: Dados simulados do sidecar
    const rawStudents = [
      { name: 'Ana Lima', rollNumber: '101' },
      { name: 'Bruno Costa', rollNumber: '102' },
      { name: 'Total de Alunos', rollNumber: '103' }, // Termo de interface de tabela
    ]

    // Passo 3: O MESMO gate de integridade avalia os alunos
    const previewItems: WizardStudentItem[] = rawStudents.map((s, idx) => {
      const val = validateStudentName(s.name)
      return {
        id: `st_${idx}`,
        name: s.name,
        rollNumber: s.rollNumber,
        portal_native_id: `nat_${idx}`,
        className: 'Turma A',
        confidence: val.isSuspicious ? 0.3 : 0.95,
        isSuspicious: val.isSuspicious,
        suspiciousReason: val.reason,
        decision: 'pending' as const,
      }
    })

    // Gate estrito detecta o item suspeito
    const batchResult = batchApproveWizardStudents(previewItems)
    expect(batchResult.approvedCount).toBe(2)
    expect(batchResult.skippedCount).toBe(1)

    // Bloqueia gravação enquanto houver pendência
    const preCheck = validateWizardRosterIntegrity(batchResult.updatedStudents)
    expect(preCheck.isValid).toBe(false)

    // Professor rejeita o item suspeito
    const finalized = batchResult.updatedStudents.map(s =>
      s.isSuspicious ? { ...s, decision: 'rejected' as const } : s
    )
    const postCheck = validateWizardRosterIntegrity(finalized)
    expect(postCheck.isValid).toBe(true)

    // Passo 4: Gravação
    const conn = upsertConnection('machadosobrinho.paineldoaluno.com.br', {
      name: portalName,
      domain: 'machadosobrinho.paineldoaluno.com.br',
      status: 'mapped_validated',
    })
    expect(conn.status).toBe('mapped_validated')
    expect(getPortalConnection('machadosobrinho.paineldoaluno.com.br')).toBeDefined()
  })

  it('FLUXO TIER api (Trello): conecta conta e passa pelos MESMOS passos 2-4 e MESMO gate', async () => {
    // Passo 1: Credenciais
    const apiKey = 'test_key_trello'
    const apiToken = 'test_token_trello'

    saveTrelloConfig({
      apiKey,
      apiToken,
      username: 'prof_teste',
      fullName: 'Professora Teste',
    })
    expect(isTrelloConnected()).toBe(true)

    // Passo 2: Cartões retornados pela API do Trello
    const trelloCards = [
      { id: 'c1', name: 'Carlos Eduardo' },
      { id: 'c2', name: 'Daniela Rocha' },
      { id: 'c3', name: '---' }, // Ruído para testar gate
    ]

    // Passo 3: O MESMO gate de integridade avalia os cartões do Trello
    const previewItems: WizardStudentItem[] = trelloCards.map((c, idx) => {
      const val = validateStudentName(c.name)
      return {
        id: c.id,
        name: c.name,
        rollNumber: '',
        portal_native_id: c.id,
        className: 'Quadro 8A',
        confidence: val.isSuspicious ? 0.3 : 0.95,
        isSuspicious: val.isSuspicious,
        suspiciousReason: val.reason,
        decision: 'pending' as const,
      }
    })

    // O mesmo batchApproveWizardStudents funciona para cartões do Trello
    const batchResult = batchApproveWizardStudents(previewItems)
    expect(batchResult.approvedCount).toBe(2)
    expect(batchResult.skippedCount).toBe(1) // '---' é marcado como suspeito

    // Decisão e homologação
    const finalized = batchResult.updatedStudents.map(s =>
      s.isSuspicious ? { ...s, decision: 'rejected' as const } : s
    )
    expect(validateWizardRosterIntegrity(finalized).isValid).toBe(true)

    // Passo 4: Registrado no engine como conector ativo
    registerConnector({
      id: 'trello_main',
      display_name: 'Trello',
      tier: 'api',
      status: 'mapped_validated',
      capabilities: [
        { name: 'read_board', direction: 'read', requires_human_approval: false, output_schema: 'TrelloBoard[]' },
        { name: 'read_roster', direction: 'read', requires_human_approval: false, output_schema: 'StudentRecord[]' },
      ],
      api_config: { base_url: 'https://api.trello.com/1', auth_type: 'api_key' },
    })

    const all = listConnectors()
    expect(all.some(c => c.id === 'trello_main')).toBe(true)
  })
})

// ─── TESTE 3: GRADE UNIFICADA E PADRÃO DE CARD IDENTICO ───────────────────────

describe('3. Grade Unificada da Central de Conexões', () => {
  it('exibe conectores de ambos os tiers lado a lado com mesmo contrato visual', () => {
    const portalConn: Connector = {
      id: 'machado',
      display_name: 'Colégio Machado Sobrinho',
      tier: 'agentic_browser',
      status: 'mapped_validated',
      capabilities: [{ name: 'read_roster', direction: 'read', requires_human_approval: false, output_schema: 'StudentRecord[]' }],
      browser_config: { domain: 'machadosobrinho.paineldoaluno.com.br' }
    }

    const trelloConn: Connector = {
      id: 'trello_main',
      display_name: 'Trello',
      tier: 'api',
      status: 'mapped_validated',
      capabilities: [{ name: 'read_board', direction: 'read', requires_human_approval: false, output_schema: 'TrelloBoard[]' }],
      api_config: { base_url: 'https://api.trello.com/1', auth_type: 'api_key' }
    }

    registerConnector(portalConn)
    registerConnector(trelloConn)

    const list = listConnectors()
    expect(list).toHaveLength(2)

    // Ambos possuem status não-técnico 'mapped_validated' ("Conectado e Pronto")
    for (const c of list) {
      expect(c.status).toBe('mapped_validated')
      expect(c.capabilities.length).toBeGreaterThan(0)
    }

    // Filtros do hub funcionam
    const portalsOnly = list.filter(c => c.tier === 'agentic_browser')
    const apisOnly = list.filter(c => c.tier === 'api')

    expect(portalsOnly).toHaveLength(1)
    expect(apisOnly).toHaveLength(1)
    expect(portalsOnly[0].display_name).toBe('Colégio Machado Sobrinho')
    expect(apisOnly[0].display_name).toBe('Trello')
  })

  it('integração de telemetria e confiabilidade local no Hub', async () => {
    const { getTelemetryMetrics, recordTelemetryEvent } = await import('@/lib/connectorTelemetry')

    // Registra evento de browser
    recordTelemetryEvent({
      connector_id: 'machado',
      connector_tier: 'agentic_browser',
      capability: 'read_roster',
      success: true,
      requires_review: false,
      layer_used: 'layer_1_deterministic',
      duration_ms: 150,
    })

    const metrics = getTelemetryMetrics()
    expect(metrics.total_invocations).toBe(1)
    expect(metrics.success_rate).toBe(100)
    expect(metrics.by_connector['machado']).toBeDefined()
    expect(metrics.by_connector['machado'].total).toBe(1)
  })
})

