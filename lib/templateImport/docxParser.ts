/**
 * lib/templateImport/docxParser.ts
 * Leitor ESTRUTURAL de .docx → DocumentIR.
 *
 * Diferente do extractTextFromDocx atual (que achata tudo em texto), este leitor preserva:
 *  - tabelas com células mescladas (gridSpan / vMerge) e bordas → cabeçalho em grade da escola
 *  - estilo de cada trecho (negrito, itálico, sublinhado, fonte, tamanho, cor), herdando de styles.xml
 *  - numeração automática do Word (numbering.xml): "1.", "a)" que NÃO estão no texto
 *  - linhas de resposta (sublinhados, borda inferior, tab com leader)
 *  - alinhamento, caixas (pBdr), imagens com tamanho, cabeçalho/rodapé de página
 *  - página: tamanho, orientação, margens, colunas
 */
import type {
  Block, DocumentIR, ImageBlock, ListInfo, PageSetup, ParagraphBlock, RunStyle, Spacing, TableBlock, TableCell, TextRun, Align,
} from './ir'
import { DEFAULT_PAGE } from './ir'

type XmlEl = Element

export interface DocxParseOptions {
  /** Injetável para Node sem jsdom (ex.: @xmldom/xmldom) */
  domParser?: { parseFromString(xml: string, type: string): Document }
  /** Não embutir imagens (economiza memória quando só o layout interessa) */
  skipImages?: boolean
}

const EMU_PER_MM = 36000
const TWIP_PER_MM = 1440 / 25.4

// ─── Helpers XML ─────────────────────────────────────────────────────────────

const kids = (el: XmlEl | null | undefined, name?: string): XmlEl[] => {
  if (!el) return []
  const out: XmlEl[] = []
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && (!name || (n as XmlEl).nodeName === name)) out.push(n as XmlEl)
  }
  return out
}
const kid = (el: XmlEl | null | undefined, name: string): XmlEl | null => kids(el, name)[0] || null
const attr = (el: XmlEl | null | undefined, name: string): string | null => (el ? el.getAttribute(name) : null)
const descendants = (el: XmlEl, name: string): XmlEl[] => Array.from(el.getElementsByTagName(name)) as XmlEl[]

/** <w:b/> = true, <w:b w:val="0"/> = false, ausente = undefined */
const onOff = (el: XmlEl | null): boolean | undefined => {
  if (!el) return undefined
  const v = attr(el, 'w:val')
  return !(v === '0' || v === 'false' || v === 'none')
}

export interface ThemeFonts { major?: string; minor?: string }

/** Lê as fontes de tema (theme1.xml): majorFont (títulos) e minorFont (corpo) */
function parseTheme(doc: Document | null): ThemeFonts {
  if (!doc) return {}
  const fs = descendants(doc.documentElement, 'a:fontScheme')[0]
  const latin = (tag: string): string | undefined => {
    const el = fs ? descendants(fs, tag)[0] : undefined
    return attr(kid(el, 'a:latin'), 'typeface') || undefined
  }
  return { major: latin('a:majorFont'), minor: latin('a:minorFont') }
}

/** Fonte de tema (asciiTheme="minorHAnsi" etc.) → nome real definido no tema */
function themeFont(fonts: XmlEl | null, theme?: ThemeFonts): string | undefined {
  const t = attr(fonts, 'w:asciiTheme') || attr(fonts, 'w:hAnsiTheme')
  if (!t || !theme) return undefined
  return /major/i.test(t) ? theme.major : /minor/i.test(t) ? theme.minor : undefined
}

function readRunProps(rPr: XmlEl | null, theme?: ThemeFonts): RunStyle {
  if (!rPr) return {}
  const s: RunStyle = {}
  const b = onOff(kid(rPr, 'w:b'))
  if (b !== undefined) s.bold = b
  const i = onOff(kid(rPr, 'w:i'))
  if (i !== undefined) s.italic = i
  const u = kid(rPr, 'w:u')
  if (u) s.underline = attr(u, 'w:val') !== 'none'
  const fonts = kid(rPr, 'w:rFonts')
  const font = attr(fonts, 'w:ascii') || attr(fonts, 'w:hAnsi') || attr(fonts, 'w:cs') || themeFont(fonts, theme)
  if (font) s.fontFamily = font
  const sz = attr(kid(rPr, 'w:sz'), 'w:val')
  if (sz) s.sizePt = parseInt(sz, 10) / 2
  const color = attr(kid(rPr, 'w:color'), 'w:val')
  if (color && color !== 'auto') s.color = color
  const caps = onOff(kid(rPr, 'w:caps'))
  if (caps !== undefined) s.caps = caps
  const small = onOff(kid(rPr, 'w:smallCaps'))
  if (small !== undefined) s.smallCaps = small
  const va = attr(kid(rPr, 'w:vertAlign'), 'w:val')
  if (va === 'superscript' || va === 'subscript') s.vertAlign = va
  const hl = attr(kid(rPr, 'w:highlight'), 'w:val')
  if (hl && hl !== 'none') s.highlight = hl
  return s
}

/**
 * w:sym → caractere Unicode.
 *
 * Wingdings (F000–F0FF) e Symbol (F020–F0FF) usam o bloco PUA do Windows.
 * Mapeamos os símbolos mais comuns em provas brasileiras.
 * Outros códigos retornam o caractere da fonte (aparece certo onde a fonte está instalada).
 *
 * Referências:
 *  - Wingdings: https://www.alanwood.net/demos/wingdings.html
 *  - Symbol:    https://www.alanwood.net/demos/symbol.html
 */
const SYMBOL_MAP: Record<string, string> = {
  // ── Wingdings ──────────────────────────────────────────────────────────
  F021: '✏',  // lápis
  F028: '✂',  // tesoura
  F04A: '⌛',  // ampulheta
  F04B: '⌚',  // relógio
  F061: '→',  // seta direita sólida
  F062: '←',  // seta esquerda sólida
  F06C: '●',  // círculo sólido
  F06E: '■',  // quadrado sólido
  F06F: '□',  // quadrado vazio
  F070: '▪',  // quadrado pequeno sólido
  F071: '◆',  // losango sólido
  F072: '◇',  // losango vazio
  F073: '▲',  // triângulo sólido para cima
  F074: '△',  // triângulo vazio para cima
  F075: '▼',  // triângulo sólido para baixo
  F077: '✦',  // estrela de 4 pontas sólida
  F07B: '★',  // estrela sólida
  F07C: '☆',  // estrela vazia
  F0A7: '▪',  // quadrado pequeno (• alternate)
  F0A8: '☐',  // caixa de verificação vazia (checkbox)
  F0B7: '•',  // bullet redondo
  F0C0: '☎',  // telefone
  F0D8: '➢',  // seta triangular direita
  F0E0: '✉',  // envelope
  F0FB: '✘',  // X (errado)
  F0FC: '✔',  // check (certo)
  F0FD: '☒',  // caixa com X (checkbox marcada incorreta)
  F0FE: '☑',  // caixa com check (checkbox marcada correta)
  // ── Wingdings 2 ────────────────────────────────────────────────────────
  F021_W2: '✔', // (sobrepõe se necessário — Wingdings 2 F021 = check leve)
  // ── Symbol (fonte Symbol) ──────────────────────────────────────────────
  F020: ' ',  // espaço Symbol
  F022: '∀',  // para todo
  F024: '∃',  // existe
  F026: '∈',  // pertence a
  F027: '∉',  // não pertence
  F02B: '+',
  F02D: '−',  // menos
  F03C: '<',
  F03E: '>',
  F040: '≅',  // congruente
  F041: 'Α',  F042: 'Β', F043: 'Χ', F044: 'Δ', F045: 'Ε',
  F046: 'Φ',  F047: 'Γ', F048: 'Η', F049: 'Ι', F04A_S: 'ϑ',
  F04B_S: 'Κ', F04C: 'Λ', F04D: 'Μ', F04E: 'Ν', F04F: 'Ο',
  F050: 'Π',  F051: 'Θ', F052: 'Ρ', F053: 'Σ', F054: 'Τ',
  F055: 'Υ',  F056: 'ς', F057: 'Ω', F058: 'Ξ', F059: 'Ψ', F05A: 'Ζ',
  F061_S: 'α', F062_S: 'β', F063: 'χ', F064: 'δ', F065: 'ε',
  F066: 'φ',  F067: 'γ', F068: 'η', F069: 'ι', F06A: 'ϕ',
  F06B: 'κ',  F06C_S: 'λ', F06D: 'μ', F06E_S: 'ν', F06F_S: 'ο',
  F070_S: 'π', F071_S: 'θ', F072_S: 'ρ', F073_S: 'σ', F074_S: 'τ',
  F075_S: 'υ', F076: 'ϖ', F077_S: 'ω', F078: 'ξ', F079: 'ψ', F07A: 'ζ',
  F0A3: '≤',  // menor ou igual
  F0B3: '≥',  // maior ou igual
  F0B4: '×',  // multiplicação
  F0B8: '÷',  // divisão
  F0B9: '≠',  // diferente
  F0BA: '≡',  // equivalente
  F0BB: '≈',  // aproximadamente
  F0BC: '…',  // reticências
  F0BF: '√',  // raiz quadrada
  F0C5: '∞',  // infinito
  F0C6: 'f',  // função
  F0CE: '∑',  // somatório (sigma maiúsc)
  F0CF: '∏',  // produtório
  F0D1: 'ℵ',
  F0D2: 'ℑ',
  F0D3: 'ℜ',
  F0D6: '∂',  // derivada parcial
  F0D7: '•',
  F0D9: '⊗',
  F0DA: '⊕',
  F0DB: '∅',  // conjunto vazio
  F0DC: '∩',  // interseção
  F0DD: '∪',  // união
  F0DE: '⊃',  // contém como subconjunto
  F0DF: '⊇',
  F0E0_S: '⊂',
  F0E1: '⊆',
  F0E2: '⊕',
  F0E5: '∧',  // e lógico
  F0E6: '∨',  // ou lógico
  F0AB: '↔',  // bicondicional
  F0AE: '→',  // condicional / implica
  F0AC: '¬',  // negação
}

function symChar(el: XmlEl): string {
  const font = (attr(el, 'w:font') || '').toLowerCase()
  const raw = (attr(el, 'w:char') || '').replace(/^0x/i, '').toUpperCase()
  const hex = raw.padStart(4, '0')
  if (!/^[0-9A-F]{4}$/.test(hex)) return ''

  // Tenta mapeamento direto
  if (SYMBOL_MAP[hex]) return SYMBOL_MAP[hex]

  // Para Symbol e Wingdings, o intervalo F020-F0FF é PUA do Windows:
  // o código "real" é hex − 0xF000 no caso Symbol, ou usa mapeamento acima.
  // Se não encontrou no mapa e é Wingdings/Symbol PUA, devolve o caractere
  // como-está (só aparece certo onde a fonte está instalada).
  const codePoint = parseInt(hex, 16)
  if (codePoint >= 0xF000 && codePoint <= 0xF0FF) {
    // tenta versão sem o prefixo F0 como código ASCII base
    const ascii = codePoint - 0xF000
    if (ascii >= 0x20 && ascii < 0x80) {
      // caractere ASCII base — retorna como-está (sem fonte, pode confundir)
      // prefere o caractere PUA que ao menos é renderizável com a fonte certa
    }
  }
  // Código fora do PUA ou não mapeado → unicode direto
  if (codePoint > 0xFFFF) return String.fromCodePoint(codePoint)
  // PUA sem mapeamento: retorna string vazia para não poluir o texto
  if (codePoint >= 0xE000 && codePoint <= 0xF8FF) return ''
  return String.fromCodePoint(codePoint)
}

const merge = (...styles: RunStyle[]): RunStyle => Object.assign({}, ...styles.map(s => {
  const o: RunStyle = {}
  for (const [k, v] of Object.entries(s)) if (v !== undefined) (o as any)[k] = v
  return o
}))

// ─── Estilos (styles.xml) com herança basedOn ────────────────────────────────

interface StyleDef { rPr: RunStyle; align?: Align; basedOn?: string; numId?: string; ilvl?: number; border?: 'bottom' | 'box'; spacing?: Spacing; indentMm?: number; firstLineMm?: number }

class StyleBook {
  defaults: RunStyle = {}
  paraDefaults: Spacing = {}
  defs = new Map<string, StyleDef>()
  defaultParaStyle?: string

  constructor(stylesDoc: Document | null, theme?: ThemeFonts) {
    if (!stylesDoc) return
    const root = stylesDoc.documentElement
    const docDefaults = kid(root, 'w:docDefaults')
    this.defaults = readRunProps(kid(kid(docDefaults, 'w:rPrDefault'), 'w:rPr'), theme)
    this.paraDefaults = readSpacing(kid(kid(docDefaults, 'w:pPrDefault'), 'w:pPr')) || {}
    for (const st of kids(root, 'w:style')) {
      const id = attr(st, 'w:styleId')
      if (!id) continue
      const pPr = kid(st, 'w:pPr')
      const numPr = kid(pPr, 'w:numPr')
      this.defs.set(id, {
        rPr: readRunProps(kid(st, 'w:rPr'), theme),
        align: mapAlign(attr(kid(pPr, 'w:jc'), 'w:val')),
        basedOn: attr(kid(st, 'w:basedOn'), 'w:val') || undefined,
        numId: attr(kid(numPr, 'w:numId'), 'w:val') || undefined,
        ilvl: numPr ? parseInt(attr(kid(numPr, 'w:ilvl'), 'w:val') || '0', 10) : undefined,
        border: readBorder(pPr),
        spacing: readSpacing(pPr),
        ...readIndent(pPr),
      })
      if (attr(st, 'w:type') === 'paragraph' && attr(st, 'w:default') === '1') {
        this.defaultParaStyle = id
      }
    }
  }

  resolve(id?: string | null): StyleDef {
    const chain: StyleDef[] = []
    const seen = new Set<string>()
    let cur = id || this.defaultParaStyle
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      const d = this.defs.get(cur)
      if (!d) break
      chain.unshift(d)
      cur = d.basedOn
    }
    const out: StyleDef = { rPr: { ...this.defaults }, spacing: { ...this.paraDefaults } }
    for (const d of chain) {
      out.rPr = merge(out.rPr, d.rPr)
      if (d.align) out.align = d.align
      if (d.numId) { out.numId = d.numId; out.ilvl = d.ilvl }
      if (d.border) out.border = d.border
      if (d.spacing) out.spacing = { ...out.spacing, ...d.spacing }
      if (d.indentMm !== undefined) out.indentMm = d.indentMm
      if (d.firstLineMm !== undefined) out.firstLineMm = d.firstLineMm
    }
    return out
  }
}

function mapAlign(v: string | null): Align | undefined {
  if (!v) return undefined
  if (v === 'center') return 'center'
  if (v === 'right' || v === 'end') return 'right'
  if (v === 'both' || v === 'distribute') return 'justify'
  return 'left'
}

/** w:spacing: before/after em twips (÷20 = pt); line ÷240 = múltiplo (auto) ou ÷20 = pt (exact/atLeast) */
function readSpacing(pPr: XmlEl | null): Spacing | undefined {
  const sp = kid(pPr, 'w:spacing')
  if (!sp) return undefined
  const out: Spacing = {}
  const n = (a: string) => { const v = attr(sp, a); return v === null ? undefined : parseInt(v, 10) }
  const before = n('w:before'), after = n('w:after'), line = n('w:line')
  if (before !== undefined && attr(sp, 'w:beforeAutospacing') !== '1') out.beforePt = before / 20
  if (after !== undefined && attr(sp, 'w:afterAutospacing') !== '1') out.afterPt = after / 20
  if (line !== undefined) {
    const rule = attr(sp, 'w:lineRule') || 'auto'
    if (rule === 'auto') out.lineMultiple = Math.round((line / 240) * 100) / 100
    else out.linePt = line / 20
  }
  return out
}

function readIndent(pPr: XmlEl | null): { indentMm?: number; firstLineMm?: number } {
  const ind = kid(pPr, 'w:ind')
  if (!ind) return {}
  const mm = (v: string | null) => (v === null ? undefined : Math.round((parseInt(v, 10) / TWIP_PER_MM) * 10) / 10)
  const left = mm(attr(ind, 'w:left') ?? attr(ind, 'w:start'))
  const hanging = mm(attr(ind, 'w:hanging'))
  const first = mm(attr(ind, 'w:firstLine'))
  return { indentMm: left, firstLineMm: hanging !== undefined ? -hanging : first }
}

function readBorder(pPr: XmlEl | null): 'bottom' | 'box' | undefined {
  const bdr = kid(pPr, 'w:pBdr')
  if (!bdr) return undefined
  const has = (n: string) => { const e = kid(bdr, n); return !!e && attr(e, 'w:val') !== 'nil' && attr(e, 'w:val') !== 'none' }
  if (has('w:top') && has('w:bottom') && has('w:left') && has('w:right')) return 'box'
  if (has('w:bottom')) return 'bottom'
  return undefined
}

// ─── Numeração (numbering.xml) ──────────────────────────────────────────────

interface LvlDef { numFmt: string; lvlText: string; start: number; rPr: RunStyle; indent: { indentMm?: number; firstLineMm?: number } }

class Numbering {
  private numToAbs = new Map<string, string>()
  private abs = new Map<string, Map<number, LvlDef>>()
  private counters = new Map<string, number[]>() // por abstractNum (ou por num, quando há startOverride)
  /** numId → nível → início forçado (w:lvlOverride/w:startOverride) */
  private startOv = new Map<string, Map<number, number>>()

  constructor(doc: Document | null, theme?: ThemeFonts) {
    if (!doc) return
    const root = doc.documentElement
    for (const a of kids(root, 'w:abstractNum')) {
      const id = attr(a, 'w:abstractNumId')!
      const lvls = new Map<number, LvlDef>()
      for (const l of kids(a, 'w:lvl')) {
        lvls.set(parseInt(attr(l, 'w:ilvl') || '0', 10), {
          numFmt: attr(kid(l, 'w:numFmt'), 'w:val') || 'decimal',
          lvlText: attr(kid(l, 'w:lvlText'), 'w:val') || '%1.',
          start: parseInt(attr(kid(l, 'w:start'), 'w:val') || '1', 10),
          rPr: readRunProps(kid(l, 'w:rPr'), theme),
          indent: readIndent(kid(l, 'w:pPr')),
        })
      }
      this.abs.set(id, lvls)
    }
    for (const n of kids(root, 'w:num')) {
      const numId = attr(n, 'w:numId')!
      this.numToAbs.set(numId, attr(kid(n, 'w:abstractNumId'), 'w:val')!)
      for (const o of kids(n, 'w:lvlOverride')) {
        const so = kid(o, 'w:startOverride')
        if (!so) continue
        const m = this.startOv.get(numId) || new Map<number, number>()
        m.set(parseInt(attr(o, 'w:ilvl') || '0', 10), parseInt(attr(so, 'w:val') || '1', 10))
        this.startOv.set(numId, m)
      }
    }
  }

  indentOf(numId: string, level: number): { indentMm?: number; firstLineMm?: number } {
    const absId = this.numToAbs.get(numId)
    return (absId && this.abs.get(absId)?.get(level)?.indent) || {}
  }

  next(numId: string, level: number): ListInfo | undefined {
    if (numId === '0') return undefined
    const absId = this.numToAbs.get(numId)
    const lvls = absId ? this.abs.get(absId) : undefined
    const def = lvls?.get(level)
    if (!absId || !lvls || !def) return { numId, level, label: '', format: 'decimal' }
    // Com startOverride, a lista (numId) tem contador próprio que começa no valor forçado
    const key = this.startOv.has(numId) ? `num:${numId}` : `abs:${absId}`
    const ov = this.startOv.get(numId)
    const ctr = this.counters.get(key) || []
    for (let l = 0; l <= level; l++) if (ctr[l] === undefined) ctr[l] = (ov?.get(l) ?? lvls.get(l)?.start ?? 1) - 1
    ctr[level] += 1
    ctr.length = level + 1 // reinicia níveis mais profundos
    this.counters.set(key, ctr)
    const label = def.numFmt === 'bullet'
      ? '•'
      : def.lvlText.replace(/(%\d)/g, (_m, d) => {
          const l = parseInt(d.slice(1), 10) - 1
          return formatNumber(ctr[l] ?? 1, lvls.get(l)?.numFmt || 'decimal')
        })
    return { numId, level, label, format: def.numFmt, labelStyle: def.rPr }
  }
}

function formatNumber(n: number, fmt: string): string {
  switch (fmt) {
    case 'lowerLetter': return String.fromCharCode(96 + ((n - 1) % 26) + 1)
    case 'upperLetter': return String.fromCharCode(64 + ((n - 1) % 26) + 1)
    case 'lowerRoman': return toRoman(n).toLowerCase()
    case 'upperRoman': return toRoman(n)
    case 'decimalZero': return String(n).padStart(2, '0')
    default: return String(n)
  }
}
function toRoman(n: number): string {
  const map: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let s = ''
  for (const [v, r] of map) while (n >= v) { s += r; n -= v }
  return s
}

// ─── Parser principal ───────────────────────────────────────────────────────

interface Ctx {
  theme: ThemeFonts
  styles: StyleBook
  numbering: Numbering
  rels: Map<string, string>
  media: Map<string, string> // caminho → dataUrl
}

const BLANK_LINE_RE = /^[\s_.…\-]*$/
const UNDERSCORE_RUN_RE = /_{6,}/

export async function parseDocx(input: ArrayBuffer | Blob | File, opts: DocxParseOptions = {}): Promise<DocumentIR> {
  const buf = typeof (input as Blob).arrayBuffer === 'function' ? await (input as Blob).arrayBuffer() : (input as ArrayBuffer)
  const JSZipMod: any = await import('jszip')
  const JSZip = JSZipMod.default || JSZipMod
  const zip = await JSZip.loadAsync(buf)
  const parser = opts.domParser || new DOMParser()
  const readXml = async (path: string): Promise<Document | null> => {
    const f = zip.file(path)
    if (!f) return null
    return parser.parseFromString(await f.async('text'), 'application/xml')
  }

  const doc = await readXml('word/document.xml')
  if (!doc) throw new Error('Arquivo .docx sem word/document.xml (não é um .docx válido; .doc antigo precisa ser convertido)')

  const rels = new Map<string, string>()
  const relsDoc = await readXml('word/_rels/document.xml.rels')
  if (relsDoc) for (const r of descendants(relsDoc.documentElement, 'Relationship')) {
    rels.set(attr(r, 'Id')!, attr(r, 'Target')!)
  }

  const media = new Map<string, string>()
  if (!opts.skipImages) {
    for (const name of Object.keys(zip.files).filter((n: string) => /^word\/media\//i.test(n))) {
      const ext = name.split('.').pop()!.toLowerCase()
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : ext === 'gif' ? 'image/gif' : 'image/png'
      media.set(name.replace(/^word\//, ''), `data:${mime};base64,${await zip.file(name)!.async('base64')}`)
    }
  }

  const theme = parseTheme(await readXml('word/theme/theme1.xml'))
  const ctx: Ctx = {
    theme,
    styles: new StyleBook(await readXml('word/styles.xml'), theme),
    numbering: new Numbering(await readXml('word/numbering.xml'), theme),
    rels,
    media,
  }

  const body = kid(doc.documentElement, 'w:body')!
  const sectPr = kid(body, 'w:sectPr')
  const page = readPage(sectPr)

  const partBlocks = async (type: 'w:headerReference' | 'w:footerReference'): Promise<Block[]> => {
    const ref = kids(sectPr, type).find(r => attr(r, 'w:type') === 'default') || kids(sectPr, type)[0]
    const target = ref ? rels.get(attr(ref, 'r:id') || '') : undefined
    if (!target) return []
    const partDoc = await readXml(`word/${target.replace(/^\/?word\//, '')}`)
    if (!partDoc) return []
    const partRelsDoc = await readXml(`word/_rels/${target.split('/').pop()}.rels`)
    const partCtx: Ctx = { ...ctx, rels: new Map(rels) }
    if (partRelsDoc) for (const r of descendants(partRelsDoc.documentElement, 'Relationship')) partCtx.rels.set(attr(r, 'Id')!, attr(r, 'Target')!)
    return collapseBlankLines(readBlocks(partDoc.documentElement, partCtx))
  }

  return {
    source: 'docx',
    page,
    defaults: { fontFamily: ctx.styles.defaults.fontFamily, sizePt: ctx.styles.defaults.sizePt },
    headerPart: await partBlocks('w:headerReference'),
    body: collapseBlankLines(readBlocks(body, ctx)),
    footerPart: await partBlocks('w:footerReference'),
  }
}

function readPage(sectPr: XmlEl | null): PageSetup {
  const page: PageSetup = JSON.parse(JSON.stringify(DEFAULT_PAGE))
  const pgSz = kid(sectPr, 'w:pgSz')
  if (pgSz) {
    const w = parseInt(attr(pgSz, 'w:w') || '0', 10) / TWIP_PER_MM
    const h = parseInt(attr(pgSz, 'w:h') || '0', 10) / TWIP_PER_MM
    const shortSide = Math.min(w, h)
    page.size = Math.abs(shortSide - 216) < 3 ? (Math.max(w, h) > 300 ? 'Legal' : 'Letter') : 'A4'
    page.orientation = attr(pgSz, 'w:orient') === 'landscape' || w > h ? 'landscape' : 'portrait'
  }
  const mar = kid(sectPr, 'w:pgMar')
  if (mar) {
    const mm = (n: string) => Math.round((parseInt(attr(mar, n) || '0', 10) / TWIP_PER_MM) * 10) / 10
    page.marginsMm = { top: mm('w:top'), right: mm('w:right'), bottom: mm('w:bottom'), left: mm('w:left') }
  }
  if (parseInt(attr(kid(sectPr, 'w:cols'), 'w:num') || '1', 10) >= 2) page.columns = 2
  return page
}

function readBlocks(container: XmlEl, ctx: Ctx): Block[] {
  const out: Block[] = []
  for (const el of kids(container)) {
    if (el.nodeName === 'w:p') out.push(...readParagraph(el, ctx))
    else if (el.nodeName === 'w:tbl') out.push(readTable(el, ctx))
    else if (el.nodeName === 'w:sdt') out.push(...readBlocks(kid(el, 'w:sdtContent')!, ctx))
    else if (el.nodeName === 'w:customXml' || el.nodeName === 'w:ins') out.push(...readBlocks(el, ctx))
  }
  return out
}

/**
 * w:ptab (tab com posição absoluta / alinhada) → marcador especial \x02 que o
 * segmentador e o renderizador convertem em espaçador elástico (flex gap).
 * O caractere \x02 é STX (Start of Text) — nunca aparece em texto real.
 */
const PTAB_MARKER = '\x02'

function readParagraph(p: XmlEl, ctx: Ctx): Block[] {
  const pPr = kid(p, 'w:pPr')
  const styleId = attr(kid(pPr, 'w:pStyle'), 'w:val')
  const style = ctx.styles.resolve(styleId)
  // A marca de parágrafo (pPr/rPr) só formata a marca e a numeração, NÃO o texto dos runs
  const markStyle = readRunProps(kid(pPr, 'w:rPr'), ctx.theme)
  const paraRunStyle = style.rPr
  const align = mapAlign(attr(kid(pPr, 'w:jc'), 'w:val')) || style.align
  const border = readBorder(pPr) || style.border
  const hasUnderscoreLeader = kids(kid(pPr, 'w:tabs'), 'w:tab').some(t => attr(t, 'w:leader') === 'underscore')
  const ownSpacing = readSpacing(pPr)
  const spacing: Spacing = { ...style.spacing, ...ownSpacing }

  const runs: TextRun[] = []
  const images: ImageBlock[] = []
  // Todos os w:r do parágrafo, inclusive dentro de hyperlink/ins/smartTag, exceto texto excluído (w:del)
  for (const r of descendants(p, 'w:r')) {
    if (r.parentNode && (r.parentNode as XmlEl).nodeName === 'w:del') continue
    if (inFallback(r)) continue // mc:Fallback repete o mesmo conteúdo (caixas de texto) → não duplicar
    const rs = merge(paraRunStyle, ctx.styles.resolve(attr(kid(kid(r, 'w:rPr'), 'w:rStyle'), 'w:val')).rPr, readRunProps(kid(r, 'w:rPr'), ctx.theme))
    let text = ''
    for (const c of kids(r)) {
      if (c.nodeName === 'w:t') text += c.textContent || ''
      else if (c.nodeName === 'w:tab') text += '\t'
      else if (c.nodeName === 'w:br' || c.nodeName === 'w:cr') text += '\n'
      else if (c.nodeName === 'w:noBreakHyphen') text += '-'
      else if (c.nodeName === 'w:ptab') text += PTAB_MARKER  // tab posicional → espaçador elástico
      else if (c.nodeName === 'w:sym') text += symChar(c)
      else if (c.nodeName === 'w:softHyphen') text += ''
      else if (c.nodeName === 'w:drawing' || c.nodeName === 'w:pict') {
        const img = readImage(c, ctx)
        if (img) images.push({ ...img, align })
      }
    }
    if (text) {
      const last = runs[runs.length - 1]
      if (last && sameStyle(last, rs)) last.text += text
      else runs.push({ text, ...rs })
    }
  }

  const numPr = kid(pPr, 'w:numPr')
  const numId = attr(kid(numPr, 'w:numId'), 'w:val') || style.numId
  const ilvl = numPr ? parseInt(attr(kid(numPr, 'w:ilvl'), 'w:val') || '0', 10) : (style.ilvl ?? 0)
  const text = runs.map(r => r.text).join('')

  // Linha de resposta: parágrafo vazio/sublinhados com borda inferior, só "____", ou tab com leader
  if (!numId && images.length === 0 && BLANK_LINE_RE.test(text)) {
    if (border === 'bottom' || UNDERSCORE_RUN_RE.test(text) || (hasUnderscoreLeader && text.includes('\t'))) {
      return [{ type: 'blank_lines', count: Math.max(1, text.split('\n').filter(l => UNDERSCORE_RUN_RE.test(l)).length) }]
    }
  }

  const list = numId ? ctx.numbering.next(numId, ilvl) : undefined
  // recuo: estilo < nível da lista < parágrafo
  const ownIndent = readIndent(pPr)
  const lvlIndent = numId ? ctx.numbering.indentOf(numId, ilvl) : {}
  const indentMm = ownIndent.indentMm ?? lvlIndent.indentMm ?? style.indentMm
  const firstLineMm = ownIndent.firstLineMm ?? lvlIndent.firstLineMm ?? style.firstLineMm
  // rótulo automático herda a marca de parágrafo + rPr do nível
  if (list) list.labelStyle = merge(style.rPr, markStyle, list.labelStyle || {})
  const blocks: Block[] = [...images]
  if (text.trim() || list) {
    blocks.push({ type: 'paragraph', runs, align, list, border, styleId: styleId || undefined, indentMm, firstLineMm, spacing: Object.keys(spacing).length ? spacing : undefined })
  } else if (images.length === 0) {
    blocks.push({ type: 'paragraph', runs: [], align }) // parágrafo vazio (espaçamento)
  }
  return blocks
}

/** Run dentro de mc:Fallback (cópia de compatibilidade de caixa de texto/imagem) */
const inFallback = (el: Node): boolean => {
  for (let n: Node | null = el.parentNode; n; n = n.parentNode) if ((n as XmlEl).nodeName === 'mc:Fallback') return true
  return false
}

const sameStyle = (a: RunStyle, b: RunStyle) =>
  !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline &&
  a.fontFamily === b.fontFamily && a.sizePt === b.sizePt && a.color === b.color &&
  !!a.caps === !!b.caps && !!a.smallCaps === !!b.smallCaps && a.vertAlign === b.vertAlign && a.highlight === b.highlight

function readImage(el: XmlEl, ctx: Ctx): ImageBlock | null {
  const blip = descendants(el, 'a:blip')[0] || descendants(el, 'v:imagedata')[0]
  const rid = attr(blip, 'r:embed') || attr(blip, 'r:id')
  const target = rid ? ctx.rels.get(rid) : undefined
  const ext = descendants(el, 'wp:extent')[0]
  return {
    type: 'image',
    dataUrl: target ? ctx.media.get(target.replace(/^\/?word\//, '')) : undefined,
    widthMm: ext ? Math.round(parseInt(attr(ext, 'cx') || '0', 10) / EMU_PER_MM) : undefined,
    heightMm: ext ? Math.round(parseInt(attr(ext, 'cy') || '0', 10) / EMU_PER_MM) : undefined,
  }
}

function readTable(tbl: XmlEl, ctx: Ctx): TableBlock {
  const tblPr = kid(tbl, 'w:tblPr')
  const borders = kid(tblPr, 'w:tblBorders')
  const tblStyle = attr(kid(tblPr, 'w:tblStyle'), 'w:val') || ''
  const bordered = /grid|table\s*grid|tabela/i.test(tblStyle) ||
    (!!borders && kids(borders).some(b => !['nil', 'none'].includes(attr(b, 'w:val') || '')))

  const gridCols = kids(kid(tbl, 'w:tblGrid'), 'w:gridCol').map(g => parseInt(attr(g, 'w:w') || '0', 10))
  const totalW = gridCols.reduce((a, b) => a + b, 0) || 1

  // Primeiro passo: células com posição de coluna, para resolver vMerge
  type Raw = { cell: TableCell; col: number; vMerge: 'restart' | 'continue' | null }
  const rawRows: Raw[][] = []
  for (const tr of kids(tbl, 'w:tr')) {
    const row: Raw[] = []
    let col = 0
    for (const tc of kids(tr, 'w:tc')) {
      const tcPr = kid(tc, 'w:tcPr')
      const span = parseInt(attr(kid(tcPr, 'w:gridSpan'), 'w:val') || '1', 10)
      const vm = kid(tcPr, 'w:vMerge')
      const shd = attr(kid(tcPr, 'w:shd'), 'w:fill')
      const w = gridCols.slice(col, col + span).reduce((a, b) => a + b, 0)
      row.push({
        cell: {
          blocks: collapseBlankLines(readBlocks(tc, ctx)),
          colSpan: span,
          rowSpan: 1,
          shaded: !!shd && shd !== 'auto' && shd.toUpperCase() !== 'FFFFFF',
          widthPct: gridCols.length ? Math.round((w / totalW) * 1000) / 10 : undefined,
        },
        col,
        vMerge: vm ? (attr(vm, 'w:val') === 'restart' ? 'restart' : 'continue') : null,
      })
      col += span
    }
    rawRows.push(row)
  }

  // Segundo passo: soma rowSpan na célula "restart" e remove as "continue"
  for (let r = 0; r < rawRows.length; r++) {
    for (const raw of rawRows[r]) {
      if (raw.vMerge !== 'restart') continue
      for (let rr = r + 1; rr < rawRows.length; rr++) {
        const below = rawRows[rr].find(x => x.col === raw.col)
        if (!below || below.vMerge !== 'continue') break
        raw.cell.rowSpan += 1
      }
    }
  }
  const rows = rawRows.map(row => row.filter(x => x.vMerge !== 'continue').map(x => x.cell))
  return { type: 'table', rows, bordered }
}

/** Junta linhas de resposta consecutivas num só bloco com contagem */
export function collapseBlankLines(blocks: Block[]): Block[] {
  const out: Block[] = []
  for (const b of blocks) {
    const prev = out[out.length - 1]
    if (b.type === 'blank_lines' && prev?.type === 'blank_lines') prev.count += b.count
    else out.push(b)
  }
  return out
}

/** Exportado para uso no segmenter e no render: marca de ptab no texto */
export { PTAB_MARKER }
