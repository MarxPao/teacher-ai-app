/**
 * pdfExtractor.ts — Extração nativa de texto de arquivos PDF no navegador
 * Suporta livros didáticos, apostilas e provas escaneadas via PDF.js
 */

export async function extractTextFromPdf(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const pdfjsLib = (window as any).pdfjsLib

    if (!pdfjsLib) {
      // Carrega pdfjs dinamicamente via CDN se não estiver no bundle
      await new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
        script.onload = resolve
        script.onerror = reject
        document.head.appendChild(script)
      })
    }

    const lib = (window as any).pdfjsLib
    if (lib && lib.GlobalWorkerOptions) {
      lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    }

    const pdf = await lib.getDocument({ data: arrayBuffer }).promise
    let fullText = ''

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageStrings = textContent.items.map((item: any) => item.str)
      fullText += `--- Página ${i} ---\n` + pageStrings.join(' ') + '\n\n'
    }

    return fullText.trim()
  } catch (error: unknown) {
    console.error('[PDF Extractor Error]:', error)
    throw new Error(error instanceof Error ? error.message : 'Falha ao extrair texto do PDF.')
  }
}
