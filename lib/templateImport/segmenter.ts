/**
 * lib/templateImport/segmenter.ts
 * DocumentIR → { SchoolTemplate (layout da escola), ImportedExam (questões editáveis) }.
 *
 * Uma passada só, determinística, sem LLM. Funciona igual para .docx, PDF e imagem
 * porque todos chegam aqui como DocumentIR.
 */
import type { Block, DocumentIR, ParagraphBlock, RunStyle, TableBlock, TextRun } from './ir'
import { dominantStyle, isMostlyBold, paragraphText } from './ir'
import type {
  HeaderCell, HeaderField, HeaderLayout, ImportResult, ImportWarning, ImportedExam, ImportedItem,
  QuestionGroup, QuestionPattern, RoleStyle, SchoolTemplate, StyleRole,
} from './template'
import { fingerprintOf, slotForLabel, splitFields } from './template'

// ─── Padrões ────────────────────────────────────────────────────────────────

const HEADING_RE =
  /^(QUEST[ÃA]O|Quest[ãa]o|QUESTION|Question|EXERC[ÍI]CIO|Exerc[íi]cio|EXERCISE|Exercise|ATIVIDADE|Atividade|PART|Part|PARTE|Parte|Q\.?)\s*(\d{1,3})\s*([-–—:.)]\s*)?(.*?)\s*(\(\s*(\d+(?:[.,]\d+)?)\s*(marks?|points?|pts?\.?|pontos?|pt|valor)\s*\))?\s*$/
const TF_RE = /^\s*(\(\s*\)|\[\s*\]|\(\s{0,4}\)|_{2,4})\s*(.+)$/
const TF_LEGEND_RE = /\(\s*[TV]\s*\)\s*(or|ou|e)\s*\(\s*F\s*\)|true\s+or\s+false|verdadeiro\s+ou\s+falso|\bV\s+ou\s+F\b|\bT\s+or\s+F\b/i
const OPTION_RE = /^\s*(\(?)([A-Ea-e])([).\]]|\s-)\s*(.*)$/
const NUMBERED_RE = /^\s*(\d{1,2})\s*([.)]|\s-)\s+(.+)$/
const INSTR_TITLE_RE = /^(instru[çc][õo]es(\s+gerais)?|orienta[çc][õo]es(\s+gerais)?|instructions|observa[çc][õo]es|aten[çc][ãa]o)\s*:?\s*(.*)$/i

const EN_WORDS = /\b(the|and|of|to|is|are|according|answer|question|write|read|text|which|why|about|with|choose|complete)\b/gi
const PT_WORDS = /\b(o|os|as|de|do|da|que|para|com|n[ãa]o|quest[ãa]o|responda|leia|texto|qual|por|assinale|marque)\b/gi
const ES_WORDS = /\b(el|los|las|del|que|para|con|pregunta|lee|texto|cu[áa]l|responde|elige)\b/gi

interface Line {
  text: string
  p: ParagraphBlock
  /** veio de uma tabela 1x1 (caixa) */
  boxed: boolean
}

// ─── Entrada ────────────────────────────────────────────────────────────────

export function segmentDocument(ir: DocumentIR, fileName: string, opts: { schoolNameHint?: string } = {}): ImportResult {
  const warnings: ImportWarning[] = []
  const allText = [...ir.headerPart, ...ir.body].map(b => flatText(b)).join('\n')
  const language = detectLanguage(allText)

  // 1. Cabeçalho: tabela(s) com ≥2 rótulos conhecidos, ou linhas "Nome: ___ Turma: ___"
  const { header, consumed, schoolName, subtitle, logo } = extractHeader(ir)
  if (!header) warnings.push({ code: 'NO_HEADER', message: 'Não encontrei o cabeçalho da escola (tabela ou linhas com Nome/Turma/Data). Confira na revisão.' })

  // 2. Resto do documento em linhas lógicas
  const rest = ir.body.filter((_, i) => !consumed.has(i))
  const lines = linearize(rest)

  const content: ImportedExam = { passages: [], groups: [] }
  let instructions: SchoolTemplate['instructions'] = null
  let examTitle: SchoolTemplate['examTitle']
  const pattern: QuestionPattern = {
    headingTemplate: null,
    headingStyle: {},
    headingBoxed: false,
    optionLabel: 'A)',
    optionLabelBold: false,
    tfMarker: '( )',
    openLinesPerItem: 3,
    subItemLabel: '1.',
    separator: 'space',
  }
  const roles: Partial<Record<StyleRole, RoleStyle>> = {}
  const setRole = (r: StyleRole, st: RoleStyle) => { if (!roles[r]) roles[r] = st }
  const seen = { heading: false, option: false, tf: false, sub: false, lines: [] as number[] }

  let group: QuestionGroup | null = null
  let item: ImportedItem | null = null
  let pendingIntro: string[] = []

  const newGroup = (g: Partial<QuestionGroup> = {}): QuestionGroup => {
    group = { items: [], ...g }
    if (pendingIntro.length) {
      group.instruction = [group.instruction, ...pendingIntro].filter(Boolean).join('\n')
      pendingIntro = []
    }
    content.groups.push(group)
    item = null
    return group
  }
  const ensureGroup = () => group || newGroup()

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]
    if (ln.p.type !== 'paragraph') continue
    const listLabel = ln.p.list?.label || ''
    const text = ln.text
    const full = listLabel ? `${listLabel} ${text}` : text

    // Linhas de resposta
    if ((ln as any).blank) {
      const count = (ln as any).blank as number
      seen.lines.push(count)
      const g = ensureGroup()
      if (!item) {
        item = { kind: 'open_ended', stem: g.instruction || '', lines: count }
        if (g.instruction) g.instruction = undefined
        g.items.push(item)
      } else {
        item.lines = (item.lines || 0) + count
        if (item.kind !== 'multiple_choice' && item.kind !== 'true_false') item.kind = 'open_ended'
      }
      continue
    }
    if (!text.trim()) continue

    // Instruções gerais
    const instr = text.match(INSTR_TITLE_RE)
    if (instr && !content.groups.length && !instructions) {
      const items: string[] = []
      if (instr[3]) items.push(instr[3])
      let j = i + 1
      while (j < lines.length && lines[j].p.type === 'paragraph' && !(lines[j] as any).blank) {
        const t = lines[j].text
        if (!t.trim()) { j++; continue }
        if (HEADING_RE.test(t) || (!lines[j].p.list && !/^\s*(\d+[.)]|[•\-–])\s*/.test(t) && lines[j].boxed !== ln.boxed)) break
        if (!lines[j].p.list && !/^\s*(\d+[.)]|[•\-–])\s*/.test(t) && items.length > 0 && !ln.boxed) break
        items.push(t.replace(/^\s*(\d+[.)]|[•\-–])\s*/, '').trim())
        j++
      }
      setRole('instructionsTitle', roleStyle(ln.p))
      const firstItem = lines.slice(i + 1, j).find(l => l.text.trim())
      if (firstItem) setRole('instructionsItem', roleStyle(firstItem.p))
      instructions = {
        title: text.replace(/\s*:?\s*$/, '').replace(instr[3] || '', '').trim() + ':',
        items,
        boxed: ln.boxed,
        titleStyle: dominantStyle(ln.p),
      }
      i = j - 1
      continue
    }

    // Título de questão ("QUESTÃO 01", "Question 2 - ... (2,0 marks)")
    const h = text.length <= 180 ? text.match(HEADING_RE) : null
    if (h && (h[3] || h[4] === '' || /^(QUEST|Quest|QUESTION|Question|EXERC|Exerc|EXERCISE|Exercise|ATIVIDADE|Atividade)/.test(h[1]))) {
      if (!seen.heading) {
        seen.heading = true
        pattern.headingTemplate = buildHeadingTemplate(h)
        pattern.headingStyle = dominantStyle(ln.p)
        pattern.headingBoxed = ln.boxed || ln.p.border === 'box'
        setRole('questionHeading', roleStyle(ln.p))
      }
      newGroup({ number: parseInt(h[2], 10), title: h[4]?.trim() || undefined, points: h[6] })
      continue
    }

    // Item de Verdadeiro/Falso
    const tf = text.match(TF_RE)
    if (tf) {
      if (!seen.tf) { seen.tf = true; pattern.tfMarker = normalizeTfMarker(tf[1]); setRole('tfItem', roleStyle(ln.p)) }
      const g = ensureGroup()
      item = { kind: 'true_false', label: listLabel || undefined, stem: tf[2].trim() }
      g.items.push(item)
      continue
    }

    // Várias alternativas na mesma linha ("A) x    B) y")
    const inline = splitInlineOptions(paragraphText(ln.p).trim())
    if (inline) {
      const g = ensureGroup()
      if (!seen.option) {
        seen.option = true
        pattern.optionLabel = inline.labelPattern
        const ls = labelRunStyle(ln.p, inline.firstLabel)
        pattern.optionLabelBold = !!ls.label.bold
        setRole('optionLabel', { ...roleStyle(ln.p), ...ls.label })
        setRole('optionText', { ...roleStyle(ln.p), ...ls.text })
      }
      pattern.optionsInline = true
      if (!item || item.kind !== 'multiple_choice') {
        item = { kind: 'multiple_choice', stem: g.instruction || '', options: [] }
        g.instruction = undefined
        g.items.push(item)
      }
      item.options!.push(...inline.options)
      continue
    }

    // Alternativa de múltipla escolha
    const opt = matchOption(ln)
    if (opt && (item || group || i > 0)) {
      if (!seen.option) {
        seen.option = true
        pattern.optionLabel = opt.labelPattern
        const ls = ln.p.list ? { label: ln.p.list.labelStyle || {}, text: dominantStyle(ln.p) } : labelRunStyle(ln.p, opt.rawLabel)
        pattern.optionLabelBold = !!ls.label.bold
        setRole('optionLabel', { ...roleStyle(ln.p), ...ls.label })
        setRole('optionText', { ...roleStyle(ln.p), ...ls.text })
      }
      const g = ensureGroup()
      if (!item || item.kind === 'true_false') {
        item = { kind: 'multiple_choice', stem: g.instruction || '', options: [] }
        g.instruction = undefined
        g.items.push(item)
      }
      item.kind = 'multiple_choice'
      item.options = item.options || []
      item.options.push({ letter: opt.letter.toUpperCase(), text: opt.text })
      continue
    }

    // Item numerado (subquestão) — numeração automática do Word ou "1." digitado
    const num = listLabel && /\d/.test(listLabel) ? { label: listLabel, text } : (() => {
      const m = text.match(NUMBERED_RE)
      return m ? { label: `${m[1]}${m[2].trim() || '-'}`, text: m[3] } : null
    })()
    if (num && (ln.p.list?.level ?? 0) === 0) {
      // Sem título de questão no modelo: um item numerado seguido de alternativas é uma questão inteira
      const nextIsOption = lines.slice(i + 1, i + 3).some(l => matchOption(l))
      if (!seen.heading && nextIsOption) {
        newGroup({ number: parseInt(num.label, 10) || content.groups.length + 1, instruction: num.text })
        setRole('stem', roleStyle(ln.p))
        setRole('subItemLabel', { ...roleStyle(ln.p), ...(ln.p.list?.labelStyle || labelRunStyle(ln.p, num.label).label) })
        if (!pattern.headingTemplate) pattern.subItemLabel = labelPattern(num.label)
        continue
      }
      if (!seen.sub) {
        seen.sub = true
        pattern.subItemLabel = labelPattern(num.label)
        setRole('subItem', roleStyle(ln.p))
        setRole('subItemLabel', { ...roleStyle(ln.p), ...(ln.p.list?.labelStyle || labelRunStyle(ln.p, num.label).label) })
      }
      const g = ensureGroup()
      item = { kind: 'open_ended', label: num.label, stem: num.text }
      g.items.push(item)
      continue
    }

    // Texto comum
    const isIntro = text.length <= 200 && (/[:]\s*$/.test(text) || TF_LEGEND_RE.test(text) || isNextStructured(lines, i))
    if (TF_LEGEND_RE.test(text) && !pattern.tfLegend) pattern.tfLegend = text

    if (!content.groups.length && !seen.heading) {
      // Antes da primeira questão
      if (!examTitle && isTitleLike(ln)) {
        examTitle = { text, style: dominantStyle(ln.p), align: ln.p.align, boxed: ln.boxed }
        setRole('examTitle', roleStyle(ln.p))
        content.title = text
        continue
      }
      if (isIntro) { pendingIntro.push(text); setRole('questionInstruction', roleStyle(ln.p)); continue }
      content.passages.push(text)
      setRole('passage', roleStyle(ln.p))
      continue
    }

    if (isIntro && group && (group as QuestionGroup).items.length > 0) {
      // Nova seção sem título numerado ("Now decide if ... True or False")
      group = null
      item = null
      pendingIntro.push(text)
      setRole('questionInstruction', roleStyle(ln.p))
      continue
    }
    if (isIntro && !group) { pendingIntro.push(text); setRole('questionInstruction', roleStyle(ln.p)); continue }

    const g = ensureGroup()
    if (item && item.kind === 'open_ended' && !item.lines) item.stem += `\n${text}`
    else if (!item) { g.instruction = g.instruction ? `${g.instruction}\n${text}` : text; setRole(g.number !== undefined ? 'stem' : 'questionInstruction', roleStyle(ln.p)) }
    else if (text.length >= 200) content.passages.push(text)
    else g.instruction = g.instruction ? `${g.instruction}\n${text}` : text
  }
  if (pendingIntro.length) content.passages.push(...pendingIntro)

  if (seen.lines.length) pattern.openLinesPerItem = median(seen.lines)
  if (content.groups.length > 1 && hasRuleBetweenQuestions(rest)) pattern.separator = 'rule'

  const questions = content.groups.reduce((n, g) => n + Math.max(1, g.items.length), 0)
  if (!questions) warnings.push({ code: 'NO_QUESTIONS', message: 'Não reconheci questões no arquivo. O modelo foi salvo só com cabeçalho e estilo.' })
  for (const row of header?.rows || []) for (const c of row) for (const f of c.fields) {
    if (f.slot === 'unknown_field') warnings.push({ code: 'UNKNOWN_FIELD', message: `Campo "${f.label}" do cabeçalho não foi reconhecido; ficará como texto fixo.` })
  }

  const finalSchool = opts.schoolNameHint?.trim() || schoolName || fileName.replace(/\.[^.]+$/, '')
  if (logo && header) header.rows.unshift([{ fields: [{ slot: 'logo', logoDataUrl: logo.dataUrl, logoWidthMm: logo.widthMm }], colSpan: header.rows[0]?.reduce((n, c) => n + c.colSpan, 0) || 1, rowSpan: 1, align: logo.align }])

  const template: SchoolTemplate = {
    version: 2,
    id: `tpl_${Date.now().toString(36)}`,
    schoolName: finalSchool,
    fingerprint: fingerprintOf([schoolName || '', subtitle || '', ...(header?.rows.flat().flatMap(c => c.fields.map(f => f.label || f.staticText || '')) || [])]),
    createdAt: new Date().toISOString(),
    source: { fileName, kind: ir.source },
    language,
    page: ir.page,
    body: { ...bodyStyle(rest, ir), align: mostCommonAlign(rest) },
    pageHeader: ir.headerPart.length && !header ? ir.headerPart : undefined,
    header,
    instructions,
    examTitle,
    question: pattern,
    roles: { body: { ...bodyStyle(rest, ir), ...commonSpacing(rest), align: mostCommonAlign(rest) }, ...roles },
    pageFooter: ir.footerPart.length ? ir.footerPart : undefined,
  }

  const confidence = scoreConfidence(header, questions, seen, instructions)
  return { template, content, warnings, confidence }
}

// ─── Cabeçalho ──────────────────────────────────────────────────────────────

function extractHeader(ir: DocumentIR): {
  header: HeaderLayout | null
  consumed: Set<number>
  schoolName?: string
  subtitle?: string
  logo?: { dataUrl?: string; widthMm?: number; align?: ParagraphBlock['align'] }
} {
  const consumed = new Set<number>()
  let schoolName: string | undefined
  let subtitle: string | undefined
  let logo: { dataUrl?: string; widthMm?: number; align?: ParagraphBlock['align'] } | undefined

  // procura só no topo (até o primeiro título de questão / 12 blocos)
  const scope = Math.min(ir.body.length, 12)
  const firstQuestion = ir.body.findIndex(b => b.type === 'paragraph' && HEADING_RE.test(paragraphText(b)))
  const limit = firstQuestion >= 0 ? Math.min(scope, firstQuestion) : scope

  // Candidatos do cabeçalho de página do Word também contam
  const candidates: Array<{ block: Block; idx: number | null }> = [
    ...ir.headerPart.map(b => ({ block: b, idx: null })),
    ...ir.body.slice(0, limit).map((b, i) => ({ block: b, idx: i })),
  ]

  // 1) Tabela com ≥2 rótulos conhecidos
  for (const { block, idx } of candidates) {
    if (block.type !== 'table') continue
    const labelCount = countLabels(flatText(block))
    if (labelCount < 2) continue
    const rows: HeaderCell[][] = block.rows.map(row => row.map(cell => {
      const paras = cell.blocks.filter((b): b is ParagraphBlock => b.type === 'paragraph' && !!paragraphText(b).trim())
      const imgs = cell.blocks.filter(b => b.type === 'image')
      const fields: HeaderField[] = []
      for (const im of imgs) if (im.type === 'image') fields.push({ slot: 'logo', logoDataUrl: im.dataUrl, logoWidthMm: im.widthMm })
      for (const p of paras) fields.push(...paragraphToFields(p))
      return { fields, colSpan: cell.colSpan, rowSpan: cell.rowSpan, align: paras[0]?.align, shaded: cell.shaded, widthPct: cell.widthPct }
    }))
    // células só com texto fixo no topo = nome da escola / subtítulo
    for (const f of rows.flat().flatMap(c => c.fields)) {
      if (f.slot !== 'static' || !f.staticText) continue
      if (!schoolName) { f.slot = 'school_name'; schoolName = f.staticText }
      else if (!subtitle && rows[0].some(c => c.fields.includes(f))) { f.slot = 'school_subtitle'; subtitle = f.staticText }
    }
    if (idx !== null) consumed.add(idx)
    // parágrafos centralizados logo acima da tabela = nome da escola
    if (idx !== null) absorbTitleAbove(ir.body, idx, consumed, (t, st) => {
      if (!schoolName) schoolName = t
      else if (!subtitle) subtitle = t
      rows.unshift([{ fields: [{ slot: schoolName === t ? 'school_name' : 'school_subtitle', staticText: t, valueStyle: st }], colSpan: rows[0].reduce((n, c) => n + c.colSpan, 0), rowSpan: 1, align: 'center' }])
    }, img => { logo = img })
    return { header: { kind: 'grid', bordered: block.bordered, rows }, consumed, schoolName, subtitle, logo }
  }

  // 2) Linhas de texto com rótulos ("Name: ______  Class: ____  Date: ___")
  const lineRows: HeaderCell[][] = []
  let lastIdx = -1
  for (const { block, idx } of candidates) {
    if (block.type !== 'paragraph') continue
    const text = paragraphText(block)
    const fields = splitFields(text)
    if (fields.length === 0) {
      if (lineRows.length) break
      continue
    }
    for (const f of fields) { f.labelStyle = labelStyleOf(block, f.label); f.valueStyle = dominantStyle(block) }
    lineRows.push([{ fields, colSpan: 1, rowSpan: 1, align: block.align }])
    if (idx !== null) { consumed.add(idx); lastIdx = idx }
  }
  const labelTotal = lineRows.flat().reduce((n, c) => n + c.fields.length, 0)
  if (labelTotal >= 2) {
    const firstIdx = Math.min(...Array.from(consumed))
    absorbTitleAbove(ir.body, firstIdx, consumed, (t, st) => {
      if (!schoolName) schoolName = t
      else if (!subtitle) subtitle = t
      lineRows.unshift([{ fields: [{ slot: schoolName === t ? 'school_name' : 'school_subtitle', staticText: t, valueStyle: st }], colSpan: 1, rowSpan: 1, align: 'center' }])
    }, img => { logo = img })
    void lastIdx
    return { header: { kind: 'lines', bordered: false, rows: lineRows }, consumed, schoolName, subtitle, logo }
  }
  consumed.clear()
  return { header: null, consumed }
}

/** Absorve parágrafos curtos centralizados / em negrito (e logo) imediatamente acima do cabeçalho */
function absorbTitleAbove(
  body: Block[], idx: number, consumed: Set<number>,
  onTitle: (text: string, style: RunStyle) => void,
  onLogo: (img: { dataUrl?: string; widthMm?: number; align?: ParagraphBlock['align'] }) => void,
) {
  const titles: Array<[string, RunStyle]> = []
  for (let k = idx - 1; k >= 0 && k >= idx - 4; k--) {
    const b = body[k]
    if (b.type === 'image') { onLogo({ dataUrl: b.dataUrl, widthMm: b.widthMm, align: b.align }); consumed.add(k); continue }
    if (b.type !== 'paragraph') break
    const t = paragraphText(b).trim()
    if (!t) { consumed.add(k); continue }
    if (t.length > 90 || !(b.align === 'center' || isMostlyBold(b))) break
    titles.unshift([t, dominantStyle(b)])
    consumed.add(k)
  }
  // ordem natural: o primeiro é o nome da escola
  for (const [t, st] of titles.reverse()) onTitle(t, st)
}

function paragraphToFields(p: ParagraphBlock): HeaderField[] {
  const text = paragraphText(p).trim()
  const fields = splitFields(text)
  if (fields.length) {
    for (const f of fields) { f.labelStyle = labelStyleOf(p, f.label); f.valueStyle = valueStyleOf(p, f.label) }
    return fields
  }
  // "Rótulo:" desconhecido (ex.: "UNIDADE ESCOLAR: ...") vira campo desconhecido; resto é texto fixo
  const m = text.match(/^([^:]{2,30}):\s*(.*)$/)
  if (m && !/^https?$/i.test(m[1]) && slotForLabel(m[1]) === null && /^[A-ZÀ-Ý(]/.test(m[1])) {
    return [{ slot: 'unknown_field', label: `${m[1]}:`, sampleValue: m[2] || undefined, blank: /^_{2,}/.test(m[2]) || !m[2], labelStyle: labelStyleOf(p, m[1]) }]
  }
  return [{ slot: 'static', staticText: text, valueStyle: dominantStyle(p) }]
}

function labelStyleOf(p: ParagraphBlock, label?: string): RunStyle {
  if (!label) return dominantStyle(p)
  const head = label.replace(/:$/, '').trim().slice(0, 4)
  const run = p.runs.find(r => r.text.includes(head)) || p.runs[0]
  if (!run) return {}
  const { text: _t, ...s } = run
  return s
}
function valueStyleOf(p: ParagraphBlock, label?: string): RunStyle {
  const lab = labelStyleOf(p, label)
  const run = p.runs.find(r => r.text.trim() && !r.text.includes(':') && r.bold !== lab.bold) || p.runs[p.runs.length - 1]
  if (!run) return {}
  const { text: _t, ...s } = run
  return s
}

function countLabels(text: string): number {
  return text.split(/\n|\|/).reduce((n, l) => n + splitFields(l).length, 0)
}

// ─── Linearização do corpo ──────────────────────────────────────────────────

function linearize(blocks: Block[]): Array<Line & { blank?: number }> {
  const out: Array<Line & { blank?: number }> = []
  const emptyP = (): ParagraphBlock => ({ type: 'paragraph', runs: [] })
  for (const b of blocks) {
    if (b.type === 'paragraph') out.push({ text: paragraphText(b).replace(/\t+/g, ' ').trim(), p: b, boxed: b.border === 'box' })
    else if (b.type === 'blank_lines') out.push({ text: '', p: emptyP(), boxed: false, blank: b.count })
    else if (b.type === 'table') {
      // tabela 1x1 = caixa (instruções, "QUESTÃO 01" encaixotado, texto-base). Outras: célula por célula.
      const isBox = b.rows.length === 1 && b.rows[0].length === 1
      for (const row of b.rows) for (const cell of row) for (const inner of linearize(cell.blocks)) out.push({ ...inner, boxed: inner.boxed || isBox })
    }
  }
  return out
}

function matchOption(ln: Line): { letter: string; text: string; labelPattern: string; rawLabel: string } | null {
  const list = ln.p.list
  if (list && /letter/i.test(list.format)) {
    const letter = list.label.replace(/[^A-Za-z]/g, '') || 'a'
    return { letter, text: ln.text, rawLabel: list.label, labelPattern: list.label.replace(/[A-Za-z]/, list.format === 'upperLetter' ? 'A' : 'a') }
  }
  const m = ln.text.match(OPTION_RE)
  if (!m) return null
  // evita falsos positivos tipo "A professora disse..." (exige separador)
  if (!m[3] || (m[3] === '.' && !m[4])) return null
  if (m[3].trim() === '-' && !m[1] && m[4].length > 120) return null
  const L = /[a-z]/.test(m[2]) ? 'a' : 'A'
  const pattern = `${m[1]}${L}${m[3].trim() === '-' ? ' -' : m[3]}`
  return { letter: m[2], text: m[4].trim(), rawLabel: `${m[1]}${m[2]}${m[3]}`.trim(), labelPattern: pattern }
}

function isNextStructured(lines: Line[], i: number): boolean {
  for (let k = i + 1; k < lines.length && k <= i + 2; k++) {
    const l = lines[k]
    if ((l as any).blank) return false
    if (!l.text.trim()) continue
    return TF_RE.test(l.text) || (!!l.p.list && /\d/.test(l.p.list.label))
  }
  return false
}

function isTitleLike(ln: Line): boolean {
  const t = ln.text
  return t.length <= 100 && !/[.?!]$/.test(t) && (ln.p.align === 'center' || (isMostlyBold(ln.p) && t === t.toUpperCase()))
}

function buildHeadingTemplate(h: RegExpMatchArray): string {
  const word = h[1]
  const numToken = /^0\d/.test(h[2]) ? '{nn}' : '{n}'
  const sep = h[3] ? h[3].trim() : ''
  let tpl = `${word} ${numToken}`
  if (h[4]?.trim()) tpl += `${sep === '.' || sep === ':' || sep === ')' ? sep : ` ${sep || '-'}`} {title}`
  else if (sep && sep !== '-' && sep !== '–' && sep !== '—') tpl += sep
  if (h[5]) tpl += ` ({points} ${h[7]})`
  return tpl
}

function normalizeTfMarker(m: string): string {
  if (m.startsWith('[')) return '[ ]'
  if (m.startsWith('_')) return '___'
  const inner = m.length - 2
  return inner >= 3 ? '(   )' : '( )'
}

function labelPattern(label: string): string {
  return label.replace(/\d+/, '1').replace(/^[a-z]/, 'a').replace(/^[A-Z]/, 'A')
}

// ─── Estilos por papel ──────────────────────────────────────────────────────

/** Estilo completo do parágrafo: run dominante + alinhamento + espaçamento + recuo */
export function roleStyle(p: ParagraphBlock): RoleStyle {
  const sp = p.spacing || {}
  const out: RoleStyle = { ...dominantStyle(p), align: p.align }
  if (sp.beforePt !== undefined) out.spaceBeforePt = sp.beforePt
  if (sp.afterPt !== undefined) out.spaceAfterPt = sp.afterPt
  if (sp.lineMultiple !== undefined) out.lineMultiple = sp.lineMultiple
  if (sp.linePt !== undefined) out.linePt = sp.linePt
  if (p.indentMm !== undefined) out.indentMm = p.indentMm
  if (p.firstLineMm !== undefined) out.firstLineMm = p.firstLineMm
  // explicita negrito falso para não herdar do papel pai na renderização
  if (out.bold === undefined) out.bold = false
  return out
}

/** Separa o estilo do rótulo ("A)") do estilo do texto da alternativa */
function labelRunStyle(p: ParagraphBlock, rawLabel: string): { label: RunStyle; text: RunStyle } {
  const clean = (r?: TextRun): RunStyle => { if (!r) return {}; const { text: _t, ...st } = r; return st }
  const full = p.runs.map(r => r.text).join('')
  const start = full.search(/\S/)
  const labelEnd = full.indexOf(rawLabel.trim()) >= 0 ? full.indexOf(rawLabel.trim()) + rawLabel.trim().length : start + 1
  let pos = 0
  let labelRun: TextRun | undefined
  let textRun: TextRun | undefined
  for (const r of p.runs) {
    const end = pos + r.text.length
    if (!labelRun && end > start) labelRun = r
    if (!textRun && end > labelEnd && r.text.slice(Math.max(0, labelEnd - pos)).trim()) textRun = r
    pos = end
  }
  return { label: clean(labelRun), text: clean(textRun || labelRun) }
}

function splitInlineOptions(text: string): { options: { letter: string; text: string }[]; labelPattern: string; firstLabel: string } | null {
  const re = /(?:^|\t+|\s{2,})(\(?)([A-Ea-e])([).\]])\s*/g
  const hits: { idx: number; end: number; letter: string; open: string; close: string }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) hits.push({ idx: m.index, end: m.index + m[0].length, letter: m[2], open: m[1], close: m[3] })
  if (hits.length < 2 || hits[0].idx !== 0) return null
  // letras em sequência (A, B, C...) para não confundir com texto
  for (let k = 0; k < hits.length; k++) if (hits[k].letter.toUpperCase().charCodeAt(0) !== 65 + k) return null
  const options = hits.map((h, k) => ({ letter: h.letter.toUpperCase(), text: text.slice(h.end, k + 1 < hits.length ? hits[k + 1].idx : undefined).trim() }))
  const L = /[a-z]/.test(hits[0].letter) ? 'a' : 'A'
  return { options, labelPattern: `${hits[0].open}${L}${hits[0].close}`, firstLabel: `${hits[0].open}${hits[0].letter}${hits[0].close}` }
}

/** Espaçamento mais comum entre os parágrafos de texto */
function commonSpacing(blocks: Block[]): Pick<RoleStyle, 'spaceBeforePt' | 'spaceAfterPt' | 'lineMultiple' | 'linePt'> {
  const t = new Map<string, number>()
  for (const b of blocks) if (b.type === 'paragraph' && b.spacing && paragraphText(b).trim()) {
    const k = JSON.stringify(b.spacing)
    t.set(k, (t.get(k) || 0) + paragraphText(b).length)
  }
  const top = [...t.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  if (!top) return {}
  const sp = JSON.parse(top)
  return { spaceBeforePt: sp.beforePt, spaceAfterPt: sp.afterPt, lineMultiple: sp.lineMultiple, linePt: sp.linePt }
}

// ─── Estilo geral ───────────────────────────────────────────────────────────

function bodyStyle(blocks: Block[], ir: DocumentIR): RunStyle {
  const tally = new Map<string, number>()
  let sizeTally = new Map<number, number>()
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      if (b.type === 'paragraph') for (const r of b.runs) {
        const n = r.text.trim().length
        if (!n) continue
        if (r.fontFamily) tally.set(r.fontFamily, (tally.get(r.fontFamily) || 0) + n)
        if (r.sizePt) sizeTally.set(r.sizePt, (sizeTally.get(r.sizePt) || 0) + n)
      } else if (b.type === 'table') for (const row of b.rows) for (const c of row) walk(c.blocks)
    }
  }
  walk(blocks)
  const top = <K,>(m: Map<K, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  return { fontFamily: top(tally) || ir.defaults.fontFamily, sizePt: top(sizeTally) || ir.defaults.sizePt }
}

function mostCommonAlign(blocks: Block[]) {
  const t = new Map<string, number>()
  for (const b of blocks) if (b.type === 'paragraph' && b.align) t.set(b.align, (t.get(b.align) || 0) + paragraphText(b).length)
  return ([...t.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as ParagraphBlock['align']) || 'left'
}

function hasRuleBetweenQuestions(blocks: Block[]): boolean {
  return blocks.filter(b => b.type === 'paragraph' && b.border === 'bottom' && !paragraphText(b).trim()).length >= 1
}

function detectLanguage(text: string): 'pt' | 'en' | 'es' {
  const s = text.slice(0, 6000)
  const en = (s.match(EN_WORDS) || []).length
  const pt = (s.match(PT_WORDS) || []).length
  const es = (s.match(ES_WORDS) || []).length
  if (en > pt && en > es) return 'en'
  if (es > pt * 1.2) return 'es'
  return 'pt'
}

function flatText(b: Block): string {
  if (b.type === 'paragraph') return paragraphText(b)
  if (b.type === 'table') return b.rows.map(r => r.map(c => c.blocks.map(flatText).join('\n')).join('\n')).join('\n')
  return ''
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

function scoreConfidence(header: HeaderLayout | null, questions: number, seen: { heading: boolean; option: boolean; tf: boolean; sub: boolean }, instructions: SchoolTemplate['instructions']): number {
  let s = 0
  if (header) s += 0.4
  if (questions > 0) s += 0.3
  if (seen.heading || seen.sub) s += 0.15
  if (seen.option || seen.tf) s += 0.1
  if (instructions) s += 0.05
  return Math.round(Math.min(1, s) * 100) / 100
}

export type { TableBlock }
