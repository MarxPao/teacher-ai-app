/**
 * lib/templateImport/template.ts
 * SchoolTemplate v2: o modelo da escola como ESTRUTURA (não como ~20 parâmetros de estilo).
 *
 * O cabeçalho é guardado célula por célula, exatamente como a escola desenhou, com cada
 * campo ligado a um "slot" (disciplina, professor, data, aluno, nota...). Na hora de gerar
 * a prova, o renderizador preenche os slots e copia o resto como está.
 */
import type { Align, Block, PageSetup, RunStyle } from './ir'

export type HeaderSlot =
  | 'school_name' | 'school_subtitle' | 'exam_title'
  | 'subject' | 'teacher' | 'date' | 'class' | 'term'
  | 'student_name' | 'student_number' | 'score' | 'max_score'
  | 'logo' | 'static' | 'unknown_field'

/** Um campo dentro de uma célula ou linha do cabeçalho: "DISCIPLINA: Língua Inglesa" */
export interface HeaderField {
  slot: HeaderSlot
  /** Rótulo exatamente como no modelo: "DISCIPLINA:", "PROFESSOR(A):", "Name:" */
  label?: string
  /** Valor visto no modelo (exemplo, só para pré-visualização) */
  sampleValue?: string
  /** Campo para o aluno preencher à mão (linha "_____") */
  blank?: boolean
  blankChars?: number
  /** Texto fixo depois do campo: "/ 10,0" */
  suffix?: string
  /** Texto fixo sem campo (nome da escola, lema) */
  staticText?: string
  labelStyle?: RunStyle
  valueStyle?: RunStyle
  logoDataUrl?: string
  logoWidthMm?: number
}

export interface HeaderCell {
  fields: HeaderField[]
  colSpan: number
  rowSpan: number
  align?: Align
  shaded?: boolean
  widthPct?: number
}

export interface HeaderLayout {
  /** grid = tabela com bordas/colunas; lines = linhas de texto ("Name: ____  Class: ___") */
  kind: 'grid' | 'lines'
  bordered: boolean
  rows: HeaderCell[][]
}

/** Estilo completo de um papel no documento (fonte, negrito, espaçamento, recuo) */
export interface RoleStyle extends RunStyle {
  align?: Align
  spaceBeforePt?: number
  spaceAfterPt?: number
  lineMultiple?: number
  linePt?: number
  indentMm?: number
  firstLineMm?: number
}

export type StyleRole =
  | 'body' | 'passage' | 'examTitle'
  | 'instructionsTitle' | 'instructionsItem'
  | 'questionHeading' | 'questionInstruction' | 'stem'
  | 'optionLabel' | 'optionText'
  | 'tfItem' | 'subItemLabel' | 'subItem'

export interface QuestionPattern {
  /**
   * Como o título de questão aparece no modelo, com marcadores:
   *  {n} número, {nn} número com 2 dígitos, {title} título, {points} pontuação.
   *  Ex.: "QUESTÃO {nn}"  |  "Question {n} - {title} ({points} marks)"
   *  null quando o modelo numera as questões só com lista ("1.", "2.")
   */
  headingTemplate: string | null
  headingStyle: RunStyle
  headingBoxed: boolean
  /** Rótulo das alternativas: "A)", "(A)", "a)", "[A]", "A.", "a." */
  optionLabel: string
  optionLabelBold: boolean
  /** alternativas na mesma linha ("A) x    B) y") */
  optionsInline?: boolean
  /** Marcador de V/F como no modelo: "( )", "(   )", "[ ]" */
  tfMarker: string
  tfLegend?: string
  /** Linhas de resposta por item discursivo */
  openLinesPerItem: number
  /** Numeração de itens dentro de uma questão: "1.", "a)", "I -" */
  subItemLabel: string
  separator: 'rule' | 'space'
}

export interface SchoolTemplate {
  version: 2
  id: string
  schoolName: string
  /** Hash do texto fixo do cabeçalho: reconhece a escola na próxima importação */
  fingerprint: string
  createdAt: string
  source: { fileName: string; kind: 'docx' | 'pdf' | 'image' | 'html' }
  language: 'pt' | 'en' | 'es'
  page: PageSetup
  body: RunStyle & { align?: Align; lineHeight?: number }
  /** Cabeçalho de página do Word, copiado como está (repete em toda página) */
  pageHeader?: Block[]
  header: HeaderLayout | null
  instructions: { title?: string; items: string[]; boxed: boolean; titleStyle?: RunStyle } | null
  examTitle?: { text: string; style: RunStyle; align?: Align; boxed?: boolean }
  question: QuestionPattern
  /** Estilo de cada papel, copiado do primeiro exemplo no arquivo */
  roles: Partial<Record<StyleRole, RoleStyle>>
  pageFooter?: Block[]
}

// ─── Conteúdo importado (questões editáveis) ─────────────────────────────────

export interface ImportedItem {
  kind: 'multiple_choice' | 'true_false' | 'open_ended'
  label?: string
  stem: string
  options?: { letter: string; text: string }[]
  lines?: number
}

export interface QuestionGroup {
  number?: number
  title?: string
  points?: string
  /** Enunciado da questão / comando da seção */
  instruction?: string
  items: ImportedItem[]
}

export interface ImportedExam {
  title?: string
  passages: string[]
  groups: QuestionGroup[]
}

export interface ImportWarning {
  code: 'NO_HEADER' | 'NO_QUESTIONS' | 'LOW_TEXT' | 'UNKNOWN_FIELD' | 'LEGACY_DOC' | 'VISION_USED' | 'AMBIGUOUS'
  message: string
}

export interface ImportResult {
  template: SchoolTemplate
  content: ImportedExam
  warnings: ImportWarning[]
  /** 0–1: quanto do modelo foi reconhecido com segurança */
  confidence: number
}

// ─── Dicionário de rótulos de cabeçalho ──────────────────────────────────────

const LABELS: Array<{ slot: HeaderSlot; re: RegExp }> = [
  { slot: 'student_name', re: /^(nome\s+do\(?a?\)?\s+alun[oa]\(?a?\)?|alun[oa]\s*\(a\)|alun[oa]|estudante|nome\s+completo|nome|student(?:'s)?\s+name|student|candidate\s+name|name)$/i },
  { slot: 'student_number', re: /^(n[ºo°]\.?|n[úu]mero|number|no\.?)$/i },
  { slot: 'subject', re: /^(disciplina|componente(?:\s+curricular)?|mat[ée]ria|[áa]rea|subject)$/i },
  { slot: 'teacher', re: /^(professor\s*\(a\)|professora?|prof\s*\(a\)\.?|prof[ªa]?\.?|docente|teacher)$/i },
  { slot: 'date', re: /^(data|date)$/i },
  { slot: 'class', re: /^(turma\s*\/\s*s[ée]rie|s[ée]rie\s*\/\s*turma|turma|s[ée]rie|ano(?:\s*\/\s*turma)?|ano\s+escolar|class|grade|form|year(?:\s+group)?)$/i },
  { slot: 'term', re: /^(etapa(?:\s*\/\s*trimestre)?|trimestre|bimestre|semestre|unidade|per[íi]odo|term)$/i },
  { slot: 'score', re: /^(nota(?:\s+obtida)?|resultado|score|mark|marks|pontos\s+obtidos)$/i },
  { slot: 'max_score', re: /^(valor(?:\s+total)?|pontua[çc][ãa]o(?:\s+total)?|total|value)$/i },
]

export function slotForLabel(label: string): HeaderSlot | null {
  const clean = label.replace(/[:：]\s*$/, '').replace(/\s+/g, ' ').trim()
  for (const { slot, re } of LABELS) if (re.test(clean)) return slot
  return null
}

/** Encontra "Rótulo:" conhecidos numa linha e devolve os campos na ordem */
export function splitFields(text: string): HeaderField[] {
  const line = text.replace(/\u00a0/g, ' ')
  const hits: { start: number; end: number; label: string; slot: HeaderSlot }[] = []
  let prevEnd = 0
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== ':' && line[i] !== '：') continue
    const toks: number[] = []
    const tokRe = /\S+/g
    const before = line.slice(prevEnd, i)
    let t: RegExpExecArray | null
    while ((t = tokRe.exec(before))) toks.push(prevEnd + t.index)
    // do início mais distante (até 5 palavras) para o mais próximo: pega o rótulo mais longo
    for (let k = Math.max(0, toks.length - 5); k < toks.length; k++) {
      const cand = line.slice(toks[k], i).trim()
      const slot = slotForLabel(cand)
      if (slot) {
        hits.push({ start: toks[k], end: i + 1, label: line.slice(toks[k], i + 1).trim(), slot })
        prevEnd = i + 1
        break
      }
    }
  }
  if (!hits.length) return []
  return hits.map((h, i) => {
    const raw = line.slice(h.end, i + 1 < hits.length ? hits[i + 1].start : undefined).replace(/\t/g, ' ').trim()
    return parseFieldValue(h.slot, h.label, raw)
  })
}

function parseFieldValue(slot: HeaderSlot, label: string, raw: string): HeaderField {
  const f: HeaderField = { slot, label }
  const blank = raw.match(/^(_{2,}|\.{4,}|…+)\s*(.*)$/)
  if (blank) {
    f.blank = true
    f.blankChars = blank[1].length
    if (blank[2]) f.suffix = blank[2].trim()
  } else if (!raw) {
    f.blank = true
    f.blankChars = 20
  } else {
    f.sampleValue = raw.replace(/_{2,}.*$/, '').trim()
    const suf = raw.match(/_{2,}\s*(.+)$/)
    if (suf) { f.blank = true; f.suffix = suf[1].trim() }
  }
  return f
}

// ─── Utilidades ─────────────────────────────────────────────────────────────

export function fingerprintOf(parts: string[]): string {
  const norm = parts.join('|').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9|]+/g, ' ').trim()
  let h = 5381
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) >>> 0
  return `fp_${h.toString(36)}`
}

export function fillHeadingTemplate(tpl: string, n: number, title?: string, points?: string): string {
  let s = tpl
  if (!title) s = s.replace(/\s*[-–—:.]?\s*\{title\}/, '')
  if (!points) s = s.replace(/\s*\(\s*\{points\}[^)]*\)/, '').replace(/\{points\}/, '')
  return s
    .replace('{nn}', String(n).padStart(2, '0'))
    .replace('{n}', String(n))
    .replace('{title}', title || '')
    .replace('{points}', points || '')
    .trim()
}

export function formatOptionLabel(pattern: string, letter: string): string {
  const up = letter.toUpperCase()
  const lo = letter.toLowerCase()
  const isLower = /[a-z]/.test(pattern)
  return pattern.replace(/[A-Za-z]/, isLower ? lo : up)
}

export function formatSubItemLabel(pattern: string, index: number): string {
  if (/[a-z]/.test(pattern) && !/^(i|v|x)+\b/i.test(pattern)) return pattern.replace(/[a-z]/, String.fromCharCode(96 + index))
  if (/[A-Z]/.test(pattern) && !/^(I|V|X)+\b/.test(pattern)) return pattern.replace(/[A-Z]/, String.fromCharCode(64 + index))
  return pattern.replace(/\d+/, String(index))
}
