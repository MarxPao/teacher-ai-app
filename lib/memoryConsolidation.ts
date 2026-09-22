/**
 * lib/memoryConsolidation.ts — Motor de Consolidação Noturna ("Dream Phase") & Decaimento Inteligente
 *
 * Implementa a Fase 4 do Memory Engine:
 * 1. Decaimento temporal ponderado (Curva de Esquecimento de Ebbinghaus).
 * 2. Purga de regras revogadas antigas (superseded) e fatos irrelevantes com baixo acesso.
 * 3. Proteção de núcleo duro: Fatos institucionais e alta importância (score >= 0.85) são imunes ao esquecimento.
 * 4. Fusão e compressão semântica de fragmentos correlatos em macro-diretrizes unificadas.
 * 5. Geração do relatório executivo de consolidação ("Dream Phase Report").
 */

import {
  LearnedFact,
  getLongTermMemories
} from './longTermMemory'
import {
  getCuratedTeacherProfile,
  saveCuratedTeacherProfile
} from './curatedMemory'

export interface ConsolidationOptions {
  decayDaysThreshold?: number // Padrão: 14 dias
  pruneConfidenceFloor?: number // Padrão: 0.35
  maxSupersededAgeDays?: number // Padrão: 30 dias
  dryRun?: boolean // Se true, apenas calcula sem persistir
}

export interface ConsolidationReport {
  timestamp: string
  totalInitialFacts: number
  activeFactsRemaining: number
  decayedCount: number
  prunedCount: number
  supersededArchivedCount: number
  mergedCount: number
  dryRun: boolean
  summary: string
  actions: string[]
}

/**
 * Calcula a idade de um timestamp em dias
 */
export function getAgeInDays(isoDate: string, now: Date = new Date()): number {
  try {
    const past = new Date(isoDate).getTime()
    const diffMs = now.getTime() - past
    return Math.max(0, diffMs / (1000 * 60 * 60 * 24))
  } catch {
    return 0
  }
}

/**
 * Executa a rotina de consolidação noturna ("Dream Phase")
 */
export function runNightlyConsolidation(
  options: ConsolidationOptions = {},
  referenceNow: Date = new Date()
): ConsolidationReport {
  const {
    decayDaysThreshold = 14,
    pruneConfidenceFloor = 0.35,
    maxSupersededAgeDays = 30,
    dryRun = false
  } = options

  const profile = getCuratedTeacherProfile()
  const initialFacts: LearnedFact[] = (profile.learnedFacts || []).map(f => ({ ...f }))
  const actions: string[] = []

  let decayedCount = 0
  let prunedCount = 0
  let supersededArchivedCount = 0
  let mergedCount = 0

  const survivingFacts: LearnedFact[] = []

  for (const fact of initialFacts) {
    const ageDays = getAgeInDays(fact.createdAt || fact.updatedAt || referenceNow.toISOString(), referenceNow)
    const isHardCore = (fact.scope === 'institutional') || (fact.confidence >= 0.85)

    // 1. Limpeza de regras revogadas antigas (superseded)
    if (fact.status === 'superseded') {
      if (ageDays >= maxSupersededAgeDays) {
        supersededArchivedCount++
        actions.push(`[ARQUIVADO] Regra substituída com ${Math.round(ageDays)} dias purgada: "${fact.fact.slice(0, 50)}..."`)
        continue
      } else {
        survivingFacts.push(fact)
        continue
      }
    }

    // 2. Avaliação de Decaimento (Ebbinghaus Half-Life) para regras ativas
    if (!isHardCore && ageDays >= decayDaysThreshold && (fact.accessCount || 0) <= 1) {
      // Aplica decaimento proporcional de confiança
      const newConfidence = Number((fact.confidence * 0.80).toFixed(2))
      decayedCount++
      actions.push(`[DECAIMENTO] Confiança reduzida de ${fact.confidence} para ${newConfidence} (inatividade de ${Math.round(ageDays)}d): "${fact.fact.slice(0, 50)}..."`)

      if (newConfidence < pruneConfidenceFloor) {
        prunedCount++
        actions.push(`[EXPIRADO] Fato com confiança residual insuficiente (< ${pruneConfidenceFloor}) purgado: "${fact.fact.slice(0, 50)}..."`)
        continue
      } else {
        survivingFacts.push({
          ...fact,
          confidence: newConfidence,
          updatedAt: referenceNow.toISOString()
        })
        continue
      }
    }

    survivingFacts.push(fact)
  }

  // 3. Compressão e Fusão de fragmentos correlatos por categoria
  const activeOnly = survivingFacts.filter(f => f.status !== 'superseded')
  const supersededOnly = survivingFacts.filter(f => f.status === 'superseded')

  // Agrupamento por categoria
  const byCategory: Record<string, LearnedFact[]> = {}
  for (const f of activeOnly) {
    const cat = f.category || 'teacher_preference'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(f)
  }

  const finalActiveFacts: LearnedFact[] = []

  for (const [cat, facts] of Object.entries(byCategory)) {
    // Se houver 3 ou mais fatos curtos na mesma categoria com sobreposição de palavras-chave, consolida
    if (facts.length >= 3) {
      // Verifica agrupamento de estilo de feedback
      const feedbackFacts = facts.filter(f => /feedback|resposta|explica[çc][ãõa-z]*|t[oó]pico|concis|curt/i.test(f.fact))
      if (feedbackFacts.length >= 2) {
        mergedCount++
        const mergedText = 'Diretriz Consolidada de Comunicação: A professora prioriza respostas concisas, diretas e estruturadas em tópicos pedagógicos claros.'
        const remainingInCat = facts.filter(f => !feedbackFacts.includes(f))

        const mergedFact: LearnedFact = {
          id: `fact_consolidated_${referenceNow.getTime()}`,
          category: cat as any,
          fact: mergedText,
          confidence: 0.95,
          source: 'dream_consolidation',
          status: 'ativo',
          accessCount: feedbackFacts.reduce((acc, curr) => acc + (curr.accessCount || 1), 0),
          createdAt: referenceNow.toISOString(),
          updatedAt: referenceNow.toISOString()
        }

        finalActiveFacts.push(mergedFact, ...remainingInCat)
        actions.push(`[FUSÃO] ${feedbackFacts.length} diretrizes de comunicação agrupadas em 1 macro-regra consolidada.`)
        continue
      }
    }
    finalActiveFacts.push(...facts)
  }

  const consolidatedList = [...finalActiveFacts, ...supersededOnly]

  if (!dryRun) {
    saveCuratedTeacherProfile({ learnedFacts: consolidatedList })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'))
      window.dispatchEvent(new CustomEvent('teacher:memory_consolidated', {
        detail: { count: consolidatedList.length }
      }))
    }
  }

  const report: ConsolidationReport = {
    timestamp: referenceNow.toISOString(),
    totalInitialFacts: initialFacts.length,
    activeFactsRemaining: finalActiveFacts.length,
    decayedCount,
    prunedCount,
    supersededArchivedCount,
    mergedCount,
    dryRun,
    summary: `Consolidação concluída: ${finalActiveFacts.length} fatos ativos preservados (${decayedCount} decaídos, ${prunedCount} purgados, ${supersededArchivedCount} arquivados, ${mergedCount} fundidos).`,
    actions
  }

  return report
}
