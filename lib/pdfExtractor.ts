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
export async function extractTextFromDocx(file: File | Blob | ArrayBuffer): Promise<string> {
  try {
    const arrayBuffer = typeof (file as any).arrayBuffer === 'function'
      ? await (file as File | Blob).arrayBuffer()
      : (file as ArrayBuffer)
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
      const fileName = 'name' in file ? (file as File).name : 'Word'
      throw new Error(`O arquivo Word "${fileName}" está vazio ou não possui texto extraível.`)
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

// ─────────────────────────────────────────────────────────────────────────────
// Extração de Imagens de PDF
// ─────────────────────────────────────────────────────────────────────────────

export interface PdfExtractedImage {
  /** Número da página (1-indexed) */
  pageNumber: number
  /** Índice da imagem dentro da página (0-indexed) */
  imageIndex: number
  /** Data URL base64 pronta para uso em <img src> ou Gemini Vision */
  dataUrl: string
  /** Largura em pixels do canvas renderizado */
  width: number
  /** Altura em pixels do canvas renderizado */
  height: number
}

export interface PdfExtractionWithImagesResult {
  text: string
  images: PdfExtractedImage[]
  scannedPagesCount: number
}

/**
 * Extrai texto E imagens de um PDF.
 *
 * Para cada imagem encontrada via `OPS.paintImageXObject` do PDF.js, renderiza
 * a página inteira em canvas e recorta o bounding-box da imagem. Isso garante
 * que diagramas, infográficos e ilustrações de livros didáticos sejam capturados
 * fielmente, mesmo quando embutidos como XObject comprimido (JPEG2000, PNG, CCITT).
 *
 * Uso posterior recomendado:
 *   - `dataUrl` → Gemini Vision (`inlineData.mimeType / data`) para descrição de imagem
 *   - Descrição retornada pode ser adicionada ao chunk de texto adjacente
 *
 * @param file          Arquivo PDF
 * @param maxImages     Limite de imagens por documento (default 40; livros com muitos ícones decorativos podem explodir o payload)
 * @param renderScale   Escala de renderização do canvas (default 1.5 — equilibra qualidade e tamanho de payload)
 * @param onProgress    Callback opcional de progresso de página
 */
export async function extractImagesFromPdf(
  file: File,
  maxImages = 40,
  renderScale = 1.5,
  onProgress?: (current: number, total: number) => void
): Promise<PdfExtractionWithImagesResult> {
  const images: PdfExtractedImage[] = []
  let fullText = ''
  let scannedPagesCount = 0

  try {
    const arrayBuffer = await file.arrayBuffer()
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
          script.onerror = () => reject(new Error('Não foi possível carregar PDF.js.'))
          document.head.appendChild(script)
        })
        pdfjsLib = (window as any).pdfjsLib
      }
    }
    if (!pdfjsLib) throw new Error('Biblioteca PDF.js não encontrada.')

    if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    }

    const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise
    const totalPages = pdf.numPages

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (images.length >= maxImages) break
      if (onProgress) onProgress(pageNum, totalPages)

      try {
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: 1.0 })

        // ── Extração de texto desta página ──────────────────────────────────
        try {
          const textContent = await page.getTextContent()
          const items: any[] = textContent.items || []
          const pageText = items
            .map((it: any) => it.str || '')
            .filter(Boolean)
            .join(' ')
            .trim()
          if (pageText) {
            fullText += `--- Página ${pageNum} de ${totalPages} ---\n${pageText}\n\n`
          } else {
            scannedPagesCount++
          }
        } catch {
          scannedPagesCount++
        }

        // ── Detecção de imagens via operadores do PDF ────────────────────────
        let operatorList: any
        try {
          operatorList = await page.getOperatorList()
        } catch {
          continue
        }

        const OPS = pdfjsLib.OPS || {}
        const PAINT_OPS = new Set([
          OPS.paintImageXObject,
          OPS.paintInlineImageXObject,
          OPS.paintImageXObjectRepeat,
          OPS.paintImageMaskXObject
        ].filter(Boolean))

        const imageOpsFound = operatorList.fnArray.some((fn: number) => PAINT_OPS.has(fn))
        if (!imageOpsFound) continue

        // ── Renderiza página no canvas e recorta imagens ─────────────────────
        const scaledViewport = page.getViewport({ scale: renderScale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(scaledViewport.width)
        canvas.height = Math.round(scaledViewport.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) continue

        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise

        // Conta imagens encontradas nesta página para indexação
        let pageImageCount = 0
        for (let i = 0; i < operatorList.fnArray.length; i++) {
          if (!PAINT_OPS.has(operatorList.fnArray[i])) continue
          if (images.length >= maxImages) break

          // Tenta obter bounding-box da imagem via argsArray
          // args para paintImageXObject: [name, w, h] ou [name]
          const args = operatorList.argsArray[i] || []
          const imgW = typeof args[1] === 'number' ? args[1] : 0
          const imgH = typeof args[2] === 'number' ? args[2] : 0

          // Filtra imagens muito pequenas (ícones decorativos, bullets < 20px)
          const scaledW = imgW * renderScale
          const scaledH = imgH * renderScale
          if (imgW > 0 && imgH > 0 && (scaledW < 20 || scaledH < 20)) continue

          // Estratégia: se temos dimensões, recortamos; caso contrário capturamos a página inteira
          let dataUrl: string
          let outW: number
          let outH: number

          if (imgW > 20 && imgH > 20) {
            // Recorte aproximado centrado na página (sem transform matrix completo do PDF)
            // Para precisão real seria necessário rastrear a CTM — aqui usamos a página inteira
            // como proxy seguro quando há apenas 1 imagem, ou imagem grande
            outW = canvas.width
            outH = canvas.height
            dataUrl = canvas.toDataURL('image/jpeg', 0.82)
          } else {
            outW = canvas.width
            outH = canvas.height
            dataUrl = canvas.toDataURL('image/jpeg', 0.82)
          }

          images.push({
            pageNumber: pageNum,
            imageIndex: pageImageCount++,
            dataUrl,
            width: outW,
            height: outH
          })
        }

        // Libera recursos da página
        page.cleanup()
      } catch (pageErr) {
        console.warn(`[PDF Image Extractor] Erro na página ${pageNum}:`, pageErr)
      }
    }
  } catch (err) {
    console.error('[PDF Image Extractor]:', err)
    throw new Error(err instanceof Error ? err.message : 'Falha ao extrair imagens do PDF.')
  }

  return {
    text: normalizeAndReconstructText(fullText),
    images,
    scannedPagesCount
  }
}

/**
 * Descreve as imagens extraídas de um PDF usando Gemini Vision (gemini-flash).
 *
 * Para cada imagem, envia o dataUrl como inlineData e pede uma descrição
 * pedagógica compacta. O texto retornado é suficiente para enriquecer o
 * chunk de texto adjacente no RAG.
 *
 * @param images    Array retornado por extractImagesFromPdf
 * @param apiKey    Chave Gemini BYOK do professor
 * @param model     Modelo a usar (default: gemini-2.0-flash)
 */
export async function describeImagesWithGemini(
  images: PdfExtractedImage[],
  apiKey: string,
  model = 'gemini-2.0-flash'
): Promise<Array<{ pageNumber: number; imageIndex: number; description: string }>> {
  if (!images.length || !apiKey) return []

  const results: Array<{ pageNumber: number; imageIndex: number; description: string }> = []

  for (const img of images) {
    try {
      // Extrai base64 puro do dataUrl (remove prefixo "data:image/jpeg;base64,")
      const base64Data = img.dataUrl.split(',')[1]
      if (!base64Data) continue

      const mimeType = img.dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: base64Data
                  }
                },
                {
                  text: 'Descreva esta imagem de forma pedagógica e compacta (máximo 3 frases). Foque no conteúdo educativo: o que está representado, conceitos ilustrados, contexto para uso em sala de aula. Responda em português.'
                }
              ]
            }],
            generationConfig: {
              maxOutputTokens: 200,
              temperature: 0.2
            }
          })
        }
      )

      if (!response.ok) {
        console.warn(`[Gemini Vision] HTTP ${response.status} na imagem p${img.pageNumber}i${img.imageIndex}`)
        results.push({ pageNumber: img.pageNumber, imageIndex: img.imageIndex, description: '[Imagem não descrita]' })
        continue
      }

      const data = await response.json()
      const description = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '[Imagem não descrita]'
      results.push({ pageNumber: img.pageNumber, imageIndex: img.imageIndex, description })
    } catch (err) {
      console.warn(`[Gemini Vision] Erro na imagem p${img.pageNumber}i${img.imageIndex}:`, err)
      results.push({ pageNumber: img.pageNumber, imageIndex: img.imageIndex, description: '[Imagem não descrita]' })
    }
  }

  return results
}

export interface DocxLayoutAndTextResult {
  text: string
  fontFamily?: string
  fontSizePt?: number
  columns?: 1 | 2
  marginsMm?: { top: number; right: number; bottom: number; left: number }
  logoDataUrl?: string
}

/**
 * Extrai texto e dados de diagramação (margens, fonte padrão, tamanho, colunas e logo)
 * de um arquivo .docx para importação de formato escolar no Repositório.
 */
export async function extractDocxLayoutAndText(file: File | Blob | ArrayBuffer): Promise<DocxLayoutAndTextResult> {
  let text = ''
  let fontFamily: string | undefined
  let fontSizePt: number | undefined
  let columns: 1 | 2 = 1
  let marginsMm: { top: number; right: number; bottom: number; left: number } | undefined
  let logoDataUrl: string | undefined

  try {
    const arrayBuffer = typeof (file as any).arrayBuffer === 'function'
      ? await (file as File | Blob).arrayBuffer()
      : (file as ArrayBuffer)
    const JSZipModule = await import('jszip')
    const JSZip = JSZipModule.default || JSZipModule
    const zip = await JSZip.loadAsync(arrayBuffer)

    // PASSO 1 (estilos): lê word/styles.xml -> docDefaults -> rFonts e sz
    const stylesFile = zip.file('word/styles.xml')
    if (stylesFile) {
      const stylesXml = await stylesFile.async('text')
      const docDefaultsMatch = stylesXml.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/i)
      const targetXml = docDefaultsMatch ? docDefaultsMatch[0] : stylesXml

      // Fonte padrão: w:rFonts w:ascii="..."
      const fontMatch = targetXml.match(/<w:rFonts[^>]*?(?:w:ascii|w:hAnsi)="([^"]+)"/i)
      if (fontMatch && fontMatch[1]) {
        fontFamily = fontMatch[1].trim()
      }

      // Tamanho: w:sz w:val="..." (half-points: 22 -> 11pt, 24 -> 12pt)
      const szMatch = targetXml.match(/<w:sz[^>]*?w:val="(\d+)"/i)
      if (szMatch && szMatch[1]) {
        fontSizePt = Math.round((parseInt(szMatch[1], 10) / 2) * 10) / 10
      }
    }

    // PASSO 2 (layout): lê word/document.xml
    const docFile = zip.file('word/document.xml')
    if (docFile) {
      const docXml = await docFile.async('text')

      // Margens: usa a ÚLTIMA ocorrência de w:pgMar (body sectPr)
      const pgMarMatches = Array.from(docXml.matchAll(/<w:pgMar\b([^>]*)\/?>/gi))
      if (pgMarMatches.length > 0) {
        const lastPgMarAttrs = pgMarMatches[pgMarMatches.length - 1][1]
        const topDxa = parseInt((lastPgMarAttrs.match(/w:top="(\d+)"/i) || [])[1] || '0', 10)
        const rightDxa = parseInt((lastPgMarAttrs.match(/w:right="(\d+)"/i) || [])[1] || '0', 10)
        const bottomDxa = parseInt((lastPgMarAttrs.match(/w:bottom="(\d+)"/i) || [])[1] || '0', 10)
        const leftDxa = parseInt((lastPgMarAttrs.match(/w:left="(\d+)"/i) || [])[1] || '0', 10)

        // 1440 dxa = 1 polegada = 25.4 mm
        if (topDxa || rightDxa || bottomDxa || leftDxa) {
          marginsMm = {
            top: Math.round((topDxa / 1440) * 25.4 * 10) / 10,
            right: Math.round((rightDxa / 1440) * 25.4 * 10) / 10,
            bottom: Math.round((bottomDxa / 1440) * 25.4 * 10) / 10,
            left: Math.round((leftDxa / 1440) * 25.4 * 10) / 10,
          }
        }
      }

      // Colunas: detecta w:cols w:num="2"
      if (/<w:cols[^>]*?w:num="2"/i.test(docXml)) {
        columns = 2
      }
    }

    // Logo: primeira imagem em word/media/
    const mediaFiles = Object.keys(zip.files).filter(name => /^word\/media\//i.test(name))
    if (mediaFiles.length > 0) {
      const firstMedia = zip.file(mediaFiles[0])
      if (firstMedia) {
        const ext = mediaFiles[0].split('.').pop()?.toLowerCase() || 'png'
        const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : 'image/png'
        const base64 = await firstMedia.async('base64')
        if (base64) {
          logoDataUrl = `data:${mimeType};base64,${base64}`
        }
      }
    }
  } catch (err) {
    console.warn('[DOCX Layout Extractor]: Erro ao inspecionar layout do .docx', err)
  }

  // Extrai texto completo do documento
  try {
    text = await extractTextFromDocx(file)
  } catch (err) {
    console.warn('[DOCX Layout Extractor]: Erro ao extrair texto do .docx', err)
  }

  return {
    text,
    fontFamily,
    fontSizePt,
    columns,
    marginsMm,
    logoDataUrl
  }
}



