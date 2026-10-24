/**
 * lib/templateImport/ir.ts
 * Representação intermediária (IR) única do importador de modelos de prova.
 *
 * Todo arquivo de entrada (.docx, PDF com texto, PDF escaneado, imagem, HTML) é
 * convertido para este formato ANTES de qualquer heurística. Assim existe um só
 * segmentador e um só renderizador, e cada extrator só precisa ser fiel ao arquivo.
 */

// ─── Blocos de documento ─────────────────────────────────────────────────────

export interface RunStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontFamily?: string
  sizePt?: number
  color?: string // hex sem '#'
}

export interface TextRun extends RunStyle {
  text: string
}

export type Align = 'left' | 'center' | 'right' | 'justify'

export interface ListInfo {
  numId: string
  level: number
  /** Rótulo já renderizado ("1.", "a)", "•"), porque a numeração automática do Word não está no texto */
  label: string
  format: string // decimal | lowerLetter | upperLetter | bullet | lowerRoman ...
  /** Estilo do rótulo automático (rPr do nível em numbering.xml ou marca de parágrafo) */
  labelStyle?: RunStyle
}

/** Espaçamento do parágrafo como no Word */
export interface Spacing {
  beforePt?: number
  afterPt?: number
  /** múltiplo de linha (1, 1.15, 1.5) quando lineRule=auto */
  lineMultiple?: number
  /** altura exata/mínima em pt quando lineRule=exact|atLeast */
  linePt?: number
}

export interface ParagraphBlock {
  type: 'paragraph'
  runs: TextRun[]
  align?: Align
  list?: ListInfo
  /** Parágrafo com borda inferior ou caixa (comum em "QUESTÃO 01" encaixotado) */
  border?: 'bottom' | 'box'
  styleId?: string
  indentMm?: number
  /** recuo especial da primeira linha: negativo = deslocamento (hanging) */
  firstLineMm?: number
  spacing?: Spacing
}

export interface TableCell {
  blocks: Block[]
  colSpan: number
  rowSpan: number
  shaded?: boolean
  widthPct?: number
}

export interface TableBlock {
  type: 'table'
  rows: TableCell[][]
  bordered: boolean
}

export interface ImageBlock {
  type: 'image'
  dataUrl?: string
  widthMm?: number
  heightMm?: number
  align?: Align
}

/** Linhas de resposta (sublinhados, parágrafos vazios com borda inferior, tab com leader "_") */
export interface BlankLinesBlock {
  type: 'blank_lines'
  count: number
}

export type Block = ParagraphBlock | TableBlock | ImageBlock | BlankLinesBlock

export interface PageSetup {
  size: 'A4' | 'Letter' | 'Legal'
  orientation: 'portrait' | 'landscape'
  marginsMm: { top: number; right: number; bottom: number; left: number }
  columns: 1 | 2
}

export interface DocumentIR {
  source: 'docx' | 'pdf' | 'image' | 'html'
  page: PageSetup
  defaults: { fontFamily?: string; sizePt?: number }
  /** Cabeçalho de página do Word (header1.xml), se houver */
  headerPart: Block[]
  body: Block[]
  footerPart: Block[]
  /** Imagens das páginas (PNG data URL) para conferência visual e fallback por visão */
  pageImages?: string[]
}

// ─── Utilidades de texto ─────────────────────────────────────────────────────

export function paragraphText(p: ParagraphBlock): string {
  return p.runs.map(r => r.text).join('').replace(/ /g, ' ')
}

export function blockText(b: Block): string {
  if (b.type === 'paragraph') return paragraphText(b)
  if (b.type === 'table') return b.rows.map(r => r.map(c => c.blocks.map(blockText).join('\n')).join(' | ')).join('\n')
  return ''
}

/** Estilo predominante de um parágrafo (o run mais longo manda) */
export function dominantStyle(p: ParagraphBlock): RunStyle {
  let best: TextRun | undefined
  for (const r of p.runs) if (r.text.trim() && (!best || r.text.length > best.text.length)) best = r
  if (!best) return {}
  const { text: _t, ...style } = best
  return style
}

export function isMostlyBold(p: ParagraphBlock): boolean {
  const total = p.runs.reduce((n, r) => n + r.text.trim().length, 0)
  if (!total) return false
  const bold = p.runs.filter(r => r.bold).reduce((n, r) => n + r.text.trim().length, 0)
  return bold / total >= 0.6
}

export const DEFAULT_PAGE: PageSetup = {
  size: 'A4',
  orientation: 'portrait',
  marginsMm: { top: 15, right: 15, bottom: 15, left: 15 },
  columns: 1,
}
