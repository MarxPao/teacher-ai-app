'use client'

import React, { useState, useMemo } from 'react'
import DocumentCanvas from '@/components/DocumentCanvas'
import EditableQuestionBoxes, { EditableQuestionItem, parseContentToQuestions } from '@/components/EditableQuestionBoxes'
import AudioPlayerCard from '@/components/AudioPlayerCard'
import { exportToPdf, exportToWord } from '@/lib/exportUtils'
import { createExamSheetLayout, generatePrintableOmrSheetHtml, processOMRBatchAndUpdatePsychometrics } from '@/lib/omr'
import { generateExecutivePedagogicalSummary } from '@/lib/executivePedagogicalSummary'
import { BnccSkill, getBnccForGrade } from '@/lib/bnccStore'
import { SourceItem } from '@/components/SourceKnowledgeHub'
import { QuestionTypeCountMap, computeTotalQuestions } from '@/components/QuestionCountByTypeList'
import { FactCheckResult } from '@/lib/factCheck'
import { COLOR, RADIUS, TEXT, SHADOW } from '@/styles/tokens'
import { auditExamDistractors, ExamDistractorAuditResult } from '@/lib/distractorQualityAuditor'
import { getSubjectProfile } from '@/lib/subjectProfile'
import { isCriticalHaladynaViolation, HaladynaViolation, autoFixHaladynaViolations } from '@/lib/haladynaLinter'
import { evaluateReadabilityForGrade } from '@/lib/readingLoadAuditor'
import {
  STANDARD_COGNITIVE_ATTRIBUTES,
  estimateStudentAttributeProfile,
  DINA_MIN_RESPONSES_FOR_CALIBRATION,
  QMatrixItemEntry,
  calibrateDINAItemParameters,
  calculateItemDiagnosticIndex,
  classifyDINAItemQuality,
  DINA_THEORETICAL_PRIORS,
  computeContinuousIdealEta,
  evaluateQMatrixEmpiricalFit,
  type DINAItemParameters,
  type QMatrixFitEvaluation
} from '@/lib/qMatrixEngine'
import {
  analyzeItemDifferentialFunctioning,
  DIF_MIN_GROUP_SAMPLE_SIZE
} from '@/lib/difAnalysis'
import {
  DEFAULT_EXPOSURE_CONFIG,
  updateSympsonHetterParameter,
  calculateMDISC,
  calculateMDIFF,
  calculateDirectionalCosines,
  estimateMultidimensionalTheta,
  initializeMcatSession,
  processMcatAdaptiveStep,
  auditItemExposureRates,
  recalibrateBankExposureParameters,
  SYMPSON_HETTER_MIN_SAMPLE_SIZE,
  type MirtItemParameters,
  type McatSessionState,
  type McatStoppingConfig,
  type BankExposureAuditResult,
  type ItemExposureStatus
} from '@/lib/mirtAndExposureEngine'
import {
  recordExamAuditEvent,
  getExamAuditHistory,
  type ExamVersionHistory
} from '@/lib/examAuditVersioning'
import { preLinterQualityGate } from '@/lib/itemConsistencyAndSimilarityEngine'
import {
  deriveGrmFromAnalyticalRubric,
  calculateGrmCategoryProbabilities,
  calculateGrmItemInformation,
  estimateGrmTheta,
  type GrmItemParameters
} from '@/lib/grmEngine'
import {
  deriveGpcmFromStepCount,
  calculateGpcmCategoryProbabilities,
  calculateGpcmItemInformation,
  estimateGpcmTheta,
  type GpcmItemParameters
} from '@/lib/gpcmEngine'
import {
  calculateRsmCategoryProbabilities,
  calculateRsmItemInformation,
  calculateRsmFitStatistics,
  estimateRsmTheta,
  CANONICAL_LIKERT_4_SCALE,
  type RsmItemParameters
} from '@/lib/rsmEngine'
import {
  auditQuestionDistractorDiagnostics,
  generateDiagnosticDistractorsForStem,
  type DiagnosticDistractor
} from '@/lib/diagnosticDistractorEngine'
import {
  calculateOptionProbabilities,
  diagnoseDistractor,
  analyzeItemDistractorCurves,
  deriveDccFromDiagnosticDistractors,
  type DistractorCurveParameters,
  type ItemDccAnalysis
} from '@/lib/distractorCurveEngine'
import {
  routeDistractorFeedback,
  generateItemFeedbackMatrix,
  type ItemFormativeFeedbackMatrix
} from '@/lib/formativeFeedbackRouter'
import {
  performClassicalEquating,
  type EquatingResult
} from '@/lib/classicalEquatingEngine'
import {
  performIrtEquating,
  type IrtEquatingResult,
  type AnchorItemPair
} from '@/lib/irtEquatingEngine'
import {
  purifyAnchorSet,
  classifyMantelHaenszelDIF,
  type AnchorPurificationResult
} from '@/lib/anchorDriftEngine'
import {
  performReliabilityAnalysis,
  type ReliabilityResult
} from '@/lib/reliabilityEngine'
import {
  analyzeTestInformationCurve,
  type TestInformationAnalysis
} from '@/lib/testInformationEngine'
import {
  generateClassDiagnosticSummary,
  generateStudentDiagnosticReport,
  type ClassDiagnosticSummary
} from '@/lib/standardsReportingEngine'
import { generateAnalyticalRubric, type AnalyticalRubric } from '@/lib/analyticalRubricGenerator'
import { estimateStudentEmpiricalBKTParams, DEFAULT_BKT_PARAMS, type EmpiricalBKTParametersResult } from '@/lib/bktEngine'

export type ResultTabKey = 'document' | 'topics' | 'rationale'

export interface ExamResultThreeTabsProps {
  result: string
  onContentChange: (newHtml: string) => void
  mode: 'exam' | 'worksheet'
  topic: string
  grade: string
  level: string
  subjectName?: string
  subjectId?: string
  sections?: string[]
  skill?: string
  sources?: SourceItem[]
  questionCounts?: QuestionTypeCountMap
  header: {
    school: string
    teacher: string
    classGroup: string
    title: string
  }
  onHeaderChange?: (patch: any) => void
  hideHeader?: boolean
  onToggleHeader?: () => void
  bloomDistribution?: {
    remember: number
    apply: number
    analyze: number
    evaluate: number
  }
  difficultyDistribution?: {
    easy: number
    medium: number
    hard: number
    challenge: number
  }
  approach?: string[]
  neeProfile?: string
  factCheck?: FactCheckResult | null
  onAskRafinhaForQuestion?: (idx: number, q: EditableQuestionItem, instruction: string) => Promise<string | void>
  audioUrl?: string | null
  audioLoading?: boolean
  accent?: 'US' | 'UK'
  onAccentChange?: (accent: 'US' | 'UK') => void
  onGenerateAudio?: () => void
  onDeleteAudio?: () => void
  onOpenOnlinePlayer?: () => void
  initialTab?: ResultTabKey
}

export default function ExamResultThreeTabs({
  result,
  onContentChange,
  mode,
  topic,
  grade,
  level,
  subjectName = 'Língua Inglesa',
  subjectId = 'english',
  sections = ['Grammar', 'Vocabulary', 'Reading Comprehension'],
  skill = 'Reading Comprehension',
  sources = [],
  questionCounts,
  header,
  onHeaderChange,
  hideHeader = false,
  onToggleHeader,
  bloomDistribution = { remember: 25, apply: 30, analyze: 25, evaluate: 20 },
  difficultyDistribution = { easy: 20, medium: 50, hard: 25, challenge: 5 },
  approach = ['Cambridge Assessment', 'Bloom'],
  neeProfile = '',
  factCheck,
  onAskRafinhaForQuestion,
  audioUrl,
  audioLoading = false,
  accent = 'US',
  onAccentChange,
  onGenerateAudio,
  onDeleteAudio,
  onOpenOnlinePlayer,
  initialTab = 'document',
}: ExamResultThreeTabsProps) {
  const [activeTab, setActiveTab] = useState<ResultTabKey>(initialTab)
  const [activeViewMode, setActiveViewMode] = useState<'boxes' | 'canvas'>('boxes')
  const [showHaladynaGateModal, setShowHaladynaGateModal] = useState(false)
  const [haladynaOverrideGranted, setHaladynaOverrideGranted] = useState(false)
  const [pendingExportAction, setPendingExportAction] = useState<(() => void) | null>(null)

  // Extrai total de questões parsed
  const parsedQuestions = useMemo(() => {
    if (!result) return []
    return parseContentToQuestions(result)
  }, [result])

  const activeSubjectProfile = useMemo(() => {
    return getSubjectProfile(subjectId)
  }, [subjectId])

  const examId = 'exam_current'
  const examAuditHistory = useMemo(() => {
    return getExamAuditHistory(examId)
  }, [examId, haladynaOverrideGranted])

  // Auditoria de qualidade psicométrica dos distratores (Fase 2 / Fase 3)
  const distractorAudit = useMemo<ExamDistractorAuditResult>(() => {
    return auditExamDistractors(parsedQuestions, activeSubjectProfile)
  }, [parsedQuestions, activeSubjectProfile])

  // Violações críticas de Haladyna que bloqueiam a exportação oficial (Fase 2)
  const criticalHaladynaViolations = useMemo(() => {
    const list: Array<{ questionNumber: number; violation: HaladynaViolation }> = []
    parsedQuestions.forEach(q => {
      if (q.haladynaViolations && q.haladynaViolations.length > 0) {
        q.haladynaViolations.forEach(v => {
          if (isCriticalHaladynaViolation(v)) {
            list.push({ questionNumber: q.number, violation: v })
          }
        })
      }
    })
    return list
  }, [parsedQuestions])

  // Gate Pré-Linter: Métricas consolidadas de Self-Consistency e Similaridade (Onda B - Fase B1)
  const preLinterAuditSummary = useMemo(() => {
    if (!parsedQuestions || parsedQuestions.length === 0) {
      return { total: 0, consistentCount: 0, inconsistentCount: 0, nearDuplicateCount: 0 }
    }
    let consistentCount = 0
    let inconsistentCount = 0
    let nearDuplicateCount = 0
    parsedQuestions.forEach(q => {
      if (q.consistencyWarning) {
        inconsistentCount++
      } else {
        consistentCount++
      }
      if (q.similarityWarning) {
        nearDuplicateCount++
      }
    })
    return {
      total: parsedQuestions.length,
      consistentCount,
      inconsistentCount,
      nearDuplicateCount
    }
  }, [parsedQuestions])

  // Auditoria de Legibilidade Flesch-Kincaid e Auto-Fix Haladyna (Onda B - Fase B2)
  const readabilityAndHaladynaAudit = useMemo(() => {
    if (!parsedQuestions || parsedQuestions.length === 0) {
      return {
        avgFlesch: 100,
        avgGradeLevel: 1.0,
        inappropriateCount: 0,
        totalHaladynaViolations: 0,
        autoFixableViolations: 0
      }
    }

    let totalFlesch = 0
    let totalGrade = 0
    let countRead = 0
    let inappropriateCount = 0
    let totalHaladynaViolations = 0
    let autoFixableViolations = 0

    parsedQuestions.forEach(q => {
      const text = q.contextText || (q.stem.length > 100 ? q.stem : '')
      if (text) {
        const evalRes = evaluateReadabilityForGrade(text, grade)
        totalFlesch += evalRes.fleschScore
        totalGrade += evalRes.fleschKincaidGradeLevel
        countRead++
        if (!evalRes.isAppropriate) inappropriateCount++
      }

      if (q.haladynaViolations && q.haladynaViolations.length > 0) {
        totalHaladynaViolations += q.haladynaViolations.length
        const fix = autoFixHaladynaViolations(q.stem, q.options, q.answerKey)
        if (fix.wasModified) {
          autoFixableViolations += fix.appliedFixes.length
        }
      }
    })

    return {
      avgFlesch: countRead > 0 ? Math.round(totalFlesch / countRead) : 75,
      avgGradeLevel: countRead > 0 ? Number((totalGrade / countRead).toFixed(1)) : 6.0,
      inappropriateCount,
      totalHaladynaViolations,
      autoFixableViolations
    }
  }, [parsedQuestions, grade])

  // Contabilização de Rubricas Analíticas Ancoradas para Questões Abertas (Onda B - Fase B3)
  const rubricSummary = useMemo(() => {
    const discursiveQuestions = parsedQuestions.filter(q => q.type === 'discursive' || q.type === 'reading_text')
    const withRubrics = discursiveQuestions.filter(q => q.rubric)
    return {
      discursiveTotal: discursiveQuestions.length,
      rubricCount: withRubrics.length
    }
  }, [parsedQuestions])

  const executeWithHaladynaGate = (action: () => void) => {
    if (criticalHaladynaViolations.length > 0 && !haladynaOverrideGranted) {
      setPendingExportAction(() => action)
      setShowHaladynaGateModal(true)
      return
    }
    action()
  }

  const totalQuestions = parsedQuestions.length || (questionCounts ? computeTotalQuestions(questionCounts) : 10)

  // Mapeia habilidades BNCC da matéria e série via fonte única bnccStore
  const matchingBnccSkills = useMemo<BnccSkill[]>(() => {
    return getBnccForGrade(grade, subjectId).slice(0, 6)
  }, [subjectId, grade])

  // Fontes ativas com páginas/trechos
  const activeSources = useMemo(() => {
    return sources.filter(s => s.active)
  }, [sources])

  // ─── AUDITORIA DINÂMICA DE PILARES CIENTÍFICOS (Q-MATRIX, DINA, DIF, EXPOSIÇÃO) ───
  // Avaliação preguiçosa: apenas executados quando a aba Rationale está ativa (activeTab === 'rationale')
  const qMatrixAuditedEntries: QMatrixItemEntry[] = useMemo(() => {
    if (activeTab !== 'rationale') return []
    return parsedQuestions.map(q => ({
      itemId: q.id || `q_${q.number}`,
      subject: subjectId || 'general',
      topic,
      requiredAttributeIds: q.cognitiveAttributes || []
    }))
  }, [activeTab, parsedQuestions, subjectId, topic])

  const mappedAttributesCount = useMemo(() => {
    if (activeTab !== 'rationale') return 0
    return qMatrixAuditedEntries.reduce((acc, item) => acc + item.requiredAttributeIds.length, 0)
  }, [activeTab, qMatrixAuditedEntries])

  const difSampleAudit = useMemo(() => {
    if (activeTab !== 'rationale') return null
    const firstMc = parsedQuestions.find(q => q.type === 'multiple_choice' || (q.options && q.options.length >= 2))
    return analyzeItemDifferentialFunctioning(firstMc?.id || 'sample_item_01', [])
  }, [activeTab, parsedQuestions])

  // Estatísticas e Diagnósticos de Ajuste RSM (Andrich, 1978 - Onda E - Fase E3)
  const rsmAuditSummary = useMemo(() => {
    if (activeTab !== 'rationale') return null as any
    const sampleItem: RsmItemParameters = {
      itemId: 'rsm_scale_audit_demo',
      location_beta: 0.0,
      scale: CANONICAL_LIKERT_4_SCALE
    }
    const sampleThetas = [-1.0, 0.0, 1.0]
    const sampleResponses = [0, 2, 3]
    const fit = calculateRsmFitStatistics({
      item: sampleItem,
      studentThetas: sampleThetas,
      observedResponses: sampleResponses
    })
    const info = calculateRsmItemInformation(0.0, sampleItem)
    const probs = calculateRsmCategoryProbabilities(0.0, sampleItem)
    const thetaEst = estimateRsmTheta({
      responses: [{ item: sampleItem, category: 2 }]
    })
    return {
      fit,
      info,
      probs,
      thetaEst
    }
  }, [activeTab])

  // Auditoria de Distratores Diagnósticos com Modelagem de Erro Cognitivo (Onda F - Fase F1)
  const distractorDiagnosticsSummary = useMemo(() => {
    if (activeTab !== 'rationale') {
      return {
        totalMc: 0,
        goldStandardCount: 0,
        avgCoveragePercentage: 100,
        totalModelledDistractors: 0
      }
    }
    const mcQuestions = parsedQuestions.filter(
      q => q.type === 'multiple_choice' || (q.options && q.options.length >= 2)
    )
    if (mcQuestions.length === 0) {
      return {
        totalMc: 0,
        goldStandardCount: 0,
        avgCoveragePercentage: 100,
        totalModelledDistractors: 0
      }
    }
    let totalCoverage = 0
    let goldStandardCount = 0
    let totalModelled = 0

    mcQuestions.forEach(q => {
      const audit = auditQuestionDistractorDiagnostics(q, subjectId)
      totalCoverage += audit.diagnosticCoveragePercentage
      if (audit.hasOnlyCognitiveDistractors) goldStandardCount++
      totalModelled += audit.cognitiveDistractorsCount
    })

    return {
      totalMc: mcQuestions.length,
      goldStandardCount,
      avgCoveragePercentage: Math.round(totalCoverage / mcQuestions.length),
      totalModelledDistractors: totalModelled
    }
  }, [activeTab, parsedQuestions, subjectId])

  // Curvas Características de Distratores (DCC - Thissen et al., 1986 - Onda F - Fase F2)
  const dccAuditSummary = useMemo(() => {
    if (activeTab !== 'rationale') {
      return {
        totalItems: 0,
        functionalCount: 0,
        nonFunctionalCount: 0,
        positiveDiscriminatingCount: 0,
        healthyItemsCount: 0
      }
    }
    const mcQuestions = parsedQuestions.filter(
      q => q.type === 'multiple_choice' || (q.options && q.options.length >= 2)
    )
    if (mcQuestions.length === 0) {
      return {
        totalItems: 0,
        functionalCount: 0,
        nonFunctionalCount: 0,
        positiveDiscriminatingCount: 0,
        healthyItemsCount: 0
      }
    }
    let functionalCount = 0
    let nonFunctionalCount = 0
    let positiveDiscriminatingCount = 0
    let healthyItemsCount = 0

    mcQuestions.forEach(q => {
      const opts = q.options || []
      const dccParams = deriveDccFromDiagnosticDistractors(
        q.answerKey || (opts[0]?.letter || 'A'),
        opts.map(o => ({ letter: o.letter, text: o.text }))
      )
      const dccAnalysis = analyzeItemDistractorCurves(q.id || `q_${q.number}`, dccParams)
      functionalCount += dccAnalysis.functionalDistractorCount
      nonFunctionalCount += dccAnalysis.nonFunctionalDistractorCount
      if (dccAnalysis.hasPositiveDiscriminatingDistractor) positiveDiscriminatingCount++
      if (dccAnalysis.overallItemStatus === 'otimo') healthyItemsCount++
    })

    return {
      totalItems: mcQuestions.length,
      functionalCount,
      nonFunctionalCount,
      positiveDiscriminatingCount,
      healthyItemsCount
    }
  }, [activeTab, parsedQuestions])

  // Roteamento de Feedback Formativo Imediato por Distrator (Hattie & Timperley, 2007 - Onda F - Fase F3)
  const formativeFeedbackSummary = useMemo(() => {
    if (activeTab !== 'rationale') {
      return {
        totalQuestions: 0,
        fullyRoutedQuestions: 0,
        totalFeedbacksCount: 0,
        averageCoveragePercentage: 100
      }
    }
    const mcQuestions = parsedQuestions.filter(
      q => q.type === 'multiple_choice' || (q.options && q.options.length >= 2)
    )
    if (mcQuestions.length === 0) {
      return {
        totalQuestions: 0,
        fullyRoutedQuestions: 0,
        totalFeedbacksCount: 0,
        averageCoveragePercentage: 100
      }
    }
    let fullyRouted = 0
    let totalFeedbacks = 0
    let sumCoverage = 0

    mcQuestions.forEach(q => {
      const matrix = generateItemFeedbackMatrix(q, subjectId)
      if (matrix.isFullyRouted) fullyRouted++
      totalFeedbacks += matrix.coveredDistractorsCount + 1 // distratores + chave
      sumCoverage += matrix.coveragePercentage
    })

    return {
      totalQuestions: mcQuestions.length,
      fullyRoutedQuestions: fullyRouted,
      totalFeedbacksCount: totalFeedbacks,
      averageCoveragePercentage: Math.round(sumCoverage / mcQuestions.length)
    }
  }, [activeTab, parsedQuestions, subjectId])

  // Equacionamento Linear e Equipercentil de Formas Paralelas (Kolen & Brennan, 2014 - Onda G - Fase G1)
  const classicalEquatingSummary = useMemo(() => {
    if (activeTab !== 'rationale') return null as any
    const totalItems = parsedQuestions.length || 10
    const baselineScores = [
      Math.round(totalItems * 0.4), Math.round(totalItems * 0.5), Math.round(totalItems * 0.6),
      Math.round(totalItems * 0.65), Math.round(totalItems * 0.7), Math.round(totalItems * 0.75),
      Math.round(totalItems * 0.8), Math.round(totalItems * 0.85), Math.round(totalItems * 0.9)
    ]
    const currentFormScores = [
      Math.round(totalItems * 0.35), Math.round(totalItems * 0.45), Math.round(totalItems * 0.55),
      Math.round(totalItems * 0.6), Math.round(totalItems * 0.7), Math.round(totalItems * 0.75),
      Math.round(totalItems * 0.8), Math.round(totalItems * 0.85), Math.round(totalItems * 0.88)
    ]

    return performClassicalEquating({
      formXScores: currentFormScores,
      formYScores: baselineScores,
      formXName: 'Forma Atual',
      formYName: 'Banco de Referência',
      design: 'random_groups',
      maxPossibleScore: totalItems
    })
  }, [activeTab, parsedQuestions.length])

  // Equacionamento por TRI (Stocking-Lord & Haebara - Onda G - Fase G2)
  const irtEquatingSummary = useMemo(() => {
    if (activeTab !== 'rationale') return null as any
    const anchorPairs: AnchorItemPair[] = [
      { id: 'anc_1', formXItem: { id: 'anc_1', a: 1.10, b: -0.40, c: 0.15 }, formYItem: { id: 'anc_1', a: 1.05, b: -0.20, c: 0.15 } },
      { id: 'anc_2', formXItem: { id: 'anc_2', a: 1.35, b: 0.20, c: 0.20 }, formYItem: { id: 'anc_2', a: 1.30, b: 0.45, c: 0.20 } },
      { id: 'anc_3', formXItem: { id: 'anc_3', a: 0.95, b: 0.80, c: 0.10 }, formYItem: { id: 'anc_3', a: 0.90, b: 1.05, c: 0.10 } }
    ]
    return performIrtEquating({
      anchors: anchorPairs,
      method: 'stocking_lord'
    })
  }, [activeTab])

  // Gestão e Purificação de Itens Âncora & Drift (Kolen & Brennan, 2014 - Onda G - Fase G3)
  const anchorPurificationSummary = useMemo(() => {
    if (activeTab !== 'rationale') return null as any
    const anchorCandidates: AnchorItemPair[] = [
      { id: 'anc_1', formXItem: { id: 'anc_1', a: 1.10, b: -0.40, c: 0.15 }, formYItem: { id: 'anc_1', a: 1.05, b: -0.20, c: 0.15 } },
      { id: 'anc_2', formXItem: { id: 'anc_2', a: 1.35, b: 0.20, c: 0.20 }, formYItem: { id: 'anc_2', a: 1.30, b: 0.45, c: 0.20 } },
      { id: 'anc_3', formXItem: { id: 'anc_3', a: 0.95, b: 0.80, c: 0.10 }, formYItem: { id: 'anc_3', a: 0.90, b: 1.05, c: 0.10 } },
      { id: 'anc_drift_outlier', formXItem: { id: 'anc_drift_outlier', a: 0.85, b: -1.50, c: 0.20 }, formYItem: { id: 'anc_drift_outlier', a: 0.90, b: 0.40, c: 0.20 } }
    ]
    return purifyAnchorSet(anchorCandidates, 3, 0.35)
  }, [activeTab])

  // Confiabilidade Empírica e Teórica (Cronbach & McDonald - Onda H - Fase H1)
  const reliabilitySummary = useMemo(() => {
    if (activeTab !== 'rationale') return null as any
    const totalItems = Math.max(4, parsedQuestions.length || 10)
    const sampleStudents = 25
    const matrix: number[][] = []
    for (let s = 0; s < sampleStudents; s++) {
      const studentProf = (s / (sampleStudents - 1)) * 2 - 1
      const studentRow: number[] = []
      for (let j = 0; j < totalItems; j++) {
        const itemDiff = (j / (totalItems - 1)) * 2 - 1
        const prob = 1 / (1 + Math.exp(-1.5 * (studentProf - itemDiff)))
        studentRow.push(prob >= 0.5 ? 1 : 0)
      }
      matrix.push(studentRow)
    }

    return performReliabilityAnalysis({
      itemMatrix: matrix,
      itemIds: parsedQuestions.map(q => q.id || `q_${q.number}`)
    })
  }, [activeTab, parsedQuestions.length])

  // Curvas de Informação do Teste (TIF) & Erro Padrão Condicional SE(\theta) (Lord & Birnbaum - Onda H - Fase H2)
  const tifSummary = useMemo(() => {
    if (activeTab !== 'rationale') return null as any
    const totalItems = Math.max(4, parsedQuestions.length || 10)
    const irtItems = parsedQuestions.map((q, idx) => {
      const b = ((idx / Math.max(1, totalItems - 1)) * 3) - 1.5
      return {
        id: q.id || `item_${idx + 1}`,
        a: 1.2,
        b: Number(b.toFixed(2)),
        c: 0.20
      }
    })
    return analyzeTestInformationCurve(irtItems)
  }, [activeTab, parsedQuestions])

  // Relatórios de Devolutiva Diagnóstica Normativa e Critério-Referenciada (Popham & Marzano - Onda H - Fase H3)
  const standardsReportingSummary = useMemo(() => {
    if (activeTab !== 'rationale') return null as any
    const totalItems = Math.max(4, parsedQuestions.length || 10)
    const mockReports = [
      generateStudentDiagnosticReport({
        studentId: 'st_1',
        studentName: 'Alice Mendes',
        rawScore: Math.round(totalItems * 0.9),
        maxScore: totalItems,
        theta: 1.5,
        groupMean: totalItems * 0.7,
        groupSd: 1.5,
        rankPosition: 1,
        totalStudents: 20,
        itemResponses: [
          { competencyCode: 'EF09LP01', competencyName: 'Análise Linguística', isCorrect: true },
          { competencyCode: 'EF09LP02', competencyName: 'Leitura Crítica', isCorrect: true }
        ]
      }),
      generateStudentDiagnosticReport({
        studentId: 'st_2',
        studentName: 'Bernardo Costa',
        rawScore: Math.round(totalItems * 0.7),
        maxScore: totalItems,
        theta: 0.2,
        groupMean: totalItems * 0.7,
        groupSd: 1.5,
        rankPosition: 10,
        totalStudents: 20,
        itemResponses: [
          { competencyCode: 'EF09LP01', competencyName: 'Análise Linguística', isCorrect: true },
          { competencyCode: 'EF09LP02', competencyName: 'Leitura Crítica', isCorrect: false }
        ]
      }),
      generateStudentDiagnosticReport({
        studentId: 'st_3',
        studentName: 'Carla Silveira',
        rawScore: Math.round(totalItems * 0.45),
        maxScore: totalItems,
        theta: -1.2,
        groupMean: totalItems * 0.7,
        groupSd: 1.5,
        rankPosition: 19,
        totalStudents: 20,
        itemResponses: [
          { competencyCode: 'EF09LP01', competencyName: 'Análise Linguística', isCorrect: false },
          { competencyCode: 'EF09LP02', competencyName: 'Leitura Crítica', isCorrect: false }
        ]
      })
    ]

    return generateClassDiagnosticSummary(mockReports)
  }, [activeTab, parsedQuestions.length])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', minHeight: 0 }}>
      {/* ─── BARRA SUPERIOR DE 3 ABAS PRINCIPAIS ─────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#ffffff',
          borderRadius: RADIUS.lg,
          padding: '6px 10px',
          border: '1.5px solid #ede8dc',
          boxShadow: SHADOW.sm,
          flexShrink: 0,
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            {
              key: 'document',
              label: '📄 1. Documento Gerado',
              badge: parsedQuestions.length > 0 ? `${parsedQuestions.length} itens` : undefined,
              desc: 'Editor e Folha Oficial',
            },
            {
              key: 'topics',
              label: '📚 2. Tópicos & Fontes/Páginas',
              badge: activeSources.length > 0 ? `${activeSources.length} fontes` : 'BNCC',
              desc: 'Matriz e Materiais-Base',
            },
            {
              key: 'rationale',
              label: '🧠 3. Raciocínio Pedagógico da IA',
              badge: 'Bloom & TRI',
              desc: 'Psicometria e Distratores',
            },
          ].map(tab => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as ResultTabKey)}
                style={{
                  padding: '8px 14px',
                  borderRadius: RADIUS.md,
                  border: isActive ? '1.5px solid #8b5e3c' : '1px solid transparent',
                  background: isActive ? '#fdf8f2' : 'transparent',
                  color: isActive ? '#5c3a21' : '#7a5c42',
                  fontSize: 13,
                  fontWeight: isActive ? 800 : 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      padding: '2px 7px',
                      borderRadius: 12,
                      background: isActive ? '#8b5e3c' : '#ede8dc',
                      color: isActive ? '#fff' : '#7a5c42',
                    }}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Status Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#a08060', paddingRight: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: result ? '#3d7a4e' : '#c87a1e' }} />
          <span style={{ fontWeight: 700 }}>{result ? (mode === 'exam' ? 'Prova Pronta' : 'Worksheet Pronta') : 'Aguardando Geração'}</span>
        </div>
      </div>

      {/* ─── ABA 1: DOCUMENTO GERADO (EDITOR & PREVIEW) ────────────────────── */}
      {activeTab === 'document' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
          {/* Listening Track (se houver) */}
          {mode === 'exam' && onGenerateAudio && (
            <div
              style={{
                background: '#fff',
                padding: '10px 16px',
                borderRadius: RADIUS.lg,
                border: '1px solid #ede8dc',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0,
                boxShadow: SHADOW.sm,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🎧</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e' }}>Listening Track Audio</span>
                {onAccentChange && (
                  <select
                    value={accent}
                    onChange={e => onAccentChange(e.target.value as any)}
                    style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12, background: '#faf6f0' }}
                  >
                    <option value="US">🇺🇸 US (American)</option>
                    <option value="UK">🇬🇧 UK (British)</option>
                  </select>
                )}
              </div>
              <button
                type="button"
                onClick={onGenerateAudio}
                disabled={audioLoading}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#8b5e3c',
                  color: '#fff',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: audioLoading ? 'wait' : 'pointer',
                }}
              >
                {audioLoading ? '⏳ Gerando Áudio MP3...' : '🔊 Gerar Áudio da Prova'}
              </button>
            </div>
          )}

          {audioUrl && (
            <AudioPlayerCard
              audioUrl={audioUrl}
              title={`Listening Track - ${topic || 'Exam'}`}
              accent={accent}
              onDelete={onDeleteAudio || (() => {})}
            />
          )}

          {/* Toolbar de Exportação & Alternador de Visualização */}
          {result && (
            <div
              style={{
                background: '#fdf8f2',
                padding: '10px 16px',
                borderRadius: RADIUS.lg,
                border: '1.5px solid #ede8dc',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                flexShrink: 0,
              }}
            >
              {/* Botões de Exportação */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() =>
                    executeWithHaladynaGate(() =>
                      exportToPdf({
                        schoolName: header.school || 'ESCOLA DE ENSINO & IDIOMAS',
                        teacherName: header.teacher || 'Professor(a)',
                        className: grade || '9º Ano',
                        title:
                          header.title ||
                          (topic ? `${mode === 'exam' ? 'PROVA' : 'ATIVIDADE'} ${topic.toUpperCase()}` : 'AVALIAÇÃO'),
                        content: result,
                      })
                    )
                  }
                  style={{
                    padding: '8px 14px',
                    borderRadius: RADIUS.md,
                    border: 'none',
                    background: '#8b5e3c',
                    color: '#fff',
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 2px 8px rgba(139,94,60,0.2)',
                  }}
                >
                  <i className="ti ti-printer" /> Exportar PDF Oficial
                </button>

                <button
                  type="button"
                  onClick={() =>
                    executeWithHaladynaGate(() =>
                      exportToWord({
                        schoolName: header.school || 'ESCOLA DE ENSINO & IDIOMAS',
                        teacherName: header.teacher || 'Professor(a)',
                        className: grade || '9º Ano',
                        title:
                          header.title ||
                          (topic ? `${mode === 'exam' ? 'PROVA' : 'ATIVIDADE'} ${topic.toUpperCase()}` : 'AVALIAÇÃO'),
                        content: result,
                      })
                    )
                  }
                  style={{
                    padding: '8px 14px',
                    borderRadius: RADIUS.md,
                    border: '1px solid #c0a080',
                    background: '#fffcf8',
                    color: '#8b5e3c',
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <i className="ti ti-file-text" /> Exportar Word (.docx)
                </button>

                {mode === 'exam' && onOpenOnlinePlayer && (
                  <button
                    type="button"
                    onClick={() => executeWithHaladynaGate(() => onOpenOnlinePlayer())}
                    style={{
                      padding: '8px 14px',
                      borderRadius: RADIUS.md,
                      border: 'none',
                      background: '#2d9d5d',
                      color: '#fff',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 2px 8px rgba(45,157,93,0.2)',
                    }}
                  >
                    🚀 Testar Prova Online
                  </button>
                )}

                {mode === 'exam' && (
                  <button
                    type="button"
                    onClick={() =>
                      executeWithHaladynaGate(() => {
                        const totalQ = parsedQuestions.length || 10
                        const layout = createExamSheetLayout({
                          id: `exam_${Date.now().toString(36)}`,
                          title: header.title || topic || 'Avaliação Oficial',
                          version: 'Form_A',
                          totalQuestions: totalQ,
                          optionsPerQuestion: 4
                        })
                        const html = generatePrintableOmrSheetHtml(layout, header.school || 'TEACHER AI — SISTEMA DE AVALIAÇÃO')
                        const win = window.open('', '_blank')
                        if (win) {
                          win.document.write(html)
                          win.document.close()
                          setTimeout(() => win.print(), 350)
                        }
                      })
                    }
                    style={{
                      padding: '8px 14px',
                      borderRadius: RADIUS.md,
                      border: '1.5px solid #8b5e3c',
                      background: '#fffcf8',
                      color: '#8b5e3c',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 2px 6px rgba(139,94,60,0.1)',
                    }}
                    title="Gera a folha oficial de respostas padronizada com 4 marcadores fiduciais para correção instantânea por OMR"
                  >
                    <i className="ti ti-scan" /> 📄 Cartão OMR (Fiduciais)
                  </button>
                )}
              </div>

              {/* Sub-visualização: Boxes vs Canvas */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setActiveViewMode('boxes')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: RADIUS.md,
                    border: activeViewMode === 'boxes' ? '1.5px solid #8b5e3c' : '1px solid #d5c8bb',
                    background: activeViewMode === 'boxes' ? '#8b5e3c' : '#fff',
                    color: activeViewMode === 'boxes' ? '#fff' : '#2c1a0e',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  📑 Boxes Editáveis
                </button>
                <button
                  type="button"
                  onClick={() => setActiveViewMode('canvas')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: RADIUS.md,
                    border: activeViewMode === 'canvas' ? '1.5px solid #8b5e3c' : '1px solid #d5c8bb',
                    background: activeViewMode === 'canvas' ? '#8b5e3c' : '#fff',
                    color: activeViewMode === 'canvas' ? '#fff' : '#2c1a0e',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  📄 Folha Formatada (A4)
                </button>
              </div>
            </div>
          )}

          {/* BANNER CONSOLIDADO DE INTEGRIDADE PEDAGÓGICA (HALADYNA GATE) */}
          {criticalHaladynaViolations.length > 0 && (
            <div
              style={{
                background: '#fff5f5',
                border: '1.5px solid #feb2b2',
                borderRadius: RADIUS.lg,
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                boxShadow: '0 2px 8px rgba(220,38,38,0.06)',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>🛑</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#991b1b' }}>
                    Gate Psicométrico Ativo: {criticalHaladynaViolations.length} violação(ões) crítica(s) de Haladyna detectada(s)
                  </div>
                  <div style={{ fontSize: 12, color: '#7f1d1d' }}>
                    {haladynaOverrideGranted
                      ? '⚠️ Exportação autorizada por confirmação explícita do professor.'
                      : 'A exportação oficial e testes online estão bloqueados até correção das alternativas com "Todas/Nenhuma das anteriores" ou distratores idênticos.'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHaladynaGateModal(true)}
                style={{
                  padding: '6px 12px',
                  borderRadius: RADIUS.md,
                  border: '1.5px solid #dc2626',
                  background: '#fff',
                  color: '#dc2626',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {haladynaOverrideGranted ? 'Ver Violações Sobrescritas' : 'Revisar & Desbloquear'}
              </button>
            </div>
          )}

          {/* Container do Documento */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              borderRadius: RADIUS.xl,
              border: '1px solid #ede8dc',
              boxShadow: SHADOW.md,
              background: '#fff',
              minHeight: 0,
            }}
          >
            {!result ? (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#a08060',
                  gap: 16,
                  padding: 40,
                  textAlign: 'center',
                }}
              >
                <span style={{ fontSize: 56, opacity: 0.3 }}>📝</span>
                <div>
                  <h4 style={{ margin: '0 0 6px', fontSize: 16, color: '#5c3a21', fontWeight: 800 }}>
                    {mode === 'exam' ? 'Sua Prova Oficial Aparecerá Aqui' : 'Sua Lista de Exercícios Aparecerá Aqui'}
                  </h4>
                  <p style={{ margin: 0, fontSize: 13, color: '#a08060' }}>
                    Configure os parâmetros e clique em <strong>Gerar</strong> para construir a avaliação com psicometria e didática.
                  </p>
                </div>
              </div>
            ) : activeViewMode === 'boxes' ? (
              <div style={{ padding: 18 }}>
                <EditableQuestionBoxes
                  initialContent={result}
                  onContentChange={onContentChange}
                  onAskRafinhaForQuestion={onAskRafinhaForQuestion}
                />
              </div>
            ) : (
              <DocumentCanvas
                content={result}
                onContentChange={onContentChange}
                hideHeader={hideHeader}
                onToggleHeader={onToggleHeader || (() => {})}
                headerData={{
                  school: header.school || 'Nome da Escola',
                  teacher: header.teacher || 'Professor(a)',
                  title:
                    header.title ||
                    (topic ? `${mode === 'exam' ? 'Prova' : 'Exercício'} ${topic}` : 'Documento Oficial'),
                }}
                onHeaderChange={
                  onHeaderChange ||
                  (() => {})
                }
              />
            )}
          </div>
        </div>
      )}

      {/* ─── ABA 2: TÓPICOS ABORDADOS & PÁGINAS / FONTES UTILIZADAS ─────────── */}
      {activeTab === 'topics' && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            borderRadius: RADIUS.xl,
            border: '1px solid #ede8dc',
            background: '#faf6f0',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            minHeight: 0,
          }}
        >
          {/* Header de Metadados Curriculares */}
          <div
            style={{
              background: '#fff',
              borderRadius: RADIUS.lg,
              padding: '16px 20px',
              border: '1.5px solid #ede8dc',
              boxShadow: SHADOW.sm,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: '#8b5e3c',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  {subjectName} · {grade} · Nível {level}
                </span>
                <h3 style={{ margin: '4px 0 2px', fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
                  📌 {topic || (mode === 'exam' ? 'Conteúdo Bimestral Avaliativo' : 'Exercícios de Fixação')}
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: '#7a5c42' }}>
                  {mode === 'exam' ? 'Avaliação oficial de competências com matriz de referência' : 'Prática guiada e contextualizada de aprendizagem'}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ padding: '4px 10px', borderRadius: 8, background: '#fdf8f2', border: '1px solid #ede8dc', fontSize: 12, fontWeight: 700, color: '#8b5e3c' }}>
                  🎯 {totalQuestions} Questões
                </span>
                <span style={{ padding: '4px 10px', borderRadius: 8, background: '#f0fff4', border: '1px solid #b7eb8f', fontSize: 12, fontWeight: 700, color: '#2d9d5d' }}>
                  ⏱️ ~{totalQuestions * 4} minutos
                </span>
                {neeProfile && (
                  <span style={{ padding: '4px 10px', borderRadius: 8, background: '#e6f7ff', border: '1px solid #91d5ff', fontSize: 12, fontWeight: 700, color: '#096dd9' }}>
                    ♿ Adaptado: {neeProfile.toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            {/* Eixos & Seções Contempladas */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f0e8d8', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#7a5c42', alignSelf: 'center' }}>
                Seções Avaliadas:
              </span>
              {sections.map(sec => (
                <span
                  key={sec}
                  style={{
                    padding: '3px 9px',
                    borderRadius: 6,
                    background: '#f5efe6',
                    border: '1px solid #e0d5c5',
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: '#5c3a21',
                  }}
                >
                  ✓ {sec}
                </span>
              ))}
            </div>
          </div>

          {/* Livros, Páginas & Materiais-Base Utilizados */}
          <div
            style={{
              background: '#fff',
              borderRadius: RADIUS.lg,
              padding: '16px 20px',
              border: '1.5px solid #ede8dc',
              boxShadow: SHADOW.sm,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 20 }}>📖</span>
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
                Livros, Apostilas & Páginas / Fontes Utilizadas
              </h4>
            </div>

            {activeSources.length === 0 ? (
              <div
                style={{
                  background: '#fffbe6',
                  border: '1px solid #ffe58f',
                  borderRadius: RADIUS.md,
                  padding: 16,
                  fontSize: 13,
                  color: '#7a5c42',
                  lineHeight: 1.6,
                }}
              >
                ⚠️ <strong>Gerada por conhecimento geral da IA — nenhuma fonte específica foi consultada.</strong>
                <br />
                <span style={{ fontSize: 12, color: '#8c6b3e' }}>
                  Recomendamos revisar o alinhamento com o material didático da turma. Para embasar em um livro didático ou apostila com páginas numeradas, anexe o arquivo na barra lateral em <em>Fontes de Conhecimento</em> ou informe uma <em>Referência Manual</em>.
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activeSources.map(src => (
                  <div
                    key={src.id}
                    style={{
                      background: '#fdf8f2',
                      border: '1.5px solid #ede8dc',
                      borderRadius: RADIUS.md,
                      padding: '12px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>
                          {src.fileType === 'pdf' ? '📑' : src.sourceType === 'book' ? '📘' : src.sourceType === 'web' ? '🌐' : '📝'}
                        </span>
                        <strong style={{ fontSize: 13.5, color: '#2c1a0e' }}>{src.title}</strong>
                        {src.category && <span style={{ fontSize: 12, color: '#7a5c42' }}>({src.category})</span>}
                      </div>

                      {(src.scopeInfo || src.category) && (
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: '#8b5e3c',
                            color: '#fff',
                            fontSize: 11.5,
                            fontWeight: 800,
                          }}
                        >
                          📄 {src.scopeInfo || 'Páginas / Escopo Selecionado'}
                        </span>
                      )}
                    </div>

                    {src.content && (
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12,
                          color: '#665c54',
                          background: '#fff',
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: '1px solid #ede8dc',
                          lineHeight: 1.5,
                        }}
                      >
                        <strong>Trecho / Vocabulário Extraído:</strong> {src.content.slice(0, 220)}...
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Matriz BNCC Mapeada */}
          <div
            style={{
              background: '#fff',
              borderRadius: RADIUS.lg,
              padding: '16px 20px',
              border: '1.5px solid #ede8dc',
              boxShadow: SHADOW.sm,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 20 }}>🏛️</span>
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
                Matriz de Habilidades BNCC ({grade})
              </h4>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
              {matchingBnccSkills.map(sk => (
                <div
                  key={sk.id}
                  style={{
                    background: '#fdf8f2',
                    border: '1px solid #ede8dc',
                    borderRadius: RADIUS.md,
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', fontFamily: 'monospace' }}>
                      {sk.code}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#ede8dc', color: '#5c3a21' }}>
                      {sk.axis}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: '#4a3b32', lineHeight: 1.45 }}>
                    {sk.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── ABA 3: LINHA DE RACIOCÍNIO PEDAGÓGICO DA IA ─────────────────── */}
      {activeTab === 'rationale' && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            borderRadius: RADIUS.xl,
            border: '1px solid #ede8dc',
            background: '#faf6f0',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            minHeight: 0,
          }}
        >
          {/* Banner de Apresentação Psicométrica */}
          <div
            style={{
              background: 'linear-gradient(135deg, #5c3a21, #8b5e3c)',
              borderRadius: RADIUS.lg,
              padding: '18px 22px',
              color: '#fff',
              boxShadow: SHADOW.md,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 24 }}>🧠</span>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                Linha de Raciocínio & Justificativa Psicométrica da IA
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.92, lineHeight: 1.5 }}>
              Transparência total sobre os critérios cognitivos de Bloom, calibração de dificuldade da TRI e engenharia de distratores diagnósticos aplicados na elaboração deste documento.
            </p>
          </div>

          {/* 1. Matriz da Taxonomia de Bloom */}
          <div
            style={{
              background: '#fff',
              borderRadius: RADIUS.lg,
              padding: '16px 20px',
              border: '1.5px solid #ede8dc',
              boxShadow: SHADOW.sm,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
                📊 1. Distribuição Cognitiva (Taxonomia de Bloom)
              </h4>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#8b5e3c' }}>🎯 Meta Teórica Solicitada</span>
            </div>
            <div style={{ fontSize: 11.5, color: '#7a5c42', marginBottom: 12, fontStyle: 'italic' }}>
              Distribuição cognitiva pretendida no prompt pedagógico. A validação empírica dos processos cognitivos mobilizados depende da aplicação real do teste.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {[
                { label: 'Lembrar & Compreender', pct: bloomDistribution.remember, color: '#3d7a4e', desc: 'Identificação de fatos, vocabulário e regras explícitas.' },
                { label: 'Aplicar', pct: bloomDistribution.apply, color: '#c87a1e', desc: 'Emprego ativo das estruturas em novas situações e enunciados.' },
                { label: 'Analisar', pct: bloomDistribution.analyze, color: '#2a6080', desc: 'Inferência textual, dedução de propósito e comparação crítica.' },
                { label: 'Avaliar & Criar', pct: bloomDistribution.evaluate, color: '#8b5e3c', desc: 'Produção escrita autoral e julgamento argumentativo.' },
              ].map(b => (
                <div
                  key={b.label}
                  style={{
                    background: '#fdf8f2',
                    borderRadius: RADIUS.md,
                    padding: 12,
                    border: '1px solid #ede8dc',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: '#2c1a0e' }}>{b.label}</span>
                    <strong style={{ fontSize: 14, color: b.color }}>{b.pct}%</strong>
                  </div>
                  <div style={{ width: '100%', height: 6, borderRadius: 3, background: '#e8e0d0', overflow: 'hidden' }}>
                    <div style={{ width: `${b.pct}%`, height: '100%', background: b.color, borderRadius: 3 }} />
                  </div>
                  <p style={{ margin: 0, fontSize: 11, color: '#7a5c42', lineHeight: 1.4 }}>
                    {b.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Meta Teórica de Dificuldade (Pré-Aplicação) */}
          <div
            style={{
              background: '#fff',
              borderRadius: RADIUS.lg,
              padding: '16px 20px',
              border: '1.5px solid #ede8dc',
              boxShadow: SHADOW.sm,
            }}
          >
            <h4 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
              ⚖️ 2. Meta Teórica de Dificuldade (Pré-Aplicação)
            </h4>
            <div style={{ fontSize: 11.5, color: '#7a5c42', marginBottom: 12, fontStyle: 'italic', background: '#fffcf7', padding: '6px 10px', borderRadius: RADIUS.sm, border: '1px solid #f0e6d6' }}>
              ℹ️ <strong>Estimativa Pré-Aplicação:</strong> Estes percentuais representam a meta de distribuição solicitada no formulário. A calibração empírica real (índice de facilidade p-value e discriminação da TRI) só ocorre após a aplicação em sala e coleta mínima de respostas por item no Banco de Questões.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { label: 'Fácil', pct: difficultyDistribution.easy, color: '#3d7a4e', desc: 'Garante confiança inicial' },
                { label: 'Médio', pct: difficultyDistribution.medium, color: '#2a6080', desc: 'Faixa esperada do nível' },
                { label: 'Difícil', pct: difficultyDistribution.hard, color: '#c87a1e', desc: 'Discriminação de excelência' },
                { label: 'Desafio', pct: difficultyDistribution.challenge, color: '#a83232', desc: 'Ponto de inflexão' },
              ].map(d => (
                <div key={d.label} style={{ background: '#fdf8f2', borderRadius: RADIUS.md, padding: 10, border: '1px solid #ede8dc', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42' }}>{d.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: d.color, margin: '4px 0' }}>{d.pct}%</div>
                  <div style={{ fontSize: 10, color: '#a08060' }}>{d.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Análise Heurística Léxica de Distratores */}
          <div
            style={{
              background: '#fff',
              borderRadius: RADIUS.lg,
              padding: '16px 20px',
              border: '1.5px solid #ede8dc',
              boxShadow: SHADOW.sm,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>🎯</span>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
                  3. Análise Heurística Léxica de Distratores (Padrões de Erro Conhecidos)
                </h4>
              </div>
              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 800,
                  background: distractorAudit.coveragePercentage >= 60 ? '#dcfce7' : '#fef3c7',
                  color: distractorAudit.coveragePercentage >= 60 ? '#166534' : '#92400e',
                }}
              >
                {distractorAudit.alignedCount}/{distractorAudit.totalMultipleChoice} itens alinhados ({distractorAudit.coveragePercentage}%)
              </span>
            </div>

            <div style={{ fontSize: 12.5, color: '#7a5c42', marginBottom: 12, fontWeight: 600 }}>
              {distractorAudit.summaryLabel}
            </div>

            {/* Detalhamento por questão da auditoria de distratores */}
            {distractorAudit.questions.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 10,
                marginBottom: 12
              }}>
                {distractorAudit.questions.map(qAudit => (
                  <div
                    key={qAudit.questionNumber}
                    style={{
                      background: '#fdf8f2',
                      border: '1px solid #ede8dc',
                      borderRadius: RADIUS.md,
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 12, color: '#2c1a0e' }}>
                        Questão {qAudit.questionNumber}
                      </strong>
                      <span style={{
                        fontSize: 10.5,
                        fontWeight: 800,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: qAudit.rating === 'excelente' ? '#dcfce7' : qAudit.rating === 'adequado' ? '#e0f2fe' : '#f3f4f6',
                        color: qAudit.rating === 'excelente' ? '#166534' : qAudit.rating === 'adequado' ? '#0369a1' : '#4b5563'
                      }}>
                        {qAudit.rating.toUpperCase()}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 11.5, color: '#665c54', lineHeight: 1.4 }}>
                      {qAudit.feedback}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div style={{
              background: '#faf6f0',
              border: '1px solid #ede8dc',
              borderRadius: RADIUS.sm,
              padding: '8px 12px',
              fontSize: 11.5,
              color: '#7a5c42',
              lineHeight: 1.45,
              fontStyle: 'italic'
            }}>
              🔍 <strong>Auditoria Heurística Léxica vs. Discriminação Real:</strong> Esta análise verifica a correspondência léxica de regras e termos conhecidos no perfil da matéria. A eficiência psicométrica real dos distratores (distractor efficiency e curvas de atratividade $d_i$) exige respostas empíricas coletadas após a aplicação do teste.
            </div>
          </div>

          {/* 4. Metodologias Didáticas Aplicadas & Fact-Check */}
          <div
            style={{
              background: '#fff',
              borderRadius: RADIUS.lg,
              padding: '16px 20px',
              border: '1.5px solid #ede8dc',
              boxShadow: SHADOW.sm,
            }}
          >
            <h4 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
              📐 4. Metodologias Didáticas & Auditoria de Precisão
            </h4>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {approach.map(app => (
                <span
                  key={app}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 20,
                    background: '#f5efe6',
                    border: '1.5px solid #8b5e3c',
                    color: '#5c3a21',
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  🎓 {app}
                </span>
              ))}
            </div>

            {factCheck && (
              <div
                style={{
                  background: factCheck.score >= 80 ? '#f0fff4' : '#fffbe6',
                  border: `1px solid ${factCheck.score >= 80 ? '#b7eb8f' : '#ffe58f'}`,
                  borderRadius: RADIUS.md,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 20 }}>{factCheck.level === 'ok' ? '✅' : '⚠️'}</span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#2c1a0e' }}>
                    Auditoria Fact-Check: Nota {factCheck.score}/100 ({factCheck.level.toUpperCase()})
                  </div>
                  <div style={{ fontSize: 11.5, color: '#665c54' }}>
                    {factCheck.issues.length > 0 ? factCheck.issues.join('; ') : 'Conteúdo aprovado sem contradições factuais ou conceituais.'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 5. Modelagem Cognitiva Diagnóstica (CDM/DINA) & Proteção Psicométrica DIF */}
          <div
            style={{
              background: '#fff',
              borderRadius: RADIUS.lg,
              padding: '16px 20px',
              border: '1.5px solid #ede8dc',
              boxShadow: SHADOW.sm,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>🧩</span>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
                  5. Modelagem Cognitiva Diagnóstica (CDM / DINA) & Detecção de Viés DIF
                </h4>
              </div>
              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 800,
                  background: '#f5f3ff',
                  color: '#6d28d9',
                  border: '1px solid #ddd6fe'
                }}
              >
                Gating de Suficiência Ativo (N ≥ 30)
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 12 }}>
              {/* Card DINA */}
              <div style={{
                background: '#faf5ff',
                border: '1px solid #e9d5ff',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#581c87' }}>
                  <span>🎯</span>
                  <span>Q-Matrix & DINA Model (de la Torre, 2009)</span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#6b21a8', lineHeight: 1.45 }}>
                  Mapeia os itens a atributos cognitivos latentes binários (α<sub>i</sub>). Resposta ideal: η<sub>ij</sub> = ∏ α<sub>ik</sub><sup>q<sub>jk</sub></sup>. {mappedAttributesCount > 0 ? `${mappedAttributesCount} atributos mapeados nos itens atuais.` : 'Itens aguardando anotação de atributos.'}
                </p>
                <div style={{ background: '#fff', padding: '6px 10px', borderRadius: 6, border: '1px solid #d8b4fe', fontSize: 11, color: '#7e22ce', fontWeight: 600 }}>
                  ⚖️ <strong>Status Amostral:</strong> Dados pré-aplicação (N &lt; {DINA_MIN_RESPONSES_FOR_CALIBRATION}). Parâmetros s<sub>j</sub> e g<sub>j</sub> operando sob priors teóricos canônicos (s=0.10, g=0.20) com bloqueio de calibração empírica precoce.
                </div>
              </div>

              {/* Card DIF */}
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#14532d' }}>
                  <span>⚖️</span>
                  <span>Funcionamento Diferencial (Mantel-Haenszel DIF)</span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#166534', lineHeight: 1.45 }}>
                  Audita se itens favorecem indevidamente grupos de referência ou foco (ETS Classes A, B e C) controlando pelo escore total.
                </p>
                <div style={{ background: '#fff', padding: '6px 10px', borderRadius: 6, border: '1px solid #86efac', fontSize: 11, color: '#15803d', fontWeight: 600 }}>
                  🛡️ <strong>Gate de Poder Estatístico:</strong> {difSampleAudit?.auditNotice || `Mínimo exigido de ${DIF_MIN_GROUP_SAMPLE_SIZE} alunos por grupo. Teste de hipótese pausado aguardando coleta.`}
                </div>
              </div>

              {/* Card Loop OMR -> BKT / DINA / DIF em Tempo Real */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>⚡</span>
                    <span>Loop OMR → BKT / DINA / DIF em Tempo Real (Fase A1)</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#e2e8f0', color: '#334155' }}>
                    Circuito Fechado
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  Ao escanear ou processar folhas de respostas no OmniGrader, a função <code>processOMRBatchAndUpdatePsychometrics</code> atualiza automaticamente o domínio BKT por aluno/tópico e recalibra empiricamente DINA e DIF quando o volume atingir N ≥ {DINA_MIN_RESPONSES_FOR_CALIBRATION}. O motor gera também o <strong>Sumário Executivo Pedagógico de 1 página</strong> via <code>generateExecutivePedagogicalSummary</code>, traduzindo dados em linguagem acolhedora sem jargões.
                </p>
              </div>

              {/* Card de Versionamento e Histórico Auditável da Prova (Fase A5) */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>📜</span>
                    <span>Histórico Auditável de Versões (Fase A5)</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#e0f2fe', color: '#0369a1' }}>
                    Versão Atual: v{examAuditHistory.currentVersion || 1} ({examAuditHistory.entries.length} registro(s) imutável(is))
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  Todas as alterações manuais e assistidas (edições de distratores, exclusões para correção de Haladyna, overrides de gate e adições de questões) são registradas em trilha de auditoria imutável com autoria e timestamp.
                </p>
                {examAuditHistory.entries.length > 0 && (
                  <div style={{
                    maxHeight: 140,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    background: '#fff',
                    padding: 8,
                    borderRadius: 6,
                    border: '1px solid #e2e8f0'
                  }}>
                    {examAuditHistory.entries.slice(-5).reverse().map((entry, idx) => (
                      <div key={idx} style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 4px', borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ color: '#0f172a', fontWeight: 600 }}>• {entry.diffSummary}</span>
                        <span style={{ color: '#64748b', fontSize: 10, flexShrink: 0 }}>{entry.formattedTimestamp} ({entry.author.name})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Card do Gate Pré-Linter: Self-Consistency e Similaridade Semântica (Onda B - Fase B1) */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>🛡️</span>
                    <span>Gate Pré-Linter: Self-Consistency & Similaridade Semântica (Fase B1)</span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: preLinterAuditSummary.inconsistentCount === 0 ? '#dcfce7' : '#fee2e2',
                    color: preLinterAuditSummary.inconsistentCount === 0 ? '#15803d' : '#b91c1c'
                  }}>
                    {preLinterAuditSummary.consistentCount}/{preLinterAuditSummary.total} Itens Consistentes
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  O motor executa verificações de auto-consistência interna (Wang et al., 2022) para descartar itens ambíguos ou com instabilidade na dificuldade prevista antes do Haladyna linter, além de calcular coeficientes de Jaccard e bi-gramas contra o banco de questões para sinalizar quase-duplicados ({preLinterAuditSummary.nearDuplicateCount} duplicata(s) encontrada(s)).
                </p>
              </div>

              {/* Card do Linter de Haladyna (Auto-Fix) & Legibilidade Flesch-Kincaid (Onda B - Fase B2) */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>✨</span>
                    <span>Linter Haladyna (Auto-Fix) & Legibilidade Flesch-Kincaid (Fase B2)</span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: readabilityAndHaladynaAudit.inappropriateCount === 0 ? '#dcfce7' : '#fef3c7',
                    color: readabilityAndHaladynaAudit.inappropriateCount === 0 ? '#15803d' : '#92400e'
                  }}>
                    Média: {readabilityAndHaladynaAudit.avgGradeLevel}º Ano (Flesch {readabilityAndHaladynaAudit.avgFlesch})
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  Auditoria contínua de diretrizes de escrita de itens (Haladyna et al., 2002) com auto-correção com um clique ({readabilityAndHaladynaAudit.autoFixableViolations} correção(ões) automática(s) disponíveis para {readabilityAndHaladynaAudit.totalHaladynaViolations} violação(ões) detectada(s)). A análise de legibilidade adaptada ao português assegura que a complexidade sintática e vocabulária seja compatível com a faixa etária dos alunos.
                </p>
              </div>

              {/* Card de Rubricas Analíticas Ancoradas em Evidências (Onda B - Fase B3) */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>📊</span>
                    <span>Rubricas Analíticas Ancoradas em Evidências (Fase B3)</span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: rubricSummary.rubricCount > 0 ? '#dcfce7' : '#f1f5f9',
                    color: rubricSummary.rubricCount > 0 ? '#15803d' : '#475569'
                  }}>
                    {rubricSummary.rubricCount}/{rubricSummary.discursiveTotal} Questões Abertas com Rubrica
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  Matrizes de avaliação com 4 níveis Likert (Insuficiente 25%, Básico 50%, Proficiente 75%, Avançado 100%) ancorados estritamente em descritores comportamentais observáveis (Popham, 1997; Andrade, 2005), com auditoria automática que proíbe adjetivos vagos ou subjetivos sem critério empírico.
                </p>
              </div>

              {/* Card de Modelo BKT Adaptativo por Aluno (Slip e Guess Empíricos - Onda C - Fase C1) */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>🧠</span>
                    <span>Modelo BKT Adaptativo: Slip P(S) & Guess P(G) Empíricos (Fase C1)</span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: '#e0f2fe',
                    color: '#0369a1'
                  }}>
                    Priors: P(S)=0.10 | P(G)=0.25 (N &lt; 5 Fallback)
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  Estimação individualizada dos parâmetros de deslize P(S) e chute P(G) ancorada em amortecimento Bayesiano (Corbett &amp; Anderson, 1995). Identifica perfis como aluno <em>descuidado</em> (alta taxa de erro em itens fáceis → P(S) &gt; 0.18) e aluno <em>chutador</em> (alta taxa de acerto em itens difíceis → P(G) &gt; 0.35), com fallback estrito para priors quando N &lt; 5 para evitar sobreajuste estocástico.
                </p>
              </div>

              {/* Card de Modelo DINA por Item: Slip s_j, Guess g_j & IDI (Onda C - Fase C2) */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>📐</span>
                    <span>Modelo DINA por Item &amp; Q-Matrix Refinada (Pesos Contínuos [0, 1] &amp; Q-Fit — Fases C2/C3)</span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: '#ede9fe',
                    color: '#6d28d9'
                  }}>
                    Priors: s₀ = 0.10 | g₀ = 0.20 &bull; Q-Fit ≥ 70%
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  Modelo de Diagnóstico Cognitivo (DINA — de la Torre, 2009) com <strong>Q-Matrix Refinada por Pesos Contínuos</strong> (Chiu, 2013; Barnes, 2005): supera a dicotomia binária rígida permitindo atribuição ponderada <em>q_jk &in; [0, 1]</em> para saliência curricular dos atributos.
                  O indicador de resposta ideal <em>&eta;_ij = &prod; &alpha;_ik^(q_jk)</em> modela a probabilidade de acerto contínua, enquanto o índice <strong>Q-Fit</strong> avalia a aderência empírica da especificação da matriz contra as respostas reais dos alunos.
                </p>
              </div>

              {/* Card de Teoria da Resposta ao Item Multidimensional & MCAT (Onda D - Fases D1/D2) */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>🌐</span>
                    <span>MIRT Compensatório (M3PL) &amp; Teste Adaptativo MCAT com D-Optimality (Fases D1/D2)</span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: '#e0f2fe',
                    color: '#0369a1'
                  }}>
                    D-Optimality: max det(&Phi; + I_j) &bull; SE &le; 0.35 &bull; N &isin; [5, 25]
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  Avaliação simultânea de múltiplas habilidades latentes concomitantes (Reckase, 2009) via modelo compensatório: <em>P_j(&theta;) = c_j + (1 - c_j) / (1 + exp(-( &sum; a_jd &theta;_d + d_j )))</em>.
                  O algoritmo <strong>MCAT</strong> (Segall, 1996) seleciona iterativamente o próximo item maximizando o determinante da informação acumulada (<strong>D-Optimality</strong>), monitorando o critério de parada por erro padrão alvo (<em>max(SE_d) &le; 0.35</em>) e limites de itens (mínimo 5 e máximo 25) sob controle estocástico de superexposição Sympson-Hetter.
                </p>
              </div>

              {/* Card de Controle de Exposição Sympson-Hetter Operacional (Onda D - Fase D3) */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>🛡️</span>
                    <span>Controle Operacional de Exposição Sympson-Hetter (Fase D3)</span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: '#fef3c7',
                    color: '#92400e'
                  }}>
                    r_target = 0.25 &bull; Gating N &ge; {SYMPSON_HETTER_MIN_SAMPLE_SIZE} &bull; k_j &isin; [0.05, 1.0]
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  Controle estocástico contra superexposição de itens e vazamento de banco de questões (Sympson &amp; Hetter, 1985). Assegura que a probabilidade incondicional de administração de qualquer item não ultrapasse a taxa máxima alvo <em>r_target = 0.25</em>. Para prevenir a inanição precoce de itens (item starvation), o gating psicométrico mantém <em>k_j = 1.0</em> enquanto o volume total de exames aplicados for inferior a N = {SYMPSON_HETTER_MIN_SAMPLE_SIZE}. Ao atingir o volume empírico, o parâmetro <em>k_j</em> é calibrado dinamicamente via <code>updateSympsonHetterParameter</code> e auditado em lote por <code>auditItemExposureRates</code>.
                </p>
              </div>

              {/* Card de Modelo de Resposta Graduada (GRM - Samejima, 1969 - Onda E - Fase E1) */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>📈</span>
                    <span>Modelo de Resposta Graduada (GRM — Samejima, 1969 — Fase E1)</span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: '#fae8ff',
                    color: '#86198f'
                  }}>
                    TRI Politômica &bull; Ogiva Cumulativa P* &bull; Rubricas Analíticas 4 Níveis
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  Modelagem psicométrica de itens dissertativos politômicos e rubricas analíticas (Samejima, 1969; 1997). Modela as probabilidades cumulativas <em>P*_jk(&theta;) = 1 / (1 + exp(-a_j(&theta; - b_jk)))</em> com limiares estritamente ordenados (<em>b_1 &lt; b_2 &lt; b_3</em>) sobre a escala Likert de 4 níveis (Insuficiente, Básico, Proficiente, Avançado). O motor calcula a <strong>Função de Informação de Fisher Politômica</strong> <em>I_j(&theta;)</em> e estima a proficiência contínua <em>&theta;</em> via Máximo a Posteriori (MAP) com erro padrão analítico <em>SE(&theta;)</em>.
                </p>
              </div>

              {/* Card de Modelo de Créditos Parciais Generalizado (GPCM - Muraki, 1992 - Onda E - Fase E2) */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>📊</span>
                    <span>Modelo de Créditos Parciais Generalizado (GPCM — Muraki, 1992 — Fase E2)</span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: '#ccfbf1',
                    color: '#0f766e'
                  }}>
                    TRI Politômica &bull; Categorias Adjacentes &bull; Créditos Parciais por Etapas
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  Modelagem psicométrica de itens com pontuação graduada por etapas ou créditos parciais (Muraki, 1992; Masters, 1982). Diferentemente do GRM (que modela ogivas cumulativas), o GPCM opera via logit de categorias adjacentes (divide-by-total). A função de informação de Fisher possui a propriedade exata <em>I_j(&theta;) = a_j² &bull; Var(X_j | &theta;)</em>, permitindo estimar a proficiência <em>&theta;</em> e o ganho diagnóstico a partir de resoluções passo a passo.
                </p>
              </div>

              {/* Card de Modelo de Escala de Avaliação (RSM - Andrich, 1978 - Onda E - Fase E3) */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>📏</span>
                    <span>Modelo de Escala de Avaliação (RSM — Andrich, 1978 — Fase E3)</span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: '#fef9c3',
                    color: '#854d0e'
                  }}>
                    Infit: {rsmAuditSummary.fit.infitMnSq.toFixed(2)} &bull; Outfit: {rsmAuditSummary.fit.outfitMnSq.toFixed(2)} &bull; Faixa [0.70, 1.30]
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  Modelagem psicométrica de itens politômicos com escala de resposta compartilhada (Andrich, 1978; Wright &amp; Masters, 1982). No modelo RSM, todos os itens compartilham a mesma métrica de limiares de transição de categoria <em>&tau;_1, ..., &tau;_&#123;K-1&#125;</em>, variando apenas a dificuldade intrínseca de cada item <em>&beta;_j</em>. Inclui diagnóstico canônico de ajuste de Rasch via <strong>Infit e Outfit Mean-Square</strong> na faixa produtiva ideal de [0.70, 1.30] (Wright &amp; Linacre, 1994) e estimação de proficiência <em>&theta;</em> via Máximo a Posteriori (MAP).
                </p>
              </div>

              {/* Card de Geração Dinâmica de Distratores com Modelagem de Erro Cognitivo (Onda F - Fase F1) */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>🎯</span>
                    <span>Geração Dinâmica de Distratores com Modelagem de Erro Cognitivo (Fase F1)</span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: distractorDiagnosticsSummary.avgCoveragePercentage >= 80 ? '#dcfce7' : '#fef3c7',
                    color: distractorDiagnosticsSummary.avgCoveragePercentage >= 80 ? '#15803d' : '#92400e'
                  }}>
                    Cobertura Média: {distractorDiagnosticsSummary.avgCoveragePercentage}% &bull; {distractorDiagnosticsSummary.goldStandardCount}/{distractorDiagnosticsSummary.totalMc} Padrão Ouro (Zero Fillers)
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  Construção psicométrica de alternativas incorretas baseada estritamente em <strong>modelagem de erros cognitivos e concepções alternativas</strong> (Sadler et al., 2013; Haladyna et al., 2002; DiBattista &amp; Kurzawa, 2011; Gierl et al., 2017). Cada distrator reflete uma hipótese diagnóstica estruturada (<em>hipergeneralização, inversão conceitual, interferência de L1, regra incompleta, deslize operacional ou heurística superficial</em>), eliminando distratores óbvios/inúteis (fillers) e fornecendo pistas imediatas de remediação pedagógica.
                </p>
              </div>

              {/* Card de Curvas Características de Distratores (DCC / Distractor Analysis — Onda F - Fase F2) */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>📊</span>
                    <span>Curvas Características de Distratores (DCC / Distractor Analysis — Fase F2)</span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: dccAuditSummary.positiveDiscriminatingCount === 0 ? '#dcfce7' : '#fee2e2',
                    color: dccAuditSummary.positiveDiscriminatingCount === 0 ? '#15803d' : '#b91c1c'
                  }}>
                    {dccAuditSummary.functionalCount} Distratores Funcionais &bull; {dccAuditSummary.positiveDiscriminatingCount} Anomalia(s) de Discriminação Positiva
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  Modelagem contínua da probabilidade de escolha de cada alternativa em função da proficiência latente <em>&theta;</em> (Thissen, Steinberg &amp; Gerrard, 1986; Samejima, 1979). Detecta automaticamente <strong>distratores inertes</strong> (P &lt; 5% em todo o continuum) e identifica anomalias críticas de <strong>discriminação positiva em distratores</strong> (<em>a &gt; 0</em> ou <em>r_pbis &gt; 0</em>), onde estudantes proficientes são atraídos indevidamente por formulações ambíguas ou pegadinhas, orientando intervenção psicométrica antes da aplicação.
                </p>
              </div>

              {/* Card de Roteamento de Feedback Formativo Imediato por Distrator (Onda F - Fase F3) */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>💬</span>
                    <span>Roteamento de Feedback Formativo Imediato por Distrator (Fase F3)</span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: formativeFeedbackSummary.averageCoveragePercentage >= 80 ? '#ede9fe' : '#fef3c7',
                    color: formativeFeedbackSummary.averageCoveragePercentage >= 80 ? '#6d28d9' : '#92400e'
                  }}>
                    {formativeFeedbackSummary.fullyRoutedQuestions}/{formativeFeedbackSummary.totalQuestions} Itens 100% Roteados &bull; {formativeFeedbackSummary.totalFeedbacksCount} Feedbacks Estruturados
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  Matriz de intervenção formativa imediata estruturada nos 3 níveis canônicos de <strong>Hattie &amp; Timperley (2007)</strong> e Shute (2008): <em>Nível de Tarefa</em> (o que está certo/errado), <em>Nível de Processo</em> (o bug conceitual subjacente da alternativa e a estratégia correta) e <em>Nível de Auto-Regulação</em> (pergunta reflexiva de scaffolding metacognitivo). Ao escolher qualquer distrator, o estudante recebe orientação personalizada que transforma o erro fértil em oportunidade ativa de aprendizagem.
                </p>
              </div>

              {/* Card de Equacionamento Linear e Equipercentil de Formas (Onda G - Fase G1) */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>⚖️</span>
                    <span>Equacionamento Linear &amp; Equipercentil de Formas (Fase G1 — Kolen &amp; Brennan)</span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: '#e0f2fe',
                    color: '#0369a1'
                  }}>
                    α = {classicalEquatingSummary.slopeLinear} &bull; β = {classicalEquatingSummary.interceptLinear} &bull; RMS = {classicalEquatingSummary.rmsDifference}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  Alinhamento psicométrico de escalas entre formas paralelas de avaliação (Kolen &amp; Brennan, 2014; Angoff, 1971). Ajusta diferenças de dificuldade entre versões do teste via <strong>Equacionamento Linear</strong> ($l(x) = \alpha x + \beta$) e <strong>Equipercentil</strong> ($e(x) = G^{'{'}-1{'}'}(F(x))$ com interpolação linear contínua), garantindo justiça avaliativa e comparabilidade longitudinal sem distorcer o desempenho real dos alunos.
                </p>
              </div>

              {/* Card de Equacionamento por TRI Stocking-Lord & Haebara (Onda G - Fase G2) */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>📐</span>
                    <span>Equacionamento por TRI (Fase G2 — Stocking-Lord &amp; Haebara)</span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: '#fef3c7',
                    color: '#92400e'
                  }}>
                    A = {irtEquatingSummary.constants.A} (Escala) &bull; B = {irtEquatingSummary.constants.B} (Translação) &bull; RMS Âncora = {irtEquatingSummary.anchorDiscrepancyRMS}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  Conexão de escalas latentes de proficiência através de itens âncora (Stocking &amp; Lord, 1983; Haebara, 1980). Transforma os parâmetros $a_j, b_j$ da nova forma para a métrica canônica do banco via otimização das Curvas Características do Teste (TCC) e Curvas dos Itens (ICC), viabilizando a comparabilidade invariante do escore verdadeiro $\tau(\theta)$ entre diferentes edições do exame.
                </p>
              </div>

              {/* Card de Gestão e Purificação de Itens Âncora & Drift (Onda G - Fase G3) */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>🛡️</span>
                    <span>Gestão &amp; Purificação de Itens Âncora (Fase G3 — Kolen &amp; Brennan / Holland &amp; Thayer)</span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: anchorPurificationSummary.healthStatus === 'healthy' ? '#dcfce7' : '#fef3c7',
                    color: anchorPurificationSummary.healthStatus === 'healthy' ? '#166534' : '#92400e'
                  }}>
                    {anchorPurificationSummary.purifiedAnchorCount}/{anchorPurificationSummary.initialAnchorCount} Âncoras Estáveis &bull; {anchorPurificationSummary.purgedItemsCount} Purgados por Drift
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  Detecção autônoma de Item Parameter Drift (IPD) e Funcionamento Diferencial do Item (DIF) via estatística de Mantel-Haenszel e Delta de Holland-Thayer (Kolen &amp; Brennan, 2014; Dorans &amp; Holland, 1993). O algoritmo de <strong>purificação iterativa</strong> expurga itens que sofreram vazamento, desgaste ou drift de dificuldade ($|d_j| &gt; 0.35$), impedindo que âncoras corrompidas distorçam a comparabilidade longitudinal de todo o banco de avaliações.
                </p>
              </div>

              {/* Card de Confiabilidade Psicométrica Global (Onda H - Fase H1) */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>🎯</span>
                    <span>Confiabilidade Psicométrica Global (Fase H1 — Cronbach &amp; McDonald)</span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: reliabilitySummary.cronbachAlpha >= 0.80 ? '#dcfce7' : reliabilitySummary.cronbachAlpha >= 0.70 ? '#e0f2fe' : '#fef3c7',
                    color: reliabilitySummary.cronbachAlpha >= 0.80 ? '#166534' : reliabilitySummary.cronbachAlpha >= 0.70 ? '#0369a1' : '#92400e'
                  }}>
                    α = {reliabilitySummary.cronbachAlpha} &bull; ω = {reliabilitySummary.mcdonaldOmega} &bull; SEM = {reliabilitySummary.standardErrorOfMeasurement} pts
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  Mensuração rigorosa da consistência interna e fidedignidade da avaliação (Cronbach, 1951; McDonald, 1999; Nunnally &amp; Bernstein, 1994). Calcula o <strong>Alfa de Cronbach</strong> (&alpha;), o <strong>Ômega Total de McDonald</strong> (&omega;, livre da premissa de tau-equivalência) e o <strong>Erro Padrão de Medida</strong> (SEM), acompanhados da análise de <em>Alpha if Item Deleted</em> para assegurar que cada questão contribua positivamente para a precisão da nota final.
                </p>
              </div>

              {/* Card de Curvas de Informação do Teste & Erro Padrão Condicional (Onda H - Fase H2) */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>📈</span>
                    <span>Curva de Informação do Teste (TIF) &amp; Erro Padrão SE(&theta;) (Fase H2 — Lord &amp; Birnbaum)</span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: '#e0f2fe',
                    color: '#0369a1'
                  }}>
                    Pico I(&theta;) = {tifSummary.peakInformation} (em &theta;={tifSummary.peakTheta}) &bull; Menor SE = {tifSummary.minStandardError} &bull; Banda [{tifSummary.effectiveBandwidth.minTheta}, {tifSummary.effectiveBandwidth.maxTheta}]
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  Precisão condicional de medida em função da proficiência latente (Lord, 1980; Birnbaum, 1968). A <strong>Função de Informação do Teste (TIF)</strong> e o <strong>Erro Padrão Condicional</strong> ($SE(\theta) = 1/\sqrt{'{'}I(\theta){'}'}$) substituem a falsa suposição clássica de erro constante, delimitando a faixa de eficácia do exame e identificando <em>zonas cegas</em> (blind spots) para alunos com dificuldades extremas ou alto rendimento.
                </p>
              </div>

              {/* Card de Relatórios de Devolutiva Diagnóstica Normativa e Critério-Referenciada (Onda H - Fase H3) */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: RADIUS.md,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                gridColumn: '1 / -1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, color: '#1e293b' }}>
                    <span>📋</span>
                    <span>Devolutiva Diagnóstica Normativa &amp; Critério-Referenciada (Fase H3 — Popham &amp; Marzano)</span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: '#ede9fe',
                    color: '#6d28d9'
                  }}>
                    {standardsReportingSummary.totalStudents} Estudantes Diagnosticados &bull; 4 Níveis BNCC &bull; Planos de Ação Ativos
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
                  Comunicação formativa de alto impacto combinando <strong>Avaliação Critério-Referenciada</strong> (Popham, 1978; Marzano, 2000 — 4 níveis de desempenho: Abaixo do Básico, Básico, Proficiente, Avançado e <em>Can-Do Statements</em> por habilidade da BNCC) e <strong>Avaliação Normativa</strong> (Z-Score, T-Score e Postos Percentílicos). Gera planos de intervenção imediatos para o professor (agrupamentos flexíveis e recuperação focal) e devolutivas acolhedoras para o estudante.
                </p>
              </div>
            </div>

            <div style={{
              background: '#faf6f0',
              border: '1px solid #ede8dc',
              borderRadius: RADIUS.sm,
              padding: '8px 12px',
              fontSize: 11.5,
              color: '#7a5c42',
              lineHeight: 1.45,
              fontStyle: 'italic'
            }}>
              🔬 <strong>Integridade Psicométrica sem Simulação Falsa:</strong> O sistema proíbe inventar estimativas de viés (DIF) ou escorregamento (DINA) antes que a amostra empírica atinja N = 30 respostas por item e por grupo focal.
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE BLOQUEIO DE EXPORTAÇÃO (HALADYNA GATE) */}
      {showHaladynaGateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div style={{
            background: '#fff',
            borderRadius: RADIUS.xl,
            maxWidth: 580,
            width: '100%',
            padding: 24,
            boxShadow: SHADOW.lg,
            border: '2px solid #ef4444',
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 32 }}>🛑</span>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#991b1b' }}>
                  Bloqueio de Integridade Psicométrica (Haladyna)
                </h3>
                <p style={{ margin: 0, fontSize: 12.5, color: '#7a5c42' }}>
                  Foram detectadas violações críticas que invalidam as propriedades métricas do teste.
                </p>
              </div>
            </div>

            <div style={{
              background: '#fef2f2',
              borderRadius: RADIUS.md,
              border: '1px solid #fecaca',
              padding: 12,
              maxHeight: 220,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              <strong style={{ fontSize: 12, color: '#991b1b', textTransform: 'uppercase' }}>
                {criticalHaladynaViolations.length} Violação(ões) Crítica(s) Encontrada(s):
              </strong>
              {criticalHaladynaViolations.map((item, idx) => (
                <div key={idx} style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.4, paddingLeft: 8, borderLeft: '3px solid #ef4444' }}>
                  <strong>Questão {item.questionNumber}:</strong> {item.violation.message}
                </div>
              ))}
            </div>

            <p style={{ margin: 0, fontSize: 12, color: '#665c54', lineHeight: 1.5 }}>
              Diretrizes psicométricas (Haladyna et al., 2002) comprovam que alternativas com "Todas/Nenhuma das anteriores" ou distratores idênticos eliminam a validade discriminatória do item e favorecem respostas por eliminação sem domínio do construto.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
              <button
                type="button"
                onClick={() => {
                  setShowHaladynaGateModal(false)
                  setPendingExportAction(null)
                }}
                style={{
                  padding: '9px 16px',
                  borderRadius: RADIUS.md,
                  border: '1px solid #d1d5db',
                  background: '#f3f4f6',
                  color: '#374151',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Voltar e Corrigir Questões
              </button>

              <button
                type="button"
                onClick={() => {
                  setHaladynaOverrideGranted(true)
                  setShowHaladynaGateModal(false)
                  recordExamAuditEvent({
                    examId,
                    action: 'haladyna_gate_overridden',
                    diffSummary: `Exportação liberada sob override manual com ${criticalHaladynaViolations.length} violação(ões) crítica(s) de Haladyna pendentes.`,
                    details: {
                      criticalCount: criticalHaladynaViolations.length,
                      violations: criticalHaladynaViolations.map(v => ({
                        questionNumber: v.questionNumber,
                        rule: v.violation.ruleId,
                        message: v.violation.message
                      }))
                    }
                  })
                  if (pendingExportAction) {
                    pendingExportAction()
                    setPendingExportAction(null)
                  }
                }}
                style={{
                  padding: '9px 16px',
                  borderRadius: RADIUS.md,
                  border: 'none',
                  background: '#dc2626',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(220,38,38,0.3)'
                }}
              >
                Revisar e confirmar exportação mesmo assim (Sobrescrever Gate)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
