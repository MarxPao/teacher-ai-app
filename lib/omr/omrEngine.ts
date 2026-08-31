/**
 * omrEngine.ts — Motor de Reconhecimento Óptico de Gabarito (OMR Determinístico)
 * 
 * Processa a folha de respostas no espaço canônico, computa a densidade óptica
 * de preenchimento (Fill Ratio) de cada círculo de alternativa, aplica regras de
 * contraste relativo e classifica cada questão com confiança (Alta / Média / Baixa).
 */

import {
  ExamSheetLayout,
  OMRSheetResult,
  OMRQuestionResult,
  OptionReadingDetail,
  OMRMarkingClassification,
  Point2D
} from './types'
import { detectSheetFiducials, toGrayscale, ImageBuffer } from './fiducialDetector'
import { computeHomography, applyHomography, Matrix3x3 } from './perspectiveTransformer'

export interface OMREngineOptions {
  // Limiares calibrados
  minFillRatioForMark?: number        // Padrão: 0.30 (30% de pixels escuros dentro do raio interno)
  maxFillRatioForBlank?: number       // Padrão: 0.12 (12% de ruído máximo para branco)
  minContrastRatioForMark?: number    // Padrão: 0.25 (contraste relativo com papel)
  multipleMarkThreshold?: number      // Padrão: 0.22 (limiar da 2ª opção para dupla marcação)
}

/**
 * Lê a densidade de preenchimento e luminância de um círculo de alternativa
 */
export function sampleBubbleOption(
  gray: Uint8Array,
  width: number,
  height: number,
  canonicalCenter: Point2D,
  canonicalRadius: number,
  canonicalToSrcH: Matrix3x3
): OptionReadingDetail {
  // Converte centro canônico para coordenadas reais na foto da folha
  const srcCenter = applyHomography(canonicalCenter, canonicalToSrcH)
  const radiusEdge = applyHomography({ x: canonicalCenter.x + canonicalRadius, y: canonicalCenter.y }, canonicalToSrcH)
  const effectiveRadius = Math.max(4, Math.hypot(radiusEdge.x - srcCenter.x, radiusEdge.y - srcCenter.y))

  // Raio interno estrito (70% do raio) para NUNCA pegar a borda impressa da bolha
  const rInner = effectiveRadius * 0.70
  // Anel de papel branco ao redor (130% a 180% do raio)
  const rOuterMin = effectiveRadius * 1.30
  const rOuterMax = effectiveRadius * 1.80

  let bgLuminanceSum = 0
  let bgTotalPixels = 0

  const boxHalf = Math.ceil(rOuterMax) + 2
  const minX = Math.max(0, Math.floor(srcCenter.x - boxHalf))
  const maxX = Math.min(width - 1, Math.ceil(srcCenter.x + boxHalf))
  const minY = Math.max(0, Math.floor(srcCenter.y - boxHalf))
  const maxY = Math.min(height - 1, Math.ceil(srcCenter.y + boxHalf))

  // Passo 1: Mede a luminância média do papel ao redor da bolha
  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const dist = Math.hypot(px - srcCenter.x, py - srcCenter.y)
      if (dist >= rOuterMin && dist <= rOuterMax) {
        const idx = py * width + px
        bgTotalPixels++
        bgLuminanceSum += gray[idx]
      }
    }
  }

  const backgroundLuminance = bgTotalPixels > 0 ? bgLuminanceSum / bgTotalPixels : 255
  // Limiar de tinta escura relativo ao papel local
  const darkThreshold = Math.max(50, backgroundLuminance * 0.75)

  // Passo 2: Mede preenchimento interno
  let innerDarkPixels = 0
  let innerTotalPixels = 0
  let innerLuminanceSum = 0

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const dist = Math.hypot(px - srcCenter.x, py - srcCenter.y)
      if (dist <= rInner) {
        const idx = py * width + px
        innerTotalPixels++
        innerLuminanceSum += gray[idx]
        if (gray[idx] < darkThreshold) {
          innerDarkPixels++
        }
      }
    }
  }

  const fillRatio = innerTotalPixels > 0 ? innerDarkPixels / innerTotalPixels : 0
  const meanLuminance = innerTotalPixels > 0 ? innerLuminanceSum / innerTotalPixels : 255
  const contrastRatio = backgroundLuminance > 0 ? Math.max(0, (backgroundLuminance - meanLuminance) / backgroundLuminance) : 0

  return {
    option: '',
    fillRatio: Number(fillRatio.toFixed(3)),
    meanLuminance: Number(meanLuminance.toFixed(1)),
    backgroundLuminance: Number(backgroundLuminance.toFixed(1)),
    contrastRatio: Number(contrastRatio.toFixed(3)),
    isMarked: false
  }
}

/**
 * Avalia uma folha de respostas completa a partir do buffer de imagem e layout esperado.
 */
export function evaluateOMRSheet(
  img: ImageBuffer,
  layout: ExamSheetLayout,
  options: OMREngineOptions = {}
): OMRSheetResult {
  const startTime = Date.now()
  const { width, height } = img

  const minFillForMark = options.minFillRatioForMark ?? 0.30
  const maxFillForBlank = options.maxFillRatioForBlank ?? 0.12
  const minContrastForMark = options.minContrastRatioForMark ?? 0.25
  const multipleMarkThresh = options.multipleMarkThreshold ?? 0.22

  // 1. Detecção dos 4 Marcadores Fiduciais
  const fiducials = detectSheetFiducials(img)

  // 2. Mapeamento Projetivo Canônico -> Foto Original
  const canonicalDstCorners: [Point2D, Point2D, Point2D, Point2D] = [
    layout.fiducials.topLeft,
    layout.fiducials.topRight,
    layout.fiducials.bottomRight,
    layout.fiducials.bottomLeft
  ]

  const srcDetectedCorners: [Point2D, Point2D, Point2D, Point2D] = [
    fiducials.topLeft,
    fiducials.topRight,
    fiducials.bottomRight,
    fiducials.bottomLeft
  ]

  // Matriz H que transforma ponto canônico (1000 x 1414) em coordenada real na foto
  const canonicalToSrcH = computeHomography(canonicalDstCorners, srcDetectedCorners)

  // 3. Pré-processamento Grayscale
  const gray = toGrayscale(img)

  // 4. Leitura Questão a Questão
  const questionResults: OMRQuestionResult[] = []
  let correctCount = 0
  let fallbackCount = 0

  for (const qLayout of layout.questions) {
    const qNum = qLayout.questionNumber
    const expectedAnswer = layout.answerKey?.[qNum]?.toUpperCase()

    const optionsDetail: OptionReadingDetail[] = qLayout.options.map(opt => {
      const reading = sampleBubbleOption(
        gray,
        width,
        height,
        opt.center,
        opt.radius,
        canonicalToSrcH
      )
      return {
        ...reading,
        option: opt.option
      }
    })

    // Ordena alternativas da mais preenchida para a menos preenchida
    const sorted = [...optionsDetail].sort((a, b) => b.fillRatio - a.fillRatio)
    const top1 = sorted[0]
    const top2 = sorted[1] || { fillRatio: 0, contrastRatio: 0, option: '' }

    let detectedAnswer: string | null = null
    let confidence: 'high' | 'medium' | 'low' = 'high'
    let classification: OMRMarkingClassification = 'single_mark'
    let isAmbiguous = false
    let needsAiFallback = false
    let visualEvidence = ''

    // REGRA 1: Marcação Única Nítida (Caneta preta/azul ou marca escura consolidada)
    if (
      top1.fillRatio >= minFillForMark &&
      top1.meanLuminance < 130 &&
      (top2.fillRatio < maxFillForBlank || top1.fillRatio >= top2.fillRatio * 2.0)
    ) {
      detectedAnswer = top1.option
      top1.isMarked = true
      confidence = 'high'
      classification = 'single_mark'
      visualEvidence = `Alternativa ${top1.option} marcada com clareza (${(top1.fillRatio * 100).toFixed(0)}% preenchimento).`
      needsAiFallback = false
    }
    // REGRA 2: Dupla Marcação / Conflito (Duas alternativas com preenchimento simultâneo)
    else if (top1.fillRatio >= multipleMarkThresh && top2.fillRatio >= multipleMarkThresh) {
      detectedAnswer = null // Anulação formal
      top1.isMarked = true
      top2.isMarked = true
      confidence = 'low'
      classification = 'multiple_marks'
      isAmbiguous = true
      needsAiFallback = true
      fallbackCount++
      visualEvidence = `Duas alternativas marcadas simultaneamente (${top1.option}: ${(top1.fillRatio * 100).toFixed(0)}%, ${top2.option}: ${(top2.fillRatio * 100).toFixed(0)}%).`
    }
    // REGRA 3: Em Branco (Nenhum preenchimento significativo)
    else if (top1.fillRatio < maxFillForBlank && top1.contrastRatio < 0.12) {
      detectedAnswer = null
      confidence = 'high'
      classification = 'blank'
      visualEvidence = 'Questão deixada em branco (nenhum círculo preenchido).'
      needsAiFallback = false
    }
    // REGRA 4: Rasura com Correção ou Marcação Fraca de Lápis (Fallback de IA)
    else if (top1.fillRatio >= 0.12 || (top1.fillRatio >= minFillForMark && top1.meanLuminance >= 130)) {
      detectedAnswer = top1.option
      top1.isMarked = true
      confidence = 'medium'
      classification = 'light_pencil'
      isAmbiguous = true
      needsAiFallback = true
      fallbackCount++
      visualEvidence = `Marcação fraca/grafite leve detectado em ${top1.option} (luminância ${top1.meanLuminance}, ${(top1.fillRatio * 100).toFixed(0)}% preenchimento).`
    }
    // REGRA 5: Padrão Ambíguo Geral
    else {
      detectedAnswer = top1.option || null
      confidence = 'medium'
      classification = 'ambiguous'
      isAmbiguous = true
      needsAiFallback = true
      fallbackCount++
      visualEvidence = `Padrão de marcação com contraste intermediário em ${top1.option}.`
    }

    const isCorrect = expectedAnswer && detectedAnswer ? detectedAnswer === expectedAnswer : false
    if (isCorrect) correctCount++

    questionResults.push({
      questionNumber: qNum,
      detectedAnswer,
      confidence,
      classification,
      isAmbiguous,
      optionsDetail,
      visualEvidence,
      needsAiFallback,
      correctAnswer: expectedAnswer,
      isCorrect,
      pointsAwarded: isCorrect ? 1 : 0
    })
  }

  const processingTimeMs = Date.now() - startTime
  const totalQ = layout.totalQuestions
  const score = totalQ > 0 ? Number(((correctCount / totalQ) * 10).toFixed(1)) : 0
  const overallConfidence: 'high' | 'medium' | 'low' =
    fallbackCount === 0 ? 'high' : fallbackCount <= 2 ? 'medium' : 'low'

  return {
    examId: layout.id,
    version: layout.version,
    isDeterministicSuccess: fiducials.isValid && fallbackCount === 0,
    processingTimeMs,
    overallConfidence,
    fiducialsDetected: fiducials.isValid,
    skewAngleDegrees: Number(fiducials.skewAngleDegrees.toFixed(1)),
    totalQuestions: totalQ,
    questions: questionResults,
    score,
    correctCount,
    fallbackCount
  }
}
