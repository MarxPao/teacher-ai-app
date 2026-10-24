/**
 * lib/documentFormatTemplates.ts
 * Motor Central de "Formatos de Arquivo & Padrão de Diagramação Escolar"
 *
 * Permite cadastrar, importar, vincular por escola e aplicar modelos completos de
 * formatação (margens, 1 ou 2 colunas, tipografia, estilo de cabeçalho, padrão de
 * numeração de questões "QUESTÃO 01" vs "1.", estilo de alternativas "(A)" vs "A)",
 * modo P&B de gráfica/xerox, rodapé e assinatura de coordenação) em Provas,
 * Listas de Exercícios, Sequências Didáticas e Documentos em Geral.
 */

import type { ImportedExam, ImportWarning, SchoolTemplate } from '@/lib/templateImport/template'

export type DocumentFormatCategory =
  | 'all'
  | 'exam'
  | 'worksheet'
  | 'didactic_sequence'
  | 'general_document'

export type HeaderLayoutStyle =
  | 'boxed_grid'          // Grade tabelada clássica com bordas fechadas (padrão colégios tradicionais)
  | 'academic_classic'    // Título centralizado com linhas divisórias duplas e subtítulo
  | 'minimal_banner'      // Faixa superior compacta (ideal para listas de exercícios e 2 colunas)
  | 'institutional_clean' // Cabeçalho executivo limpo (ideal para Sequência Didática e Coordenação)

export type QuestionNumberFormat =
  | 'questao_padded' // "QUESTÃO 01" (caixa alta destacada estilo ENEM / Colégios)
  | 'badge_number'   // Badge colorido/sólido "1."
  | 'numeric_dot'    // "1." simples e direto
  | 'question_en'    // "Question 1." (internacional / bilíngue)

export type OptionLabelFormat = 'A)' | '(A)' | '[A]' | 'a)'

/**
 * Bloco estrutural transcrito do arquivo modelo (o que o modelo realmente contém:
 * texto-base, enunciado de seção, itens "( )" de Verdadeiro/Falso, título de questão com pontuação...).
 */
export interface TranscribedBlock {
  kind: 'passage' | 'section_title' | 'true_false_list' | 'numbered_list' | 'question_heading' | 'paragraph'
  text?: string
  items?: string[]
  /** question_heading: número e pontuação lidos do próprio modelo */
  number?: number
  points?: string
  pointsLabel?: string
}

export interface SchoolDocumentFormat {
  id: string
  name: string
  description: string
  schoolName: string // Nome da escola vinculada ou "Geral"
  targetCategory: DocumentFormatCategory
  isDefaultForSchool?: boolean

  // Página & Layout
  paperSize: 'A4' | 'Letter'
  orientation: 'portrait' | 'landscape'
  marginsMm: {
    top: number
    right: number
    bottom: number
    left: number
  }
  columns: 1 | 2
  columnGapMm: number
  showColumnDivider: boolean

  // Tipografia
  fontFamily: string
  fontSizePt: number
  lineHeight: number
  textAlign: 'justify' | 'left'

  // Identidade Visual & Cabeçalho
  headerStyle: HeaderLayoutStyle
  primaryColor: string // Ex: '#000000' para P&B gráfica, '#8b5e3c', '#1e3a8a'
  blackAndWhitePrintMode: boolean
  officialSchoolSubtitle?: string
  defaultInstructions: string

  // Formatação de Questões & Corpo
  questionNumberStyle: QuestionNumberFormat
  optionLabelStyle: OptionLabelFormat
  discursiveLinesCount: number
  showPointsPerQuestion: boolean
  compactQuestionSpacing: boolean

  // Rodapé & Assinaturas
  footerText: string
  showSignatureLine: boolean
  signatureLabels?: [string, string]
  logoUrl?: string

  // Transcrição fiel do modelo importado (ausente nos formatos padrão)
  /** Idioma do modelo: define rótulos, instruções e rodapé padrão */
  language?: 'pt' | 'en'
  /** Rótulo de pontuação do modelo: "marks", "pontos", "pt"... */
  pointsLabel?: string
  /** Separador entre "Question 2" e o título da questão (ex.: " - ") */
  questionHeadingSeparator?: string
  /** Estrutura real do modelo, usada na pré-visualização no lugar do texto genérico */
  sampleBlocks?: TranscribedBlock[]
  /** Modelo estrutural v2 (cabeçalho célula a célula, estilos por papel). Quando existe, a exportação usa ele. */
  schoolTemplate?: SchoolTemplate
  /** Questões do arquivo importado, para pré-visualização fiel */
  sampleContent?: ImportedExam
  importWarnings?: ImportWarning[]
  importConfidence?: number
}

const STORAGE_KEY = 'teacher_document_formats_v1'
const ACTIVE_FORMAT_KEY = 'teacher_active_document_format_id'

// Fallback em memória para testes (Node/Vitest) e ambientes SSR
let memoryFormats: SchoolDocumentFormat[] | null = null
let memoryActiveFormatId: string | null = null

export const DEFAULT_DOCUMENT_FORMATS: SchoolDocumentFormat[] = [
  {
    id: 'fmt_machado_oficial',
    name: 'Padrão Colégio Machado Sobrinho (Prova Oficial)',
    description: 'Grade de cabeçalho fechada em P&B para gráfica, Times New Roman 11pt justificado, numeração "QUESTÃO 01" e alternativas "A)".',
    schoolName: 'Machado Sobrinho',
    targetCategory: 'all',
    isDefaultForSchool: true,
    paperSize: 'A4',
    orientation: 'portrait',
    marginsMm: { top: 15, right: 15, bottom: 15, left: 15 },
    columns: 1,
    columnGapMm: 8,
    showColumnDivider: false,
    fontFamily: "'Times New Roman', Times, serif",
    fontSizePt: 11,
    lineHeight: 1.45,
    textAlign: 'justify',
    headerStyle: 'boxed_grid',
    primaryColor: '#000000',
    blackAndWhitePrintMode: true,
    officialSchoolSubtitle: 'COLÉGIO MACHADO SOBRINHO — EDUCAÇÃO BÁSICA',
    defaultInstructions:
      '1. Leia atentamente todas as questões antes de responder.\n2. Utilize caneta esferográfica de tinta azul ou preta.\n3. Questões objetivas rasuradas serão anuladas.\n4. Responda às questões discursivas dentro do espaço delimitado.',
    questionNumberStyle: 'questao_padded',
    optionLabelStyle: 'A)',
    discursiveLinesCount: 4,
    showPointsPerQuestion: true,
    compactQuestionSpacing: false,
    footerText: 'Colégio Machado Sobrinho • Juiz de Fora / MG • Avaliação Oficial',
    showSignatureLine: false,
    signatureLabels: ['Professor(a) Responsável', 'Coordenação Pedagógica']
  },
  {
    id: 'fmt_santacatarina_oficial',
    name: 'Padrão Rede Santa Catarina (Avaliação & Atividades)',
    description: 'Layout acadêmico clássico em Arial 11pt, cabeçalho institucional com lema, numeração em badge e alternativas "(A)".',
    schoolName: 'Rede Santa Catarina',
    targetCategory: 'all',
    isDefaultForSchool: true,
    paperSize: 'A4',
    orientation: 'portrait',
    marginsMm: { top: 18, right: 15, bottom: 18, left: 15 },
    columns: 1,
    columnGapMm: 8,
    showColumnDivider: false,
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSizePt: 11,
    lineHeight: 1.5,
    textAlign: 'justify',
    headerStyle: 'academic_classic',
    primaryColor: '#1e3a8a',
    blackAndWhitePrintMode: false,
    officialSchoolSubtitle: 'REDE SANTA CATARINA — AMOR, DISCIPLINA E SABER',
    defaultInstructions:
      '1. Preencha seu nome completo, número e turma com letra legível.\n2. Analise os textos de apoio com atenção antes de assinalar sua resposta.\n3. Não é permitido o uso de corretivo líquido ou aparelhos eletrônicos.',
    questionNumberStyle: 'badge_number',
    optionLabelStyle: '(A)',
    discursiveLinesCount: 4,
    showPointsPerQuestion: true,
    compactQuestionSpacing: false,
    footerText: 'Rede Santa Catarina • Educação Básica • Documento Pedagógico Oficial',
    showSignatureLine: false,
    signatureLabels: ['Professor(a)', 'Supervisão Escolar']
  },
  {
    id: 'fmt_anglo_enem_2col',
    name: 'Simulado Sistema Anglo / ENEM (2 Colunas Compacto)',
    description: 'Diagramação em 2 colunas com linha divisória central, estilo vestibular/ENEM, aproveitamento máximo de página para provas longas.',
    schoolName: 'Colégio Anglo',
    targetCategory: 'exam',
    isDefaultForSchool: true,
    paperSize: 'A4',
    orientation: 'portrait',
    marginsMm: { top: 12, right: 12, bottom: 12, left: 12 },
    columns: 2,
    columnGapMm: 7,
    showColumnDivider: true,
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSizePt: 10,
    lineHeight: 1.35,
    textAlign: 'justify',
    headerStyle: 'minimal_banner',
    primaryColor: '#0f172a',
    blackAndWhitePrintMode: true,
    officialSchoolSubtitle: 'SISTEMA ANGLO DE ENSINO — SIMULADO & AVALIAÇÃO SOMATIVA',
    defaultInstructions:
      '1. Confira o número de questões deste caderno.\n2. Para cada questão objetiva, existe apenas UMA alternativa correta.\n3. Transfira suas respostas para a Folha de Respostas (OMR) com caneta preta.',
    questionNumberStyle: 'questao_padded',
    optionLabelStyle: '(A)',
    discursiveLinesCount: 3,
    showPointsPerQuestion: true,
    compactQuestionSpacing: true,
    footerText: 'Sistema Anglo • Caderno de Questões Padronizado',
    showSignatureLine: false,
    signatureLabels: ['Docente', 'Coordenação de Área']
  },
  {
    id: 'fmt_cambridge_bilingual',
    name: 'Cambridge Assessment / International English Paper',
    description: 'Padrão internacional bilíngue em Georgia 11pt, cabeçalho Candidate Name/Number, enunciados "Question 1" e alternativas "A)".',
    schoolName: 'Colegio Oxford',
    targetCategory: 'all',
    isDefaultForSchool: true,
    paperSize: 'A4',
    orientation: 'portrait',
    marginsMm: { top: 16, right: 16, bottom: 16, left: 16 },
    columns: 1,
    columnGapMm: 8,
    showColumnDivider: false,
    fontFamily: 'Georgia, serif',
    fontSizePt: 11,
    lineHeight: 1.5,
    textAlign: 'left',
    headerStyle: 'boxed_grid',
    primaryColor: '#2c1a0e',
    blackAndWhitePrintMode: false,
    officialSchoolSubtitle: 'CAMBRIDGE ENGLISH PREPARATION CENTRE — OFFICIAL ASSESSMENT',
    defaultInstructions:
      '1. Write your name, class group and date in the spaces at the top of this page.\n2. Answer all questions clearly in blue or black ink.\n3. Read the context texts carefully before answering.',
    questionNumberStyle: 'question_en',
    optionLabelStyle: 'A)',
    discursiveLinesCount: 4,
    showPointsPerQuestion: true,
    compactQuestionSpacing: false,
    footerText: 'English Language Department • Official Assessment Paper',
    showSignatureLine: false,
    signatureLabels: ['Examiner / Teacher', 'Academic Coordinator']
  },
  {
    id: 'fmt_sequencia_coordenacao_abnt',
    name: 'Padrão Coordenação — Sequência Didática & Documentos Gerais (ABNT)',
    description: 'Formato institucional para entrega de Sequências Didáticas, Planos de Ensino, Gabaritos e Justificativas Pedagógicas com bloco de assinatura.',
    schoolName: 'Geral',
    targetCategory: 'didactic_sequence',
    isDefaultForSchool: false,
    paperSize: 'A4',
    orientation: 'portrait',
    marginsMm: { top: 20, right: 18, bottom: 20, left: 20 },
    columns: 1,
    columnGapMm: 8,
    showColumnDivider: false,
    fontFamily: "'Times New Roman', Times, serif",
    fontSizePt: 11,
    lineHeight: 1.5,
    textAlign: 'justify',
    headerStyle: 'institutional_clean',
    primaryColor: '#5c3a21',
    blackAndWhitePrintMode: false,
    officialSchoolSubtitle: 'DEPARTAMENTO PEDAGÓGICO — PLANEJAMENTO E SEQUÊNCIA CURRICULAR',
    defaultInstructions:
      'Documento técnico-pedagógico para registro de planejamento curricular, acompanhamento de ritmo (Previsto vs. Realizado) e validação junto à Coordenação Pedagógica.',
    questionNumberStyle: 'numeric_dot',
    optionLabelStyle: 'A)',
    discursiveLinesCount: 3,
    showPointsPerQuestion: true,
    compactQuestionSpacing: false,
    footerText: 'Coordenação Pedagógica • Registro Oficial de Planejamento Docente',
    showSignatureLine: true,
    signatureLabels: ['Assinatura do(a) Professor(a)', 'Visto da Coordenação Pedagógica']
  }
]

/**
 * Detecta o nome de um colégio/escola a partir do cabeçalho ou das primeiras linhas de texto.
 */
export function detectSchoolNameFromText(text: string, fileName?: string): string | null {
  const head = (text || '').slice(0, 2000)

  // 1. Procura termos institucionais comuns no cabeçalho
  const m = head.match(
    /(?:col[ée]gio|escola(?:\s+estadual|\s+municipal|\s+particular)?|instituto(?:\s+federal|\s+de\s+educa[çc][ãa]o)?|centro\s+educacional|rede\s+de\s+ensino|educand[áa]rio|liceu)\s+([A-Za-zÀ-ÿ0-9\s'’.\-]{3,50})/i
  )
  if (m && m[0]) {
    const raw = m[0].split('\n')[0].replace(/[;:,—–\-].*$/, '').trim()
    if (raw.length >= 6 && raw.length <= 60 && !/^(escola|col[ée]gio)$/i.test(raw)) {
      return raw.replace(/\s+/g, ' ')
    }
  }

  // 2. Procura no nome do arquivo se há menção explícita
  if (fileName) {
    const fnMatch = fileName.match(/(?:col[ée]gio|escola|instituto|rede)[_\s-]+([A-Za-zÀ-ÿ0-9\s'’-]+?)(?=[_\s.-]|$)/i)
    if (fnMatch && fnMatch[0]) {
      return fnMatch[0].replace(/[_-]+/g, ' ').trim()
    }
  }

  return null
}

/**
 * Lista todos os formatos de arquivo salvos (mesclando os personalizados do professor com os padrões).
 * Os formatos salvos pelo professor têm precedência de ordem e configuração.
 */
export function getDocumentFormats(): SchoolDocumentFormat[] {
  let parsed: SchoolDocumentFormat[] | null = memoryFormats
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const json = JSON.parse(raw)
        if (Array.isArray(json) && json.length > 0) {
          parsed = json
        }
      }
    } catch {}
  }

  if (!parsed || parsed.length === 0) return DEFAULT_DOCUMENT_FORMATS

  const result: SchoolDocumentFormat[] = []
  const seenIds = new Set<string>()

  // Formatos salvos pelo professor têm prioridade
  parsed.forEach((fmt: SchoolDocumentFormat) => {
    if (fmt && fmt.id) {
      result.push(fmt)
      seenIds.add(fmt.id)
    }
  })

  // Adiciona formatos padrão não presentes na lista salva
  DEFAULT_DOCUMENT_FORMATS.forEach(fmt => {
    if (!seenIds.has(fmt.id)) {
      result.push(fmt)
      seenIds.add(fmt.id)
    }
  })

  return result
}

/**
 * Salva a lista de formatos de arquivo no localStorage e sincroniza com Supabase.
 */
export function saveDocumentFormats(formats: SchoolDocumentFormat[]): void {
  memoryFormats = formats
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(formats))
    } catch {}
  }
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new Event('storage'))
      window.dispatchEvent(new CustomEvent('teacher:formats-updated'))
    } catch {}
  }
  import('@/lib/supabaseClient')
    .then(({ syncToSupabase }) => {
      syncToSupabase({ [STORAGE_KEY]: formats })
    })
    .catch(() => {})
}

/**
 * Busca um formato pelo ID ou retorna o padrão da escola / global.
 */
export function getDocumentFormatById(formatId?: string | null, schoolName?: string, category?: DocumentFormatCategory): SchoolDocumentFormat {
  const all = getDocumentFormats()
  if (formatId) {
    const found = all.find(f => f.id === formatId)
    if (found) return found
  }
  return getDefaultFormatForSchool(schoolName, category)
}

/**
 * Encontra automaticamente o formato padrão vinculado a uma escola específica e categoria de documento.
 */
export function getDefaultFormatForSchool(
  schoolName?: string,
  category: DocumentFormatCategory = 'all'
): SchoolDocumentFormat {
  const all = getDocumentFormats()
  const normSchool = (schoolName || '').trim().toLowerCase()

  // 1. Se houver formato ativo explicitamente salvo pelo professor
  let activeId: string | null = memoryActiveFormatId
  if (typeof localStorage !== 'undefined') {
    try {
      activeId = localStorage.getItem(ACTIVE_FORMAT_KEY) || activeId
    } catch {}
  }
  const activeFmt = activeId ? all.find(f => f.id === activeId) : undefined

  if (normSchool && normSchool !== 'todas as escolas' && normSchool !== 'geral') {
    // 2. Busca match da escola + categoria
    const schoolMatches = all.filter(f => {
      const s = (f.schoolName || '').trim().toLowerCase()
      return s && (normSchool.includes(s) || s.includes(normSchool))
    })

    if (schoolMatches.length > 0) {
      // Se o formato ativo pertencer a esta escola, dá prioridade a ele
      if (activeFmt && schoolMatches.some(f => f.id === activeFmt.id)) {
        return activeFmt
      }

      const catMatch =
        schoolMatches.find(f => (f.targetCategory === category || f.targetCategory === 'all') && f.isDefaultForSchool) ||
        schoolMatches.find(f => f.isDefaultForSchool) ||
        schoolMatches.find(f => f.targetCategory === category) ||
        schoolMatches[0]
      if (catMatch) return catMatch
    }
  }

  if (category === 'didactic_sequence') {
    const seqFmt = all.find(f => f.targetCategory === 'didactic_sequence')
    if (seqFmt) return seqFmt
  }

  // Se nenhum match específico da escola, usa formato ativo global
  if (activeFmt) return activeFmt

  return all[0] || DEFAULT_DOCUMENT_FORMATS[0]
}

export function setActiveDocumentFormatId(formatId: string): void {
  memoryActiveFormatId = formatId
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(ACTIVE_FORMAT_KEY, formatId)
    } catch {}
  }
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('teacher:formats-updated'))
    } catch {}
  }
}

export interface SampleStructure {
  language: 'pt' | 'en'
  blocks: TranscribedBlock[]
  pointsLabel?: string
  headingSeparator?: string
}

const EN_WORDS = /\b(the|and|of|to|is|are|according|answer|question|write|read|text|which|why|about|with)\b/gi
const PT_WORDS = /\b(o|a|os|as|de|do|da|que|para|com|n[ãa]o|quest[ãa]o|responda|leia|texto|qual|por)\b/gi

export function detectSampleLanguage(text: string): 'pt' | 'en' {
  const sample = (text || '').slice(0, 4000)
  const en = (sample.match(EN_WORDS) || []).length
  const pt = (sample.match(PT_WORDS) || []).length
  return en > pt ? 'en' : 'pt'
}

const HEADING_RE =
  /^(Question|Quest[ãa]o|Exercise|Exerc[íi]cio|Part|Parte)\s*0?(\d+)\s*(?:([-–—:.])\s*)?(.*?)\s*(?:\(\s*(\d+(?:[.,]\d+)?)\s*(marks?|points?|pts?|pontos?|ponto|pt)\s*\))?\s*$/i
const TF_ITEM_RE = /^\s*(?:\d+[.)]\s*)?\(\s*\)\s*(.+)$/
const NUMBERED_RE = /^\s*\d+[.)]\s+(.+)$/

/**
 * Transcreve a ESTRUTURA do arquivo modelo (não só o estilo): título de questão com pontuação,
 * enunciado de seção, itens "( )" de Verdadeiro/Falso, listas numeradas e texto-base.
 */
export function transcribeSampleStructure(text: string): SampleStructure {
  const language = detectSampleLanguage(text)
  const lines = (text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const blocks: TranscribedBlock[] = []
  let pointsLabel: string | undefined
  let headingSeparator: string | undefined

  const lastBlock = () => blocks[blocks.length - 1]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const heading = line.length <= 160 ? line.match(HEADING_RE) : null
    // "Question 2 - ..." / "QUESTÃO 01": exige número logo após a palavra (evita frases comuns)
    if (heading && /^(Question|Quest[ãa]o|Exercise|Exerc[íi]cio|Part|Parte)\s*0?\d+/i.test(line)) {
      const sep = heading[3] ? ` ${heading[3]} ` : ''
      const title = (heading[4] || '').trim()
      if (title && sep && !headingSeparator) headingSeparator = sep
      if (heading[6] && !pointsLabel) pointsLabel = heading[6].toLowerCase()
      blocks.push({
        kind: 'question_heading',
        number: parseInt(heading[2], 10),
        text: title || undefined,
        points: heading[5],
        pointsLabel: heading[6]?.toLowerCase(),
      })
      continue
    }

    const tf = line.match(TF_ITEM_RE)
    if (tf) {
      const prev = lastBlock()
      if (prev && prev.kind === 'true_false_list') prev.items!.push(tf[1].trim())
      else blocks.push({ kind: 'true_false_list', items: [tf[1].trim()] })
      continue
    }

    const numbered = line.match(NUMBERED_RE)
    if (numbered) {
      const prev = lastBlock()
      if (prev && prev.kind === 'numbered_list') prev.items!.push(numbered[1].trim())
      else blocks.push({ kind: 'numbered_list', items: [numbered[1].trim()] })
      continue
    }

    const next = lines[i + 1] || ''
    const introducesItems = TF_ITEM_RE.test(next) || NUMBERED_RE.test(next)
    const isShort = line.length <= 140 && !/[.!?]$/.test(line)
    if (isShort && introducesItems) {
      blocks.push({ kind: 'section_title', text: line })
      continue
    }
    if (/\(\s*T\s*\)\s*(or|ou)\s*\(\s*F\s*\)|true\s+or\s+false|verdadeiro\s+ou\s+falso|\(\s*V\s*\)\s*ou\s*\(\s*F\s*\)/i.test(line) && line.length <= 160) {
      blocks.push({ kind: 'section_title', text: line })
      continue
    }

    blocks.push({ kind: line.length >= 200 ? 'passage' : 'paragraph', text: line })
  }

  return { language, blocks, pointsLabel, headingSeparator }
}

/** "(2,0 marks)" / "(1,0 pt)": usa o rótulo do modelo quando houver, senão o padrão do idioma. */
export function formatPointsLabel(fmt: Pick<SchoolDocumentFormat, 'language' | 'pointsLabel'>, value: number | string): string {
  const raw = typeof value === 'number' ? value.toFixed(1) : String(value)
  const shown = raw.replace('.', ',')
  const label = fmt.pointsLabel || (fmt.language === 'en' ? 'marks' : 'pt')
  return `(${shown} ${label})`
}

/** Título de questão no padrão do modelo: "Question 2 - Título (2,0 marks)" / "QUESTÃO 01". */
export function formatQuestionHeading(
  fmt: Pick<SchoolDocumentFormat, 'questionNumberStyle' | 'questionHeadingSeparator'>,
  num: number,
  title?: string
): string {
  const padded = String(num).padStart(2, '0')
  const base =
    fmt.questionNumberStyle === 'questao_padded' ? `QUESTÃO ${padded}`
    : fmt.questionNumberStyle === 'question_en' ? `Question ${num}`
    : `${num}.`
  return title ? `${base}${fmt.questionHeadingSeparator ?? ' - '}${title}` : base
}

export interface InferDocumentFormatParams {
  fileName: string
  extractedText: string
  schoolName?: string
  targetCategory?: DocumentFormatCategory
  layoutHints?: {
    fontFamily?: string
    fontSizePt?: number
    columns?: 1 | 2
    marginsMm?: { top: number; right: number; bottom: number; left: number }
    headerStyle?: HeaderLayoutStyle
    footerText?: string
    logoDataUrl?: string
  }
}

/**
 * Infere um SchoolDocumentFormat automaticamente a partir do texto extraído de um arquivo modelo (.docx / .pdf / .txt)
 * enviado pelo professor na Biblioteca & Repositório.
 */
export function inferDocumentFormatFromSampleText(params: InferDocumentFormatParams): SchoolDocumentFormat {
  const text = params.extractedText || ''
  const cleanName = params.fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim()

  // Se o schoolName recebido for genérico ou fallback, tenta extrair o nome real do colégio do próprio arquivo
  let school = params.schoolName?.trim() || ''
  if (!school || school.toLowerCase() === 'machado sobrinho' || school.toLowerCase() === 'geral' || school.toLowerCase() === 'todas as escolas') {
    const detected = detectSchoolNameFromText(text, params.fileName)
    if (detected) {
      school = detected
    } else if (!school) {
      school = cleanName || 'Escola Personalizada'
    }
  }

  // Detecta categoria alvo
  let targetCategory = params.targetCategory || 'all'
  if (targetCategory === 'all') {
    if (/(?:prova|teste|simulado|avalia[çc][ãa]o|exam)/i.test(`${cleanName} ${text.slice(0, 500)}`)) {
      targetCategory = 'exam'
    } else if (/(?:lista|exerc[íi]cio|atividade|tarefa|worksheet)/i.test(cleanName)) {
      targetCategory = 'worksheet'
    } else if (/(?:sequ[êe]ncia|plano)/i.test(cleanName)) {
      targetCategory = 'didactic_sequence'
    }
  }

  // Detecta padrão de numeração de questão no arquivo exemplo
  let questionNumberStyle: QuestionNumberFormat = 'badge_number'
  if (/QUEST[ÃA]O\s*0?\d+/i.test(text)) {
    questionNumberStyle = 'questao_padded'
  } else if (/Question\s+\d+/i.test(text)) {
    questionNumberStyle = 'question_en'
  } else if (/^\s*\d+[\.\)]\s+/m.test(text)) {
    questionNumberStyle = 'numeric_dot'
  }

  // Detecta padrão de alternativas: (A) vs [A] vs a) vs A)
  let optionLabelStyle: OptionLabelFormat = 'A)'
  if (/(?:^|\s)\([A-E]\)\s/m.test(text)) {
    optionLabelStyle = '(A)'
  } else if (/(?:^|\s)\[[A-E]\]\s/m.test(text)) {
    optionLabelStyle = '[A]'
  } else if (/(?:^|\s)[a-e]\)\s/m.test(text)) {
    optionLabelStyle = 'a)'
  }

  // Detecta instruções existentes no arquivo
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  let instructionLines: string[] = []

  // Tenta bloco explícito de orientações
  const instrBlockMatch = text.match(
    /(?:instru[çc][õo]es|orienta[çc][õo]es|observa[çc][õo]es)[\s:]*([\s\S]{20,500}?)(?=\n\s*(?:quest[ãa]o|question|\d+[\.\)]|aluno|disciplina|conte[úu]do|$))/i
  )
  if (instrBlockMatch && instrBlockMatch[1]) {
    instructionLines = instrBlockMatch[1]
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 5 && !/instru[çc][õo]es/i.test(l))
      .slice(0, 5)
  }

  if (instructionLines.length === 0) {
    instructionLines = lines
      .filter(l => /^(1\.|2\.|3\.|4\.|•|-)\s*(leia|utilize|responda|não é permitido|preencha|assinale|write|answer)/i.test(l))
      .slice(0, 5)
  }

  // Transcrição estrutural do modelo (idioma, títulos de questão, itens V/F, texto-base)
  const structure = transcribeSampleStructure(text)
  const isEn = structure.language === 'en'
  const headings = structure.blocks.filter(b => b.kind === 'question_heading')
  const showPointsPerQuestion = headings.length > 0 ? headings.some(h => !!h.points) : true

  // Detecta subtítulo ou título oficial da prova
  let detectedSubtitle = isEn ? `${school.toUpperCase()} — OFFICIAL DOCUMENT` : `${school.toUpperCase()} — DOCUMENTO OFICIAL`
  const subtitleCandidate = lines.slice(0, 15).find(l =>
    /(?:avalia[çc][ãa]o|teste|simulado|prova|ensino\s+fundamental|ensino\s+m[ée]dio|bimestre|trimestre)/i.test(l) &&
    !/nome|aluno|turma|data|professor|disciplina|nota/i.test(l) &&
    l.length >= 6 && l.length <= 80
  )
  if (subtitleCandidate) {
    detectedSubtitle = subtitleCandidate.toUpperCase()
  }

  const hasSignature = /assinatura|coordena[çc][ãa]o|visto|professor\(a\)\s*respons[áa]vel/i.test(text)
  const isTwoColumns = params.layoutHints?.columns === 2 || /(duas\s+colunas|2\s*colunas|2col|enem|simulado)/i.test(`${cleanName} ${text}`)

  const marginsMm = params.layoutHints?.marginsMm || (
    isTwoColumns ? { top: 12, right: 12, bottom: 12, left: 12 } : { top: 15, right: 15, bottom: 15, left: 15 }
  )

  const fontFamily = params.layoutHints?.fontFamily || "'Times New Roman', Times, serif"
  const fontSizePt = params.layoutHints?.fontSizePt || 11
  const headerStyle: HeaderLayoutStyle = params.layoutHints?.headerStyle || 'boxed_grid'
  const footerText =
    params.layoutHints?.footerText ||
    (isEn ? `${school} • Official assessment document` : `${school} • Documento Formatado pelo Padrão da Escola`)

  return {
    id: `fmt_custom_${Date.now()}`,
    name: `Modelo ${school} (${cleanName.slice(0, 28)})`,
    description: `Formato extraído automaticamente do arquivo modelo "${params.fileName}" para a escola ${school}.`,
    schoolName: school,
    targetCategory,
    isDefaultForSchool: true,
    paperSize: 'A4',
    orientation: 'portrait',
    marginsMm,
    columns: isTwoColumns ? 2 : 1,
    columnGapMm: 8,
    showColumnDivider: isTwoColumns,
    fontFamily,
    fontSizePt,
    lineHeight: 1.45,
    textAlign: 'justify',
    headerStyle,
    primaryColor: '#000000',
    blackAndWhitePrintMode: true,
    officialSchoolSubtitle: detectedSubtitle,
    defaultInstructions:
      instructionLines.length > 0
        ? instructionLines.join('\n')
        : isEn
          ? '1. Read all questions carefully before answering.\n2. Use a blue or black pen.\n3. Good luck!'
          : '1. Leia atentamente as questões antes de responder.\n2. Utilize caneta azul ou preta.\n3. Boa atividade!',
    questionNumberStyle,
    optionLabelStyle,
    discursiveLinesCount: 4,
    showPointsPerQuestion,
    compactQuestionSpacing: false,
    footerText,
    showSignatureLine: hasSignature,
    signatureLabels: isEn ? ['Teacher', 'Academic Coordinator'] : ['Professor(a) Responsável', 'Coordenação Pedagógica'],
    logoUrl: params.layoutHints?.logoDataUrl,
    language: structure.language,
    pointsLabel: structure.pointsLabel,
    questionHeadingSeparator: structure.headingSeparator,
    sampleBlocks: structure.blocks.length > 0 ? structure.blocks.slice(0, 40) : undefined,
  }
}

/**
 * Transforma o HTML do corpo da prova/documento para obedecer às convenções do Formato da Escola:
 * - Numeração de questão ("QUESTÃO 01", "Question 1", "1.")
 * - Estilo de alternativa ("(A)", "[A]", "a)", "A)")
 * - Quantidade de linhas discursivas e modo P&B gráfica
 */
export function applySchoolFormatToBodyHtml(rawHtml: string, fmt: SchoolDocumentFormat): string {
  if (!rawHtml) return ''
  let html = rawHtml

  // 1. Ajusta numeração das questões dentro de .exam-question-item
  html = html.replace(
    /<span style="display:\s*inline-block;\s*background:\s*#8b5e3c;[^"]*">(\d+)\.<\/span>/gi,
    (_m, numStr: string) => {
      const n = parseInt(numStr, 10) || 1
      const padded = String(n).padStart(2, '0')
      const accent = fmt.blackAndWhitePrintMode ? '#000000' : fmt.primaryColor

      if (fmt.questionNumberStyle === 'questao_padded') {
        return `<span class="fmt-q-number" style="display:inline-block; background:${
          fmt.blackAndWhitePrintMode ? '#f1f5f9' : accent
        }; color:${
          fmt.blackAndWhitePrintMode ? '#000' : '#fff'
        }; border:${
          fmt.blackAndWhitePrintMode ? '1.5px solid #000' : 'none'
        }; padding:2px 9px; border-radius:3px; font-size:10.5pt; font-weight:bold; letter-spacing:0.5px; margin-right:8px;">QUESTÃO ${padded}</span>`
      }
      if (fmt.questionNumberStyle === 'question_en') {
        return `<span class="fmt-q-number" style="display:inline-block; font-weight:bold; color:${accent}; font-size:11pt; margin-right:6px; text-decoration:underline;">Question ${n}.</span>`
      }
      if (fmt.questionNumberStyle === 'numeric_dot') {
        return `<span class="fmt-q-number" style="display:inline-block; font-weight:bold; color:#000; font-size:11pt; margin-right:6px;">${n}.</span>`
      }
      return `<span class="fmt-q-number" style="display:inline-block; background:${accent}; color:#fff; padding:2px 8px; border-radius:5px; font-size:10.5pt; font-weight:bold; margin-right:8px;">${n}.</span>`
    }
  )

  // 2. Oculta pontuação por questão se configurado no formato da escola
  if (!fmt.showPointsPerQuestion) {
    html = html.replace(/<span style="float:\s*right;[^"]*">\([0-9.,]+\s*pts?\)<\/span>/gi, '')
  }

  // 3. Ajusta estilo do rótulo das alternativas: A) -> (A) / [A] / a)
  html = html.replace(
    /<strong style="min-width:\s*24px;\s*color:\s*#8b5e3c;">([A-E])\)<\/strong>/gi,
    (_m, letter: string) => {
      const accent = fmt.blackAndWhitePrintMode ? '#000000' : fmt.primaryColor
      const upper = letter.toUpperCase()
      const lower = letter.toLowerCase()
      let formattedLabel = `${upper})`
      if (fmt.optionLabelStyle === '(A)') formattedLabel = `(${upper})`
      else if (fmt.optionLabelStyle === '[A]') formattedLabel = `[${upper}]`
      else if (fmt.optionLabelStyle === 'a)') formattedLabel = `${lower})`
      return `<strong style="min-width: 28px; color: ${accent};">${formattedLabel}</strong>`
    }
  )

  return html
}
