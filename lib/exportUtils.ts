import { toast, showConfirm } from '@/components/Toast'
import {
  SchoolDocumentFormat,
  getDocumentFormatById,
  applySchoolFormatToBodyHtml
} from '@/lib/documentFormatTemplates'
/**
 * @deprecated Módulo de exportação de relatórios da aplicação web legada.
 * exportUtils.ts — Exportação Oficial em PDF/Word/Excel com Cabeçalhos Padronizados das Escolas,
 * Preferências Globais de Formatação e Suporte Visual a Necessidades Educacionais Especiais (NEE)
 */

export interface ExportHeaderOptions {
  schoolName?: string
  teacherName?: string
  className?: string
  subjectName?: string
  date?: string
  title: string
  subtitle?: string
  content: string
  showGradeBox?: boolean
  showStudentNameBox?: boolean
  instructions?: string
  schoolTemplate?: 'machado' | 'santacatarina' | 'plurall' | 'cambridge' | 'standard'
  formatId?: string
  documentFormat?: SchoolDocumentFormat
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

function renderSchoolHeaderHtml(params: {
  fmt: SchoolDocumentFormat
  school: string
  teacher: string
  classGroup: string
  subject: string
  dateStr: string
  instructions: string
  showStudentNameBox: boolean
  headerImageUrl?: string
}): string {
  const { fmt, school, teacher, classGroup, subject, dateStr, instructions, showStudentNameBox, headerImageUrl } = params
  if (headerImageUrl) {
    return `
      <div style="text-align: center; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 8px;">
        <img src="${headerImageUrl}" style="width: 100%; max-height: 220px; object-fit: contain;" />
      </div>
    `
  }

  const accent = fmt.blackAndWhitePrintMode ? '#000000' : (fmt.primaryColor || '#000000')
  const subtitleLine = fmt.officialSchoolSubtitle
    ? `<div style="font-size: 9pt; font-weight: normal; letter-spacing: 0.04em; margin-top: 2px;">${fmt.officialSchoolSubtitle}</div>`
    : ''

  if (fmt.headerStyle === 'minimal_banner') {
    return `
      <div style="border: 2px solid ${accent}; padding: 8px 12px; margin-bottom: 12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid ${accent}; padding-bottom: 4px; margin-bottom: 6px;">
          <strong style="font-size: 11.5pt; text-transform: uppercase;">${school}</strong>
          <span style="font-size: 9.5pt;"><strong>${subject}</strong> &bull; Prof(a). ${teacher} &bull; ${dateStr}</span>
        </div>
        ${showStudentNameBox ? `
        <div style="display:flex; justify-content:space-between; font-size: 9.5pt;">
          <span><strong>ALUNO(A):</strong> _________________________________________________</span>
          <span><strong>TURMA:</strong> ${classGroup}</span>
          <span><strong>NOTA:</strong> _____ / 10,0</span>
        </div>
        ` : `
        <div style="font-size: 9.5pt;"><strong>TURMA / SÉRIE:</strong> ${classGroup}</div>
        `}
      </div>
      ${instructions ? `
      <div class="instructions-box">
        <strong>INSTRUÇÕES:</strong> ${instructions.replace(/\n/g, ' &bull; ')}
      </div>` : ''}
    `
  }

  if (fmt.headerStyle === 'institutional_clean') {
    return `
      <div style="border-bottom: 2px solid ${accent}; padding-bottom: 8px; margin-bottom: 14px;">
        <div style="font-size: 13pt; font-weight: bold; text-transform: uppercase; color: ${accent};">${school}</div>
        ${subtitleLine}
        <div style="display: flex; flex-wrap: wrap; gap: 16px; margin-top: 6px; font-size: 9.5pt;">
          <span><strong>Disciplina:</strong> ${subject}</span>
          <span><strong>Docente:</strong> ${teacher}</span>
          <span><strong>Turma/Série:</strong> ${classGroup}</span>
          <span><strong>Data:</strong> ${dateStr}</span>
        </div>
      </div>
      ${instructions ? `
      <div class="instructions-box">
        <strong>DIRETRIZES / OBJETIVOS DO DOCUMENTO:</strong><br/>
        ${instructions.replace(/\n/g, '<br/>')}
      </div>` : ''}
    `
  }

  if (fmt.headerStyle === 'academic_classic') {
    return `
      <div style="text-align: center; border-top: 2px solid ${accent}; border-bottom: 2px solid ${accent}; padding: 8px 0; margin-bottom: 10px;">
        <div class="school-title" style="color: ${accent};">${school}</div>
        ${subtitleLine}
        <div style="font-size: 9.5pt; margin-top: 4px;">
          <strong>Disciplina:</strong> ${subject} &nbsp;|&nbsp; <strong>Prof(a).:</strong> ${teacher} &nbsp;|&nbsp; <strong>Turma:</strong> ${classGroup} &nbsp;|&nbsp; <strong>Data:</strong> ${dateStr}
        </div>
      </div>
      ${showStudentNameBox ? `
      <table class="header-table" style="margin-bottom: 10px;">
        <tr>
          <td colspan="2"><strong>ALUNO(A):</strong> ____________________________________________________</td>
          <td class="grade-box"><strong>NOTA:</strong> ______ / 10,0</td>
        </tr>
      </table>` : ''}
      ${instructions ? `
      <div class="instructions-box">
        <strong>INSTRUÇÕES GERAIS:</strong><br/>
        ${instructions.replace(/\n/g, '<br/>')}
      </div>` : ''}
    `
  }

  // Default: 'boxed_grid'
  return `
    <table class="header-table">
      <tr>
        <td colspan="3" class="school-title">
          ${school}
          ${subtitleLine}
        </td>
      </tr>
      <tr>
        <td><strong>DISCIPLINA:</strong> ${subject}</td>
        <td><strong>PROFESSOR(A):</strong> ${teacher}</td>
        <td><strong>DATA:</strong> ${dateStr}</td>
      </tr>
      <tr>
        <td><strong>TURMA / SÉRIE:</strong> ${classGroup}</td>
        <td colspan="2"><strong>ETAPA / TRIMESTRE:</strong> 1º Trimestre / Bimestre</td>
      </tr>
      ${showStudentNameBox ? `
      <tr>
        <td colspan="2"><strong>ALUNO(A):</strong> ____________________________________________________</td>
        <td class="grade-box"><strong>NOTA:</strong> ______ / 10,0</td>
      </tr>
      ` : ''}
    </table>

    ${instructions ? `
    <div class="instructions-box">
      <strong>INSTRUÇÕES GERAIS:</strong><br/>
      ${instructions.replace(/\n/g, '<br/>')}
    </div>` : ''}
  `
}

/**
 * 1. Exporta conteúdo para PDF Oficial com Cabeçalho, Formato de Arquivo da Escola e Suporte a NEE
 */
export function exportToPdf(options: ExportHeaderOptions) {
  const prefs = getGlobalDocumentPrefs()
  const fmt = options.documentFormat || getDocumentFormatById(options.formatId, options.schoolName)
  const school = options.schoolName || (fmt.schoolName !== 'Geral' ? fmt.schoolName : 'ESCOLA / INSTITUTO DE ENSINO')
  const teacher = options.teacherName || 'Professor(a)'
  const classGroup = options.className || 'Turma ____'
  const subject = options.subjectName || 'Língua Inglesa'
  const dateStr = options.date || new Date().toLocaleDateString('pt-BR')
  const title = options.title || 'AVALIAÇÃO DE LÍNGUA INGLESA'
  const instructions = options.instructions ?? fmt.defaultInstructions ?? 'Leia atentamente as instruções e responda com clareza a caneta azul ou preta.'
  const nee = options.neeProfile || 'standard'

  const fontFamily = options.customStyles?.fontFamily || fmt.fontFamily || prefs.fontFamily
  const fontSizePt = options.customStyles?.fontSizePt || fmt.fontSizePt || prefs.fontSizePt
  const lineHeight = options.customStyles?.lineHeight || fmt.lineHeight || prefs.lineHeight
  const margins = fmt.marginsMm || { top: prefs.marginMm, right: prefs.marginMm, bottom: prefs.marginMm, left: prefs.marginMm }
  const accentColor = fmt.blackAndWhitePrintMode ? '#000000' : (fmt.primaryColor || '#000000')

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    toast.success('Permita pop-ups no seu navegador para exportar o PDF.')
    return
  }

  // Definição de Estilos CSS Adaptados para NEE e Formato Escolar
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
    // Padrão com Formato de Arquivo da Escola
    neeCss = `
      body {
        font-family: ${fontFamily};
        font-size: ${fontSizePt}pt;
        line-height: ${lineHeight};
        text-align: ${fmt.textAlign || 'justify'};
        color: #000;
      }
      .header-table { border: 2px solid ${accentColor}; }
      .header-table td { border: 1px solid ${accentColor}; padding: 6px 10px; font-size: ${fontSizePt - 0.5}pt; text-align: left; }
      .school-title { font-size: ${fontSizePt + 2}pt; font-weight: bold; text-align: center !important; text-transform: uppercase; color: ${accentColor}; }
      .doc-title { font-size: ${fontSizePt + 1}pt; font-weight: bold; text-align: center; margin: 12px 0 8px 0; text-transform: uppercase; text-decoration: underline; color: ${accentColor}; }
      .instructions-box { border: 1px solid ${accentColor}; padding: 8px 12px; margin-bottom: 15px; font-size: ${fontSizePt - 1.5}pt; background: #fbfbfb; line-height: 1.4; text-align: left; }
      .grade-box { text-align: center !important; font-weight: bold; font-size: ${fontSizePt}pt; }
      .content h1, .content h2, .content h3 { font-size: ${fontSizePt + 0.5}pt; margin-top: 12px; margin-bottom: 4px; text-transform: uppercase; color: ${accentColor}; column-span: all; }
    `
  }

  const rawFormattedContent = prepareDocumentContentForExport(options.content, nee, title)
  const formattedDocContent = applySchoolFormatToBodyHtml(rawFormattedContent, fmt)

  const columnCss =
    fmt.columns === 2 && nee === 'standard'
      ? `column-count: 2; column-gap: ${fmt.columnGapMm || 8}mm; column-rule: ${
          fmt.showColumnDivider ? '1px solid #94a3b8' : 'none'
        };`
      : ''

  const headerHtml = renderSchoolHeaderHtml({
    fmt,
    school,
    teacher,
    classGroup,
    subject,
    dateStr,
    instructions,
    showStudentNameBox: options.showStudentNameBox !== false,
    headerImageUrl: options.headerImageUrl
  })

  const signatureHtml = fmt.showSignatureLine
    ? `
      <div style="display:flex; justify-content:space-around; margin-top: 38px; padding-top: 12px; page-break-inside: avoid;">
        <div style="text-align:center; width: 42%; border-top: 1px solid #000; padding-top: 4px; font-size: 9pt;">
          ${fmt.signatureLabels?.[0] || 'Assinatura do(a) Professor(a)'}
        </div>
        <div style="text-align:center; width: 42%; border-top: 1px solid #000; padding-top: 4px; font-size: 9pt;">
          ${fmt.signatureLabels?.[1] || 'Visto da Coordenação Pedagógica'}
        </div>
      </div>
    `
    : ''

  const footerLabel = fmt.footerText || `${school} • Departamento de ${subject} • Teacher AI`

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        @page { size: ${fmt.paperSize || 'A4'} ${fmt.orientation || 'portrait'}; margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm; }
        body { margin: 0; padding: 0; }
        .header-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        .content { margin-top: 10px; ${columnCss} }
        .content-table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 9.5pt; column-span: all; }
        .content-table th, .content-table td { border: 1px solid #64748b; padding: 6px 10px; text-align: left; vertical-align: top; }
        .content-table th { background-color: #f1f5f9; font-weight: bold; color: #0f172a; }
        .content-table tr:nth-child(even) { background-color: #f8fafc; }
        .content-divider { border: 0; border-top: 1px solid #cbd5e1; margin: 16px 0; column-span: all; }
        .content ul { margin: 6px 0 10px 20px; padding: 0; }
        .content li { margin-bottom: 4px; }
        .content p { margin: 6px 0; }
        .exam-question-item { page-break-inside: avoid; break-inside: avoid; margin-bottom: ${fmt.compactQuestionSpacing ? '10px' : '18px'} !important; padding-bottom: ${fmt.compactQuestionSpacing ? '8px' : '14px'} !important; border-bottom: 1px solid #cbd5e1 !important; }
        .exam-options-list { margin-left: 6px !important; margin-bottom: 8px !important; }
        .exam-option-line { margin-bottom: 3px !important; line-height: 1.4 !important; }
        .teacher-answer-key-sheet { page-break-before: always; break-before: page; margin-top: 24px; padding-top: 12px; column-span: all; }
        .footer { margin-top: 28px; font-size: 8.5pt; text-align: center; border-top: 1px solid #888; padding-top: 5px; color: #333; }
        @media print { .no-print { display: none !important; } }
        ${neeCss}
      </style>
    </head>
    <body>
      <div class="no-print" style="background:#f5f0e8; padding:12px; text-align:center; border-bottom:1px solid #ccc; font-family:sans-serif; display:flex; justify-content:center; gap:12px; align-items:center; flex-wrap:wrap;">
        <button onclick="window.print()" style="padding:10px 20px; background:#8b5e3c; color:#fff; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:14px;">
          🖨️ Imprimir / Salvar PDF
        </button>
        <span style="font-size:12px; color:#5a3e28; font-weight:600;">📐 Formato aplicado: ${fmt.name} (${fmt.columns === 2 ? '2 Colunas' : '1 Coluna'})</span>
        <span style="font-size:12px; color:#7a5c42;">(Dica: Selecione "Salvar como PDF" no destino da impressão)</span>
      </div>

      <div style="padding: 10px 14px;">
        ${neeBadgeHtml}
        ${headerHtml}

        <div class="doc-title">${title}</div>

        <div class="content">${formattedDocContent}</div>

        ${signatureHtml}

        <div class="footer">
          ${footerLabel}
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
 * 2. Exporta conteúdo para Word (.doc) Editável respeitando o Formato de Arquivo da Escola
 */
export function exportToWord(options: ExportHeaderOptions) {
  const prefs = getGlobalDocumentPrefs()
  const fmt = options.documentFormat || getDocumentFormatById(options.formatId, options.schoolName)
  const school = options.schoolName || (fmt.schoolName !== 'Geral' ? fmt.schoolName : 'ESCOLA / INSTITUTO DE ENSINO')
  const teacher = options.teacherName || 'Professor(a)'
  const classGroup = options.className || 'Turma ____'
  const subject = options.subjectName || 'Língua Inglesa'
  const dateStr = options.date || new Date().toLocaleDateString('pt-BR')
  const title = options.title || 'AVALIAÇÃO DE LÍNGUA INGLESA'
  const instructions = options.instructions ?? fmt.defaultInstructions ?? 'Leia atentamente as instruções e responda com clareza.'
  const fontFamily = fmt.fontFamily || prefs.fontFamily
  const fontSizePt = fmt.fontSizePt || prefs.fontSizePt
  const lineHeight = fmt.lineHeight || prefs.lineHeight

  const rawFormattedContent = prepareDocumentContentForExport(options.content, 'standard', title)
  const formattedDocContent = applySchoolFormatToBodyHtml(rawFormattedContent, fmt)

  const headerHtml = renderSchoolHeaderHtml({
    fmt,
    school,
    teacher,
    classGroup,
    subject,
    dateStr,
    instructions,
    showStudentNameBox: options.showStudentNameBox !== false,
    headerImageUrl: options.headerImageUrl
  })

  const signatureHtml = fmt.showSignatureLine
    ? `
      <table style="width:100%; border:none; margin-top:28pt;">
        <tr>
          <td style="border:none; text-align:center; width:45%;">________________________________________<br/>${fmt.signatureLabels?.[0] || 'Assinatura do(a) Professor(a)'}</td>
          <td style="border:none; width:10%;"></td>
          <td style="border:none; text-align:center; width:45%;">________________________________________<br/>${fmt.signatureLabels?.[1] || 'Visto da Coordenação Pedagógica'}</td>
        </tr>
      </table>
    `
    : ''

  const footerLabel = fmt.footerText || `${school} • Departamento de ${subject} • Teacher AI`

  const contentHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${title}</title>
      <style>
        @page Section1 {
          size: ${fmt.orientation === 'landscape' ? '29.7cm 21.0cm' : '21.0cm 29.7cm'};
          margin: ${fmt.marginsMm.top}mm ${fmt.marginsMm.right}mm ${fmt.marginsMm.bottom}mm ${fmt.marginsMm.left}mm;
        }
        div.Section1 { page: Section1; }
        body { font-family: ${fontFamily}; font-size: ${fontSizePt}pt; line-height: ${lineHeight}; text-align: ${fmt.textAlign || 'justify'}; }
        table.header-table { width: 100%; border-collapse: collapse; margin-bottom: 12pt; }
        table.header-table td { border: 1pt solid #000; padding: 5pt; font-size: ${fontSizePt - 0.5}pt; }
        .school-title { font-size: ${fontSizePt + 2}pt; font-weight: bold; text-align: center; text-transform: uppercase; }
        .instructions-box { border: 1pt solid #444; padding: 6pt; font-size: ${fontSizePt - 1.5}pt; margin-bottom: 10pt; background: #fbfbfb; }
        h1, h2 { font-size: ${fontSizePt + 1.5}pt; text-align: center; text-transform: uppercase; margin-top: 12pt; }
        p { margin-bottom: 6pt; }
        .content-table { width: 100%; border-collapse: collapse; margin-bottom: 12pt; }
        .content-table th, .content-table td { border: 1pt solid #666; padding: 5pt; text-align: left; vertical-align: top; }
        .content-table th { background-color: #f2f2f2; font-weight: bold; }
        .content-divider { border: 0; border-top: 1pt solid #999; margin: 14pt 0; }
        .exam-question-item { margin-bottom: 14pt; padding-bottom: 10pt; border-bottom: 1pt solid #ccc; }
        .exam-option-line { margin-bottom: 3pt; }
        .teacher-answer-key-sheet { page-break-before: always; margin-top: 20pt; }
        ul { margin: 6pt 0 10pt 18pt; padding: 0; }
        li { margin-bottom: 4pt; }
      </style>
    </head>
    <body>
      <div class="Section1">
        ${headerHtml}
        <h1>${title}</h1>
        <div>${formattedDocContent}</div>
        ${signatureHtml}
        <p style="margin-top:24pt; font-size:8.5pt; text-align:center; color:#555; border-top:1pt solid #999; padding-top:4pt;">${footerLabel}</p>
      </div>
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
 * Remove emojis e pictogramas para documentos formais (coordenação, direção, impressão oficial)
 */
export function sanitizeTextForFormalDoc(text: string): string {
  if (!text) return ''
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
    .trim()
}

/**
 * Formata inline markdown (negrito, itálico/ênfase e escapes)
 */
export function formatInlineMarkdown(text: string, nee: string = 'standard'): string {
  if (!text) return ''
  let formatted = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')

  if (nee === 'dyslexia') {
    formatted = formatted.replace(/\*(.*?)\*/g, '<strong>$1</strong>')
  } else {
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>')
  }

  return formatted
}

/**
 * Prepara o conteúdo da PROVA DO ALUNO (Documento 1) para exportação em PDF/Word:
 * - Se o conteúdo já for HTML estruturado (ex: gerado por compileQuestionsToHtml),
 *   preserva o HTML sem escapar tags e REMOVE integralmente qualquer bloco `.exam-answer-key`
 *   (o gabarito e o reasoning pedagógico são exportados em documentos independentes).
 * - Caso contrário, converte Markdown para HTML via formatMarkdownToHtml.
 */
export function prepareDocumentContentForExport(
  content: string,
  nee: string = 'standard',
  _docTitle: string = 'AVALIAÇÃO'
): string {
  if (!content) return ''
  const trimmed = content.trim()
  const isStructuredHtml =
    trimmed.includes('class="generated-exam-document"') ||
    trimmed.includes('class="exam-question-item"') ||
    /^\s*<(div|table|h[1-6]|p|section|article|ol|ul)\b/i.test(trimmed)

  if (!isStructuredHtml) {
    return formatMarkdownToHtml(content, nee)
  }

  // Remove gabaritos inline (.exam-answer-key) para que a Prova do Aluno contenha exclusivamente os itens de avaliação
  return trimmed.replace(/<div\s+class="exam-answer-key"[^>]*>[\s\S]*?<\/div>/gi, '')
}

/**
 * Constrói o HTML exclusivo do DOCUMENTO 2 — FOLHA DE GABARITO OFICIAL (separado da prova e do relatório de reasoning).
 */
export function formatAnswerKeyAsPlainText(params: {
  questions?: Array<any>
  title?: string
  school?: string
  subject?: string
}): string {
  const questions = Array.isArray(params.questions) ? params.questions : []
  const lines: string[] = []
  if (params.school) lines.push(params.school)
  if (params.title) lines.push(params.title)
  lines.push('DOCUMENTO EXCLUSIVO DO PROFESSOR')
  lines.push('')
  questions.forEach((q, idx) => {
    const num = idx + 1
    const pts = typeof q.points === 'number' ? `${q.points.toFixed(1)} pt` : '1.0 pt'
    const rawKey = String(q.correctOptionId ?? q.answerKey ?? '—').trim()
    const letterMatch = rawKey.match(/^([A-Z])\)/)
    const keyDisplay = letterMatch ? `${letterMatch[1]}) ${rawKey.replace(/^[A-Z]\)\s*/, '')}` : rawKey
    lines.push(`Item ${num} [${pts}]: ${keyDisplay}`)
    if (q.explanation) lines.push(`Resolução: ${q.explanation}`)
    lines.push('')
  })
  return lines.join('\n')
}

export function buildStandaloneAnswerKeyHtml(params: {
  questions?: Array<any>
  rawContent?: string
  title?: string
  documentFormat?: any
}): string {
  const fontFamily = params.documentFormat?.fontFamily ?? 'inherit'
  const questions = Array.isArray(params.questions) ? params.questions : []
  const rows: Array<{
    num: number
    typeLabel: string
    points: string
    key: string
    resolutionText: string
    explanation?: string
    rubric?: any
  }> = []

  if (questions.length > 0) {
    questions.forEach((q, idx) => {
      const num = idx + 1
      const rawKey = String(q.correctOptionId ?? q.answerKey ?? '—').trim()
      // Extract leading letter from formats like 'B) Paris' or 'B'
      const letterMatch = rawKey.match(/^([A-Za-z])\)/)
      const keyLetter = letterMatch ? letterMatch[1].toUpperCase() : rawKey.toUpperCase()
      const opts = Array.isArray(q.options) ? q.options : []
      const matchedOpt = opts.find(
        (o: any) => String(o.id ?? o.letter ?? '').trim().toUpperCase() === keyLetter
      )
      const typeMap: Record<string, string> = {
        multiple_choice: 'Múltipla Escolha',
        true_false: 'Verdadeiro / Falso',
        fill_in_blank: 'Lacunas (Gap Fill)',
        gap_fill: 'Lacunas (Gap Fill)',
        discursive: 'Dissertativa',
        open_ended: 'Resposta Aberta',
        matching: 'Associação',
        reading_text: 'Interpretação'
      }
      const typeLabel = q.typeLabel || typeMap[String(q.type || '')] || 'Objetiva / Discursiva'
      const pts = typeof q.points === 'number' ? `${q.points.toFixed(1)} pt` : '1.0 pt'
      const resolutionText = matchedOpt
        ? `<strong>${keyLetter})</strong> ${matchedOpt.text}`
        : rawKey

      rows.push({
        num,
        typeLabel,
        points: pts,
        key: opts.length > 0 ? keyLetter : 'Aberta',
        resolutionText,
        explanation: q.explanation,
        rubric: q.rubric
      })
    })
  } else if (params.rawContent) {
    let qCounter = 0
    const regex = /<div\s+class="exam-answer-key"[^>]*>([\s\S]*?)<\/div>/gi
    let match: RegExpExecArray | null
    while ((match = regex.exec(params.rawContent)) !== null) {
      qCounter++
      const cleaned = match[1]
        .replace(/<strong>\s*✓?\s*Gabarito\s*(?:\/\s*Resolução)?\s*:\s*<\/strong>/i, '')
        .trim()
      rows.push({
        num: qCounter,
        typeLabel: 'Item da Avaliação',
        points: '1.0 pt',
        key: cleaned.length <= 3 ? cleaned.toUpperCase() : 'Resolução',
        resolutionText: cleaned
      })
    }
  }

  const rowsHtml =
    rows.length > 0
      ? rows
          .map(r => {
            const explanationHtml = r.explanation
              ? `<div style="margin-top:4px;color:#334155;font-size:9.5pt;"><strong>Padrão de Resposta Esperado:</strong> ${r.explanation}</div>`
              : ''
            const rubricHtml = r.rubric?.criteria
              ? r.rubric.criteria.map((c: any) => `<div style="font-size:9pt;color:#555;">${c.name}: ${c.description}</div>`).join('')
              : ''
            return `
        <tr>
          <td style="text-align:center; font-weight:bold; width:70px;">Questão ${r.num}</td>
          <td style="width:140px;">${r.typeLabel}</td>
          <td style="text-align:center; font-weight:bold; width:90px; color:#166534; background:#f0fdf4;">${r.key}</td>
          <td>${r.resolutionText}${explanationHtml}${rubricHtml}</td>
          <td style="text-align:center; width:75px;">${r.points}</td>
        </tr>`
          })
          .join('\n')
      : `<tr><td colspan="5" style="text-align:center;">Nenhum gabarito estruturado encontrado.</td></tr>`

  return `
    <div class="generated-exam-document" style="font-family: ${fontFamily}; color: #0f172a; line-height: 1.5;">
      <p style="margin: 0 0 12px 0; font-size: 10.5pt; color: #334155;">
        <strong>Total de Questões:</strong> ${rows.length} &bull; <strong>Documento Exclusivo do Professor:</strong> Folha de Gabarito Oficial separada da folha de aplicação do aluno.
      </p>
      <table class="content-table" style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="width: 70px; text-align: center;">Item</th>
            <th style="width: 140px;">Formato</th>
            <th style="width: 90px; text-align: center;">Gabarito</th>
            <th>Alternativa Correta / Padrão de Resposta Esperado</th>
            <th style="width: 75px; text-align: center;">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `
}

/**
 * Constrói o HTML exclusivo do DOCUMENTO 3 — RELATÓRIO DE REASONING & JUSTIFICATIVA PEDAGÓGICA
 * (contemplando a justificativa global da prova como um todo E o reasoning detalhado de cada questão).
 */
export function buildStandalonePedagogicalReasoningHtml(params: {
  questions?: Array<any>
  title?: string
  topic?: string
  grade?: string
  level?: string
  subjectName?: string
  sections?: string[]
  approach?: string[]
  bloomDistribution?: { remember: number; apply: number; analyze: number; evaluate: number }
  difficultyDistribution?: { easy: number; medium: number; hard: number; challenge: number }
  distractorSummary?: string
  distractorCoveragePct?: number
  distractorQuestions?: Array<{ questionNumber: number; rating: string; feedback: string }>
  factCheck?: { score: number; level: string; issues: string[] } | null
  sources?: Array<{ title: string; category?: string; scopeInfo?: string }>
  bnccSkills?: Array<{ code: string; axis?: string; description: string }>
}): string {
  const questions = Array.isArray(params.questions) ? params.questions : []
  const bloom = params.bloomDistribution || { remember: 25, apply: 30, analyze: 25, evaluate: 20 }
  const diff = params.difficultyDistribution || { easy: 20, medium: 50, hard: 25, challenge: 5 }
  const sectionsList = params.sections?.length ? params.sections.join(', ') : 'Competências Gerais da Disciplina'
  const approachesList = params.approach?.length ? params.approach.join(', ') : 'Avaliação Diagnóstica e Formativa (Bloom & TRI)'
  const sourcesHtml =
    params.sources && params.sources.length > 0
      ? `<ul>${params.sources
          .map(
            s =>
              `<li><strong>${s.title}</strong>${s.category ? ` (${s.category})` : ''}${
                s.scopeInfo ? ` — <em>${s.scopeInfo}</em>` : ''
              }</li>`
          )
          .join('')}</ul>`
      : `<p>Elaboração fundamentada na matriz curricular da série (${params.grade || 'Ensino Regular'}) e diretrizes BNCC/CEFR.</p>`

  const bnccHtml =
    params.bnccSkills && params.bnccSkills.length > 0
      ? `<ul>${params.bnccSkills
          .map(sk => `<li><strong>${sk.code}</strong>${sk.axis ? ` [${sk.axis}]` : ''}: ${sk.description}</li>`)
          .join('')}</ul>`
      : ''

  const distractorAuditByNum = new Map<number, { rating: string; feedback: string }>()
  if (Array.isArray(params.distractorQuestions)) {
    params.distractorQuestions.forEach(dq => distractorAuditByNum.set(dq.questionNumber, dq))
  }

  const perQuestionHtml = questions
    .map((q, idx) => {
      const qNum = idx + 1
      const rawKey = String(q.correctOptionId ?? q.answerKey ?? '—').trim()
      const opts = Array.isArray(q.options) ? q.options : []
      const matchedOpt = opts.find(
        (o: any) => String(o.id ?? o.letter ?? '').trim().toUpperCase() === rawKey.toUpperCase()
      )
      const distractors = opts.filter(
        (o: any) => String(o.id ?? o.letter ?? '').trim().toUpperCase() !== rawKey.toUpperCase()
      )

      const typeMap: Record<string, string> = {
        multiple_choice: 'Múltipla Escolha',
        true_false: 'Verdadeiro / Falso',
        fill_in_blank: 'Lacunas (Gap Fill)',
        gap_fill: 'Lacunas (Gap Fill)',
        discursive: 'Dissertativa',
        open_ended: 'Resposta Aberta',
        matching: 'Associação',
        reading_text: 'Interpretação'
      }
      const typeLabel = q.typeLabel || typeMap[String(q.type || '')] || 'Questão Avaliativa'
      const diffLabel = q.predictedDifficultyLabel || q.difficultyTarget || 'Médio'
      const skillCode = q.skillCode || (params.bnccSkills?.[idx % (params.bnccSkills?.length || 1)]?.code ?? 'Alinhamento Curricular')
      const sourceLabel = q.provenance?.sourceLabel || (params.sources?.[0]?.title ?? 'Matriz Curricular / BNCC')
      const unitInfo = q.provenance?.unitTitle ? ` (${q.provenance.unitTitle})` : ''

      const rationaleText =
        q.rationale ||
        q.explanation ||
        q.rubric?.criteria?.[0]?.description ||
        `Esta questão avalia a competência do estudante em aplicar e analisar os conceitos de "${params.topic || 'conteúdo programático'}" no formato ${typeLabel.toLowerCase()}, exigindo leitura atenta do contexto e discriminação conceitual precisa.`

      const dqAudit = distractorAuditByNum.get(qNum)
      const distractorAnalysisText =
        dqAudit?.feedback ||
        (distractors.length > 0
          ? `Os distratores (${distractors.map((d: any) => `${d.id || d.letter}`).join(', ')}) foram construídos para capturar concepções alternativas, generalizações indevidas ou falsos cognatos recorrentes na série ${params.grade || ''}.`
          : 'Questão de resposta construída avaliada por rubrica analítica de coerência conceitual e precisão linguística.')

      return `
        <div class="exam-question-item" style="page-break-inside: avoid; break-inside: avoid; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px 14px; margin-bottom: 14px; background: #ffffff;">
          <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; font-weight: bold; font-size: 10.5pt;">
            <span>QUESTÃO ${qNum} &bull; ${typeLabel.toUpperCase()}</span>
            <span>Dificuldade: ${String(diffLabel).toUpperCase()} &bull; Habilidade: ${skillCode}</span>
          </div>
          <p style="margin: 4px 0 8px 0; font-size: 10pt; color: #1e293b;">
            <strong>Enunciado Avaliado:</strong> ${(q.stem || '').replace(/\n/g, '<br/>')}
          </p>
          <p style="margin: 4px 0 8px 0; font-size: 10pt; color: #166534; background: #f0fdf4; padding: 6px 10px; border-left: 3px solid #16a34a;">
            <strong>Gabarito Oficial:</strong> ${
              matchedOpt ? `${rawKey}) ${matchedOpt.text}` : rawKey
            }
          </p>
          <div style="margin: 6px 0; font-size: 10pt; color: #0f172a; line-height: 1.5;">
            <strong>🧠 Reasoning & Justificativa Pedagógica do Item:</strong><br/>
            ${String(rationaleText).replace(/\n/g, '<br/>')}
          </div>
          <div style="margin: 6px 0 2px 0; font-size: 9.5pt; color: #334155; line-height: 1.45; background: #f8fafc; padding: 6px 10px; border-left: 3px solid #64748b;">
            <strong>🎯 Engenharia Diagnóstica de Distratores & Fonte:</strong> ${distractorAnalysisText}
            <br/><em>Fonte / Proveniência:</em> ${sourceLabel}${unitInfo}
          </div>
        </div>
      `
    })
    .join('\n')

  return `
    <div class="generated-exam-document" style="font-family: inherit; color: #0f172a; line-height: 1.55;">
      <h2>PARTE I &mdash; JUSTIFICATIVA PEDAGÓGICA E ARQUITETURA DA PROVA COMO UM TODO</h2>
      <p>
        Este documento apresenta a fundamentação didático-pedagógica, o alinhamento curricular e a justificativa psicométrica da avaliação
        <strong>${params.title || 'Avaliação Oficial'}</strong> (${params.subjectName || 'Língua Inglesa'} &bull; ${params.grade || 'Ensino Regular'} &bull; Nível ${params.level || 'Intermediário'}),
        seguida da linha de raciocínio (<em>reasoning</em>) detalhada para cada uma das <strong>${questions.length} questões</strong> que compõem o instrumento.
      </p>

      <h3>1. Intencionalidade Pedagógica Global e Escopo Curricular</h3>
      <p>
        A avaliação foi desenhada sobre o eixo temático <strong>"${params.topic || 'Conteúdo Programático'}"</strong>, contemplando de forma integrada as seções de
        <strong>${sectionsList}</strong> sob as diretrizes metodológicas de <strong>${approachesList}</strong>.
        O instrumento busca aferir não apenas a memorização isolada de regras ou vocábulos, mas a capacidade de mobilizar conhecimentos em contextos autênticos de leitura, interpretação e aplicação linguística.
      </p>

      <h3>2. Matriz de Equilíbrio Cognitivo (Taxonomia de Bloom) e Calibração de Dificuldade (TRI)</h3>
      <table class="content-table" style="width: 100%; border-collapse: collapse; margin: 10px 0;">
        <thead>
          <tr>
            <th>Dimensão Analisada</th>
            <th>Distribuição Planejada</th>
            <th>Justificativa Pedagógica na Prova</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Lembrar & Compreender (Bloom)</strong></td>
            <td style="text-align:center; font-weight:bold;">${bloom.remember}%</td>
            <td>Aferição da base lexical e reconhecimento explícito de estruturas fundamentais do bimestre.</td>
          </tr>
          <tr>
            <td><strong>Aplicar (Bloom)</strong></td>
            <td style="text-align:center; font-weight:bold;">${bloom.apply}%</td>
            <td>Transferência ativa de regras gramaticais e vocabulário para novas situações comunicativas.</td>
          </tr>
          <tr>
            <td><strong>Analisar (Bloom)</strong></td>
            <td style="text-align:center; font-weight:bold;">${bloom.analyze}%</td>
            <td>Inferência contextual, contraste semântico (ex: falsos cognatos) e leitura crítica de enunciados.</td>
          </tr>
          <tr>
            <td><strong>Avaliar & Criar (Bloom)</strong></td>
            <td style="text-align:center; font-weight:bold;">${bloom.evaluate}%</td>
            <td>Julgamento de adequação discursiva e síntese autoral em itens de maior complexidade cognitiva.</td>
          </tr>
          <tr>
            <td><strong>Curva de Dificuldade (TRI)</strong></td>
            <td style="text-align:center; font-weight:bold;">Fácil ${diff.easy}% | Médio ${diff.medium}% | Difícil ${diff.hard}% | Desafio ${diff.challenge}%</td>
            <td>Progressão calibrada para garantir acolhimento inicial (itens fáceis), precisão na média da turma (itens médios) e discriminação de alta proficiência (itens difíceis/desafio).</td>
          </tr>
        </tbody>
      </table>

      <h3>3. Fontes de Conhecimento, Habilidades BNCC e Auditoria de Qualidade</h3>
      ${sourcesHtml}
      ${bnccHtml}
      <p>
        <strong>Parecer de Engenharia de Distratores:</strong> ${
          params.distractorSummary ||
          `Cobertura diagnóstica verificada em ${params.distractorCoveragePct ?? 100}% dos itens de múltipla escolha, evitando alternativas absurdas ou violações de Haladyna.`
        }
        ${
          params.factCheck
            ? `<br/><strong>Auditoria Fact-Check:</strong> Índice de consistência factual ${params.factCheck.score}/100 (${params.factCheck.level.toUpperCase()}).`
            : ''
        }
      </p>

      <hr class="content-divider" />

      <h2>PARTE II &mdash; REASONING E JUSTIFICATIVA PEDAGÓGICA QUESTÃO POR QUESTÃO (1 A ${questions.length})</h2>
      <p>
        Abaixo detalha-se o raciocínio pedagógico individual de cada questão, explicitando a competência avaliada, a justificativa da alternativa correta e o papel diagnóstico dos distratores:
      </p>
      ${perQuestionHtml}
    </div>
  `
}

/**
 * 6. Formata markdown em HTML profissional com suporte a tabelas, divisores e NEE
 */
export function formatMarkdownToHtml(text: string, nee: string = 'standard'): string {
  if (!text) return ''
  const clean = sanitizeTextForFormalDoc(text)
  const lines = clean.split('\n')
  const result: string[] = []
  let inTable = false
  let tableHeaderDone = false
  let tableHtml = ''

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim()

    if (rawLine.startsWith('|') && rawLine.endsWith('|')) {
      const cells = rawLine.split('|').map(c => c.trim()).slice(1, -1)

      // Linha separadora do cabeçalho da tabela | :--- | :--- |
      if (cells.every(c => /^:?-+:?$/.test(c))) {
        continue
      }

      if (!inTable) {
        inTable = true
        tableHeaderDone = false
        tableHtml = '<table class="content-table">\n'
      }

      if (!tableHeaderDone) {
        tableHtml += '  <thead>\n    <tr>\n' + cells.map(c => `      <th>${formatInlineMarkdown(c, nee)}</th>\n`).join('') + '    </tr>\n  </thead>\n  <tbody>\n'
        tableHeaderDone = true
      } else {
        tableHtml += '    <tr>\n' + cells.map(c => `      <td>${formatInlineMarkdown(c, nee)}</td>\n`).join('') + '    </tr>\n'
      }
    } else {
      if (inTable) {
        tableHtml += '  </tbody>\n</table>'
        result.push(tableHtml)
        inTable = false
        tableHeaderDone = false
        tableHtml = ''
      }

      if (!rawLine) {
        continue
      }

      if (rawLine === '---') {
        result.push('<hr class="content-divider" />')
      } else if (/^### (.*$)/i.test(rawLine)) {
        result.push(`<h3>${formatInlineMarkdown(rawLine.replace(/^### /i, ''), nee)}</h3>`)
      } else if (/^## (.*$)/i.test(rawLine)) {
        result.push(`<h2>${formatInlineMarkdown(rawLine.replace(/^## /i, ''), nee)}</h2>`)
      } else if (/^# (.*$)/i.test(rawLine)) {
        result.push(`<h1>${formatInlineMarkdown(rawLine.replace(/^# /i, ''), nee)}</h1>`)
      } else if (/^-\s+(.*$)/i.test(rawLine)) {
        result.push(`<ul><li>${formatInlineMarkdown(rawLine.replace(/^-\s+/i, ''), nee)}</li></ul>`)
      } else {
        result.push(`<p>${formatInlineMarkdown(rawLine, nee)}</p>`)
      }
    }
  }

  if (inTable) {
    tableHtml += '  </tbody>\n</table>'
    result.push(tableHtml)
  }

  return result.join('\n')
}

/**
 * 7. Exporta um elemento DOM diretamente para impressão/PDF (removendo gabaritos ocultos da folha do aluno)
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
  const cleanOuterHtml = el.outerHTML.replace(/<div\s+class="exam-answer-key"[^>]*>[\s\S]*?<\/div>/gi, '')
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${filename}</title>
        <style>
          @page { size: A4; margin: 12mm; }
          body { font-family: sans-serif; margin: 0; padding: 10px; }
          .exam-answer-key { display: none !important; }
        </style>
      </head>
      <body>
        ${cleanOuterHtml}
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

/**
 * 8. Constrói HTML estruturado de Sequência Didática para exportação oficial da escola (PDF e Word)
 */
export function buildDidacticSequenceExportHtml(params: {
  schoolName: string
  gradeName: string
  bimesterName: string
  units: Array<{
    title: string
    status: string
    progress: number
    plannedWeeks: string
    actualWeeks: string
    plannedHours: number
    completedHours: number
    grammar: string[]
    vocabulary: string[]
    skills: string[]
    bnccCodes?: string[]
    pageRange?: string
    bookModule?: string
    notes?: string
  }>
  aiAssessmentText?: string
}): string {
  const statusMap: Record<string, string> = {
    completed: 'Concluído',
    in_progress: 'Em Andamento',
    upcoming: 'Planejado',
    delayed: 'Em Ajuste / Atrasado'
  }

  const totalPlannedHours = params.units.reduce((acc, u) => acc + (u.plannedHours || 0), 0)
  const totalCompletedHours = params.units.reduce((acc, u) => acc + (u.completedHours || 0), 0)

  const tableRows = params.units
    .map(
      (u, idx) => `
      <tr>
        <td style="font-weight:bold;">${idx + 1}. ${u.title}${u.bookModule ? `<br/><span style="font-size:8.5pt; color:#475569;">${u.bookModule}${u.pageRange ? ` (${u.pageRange})` : ''}</span>` : ''}</td>
        <td style="text-align:center;">${statusMap[u.status] || u.status}<br/><strong>${u.progress}%</strong></td>
        <td style="text-align:center;">Prev: ${u.plannedWeeks}<br/>Real: ${u.actualWeeks}</td>
        <td style="text-align:center;">${u.completedHours}h / ${u.plannedHours}h</td>
        <td><strong>Gramática:</strong> ${(u.grammar || []).join(', ') || '—'}<br/><strong>Vocabulário:</strong> ${(u.vocabulary || []).join(', ') || '—'}</td>
        <td>${(u.skills || []).join(', ')}${u.bnccCodes && u.bnccCodes.length > 0 ? `<br/><strong>BNCC:</strong> ${u.bnccCodes.join(', ')}` : ''}</td>
      </tr>
    `
    )
    .join('\n')

  const detailedUnitsHtml = params.units
    .map(
      (u, idx) => `
      <div class="exam-question-item" style="margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #cbd5e1; page-break-inside: avoid;">
        <div style="font-weight: bold; font-size: 11pt; margin-bottom: 4px;">
          UNIDADE ${String(idx + 1).padStart(2, '0')} &mdash; ${u.title} (${statusMap[u.status] || u.status} &bull; ${u.progress}%)
        </div>
        <p style="margin: 3px 0; font-size: 10pt;">
          <strong>Cronograma:</strong> Previsto (${u.plannedWeeks}) | Realizado (${u.actualWeeks}) &bull;
          <strong>Carga Horária:</strong> ${u.completedHours}h ministradas de ${u.plannedHours}h previstas
          ${u.bookModule ? ` &bull; <strong>Material:</strong> ${u.bookModule} (${u.pageRange || ''})` : ''}
        </p>
        <p style="margin: 3px 0; font-size: 10pt;">
          <strong>Eixo Gramatical:</strong> ${(u.grammar || []).join('; ') || 'Não especificado'}<br/>
          <strong>Campo Lexical (Vocabulário):</strong> ${(u.vocabulary || []).join('; ') || 'Não especificado'}<br/>
          <strong>Habilidades Trabalhadas:</strong> ${(u.skills || []).join(', ') || '4 Skills'}${u.bnccCodes?.length ? ` &bull; <strong>BNCC:</strong> ${u.bnccCodes.join(', ')}` : ''}
        </p>
        ${u.notes ? `<p style="margin: 4px 0 0 0; font-size: 9.5pt; background: #f8fafc; padding: 6px 10px; border-left: 3px solid #64748b;"><strong>Observações Pedagógicas / Diário de Bordo:</strong> ${u.notes}</p>` : ''}
      </div>
    `
    )
    .join('\n')

  return `
    <div class="generated-exam-document">
      <h2>1. QUADRO SINÓPTICO DO PLANEJAMENTO E EXECUÇÃO (${params.bimesterName.toUpperCase()})</h2>
      <p>
        Relatório institucional de acompanhamento da Sequência Didática da turma/série <strong>${params.gradeName}</strong> na unidade escolar <strong>${params.schoolName}</strong>,
        totalizando <strong>${totalCompletedHours}h concluídas</strong> de <strong>${totalPlannedHours}h planejadas</strong> (${params.units.length} unidades curriculares).
      </p>

      <table class="content-table">
        <thead>
          <tr>
            <th>Unidade / Módulo</th>
            <th style="text-align:center;">Status</th>
            <th style="text-align:center;">Semanas</th>
            <th style="text-align:center;">C.H.</th>
            <th>Conteúdos (Gramática & Vocabulário)</th>
            <th>Habilidades & BNCC</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>

      <h2>2. DETALHAMENTO PEDAGÓGICO POR UNIDADE DIDÁTICA</h2>
      ${detailedUnitsHtml}

      ${
        params.aiAssessmentText
          ? `
        <hr class="content-divider" />
        <h2>3. PARECER PEDAGÓGICO E RECOMENDAÇÕES DE AJUSTE DE ROTA</h2>
        ${formatMarkdownToHtml(params.aiAssessmentText)}
      `
          : ''
      }
    </div>
  `
}

/**
 * 9. Constrói o HTML exclusivo do DOCUMENTO 4 — FICHA DE ACOMPANHAMENTO E ADAPTAÇÃO PDI/PEI
 * VINCULADA À AVALIAÇÃO OU ATIVIDADE (Documento independente da Prova, do Gabarito e do Reasoning).
 */
export function buildStandalonePdiAssessmentDocumentHtml(params: {
  studentName: string
  gradeCycle?: string
  shift?: string
  validityPeriod?: string
  nextReviewDate?: string
  regentTeacher?: string
  pedagogicalTeam?: string
  activityTitle: string
  activityType?: 'exam' | 'worksheet'
  topic?: string
  generalObjective?: string
  strategies?: Array<{ id?: string; description: string; isActive?: boolean }>
  skillsMatrix?: Array<{
    skillCode: string
    skillDescription: string
    status: string
    previousSemesterStatus?: string
    workDoneOrAdaptedSkill?: string
    evaluatedStatusInThisActivity?: 'Sim' | 'Em desenvolvimento' | 'Não'
    activityNote?: string
  }>
  questions?: Array<any>
  evolutionNotes?: string
}): string {
  const dateStr = new Date().toLocaleDateString('pt-BR')
  const actTypeLabel = params.activityType === 'worksheet' ? 'Atividade / Worksheet' : 'Avaliação / Prova'
  const gradeLabel = params.gradeCycle || '6º ano do Ensino Fundamental'
  const activeStrategies = (params.strategies || []).filter(s => s.isActive !== false)
  const skills = params.skillsMatrix || []
  const questions = Array.isArray(params.questions) ? params.questions : []

  const normalizeStatus = (raw?: string) => {
    if (!raw) return 'Em desenvolvimento'
    const low = raw.trim().toLowerCase()
    if (low === 'sim' || low === 'hv' || low === 'concluida') return 'Sim'
    if (low === 'não' || low === 'nao' || low === 'hnv') return 'Não'
    return 'Em desenvolvimento'
  }

  const strategiesHtml =
    activeStrategies.length > 0
      ? `<ul>${activeStrategies.map(s => `<li>${s.description}</li>`).join('')}</ul>`
      : `<p>Aplicação das estratégias pedagógicas individualizadas previstas no PDI vigente.</p>`

  const questionsMappingRows =
    questions.length > 0
      ? questions
          .map((q, idx) => {
            const bncc = q.bnccSkill || q.bnccCode || 'Competência linguística contextualizada'
            const obj = q.pedagogicalObjective || q.bloomTaxonomy || 'Aferição formativa/somativa'
            return `
              <tr>
                <td style="text-align:center; font-weight:bold;">Questão ${idx + 1}</td>
                <td><strong>${bncc}</strong></td>
                <td>${obj}</td>
                <td>( &nbsp; ) Sim &nbsp;&nbsp; ( &nbsp; ) Em desenv. &nbsp;&nbsp; ( &nbsp; ) Não</td>
              </tr>
            `
          })
          .join('')
      : ''

  const skillsRowsHtml =
    skills.length > 0
      ? skills
          .map(sk => {
            const currentSt = normalizeStatus(sk.status)
            const evalSt = sk.evaluatedStatusInThisActivity
              ? normalizeStatus(sk.evaluatedStatusInThisActivity)
              : currentSt
            const prevInfo = sk.previousSemesterStatus
              ? `<br/><span style="font-size:8.5pt; color:#475569;">Semestre anterior: ${sk.previousSemesterStatus}</span>`
              : ''
            return `
              <tr>
                <td style="font-weight:bold; width:12%;">${sk.skillCode}</td>
                <td style="width:44%;">${sk.skillDescription}</td>
                <td style="width:16%; font-weight:bold;">${currentSt}${prevInfo}</td>
                <td style="width:28%;">
                  <strong>Nesta ${actTypeLabel}:</strong> ${evalSt}
                  ${sk.activityNote ? `<br/><em>${sk.activityNote}</em>` : sk.workDoneOrAdaptedSkill ? `<br/><span style="font-size:9pt;">${sk.workDoneOrAdaptedSkill}</span>` : ''}
                </td>
              </tr>
            `
          })
          .join('')
      : `<tr><td colspan="4" style="text-align:center;">Nenhuma habilidade BNCC vinculada.</td></tr>`

  return `
    <div class="generated-exam-document">
      <h2>1. IDENTIFICAÇÃO DO PDI/PEI VINCULADO À ${actTypeLabel.toUpperCase()}</h2>
      <p>
        Documento pedagógico <strong>separado e exclusivo da equipe docente/pedagógica</strong> para registro de adaptações,
        estratégias de aplicação e acompanhamento de superação de habilidades da BNCC do(a) estudante
        <strong>${params.studentName}</strong> na atividade <strong>${params.activityTitle}</strong>.
      </p>

      <table class="content-table">
        <tbody>
          <tr>
            <td style="font-weight:bold; width:22%; background:#f8fafc;">Aluno(a):</td>
            <td style="width:28%;">${params.studentName}</td>
            <td style="font-weight:bold; width:22%; background:#f8fafc;">Ano/turma &amp; Turno:</td>
            <td style="width:28%;">${gradeLabel} (${params.shift || 'Matutino'})</td>
          </tr>
          <tr>
            <td style="font-weight:bold; background:#f8fafc;">Professor(a) regente:</td>
            <td>${params.regentTeacher || 'Rafaela Franco Toldo'}</td>
            <td style="font-weight:bold; background:#f8fafc;">Equipe pedagógica:</td>
            <td>${params.pedagogicalTeam || 'Marianna Panisset'}</td>
          </tr>
          <tr>
            <td style="font-weight:bold; background:#f8fafc;">Vigência do PDI:</td>
            <td>${params.validityPeriod || '1º semestre / 2026'}</td>
            <td style="font-weight:bold; background:#f8fafc;">Próxima revisão:</td>
            <td>${params.nextReviewDate || 'Dezembro / 2026'}</td>
          </tr>
          <tr>
            <td style="font-weight:bold; background:#f8fafc;">Instrumento Avaliativo:</td>
            <td>${params.activityTitle} (${actTypeLabel})</td>
            <td style="font-weight:bold; background:#f8fafc;">Data de Registro:</td>
            <td>${dateStr}</td>
          </tr>
        </tbody>
      </table>

      <h2>2. ESTRATÉGIAS PEDAGÓGICAS E RECURSOS DE APOIO APLICADOS</h2>
      ${strategiesHtml}

      ${
        questionsMappingRows
          ? `
        <h2>3. MAPEAMENTO DE QUESTÕES DA ${actTypeLabel.toUpperCase()} POR COMPETÊNCIA</h2>
        <table class="content-table">
          <thead>
            <tr>
              <th style="width:14%; text-align:center;">Item</th>
              <th style="width:24%;">Habilidade BNCC / Foco</th>
              <th style="width:32%;">Objetivo Pedagógico</th>
              <th style="width:30%;">Desempenho no Item</th>
            </tr>
          </thead>
          <tbody>
            ${questionsMappingRows}
          </tbody>
        </table>
      `
          : ''
      }

      <h2>4. ACOMPANHAMENTO DE SUPERAÇÃO DE HABILIDADES — BNCC (${gradeLabel.toUpperCase()})</h2>
      <p>
        Registro evolutivo para acompanhamento no semestre vigente e verificação no próximo semestre sobre a conclusão das competências previstas:
      </p>
      <table class="content-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Habilidade (BNCC – Língua Inglesa)</th>
            <th>Superada no PDI?</th>
            <th>Avaliação / Observações</th>
          </tr>
        </thead>
        <tbody>
          ${skillsRowsHtml}
        </tbody>
      </table>

      ${
        params.evolutionNotes
          ? `
        <h2>5. SÍNTESE DE OBSERVAÇÕES E EVOLUÇÃO DO(A) ALUNO(A)</h2>
        <p>${params.evolutionNotes.replace(/\n\n/g, '</p><p>')}</p>
      `
          : ''
      }

      <h2>6. ASSINATURAS E VALIDAÇÃO PEDAGÓGICA</h2>
      <table class="content-table" style="margin-top:14px;">
        <tbody>
          <tr>
            <td style="width:50%; padding:18px 12px; vertical-align:bottom;">
              <strong>Professor(a) regente:</strong> ${params.regentTeacher || 'Rafaela Franco Toldo'}<br/><br/>
              _____________________________________________________
            </td>
            <td style="width:50%; padding:18px 12px; vertical-align:bottom;">
              <strong>Coordenação pedagógica:</strong> ${params.pedagogicalTeam || 'Marianna Panisset'}<br/><br/>
              _____________________________________________________
            </td>
          </tr>
          <tr>
            <td style="width:50%; padding:18px 12px; vertical-align:bottom;">
              <strong>Responsável pelo(a) aluno(a):</strong><br/><br/>
              _____________________________________________________
            </td>
            <td style="width:50%; padding:18px 12px; vertical-align:bottom;">
              <strong>Data de validação:</strong> ${dateStr}<br/><br/>
              _____ / _____ / _________
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `
}



