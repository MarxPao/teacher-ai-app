/**
 * __tests__/connectorTelemetry.test.ts — FASE 5: Telemetria de Confiabilidade do Connector Engine
 *
 * CRITÉRIOS DE ACEITE:
 * 1. Registro automático de telemetria em cada invocação de capability no Connector Engine.
 * 2. Cálculo correto de taxas de sucesso, acionamento de Camada 2 (visão), e revisões manuais.
 * 3. Buffer rotativo com teto de 500 eventos para integridade do localStorage.
 * 4. Limpeza e redefinição de métricas (clearTelemetry).
 * 5. AUDITORIA ESTRITA DE PRIVACIDADE (ZERO PII): Nenhum nome de aluno, matrícula,
 *    nota ou dado sensível pode ser gravado em momento algum na telemetria.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  _resetEngineForTests,
  registerConnector,
  registerCapabilityHandler,
  invokeCapability,
  type Connector,
  type CapabilityResult,
} from '@/lib/connectorEngine'
import {
  recordTelemetryEvent,
  getTelemetryEvents,
  getTelemetryMetrics,
  clearTelemetry,
  CONNECTOR_TELEMETRY_STORAGE_KEY,
  MAX_TELEMETRY_EVENTS,
  type TelemetryEvent,
} from '@/lib/connectorTelemetry'

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

// ─── 1. REGISTRO AUTOMÁTICO EM INVOCAÇÕES ────────────────────────────────────

describe('1. Registro Automático de Telemetria no Connector Engine', () => {
  it('registra evento bem-sucedido com tempo e camada utilizada ao chamar invokeCapability', async () => {
    const connector: Connector = {
      id: 'portal.teste.com',
      display_name: 'Portal Teste',
      tier: 'agentic_browser',
      capabilities: [{ name: 'read_roster', description: 'Lê alunos', parameters: [] }],
      status: 'mapped_validated',
    }
    registerConnector(connector)

    registerCapabilityHandler('agentic_browser', 'read_roster', async () => {
      return {
        success: true,
        requires_review: false,
        layer_used: 'layer_1_deterministic',
        data: {
          students: [
            { name: 'Maria Silva', rollNumber: '10' },
            { name: 'João Santos', rollNumber: '11' },
          ],
        },
      }
    })

    const result = await invokeCapability('portal.teste.com', 'read_roster')
    expect(result.success).toBe(true)

    const events = getTelemetryEvents()
    expect(events.length).toBe(1)
    expect(events[0].connector_id).toBe('portal.teste.com')
    expect(events[0].connector_tier).toBe('agentic_browser')
    expect(events[0].capability).toBe('read_roster')
    expect(events[0].success).toBe(true)
    expect(events[0].requires_review).toBe(false)
    expect(events[0].layer_used).toBe('layer_1_deterministic')
    expect(events[0].duration_ms).toBeGreaterThanOrEqual(0)
    expect(events[0].error_code).toBeUndefined()
  })

  it('registra evento com erro CAPABILITY_NOT_SUPPORTED se a capability não for oferecida', async () => {
    const connector: Connector = {
      id: 'trello.oficial',
      display_name: 'Trello Oficial',
      tier: 'api',
      capabilities: [{ name: 'read_board', description: 'Lê quadros', parameters: [] }],
      status: 'mapped_validated',
    }
    registerConnector(connector)

    const result = await invokeCapability('trello.oficial', 'read_roster')
    expect(result.success).toBe(false)

    const events = getTelemetryEvents()
    expect(events.length).toBe(1)
    expect(events[0].connector_id).toBe('trello.oficial')
    expect(events[0].success).toBe(false)
    expect(events[0].error_code).toBe('CAPABILITY_NOT_SUPPORTED')
  })

  it('registra evento com erro NO_HANDLER_REGISTERED se o handler não existir', async () => {
    const connector: Connector = {
      id: 'custom.api',
      display_name: 'Custom API',
      tier: 'api',
      capabilities: [{ name: 'read_roster', description: 'Lê alunos', parameters: [] }],
      status: 'mapped_validated',
    }
    registerConnector(connector)

    const result = await invokeCapability('custom.api', 'read_roster')
    expect(result.success).toBe(false)

    const events = getTelemetryEvents()
    expect(events.length).toBe(1)
    expect(events[0].error_code).toBe('NO_HANDLER_REGISTERED')
  })

  it('registra evento com erro HANDLER_EXCEPTION quando o handler lança erro imprevisto', async () => {
    const connector: Connector = {
      id: 'portal.crash',
      display_name: 'Portal Quebrado',
      tier: 'agentic_browser',
      capabilities: [{ name: 'read_roster', description: 'Lê alunos', parameters: [] }],
      status: 'mapped_validated',
    }
    registerConnector(connector)

    registerCapabilityHandler('agentic_browser', 'read_roster', async () => {
      throw new Error('Falha de rede ou timeout inesperado')
    })

    const result = await invokeCapability('portal.crash', 'read_roster')
    expect(result.success).toBe(false)

    const events = getTelemetryEvents()
    expect(events.length).toBe(1)
    expect(events[0].success).toBe(false)
    expect(events[0].error_code).toBe('HANDLER_EXCEPTION')
  })

  it('registra flag requires_review: true e layer_2_vision quando acionada descoberta visual', async () => {
    const connector: Connector = {
      id: 'portal.complexo',
      display_name: 'Portal com Grid Dinâmico',
      tier: 'agentic_browser',
      capabilities: [{ name: 'read_roster', description: 'Lê alunos', parameters: [] }],
      status: 'mapped_untested',
    }
    registerConnector(connector)

    registerCapabilityHandler('agentic_browser', 'read_roster', async () => {
      return {
        success: true,
        requires_review: true,
        layer_used: 'layer_2_vision',
        data: { students: [{ name: 'Carlos Santos', rollNumber: '20' }] },
      }
    })

    const result = await invokeCapability('portal.complexo', 'read_roster')
    expect(result.success).toBe(true)
    expect(result.requires_review).toBe(true)

    const events = getTelemetryEvents()
    expect(events[0].layer_used).toBe('layer_2_vision')
    expect(events[0].requires_review).toBe(true)
  })
})

// ─── 2. CÁLCULO DE MÉTRICAS AGREGADAS ────────────────────────────────────────

describe('2. Cálculo e Agregação de Métricas de Confiabilidade', () => {
  it('retorna métricas padrão limpas quando não há eventos', () => {
    const metrics = getTelemetryMetrics()
    expect(metrics.total_invocations).toBe(0)
    expect(metrics.success_count).toBe(0)
    expect(metrics.failure_count).toBe(0)
    expect(metrics.success_rate).toBe(100)
    expect(metrics.layer_2_rate).toBe(0)
    expect(metrics.requires_review_rate).toBe(0)
    expect(metrics.avg_duration_ms).toBe(0)
    expect(Object.keys(metrics.by_connector).length).toBe(0)
  })

  it('calcula taxas percentuais precisas para sucesso, Camada 2 e revisões humanas', () => {
    // 3 invocações no portal:
    // 1: Sucesso determinístico Camada 1
    // 2: Sucesso com Visão Camada 2 (requer revisão)
    // 3: Falha de conexão
    recordTelemetryEvent({
      connector_id: 'escola.com.br',
      connector_tier: 'agentic_browser',
      capability: 'read_roster',
      success: true,
      requires_review: false,
      layer_used: 'layer_1_deterministic',
      duration_ms: 200,
    })

    recordTelemetryEvent({
      connector_id: 'escola.com.br',
      connector_tier: 'agentic_browser',
      capability: 'read_roster',
      success: true,
      requires_review: true,
      layer_used: 'layer_2_vision',
      duration_ms: 1000,
    })

    recordTelemetryEvent({
      connector_id: 'escola.com.br',
      connector_tier: 'agentic_browser',
      capability: 'read_roster',
      success: false,
      requires_review: false,
      duration_ms: 300,
      error_code: 'TIMEOUT',
    })

    // 1 invocação no Trello: Sucesso API direto
    recordTelemetryEvent({
      connector_id: 'trello.oficial',
      connector_tier: 'api',
      capability: 'read_board',
      success: true,
      requires_review: false,
      layer_used: 'api',
      duration_ms: 100,
    })

    const metrics = getTelemetryMetrics()

    // 4 invocações no total: 3 sucessos, 1 falha => 75% de sucesso
    expect(metrics.total_invocations).toBe(4)
    expect(metrics.success_count).toBe(3)
    expect(metrics.failure_count).toBe(1)
    expect(metrics.success_rate).toBe(75)

    // Das 2 invocações de browser com camada identificada: 1 Camada 1 e 1 Camada 2 => 50% Camada 2
    expect(metrics.layer_1_count).toBe(1)
    expect(metrics.layer_2_count).toBe(1)
    expect(metrics.layer_2_rate).toBe(50)

    // 1 de 4 requer revisão => 25%
    expect(metrics.requires_review_count).toBe(1)
    expect(metrics.requires_review_rate).toBe(25)

    // Duração média: (200 + 1000 + 300 + 100) / 4 = 400ms
    expect(metrics.avg_duration_ms).toBe(400)

    // Agrupamento por Conector
    expect(metrics.by_connector['escola.com.br']).toBeDefined()
    expect(metrics.by_connector['escola.com.br'].total).toBe(3)
    expect(metrics.by_connector['escola.com.br'].successes).toBe(2)
    expect(metrics.by_connector['escola.com.br'].success_rate).toBe(67) // 2/3 ~ 67%
    expect(metrics.by_connector['escola.com.br'].layer_2_rate).toBe(50) // 1 de 2 browser ~ 50%

    expect(metrics.by_connector['trello.oficial']).toBeDefined()
    expect(metrics.by_connector['trello.oficial'].total).toBe(1)
    expect(metrics.by_connector['trello.oficial'].success_rate).toBe(100)

    // Agrupamento por Capability
    expect(metrics.by_capability['read_roster']).toBeDefined()
    expect(metrics.by_capability['read_roster'].total).toBe(3)
    expect(metrics.by_capability['read_board']).toBeDefined()
    expect(metrics.by_capability['read_board'].total).toBe(1)
  })
})

// ─── 3. LIMPEZA E BUFFER ROTATIVO ────────────────────────────────────────────

describe('3. Buffer Rotativo e Limpeza de Telemetria', () => {
  it('mantém no máximo MAX_TELEMETRY_EVENTS (500) eventos mais recentes', () => {
    for (let i = 0; i < 550; i++) {
      recordTelemetryEvent({
        connector_id: `conn_${i % 5}`,
        connector_tier: 'agentic_browser',
        capability: 'read_roster',
        success: true,
        requires_review: false,
        duration_ms: 50,
      })
    }

    const events = getTelemetryEvents()
    expect(events.length).toBe(MAX_TELEMETRY_EVENTS)
    expect(events.length).toBe(500)
  })

  it('clearTelemetry remove todos os eventos e dispara evento teacher:connector_telemetry_updated', () => {
    recordTelemetryEvent({
      connector_id: 'test',
      connector_tier: 'api',
      capability: 'read_board',
      success: true,
      requires_review: false,
      duration_ms: 10,
    })
    expect(getTelemetryEvents().length).toBe(1)

    clearTelemetry()
    expect(getTelemetryEvents().length).toBe(0)
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'teacher:connector_telemetry_updated' })
    )
  })
})

// ─── 4. AUDITORIA ESTRITA DE PRIVACIDADE (ZERO PII) ──────────────────────────

describe('4. Auditoria Estrita de Privacidade (Zero PII por Design)', () => {
  it('NUNCA armazena nomes de alunos, matrículas, notas ou dados sensíveis nos eventos de telemetria', async () => {
    const sensitiveConnector: Connector = {
      id: 'portal.sigiloso.edu.br',
      display_name: 'Portal Sigiloso',
      tier: 'agentic_browser',
      capabilities: [{ name: 'read_roster', description: 'Lê alunos sigilosos', parameters: [] }],
      status: 'mapped_validated',
    }
    registerConnector(sensitiveConnector)

    const alunoSecreto = 'Guilherme Siqueira de Albuquerque'
    const matriculaSecreta = 'RA-998877665544'
    const notaSecreta = 9.85

    registerCapabilityHandler('agentic_browser', 'read_roster', async () => {
      return {
        success: true,
        requires_review: false,
        layer_used: 'layer_1_deterministic',
        data: {
          students: [
            { name: alunoSecreto, rollNumber: matriculaSecreta, grade: notaSecreta },
          ],
        },
      }
    })

    await invokeCapability('portal.sigiloso.edu.br', 'read_roster')

    // Inspeciona todo o storage gravado
    const rawStorage = mockStorage[CONNECTOR_TELEMETRY_STORAGE_KEY]
    expect(rawStorage).toBeDefined()

    // Verificação estrita de ausência de PII em todo o texto JSON
    expect(rawStorage).not.toContain(alunoSecreto)
    expect(rawStorage).not.toContain(matriculaSecreta)
    expect(rawStorage).not.toContain('Guilherme')
    expect(rawStorage).not.toContain('Albuquerque')
    expect(rawStorage).not.toContain('998877665544')
    expect(rawStorage).not.toContain('9.85')

    // Validação estrutural de cada objeto salvo
    const events: TelemetryEvent[] = JSON.parse(rawStorage)
    const allowedKeys = new Set([
      'id',
      'timestamp',
      'connector_id',
      'connector_tier',
      'capability',
      'success',
      'requires_review',
      'layer_used',
      'duration_ms',
      'error_code',
    ])

    for (const ev of events) {
      for (const k of Object.keys(ev)) {
        expect(allowedKeys.has(k)).toBe(true)
      }
      // Garante que connector_id seja apenas o identificador da plataforma
      expect(ev.connector_id).toBe('portal.sigiloso.edu.br')
    }
  })
})
