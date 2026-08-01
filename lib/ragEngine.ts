/**
 * lib/ragEngine.ts — Motor de Busca Semântica e Indexação RAG para a Biblioteca Digital
 *
 * Funcionalidades:
 * 1. Semantic Chunking: Divisão inteligente de livros e documentos por Unidade, Tópico Gramatical, Vocabulário e Leituras.
 * 2. Relevance Scoring: Busca ponderada por palavras-chave, conceitos gramaticais e similaridade contextual.
 * 3. Prompt Augmentation: Formata trechos recuperados para injeção direta nos prompts do ExamBuilder, LessonStudio e Rafinha.
 */

export interface DocumentChunk {
  id: string
  docId: number | string
  docTitle: string
  type: string
  unitTitle: string
  category: string
  grammarFocus: string[]
  vocabFocus: string[]
  content: string
  score?: number
}

export interface SearchOptions {
  docId?: number | string
  type?: string
  textbook?: string
  limit?: number
}

/**
 * Fraciona o conteúdo de um documento ou livro didático em blocos semânticos estruturados (Chunks)
 */
export function indexDocumentContent(
  docId: number | string,
  docTitle: string,
  type: string,
  category: string,
  rawContent: string
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
        chunks.push(buildChunk(docId, docTitle, type, category, unitTitle, chunkText, i))
      }
    }
  } else {
    // Se não houver divisores claros de unidades, divide por parágrafos duplos (~400 caracteres por bloco)
    const blocks = rawContent.split(/\n\s*\n/).filter(b => b.trim().length > 30)
    blocks.forEach((block, idx) => {
      chunks.push(buildChunk(docId, docTitle, type, category, `Seção ${idx + 1}`, block, idx))
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
  index: number
): DocumentChunk {
  const grammarKeywords = ['present perfect', 'past simple', 'conditionals', 'passive voice', 'reported speech', 'modals', 'gerund', 'infinitive', 'relative clauses']
  const foundGrammar = grammarKeywords.filter(g => content.toLowerCase().includes(g))

  // Extrai palavras em destaque ou entre aspas como vocabulário
  const vocabMatches = Array.from(content.matchAll(/"([^"]{3,25})"/g)).map(m => m[1])

  return {
    id: `${docId}_chunk_${index}`,
    docId,
    docTitle,
    type,
    unitTitle,
    category: category || 'Geral',
    grammarFocus: foundGrammar,
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
    const rawItems = localStorage.getItem('teacher_repository')
    if (!rawItems) return []

    const items = JSON.parse(rawItems)
    let allChunks: DocumentChunk[] = []

    for (const item of items) {
      const docChunks = indexDocumentContent(
        item.id,
        item.title,
        item.type || 'Student\'s Book',
        item.category || 'Geral',
        item.content || ''
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

    // Filtra por tipo de livro ou docId se especificado
    let filtered = chunks
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
LIVRO: ${c.docTitle} (${c.type})
UNIDADE/SEÇÃO: ${c.unitTitle}
${c.grammarFocus.length > 0 ? `FOCO GRAMATICAL: ${c.grammarFocus.join(', ')}\n` : ''}
TRECHO DO MATERIAL:
${c.content}
`).join('\n')

  return `\n=== MATERIAIS RAG DA BIBLIOTECA DIGITAL DA ESCOLA ===\nO conteúdo abaixo deve ser usado como BASE PRINCIPAL para gerar os textos, questões e exercícios:\n${formatted}\n`
}
