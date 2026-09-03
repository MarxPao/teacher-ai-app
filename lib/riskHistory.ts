/**
 * lib/riskHistory.ts — Histórico Temporal do Índice de Risco por Aluno
 *
 * Salva snapshots periódicos do Índice Composto de Risco, permitindo ao
 * professor ver a trajetória do aluno ao longo do tempo (piorando/melhorando/estável)
 * em vez de apenas um número instantâneo isolado.
 *
 * Cada aluno mantém até MAX_SNAPSHOTS registros no localStorage.
 * A trajectória é determinada pela tendência linear simples dos últimos 3 snapshots.
 */

import { CompositeRiskAnalysis } from './predictiveAnalytics'

export interface RiskSnapshot {
  calculatedAt: number   // Date.now() timestamp
  riskScore: number      // 0–100
  riskLevel: CompositeRiskAnalysis['riskLevel']
  riskBadge: string
  primaryFactor: string  // Nome do fator dominante naquele momento
}

export type RiskTrajectoryLabel = '↗ Piorando' | '↘ Melhorando' | '→ Estável' | '— Sem histórico'

const STORAGE_KEY = 'teacher_risk_history'
const MAX_SNAPSHOTS = 6

// Minimum score delta to be considered "changing" (not stable)
const TRAJECTORY_DELTA_THRESHOLD = 5

function loadAll(): Record<string, RiskSnapshot[]> {
  try {
    if (typeof localStorage === 'undefined') return {}
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch { return {} }
}

function saveAll(data: Record<string, RiskSnapshot[]>) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* storage full or unavailable — fail silently */ }
}

/**
 * Salva um novo snapshot do risco de um aluno.
 * Se o score mudou menos de TRAJECTORY_DELTA_THRESHOLD pts em relação
 * ao último snapshot, não duplica (evita ruído de recálculos frequentes).
 */
export function saveRiskSnapshot(studentId: string, analysis: CompositeRiskAnalysis): void {
  const all = loadAll()
  const existing = all[studentId] || []

  // Deduplicate: só salva se o score mudou significativamente OU se o último
  // snapshot tem mais de 24h de idade
  const last = existing[existing.length - 1]
  const now = Date.now()
  const ONE_DAY_MS = 24 * 60 * 60 * 1000
  const scoreDelta = last ? Math.abs(analysis.riskScore - last.riskScore) : Infinity
  const ageDelta = last ? now - last.calculatedAt : Infinity

  if (last && scoreDelta < TRAJECTORY_DELTA_THRESHOLD && ageDelta < ONE_DAY_MS) {
    return // Snapshot duplicado — não persistir
  }

  // Determinar fator dominante
  const { factors } = analysis
  const factorEntries: { key: string; label: string; weighted: number }[] = [
    { key: 'academic',    label: 'Déficit Acadêmico',    weighted: factors.academicScore     * 0.40 },
    { key: 'trend',       label: 'Queda de Trajetória',  weighted: factors.trendScore        * 0.25 },
    { key: 'attendance',  label: 'Infrequência',         weighted: factors.attendanceScore   * 0.20 },
    { key: 'qualitative', label: 'Alertas Qualitativos', weighted: factors.qualitativeScore  * 0.15 },
  ]
  const primary = factorEntries.reduce((a, b) => b.weighted > a.weighted ? b : a)

  const snapshot: RiskSnapshot = {
    calculatedAt: now,
    riskScore: analysis.riskScore,
    riskLevel: analysis.riskLevel,
    riskBadge: analysis.riskBadge,
    primaryFactor: primary.label,
  }

  const updated = [...existing, snapshot].slice(-MAX_SNAPSHOTS)
  all[studentId] = updated
  saveAll(all)
}

/**
 * Retorna o histórico de snapshots de risco para um aluno (mais antigo → mais recente).
 */
export function getRiskHistory(studentId: string): RiskSnapshot[] {
  const all = loadAll()
  return all[studentId] || []
}

/**
 * Calcula a label de trajetória baseada nos últimos 3 snapshots disponíveis.
 * Usa a diferença média entre os últimos pontos para determinar a tendência.
 */
export function getRiskTrajectoryLabel(history: RiskSnapshot[]): RiskTrajectoryLabel {
  if (history.length < 2) return '— Sem histórico'

  // Usar os últimos 3 (ou menos se não houver)
  const recent = history.slice(-3)
  const first = recent[0].riskScore
  const last  = recent[recent.length - 1].riskScore
  const delta = last - first

  if (delta >= TRAJECTORY_DELTA_THRESHOLD)  return '↗ Piorando'
  if (delta <= -TRAJECTORY_DELTA_THRESHOLD) return '↘ Melhorando'
  return '→ Estável'
}

/**
 * Retorna a cor da trajetória para exibição na UI.
 */
export function getTrajectoryColor(label: RiskTrajectoryLabel): string {
  if (label === '↗ Piorando')   return '#9b1c1c'
  if (label === '↘ Melhorando') return '#2d7a00'
  if (label === '→ Estável')    return '#854d00'
  return '#71553d'
}

/**
 * Remove o histórico de risco de um aluno específico (ex: ao excluir o aluno).
 */
export function clearRiskHistory(studentId: string): void {
  const all = loadAll()
  delete all[studentId]
  saveAll(all)
}
