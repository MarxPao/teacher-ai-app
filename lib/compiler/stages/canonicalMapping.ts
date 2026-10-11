// lib/compiler/stages/canonicalMapping.ts
// Construção do mapeamento canônico de colunas, escala de notas e polaridade

import type { CanonicalMapping } from '../../contracts/skillgraph/graph'
import type { CompilerDecisions } from '../decisions'
import { inferCanonicalField } from '../synonyms'

export function buildCanonicalMapping(
  columnHeaders: string[],
  decisions: CompilerDecisions
): CanonicalMapping {
  const columns = columnHeaders
    .map((h: string) => {
      const inferred = inferCanonicalField(h)
      if (!inferred) return null
      return {
        portal_labels: [h],
        field: inferred.field,
        semantic_type: inferred.semantic_type,
      }
    })
    .filter(Boolean) as CanonicalMapping['columns']

  if (columns.length === 0) {
    columns.push(
      { portal_labels: ['Nome', 'Aluno'], field: 'student.name', semantic_type: 'name' },
      { portal_labels: ['Matrícula', 'RA', 'Código'], field: 'student.roll_number', semantic_type: 'identifier' }
    )
  }

  return {
    columns,
    grade_scale: decisions.grade_scale || { type: 'numeric', min: 0, max: 10, decimal_separator: ',' },
    attendance: {
      polarity: decisions.attendance_polarity || 'checked_is_present',
    },
    ambiguous_requires_confirmation: true,
  }
}
