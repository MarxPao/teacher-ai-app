import type { SkillGraphV2 } from '../../../contracts/skillgraph'
import { CommunityError } from '../errors'
import { traverseSafeText } from '../unsafeText'
import { checkSafeRegex } from '../safeRegex'

const CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/
const PHONE_REGEX = /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\d{4}|\d{4})[-.\s]?\d{4}\b/

export interface SanitizeOptions {
  protectedTerms?: string[]
}

export function sanitizeGraphForExport(graph: SkillGraphV2, options?: SanitizeOptions): SkillGraphV2 {
  // 1. Proibição de reexportação de grafos importados
  if (graph.provenance?.source === 'imported') {
    throw new CommunityError('E_EXPORT_NOT_ALLOWED', 'Grafos importados de terceiros não podem ser reexportados.')
  }

  const cloned: SkillGraphV2 = JSON.parse(JSON.stringify(graph))

  // 2. Remoção de dados operacionais e de assinatura internos
  delete cloned.metrics
  delete cloned.signature

  // 3. Neutralização do portal_id local
  if (cloned.identity) {
    cloned.identity.portal_id = 'neutral_export'
  }

  // 4. Varredura de caracteres invisíveis e bidi
  traverseSafeText(cloned, 'graph')

  // 5. Varredura de expressões regulares ReDoS
  for (const [nodeId, node] of Object.entries(cloned.nodes || {})) {
    if (node.type === 'BRANCH' && node.condition?.op === 'text_matches') {
      checkSafeRegex(node.condition.pattern, `nodes.${nodeId}.condition.pattern`)
    }
    for (const pc of node.postconditions || []) {
      if (pc.op === 'text_matches') {
        checkSafeRegex(pc.pattern, `nodes.${nodeId}.postcondition.pattern`)
      }
    }
  }

  // 6. Varredura estrita de PII e termos protegidos
  const protectedTerms = (options?.protectedTerms || [])
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 3)

  function scanStringForPII(str: string, path: string): void {
    if (CPF_REGEX.test(str)) {
      throw new CommunityError('E_EXPORT_PII_FOUND', `Padrão de CPF detectado em "${path}".`)
    }
    if (EMAIL_REGEX.test(str)) {
      throw new CommunityError('E_EXPORT_PII_FOUND', `Padrão de e-mail detectado em "${path}".`)
    }
    if (PHONE_REGEX.test(str) && str.replace(/\D/g, '').length >= 10) {
      throw new CommunityError('E_EXPORT_PII_FOUND', `Padrão de telefone celular detectado em "${path}".`)
    }

    const lower = str.toLowerCase()
    for (const term of protectedTerms) {
      if (lower.includes(term)) {
        throw new CommunityError(
          'E_EXPORT_PII_FOUND',
          `Termo protegido da escola/professora ("${term}") detectado em "${path}".`
        )
      }
    }
  }

  function traverseForPII(obj: any, currentPath: string): void {
    if (obj === null || obj === undefined) return
    if (typeof obj === 'string') {
      scanStringForPII(obj, currentPath)
      return
    }
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        traverseForPII(obj[i], `${currentPath}[${i}]`)
      }
      return
    }
    if (typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        traverseForPII(v, currentPath ? `${currentPath}.${k}` : k)
      }
    }
  }

  traverseForPII(cloned, 'graph')

  if (cloned.provenance) {
    cloned.provenance.pii_scrubbed = true
  }

  return cloned
}
