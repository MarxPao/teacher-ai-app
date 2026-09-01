'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { seedApiKeysIfNeeded } from '@/lib/seedApiKeys'
import { loadFromSupabase, syncToSupabase } from '@/lib/supabaseClient'
import Sidebar from '@/components/Sidebar'
import RafinhaChat from '@/components/RafinhaChat'
import CommandPalette from '@/components/CommandPalette'
import LanguageSelector from '@/components/LanguageSelector'
import AuthGate from '@/components/AuthGate'
import OnboardingFlow from '@/components/OnboardingFlow'
import Topbar from '@/components/Topbar'
import BottomTabBar from '@/components/BottomTabBar'
import Scratchpad from '@/components/Scratchpad'
import TeacherLogo from '@/components/TeacherLogo'
import WisprFlowOverlay from '@/components/WisprFlowOverlay'
import { getCurrentSession, saveSession, AuthSession } from '@/lib/supabaseAuth'
import { ToastProvider, ConfirmProvider } from '@/components/Toast'
import { ErrorBoundary } from '@/components/ErrorBoundary'

// ─── Module Skeleton (shown while lazy chunk loads) ────────────────────────────
function ModuleSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 32, width: '100%' }}>
      <div style={{ height: 32, width: '42%', background: 'rgba(139,94,60,0.08)', borderRadius: 8 }} />
      <div style={{ height: 16, width: '66%', background: 'rgba(139,94,60,0.05)', borderRadius: 6 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ height: 120, background: 'rgba(139,94,60,0.04)', borderRadius: 12 }} />
        ))}
      </div>
    </div>
  )
}

// ─── Lazy Module Imports (each loads its JS chunk on first navigation) ─────────
const opts = { loading: () => <ModuleSkeleton />, ssr: false } as const

const Dashboard             = dynamic(() => import('@/components/modules/Dashboard'),             opts)
const TestAndWorksheets     = dynamic(() => import('@/components/modules/TestAndWorksheets'),     opts)
const LessonStudio          = dynamic(() => import('@/components/modules/LessonStudio'),          opts)
const LessonPlanner         = dynamic(() => import('@/components/modules/LessonPlanner'),         opts)
const Rubric                = dynamic(() => import('@/components/modules/Rubric'),                opts)
const Gradebook             = dynamic(() => import('@/components/modules/Gradebook'),             opts)
const Students              = dynamic(() => import('@/components/modules/Students'),              opts)
const Classes               = dynamic(() => import('@/components/modules/Classes'),               opts)
const OmniGrader            = dynamic(() => import('@/components/modules/OmniGrader'),            opts)
const Analytics             = dynamic(() => import('@/components/modules/Analytics'),             opts)
const Repository            = dynamic(() => import('@/components/modules/Repository'),            opts)
const Settings              = dynamic(() => import('@/components/modules/Settings'),              opts)
const ApiManager            = dynamic(() => import('@/components/modules/ApiManager'),            opts)
const ComingSoon            = dynamic(() => import('@/components/modules/ComingSoon'),            opts)
const Planner               = dynamic(() => import('@/components/modules/Planner'),               opts)
const QuestionBank          = dynamic(() => import('@/components/modules/QuestionBank'),          opts)
const MindMap               = dynamic(() => import('@/components/modules/MindMap'),               opts)
const Editor                = dynamic(() => import('@/components/modules/Editor'),                opts)
const Communications        = dynamic(() => import('@/components/modules/Communications'),        opts)
const Portfolio             = dynamic(() => import('@/components/modules/Portfolio'),             opts)
const Maestro               = dynamic(() => import('@/components/modules/Maestro'),               opts)
const ClassLog              = dynamic(() => import('@/components/modules/ClassLog'),              opts)
const DidacticSequence      = dynamic(() => import('@/components/modules/DidacticSequence'),      opts)
const LiveQuizModule        = dynamic(() => import('@/components/modules/LiveQuizModule'),        opts)
const ParentCommunicator    = dynamic(() => import('@/components/modules/ParentCommunicator'),    opts)
const Extensions            = dynamic(() => import('@/components/modules/Extensions'),            opts)
const PortalMirrorModule    = dynamic(() => import('@/components/modules/PortalMirrorModule'),    opts)
const ClassroomMode         = dynamic(() => import('@/components/modules/ClassroomMode'),         opts)
const FlashcardMode         = dynamic(() => import('@/components/modules/FlashcardMode'),         opts)
const AttendanceList        = dynamic(() => import('@/components/modules/AttendanceList'),        opts)
const Wellbeing             = dynamic(() => import('@/components/modules/Wellbeing'),             opts)
const AudioPronunciation    = dynamic(() => import('@/components/modules/AudioPronunciation'),    opts)
const ReflectivePractice    = dynamic(() => import('@/components/modules/ReflectivePractice'),    opts)
const MeetingClassRecorder  = dynamic(() => import('@/components/modules/MeetingClassRecorder'),  opts)
const WeeklyAgenda          = dynamic(() => import('@/components/modules/WeeklyAgenda'),          opts)
const BatchGrader           = dynamic(() => import('@/components/modules/BatchGrader'),           opts)
const ProgressTracker       = dynamic(() => import('@/components/modules/ProgressTracker'),       opts)
const AutoReport            = dynamic(() => import('@/components/modules/AutoReport'),            opts)
const Organization          = dynamic(() => import('@/components/modules/Organization'),          opts)
const PrivateTutoring       = dynamic(() => import('@/components/modules/PrivateTutoring'),       opts)
const Eventos               = dynamic(() => import('@/components/modules/Eventos'),               opts)
const VisualStudio          = dynamic(() => import('@/components/modules/VisualStudio'),          opts)
const Insights              = dynamic(() => import('@/components/modules/Insights'),              opts)
const ChecklistHistoryModule = dynamic(() => import('@/components/modules/ChecklistHistoryModule'), opts)

// ─── Module Key type ───────────────────────────────────────────────────────────
export type ModuleKey =
  | 'dashboard' | 'test_and_worksheets' | 'quick' | 'exam' | 'lessonstudio' | 'plan' | 'rubric'
  | 'gradebook' | 'students' | 'classes' | 'organization' | 'checklist' | 'privatetutoring'
  | 'eventos' | 'visualstudio' | 'insights' | 'analytics' | 'calendar' | 'comms' | 'repo'
  | 'wellbeing' | 'settings' | 'api' | 'qbank' | 'mindmap' | 'editor'
  | 'communications' | 'portfolio' | 'extensions' | 'portalmirror' | 'omnigrader' | 'maestro'
  | 'classlog' | 'didacticsequence' | 'livequiz' | 'parentcomms'
  | 'classroommode' | 'attendancelist' | 'flashcardmode' | 'audiopronunciation'
  | 'reflectivepractice' | 'meetingclassrecorder' | 'weeklyagenda' | 'batchgrader'
  | 'progresstracker' | 'autoreport'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODULES: Record<ModuleKey, React.ComponentType<any>> = {
  dashboard:          Dashboard,
  test_and_worksheets: TestAndWorksheets,
  quick:              () => <TestAndWorksheets initialMode="worksheet" />,
  exam:               () => <TestAndWorksheets initialMode="exam" />,
  lessonstudio:       LessonStudio,
  plan:               LessonStudio,
  rubric:             Rubric,
  gradebook:          Gradebook,
  omnigrader:         OmniGrader,
  students:           Students,
  classes:            Classes,
  organization:       Organization,
  checklist:          ChecklistHistoryModule,
  privatetutoring:    PrivateTutoring,
  eventos:            Eventos,
  visualstudio:       VisualStudio,
  insights:           Insights,
  analytics:          Analytics,
  calendar:           Planner,
  comms:              Communications,
  repo:               Repository,
  qbank:              QuestionBank,
  mindmap:            MindMap,
  editor:             Editor,
  communications:     Communications,
  portfolio:          Portfolio,
  wellbeing:          Wellbeing,
  settings:           Settings,
  api:                ApiManager,
  extensions:         Extensions,
  portalmirror:       PortalMirrorModule,
  maestro:            Maestro,
  classlog:           ClassLog,
  didacticsequence:   LessonStudio,
  livequiz:           LiveQuizModule,
  parentcomms:        () => <Communications initialTab="parents" />,
  classroommode:      ClassroomMode,
  attendancelist:     AttendanceList,
  flashcardmode:      FlashcardMode,
  audiopronunciation: AudioPronunciation,
  reflectivepractice: ReflectivePractice,
  meetingclassrecorder: MeetingClassRecorder,
  weeklyagenda:       Planner,
  batchgrader:        () => <OmniGrader initialTab="batch" />,
  progresstracker:    Analytics,
  autoreport:         AutoReport,
}

// ─── App ───────────────────────────────────────────────────────────────────────
export default function Home() {
  const [active, setActive] = useState<ModuleKey>('dashboard')
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [showLangMenu, setShowLangMenu] = useState(false)
  const Module = MODULES[active]

  const [session, setSession] = useState<AuthSession | null>(null)
  const [authMounted, setAuthMounted] = useState(false)
  const [onboardingDone, setOnboardingDone] = useState(true)

  const rafinhaCommandRef = useRef<((text: string) => void) | null>(null)

  // Auto-seed: configura APIs e Supabase no 1º carregamento
  useEffect(() => {
    seedApiKeysIfNeeded({
      elevenlabs_key: process.env.NEXT_PUBLIC_ELEVENLABS_KEY || '',
      groq_key:       process.env.NEXT_PUBLIC_GROQ_KEY       || '',
      gemini_key:     process.env.NEXT_PUBLIC_GEMINI_KEY     || '',
      openai_key:     process.env.NEXT_PUBLIC_OPENAI_KEY     || '',
    })

    if (localStorage.getItem('teacher_auto_mode') === null) {
      localStorage.setItem('teacher_auto_mode', 'true')
    }

    // ─── Purga de Dados Simulados Legados ────────────────────────────────────
    try {
      const rawSch = localStorage.getItem('teacher_schools')
      if (rawSch) {
        const parsed = JSON.parse(rawSch)
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter(s => s.name !== 'Colégio Integral' && s.name !== 'Escola Modelo')
          if (cleaned.length !== parsed.length) localStorage.setItem('teacher_schools', JSON.stringify(cleaned))
        }
      }

      const rawAgenda = localStorage.getItem('teacher_agenda_schedule')
      if (rawAgenda) {
        const parsed = JSON.parse(rawAgenda)
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter(item => {
            const isLegacySeedId = !item.id || item.id.startsWith('demo-') || /^c[1-7]$/.test(item.id)
            const isLegacySeedSchool = item.schoolName === 'Colégio Integral' || item.schoolName === 'Escola Modelo' || item.school === 'Colégio Integral' || item.school === 'Escola Modelo'
            const isLegacySample = (item.className === 'Turma Geral' || item.schoolName === 'Escola') && (item.topic === 'Verb To Be' || item.topic === 'Simple Past' || item.topic === 'Simple Past: Regular vs Irregular Verbs')
            return !isLegacySeedId && !isLegacySeedSchool && !isLegacySample
          })
          if (cleaned.length !== parsed.length) localStorage.setItem('teacher_agenda_schedule', JSON.stringify(cleaned))
        }
      }

      localStorage.removeItem('teacher_weekly_schedule_v2')

      const rawCal = localStorage.getItem('teacher_calendar_tasks')
      if (rawCal) {
        const parsed = JSON.parse(rawCal)
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter(t => !t.id?.startsWith('demo-') && !t.id?.startsWith('suggest-'))
          if (cleaned.length !== parsed.length) localStorage.setItem('teacher_calendar_tasks', JSON.stringify(cleaned))
        }
      }
    } catch { /* legacy data purge — non-fatal */ }

    const sbCfg = localStorage.getItem('teacher_supabase_config')
    if (!sbCfg || sbCfg === '{}' || sbCfg.includes('serviceKey')) {
      const defaultSb = {
        url:     process.env.NEXT_PUBLIC_SUPABASE_URL      || 'https://parxakvjvuvsmvbvrshk.supabase.co',
        anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcnhha3ZqdnV2c212YnZyc2hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNjgyMDcsImV4cCI6MjA5Mzg0NDIwN30.m7usRhAT6Z_wHxZsykPjV_op5GyRscz3Gnu9teKTMoM',
      }
      localStorage.setItem('teacher_supabase_config', JSON.stringify(defaultSb))
    }

    let currentSession = getCurrentSession()
    if (!currentSession) {
      currentSession = {
        accessToken:  `teacher_token_${Date.now()}`,
        refreshToken: '',
        expiresAt:    Date.now() + 30 * 86400000,
        user: {
          id:             'usr_rafaela_elt',
          email:          'rafaelaelt@gmail.com',
          name:           'Rafaela',
          defaultSubject: 'english'
        }
      }
      saveSession(currentSession)
    }
    setSession(currentSession)
    setOnboardingDone(true)
    setAuthMounted(true)

    if (localStorage.getItem('teacher_supabase_config')) {
      loadFromSupabase().catch(() => {})
    }

    const handler              = (e: Event) => setActive((e as CustomEvent).detail as ModuleKey)
    const togglePaletteHandler = () => setIsCommandPaletteOpen(prev => !prev)
    const authChangeHandler    = (e: Event) => {
      const newSession = (e as CustomEvent).detail as AuthSession | null
      setSession(newSession)
      setOnboardingDone(true)
    }

    window.addEventListener('teacher:navigate', handler)
    window.addEventListener('teacher:toggle_command_palette', togglePaletteHandler)
    window.addEventListener('teacher:auth_changed', authChangeHandler)
    return () => {
      window.removeEventListener('teacher:navigate', handler)
      window.removeEventListener('teacher:toggle_command_palette', togglePaletteHandler)
      window.removeEventListener('teacher:auth_changed', authChangeHandler)
    }
  }, [])

  // Auto-Sync: sincroniza dados em background ao detectar mudanças
  useEffect(() => {
    let timer: NodeJS.Timeout
    const handleDataChange = () => {
      clearTimeout(timer)
      timer = setTimeout(() => { syncToSupabase().catch(() => {}) }, 2500)
    }
    window.addEventListener('storage', handleDataChange)
    window.addEventListener('teacher:data_changed', handleDataChange)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('storage', handleDataChange)
      window.removeEventListener('teacher:data_changed', handleDataChange)
    }
  }, [])

  if (!authMounted) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-[#fdf8f2]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-[#8b5e3c] flex items-center justify-center animate-pulse shadow-md">
            <TeacherLogo size={32} color="#fff" />
          </div>
          <span className="text-xs font-bold text-[#8b5e3c] tracking-wider uppercase">Carregando Teacher AI...</span>
        </div>
      </div>
    )
  }

  return (
    <ToastProvider>
    <ConfirmProvider>
    <div className="flex w-full h-screen overflow-hidden" style={{ background: '#fdf8f2' }}>
      <div className="sidebar-wrapper">
        <Sidebar active={active} onNavigate={setActive} />
      </div>
      <main
        className="flex-1 min-w-0 overflow-hidden flex flex-col relative main-content"
        style={{ transition: 'all 0.28s cubic-bezier(0.16, 1, 0.3, 1)', width: '100%' }}
      >
        <Topbar module={active} isAiLoading={false} onNavigate={setActive} />
        <div key={active} className="module-enter flex-1 min-h-0 min-w-0 h-full overflow-y-auto overflow-x-hidden">
          {/* ErrorBoundary prevents one module crash from taking down the whole app */}
          <ErrorBoundary moduleName={active}>
            <Module />
          </ErrorBoundary>
        </div>
      </main>

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={setActive}
      />
      <WisprFlowOverlay />
      <Scratchpad />
      <BottomTabBar active={active} onNavigate={setActive} />
      <RafinhaChat
        onNavigate={setActive}
        onCommandReady={(fn) => { rafinhaCommandRef.current = fn }}
      />
    </div>
    </ConfirmProvider>
    </ToastProvider>
  )
}