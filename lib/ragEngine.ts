/**
 * lib/ragEngine.ts — Motor de Busca Semântica e Indexação RAG para a Biblioteca Digital
 *
 * Funcionalidades:
 * 1. Semantic Chunking: Divisão inteligente de livros e documentos por Unidade, Tópico Gramatical, Vocabulário e Leituras.
 * 2. Relevance Scoring: Busca ponderada por palavras-chave, conceitos gramaticais e similaridade contextual.
 * 3. Prompt Augmentation: Formata trechos recuperados para injeção direta nos prompts do ExamBuilder, LessonStudio e Rafinha.
 */

import { getSubjectProfileById, getSubjectProfile } from '@/lib/subjectProfile'
import '@/lib/subjects/english'
import '@/lib/subjects/portuguese'
import {
  searchVectorChunks,
  searchVectorChunksSync,
  generateFastVectorEmbedding,
  getEmbeddingMode,
  getEmbeddingModeNotice,
  normalizeGrade,
  type VectorChunk
} from '@/lib/vectorSearch'

export interface DocumentScope {
  classGroupId?: string
  gradeYear?: string
  grade?: string
  school?: string
  tenantId?: string
  pageNumber?: number
}

export interface DocumentChunk {
  id: string
  docId: number | string
  docTitle: string
  type: string
  unitTitle: string
  category: string
  subjectId?: string
  grammarFocus: string[]
  vocabFocus: string[]
  content: string
  score?: number
  embedding?: number[]
  pageNumber?: number
  classGroupId?: string
  gradeYear?: string
  school?: string
  tenantId?: string
}

export interface SearchOptions {
  docId?: number | string
  type?: string
  textbook?: string
  subjectId?: string
  limit?: number
  maxTokens?: number
  maxChars?: number
  classGroupId?: string
  gradeYear?: string
  grade?: string
  school?: string
}

/**
 * Retorna termos da taxonomia gramatical e conceitual do perfil de matéria ativo para scoring dinâmico
 */
export function getGrammarKeywordsForSubject(subjectId?: string): string[] {
  const profile = subjectId ? getSubjectProfileById(subjectId) : getSubjectProfile()
  if (!profile) return ['present perfect', 'past simple', 'conditionals', 'concordância', 'regência', 'crase']

  const keywords: string[] = []
  profile.taxonomy?.forEach(domain => {
    domain.subcategories?.forEach(sub => {
      keywords.push(sub.name.toLowerCase())
    })
  })
  return keywords.length > 0 ? keywords : ['grammar', 'leitura', 'escrita']
}

/**
 * Fraciona o conteúdo de um documento ou livro didático em blocos semânticos estruturados (Chunks)
 */
export function indexDocumentContent(
  docId: number | string,
  docTitle: string,
  type: string,
  category: string,
  rawContent: string,
  subjectId?: string,
  scope?: DocumentScope
): DocumentChunk[] {
  if (!rawContent || !rawContent.trim()) return []

  const chunks: DocumentChunk[] = []
  
  // Divide por unidades ou seções principais (ex: [UNIT 1 ...], --- Página X de Y ---, Capitulo X)
  const unitRegex = /(?:\[UNIT\s*\d+[^\]]*\]|--- Página\s*\d+(?:\s*de\s*\d+)?\s*---|Capítulo\s*\d+|UNIDADE\s*\d+)/gi
  const unitMatches = Array.from(rawContent.matchAll(unitRegex))

  let currentPageNumber: number | undefined = undefined

  if (unitMatches.length > 0) {
    for (let i = 0; i < unitMatches.length; i++) {
      const match = unitMatches[i]
      let unitTitle = match[0].trim()

      const pageCheck = unitTitle.match(/--- Página\s*(\d+)/i)
      if (pageCheck) {
        currentPageNumber = parseInt(pageCheck[1], 10)
      }

      const startIndex = match.index! + match[0].length
      const endIndex = unitMatches[i + 1] ? unitMatches[i + 1].index! : rawContent.length
      let chunkText = rawContent.slice(startIndex, endIndex).trim()

      // Se o chunk iniciar com dois pontos (ex: match foi "Capítulo 8" e texto tem ": Título"),
      // anexa o título amigável ao unitTitle e remove dos dois pontos
      if (chunkText.startsWith(':')) {
        const endOfTitle = chunkText.indexOf('\n')
        const titlePart = endOfTitle > 0 ? chunkText.slice(1, endOfTitle).trim() : ''
        unitTitle = `${unitTitle}: ${titlePart}`
        chunkText = (endOfTitle > 0 ? chunkText.slice(endOfTitle) : '').trim()
      }

      if (chunkText.length > 30) {
        chunks.push(buildChunk(docId, docTitle, type, category, unitTitle, chunkText, chunks.length, subjectId, {
          ...scope,
          pageNumber: currentPageNumber
        }))
      }
    }
  } else {
    // Se não houver divisores claros de unidades, divide por parágrafos duplos (~400 caracteres por bloco)
    const blocks = rawContent.split(/\n\s*\n/).filter(b => b.trim().length > 30)
    blocks.forEach((block, idx) => {
      chunks.push(buildChunk(docId, docTitle, type, category, `Seção ${idx + 1}`, block, idx, subjectId, scope))
    })
  }

  return chunks
}

/**
 * Constrói um objeto DocumentChunk extraindo foco gramatical e vocabulário
 */
function buildChunk(
  docId: number | string,
  docTitle: string,
  type: string,
  category: string,
  unitTitle: string,
  content: string,
  index: number,
  subjectId?: string,
  scope?: DocumentScope
): DocumentChunk {
  const dynamicKeywords = getGrammarKeywordsForSubject(subjectId)
  const foundGrammar = dynamicKeywords.filter(g => content.toLowerCase().includes(g.toLowerCase()))

  // Extrai palavras em destaque ou entre aspas como vocabulário
  const vocabMatches = Array.from(content.matchAll(/"([^"]{3,25})"/g)).map(m => m[1])

  // Extrai número da página se houver marcador no unitTitle ou no content, ou herda do scope
  const pageMatch = (unitTitle + ' ' + content).match(/--- Página\s*(\d+)/i)
  const pageNumber = pageMatch ? parseInt(pageMatch[1], 10) : scope?.pageNumber

  // Extrai título amigável de unidade se o unitTitle for marcador genérico de página
  let resolvedUnitTitle = unitTitle
  if (unitTitle.startsWith('--- Página')) {
    const unitMatch = content.match(/(?:\[(UNIT\s*\d+[^\]]*)\]|(Capítulo\s*\d+[^:\n]*:[^\n]+)|(UNIDADE\s*\d+[^:\n]*:[^\n]+))/i)
    if (unitMatch) {
      resolvedUnitTitle = (unitMatch[1] || unitMatch[2] || unitMatch[3]).trim()
    }
  }
  resolvedUnitTitle = resolvedUnitTitle.replace(/^\[|\]$/g, '').trim()

  return {
    id: `${docId}_chunk_${index}`,
    docId,
    docTitle,
    type,
    unitTitle: resolvedUnitTitle,
    category: category || 'Geral',
    subjectId: subjectId || 'english',
    grammarFocus: foundGrammar.slice(0, 10),
    vocabFocus: Array.from(new Set(vocabMatches)).slice(0, 8),
    content: content.slice(0, 1500), // Limita tamanho por chunk
    embedding: generateFastVectorEmbedding(`${resolvedUnitTitle}\n${content}`.slice(0, 1500)),
    pageNumber,
    classGroupId: scope?.classGroupId,
    gradeYear: scope?.gradeYear || scope?.grade,
    school: scope?.school || scope?.tenantId,
    tenantId: scope?.tenantId || scope?.school
  }
}

/**
 * Indexa e persiste todos os livros da biblioteca no localStorage e Supabase
 */
export function indexAllLibraryItems(): DocumentChunk[] {
  if (typeof window === 'undefined') return []

  try {
    const rawItems = localStorage.getItem('teacher_repo') 
      || localStorage.getItem('teacher_repository') 
      || localStorage.getItem('teacher_repo_materials')
    if (!rawItems) return []

    const items = JSON.parse(rawItems)
    localStorage.setItem('teacher_repo', rawItems)
    localStorage.setItem('teacher_repository', rawItems)
    let allChunks: DocumentChunk[] = []

    for (const item of items) {
      const docChunks = indexDocumentContent(
        item.id,
        item.title,
        item.type || 'Student\'s Book',
        item.category || 'Geral',
        item.content || '',
        item.subjectId || item.subject || 'english',
        {
          classGroupId: item.classGroupId || item.classId,
          gradeYear: item.gradeYear || item.grade,
          school: item.school || item.tenantId,
          tenantId: item.tenantId || item.school
        }
      )
      allChunks = allChunks.concat(docChunks)
    }

    localStorage.setItem('teacher_rag_chunks', JSON.stringify(allChunks))
    return allChunks
  } catch (e) {
    console.error('[RAG Indexing Error]:', e)
    return []
  }
}

/**
 * Executa uma busca semântica RAG para encontrar os trechos de livros mais relevantes para uma consulta
 */
export function searchLibraryContext(query: string, options: SearchOptions = {}): DocumentChunk[] {
  if (typeof window === 'undefined') return []

  try {
    let chunks: DocumentChunk[] = []
    const cached = localStorage.getItem('teacher_rag_chunks')

    if (cached) {
      chunks = JSON.parse(cached)
    } else {
      chunks = indexAllLibraryItems()
    }

    if (!chunks || chunks.length === 0) {
      chunks = indexAllLibraryItems()
    }

    const limit = options.limit || 8

    // Filtra por matéria (subjectId), tipo de livro ou docId se especificado
    let filtered = chunks
    if (options.subjectId) {
      filtered = filtered.filter(c => !c.subjectId || c.subjectId === options.subjectId)
    }
    if (options.docId) {
      filtered = filtered.filter(c => String(c.docId) === String(options.docId))
    }
    if (options.type) {
      filtered = filtered.filter(c => c.type.toLowerCase().includes(options.type!.toLowerCase()))
    }
    if (options.textbook) {
      filtered = filtered.filter(c => c.docTitle.toLowerCase().includes(options.textbook!.toLowerCase()))
    }

    // Filtro estrito de Escopo Multi-Tenant por Turma e Série (Prevenção de Vazamento 6º vs 9º ano)
    if (options.classGroupId) {
      filtered = filtered.filter(c => !c.classGroupId || c.classGroupId === options.classGroupId)
    }
    const targetGrade = options.gradeYear || options.grade
    if (targetGrade) {
      const normTarget = normalizeGrade(targetGrade)
      filtered = filtered.filter(c => {
        if (!c.gradeYear) return true // Chunks sem restrição de série permanecem acessíveis
        const normChunk = normalizeGrade(c.gradeYear)
        return normChunk === normTarget || normChunk === 'all'
      })
    }
    if (options.school) {
      filtered = filtered.filter(c => !c.school || c.school === options.school)
    }

    // Busca Vetorial Semântica por Similaridade de Cosseno Real
    const vectorChunks: VectorChunk[] = filtered.map(c => ({
      id: c.id,
      content: `${c.docTitle} ${c.unitTitle}\n${c.content}`,
      embedding: c.embedding || generateFastVectorEmbedding(c.content, 768),
      documentId: c.docId,
      documentTitle: c.docTitle,
      unitTitle: c.unitTitle
    }))

    const scoredVector = searchVectorChunksSync(query, vectorChunks, limit)
    const scoredMap = new Map(scoredVector.map(s => [s.id, s.score || 0]))

    // Ordena por maior relevância semântica e retorna os top N
    return filtered
      .filter(c => (scoredMap.get(c.id) || 0) > 0 || options.docId !== undefined)
      .map(c => ({
        ...c,
        score: scoredMap.get(c.id) || 0
      }))
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, limit)

  } catch (e) {
    console.error('[RAG Search Error]:', e)
    return []
  }
}

/**
 * Executa uma busca vetorial semântica real usando embeddings reais do Gemini ou fallback local
 */
export async function searchLibraryContextVector(
  query: string,
  options: SearchOptions = {},
  apiKey?: string
): Promise<DocumentChunk[]> {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') return []

  try {
    let chunks: DocumentChunk[] = []
    const cached = localStorage.getItem('teacher_rag_chunks')

    if (cached) {
      chunks = JSON.parse(cached)
    } else {
      chunks = indexAllLibraryItems()
    }

    if (!chunks || chunks.length === 0) {
      chunks = indexAllLibraryItems()
    }

    const limit = options.limit || 8

    let filtered = chunks
    if (options.subjectId) {
      filtered = filtered.filter(c => !c.subjectId || c.subjectId === options.subjectId)
    }
    if (options.docId) {
      filtered = filtered.filter(c => String(c.docId) === String(options.docId))
    }
    if (options.type) {
      filtered = filtered.filter(c => c.type.toLowerCase().includes(options.type!.toLowerCase()))
    }
    if (options.textbook) {
      filtered = filtered.filter(c => c.docTitle.toLowerCase().includes(options.textbook!.toLowerCase()))
    }

    // Filtro estrito de Escopo Multi-Tenant por Turma e Série (Prevenção de Vazamento 6º vs 9º ano)
    if (options.classGroupId) {
      filtered = filtered.filter(c => !c.classGroupId || c.classGroupId === options.classGroupId)
    }
    const targetGrade = options.gradeYear || options.grade
    if (targetGrade) {
      const normTarget = normalizeGrade(targetGrade)
      filtered = filtered.filter(c => {
        if (!c.gradeYear) return true
        const normChunk = normalizeGrade(c.gradeYear)
        return normChunk === normTarget || normChunk === 'all'
      })
    }
    if (options.school) {
      filtered = filtered.filter(c => !c.school || c.school === options.school)
    }

    const vectorChunks: VectorChunk[] = filtered.map(c => ({
      id: c.id,
      content: `${c.docTitle} ${c.unitTitle}\n${c.content}`,
      embedding: c.embedding || generateFastVectorEmbedding(c.content, 768),
      documentId: c.docId,
      documentTitle: c.docTitle,
      unitTitle: c.unitTitle,
      classGroupId: c.classGroupId,
      gradeYear: c.gradeYear,
      school: c.school,
      tenantId: c.tenantId
    }))

    const scored = await searchVectorChunks(query, vectorChunks, limit, undefined, apiKey)
    const scoredMap = new Map(scored.map(s => [s.id, s.score]))

    return filtered
      .filter(c => scoredMap.has(c.id))
      .map(c => ({ ...c, score: scoredMap.get(c.id) }))
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, limit)
  } catch (e) {
    console.error('[Vector RAG Search Error]:', e)
    return []
  }
}

/**
 * Converte os trechos recuperados do RAG em um bloco de prompt formatado para injeção nas LLMs.
 * Respeita maxTokens (orçamento de tokens) para evitar estouro de contexto do modelo BYOK.
 */
export function buildRagPromptContext(chunks: DocumentChunk[], maxTokens?: number): string {
  if (!chunks || chunks.length === 0) return ''

  // 1 token ≈ 4 caracteres
  const maxChars = maxTokens ? maxTokens * 4 : undefined
  let currentChars = 0
  const selectedChunks: DocumentChunk[] = []

  for (const c of chunks) {
    const chunkLength = c.content.length + 120
    if (maxChars && currentChars + chunkLength > maxChars && selectedChunks.length > 0) {
      break
    }
    selectedChunks.push(c)
    currentChars += chunkLength
  }

  const formatted = selectedChunks.map((c, i) => `
=== CONTEXTO DA BIBLIOTECA DA ESCOLA #${i + 1} ===
LIVRO/MATERIAL: ${c.docTitle} (${c.type})
UNIDADE/SEÇÃO: ${c.unitTitle}
${c.grammarFocus.length > 0 ? `FOCO GRAMATICAL: ${c.grammarFocus.join(', ')}\n` : ''}
CONTEÚDO DE REFERÊNCIA:
${c.content}
`).join('\n')

  return `\n=== MATERIAIS RAG DA BIBLIOTECA DIGITAL DA ESCOLA ===\nO conteúdo abaixo deve ser usado como BASE TEMÁTICA, VOCABULAR E GRAMATICAL para criar questões 100% INÉDITAS E ORIGINAIS. NUNCA copie ou reproduza questões prontas do material. Elabore novos itens avaliativos baseados nos tópicos do conteúdo:\n${formatted}\n`
}
