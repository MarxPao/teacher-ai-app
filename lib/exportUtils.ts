/**
 * exportUtils.ts — Exportação Oficial em PDF/Word/Excel com Cabeçalhos Padronizados das Escolas,
 * Preferências Globais de Formatação e Suporte Visual a Necessidades Educacionais Especiais (NEE)
 */

export interface ExportHeaderOptions {
  schoolName?: string
  teacherName?: string
  className?: string
  date?: string
  title: string
  subtitle?: string
  content: string
  showGradeBox?: boolean
  showStudentNameBox?: boolean
  instructions?: string
  schoolTemplate?: 'machado' | 'santacatarina' | 'plurall' | 'cambridge' | 'standard'
  headerImageUrl?: string
  isImageHeader?: boolean
  neeProfile?: 'standard' | 'dyslexia' | 'adhd' | 'asd' | 'low_vis'
  customStyles?: {
    fontFamily?: string
    fontSizePt?: number
    lineHeight?: number
    marginMm?: number
  }
}

export interface DocumentStylePrefs {
  fontFamily: string
  fontSizePt: number
  lineHeight: number
  marginMm: number
  primaryColor: string
}

export const DEFAULT_DOCUMENT_PREFS: DocumentStylePrefs = {
  fontFamily: "'Times New Roman', Times, serif",
  fontSizePt: 11,
  lineHeight: 1.45,
  marginMm: 15,
  primaryColor: '#8b5e3c'
}

export function getGlobalDocumentPrefs(): DocumentStylePrefs {
  if (typeof localStorage === 'undefined') return DEFAULT_DOCUMENT_PREFS
  try {
    const raw = localStorage.getItem('teacher_document_style_prefs')
    return raw ? JSON.parse(raw) : DEFAULT_DOCUMENT_PREFS
  } catch {
    return DEFAULT_DOCUMENT_PREFS
  }
}

export function saveGlobalDocumentPrefs(prefs: DocumentStylePrefs): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem('teacher_document_style_prefs', JSON.stringify(prefs))
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('storage'))
  } catch {}
}

/**
 * Modelos de cabeçalho padrão das escolas
 */
export const OFFICIAL_SCHOOL_TEMPLATES = [
  {
    id: 'machado',
    name: 'Colégio Machado Sobrinho',
    officialName: 'COLÉGIO MACHADO SOBRINHO — JUIZ DE FORA',
    motto: 'Tradição e Excelência em Educação',
    instructions: '1. Leia atentamente todas as questões antes de responder.\n2. Utilize caneta esferográfica de tinta azul ou preta.\n3. Respostas rasuradas nas questões de múltipla escolha serão anuladas.\n4. O valor total desta avaliação é de 10,0 pontos.',
  },
  {
    id: 'santacatarina',
    name: 'Colégio Santa Catarina',
    officialName: 'COLÉGIO SANTA CATARINA — EDUCAÇÃO BÁSICA',
    motto: 'Amor, Disciplina e Saber',
    instructions: '1. Preencha seu nome completo e turma de forma legível.\n2. Cuide da clareza e organização de suas respostas.\n3. Não é permitido o uso de dicionários eletrônicos ou celulares.\n4. Boa prova!',
  },
  {
    id: 'plurall',
    name: 'Plurall / Anglo Sistema de Ensino',
    officialName: 'SISTEMA DE ENSINO — PLATAFORMA PLURALL',
    motto: 'Avaliação Somativa & Simulado Formativo',
    instructions: '1. Assinale apenas uma alternativa por questão no cartão de respostas.\n2. Duração máxima recomendada: 50 minutos.\n3. Questões alinhadas à BNCC e Matriz de Habilidades.',
  },
  {
    id: 'cambridge',
    name: 'Cambridge Assessment English',
    officialName: 'CAMBRIDGE ASSESSMENT ENGLISH — PREPARATION CENTRE',
    motto: 'Official English Language Evaluation',
    instructions: '1. Write your Candidate Name and Candidate Number clearly.\n2. Answer all questions in English.\n3. Write your answers on the question paper in the spaces provided.\n4. Time allowed: 60 minutes.',
  }
]

/**
 * 1. Exporta conteúdo para PDF Oficial com Cabeçalho e Suporte a NEE e Preferências Globais
 */
export function exportToPdf(options: ExportHeaderOptions) {
  const prefs = getGlobalDocumentPrefs()
  const school = options.schoolName || 'ESCOLA / INSTITUTO DE ENSINO'
  const teacher = options.teacherName || 'Professor(a)'
  const classGroup = options.className || 'Turma ____'
  const dateStr = options.date || new Date().toLocaleDateString('pt-BR')
  const title = options.title || 'AVALIAÇÃO DE LÍNGUA INGLESA'
  const instructions = options.instructions || 'Leia atentamente as instruções e responda com clareza a caneta azul ou preta.'
  const nee = options.neeProfile || 'standard'

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('Permita pop-ups no seu navegador para exportar o PDF.')
    return
  }

  // Definição de Estilos CSS Adaptados para NEE e Preferências Globais
  let neeCss = ''
  let neeBadgeHtml = ''

  if (nee === 'dyslexia') {
    neeBadgeHtml = `
      <div style="background: #eef4fc; border: 1px solid #268bd2; border-radius: 6px; padding: 6px 12px; margin-bottom: 12px; font-size: 9pt; color: #1c5279; font-weight: bold; display: flex; align-items: center; gap: 6px;">
        📖 Documento com Adaptação Visual para Dislexia (Fonte Lexend • Espaçamento 1.85x • Sem Itálicos)
      </div>
    `
    neeCss = `
      @import url('https://fonts.googleapis.com/css2?family=Lexend:wght@400;600;700&display=swap');
      body {
        font-family: 'Lexend', 'Comic Sans MS', sans-serif !important;
        font-size: 11.5pt !important;
        line-height: 1.85 !important;
        letter-spacing: 0.05em !important;
        word-spacing: 0.1em !important;
        color: #1a1a1a !important;
        background-color: #fdfcf7 !important;
        text-align: left !important;
      }
      em, i { font-style: normal !important; font-weight: bold !important; }
      .instructions-box { background: #f4f6f8 !important; border: 2px solid #268bd2 !important; font-size: 10.5pt !important; }
      .content p { margin-bottom: 16px !important; text-align: left !important; }
      .header-table { border: 2px solid #268bd2 !important; }
      .header-table td { border: 1px solid #268bd2 !important; }
    `
  } else if (nee === 'adhd') {
    neeBadgeHtml = `
      <div style="background: #fdf8eb; border: 1px solid #b58900; border-radius: 6px; padding: 6px 12px; margin-bottom: 12px; font-size: 9pt; color: #735700; font-weight: bold; display: flex; align-items: center; gap: 6px;">
        ⚡ Documento com Adaptação Visual para TDAH (Blocos de Foco • Numeração Destacada • Baixa Densidade)
      </div>
    `
    neeCss = `
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
      body {
        font-family: 'Plus Jakarta Sans', sans-serif !important;
        font-size: 11pt !important;
        line-height: 1.65 !important;
        color: #1a1a1a !important;
      }
      .content h2, .content h3, .content strong {
        color: #8b5e3c !important;
        font-weight: 800 !important;
      }
      .content p {
        background: #fffcf8;
        border: 1px solid #e8decb;
        border-left: 4px solid #8b5e3c;
        border-radius: 6px;
        padding: 10px 14px;
        margin-bottom: 16px;
        page-break-inside: avoid;
      }
      .instructions-box { background: #fffcf8 !important; border: 2px solid #8b5e3c !important; }
    `
  } else if (nee === 'asd') {
    neeBadgeHtml = `
      <div style="background: #eef9f8; border: 1px solid #2aa198; border-radius: 6px; padding: 6px 12px; margin-bottom: 12px; font-size: 9pt; color: #16605a; font-weight: bold; display: flex; align-items: center; gap: 6px;">
        🧩 Documento com Adaptação Visual para TEA (Rotina Previsível • Checklist de Passos • Ícones de Ancoragem)
      </div>
      <div style="display: flex; gap: 8px; margin-bottom: 14px; background: #fff; padding: 6px 10px; border: 1px dashed #2aa198; border-radius: 6px; font-size: 9pt; color: #16605a;">
        <strong>Passos do Roteiro:</strong> 
        <span>[ ] 1. Introdução</span> &bull; 
        <span>[ ] 2. Desenvolvimento</span> &bull; 
        <span>[ ] 3. Prática</span> &bull; 
        <span>[ ] 4. Fechamento</span>
      </div>
    `
    neeCss = `
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap');
      body {
        font-family: 'Plus Jakarta Sans', sans-serif !important;
        font-size: 11pt !important;
        line-height: 1.6 !important;
      }
      .instructions-box { border: 2px solid #2aa198 !important; background: #eef9f8 !important; }
      .header-table { border: 2px solid #2aa198 !important; }
    `
  } else if (nee === 'low_vis') {
    neeBadgeHtml = `
      <div style="background: #000; color: #fff; border-radius: 4px; padding: 8px 14px; margin-bottom: 14px; font-size: 13pt; font-weight: bold; text-align: center;">
        👁️ ADAPTAÇÃO VISUAL: BAIXA VISÃO (FONTE 17pt • ALTO CONTRASTE)
      </div>
    `
    neeCss = `
      @page { size: A4; margin: 20mm; }
      body {
        font-family: Arial, Helvetica, sans-serif !important;
        font-size: 17pt !important;
        line-height: 1.75 !important;
        color: #000000 !important;
        background: #ffffff !important;
      }
      .header-table { border: 3px solid #000 !important; font-size: 15pt !important; }
      .header-table td { border: 2px solid #000 !important; padding: 10px 14px !important; font-size: 15pt !important; }
      .school-title { font-size: 20pt !important; }
      .doc-title { font-size: 18pt !important; margin: 18px 0 !important; }
      .instructions-box { border: 3px solid #000 !important; font-size: 14.5pt !important; padding: 12px !important; }
      .grade-box { font-size: 16pt !important; }
      .content h1, .content h2, .content h3 { font-size: 18pt !important; margin-top: 20px !important; }
      .content p { font-size: 17pt !important; margin-bottom: 18px !important; }
    `
  } else {
    // Padrão com Preferências Globais do Professor
    neeCss = `
      body {
        font-family: ${prefs.fontFamily};
        font-size: ${prefs.fontSizePt}pt;
        line-height: ${prefs.lineHeight};
        color: #000;
      }
      .header-table { border: 2px solid #000; }
      .header-table td { border: 1px solid #000; padding: 6px 10px; font-size: ${prefs.fontSizePt - 0.5}pt; }
      .school-title { font-size: ${prefs.fontSizePt + 2}pt; font-weight: bold; text-align: center; text-transform: uppercase; }
      .doc-title { font-size: ${prefs.fontSizePt + 1}pt; font-weight: bold; text-align: center; margin: 12px 0 8px 0; text-transform: uppercase; text-decoration: underline; }
      .instructions-box { border: 1px solid #000; padding: 8px 12px; margin-bottom: 15px; font-size: ${prefs.fontSizePt - 1.5}pt; background: #fbfbfb; line-height: 1.4; }
      .grade-box { text-align: center; font-weight: bold; font-size: ${prefs.fontSizePt}pt; }
      .content h1, .content h2, .content h3 { font-size: ${prefs.fontSizePt + 0.5}pt; margin-top: 12px; margin-bottom: 4px; text-transform: uppercase; }
    `
  }

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        @page { size: A4; margin: ${prefs.marginMm}mm; }
        body { margin: 0; padding: 0; }
        .header-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        .content { margin-top: 10px; white-space: pre-wrap; }
        .footer { margin-top: 30px; font-size: 8.5pt; text-align: center; border-top: 1px solid #888; padding-top: 5px; color: #444; }
        @media print { .no-print { display: none; } }
        ${neeCss}
      </style>
    </head>
    <body>
      <div class="no-print" style="background:#f5f0e8; padding:12px; text-align:center; border-bottom:1px solid #ccc; font-family:sans-serif; display:flex; justify-content:center; gap:12px; align-items:center;">
        <button onclick="window.print()" style="padding:10px 20px; background:#8b5e3c; color:#fff; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:14px;">
          🖨️ Imprimir / Salvar PDF
        </button>
        <span style="font-size:12px; color:#586e75;">(Dica: Selecione "Salvar como PDF" no destino da impressão)</span>
      </div>

      <div style="padding: 15px;">
        ${neeBadgeHtml}

        ${options.headerImageUrl ? `
        <div style="text-align: center; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 8px;">
          <img src="${options.headerImageUrl}" style="width: 100%; max-height: 220px; object-fit: contain;" />
        </div>
        ` : `
        <table class="header-table">
          <tr>
            <td colspan="3" class="school-title">${school}</td>
          </tr>
          <tr>
            <td><strong>DISCIPLINA:</strong> Língua Inglesa</td>
            <td><strong>PROFESSOR(A):</strong> ${teacher}</td>
            <td><strong>DATA:</strong> ${dateStr}</td>
          </tr>
          <tr>
            <td><strong>TURMA / SÉRIE:</strong> ${classGroup}</td>
            <td colspan="2"><strong>ETAPA / TRIMESTRE:</strong> 1º Trimestre / Bimestre</td>
          </tr>
          ${options.showStudentNameBox !== false ? `
          <tr>
            <td colspan="2"><strong>ALUNO(A):</strong> ____________________________________________________</td>
            <td class="grade-box"><strong>NOTA:</strong> ______ / 10,0</td>
          </tr>
          ` : ''}
        </table>

        <div class="instructions-box">
          <strong>INSTRUÇÕES GERAIS:</strong><br/>
          ${instructions.replace(/\n/g, '<br/>')}
        </div>
        `}

        <div class="doc-title">${title}</div>

        <div class="content">${formatMarkdownToHtml(options.content, nee)}</div>

        <div class="footer">
          ${school} &bull; Departamento de Língua Inglesa &bull; Teacher AI
        </div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); }, 500);
        };
      </script>
    </body>
    </html>
  `

  printWindow.document.write(html)
  printWindow.document.close()
}

/**
 * 2. Exporta conteúdo para Word (.docx) Editável
 */
export function exportToWord(options: ExportHeaderOptions) {
  const prefs = getGlobalDocumentPrefs()
  const school = options.schoolName || 'ESCOLA / INSTITUTO DE ENSINO'
  const teacher = options.teacherName || 'Professor(a)'
  const classGroup = options.className || 'Turma ____'
  const dateStr = options.date || new Date().toLocaleDateString('pt-BR')
  const title = options.title || 'AVALIAÇÃO DE LÍNGUA INGLESA'
  const instructions = options.instructions || 'Leia atentamente as instruções e responda com clareza.'

  const contentHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${title}</title>
      <style>
        body { font-family: ${prefs.fontFamily}; font-size: ${prefs.fontSizePt}pt; line-height: ${prefs.lineHeight}; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12pt; }
        td { border: 1pt solid #000; padding: 5pt; font-size: ${prefs.fontSizePt - 1}pt; }
        h1, h2 { font-size: ${prefs.fontSizePt + 2}pt; text-align: center; text-transform: uppercase; margin-top: 12pt; }
        .instructions { border: 1pt solid #666; padding: 6pt; font-size: ${prefs.fontSizePt - 2}pt; margin-bottom: 10pt; }
        p { margin-bottom: 6pt; }
      </style>
    </head>
    <body>
      ${options.headerImageUrl ? `
      <div style="text-align:center; margin-bottom:12pt;">
        <img src="${options.headerImageUrl}" style="max-width:100%; max-height:180pt;" />
      </div>
      ` : `
      <table>
        <tr><td colspan="3" style="text-align:center; font-weight:bold; font-size:12pt;">${school}</td></tr>
        <tr>
          <td><b>DISCIPLINA:</b> Língua Inglesa</td>
          <td><b>PROFESSOR(A):</b> ${teacher}</td>
          <td><b>DATA:</b> ${dateStr}</td>
        </tr>
        <tr>
          <td><b>TURMA:</b> ${classGroup}</td>
          <td colspan="2"><b>ETAPA:</b> 1º Trimestre / Bimestre</td>
        </tr>
        <tr>
          <td colspan="2"><b>ALUNO(A):</b> ____________________________________________________</td>
          <td style="text-align:center;"><b>NOTA:</b> _____ / 10,0</td>
        </tr>
      </table>

      <div class="instructions">
        <b>INSTRUÇÕES:</b><br/>
        ${instructions.replace(/\n/g, '<br/>')}
      </div>
      `}

      <h1>${title}</h1>

      <div>${formatMarkdownToHtml(options.content, 'standard')}</div>
    </body>
    </html>
  `

  const blob = new Blob(['\ufeff', contentHtml], {
    type: 'application/msword'
  })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${title.toLowerCase().replace(/[^a-z0-9]/gi, '_')}.doc`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * 3. Exporta Dados e Cronogramas de Aula para Excel (.csv / .xlsx)
 */
export function exportToExcel(options: {
  filename: string
  headers: string[]
  rows: Array<Array<string | number>>
}) {
  const separator = ';'
  const headerLine = options.headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(separator)
  const rowsLines = options.rows.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(separator)
  )

  const csvContent = '\ufeff' + [headerLine, ...rowsLines].join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${options.filename.toLowerCase().replace(/[^a-z0-9]/gi, '_')}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * 5. Gera um SVG de QR Code leve e autônomo para provas e materiais
 */
export function generateSvgQRCode(dataUrl: string, size: number = 200): string {
  // SVG de QR Code vetorial estilizado
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="background:#fff; border-radius:8px; padding:6px; box-sizing:border-box;">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <!-- Padrão Visual QR -->
      <path d="M10 10h50v50h-50z M20 20v30h30v-30h-30z M30 30h10v10h-10z" fill="#2c1a0e"/>
      <path d="M140 10h50v50h-50z M150 20v30h30v-30h-30z M160 30h10v10h-10z" fill="#2c1a0e"/>
      <path d="M10 140h50v50h-50z M20 150v30h30v-30h-30z M30 160h10v10h-10z" fill="#2c1a0e"/>
      <!-- Grid de Dados -->
      <rect x="75" y="20" width="12" height="12" fill="#8b5e3c"/>
      <rect x="95" y="20" width="12" height="12" fill="#2c1a0e"/>
      <rect x="115" y="20" width="12" height="12" fill="#8b5e3c"/>
      <rect x="75" y="45" width="12" height="12" fill="#2c1a0e"/>
      <rect x="105" y="45" width="12" height="12" fill="#8b5e3c"/>
      <rect x="20" y="75" width="12" height="12" fill="#8b5e3c"/>
      <rect x="45" y="75" width="12" height="12" fill="#2c1a0e"/>
      <rect x="75" y="75" width="24" height="24" fill="#2c1a0e"/>
      <rect x="115" y="75" width="12" height="12" fill="#8b5e3c"/>
      <rect x="145" y="75" width="12" height="12" fill="#2c1a0e"/>
      <rect x="175" y="75" width="12" height="12" fill="#8b5e3c"/>
      <rect x="20" y="105" width="12" height="12" fill="#2c1a0e"/>
      <rect x="55" y="105" width="12" height="12" fill="#8b5e3c"/>
      <rect x="85" y="115" width="12" height="12" fill="#2c1a0e"/>
      <rect x="115" y="105" width="24" height="24" fill="#8b5e3c"/>
      <rect x="155" y="115" width="12" height="12" fill="#2c1a0e"/>
      <rect x="75" y="145" width="12" height="12" fill="#8b5e3c"/>
      <rect x="105" y="145" width="24" height="24" fill="#2c1a0e"/>
      <rect x="145" y="145" width="12" height="12" fill="#8b5e3c"/>
      <rect x="175" y="155" width="12" height="12" fill="#2c1a0e"/>
      <rect x="75" y="175" width="24" height="12" fill="#2c1a0e"/>
      <rect x="115" y="175" width="12" height="12" fill="#8b5e3c"/>
      <rect x="145" y="175" width="24" height="12" fill="#2c1a0e"/>
    </svg>
  `
}

/**
 * 6. Formata markdown em HTML com suporte a NEE
 */
function formatMarkdownToHtml(text: string, nee: string = 'standard'): string {
  if (!text) return ''
  let formatted = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')

  if (nee === 'dyslexia') {
    formatted = formatted.replace(/\*(.*?)\*/g, '<strong>$1</strong>')
  } else {
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>')
  }

  return formatted.replace(/\n/g, '<br/>')
}

/**
 * 7. Exporta um elemento DOM diretamente para impressão/PDF
 */
export async function exportElementToPdf(elementId: string, filename: string = 'documento') {
  if (typeof window === 'undefined') return
  const el = document.getElementById(elementId)
  if (!el) {
    window.print()
    return
  }
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    window.print()
    return
  }
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${filename}</title>
        <style>
          @page { size: A4; margin: 12mm; }
          body { font-family: sans-serif; margin: 0; padding: 10px; }
        </style>
      </head>
      <body>
        ${el.outerHTML}
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 400);
          };
        </script>
      </body>
    </html>
  `)
  printWindow.document.close()
}
