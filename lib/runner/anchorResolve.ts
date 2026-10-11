// lib/runner/anchorResolve.ts
// Transforma Anchor declarativo (com TextSpec) em ResolvedAnchor (com strings literais)

import type {
  Anchor,
  AnchorOrRef,
  Candidate,
  RowScope,
  AnchorScope,
} from '../contracts/skillgraph/anchors'
import type {
  ResolvedAnchor,
  ResolvedCandidate,
  ResolvedRowScope,
  ResolvedAnchorScope,
} from './types'
import { resolveTextSpec, resolveValueRef, type ResolutionContext } from './valueRef'

export function dereferenceAnchor(
  anchorOrRef: AnchorOrRef,
  namedAnchors?: Record<string, Anchor>
): Anchor {
  if ('ref' in anchorOrRef) {
    if (!namedAnchors || !namedAnchors[anchorOrRef.ref]) {
      throw new Error(`Âncora nomeada '${anchorOrRef.ref}' não encontrada no grafo`)
    }
    return namedAnchors[anchorOrRef.ref]
  }
  return anchorOrRef
}

export function resolveCandidate(
  cand: Candidate,
  context: ResolutionContext,
  namedAnchors?: Record<string, Anchor>
): ResolvedCandidate {
  switch (cand.strategy) {
    case 'role_name':
      return {
        strategy: 'role_name',
        role: cand.role,
        name: resolveTextSpec(cand.name, context),
        match: cand.match,
      }
    case 'label_text':
      return {
        strategy: 'label_text',
        label: resolveTextSpec(cand.label, context),
        match: cand.match,
      }
    case 'aria_label':
      return {
        strategy: 'aria_label',
        aria_label: resolveTextSpec(cand.aria_label, context),
        match: cand.match,
      }
    case 'placeholder':
      return {
        strategy: 'placeholder',
        placeholder: resolveTextSpec(cand.placeholder, context),
        match: cand.match,
      }
    case 'test_id':
      return {
        strategy: 'test_id',
        test_id: resolveTextSpec(cand.test_id, context),
        match: cand.match,
      }
    case 'text':
      return {
        strategy: 'text',
        text: resolveTextSpec(cand.text, context),
        match: cand.match,
        exact: cand.exact,
      }
    case 'css':
      // Seletor CSS é estritamente literal (sem interpolação)
      return {
        strategy: 'css',
        selector: cand.selector,
      }
    case 'column_header':
      return {
        strategy: 'column_header',
        column_label: resolveTextSpec(cand.column_label, context),
        match: cand.match,
      }
    case 'structural_relative':
      return {
        strategy: 'structural_relative',
        relation: cand.relation,
        to: resolveAnchor(cand.to, context, namedAnchors),
      }
  }
}

export function resolveRowScope(
  scope: RowScope,
  context: ResolutionContext,
  namedAnchors?: Record<string, Anchor>
): ResolvedRowScope {
  const resolvedTable = resolveAnchor(scope.table, context, namedAnchors)
  const resolvedEquals = resolveValueRef(scope.key.equals, context)

  let resolvedSecondaryKey: ResolvedRowScope['key']['secondary_key']
  if (scope.key.secondary_key) {
    resolvedSecondaryKey = {
      column_labels: scope.key.secondary_key.column_labels,
      equals: resolveValueRef(scope.key.secondary_key.equals, context),
      match: scope.key.secondary_key.match,
    }
  }

  return {
    table: resolvedTable,
    key: {
      column_labels: scope.key.column_labels,
      equals: resolvedEquals,
      match: scope.key.match,
      secondary_key: resolvedSecondaryKey,
      on_multiple: scope.key.on_multiple,
      on_none: scope.key.on_none,
    },
  }
}

export function resolveAnchorScope(
  scope: AnchorScope | undefined,
  context: ResolutionContext,
  namedAnchors?: Record<string, Anchor>
): ResolvedAnchorScope | undefined {
  if (!scope) return undefined

  let withinResolved: ResolvedAnchorScope['within']
  if (scope.within) {
    if ('ref' in scope.within) {
      withinResolved = { ref: scope.within.ref }
    } else {
      withinResolved = resolveRowScope(scope.within, context, namedAnchors)
    }
  }

  return {
    frame: scope.frame,
    within: withinResolved,
    shadow_pierce: scope.shadow_pierce,
  }
}

export function resolveAnchor(
  anchorOrRef: AnchorOrRef,
  context: ResolutionContext,
  namedAnchors?: Record<string, Anchor>
): ResolvedAnchor {
  const anchor = dereferenceAnchor(anchorOrRef, namedAnchors)

  return {
    description: anchor.description,
    expect_count: anchor.expect_count,
    candidates: anchor.candidates.map(c => resolveCandidate(c, context, namedAnchors)),
    scope: resolveAnchorScope(anchor.scope, context, namedAnchors),
  }
}
