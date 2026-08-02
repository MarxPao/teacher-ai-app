/**
 * pdfExtractor.ts — Extração nativa de texto de arquivos PDF e DOCX no navegador
 * Suporta livros didáticos, apostilas e arquivos do Word via PDF.js e XML Parsing.
 */

export async function extractTextFromPdf(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    let pdfjsLib = (window as any).pdfjsLib

    // Tenta carregar PDF.js dinamicamente se ainda não estiver no window
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

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
    const pdf = await loadingTask.promise
    let fullText = ''
    let totalCharCount = 0

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageStrings = textContent.items
        .map((item: any) => item.str || '')
        .filter((str: string) => str.trim().length > 0)
      
      const pageText = pageStrings.join(' ')
      totalCharCount += pageText.replace(/\s+/g, '').length

      fullText += `--- Página ${i} ---\n` + pageText + '\n\n'
    }

    // Tratamento de PDFs escaneados / imagens sem camada de texto
    if (totalCharCount < 40 && pdf.numPages > 0) {
      throw new Error(
        `O PDF "${file.name}" parece ser escaneado ou uma imagem sem camada de texto selecionável (0 caracteres de texto encontrados em ${pdf.numPages} páginas). Para que a IA possa ler este livro no RAG, por favor forneça um PDF com texto pesquisável ou converta o material para .txt / .docx.`
      )
    }

    // Limpeza de hífens no final da linha (ex: inter-\nnational -> international)
    const cleanedText = fullText
      .replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2')
      .replace(/[ \t]+/g, ' ')
      .trim()

    return cleanedText
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

    // Extrai o conteúdo entre as tags <w:t>...</w:t> e quebras de parágrafo <w:p>
    const paragraphs: string[] = []
    const pMatches = documentXml.match(/<w:p\b[^>]*>(.*?)<\/w:p>/g) || [documentXml]

    for (const pXml of pMatches) {
      const tMatches = Array.from(pXml.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/g)).map(m => m[1])
      const pText = tMatches.join('').trim()
      if (pText) {
        paragraphs.push(pText)
      }
    }

    const fullText = paragraphs.join('\n\n')

    if (fullText.length < 20) {
      throw new Error(`O arquivo Word "${file.name}" está vazio ou não possui texto extraível.`)
    }

    return fullText
  } catch (error: unknown) {
    console.error('[DOCX Extractor Error]:', error)
    throw new Error(error instanceof Error ? error.message : 'Falha ao extrair texto do arquivo Word.')
  }
}
