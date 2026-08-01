/**
 * exportUtils.ts — Exportação nativa de Provas, Planos de Aula e Relatórios para PDF e Microsoft Word (.docx)
 */

import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

/**
 * Exporta qualquer elemento da tela para um arquivo PDF formatado para impressão
 */
export async function exportElementToPdf(elementId: string, filename: string = 'documento.pdf'): Promise<void> {
  const element = document.getElementById(elementId)
  if (!element) {
    throw new Error(`Elemento #${elementId} não encontrado para exportação em PDF.`)
  }

  try {
    const canvas = await html2canvas(element, {
      scale: 2, // Alta definição (300 DPI equivalente)
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    })

    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const imgWidth = 210 // Largura A4 em mm
    const pageHeight = 297 // Altura A4 em mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    let heightLeft = imgHeight
    let position = 0

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight

    while (heightLeft >= 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
    }

    pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
  } catch (error) {
    console.error('[PDF Export Error]:', error)
    throw new Error('Falha ao gerar o PDF. Verifique se o elemento está visível na tela.')
  }
}

/**
 * Exporta conteúdo HTML formatado diretamente para um arquivo do Microsoft Word (.docx / .doc)
 */
export function exportToWord(title: string, htmlContent: string, filename: string = 'prova.docx'): void {
  const header = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' 
          xmlns:w='urn:schemas-microsoft-com:office:word' 
          xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${title}</title>
      <style>
        body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; line-height: 1.5; color: #111111; margin: 1in; }
        h1 { font-size: 18pt; color: #8b5e3c; margin-bottom: 8px; border-bottom: 2px solid #8b5e3c; padding-bottom: 4px; }
        h2 { font-size: 14pt; color: #2c1a0e; margin-top: 16px; margin-bottom: 6px; }
        h3 { font-size: 12pt; color: #4a3525; margin-top: 12px; margin-bottom: 4px; }
        p { margin-bottom: 10px; }
        .header-box { border: 1px solid #cccccc; padding: 12px; margin-bottom: 20px; background-color: #fcfbfa; }
        .question { margin-bottom: 16px; page-break-inside: avoid; }
        .option { margin-left: 20px; margin-bottom: 4px; }
        .answer-key { margin-top: 30px; border-top: 2px dashed #8b5e3c; padding-top: 15px; }
      </style>
    </head>
    <body>
  `
  const footer = `</body></html>`
  const fullSource = header + htmlContent + footer

  const blob = new Blob(['\ufeff' + fullSource], {
    type: 'application/msword'
  })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.docx') || filename.endsWith('.doc') ? filename : `${filename}.docx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
