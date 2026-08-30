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
}

export interface SearchOptions {
  docId?: number | string
  type?: string
  textbook?: string
  subjectId?: string
  limit?: number
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
  subjectId?: string
): DocumentChunk[] {
  if (!rawContent || !rawContent.trim()) return []

  const chunks: DocumentChunk[] = []
  
  // Divide por unidades ou seções principais (ex: [UNIT 1 ...], --- Página X ---, Capitulo X)
  const unitRegex = /(?:\[UNIT\s*\d+[^\]]*\]|--- Página\s*\d+\s*---|Capítulo\s*\d+|UNIDADE\s*\d+)/gi
  const unitMatches = Array.from(rawContent.matchAll(unitRegex))

  if (unitMatches.length > 0) {
    for (let i = 0; i < unitMatches.length; i++) {
      const match = unitMatches[i]
      const unitTitle = match[0].trim()
      const startIndex = match.index! + match[0].length
      const endIndex = unitMatches[i + 1] ? unitMatches[i + 1].index! : rawContent.length
      const chunkText = rawContent.slice(startIndex, endIndex).trim()

      if (chunkText.length > 30) {
        chunks.push(buildChunk(docId, docTitle, type, category, unitTitle, chunkText, i, subjectId))
      }
    }
  } else {
    // Se não houver divisores claros de unidades, divide por parágrafos duplos (~400 caracteres por bloco)
    const blocks = rawContent.split(/\n\s*\n/).filter(b => b.trim().length > 30)
    blocks.forEach((block, idx) => {
      chunks.push(buildChunk(docId, docTitle, type, category, `Seção ${idx + 1}`, block, idx, subjectId))
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
  subjectId?: string
): DocumentChunk {
  const dynamicKeywords = getGrammarKeywordsForSubject(subjectId)
  const foundGrammar = dynamicKeywords.filter(g => content.toLowerCase().includes(g.toLowerCase()))

  // Extrai palavras em destaque ou entre aspas como vocabulário
  const vocabMatches = Array.from(content.matchAll(/"([^"]{3,25})"/g)).map(m => m[1])

  return {
    id: `${docId}_chunk_${index}`,
    docId,
    docTitle,
    type,
    unitTitle,
    category: category || 'Geral',
    subjectId: subjectId || 'english',
    grammarFocus: foundGrammar.slice(0, 10),
    vocabFocus: Array.from(new Set(vocabMatches)).slice(0, 8),
    content: content.slice(0, 1500) // Limita tamanho por chunk
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
        item.subjectId || item.subject || 'english'
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

    const limit = options.limit || 4
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2)

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

    // Calcula a pontuação de relevância para cada chunk
    const scored = filtered.map(chunk => {
      let score = 0
      const contentLower = (chunk.docTitle + ' ' + chunk.unitTitle + ' ' + chunk.content).toLowerCase()

      // Match exato de frase
      if (contentLower.includes(query.toLowerCase())) {
        score += 15
      }

      // Match de termos individuais
      for (const term of terms) {
        if (contentLower.includes(term)) {
          score += 3
        }
      }

      // Bônus se houver match em foco gramatical ou vocabulário
      if (chunk.grammarFocus.some(g => query.toLowerCase().includes(g.toLowerCase()))) {
        score += 8
      }
      if (chunk.vocabFocus.some(v => query.toLowerCase().includes(v.toLowerCase()))) {
        score += 5
      }

      return { ...chunk, score }
    })

    // Ordena por maior relevância e retorna os top N
    return scored
      .filter(c => (c.score || 0) > 0 || options.docId !== undefined)
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, limit)

  } catch (e) {
    console.error('[RAG Search Error]:', e)
    return []
  }
}

/**
 * Converte os trechos recuperados do RAG em um bloco de prompt formatado para injeção nas LLMs
 */
export function buildRagPromptContext(chunks: DocumentChunk[]): string {
  if (!chunks || chunks.length === 0) return ''

  const formatted = chunks.map((c, i) => `
=== CONTEXTO DA BIBLIOTECA DA ESCOLA #${i + 1} ===
LIVRO/MATERIAL: ${c.docTitle} (${c.type})
UNIDADE/SEÇÃO: ${c.unitTitle}
${c.grammarFocus.length > 0 ? `FOCO GRAMATICAL: ${c.grammarFocus.join(', ')}\n` : ''}
CONTEÚDO DE REFERÊNCIA:
${c.content}
`).join('\n')

  return `\n=== MATERIAIS RAG DA BIBLIOTECA DIGITAL DA ESCOLA ===\nO conteúdo abaixo deve ser usado como BASE TEMÁTICA, VOCABULAR E GRAMATICAL para criar questões 100% INÉDITAS E ORIGINAIS. NUNCA copie ou reproduza questões prontas do material. Elabore novos itens avaliativos baseados nos tópicos do conteúdo:\n${formatted}\n`
}
