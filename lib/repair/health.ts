// lib/repair/health.ts
// Reducer determinístico de métricas de saúde por grafo (sem PII)

import type { GraphHealthMetrics } from './types'

export function createInitialHealthMetrics(graphId: string): GraphHealthMetrics {
  return {
    graphId,
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    softHealsCount: 0,
    manualRepairsCount: 0,
    lastExecutionAt: null,
    lastRepairAt: null,
    status: 'healthy',
  }
}

export function computeGraphHealthStatus(
  metrics: Omit<GraphHealthMetrics, 'status'>
): 'healthy' | 'degraded' | 'broken' {
  if (metrics.totalExecutions === 0) {
    return 'healthy'
  }

  const successRate = metrics.successfulExecutions / metrics.totalExecutions

  if (successRate < 0.60 || metrics.failedExecutions >= 3 && successRate < 0.70) {
    return 'broken'
  }

  if (successRate < 0.85 || metrics.softHealsCount > 0) {
    return 'degraded'
  }

  return 'healthy'
}

export function recordExecutionSuccess(
  metrics: GraphHealthMetrics,
  timestamp = new Date().toISOString()
): GraphHealthMetrics {
  const updated: GraphHealthMetrics = {
    ...metrics,
    totalExecutions: metrics.totalExecutions + 1,
    successfulExecutions: metrics.successfulExecutions + 1,
    lastExecutionAt: timestamp,
  }
  updated.status = computeGraphHealthStatus(updated)
  return updated
}

export function recordExecutionFailure(
  metrics: GraphHealthMetrics,
  timestamp = new Date().toISOString()
): GraphHealthMetrics {
  const updated: GraphHealthMetrics = {
    ...metrics,
    totalExecutions: metrics.totalExecutions + 1,
    failedExecutions: metrics.failedExecutions + 1,
    lastExecutionAt: timestamp,
  }
  updated.status = computeGraphHealthStatus(updated)
  return updated
}

export function recordSoftHeal(
  metrics: GraphHealthMetrics,
  timestamp = new Date().toISOString()
): GraphHealthMetrics {
  const updated: GraphHealthMetrics = {
    ...metrics,
    softHealsCount: metrics.softHealsCount + 1,
    lastExecutionAt: timestamp,
  }
  updated.status = computeGraphHealthStatus(updated)
  return updated
}

export function recordManualRepair(
  metrics: GraphHealthMetrics,
  timestamp = new Date().toISOString()
): GraphHealthMetrics {
  const updated: GraphHealthMetrics = {
    ...metrics,
    manualRepairsCount: metrics.manualRepairsCount + 1,
    lastRepairAt: timestamp,
  }
  updated.status = computeGraphHealthStatus(updated)
  return updated
}
