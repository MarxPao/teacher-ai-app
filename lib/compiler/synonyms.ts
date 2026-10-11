// lib/compiler/synonyms.ts
// Dicionário estático de sinônimos pt-BR e EN para inferência de campos canônicos

import type { CanonicalField } from '../contracts/canonical'

export interface SynonymRule {
  field: CanonicalField
  patterns: RegExp[]
  semantic_type: string
}

export const CANONICAL_SYNONYMS: SynonymRule[] = [
  {
    field: 'student.name',
    semantic_type: 'name',
    patterns: [
      /\b(nome|aluno|estudante|estudantes|alunos|name|student|pupil)\b/i,
    ],
  },
  {
    field: 'student.roll_number',
    semantic_type: 'identifier',
    patterns: [
      /\b(matricula|matriculas|ra|registro|codigo|cod|enrollment|id|roll_number)\b/i,
    ],
  },
  {
    field: 'student.portal_id',
    semantic_type: 'identifier',
    patterns: [
      /\b(id_aluno|portal_id|student_id|identificador)\b/i,
    ],
  },
  {
    field: 'student.class',
    semantic_type: 'group',
    patterns: [
      /\b(turma|classe|grupo|class|grade|section)\b/i,
    ],
  },
  {
    field: 'attendance.status',
    semantic_type: 'attendance_mark',
    patterns: [
      /\b(falta|faltas|presenca|presencas|frequencia|chamada|attendance|present|absent)\b/i,
    ],
  },
  {
    field: 'attendance.absences_count',
    semantic_type: 'counter',
    patterns: [
      /\b(total_faltas|num_faltas|ausencias|absences_count)\b/i,
    ],
  },
  {
    field: 'grade.value',
    semantic_type: 'grade_value',
    patterns: [
      /\b(nota|notas|media|conceito|score|grade|evaluation|resultado)\b/i,
    ],
  },
  {
    field: 'grade.term',
    semantic_type: 'term_period',
    patterns: [
      /\b(bimestre|trimestre|semestre|periodo|etapa|term|quarter)\b/i,
    ],
  },
  {
    field: 'grade.subject',
    semantic_type: 'subject',
    patterns: [
      /\b(disciplina|materia|subject|course)\b/i,
    ],
  },
  {
    field: 'grade.assessment_name',
    semantic_type: 'assessment_name',
    patterns: [
      /\b(avaliacao|prova|trabalho|teste|atividade|exam|assignment)\b/i,
    ],
  },
]

export function inferCanonicalField(label: string): { field: CanonicalField; semantic_type: string } | null {
  if (!label) return null
  const clean = label.trim()

  for (const rule of CANONICAL_SYNONYMS) {
    for (const pat of rule.patterns) {
      if (pat.test(clean)) {
        return { field: rule.field, semantic_type: rule.semantic_type }
      }
    }
  }

  return null
}
