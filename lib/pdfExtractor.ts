/**
 * pdfExtractor.ts — Extração nativa de texto de arquivos PDF e DOCX em lote completo (Full Batch Extractor)
 * Suporta livros didáticos grandes (100+ páginas) com ordenação por colunas, isolamento de exceção por página
 * e callback de progresso em tempo real.
 */

export interface PdfTextItem {
  str: string
  x: number
  y: number
  width?: number
  height?: number
}

/**
 * Recompõe e limpa um texto bruto, unindo linhas quebradas no meio de frases
 * e preservando títulos, unidades e estruturas numeradas.
 */
export function normalizeAndReconstructText(rawText: string): string {
  if (!rawText || !rawText.trim()) return ''

  const lines = rawText.split('\n')
  const cleanedLines: string[] = []
  let currentParagraph = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (!line) {
      if (currentParagraph) {
        cleanedLines.push(currentParagraph)
        currentParagraph = ''
      }
      continue
    }

    if (
      /^--- Página \d+ ---$/i.test(line) ||
      /^\[.*\]$/.test(line) ||
      /^(?:UNIT|CHAPTER|LESSON|SECTION|EXERCISE|GRAMMAR|VOCABULARY|CLIL)\b/i.test(line) ||
      /^\d+\.\s+/.test(line) ||
      /^=[=]+/.test(line) ||
      /^-[-]+/.test(line)
    ) {
      if (currentParagraph) {
        cleanedLines.push(currentParagraph)
        currentParagraph = ''
      }
      cleanedLines.push(line)
      continue
    }

    if (!currentParagraph) {
      currentParagraph = line
    } else {
      if (currentParagraph.endsWith('-')) {
        currentParagraph = currentParagraph.slice(0, -1) + line
      } else if (!/[.?!:]$/.test(currentParagraph)) {
        currentParagraph += ' ' + line
      } else {
        cleanedLines.push(currentParagraph)
        currentParagraph = line
      }
    }
  }

  if (currentParagraph) {
    cleanedLines.push(currentParagraph)
  }

  return cleanedLines
    .join('\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Extrai texto de arquivos PDF completos de qualquer tamanho (1 a 500+ páginas),
 * garantindo resiliência a falhas de páginas individuais e relatório de progresso.
 */
export async function extractTextFromPdf(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    // Faz uma cópia limpa do TypedArray para evitar descolamento do buffer no PDF.js
    const typedArray = new Uint8Array(arrayBuffer.slice(0))

    let pdfjsLib = (window as any).pdfjsLib

    if (!pdfjsLib) {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjsLib = pdfjs
      } catch {
        await new Promise<void>((resolve, reject) => {
          if ((window as any).pdfjsLib) return resolve()
          const script = document.createElement('script')
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Não foi possível carregar a biblioteca PDF.js.'))
          document.head.appendChild(script)
        })
        pdfjsLib = (window as any).pdfjsLib
      }
    }

    if (!pdfjsLib) {
      throw new Error('Biblioteca PDF.js não encontrada.')
    }

    if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    }

    const loadingTask = pdfjsLib.getDocument({ data: typedArray })
    const pdf = await loadingTask.promise
    const totalPages = pdf.numPages
    let fullText = ''
    let totalCharCount = 0
    let successfulPages = 0

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (onProgress) {
        onProgress(pageNum, totalPages)
      }

      try {
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: 1.0 })
        const pageWidth = viewport.width || 600
        const textContent = await page.getTextContent()

        const items: PdfTextItem[] = textContent.items
          .map((item: any) => {
            const transform = item.transform || [1, 0, 0, 1, 0, 0]
            return {
              str: item.str || '',
              x: transform[4] || 0,
              y: transform[5] || 0,
              width: item.width || 0,
              height: item.height || 0
            }
          })
          .filter((it: PdfTextItem) => it.str.trim().length > 0)

        if (items.length === 0) continue

        // Layout de 2 colunas vs 1 coluna
        const midX = pageWidth / 2
        const leftItems = items.filter(it => it.x < midX - 20)
        const rightItems = items.filter(it => it.x >= midX - 20)
        const isTwoColumn = leftItems.length > 5 && rightItems.length > 5 && (rightItems.length / items.length > 0.25)

        let sortedItems: PdfTextItem[] = []
        if (isTwoColumn) {
          leftItems.sort((a, b) => (Math.abs(b.y - a.y) > 4 ? b.y - a.y : a.x - b.x))
          rightItems.sort((a, b) => (Math.abs(b.y - a.y) > 4 ? b.y - a.y : a.x - b.x))
          sortedItems = [...leftItems, ...rightItems]
        } else {
          sortedItems = [...items].sort((a, b) => (Math.abs(b.y - a.y) > 4 ? b.y - a.y : a.x - b.x))
        }

        let pageText = ''
        let lastY: number | null = null

        for (const item of sortedItems) {
          if (lastY !== null && Math.abs(lastY - item.y) > 12) {
            pageText += '\n'
          } else if (lastY !== null) {
            pageText += ' '
          }
          pageText += item.str
          lastY = item.y
        }

        totalCharCount += pageText.replace(/\s+/g, '').length
        fullText += `--- Página ${pageNum} de ${totalPages} ---\n` + pageText + '\n\n'
        successfulPages++
      } catch (pageError) {
        console.warn(`[PDF Extractor Warning]: Erro ao ler página ${pageNum}/${totalPages}. Continuando...`, pageError)
        fullText += `--- Página ${pageNum} de ${totalPages} (Não foi possível extrair texto desta página) ---\n\n`
      }
    }

    if (totalCharCount < 40 && totalPages > 0) {
      throw new Error(
        `O PDF "${file.name}" é uma imagem ou documento escaneado sem camada de texto legível (0 caracteres lidos em ${totalPages} páginas). Por favor forneça um PDF com camada de texto pesquisável ou converta o arquivo para .txt / .docx.`
      )
    }

    const reconstructed = normalizeAndReconstructText(fullText)
    return reconstructed
  } catch (error: unknown) {
    console.error('[PDF Extractor Error]:', error)
    throw new Error(error instanceof Error ? error.message : 'Falha ao extrair texto do PDF.')
  }
}

/**
 * Extrai texto de arquivos .docx (Microsoft Word) parseando o XML do documento
 */
export async function extractTextFromDocx(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    let documentXml = ''

    try {
      const textDecoder = new TextDecoder('utf-8', { fatal: false })
      documentXml = textDecoder.decode(arrayBuffer)
    } catch {
      throw new Error('Não foi possível decodificar o arquivo .docx.')
    }

    if (!documentXml) {
      throw new Error('Não foi possível ler o arquivo .docx.')
    }

    const paragraphs: string[] = []
    const pMatches = documentXml.match(/<w:p\b[^>]*>(.*?)<\/w:p>/g) || [documentXml]

    for (const pXml of pMatches) {
      const tMatches = Array.from(pXml.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/g)).map(m => m[1])
      const pText = tMatches.join('').trim()
      if (pText) {
        paragraphs.push(pText)
      }
    }

    const rawText = paragraphs.join('\n\n')

    if (rawText.length < 20) {
      throw new Error(`O arquivo Word "${file.name}" está vazio ou não possui texto extraível.`)
    }

    return normalizeAndReconstructText(rawText)
  } catch (error: unknown) {
    console.error('[DOCX Extractor Error]:', error)
    throw new Error(error instanceof Error ? error.message : 'Falha ao extrair texto do arquivo Word.')
  }
}
