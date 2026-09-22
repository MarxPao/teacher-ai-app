'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast, showConfirm } from '@/components/Toast'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import DocumentCanvas from '@/components/DocumentCanvas'
import ReflectionModal, { ReflectionData } from '@/components/ReflectionModal'
import LessonProgressView from '@/components/LessonProgressView'
import { ApiConfig } from '@/components/modules/ApiManager'
import { exportToPdf, exportToWord, exportToExcel, formatMarkdownToHtml } from '@/lib/exportUtils'
import { getSupabaseUrlAndKey } from '@/lib/supabaseAuth'
import { getBnccCatalog, getClassPostponedSkills, saveClassPostponedSkills, BnccSkill, inferBnccSkillsForTopic } from '@/lib/bnccStore'
import { buildTeacherStylePromptDirective, updateTeacherProfileFromLessonPlan } from '@/lib/teacherProfile'
import { buildTeacherStyleSystemPrompt } from '@/lib/teacherStyleProfile'
import { getStoredQuestions } from '@/lib/questionBankService'
import { getSubjectProfile, getAllSubjectProfiles, SubjectProfile } from '@/lib/subjectProfile'
import '@/lib/subjects/portuguese'
import Button from '@/components/Button'
import {
  LESSON_FRAMEWORKS,
  getLessonFrameworkConfig,
  buildDynamicFrameworkPrompt,
  inferCefrLevelForGrade,
  getCefrGatingRules,
  getL1InterferenceDirectives
} from '@/lib/lessonFrameworks'
import {
  getClassPedagogicalProfile,
  ClassPedagogicalProfile,
  getSpacedRetrievalTopic,
  SpacedRetrievalSuggestion,
  getFertileErrorsForClass,
  FertileErrorChallenge
} from '@/lib/studentMemory'
import {
  generateScaffoldingTiers,
  ScaffoldingTiers,
  generateCheckingQuestions,
  CheckingQuestions,
  HARVARD_THINKING_ROUTINES,
  HarvardThinkingRoutine,
  calculateTalkTimeRatio,
  TalkTimeAnalysis,
  generateStudentCanDoStatements,
  CLIL_SUBJECTS,
  ClilSubjectOption,
  INCLUSION_PROFILES,
  InclusionProfile,
  getInclusionAccommodations
} from '@/lib/pedagogicalEnhancements'
import {
  BNCC_GENERAL_COMPETENCIES,
  inferGeneralCompetencies,
  InferredCompetencyResult
} from '@/lib/bnccGeneralCompetencies'
import {
  LessonPackage,
  PackageWorksheet,
  PackageParentCommunication,
  buildPackageQuestionsPrompt,
  buildPackageParentCommsPrompt,
  saveLessonPackage
} from '@/lib/lessonPackageEngine'
import { getStudentPei, saveStudentPei, PeiRecord } from '@/lib/peiManagement'
import PeiManagementModal from '@/components/PeiManagementModal'
import DidacticSequence from '@/components/modules/DidacticSequence'
import PeiTab from '@/components/planningHub/PeiTab'
import PdiTab from '@/components/planningHub/PdiTab'
import ProjectsTab from '@/components/planningHub/ProjectsTab'
import EditableDocumentModal from '@/components/editableDocument/EditableDocumentModal'
import { PEI_SCHEMA } from '@/lib/editableDocumentTypes'
import {
  ClassRecord,
  getUnifiedClasses,
  subscribeToClassUpdates,
  saveOrUpdateClass
} from '@/lib/classService'
import {
  DidacticSequenceDocument,
  getDidacticSequences,
  getDidacticSequenceById,
  linkLessonPlanToSequence,
  calculateCurricularPace,
  subscribeToDidacticSequenceUpdates
} from '@/lib/didacticSequenceService'
import { searchLibraryContext, buildRagPromptContext } from '@/lib/ragEngine'
import AiAssistButton from '@/components/AiAssistButton'
import { syncLessonPlanToCalendar } from '@/lib/calendarPlanBridge'


// ─── Tipos ───────────────────────────────────────────────────────────────────

interface SchoolRecord {
  id: string
  name: string
}

export interface StudentRecord {
  id: string
  name: string
  classId?: string
  schoolId?: string
  notes?: string
  level?: string
  nee?: boolean
  nee_flag?: boolean
  nee_description?: string
  neeDescription?: string
}

export type StageInteractionType = 'individual' | 'pair' | 'group' | 'whole_class' | 'teacher_student'

export interface DidacticSequenceReference {
  sequenceId?: string
  sequenceTitle?: string
  lessonOrder?: number
  totalLessons?: number
}

export interface LessonStage {
  name: string
  durationMin: number
  teacherAction: string
  studentAction: string
  interactionType?: StageInteractionType
  materialReference?: string
  grouping?: string
  completed?: boolean
  targetBnccCode?: string
  scaffoldingTiers?: ScaffoldingTiers
  checkingQuestions?: CheckingQuestions
  thinkingRoutine?: HarvardThinkingRoutine
  speechBalance?: { teacherPercent: number; studentPercent: number; silencePercent: number }
}

export interface LessonPlanDocument {
  id: string
  date: string
  classId: string
  className: string
  schoolName: string
  subject: string
  topic: string
  description?: string
  subjectCoverageArea?: string
  shortDescription?: string
  predominantInteraction?: StageInteractionType
  materials?: string[]
  speechBalance?: { teacherPercent: number; studentPercent: number; silencePercent: number }
  generalObjective?: string
  specificObjectives?: string
  socioemotionalObjectives?: string
  lessonGoal?: string
  anticipatedProblems?: string
  priorKnowledge?: string
  preTeach?: string
  peiStudentId?: string
  peiStudentName?: string
  peiDiagnosis?: string
  peiAccommodations?: string
  didacticSequenceRef?: DidacticSequenceReference
  docContent?: string
  roomSpace: string // 'Sala de Aula' | 'Laboratório' | 'Pátio' | 'Biblioteca'
  selectedSkills: Array<{ code: string; desc: string; status: 'planned' | 'covered' | 'postponed'; isAutoSuggested?: boolean }>
  methodology: string
  referenceMaterial: {
    bookId?: string
    bookTitle: string
    unit: string
    pages: string
    sharedClassIds?: string[]
  }
  stages: LessonStage[]
  guidingQuestions: string[]
  homework: string
  postLessonNotes: string
  targetDurationMinutes?: number
  assessmentEvidence?: string
  savedInBank?: boolean
  savedInCalendar?: boolean
  createdAt: number
}

const METHODOLOGY_PRESETS = LESSON_FRAMEWORKS

const DEFAULT_STAGES: LessonStage[] = getLessonFrameworkConfig('ppp').defaultStages.map(s => ({
  name: s.name,
  durationMin: s.durationMin,
  teacherAction: s.teacherAction,
  studentAction: s.studentAction,
  targetBnccCode: s.targetBnccCode || '',
  completed: false
}))

const AXIS_STYLE_MAP: Record<string, { bg: string; color: string; border: string }> = {
  'Oralidade': { bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd' },
  'Leitura': { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
  'Escrita': { bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
  'Conhecimentos Linguísticos': { bg: '#f3e8ff', color: '#7e22ce', border: '#e9d5ff' },
  'Dimensão Intercultural': { bg: '#ffe4e6', color: '#be123c', border: '#fecdd3' },
  'Análise Linguística': { bg: '#e0e7ff', color: '#4338ca', border: '#c7d2fe' },
  'Produção de Textos': { bg: '#ffedd5', color: '#c2410c', border: '#fed7aa' }
}

const COMMON_MATERIALS = [
  'Quadro e Marcador',
  'Projetor / DataShow',
  'Folha de Atividades Impressa',
  'Áudio / Caixa de Som',
  'Livro Didático / Apostila',
  'Dispositivos / Tablets',
  'Post-its / Cartolina',
  'Tesoura / Cola'
]

export default function LessonStudio() {
  // Escopo de Planejamento Unificado (Aula | Sequência | PEI | PDI | Projetos)
  const [planningScope, setPlanningScope] = useState<'aula' | 'sequencia' | 'pei' | 'pdi' | 'projetos'>('aula')

  // Navigation tabs: editor (boxes), doc (word-like document), preview (clean document), bank (repository)
  const [activeTab, setActiveTab] = useState<'editor' | 'doc' | 'preview' | 'bank'>('editor')
  const [docContent, setDocContent] = useState<string>('')

  // Context Data
  const [classes, setClasses] = useState<ClassRecord[]>([])
  const [schools, setSchools] = useState<SchoolRecord[]>([])
  const [bankPlans, setBankPlans] = useState<LessonPlanDocument[]>([])
  const [availableQuestions, setAvailableQuestions] = useState<any[]>([])

  // Form & Document State
  const [selectedClassId, setSelectedClassId] = useState('')
  const [subjectId, setSubjectId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const activeClass = localStorage.getItem('teacher_active_class_subject')
        if (activeClass) return activeClass
        const settings = JSON.parse(localStorage.getItem('teacher_settings') || '{}')
        if (settings.defaultSubject) return settings.defaultSubject
      } catch {}
    }
    return 'english'
  })
  const availableSubjects = useMemo(() => getAllSubjectProfiles(), [])
  const activeProfile = useMemo(() => getSubjectProfile(subjectId), [subjectId])
  const [targetDurationMinutes, setTargetDurationMinutes] = useState<number>(50)
  const [assessmentEvidence, setAssessmentEvidence] = useState<string>('')
  const [lessonDate, setLessonDate] = useState(new Date().toISOString().slice(0, 10))
  const [roomSpace, setRoomSpace] = useState('Sala de Aula')
  const [topic, setTopic] = useState('')
  const [selectedMethodology, setSelectedMethodology] = useState('tblt')
  const [bookTitle, setBookTitle] = useState('')
  const [unitChapter, setUnitChapter] = useState('')
  const [pages, setPages] = useState('')
  const [sharedClassIds, setSharedClassIds] = useState<string[]>([])
  const [libraryBooks, setLibraryBooks] = useState<Array<{ id: number | string; title: string; content?: string; type?: string }>>([])
  const [stages, setStages] = useState<LessonStage[]>(DEFAULT_STAGES)
  const [guidingQuestions, setGuidingQuestions] = useState<string[]>([
    'Como os alunos utilizam a estrutura para expressar ideias reais?',
    'Qual vocabulário essencial foi consolidado durante a prática?'
  ])
  const [homework, setHomework] = useState('')
  const [postLessonNotes, setPostLessonNotes] = useState('')

  // ─── FASE 1: Novos Campos Pedagógicos & Reorganização da Arquitetura ────────
  const [description, setDescription] = useState<string>('')
  const [generalObjective, setGeneralObjective] = useState<string>('')
  const [specificObjectives, setSpecificObjectives] = useState<string>('')
  const [socioemotionalObjectives, setSocioemotionalObjectives] = useState<string>('')
  const [lessonGoal, setLessonGoal] = useState<string>('')
  const [anticipatedProblems, setAnticipatedProblems] = useState<string>('')
  const [priorKnowledge, setPriorKnowledge] = useState<string>('')
  const [subjectCoverageArea, setSubjectCoverageArea] = useState<string>('')
  const [shortDescription, setShortDescription] = useState<string>('')
  const [predominantInteraction, setPredominantInteraction] = useState<StageInteractionType>('whole_class')
  const [materials, setMaterials] = useState<string[]>([])
  const [newCustomMaterial, setNewCustomMaterial] = useState<string>('')

  // ─── FASE 2: Box de Pre-teach ──────────────────────────────────────────────
  const [preTeach, setPreTeach] = useState<string>('')

  // ─── FASE 1.2: Suporte a PDI / PEI no Cabeçalho ────────────────────────────
  const [students, setStudents] = useState<StudentRecord[]>([])
  const [peiStudentId, setPeiStudentId] = useState<string>('')
  const [peiStudentName, setPeiStudentName] = useState<string>('')
  const [peiDiagnosis, setPeiDiagnosis] = useState<string>('')
  const [peiAccommodations, setPeiAccommodations] = useState<string>('')
  const [showPeiModalForStudent, setShowPeiModalForStudent] = useState<{ studentId: string; studentName: string } | null>(null)

  // ─── FASE 1.3 / 3: Reserva de Sequência Didática ────────────────────────────
  const [didacticSequenceRef, setDidacticSequenceRef] = useState<DidacticSequenceReference | undefined>(undefined)
  const [availableSequences, setAvailableSequences] = useState<DidacticSequenceDocument[]>([])

  // BNCC Skills state
  const [selectedSkills, setSelectedSkills] = useState<Array<{ code: string; desc: string; status: 'planned' | 'covered' | 'postponed'; isAutoSuggested?: boolean }>>([])
  const [skillSearch, setSkillSearch] = useState('')
  const [bnccGradeFilter, setBnccGradeFilter] = useState<string>('current')
  const [bnccAxisFilter, setBnccAxisFilter] = useState<string>('all')

  // History & Navigation
  const [historyIndex, setHistoryIndex] = useState(0)

  // Modals & Generation
  const [isGenerating, setIsGenerating] = useState(false)
  const [showAttachActivityModal, setShowAttachActivityModal] = useState(false)
  const [showReflectionModal, setShowReflectionModal] = useState(false)
  const [showProgressView, setShowProgressView] = useState(false)
  const [planId, setPlanId] = useState('')
  const planSessionStartTime = useRef<number>(Date.now())
  const isPlanEditedByUser = useRef<boolean>(false)
  const isInitialized = useRef<boolean>(false)

  // Package Generation state (Prioridade 3)
  const [isGeneratingPackage, setIsGeneratingPackage] = useState(false)
  const [packageProgressStep, setPackageProgressStep] = useState('')
  const [generatedPackage, setGeneratedPackage] = useState<LessonPackage | null>(null)
  const [showPackageModal, setShowPackageModal] = useState(false)
  const [packageModalTab, setPackageModalTab] = useState<'overview' | 'plan' | 'worksheet' | 'comms'>('overview')

  // Inovações Pedagógicas (10 Aprimoramentos)
  const [selectedThinkingRoutine, setSelectedThinkingRoutine] = useState<string>('')
  const [isClilActive, setIsClilActive] = useState<boolean>(false)
  const [clilSubjectId, setClilSubjectId] = useState<string>('science')
  const [clilContentTopic, setClilContentTopic] = useState<string>('')
  const [showInclusionModal, setShowInclusionModal] = useState<boolean>(false)
  const [selectedInclusionProfiles, setSelectedInclusionProfiles] = useState<string[]>([])
  const [showCanDoModal, setShowCanDoModal] = useState<boolean>(false)
  const [showGeneralCompetenciesModal, setShowGeneralCompetenciesModal] = useState<boolean>(false)
  const [expandedScaffoldingStage, setExpandedScaffoldingStage] = useState<number | null>(null)
  const [expandedCcqsStage, setExpandedCcqsStage] = useState<number | null>(null)

  // UX / Design Controls (Auditoria Visual)
  const [showExportDropdown, setShowExportDropdown] = useState(false)
  const [showSaveDropdown, setShowSaveDropdown] = useState(false)
  const [regeneratingStageIndex, setRegeneratingStageIndex] = useState<number | null>(null)
  const [stageBackupHistory, setStageBackupHistory] = useState<Record<number, LessonStage>>({})
  const exportDropdownRef = useRef<HTMLDivElement>(null)
  const saveDropdownRef = useRef<HTMLDivElement>(null)

  // ─── FASE 4: Edição Inline no Banco de Planos & Sincronização Calendário ──
  const [inlineEditingPlanId, setInlineEditingPlanId] = useState<string | null>(null)
  const [inlineTopic, setInlineTopic] = useState('')
  const [inlineDate, setInlineDate] = useState('')
  const [inlineRoom, setInlineRoom] = useState('')
  const [inlineHomework, setInlineHomework] = useState('')
  const [inlineNotes, setInlineNotes] = useState('')

  const handleRevertStage = (idx: number) => {
    const backup = stageBackupHistory[idx]
    if (!backup) return
    setStages(prev => {
      const updated = [...prev]
      updated[idx] = backup
      return updated
    })
    setStageBackupHistory(prev => {
      const next = { ...prev }
      delete next[idx]
      return next
    })
    toast.info(`Etapa "${backup.name}" restaurada para a versão anterior.`)
  }

  // Controle de Boxes Compactáveis (Roll / Acordeão)
  const [collapsedBoxes, setCollapsedBoxes] = useState<Record<string, boolean>>({})

  const toggleBoxCollapse = (boxId: string) => {
    setCollapsedBoxes(prev => ({
      ...prev,
      [boxId]: !prev[boxId]
    }))
  }

  const collapseAllBoxes = () => {
    setCollapsedBoxes({
      identificacao: true,
      topico: true,
      diagnosticoPrevio: true,
      bncc: true,
      framework: true,
      material: true,
      materiais: true,
      roteiro: true,
      equilibrioFala: true,
      ubd: true,
      homework: true,
      continuidade: true,
      perguntasGuia: true,
      historico: true
    })
  }

  const expandAllBoxes = () => {
    setCollapsedBoxes({})
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setShowExportDropdown(false)
      }
      if (saveDropdownRef.current && !saveDropdownRef.current.contains(event.target as Node)) {
        setShowSaveDropdown(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowExportDropdown(false)
        setShowSaveDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // ─── Carregamento Inicial ──────────────────────────────────────────────────
  useEffect(() => {
    try {
      const sc = localStorage.getItem('teacher_schools')
      const bk = localStorage.getItem('teacher_lesson_plans_bank')
      const qb = localStorage.getItem('teacher_question_bank')
      const privPrefill = localStorage.getItem('teacher_lesson_studio_student_prefill')
      const unifiedPrefill = localStorage.getItem('teacher_lesson_studio_prefill')

      let parsedCl: ClassRecord[] = getUnifiedClasses()
      let parsedBk: LessonPlanDocument[] = []
      if (bk) parsedBk = JSON.parse(bk)

      if (unifiedPrefill) {
        try {
          const prefill = JSON.parse(unifiedPrefill)
          // 1. Verifica se existe plano completo já salvo no banco
          let foundPlan = prefill.planId ? parsedBk.find(p => p.id === prefill.planId) : null
          if (!foundPlan && prefill.className && prefill.topic) {
            foundPlan = parsedBk.find(p => 
              (p.className?.toLowerCase() === prefill.className?.toLowerCase() && p.topic?.toLowerCase() === prefill.topic?.toLowerCase()) ||
              (p.className?.toLowerCase() === prefill.className?.toLowerCase() && p.date === prefill.date)
            )
          }

          if (foundPlan) {
            // Restaura plano completo
            setPlanId(foundPlan.id)
            setTopic(foundPlan.topic)
            setSelectedClassId(foundPlan.classId)
            if (foundPlan.date) setLessonDate(foundPlan.date)
            if (foundPlan.roomSpace) setRoomSpace(foundPlan.roomSpace)
            if (foundPlan.methodology) setSelectedMethodology(foundPlan.methodology)
            if (foundPlan.referenceMaterial) {
              setBookTitle(foundPlan.referenceMaterial.bookTitle || '')
              setUnitChapter(foundPlan.referenceMaterial.unit || '')
              setPages(foundPlan.referenceMaterial.pages || '')
              if (Array.isArray(foundPlan.referenceMaterial.sharedClassIds)) {
                setSharedClassIds(foundPlan.referenceMaterial.sharedClassIds)
              }
            }
            if (foundPlan.stages && foundPlan.stages.length > 0) setStages(foundPlan.stages)
            if (foundPlan.guidingQuestions) setGuidingQuestions(foundPlan.guidingQuestions)
            if (foundPlan.selectedSkills) setSelectedSkills(foundPlan.selectedSkills)
            if (foundPlan.homework) setHomework(foundPlan.homework)
            if (foundPlan.postLessonNotes) setPostLessonNotes(foundPlan.postLessonNotes)
            if (foundPlan.targetDurationMinutes) setTargetDurationMinutes(foundPlan.targetDurationMinutes)
            if (foundPlan.assessmentEvidence) setAssessmentEvidence(foundPlan.assessmentEvidence)
            if (foundPlan.description) setDescription(foundPlan.description)
            if (foundPlan.generalObjective) setGeneralObjective(foundPlan.generalObjective)
            if (foundPlan.specificObjectives) setSpecificObjectives(foundPlan.specificObjectives)
            if (foundPlan.socioemotionalObjectives) setSocioemotionalObjectives(foundPlan.socioemotionalObjectives)
            if (foundPlan.lessonGoal) setLessonGoal(foundPlan.lessonGoal)
            if (foundPlan.anticipatedProblems) setAnticipatedProblems(foundPlan.anticipatedProblems)
            if (foundPlan.priorKnowledge) setPriorKnowledge(foundPlan.priorKnowledge)
            if (foundPlan.preTeach) setPreTeach(foundPlan.preTeach)
            if (foundPlan.peiStudentId) setPeiStudentId(foundPlan.peiStudentId)
            if (foundPlan.peiStudentName) setPeiStudentName(foundPlan.peiStudentName)
            if (foundPlan.peiDiagnosis) setPeiDiagnosis(foundPlan.peiDiagnosis)
            if (foundPlan.peiAccommodations) setPeiAccommodations(foundPlan.peiAccommodations)
            if (foundPlan.docContent) setDocContent(foundPlan.docContent)
            if (foundPlan.subjectCoverageArea) setSubjectCoverageArea(foundPlan.subjectCoverageArea)
            if (foundPlan.shortDescription) setShortDescription(foundPlan.shortDescription)
            if (foundPlan.predominantInteraction) setPredominantInteraction(foundPlan.predominantInteraction)
            if (Array.isArray(foundPlan.materials)) setMaterials(foundPlan.materials)
            isPlanEditedByUser.current = true
            setActiveTab('editor')
            toast.info(`Planejamento completo carregado: ${foundPlan.className} — ${foundPlan.topic}`)
          } else {
            if (prefill.planId) setPlanId(prefill.planId)
            // 2. Novo plano pré-preenchido pronto para edição
            let targetClassId = prefill.classId
            const matchingClass = parsedCl.find(c => 
              c.id === prefill.classId || c.name.toLowerCase() === prefill.className?.toLowerCase()
            )
            if (matchingClass) {
              targetClassId = matchingClass.id
            } else if (prefill.className) {
              const newClRecord: ClassRecord = {
                id: prefill.classId || `cls_${Date.now()}`,
                name: prefill.className,
                schoolId: prefill.schoolName || 'Escola',
                subject: 'Língua Inglesa',
                gradeYear: prefill.className.includes('1º EM') ? '1º EM' : '9º Fund.'
              }
              parsedCl = [newClRecord, ...parsedCl]
              targetClassId = newClRecord.id
            }

            if (targetClassId) setSelectedClassId(targetClassId)
            if (prefill.topic) setTopic(prefill.topic)
            if (prefill.date) setLessonDate(prefill.date)
            if (prefill.room) setRoomSpace(prefill.room)
            if (prefill.didacticSequenceRef) setDidacticSequenceRef(prefill.didacticSequenceRef)
            setActiveTab('editor')
            toast.info(`Novo planejamento: ${prefill.className || ''} pronto para preenchimento`)
          }
          if (prefill.openProgressTracker) {
            setTimeout(() => setShowProgressView(true), 400)
          }
          localStorage.removeItem('teacher_lesson_studio_prefill')
        } catch {}
      } else if (privPrefill) {
        try {
          const priv = JSON.parse(privPrefill)
          const privClassRecord: ClassRecord = {
            id: `priv_${priv.studentId}`,
            name: `🎓 Particular: ${priv.studentName}`,
            schoolId: 'priv_school',
            subject: priv.subject || 'Língua Inglesa',
            gradeYear: '9º Fund.'
          }
          parsedCl = [privClassRecord, ...parsedCl]
          setSelectedClassId(privClassRecord.id)
          setTopic(`Aula Individual — ${priv.subject || 'Inglês'}`)
          localStorage.removeItem('teacher_lesson_studio_student_prefill')
        } catch {}
      } else {
        // Restauração de Rascunho Automático (Autosave Tier 1)
        const draftRaw = localStorage.getItem('teacher_lesson_studio_draft')
        if (draftRaw) {
          try {
            const draft = JSON.parse(draftRaw)
            if (draft.topic) setTopic(draft.topic)
            if (draft.selectedClassId) setSelectedClassId(draft.selectedClassId)
            else if (parsedCl.length > 0) setSelectedClassId(parsedCl[0].id)
            if (draft.lessonDate) setLessonDate(draft.lessonDate)
            if (draft.roomSpace) setRoomSpace(draft.roomSpace)
            if (draft.selectedMethodology) setSelectedMethodology(draft.selectedMethodology)
            if (draft.bookTitle) setBookTitle(draft.bookTitle)
            if (draft.unitChapter) setUnitChapter(draft.unitChapter)
            if (draft.pages) setPages(draft.pages)
            if (Array.isArray(draft.sharedClassIds)) setSharedClassIds(draft.sharedClassIds)
            if (Array.isArray(draft.stages) && draft.stages.length > 0) setStages(draft.stages)
            if (Array.isArray(draft.guidingQuestions)) setGuidingQuestions(draft.guidingQuestions)
            if (Array.isArray(draft.selectedSkills)) setSelectedSkills(draft.selectedSkills)
            if (draft.homework) setHomework(draft.homework)
            if (draft.postLessonNotes) setPostLessonNotes(draft.postLessonNotes)
            if (draft.targetDurationMinutes) setTargetDurationMinutes(draft.targetDurationMinutes)
            if (draft.assessmentEvidence) setAssessmentEvidence(draft.assessmentEvidence)
            if (draft.description) setDescription(draft.description)
            if (draft.generalObjective) setGeneralObjective(draft.generalObjective)
            if (draft.specificObjectives) setSpecificObjectives(draft.specificObjectives)
            if (draft.socioemotionalObjectives) setSocioemotionalObjectives(draft.socioemotionalObjectives)
            if (draft.lessonGoal) setLessonGoal(draft.lessonGoal)
            if (draft.anticipatedProblems) setAnticipatedProblems(draft.anticipatedProblems)
            if (draft.priorKnowledge) setPriorKnowledge(draft.priorKnowledge)
            if (draft.preTeach) setPreTeach(draft.preTeach)
            if (draft.peiStudentId) setPeiStudentId(draft.peiStudentId)
            if (draft.peiStudentName) setPeiStudentName(draft.peiStudentName)
            if (draft.peiDiagnosis) setPeiDiagnosis(draft.peiDiagnosis)
            if (draft.peiAccommodations) setPeiAccommodations(draft.peiAccommodations)
            if (draft.didacticSequenceRef) setDidacticSequenceRef(draft.didacticSequenceRef)
            if (draft.docContent) setDocContent(draft.docContent)
          } catch {}
        } else if (parsedCl.length > 0) {
          setSelectedClassId(parsedCl[0].id)
        }
      }

      setClasses(parsedCl)
      if (sc) setSchools(JSON.parse(sc))
      if (bk) setBankPlans(parsedBk)
      setAvailableQuestions(getStoredQuestions())
      const repo = localStorage.getItem('teacher_repo') || localStorage.getItem('teacher_repository')
      if (repo) {
        try { setLibraryBooks(JSON.parse(repo)) } catch {}
      }
      const stRaw = localStorage.getItem('teacher_students')
      if (stRaw) {
        try { setStudents(JSON.parse(stRaw)) } catch {}
      }
      isInitialized.current = true
    } catch {
      isInitialized.current = true
    }
  }, [])

  // Escuta atualizações de turmas em tempo real (Fase 6)
  useEffect(() => {
    const unsubscribe = subscribeToClassUpdates((updatedClasses) => {
      setClasses(updatedClasses)
      setSelectedClassId(prev => {
        if (!prev && updatedClasses.length > 0) return updatedClasses[0].id
        return prev
      })
    })
    return () => unsubscribe()
  }, [])

  // Autosave: Persistência com debounce (1.5s) em teacher_lesson_studio_draft
  useEffect(() => {
    if (!isInitialized.current) return
    if (!topic && stages.length === 0 && selectedSkills.length === 0 && !homework) return

    const timer = setTimeout(() => {
      try {
        const draft = {
          topic,
          selectedClassId,
          lessonDate,
          roomSpace,
          selectedMethodology,
          bookTitle,
          unitChapter,
          pages,
          sharedClassIds,
          stages,
          guidingQuestions,
          selectedSkills,
          homework,
          postLessonNotes,
          targetDurationMinutes,
          assessmentEvidence,
          description,
          generalObjective,
          specificObjectives,
          socioemotionalObjectives,
          lessonGoal,
          anticipatedProblems,
          priorKnowledge,
          preTeach,
          peiStudentId,
          peiStudentName,
          peiDiagnosis,
          peiAccommodations,
          didacticSequenceRef,
          docContent,
          updatedAt: Date.now()
        }
        localStorage.setItem('teacher_lesson_studio_draft', JSON.stringify(draft))
      } catch {}
    }, 1500)

    return () => clearTimeout(timer)
  }, [
    topic,
    selectedClassId,
    lessonDate,
    roomSpace,
    selectedMethodology,
    bookTitle,
    unitChapter,
    pages,
    sharedClassIds,
    stages,
    guidingQuestions,
    selectedSkills,
    homework,
    postLessonNotes,
    targetDurationMinutes,
    assessmentEvidence,
    description,
    generalObjective,
    specificObjectives,
    socioemotionalObjectives,
    lessonGoal,
    anticipatedProblems,
    priorKnowledge,
    preTeach,
    peiStudentId,
    peiStudentName,
    peiDiagnosis,
    peiAccommodations,
    didacticSequenceRef,
    docContent
  ])

  // Turma Atual e Matriz BNCC Completa de Língua Inglesa
  const currentClass = useMemo(() => {
    const found = classes.find(c => c.id === selectedClassId)
    if (found) return found
    if (selectedClassId) {
      return {
        id: selectedClassId,
        name: 'Turma',
        schoolId: schools[0]?.id || 'sch_default',
        gradeYear: '9º Fund.'
      }
    }
    return classes[0] || undefined
  }, [classes, selectedClassId, schools])
  const currentSchool = useMemo(() => schools.find(s => s.id === currentClass?.schoolId), [schools, currentClass])
  const allBnccSkills = useMemo(() => getBnccCatalog(), [])

  // Alunos da Turma Atual e Detecção de Alunos com NEE para PEI/PDI
  const classStudents = useMemo(() => {
    if (!selectedClassId) return []
    return students.filter(s => s.classId === selectedClassId)
  }, [students, selectedClassId])

  const neeStudentsInClass = useMemo(() => {
    return classStudents.filter(s => Boolean(s.nee || s.nee_flag))
  }, [classStudents])

  const handleSelectPeiStudent = (studentId: string) => {
    isPlanEditedByUser.current = true
    if (!studentId) {
      setPeiStudentId('')
      setPeiStudentName('')
      setPeiDiagnosis('')
      setPeiAccommodations('')
      return
    }
    const stu = students.find(s => s.id === studentId)
    if (stu) {
      setPeiStudentId(stu.id)
      setPeiStudentName(stu.name)
      const pei = getStudentPei(stu.id)
      const diag = pei?.diagnosis || stu.nee_description || stu.neeDescription || 'Adaptação Curricular (NEE)'
      setPeiDiagnosis(diag)
      const activeAccs = pei?.accommodations?.filter(a => a.isActive).map(a => a.description).join('; ')
      setPeiAccommodations(activeAccs || 'Adaptação pedagógica individualizada ativa')
    }
  }

  // ─── FASE 3: Integração com Sequência Didática ─────────────────────────────
  useEffect(() => {
    const loadSeqs = () => {
      if (currentClass?.name) {
        setAvailableSequences(getDidacticSequences(currentClass.name))
      } else {
        setAvailableSequences(getDidacticSequences())
      }
    }
    loadSeqs()
    const unsubscribe = subscribeToDidacticSequenceUpdates(() => {
      loadSeqs()
    })
    return () => unsubscribe()
  }, [currentClass?.name])

  const selectedSequence = useMemo(() => {
    if (!didacticSequenceRef?.sequenceId) return null
    return availableSequences.find(s => s.id === didacticSequenceRef.sequenceId) || null
  }, [didacticSequenceRef?.sequenceId, availableSequences])

  const sequencePaceResult = useMemo(() => {
    if (!selectedSequence) return null
    return calculateCurricularPace(selectedSequence, lessonDate)
  }, [selectedSequence, lessonDate])

  const handleSelectSequence = (sequenceId: string) => {
    isPlanEditedByUser.current = true
    if (!sequenceId) {
      setDidacticSequenceRef(undefined)
      return
    }
    const seq = availableSequences.find(s => s.id === sequenceId)
    if (seq) {
      const nextSlot = seq.lessons.find(l => l.status !== 'completed') || seq.lessons[0]
      setDidacticSequenceRef({
        sequenceId: seq.id,
        sequenceTitle: seq.title,
        lessonOrder: nextSlot?.order || 1,
        totalLessons: seq.lessons.length
      })
      if (!topic && nextSlot?.title) {
        setTopic(nextSlot.title)
      }
    }
  }

  const handleSelectSequenceSlot = (slotOrder: number) => {
    isPlanEditedByUser.current = true
    if (!selectedSequence) return
    const slot = selectedSequence.lessons.find(l => l.order === slotOrder)
    setDidacticSequenceRef(prev => ({
      sequenceId: selectedSequence.id,
      sequenceTitle: selectedSequence.title,
      lessonOrder: slotOrder,
      totalLessons: selectedSequence.lessons.length
    }))
    if (slot?.title) {
      setTopic(slot.title)
    }
  }

  // Filtro de Série/Ano Escolar (Turma Atual, 6º, 7º, 8º, 9º, Ensino Médio, ou Todas)
  const effectiveBnccGrade = useMemo(() => {
    if (bnccGradeFilter === 'current') return currentClass?.gradeYear || 'all'
    return bnccGradeFilter
  }, [bnccGradeFilter, currentClass])

  const gradeFilteredBnccSkills = useMemo(() => {
    if (!effectiveBnccGrade || effectiveBnccGrade === 'all') return allBnccSkills
    const cleanGrade = effectiveBnccGrade.toLowerCase().replace(/ano|série/g, '').trim()
    return allBnccSkills.filter(s => s.gradeYear.toLowerCase().includes(cleanGrade) || effectiveBnccGrade.toLowerCase().includes(s.gradeYear.toLowerCase()))
  }, [allBnccSkills, effectiveBnccGrade])

  // Filtro por Eixo (Oralidade, Leitura, Escrita, Conhecimentos Linguísticos, Dimensão Intercultural) e Busca
  const filteredBnccSkills = useMemo(() => {
    return gradeFilteredBnccSkills.filter(s => {
      if (bnccAxisFilter !== 'all' && s.axis !== bnccAxisFilter) return false
      if (skillSearch.trim()) {
        const q = skillSearch.toLowerCase()
        return (
          s.code.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          (s.unit && s.unit.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [gradeFilteredBnccSkills, bnccAxisFilter, skillSearch])

  // Alias para retrocompatibilidade
  const availableBnccSkills = gradeFilteredBnccSkills

  // Nível CEFR e Memória Longitudinal Coletiva da Turma
  const [customCefrLevel, setCustomCefrLevel] = useState<string>('')
  const [showClassMemoryDetails, setShowClassMemoryDetails] = useState<boolean>(false)
  const currentCefrLevel = useMemo(() => customCefrLevel || inferCefrLevelForGrade(currentClass?.gradeYear || '8º Fund.'), [customCefrLevel, currentClass])
  const classPedagogicalProfile: ClassPedagogicalProfile = useMemo(() => getClassPedagogicalProfile(currentClass?.name || ''), [currentClass])

  // 10 Inovações Pedagógicas — Memos Computados
  const talkTimeAnalysis: TalkTimeAnalysis = useMemo(() => calculateTalkTimeRatio(stages), [stages])
  const spacedRetrieval: SpacedRetrievalSuggestion | null = useMemo(() => getSpacedRetrievalTopic(currentClass?.name || ''), [currentClass])
  const fertileErrors: FertileErrorChallenge | null = useMemo(() => getFertileErrorsForClass(currentClass?.name || ''), [currentClass])
  const generalCompetencies: InferredCompetencyResult[] = useMemo(() => inferGeneralCompetencies(topic, stages, selectedMethodology), [topic, stages, selectedMethodology])
  const studentCanDoStatements: string[] = useMemo(() => generateStudentCanDoStatements(topic, currentCefrLevel, selectedSkills.map(s => s.code)), [topic, currentCefrLevel, selectedSkills])
  const activeInclusionAccommodations: string[] = useMemo(() => getInclusionAccommodations(selectedInclusionProfiles), [selectedInclusionProfiles])

  // Planos Anteriores da mesma turma
  const classHistoryPlans = useMemo(() => {
    return bankPlans
      .filter(p => p.classId === selectedClassId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [bankPlans, selectedClassId])

  // Habilidades Adiadas da Aula Anterior
  const pendingBacklog = useMemo(() => {
    if (!selectedClassId) return []
    return getClassPostponedSkills(selectedClassId)
  }, [selectedClassId])

  // Resumo e Dicas da Última Aula (Hints de Continuidade)
  const lastLessonSummaryData = useMemo(() => {
    const className = currentClass?.name || selectedClassId || 'Turma'
    try {
      const stored = localStorage.getItem(`teacher_last_lesson_summary_${className.replace(/\s/g,'_')}`)
      if (stored) return JSON.parse(stored)
    } catch {}
    return null
  }, [currentClass, selectedClassId])

  const lastLessonInfo = useMemo(() => {
    const mostRecentPlan = classHistoryPlans[0]
    return {
      topic: lastLessonSummaryData?.topic || mostRecentPlan?.topic,
      date: lastLessonSummaryData?.date || mostRecentPlan?.date,
      homework: lastLessonSummaryData?.homework || mostRecentPlan?.homework,
      notes: lastLessonSummaryData?.summary || mostRecentPlan?.postLessonNotes,
      methodology: mostRecentPlan?.methodology,
      skills: mostRecentPlan?.selectedSkills || []
    }
  }, [classHistoryPlans, lastLessonSummaryData])

  const handleAddReviewWarmup = () => {
    const topicToReview = lastLessonInfo.topic || 'conteúdo da aula anterior'
    const warmupStage: LessonStage = {
      name: 'Warm-up / Revisão da Aula Anterior',
      durationMin: 5,
      teacherAction: `Revisão oral rápida conectando os pontos centrais da aula passada (${topicToReview}) com o tema de hoje`,
      studentAction: 'Participação oral ativa e ativação de vocabulário prévio',
      grouping: 'pairs',
      completed: false
    }
    setStages([warmupStage, ...stages])
    showNotification('Warm-up de revisão (5 min) adicionado no início da aula!')
  }

  const handleAddHomeworkCheck = () => {
    const hw = lastLessonInfo.homework || 'exercícios da aula passada'
    const updatedStages = [...stages]
    if (updatedStages.length > 0) {
      const existing = updatedStages[0].teacherAction
      updatedStages[0].teacherAction = `Checagem e correção do dever da aula anterior (${hw}). ${existing}`
      setStages(updatedStages)
      showNotification('Checagem do dever inserida na 1ª etapa!')
    }
  }

  const showNotification = (msg: string) => {
    toast.success(msg)
  }

  // ─── Análise com IA Rafinha ────────────────────────────────────────────────
  const handleRafinhaAnalysis = () => {
    const className = currentClass?.name || selectedClassId || 'Turma'
    const totalMin = stages.reduce((acc, s) => acc + (s.durationMin || 0), 0)
    const completedStages = stages.filter(s => s.completed).length
    const bloomCoverage = stages.some(s =>
      s.teacherAction?.toLowerCase().includes('anali') ||
      s.studentAction?.toLowerCase().includes('cri') ||
      s.teacherAction?.toLowerCase().includes('avali')
    ) ? 'inclui ordens superiores' : 'maioria recall/compreensão'

    let lastLessonCtx = ''
    try {
      const summary = JSON.parse(localStorage.getItem(`teacher_last_lesson_summary_${className.replace(/\s/g,'_')}`) || 'null')
      if (summary) lastLessonCtx = `\nÚltima aula desta turma foi sobre "${summary.topic}" em ${summary.date}. ${summary.summary}`
    } catch {}

    const prompt = `Analise este plano de aula e dê sugestões práticas em português (máx 150 palavras):

Turma: ${className || selectedClassId || 'Turma'} | Tópico: ${topic} | Duração total: ${totalMin} min
Etapas: ${stages.map(s => `${s.name} (${s.durationMin}min)`).join(' → ')}
Cobertura cognitiva: ${bloomCoverage}${lastLessonCtx}

Verifique: 1) Timing realista? 2) Bloom bem distribuído? 3) Transições claras? 4) Sugestão de melhoria?`

    window.dispatchEvent(new CustomEvent('rafinha:wake'))
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('rafinha:send_text', { detail: prompt }))
    }, 300)
  }

  // Totalizador de Minutos da Aula
  const totalTiming = useMemo(() => stages.reduce((acc, s) => acc + (Number(s.durationMin) || 0), 0), [stages])

  // ─── Alternar Seleção de Habilidade BNCC ──────────────────────────────────
  const toggleSkill = (skill: BnccSkill) => {
    isPlanEditedByUser.current = true
    setSelectedSkills(prev => {
      const exists = prev.some(s => s.code === skill.code)
      if (exists) {
        return prev.filter(s => s.code !== skill.code)
      } else {
        return [...prev, { code: skill.code, desc: skill.description, status: 'planned' }]
      }
    })
  }

  const setSkillStatus = (code: string, status: 'planned' | 'covered' | 'postponed') => {
    isPlanEditedByUser.current = true
    setSelectedSkills(prev => prev.map(s => s.code === code ? { ...s, status } : s))
    if (status === 'postponed') {
      const currentPostponed = getClassPostponedSkills(selectedClassId)
      if (!currentPostponed.includes(code)) {
        saveClassPostponedSkills(selectedClassId, [...currentPostponed, code])
        showNotification(`Habilidade ${code} adiada. Será sugerida na próxima aula da turma.`)
      }
    }
  }

  const importPendingBacklogSkill = (code: string) => {
    isPlanEditedByUser.current = true
    const skillObj = allBnccSkills.find(s => s.code === code) || availableBnccSkills.find(s => s.code === code)
    if (skillObj) {
      setSelectedSkills(prev => {
        if (prev.some(s => s.code === code)) return prev
        return [...prev, { code: skillObj.code, desc: skillObj.description, status: 'planned' }]
      })
    }
    // Remove do backlog
    const updated = pendingBacklog.filter(c => c !== code)
    saveClassPostponedSkills(selectedClassId, updated)
    showNotification(`Habilidade ${code} incluída no plano de hoje!`)
  }

  // ─── Sugestão Manual/Explícita de BNCC ─────────────────────────────────────
  const handleAutoSuggestBncc = () => {
    if (!topic.trim()) {
      toast.warning('Digite o Tópico ou Conteúdo Central primeiro para sugerir habilidades.')
      return
    }
    const inferred = inferBnccSkillsForTopic(topic, currentClass?.gradeYear || '8º Fund.')
    if (inferred.length === 0) {
      toast.info('Nenhuma habilidade específica identificada automaticamente para este tema. Você pode selecionar manualmente abaixo.')
      return
    }
    const newSkills = inferred
      .filter(inf => !selectedSkills.some(s => s.code === inf.code))
      .map(inf => ({
        code: inf.code,
        desc: inf.description,
        status: 'planned' as const,
        isAutoSuggested: true
      }))
    if (newSkills.length > 0) {
      setSelectedSkills(prev => [...prev, ...newSkills])
      toast.success(`${newSkills.length} habilidade(s) BNCC sugerida(s) com base no tema!`)
    } else {
      toast.info('As habilidades mais relevantes para este tema já estão na sua lista.')
    }
  }

  // ─── Geração de Conteúdo e Roteiro com IA ─────────────────────────────────
  const handleGenerateWithAi = async () => {
    if (isGenerating || regeneratingStageIndex !== null) return
    if (!topic.trim()) {
      toast.warning('Digite o Tópico ou Conteúdo Central antes de gerar com IA.')
      return
    }

    setIsGenerating(true)
    try {
      const promptDirective = buildTeacherStylePromptDirective()

      // Auto-sugestão determinística de BNCC se o professor não selecionou manualmente
      let skillsToUse = [...selectedSkills]
      if (skillsToUse.length === 0) {
        const inferred = inferBnccSkillsForTopic(topic, currentClass?.gradeYear || '8º Fund.')
        if (inferred.length > 0) {
          skillsToUse = inferred.map(sk => ({
            code: sk.code,
            desc: sk.description,
            status: 'planned' as const,
            isAutoSuggested: true
          }))
          setSelectedSkills(skillsToUse)
        }
      }

      const bnccPromptString = skillsToUse.length > 0
        ? skillsToUse.map(s => s.isAutoSuggested ? `${s.code} (${s.desc || 'BNCC'} - Sugerida automaticamente)` : `${s.code} (${s.desc || 'BNCC'})`).join(', ')
        : 'Geral'

      // Recuperação de contexto real do livro didático via RAG
      let bookReferenceContent: string | undefined = undefined
      if (bookTitle) {
        try {
          const matchedChunks = searchLibraryContext(topic || description || unitChapter || bookTitle, {
            textbook: bookTitle,
            limit: 6,
            classGroupId: selectedClassId,
            gradeYear: currentClass?.gradeYear
          })
          if (matchedChunks && matchedChunks.length > 0) {
            bookReferenceContent = buildRagPromptContext(matchedChunks, 2000)
          }
        } catch (err) {
          console.warn('[LessonStudio] Falha ao recuperar contexto RAG do livro:', err)
        }
      }

      // Diretiva de coordenação pedagógica dinâmica: Você é um coordenador pedagógico sênior de Ensino de ${activeProfile.name}.
      // Schema JSON por etapa: "targetBnccCode": "EF08LI19"
      const prompt = buildDynamicFrameworkPrompt({
        activeProfileName: activeProfile.name,
        className: currentClass?.name || 'Turma',
        gradeYear: currentClass?.gradeYear || 'Ensino Fundamental',
        topic,
        methodologyId: selectedMethodology,
        targetDurationMinutes,
        bookTitle,
        unitChapter,
        bnccPromptString,
        promptDirective,
        systemPrompt: buildTeacherStyleSystemPrompt(),
        classMemorySnippet: classPedagogicalProfile.promptSnippet,
        cefrLevel: currentCefrLevel,
        clilConfig: isClilActive ? { subjectId: clilSubjectId, contentTopic: clilContentTopic } : undefined,
        thinkingRoutineId: selectedThinkingRoutine || undefined,
        spacedRetrievalHook: spacedRetrieval?.promptHook,
        includeGeneralCompetencies: true,
        l1InterferenceDirectives: getL1InterferenceDirectives(topic, activeProfile.name),
        bookReferenceContent
      })


      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
      })

      const data = await res.json()
      let rawText = ''
      if (typeof data?.reply === 'string') {
        rawText = data.reply
      } else if (typeof data?.content === 'string') {
        rawText = data.content
      } else if (Array.isArray(data?.content)) {
        rawText = data.content.map((c: any) => c.text || c.content || (typeof c === 'string' ? c : '')).join('\n')
      } else if (typeof data === 'string') {
        rawText = data
      }

      let cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim()
      const firstBrace = cleaned.indexOf('{')
      const lastBrace = cleaned.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1) {
        const jsonText = cleaned.substring(firstBrace, lastBrace + 1)
        const parsed = JSON.parse(jsonText)
        if (Array.isArray(parsed.stages)) {
          setStages(parsed.stages.map((stg: any, sIdx: number) => ({
            name: stg.name || '',
            durationMin: Number(stg.durationMin) || 5,
            teacherAction: stg.teacherAction || '',
            studentAction: stg.studentAction || '',
            interactionType: stg.interactionType || (stg.name.toLowerCase().includes('task') || stg.name.toLowerCase().includes('practice') || stg.name.toLowerCase().includes('production') ? 'pair' : 'whole_class'),
            materialReference: stg.materialReference || '',
            grouping: stg.grouping,
            completed: false,
            targetBnccCode: stg.targetBnccCode || '',
            scaffoldingTiers: stg.scaffoldingTiers || generateScaffoldingTiers(topic, stg.name || '', stg.studentAction || ''),
            checkingQuestions: stg.checkingQuestions || generateCheckingQuestions(topic, stg.name || ''),
            thinkingRoutine: sIdx === 0 && selectedThinkingRoutine ? HARVARD_THINKING_ROUTINES.find(r => r.id === selectedThinkingRoutine) : undefined
          })))
        }
        if (Array.isArray(parsed.guidingQuestions)) setGuidingQuestions(parsed.guidingQuestions)
        if (parsed.homework) setHomework(parsed.homework)
        if (parsed.assessmentEvidence) setAssessmentEvidence(parsed.assessmentEvidence)
        if (typeof parsed.description === 'string' && parsed.description.trim()) setDescription(parsed.description)
        if (typeof parsed.generalObjective === 'string' && parsed.generalObjective.trim()) setGeneralObjective(parsed.generalObjective)
        if (typeof parsed.specificObjectives === 'string' && parsed.specificObjectives.trim()) setSpecificObjectives(parsed.specificObjectives)
        if (typeof parsed.socioemotionalObjectives === 'string' && parsed.socioemotionalObjectives.trim()) setSocioemotionalObjectives(parsed.socioemotionalObjectives)
        if (typeof parsed.lessonGoal === 'string' && parsed.lessonGoal.trim()) setLessonGoal(parsed.lessonGoal)
        if (typeof parsed.anticipatedProblems === 'string' && parsed.anticipatedProblems.trim()) setAnticipatedProblems(parsed.anticipatedProblems)
        if (typeof parsed.priorKnowledge === 'string' && parsed.priorKnowledge.trim()) setPriorKnowledge(parsed.priorKnowledge)
        if (typeof parsed.preTeach === 'string' && parsed.preTeach.trim()) setPreTeach(parsed.preTeach)
        showNotification('Roteiro, Objetivos, Perguntas-Guia e Evidências UbD gerados com sucesso!')
      } else {
        toast.error('Não foi possível interpretar a resposta da IA. Verifique as configurações de API ou tente novamente.')
      }
    } catch (err: any) {
      toast.error(`Erro na geração: ${err.message || 'Tente novamente'}`)
    } finally {
      setIsGenerating(false)
    }
  }

  // ─── Regeneração de Etapa Única (Item 4 - Auditoria Visual) ───────────────
  const handleRegenerateStage = async (idx: number) => {
    if (regeneratingStageIndex !== null || isGenerating) return
    const targetStage = stages[idx]
    if (!targetStage) return
    setRegeneratingStageIndex(idx)
    setStageBackupHistory(prev => ({ ...prev, [idx]: { ...targetStage } }))

    try {
      const otherStagesSummary = stages
        .map((s, i) => i === idx 
          ? `[ETAPA ATUAL A REGENERAR: ${s.name} (${s.durationMin} min)]`
          : `Etapa ${i + 1}: ${s.name} (${s.durationMin} min) - Prof: ${s.teacherAction} - Aluno: ${s.studentAction}`)
        .join('\n')

      const stagePrompt = `Você é um assistente pedagógico especializado em planejamento de aulas.
O professor está desenvolvendo uma aula sobre o tema: "${topic || 'Tópico Geral'}".
Disciplina: ${activeProfile.name}.
Ano/Série: ${currentClass?.gradeYear || 'Geral'}.
Metodologia/Framework: ${selectedMethodology}.
Habilidades BNCC selecionadas: ${selectedSkills.map(s => `${s.code} - ${s.desc}`).join('; ') || 'Nenhuma selecionada'}.

Estrutura das etapas da aula:
${otherStagesSummary}

REQUISITO OBRIGATÓRIO:
Regenere APENAS a etapa atual "${targetStage.name}" (${targetStage.durationMin} min).
Proponha ações pedagógicas inovadoras, ativas e estimulantes para o professor e para os alunos, mantendo a coerência com as etapas anteriores e posteriores.

Responda ESTRITAMENTE em formato JSON com o seguinte formato:
{
  "name": "${targetStage.name}",
  "durationMin": ${targetStage.durationMin},
  "teacherAction": "Ação detalhada do professor...",
  "studentAction": "Ação detalhada do aluno...",
  "targetBnccCode": "${targetStage.targetBnccCode || ''}"
}`

      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: stagePrompt }] })
      })

      const data = await res.json()
      let rawText = ''
      if (typeof data?.reply === 'string') rawText = data.reply
      else if (typeof data?.content === 'string') rawText = data.content
      else if (Array.isArray(data?.content)) {
        rawText = data.content.map((c: any) => c.text || c.content || (typeof c === 'string' ? c : '')).join('\n')
      } else if (typeof data === 'string') rawText = data

      const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim()
      const firstBrace = cleaned.indexOf('{')
      const lastBrace = cleaned.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1) {
        const jsonText = cleaned.substring(firstBrace, lastBrace + 1)
        const parsed = JSON.parse(jsonText)
        const newName = parsed.name || targetStage.name
        const newTeacherAction = parsed.teacherAction || targetStage.teacherAction
        const newStudentAction = parsed.studentAction || targetStage.studentAction
        const newBncc = parsed.targetBnccCode || targetStage.targetBnccCode || ''
        const newDuration = Number(parsed.durationMin) || targetStage.durationMin

        setStages(prev => {
          const updated = [...prev]
          if (!updated[idx]) return prev
          updated[idx] = {
            ...updated[idx],
            name: newName,
            durationMin: newDuration,
            teacherAction: newTeacherAction,
            studentAction: newStudentAction,
            targetBnccCode: newBncc,
            scaffoldingTiers: generateScaffoldingTiers(topic, newName, newStudentAction),
            checkingQuestions: generateCheckingQuestions(topic, newName)
          }
          return updated
        })
        toast.success(`Etapa "${newName}" regenerada com sucesso!`)
      } else {
        toast.error('Não foi possível interpretar a resposta da IA para esta etapa.')
      }
    } catch (err: any) {
      toast.error(`Erro ao regenerar etapa: ${err.message || 'Tente novamente'}`)
    } finally {
      setRegeneratingStageIndex(null)
    }
  }

  // ─── Equilíbrio de Fala Estimado (Talk Time Ratio) ─────────────────────────
  const calculatedSpeechBalance = useMemo(() => {
    const totalMin = stages.reduce((acc, s) => acc + (s.durationMin || 0), 0)
    if (totalMin === 0) {
      return { teacherPercent: 50, studentPercent: 40, silencePercent: 10, totalMin: 0, isHighTeacherTalk: false }
    }

    let weightedTeacher = 0
    let weightedStudent = 0
    let weightedSilence = 0

    stages.forEach(stage => {
      const duration = stage.durationMin || 0
      let tPct = 50
      let sPct = 40
      let silPct = 10

      if (stage.speechBalance) {
        tPct = stage.speechBalance.teacherPercent ?? 50
        sPct = stage.speechBalance.studentPercent ?? 40
        silPct = stage.speechBalance.silencePercent ?? 10
      } else {
        switch (stage.interactionType) {
          case 'whole_class':
            tPct = 65; sPct = 25; silPct = 10; break
          case 'pair':
          case 'group':
            tPct = 20; sPct = 70; silPct = 10; break
          case 'individual':
            tPct = 10; sPct = 20; silPct = 70; break
          case 'teacher_student':
            tPct = 50; sPct = 45; silPct = 5; break
          default:
            tPct = 50; sPct = 40; silPct = 10; break
        }
      }

      weightedTeacher += duration * tPct
      weightedStudent += duration * sPct
      weightedSilence += duration * silPct
    })

    const teacherPercent = Math.round(weightedTeacher / totalMin)
    const studentPercent = Math.round(weightedStudent / totalMin)
    const silencePercent = Math.max(0, 100 - teacherPercent - studentPercent)

    return {
      teacherPercent,
      studentPercent,
      silencePercent,
      totalMin,
      isHighTeacherTalk: teacherPercent > 75
    }
  }, [stages])

  // ─── Sugestão Opcional de Descrição Curta (Manual-First) ───────────────────
  const handleSuggestShortDescription = async () => {
    if (!topic) {
      toast.info('Defina o tópico da aula primeiro para gerar a descrição curta.')
      return
    }
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Escreva uma descrição curta de 1 a 2 frases para a aula de ${activeProfile.name} sobre "${topic}" para a turma ${currentClass?.name || 'Geral'}. Responda em português direto e claro.`
          }]
        })
      })
      const data = await res.json()
      const reply = (typeof data?.reply === 'string' ? data.reply : data?.content || '').trim()
      if (reply) {
        isPlanEditedByUser.current = true
        setShortDescription(reply.replace(/^"|"$/g, ''))
        toast.success('✨ Descrição curta sugerida pela IA! Revise antes de salvar.')
      } else {
        throw new Error('Resposta vazia')
      }
    } catch {
      isPlanEditedByUser.current = true
      setShortDescription(`Aula de ${activeProfile.name} abordando ${topic} com foco em aplicação prática e engajamento.`)
      toast.success('✨ Descrição curta gerada!')
    }
  }

  // ─── Sugestão Opcional de Materiais (Manual-First) ─────────────────────────
  const handleSuggestMaterials = async () => {
    if (!topic && stages.length === 0) {
      toast.info('Defina o tópico ou etapas antes de sugerir materiais.')
      return
    }
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Liste de 3 a 5 materiais necessários para uma aula de ${activeProfile.name} sobre "${topic}". Retorne apenas os nomes dos materiais separados por vírgula.`
          }]
        })
      })
      const data = await res.json()
      const reply = (typeof data?.reply === 'string' ? data.reply : data?.content || '').trim()
      const suggested = reply.split(/[,;\n]+/).map((s: string) => s.replace(/^[-*•\d\.\s]+/, '').trim()).filter((s: string) => s.length > 2)
      if (suggested.length > 0) {
        isPlanEditedByUser.current = true
        setMaterials(prev => Array.from(new Set([...prev, ...suggested])))
        toast.success('✨ Materiais sugeridos pela IA adicionados!')
      } else {
        throw new Error('Sem materiais')
      }
    } catch {
      isPlanEditedByUser.current = true
      const fallback = ['Quadro e Marcador', 'Folha de Atividades Impressa', 'Projetor / DataShow']
      setMaterials(prev => Array.from(new Set([...prev, ...fallback])))
      toast.success('✨ Materiais sugeridos adicionados!')
    }
  }

  // ─── Salvamento 1: Salvar no Calendário / Agenda ──────────────────────────
  const handleSaveToCalendar = () => {
    const activeClass = currentClass || {
      id: selectedClassId || `cls_${Date.now()}`,
      name: 'Turma Geral',
      schoolId: currentSchool?.id || 'sch_default'
    }
    const calendarTask = {
      id: `task_${Date.now()}`,
      title: `Aula de ${activeProfile.nameShort || activeProfile.name}: ${topic || 'Planejamento'} (${activeClass.name})`,
      date: lessonDate,
      time: '08:00',
      classId: activeClass.id,
      className: activeClass.name,
      room: roomSpace,
      completed: false
    }

    try {
      const existing = JSON.parse(localStorage.getItem('teacher_calendar_tasks') || '[]')
      const updated = [calendarTask, ...existing]
      localStorage.setItem('teacher_calendar_tasks', JSON.stringify(updated))
      window.dispatchEvent(new Event('storage'))
      showNotification('📅 Aula agendada com sucesso no Calendário!')
    } catch {}
  }

  // ─── Salvamento 2: Salvar no Banco de Planejamento (Repositório) ──────────
  const handleSaveToBank = () => {
    const activeClass = currentClass || {
      id: selectedClassId || `cls_${Date.now()}`,
      name: 'Turma Geral',
      schoolId: currentSchool?.id || 'sch_default',
      subject: activeProfile.name
    }
    const newPlan: LessonPlanDocument = {
      id: planId || `plan_${Date.now()}`,
      date: lessonDate,
      classId: activeClass.id,
      className: activeClass.name,
      schoolName: currentSchool?.name || 'Escola',
      subject: activeClass.subject || activeProfile.name,
      topic: topic || 'Plano de Aula Sem Título',
      description,
      subjectCoverageArea,
      shortDescription,
      predominantInteraction,
      materials,
      speechBalance: {
        teacherPercent: calculatedSpeechBalance.teacherPercent,
        studentPercent: calculatedSpeechBalance.studentPercent,
        silencePercent: calculatedSpeechBalance.silencePercent
      },
      generalObjective,
      specificObjectives,
      socioemotionalObjectives,
      lessonGoal,
      anticipatedProblems,
      priorKnowledge,
      preTeach,
      peiStudentId,
      peiStudentName,
      peiDiagnosis,
      peiAccommodations,
      didacticSequenceRef,
      docContent,
      roomSpace,
      selectedSkills,
      methodology: selectedMethodology,
      referenceMaterial: { bookTitle, unit: unitChapter, pages, sharedClassIds },
      stages,
      guidingQuestions,
      homework,
      postLessonNotes,
      targetDurationMinutes,
      assessmentEvidence,
      savedInBank: true,
      createdAt: Date.now()
    }

    const updated = [newPlan, ...bankPlans.filter(p => p.id !== newPlan.id)]
    setBankPlans(updated)
    try {
      localStorage.setItem('teacher_lesson_plans_bank', JSON.stringify(updated))
      localStorage.setItem(`teacher_last_lesson_summary_${currentClass.name.replace(/\s/g, '_')}`, JSON.stringify({
        date: lessonDate,
        topic: topic || 'Plano de Aula',
        summary: postLessonNotes || `Aula sobre ${topic} (${selectedMethodology.toUpperCase()})`,
        homework: homework
      }))
      window.dispatchEvent(new Event('storage'))

      // Sincroniza com a Sequência Didática vinculada (Fase 3)
      if (didacticSequenceRef?.sequenceId && didacticSequenceRef?.lessonOrder) {
        linkLessonPlanToSequence(
          didacticSequenceRef.sequenceId,
          didacticSequenceRef.lessonOrder,
          newPlan.id,
          newPlan.topic,
          newPlan.date
        )
      }

      // Sincronização em background no Supabase (Tier 2) se configurado
      const cfg = getSupabaseUrlAndKey()
      if (cfg) {
        fetch(`${cfg.url}/rest/v1/lesson_plans`, {
          method: 'POST',
          headers: {
            'apikey': cfg.anonKey,
            'Authorization': `Bearer ${cfg.anonKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({
            id: newPlan.id,
            title: newPlan.topic,
            topic: newPlan.topic,
            class_id: newPlan.classId,
            class_name: newPlan.className,
            school_name: newPlan.schoolName,
            subject: newPlan.subject,
            methodology: newPlan.methodology,
            content: newPlan,
            stages: newPlan.stages,
            created_at: new Date(newPlan.createdAt).toISOString()
          })
        }).catch(() => {})
      }

      // Sincronização bidirecional com teacher_calendar_tasks (Fase 4)
      try {
        const rawTasks = localStorage.getItem('teacher_calendar_tasks')
        if (rawTasks) {
          const tasks = JSON.parse(rawTasks)
          if (Array.isArray(tasks)) {
            const existingTaskIdx = tasks.findIndex((t: any) =>
              t.planId === newPlan.id || (t.classId === newPlan.classId && t.date === newPlan.date)
            )
            if (existingTaskIdx >= 0) {
              tasks[existingTaskIdx] = {
                ...tasks[existingTaskIdx],
                title: `Aula de ${activeProfile.nameShort || activeProfile.name}: ${newPlan.topic} (${activeClass.name})`,
                date: newPlan.date,
                planId: newPlan.id,
                description: newPlan.postLessonNotes || tasks[existingTaskIdx].description
              }
              localStorage.setItem('teacher_calendar_tasks', JSON.stringify(tasks))
            }
          }
        }
      } catch {}

      // Sincronização canônica e referencial com o calendário de tarefas
      syncLessonPlanToCalendar(newPlan)

      // Atualiza o perfil adaptativo do professor com proteção contra falso positivo (tempo mínimo de 15s de tela ou edição explícita)
      const reviewDurationSec = (Date.now() - planSessionStartTime.current) / 1000
      if (isPlanEditedByUser.current || reviewDurationSec >= 15) {
        updateTeacherProfileFromLessonPlan({
          methodology: selectedMethodology,
          timingTotal: totalTiming,
          stagesCount: stages.length,
          hasHomework: Boolean(homework.trim())
        })
      }
      showNotification('💾 Plano salvo com sucesso no Banco de Planejamento!')
    } catch {}
  }

  // ─── Salvamento 3: Salvar em Ambos (Calendário + Banco de Planejamento) ──
  const handleSaveBoth = () => {
    handleSaveToCalendar()
    handleSaveToBank()
    showNotification('✨ Plano salvo no Calendário e no Banco de Planejamento com sucesso!')
  }

  // ─── FASE 4: Manipuladores de Edição Inline no Banco de Planos ────────────
  const handleStartInlineEdit = (plan: LessonPlanDocument) => {
    setInlineEditingPlanId(plan.id)
    setInlineTopic(plan.topic || '')
    setInlineDate(plan.date || '')
    setInlineRoom(plan.roomSpace || 'Sala de Aula')
    setInlineHomework(plan.homework || '')
    setInlineNotes(plan.postLessonNotes || '')
  }

  const handleSaveInlineEdit = (planId: string) => {
    const updated = bankPlans.map(p => {
      if (p.id === planId) {
        return {
          ...p,
          topic: inlineTopic.trim() || p.topic,
          date: inlineDate || p.date,
          roomSpace: inlineRoom || p.roomSpace,
          homework: inlineHomework,
          postLessonNotes: inlineNotes
        }
      }
      return p
    })
    setBankPlans(updated)
    try {
      localStorage.setItem('teacher_lesson_plans_bank', JSON.stringify(updated))

      // Sincroniza bidirecionalmente com o Calendário
      const rawTasks = localStorage.getItem('teacher_calendar_tasks')
      if (rawTasks) {
        const tasks = JSON.parse(rawTasks)
        const targetPlan = updated.find(p => p.id === planId)
        if (targetPlan && Array.isArray(tasks)) {
          const syncedTasks = tasks.map((t: any) => {
            if (t.planId === planId || (t.classId === targetPlan.classId && t.date === targetPlan.date)) {
              return {
                ...t,
                title: `Aula: ${targetPlan.topic}`,
                date: targetPlan.date,
                description: targetPlan.postLessonNotes || t.description
              }
            }
            return t
          })
          localStorage.setItem('teacher_calendar_tasks', JSON.stringify(syncedTasks))
        }
      }
      window.dispatchEvent(new Event('storage'))

      // Sincroniza com a Sequência Didática vinculada (Fase 3)
      const targetPlan = updated.find(p => p.id === planId)
      if (targetPlan?.didacticSequenceRef?.sequenceId && targetPlan?.didacticSequenceRef?.lessonOrder) {
        linkLessonPlanToSequence(
          targetPlan.didacticSequenceRef.sequenceId,
          targetPlan.didacticSequenceRef.lessonOrder,
          planId,
          targetPlan.topic,
          targetPlan.date
        )
      }

      toast.success('Plano atualizado com sucesso no banco!')
    } catch {}
    setInlineEditingPlanId(null)
  }

  // ─── Geração do Pacote de Aula em 1 Clique (Prioridade 3) ──────────────────
  const handleGenerateLessonPackage = async () => {
    if (isGeneratingPackage) return
    if (!topic.trim()) {
      toast.warning('Defina o tópico da aula antes de gerar o pacote.')
      return
    }
    if (stages.length === 0) {
      toast.warning('Gere primeiro o roteiro da aula para compor o pacote.')
      return
    }

    setIsGeneratingPackage(true)
    setPackageProgressStep('1/2 Gerando 5 Questões e Comunicado em paralelo...')

    try {
      // 1. Prompts para Questões e Comunicado aos Pais
      const qPrompt = buildPackageQuestionsPrompt({
        topic,
        className: currentClass?.name || 'Turma',
        gradeYear: currentClass?.gradeYear || '8º Fund.',
        stages,
        assessmentEvidence,
        activeProfileName: activeProfile.name,
        systemPrompt: buildTeacherStyleSystemPrompt()
      })

      const commPrompt = buildPackageParentCommsPrompt({
        topic,
        className: currentClass?.name || 'Turma',
        gradeYear: currentClass?.gradeYear || '8º Fund.',
        assessmentEvidence,
        homework,
        tone: 'acolhedor',
        activeProfileName: activeProfile.name
      })

      // Execução paralela com Promise.all (otimização de latência)
      const [qRes, cRes] = await Promise.all([
        fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: qPrompt }] })
        }),
        fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: commPrompt }] })
        })
      ])

      setPackageProgressStep('2/2 Estruturando Pacote e Folha Formativa...')

      const qData = await qRes.json()
      let wObj: any = null
      if (Array.isArray(qData?.content)) {
        const toolUseItem = qData.content.find((c: any) => c.type === 'tool_use' && c.input)
        if (toolUseItem) {
          wObj = toolUseItem.input
        }
      }
      if (!wObj) {
        let qRaw = typeof qData?.reply === 'string' ? qData.reply : (Array.isArray(qData?.content) ? qData.content.map((c: any) => c.text || '').join('\n') : qData?.content || '')
        let qCleaned = qRaw.replace(/```json/gi, '').replace(/```/g, '').trim()
        const qs = qCleaned.indexOf('{')
        const qe = qCleaned.lastIndexOf('}')
        if (qs !== -1 && qe !== -1) {
          try {
            wObj = JSON.parse(qCleaned.substring(qs, qe + 1))
          } catch {}
        }
      }

      let parsedWorksheet: PackageWorksheet = {
        title: `5 Questões de Fixação: ${topic}`,
        targetLevel: currentClass?.gradeYear || '8º Fund.',
        summary: `Questões formativas conectadas às etapas da aula de ${topic}`,
        questions: []
      }

      if (wObj) {
        parsedWorksheet = {
          title: wObj.title || parsedWorksheet.title,
          targetLevel: currentClass?.gradeYear || '8º Fund.',
          summary: wObj.summary || parsedWorksheet.summary,
          questions: Array.isArray(wObj.questions) ? wObj.questions.map((q: any, i: number) => ({
            id: `pkg_q_${i + 1}`,
            number: q.number || i + 1,
            stem: q.stem || `Questão ${i + 1}`,
            options: q.options || [],
            answerKey: q.answerKey || '',
            difficulty: q.difficulty || (i < 2 ? 'Fácil' : i < 4 ? 'Médio' : 'Desafio'),
            pedagogicalObjective: q.pedagogicalObjective || ''
          })) : []
        }
      }

      const cData = await cRes.json()
      let cObj: any = null
      if (Array.isArray(cData?.content)) {
        const toolUseItem = cData.content.find((c: any) => (c.type === 'tool_use' || c.name === 'create_communication') && c.input)
        if (toolUseItem) {
          cObj = toolUseItem.input
        }
      }
      if (!cObj) {
        let cRaw = typeof cData?.reply === 'string' ? cData.reply : (Array.isArray(cData?.content) ? cData.content.map((c: any) => c.text || '').join('\n') : cData?.content || '')
        let cCleaned = cRaw.replace(/```json/gi, '').replace(/```/g, '').trim()
        const cs = cCleaned.indexOf('{')
        const ce = cCleaned.lastIndexOf('}')
        if (cs !== -1 && ce !== -1) {
          try {
            cObj = JSON.parse(cCleaned.substring(cs, ce + 1))
          } catch {}
        }
      }

      let parsedComms: PackageParentCommunication = {
        title: cObj?.title || `Comunicado aos Pais — ${topic}`,
        studentOrClassRef: currentClass?.name || 'Turma',
        draftMessage: cObj?.content || cObj?.draftMessage || `Queridas famílias!\n\nHoje trabalhamos com a turma ${currentClass?.name || ''} o tema "${topic}". As crianças demonstraram grande entusiasmo e participação!\n\nPara apoiar em casa, conversem com seu filho(a) sobre as experiências compartilhadas hoje.\n\nCom carinho,\nProfessora`,
        tone: cObj?.tone || 'acolhedor',
        status: 'draft',
        safeNotice: 'Rascunho seguro — aguarda aprovação manual da professora',
        generatedAt: Date.now()
      }

      // 3. Monta o pacote de aula
      const pkgId = `pkg_${Date.now()}`
      const newPackage: LessonPackage = {
        id: pkgId,
        createdAt: new Date().toISOString(),
        topic,
        className: currentClass?.name || 'Turma',
        gradeYear: currentClass?.gradeYear || 'Ensino Fundamental',
        methodologyId: selectedMethodology,
        methodologyName: METHODOLOGY_PRESETS.find(m => m.id === selectedMethodology)?.name || selectedMethodology,
        plan: {
          topic,
          durationMinutes: targetDurationMinutes,
          guidingQuestions,
          assessmentEvidence,
          stages,
          homework
        },
        worksheet: parsedWorksheet,
        parentCommunication: parsedComms
      }

      // 4. Persiste no LocalStorage e atualiza prefills cruzados
      saveLessonPackage(newPackage)
      setGeneratedPackage(newPackage)
      setShowPackageModal(true)
      toast.success('📦 Pacote de Aula gerado com sucesso! Revise os 3 itens antes de usar.')
    } catch (err: any) {
      toast.error(`Falha ao gerar pacote da aula: ${err.message || 'Tente novamente'}`)
    } finally {
      setIsGeneratingPackage(false)
      setPackageProgressStep('')
    }
  }

  // ─── Exportações ─────────────────────────────────────────────────────────
  // ─── Exportações & Folha de Planejamento Limpa ────────────────────────────
  const generatePlanMarkdown = () => {
    return `
# PLANO DE AULA: ${topic.toUpperCase() || activeProfile.name.toUpperCase()}

**Disciplina:** ${activeProfile.name} &bull; **Escola:** ${currentSchool?.name || 'Escola'} &bull; **Turma:** ${currentClass?.name || 'Turma'} (${currentClass?.gradeYear || '9º Ano'})
**Duração:** Planejada: ${targetDurationMinutes} min (Total Roteiro: ${totalTiming} min) &bull; **Data:** ${new Date(lessonDate).toLocaleDateString('pt-BR')} &bull; **Espaço Utilizado:** ${roomSpace}
**Metodologia:** ${METHODOLOGY_PRESETS.find(m => m.id === selectedMethodology)?.name || 'TBLT'}
${bookTitle ? `**Material Didático:** ${bookTitle} ${unitChapter ? `(${unitChapter})` : ''} ${pages ? `[${pages}]` : ''}` : ''}
${peiStudentName ? `**Adaptação Curricular Individual (PDI/PEI):** Aluno(a) ${peiStudentName} [${peiDiagnosis || 'NEE'}] — ${peiAccommodations || 'Adaptação ativa'}` : ''}
${didacticSequenceRef?.sequenceTitle ? `**Sequência Didática:** Aula ${didacticSequenceRef.lessonOrder || 1} de ${didacticSequenceRef.totalLessons || 'N'} (${didacticSequenceRef.sequenceTitle})` : ''}

${description ? `---

## Descrição da Aula
${description}
` : ''}

${(generalObjective || specificObjectives || socioemotionalObjectives) ? `---

## Objetivos de Aprendizagem
${generalObjective ? `### Objetivo Geral\n${generalObjective}\n` : ''}
${specificObjectives ? `### Objetivos Específicos\n${specificObjectives}\n` : ''}
${socioemotionalObjectives ? `### Objetivos Socioemocionais / Pessoais\n${socioemotionalObjectives}\n` : ''}
` : ''}

${lessonGoal ? `---

## Meta da Aula (Critério de Sucesso)
${lessonGoal}
` : ''}

${(priorKnowledge || anticipatedProblems) ? `---

## Diagnóstico e Pré-Requisitos
${priorKnowledge ? `### Conhecimento Prévio ("O que eles já sabem")\n${priorKnowledge}\n` : ''}
${anticipatedProblems ? `### Problemas Antecipados & Armadilhas Prováveis\n${anticipatedProblems}\n` : ''}
` : ''}

${preTeach ? `---

## Vocabulário & Conceitos Prévios (Pre-teach)
${preTeach}
` : ''}

${assessmentEvidence ? `---

## Evidências de Avaliação (UbD — Understanding by Design)
${assessmentEvidence}
` : ''}

---

## Competências e Habilidades BNCC
${selectedSkills.length > 0 ? selectedSkills.map(s => `- **[${s.code}]** ${s.desc}`).join('\n') : '- Nenhuma habilidade específica vinculada.'}

---

## Perguntas-Guia da Aula
${guidingQuestions.filter(q => q.trim()).map(q => `- *${q}*`).join('\n')}

---

## Roteiro da Aula e Cronograma (${totalTiming} min)
| Etapa | Duração | Dinâmica | Ref. Material | Ação do Professor | Ação do Aluno |
| :--- | :--- | :--- | :--- | :--- | :--- |
${stages.map(s => `| **${s.name}** | ${s.durationMin} min | ${s.interactionType === 'pair' ? 'Dupla' : s.interactionType === 'group' ? 'Grupo' : s.interactionType === 'individual' ? 'Individual' : s.interactionType === 'teacher_student' ? 'Prof-Aluno' : 'Turma Toda'} | ${s.materialReference || '—'} | ${s.teacherAction} | ${s.studentAction} |`).join('\n')}

${stages.some(s => (s.scaffoldingTiers && (s.scaffoldingTiers.tier1Support || s.scaffoldingTiers.tier3Extension)) || (s.checkingQuestions && s.checkingQuestions.ccqs && s.checkingQuestions.ccqs.length > 0)) ? `
---

## Andaimes Pedagógicos & Perguntas de Checagem (CCQs)
${stages.map(s => {
  const parts = []
  if (s.scaffoldingTiers?.tier1Support || s.scaffoldingTiers?.tier3Extension) {
    parts.push(`- **${s.name} (Andaimes UDL):** Apoio: ${s.scaffoldingTiers.tier1Support || '—'} | Desafio: ${s.scaffoldingTiers.tier3Extension || '—'}`)
  }
  if (s.checkingQuestions?.ccqs && s.checkingQuestions.ccqs.length > 0) {
    parts.push(`- **${s.name} (CCQs):** ` + s.checkingQuestions.ccqs.map(c => `*${c.question}* (R: ${c.expectedAnswer})`).join('; '))
  }
  return parts.join('\n')
}).filter(Boolean).join('\n')}
` : ''}

---

## Tarefa de Casa (Homework)
${homework || 'Sem tarefa de casa atribuída.'}

${postLessonNotes ? `---

## Observações & Reflexão Pedagógica
${postLessonNotes}
` : ''}
`
  }

  const handleExportPdf = () => {
    exportToPdf({
      schoolName: currentSchool?.name || 'ESCOLA DE ENSINO BÁSICO',
      teacherName: 'Professor(a)',
      className: currentClass?.name || 'Turma',
      date: new Date(lessonDate).toLocaleDateString('pt-BR'),
      title: `PLANO DE AULA — ${topic.toUpperCase() || 'LÍNGUA INGLESA'}`,
      content: docContent || generatePlanMarkdown()
    })
  }

  const handleExportWord = () => {
    exportToWord({
      schoolName: currentSchool?.name || 'ESCOLA DE ENSINO BÁSICO',
      teacherName: 'Professor(a)',
      className: currentClass?.name || 'Turma',
      date: new Date(lessonDate).toLocaleDateString('pt-BR'),
      title: `PLANO DE AULA — ${topic.toUpperCase() || 'LÍNGUA INGLESA'}`,
      content: docContent || generatePlanMarkdown()
    })
  }

  const handleExportExcel = () => {
    exportToExcel({
      filename: `Plano_Aula_${currentClass?.name || 'Turma'}_${lessonDate}`,
      headers: ['Etapa', 'Duração (min)', 'Ação do Professor', 'Ação do Aluno', 'Status'],
      rows: stages.map(s => [s.name, s.durationMin, s.teacherAction, s.studentAction, s.completed ? 'Concluído' : 'Pendente'])
    })
    showNotification('📊 Cronograma da aula exportado para Excel (.csv)!')
  }

  const handleCopyCleanText = () => {
    navigator.clipboard.writeText(generatePlanMarkdown())
    showNotification('📋 Texto formatado do plano copiado para a área de transferência!')
  }

  const handleQuickCreateClass = () => {
    const name = window.prompt('Digite o nome da nova turma (ex: 6º Ano A, 2º EM B):')
    if (!name || !name.trim()) return

    const gradeYear = window.prompt('Digite a série/ano (ex: 6º Fund., 2º EM):', name.includes('EM') ? '2º EM' : '6º Fund.') || 'Ensino Fundamental'
    const newClass: ClassRecord = {
      id: `cls_${Date.now()}`,
      name: name.trim(),
      schoolId: currentSchool?.id || 'sch_default',
      subject: activeProfile.name,
      gradeYear: gradeYear.trim()
    }
    const updated = saveOrUpdateClass(newClass)
    setClasses(updated)
    setSelectedClassId(newClass.id)
    toast.success(`Turma "${newClass.name}" cadastrada com sucesso!`)
  }

  return (
    <div style={{ padding: '32px 48px', minHeight: '100%', boxSizing: 'border-box', background: '#fdf8f2', maxWidth: 1440, margin: '0 auto' }}>
      
      {/* ─── NAVEGAÇÃO DE ESCOPO DO PLANEJAMENTO (AULA | SEQUÊNCIA | PEI | PDI | PROJETOS) ─── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid #ede8dc', paddingBottom: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setPlanningScope('aula')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: RADIUS.md,
            border: 'none',
            background: planningScope === 'aula' ? '#8b5e3c' : '#fff',
            color: planningScope === 'aula' ? '#fff' : COLOR.paperInk,
            fontWeight: 800,
            fontSize: 13,
            cursor: 'pointer',
            boxShadow: planningScope === 'aula' ? '0 2px 8px rgba(139, 94, 60, 0.25)' : 'none'
          }}
        >
          <i className="ti ti-chalkboard" /> Aula
        </button>

        <button
          type="button"
          onClick={() => setPlanningScope('sequencia')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: RADIUS.md,
            border: 'none',
            background: planningScope === 'sequencia' ? '#8b5e3c' : '#fff',
            color: planningScope === 'sequencia' ? '#fff' : COLOR.paperInk,
            fontWeight: 800,
            fontSize: 13,
            cursor: 'pointer',
            boxShadow: planningScope === 'sequencia' ? '0 2px 8px rgba(139, 94, 60, 0.25)' : 'none'
          }}
        >
          <i className="ti ti-layers-linked" /> Sequência Didática
        </button>

        <button
          type="button"
          onClick={() => setPlanningScope('pei')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: RADIUS.md,
            border: 'none',
            background: planningScope === 'pei' ? '#6d28d9' : '#fff',
            color: planningScope === 'pei' ? '#fff' : COLOR.paperInk,
            fontWeight: 800,
            fontSize: 13,
            cursor: 'pointer',
            boxShadow: planningScope === 'pei' ? '0 2px 8px rgba(109, 40, 217, 0.25)' : 'none'
          }}
        >
          <i className="ti ti-accessible" /> PEI (Individualizado)
        </button>

        <button
          type="button"
          onClick={() => setPlanningScope('pdi')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: RADIUS.md,
            border: 'none',
            background: planningScope === 'pdi' ? '#0284c7' : '#fff',
            color: planningScope === 'pdi' ? '#fff' : COLOR.paperInk,
            fontWeight: 800,
            fontSize: 13,
            cursor: 'pointer',
            boxShadow: planningScope === 'pdi' ? '0 2px 8px rgba(2, 132, 199, 0.25)' : 'none'
          }}
        >
          <i className="ti ti-chart-arrows" /> PDI (Desenvolvimento)
        </button>

        <button
          type="button"
          onClick={() => setPlanningScope('projetos')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: RADIUS.md,
            border: 'none',
            background: planningScope === 'projetos' ? '#166534' : '#fff',
            color: planningScope === 'projetos' ? '#fff' : COLOR.paperInk,
            fontWeight: 800,
            fontSize: 13,
            cursor: 'pointer',
            boxShadow: planningScope === 'projetos' ? '0 2px 8px rgba(22, 101, 52, 0.25)' : 'none'
          }}
        >
          <i className="ti ti-sparkles" /> Projetos (PBL)
        </button>
      </div>

      {planningScope === 'sequencia' && <DidacticSequence />}
      {planningScope === 'pei' && <PeiTab />}
      {planningScope === 'pdi' && <PdiTab />}
      {planningScope === 'projetos' && <ProjectsTab />}

      {planningScope === 'aula' && (
        <>
          {/* ─── HEADER & TABS ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#8b5e3c', color: '#fff', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
              DIDACTIC SEQUENCE 2.0
            </span>
            <span style={{ fontSize: 13, color: '#7a6552' }}>Ecossistema de Planejamento Docente</span>
          </div>
          <h1 style={{ margin: '4px 0 0 0', fontSize: 26, fontFamily: 'Fraunces, Georgia, serif', color: '#2c1a0e' }}>
            Planejamento
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 6, background: '#fffcf8', padding: 4, borderRadius: RADIUS.lg, border: '1px solid #d5c0b0' }}>
          <button
            onClick={() => setActiveTab('editor')}
            style={{ padding: '8px 16px', borderRadius: RADIUS.md, border: 'none', background: activeTab === 'editor' ? '#8b5e3c' : 'transparent', color: activeTab === 'editor' ? '#fff' : '#7a5c42', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
          >
            <i className="ti ti-edit"></i> Edição do Plano
          </button>
          <button
            onClick={() => {
              if (!docContent) {
                const md = generatePlanMarkdown()
                const html = formatMarkdownToHtml(md)
                setDocContent(html)
              }
              setActiveTab('doc')
            }}
            style={{ padding: '8px 16px', borderRadius: RADIUS.md, border: 'none', background: activeTab === 'doc' ? '#8b5e3c' : 'transparent', color: activeTab === 'doc' ? '#fff' : '#7a5c42', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
          >
            <i className="ti ti-file-pencil"></i> Editor Doc (Word)
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            style={{ padding: '8px 16px', borderRadius: RADIUS.md, border: 'none', background: activeTab === 'preview' ? '#8b5e3c' : 'transparent', color: activeTab === 'preview' ? '#fff' : '#7a5c42', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
          >
            <i className="ti ti-file-text"></i> Folha de Planejamento (Limpo)
          </button>
          <button
            onClick={() => setActiveTab('bank')}
            style={{ padding: '8px 16px', borderRadius: RADIUS.md, border: 'none', background: activeTab === 'bank' ? '#8b5e3c' : 'transparent', color: activeTab === 'bank' ? '#fff' : '#7a5c42', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
          >
            <i className="ti ti-archive"></i> Banco de Planos ({bankPlans.length})
          </button>
        </div>
      </div>

      {/* ─── ABA 1: DOCUMENTO DE PLANEJAMENTO ─────────────────────── */}
      {activeTab === 'editor' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
          
          {/* Coluna Principal: Estrutura do Plano de Aula */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Toolbar de Controle de Expansão / Recolhimento das Boxes & Calibrações */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: -8 }}>
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'calibrations' }))
                }}
                title="Abrir Calibrações e Preferências Globais do Professor"
                style={{
                  background: '#faf6f0',
                  border: '1px solid #d5c0b0',
                  borderRadius: RADIUS.md,
                  padding: '3px 8px',
                  color: '#8b5e3c',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <i className="ti ti-adjustments-horizontal" /> Calibrações
              </button>
              <span style={{ color: '#d5c0b0' }}>|</span>
              <button
                type="button"
                onClick={expandAllBoxes}
                style={{ background: 'transparent', border: 'none', color: '#8b5e3c', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <i className="ti ti-arrows-maximize" /> Expandir Todas
              </button>
              <span style={{ color: '#d5c0b0' }}>|</span>
              <button
                type="button"
                onClick={collapseAllBoxes}
                style={{ background: 'transparent', border: 'none', color: '#8b5e3c', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <i className="ti ti-arrows-minimize" /> Recolher Todas
              </button>
            </div>

            {/* Identificação da Aula */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: RADIUS.xl, overflow: 'hidden' }}>
              <div
                onClick={() => toggleBoxCollapse('identificacao')}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 20px', cursor: 'pointer', userSelect: 'none',
                  background: collapsedBoxes['identificacao'] ? '#fdf8f2' : 'transparent',
                  borderBottom: collapsedBoxes['identificacao'] ? 'none' : '1px solid rgba(139,115,85,0.1)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <i className={`ti ti-chevron-${collapsedBoxes['identificacao'] ? 'right' : 'down'}`} style={{ color: '#8b5e3c', fontSize: 14 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    📦 Identificação da Aula
                  </span>
                  {collapsedBoxes['identificacao'] && (
                    <span style={{ fontSize: 11.5, color: '#7a6552', fontWeight: 500 }}>
                      • {currentClass?.name || 'Turma'} ({activeProfile.name}) • {targetDurationMinutes} min • {lessonDate}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#7a6552' }}>{currentSchool?.name || 'Escola'}</span>
                  <i className={`ti ti-chevron-${collapsedBoxes['identificacao'] ? 'down' : 'up'}`} style={{ color: '#8b5e3c', fontSize: 13 }} />
                </div>
              </div>

              {!collapsedBoxes['identificacao'] && (
                <div style={{ padding: 20 }}>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>Turma</label>
                  <select
                    value={selectedClassId}
                    onChange={e => {
                      if (e.target.value === '__new__') {
                        handleQuickCreateClass()
                        return
                      }
                      isPlanEditedByUser.current = true
                      setSelectedClassId(e.target.value)
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none' }}
                  >
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.gradeYear || '9º Fund.'})</option>
                    ))}
                    <option value="__new__">➕ Cadastrar Nova Turma...</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>Disciplina / Matéria</label>
                  <select
                    value={subjectId}
                    onChange={e => {
                      isPlanEditedByUser.current = true
                      setSubjectId(e.target.value)
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none' }}
                  >
                    {availableSubjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.nameShort})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>Duração Planejada</label>
                  <select
                    value={targetDurationMinutes}
                    onChange={e => {
                      isPlanEditedByUser.current = true
                      setTargetDurationMinutes(Number(e.target.value))
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none' }}
                  >
                    <option value={45}>45 minutos</option>
                    <option value={50}>50 minutos (Padrão)</option>
                    <option value={60}>60 minutos (1 hora)</option>
                    <option value={90}>90 minutos (Aula Dupla)</option>
                    <option value={100}>100 minutos (Bloco Duplo)</option>
                  </select>
                </div>

                {activeProfile.name.toLowerCase().includes('inglês') && (
                  <div>
                    <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>
                      Nível CEFR (ELT)
                    </label>
                    <select
                      value={currentCefrLevel}
                      onChange={e => {
                        isPlanEditedByUser.current = true
                        setCustomCefrLevel(e.target.value)
                      }}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none' }}
                    >
                      <option value="A1">A1 — Breakthrough (Iniciante)</option>
                      <option value="A2">A2 — Waystage (Básico / KET)</option>
                      <option value="B1">B1 — Threshold (Intermediário / PET)</option>
                      <option value="B2">B2 — Vantage (Interm. Avançado / FCE)</option>
                      <option value="C1">C1 — Effective (Avançado / CAE)</option>
                    </select>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>Data da Aula</label>
                  <input
                    type="date"
                    value={lessonDate}
                    onChange={e => {
                      isPlanEditedByUser.current = true
                      setLessonDate(e.target.value)
                    }}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>Espaço / Local</label>
                  <select
                    value={roomSpace}
                    onChange={e => {
                      isPlanEditedByUser.current = true
                      setRoomSpace(e.target.value)
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none' }}
                  >
                    <option value="Sala de Aula Regular">🏫 Sala de Aula Regular</option>
                    <option value="Laboratório de Informática">💻 Lab. de Informática</option>
                    <option value="Biblioteca">📚 Biblioteca</option>
                    <option value="Pátio / Espaço Aberto">🌳 Pátio / Atividade Externa</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>
                    Rotina de Pensamento (Harvard)
                  </label>
                  <select
                    value={selectedThinkingRoutine}
                    onChange={e => {
                      isPlanEditedByUser.current = true
                      setSelectedThinkingRoutine(e.target.value)
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none' }}
                  >
                    <option value="">Nenhuma (Padrão)</option>
                    {HARVARD_THINKING_ROUTINES.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>
                    Área de Cobertura
                  </label>
                  <select
                    value={subjectCoverageArea}
                    onChange={e => {
                      isPlanEditedByUser.current = true
                      setSubjectCoverageArea(e.target.value)
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none' }}
                  >
                    <option value="">Geral / Integrada</option>
                    <option value="Gramática & Estruturas">Gramática & Estruturas</option>
                    <option value="Vocabulário & Léxico">Vocabulário & Léxico</option>
                    <option value="Compreensão Oral (Listening)">Compreensão Oral (Listening)</option>
                    <option value="Produção Oral (Speaking)">Produção Oral (Speaking)</option>
                    <option value="Leitura & Interpretação (Reading)">Leitura & Interpretação (Reading)</option>
                    <option value="Produção Escrita (Writing)">Produção Escrita (Writing)</option>
                    <option value="Fonética & Pronúncia">Fonética & Pronúncia</option>
                    <option value="Literatura & Cultura">Literatura & Cultura</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>
                    Interação Predominante
                  </label>
                  <select
                    value={predominantInteraction}
                    onChange={e => {
                      isPlanEditedByUser.current = true
                      setPredominantInteraction(e.target.value as StageInteractionType)
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none' }}
                  >
                    <option value="whole_class">🏛️ Turma Toda</option>
                    <option value="pair">👥 Duplas (Aluno-Aluno)</option>
                    <option value="group">👨‍👩‍👧‍👦 Pequenos Grupos</option>
                    <option value="teacher_student">🧑‍🏫 Professor-Aluno</option>
                    <option value="individual">👤 Individual / Autônomo</option>
                  </select>
                </div>
              </div>

              {/* Descrição Curta da Aula (1-2 frases para Calendário, Home e Pais) com IA Opt-in */}
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 6 }}>
                  <label style={{ fontSize: TEXT.caption, fontWeight: 700, color: '#7a6552' }}>
                    Descrição Curta da Aula (1-2 frases para Home, Calendário e Pais):
                  </label>
                  <AiAssistButton
                    onClick={handleSuggestShortDescription}
                    size="sm"
                    label="✨ Sugerir com IA"
                    title="Inferir resumo de 1-2 frases com base no tópico da aula"
                  />
                </div>
                <input
                  type="text"
                  value={shortDescription}
                  onChange={e => {
                    isPlanEditedByUser.current = true
                    setShortDescription(e.target.value)
                  }}
                  placeholder="Ex: Introdução aos verbos no passado com foco em narração de viagens e atividades orais em duplas..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none' }}
                />
              </div>

              {/* Modo Bilíngue / CLIL Toggle e Configuração */}
              <div style={{ marginTop: 14, padding: '10px 14px', background: isClilActive ? '#f0f9ff' : '#faf6f0', border: '1px solid #bae6fd', borderRadius: RADIUS.md }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#0369a1' }}>
                    <input
                      type="checkbox"
                      checked={isClilActive}
                      onChange={e => {
                        isPlanEditedByUser.current = true
                        setIsClilActive(e.target.checked)
                      }}
                    />
                    <span>🌍 Modo Bilíngue / CLIL (Integração com Conteúdo)</span>
                  </label>
                  {isClilActive && (
                    <span style={{ fontSize: 11, background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                      Objetivos Duplos: Língua + Conteúdo
                    </span>
                  )}
                </div>
                {isClilActive && (
                  <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 4 }}>Área Integrada</label>
                      <select
                        value={clilSubjectId}
                        onChange={e => {
                          isPlanEditedByUser.current = true
                          setClilSubjectId(e.target.value)
                        }}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #7dd3fc', background: '#fff', fontSize: 12 }}
                      >
                        {CLIL_SUBJECTS.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 4 }}>Tópico Interdisciplinar de Conteúdo</label>
                      <input
                        value={clilContentTopic}
                        onChange={e => {
                          isPlanEditedByUser.current = true
                          setClilContentTopic(e.target.value)
                        }}
                        placeholder="Ex: Ciclo da Água, Ecossistemas, Biomas..."
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #7dd3fc', background: '#fff', fontSize: 12 }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Banner de Memória Longitudinal Coletiva da Turma */}
              {classPedagogicalProfile.studentCount > 0 && (
                <div style={{ marginTop: 14, padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: RADIUS.lg }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>🧠</span>
                      <div>
                        <strong style={{ fontSize: 13, color: '#166534' }}>
                          Memória Longitudinal da Turma Conectada ({classPedagogicalProfile.studentCount} alunos monitorados)
                        </strong>
                        <div style={{ fontSize: 11.5, color: '#15803d' }}>
                          {classPedagogicalProfile.monitoredGapsCount > 0
                            ? `${classPedagogicalProfile.monitoredGapsCount} lacuna(s) recorrente(s) mapeada(s) no histórico`
                            : 'Histórico sem alertas críticos de rendimento'}
                          {classPedagogicalProfile.trajectoryRiskCount > 0 && ` • ⚠️ ${classPedagogicalProfile.trajectoryRiskCount} aluno(s) com oscilação/queda recente`}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowClassMemoryDetails(!showClassMemoryDetails)}
                      style={{ background: '#fff', border: '1px solid #86efac', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#166534', cursor: 'pointer' }}
                    >
                      {showClassMemoryDetails ? 'Ocultar Diagnóstico' : 'Ver Diagnóstico Coletivo'}
                    </button>
                  </div>

                  {/* Alertas de Recuperação Espaçada e Erros Férteis */}
                  {spacedRetrieval && (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ fontSize: 12, color: '#9a3412' }}>
                        <strong>🔄 Recuperação Espaçada:</strong> {spacedRetrieval.topic} ({spacedRetrieval.daysAgo}d atrás, média {spacedRetrieval.avgScore}/10).
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setStages([
                            {
                              name: `Warm-up (Recuperação Espaçada: ${spacedRetrieval.topic})`,
                              durationMin: 5,
                              teacherAction: `Apresenta 2 perguntas rápidas de revisão ativa sobre ${spacedRetrieval.topic}`,
                              studentAction: 'Respondem rapidamente em duplas sem consulta para reativação de memória',
                              completed: false
                            },
                            ...stages
                          ])
                          toast.success(`Micro-etapa de recuperação ativa sobre "${spacedRetrieval.topic}" adicionada ao Warm-up!`)
                        }}
                        style={{ background: '#ea580c', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                      >
                        + Inserir Revisão no Warm-up
                      </button>
                    </div>
                  )}

                  {fertileErrors && (
                    <div style={{ marginTop: 6, padding: '8px 12px', background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ fontSize: 12, color: '#9d174d' }}>
                        <strong>🎯 Caderno de Noticing (Erro Fértil):</strong> {fertileErrors.commonMistake}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setStages([
                            ...stages,
                            {
                              name: 'Spot & Fix the Bug (Noticing)',
                              durationMin: 5,
                              teacherAction: 'Projeta 2 frases com erros comuns anônimos da turma e guia a identificação',
                              studentAction: 'Identificam o erro em duplas e formulam a versão corrigida',
                              completed: false
                            }
                          ])
                          toast.success('Micro-desafio "Spot & Fix" adicionado ao roteiro!')
                        }}
                        style={{ background: '#db2777', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                      >
                        + Inserir Spot & Fix
                      </button>
                    </div>
                  )}

                  {showClassMemoryDetails && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #86efac', fontSize: 12, color: '#166534' }}>
                      {classPedagogicalProfile.topGaps.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <strong>Pontos de Atenção / Lacunas Históricas:</strong>
                          <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                            {classPedagogicalProfile.topGaps.map((g, i) => (
                              <li key={i}>{g}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {classPedagogicalProfile.collectiveStrengths.length > 0 && (
                        <div>
                          <strong>Pontos Fortes da Turma:</strong> {classPedagogicalProfile.collectiveStrengths.join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Seção Opcional: Vinculação a PDI / PEI (Fase 1.2) */}
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed #e2d9cc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c' }}>
                      🧩 Adaptação Curricular Individual (PDI / PEI)
                    </span>
                    <span style={{ fontSize: 11, background: '#ede9fe', color: '#6d28d9', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                      {neeStudentsInClass.length > 0 ? `${neeStudentsInClass.length} aluno(s) com NEE nesta turma` : 'Opcional'}
                    </span>
                  </div>
                  {peiStudentId && (
                    <button
                      type="button"
                      onClick={() => setShowPeiModalForStudent({ studentId: peiStudentId, studentName: peiStudentName })}
                      style={{ background: 'none', border: 'none', color: '#6d28d9', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <i className="ti ti-file-text" /> Ver Ficha Completa do PEI
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: peiStudentId ? '1fr 1.5fr' : '1fr', gap: 12, alignItems: 'start' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#7a6552', marginBottom: 4 }}>
                      Vincular este plano a um aluno com necessidade específica:
                    </label>
                    <select
                      value={peiStudentId}
                      onChange={e => handleSelectPeiStudent(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fff', fontSize: 12.5, outline: 'none' }}
                    >
                      <option value="">Nenhum (Plano Geral da Turma)</option>
                      {classStudents.map(s => {
                        const hasNee = Boolean(s.nee || s.nee_flag)
                        return (
                          <option key={s.id} value={s.id}>
                            {hasNee ? '✦ ' : ''}{s.name}{hasNee ? ` (${s.nee_description || s.neeDescription || 'NEE / Adaptado'})` : ''}
                          </option>
                        )
                      })}
                    </select>
                  </div>

                  {peiStudentId && (
                    <div style={{ background: '#fbf8f3', border: '1px solid #e9dfd0', borderRadius: RADIUS.md, padding: '10px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#2c1a0e' }}>
                          👤 {peiStudentName}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '2px 8px', borderRadius: 12 }}>
                          {peiDiagnosis || 'Adaptação Ativa'}
                        </span>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#7a6552', marginBottom: 2 }}>
                          Acomodações e adaptações curriculares para esta aula:
                        </label>
                        <input
                          type="text"
                          value={peiAccommodations}
                          onChange={e => {
                            isPlanEditedByUser.current = true
                            setPeiAccommodations(e.target.value)
                          }}
                          placeholder="Ex: Tempo adicional (+50%), instruções mediadas, material ampliado..."
                          style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 12, outline: 'none', background: '#fff' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Integração com Sequência Didática (Fase 3) */}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #e2d9cc' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#7a6552', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    🔗 Sequência Didática (Ritmo Curricular)
                  </span>
                  {selectedSequence && sequencePaceResult && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: sequencePaceResult.badgeBg,
                        color: sequencePaceResult.badgeColor,
                        border: `1px solid ${sequencePaceResult.badgeBorder}`
                      }}>
                        {sequencePaceResult.pace === 'on_track' ? '🟢' : sequencePaceResult.pace === 'behind' ? '🔴' : '🔵'} {sequencePaceResult.message}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'didactic-sequence' }))
                        }}
                        style={{ background: 'none', border: 'none', color: '#0369a1', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}
                        title="Ver Linha do Tempo e Unidades da Sequência"
                      >
                        Ver Sequência Completa ↗
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: '#7a6552', marginBottom: 3 }}>
                      Sequência da Turma:
                    </label>
                    <select
                      value={didacticSequenceRef?.sequenceId || ''}
                      onChange={e => handleSelectSequence(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 11.5, background: '#fff' }}
                    >
                      <option value="">Nenhuma (Aula Avulsa / Independente)</option>
                      {availableSequences.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.title} ({s.className})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedSequence && (
                    <div>
                      <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: '#7a6552', marginBottom: 3 }}>
                        Posição da Aula na Sequência:
                      </label>
                      <select
                        value={didacticSequenceRef?.lessonOrder || 1}
                        onChange={e => handleSelectSequenceSlot(Number(e.target.value))}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 11.5, background: '#fff' }}
                      >
                        {selectedSequence.lessons.map(slot => (
                          <option key={slot.id} value={slot.order}>
                            Aula {slot.order} de {selectedSequence.lessons.length}: {slot.title} {slot.status === 'completed' ? '✓ (Concluída)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
                </div>
              )}
            </div>

            {/* Tópico, Descrição & Objetivos de Aprendizagem */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: RADIUS.xl, overflow: 'hidden' }}>
              <div
                onClick={() => toggleBoxCollapse('topico')}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 20px', cursor: 'pointer', userSelect: 'none',
                  background: collapsedBoxes['topico'] ? '#fdf8f2' : 'transparent',
                  borderBottom: collapsedBoxes['topico'] ? 'none' : '1px solid rgba(139,115,85,0.1)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <i className={`ti ti-chevron-${collapsedBoxes['topico'] ? 'right' : 'down'}`} style={{ color: '#8b5e3c', fontSize: 14 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    📦 Tópico, Descrição & Objetivos ({activeProfile.name})
                  </span>
                  {collapsedBoxes['topico'] && topic && (
                    <span style={{ fontSize: 11.5, color: '#7a6552', fontWeight: 500, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      • {topic}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} onClick={e => e.stopPropagation()}>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={isGenerating}
                    disabled={isGenerating}
                    icon={<i className="ti ti-sparkles" />}
                    onClick={handleGenerateWithAi}
                  >
                    {isGenerating ? 'Elaborando Roteiro...' : 'Gerar Roteiro com IA'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => toggleBoxCollapse('topico')}
                    style={{ background: 'transparent', border: 'none', color: '#8b5e3c', cursor: 'pointer', padding: 2 }}
                    title={collapsedBoxes['topico'] ? 'Expandir' : 'Recolher'}
                    aria-expanded={!collapsedBoxes['topico']}
                  >
                    <i className={`ti ti-chevron-${collapsedBoxes['topico'] ? 'down' : 'up'}`} style={{ fontSize: 13 }} />
                  </button>
                </div>
              </div>

              {!collapsedBoxes['topico'] && (
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Tópico */}
                  <div>
                    <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>
                      Tópico ou Conteúdo Central da Aula
                    </label>
                    <input
                      value={topic}
                      onChange={e => {
                        isPlanEditedByUser.current = true
                        setTopic(e.target.value)
                      }}
                      placeholder="Ex: Simple Past vs Past Continuous narrating a travel experience..."
                      style={{ width: '100%', padding: '10px 14px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>

                  {/* Descrição Geral da Aula */}
                  <div>
                    <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>
                      Descrição Geral da Aula (Resumo)
                    </label>
                    <textarea
                      value={description}
                      onChange={e => {
                        isPlanEditedByUser.current = true
                        setDescription(e.target.value)
                      }}
                      placeholder="Breve resumo contextualizando o propósito e fluxo geral da aula..."
                      rows={2}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
                    />
                  </div>

                  {/* 3 Objetivos Distintos */}
                  <div style={{ background: '#faf6f0', border: '1px solid #ede4d8', borderRadius: RADIUS.lg, padding: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>🎯 Objetivos de Aprendizagem (3 Dimensões)</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7a6552', marginBottom: 3 }}>
                          1. Objetivo Geral
                        </label>
                        <textarea
                          value={generalObjective}
                          onChange={e => {
                            isPlanEditedByUser.current = true
                            setGeneralObjective(e.target.value)
                          }}
                          placeholder="A grande meta cognitiva ou comunicativa..."
                          rows={3}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d5c0b0', background: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7a6552', marginBottom: 3 }}>
                          2. Objetivos Específicos
                        </label>
                        <textarea
                          value={specificObjectives}
                          onChange={e => {
                            isPlanEditedByUser.current = true
                            setSpecificObjectives(e.target.value)
                          }}
                          placeholder="Passos e habilidades observáveis esperadas..."
                          rows={3}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d5c0b0', background: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7a6552', marginBottom: 3 }}>
                          3. Objetivo(s) Pessoal(is) / Socioemocionais
                        </label>
                        <textarea
                          value={socioemotionalObjectives}
                          onChange={e => {
                            isPlanEditedByUser.current = true
                            setSocioemotionalObjectives(e.target.value)
                          }}
                          placeholder="Cooperação em duplas, escuta ativa, autorregulação..."
                          rows={3}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d5c0b0', background: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Meta da Aula */}
                  <div>
                    <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>
                      🏆 Meta da Aula (Critério Mensurável de Sucesso)
                    </label>
                    <input
                      value={lessonGoal}
                      onChange={e => {
                        isPlanEditedByUser.current = true
                        setLessonGoal(e.target.value)
                      }}
                      placeholder="O que define sucesso? Ex: Ao final da aula, 100% dos alunos conseguirão formular 3 perguntas corretas..."
                      style={{ width: '100%', padding: '9px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>

                  {activeProfile.name.toLowerCase().includes('inglês') && topic.trim() && (
                    <div style={{ padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: RADIUS.md, fontSize: 11.5, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>🇧🇷</span>
                      <span>
                        <strong>Especialização ELT Brasil:</strong> Antecipação automática de armadilhas L1 ativada para este tópico.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Diagnóstico Prévio & Problemas Antecipados */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: RADIUS.xl, overflow: 'hidden' }}>
              <div
                onClick={() => toggleBoxCollapse('diagnosticoPrevio')}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 20px', cursor: 'pointer', userSelect: 'none',
                  background: collapsedBoxes['diagnosticoPrevio'] ? '#fdf8f2' : 'transparent',
                  borderBottom: collapsedBoxes['diagnosticoPrevio'] ? 'none' : '1px solid rgba(139,115,85,0.1)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <i className={`ti ti-chevron-${collapsedBoxes['diagnosticoPrevio'] ? 'right' : 'down'}`} style={{ color: '#8b5e3c', fontSize: 14 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    📦 Diagnóstico Prévio & Problemas Antecipados
                  </span>
                  {collapsedBoxes['diagnosticoPrevio'] && (priorKnowledge || anticipatedProblems) && (
                    <span style={{ fontSize: 11.5, color: '#7a6552', fontWeight: 500 }}>
                      • Pré-requisitos e desafios mapeados
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleBoxCollapse('diagnosticoPrevio')}
                  style={{ background: 'transparent', border: 'none', color: '#8b5e3c', cursor: 'pointer', padding: 2 }}
                  title={collapsedBoxes['diagnosticoPrevio'] ? 'Expandir' : 'Recolher'}
                  aria-expanded={!collapsedBoxes['diagnosticoPrevio']}
                >
                  <i className={`ti ti-chevron-${collapsedBoxes['diagnosticoPrevio'] ? 'down' : 'up'}`} style={{ fontSize: 13 }} />
                </button>
              </div>

              {!collapsedBoxes['diagnosticoPrevio'] && (
                <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>
                      💡 Conhecimento Prévio ("O que eles já sabem")
                    </label>
                    <textarea
                      value={priorKnowledge}
                      onChange={e => {
                        isPlanEditedByUser.current = true
                        setPriorKnowledge(e.target.value)
                      }}
                      placeholder="Conceitos e vocabulário que a turma já domina e que servem de base para esta aula (ligado à Sequência Didática)..."
                      rows={3}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 12.5, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>
                      ⚠️ Problemas Antecipados & Armadilhas Prováveis
                    </label>
                    <textarea
                      value={anticipatedProblems}
                      onChange={e => {
                        isPlanEditedByUser.current = true
                        setAnticipatedProblems(e.target.value)
                      }}
                      placeholder="Ex: Alunos podem confundir Present Perfect com Simple Past; hesitação para falar em público..."
                      rows={3}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 12.5, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Habilidades BNCC */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: RADIUS.xl, overflow: 'hidden' }}>
              <div
                onClick={() => toggleBoxCollapse('bncc')}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 20px', cursor: 'pointer', userSelect: 'none',
                  background: collapsedBoxes['bncc'] ? '#fdf8f2' : 'transparent',
                  borderBottom: collapsedBoxes['bncc'] ? 'none' : '1px solid rgba(139,115,85,0.1)',
                  flexWrap: 'wrap', gap: 8
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <i className={`ti ti-chevron-${collapsedBoxes['bncc'] ? 'right' : 'down'}`} style={{ color: '#8b5e3c', fontSize: 14 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    📦 Habilidades BNCC — Matriz Língua Inglesa (MEC)
                  </span>
                  <span style={{ fontSize: 11, background: '#ede9fe', color: '#6d28d9', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                    106 habilidades oficiais (88 EF + 18 EM)
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: '#7a6552', fontWeight: 600 }}>
                    {selectedSkills.length} selecionada(s)
                  </span>
                  <i className={`ti ti-chevron-${collapsedBoxes['bncc'] ? 'down' : 'up'}`} style={{ color: '#8b5e3c', fontSize: 13 }} />
                </div>
              </div>

              {!collapsedBoxes['bncc'] && (
                <div style={{ padding: 20 }}>
              {/* Alerta de Habilidade Adiada na Aula Anterior */}
              {pendingBacklog.length > 0 && (
                <div style={{ background: '#fff8eb', border: '1px solid #f59e0b', borderRadius: RADIUS.md, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="ti ti-pin" style={{ color: '#d97706', fontSize: 18 }}></i>
                    <span style={{ fontSize: TEXT.bodyCompact, color: '#92400e', fontWeight: 600 }}>
                      <strong>Replanejamento:</strong> {pendingBacklog.length} habilidade(s) adiada(s) da aula anterior: <strong>{pendingBacklog.join(', ')}</strong>
                    </span>
                  </div>
                  <button
                    onClick={() => importPendingBacklogSkill(pendingBacklog[0])}
                    style={{ background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: TEXT.caption, fontWeight: 700, cursor: 'pointer' }}
                  >
                    + Incluir no Plano de Hoje
                  </button>
                </div>
              )}

              {/* Lista de Habilidades Selecionadas com Status */}
              {selectedSkills.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {selectedSkills.map(sk => (
                    <div key={sk.code} style={{ background: '#fdf8f2', border: '1px solid #e8decb', borderRadius: RADIUS.md, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 240, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ color: '#8b5e3c', fontSize: TEXT.bodyCompact }}>[{sk.code}]</strong>
                        {sk.isAutoSuggested && (
                          <span style={{ fontSize: 10, background: '#ede9fe', color: '#6d28d9', padding: '2px 6px', borderRadius: 4, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            🤖 Sugestão da IA
                          </span>
                        )}
                        <span style={{ fontSize: 12, color: '#4a382a', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: 1.4 }}>{sk.desc}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          onClick={() => setSkillStatus(sk.code, 'covered')}
                          style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: sk.status === 'covered' ? '#2d9d5d' : '#eee', color: sk.status === 'covered' ? '#fff' : '#555', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                        >
                          ✓ Coberta
                        </button>
                        <button
                          onClick={() => setSkillStatus(sk.code, 'postponed')}
                          style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: sk.status === 'postponed' ? '#d97706' : '#eee', color: sk.status === 'postponed' ? '#fff' : '#555', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                        >
                          ⏳ Adiar
                        </button>
                        <button
                          onClick={() => toggleSkill({ code: sk.code } as any)}
                          style={{ background: 'transparent', border: 'none', color: '#dc322f', cursor: 'pointer', fontSize: 13 }}
                          title="Remover habilidade"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Filtro por Ano/Série Escolar */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#7a6552', marginRight: 2 }}>Série:</span>
                {[
                  { id: 'current', label: `Turma Atual (${currentClass?.gradeYear || 'Geral'})` },
                  { id: '6º Fund.', label: '6º Ano (26)' },
                  { id: '7º Fund.', label: '7º Ano (23)' },
                  { id: '8º Fund.', label: '8º Ano (20)' },
                  { id: '9º Fund.', label: '9º Ano (19)' },
                  { id: 'Médio', label: 'Ensino Médio (18)' },
                  { id: 'all', label: `Todas (${allBnccSkills.length})` }
                ].map(tab => {
                  const isActive = bnccGradeFilter === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setBnccGradeFilter(tab.id)}
                      style={{
                        padding: '3px 9px',
                        borderRadius: 14,
                        border: isActive ? '1px solid #8b5e3c' : '1px solid #d5c0b0',
                        background: isActive ? '#8b5e3c' : '#fff',
                        color: isActive ? '#fff' : '#5c4533',
                        fontSize: 11,
                        fontWeight: isActive ? 700 : 500,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>

              {/* Filtro por Eixo da BNCC */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#7a6552', marginRight: 2 }}>Eixo:</span>
                {[
                  { id: 'all', label: 'Todos os Eixos', icon: '🌐' },
                  { id: 'Oralidade', label: 'Oralidade', icon: '🗣️' },
                  { id: 'Leitura', label: 'Leitura', icon: '📖' },
                  { id: 'Escrita', label: 'Escrita', icon: '✍️' },
                  { id: 'Conhecimentos Linguísticos', label: 'Conhecimentos Linguísticos', icon: '🔤' },
                  { id: 'Dimensão Intercultural', label: 'Dimensão Intercultural', icon: '🌍' }
                ].map(axis => {
                  const isActive = bnccAxisFilter === axis.id
                  return (
                    <button
                      key={axis.id}
                      type="button"
                      onClick={() => setBnccAxisFilter(axis.id)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        border: isActive ? '1px solid #7c3aed' : '1px solid #e2e8f0',
                        background: isActive ? '#ede9fe' : '#f8fafc',
                        color: isActive ? '#5b21b6' : '#64748b',
                        fontSize: 11,
                        fontWeight: isActive ? 700 : 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span>{axis.icon}</span>
                      <span>{axis.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Barra de Pesquisa e Auto-Sugestão */}
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    placeholder="Pesquisar código (ex: EF08LI19), conteúdo ou descrição na BNCC..."
                    value={skillSearch}
                    onChange={e => setSkillSearch(e.target.value)}
                    style={{ flex: 1, padding: '7px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: TEXT.bodyCompact, outline: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={handleAutoSuggestBncc}
                    style={{ padding: '7px 14px', borderRadius: RADIUS.md, border: '1px solid #c4b5fd', background: '#f5f3ff', color: '#6d28d9', fontSize: TEXT.bodyCompact, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
                    title="Sugerir habilidades automaticamente com base no tema digitado"
                  >
                    <span>✨</span> Sugerir pelo Tema
                  </button>
                </div>

                {/* Contador de Habilidades Filtradas */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 11.5, color: '#7a6552' }}>
                  <span>
                    Exibindo <strong>{filteredBnccSkills.length}</strong> de <strong>{gradeFilteredBnccSkills.length}</strong> habilidades ({bnccGradeFilter === 'current' ? (currentClass?.gradeYear || 'Geral') : bnccGradeFilter === 'all' ? 'Todas as séries' : bnccGradeFilter})
                    {bnccAxisFilter !== 'all' && ` • Eixo: ${bnccAxisFilter}`}
                    {skillSearch && ` • Busca: "${skillSearch}"`}
                  </span>
                  {selectedSkills.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedSkills([])}
                      style={{ background: 'transparent', border: 'none', color: '#dc322f', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Limpar selecionadas
                    </button>
                  )}
                </div>

                {/* Grid de Cards de Habilidades */}
                <div className="prominent-scrollbar" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8, maxHeight: 440, overflowY: 'auto', paddingRight: 8 }}>
                  {filteredBnccSkills.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', padding: '24px 16px', textAlign: 'center', color: '#8c7a6b', background: '#fdf8f2', borderRadius: 8, border: '1px dashed #d5c0b0', fontSize: 12 }}>
                      Nenhuma habilidade encontrada para os filtros selecionados. Tente alterar a série, o eixo ou limpar a busca.
                    </div>
                  ) : (
                    filteredBnccSkills.map(s => {
                      const isSelected = selectedSkills.some(sel => sel.code === s.code)
                      const axisStyle = AXIS_STYLE_MAP[s.axis] || { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' }
                      return (
                        <div
                          key={s.code}
                          onClick={() => toggleSkill(s)}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            cursor: 'pointer',
                            border: isSelected ? '1.5px solid #8b5e3c' : '1px solid #e8decb',
                            background: isSelected ? '#f5efe6' : '#fff',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 5,
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input type="checkbox" checked={isSelected} readOnly style={{ cursor: 'pointer' }} />
                              <strong style={{ color: isSelected ? '#8b5e3c' : '#2c1a0e', fontSize: 12 }}>{s.code}</strong>
                              <span style={{ fontSize: 10, color: '#7a6552', background: '#f5efe6', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
                                {s.gradeYear}
                              </span>
                            </div>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: axisStyle.bg,
                              color: axisStyle.color,
                              border: `1px solid ${axisStyle.border}`,
                              whiteSpace: 'nowrap'
                            }}>
                              {s.axis}
                            </span>
                          </div>
                          {s.unit && (
                            <div style={{ fontSize: 11, color: '#6d28d9', fontWeight: 600 }}>
                              {s.unit}
                            </div>
                          )}
                          <span title={s.description} style={{ fontSize: 11.5, color: '#4a382a', lineHeight: 1.35, wordBreak: 'break-word' }}>
                            {s.description.length > 55 ? `${s.description.slice(0, 55)}...` : s.description}
                          </span>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
                </div>
              )}
            </div>

            {/* Framework Pedagógico & Metodologia Ativa */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: RADIUS.xl, overflow: 'hidden' }}>
              <div
                onClick={() => toggleBoxCollapse('framework')}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 20px', cursor: 'pointer', userSelect: 'none',
                  background: collapsedBoxes['framework'] ? '#fdf8f2' : 'transparent',
                  borderBottom: collapsedBoxes['framework'] ? 'none' : '1px solid rgba(139,115,85,0.1)',
                  flexWrap: 'wrap', gap: 8
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <i className={`ti ti-chevron-${collapsedBoxes['framework'] ? 'right' : 'down'}`} style={{ color: '#8b5e3c', fontSize: 14 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    📦 Framework Pedagógico & Metodologia Ativa
                  </span>
                  {collapsedBoxes['framework'] && (
                    <span style={{ fontSize: 11.5, color: '#7a6552', fontWeight: 600 }}>
                      • {getLessonFrameworkConfig(selectedMethodology).name}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: '#8b5e3c', fontWeight: 700, background: '#f5efe6', padding: '2px 8px', borderRadius: 4 }}>
                    {getLessonFrameworkConfig(selectedMethodology).name}
                  </span>
                  <i className={`ti ti-chevron-${collapsedBoxes['framework'] ? 'down' : 'up'}`} style={{ color: '#8b5e3c', fontSize: 13 }} />
                </div>
              </div>

              {!collapsedBoxes['framework'] && (
                <div style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <button
                      type="button"
                      onClick={async () => {
                        const fw = getLessonFrameworkConfig(selectedMethodology)
                        const ok = await showConfirm({
                          title: 'Substituir Roteiro?',
                          message: `Deseja aplicar a estrutura canônica do ${fw.name}? O roteiro de etapas atual será substituído.`,
                          confirmLabel: 'Aplicar Estrutura',
                          cancelLabel: 'Cancelar'
                        })
                        if (ok) {
                          setStages(fw.defaultStages.map(s => ({
                            name: s.name,
                            durationMin: s.durationMin,
                            teacherAction: s.teacherAction,
                            studentAction: s.studentAction,
                            targetBnccCode: s.targetBnccCode || '',
                            completed: false
                          })))
                          toast.success(`Estrutura canônica de etapas do ${fw.name} aplicada!`)
                        }
                      }}
                      style={{ background: '#f5efe6', border: '1px solid #d5c0b0', color: '#8b5e3c', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                      title="Substitui o roteiro atual pela estrutura canônica deste framework"
                    >
                      🔄 Aplicar Estrutura Canônica ({getLessonFrameworkConfig(selectedMethodology).defaultStages.length} fases)
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                    {METHODOLOGY_PRESETS.map(m => {
                      const isSel = selectedMethodology === m.id
                      return (
                        <div
                          key={m.id}
                          onClick={() => {
                            isPlanEditedByUser.current = true
                            setSelectedMethodology(m.id)
                            // Preserva integralmente o roteiro existente. Se estiver vazio, aplica a estrutura inicial.
                            if (stages.length === 0) {
                              const fw = getLessonFrameworkConfig(m.id)
                              setStages(fw.defaultStages.map(s => ({
                                name: s.name,
                                durationMin: s.durationMin,
                                teacherAction: s.teacherAction,
                                studentAction: s.studentAction,
                                targetBnccCode: s.targetBnccCode || '',
                                completed: false
                              })))
                            }
                          }}
                          style={{
                            padding: 12, borderRadius: RADIUS.md, cursor: 'pointer',
                            border: isSel ? `2px solid ${m.badge}` : '1px solid #e8decb',
                            background: isSel ? '#fdf8f2' : '#fff',
                            transition: 'all 0.15s'
                          }}
                        >
                          <strong style={{ fontSize: TEXT.bodyCompact, color: '#2c1a0e', display: 'block', marginBottom: 4 }}>{m.name}</strong>
                          <p style={{ margin: 0, fontSize: TEXT.caption, color: '#7a6552', lineHeight: 1.35 }}>{m.desc}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>


            {/* Material de Referência */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: RADIUS.xl, overflow: 'hidden' }}>
              <div
                onClick={() => toggleBoxCollapse('material')}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 20px', cursor: 'pointer', userSelect: 'none',
                  background: collapsedBoxes['material'] ? '#fdf8f2' : 'transparent',
                  borderBottom: collapsedBoxes['material'] ? 'none' : '1px solid rgba(139,115,85,0.1)',
                  flexWrap: 'wrap', gap: 8
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <i className={`ti ti-chevron-${collapsedBoxes['material'] ? 'right' : 'down'}`} style={{ color: '#8b5e3c', fontSize: 14 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    📦 Material de Referência
                  </span>
                  {collapsedBoxes['material'] && bookTitle && (
                    <span style={{ fontSize: 11.5, color: '#7a6552', fontWeight: 500 }}>
                      • {bookTitle} {unitChapter && `(${unitChapter})`}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {libraryBooks.length > 0 && (
                    <span style={{ fontSize: TEXT.caption, color: '#2aa198', fontWeight: 700 }}>
                      📚 {libraryBooks.length} livro(s) indexado(s)
                    </span>
                  )}
                  <i className={`ti ti-chevron-${collapsedBoxes['material'] ? 'down' : 'up'}`} style={{ color: '#8b5e3c', fontSize: 13 }} />
                </div>
              </div>

              {!collapsedBoxes['material'] && (
                <div style={{ padding: 20 }}>
              {/* Sugestões Rápidas de Livros da Biblioteca */}
              {libraryBooks.length > 0 && (
                <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#7a6552', fontWeight: 600 }}>Da sua biblioteca:</span>
                  {libraryBooks.map(book => (
                    <button
                      key={book.id}
                      type="button"
                      onClick={() => {
                        isPlanEditedByUser.current = true
                        setBookTitle(book.title)
                        if (!topic && book.title) {
                          setTopic(`Conteúdo baseado em ${book.title}`)
                        }
                        showNotification(`Livro "${book.title}" vinculado ao planejamento.`)
                      }}
                      style={{
                        padding: '3px 8px', borderRadius: 6,
                        border: bookTitle === book.title ? '1px solid #8b5e3c' : '1px solid #d5c0b0',
                        background: bookTitle === book.title ? '#f5efe6' : '#fff',
                        fontSize: 11, color: bookTitle === book.title ? '#8b5e3c' : '#4a382a',
                        cursor: 'pointer', fontWeight: 600
                      }}
                    >
                      📖 {book.title}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>Livro / Apostila</label>
                  <input
                    value={bookTitle}
                    onChange={e => {
                      isPlanEditedByUser.current = true
                      setBookTitle(e.target.value)
                    }}
                    list="library-books-options"
                    placeholder="Ex: Eyes Open 3 (Cambridge) ou selecione..."
                    style={{ width: '100%', padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none' }}
                  />
                  <datalist id="library-books-options">
                    {libraryBooks.map(b => (
                      <option key={b.id} value={b.title} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>Unidade / Capítulo</label>
                  <input
                    value={unitChapter}
                    onChange={e => {
                      isPlanEditedByUser.current = true
                      setUnitChapter(e.target.value)
                    }}
                    placeholder="Ex: Unit 4: Free Time"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: TEXT.caption, fontWeight: 700, color: '#7a6552', marginBottom: 4 }}>Páginas</label>
                  <input
                    value={pages}
                    onChange={e => {
                      isPlanEditedByUser.current = true
                      setPages(e.target.value)
                    }}
                    placeholder="Ex: pp. 44-47"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none' }}
                  />
                </div>
              </div>

              {/* Vínculo Multi-Turma de Livros Paralelos */}
              {classes.length > 1 && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #e8decb' }}>
                  <span style={{ fontSize: 11, color: '#7a6552', fontWeight: 700, display: 'block', marginBottom: 6 }}>
                    👥 Turmas paralelas que compartilham este mesmo material:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {classes.filter(c => c.id !== selectedClassId).map(c => {
                      const isShared = sharedClassIds.includes(c.id)
                      return (
                        <label
                          key={c.id}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 8px', borderRadius: 6,
                            border: isShared ? '1px solid #268bd2' : '1px solid #d5c0b0',
                            background: isShared ? '#e8f4fd' : '#fff',
                            fontSize: 11, color: isShared ? '#268bd2' : '#7a5c42',
                            cursor: 'pointer', fontWeight: 600
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isShared}
                            onChange={e => {
                              if (e.target.checked) {
                                setSharedClassIds([...sharedClassIds, c.id])
                              } else {
                                setSharedClassIds(sharedClassIds.filter(id => id !== c.id))
                              }
                            }}
                          />
                          {c.name}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
                </div>
              )}
            </div>

            {/* Box de Pre-teach (Fase 2.5) */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: RADIUS.xl, overflow: 'hidden' }}>
              <div
                onClick={() => toggleBoxCollapse('preTeach')}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 20px', cursor: 'pointer', userSelect: 'none',
                  background: collapsedBoxes['preTeach'] ? '#fdf8f2' : 'transparent',
                  borderBottom: collapsedBoxes['preTeach'] ? 'none' : '1px solid rgba(139,115,85,0.1)',
                  flexWrap: 'wrap', gap: 8
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <i className={`ti ti-chevron-${collapsedBoxes['preTeach'] ? 'right' : 'down'}`} style={{ color: '#8b5e3c', fontSize: 14 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    🔤 Pre-teach: Vocabulário &amp; Conceitos Prévios
                  </span>
                  {collapsedBoxes['preTeach'] && preTeach && (
                    <span style={{ fontSize: 11.5, color: '#7a6552', fontWeight: 500 }}>
                      • Preenchido ({preTeach.length > 40 ? preTeach.substring(0, 40) + '...' : preTeach})
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {preTeach && (
                    <span style={{ fontSize: 11, background: '#fdf4ff', color: '#a21caf', border: '1px solid #f0abfc', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                      Ativo
                    </span>
                  )}
                  <i className={`ti ti-chevron-${collapsedBoxes['preTeach'] ? 'down' : 'up'}`} style={{ color: '#8b5e3c', fontSize: 13 }} />
                </div>
              </div>

              {!collapsedBoxes['preTeach'] && (
                <div style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                    <label style={{ fontSize: TEXT.caption, fontWeight: 700, color: '#7a6552' }}>
                      Vocabulário, estruturas ou conceitos prévios que precisam ser ensinados antes da atividade principal:
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (!topic) {
                          toast.info('Defina um tópico na Box 2 para sugerir itens de Pre-teach.')
                          return
                        }
                        isPlanEditedByUser.current = true
                        const samplePreTeach = `Vocabulário e Conceitos-Chave (${topic}):\n• Termos essenciais: definições contextualizadas e pronúncia guiada.\n• Falsos amigos e armadilhas comuns: contrastes com a L1.\n• Chunks e expressões úteis para a produção.`
                        setPreTeach(prev => prev ? `${prev}\n\n${samplePreTeach}` : samplePreTeach)
                        showNotification('Sugestão inicial de Pre-teach adicionada!')
                      }}
                      style={{
                        background: '#fdf4ff', border: '1px solid #d8b4fe', color: '#7e22ce',
                        borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                      }}
                    >
                      <span>✨</span> Sugerir Estrutura de Pre-teach
                    </button>
                  </div>
                  <textarea
                    value={preTeach}
                    onChange={e => {
                      isPlanEditedByUser.current = true
                      setPreTeach(e.target.value)
                    }}
                    placeholder="Liste palavras-chave com pronúncia/significado, falsos cognatos ou regras básicas a serem pré-ensinadas antes do início do roteiro..."
                    rows={3}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: RADIUS.md,
                      border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13,
                      outline: 'none', resize: 'vertical', lineHeight: 1.5
                    }}
                  />
                </div>
              )}
            </div>

            {/* Box de Materiais Necessários (Fase 1.4) */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: RADIUS.xl, overflow: 'hidden' }}>
              <div
                onClick={() => toggleBoxCollapse('materiais')}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 20px', cursor: 'pointer', userSelect: 'none',
                  background: collapsedBoxes['materiais'] ? '#fdf8f2' : 'transparent',
                  borderBottom: collapsedBoxes['materiais'] ? 'none' : '1px solid rgba(139,115,85,0.1)',
                  flexWrap: 'wrap', gap: 8
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <i className={`ti ti-chevron-${collapsedBoxes['materiais'] ? 'right' : 'down'}`} style={{ color: '#8b5e3c', fontSize: 14 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    📦 Materiais Necessários ({materials.length})
                  </span>
                  {collapsedBoxes['materiais'] && materials.length > 0 && (
                    <span style={{ fontSize: 11.5, color: '#7a6552', fontWeight: 500 }}>
                      • {materials.slice(0, 3).join(', ')}{materials.length > 3 ? ` (+${materials.length - 3})` : ''}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} onClick={e => e.stopPropagation()}>
                  <AiAssistButton
                    onClick={handleSuggestMaterials}
                    size="sm"
                    label="✨ Sugerir com IA"
                    title="Inferir materiais necessários com base no tópico e nas etapas da aula"
                  />
                  <button
                    type="button"
                    onClick={() => toggleBoxCollapse('materiais')}
                    style={{ background: 'transparent', border: 'none', color: '#8b5e3c', cursor: 'pointer', padding: 2 }}
                    title={collapsedBoxes['materiais'] ? 'Expandir' : 'Recolher'}
                  >
                    <i className={`ti ti-chevron-${collapsedBoxes['materiais'] ? 'down' : 'up'}`} style={{ fontSize: 13 }} />
                  </button>
                </div>
              </div>

              {!collapsedBoxes['materiais'] && (
                <div style={{ padding: 20 }}>
                  <div style={{ marginBottom: 14 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#7a6552', display: 'block', marginBottom: 6 }}>
                      Atalhos Rápidos de Materiais Comuns (Clique para alternar):
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {COMMON_MATERIALS.map(item => {
                        const isSelected = materials.includes(item)
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => {
                              isPlanEditedByUser.current = true
                              setMaterials(prev => isSelected ? prev.filter(m => m !== item) : [...prev, item])
                            }}
                            style={{
                              padding: '4px 10px',
                              borderRadius: RADIUS.full,
                              border: isSelected ? '1px solid #8b5e3c' : '1px solid #d5c0b0',
                              background: isSelected ? '#f5efe6' : '#fff',
                              color: isSelected ? '#8b5e3c' : '#5c4838',
                              fontWeight: isSelected ? 700 : 500,
                              fontSize: 11.5,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              transition: 'all 0.15s'
                            }}
                          >
                            <span>{isSelected ? '✓' : '+'}</span>
                            <span>{item}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Lista de Materiais Selecionados e Input Customizado */}
                  <div>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#7a6552', display: 'block', marginBottom: 6 }}>
                      Materiais Adicionados ao Plano:
                    </span>
                    {materials.length === 0 ? (
                      <p style={{ fontSize: 12, color: '#a08060', fontStyle: 'italic', margin: '4px 0 10px' }}>
                        Nenhum material adicionado ainda. Clique nos atalhos acima ou digite abaixo.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                        {materials.map(mat => (
                          <span
                            key={mat}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '4px 10px',
                              borderRadius: RADIUS.md,
                              background: '#fff',
                              border: '1px solid #d5c8bb',
                              fontSize: 12,
                              color: '#2c1a0e',
                              fontWeight: 600
                            }}
                          >
                            <span>📌 {mat}</span>
                            <button
                              type="button"
                              onClick={() => {
                                isPlanEditedByUser.current = true
                                setMaterials(prev => prev.filter(m => m !== mat))
                              }}
                              style={{ background: 'none', border: 'none', color: '#dc322f', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}
                              title="Remover material"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Adicionar Material Específico */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        value={newCustomMaterial}
                        onChange={e => setNewCustomMaterial(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            if (newCustomMaterial.trim()) {
                              isPlanEditedByUser.current = true
                              setMaterials(prev => Array.from(new Set([...prev, newCustomMaterial.trim()])))
                              setNewCustomMaterial('')
                            }
                          }
                        }}
                        placeholder="Adicionar outro material específico (ex: Cartões de bingo, Barbante, Fones de ouvido)..."
                        style={{ flex: 1, padding: '7px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 12.5, outline: 'none' }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newCustomMaterial.trim()) {
                            isPlanEditedByUser.current = true
                            setMaterials(prev => Array.from(new Set([...prev, newCustomMaterial.trim()])))
                            setNewCustomMaterial('')
                          }
                        }}
                        style={{
                          padding: '7px 14px',
                          borderRadius: RADIUS.md,
                          border: '1px solid #8b5e3c',
                          background: '#8b5e3c',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        + Adicionar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Roteiro da Aula */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: RADIUS.xl, overflow: 'hidden' }}>
              <div
                onClick={() => toggleBoxCollapse('roteiro')}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 20px', cursor: 'pointer', userSelect: 'none',
                  background: collapsedBoxes['roteiro'] ? '#fdf8f2' : 'transparent',
                  borderBottom: collapsedBoxes['roteiro'] ? 'none' : '1px solid rgba(139,115,85,0.1)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <i className={`ti ti-chevron-${collapsedBoxes['roteiro'] ? 'right' : 'down'}`} style={{ color: '#8b5e3c', fontSize: 14 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    📦 Roteiro da Aula ({totalTiming} min)
                  </span>
                  {collapsedBoxes['roteiro'] && (
                    <span style={{ fontSize: 11.5, color: '#7a6552', fontWeight: 500 }}>
                      • {stages.length} etapas
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 800,
                    background: totalTiming === targetDurationMinutes ? '#dcfce7' : (totalTiming > targetDurationMinutes ? '#fee2e2' : '#fef3c7'),
                    color: totalTiming === targetDurationMinutes ? '#15803d' : (totalTiming > targetDurationMinutes ? '#b91c1c' : '#b45309'),
                    border: totalTiming > targetDurationMinutes ? '1px solid #fca5a5' : 'none'
                  }}>
                    {totalTiming} / {targetDurationMinutes} min
                  </span>
                  <i className={`ti ti-chevron-${collapsedBoxes['roteiro'] ? 'down' : 'up'}`} style={{ color: '#8b5e3c', fontSize: 13 }} />
                </div>
              </div>

              {!collapsedBoxes['roteiro'] && (
                <div style={{ padding: 20 }}>
              {/* Alerta de Carga Horária e Estouro de Tempo */}
              {totalTiming > targetDurationMinutes && (
                <div style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: RADIUS.md,
                  padding: '10px 14px',
                  marginBottom: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  color: '#991b1b',
                  fontSize: TEXT.bodyCompact
                }}>
                  <i className="ti ti-clock-exclamation" style={{ fontSize: 20, color: '#dc2626', flexShrink: 0 }} />
                  <div>
                    <strong>⚠️ Estouro de Carga Horária:</strong> A soma das etapas ({totalTiming} min) ultrapassa a duração planejada da aula ({targetDurationMinutes} min) em <strong>{totalTiming - targetDurationMinutes} minutos</strong>. Reduza o tempo das etapas para manter a aula dentro do período escolar.
                  </div>
                </div>
              )}
              {totalTiming < targetDurationMinutes && (
                <div style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: RADIUS.md,
                  padding: '8px 12px',
                  marginBottom: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: '#1e40af',
                  fontSize: TEXT.caption
                }}>
                  <i className="ti ti-info-circle" style={{ fontSize: 16, color: '#2563eb', flexShrink: 0 }} />
                  <span>
                    <strong>Carga Horária Disponível:</strong> Restam <strong>{targetDurationMinutes - totalTiming} minutos</strong> livres no planejamento desta aula de {targetDurationMinutes} min.
                  </span>
                </div>
              )}
              {totalTiming === targetDurationMinutes && (
                <div style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: RADIUS.md,
                  padding: '8px 12px',
                  marginBottom: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: '#166534',
                  fontSize: TEXT.caption
                }}>
                  <i className="ti ti-circle-check" style={{ fontSize: 16, color: '#16a34a', flexShrink: 0 }} />
                  <span>
                    <strong>✓ Cronograma Balanceado:</strong> O somatório das etapas totaliza exatamente a carga horária planejada ({targetDurationMinutes} min).
                  </span>
                </div>
              )}

              {/* Widget Consolidado de Pendências do Checklist */}
              {(() => {
                const completedCount = stages.filter(s => s.completed).length
                const totalCount = stages.length
                const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
                const pendingStagesList = stages.filter(s => !s.completed)
                const isAllDone = completedCount === totalCount && totalCount > 0

                return (
                  <div style={{
                    background: isAllDone ? '#f0fdf4' : '#fffbeb',
                    border: `1px solid ${isAllDone ? '#bbf7d0' : '#fde68a'}`,
                    borderRadius: RADIUS.lg,
                    padding: '12px 16px',
                    marginBottom: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className={`ti ${isAllDone ? 'ti-circle-check text-emerald-600' : 'ti-alert-circle text-amber-600'}`} style={{ fontSize: 18 }} />
                        <strong style={{ fontSize: 13, color: '#2c1a0e' }}>
                          Status de Execução: {completedCount} de {totalCount} partes concluídas ({progressPct}%)
                        </strong>
                      </div>
                      <span style={{ fontSize: TEXT.caption, fontWeight: 700, color: isAllDone ? '#15803d' : '#b45309' }}>
                        {isAllDone ? '✓ Todas as etapas executadas' : `⏳ ${pendingStagesList.length} etapa(s) pendente(s)`}
                      </span>
                    </div>

                    {/* Barra de Progresso Visual */}
                    <div style={{ width: '100%', height: 6, background: isAllDone ? '#dcfce7' : '#fef3c7', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        width: `${progressPct}%`,
                        height: '100%',
                        background: isAllDone ? '#16a34a' : '#d97706',
                        borderRadius: 3,
                        transition: 'width 0.3s ease'
                      }} />
                    </div>

                    {/* Alerta de Etapas Pendentes com lista */}
                    {!isAllDone && pendingStagesList.length > 0 && (
                      <div style={{ fontSize: 11.5, color: '#92400e', marginTop: 2 }}>
                        <strong>Atenção:</strong> {pendingStagesList.length} etapa(s) ainda não foram concluídas: <em>{pendingStagesList.map(s => s.name).join(', ')}</em>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Equilíbrio de Fala (TTT / STT) */}
              <div style={{ marginBottom: 14, padding: '10px 14px', background: '#fdf8f2', border: '1px solid #e8decb', borderRadius: RADIUS.md }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c' }}>
                      🎙️ Equilíbrio de Fala Estimado: Teacher Talk Time (TTT) vs Student Talk Time (STT)
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: talkTimeAnalysis.balanceStatus === 'ideal' ? '#15803d' : '#b45309' }}>
                      {talkTimeAnalysis.balanceStatus === 'ideal' ? '✓ Proporção Ativa Recomendada' : '⚠️ Atenção: Alto TTT'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setShowCanDoModal(true)}
                      style={{ background: '#fff', border: '1px solid #d5c0b0', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, color: '#8b5e3c', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <span>🎯</span> Filipeta &quot;Eu Consigo...&quot;
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGeneralCompetenciesModal(true)}
                      style={{ background: '#fff', border: '1px solid #d5c0b0', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, color: '#0369a1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <span>🧠</span> Competências BNCC ({generalCompetencies.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowInclusionModal(true)}
                      style={{ background: '#fff', border: '1px solid #d5c0b0', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, color: '#7c3aed', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <span>♿</span> Acessibilidade &amp; PEI
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ width: `${talkTimeAnalysis.teacherPercent}%`, background: '#f59e0b' }} title={`TTT: ${talkTimeAnalysis.teacherPercent}%`} />
                  <div style={{ width: `${talkTimeAnalysis.studentPercent}%`, background: '#10b981' }} title={`STT: ${talkTimeAnalysis.studentPercent}%`} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#7a6552' }}>
                  <span>Professor (TTT): <strong>{Math.round((talkTimeAnalysis.teacherPercent / 100) * stages.reduce((acc, s) => acc + (s.durationMin || 0), 0))} min ({talkTimeAnalysis.teacherPercent}%)</strong></span>
                  <span>{talkTimeAnalysis.pedagogicalAdvice}</span>
                  <span>Alunos (STT): <strong>{Math.round((talkTimeAnalysis.studentPercent / 100) * stages.reduce((acc, s) => acc + (s.durationMin || 0), 0))} min ({talkTimeAnalysis.studentPercent}%)</strong></span>
                </div>
              </div>

              {/* Lista de Etapas do Roteiro */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {stages.map((stage, idx) => {
                  const tiers = stage.scaffoldingTiers || generateScaffoldingTiers(topic, stage.name, stage.studentAction)
                  const questions = stage.checkingQuestions || generateCheckingQuestions(topic, stage.name)

                  return (
                    <div
                      key={idx}
                      style={{
                        background: stage.completed ? '#f0fdf4' : '#fff',
                        border: stage.completed ? '1px solid #86efac' : '1px solid #e8decb',
                        borderRadius: RADIUS.md,
                        padding: 14,
                        transition: 'all 0.15s ease',
                        boxShadow: '0 1px 3px rgba(44,26,14,0.04)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220 }}>
                          <input
                            type="checkbox"
                            checked={stage.completed}
                            onChange={e => {
                              isPlanEditedByUser.current = true
                              const checked = e.target.checked
                              setStages(prev => prev.map((s, i) => i === idx ? { ...s, completed: checked } : s))
                            }}
                            title="Marcar etapa como executada em sala (atualiza o progresso e desbloqueia o log reflexivo)"
                            aria-label="Marcar etapa como executada em sala"
                            style={{ cursor: 'pointer', accentColor: '#10b981' }}
                          />
                          <span style={{ fontSize: TEXT.caption, fontWeight: 700, color: '#8b5e3c' }}>#{idx + 1}</span>
                          <input
                            value={stage.name}
                            onChange={e => {
                              isPlanEditedByUser.current = true
                              const val = e.target.value
                              setStages(prev => prev.map((s, i) => i === idx ? { ...s, name: val } : s))
                            }}
                            placeholder="Nome da Etapa..."
                            style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, fontWeight: 700, outline: 'none' }}
                          />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="number"
                              min={1}
                              max={120}
                              value={stage.durationMin}
                              onChange={e => {
                                isPlanEditedByUser.current = true
                                const val = Number(e.target.value) || 0
                                setStages(prev => prev.map((s, i) => i === idx ? { ...s, durationMin: val } : s))
                              }}
                              style={{ width: 45, padding: '4px 6px', borderRadius: 4, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 12, textAlign: 'center' }}
                            />
                            <span style={{ fontSize: 11, color: '#7a6552' }}>min</span>
                          </div>

                          {/* Botões rápidos de incremento de tempo (Fase 2.1) */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <button
                              type="button"
                              onClick={() => {
                                isPlanEditedByUser.current = true
                                setStages(prev => prev.map((s, i) => i === idx ? { ...s, durationMin: Math.max(1, (Number(s.durationMin) || 0) - 5) } : s))
                              }}
                              title="Reduzir 5 minutos desta etapa"
                              style={{
                                padding: '2px 5px', fontSize: 10, fontWeight: 700, borderRadius: 3,
                                border: '1px solid #e0d0be', background: '#fcf9f5', color: '#8b5e3c', cursor: 'pointer'
                              }}
                            >
                              -5m
                            </button>
                            {[5, 10, 15].map(inc => (
                              <button
                                key={inc}
                                type="button"
                                onClick={() => {
                                  isPlanEditedByUser.current = true
                                  setStages(prev => prev.map((s, i) => i === idx ? { ...s, durationMin: (Number(s.durationMin) || 0) + inc } : s))
                                }}
                                title={`Acrescentar +${inc} minutos a esta etapa`}
                                style={{
                                  padding: '2px 5px', fontSize: 10, fontWeight: 700, borderRadius: 3,
                                  border: '1px solid #e0d0be', background: '#fcf9f5', color: '#8b5e3c', cursor: 'pointer'
                                }}
                              >
                                +{inc}m
                              </button>
                            ))}
                          </div>

                          {/* Alerta sutil de estouro de carga horária da aula (Fase 2.1) */}
                          {totalTiming > targetDurationMinutes && (
                            <span
                              title={`O somatório total (${totalTiming} min) excede o tempo planejado da aula (${targetDurationMinutes} min)`}
                              style={{
                                fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fee2e2',
                                border: '1px solid #fecaca', padding: '1px 5px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 2
                              }}
                            >
                              ⚠️ Excesso (+{totalTiming - targetDurationMinutes}m)
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleRegenerateStage(idx)}
                            disabled={regeneratingStageIndex !== null || isGenerating}
                            title="Regenerar esta etapa com IA mantendo o restante do plano"
                            aria-label={`Regenerar etapa ${stage.name} com IA`}
                            style={{
                              background: regeneratingStageIndex === idx ? '#ede9fe' : '#f5efe6',
                              border: '1px solid #d5c0b0',
                              borderRadius: 4,
                              color: '#8b5e3c',
                              cursor: regeneratingStageIndex !== null ? 'not-allowed' : 'pointer',
                              padding: '3px 7px',
                              fontSize: 12,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <i
                              className={`ti ti-refresh ${regeneratingStageIndex === idx ? 'animate-spin' : ''}`}
                            />
                          </button>

                          {stageBackupHistory[idx] && (
                            <button
                              type="button"
                              onClick={() => handleRevertStage(idx)}
                              title="Desfazer regeneração e restaurar versão anterior desta etapa"
                              aria-label={`Desfazer regeneração da etapa ${stage.name}`}
                              style={{
                                background: '#fef3c7',
                                border: '1px solid #f59e0b',
                                borderRadius: 4,
                                color: '#92400e',
                                cursor: 'pointer',
                                padding: '3px 7px',
                                fontSize: 11,
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                            >
                              <i className="ti ti-arrow-back-up" /> Desfazer
                            </button>
                          )}

                          <button
                            onClick={() => {
                              isPlanEditedByUser.current = true
                              setStages(prev => prev.filter((_, i) => i !== idx))
                            }}
                            title="Excluir etapa"
                            aria-label={`Excluir etapa ${stage.name}`}
                            style={{ background: 'transparent', border: 'none', color: '#dc322f', cursor: 'pointer', padding: 4 }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Ações Professor e Aluno */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7a6552', marginBottom: 2 }}>Ação do Professor</label>
                          <textarea
                            value={stage.teacherAction}
                            onChange={e => {
                              isPlanEditedByUser.current = true
                              const val = e.target.value
                              setStages(prev => prev.map((s, i) => i === idx ? { ...s, teacherAction: val } : s))
                            }}
                            placeholder="O que o professor faz / orienta..."
                            rows={2}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 12, outline: 'none', resize: 'vertical', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: 1.4 }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7a6552', marginBottom: 2 }}>Ação do Aluno</label>
                          <textarea
                            value={stage.studentAction}
                            onChange={e => {
                              isPlanEditedByUser.current = true
                              const val = e.target.value
                              setStages(prev => prev.map((s, i) => i === idx ? { ...s, studentAction: val } : s))
                            }}
                            placeholder="O que os alunos produzem / realizam..."
                            rows={2}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 12, outline: 'none', resize: 'vertical', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: 1.4 }}
                          />
                        </div>
                      </div>

                      {/* Dinâmica de Interação e Referência de Livro/Material (Fase 1.3 & Fase 2.4) */}
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <label style={{ fontSize: 11, fontWeight: 700, color: '#7a6552', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>🤝 Dinâmica:</span>
                          </label>
                          <select
                            value={stage.interactionType || 'whole_class'}
                            onChange={e => {
                              isPlanEditedByUser.current = true
                              const val = e.target.value as StageInteractionType
                              setStages(prev => prev.map((s, i) => i === idx ? { ...s, interactionType: val } : s))
                            }}
                            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 11.5, fontWeight: 600, color: '#2c1a0e', outline: 'none' }}
                          >
                            <option value="whole_class">🏛️ Turma Toda</option>
                            <option value="pair">👥 Dupla (Aluno-Aluno)</option>
                            <option value="group">👨‍👩‍👧‍👦 Grupo Pequeno</option>
                            <option value="teacher_student">🧑‍🏫 Professor-Aluno</option>
                            <option value="individual">👤 Trabalho Individual</option>
                          </select>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 220 }}>
                          <label style={{ fontSize: 11, fontWeight: 700, color: '#7a6552', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                            <span>📖 Ref. Material:</span>
                          </label>
                          <input
                            value={stage.materialReference || ''}
                            onChange={e => {
                              isPlanEditedByUser.current = true
                              const val = e.target.value
                              setStages(prev => prev.map((s, i) => i === idx ? { ...s, materialReference: val } : s))
                            }}
                            placeholder="Ex: Livro pág. 42 ex. 3-5 ou Ficha 2..."
                            style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 11.5, outline: 'none' }}
                          />
                        </div>
                      </div>

                      {/* Micro-toolbar de Andaimes UDL e CCQs da Etapa */}
                      <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px dashed #e8decb', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => setExpandedScaffoldingStage(expandedScaffoldingStage === idx ? null : idx)}
                          style={{
                            background: expandedScaffoldingStage === idx ? '#ede9fe' : '#fff',
                            border: '1px solid #c4b5fd', borderRadius: 4, padding: '2px 8px', fontSize: 11,
                            color: '#6d28d9', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                          }}
                        >
                          <span>🪜</span> {expandedScaffoldingStage === idx ? 'Ocultar Andaimes UDL' : 'Andaimes UDL (Editável)'}
                        </button>

                        <button
                          type="button"
                          onClick={() => setExpandedCcqsStage(expandedCcqsStage === idx ? null : idx)}
                          style={{
                            background: expandedCcqsStage === idx ? '#e0f2fe' : '#fff',
                            border: '1px solid #7dd3fc', borderRadius: 4, padding: '2px 8px', fontSize: 11,
                            color: '#0369a1', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                          }}
                        >
                          <span>❓</span> {expandedCcqsStage === idx ? 'Ocultar CCQs / ICQs' : 'Perguntas de Checagem (CCQs / ICQs Editável)'}
                        </button>
                      </div>

                      {/* Gaveta de Andaimes UDL (3 Níveis) — Totalmente Editável (Fase 2.2) */}
                      {expandedScaffoldingStage === idx && (
                        <div style={{ marginTop: 8, padding: '10px 12px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 6, fontSize: 11.5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                            <strong style={{ color: '#5b21b6' }}>
                              🪜 Andaimes Diferenciados — Universal Design for Learning (UDL):
                            </strong>
                            <button
                              type="button"
                              onClick={() => {
                                isPlanEditedByUser.current = true
                                const freshTiers = generateScaffoldingTiers(topic, stage.name, stage.studentAction)
                                setStages(prev => prev.map((s, i) => i === idx ? { ...s, scaffoldingTiers: freshTiers } : s))
                                showNotification('Andaimes regenerados a partir do tópico e ação do aluno.')
                              }}
                              style={{
                                background: '#fff', border: '1px solid #c4b5fd', color: '#6d28d9',
                                borderRadius: 4, padding: '2px 6px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 4
                              }}
                            >
                              <span>✨</span> Sugerir / Redefinir com IA
                            </button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginTop: 6 }}>
                            <div style={{ background: '#fff', padding: 8, borderRadius: 4, border: '1px solid #c4b5fd' }}>
                              <span style={{ fontWeight: 700, color: '#6d28d9', display: 'block', marginBottom: 2 }}>🟢 Nível 1: Apoio Alto (Dica / Dificuldade)</span>
                              <textarea
                                value={stage.scaffoldingTiers?.tier1Support ?? tiers.tier1Support}
                                onChange={e => {
                                  isPlanEditedByUser.current = true
                                  const val = e.target.value
                                  setStages(prev => prev.map((s, i) => {
                                    if (i !== idx) return s
                                    const currentT = s.scaffoldingTiers || { ...tiers }
                                    return { ...s, scaffoldingTiers: { ...currentT, tier1Support: val } }
                                  }))
                                }}
                                placeholder="Dica, modelo ou sentence starters para alunos com dificuldade..."
                                rows={3}
                                style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid #e9d5ff', background: '#faf5ff', fontSize: 11, outline: 'none', resize: 'vertical', lineHeight: 1.35 }}
                              />
                            </div>
                            <div style={{ background: '#fff', padding: 8, borderRadius: 4, border: '1px solid #c4b5fd' }}>
                              <span style={{ fontWeight: 700, color: '#6d28d9', display: 'block', marginBottom: 2 }}>🟡 Nível 2: Padrão (Instrução Regular)</span>
                              <textarea
                                value={stage.scaffoldingTiers?.tier2Standard ?? tiers.tier2Standard}
                                onChange={e => {
                                  isPlanEditedByUser.current = true
                                  const val = e.target.value
                                  setStages(prev => prev.map((s, i) => {
                                    if (i !== idx) return s
                                    const currentT = s.scaffoldingTiers || { ...tiers }
                                    return { ...s, scaffoldingTiers: { ...currentT, tier2Standard: val } }
                                  }))
                                }}
                                placeholder="Instrução padrão da atividade..."
                                rows={3}
                                style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid #e9d5ff', background: '#faf5ff', fontSize: 11, outline: 'none', resize: 'vertical', lineHeight: 1.35 }}
                              />
                            </div>
                            <div style={{ background: '#fff', padding: 8, borderRadius: 4, border: '1px solid #c4b5fd' }}>
                              <span style={{ fontWeight: 700, color: '#6d28d9', display: 'block', marginBottom: 2 }}>🟣 Nível 3: Desafio / Extensão (Avançados)</span>
                              <textarea
                                value={stage.scaffoldingTiers?.tier3Extension ?? tiers.tier3Extension}
                                onChange={e => {
                                  isPlanEditedByUser.current = true
                                  const val = e.target.value
                                  setStages(prev => prev.map((s, i) => {
                                    if (i !== idx) return s
                                    const currentT = s.scaffoldingTiers || { ...tiers }
                                    return { ...s, scaffoldingTiers: { ...currentT, tier3Extension: val } }
                                  }))
                                }}
                                placeholder="Desafio adicional ou extensão metacognitiva para quem terminar antes..."
                                rows={3}
                                style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid #e9d5ff', background: '#faf5ff', fontSize: 11, outline: 'none', resize: 'vertical', lineHeight: 1.35 }}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Gaveta de CCQs & ICQs — Totalmente Editável (Fase 2.3) */}
                      {expandedCcqsStage === idx && (
                        <div style={{ marginTop: 8, padding: '10px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, fontSize: 11.5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                            <strong style={{ color: '#0369a1' }}>
                              ❓ Perguntas de Checagem Conceitual (CCQs) e de Instrução (ICQs):
                            </strong>
                            <button
                              type="button"
                              onClick={() => {
                                isPlanEditedByUser.current = true
                                const freshQuestions = generateCheckingQuestions(topic, stage.name)
                                setStages(prev => prev.map((s, i) => i === idx ? { ...s, checkingQuestions: freshQuestions } : s))
                                showNotification('Perguntas de checagem regeneradas com base no tópico.')
                              }}
                              style={{
                                background: '#fff', border: '1px solid #7dd3fc', color: '#0369a1',
                                borderRadius: 4, padding: '2px 6px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 4
                              }}
                            >
                              <span>✨</span> Sugerir / Redefinir com IA
                            </button>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <span style={{ fontWeight: 700, color: '#0284c7' }}>CCQs (Checagem de Significado):</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    isPlanEditedByUser.current = true
                                    setStages(prev => prev.map((s, i) => {
                                      if (i !== idx) return s
                                      const cur = s.checkingQuestions || { ...questions }
                                      return {
                                        ...s,
                                        checkingQuestions: {
                                          ...cur,
                                          ccqs: [...cur.ccqs, { question: '', expectedAnswer: '', targetConcept: '' }]
                                        }
                                      }
                                    }))
                                  }}
                                  style={{ background: '#e0f2fe', border: '1px solid #bae6fd', color: '#0369a1', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                                >
                                  + Adicionar CCQ
                                </button>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {(stage.checkingQuestions?.ccqs ?? questions.ccqs).map((q, qIdx) => (
                                  <div key={qIdx} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 4, padding: 6 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                      <span style={{ fontSize: 10, fontWeight: 700, color: '#0284c7' }}>Pergunta #{qIdx + 1}:</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          isPlanEditedByUser.current = true
                                          setStages(prev => prev.map((s, i) => {
                                            if (i !== idx) return s
                                            const cur = s.checkingQuestions || { ...questions }
                                            return {
                                              ...s,
                                              checkingQuestions: {
                                                ...cur,
                                                ccqs: cur.ccqs.filter((_, ci) => ci !== qIdx)
                                              }
                                            }
                                          }))
                                        }}
                                        style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 11, padding: 0 }}
                                        title="Remover CCQ"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                    <input
                                      value={q.question}
                                      onChange={e => {
                                        isPlanEditedByUser.current = true
                                        const val = e.target.value
                                        setStages(prev => prev.map((s, i) => {
                                          if (i !== idx) return s
                                          const cur = s.checkingQuestions || { ...questions }
                                          const updatedCcqs = cur.ccqs.map((item, ci) => ci === qIdx ? { ...item, question: val } : item)
                                          return { ...s, checkingQuestions: { ...cur, ccqs: updatedCcqs } }
                                        }))
                                      }}
                                      placeholder="Ex: A ação já acabou?"
                                      style={{ width: '100%', padding: '3px 6px', borderRadius: 3, border: '1px solid #e0f2fe', background: '#f8fafc', fontSize: 11, marginBottom: 3, outline: 'none' }}
                                    />
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <input
                                        value={q.expectedAnswer}
                                        onChange={e => {
                                          isPlanEditedByUser.current = true
                                          const val = e.target.value
                                          setStages(prev => prev.map((s, i) => {
                                            if (i !== idx) return s
                                            const cur = s.checkingQuestions || { ...questions }
                                            const updatedCcqs = cur.ccqs.map((item, ci) => ci === qIdx ? { ...item, expectedAnswer: val } : item)
                                            return { ...s, checkingQuestions: { ...cur, ccqs: updatedCcqs } }
                                          }))
                                        }}
                                        placeholder="Resposta esperada (ex: Sim)"
                                        style={{ flex: 1, padding: '3px 6px', borderRadius: 3, border: '1px solid #bbf7d0', background: '#f0fdf4', fontSize: 10.5, color: '#166534', outline: 'none' }}
                                      />
                                      <input
                                        value={q.targetConcept || ''}
                                        onChange={e => {
                                          isPlanEditedByUser.current = true
                                          const val = e.target.value
                                          setStages(prev => prev.map((s, i) => {
                                            if (i !== idx) return s
                                            const cur = s.checkingQuestions || { ...questions }
                                            const updatedCcqs = cur.ccqs.map((item, ci) => ci === qIdx ? { ...item, targetConcept: val } : item)
                                            return { ...s, checkingQuestions: { ...cur, ccqs: updatedCcqs } }
                                          }))
                                        }}
                                        placeholder="Conceito-alvo (opcional)"
                                        style={{ flex: 1, padding: '3px 6px', borderRadius: 3, border: '1px solid #e0f2fe', background: '#f8fafc', fontSize: 10.5, outline: 'none' }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div>
                              <span style={{ fontWeight: 700, color: '#0284c7', display: 'block', marginBottom: 4 }}>ICQs (Checagem da Dinâmica / Instruções):</span>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {(stage.checkingQuestions?.icqs ?? questions.icqs).map((q, qIdx) => (
                                  <div key={qIdx} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 4, padding: 6 }}>
                                    <div style={{ fontSize: 11, color: '#0369a1', fontWeight: 600, marginBottom: 2 }}>
                                      <strong>P:</strong> {q.question}
                                    </div>
                                    <div style={{ fontSize: 10.5, color: '#059669', fontWeight: 600 }}>
                                      <strong>R esperada:</strong> {q.expectedAnswer}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  isPlanEditedByUser.current = true
                  setStages(prev => [...prev, { name: 'Nova Etapa', durationMin: 5, teacherAction: '', studentAction: '', targetBnccCode: '', completed: false }])
                }}
                style={{ marginTop: 10, background: 'transparent', border: '1px dashed #8b5e3c', color: '#8b5e3c', borderRadius: RADIUS.md, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                + Adicionar Etapa ao Roteiro
              </button>
                </div>
              )}
            </div>

            {/* Box de Equilíbrio de Fala Estimado (Talk Time Ratio) */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: RADIUS.xl, overflow: 'hidden' }}>
              <div
                onClick={() => toggleBoxCollapse('equilibrioFala')}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 20px', cursor: 'pointer', userSelect: 'none',
                  background: collapsedBoxes['equilibrioFala'] ? '#fdf8f2' : 'transparent',
                  borderBottom: collapsedBoxes['equilibrioFala'] ? 'none' : '1px solid rgba(139,115,85,0.1)',
                  flexWrap: 'wrap', gap: 8
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <i className={`ti ti-chevron-${collapsedBoxes['equilibrioFala'] ? 'right' : 'down'}`} style={{ color: '#8b5e3c', fontSize: 14 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    🎙️ Equilíbrio de Fala Estimado (Talk Time Ratio)
                  </span>
                  <span style={{ fontSize: 11, background: '#f5efe6', color: '#8b5e3c', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                    Prof: {calculatedSpeechBalance.teacherPercent}% · Alunos: {calculatedSpeechBalance.studentPercent}% · Silêncio: {calculatedSpeechBalance.silencePercent}%
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {calculatedSpeechBalance.isHighTeacherTalk && (
                    <span style={{ fontSize: 11, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                      ⚠️ Fala Prof &gt; 75%
                    </span>
                  )}
                  <i className={`ti ti-chevron-${collapsedBoxes['equilibrioFala'] ? 'down' : 'up'}`} style={{ color: '#8b5e3c', fontSize: 13 }} />
                </div>
              </div>

              {!collapsedBoxes['equilibrioFala'] && (
                <div style={{ padding: 20 }}>
                  {/* Alerta não-bloqueante amigável se a fala agregada do professor for > 75% */}
                  {calculatedSpeechBalance.isHighTeacherTalk && (
                    <div style={{
                      background: '#fffbeb', border: '1px solid #fde68a', borderRadius: RADIUS.md,
                      padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10
                    }}>
                      <span style={{ fontSize: 18 }}>💡</span>
                      <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.4 }}>
                        <strong>Alerta Pedagógico de Equilíbrio:</strong> A estimativa agregada indica que o professor falará durante <strong>{calculatedSpeechBalance.teacherPercent}%</strong> do tempo da aula. Para maior retenção e fluência ativa dos alunos, considere incentivar trabalho em duplas ou produção autônoma.
                      </div>
                    </div>
                  )}

                  {/* Barra Visual Tricolor Agregada */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>
                      <span style={{ color: '#2563eb' }}>🧑‍🏫 Professor: {calculatedSpeechBalance.teacherPercent}% ({Math.round(calculatedSpeechBalance.totalMin * calculatedSpeechBalance.teacherPercent / 100)}m)</span>
                      <span style={{ color: '#16a34a' }}>👥 Alunos: {calculatedSpeechBalance.studentPercent}% ({Math.round(calculatedSpeechBalance.totalMin * calculatedSpeechBalance.studentPercent / 100)}m)</span>
                      <span style={{ color: '#d97706' }}>🤫 Silêncio / Autônomo: {calculatedSpeechBalance.silencePercent}% ({Math.round(calculatedSpeechBalance.totalMin * calculatedSpeechBalance.silencePercent / 100)}m)</span>
                    </div>

                    <div style={{ height: 16, borderRadius: RADIUS.full, overflow: 'hidden', display: 'flex', background: '#e2e8f0', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)' }}>
                      <div
                        style={{
                          width: `${calculatedSpeechBalance.teacherPercent}%`,
                          background: '#3b82f6',
                          transition: 'width 0.3s ease'
                        }}
                        title={`Professor: ${calculatedSpeechBalance.teacherPercent}%`}
                      />
                      <div
                        style={{
                          width: `${calculatedSpeechBalance.studentPercent}%`,
                          background: '#22c55e',
                          transition: 'width 0.3s ease'
                        }}
                        title={`Alunos: ${calculatedSpeechBalance.studentPercent}%`}
                      />
                      <div
                        style={{
                          width: `${calculatedSpeechBalance.silencePercent}%`,
                          background: '#f59e0b',
                          transition: 'width 0.3s ease'
                        }}
                        title={`Silêncio / Produção Individual: ${calculatedSpeechBalance.silencePercent}%`}
                      />
                    </div>
                  </div>

                  {/* Granularidade por Etapa */}
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#7a6552', display: 'block', marginBottom: 10 }}>
                      Distribuição por Etapa da Aula:
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {stages.map((stage, idx) => {
                        const sb = stage.speechBalance || (
                          stage.interactionType === 'pair' || stage.interactionType === 'group'
                            ? { teacherPercent: 20, studentPercent: 70, silencePercent: 10 }
                            : stage.interactionType === 'individual'
                              ? { teacherPercent: 10, studentPercent: 20, silencePercent: 70 }
                              : stage.interactionType === 'teacher_student'
                                ? { teacherPercent: 50, studentPercent: 45, silencePercent: 5 }
                                : { teacherPercent: 65, studentPercent: 25, silencePercent: 10 }
                        )

                        return (
                          <div key={idx} style={{
                            background: '#faf6f0', border: '1px solid #ede4d8', borderRadius: RADIUS.md,
                            padding: '10px 14px'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#2c1a0e' }}>
                                {idx + 1}. {stage.name} ({stage.durationMin}m)
                              </span>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#2563eb', fontWeight: 600 }}>
                                  <span>Prof:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={sb.teacherPercent}
                                    onChange={e => {
                                      isPlanEditedByUser.current = true
                                      const newT = Math.min(100, Math.max(0, Number(e.target.value) || 0))
                                      const remaining = 100 - newT
                                      const newS = Math.min(remaining, sb.studentPercent)
                                      const newSil = Math.max(0, remaining - newS)
                                      setStages(prev => prev.map((s, i) => i === idx ? {
                                        ...s,
                                        speechBalance: { teacherPercent: newT, studentPercent: newS, silencePercent: newSil }
                                      } : s))
                                    }}
                                    style={{ width: 44, padding: '2px 4px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 11, textAlign: 'center' }}
                                  />
                                  <span>%</span>
                                </label>

                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16a34a', fontWeight: 600 }}>
                                  <span>Alunos:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={sb.studentPercent}
                                    onChange={e => {
                                      isPlanEditedByUser.current = true
                                      const newS = Math.min(100, Math.max(0, Number(e.target.value) || 0))
                                      const remaining = 100 - newS
                                      const newT = Math.min(remaining, sb.teacherPercent)
                                      const newSil = Math.max(0, remaining - newT)
                                      setStages(prev => prev.map((s, i) => i === idx ? {
                                        ...s,
                                        speechBalance: { teacherPercent: newT, studentPercent: newS, silencePercent: newSil }
                                      } : s))
                                    }}
                                    style={{ width: 44, padding: '2px 4px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 11, textAlign: 'center' }}
                                  />
                                  <span>%</span>
                                </label>

                                <span style={{ color: '#d97706', fontWeight: 600 }}>
                                  Silêncio: {100 - (sb.teacherPercent || 0) - (sb.studentPercent || 0)}%
                                </span>
                              </div>
                            </div>

                            {/* Mini Barra Tricolor da Etapa */}
                            <div style={{ height: 8, borderRadius: RADIUS.full, overflow: 'hidden', display: 'flex', background: '#e2e8f0' }}>
                              <div style={{ width: `${sb.teacherPercent}%`, background: '#3b82f6' }} />
                              <div style={{ width: `${sb.studentPercent}%`, background: '#22c55e' }} />
                              <div style={{ width: `${Math.max(0, 100 - (sb.teacherPercent || 0) - (sb.studentPercent || 0))}%`, background: '#f59e0b' }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Evidências de Avaliação Formativa (UbD) */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: RADIUS.xl, overflow: 'hidden' }}>
              <div
                onClick={() => toggleBoxCollapse('ubd')}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 20px', cursor: 'pointer', userSelect: 'none',
                  background: collapsedBoxes['ubd'] ? '#fdf8f2' : 'transparent',
                  borderBottom: collapsedBoxes['ubd'] ? 'none' : '1px solid rgba(139,115,85,0.1)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <i className={`ti ti-chevron-${collapsedBoxes['ubd'] ? 'right' : 'down'}`} style={{ color: '#8b5e3c', fontSize: 14 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    🎯 Evidências de Avaliação Formativa (UbD — Understanding by Design)
                  </span>
                  {collapsedBoxes['ubd'] && assessmentEvidence && (
                    <span style={{ fontSize: 11.5, color: '#7a6552', fontWeight: 500, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      • {assessmentEvidence}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: '#7a6552' }}>Wiggins & McTighe</span>
                  <i className={`ti ti-chevron-${collapsedBoxes['ubd'] ? 'down' : 'up'}`} style={{ color: '#8b5e3c', fontSize: 13 }} />
                </div>
              </div>

              {!collapsedBoxes['ubd'] && (
                <div style={{ padding: 20 }}>
                  <p style={{ margin: '0 0 8px 0', fontSize: 11, color: '#7a6552', lineHeight: 1.4 }}>
                    Como o professor observará e verificará se os alunos alcançaram os objetivos da aula de {activeProfile.name}?
                  </p>
                  <textarea
                    value={assessmentEvidence}
                    onChange={e => {
                      isPlanEditedByUser.current = true
                      setAssessmentEvidence(e.target.value)
                    }}
                    placeholder="Ex: Produção textual curta aplicando as estruturas aprendidas, checagem oral individual ou desempenho na tarefa final comunicativa..."
                    rows={2}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: 13, outline: 'none', resize: 'vertical' }}
                  />
                </div>
              )}
            </div>

            {/* Tarefa de Casa & Anotações */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: RADIUS.xl, overflow: 'hidden' }}>
              <div
                onClick={() => toggleBoxCollapse('homework')}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 20px', cursor: 'pointer', userSelect: 'none',
                  background: collapsedBoxes['homework'] ? '#fdf8f2' : 'transparent',
                  borderBottom: collapsedBoxes['homework'] ? 'none' : '1px solid rgba(139,115,85,0.1)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <i className={`ti ti-chevron-${collapsedBoxes['homework'] ? 'right' : 'down'}`} style={{ color: '#8b5e3c', fontSize: 14 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    📦 Tarefa de Casa & Anotações Pós-Aula
                  </span>
                </div>
                <i className={`ti ti-chevron-${collapsedBoxes['homework'] ? 'down' : 'up'}`} style={{ color: '#8b5e3c', fontSize: 13 }} />
              </div>

              {!collapsedBoxes['homework'] && (
                <div style={{ padding: 20 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                        📦 Tarefa de Casa
                      </span>
                      <textarea
                        value={homework}
                        onChange={e => {
                          isPlanEditedByUser.current = true
                          setHomework(e.target.value)
                        }}
                        placeholder="Ex: Workbook p. 28 exercícios 1 a 3..."
                        rows={3}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: TEXT.bodyCompact, outline: 'none', resize: 'vertical' }}
                      />
                    </div>

                    <div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                        📦 Anotações Pós-Aula (Log Reflexivo)
                      </span>
                      <textarea
                        value={postLessonNotes}
                        onChange={e => {
                          isPlanEditedByUser.current = true
                          setPostLessonNotes(e.target.value)
                        }}
                        placeholder="Como a turma respondeu? Quais pontos precisam de revisão na próxima aula?"
                        rows={3}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fdf8f2', fontSize: TEXT.bodyCompact, outline: 'none', resize: 'vertical' }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ─── RODAPÉ DE AÇÃO COM HIERARQUIA VISUAL (BLOCO H) ───────── */}
            <div style={{
              background: '#fffcf8', border: '1px solid #d5c0b0', borderRadius: RADIUS.xl,
              padding: '16px 24px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexWrap: 'wrap', gap: 14, boxShadow: '0 4px 14px rgba(44,26,14,0.06)'
            }}>
              {/* Lado Esquerdo: Ações Secundárias & Utilitárias */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Dropdown Exportar */}
                <div ref={exportDropdownRef} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowExportDropdown(!showExportDropdown)
                      setShowSaveDropdown(false)
                    }}
                    style={{
                      padding: '8px 14px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0',
                      background: showExportDropdown ? '#f5efe6' : '#fff',
                      color: '#2c1a0e', fontSize: TEXT.bodyCompact, fontWeight: 700,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}
                    aria-haspopup="true"
                    aria-expanded={showExportDropdown}
                  >
                    <i className="ti ti-download" /> Exportar <i className={`ti ti-chevron-${showExportDropdown ? 'up' : 'down'}`} style={{ fontSize: 12 }} />
                  </button>

                  {showExportDropdown && (
                    <div role="menu" style={{
                      position: 'absolute', bottom: 'calc(100% + 6px)', left: 0,
                      background: '#fff', border: '1px solid #d5c0b0', borderRadius: RADIUS.md,
                      boxShadow: '0 8px 24px rgba(44,26,14,0.12)', zIndex: 40,
                      minWidth: 170, overflow: 'hidden', padding: 4
                    }}>
                      <button
                        role="menuitem"
                        onClick={() => { handleExportPdf(); setShowExportDropdown(false) }}
                        style={{ width: '100%', padding: '8px 12px', border: 'none', background: 'transparent', textAlign: 'left', fontSize: TEXT.caption, fontWeight: 600, color: '#2c1a0e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 4 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fdf8f2'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <i className="ti ti-printer" style={{ color: '#dc2626' }} /> PDF (.pdf)
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => { handleExportWord(); setShowExportDropdown(false) }}
                        style={{ width: '100%', padding: '8px 12px', border: 'none', background: 'transparent', textAlign: 'left', fontSize: TEXT.caption, fontWeight: 600, color: '#2c1a0e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 4 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fdf8f2'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <i className="ti ti-file-text" style={{ color: '#2563eb' }} /> Word (.doc)
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => { handleExportExcel(); setShowExportDropdown(false) }}
                        style={{ width: '100%', padding: '8px 12px', border: 'none', background: 'transparent', textAlign: 'left', fontSize: TEXT.caption, fontWeight: 600, color: '#2c1a0e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 4 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fdf8f2'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <i className="ti ti-table" style={{ color: '#16a34a' }} /> Excel (.csv)
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowAttachActivityModal(true)}
                  style={{ padding: '8px 14px', borderRadius: RADIUS.md, border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', fontSize: TEXT.bodyCompact, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <i className="ti ti-link" /> Anexar Atividade
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  style={{
                    padding: '8px 14px', borderRadius: RADIUS.md, border: '1.5px solid #8b5e3c',
                    background: '#fdf8f2', color: '#8b5e3c', fontSize: TEXT.bodyCompact,
                    fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  <i className="ti ti-eye" /> Visualizar Folha Limpa
                </button>

                <button
                  type="button"
                  onClick={() => setShowProgressView(true)}
                  className="flex items-center gap-2 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold shadow-sm transition-all"
                >
                  <i className="ti ti-player-play" /> Iniciar Aula
                </button>

                <button
                  type="button"
                  onClick={handleRafinhaAnalysis}
                  className="flex items-center gap-2 px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-all"
                >
                  <i className="ti ti-sparkles" /> Sugestão da Rafinha
                </button>
              </div>

              {/* Lado Direito: Salvamento & CTA Dominante */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Dropdown Salvar */}
                <div ref={saveDropdownRef} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSaveDropdown(!showSaveDropdown)
                      setShowExportDropdown(false)
                    }}
                    style={{
                      padding: '9px 16px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0',
                      background: showSaveDropdown ? '#f5efe6' : '#fff',
                      color: '#2c1a0e', fontSize: TEXT.bodyCompact, fontWeight: 700,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}
                    aria-haspopup="true"
                    aria-expanded={showSaveDropdown}
                  >
                    <i className="ti ti-device-floppy" /> Salvar ▾
                  </button>

                  {showSaveDropdown && (
                    <div role="menu" style={{
                      position: 'absolute', bottom: 'calc(100% + 6px)', right: 0,
                      background: '#fff', border: '1px solid #d5c0b0', borderRadius: RADIUS.md,
                      boxShadow: '0 8px 24px rgba(44,26,14,0.12)', zIndex: 40,
                      minWidth: 220, overflow: 'hidden', padding: 4
                    }}>
                      <button
                        role="menuitem"
                        onClick={() => { handleSaveToCalendar(); setShowSaveDropdown(false) }}
                        style={{ width: '100%', padding: '9px 12px', border: 'none', background: 'transparent', textAlign: 'left', fontSize: TEXT.caption, fontWeight: 600, color: '#2c1a0e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 4 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fdf8f2'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <i className="ti ti-calendar-plus" style={{ color: '#0284c7' }} /> Salvar no Calendário
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => { handleSaveToBank(); setShowSaveDropdown(false) }}
                        style={{ width: '100%', padding: '9px 12px', border: 'none', background: 'transparent', textAlign: 'left', fontSize: TEXT.caption, fontWeight: 600, color: '#2c1a0e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 4 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fdf8f2'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <i className="ti ti-database" style={{ color: '#d97706' }} /> Salvar no Banco
                      </button>
                      <div style={{ height: 1, background: '#ede8dc', margin: '4px 0' }} />
                      <button
                        role="menuitem"
                        onClick={() => { handleSaveBoth(); setShowSaveDropdown(false) }}
                        style={{ width: '100%', padding: '9px 12px', border: 'none', background: '#f5efe6', textAlign: 'left', fontSize: TEXT.caption, fontWeight: 700, color: '#8b5e3c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 4 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#ebdccb'}
                        onMouseLeave={e => e.currentTarget.style.background = '#f5efe6'}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <i className="ti ti-device-floppy" style={{ color: '#16a34a' }} /> Salvar em Ambos
                        </span>
                        <span style={{ fontSize: 9.5, background: '#16a34a', color: '#fff', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                          Recomendado
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                {/* CTA Dominante Principal: Gerar Pacote da Aula */}
                {stages.length > 0 && (
                  <Button
                    variant="primary"
                    size="md"
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      borderColor: '#047857',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: 14,
                      padding: '10px 20px',
                      boxShadow: '0 4px 16px rgba(16, 185, 129, 0.35)'
                    }}
                    icon={<i className="ti ti-package" style={{ fontSize: 17 }} />}
                    onClick={handleGenerateLessonPackage}
                    disabled={isGeneratingPackage}
                  >
                    {isGeneratingPackage ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="ti ti-loader" style={{ animation: 'spin 1s linear infinite' }} /> {packageProgressStep || 'Gerando Pacote...'}
                      </span>
                    ) : (
                      '📦 Gerar Pacote da Aula'
                    )}
                  </Button>
                )}
              </div>
            </div>

          </div>

          {/* ─── COLUNA LATERAL: DICAS DA ÚLTIMA AULA, PERGUNTAS-GUIA & HISTÓRICO ──── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Continuidade & Dicas da Última Aula */}
            <div style={{ background: '#fffcf7', border: '1.5px solid #d4944a', borderRadius: RADIUS.xl, overflow: 'hidden', boxShadow: '0 2px 10px rgba(212,148,74,0.08)' }}>
              <div
                onClick={() => toggleBoxCollapse('continuidade')}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 18px', cursor: 'pointer', userSelect: 'none',
                  background: collapsedBoxes['continuidade'] ? '#fdf8f2' : 'transparent',
                  borderBottom: collapsedBoxes['continuidade'] ? 'none' : '1px solid rgba(212,148,74,0.15)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <i className={`ti ti-chevron-${collapsedBoxes['continuidade'] ? 'right' : 'down'}`} style={{ color: '#a05e1a', fontSize: 14 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#a05e1a', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                    💡 Continuidade & Dicas da Última Aula
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10.5, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                    {currentClass?.name || 'Turma'}
                  </span>
                  <i className={`ti ti-chevron-${collapsedBoxes['continuidade'] ? 'down' : 'up'}`} style={{ color: '#a05e1a', fontSize: 13 }} />
                </div>
              </div>

              {!collapsedBoxes['continuidade'] && (
                <div style={{ padding: 18 }}>
                  <p style={{ fontSize: TEXT.caption, color: '#7a6552', margin: '0 0 12px 0', lineHeight: 1.35 }}>
                    Ganchos pedagógicos e conexões com o conteúdo ministrado anteriormente:
                  </p>

                  {lastLessonInfo.topic ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ background: '#fefbf6', border: '1px solid #e8decb', borderRadius: RADIUS.md, padding: 10 }}>
                        <div style={{ fontSize: 11, color: '#a08060', marginBottom: 2 }}>
                          Último Tópico Ministrado {lastLessonInfo.date ? `(${new Date(lastLessonInfo.date).toLocaleDateString('pt-BR')})` : ''}:
                        </div>
                        <strong style={{ fontSize: TEXT.bodyCompact, color: '#2c1a0e', display: 'block' }}>
                          {lastLessonInfo.topic}
                        </strong>
                        {lastLessonInfo.homework && (
                          <div style={{ marginTop: 6, fontSize: TEXT.caption, color: '#8b5e3c', background: '#fff', padding: '4px 8px', borderRadius: 6, border: '1px solid #ede8dc' }}>
                            <strong>Dever Passado:</strong> {lastLessonInfo.homework}
                          </div>
                        )}
                        {lastLessonInfo.notes && (
                          <div style={{ marginTop: 6, fontSize: 11, color: '#b45309', background: '#fffbeb', padding: '4px 8px', borderRadius: 6, border: '1px solid #fde68a', fontStyle: 'italic' }}>
                            &ldquo;{lastLessonInfo.notes}&rdquo;
                          </div>
                        )}
                      </div>

                      {/* Ações Rápidas de Continuidade */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button
                          type="button"
                          onClick={handleAddReviewWarmup}
                          style={{
                            padding: '6px 10px', borderRadius: RADIUS.md, border: '1px solid #d4944a',
                            background: '#fff', fontSize: TEXT.caption, color: '#a05e1a', cursor: 'pointer',
                            fontWeight: 700, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6
                          }}
                        >
                          <span>⚡</span> Inserir Warm-up de Revisão (+5 min)
                        </button>

                        {lastLessonInfo.homework && (
                          <button
                            type="button"
                            onClick={handleAddHomeworkCheck}
                            style={{
                              padding: '6px 10px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0',
                              background: '#fff', fontSize: TEXT.caption, color: '#8b5e3c', cursor: 'pointer',
                              fontWeight: 600, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6
                            }}
                          >
                            <span>📋</span> Inserir Checagem do Dever na 1ª Etapa
                          </button>
                        )}

                        {lastLessonInfo.skills && lastLessonInfo.skills.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSkills(lastLessonInfo.skills)
                              showNotification(`${lastLessonInfo.skills.length} habilidades copiadas da aula anterior!`)
                            }}
                            style={{
                              padding: '6px 10px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0',
                              background: '#fff', fontSize: TEXT.caption, color: '#8b5e3c', cursor: 'pointer',
                              fontWeight: 600, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6
                            }}
                          >
                            <span>🎯</span> Conectar Habilidades da Aula Anterior
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: '#fdf8f2', padding: 12, borderRadius: RADIUS.md, border: '1px solid #ede8dc', textAlign: 'center', color: '#a08060', fontSize: TEXT.caption }}>
                      <i className="ti ti-bulb" style={{ fontSize: 22, display: 'block', marginBottom: 4, color: '#d4944a' }} />
                      Nenhuma aula anterior salva para esta turma ainda. Ao planejar e salvar suas aulas, as dicas de revisão e continuidade aparecerão aqui automaticamente.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Perguntas-Guia (Key Questions) */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: RADIUS.xl, overflow: 'hidden' }}>
              <div
                onClick={() => toggleBoxCollapse('perguntasGuia')}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 18px', cursor: 'pointer', userSelect: 'none',
                  background: collapsedBoxes['perguntasGuia'] ? '#fdf8f2' : 'transparent',
                  borderBottom: collapsedBoxes['perguntasGuia'] ? 'none' : '1px solid rgba(139,115,85,0.1)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <i className={`ti ti-chevron-${collapsedBoxes['perguntasGuia'] ? 'right' : 'down'}`} style={{ color: '#8b5e3c', fontSize: 14 }} />
                  <span style={{ fontSize: TEXT.caption, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }}>
                    ❓ Perguntas-Guia (Key Questions)
                  </span>
                  {collapsedBoxes['perguntasGuia'] && (
                    <span style={{ fontSize: 11.5, color: '#7a6552', fontWeight: 500 }}>
                      • {guidingQuestions.filter(Boolean).length} perguntas
                    </span>
                  )}
                </div>
                <i className={`ti ti-chevron-${collapsedBoxes['perguntasGuia'] ? 'down' : 'up'}`} style={{ color: '#8b5e3c', fontSize: 13 }} />
              </div>

              {!collapsedBoxes['perguntasGuia'] && (
                <div style={{ padding: 18 }}>
                  <p style={{ fontSize: TEXT.caption, color: '#7a6552', margin: '0 0 10px 0', lineHeight: 1.35 }}>
                    O que os alunos devem ser capazes de responder ou demonstrar ao final desta aula:
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {guidingQuestions.map((q, idx) => (
                      <textarea
                        key={idx}
                        rows={2}
                        value={q}
                        placeholder="Ex: Como os alunos utilizam a estrutura para expressar ideias reais?"
                        onChange={e => {
                          isPlanEditedByUser.current = true
                          const val = e.target.value
                          setGuidingQuestions(prev => prev.map((qItem, i) => i === idx ? val : qItem))
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: 6,
                          border: '1px solid #d5c0b0',
                          background: '#fdf8f2',
                          fontSize: 12,
                          color: '#2c1a0e',
                          outline: 'none',
                          resize: 'vertical',
                          lineHeight: 1.4,
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word',
                          fontFamily: 'inherit',
                          boxSizing: 'border-box'
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Histórico de Aulas */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: RADIUS.xl, overflow: 'hidden' }}>
              <div
                onClick={() => toggleBoxCollapse('historico')}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 18px', cursor: 'pointer', userSelect: 'none',
                  background: collapsedBoxes['historico'] ? '#fdf8f2' : 'transparent',
                  borderBottom: collapsedBoxes['historico'] ? 'none' : '1px solid rgba(139,115,85,0.1)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <i className={`ti ti-chevron-${collapsedBoxes['historico'] ? 'right' : 'down'}`} style={{ color: '#8b5e3c', fontSize: 14 }} />
                  <span style={{ fontSize: TEXT.caption, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }}>
                    ⏮️ Histórico de Aulas ({currentClass?.name || 'Turma'})
                  </span>
                  {collapsedBoxes['historico'] && (
                    <span style={{ fontSize: 11.5, color: '#7a6552', fontWeight: 500 }}>
                      • {classHistoryPlans.length} aulas salvas
                    </span>
                  )}
                </div>
                <i className={`ti ti-chevron-${collapsedBoxes['historico'] ? 'down' : 'up'}`} style={{ color: '#8b5e3c', fontSize: 13 }} />
              </div>

              {!collapsedBoxes['historico'] && (
                <div style={{ padding: 18 }}>
                  {classHistoryPlans.length === 0 ? (
                    <p style={{ fontSize: 12, color: '#a08060', margin: 0 }}>
                      Nenhum plano anterior salvo no banco para esta turma.
                    </p>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, color: '#7a6552' }}>
                          Aula {historyIndex + 1} de {classHistoryPlans.length}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            disabled={historyIndex >= classHistoryPlans.length - 1}
                            onClick={() => setHistoryIndex(historyIndex + 1)}
                            style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #d5c0b0', background: '#fff', cursor: 'pointer', fontSize: 11 }}
                          >
                            ◀ Mais Antiga
                          </button>
                          <button
                            disabled={historyIndex <= 0}
                            onClick={() => setHistoryIndex(historyIndex - 1)}
                            style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #d5c0b0', background: '#fff', cursor: 'pointer', fontSize: 11 }}
                          >
                            Mais Recente ▶
                          </button>
                        </div>
                      </div>

                      {classHistoryPlans[historyIndex] && (() => {
                        const prevPlan = classHistoryPlans[historyIndex]
                        return (
                          <div style={{ background: '#fdf8f2', padding: 12, borderRadius: RADIUS.md, border: '1px solid #e8decb', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <strong style={{ fontSize: TEXT.bodyCompact, color: '#2c1a0e', display: 'block' }}>
                              {prevPlan.topic}
                            </strong>
                            <div style={{ fontSize: 11, color: '#8b5e3c' }}>
                              📅 {new Date(prevPlan.date).toLocaleDateString('pt-BR')} &bull; Metodologia: {prevPlan.methodology?.toUpperCase() || 'TBLT'}
                            </div>
                            {prevPlan.referenceMaterial?.bookTitle && (
                              <div style={{ fontSize: 11, color: '#2aa198' }}>
                                📖 {prevPlan.referenceMaterial.bookTitle} {prevPlan.referenceMaterial.unit ? `(${prevPlan.referenceMaterial.unit})` : ''}
                              </div>
                            )}
                            <div style={{ fontSize: TEXT.caption, color: '#4a382a', lineHeight: 1.35 }}>
                              <strong>Dever de Casa:</strong> {prevPlan.homework || 'Nenhum'}
                            </div>
                            {prevPlan.postLessonNotes && (
                              <div style={{ fontSize: 11, color: '#7a6552', fontStyle: 'italic', background: '#fff', padding: '6px 8px', borderRadius: 6, border: '1px solid #ede8dc' }}>
                                &ldquo;{prevPlan.postLessonNotes}&rdquo;
                              </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                              {prevPlan.homework && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setHomework(prevPlan.homework)
                                    showNotification('Dever de casa da aula anterior copiado!')
                                  }}
                                  style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d5c0b0', background: '#fff', fontSize: 11, color: '#8b5e3c', cursor: 'pointer', fontWeight: 600, textAlign: 'left' }}
                                >
                                  📋 Copiar Dever para Hoje
                                </button>
                              )}
                              {prevPlan.selectedSkills && prevPlan.selectedSkills.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedSkills(prevPlan.selectedSkills)
                                    showNotification(`${prevPlan.selectedSkills.length} habilidades copiadas da aula anterior!`)
                                  }}
                                  style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d5c0b0', background: '#fff', fontSize: 11, color: '#8b5e3c', cursor: 'pointer', fontWeight: 600, textAlign: 'left' }}
                                >
                                  🎯 Copiar {prevPlan.selectedSkills.length} Habilidades
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setPlanId(prevPlan.id)
                                  setTopic(prevPlan.topic)
                                  if (prevPlan.date) setLessonDate(prevPlan.date)
                                  if (prevPlan.roomSpace) setRoomSpace(prevPlan.roomSpace)
                                  if (prevPlan.methodology) setSelectedMethodology(prevPlan.methodology)
                                  if (prevPlan.referenceMaterial) {
                                    setBookTitle(prevPlan.referenceMaterial.bookTitle || '')
                                    setUnitChapter(prevPlan.referenceMaterial.unit || '')
                                    setPages(prevPlan.referenceMaterial.pages || '')
                                    if (Array.isArray(prevPlan.referenceMaterial.sharedClassIds)) {
                                      setSharedClassIds(prevPlan.referenceMaterial.sharedClassIds)
                                    }
                                  }
                                  if (prevPlan.stages && prevPlan.stages.length > 0) setStages(prevPlan.stages)
                                  if (prevPlan.guidingQuestions) setGuidingQuestions(prevPlan.guidingQuestions)
                                  if (prevPlan.selectedSkills) setSelectedSkills(prevPlan.selectedSkills)
                                  if (prevPlan.homework) setHomework(prevPlan.homework)
                                  if (prevPlan.postLessonNotes) setPostLessonNotes(prevPlan.postLessonNotes)
                                  if (prevPlan.targetDurationMinutes) setTargetDurationMinutes(prevPlan.targetDurationMinutes)
                                  if (prevPlan.assessmentEvidence) setAssessmentEvidence(prevPlan.assessmentEvidence)
                                  setDescription(prevPlan.description || '')
                                  setGeneralObjective(prevPlan.generalObjective || '')
                                  setSpecificObjectives(prevPlan.specificObjectives || '')
                                  setSocioemotionalObjectives(prevPlan.socioemotionalObjectives || '')
                                  setLessonGoal(prevPlan.lessonGoal || '')
                                  setAnticipatedProblems(prevPlan.anticipatedProblems || '')
                                  setPriorKnowledge(prevPlan.priorKnowledge || '')
                                  setPreTeach(prevPlan.preTeach || '')
                                  setPeiStudentId(prevPlan.peiStudentId || '')
                                  setPeiStudentName(prevPlan.peiStudentName || '')
                                  setPeiDiagnosis(prevPlan.peiDiagnosis || '')
                                  setPeiAccommodations(prevPlan.peiAccommodations || '')
                                  setDidacticSequenceRef(prevPlan.didacticSequenceRef || undefined)
                                  isPlanEditedByUser.current = true
                                  showNotification(`Plano "${prevPlan.topic}" carregado para reutilização!`)
                                }}
                                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #8b5e3c', background: '#f5efe6', fontSize: 11, color: '#8b5e3c', cursor: 'pointer', fontWeight: 700, textAlign: 'left' }}
                              >
                                📂 Carregar este Plano Completo
                              </button>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>

        </div>
      )}

      {/* ─── ABA DOC: EDITOR TIPO WORD (DOCUMENT CANVAS) ─────────────── */}
      {activeTab === 'doc' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            background: '#fffcf8', border: '1px solid rgba(139,115,85,0.18)', borderRadius: RADIUS.xl,
            padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#2c1a0e', fontFamily: "'Fraunces', Georgia, serif" }}>
                Editor de Documento (Modo Word)
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#7a6552' }}>
                Edite o plano em prosa contínua com formatação rica, fontes, alinhamentos, listas e tabelas.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const md = generatePlanMarkdown()
                  const html = formatMarkdownToHtml(md)
                  setDocContent(html)
                  toast.info('Conteúdo recarregado e sincronizado a partir dos boxes estruturados.')
                }}
                icon={<i className="ti ti-refresh" />}
              >
                Recarregar dos Boxes
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveToBank}
                icon={<i className="ti ti-device-floppy" />}
              >
                Salvar no Banco
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportPdf}
                icon={<i className="ti ti-file-type-pdf" />}
              >
                Exportar PDF
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportWord}
                icon={<i className="ti ti-file-type-doc" />}
              >
                Exportar Word
              </Button>
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: RADIUS.xl, border: '1px solid rgba(139,115,85,0.16)', overflow: 'hidden' }}>
            <DocumentCanvas
              content={docContent}
              onContentChange={(html) => {
                isPlanEditedByUser.current = true
                setDocContent(html)
              }}
              headerData={{
                school: currentSchool?.name || 'Escola',
                teacher: 'Professor(a)',
                title: topic || 'Plano de Aula'
              }}
              headerFields={{
                date: lessonDate,
                teacher: 'Professor(a)',
                classGroup: currentClass?.name || 'Turma',
                student: peiStudentName || '',
                subject: activeProfile.name || 'Disciplina',
                gradeValue: currentClass?.gradeYear || ''
              }}
            />
          </div>
        </div>
      )}

      {/* ─── ABA 2: FOLHA DE PLANEJAMENTO (DOCUMENTO LIMPO) ───────────────── */}
      {activeTab === 'preview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 960, margin: '0 auto' }}>
          
          {/* Barra Superior de Ações do Documento Limpo */}
          <div style={{
            background: '#fffcf8', border: '1px solid #d5c0b0', borderRadius: RADIUS.lg,
            padding: '14px 20px', display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', flexWrap: 'wrap', gap: 10, boxShadow: '0 2px 8px rgba(44,26,14,0.06)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => setActiveTab('editor')}
                style={{ padding: '7px 14px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fff', color: '#8b5e3c', fontSize: TEXT.bodyCompact, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <i className="ti ti-arrow-left"></i> Voltar para Edição do Plano
              </button>
              <span style={{ fontSize: TEXT.bodyCompact, color: '#7a6552', fontWeight: 600 }}>
                Visualização Oficial do Plano de Aula
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={handleCopyCleanText} style={{ padding: '7px 14px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fff', color: '#2c1a0e', fontSize: TEXT.bodyCompact, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-copy"></i> Copiar Texto
              </button>
              <button onClick={handleExportPdf} style={{ padding: '7px 14px', borderRadius: RADIUS.md, border: '1px solid #8b5e3c', background: '#8b5e3c', color: '#fff', fontSize: TEXT.bodyCompact, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-printer"></i> Imprimir / PDF
              </button>
              <button onClick={handleExportWord} style={{ padding: '7px 14px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fff', color: '#2c1a0e', fontSize: TEXT.bodyCompact, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-file-text"></i> Word (.doc)
              </button>
              <button onClick={handleExportExcel} style={{ padding: '7px 14px', borderRadius: RADIUS.md, border: '1px solid #d5c0b0', background: '#fff', color: '#2c1a0e', fontSize: TEXT.bodyCompact, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-table"></i> Excel (.csv)
              </button>
            </div>
          </div>

          {/* Folha Formal de Planejamento (A4 Paper Style) */}
          <div style={{
            background: '#ffffff', border: '1px solid #e2d9cc', borderRadius: RADIUS.lg,
            padding: '44px 52px', boxShadow: '0 4px 20px rgba(44,26,14,0.08)',
            fontFamily: 'Inter, system-ui, sans-serif', color: '#1f2937'
          }}>
            
            {/* Cabeçalho Oficial Escolar */}
            <div style={{ borderBottom: '2px solid #2c1a0e', paddingBottom: 16, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
              <div>
                <h2 style={{ margin: '0 0 4px 0', fontSize: 20, fontFamily: 'Fraunces, Georgia, serif', color: '#2c1a0e', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {currentSchool?.name || 'ESCOLA DE ENSINO BÁSICO'}
                </h2>
                <div style={{ fontSize: 13, color: '#4b5563' }}>
                  <strong>Plano de Aula</strong> &bull; Disciplina: <strong>{currentClass?.subject || 'Língua Inglesa'}</strong>
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: TEXT.bodyCompact, color: '#4b5563', lineHeight: 1.45 }}>
                <div><strong>Turma:</strong> {currentClass?.name || 'Turma'} ({currentClass?.gradeYear || '9º Ano'})</div>
                <div><strong>Data:</strong> {new Date(lessonDate).toLocaleDateString('pt-BR')}</div>
                <div><strong>Espaço:</strong> {roomSpace}</div>
              </div>
            </div>

            {/* Metodologia e Material */}
            <div style={{ background: '#faf6f0', border: '1px solid #ede4d8', borderRadius: RADIUS.md, padding: '12px 16px', marginBottom: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
              <div>
                <strong style={{ color: '#8b5e3c' }}>Metodologia:</strong>{' '}
                <span>{METHODOLOGY_PRESETS.find(m => m.id === selectedMethodology)?.name || 'TBLT'}</span>
              </div>
              <div>
                <strong style={{ color: '#8b5e3c' }}>Material Didático:</strong>{' '}
                <span>{bookTitle || 'Não especificado'} {unitChapter ? `(${unitChapter})` : ''} {pages ? `[${pages}]` : ''}</span>
              </div>
            </div>

            {/* Banner de Adaptação Curricular Individual (PDI / PEI) */}
            {peiStudentName && (
              <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: RADIUS.md, padding: '10px 14px', marginBottom: 20, fontSize: 12.5, color: '#5b21b6' }}>
                <strong style={{ color: '#4c1d95' }}>Adaptação Curricular Individual (PDI / PEI):</strong> Aluno(a) <strong>{peiStudentName}</strong> &bull; Diagnóstico: <em>{peiDiagnosis || 'NEE'}</em> &bull; Acomodações: <em>{peiAccommodations || 'Adaptação pedagógica ativa'}</em>
              </div>
            )}

            {/* Título do Conteúdo */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                Tópico Curricular
              </div>
              <h1 style={{ margin: 0, fontSize: 22, fontFamily: 'Fraunces, Georgia, serif', color: '#2c1a0e' }}>
                {topic || 'Tópico da Aula'}
              </h1>
            </div>

            {/* Descrição Geral da Aula */}
            {description && (
              <div style={{ marginBottom: 20, background: '#faf8f5', border: '1px solid #ede4d8', borderRadius: RADIUS.md, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5e3c', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                  Descrição da Aula
                </div>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                  {description}
                </div>
              </div>
            )}

            {/* Objetivos de Aprendizagem (3 Dimensões) */}
            {(generalObjective || specificObjectives || socioemotionalObjectives) && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#2c1a0e', borderBottom: '1px solid #e5e7eb', paddingBottom: 6, marginBottom: 12 }}>
                  Objetivos de Aprendizagem
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  {generalObjective && (
                    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: RADIUS.md, padding: '10px 12px' }}>
                      <strong style={{ fontSize: 12, color: '#8b5e3c', display: 'block', marginBottom: 4 }}>1. Objetivo Geral</strong>
                      <div style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.4 }}>{generalObjective}</div>
                    </div>
                  )}
                  {specificObjectives && (
                    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: RADIUS.md, padding: '10px 12px' }}>
                      <strong style={{ fontSize: 12, color: '#8b5e3c', display: 'block', marginBottom: 4 }}>2. Objetivos Específicos</strong>
                      <div style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.4, whiteSpace: 'pre-line' }}>{specificObjectives}</div>
                    </div>
                  )}
                  {socioemotionalObjectives && (
                    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: RADIUS.md, padding: '10px 12px' }}>
                      <strong style={{ fontSize: 12, color: '#8b5e3c', display: 'block', marginBottom: 4 }}>3. Objetivos Socioemocionais</strong>
                      <div style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.4, whiteSpace: 'pre-line' }}>{socioemotionalObjectives}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Meta da Aula */}
            {lessonGoal && (
              <div style={{ marginBottom: 20, padding: '10px 14px', background: '#fefce8', border: '1px solid #fef08a', borderRadius: RADIUS.md }}>
                <strong style={{ fontSize: 11.5, color: '#854d0e', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 2 }}>
                  Meta da Aula (Critério de Sucesso)
                </strong>
                <div style={{ fontSize: 13, color: '#713f12', fontWeight: 600 }}>{lessonGoal}</div>
              </div>
            )}

            {/* Diagnóstico Prévio & Problemas Antecipados */}
            {(priorKnowledge || anticipatedProblems) && (
              <div style={{ marginBottom: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {priorKnowledge && (
                  <div style={{ background: '#fbfbfb', border: '1px solid #e5e7eb', borderRadius: RADIUS.md, padding: '10px 14px' }}>
                    <strong style={{ fontSize: 12, color: '#8b5e3c', display: 'block', marginBottom: 4 }}>Conhecimento Prévio</strong>
                    <div style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.4 }}>{priorKnowledge}</div>
                  </div>
                )}
                {anticipatedProblems && (
                  <div style={{ background: '#fbfbfb', border: '1px solid #e5e7eb', borderRadius: RADIUS.md, padding: '10px 14px' }}>
                    <strong style={{ fontSize: 12, color: '#dc2626', display: 'block', marginBottom: 4 }}>Problemas Antecipados</strong>
                    <div style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.4 }}>{anticipatedProblems}</div>
                  </div>
                )}
              </div>
            )}

            {/* Vocabulário & Conceitos Prévios (Pre-teach — Fase 2.5) */}
            {preTeach && (
              <div style={{ marginBottom: 24, background: '#fdf4ff', border: '1px solid #f0abfc', borderRadius: RADIUS.md, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#a21caf', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                  Vocabulário e Conceitos Prévios (Pre-teach)
                </div>
                <div style={{ fontSize: 13, color: '#701a75', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                  {preTeach}
                </div>
              </div>
            )}

            {/* 1. Competências e Habilidades BNCC */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#2c1a0e', borderBottom: '1px solid #e5e7eb', paddingBottom: 6, marginBottom: 10 }}>
                1. Competências & Habilidades BNCC
              </h3>
              {selectedSkills.length === 0 ? (
                <p style={{ fontSize: 13, color: '#6b7280', margin: 0, fontStyle: 'italic' }}>Nenhuma habilidade específica vinculada.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#374151', lineHeight: 1.4 }}>
                  {selectedSkills.map(s => (
                    <li key={s.code}>
                      <strong style={{ color: '#8b5e3c' }}>[{s.code}]</strong> {s.desc}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 2. Perguntas-Guia */}
            {guidingQuestions.filter(q => q.trim()).length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#2c1a0e', borderBottom: '1px solid #e5e7eb', paddingBottom: 6, marginBottom: 10 }}>
                  2. Perguntas-Guia da Aula
                </h3>
                <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#374151', fontStyle: 'italic' }}>
                  {guidingQuestions.filter(q => q.trim()).map((q, idx) => (
                    <li key={idx} style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>&ldquo;{q}&rdquo;</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 3. Roteiro & Cronograma da Aula */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: 6, marginBottom: 10 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#2c1a0e', margin: 0 }}>
                  3. Roteiro & Cronograma da Aula
                </h3>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#8b5e3c' }}>
                  Tempo Total: {totalTiming} min
                </span>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: TEXT.bodyCompact, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #cbd5e1' }}>
                    <th style={{ padding: '8px 10px', width: '16%', color: '#334155' }}>Etapa</th>
                    <th style={{ padding: '8px 10px', width: '8%', color: '#334155' }}>Duração</th>
                    <th style={{ padding: '8px 10px', width: '11%', color: '#334155' }}>Dinâmica</th>
                    <th style={{ padding: '8px 10px', width: '13%', color: '#334155' }}>Ref. Material</th>
                    <th style={{ padding: '8px 10px', width: '10%', color: '#334155' }}>Cód. BNCC</th>
                    <th style={{ padding: '8px 10px', width: '21%', color: '#334155' }}>Ação do Professor</th>
                    <th style={{ padding: '8px 10px', width: '21%', color: '#334155' }}>Ação dos Alunos</th>
                  </tr>
                </thead>
                <tbody>
                  {stages.map((stg, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '10px', fontWeight: 600, color: '#2c1a0e', verticalAlign: 'top', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                        {stg.name}
                      </td>
                      <td style={{ padding: '10px', color: '#64748b', verticalAlign: 'top', fontWeight: 600 }}>
                        {stg.durationMin} min
                      </td>
                      <td style={{ padding: '10px', color: '#4338ca', verticalAlign: 'top', fontWeight: 600, fontSize: 11 }}>
                        {stg.interactionType === 'pair' ? 'Dupla' :
                         stg.interactionType === 'group' ? 'Grupo' :
                         stg.interactionType === 'individual' ? 'Individual' :
                         stg.interactionType === 'teacher_student' ? 'Prof-Aluno' : 'Turma Toda'}
                      </td>
                      <td style={{ padding: '10px', color: '#0369a1', verticalAlign: 'top', fontSize: 11 }}>
                        {stg.materialReference ? (
                          <span style={{ background: '#f0f9ff', color: '#0369a1', padding: '2px 6px', borderRadius: 4, display: 'inline-block', border: '1px solid #bae6fd' }}>
                            {stg.materialReference}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '10px', color: '#8b5e3c', verticalAlign: 'top', fontWeight: 700, fontSize: 11 }}>
                        {stg.targetBnccCode ? (
                          <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: 4, display: 'inline-block' }}>
                            {stg.targetBnccCode}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '10px', color: '#374151', verticalAlign: 'top', lineHeight: 1.35, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                        {stg.teacherAction || '—'}
                      </td>
                      <td style={{ padding: '10px', color: '#374151', verticalAlign: 'top', lineHeight: 1.35, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                        {stg.studentAction || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Andaimes e CCQs das Etapas (Fase 2.2 & 2.3) */}
              {stages.some(s => (s.scaffoldingTiers && (s.scaffoldingTiers.tier1Support || s.scaffoldingTiers.tier3Extension)) || (s.checkingQuestions && s.checkingQuestions.ccqs && s.checkingQuestions.ccqs.length > 0)) && (
                <div style={{ marginTop: 16, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: RADIUS.md, padding: '12px 16px' }}>
                  <strong style={{ fontSize: 12, color: '#6d28d9', display: 'block', marginBottom: 8 }}>
                    Andaimes Pedagógicos &amp; Perguntas de Checagem (CCQs) do Roteiro:
                  </strong>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                    {stages.map((stg, i) => {
                      const hasScaffold = stg.scaffoldingTiers?.tier1Support || stg.scaffoldingTiers?.tier3Extension
                      const hasCcq = stg.checkingQuestions?.ccqs && stg.checkingQuestions.ccqs.length > 0
                      if (!hasScaffold && !hasCcq) return null
                      return (
                        <div key={i} style={{ borderBottom: '1px dashed #ddd6fe', paddingBottom: 6 }}>
                          <strong style={{ color: '#5b21b6' }}>Etapa #{i + 1} — {stg.name}:</strong>
                          {hasScaffold && (
                            <div style={{ color: '#4c1d95', marginLeft: 12, marginTop: 2 }}>
                              <span style={{ fontWeight: 600 }}>Andaimes:</span> Apoio: <em>{stg.scaffoldingTiers?.tier1Support || '—'}</em> | Desafio: <em>{stg.scaffoldingTiers?.tier3Extension || '—'}</em>
                            </div>
                          )}
                          {hasCcq && (
                            <div style={{ color: '#0369a1', marginLeft: 12, marginTop: 2 }}>
                              <span style={{ fontWeight: 600 }}>CCQs:</span> {stg.checkingQuestions?.ccqs.map(c => `"${c.question}" (R: ${c.expectedAnswer})`).join('; ')}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 4. Tarefa de Casa (Homework) */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#2c1a0e', borderBottom: '1px solid #e5e7eb', paddingBottom: 6, marginBottom: 10 }}>
                4. Tarefa de Casa (Homework)
              </h3>
              <div style={{ fontSize: 13, color: '#374151', background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: RADIUS.md, padding: '10px 14px', lineHeight: 1.4 }}>
                {homework || 'Nenhum dever de casa atribuído para esta aula.'}
              </div>
            </div>

            {/* 5. Observações Pedagógicas */}
            {postLessonNotes && (
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#2c1a0e', borderBottom: '1px solid #e5e7eb', paddingBottom: 6, marginBottom: 10 }}>
                  5. Observações Pedagógicas & Log Reflexivo
                </h3>
                <div style={{ fontSize: 13, color: '#4b5563', fontStyle: 'italic', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: RADIUS.md, padding: '10px 14px', lineHeight: 1.4 }}>
                  &ldquo;{postLessonNotes}&rdquo;
                </div>
              </div>
            )}

          </div>

        </div>
      )}

      {/* ─── ABA 3: BANCO DE PLANEJAMENTO (REPOSITÓRIO PERENE) ──────────────── */}
      {activeTab === 'bank' && (
        <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: RADIUS.xl, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 20, color: '#2c1a0e', margin: '0 0 4px 0' }}>
                Acervo de Planos de Aula Salvos
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: '#7a6552' }}>
                Planos perenes recuperáveis e reutilizáveis ano a ano por turma e tópico curricular.
              </p>
            </div>
          </div>

          {bankPlans.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#a08060' }}>
              <i className="ti ti-archive" style={{ fontSize: 48, opacity: 0.4, marginBottom: 12 }}></i>
              <p>Nenhum plano salvo no banco ainda. Crie um plano na aba anterior e clique em "Salvar no Banco".</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {bankPlans.map(plan => {
                const isInline = inlineEditingPlanId === plan.id
                return (
                  <div key={plan.id} style={{ background: isInline ? '#fff' : '#fdf8f2', border: isInline ? '1.5px solid #8b5e3c' : '1px solid #e8decb', borderRadius: RADIUS.lg, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: isInline ? '0 4px 16px rgba(139,94,60,0.12)' : 'none' }}>
                    {isInline ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#8b5e3c' }}>✏️ Edição Rápida Inline</span>
                          <span style={{ fontSize: 11, background: '#f5efe6', color: '#7a5c42', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>{plan.className}</span>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7a6552', marginBottom: 2 }}>Tópico / Título</label>
                          <input
                            value={inlineTopic}
                            onChange={e => setInlineTopic(e.target.value)}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #d5c0b0', fontSize: 12, background: '#fff', outline: 'none' }}
                          />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7a6552', marginBottom: 2 }}>Data</label>
                            <input
                              type="date"
                              value={inlineDate}
                              onChange={e => setInlineDate(e.target.value)}
                              style={{ width: '100%', padding: '5px 6px', borderRadius: 4, border: '1px solid #d5c0b0', fontSize: 11, background: '#fff' }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7a6552', marginBottom: 2 }}>Espaço</label>
                            <input
                              value={inlineRoom}
                              onChange={e => setInlineRoom(e.target.value)}
                              placeholder="Sala de Aula"
                              style={{ width: '100%', padding: '5px 6px', borderRadius: 4, border: '1px solid #d5c0b0', fontSize: 11, background: '#fff' }}
                            />
                          </div>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7a6552', marginBottom: 2 }}>Dever de Casa</label>
                          <input
                            value={inlineHomework}
                            onChange={e => setInlineHomework(e.target.value)}
                            placeholder="Exercícios..."
                            style={{ width: '100%', padding: '5px 8px', borderRadius: 4, border: '1px solid #d5c0b0', fontSize: 11, background: '#fff' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7a6552', marginBottom: 2 }}>Anotações Pós-Aula</label>
                          <textarea
                            value={inlineNotes}
                            onChange={e => setInlineNotes(e.target.value)}
                            rows={2}
                            placeholder="Observações pedagógicas..."
                            style={{ width: '100%', padding: '5px 8px', borderRadius: 4, border: '1px solid #d5c0b0', fontSize: 11, background: '#fff', resize: 'vertical' }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <button
                            type="button"
                            onClick={() => handleSaveInlineEdit(plan.id)}
                            style={{ flex: 1, padding: '6px 10px', background: '#8b5e3c', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                          >
                            Salvar
                          </button>
                          <button
                            type="button"
                            onClick={() => setInlineEditingPlanId(null)}
                            style={{ padding: '6px 10px', background: '#f5efe6', color: '#7a5c42', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                            <span style={{ background: '#8b5e3c', color: '#fff', padding: '2px 8px', borderRadius: 6, fontSize: 10.5, fontWeight: 700 }}>
                              {plan.className}
                            </span>
                            <span style={{ fontSize: 11, color: '#7a6552' }}>
                              {new Date(plan.date).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                          <strong style={{ fontSize: 14, color: '#2c1a0e', display: 'block', marginBottom: 6 }}>
                            {plan.topic}
                          </strong>
                          <div style={{ fontSize: TEXT.caption, color: '#7a6552', marginBottom: 10 }}>
                            Espaço: {plan.roomSpace} &bull; {plan.stages?.length || 4} etapas
                            {plan.homework && <div style={{ marginTop: 4, color: '#4a382a' }}><strong>Dever:</strong> {plan.homework}</div>}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 6, marginTop: 12, borderTop: '1px solid #e8decb', paddingTop: 10 }}>
                          <button
                            onClick={() => {
                              setPlanId(plan.id)
                              setTopic(plan.topic || '')
                              setSelectedClassId(plan.classId)
                              if (plan.date) setLessonDate(plan.date)
                              if (plan.roomSpace) setRoomSpace(plan.roomSpace)
                              if (plan.methodology) setSelectedMethodology(plan.methodology)
                              if (plan.referenceMaterial) {
                                setBookTitle(plan.referenceMaterial.bookTitle || '')
                                setUnitChapter(plan.referenceMaterial.unit || '')
                                setPages(plan.referenceMaterial.pages || '')
                                if (Array.isArray(plan.referenceMaterial.sharedClassIds)) {
                                  setSharedClassIds(plan.referenceMaterial.sharedClassIds)
                                }
                              }
                              setStages(plan.stages || DEFAULT_STAGES)
                              setGuidingQuestions(plan.guidingQuestions || [])
                              if (Array.isArray(plan.selectedSkills)) setSelectedSkills(plan.selectedSkills)
                              setHomework(plan.homework || '')
                              setPostLessonNotes(plan.postLessonNotes || '')
                              if (plan.targetDurationMinutes) setTargetDurationMinutes(plan.targetDurationMinutes)
                              if (plan.assessmentEvidence) setAssessmentEvidence(plan.assessmentEvidence)
                              setDescription(plan.description || '')
                              setGeneralObjective(plan.generalObjective || '')
                              setSpecificObjectives(plan.specificObjectives || '')
                              setSocioemotionalObjectives(plan.socioemotionalObjectives || '')
                              setLessonGoal(plan.lessonGoal || '')
                              setAnticipatedProblems(plan.anticipatedProblems || '')
                              setPriorKnowledge(plan.priorKnowledge || '')
                              setPreTeach(plan.preTeach || '')
                              setPeiStudentId(plan.peiStudentId || '')
                              setPeiStudentName(plan.peiStudentName || '')
                              setPeiDiagnosis(plan.peiDiagnosis || '')
                              setPeiAccommodations(plan.peiAccommodations || '')
                              setDidacticSequenceRef(plan.didacticSequenceRef || undefined)
                              isPlanEditedByUser.current = true
                              setActiveTab('editor')
                              showNotification('Plano carregado no editor para reutilização!')
                            }}
                            style={{ flex: 1, padding: '6px 10px', background: '#8b5e3c', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                          >
                            Reutilizar / Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartInlineEdit(plan)}
                            style={{ padding: '6px 10px', background: '#f5efe6', color: '#8b5e3c', border: '1px solid #d5c0b0', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            title="Edição rápida sem sair do banco"
                          >
                            ✏️ Rápido
                          </button>
                          <button
                            onClick={() => {
                              const updated = bankPlans.filter(p => p.id !== plan.id)
                              setBankPlans(updated)
                              localStorage.setItem('teacher_lesson_plans_bank', JSON.stringify(updated))
                            }}
                            style={{ padding: '6px 10px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                          >
                            Excluir
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── MODAL: ANEXAR ATIVIDADE DO BANCO (BLOCO I) ────────────────────── */}
      {showAttachActivityModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fffcf8', border: '1px solid #ede8dc', borderRadius: RADIUS.xl, padding: 24, width: 520, maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#2c1a0e' }}>
                🔗 Vincular Atividade do Banco de Questões
              </h3>
              <button onClick={() => setShowAttachActivityModal(false)} style={{ background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>

            {availableQuestions.length === 0 ? (
              <p style={{ fontSize: 13, color: '#7a6552' }}>Nenhuma atividade salva no Banco de Atividades ainda.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {availableQuestions.slice(0, 15).map((q: any) => (
                  <div key={q.id} style={{ background: '#fdf8f2', border: '1px solid #e8decb', padding: 10, borderRadius: RADIUS.md, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: TEXT.bodyCompact, color: '#2c1a0e' }}>{q.topic || 'Exercício'}</strong>
                      <div style={{ fontSize: TEXT.caption, color: '#7a6552' }}>{q.statement?.slice(0, 60)}...</div>
                    </div>
                    <button
                      onClick={() => {
                        setHomework(prev => `${prev ? prev + '\n' : ''}Atividade Vinculada: [${q.topic || 'Exercício'}] ${q.statement}`)
                        setShowAttachActivityModal(false)
                        showNotification('Atividade vinculada como Homework da aula!')
                      }}
                      style={{ background: '#268bd2', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: TEXT.caption, fontWeight: 700, cursor: 'pointer' }}
                    >
                      + Anexar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modais de Execução e Reflexão */}
      {showReflectionModal && (
        <ReflectionModal
          planId={planId || `plan_${Date.now()}`}
          planTopic={topic}
          className={currentClass?.name || selectedClassId || ''}
          onSave={(data: ReflectionData) => {
            setShowReflectionModal(false)
          }}
          onDismiss={() => setShowReflectionModal(false)}
        />
      )}
      {showProgressView && (
        <LessonProgressView
          planId={planId || `plan_${Date.now()}`}
          topic={topic}
          className={currentClass?.name || selectedClassId || ''}
          stages={stages}
          onStagesUpdate={(updatedStages) => setStages(updatedStages)}
          onFinish={() => {
            setShowProgressView(false)
            setShowReflectionModal(true)
          }}
          onClose={() => setShowProgressView(false)}
        />
      )}

      {/* ─── MODAL DE REVISÃO DO PACOTE DA AULA EM 1 CLIQUE (PRIORIDADE 3) ─── */}
      {showPackageModal && generatedPackage && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(44, 26, 14, 0.7)',
          backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 1000, padding: 20
        }}>
          <div style={{
            background: '#fff', borderRadius: RADIUS.xl, maxWidth: 960, width: '100%',
            maxHeight: '90vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 50px rgba(44,26,14,0.3)', border: '1px solid #d5c0b0',
            overflow: 'hidden'
          }}>
            {/* Header do Modal */}
            <div style={{
              padding: '20px 28px', background: '#fcfaf7', borderBottom: '1px solid #ede8dc',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)'
                }}>
                  <i className="ti ti-package" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
                    Pacote da Aula: {generatedPackage.topic}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 11.5, background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                      {generatedPackage.className} ({generatedPackage.gradeYear})
                    </span>
                    <span style={{ fontSize: 11.5, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                      {generatedPackage.methodologyName}
                    </span>
                  </div>
                </div>
              </div>

              {/* Botão Fechar */}
              <button
                onClick={() => setShowPackageModal(false)}
                style={{
                  background: '#f5efe6', border: 'none', width: 34, height: 34,
                  borderRadius: 17, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#7a5c42', fontSize: 16
                }}
              >
                ✕
              </button>
            </div>

            {/* Aviso de Segurança NÃO NEGOCIÁVEL */}
            <div style={{
              background: '#ecfdf5', borderBottom: '1px solid #a7f3d0', padding: '10px 28px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#065f46', fontSize: 12.5 }}>
                <i className="ti ti-shield-check" style={{ fontSize: 18, color: '#059669' }} />
                <span>
                  <strong>Requisito de Segurança:</strong> O comunicado para as famílias está em <em>rascunho protegido</em>. Nenhum envio automático foi ou será realizado sem sua conferência e ação manual.
                </span>
              </div>
              <span style={{ fontSize: 10, background: '#d1fae5', color: '#047857', padding: '2px 8px', borderRadius: 4, fontWeight: 800, textTransform: 'uppercase' }}>
                Status: Rascunho
              </span>
            </div>

            {/* Abas do Modal */}
            <div style={{ display: 'flex', borderBottom: '1px solid #ede8dc', padding: '0 28px', background: '#fff' }}>
              {[
                { id: 'overview', label: 'Visão Geral (3 em 1)', icon: 'ti-layout-grid' },
                { id: 'plan', label: '1. Roteiro da Aula', icon: 'ti-clipboard-list' },
                { id: 'worksheet', label: `2. Exercícios (${generatedPackage.worksheet.questions.length})`, icon: 'ti-file-text' },
                { id: 'comms', label: '3. Comunicado Famílias', icon: 'ti-brand-whatsapp' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setPackageModalTab(tab.id as any)}
                  style={{
                    padding: '14px 18px', border: 'none', background: 'transparent',
                    borderBottom: packageModalTab === tab.id ? '2.5px solid #059669' : '2.5px solid transparent',
                    color: packageModalTab === tab.id ? '#059669' : '#7a5c42',
                    fontWeight: packageModalTab === tab.id ? 800 : 600,
                    fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  <i className={`ti ${tab.icon}`} /> {tab.label}
                </button>
              ))}
            </div>

            {/* Conteúdo das Abas */}
            <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1, background: '#faf8f5' }}>
              {/* ABA 1: VISÃO GERAL */}
              {packageModalTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  {/* Card 1: Plano */}
                  <div style={{ background: '#fff', padding: 18, borderRadius: RADIUS.lg, border: '1px solid #ede8dc', boxShadow: '0 2px 8px rgba(44,26,14,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#2563eb' }}>
                      <i className="ti ti-clipboard-list" style={{ fontSize: 20 }} />
                      <strong style={{ fontSize: 14 }}>Roteiro da Aula</strong>
                    </div>
                    <p style={{ fontSize: 12, color: '#7a5c42', margin: '0 0 10px 0' }}>
                      {generatedPackage.plan.stages.length} etapas estruturadas no framework {generatedPackage.methodologyName} ({generatedPackage.plan.durationMinutes} min).
                    </p>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, color: '#2c1a0e', lineHeight: 1.6 }}>
                      {generatedPackage.plan.stages.slice(0, 4).map((s, idx) => (
                        <li key={idx}><strong>{s.name}</strong> ({s.durationMin}m)</li>
                      ))}
                    </ul>
                  </div>

                  {/* Card 2: Exercícios */}
                  <div style={{ background: '#fff', padding: 18, borderRadius: RADIUS.lg, border: '1px solid #ede8dc', boxShadow: '0 2px 8px rgba(44,26,14,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#d97706' }}>
                      <i className="ti ti-file-text" style={{ fontSize: 20 }} />
                      <strong style={{ fontSize: 14 }}>5 Exercícios</strong>
                    </div>
                    <p style={{ fontSize: 12, color: '#7a5c42', margin: '0 0 10px 0' }}>
                      {generatedPackage.worksheet.summary || 'Questões alinhadas ao conteúdo da aula.'}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {generatedPackage.worksheet.questions.slice(0, 3).map((q, idx) => (
                        <div key={idx} style={{ fontSize: 11.5, color: '#2c1a0e', background: '#fdf8f2', padding: '6px 8px', borderRadius: 6 }}>
                          <strong>Q{q.number}:</strong> {q.stem.slice(0, 50)}...
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Card 3: Comunicado */}
                  <div style={{ background: '#fff', padding: 18, borderRadius: RADIUS.lg, border: '1px solid #ede8dc', boxShadow: '0 2px 8px rgba(44,26,14,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#25D366' }}>
                      <i className="ti ti-brand-whatsapp" style={{ fontSize: 20 }} />
                      <strong style={{ fontSize: 14 }}>Comunicado Famílias</strong>
                    </div>
                    <p style={{ fontSize: 12, color: '#7a5c42', margin: '0 0 10px 0' }}>
                      Mensagem formatada para WhatsApp no tom {generatedPackage.parentCommunication.tone}.
                    </p>
                    <div style={{ fontSize: 11.5, color: '#2c1a0e', background: '#f0fdf4', padding: '10px 12px', borderRadius: 8, border: '1px dashed #86efac', maxHeight: 110, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                      {generatedPackage.parentCommunication.draftMessage}
                    </div>
                  </div>
                </div>
              )}

              {/* ABA 2: ROTEIRO DA AULA */}
              {packageModalTab === 'plan' && (
                <div style={{ background: '#fff', padding: 20, borderRadius: RADIUS.lg, border: '1px solid #ede8dc' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: 15, color: '#2c1a0e' }}>
                    {generatedPackage.plan.topic} — {generatedPackage.methodologyName}
                  </h4>
                  {generatedPackage.plan.assessmentEvidence && (
                    <div style={{ background: '#fdf4ff', border: '1px solid #f0abfc', borderRadius: RADIUS.md, padding: '10px 14px', marginBottom: 16 }}>
                      <strong style={{ fontSize: 12, color: '#86198f' }}>🎯 Evidência Avaliativa Alvo:</strong>
                      <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#4a044e' }}>{generatedPackage.plan.assessmentEvidence}</p>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {generatedPackage.plan.stages.map((stg, i) => (
                      <div key={i} style={{ border: '1px solid #ede8dc', borderRadius: RADIUS.md, padding: 12, background: '#fffcf8' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <strong style={{ fontSize: 13, color: '#2c1a0e' }}>{stg.name}</strong>
                          <span style={{ fontSize: 11, background: '#f5efe6', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>{stg.durationMin} min {stg.targetBnccCode ? `[${stg.targetBnccCode}]` : ''}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#7a5c42', lineHeight: 1.5 }}>
                          <div><strong>Prof.:</strong> {stg.teacherAction}</div>
                          <div style={{ marginTop: 4 }}><strong>Alunos:</strong> {stg.studentAction}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ABA 3: EXERCÍCIOS */}
              {packageModalTab === 'worksheet' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: 15, color: '#2c1a0e' }}>{generatedPackage.worksheet.title}</h4>
                    <span style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>
                      Sincronizado com QuickGenerate / Test & Worksheets
                    </span>
                  </div>
                  {generatedPackage.worksheet.questions.map((q, i) => (
                    <div key={i} style={{ background: '#fff', padding: 16, borderRadius: RADIUS.lg, border: '1px solid #ede8dc' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <strong style={{ fontSize: 13, color: '#2c1a0e' }}>Questão {q.number} ({q.difficulty || 'Média'})</strong>
                        {q.pedagogicalObjective && <span style={{ fontSize: 11, color: '#7a5c42' }}>{q.pedagogicalObjective}</span>}
                      </div>
                      <p style={{ margin: '0 0 10px 0', fontSize: 13, color: '#2c1a0e' }}>{q.stem}</p>
                      {q.options && q.options.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                          {q.options.map((opt, oIdx) => (
                            <div key={oIdx} style={{ background: '#fcfaf7', padding: '6px 10px', borderRadius: 6, fontSize: 12, border: '1px solid #f0e8dc' }}>
                              {opt}
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ background: '#ecfdf5', padding: '8px 12px', borderRadius: 6, fontSize: 11.5, color: '#065f46' }}>
                        <strong>Gabarito Comentado:</strong> {q.answerKey}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ABA 4: COMUNICADO AOS PAIS */}
              {packageModalTab === 'comms' && (
                <div style={{ background: '#fff', padding: 20, borderRadius: RADIUS.lg, border: '1px solid #ede8dc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 15, color: '#2c1a0e' }}>{generatedPackage.parentCommunication.title}</h4>
                      <span style={{ fontSize: 11.5, color: '#7a5c42' }}>Você pode editar o rascunho abaixo antes de enviar manualmente.</span>
                    </div>
                    <span style={{ fontSize: 11, background: '#d1fae5', color: '#047857', padding: '3px 10px', borderRadius: 6, fontWeight: 700 }}>
                      Tom {generatedPackage.parentCommunication.tone}
                    </span>
                  </div>

                  <textarea
                    value={generatedPackage.parentCommunication.draftMessage}
                    onChange={(e) => {
                      const updated = {
                        ...generatedPackage,
                        parentCommunication: {
                          ...generatedPackage.parentCommunication,
                          draftMessage: e.target.value
                        }
                      }
                      setGeneratedPackage(updated)
                      saveLessonPackage(updated)
                    }}
                    rows={10}
                    style={{
                      width: '100%', padding: '14px', borderRadius: RADIUS.md,
                      border: '1px solid #d5c0b0', background: '#fdfbf8', fontSize: 13.5,
                      color: '#2c1a0e', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical'
                    }}
                  />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
                    <span style={{ fontSize: 11.5, color: '#059669', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className="ti ti-check" /> Rascunho salvo localmente. Disponível na aba ParentComms para envio manual.
                    </span>
                    <button
                      onClick={() => {
                        const text = encodeURIComponent(generatedPackage.parentCommunication.draftMessage)
                        window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank')
                      }}
                      style={{
                        padding: '10px 18px', borderRadius: RADIUS.md, border: 'none',
                        background: '#25D366', color: '#fff', fontSize: 13, fontWeight: 800,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                      }}
                    >
                      <i className="ti ti-brand-whatsapp" /> Abrir no WhatsApp Manualmente
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé do Modal com Ações de Navegação */}
            <div style={{
              padding: '16px 28px', background: '#fcfaf7', borderTop: '1px solid #ede8dc',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <span style={{ fontSize: 11.5, color: '#7a5c42' }}>
                ID do Pacote: <code>{generatedPackage.id}</code>
              </span>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowPackageModal(false)}
                >
                  Concluir & Fechar
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  style={{ background: '#059669', borderColor: '#047857' }}
                  icon={<i className="ti ti-check" />}
                  onClick={() => {
                    saveLessonPackage(generatedPackage)
                    setShowPackageModal(false)
                    toast.success('Pacote de aula consolidado e disponível em todos os módulos!')
                  }}
                >
                  Salvar Pacote
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: FILIPETA DO ESTUDANTE — EU CONSIGO... (CAN-DO STATEMENTS) */}
      {showCanDoModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(44, 26, 14, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20
        }}>
          <div style={{
            background: '#fff', borderRadius: RADIUS.xl, width: '100%', maxWidth: 640,
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(44,26,14,0.25)', overflow: 'hidden'
          }}>
            <div style={{
              padding: '18px 24px', borderBottom: '1px solid #ede8dc', background: '#faf6f0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>🎯</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, color: '#2c1a0e', fontWeight: 800 }}>
                    Filipeta do Estudante — &quot;Eu Consigo...&quot; (Can-Do)
                  </h3>
                  <span style={{ fontSize: 12, color: '#7a5c42' }}>
                    Autoavaliação formativa para o aluno (CEFR {currentCefrLevel} &amp; BNCC)
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowCanDoModal(false)}
                style={{ background: 'transparent', border: 'none', fontSize: 18, color: '#7a5c42', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              <p style={{ fontSize: 12.5, color: '#555', marginTop: 0, lineHeight: 1.5 }}>
                Esta lista traduz os objetivos de aprendizagem da aula em declarações em primeira pessoa. Entregue aos alunos no início ou encerramento da aula para que marquem seu progresso:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {studentCanDoStatements.map((stmt, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: '#fdfbf7', border: '1px solid #e8decb', borderRadius: RADIUS.md,
                      padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10
                    }}
                  >
                    <span style={{ fontSize: 16, color: '#059669', marginTop: 1 }}>☐</span>
                    <span style={{ fontSize: 13, color: '#2c1a0e', lineHeight: 1.5 }}>{stmt}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{
              padding: '14px 24px', background: '#faf6f0', borderTop: '1px solid #ede8dc',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <button
                type="button"
                onClick={() => {
                  const text = studentCanDoStatements.map((s, i) => `[ ] ${i + 1}. ${s}`).join('\n')
                  navigator.clipboard.writeText(text)
                  toast.success('Lista copiada para a área de transferência!')
                }}
                style={{
                  background: '#fff', border: '1px solid #d5c0b0', borderRadius: RADIUS.md,
                  padding: '8px 14px', fontSize: 12, fontWeight: 700, color: '#8b5e3c', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                <i className="ti ti-copy" /> Copiar Lista para Impressão
              </button>

              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowCanDoModal(false)}
              >
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: 10 COMPETÊNCIAS GERAIS DA BNCC */}
      {showGeneralCompetenciesModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(44, 26, 14, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20
        }}>
          <div style={{
            background: '#fff', borderRadius: RADIUS.xl, width: '100%', maxWidth: 720,
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(44,26,14,0.25)', overflow: 'hidden'
          }}>
            <div style={{
              padding: '18px 24px', borderBottom: '1px solid #ede8dc', background: '#f0f9ff',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>🧠</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, color: '#0369a1', fontWeight: 800 }}>
                    10 Competências Gerais da BNCC (MEC)
                  </h3>
                  <span style={{ fontSize: 12, color: '#0284c7' }}>
                    Alinhamento para o Diário de Classe e Formação Integral
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowGeneralCompetenciesModal(false)}
                style={{ background: 'transparent', border: 'none', fontSize: 18, color: '#0369a1', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              <strong style={{ fontSize: 13, color: '#0369a1', display: 'block', marginBottom: 10 }}>
                ✨ Competências Mobilizadas Diretamente por este Plano:
              </strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {generalCompetencies.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: RADIUS.md,
                      padding: '12px 14px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <strong style={{ fontSize: 13, color: '#0369a1' }}>
                        [{item.competency.code}] {item.competency.name}
                      </strong>
                      <span style={{ fontSize: 10.5, background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                        Score de Aderência: {item.score}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 6px 0', fontSize: 11.5, color: '#555' }}>
                      {item.competency.description}
                    </p>
                    <div style={{ fontSize: 11.5, color: '#0284c7', background: '#fff', padding: '6px 10px', borderRadius: 4, border: '1px dashed #7dd3fc' }}>
                      <strong>Justificativa Pedagógica:</strong> {item.justification}
                    </div>
                  </div>
                ))}
              </div>

              <strong style={{ fontSize: 13, color: '#7a5c42', display: 'block', marginBottom: 10 }}>
                Catálogo Completo das 10 Competências Gerais da Educação Básica:
              </strong>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {BNCC_GENERAL_COMPETENCIES.map(comp => (
                  <div key={comp.id} style={{ background: '#faf6f0', padding: 8, borderRadius: 6, border: '1px solid #e8decb', fontSize: 11.5 }}>
                    <strong style={{ color: '#8b5e3c' }}>{comp.shortTitle}</strong>
                    <p style={{ margin: '2px 0 0 0', color: '#666', fontSize: 10.5 }}>{comp.description.slice(0, 80)}...</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{
              padding: '14px 24px', background: '#faf6f0', borderTop: '1px solid #ede8dc',
              display: 'flex', justifyContent: 'flex-end'
            }}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowGeneralCompetenciesModal(false)}
              >
                Concluir
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ACESSIBILIDADE & PEI (NEURODIVERSIDADE) */}
      {showInclusionModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(44, 26, 14, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20
        }}>
          <div style={{
            background: '#fff', borderRadius: RADIUS.xl, width: '100%', maxWidth: 680,
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(44,26,14,0.25)', overflow: 'hidden'
          }}>
            <div style={{
              padding: '18px 24px', borderBottom: '1px solid #ede8dc', background: '#f5f3ff',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>♿</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, color: '#6d28d9', fontWeight: 800 }}>
                    Acessibilidade &amp; PEI (Acomodações Razoáveis)
                  </h3>
                  <span style={{ fontSize: 12, color: '#7c3aed' }}>
                    Adaptações baseadas em evidências para estudantes com necessidades específicas
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowInclusionModal(false)}
                style={{ background: 'transparent', border: 'none', fontSize: 18, color: '#6d28d9', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#4c1d95', display: 'block', marginBottom: 8 }}>
                Selecione os perfis presentes nesta turma:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {INCLUSION_PROFILES.map(prof => {
                  const isSel = selectedInclusionProfiles.includes(prof.id)
                  return (
                    <button
                      key={prof.id}
                      type="button"
                      onClick={() => {
                        if (isSel) {
                          setSelectedInclusionProfiles(selectedInclusionProfiles.filter(id => id !== prof.id))
                        } else {
                          setSelectedInclusionProfiles([...selectedInclusionProfiles, prof.id])
                        }
                      }}
                      style={{
                        padding: '6px 12px', borderRadius: 20,
                        border: isSel ? '2px solid #7c3aed' : '1px solid #ddd6fe',
                        background: isSel ? '#ede9fe' : '#fff',
                        color: isSel ? '#5b21b6' : '#6d28d9',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      {prof.name.split(' ')[0]}
                    </button>
                  )
                })}
              </div>

              {activeInclusionAccommodations.length > 0 ? (
                <div>
                  <strong style={{ fontSize: 13, color: '#5b21b6', display: 'block', marginBottom: 8 }}>
                    Acomodações Práticas Recomendadas para a Aula de Hoje:
                  </strong>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {activeInclusionAccommodations.map((acc, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 6,
                          padding: '8px 12px', fontSize: 12, color: '#4c1d95', display: 'flex', alignItems: 'center', gap: 8
                        }}
                      >
                        <span>✓</span>
                        <span>{acc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ padding: 16, background: '#faf5ff', borderRadius: 8, textAlign: 'center', color: '#7c3aed', fontSize: 12.5 }}>
                  Selecione um ou mais perfis acima para visualizar as acomodações recomendadas.
                </div>
              )}
            </div>

            <div style={{
              padding: '14px 24px', background: '#f5f3ff', borderTop: '1px solid #ede8dc',
              display: 'flex', justifyContent: 'flex-end'
            }}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowInclusionModal(false)}
              >
                Concluir
              </Button>
            </div>
          </div>
        </div>
      )}

        </>
      )}

      {/* Modal de Gestão Completa de PEI / PDI com EditableDocumentModal */}
      {showPeiModalForStudent && (
        <EditableDocumentModal
          isOpen={Boolean(showPeiModalForStudent)}
          documentType="pei"
          schema={PEI_SCHEMA}
          initialData={getStudentPei(showPeiModalForStudent.studentId) || undefined}
          linkedStudentId={showPeiModalForStudent.studentId}
          linkedStudentName={showPeiModalForStudent.studentName}
          onSave={data => {
            saveStudentPei({ ...getStudentPei(showPeiModalForStudent.studentId), ...data })
            setShowPeiModalForStudent(null)
          }}
          onClose={() => setShowPeiModalForStudent(null)}
        />
      )}

    </div>
  )
}