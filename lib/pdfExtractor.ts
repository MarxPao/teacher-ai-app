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

function decodeXmlEntities(str: string): string {
  if (!str) return ''
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * Extrai texto de arquivos .docx (Microsoft Word) descompactando o ZIP e parseando
 * word/document.xml, bem como cabeçalhos (word/header*.xml) e rodapés (word/footer*.xml).
 * Inclui fallback para remoção direta de tags XML e extração de strings de texto legível.
 */
export async function extractTextFromDocx(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    let rawText = ''

    try {
      const JSZipModule = await import('jszip')
      const JSZip = JSZipModule.default || JSZipModule

      const zip = await JSZip.loadAsync(arrayBuffer)
      const allFileNames = Object.keys(zip.files)

      // Filtra arquivos XML relevantes dentro da pasta word/
      const targetFiles = allFileNames.filter(name =>
        /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/i.test(name)
      )

      // Fallback: Se não encontrou no padrão exato, procura qualquer .xml em word/
      if (targetFiles.length === 0) {
        targetFiles.push(...allFileNames.filter(name => /^word\/.*\.xml$/i.test(name)))
      }

      // Ordena para que os cabeçalhos venham antes do corpo principal
      targetFiles.sort((a, b) => {
        if (a.includes('header') && !b.includes('header')) return -1
        if (!a.includes('header') && b.includes('header')) return 1
        if (a.includes('document') && !b.includes('document')) return -1
        if (!a.includes('document') && b.includes('document')) return 1
        return a.localeCompare(b)
      })

      const extractedSections: string[] = []

      for (const fileName of targetFiles) {
        const zipFile = zip.file(fileName)
        if (!zipFile) continue

        let xmlText = await zipFile.async('text')
        if (!xmlText) continue

        xmlText = xmlText.replace(/<w:br\s*\/?>/gi, '\n')

        const paragraphs: string[] = []
        const pMatches = xmlText.match(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g) || [xmlText]

        for (const pXml of pMatches) {
          // Pass 1: busca por tags <w:t>
          const tMatches = Array.from(pXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)).map(m => decodeXmlEntities(m[1]))
          let pText = tMatches.join('').trim()

          // Pass 2: se <w:t> não pegou texto (ex: caixas de texto ou formas), remove tags XML
          if (!pText) {
            const stripped = pXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            if (stripped.length > 1) {
              pText = decodeXmlEntities(stripped)
            }
          }

          if (pText) {
            paragraphs.push(pText)
          }
        }

        if (paragraphs.length === 0) {
          const globalStripped = xmlText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          if (globalStripped.length > 1) {
            paragraphs.push(decodeXmlEntities(globalStripped))
          }
        }

        if (paragraphs.length > 0) {
          extractedSections.push(paragraphs.join('\n'))
        }
      }

      rawText = extractedSections.join('\n\n')
    } catch (zipError) {
      console.warn('[DOCX Extractor Warning]: Erro no parser ZIP, tentando extração de fallback...', zipError)
    }

    // Fallback secundário: Se ZIP falhou ou não produziu texto
    if (!rawText || rawText.trim().length < 2) {
      const textDecoder = new TextDecoder('utf-8', { fatal: false })
      const decodedString = textDecoder.decode(arrayBuffer)

      // Procura sequências de texto legíveis no binário
      const printableMatches = decodedString.match(/[A-Za-z0-9\u00C0-\u00FF\s.,:;!?()\/\-]{4,}/g) || []
      const filteredWords = printableMatches.map(s => s.trim()).filter(s => s.length > 3 && !/^[A-Za-z0-9]{30,}$/.test(s))
      rawText = filteredWords.join(' ')
    }

    if (!rawText || rawText.trim().length < 2) {
      throw new Error(`O arquivo Word "${file.name}" está vazio ou não possui texto extraível.`)
    }

    return normalizeAndReconstructText(rawText)
  } catch (error: unknown) {
    console.error('[DOCX Extractor Error]:', error)
    throw new Error(error instanceof Error ? error.message : 'Falha ao extrair texto do arquivo Word.')
  }
}

export interface DocxExtractionResult {
  text: string
  images: { name: string; dataUrl: string }[]
}

/**
 * Extrai texto E imagens (logos, fotos em word/media/) de um arquivo .docx
 */
export async function extractDocxWithImages(file: File): Promise<DocxExtractionResult> {
  const images: { name: string; dataUrl: string }[] = []

  try {
    const arrayBuffer = await file.arrayBuffer()
    const JSZipModule = await import('jszip')
    const JSZip = JSZipModule.default || JSZipModule

    const zip = await JSZip.loadAsync(arrayBuffer)
    const mediaFiles = Object.keys(zip.files).filter(name => /^word\/media\//i.test(name))

    for (const mediaPath of mediaFiles) {
      const zipFile = zip.file(mediaPath)
      if (!zipFile) continue

      const fileName = mediaPath.split('/').pop() || 'image'
      const ext = fileName.split('.').pop()?.toLowerCase() || 'png'

      let mimeType = 'image/png'
      if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg'
      else if (ext === 'svg') mimeType = 'image/svg+xml'
      else if (ext === 'gif') mimeType = 'image/gif'
      else if (ext === 'webp') mimeType = 'image/webp'

      try {
        const base64 = await zipFile.async('base64')
        if (base64) {
          images.push({
            name: fileName,
            dataUrl: `data:${mimeType};base64,${base64}`
          })
        }
      } catch (err) {
        console.warn(`[DOCX Image Extractor]: Falha ao converter imagem ${mediaPath}`, err)
      }
    }
  } catch (err) {
    console.warn('[DOCX Image Extractor]: Não foi possível ler mídia do pacote ZIP.', err)
  }

  const text = await extractTextFromDocx(file)
  return { text, images }
}


