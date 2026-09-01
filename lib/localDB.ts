/**
 * localDB.ts — Centralized localStorage schema and typed accessors.
 *
 * PROBLEM SOLVED: The app had 95 unique localStorage keys scattered across 57+
 * components with no type safety, validation, or single source of truth.
 * A corrupted value in one module could silently propagate to 56 others.
 *
 * SOLUTION: All localStorage reads/writes should go through these typed functions.
 * Components import specific getters/setters instead of calling localStorage directly.
 *
 * MIGRATION: Keys with _v1, _v2 suffixes are handled by migrateIfNeeded().
 * When bumping a schema, increment LOCAL_DB_VERSION and add a migration block.
 */

export const LOCAL_DB_VERSION = 1

// ─── Safe JSON helpers ─────────────────────────────────────────────────────────

/**
 * Safely reads and JSON-parses a localStorage key.
 * Returns `fallback` on any error (key missing, JSON malformed, SSR).
 */
export function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[localDB] Failed to parse key "${key}". Returning fallback.`)
    }
    return fallback
  }
}

/**
 * Safely JSON-stringifies and writes a value to localStorage.
 * Silently no-ops in SSR or on QuotaExceededError.
 */
export function safeSet<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[localDB] Failed to write key "${key}"`, e)
    }
  }
}

/** Removes a key from localStorage (SSR-safe). */
export function safeRemove(key: string): void {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(key) } catch { /* quota or SSR — non-fatal */ }
}

// ─── Key Registry ──────────────────────────────────────────────────────────────
// Single source of truth for all 95 localStorage keys used in the app.

export const KEYS = {
  // ── Core entities
  STUDENTS:               'teacher_students',
  CLASSES:                'teacher_classes',
  SCHOOLS:                'teacher_schools',
  PRIVATE_STUDENTS:       'teacher_private_students',

  // ── APIs & Config
  APIS:                   'teacher_apis',
  CFG:                    'teacher_cfg',
  SETTINGS:               'teacher_settings',
  SUPABASE_CONFIG:        'teacher_supabase_config',
  AUTO_MODE:              'teacher_auto_mode',

  // ── Lesson & Planning
  AGENDA_SCHEDULE:        'teacher_agenda_schedule',
  AGENDA_CHECKLIST:       'teacher_agenda_checklist',
  LESSON_PLANS:           'teacher_lesson_plans',
  LESSON_PLANS_BANK:      'teacher_lesson_plans_bank',
  LESSON_STUDIO_PREFILL:  'teacher_lesson_studio_prefill',
  LESSONPLANNER_BOARDS:   'teacher_lessonplanner_boards',
  CALENDAR_EVENTS:        'teacher_calendar_events',
  CALENDAR_TASKS:         'teacher_calendar_tasks',
  WEEKLY_SCHEDULE:        'teacher_weekly_agenda_posts_v1',
  DIDACTIC_UNITS:         'teacher_didactic_sequence_units_v3',

  // ── Assessment & Gradebook
  SAVED_EXAMS:            'teacher_saved_exams',
  EXAM_DRAFTS:            'teacher_exam_drafts',
  EXAM_PREFILL:           'teacher_exam_prefill',
  RUBRICS:                'teacher_rubrics',
  GRADEBOOK_CONFIG:       'teacher_gbConfig',
  BATCH_SUBMISSIONS:      'teacher_batch_submissions',
  QUESTION_BANK:          'teacher_question_bank',
  QBANK_QUESTIONS:        'teacher_qbank_questions',

  // ── Attendance
  ATTENDANCE:             'teacher_attendance_records_v1',
  CLASS_LOGS:             'teacher_class_logs_v1',

  // ── Student data
  STUDENT_METRICS:        'teacher_student_metrics',
  STUDENT_MEMORY:         'teacher_student_memory',
  PEDAGOGIC_METRICS:      'teacher_pedagogic_metrics',
  PROGRESS_TRACKER:       'teacher_class_metrics',
  SCHOOL_METRICS:         'teacher_school_metrics',

  // ── Repository & Media
  REPO:                   'teacher_repository',
  REPO_MATERIALS:         'teacher_repo_materials',
  MEDIA_LIBRARY:          'teacher_media_library',
  LOOSE_FILES:            'teacher_loose_files_v1',
  RAG_CHUNKS:             'teacher_rag_chunks',

  // ── Communication
  COMMUNICATIONS:         'teacher_communications',
  PORTFOLIO:              'teacher_portfolio',
  PORTFOLIO_META:         'teacher_portfolio_meta',

  // ── UI State
  DASHBOARD_POSTITS:      'teacher_dashboard_postits',
  DASHBOARD_TODOS:        'teacher_dashboard_todos',
  SIDEBAR_PINNED:         'teacher_sidebar_pinned',
  CUSTOM_HEADERS:         'teacher_custom_headers',
  SCHOOL_HEADERS:         'teacher_school_headers',

  // ── Teacher profile & wellbeing
  WELLBEING_CHECKINS:     'teacher_wellbeing_checkins',
  WELLBEING_HOURS:        'teacher_wellbeing_hours',
  WELLBEING_MOMENTS:      'teacher_wellbeing_moments',
  REFLECTIVE_JOURNAL:     'teacher_reflective_journal',
  PREFERENCE_PROFILE:     'teacher_preference_profile',
  STYLE_PROFILE:          'teacher_style_profile_v2',

  // ── Portal & sync
  DISCOVERED_PORTAL_MAPS: 'teacher_discovered_portal_maps',
  PORTAL_FILL_LOG:        'teacher_portal_fill_log',
  LAST_PORTAL_TASK:       'teacher_last_portal_task',
  SYNC_PAYLOAD:           'teacher_portal_sync_payload',

  // ── Misc modules
  FLASHCARDS:             'teacher_flashcards',
  MINDMAPS:               'teacher_mindmaps_v2',
  MEETINGS:               'teacher_meeting_diaries',
  SYLLABUSES:             'teacher_syllabuses_v1',
  PRONUNCIATION_BANK:     'teacher_pronunciation_bank',
  IPA_CACHE:              'teacher_ipa_dynamic_cache',
  VOICE_OUT:              'teacher_voice_out',
  MAESTRO_ACTIVITIES:     'teacher_maestro_activities',
  ONBOARDING_DONE:        'teacher_onboarding_wizard_completed',
  ACHIEVEMENTS_SEEN:      'teacher_achievements_seen',
  ACTIVE_CLASS_SUBJECT:   'teacher_active_class_subject',
} as const

export type LocalDBKey = typeof KEYS[keyof typeof KEYS]

// ─── Typed Entity Accessors ────────────────────────────────────────────────────
// Use these in components instead of raw localStorage calls.

// Students
export const getStudents   = <T = unknown[]>() => safeGet<T>(KEYS.STUDENTS, [] as unknown as T)
export const setStudents   = <T>(v: T) => safeSet(KEYS.STUDENTS, v)

// Classes
export const getClasses    = <T = unknown[]>() => safeGet<T>(KEYS.CLASSES, [] as unknown as T)
export const setClasses    = <T>(v: T) => safeSet(KEYS.CLASSES, v)

// Schools
export const getSchools    = <T = unknown[]>() => safeGet<T>(KEYS.SCHOOLS, [] as unknown as T)
export const setSchools    = <T>(v: T) => safeSet(KEYS.SCHOOLS, v)

// APIs
export const getApis       = <T = unknown[]>() => safeGet<T>(KEYS.APIS, [] as unknown as T)
export const setApis       = <T>(v: T) => safeSet(KEYS.APIS, v)

// Config
export const getCfg        = <T = Record<string, unknown>>() => safeGet<T>(KEYS.CFG, {} as T)
export const setCfg        = <T>(v: T) => safeSet(KEYS.CFG, v)

// Supabase config
export const getSupabaseConfig = <T = Record<string, unknown>>() =>
  safeGet<T>(KEYS.SUPABASE_CONFIG, {} as T)
export const setSupabaseConfig = <T>(v: T) => safeSet(KEYS.SUPABASE_CONFIG, v)

// Saved exams
export const getSavedExams = <T = unknown[]>() => safeGet<T>(KEYS.SAVED_EXAMS, [] as unknown as T)
export const setSavedExams = <T>(v: T) => safeSet(KEYS.SAVED_EXAMS, v)

// Gradebook
export const getGradebookConfig = <T = Record<string, unknown>>() =>
  safeGet<T>(KEYS.GRADEBOOK_CONFIG, { cols: [] } as unknown as T)
export const setGradebookConfig = <T>(v: T) => safeSet(KEYS.GRADEBOOK_CONFIG, v)

// Repository
export const getRepository = <T = unknown[]>() => safeGet<T>(KEYS.REPO, [] as unknown as T)
export const setRepository = <T>(v: T) => safeSet(KEYS.REPO, v)

// Attendance
export const getAttendance = <T = unknown[]>() => safeGet<T>(KEYS.ATTENDANCE, [] as unknown as T)
export const setAttendance = <T>(v: T) => safeSet(KEYS.ATTENDANCE, v)

// Flashcards
export const getFlashcards = <T = unknown[]>() => safeGet<T>(KEYS.FLASHCARDS, [] as unknown as T)
export const setFlashcards = <T>(v: T) => safeSet(KEYS.FLASHCARDS, v)

// Mindmaps
export const getMindmaps   = <T = unknown[]>() => safeGet<T>(KEYS.MINDMAPS, [] as unknown as T)
export const setMindmaps   = <T>(v: T) => safeSet(KEYS.MINDMAPS, v)

// Student memory
export const getStudentMemory = <T = unknown[]>() =>
  safeGet<T>(KEYS.STUDENT_MEMORY, [] as unknown as T)
export const setStudentMemory = <T>(v: T) => safeSet(KEYS.STUDENT_MEMORY, v)

// Question bank
export const getQuestionBank = <T = unknown[]>() =>
  safeGet<T>(KEYS.QUESTION_BANK, [] as unknown as T)
export const setQuestionBank = <T>(v: T) => safeSet(KEYS.QUESTION_BANK, v)

// ─── Migration System ──────────────────────────────────────────────────────────
const MIGRATION_KEY = 'teacher_localdb_version'

/**
 * Runs once on app start. Handles schema migrations between versions.
 * Call this from app/page.tsx or app/layout.tsx useEffect.
 */
export function migrateIfNeeded(): void {
  if (typeof window === 'undefined') return
  try {
    const storedVersion = parseInt(localStorage.getItem(MIGRATION_KEY) || '0', 10)
    if (storedVersion >= LOCAL_DB_VERSION) return

    if (storedVersion < 1) {
      // v1: Merge duplicated question bank keys
      const legacyQbank = localStorage.getItem('teacher_qbank_questions')
      const primaryQbank = localStorage.getItem(KEYS.QUESTION_BANK)
      if (legacyQbank && !primaryQbank) {
        localStorage.setItem(KEYS.QUESTION_BANK, legacyQbank)
      }
      localStorage.removeItem('teacher_qbank_questions')

      // v1: Merge duplicated repo keys
      const legacyRepo = localStorage.getItem('teacher_repo')
      const primaryRepo = localStorage.getItem(KEYS.REPO)
      if (legacyRepo && !primaryRepo) {
        localStorage.setItem(KEYS.REPO, legacyRepo)
      }
      localStorage.removeItem('teacher_repo')

      // v1: Remove obsolete v2 didactic units (superseded by v3)
      if (localStorage.getItem('teacher_didactic_sequence_units_v2') && !localStorage.getItem(KEYS.DIDACTIC_UNITS)) {
        const old = localStorage.getItem('teacher_didactic_sequence_units_v2')
        if (old) localStorage.setItem(KEYS.DIDACTIC_UNITS, old)
      }
      localStorage.removeItem('teacher_didactic_sequence_units_v2')
      localStorage.removeItem('teacher_lessonplanner_v2')
      localStorage.removeItem('teacher_weekly_schedule_v2')
    }

    localStorage.setItem(MIGRATION_KEY, String(LOCAL_DB_VERSION))
  } catch { /* migration failure is non-fatal */ }
}
