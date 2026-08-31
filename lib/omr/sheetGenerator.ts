/**
 * sheetGenerator.ts — Gerador Padronizado de Folhas de Resposta OMR (Cenário A)
 * 
 * Gera o layout canônico milimétrico de coordenadas (1000 x 1414 px / A4)
 * e o HTML/SVG de impressão oficial com 4 marcadores fiduciais e QR Code de referência.
 */

import { ExamSheetLayout, QuestionBubbleLayout, Point2D } from './types'

export const CANONICAL_WIDTH = 1000
export const CANONICAL_HEIGHT = 1414
export const FIDUCIAL_MARKER_SIZE = 40 // Quadrados pretos de 40px no espaço canônico (12mm)
export const FIDUCIAL_MARGIN = 50      // 50px das bordas

/**
 * Cria a definição de layout canônico para uma prova com N questões.
 */
export function createExamSheetLayout(params: {
  id: string
  title: string
  version?: 'Form_A' | 'Form_B'
  totalQuestions: number
  optionsPerQuestion?: number // Padrão: 4 (A, B, C, D) ou 5 (A..E)
  answerKey?: Record<number, string>
}): ExamSheetLayout {
  const {
    id,
    title,
    version = 'Form_A',
    totalQuestions,
    optionsPerQuestion = 4,
    answerKey
  } = params

  const fiducials = {
    topLeft: { x: FIDUCIAL_MARGIN, y: FIDUCIAL_MARGIN },
    topRight: { x: CANONICAL_WIDTH - FIDUCIAL_MARGIN, y: FIDUCIAL_MARGIN },
    bottomRight: { x: CANONICAL_WIDTH - FIDUCIAL_MARGIN, y: CANONICAL_HEIGHT - FIDUCIAL_MARGIN },
    bottomLeft: { x: FIDUCIAL_MARGIN, y: CANONICAL_HEIGHT - FIDUCIAL_MARGIN },
    markerSize: FIDUCIAL_MARKER_SIZE
  }

  // Grid de Questões: organizado em 1 ou 2 colunas dependendo do total de questões
  const questions: QuestionBubbleLayout[] = []
  const numColumns = totalQuestions <= 15 ? 1 : 2
  const questionsPerColumn = Math.ceil(totalQuestions / numColumns)

  const colWidth = numColumns === 1 ? 700 : 380
  const startY = 360 // Espaço reservado para cabeçalho, nome do aluno e QR Code
  const availableHeight = CANONICAL_HEIGHT - startY - 100
  const rowHeight = Math.min(48, Math.floor(availableHeight / Math.max(10, questionsPerColumn)))

  const optionLetters: Array<'A' | 'B' | 'C' | 'D' | 'E'> = ['A', 'B', 'C', 'D', 'E']
  const letters = optionLetters.slice(0, optionsPerQuestion)
  const bubbleRadius = 14 // Raio do círculo no espaço canônico

  for (let q = 1; q <= totalQuestions; q++) {
    const colIndex = q <= questionsPerColumn ? 0 : 1
    const rowIndex = q <= questionsPerColumn ? (q - 1) : (q - questionsPerColumn - 1)

    const colStartX = numColumns === 1 ? 240 : (colIndex === 0 ? 120 : 540)
    const rowCenterY = startY + rowIndex * rowHeight + 20

    const bubbleSpacing = 42
    const options = letters.map((letter, optIdx) => ({
      option: letter,
      center: {
        x: colStartX + 80 + optIdx * bubbleSpacing,
        y: rowCenterY
      },
      radius: bubbleRadius
    }))

    questions.push({
      questionNumber: q,
      options
    })
  }

  return {
    id,
    title,
    version,
    totalQuestions,
    canonicalWidth: CANONICAL_WIDTH,
    canonicalHeight: CANONICAL_HEIGHT,
    fiducials,
    questions,
    answerKey
  }
}

/**
 * Gera o HTML imprimível do Cartão-Resposta Padronizado com Marcadores Fiduciais nos 4 cantos.
 */
export function generatePrintableOmrSheetHtml(layout: ExamSheetLayout, schoolName = 'TEACHER AI — SISTEMA OFICIAL DE AVALIAÇÃO'): string {
  const { title, version, totalQuestions, questions, id } = layout
  const numColumns = totalQuestions <= 15 ? 1 : 2
  const half = Math.ceil(totalQuestions / numColumns)

  const renderColumn = (qs: QuestionBubbleLayout[]) => {
    return qs.map(q => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 10px; margin-bottom: 4px; border-bottom: 1px dashed #e0d5c5;">
        <span style="font-size: 13px; font-weight: 800; color: #2c1a0e; width: 36px;">${String(q.questionNumber).padStart(2, '0')}</span>
        <div style="display: flex; gap: 12px; align-items: center;">
          ${q.options.map(opt => `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
              <span style="font-size: 9px; font-weight: 700; color: #7a5c42;">${opt.option}</span>
              <div style="width: 22px; height: 22px; border-radius: 50%; border: 2px solid #2c1a0e; background: #ffffff; display: flex; align-items: center; justify-content: center;">
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')
  }

  const col1 = questions.slice(0, half)
  const col2 = numColumns === 2 ? questions.slice(half) : []

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Cartão Resposta OMR — ${title}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    body {
      margin: 0;
      padding: 0;
      width: 210mm;
      height: 297mm;
      background: #ffffff;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      box-sizing: border-box;
      position: relative;
    }
    .sheet-container {
      position: relative;
      width: 100%;
      height: 100%;
      padding: 16mm;
      box-sizing: border-box;
    }
    /* Marcadores Fiduciais de Canto (12mm x 12mm pretos sólidos) */
    .fiducial {
      position: absolute;
      width: 12mm;
      height: 12mm;
      background: #000000;
    }
    .fiducial-tl { top: 8mm; left: 8mm; }
    .fiducial-tr { top: 8mm; right: 8mm; }
    .fiducial-bl { bottom: 8mm; left: 8mm; }
    .fiducial-br { bottom: 8mm; right: 8mm; }

    .header-box {
      border: 2px solid #2c1a0e;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #fffcf8;
    }
    .student-box {
      border: 1px solid #7a5c42;
      border-radius: 4px;
      padding: 8px 12px;
      margin-bottom: 16px;
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 12px;
      font-size: 12px;
    }
    .instructions-box {
      background: #faf6f0;
      border: 1px solid #d5c0b0;
      border-radius: 4px;
      padding: 6px 12px;
      font-size: 10px;
      color: #665c54;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .grid-container {
      display: grid;
      grid-template-columns: ${numColumns === 2 ? '1fr 1fr' : '1fr'};
      gap: 24px;
    }
  </style>
</head>
<body>
  <div class="sheet-container">
    <!-- Marcadores Fiduciais nos 4 cantos -->
    <div class="fiducial fiducial-tl"></div>
    <div class="fiducial fiducial-tr"></div>
    <div class="fiducial fiducial-bl"></div>
    <div class="fiducial fiducial-br"></div>

    <!-- Cabeçalho -->
    <div class="header-box">
      <div>
        <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #8b5e3c; letter-spacing: 0.5px;">
          ${schoolName}
        </div>
        <div style="font-size: 16px; font-weight: 800; color: #2c1a0e; margin-top: 2px;">
          FOLHA OFICIAL DE RESPOSTAS (GABARITO OMR)
        </div>
        <div style="font-size: 12px; color: #7a5c42; margin-top: 2px;">
          ${title} &bull; <strong>Versão: ${version}</strong> (${totalQuestions} Questões)
        </div>
      </div>
      <!-- Bloco de Código da Prova para Leitura Óptica -->
      <div style="text-align: right; border-left: 1px solid #d5c0b0; padding-left: 14px;">
        <div style="font-size: 8.5px; font-weight: 700; color: #8b5e3c;">CÓDIGO DE IDENTIFICAÇÃO</div>
        <div style="font-family: monospace; font-size: 13px; font-weight: 900; color: #2c1a0e; letter-spacing: 1px;">
          ${id.slice(0, 16).toUpperCase()}
        </div>
      </div>
    </div>

    <!-- Dados do Aluno -->
    <div class="student-box">
      <div>
        <strong>NOME DO(A) ALUNO(A):</strong>
        <div style="border-bottom: 1px solid #2c1a0e; height: 18px; margin-top: 4px;"></div>
      </div>
      <div>
        <strong>TURMA / DATA:</strong>
        <div style="border-bottom: 1px solid #2c1a0e; height: 18px; margin-top: 4px;"></div>
      </div>
    </div>

    <!-- Instruções de Preenchimento -->
    <div class="instructions-box">
      <div>
        <strong>INSTRUÇÕES:</strong> Preencha totalmente o círculo com caneta esferográfica preta ou azul escura.
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <span>Correto: <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #000;"></span></span>
        <span>Incorreto: <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; border: 1px solid #000; text-align: center; line-height: 8px; font-size: 8px;">✕</span></span>
      </div>
    </div>

    <!-- Grade de Respostas -->
    <div class="grid-container">
      <div style="border: 1px solid #e0d5c5; border-radius: 6px; padding: 8px;">
        ${renderColumn(col1)}
      </div>
      ${numColumns === 2 ? `
        <div style="border: 1px solid #e0d5c5; border-radius: 6px; padding: 8px;">
          ${renderColumn(col2)}
        </div>
      ` : ''}
    </div>
  </div>
</body>
</html>
  `.trim()
}
