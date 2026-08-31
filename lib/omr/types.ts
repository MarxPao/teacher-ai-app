/**
 * types.ts — Tipos e Estruturas de Dados para o Motor de OMR Determinístico
 */

export interface Point2D {
  x: number
  y: number
}

export interface FiducialCorner {
  position: 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left'
  center: Point2D
  width: number
  height: number
  confidence: number // 0 a 1
}

export interface SheetFiducials {
  topLeft: Point2D
  topRight: Point2D
  bottomRight: Point2D
  bottomLeft: Point2D
  isValid: boolean
  skewAngleDegrees: number
  aspectRatio: number
}

export interface BubbleOptionCoord {
  option: 'A' | 'B' | 'C' | 'D' | 'E'
  center: Point2D // Coordenadas no espaço canônico (ex: 1000 x 1414)
  radius: number  // Raio do círculo no espaço canônico
}

export interface QuestionBubbleLayout {
  questionNumber: number
  options: BubbleOptionCoord[]
}

export interface ExamSheetLayout {
  id: string
  title: string
  version: string // 'Form_A' | 'Form_B'
  totalQuestions: number
  canonicalWidth: number  // Padrão: 1000
  canonicalHeight: number // Padrão: 1414 (A4 ratio)
  fiducials: {
    topLeft: Point2D
    topRight: Point2D
    bottomRight: Point2D
    bottomLeft: Point2D
    markerSize: number
  }
  questions: QuestionBubbleLayout[]
  answerKey?: Record<number, string>
}

export type OMRMarkingClassification =
  | 'single_mark'       // 1 alternativa marcada com alta clareza
  | 'blank'             // Nenhuma alternativa marcada
  | 'multiple_marks'    // 2 ou mais alternativas com preenchimento forte (inválida)
  | 'scratched_out'     // Rasura com possível correção ao lado
  | 'light_pencil'      // Marcação fraca/lápis claro
  | 'ambiguous'         // Marcação fora da área esperada ou traço duvidoso

export interface OptionReadingDetail {
  option: string
  fillRatio: number           // Razão de pixels escuros (0.0 a 1.0)
  meanLuminance: number       // 0 a 255
  backgroundLuminance: number // 0 a 255 no anel de papel
  contrastRatio: number       // meanLuminance vs background
  isMarked: boolean
}

export interface OMRQuestionResult {
  questionNumber: number
  detectedAnswer: string | null   // 'A' | 'B' | 'C' | 'D' | 'E' | null
  confidence: 'high' | 'medium' | 'low'
  classification: OMRMarkingClassification
  isAmbiguous: boolean
  optionsDetail: OptionReadingDetail[]
  visualEvidence: string
  needsAiFallback: boolean
  // Recorte da linha da questão em Base64 para inspeção visual do professor
  questionCropBase64?: string
  // Gabarito e correção
  correctAnswer?: string
  isCorrect?: boolean
  pointsAwarded?: number
}

export interface OMRSheetResult {
  examId?: string
  version?: string
  isDeterministicSuccess: boolean
  processingTimeMs: number
  overallConfidence: 'high' | 'medium' | 'low'
  fiducialsDetected: boolean
  skewAngleDegrees: number
  totalQuestions: number
  questions: OMRQuestionResult[]
  score?: number
  correctCount?: number
  fallbackCount: number
  rectifiedSheetBase64?: string
}
