/**
 * lib/templateImport/render.ts
 * Renderiza uma prova (questões novas ou importadas) no layout EXATO do modelo da escola.
 *
 * Substitui applySchoolFormatToBodyHtml (que trocava estilos por regex no HTML gerado e
 * quebrava a cada mudança no gerador) e os 4 cabeçalhos fixos de exportUtils.
 */
import type { Block, RunStyle } from './ir'
import { paragraphText } from './ir'
import type { HeaderCell, HeaderField, ImportedExam, ImportedItem, QuestionGroup, RoleStyle, SchoolTemplate, StyleRole } from './template'
import { fillHeadingTemplate, formatOptionLabel, formatSubItemLabel } from './template'

export interface HeaderValues {
  subject?: string
  teacher?: string
  date?: string
  class?: string
  term?: string
  maxScore?: string
  examTitle?: string
}

export interface RenderOptions {
  /** true = mostra os valores de exemplo do modelo quando não houver valor (pré-visualização) */
  useSampleValues?: boolean
  /** Gabarito visível (versão do professor) */
  showAnswerKey?: boolean
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const css = (s: RunStyle | undefined): string => {
  if (!s) return ''
  const out: string[] = []
  if (s.bold !== undefined) out.push(`font-weight:${s.bold ? 700 : 400}`)
  if (s.italic) out.push('font-style:italic')
  if (s.underline) out.push('text-decoration:underline')
  if (s.fontFamily) out.push(`font-family:${cssFont(s.fontFamily)}`)
  if (s.sizePt) out.push(`font-size:${s.sizePt}pt`)
  if (s.color) out.push(`color:#${s.color}`)
  return out.join(';')
}

/** CSS completo de um papel: fonte, peso, tamanho, espaçamento, recuo e alinhamento do modelo */
export function roleCss(tpl: SchoolTemplate, role: StyleRole, opts: { block?: boolean } = {}): string {
  const r: RoleStyle | undefined = tpl.roles?.[role]
  if (!r) return ''
  const out = [css(r)]
  if (r.bold === false) out.push('font-weight:400')
  if (opts.block !== false) {
    if (r.align) out.push(`text-align:${r.align}`)
    if (r.spaceBeforePt !== undefined) out.push(`margin-top:${r.spaceBeforePt}pt`)
    if (r.spaceAfterPt !== undefined) out.push(`margin-bottom:${r.spaceAfterPt}pt`)
    if (r.lineMultiple) out.push(`line-height:${Math.max(1, r.lineMultiple * 1.15).toFixed(2)}`)
    else if (r.linePt) out.push(`line-height:${r.linePt}pt`)
    if (r.indentMm) out.push(`padding-left:${r.indentMm}mm`)
    if (r.firstLineMm) out.push(`text-indent:${r.firstLineMm}mm`)
  }
  return out.filter(Boolean).join(';')
}

/** Fonte do Word → pilha CSS com substitutas métricas (Calibri → Carlito etc.) */
export function cssFont(name: string): string {
  const n = name.replace(/['"]/g, '').trim()
  const fallbacks: Record<string, string> = {
    calibri: "Calibri, Carlito, 'Segoe UI', Arial, sans-serif",
    cambria: "Cambria, Caladea, Georgia, serif",
    arial: 'Arial, Helvetica, Liberation Sans, sans-serif',
    'times new roman': "'Times New Roman', Times, 'Liberation Serif', serif",
    verdana: 'Verdana, Geneva, sans-serif',
    tahoma: 'Tahoma, Verdana, sans-serif',
    'century gothic': "'Century Gothic', 'URW Gothic', sans-serif",
    georgia: 'Georgia, serif',
  }
  return fallbacks[n.toLowerCase()] || `'${n}', sans-serif`
}

/** Altura de linha do corpo no padrão do modelo */
function bodyLineHeight(tpl: SchoolTemplate): string {
  const b = tpl.roles?.body
  if (b?.lineMultiple) return (b.lineMultiple * 1.15).toFixed(2)
  if (b?.linePt) return `${b.linePt}pt`
  return String(tpl.body.lineHeight || 1.35)
}

/**
 * CSS das classes do modelo. Com `scope` (ex.: ".tpl-doc"), pode ser embutido na
 * exportação antiga sem afetar o resto da página.
 */
export function templateCss(tpl: SchoolTemplate, scope = ''): string {
  const S = (sel: string) => sel.split(',').map(x => `${scope} ${x.trim()}`.trim()).join(', ')
  return `
${scope || 'body'} { ${css({ ...tpl.body, bold: undefined })}; ${tpl.body.fontFamily ? '' : 'font-family:Arial, sans-serif;'} line-height:${bodyLineHeight(tpl)}; color:#000; }
${S('p, div')} { margin:0; }
${S('.tpl-header')} { width:100%; border-collapse:collapse; margin-bottom:8px; table-layout:fixed; }
${S('.tpl-header.bordered td')} { border:1px solid #000; }
${S('.tpl-header td')} { padding:4px 8px; vertical-align:middle; }
${S('.tpl-lines')} { margin-bottom:8px; }
${S('.tpl-lines .row')} { display:flex; gap:16px; flex-wrap:wrap; margin:2px 0; }
${S('.blank')} { display:inline-block; border-bottom:1px solid #000; min-width:2em; height:1em; vertical-align:baseline; }
${S('.box')} { border:1px solid #000; padding:6px 10px; margin:8px 0; }
${S('.q')} { break-inside:avoid; margin:0 0 ${tpl.roles?.questionHeading?.spaceBeforePt !== undefined ? 4 : 14}px; }
${S('.q.rule')} { border-bottom:1px solid #ccc; padding-bottom:10px; }
${S('.q-heading.boxed')} { display:inline-block; border:1px solid #000; border-radius:3px; padding:1px 8px; }
${S('.q ol, .q ul')} { margin:4px 0; padding-left:0; list-style:none; }
${S('.q li')} { margin:3px 0 3px 1.4em; text-indent:-1.4em; }
${S('.line')} { border-bottom:1px solid #000; height:1.9em; }
${tpl.page.columns === 2 ? `${S('.tpl-body')} { column-count:2; column-gap:7mm; column-rule:1px solid #999; }` : ''}`
}

/** Cabeçalho de página + cabeçalho da escola + instruções */
export function renderTemplateHeader(tpl: SchoolTemplate, values: HeaderValues = {}, opts: RenderOptions = {}): string {
  const parts: string[] = []
  if (tpl.pageHeader?.length) parts.push(`<div class="tpl-page-header">${renderBlocks(tpl.pageHeader)}</div>`)
  if (tpl.header) parts.push(renderHeader(tpl, values, opts))
  if (tpl.instructions && tpl.instructions.items.length) {
    const ins = tpl.instructions
    parts.push(`<div class="${ins.boxed ? 'box' : ''} tpl-instructions">` +
      (ins.title ? `<div style="${roleCss(tpl, 'instructionsTitle') || css(ins.titleStyle) || 'font-weight:700'}">${esc(ins.title)}</div>` : '') +
      ins.items.map((t, i) => `<div style="${roleCss(tpl, 'instructionsItem')}">${i + 1}. ${esc(t)}</div>`).join('') + `</div>`)
  }
  return parts.join('\n')
}

/** Título da prova + textos-base + questões, no padrão do modelo */
export function renderTemplateBody(tpl: SchoolTemplate, exam: ImportedExam, values: HeaderValues = {}, opts: RenderOptions = {}): string {
  const parts: string[] = []
  const title = values.examTitle || exam.title
  if (title && tpl.examTitle) {
    const t = tpl.examTitle
    parts.push(`<div style="text-align:${t.align || 'center'};margin:10px 0;${roleCss(tpl, 'examTitle') || css(t.style)}">${t.boxed ? `<span class="box">${esc(title)}</span>` : esc(title)}</div>`)
  } else if (title) {
    parts.push(`<div style="text-align:center;font-weight:700;margin:10px 0">${esc(title)}</div>`)
  }
  parts.push('<div class="tpl-body">')
  for (const p of exam.passages) parts.push(`<p style="text-align:${tpl.body.align || 'left'};${roleCss(tpl, 'passage')}">${multiline(p)}</p>`)
  exam.groups.forEach((g, gi) => parts.push(renderGroup(tpl, g, gi, opts)))
  parts.push('</div>')
  return parts.join('\n')
}

export function renderExamHtml(
  tpl: SchoolTemplate,
  exam: ImportedExam,
  values: HeaderValues = {},
  opts: RenderOptions = {},
): string {
  const m = tpl.page.marginsMm
  return [
    `<!doctype html><html lang="${tpl.language}"><head><meta charset="utf-8"><title>${esc(values.examTitle || exam.title || tpl.schoolName)}</title><style>`,
    `@page { size: ${tpl.page.size} ${tpl.page.orientation}; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; }`,
    `body { margin:0; }`,
    templateCss(tpl),
    `</style></head><body>`,
    renderTemplateHeader(tpl, values, opts),
    renderTemplateBody(tpl, exam, values, opts),
    tpl.pageFooter?.length ? `<div class="tpl-page-footer" style="margin-top:16px;font-size:85%">${renderBlocks(tpl.pageFooter)}</div>` : '',
    '</body></html>',
  ].join('\n')
}

// ─── Cabeçalho ──────────────────────────────────────────────────────────────

function renderHeader(tpl: SchoolTemplate, values: HeaderValues, opts: RenderOptions): string {
  const h = tpl.header!
  if (h.kind === 'lines') {
    return `<div class="tpl-lines">${h.rows.map(row => row.map(c =>
      `<div class="row" style="justify-content:${c.align === 'center' ? 'center' : c.align === 'right' ? 'flex-end' : 'space-between'}">${c.fields.map(f => renderField(f, values, opts)).join('')}</div>`,
    ).join('')).join('')}</div>`
  }
  const totalCols = Math.max(...h.rows.map(r => r.reduce((n, c) => n + c.colSpan, 0)))
  return `<table class="tpl-header ${h.bordered ? 'bordered' : ''}">` +
    h.rows.map(row => `<tr>${row.map(c => renderCell(c, totalCols, values, opts)).join('')}</tr>`).join('') +
    `</table>`
}

function renderCell(c: HeaderCell, _total: number, values: HeaderValues, opts: RenderOptions): string {
  const attrs = [c.colSpan > 1 ? `colspan="${c.colSpan}"` : '', c.rowSpan > 1 ? `rowspan="${c.rowSpan}"` : ''].filter(Boolean).join(' ')
  const style = [`text-align:${c.align || 'left'}`, c.shaded ? 'background:#eee' : '', c.widthPct ? `width:${c.widthPct}%` : ''].filter(Boolean).join(';')
  const inner = c.fields.map(f => {
    const html = renderField(f, values, opts)
    return f.slot === 'school_name' || f.slot === 'school_subtitle' || f.slot === 'static' || f.slot === 'logo' ? `<div>${html}</div>` : html
  }).join(' ')
  return `<td ${attrs} style="${style}">${inner}</td>`
}

function renderField(f: HeaderField, values: HeaderValues, opts: RenderOptions): string {
  if (f.slot === 'logo') return f.logoDataUrl ? `<img src="${f.logoDataUrl}" style="max-height:22mm;${f.logoWidthMm ? `width:${f.logoWidthMm}mm` : ''}">` : ''
  if (f.staticText !== undefined) return `<span style="${css(f.valueStyle)}">${esc(f.staticText)}</span>`
  const label = f.label ? `<span style="${css(f.labelStyle) || 'font-weight:700'}">${esc(f.label)}</span> ` : ''
  const v = valueFor(f, values, opts)
  const blank = `<span class="blank" style="min-width:${Math.min(40, Math.max(4, Math.round((f.blankChars || 20) * 0.55)))}em"></span>`
  const value = v ? `<span style="${css(f.valueStyle)}">${esc(v)}</span>` : (f.blank || !opts.useSampleValues ? blank : '')
  const suffix = f.suffix ? ` <span style="${css(f.labelStyle)}">${esc(f.suffix)}</span>` : ''
  return `<span class="field" data-slot="${f.slot}">${label}${value}${suffix}</span>`
}

function valueFor(f: HeaderField, values: HeaderValues, opts: RenderOptions): string | undefined {
  // campos do aluno sempre em branco
  if (f.slot === 'student_name' || f.slot === 'student_number' || f.slot === 'score') return undefined
  const map: Partial<Record<HeaderField['slot'], string | undefined>> = {
    subject: values.subject, teacher: values.teacher, date: values.date, class: values.class,
    term: values.term, max_score: values.maxScore, exam_title: values.examTitle,
  }
  const v = map[f.slot]
  if (v) return v
  if (opts.useSampleValues && !f.blank) return f.sampleValue
  return undefined
}

// ─── Questões ───────────────────────────────────────────────────────────────

function renderGroup(tpl: SchoolTemplate, g: QuestionGroup, gi: number, opts: RenderOptions): string {
  const q = tpl.question
  const n = g.number ?? gi + 1
  const out: string[] = [`<div class="q ${q.separator === 'rule' ? 'rule' : ''}">`]

  if (q.headingTemplate) {
    const heading = fillHeadingTemplate(q.headingTemplate, n, g.title, g.points)
    const hs = roleCss(tpl, 'questionHeading') || css(q.headingStyle) || 'font-weight:700'
    out.push(q.headingBoxed
      ? `<div style="${hs}"><span class="q-heading boxed">${esc(heading)}</span></div>`
      : `<div class="q-heading" style="${hs}">${esc(heading)}</div>`)
  } else if (g.title) {
    out.push(`<div style="font-weight:700">${esc(g.title)}</div>`)
  }
  if (g.instruction) {
    const label = !q.headingTemplate && g.number !== undefined && g.items.length !== 1 ? `${formatSubItemLabel(q.subItemLabel, n)} ` : ''
    const role: StyleRole = g.number !== undefined && tpl.roles?.stem ? 'stem' : 'questionInstruction'
    out.push(`<div class="q-instruction" style="${roleCss(tpl, role) || roleCss(tpl, 'stem') || 'margin:4px 0'}">${label ? `<span style="${roleCss(tpl, 'subItemLabel', { block: false })}">${esc(label)}</span>` : ''}${multiline(g.instruction)}</div>`)
  }

  const single = g.items.length === 1 && !g.items[0].label
  const numbered = g.items.length > 1 || g.items.some(it => it.label)
  if (numbered) out.push('<ol>')
  g.items.forEach((it, ii) => out.push(renderItem(tpl, it, numbered ? ii + 1 : null, single && !q.headingTemplate ? n : null, opts)))
  if (numbered) out.push('</ol>')
  out.push('</div>')
  return out.join('')
}

function renderItem(tpl: SchoolTemplate, it: ImportedItem, idx: number | null, questionNum: number | null, _opts: RenderOptions): string {
  const q = tpl.question
  const rawLabel = idx !== null ? formatSubItemLabel(q.subItemLabel, idx) : questionNum !== null ? formatSubItemLabel(q.subItemLabel, questionNum) : ''
  const label = rawLabel ? `<span style="${roleCss(tpl, 'subItemLabel', { block: false })}">${esc(rawLabel)}</span> ` : ''
  const tag = idx !== null ? 'li' : 'div'
  let html = ''
  if (it.kind === 'true_false') {
    html = `<${tag} style="${roleCss(tpl, 'tfItem')}">${label}${esc(q.tfMarker)} ${esc(it.stem)}</${tag}>`
  } else {
    const stemRole: StyleRole = idx !== null && tpl.roles?.subItem ? 'subItem' : 'stem'
    html = `<${tag} style="${idx !== null ? roleCss(tpl, stemRole) : ''}">${it.stem ? `<div style="${idx === null ? roleCss(tpl, 'stem') : ''}">${label}${multiline(it.stem)}</div>` : ''}`
    if (it.kind === 'multiple_choice' && it.options?.length) {
      const labelCss = roleCss(tpl, 'optionLabel', { block: false }) || (q.optionLabelBold ? 'font-weight:700' : '')
      const textCss = roleCss(tpl, 'optionText', { block: false })
      const lineCss = roleCss(tpl, 'optionText') || 'margin:2px 0'
      const opt = (o: { letter: string; text: string }) =>
        `<span style="${labelCss}">${esc(formatOptionLabel(q.optionLabel, o.letter))}</span> <span style="${textCss}">${esc(o.text)}</span>`
      html += q.optionsInline
        ? `<div class="opts" style="display:flex;flex-wrap:wrap;gap:4px 2.5em;${lineCss}">${it.options.map(o => `<span>${opt(o)}</span>`).join('')}</div>`
        : `<div class="opts">${it.options.map(o => `<div style="${lineCss}">${opt(o)}</div>`).join('')}</div>`
    }
    if (it.kind === 'open_ended') {
      const lines = it.lines ?? q.openLinesPerItem
      html += `<div class="lines">${'<div class="line"></div>'.repeat(lines)}</div>`
    }
    html += `</${tag}>`
  }
  return html
}

const multiline = (s: string) => esc(s).replace(/\n/g, '<br>')

// ─── Blocos copiados como estão (cabeçalho/rodapé de página do Word) ─────────

export function renderBlocks(blocks: Block[]): string {
  return blocks.map(b => {
    if (b.type === 'paragraph') {
      const text = paragraphText(b)
      if (!text.trim()) return '<div style="height:0.6em"></div>'
      return `<div style="text-align:${b.align || 'left'}">${b.runs.map(r => `<span style="${css(r)}">${esc(r.text)}</span>`).join('')}</div>`
    }
    if (b.type === 'image') return b.dataUrl ? `<div style="text-align:${b.align || 'left'}"><img src="${b.dataUrl}" style="${b.widthMm ? `width:${b.widthMm}mm` : 'max-height:25mm'}"></div>` : ''
    if (b.type === 'blank_lines') return '<div class="line"></div>'.repeat(b.count)
    return `<table class="tpl-header ${b.bordered ? 'bordered' : ''}">${b.rows.map(r => `<tr>${r.map(c =>
      `<td${c.colSpan > 1 ? ` colspan="${c.colSpan}"` : ''}${c.rowSpan > 1 ? ` rowspan="${c.rowSpan}"` : ''}>${renderBlocks(c.blocks)}</td>`).join('')}</tr>`).join('')}</table>`
  }).join('')
}
