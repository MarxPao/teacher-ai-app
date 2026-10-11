// lib/runner/conditions.ts
// Avaliador determinístico do vocabulário fechado de condições (profundidade <= 3)

import type { Condition, AtomicCondition } from '../contracts/skillgraph/primitives'
import type { Anchor } from '../contracts/skillgraph/anchors'
import type { Driver, ResolvedCondition, ResolvedAtomicCondition } from './types'
import { resolveAnchor } from './anchorResolve'
import { resolveValueRef, type ResolutionContext } from './valueRef'
import { matchText, normalizeText } from './text'

export function resolveCondition(
  cond: Condition,
  context: ResolutionContext,
  namedAnchors?: Record<string, Anchor>
): ResolvedCondition {
  if (cond.op === 'all') {
    return {
      op: 'all',
      conditions: cond.conditions.map(c => resolveCondition(c, context, namedAnchors)),
    }
  }

  if (cond.op === 'any') {
    return {
      op: 'any',
      conditions: cond.conditions.map(c => resolveCondition(c, context, namedAnchors)),
    }
  }

  if (cond.op === 'not') {
    return {
      op: 'not',
      condition: resolveCondition(cond.condition, context, namedAnchors),
    }
  }

  // Condições atômicas
  const atomic = cond as AtomicCondition

  switch (atomic.op) {
    case 'exists':
    case 'not_exists':
    case 'visible':
    case 'enabled':
      return {
        op: atomic.op,
        anchor: resolveAnchor(atomic.anchor, context, namedAnchors),
      }

    case 'text_equals':
    case 'text_contains':
      return {
        op: atomic.op,
        anchor: resolveAnchor(atomic.anchor, context, namedAnchors),
        expected: String(resolveValueRef(atomic.value, context) ?? ''),
      }

    case 'text_matches':
      return {
        op: 'text_matches',
        anchor: resolveAnchor(atomic.anchor, context, namedAnchors),
        pattern: atomic.pattern,
      }

    case 'value_equals':
      return {
        op: 'value_equals',
        anchor: resolveAnchor(atomic.anchor, context, namedAnchors),
        expected: String(resolveValueRef(atomic.value, context) ?? ''),
      }

    case 'url_matches':
      return {
        op: 'url_matches',
        pattern: atomic.pattern,
      }

    case 'count_gte':
      return {
        op: 'count_gte',
        anchor: resolveAnchor(atomic.anchor, context, namedAnchors),
        n: atomic.n,
      }

    case 'var_equals':
      return {
        op: 'var_equals',
        var: atomic.var,
        expected: resolveValueRef(atomic.value, context),
      }

    case 'var_empty':
      return {
        op: 'var_empty',
        var: atomic.var,
      }
  }
}

/**
 * Avalia predicados puros em memória (variáveis locais), evitando chamadas remotas de driver.
 */
export function evaluatePureAtomic(
  atomic: ResolvedAtomicCondition,
  variables: Record<string, any>
): { isPure: boolean; result?: boolean } {
  if (atomic.op === 'var_equals') {
    const val = variables[atomic.var]
    if (val === undefined || val === null) {
      return { isPure: true, result: atomic.expected === val }
    }
    const match = typeof val === 'string' && typeof atomic.expected === 'string'
      ? matchText(val, atomic.expected, 'normalized')
      : val === atomic.expected
    return { isPure: true, result: match }
  }

  if (atomic.op === 'var_empty') {
    const val = variables[atomic.var]
    const isEmpty =
      val === undefined ||
      val === null ||
      val === '' ||
      (Array.isArray(val) && val.length === 0) ||
      (typeof val === 'object' && Object.keys(val).length === 0)
    return { isPure: true, result: isEmpty }
  }

  return { isPure: false }
}

/**
 * Avalia condição composta ou atômica com delegação ao Driver para operações de DOM.
 */
export async function evaluateCondition(
  cond: ResolvedCondition,
  variables: Record<string, any>,
  driver: Driver,
  depth = 1
): Promise<boolean> {
  if (depth > 3) {
    throw new Error('Profundidade máxima da Condition excedida (máximo permitido: 3 níveis)')
  }

  if (cond.op === 'not') {
    const inner = await evaluateCondition(cond.condition, variables, driver, depth + 1)
    return !inner
  }

  if (cond.op === 'all') {
    for (const c of cond.conditions) {
      const ok = await evaluateCondition(c, variables, driver, depth + 1)
      if (!ok) return false
    }
    return true
  }

  if (cond.op === 'any') {
    for (const c of cond.conditions) {
      const ok = await evaluateCondition(c, variables, driver, depth + 1)
      if (ok) return true
    }
    return false
  }

  // Atômica: confere se pode ser resolvida puramente em memória
  const pureCheck = evaluatePureAtomic(cond, variables)
  if (pureCheck.isPure) {
    return Boolean(pureCheck.result)
  }

  // Caso dependa de DOM, delega ao Driver
  const res = await driver.evaluateCondition(cond)
  return res.satisfied
}
