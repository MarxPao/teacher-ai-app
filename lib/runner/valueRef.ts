// lib/runner/valueRef.ts
// Resolução estrita de ValueRef e TextSpec para valores avaliados em runtime

import type { ValueRef, TextSpec } from '../contracts/skillgraph/primitives'
import { applyTransform } from './transforms'
import { normalizeText } from './text'

export interface ResolutionContext {
  params: Record<string, any>
  variables: Record<string, any>
}

function resolveDottedPath(obj: any, path: string): any {
  if (!obj || typeof obj !== 'object') return undefined

  const parts = path.split('.')
  let current = obj

  for (const part of parts) {
    if (current === null || current === undefined) return undefined

    // 1. Tenta acesso direto por chave exata
    if (Object.prototype.hasOwnProperty.call(current, part)) {
      current = current[part]
      continue
    }

    // 2. Fallback resiliente: normalização de chaves (sem acento, minúsculas)
    if (typeof current === 'object') {
      const normPart = normalizeText(part)
      let foundKey: string | undefined

      for (const k of Object.keys(current)) {
        if (normalizeText(k) === normPart) {
          foundKey = k
          break
        }
      }

      if (foundKey !== undefined) {
        current = current[foundKey]
        continue
      }
    }

    return undefined
  }

  return current
}

export function resolveValueRef(ref: ValueRef, context: ResolutionContext): any {
  if (!ref || typeof ref !== 'object') {
    return ref
  }

  let resolvedVal: any

  if ('lit' in ref) {
    return ref.lit
  }

  if ('param' in ref) {
    const raw = resolveDottedPath(context.params, ref.param)
    resolvedVal = raw !== undefined ? raw : context.params[ref.param]
    if (ref.transform && resolvedVal !== undefined) {
      resolvedVal = applyTransform(resolvedVal, ref.transform)
    }
    return resolvedVal
  }

  if ('var' in ref) {
    resolvedVal = resolveDottedPath(context.variables, ref.var)
    if (ref.transform && resolvedVal !== undefined) {
      resolvedVal = applyTransform(resolvedVal, ref.transform)
    }
    return resolvedVal
  }

  return undefined
}

export function resolveTextSpec(spec: TextSpec, context: ResolutionContext): string {
  if (typeof spec === 'string') {
    return spec
  }

  const val = resolveValueRef(spec, context)
  return val === null || val === undefined ? '' : String(val)
}
