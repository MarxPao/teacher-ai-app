'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast, showConfirm } from '@/components/Toast'

import React, { useState, useEffect, useCallback } from 'react'
import { checkOptionParallelism } from '@/lib/itemQualityChecker'
import { auditHaladynaGuidelines, HaladynaViolation, isCriticalHaladynaViolation, autoFixHaladynaViolations } from '@/lib/haladynaLinter'
import { auditReadingLoad, evaluateReadabilityForGrade, type ReadabilityGradeEvaluation } from '@/lib/readingLoadAuditor'
import { predictItemDifficulty, type DifficultyExplanation } from '@/lib/taskModelAIG'
import {
  STANDARD_COGNITIVE_ATTRIBUTES,
  computeIdealResponseEta,
  calculateItemDiagnosticIndex,
  classifyDINAItemQuality,
  computeContinuousIdealEta,
  evaluateQMatrixEmpiricalFit,
  type DINAItemParameters,
  type QMatrixFitEvaluation
} from '@/lib/qMatrixEngine'
import { analyzeItemDifferentialFunctioning } from '@/lib/difAnalysis'
import {
  applySympsonHetterGate,
  calculateMDISC,
  calculateMDIFF,
  evaluateDOptimality,
  auditItemExposureRates,
  SYMPSON_HETTER_MIN_SAMPLE_SIZE,
  type MirtItemParameters
} from '@/lib/mirtAndExposureEngine'
import { recordExamAuditEvent, type ExamAuditAction } from '@/lib/examAuditVersioning'
import { preLinterQualityGate } from '@/lib/itemConsistencyAndSimilarityEngine'
import { generateAnalyticalRubric, type AnalyticalRubric } from '@/lib/analyticalRubricGenerator'
import { deriveGrmFromAnalyticalRubric, type GrmItemParameters } from '@/lib/grmEngine'
import { deriveGpcmFromStepCount, type GpcmItemParameters } from '@/lib/gpcmEngine'
import { type RsmItemParameters } from '@/lib/rsmEngine'
import {
  auditQuestionDistractorDiagnostics,
  type DiagnosticDistractor
} from '@/lib/diagnosticDistractorEngine'
import {
  deriveDccFromDiagnosticDistractors,
  analyzeItemDistractorCurves,
  type ItemDccAnalysis
} from '@/lib/distractorCurveEngine'
import {
  generateItemFeedbackMatrix,
  type ItemFormativeFeedbackMatrix
} from '@/lib/formativeFeedbackRouter'

export interface QuestionOption {
  letter: string
  text: string
}

export type ProvenanceType = 'uploaded_source' | 'teacher_reference' | 'general_knowledge'

export interface Provenance {
  type: ProvenanceType
  sourceLabel?: string        // Nome do PDF, arquivo ou título da referência
  sourceUrl?: string          // URL manual informada pelo professor
  sourceSnippet?: string      // Trecho ou contexto específico de onde a questão derivou
  confidence: 'verified' | 'unverified'
  pageNumber?: number         // Número da página real de onde o conteúdo foi extraído
  unitTitle?: string          // Título da unidade/capítulo real
  chunkId?: string            // Identificador unívoco do chunk
}

export interface EditableQuestionItem {
  id: string
  number: number
  type: 'multiple_choice' | 'discursive' | 'true_false' | 'gap_fill' | 'matching' | 'reading_text' | 'other'
  typeLabel: string
  points: number
  stem: string
  contextText?: string
  options?: QuestionOption[]
  answerKey?: string
  parallelismWarning?: string
  readingLoadWarning?: string
  haladynaWarnings?: string[]
  haladynaViolations?: HaladynaViolation[]
  provenance?: Provenance
  predictedDifficulty?: number
  predictedDifficultyLabel?: string
  difficultyExplanation?: DifficultyExplanation
  activeRadicals?: string[]
  cognitiveAttributes?: string[]
  attributeWeights?: Record<string, number>
  dinaParameters?: DINAItemParameters
  qMatrixFit?: QMatrixFitEvaluation
  difClassification?: 'classe_A_negligivel' | 'classe_B_moderado' | 'classe_C_severo' | 'insufficient_data'
  similarityWarning?: string
  consistencyWarning?: string
  preLinterGatePassed?: boolean
  readabilityEvaluation?: ReadabilityGradeEvaluation
  rubric?: AnalyticalRubric
  mirt?: MirtItemParameters
  grm?: GrmItemParameters
  gpcm?: GpcmItemParameters
  rsm?: RsmItemParameters
  diagnosticDistractors?: DiagnosticDistractor[]
  diagnosticCoverage?: number
  dccAnalysis?: ItemDccAnalysis
  feedbackMatrix?: ItemFormativeFeedbackMatrix
}

interface EditableQuestionBoxesProps {
  initialContent: string
  onContentChange: (newContentHtml: string) => void
  onAskRafinhaForQuestion?: (questionIndex: number, currentQuestion: EditableQuestionItem, userInstruction: string) => Promise<string | void>
  examId?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSER INTELIGENTE DE HTML / MARKDOWN PARA BOXES ESTRUTURADOS
// ─────────────────────────────────────────────────────────────────────────────

export function parseContentToQuestions(raw: string, defaultProvenance?: Provenance): EditableQuestionItem[] {
  if (!raw || !raw.trim()) return []

  // Extrai proveniência serializada em tags HTML caso existam
  const itemTagMatches = Array.from(raw.matchAll(/<div[^>]*class=["'][^"']*exam-question-item[^"']*["'][^>]*>/gi))
  const tagProvenances: Provenance[] = itemTagMatches.map(m => {
    const tag = m[0]
    const typeMatch = tag.match(/data-provenance-type=["']([^"']+)["']/i)
    const labelMatch = tag.match(/data-source-label=["']([^"']+)["']/i)
    const urlMatch = tag.match(/data-source-url=["']([^"']+)["']/i)
    const confMatch = tag.match(/data-confidence=["']([^"']+)["']/i)
    const pageMatch = tag.match(/data-page-number=["']([^"']+)["']/i)
    const unitMatch = tag.match(/data-unit-title=["']([^"']+)["']/i)
    const chunkMatch = tag.match(/data-chunk-id=["']([^"']+)["']/i)
    if (typeMatch) {
      return {
        type: typeMatch[1] as ProvenanceType,
        sourceLabel: labelMatch ? labelMatch[1] : undefined,
        sourceUrl: urlMatch ? urlMatch[1] : undefined,
        confidence: (confMatch && confMatch[1] === 'verified' ? 'verified' : 'unverified') as 'verified' | 'unverified',
        pageNumber: pageMatch ? parseInt(pageMatch[1], 10) : defaultProvenance?.pageNumber,
        unitTitle: unitMatch ? unitMatch[1] : defaultProvenance?.unitTitle,
        chunkId: chunkMatch ? chunkMatch[1] : defaultProvenance?.chunkId
      }
    }
    return defaultProvenance || {
      type: 'general_knowledge',
      sourceLabel: 'Conhecimento Geral da IA',
      confidence: 'unverified'
    }
  })

  const cleanText = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .trim()

  const lines = cleanText.split('\n')
  const questions: EditableQuestionItem[] = []

  let currentStem = ''
  let currentContext = ''
  let currentOpts: QuestionOption[] = []
  let currentAnswer = ''
  let currentType: EditableQuestionItem['type'] = 'discursive'
  let currentPoints = 1.0
  let hasSeenFirstQuestion = false

  const flushQuestion = () => {
    if (!currentStem.trim() && currentOpts.length === 0) return

    let typeLabel = 'Dissertativa'
    if (currentOpts.length > 0) {
      if (currentOpts.length === 2 && currentOpts.some(o => o.text.toLowerCase().includes('verdadeiro') || o.text.toLowerCase().includes('falso') || o.letter === 'V' || o.letter === 'F')) {
        currentType = 'true_false'
        typeLabel = 'Verdadeiro / Falso'
      } else {
        currentType = 'multiple_choice'
        typeLabel = 'Múltipla Escolha'
      }
    } else if (/_{3,}|\(\s*\.\.\.\s*\)|\[\s*\.\.\.\s*\]|fill\s+in|complete/i.test(currentStem)) {
      currentType = 'gap_fill'
      typeLabel = 'Lacunas (Gap Fill)'
    } else if (/relacione|associe|match|coluna/i.test(currentStem)) {
      currentType = 'matching'
      typeLabel = 'Associação de Colunas'
    } else if (/leia o texto|read the text|com base no texto|interprete/i.test(currentStem) || currentContext) {
      currentType = 'reading_text'
      typeLabel = 'Interpretação de Texto'
    }

    let parallelismWarning: string | undefined
    if (currentOpts.length >= 2) {
      const check = checkOptionParallelism(currentOpts.map(o => `${o.letter}) ${o.text}`))
      if (!check.isParallel) {
        parallelismWarning = check.warning
      }
    }

    let readingLoadWarning: string | undefined
    let readabilityEvaluation: ReadabilityGradeEvaluation | undefined
    const textToAudit = currentContext.trim() || (currentStem.length > 150 ? currentStem : '')
    if (textToAudit && textToAudit.split(/\s+/).length >= 35) {
      const loadAudit = auditReadingLoad(textToAudit)
      if (loadAudit.warning) {
        readingLoadWarning = `📊 Carga de Leitura: ${loadAudit.warning}`
      }
      readabilityEvaluation = evaluateReadabilityForGrade(textToAudit)
    }

    let haladynaWarnings: string[] | undefined
    let haladynaViolations: HaladynaViolation[] | undefined
    const haladynaCheck = auditHaladynaGuidelines(currentStem, currentOpts)
    if (haladynaCheck.hasViolations) {
      haladynaWarnings = haladynaCheck.violations.map(v => v.message)
      haladynaViolations = haladynaCheck.violations
    }

    const itemIndex = questions.length
    const assignedProvenance: Provenance = tagProvenances[itemIndex] || defaultProvenance || {
      type: 'general_knowledge',
      sourceLabel: 'Conhecimento Geral da IA',
      confidence: 'unverified'
    }

    const stemToPredict = currentStem.trim() || currentContext.trim()
    const difficultyPred = predictItemDifficulty(stemToPredict, currentOpts)

    const matchingAttrs: string[] = []
    const lowerStem = currentStem.toLowerCase()
    
    // Consulta direta aos atributos oficiais cadastrados na Q-Matrix canônica
    for (const attr of STANDARD_COGNITIVE_ATTRIBUTES) {
      if (attr.code === 'MATH-A1' && /fra[çc][ãa]o|fracion[áa]ri|denominador|numerador|mmc/i.test(lowerStem)) {
        matchingAttrs.push(attr.code)
      } else if (attr.code === 'MATH-A2' && /distinto|diferente|primo|soma|subtra/i.test(lowerStem) && /denominador|fra[çc]/i.test(lowerStem)) {
        matchingAttrs.push(attr.code)
      } else if (attr.code === 'LP-A1' && /reg[êe]ncia|preposi[çc][ãa]o|obedecer|aspirar|visar|assistir/i.test(lowerStem)) {
        matchingAttrs.push(attr.code)
      } else if (attr.code === 'LP-A2' && /pronome|onde|aonde|cujo|quem|que\s+relativo/i.test(lowerStem)) {
        matchingAttrs.push(attr.code)
      } else if (attr.code === 'EN-A1' && /present\s+perfect|simple\s+past|participle|since|for|already|yet/i.test(lowerStem)) {
        matchingAttrs.push(attr.code)
      }
    }

    // Avalia o gate de poder estatístico de DIF (iniciando sob N=0 pré-aplicação)
    const difAuditPre = currentOpts.length >= 2
      ? analyzeItemDifferentialFunctioning(`q_${questions.length + 1}`, [])
      : null

    // Avaliação de Self-Consistency e Similaridade Semântica (Onda B - Fase B1)
    const preLinterResult = preLinterQualityGate({
      stem: currentStem.trim() || currentContext.trim(),
      options: currentOpts,
      answerKey: currentAnswer.trim() || undefined
    })

    const generatedRubric = (currentType === 'discursive' || currentType === 'reading_text') && currentStem.trim()
      ? generateAnalyticalRubric({
          questionStem: currentStem.trim(),
          contextText: currentContext.trim() || undefined
        })
      : undefined

    const derivedGrm = generatedRubric
      ? deriveGrmFromAnalyticalRubric(generatedRubric, `q_${questions.length + 1}`)
      : undefined

    const distractorAnalysis = currentOpts.length >= 2
      ? auditQuestionDistractorDiagnostics({
          id: `q_${questions.length + 1}`,
          number: questions.length + 1,
          type: currentType,
          typeLabel,
          points: currentPoints,
          stem: currentStem.trim(),
          options: currentOpts,
          answerKey: currentAnswer.trim()
        } as EditableQuestionItem)
      : undefined

    const dccParams = currentOpts.length >= 2
      ? deriveDccFromDiagnosticDistractors(
          currentAnswer.trim() || (currentOpts[0]?.letter || 'A'),
          currentOpts.map(o => {
            const diag = distractorAnalysis?.distractors.find(d => d.letter === o.letter)
            return {
              letter: o.letter,
              text: o.text,
              plausibilityScore: diag?.plausibilityScore,
              errorType: diag?.errorType
            }
          })
        )
      : []
    const dccAnalysis = dccParams.length >= 2
      ? analyzeItemDistractorCurves(`q_${questions.length + 1}`, dccParams)
      : undefined

    const feedbackMatrix = currentOpts.length >= 2
      ? generateItemFeedbackMatrix({
          id: `q_${questions.length + 1}`,
          number: questions.length + 1,
          type: currentType,
          typeLabel,
          points: currentPoints,
          stem: currentStem.trim(),
          options: currentOpts,
          answerKey: currentAnswer.trim(),
          diagnosticDistractors: distractorAnalysis?.distractors
        } as EditableQuestionItem)
      : undefined

    questions.push({
      id: `q_${Date.now()}_${questions.length + 1}_${Math.random().toString(36).slice(2, 6)}`,
      number: questions.length + 1,
      type: currentType,
      typeLabel,
      points: currentPoints,
      stem: currentStem.trim(),
      contextText: currentContext.trim() || undefined,
      options: currentOpts.length > 0 ? [...currentOpts] : undefined,
      answerKey: currentAnswer.trim() || undefined,
      parallelismWarning,
      readingLoadWarning,
      haladynaWarnings,
      haladynaViolations,
      provenance: assignedProvenance,
      predictedDifficulty: difficultyPred.predictedDifficulty,
      predictedDifficultyLabel: difficultyPred.formulaString,
      difficultyExplanation: difficultyPred.explanation,
      activeRadicals: difficultyPred.activeRadicals.map(r => r.name),
      cognitiveAttributes: matchingAttrs.length > 0 ? matchingAttrs : undefined,
      difClassification: difAuditPre?.classification,
      consistencyWarning: preLinterResult.rejectionReason,
      similarityWarning: preLinterResult.similarity.warning,
      preLinterGatePassed: preLinterResult.passed,
      readabilityEvaluation,
      rubric: generatedRubric,
      grm: derivedGrm,
      diagnosticDistractors: distractorAnalysis?.distractors,
      diagnosticCoverage: distractorAnalysis?.diagnosticCoveragePercentage,
      dccAnalysis,
      feedbackMatrix
    })

    currentStem = ''
    currentContext = ''
    currentOpts = []
    currentAnswer = ''
    currentType = 'discursive'
    currentPoints = 1.0
  }

  lines.forEach(line => {
    const trimmed = line.trim()
    if (!trimmed) return

    // Detecta início de questão (ex: "1.", "1)", "Questão 1:", "Questão 1 (1 pt)", "Question 1:", ou "1")
    const qMatch = trimmed.match(/^(\d+)[\.\)]\s*(.*)$/i) || 
                   trimmed.match(/^(?:Questão|Question)\s*(\d+)\b[:\.\)]?\s*(.*)$/i) ||
                   trimmed.match(/^(\d+)$/)
    if (qMatch) {
      flushQuestion()
      hasSeenFirstQuestion = true
      currentStem = qMatch[2] || ''
      return
    }

    // Detecta pontuação entre parênteses isolada (ex: "(2.0 pts)", "(1 pt)")
    const ptMatch = trimmed.match(/^\(([0-9]+(?:\.[0-9]+)?)\s*pts?\)$/i)
    if (ptMatch) {
      currentPoints = parseFloat(ptMatch[1])
      return
    }

    // Detecta alternativas (ex: "a)", "A.", "(A)", "a -")
    const optMatch = trimmed.match(/^[\(\[]?([a-eA-E])[\)\]\.\-]\s*(.*)$/)
    if (optMatch) {
      currentOpts.push({
        letter: optMatch[1].toUpperCase(),
        text: optMatch[2] || ''
      })
      return
    }

    // Detecta gabarito / resposta
    if (/^(?:Gabarito|Resposta|Answer|Chave|Feedback)[:\s]/i.test(trimmed)) {
      currentAnswer = trimmed.replace(/^(?:Gabarito|Resposta|Answer|Chave|Feedback)[:\s]*/i, '')
      return
    }

    // Continuação do enunciado ou preenchimento de enunciado inicial
    if (currentStem) {
      if (currentOpts.length > 0) {
        currentAnswer = (currentAnswer ? currentAnswer + '\n' : '') + trimmed
      } else {
        currentStem += '\n' + trimmed
      }
    } else if (hasSeenFirstQuestion) {
      currentStem = trimmed
    } else {
      currentContext = (currentContext ? currentContext + '\n' : '') + trimmed
    }
  })

  flushQuestion()

  // Se o parser não encontrou padrão de questões estruturadas, cria uma única editável
  if (questions.length === 0 && cleanText.trim()) {
    questions.push({
      id: `q_${Date.now()}_1`,
      number: 1,
      type: 'reading_text',
      typeLabel: 'Atividade / Conteúdo',
      points: 10,
      stem: cleanText.trim(),
    })
  }

  return questions
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPILADOR DE QUESTÕES ESTRUTURADAS DE VOLTA PARA HTML FORMATADO
// ─────────────────────────────────────────────────────────────────────────────

export function compileQuestionsToHtml(questions: EditableQuestionItem[], customTitle?: string): string {
  if (!questions || questions.length === 0) return ''

  let html = '<div class="generated-exam-document" style="font-family: inherit; color: #2c1a0e; line-height: 1.6;">\n'
  if (customTitle) {
    html += `  <h2 style="font-size: 18px; font-weight: 700; color: #2c1a0e; margin-bottom: 16px; border-bottom: 2px solid #8b5e3c; padding-bottom: 6px;">${customTitle}</h2>\n`
  }

  questions.forEach((q, idx) => {
    const qNum = idx + 1
    const provType = q.provenance?.type || 'general_knowledge'
    const provLabel = (q.provenance?.sourceLabel || '').replace(/"/g, '&quot;')
    const provUrl = (q.provenance?.sourceUrl || '').replace(/"/g, '&quot;')
    const provConf = q.provenance?.confidence || 'unverified'
    const provPage = q.provenance?.pageNumber !== undefined ? ` data-page-number="${q.provenance.pageNumber}"` : ''
    const provUnit = q.provenance?.unitTitle ? ` data-unit-title="${q.provenance.unitTitle.replace(/"/g, '&quot;')}"` : ''
    const provChunk = q.provenance?.chunkId ? ` data-chunk-id="${q.provenance.chunkId.replace(/"/g, '&quot;')}"` : ''
    html += `  <div class="exam-question-item" data-provenance-type="${provType}" data-source-label="${provLabel}" data-source-url="${provUrl}" data-confidence="${provConf}"${provPage}${provUnit}${provChunk} style="margin-bottom: 24px; padding-bottom: 18px; border-bottom: 1px dashed #e8e0d0;">\n`
    
    // Cabeçalho da Questão
    html += `    <div style="font-weight: 700; font-size: 15px; color: #2c1a0e; margin-bottom: 8px;">\n`
    html += `      <span style="display: inline-block; background: #8b5e3c; color: #fff; padding: 2px 8px; border-radius: 6px; font-size: 12px; margin-right: 8px;">${qNum}.</span>\n`
    if (q.points) {
      html += `      <span style="float: right; font-size: 12px; color: #7a5c42; font-weight: 600;">(${q.points.toFixed(1)} pt${q.points !== 1 ? 's' : ''})</span>\n`
    }
    html += `    </div>\n`

    // Texto de Apoio / Contexto se houver
    if (q.contextText) {
      html += `    <div style="background: #faf6f0; border-left: 3px solid #8b5e3c; padding: 10px 14px; margin-bottom: 10px; font-style: italic; border-radius: 0 8px 8px 0; font-size: 13.5px;">\n`
      html += `      ${q.contextText.replace(/\n/g, '<br />')}\n`
      html += `    </div>\n`
    }

    // Enunciado
    html += `    <p style="margin: 0 0 12px 0; font-size: 14.5px; color: #2c1a0e;">${q.stem.replace(/\n/g, '<br />')}</p>\n`

    // Alternativas (se houver)
    if (q.options && q.options.length > 0) {
      html += `    <div class="exam-options-list" style="margin-left: 8px; display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px;">\n`
      q.options.forEach(opt => {
        html += `      <div style="display: flex; align-items: flex-start; gap: 8px; font-size: 14px;">\n`
        html += `        <strong style="min-width: 24px; color: #8b5e3c;">${opt.letter})</strong>\n`
        html += `        <span>${opt.text}</span>\n`
        html += `      </div>\n`
      })
      html += `    </div>\n`
    } else if (q.type === 'discursive') {
      // Linhas para resposta do aluno
      html += `    <div style="margin-top: 14px; margin-bottom: 12px;">\n`
      html += `      <div style="border-bottom: 1px solid #d5c8bb; height: 26px;"></div>\n`
      html += `      <div style="border-bottom: 1px solid #d5c8bb; height: 26px;"></div>\n`
      html += `      <div style="border-bottom: 1px solid #d5c8bb; height: 26px;"></div>\n`
      html += `    </div>\n`
    }

    // Gabarito / Chave de Correção
    if (q.answerKey) {
      html += `    <div class="exam-answer-key" style="margin-top: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 6px 12px; font-size: 12.5px; color: #166534;">\n`
      html += `      <strong>✓ Gabarito / Resolução:</strong> ${q.answerKey.replace(/\n/g, ' ')}\n`
      html += `    </div>\n`
    }

    html += `  </div>\n`
  })

  html += '</div>'
  return html
}

export const serializeQuestionsToHtml = compileQuestionsToHtml

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL: EDITABLE QUESTION BOXES
// ─────────────────────────────────────────────────────────────────────────────

export default function EditableQuestionBoxes({
  initialContent,
  onContentChange,
  onAskRafinhaForQuestion,
  examId
}: EditableQuestionBoxesProps) {
  const effectiveExamId = examId || 'exam_current'
  const [questions, setQuestions] = useState<EditableQuestionItem[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAnswerKeys, setShowAnswerKeys] = useState(true)
  const [rafinhaPromptModalQIndex, setRafinhaPromptModalQIndex] = useState<number | null>(null)
  const [rafinhaPromptText, setRafinhaPromptText] = useState('')
  const [rafinhaLoading, setRafinhaLoading] = useState(false)

  // Parse inicial quando o conteúdo muda
  useEffect(() => {
    if (initialContent) {
      const parsed = parseContentToQuestions(initialContent)
      setQuestions(parsed)
    }
  }, [initialContent])

  // Emite alterações de volta
  const triggerUpdate = useCallback((updated: EditableQuestionItem[]) => {
    const reAudited = updated.map(q => {
      let haladynaWarnings: string[] | undefined
      let haladynaViolations: HaladynaViolation[] | undefined
      if (q.stem || (q.options && q.options.length > 0)) {
        const audit = auditHaladynaGuidelines(q.stem, q.options)
        if (audit.hasViolations) {
          haladynaWarnings = audit.violations.map(v => v.message)
          haladynaViolations = audit.violations
        }
      }
      return { ...q, haladynaWarnings, haladynaViolations }
    })
    setQuestions(reAudited)
    const compiled = compileQuestionsToHtml(reAudited)
    onContentChange(compiled)
  }, [onContentChange])

  // Reordenação: Mover para Cima
  const handleMoveUp = (index: number) => {
    if (index === 0) return
    const updated = [...questions]
    const temp = updated[index - 1]
    updated[index - 1] = updated[index]
    updated[index] = temp
    updated.forEach((q, i) => { q.number = i + 1 })
    triggerUpdate(updated)
    recordExamAuditEvent({
      examId: effectiveExamId,
      action: 'questions_reordered',
      diffSummary: `Questão #${index + 1} movida para cima`,
      questionNumber: index
    })
  }

  // Reordenação: Mover para Baixo
  const handleMoveDown = (index: number) => {
    if (index === questions.length - 1) return
    const updated = [...questions]
    const temp = updated[index + 1]
    updated[index + 1] = updated[index]
    updated[index] = temp
    updated.forEach((q, i) => { q.number = i + 1 })
    triggerUpdate(updated)
    recordExamAuditEvent({
      examId: effectiveExamId,
      action: 'questions_reordered',
      diffSummary: `Questão #${index + 1} movida para baixo`,
      questionNumber: index + 2
    })
  }

  // Excluir Questão
  const handleDelete = async (index: number) => {
    if (!(await showConfirm({ message: `Deseja realmente excluir a Questão #${index + 1}?` }))) return
    const target = questions[index]
    const hasHaladynaViolations = target.haladynaViolations && target.haladynaViolations.length > 0
    const action: ExamAuditAction = hasHaladynaViolations ? 'haladyna_violation_removed' : 'question_removed'
    const diffSummary = hasHaladynaViolations
      ? `Questão #${target.number} excluída para sanar violação(ões) Haladyna: ${target.haladynaViolations!.map(v => v.ruleId).join(', ')}`
      : `Questão #${target.number} excluída manualmente`

    recordExamAuditEvent({
      examId: effectiveExamId,
      action,
      diffSummary,
      questionNumber: target.number,
      details: {
        stemSnippet: target.stem.slice(0, 60),
        violations: target.haladynaViolations
      }
    })

    const updated = questions.filter((_, i) => i !== index)
    updated.forEach((q, i) => { q.number = i + 1 })
    triggerUpdate(updated)
  }

  // Duplicar Questão
  const handleDuplicate = (index: number) => {
    const target = questions[index]
    const copy: EditableQuestionItem = {
      ...target,
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      number: index + 2,
      stem: target.stem + ' (Cópia)',
      options: target.options ? target.options.map(o => ({ ...o })) : undefined
    }
    const updated = [...questions.slice(0, index + 1), copy, ...questions.slice(index + 1)]
    updated.forEach((q, i) => { q.number = i + 1 })
    triggerUpdate(updated)
    recordExamAuditEvent({
      examId: effectiveExamId,
      action: 'question_duplicated',
      diffSummary: `Questão #${target.number} duplicada gerando nova Questão #${copy.number}`,
      questionNumber: copy.number
    })
  }

  // Adicionar Nova Questão Manual
  const handleAddNewQuestion = () => {
    const newQ: EditableQuestionItem = {
      id: `q_${Date.now()}_${questions.length + 1}`,
      number: questions.length + 1,
      type: 'multiple_choice',
      typeLabel: 'Múltipla Escolha',
      points: 1.0,
      stem: 'Digite o enunciado da nova questão aqui...',
      options: [
        { letter: 'A', text: 'Primeira alternativa' },
        { letter: 'B', text: 'Segunda alternativa' },
        { letter: 'C', text: 'Terceira alternativa' },
        { letter: 'D', text: 'Quarta alternativa' }
      ],
      answerKey: 'A) Primeira alternativa'
    }
    const updated = [...questions, newQ]
    triggerUpdate(updated)
    setEditingId(newQ.id)

    recordExamAuditEvent({
      examId: effectiveExamId,
      action: 'question_added',
      diffSummary: `Nova Questão #${newQ.number} adicionada manualmente`,
      questionNumber: newQ.number
    })
  }

  // Atualizar Campo Específico
  const handleFieldChange = (index: number, field: keyof EditableQuestionItem, value: any) => {
    const target = questions[index]
    const updated = [...questions]
    updated[index] = { ...updated[index], [field]: value }
    triggerUpdate(updated)

    let action: ExamAuditAction = 'stem_edited'
    let summary = `Questão #${target.number}: campo ${String(field)} alterado`
    if (field === 'stem') {
      action = 'stem_edited'
      summary = `Enunciado da Questão #${target.number} editado`
    } else if (field === 'points') {
      action = 'points_changed'
      summary = `Pontuação da Questão #${target.number} alterada para ${value} pts`
    } else if (field === 'answerKey') {
      action = 'answer_key_changed'
      summary = `Gabarito da Questão #${target.number} alterado`
    }

    recordExamAuditEvent({
      examId: effectiveExamId,
      action,
      diffSummary: summary,
      questionNumber: target.number,
      details: { field, value }
    })
  }

  // Atualizar Opção Específica
  const handleOptionChange = (qIndex: number, optIndex: number, newText: string) => {
    const updated = [...questions]
    const opts = [...(updated[qIndex].options || [])]
    const oldText = opts[optIndex]?.text || ''
    opts[optIndex] = { ...opts[optIndex], text: newText }
    updated[qIndex].options = opts
    triggerUpdate(updated)

    recordExamAuditEvent({
      examId: effectiveExamId,
      action: 'distractor_edited',
      diffSummary: `Alternativa ${opts[optIndex]?.letter} da Questão #${questions[qIndex].number} editada`,
      questionNumber: questions[qIndex].number,
      details: {
        letter: opts[optIndex]?.letter,
        oldText: oldText.slice(0, 50),
        newText: newText.slice(0, 50)
      }
    })
  }

  // Adicionar Alternativa
  const handleAddOption = (qIndex: number) => {
    const updated = [...questions]
    const opts = [...(updated[qIndex].options || [])]
    const letters = ['A', 'B', 'C', 'D', 'E', 'F']
    const nextLetter = letters[opts.length] || String.fromCharCode(65 + opts.length)
    opts.push({ letter: nextLetter, text: 'Nova alternativa' })
    updated[qIndex].options = opts
    triggerUpdate(updated)
  }

  // Remover Alternativa
  const handleRemoveOption = (qIndex: number, optIndex: number) => {
    const updated = [...questions]
    const opts = (updated[qIndex].options || []).filter((_, i) => i !== optIndex)
    updated[qIndex].options = opts
    triggerUpdate(updated)
  }

  // Auto-Fix das Diretrizes Psicométricas de Haladyna (Onda B - Fase B2)
  const handleAutoFixHaladyna = (index: number) => {
    const q = questions[index]
    if (!q) return

    const fixResult = autoFixHaladynaViolations(q.stem, q.options, q.answerKey)
    if (!fixResult.wasModified) {
      toast.info('Nenhuma violação passível de auto-correção automática encontrada.')
      return
    }

    const updated = [...questions]
    updated[index] = {
      ...updated[index],
      stem: fixResult.fixedStem,
      options: fixResult.fixedOptions,
      answerKey: fixResult.fixedAnswerKey || updated[index].answerKey,
      haladynaWarnings: fixResult.remainingViolations.map(v => v.message),
      haladynaViolations: fixResult.remainingViolations
    }
    triggerUpdate(updated)

    recordExamAuditEvent({
      examId: effectiveExamId,
      action: 'haladyna_violation_removed',
      questionNumber: q.number,
      diffSummary: `Auto-fix Haladyna aplicado na Q${q.number}: ${fixResult.appliedFixes.join('; ')}`,
      details: {
        appliedFixes: fixResult.appliedFixes,
        remainingCount: fixResult.remainingViolations.length
      }
    })

    toast.success(`✨ Q${q.number}: ${fixResult.appliedFixes.length} correção(ões) de Haladyna aplicada(s)!`)
  }

  // Geração / Regeneração de Rubrica Analítica com 4 Níveis Likert (Onda B - Fase B3)
  const handleGenerateRubric = (index: number) => {
    const q = questions[index]
    if (!q) return

    const generated = generateAnalyticalRubric({
      questionStem: q.stem,
      contextText: q.contextText
    })

    const updated = [...questions]
    const derivedGrm = deriveGrmFromAnalyticalRubric(generated, q.id || `q_${q.number}`)
    updated[index] = { ...updated[index], rubric: generated, grm: derivedGrm }
    triggerUpdate(updated)

    recordExamAuditEvent({
      examId: effectiveExamId,
      action: 'stem_edited',
      questionNumber: q.number,
      diffSummary: `Rubrica analítica com 4 níveis gerada para Questão #${q.number}`,
      details: { criteriaCount: generated.criteria.length }
    })

    toast.success(`📊 Rubrica analítica de 4 níveis gerada para a Questão #${q.number}!`)
  }

  // Chamar Rafinha para Reformular Questão
  const handleCallRafinha = async (index: number) => {
    if (!onAskRafinhaForQuestion) {
      toast.warning('Assistente Rafinha IA não disponível neste modo.')
      return
    }
    setRafinhaLoading(true)
    try {
      const q = questions[index]
      await onAskRafinhaForQuestion(index, q, rafinhaPromptText || 'Reformule e aprimore o enunciado tornando-o mais desafiador e contextualizado.')
      setRafinhaPromptModalQIndex(null)
      setRafinhaPromptText('')
    } finally {
      setRafinhaLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Barra de Ferramentas dos Boxes Editáveis */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#faf6f0',
        padding: '12px 18px',
        borderRadius: RADIUS.lg,
        border: '1px solid #ede8dc',
        flexWrap: 'wrap',
        gap: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#2c1a0e', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-layout-cards" />
            <span>{questions.length} Questões em Boxes Editáveis</span>
          </span>
          <span style={{ fontSize: 12, color: '#8b5e3c', background: 'rgba(139,94,60,0.12)', padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>
            Total: {questions.reduce((acc, q) => acc + (q.points || 1), 0).toFixed(1)} pts
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => setShowAnswerKeys(prev => !prev)}
            style={{
              padding: '6px 12px',
              borderRadius: RADIUS.md,
              border: '1px solid #d5c8bb',
              background: showAnswerKeys ? '#f0fdf4' : '#fff',
              color: showAnswerKeys ? '#166534' : '#665c54',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <i className={showAnswerKeys ? 'ti ti-eye-off' : 'ti ti-check'} />
            <span>{showAnswerKeys ? 'Ocultar Gabaritos' : 'Exibir Gabaritos'}</span>
          </button>

          <button
            type="button"
            onClick={handleAddNewQuestion}
            style={{
              padding: '6px 14px',
              borderRadius: RADIUS.md,
              border: 'none',
              background: '#8b5e3c',
              color: '#fff',
              fontSize: TEXT.bodyCompact,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <i className="ti ti-plus" /> + Nova Questão
          </button>
        </div>
      </div>

      {/* Lista de Boxes Editáveis */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {questions.map((q, index) => {
          const isFirst = index === 0
          const isLast = index === questions.length - 1

          return (
            <div
              key={q.id}
              style={{
                background: '#ffffff',
                border: '1px solid rgba(139,115,85,0.22)',
                borderRadius: RADIUS.xl,
                padding: '16px 20px',
                boxShadow: '0 4px 14px rgba(44,26,14,0.04)',
                transition: 'all 0.15s ease'
              }}
            >
              {/* Header do Box da Questão */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
                paddingBottom: 10,
                borderBottom: '1px solid #f5efe6'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Badge com Número */}
                  <span style={{
                    width: 28,
                    height: 28,
                    borderRadius: RADIUS.md,
                    background: '#8b5e3c',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 13
                  }}>
                    #{q.number}
                  </span>

                  {/* Seletor de Tipo */}
                  <select
                    value={q.type}
                    onChange={e => {
                      const newType = e.target.value as EditableQuestionItem['type']
                      const typeLabelMap: Record<string, string> = {
                        multiple_choice: 'Múltipla Escolha',
                        discursive: 'Dissertativa',
                        true_false: 'Verdadeiro / Falso',
                        gap_fill: 'Lacunas (Gap Fill)',
                        matching: 'Associação de Colunas',
                        reading_text: 'Interpretação de Texto',
                        other: 'Outro'
                      }
                      handleFieldChange(index, 'type', newType)
                      handleFieldChange(index, 'typeLabel', typeLabelMap[newType] || 'Outro')
                    }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: RADIUS.md,
                      border: '1px solid #d5c8bb',
                      background: '#faf6f0',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#2c1a0e',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="multiple_choice">⭕ Múltipla Escolha</option>
                    <option value="discursive">✍️ Dissertativa / Aberta</option>
                    <option value="true_false">🔘 Verdadeiro / Falso (V/F)</option>
                    <option value="gap_fill">🔤 Lacunas (Gap Fill)</option>
                    <option value="matching">🔀 Associação de Colunas</option>
                    <option value="reading_text">📖 Leitura & Interpretação</option>
                  </select>

                  {/* Pontuação Editável */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6 }}>
                    <span style={{ fontSize: TEXT.caption, color: '#7a5c42', fontWeight: 600 }}>Valor:</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={q.points}
                      onChange={e => handleFieldChange(index, 'points', parseFloat(e.target.value) || 1.0)}
                      style={{
                        width: 54,
                        padding: '3px 6px',
                        borderRadius: 6,
                        border: '1px solid #d5c8bb',
                        fontSize: 12,
                        fontWeight: 700,
                        textAlign: 'center',
                        background: '#faf6f0'
                      }}
                    />
                    <span style={{ fontSize: TEXT.caption, color: '#7a5c42' }}>pt</span>
                  </div>
                </div>

                {/* Botões de Ação e Reordenação */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {/* Reordenar ⬆️ */}
                  <button
                    type="button"
                    onClick={() => handleMoveUp(index)}
                    disabled={isFirst}
                    title="Mover para cima"
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid #d5c8bb',
                      background: isFirst ? '#f5efe6' : '#fff',
                      color: isFirst ? '#a08060' : '#2c1a0e',
                      cursor: isFirst ? 'not-allowed' : 'pointer',
                      fontSize: 12,
                      fontWeight: 800
                    }}
                  >
                    ⬆️
                  </button>

                  {/* Reordenar ⬇️ */}
                  <button
                    type="button"
                    onClick={() => handleMoveDown(index)}
                    disabled={isLast}
                    title="Mover para baixo"
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid #d5c8bb',
                      background: isLast ? '#f5efe6' : '#fff',
                      color: isLast ? '#a08060' : '#2c1a0e',
                      cursor: isLast ? 'not-allowed' : 'pointer',
                      fontSize: 12,
                      fontWeight: 800
                    }}
                  >
                    ⬇️
                  </button>

                  {/* Rafinha IA Helper */}
                  <button
                    type="button"
                    onClick={() => {
                      setRafinhaPromptModalQIndex(index)
                      setRafinhaPromptText('')
                    }}
                    title="Pedir para a Rafinha IA ajustar esta questão"
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid #fde68a',
                      background: '#fef3c7',
                      color: '#b58900',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <i className="ti ti-sparkles" /> Rafinha
                  </button>

                  {/* Duplicar */}
                  <button
                    type="button"
                    onClick={() => handleDuplicate(index)}
                    title="Duplicar questão"
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid #d5c8bb',
                      background: '#fff',
                      color: '#2c1a0e',
                      cursor: 'pointer',
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <i className="ti ti-copy" />
                  </button>

                  {/* Excluir */}
                  <button
                    type="button"
                    onClick={() => handleDelete(index)}
                    title="Excluir questão"
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid #fecaca',
                      background: '#fee2e2',
                      color: '#dc2626',
                      cursor: 'pointer',
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <i className="ti ti-trash" />
                  </button>
                </div>
              </div>

              {/* Corpo do Box: Enunciado e Conteúdo */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Badge de Proveniência da Questão (Pilar 1 - Honestidade) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderRadius: RADIUS.sm, background: '#faf6f0', border: '1px solid #ede8dc', fontSize: 11.5 }}>
                  <span style={{ fontWeight: 700, color: '#7a5c42', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="ti ti-history" style={{ fontSize: 13 }} /> Proveniência:
                  </span>
                  {q.provenance?.type === 'uploaded_source' && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#065f46', fontWeight: 700 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#059669' }} />
                      <span>
                        📑 Fonte: {q.provenance.sourceLabel || 'Documento Carregado'}
                        {q.provenance.pageNumber !== undefined && `, pág. ${q.provenance.pageNumber}`}
                        {q.provenance.unitTitle && `, ${q.provenance.unitTitle}`}
                      </span>
                      <span style={{ fontSize: 10, background: '#d1fae5', color: '#065f46', padding: '1px 5px', borderRadius: 4, border: '1px solid #a7f3d0' }}>Verificada</span>
                    </span>
                  )}
                  {q.provenance?.type === 'teacher_reference' && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#1e40af', fontWeight: 700 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2563eb' }} />
                      <span>🔗 Ref. Docente: {q.provenance.sourceLabel || q.provenance.sourceUrl || 'Referência Manual'}</span>
                      <span style={{ fontSize: 10, background: '#dbeafe', color: '#1e40af', padding: '1px 5px', borderRadius: 4, border: '1px solid #bfdbfe' }}>Verificada</span>
                    </span>
                  )}
                  {(!q.provenance || q.provenance.type === 'general_knowledge') && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#92400e', fontWeight: 700 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#d97706' }} />
                      <span>⚠️ Conhecimento Geral da IA</span>
                      <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: 4, border: '1px solid #fde68a' }}>Não Verificada</span>
                    </span>
                  )}
                </div>

                {/* Badge de Dificuldade Prevista (Pilar II - Task Model / LLTM de Fischer) */}
                {q.predictedDifficulty !== undefined && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: RADIUS.sm, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 11.5 }}>
                    <span style={{ fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
                      🎯 Dificuldade Prevista (a priori - LLTM):
                    </span>
                    <span style={{
                      fontWeight: 800,
                      color: q.predictedDifficulty < -0.6 ? '#166534' : q.predictedDifficulty <= 0.4 ? '#0284c7' : q.predictedDifficulty <= 1.2 ? '#d97706' : '#dc2626'
                    }}>
                      {q.predictedDifficulty >= 0 ? '+' : ''}{q.predictedDifficulty.toFixed(2)} logits
                    </span>
                    <span style={{ color: '#64748b', fontSize: 11 }}>
                      ({q.predictedDifficultyLabel || 'Estimativa matemática pré-aplicação'})
                    </span>
                  </div>
                )}

                {/* Badge Complementar: Explicação de Confiança Calibrada (Onda A - Fase A4) */}
                {q.difficultyExplanation && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 10px', borderRadius: RADIUS.sm, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 11.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: 4 }}>
                        💡 Por que este nível ({q.difficultyExplanation.confidenceLabel})?
                      </span>
                      <span style={{ color: '#15803d' }}>
                        {q.difficultyExplanation.summary}
                      </span>
                    </div>
                    {q.difficultyExplanation.activeFactors.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                        {q.difficultyExplanation.activeFactors.map(f => (
                          <span key={f.name} style={{ background: '#dcfce7', color: '#14532d', padding: '1px 6px', borderRadius: 4, fontSize: 10.5, border: '1px solid #86efac' }}>
                            • {f.name} ({f.impact})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Badge de Atributos Cognitivos (Pilar I - Q-Matrix & CDM/DINA) */}
                {q.cognitiveAttributes && q.cognitiveAttributes.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: '4px 10px', borderRadius: RADIUS.sm, background: '#f5f3ff', border: '1px solid #ddd6fe', fontSize: 11.5 }}>
                    <span style={{ fontWeight: 700, color: '#6d28d9', display: 'flex', alignItems: 'center', gap: 4 }}>
                      🧩 Atributos Cognitivos (Q-Matrix):
                    </span>
                    {q.cognitiveAttributes.map(attr => (
                      <span key={attr} style={{ background: '#ede9fe', color: '#5b21b6', padding: '1px 6px', borderRadius: 4, fontWeight: 700, fontSize: 10.5, border: '1px solid #c4b5fd' }}>
                        {attr}
                      </span>
                    ))}
                  </div>
                )}

                {/* Alerta de Viés DIF (Pilar IV - Mantel-Haenszel) */}
                {q.difClassification === 'classe_C_severo' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: RADIUS.sm, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 11.5, fontWeight: 700 }}>
                    <span>⛔ ALERTA PSICOMÉTRICO (DIF Classe C):</span>
                    <span style={{ fontWeight: 500 }}>Este item apresentou viés diferencial estatisticamente severo contra subgrupos de alunos. Recomendada substituição imediata.</span>
                  </div>
                )}

                {/* Alertas Pré-Linter (Onda B - Fase B1: Self-Consistency & Similaridade) */}
                {q.consistencyWarning && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: RADIUS.sm, background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c', fontSize: 11.5, fontWeight: 700 }}>
                    <span>⚠️ Self-Consistency Gate (Wang et al.):</span>
                    <span style={{ fontWeight: 500 }}>{q.consistencyWarning}</span>
                  </div>
                )}
                {q.similarityWarning && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: RADIUS.sm, background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309', fontSize: 11.5, fontWeight: 700 }}>
                    <span>📑 Similaridade Lexical / Banco:</span>
                    <span style={{ fontWeight: 500 }}>{q.similarityWarning}</span>
                  </div>
                )}

                {/* Texto de Apoio / Contexto Opcional */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label style={{ fontSize: TEXT.caption, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Enunciado / Instrução:
                    </label>
                  </div>
                  <textarea
                    value={q.stem}
                    onChange={e => handleFieldChange(index, 'stem', e.target.value)}
                    rows={3}
                    placeholder="Digite o enunciado da questão..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: RADIUS.md,
                      border: '1px solid #d5c8bb',
                      background: '#faf6f0',
                      fontSize: 14,
                      color: '#2c1a0e',
                      fontFamily: 'inherit',
                      lineHeight: 1.5,
                      resize: 'vertical',
                      outline: 'none'
                    }}
                  />
                  {q.readingLoadWarning && (
                    <div style={{
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      borderRadius: RADIUS.md,
                      padding: '6px 10px',
                      marginTop: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: TEXT.caption,
                      color: '#1e40af',
                      fontWeight: 600,
                      lineHeight: 1.4
                    }}>
                      <i className="ti ti-book" style={{ fontSize: 16, color: '#2563eb', flexShrink: 0 }} />
                      <span>{q.readingLoadWarning}</span>
                    </div>
                  )}
                  {q.readabilityEvaluation?.warning && (
                    <div style={{
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: RADIUS.md,
                      padding: '6px 10px',
                      marginTop: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: TEXT.caption,
                      color: '#92400e',
                      fontWeight: 600,
                      lineHeight: 1.4
                    }}>
                      <i className="ti ti-school" style={{ fontSize: 16, color: '#d97706', flexShrink: 0 }} />
                      <span><strong>Legibilidade (Flesch-Kincaid):</strong> {q.readabilityEvaluation.warning}</span>
                    </div>
                  )}
                  {q.dinaParameters && (
                    <div style={{
                      background: '#f5f3ff',
                      border: '1px solid #ddd6fe',
                      borderRadius: RADIUS.md,
                      padding: '6px 10px',
                      marginTop: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                      fontSize: TEXT.caption,
                      color: '#5b21b6',
                      fontWeight: 600,
                      lineHeight: 1.4
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="ti ti-chart-dots" style={{ fontSize: 16, color: '#7c3aed', flexShrink: 0 }} />
                        <span>
                          <strong>DINA Item:</strong> s_j = {q.dinaParameters.slippage_s.toFixed(2)} (deslize) | g_j = {q.dinaParameters.guessing_g.toFixed(2)} (chute)
                          {q.dinaParameters.itemDiagnosticIndex !== undefined && ` | IDI = ${q.dinaParameters.itemDiagnosticIndex.toFixed(2)}`}
                        </span>
                      </div>
                      <span style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: q.dinaParameters.isEmpirical ? '#ede9fe' : '#f1f5f9',
                        color: q.dinaParameters.isEmpirical ? '#6d28d9' : '#64748b'
                      }}>
                        {q.dinaParameters.isEmpirical ? `Empírico (N=${q.dinaParameters.sampleCount})` : 'Priors (N < 30)'}
                      </span>
                    </div>
                  )}
                  {q.qMatrixFit && (
                    <div style={{
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: RADIUS.md,
                      padding: '6px 10px',
                      marginTop: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                      fontSize: TEXT.caption,
                      color: '#166534',
                      fontWeight: 600,
                      lineHeight: 1.4
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="ti ti-check" style={{ fontSize: 16, color: '#16a34a', flexShrink: 0 }} />
                        <span>
                          <strong>Q-Fit:</strong> {(q.qMatrixFit.fitIndex * 100).toFixed(1)}% ({q.qMatrixFit.status === 'ajustado' ? 'Ajustado' : q.qMatrixFit.status === 'revisar_especificacao' ? 'Revisar Pesos' : 'Amostra em Formação'})
                          {q.attributeWeights && Object.keys(q.attributeWeights).length > 0 && ` | Pesos: ${Object.entries(q.attributeWeights).map(([k, w]) => `${k} (${w.toFixed(1)})`).join(', ')}`}
                        </span>
                      </div>
                      <span style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: q.qMatrixFit.status === 'ajustado' ? '#dcfce7' : '#fef3c7',
                        color: q.qMatrixFit.status === 'ajustado' ? '#15803d' : '#92400e'
                      }}>
                        N={q.qMatrixFit.sampleCount}
                      </span>
                    </div>
                  )}
                  {q.mirt && (
                    <div style={{
                      background: '#f0f9ff',
                      border: '1px solid #bae6fd',
                      borderRadius: RADIUS.md,
                      padding: '6px 10px',
                      marginTop: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                      fontSize: TEXT.caption,
                      color: '#0369a1',
                      fontWeight: 600,
                      lineHeight: 1.4
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="ti ti-compass" style={{ fontSize: 16, color: '#0284c7', flexShrink: 0 }} />
                        <span>
                          <strong>MIRT Multidimensional (MCAT):</strong> MDISC = {(q.mirt.mdisc ?? calculateMDISC(q.mirt.discriminations_a)).toFixed(2)} | MDIFF = {(q.mirt.mdiff ?? calculateMDIFF(q.mirt.discriminations_a, q.mirt.intercept_d)).toFixed(2)}
                          {q.mirt.pseudoGuessing_c !== undefined && ` | c_j = ${q.mirt.pseudoGuessing_c.toFixed(2)}`}
                          {q.mirt.exposureControl_k !== undefined && ` | k_j = ${q.mirt.exposureControl_k.toFixed(2)}`}
                          {q.mirt.dimensionNames && ` | Dimensões: [${q.mirt.dimensionNames.join(', ')}]`}
                        </span>
                      </div>
                      <span style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: '#e0f2fe',
                        color: '#0369a1'
                      }}>
                        {q.mirt.discriminations_a.length}D Compensatório (D-Optimality)
                      </span>
                    </div>
                  )}
                  {q.grm && (
                    <div style={{
                      background: '#fdf4ff',
                      border: '1px solid #f5d0fe',
                      borderRadius: RADIUS.md,
                      padding: '6px 10px',
                      marginTop: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                      fontSize: TEXT.caption,
                      color: '#86198f',
                      fontWeight: 600,
                      lineHeight: 1.4
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="ti ti-chart-arrows-vertical" style={{ fontSize: 16, color: '#a21caf', flexShrink: 0 }} />
                        <span>
                          <strong>TRI Politômica (GRM — Samejima):</strong> a = {q.grm.discrimination_a.toFixed(2)} | Limiares b = [{q.grm.thresholds_b.map(b => b.toFixed(2)).join(', ')}]
                          {q.grm.categoryLabels && ` | ${q.grm.categoryLabels.length} Níveis`}
                        </span>
                      </div>
                      <span style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: '#fae8ff',
                        color: '#86198f'
                      }}>
                        Graded Response Model (4 Níveis)
                      </span>
                    </div>
                  )}
                  {q.gpcm && (
                    <div style={{
                      background: '#f0fdfa',
                      border: '1px solid #99f6e4',
                      borderRadius: RADIUS.md,
                      padding: '6px 10px',
                      marginTop: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                      fontSize: TEXT.caption,
                      color: '#0f766e',
                      fontWeight: 600,
                      lineHeight: 1.4
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="ti ti-stairs" style={{ fontSize: 16, color: '#0d9488', flexShrink: 0 }} />
                        <span>
                          <strong>Créditos Parciais (GPCM — Muraki):</strong> a = {q.gpcm.discrimination_a.toFixed(2)} | b = {q.gpcm.location_b.toFixed(2)} | Passos d = [{q.gpcm.stepDifficulties_d.map(d => d.toFixed(2)).join(', ')}]
                        </span>
                      </div>
                      <span style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: '#ccfbf1',
                        color: '#0f766e'
                      }}>
                        {q.gpcm.stepDifficulties_d.length + 1} Categorias Adjacentes
                      </span>
                    </div>
                  )}
                  {q.rsm && (
                    <div style={{
                      background: '#fefce8',
                      border: '1px solid #fef08a',
                      borderRadius: RADIUS.md,
                      padding: '6px 10px',
                      marginTop: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                      fontSize: TEXT.caption,
                      color: '#854d0e',
                      fontWeight: 600,
                      lineHeight: 1.4
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="ti ti-ruler-measure" style={{ fontSize: 16, color: '#ca8a04', flexShrink: 0 }} />
                        <span>
                          <strong>Escala de Avaliação (RSM — Andrich):</strong> β = {q.rsm.location_beta.toFixed(2)} | Escala: {q.rsm.scale.scaleName} ({q.rsm.scale.categoryCount} cat.) | τ = [{q.rsm.scale.thresholds_tau.map(t => t.toFixed(2)).join(', ')}]
                        </span>
                      </div>
                      <span style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: '#fef9c3',
                        color: '#854d0e'
                      }}>
                        Rating Scale Model (Escala Compartilhada)
                      </span>
                    </div>
                  )}
                  {q.diagnosticDistractors && q.diagnosticDistractors.length > 0 && (
                    <div style={{
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: RADIUS.md,
                      padding: '6px 10px',
                      marginTop: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                      fontSize: TEXT.caption,
                      color: '#166534',
                      fontWeight: 600,
                      lineHeight: 1.4
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="ti ti-target" style={{ fontSize: 16, color: '#16a34a', flexShrink: 0 }} />
                        <span>
                          <strong>Distratores Diagnósticos (Fase F1):</strong> Cobertura {q.diagnosticCoverage ?? 100}% | {q.diagnosticDistractors.length} distratores modelados
                        </span>
                      </div>
                      <span style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: (q.diagnosticCoverage ?? 0) >= 80 ? '#dcfce7' : '#fef3c7',
                        color: (q.diagnosticCoverage ?? 0) >= 80 ? '#15803d' : '#92400e'
                      }}>
                        {(q.diagnosticCoverage ?? 0) >= 80 ? 'Padrão Ouro (Zero Fillers)' : 'Adequado'}
                      </span>
                    </div>
                  )}
                  {q.dccAnalysis && (
                    <div style={{
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: RADIUS.md,
                      padding: '6px 10px',
                      marginTop: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                      fontSize: TEXT.caption,
                      color: '#334155',
                      fontWeight: 600,
                      lineHeight: 1.4
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="ti ti-chart-dots" style={{ fontSize: 16, color: '#475569', flexShrink: 0 }} />
                        <span>
                          <strong>Curvas de Distratores (DCC — Thissen et al.):</strong> {q.dccAnalysis.functionalDistractorCount} funcionais | {q.dccAnalysis.nonFunctionalDistractorCount} inertes | Discriminação Positiva: {q.dccAnalysis.hasPositiveDiscriminatingDistractor ? '⚠️ SIM' : '0'}
                        </span>
                      </div>
                      <span style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: q.dccAnalysis.overallItemStatus === 'otimo' ? '#dcfce7' : q.dccAnalysis.overallItemStatus === 'revisar_distratores' ? '#fef3c7' : '#fee2e2',
                        color: q.dccAnalysis.overallItemStatus === 'otimo' ? '#15803d' : q.dccAnalysis.overallItemStatus === 'revisar_distratores' ? '#92400e' : '#b91c1c'
                      }}>
                        {q.dccAnalysis.overallItemStatus === 'otimo' ? 'Status: Ótimo' : q.dccAnalysis.overallItemStatus === 'revisar_distratores' ? 'Revisar Distratores' : 'Crítico (Ambiguidade)'}
                      </span>
                    </div>
                  )}
                  {q.feedbackMatrix && (
                    <div style={{
                      background: '#f5f3ff',
                      border: '1px solid #ddd6fe',
                      borderRadius: RADIUS.md,
                      padding: '6px 10px',
                      marginTop: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                      fontSize: TEXT.caption,
                      color: '#5b21b6',
                      fontWeight: 600,
                      lineHeight: 1.4
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="ti ti-messages" style={{ fontSize: 16, color: '#7c3aed', flexShrink: 0 }} />
                        <span>
                          <strong>Feedback Formativo (Hattie &amp; Timperley):</strong> {q.feedbackMatrix.coveredDistractorsCount}/{q.feedbackMatrix.totalOptions - 1} distratores roteados ({q.feedbackMatrix.coveragePercentage}%)
                        </span>
                      </div>
                      <span style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: q.feedbackMatrix.isFullyRouted ? '#ede9fe' : '#fef3c7',
                        color: q.feedbackMatrix.isFullyRouted ? '#6d28d9' : '#92400e'
                      }}>
                        {q.feedbackMatrix.isFullyRouted ? '100% Roteado (Task, Process, Self-Reg)' : 'Parcial'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Alternativas de Múltipla Escolha */}
                {(q.type === 'multiple_choice' || q.type === 'true_false' || (q.options && q.options.length > 0)) && (
                  <div style={{ background: '#faf6f0', padding: 12, borderRadius: RADIUS.md, border: '1px solid #ede8dc' }}>
                    {q.haladynaWarnings && q.haladynaWarnings.length > 0 && (
                      <div style={{
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: RADIUS.md,
                        padding: '8px 12px',
                        marginBottom: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        fontSize: TEXT.caption,
                        color: '#991b1b',
                        fontWeight: 600,
                        lineHeight: 1.4
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
                          <i className="ti ti-certificate" style={{ fontSize: 16, color: '#dc2626', flexShrink: 0 }} />
                          <span>Diretrizes Psicométricas de Haladyna:</span>
                        </div>
                        {q.haladynaViolations && q.haladynaViolations.length > 0 ? (
                          q.haladynaViolations.map((v, vi) => {
                            const isCrit = isCriticalHaladynaViolation(v)
                            return (
                              <div key={vi} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, paddingLeft: 6, marginTop: 2 }}>
                                <span style={{
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  fontSize: 10,
                                  fontWeight: 800,
                                  background: isCrit ? '#dc2626' : '#d97706',
                                  color: '#fff',
                                  flexShrink: 0
                                }}>
                                  {isCrit ? 'CRÍTICO' : 'AVISO'}
                                </span>
                                <span>{v.message}</span>
                              </div>
                            )
                          })
                        ) : (
                          q.haladynaWarnings.map((w, wi) => (
                            <span key={wi} style={{ paddingLeft: 22 }}>&bull; {w}</span>
                          ))
                        )}

                        <button
                          type="button"
                          onClick={() => handleAutoFixHaladyna(index)}
                          style={{
                            alignSelf: 'flex-start',
                            marginTop: 8,
                            padding: '5px 12px',
                            borderRadius: RADIUS.sm,
                            border: '1.5px solid #dc2626',
                            background: '#fff',
                            color: '#dc2626',
                            fontSize: 11.5,
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5
                          }}
                        >
                          ✨ Auto-Corrigir Diretrizes Haladyna
                        </button>
                      </div>
                    )}
                    {q.parallelismWarning && (
                      <div style={{
                        background: '#fef3c7',
                        border: '1px solid #fde68a',
                        borderRadius: RADIUS.md,
                        padding: '6px 10px',
                        marginBottom: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: TEXT.caption,
                        color: '#92400e',
                        fontWeight: 600,
                        lineHeight: 1.4
                      }}>
                        <i className="ti ti-alert-triangle" style={{ fontSize: 16, color: '#d97706', flexShrink: 0 }} />
                        <span><strong>Item Writing Quality:</strong> {q.parallelismWarning}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c' }}>
                        Alternativas de Resposta:
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAddOption(index)}
                        style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          border: '1px solid #d5c8bb',
                          background: '#fff',
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#2c1a0e',
                          cursor: 'pointer'
                        }}
                      >
                        + Alternativa
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(q.options || []).map((opt, optIdx) => (
                        <div key={optIdx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            width: 24,
                            height: 24,
                            borderRadius: 6,
                            background: '#8b5e3c',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                            fontWeight: 800
                          }}>
                            {opt.letter}
                          </span>
                          <input
                            type="text"
                            value={opt.text}
                            onChange={e => handleOptionChange(index, optIdx, e.target.value)}
                            placeholder={`Texto da alternativa ${opt.letter}...`}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              borderRadius: RADIUS.md,
                              border: '1px solid #d5c8bb',
                              background: '#fff',
                              fontSize: 13,
                              color: '#2c1a0e',
                              outline: 'none'
                            }}
                          />
                          {(q.options || []).length > 2 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(index, optIdx)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: '#dc2626',
                                cursor: 'pointer',
                                fontSize: 13,
                                padding: '4px'
                              }}
                              title="Remover alternativa"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Gabarito / Chave de Resposta */}
                {showAnswerKeys && (
                  <div>
                    <label style={{ fontSize: TEXT.caption, fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      ✓ Gabarito / Resolução Comentada:
                    </label>
                    <input
                      type="text"
                      value={q.answerKey || ''}
                      onChange={e => handleFieldChange(index, 'answerKey', e.target.value)}
                      placeholder="Ex: Alternativa B — Explicação gramatical ou resposta esperada..."
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: RADIUS.md,
                        border: '1px solid #bbf7d0',
                        background: '#f0fdf4',
                        fontSize: 13,
                        color: '#166534',
                        fontWeight: 600,
                        outline: 'none'
                      }}
                    />
                  </div>
                )}

                {/* Rubrica Analítica de Correção para Questões Discursivas (Onda B - Fase B3) */}
                {(q.type === 'discursive' || q.type === 'reading_text' || q.rubric) && (
                  <div style={{ marginTop: 10, padding: '10px 12px', background: '#f8fafc', borderRadius: RADIUS.md, border: '1px solid #cbd5e1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span>📊 Rubrica Analítica de Correção (Likert 4 Níveis):</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleGenerateRubric(index)}
                        style={{
                          padding: '3px 8px',
                          borderRadius: RADIUS.sm,
                          border: '1px solid #94a3b8',
                          background: '#fff',
                          color: '#334155',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {q.rubric ? '🔄 Regenerar Rubrica' : '✨ Gerar Rubrica'}
                      </button>
                    </div>

                    {q.rubric ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
                        <div style={{ color: '#475569', fontSize: 11 }}>
                          <strong>Critérios de Evidência Ancorados:</strong> {q.rubric.expectedKeyPoints.join(' • ')}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {q.rubric.criteria.map(c => (
                            <div key={c.criterionId} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, padding: 6 }}>
                              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>
                                {c.name} ({c.weight}%):
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, fontSize: 10.5 }}>
                                {c.levels.map(l => (
                                  <div key={l.level} style={{ padding: 4, background: l.level === 4 ? '#f0fdf4' : l.level === 3 ? '#eff6ff' : l.level === 2 ? '#fefce8' : '#fff1f2', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontWeight: 800, color: '#334155' }}>{l.label}</div>
                                    <div style={{ color: '#475569', marginTop: 2 }}>{l.observableDescriptor}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
                        Nenhuma rubrica analítica gerada para esta questão. Clique em "Gerar Rubrica" para criar matriz com 4 níveis Likert ancorados em evidências.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal / Prompt da Rafinha para Ajuste de Questão */}
      {rafinhaPromptModalQIndex !== null && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(44,26,14,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 20,
            padding: '24px',
            maxWidth: 500,
            width: '100%',
            boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
            border: '1px solid rgba(139,115,85,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>✨</span>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#2c1a0e' }}>
                  Ajustar Questão #{rafinhaPromptModalQIndex + 1} com Rafinha IA
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRafinhaPromptModalQIndex(null)}
                style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#665c54' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 13, color: '#665c54', margin: '0 0 12px 0', lineHeight: 1.4 }}>
              O que você gostaria de mudar nesta questão? (Ex: <em>"Torne mais difícil"</em>, <em>"Mude o tema para tecnologia"</em>, <em>"Transforme em Múltipla Escolha com 4 opções"</em>).
            </p>

            <textarea
              value={rafinhaPromptText}
              onChange={e => setRafinhaPromptText(e.target.value)}
              placeholder="Instrução para a Rafinha..."
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: RADIUS.md,
                border: '1px solid #d5c8bb',
                fontSize: TEXT.body,
                background: '#faf6f0',
                outline: 'none',
                marginBottom: 16
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setRafinhaPromptModalQIndex(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: RADIUS.md,
                  border: '1px solid #d5c8bb',
                  background: '#fff',
                  color: '#665c54',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleCallRafinha(rafinhaPromptModalQIndex)}
                disabled={rafinhaLoading}
                style={{
                  padding: '8px 18px',
                  borderRadius: RADIUS.md,
                  border: 'none',
                  background: '#8b5e3c',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: rafinhaLoading ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                {rafinhaLoading ? <><i className="ti ti-loader-2 animate-spin" /> Ajustando...</> : <><i className="ti ti-sparkles" /> Aplicar Ajuste</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
