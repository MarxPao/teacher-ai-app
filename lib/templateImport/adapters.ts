/**
 * lib/templateImport/adapters.ts
 * Pontes entre o modelo v2 e o código existente (SchoolDocumentFormat, LegacyQuestionItem).
 */
import type { ImportedExam, ImportedItem, QuestionGroup, SchoolTemplate } from './template'
import { cssFont } from './render'

type LegacyLike = {
  stem: string
  type?: string
  options?: Array<{ letter: string; text: string }>
  points?: number
  contextText?: string
}

/** Questões do gerador (LegacyQuestionItem) → conteúdo para o renderizador do modelo */
export function examFromLegacyItems(items: LegacyLike[], title?: string): ImportedExam {
  const passages: string[] = []
  const groups: QuestionGroup[] = items.map((q, i) => {
    const opts = q.options?.filter(o => o.text?.trim()) || []
    const isTF = q.type === 'true_false' && opts.length === 0
    const item: ImportedItem = opts.length
      ? { kind: 'multiple_choice', stem: '', options: opts.map(o => ({ letter: o.letter.toUpperCase(), text: o.text })) }
      : { kind: isTF ? 'true_false' : 'open_ended', stem: '' }
    const g: QuestionGroup = {
      number: i + 1,
      points: q.points ? q.points.toFixed(1).replace('.', ',') : undefined,
      instruction: [q.contextText, q.stem].filter(Boolean).join('\n'),
      items: item.kind === 'open_ended' || item.kind === 'multiple_choice' ? [item] : [{ ...item, stem: q.stem }],
    }
    if (item.kind === 'true_false') g.instruction = q.contextText
    return g
  })
  return { title, passages, groups }
}

/** Texto plano do conteúdo importado (para busca e para as heurísticas antigas) */
export function importedExamToText(exam: ImportedExam): string {
  const out: string[] = []
  if (exam.title) out.push(exam.title)
  out.push(...exam.passages)
  for (const g of exam.groups) {
    if (g.number !== undefined || g.title) out.push(`Question ${g.number ?? ''} ${g.title ?? ''}`.trim())
    if (g.instruction) out.push(g.instruction)
    for (const it of g.items) {
      out.push(`${it.label ?? ''} ${it.kind === 'true_false' ? '( ) ' : ''}${it.stem}`.trim())
      for (const o of it.options || []) out.push(`${o.letter}) ${o.text}`)
    }
  }
  return out.join('\n')
}

const OPTION_STYLES = ['A)', '(A)', '[A]', 'a)'] as const

/** Campos do formato antigo derivados do modelo v2 (para telas que ainda usam SchoolDocumentFormat) */
export function legacyFormatFieldsFromTemplate(t: SchoolTemplate) {
  const tplHead = t.question.headingTemplate || ''
  const questionNumberStyle = /^QUEST/i.test(tplHead) ? 'questao_padded' as const
    : /^Question/i.test(tplHead) ? 'question_en' as const
    : 'numeric_dot' as const
  const optionLabelStyle = (OPTION_STYLES as readonly string[]).includes(t.question.optionLabel)
    ? (t.question.optionLabel as typeof OPTION_STYLES[number]) : 'A)'
  const subtitle = t.header?.rows.flat().flatMap(c => c.fields).find(f => f.slot === 'school_subtitle')?.staticText
  const body = t.roles?.body || {}
  return {
    schoolName: t.schoolName,
    fontFamily: cssFont(t.body.fontFamily || 'Arial'),
    fontSizePt: t.body.sizePt || 11,
    lineHeight: body.lineMultiple ? Math.round(body.lineMultiple * 115) / 100 : 1.35,
    textAlign: (t.body.align === 'justify' ? 'justify' : 'left') as 'justify' | 'left',
    marginsMm: t.page.marginsMm,
    columns: t.page.columns,
    showColumnDivider: t.page.columns === 2,
    questionNumberStyle,
    optionLabelStyle,
    discursiveLinesCount: t.question.openLinesPerItem,
    officialSchoolSubtitle: subtitle,
    // sem instruções no arquivo = sem instruções (nada inventado)
    defaultInstructions: t.instructions?.items.map((x, i) => `${i + 1}. ${x}`).join('\n') ?? '',
    language: t.language === 'es' ? 'pt' as const : t.language,
  }
}
