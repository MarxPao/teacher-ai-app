// lib/runner/limits.ts
// Rate limiting determinístico, jitter injetável e verificação de limites do SkillGraph v2

import type { Host } from './types'
import { RunnerError } from './types'

export interface RateLimitConfig {
  min_delay_ms: number
  jitter_ms: number
}

/**
 * Injeta atraso determinístico com jitter gerado via Host (sem Math.random() não-injetado).
 */
export async function applyRateLimit(
  config: RateLimitConfig | undefined,
  host: Host
): Promise<number> {
  if (!config) return 0

  const min = Math.max(0, config.min_delay_ms ?? 0)
  const jitter = Math.max(0, config.jitter_ms ?? 0)
  const randomFactor = typeof host.random === 'function' ? host.random() : 0.5

  const delayMs = min + Math.floor(jitter * randomFactor)
  if (delayMs > 0) {
    await host.sleep(delayMs)
  }

  return delayMs
}

/**
 * Confere o limite de escritas por execução (P4).
 */
export function checkMaxWrites(currentWrites: number, maxWrites: number, nodeId?: string): void {
  if (maxWrites !== undefined && currentWrites >= maxWrites) {
    throw new RunnerError(
      'E_MAX_WRITES',
      `Limite máximo de ${maxWrites} escritas por execução atingido (${currentWrites} realizadas)`,
      nodeId
    )
  }
}

/**
 * Confere o limite de iterações em um loop.
 */
export function checkMaxIterations(
  currentIterations: number,
  maxIterations: number,
  nodeId?: string
): void {
  if (maxIterations !== undefined && currentIterations >= maxIterations) {
    throw new RunnerError(
      'E_MAX_ITERATIONS',
      `Limite máximo de ${maxIterations} iterações do loop atingido`,
      nodeId
    )
  }
}

/**
 * Confere conformidade do host em tempo de execução contra allowed_hosts (Obrigação 2).
 */
export function checkAllowedHost(actualHost: string, allowedHosts: string[], nodeId?: string): void {
  if (!actualHost) {
    throw new RunnerError('E_HOST_NOT_ALLOWED', 'Host atual do documento não pôde ser determinado', nodeId)
  }

  const normActual = actualHost.toLowerCase().trim()
  const isAllowed = allowedHosts.some(allowed => {
    const normAllowed = allowed.toLowerCase().trim()
    return normActual === normAllowed || normActual.endsWith(`.${normAllowed}`)
  })

  if (!isAllowed) {
    throw new RunnerError(
      'E_HOST_NOT_ALLOWED',
      `Host '${actualHost}' não permitido pelas regras de segurança do grafo (permitidos: ${allowedHosts.join(', ')})`,
      nodeId,
      { actualHost, allowedHosts }
    )
  }
}
