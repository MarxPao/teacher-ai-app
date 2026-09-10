/**
 * lib/connectorTelemetry.ts — Telemetria de Confiabilidade do Connector Engine (FASE 5)
 *
 * PROPÓSITO:
 * Mede o desempenho, confiabilidade e estabilidade do Connector Engine
 * de forma 100% local e com PRIVACIDADE TOTAL por design.
 *
 * REGRAS DE PRIVACIDADE E SEGURANÇA (INEGOCIÁVEIS):
 * 1. Zero PII: NENHUM dado de aluno (nome, matrícula, notas, fotos, dados pessoais)
 *    pode ser gravado na telemetria.
 * 2. Armazenamento 100% Local: Registrado apenas no localStorage do professor
 *    ('teacher_connector_telemetry_v1'), nunca enviado a servidores centrais.
 * 3. Buffer rotativo: Máximo de 500 eventos mais recentes mantidos para evitar
 *    consumo desnecessário de memória local.
 *
 * MÉTRICAS AFERIDAS:
 * - Taxa de sucesso geral e por conector
 * - Taxa de acionamento de Camada 2 (visão/descoberta) por conector agentic_browser
 * - Taxa de revisões manuais requeridas (requires_review: true)
 * - Volume de invocações por capability
 */

import type { ConnectorTier, CapabilityName, CapabilityResult } from '@/lib/connectorEngine'

export const CONNECTOR_TELEMETRY_STORAGE_KEY = 'teacher_connector_telemetry_v1'
export const MAX_TELEMETRY_EVENTS = 500

export interface TelemetryEvent {
  id: string
  timestamp: string
  connector_id: string
  connector_tier: ConnectorTier
  capability: CapabilityName
  success: boolean
  requires_review: boolean
  layer_used?: 'api' | 'layer_1_deterministic' | 'layer_2_vision'
  duration_ms: number
  error_code?: string
}

export interface ConnectorMetricsItem {
  connector_id: string
  tier: ConnectorTier
  total: number
  successes: number
  failures: number
  success_rate: number
  layer_1_count: number
  layer_2_count: number
  layer_2_rate: number
  requires_review_count: number
  requires_review_rate: number
  avg_duration_ms: number
}

export interface CapabilityMetricsItem {
  capability: CapabilityName
  total: number
  successes: number
  failures: number
  success_rate: number
}

export interface TelemetryMetrics {
  total_invocations: number
  success_count: number
  failure_count: number
  success_rate: number
  layer_1_count: number
  layer_2_count: number
  layer_2_rate: number
  requires_review_count: number
  requires_review_rate: number
  avg_duration_ms: number
  by_connector: Record<string, ConnectorMetricsItem>
  by_capability: Record<string, CapabilityMetricsItem>
}

/**
 * Lê o histórico de eventos de telemetria gravados localmente.
 */
export function getTelemetryEvents(): TelemetryEvent[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(CONNECTOR_TELEMETRY_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * Registra um evento de telemetria sem vazar nenhum dado de aluno.
 */
export function recordTelemetryEvent(
  params: Omit<TelemetryEvent, 'id' | 'timestamp'>
): TelemetryEvent {
  const event: TelemetryEvent = {
    id: `tel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    connector_id: String(params.connector_id || 'unknown'),
    connector_tier: params.connector_tier,
    capability: params.capability,
    success: Boolean(params.success),
    requires_review: Boolean(params.requires_review),
    layer_used: params.layer_used,
    duration_ms: Math.max(0, Math.round(params.duration_ms || 0)),
    error_code: params.error_code,
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const current = getTelemetryEvents()
      const updated = [event, ...current].slice(0, MAX_TELEMETRY_EVENTS)
      localStorage.setItem(CONNECTOR_TELEMETRY_STORAGE_KEY, JSON.stringify(updated))
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('teacher:connector_telemetry_updated', { detail: event }))
      }
    } catch {
      // Falhas no localStorage não devem quebrar a aplicação
    }
  }

  return event
}

/**
 * Calcula métricas agregadas da telemetria para o painel de diagnóstico.
 */
export function getTelemetryMetrics(): TelemetryMetrics {
  const events = getTelemetryEvents()
  const total = events.length

  if (total === 0) {
    return {
      total_invocations: 0,
      success_count: 0,
      failure_count: 0,
      success_rate: 100,
      layer_1_count: 0,
      layer_2_count: 0,
      layer_2_rate: 0,
      requires_review_count: 0,
      requires_review_rate: 0,
      avg_duration_ms: 0,
      by_connector: {},
      by_capability: {},
    }
  }

  let successes = 0
  let failures = 0
  let layer1 = 0
  let layer2 = 0
  let reviews = 0
  let totalDuration = 0

  const byConnector: Record<string, ConnectorMetricsItem> = {}
  const byCapability: Record<string, CapabilityMetricsItem> = {}

  for (const ev of events) {
    if (ev.success) successes++
    else failures++

    if (ev.layer_used === 'layer_1_deterministic') layer1++
    if (ev.layer_used === 'layer_2_vision') layer2++
    if (ev.requires_review) reviews++
    totalDuration += ev.duration_ms

    // Agregação por Conector
    if (!byConnector[ev.connector_id]) {
      byConnector[ev.connector_id] = {
        connector_id: ev.connector_id,
        tier: ev.connector_tier,
        total: 0,
        successes: 0,
        failures: 0,
        success_rate: 0,
        layer_1_count: 0,
        layer_2_count: 0,
        layer_2_rate: 0,
        requires_review_count: 0,
        requires_review_rate: 0,
        avg_duration_ms: 0,
      }
    }
    const cItem = byConnector[ev.connector_id]
    cItem.total++
    if (ev.success) cItem.successes++
    else cItem.failures++
    if (ev.layer_used === 'layer_1_deterministic') cItem.layer_1_count++
    if (ev.layer_used === 'layer_2_vision') cItem.layer_2_count++
    if (ev.requires_review) cItem.requires_review_count++

    // Agregação por Capacidade
    if (!byCapability[ev.capability]) {
      byCapability[ev.capability] = {
        capability: ev.capability,
        total: 0,
        successes: 0,
        failures: 0,
        success_rate: 0,
      }
    }
    const capItem = byCapability[ev.capability]
    capItem.total++
    if (ev.success) capItem.successes++
    else capItem.failures++
  }

  // Normalização de porcentagens por conector
  for (const k of Object.keys(byConnector)) {
    const item = byConnector[k]
    item.success_rate = Math.round((item.successes / item.total) * 100)
    const browserInvocations = item.layer_1_count + item.layer_2_count
    item.layer_2_rate = browserInvocations > 0 ? Math.round((item.layer_2_count / browserInvocations) * 100) : 0
    item.requires_review_rate = Math.round((item.requires_review_count / item.total) * 100)
  }

  // Normalização de porcentagens por capability
  for (const k of Object.keys(byCapability)) {
    const item = byCapability[k]
    item.success_rate = Math.round((item.successes / item.total) * 100)
  }

  const browserTotal = layer1 + layer2

  return {
    total_invocations: total,
    success_count: successes,
    failure_count: failures,
    success_rate: Math.round((successes / total) * 100),
    layer_1_count: layer1,
    layer_2_count: layer2,
    layer_2_rate: browserTotal > 0 ? Math.round((layer2 / browserTotal) * 100) : 0,
    requires_review_count: reviews,
    requires_review_rate: Math.round((reviews / total) * 100),
    avg_duration_ms: Math.round(totalDuration / total),
    by_connector: byConnector,
    by_capability: byCapability,
  }
}

/**
 * Limpa todos os eventos gravados (útil para testes e diagnósticos).
 */
export function clearTelemetry(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(CONNECTOR_TELEMETRY_STORAGE_KEY)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('teacher:connector_telemetry_updated'))
    }
  }
}
