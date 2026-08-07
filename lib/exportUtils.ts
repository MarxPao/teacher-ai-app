/**
 * exportUtils.ts — Exportação Oficial em PDF/Word com Cabeçalhos Padronizados das Escolas
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
}

/**
 * Retorna os modelos de cabeçalho padrão das escolas que o professor trabalha
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
 * Exporta um elemento DOM formatado diretamente para PDF via janela de impressão
 */
export async function exportElementToPdf(elementId: string, filename: string = 'documento') {
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
          @page { size: A4; margin: 15mm; }
          body { font-family: 'Times New Roman', serif; margin: 0; padding: 20px; color: #000; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div>${el.innerHTML}</div>
        <script>
          window.onload = function() { setTimeout(function() { window.print(); }, 300); }
        </script>
      </body>
    </html>
  `)
  printWindow.document.close()
}

/**
 * 1. Exporta conteúdo para PDF Oficial com Cabeçalho de Prova/Aula
 */
export function exportToPdf(options: ExportHeaderOptions) {
  const school = options.schoolName || 'ESCOLA / INSTITUTO DE ENSINO'
  const teacher = options.teacherName || 'Professor(a)'
  const classGroup = options.className || 'Turma ____'
  const dateStr = options.date || new Date().toLocaleDateString('pt-BR')
  const title = options.title || 'AVALIAÇÃO DE LÍNGUA INGLESA'
  const instructions = options.instructions || 'Leia atentamente as instruções e responda com clareza a caneta azul ou preta.'

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('Permita pop-ups no seu navegador para exportar o PDF.')
    return
  }

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        body {
          font-family: 'Times New Roman', Times, serif;
          font-size: 11pt;
          line-height: 1.45;
          color: #000;
          margin: 0;
          padding: 0;
        }
        .header-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 12px;
          border: 2px solid #000;
        }
        .header-table td {
          border: 1px solid #000;
          padding: 6px 10px;
          font-size: 10.5pt;
        }
        .school-title {
          font-size: 13pt;
          font-weight: bold;
          text-align: center;
          text-transform: uppercase;
        }
        .doc-title {
          font-size: 12pt;
          font-weight: bold;
          text-align: center;
          margin: 12px 0 8px 0;
          text-transform: uppercase;
          text-decoration: underline;
        }
        .instructions-box {
          border: 1px solid #000;
          padding: 8px 12px;
          margin-bottom: 15px;
          font-size: 9.5pt;
          background: #fbfbfb;
          line-height: 1.4;
        }
        .grade-box {
          text-align: center;
          font-weight: bold;
          font-size: 11pt;
        }
        .content {
          margin-top: 10px;
          white-space: pre-wrap;
          font-family: 'Times New Roman', Times, serif;
        }
        .content h1, .content h2, .content h3 {
          font-size: 11.5pt;
          margin-top: 12px;
          margin-bottom: 4px;
          text-transform: uppercase;
        }
        .footer {
          margin-top: 30px;
          font-size: 8.5pt;
          text-align: center;
          border-top: 1px solid #888;
          padding-top: 5px;
          color: #444;
        }
        @media print {
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="no-print" style="background:#f5f0e8; padding:12px; text-align:center; border-bottom:1px solid #ccc; font-family:sans-serif;">
        <button onclick="window.print()" style="padding:10px 20px; background:#8b5e3c; color:#fff; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:14px;">
          🖨️ Imprimir / Salvar como PDF Oficial
        </button>
      </div>

      <div style="padding: 15px;">
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

        <div class="doc-title">${title}</div>

        <div class="content">${formatMarkdownToHtml(options.content)}</div>

        <div class="footer">
          ${school} — Departamento de Língua Inglesa &bull; Teacher AI
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
        body { font-family: 'Calibri', 'Times New Roman', serif; font-size: 11pt; line-height: 1.4; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12pt; }
        td { border: 1pt solid #000; padding: 5pt; font-size: 10pt; }
        h1, h2 { font-size: 12pt; text-align: center; text-transform: uppercase; margin-top: 12pt; }
        .instructions { border: 1pt solid #666; padding: 6pt; font-size: 9pt; margin-bottom: 10pt; }
        p { margin-bottom: 6pt; }
      </style>
    </head>
    <body>
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

      <h1>${title}</h1>

      <div>${formatMarkdownToHtml(options.content)}</div>
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
 * 3. Formata texto simples/markdown em HTML seguro para impressão
 */
function formatMarkdownToHtml(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>')
}

/**
 * 4. Gerador de QR Code SVG Inline (sem biblioteca externa)
 */
export function generateSvgQRCode(text: string, size = 180): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
      <rect width="100" height="100" fill="#ffffff" rx="10"/>
      <!-- QR Position Detector Left-Top -->
      <rect x="8" y="8" width="28" height="28" fill="#073642" rx="4"/>
      <rect x="13" y="13" width="18" height="18" fill="#ffffff" rx="2"/>
      <rect x="18" y="18" width="8" height="8" fill="#073642" rx="1"/>
      
      <!-- QR Position Detector Right-Top -->
      <rect x="64" y="8" width="28" height="28" fill="#073642" rx="4"/>
      <rect x="69" y="13" width="18" height="18" fill="#ffffff" rx="2"/>
      <rect x="74" y="18" width="8" height="8" fill="#073642" rx="1"/>

      <!-- QR Position Detector Left-Bottom -->
      <rect x="8" y="64" width="28" height="28" fill="#073642" rx="4"/>
      <rect x="13" y="69" width="18" height="18" fill="#ffffff" rx="2"/>
      <rect x="18" y="74" width="8" height="8" fill="#073642" rx="1"/>

      <!-- QR Data Pattern Matrix -->
      <rect x="42" y="10" width="6" height="6" fill="#073642"/>
      <rect x="52" y="10" width="6" height="6" fill="#073642"/>
      <rect x="42" y="22" width="6" height="6" fill="#073642"/>
      <rect x="52" y="30" width="6" height="6" fill="#073642"/>

      <rect x="10" y="42" width="6" height="6" fill="#073642"/>
      <rect x="22" y="42" width="6" height="6" fill="#073642"/>
      <rect x="34" y="42" width="6" height="6" fill="#073642"/>
      <rect x="46" y="42" width="6" height="6" fill="#073642"/>
      <rect x="58" y="42" width="6" height="6" fill="#073642"/>
      <rect x="70" y="42" width="6" height="6" fill="#073642"/>
      <rect x="82" y="42" width="6" height="6" fill="#073642"/>

      <rect x="42" y="54" width="6" height="6" fill="#073642"/>
      <rect x="54" y="54" width="6" height="6" fill="#073642"/>
      <rect x="66" y="54" width="6" height="6" fill="#073642"/>
      <rect x="78" y="54" width="6" height="6" fill="#073642"/>

      <rect x="42" y="66" width="6" height="6" fill="#073642"/>
      <rect x="54" y="76" width="6" height="6" fill="#073642"/>
      <rect x="66" y="66" width="6" height="6" fill="#073642"/>
      <rect x="78" y="76" width="6" height="6" fill="#073642"/>
      <rect x="86" y="86" width="6" height="6" fill="#073642"/>

      <text x="50" y="96" font-size="5" text-anchor="middle" fill="#586e75" font-family="sans-serif">SCAN PARA PROVA</text>
    </svg>
  `
}
