// lib/explorer/domActionPlanner.ts
// Planejador Agêntico Ancorado no DOM (Observe -> Plan -> Act -> Verify):
// 1. Decompõe comandos com ou sem vírgulas ancorando nos controles reais visíveis da tela.
// 2. Ordena seleções de filtros (<select>) na mesma página pela ordem topológica do DOM
//    (ex.: Turma [idx 1] -> Mês [idx 2] -> Disciplina [idx 3] -> Ordem [idx 4]), evitando
//    que um filtro pai (Mês) seja alterado depois do filtro dependente (Disciplina).
// 3. Posiciona cliques de ação/consulta (ex.: "Visualizar frequência") sempre após os filtros.
// 4. Verifica pós-condição real (Fail-Honest): nunca reporta sucesso se o valor no DOM não mudou.

import {
  type DistilledDomSnapshot,
  type DistilledInteractiveElement,
  normalizePortalGoalVariants,
  selectBestDistilledAction,
  splitMultiStepTeacherCommand,
} from './domDistiller'

export interface PlannedDomAction {
  kind: 'select' | 'click'
  rawGoal: string
  elementIdx: number
  selector: string
  elementLabel: string
  element: DistilledInteractiveElement
  matchedOption?: { value: string; text: string }
  score: number
}

export type SelectPostConditionResult = { verified: boolean; reason?: string }

/**
 * Se uma cláusula única contém múltiplos valores de filtros sem vírgula
 * (ex.: "selecione 7º ano lingua inglesa julho/2026"), extrai sub-metas ancoradas
 * nas opções dos <select> visíveis na página atual.
 */
function expandUnseparatedSelectClause(
  snapshot: DistilledDomSnapshot,
  clause: string
): string[] {
  const { cleanGoal, variants: goalVariants } = normalizePortalGoalVariants(clause)
  const matchedSubGoals: Array<{ idx: number; text: string }> = []

  for (const el of snapshot.elements) {
    if (el.isDestructive || el.tag !== 'select' || !Array.isArray((el as any).options)) continue
    let bestOptForSelect: { text: string; len: number } | null = null
    for (const opt of (el as any).options as Array<{ value: string; text: string; disabled?: boolean; hidden?: boolean }>) {
      if (opt.disabled || opt.hidden) continue
      const normOpt = opt.text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[º°ª]/g, '')
        .replace(/[/\-_,.;:]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (!normOpt || normOpt.length < 4 || /^(selecione|todas|todos)\b/i.test(normOpt)) continue
      const { variants } = normalizePortalGoalVariants(normOpt)
      const optHead = normOpt.split(/\s+/).slice(0, 2).join(' ')
      const candidatesToCheck = [...variants, ...(optHead.length >= 4 ? [optHead] : [])]
      for (const v of candidatesToCheck) {
        const cleanV = v.replace(/[º°ª]/g, '')
        if (cleanV.length >= 4 && goalVariants.some(gv => gv.replace(/[º°ª]/g, '').includes(cleanV))) {
          if (!bestOptForSelect || cleanV.length > bestOptForSelect.len) {
            bestOptForSelect = { text: opt.text, len: cleanV.length }
          }
        }
      }
    }
    if (bestOptForSelect) {
      matchedSubGoals.push({ idx: el.idx, text: bestOptForSelect.text })
    }
  }

  if (matchedSubGoals.length >= 2) {
    return matchedSubGoals.sort((a, b) => a.idx - b.idx).map((m) => m.text)
  }
  return [clause]
}

/**
 * Planeja as ações na página atual ancorando cada intenção nos elementos visíveis do snapshot
 * e ordenando filtros <select> pela topologia física do DOM (evitando reset por cascata AJAX),
 * seguidos pelos cliques em botões de consulta/ação (ex.: "Visualizar frequência").
 */
export function planDomGroundedActions(
  snapshot: DistilledDomSnapshot,
  rawCommandOrClauses: string | string[]
): PlannedDomAction[] {
  const initialClauses = (Array.isArray(rawCommandOrClauses)
    ? rawCommandOrClauses
    : [rawCommandOrClauses]
  ).flatMap((item) => splitMultiStepTeacherCommand(item))

  const expandedClauses: string[] = []
  for (const c of initialClauses) {
    expandedClauses.push(...expandUnseparatedSelectClause(snapshot, c))
  }

  const selectActions: PlannedDomAction[] = []
  const clickActions: PlannedDomAction[] = []
  const usedSelectSelectors = new Set<string>()

  for (const clause of expandedClauses) {
    const res = selectBestDistilledAction(snapshot, clause, new Set(), usedSelectSelectors)
    if (!res.selected || res.score < 40) continue

    const el: DistilledInteractiveElement = res.selected
    if (el.tag === 'select' && res.matchedOption) {
      usedSelectSelectors.add(el.selector)
      selectActions.push({
        kind: 'select',
        rawGoal: clause,
        elementIdx: el.idx,
        selector: el.selector,
        elementLabel: el.label,
        element: el,
        matchedOption: res.matchedOption,
        score: res.score,
      })
    } else {
      clickActions.push({
        kind: 'click',
        rawGoal: clause,
        elementIdx: el.idx,
        selector: el.selector,
        elementLabel: el.label,
        element: el,
        score: res.score,
      })
    }
  }

  // Ordena filtros <select> pela ordem topológica real no DOM (ex.: Turma [1] -> Mês [2] -> Disciplina [3] -> Ordem [4])
  selectActions.sort((a, b) => a.elementIdx - b.elementIdx)

  return [...selectActions, ...clickActions]
}

/**
 * Verifica em malha fechada (Observe -> Act -> Verify) se a pós-condição de um <select>
 * foi realmente satisfeita no DOM após o disparo de eventos e possíveis cascatas AJAX.
 */
export function verifySelectPostCondition(
  actualSelectedValue: string,
  actualSelectedText: string,
  expectedOption: { value: string; text: string }
): { verified: boolean; reason?: string } {
  const normActualTxt = String(actualSelectedText || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  const normExpectedTxt = String(expectedOption.text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

  if (
    (expectedOption.value !== '' && actualSelectedValue === expectedOption.value) ||
    (normExpectedTxt.length > 0 && normActualTxt === normExpectedTxt)
  ) {
    return { verified: true }
  }

  return {
    verified: false,
    reason: `O filtro manteve "${actualSelectedText || actualSelectedValue || 'vazio'}" em vez de aplicar "${expectedOption.text}".`,
  }
}
