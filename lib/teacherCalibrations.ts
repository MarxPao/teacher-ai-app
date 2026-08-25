/**
 * teacherCalibrations.ts — Calibrações e Preferências Globais do Professor
 * Unifica todas as calibrações de módulos (Avaliações, Provas, Correção, Gradebook, Frequência,
 * Planejamento, Comunicados e IA) para que o professor configure uma vez e o app lembre sempre.
 */

export interface ExamCalibrations {
  defaultSchool: string
  defaultClassGroup: string
  defaultSubject: string
  defaultLevel: string
  defaultQuestionCount: string
  defaultQuestionType: 'multiple_choice' | 'open' | 'mixed'
  defaultStemLanguage: 'pt' | 'en'
  defaultOptionLanguage: 'en' | 'pt'
  defaultSections: string[]
  defaultApproach: string[]
  defaultTotalScore: number
  defaultDurationMinutes: number
  kioskModeDefault: boolean
}

export interface GradingCalibrations {
  defaultRubricPreset: 'cambridge_4d' | 'enem' | 'bncc' | 'general' | 'custom'
  maxScore: number
  gradingRigor: 1 | 2 | 3 | 4 | 5
  autoGenerateStudentFeedback: boolean
  autoSaveToMemory: boolean
}

export interface GradebookCalibrations {
  passingScore: number           // Ex: 6.0 ou 7.0
  recoveryThreshold: number      // Ex: 5.9
  calculationMethod: 'arithmetic' | 'weighted' | 'points'
  defaultWeights: {
    exam1: number
    exam2: number
    work: number
    participation: number
  }
  defaultPortalSync: 'machado' | 'santacatarina' | 'plural' | 'google_classroom'
}

export interface AttendanceCalibrations {
  defaultTimeSlot: string
  consecutiveAbsenceAlertThreshold: number // Ex: 2
  accumulatedAbsenceAlertThreshold: number   // Ex: 3
  defaultPortalMirror: 'machado' | 'santacatarina' | 'plural' | 'google_classroom'
}

export interface PlannerCalibrations {
  defaultDurationMinutes: number // Ex: 50 ou 100
  defaultMethodology: 'TBL' | 'Flipped Classroom' | 'CLIL' | 'PBL' | 'Gamificação' | 'Tradicional'
  autoIncludeBncc: boolean
}

export interface CommunicationCalibrations {
  preferredChannel: 'whatsapp' | 'email' | 'portal'
  teacherSignature: string
  includeGradeSummary: boolean
  includeAttendanceAlert: boolean
}

export interface AgentCalibrations {
  preferredProvider: 'auto' | 'groq' | 'gemini' | 'openai' | 'anthropic' | 'deepseek'
  voiceSpeed: number // 0.8 a 1.2
  wakeWordEnabled: boolean
  autoExecuteActions: boolean
}

export interface TeacherAppCalibrations {
  version: '1.0'
  teacherName: string
  schoolName: string
  exam: ExamCalibrations
  grading: GradingCalibrations
  gradebook: GradebookCalibrations
  attendance: AttendanceCalibrations
  planner: PlannerCalibrations
  communication: CommunicationCalibrations
  agent: AgentCalibrations
  updatedAt: string
}

export const DEFAULT_CALIBRATIONS: TeacherAppCalibrations = {
  version: '1.0',
  teacherName: '',
  schoolName: '',
  exam: {
    defaultSchool: '',
    defaultClassGroup: '',
    defaultSubject: 'english',
    defaultLevel: 'A2',
    defaultQuestionCount: '10',
    defaultQuestionType: 'mixed',
    defaultStemLanguage: 'pt',
    defaultOptionLanguage: 'en',
    defaultSections: ['Grammar', 'Vocabulary', 'Reading Comprehension'],
    defaultApproach: ['Cambridge'],
    defaultTotalScore: 10,
    defaultDurationMinutes: 50,
    kioskModeDefault: false
  },
  grading: {
    defaultRubricPreset: 'cambridge_4d',
    maxScore: 10,
    gradingRigor: 3,
    autoGenerateStudentFeedback: true,
    autoSaveToMemory: true
  },
  gradebook: {
    passingScore: 6.0,
    recoveryThreshold: 5.9,
    calculationMethod: 'arithmetic',
    defaultWeights: {
      exam1: 3,
      exam2: 3,
      work: 2,
      participation: 2
    },
    defaultPortalSync: 'machado'
  },
  attendance: {
    defaultTimeSlot: '07:30 - 08:20 (1ª Aula)',
    consecutiveAbsenceAlertThreshold: 2,
    accumulatedAbsenceAlertThreshold: 3,
    defaultPortalMirror: 'machado'
  },
  planner: {
    defaultDurationMinutes: 50,
    defaultMethodology: 'TBL',
    autoIncludeBncc: true
  },
  communication: {
    preferredChannel: 'whatsapp',
    teacherSignature: 'Prof. Rafael — Teacher AI',
    includeGradeSummary: true,
    includeAttendanceAlert: true
  },
  agent: {
    preferredProvider: 'auto',
    voiceSpeed: 1.0,
    wakeWordEnabled: true,
    autoExecuteActions: true
  },
  updatedAt: new Date().toISOString()
}

const STORAGE_KEY = 'teacher_app_calibrations_v1'

export function getTeacherCalibrations(): TeacherAppCalibrations {
  if (typeof localStorage === 'undefined') return DEFAULT_CALIBRATIONS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CALIBRATIONS
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_CALIBRATIONS,
      ...parsed,
      exam: { ...DEFAULT_CALIBRATIONS.exam, ...(parsed.exam || {}) },
      grading: { ...DEFAULT_CALIBRATIONS.grading, ...(parsed.grading || {}) },
      gradebook: { ...DEFAULT_CALIBRATIONS.gradebook, ...(parsed.gradebook || {}) },
      attendance: { ...DEFAULT_CALIBRATIONS.attendance, ...(parsed.attendance || {}) },
      planner: { ...DEFAULT_CALIBRATIONS.planner, ...(parsed.planner || {}) },
      communication: { ...DEFAULT_CALIBRATIONS.communication, ...(parsed.communication || {}) },
      agent: { ...DEFAULT_CALIBRATIONS.agent, ...(parsed.agent || {}) },
    }
  } catch {
    return DEFAULT_CALIBRATIONS
  }
}

export function saveTeacherCalibrations(
  updates: Partial<TeacherAppCalibrations> | {
    exam?: Partial<ExamCalibrations>
    grading?: Partial<GradingCalibrations>
    gradebook?: Partial<GradebookCalibrations>
    attendance?: Partial<AttendanceCalibrations>
    planner?: Partial<PlannerCalibrations>
    communication?: Partial<CommunicationCalibrations>
    agent?: Partial<AgentCalibrations>
  }
): TeacherAppCalibrations {
  if (typeof localStorage === 'undefined') return DEFAULT_CALIBRATIONS
  try {
    const current = getTeacherCalibrations()
    const updated: TeacherAppCalibrations = {
      ...current,
      ...updates,
      exam: { ...current.exam, ...(updates.exam || {}) },
      grading: { ...current.grading, ...(updates.grading || {}) },
      gradebook: { ...current.gradebook, ...(updates.gradebook || {}) },
      attendance: { ...current.attendance, ...(updates.attendance || {}) },
      planner: { ...current.planner, ...(updates.planner || {}) },
      communication: { ...current.communication, ...(updates.communication || {}) },
      agent: { ...current.agent, ...(updates.agent || {}) },
      updatedAt: new Date().toISOString()
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('teacher:calibrations_changed', { detail: updated }))
    }
    return updated
  } catch {
    return DEFAULT_CALIBRATIONS
  }
}

/**
 * Salva as calibrações de um módulo específico com um único comando
 */
export function saveModuleCalibration<K extends keyof Omit<TeacherAppCalibrations, 'version' | 'updatedAt' | 'teacherName' | 'schoolName'>>(
  moduleKey: K,
  values: Partial<TeacherAppCalibrations[K]>
): TeacherAppCalibrations {
  return saveTeacherCalibrations({ [moduleKey]: values } as any)
}
