// lib/compiler/stages/anchors.ts
// Síntese determinística de âncoras e RowScopes a partir de ElementDescriptors do trace

import type { Anchor, Candidate, RowScope } from '../../contracts/skillgraph/anchors'
import type { ElementDescriptor } from '../../recorder/traceSchema'
import type { CompilerDecisions } from '../decisions'
import type { ParameterContext } from './parametrize'
import { CompilerError } from '../report'

export function buildTableAnchor(tableDescriptor?: ElementDescriptor): Anchor {
  if (tableDescriptor && tableDescriptor.candidates && tableDescriptor.candidates.length > 0) {
    return {
      description: 'Tabela principal de alunos e dados',
      candidates: tableDescriptor.candidates as Candidate[],
      expect_count: 'one',
    }
  }

  // Candidatos padrão de tabela
  return {
    description: 'Tabela de alunos da turma',
    candidates: [
      { strategy: 'role_name', role: 'table', name: 'Alunos', match: 'normalized' },
      { strategy: 'role_name', role: 'grid', name: 'Alunos', match: 'normalized' },
      { strategy: 'css', selector: 'table' },
    ],
    expect_count: 'one',
  }
}

export function buildRowScope(
  descriptor: ElementDescriptor,
  tableAnchor: Anchor,
  decisions: CompilerDecisions,
  paramContext: ParameterContext
): RowScope {
  const headers = descriptor.rowContext?.headers || []
  let keyCol = decisions.row_key_column

  if (!keyCol) {
    // Procura cabeçalho de matrícula ou código
    keyCol = headers.find((h) => /\b(matricula|ra|codigo|registro|id)\b/i.test(h))
  }
  if (!keyCol) {
    // Procura cabeçalho de nome
    keyCol = headers.find((h) => /\b(nome|aluno|estudante|name)\b/i.test(h))
  }
  if (!keyCol && headers.length > 0) {
    keyCol = headers[0]
  }
  if (!keyCol) {
    keyCol = 'Nome'
  }

  const keyLabels = [keyCol]

  let secondaryKey: RowScope['key']['secondary_key'] | undefined
  if (decisions.secondary_key_column) {
    secondaryKey = {
      column_labels: [decisions.secondary_key_column],
      equals: paramContext.getRowKeyRef(),
      match: 'normalized',
    }
  }

  return {
    table: tableAnchor,
    key: {
      column_labels: keyLabels,
      equals: paramContext.getRowKeyRef(),
      match: 'normalized',
      secondary_key: secondaryKey,
      on_multiple: 'fail',
      on_none: 'fail',
    },
  }
}

export function buildAnchorFromDescriptor(
  descriptor: ElementDescriptor,
  description: string,
  tableAnchor: Anchor | undefined,
  decisions: CompilerDecisions,
  paramContext: ParameterContext
): Anchor {
  const candidates: Candidate[] = []

  // Copia ou adapta candidatos existentes
  for (const c of descriptor.candidates || []) {
    if (c.strategy === 'column_header') {
      const colLabel = typeof c.column_label === 'string' ? c.column_label : ''
      if (paramContext.isDateHeader(colLabel)) {
        candidates.push({
          strategy: 'column_header',
          column_label: paramContext.getDateHeaderRef(),
          match: 'normalized',
        })
      } else {
        candidates.push(c as Candidate)
      }
    } else {
      candidates.push(c as Candidate)
    }
  }

  // Se nenhum candidato veio do descriptor, sintetiza opções estáveis
  if (candidates.length === 0) {
    if (descriptor.role && (descriptor.accessible_name || descriptor.text)) {
      candidates.push({
        strategy: 'role_name',
        role: descriptor.role,
        name: descriptor.accessible_name || descriptor.text!,
        match: 'normalized',
      })
    }
    if (descriptor.aria_label) {
      candidates.push({
        strategy: 'aria_label',
        aria_label: descriptor.aria_label,
        match: 'normalized',
      })
    }
    if (descriptor.placeholder) {
      candidates.push({
        strategy: 'placeholder',
        placeholder: descriptor.placeholder,
        match: 'normalized',
      })
    }
    if (descriptor.test_id) {
      candidates.push({
        strategy: 'test_id',
        test_id: descriptor.test_id,
        match: 'exact',
      })
    }
    if (descriptor.id) {
      candidates.push({
        strategy: 'css',
        selector: `#${descriptor.id}`,
      })
    }
  }

  if (candidates.length === 0) {
    throw new CompilerError(
      'E_ANCHOR_UNSTABLE',
      `Não foi possível sintetizar nenhuma âncora candidata estável para o elemento "${description}".`
    )
  }

  const anchor: Anchor = {
    description,
    candidates,
    expect_count: 'one',
  }

  if (descriptor.rowContext && tableAnchor) {
    anchor.scope = {
      within: buildRowScope(descriptor, tableAnchor, decisions, paramContext),
    }
  }

  return anchor
}
