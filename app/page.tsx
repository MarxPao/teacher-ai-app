'use client'

import { useState, useRef, useEffect } from 'react'
import { seedApiKeysIfNeeded } from '@/lib/seedApiKeys'
import { loadFromSupabase, syncToSupabase } from '@/lib/supabaseClient'
import Sidebar from '@/components/Sidebar'
import Dashboard from '@/components/modules/Dashboard'
import QuickGenerate from '@/components/modules/QuickGenerate'
import ExamBuilder from '@/components/modules/ExamBuilder'
import TestAndWorksheets from '@/components/modules/TestAndWorksheets'
import LessonPlanner from '@/components/modules/LessonPlanner'
import LessonStudio from '@/components/modules/LessonStudio'
import Rubric from '@/components/modules/Rubric'
import Gradebook from '@/components/modules/Gradebook'
import Students from '@/components/modules/Students'
import Classes from '@/components/modules/Classes'
import OmniGrader from '@/components/modules/OmniGrader'
import Analytics from '@/components/modules/Analytics'
import Repository from '@/components/modules/Repository'
import Settings from '@/components/modules/Settings'
import ApiManager from '@/components/modules/ApiManager'
import ComingSoon from '@/components/modules/ComingSoon'
import Planner from '@/components/modules/Planner'
import QuestionBank from '@/components/modules/QuestionBank'
import MindMap from '@/components/modules/MindMap'
import Editor from '@/components/modules/Editor'
import Communications from '@/components/modules/Communications'
import Portfolio from '@/components/modules/Portfolio'
import Maestro from '@/components/modules/Maestro'
import ClassLog from '@/components/modules/ClassLog'
import DidacticSequence from '@/components/modules/DidacticSequence'
import LiveQuizModule from '@/components/modules/LiveQuizModule'
import ParentCommunicator from '@/components/modules/ParentCommunicator'
import RafinhaChat from '@/components/RafinhaChat'
import Extensions from '@/components/modules/Extensions'
import PortalMirrorModule from '@/components/modules/PortalMirrorModule'
import WisprFlowOverlay from '@/components/WisprFlowOverlay'
import ClassroomMode from '@/components/modules/ClassroomMode'
import FlashcardMode from '@/components/modules/FlashcardMode'
import AttendanceList from '@/components/modules/AttendanceList'
import Wellbeing from '@/components/modules/Wellbeing'
import AudioPronunciation from '@/components/modules/AudioPronunciation'
import ReflectivePractice from '@/components/modules/ReflectivePractice'
import MeetingClassRecorder from '@/components/modules/MeetingClassRecorder'
import WeeklyAgenda from '@/components/modules/WeeklyAgenda'
import BatchGrader from '@/components/modules/BatchGrader'
import ProgressTracker from '@/components/modules/ProgressTracker'
import AutoReport from '@/components/modules/AutoReport'
import Organization from '@/components/modules/Organization'
import PrivateTutoring from '@/components/modules/PrivateTutoring'
import Eventos from '@/components/modules/Eventos'
import Insights from '@/components/modules/Insights'
import ChecklistHistoryModule from '@/components/modules/ChecklistHistoryModule'

import CommandPalette from '@/components/CommandPalette'
import LanguageSelector from '@/components/LanguageSelector'
import AuthGate from '@/components/AuthGate'
import OnboardingFlow from '@/components/OnboardingFlow'
import Topbar from '@/components/Topbar'
import BottomTabBar from '@/components/BottomTabBar'
import Scratchpad from '@/components/Scratchpad'
import TeacherLogo from '@/components/TeacherLogo'
import { getCurrentSession, saveSession, AuthSession } from '@/lib/supabaseAuth'
import { ToastProvider, ConfirmProvider } from '@/components/Toast'

export type ModuleKey = 'dashboard' | 'test_and_worksheets' | 'quick' | 'exam' | 'lessonstudio' | 'plan' | 'rubric' |
  'gradebook' | 'students' | 'classes' | 'organization' | 'checklist' | 'privatetutoring' | 'eventos' | 'insights' | 'analytics' | 'calendar' | 'comms' | 'repo' |
  'wellbeing' | 'settings' | 'api' | 'qbank' | 'mindmap' | 'editor' |
  'communications' | 'portfolio' | 'extensions' | 'portalmirror' | 'omnigrader' | 'maestro' | 'classlog' | 'didacticsequence' | 'livequiz' | 'parentcomms' |
  'classroommode' | 'attendancelist' | 'flashcardmode' | 'audiopronunciation' |
  'reflectivepractice' | 'meetingclassrecorder' | 'weeklyagenda' | 'batchgrader' | 'progresstracker' | 'autoreport'

const MODULES: Record<ModuleKey, React.ComponentType<any>> = {
  dashboard: Dashboard,
  test_and_worksheets: TestAndWorksheets,
  quick: () => <TestAndWorksheets initialMode="worksheet" />,
  exam: () => <TestAndWorksheets initialMode="exam" />,
  lessonstudio: LessonStudio,
  plan: LessonStudio,
  rubric: Rubric,
  gradebook: Gradebook,
  omnigrader: OmniGrader,
  students: Students,
  classes: Classes,
  organization: Organization,
  checklist: ChecklistHistoryModule,
  privatetutoring: PrivateTutoring,
  eventos: Eventos,
  insights: Insights,
  analytics: Analytics,
  calendar: Planner,
  comms: Communications,
  repo: Repository,
  qbank: QuestionBank,
  mindmap: MindMap,
  editor: Editor,
  communications: Communications,
  portfolio: Portfolio,
  wellbeing: Wellbeing,
  settings: Settings,
  api: ApiManager,
  extensions: Extensions,
  portalmirror: PortalMirrorModule,
  maestro: Maestro,
  classlog: ClassLog,
  didacticsequence: LessonStudio,
  livequiz: LiveQuizModule,
  parentcomms: () => <Communications initialTab="parents" />,
  classroommode: ClassroomMode,
  attendancelist: AttendanceList,
  flashcardmode: FlashcardMode,
  audiopronunciation: AudioPronunciation,
  reflectivepractice: ReflectivePractice,
  meetingclassrecorder: MeetingClassRecorder,
  weeklyagenda: Planner,
  batchgrader: () => <OmniGrader initialTab="batch" />,
  progresstracker: Analytics,
  autoreport: AutoReport,
}


export default function Home() {
  const [active, setActive] = useState<ModuleKey>('dashboard')
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [showLangMenu, setShowLangMenu] = useState(false)
  const Module = MODULES[active]

  // Auth & Onboarding state
  const [session, setSession] = useState<AuthSession | null>(null)
  const [authMounted, setAuthMounted] = useState(false)
  const [onboardingDone, setOnboardingDone] = useState(true)

  // Bridge: VoiceOrb sends commands RafinhaChat processes them
  const rafinhaCommandRef = useRef<((text: string) => void) | null>(null)

  // Auto-seed: configura APIs e Supabase no 1º carregamento 
  useEffect(() => {
    seedApiKeysIfNeeded({
      elevenlabs_key: process.env.NEXT_PUBLIC_ELEVENLABS_KEY || '',
      groq_key: process.env.NEXT_PUBLIC_GROQ_KEY || '',
      gemini_key: process.env.NEXT_PUBLIC_GEMINI_KEY || '',
      openai_key: process.env.NEXT_PUBLIC_OPENAI_KEY || '',
    })

    if (localStorage.getItem('teacher_auto_mode') === null) {
      localStorage.setItem('teacher_auto_mode', 'true')
    }

    // ─── Purga de Dados Simulados Legados (Escola Modelo, Colégio Integral, Demos) ───
    try {
      // 1. Limpar escolas simuladas
      const rawSch = localStorage.getItem('teacher_schools')
      if (rawSch) {
        const parsed = JSON.parse(rawSch)
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter(s => s.name !== 'Colégio Integral' && s.name !== 'Escola Modelo')
          if (cleaned.length !== parsed.length) {
            localStorage.setItem('teacher_schools', JSON.stringify(cleaned))
          }
        }
      }

      // 2. Limpar grade / agenda simulada
      const rawAgenda = localStorage.getItem('teacher_agenda_schedule')
      if (rawAgenda) {
        const parsed = JSON.parse(rawAgenda)
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter(item => {
            const isMockId = !item.id || item.id.startsWith('demo-') || /^c[1-7]$/.test(item.id)
            const isMockSchool = item.schoolName === 'Colégio Integral' || item.schoolName === 'Escola Modelo' || item.school === 'Colégio Integral' || item.school === 'Escola Modelo'
            const isLegacySample = (item.className === 'Turma Geral' || item.schoolName === 'Escola') && (item.topic === 'Verb To Be' || item.topic === 'Simple Past' || item.topic === 'Simple Past: Regular vs Irregular Verbs')
            return !isMockId && !isMockSchool && !isLegacySample
          })
          if (cleaned.length !== parsed.length) {
            localStorage.setItem('teacher_agenda_schedule', JSON.stringify(cleaned))
          }
        }
      }

      // 3. Limpar weekly schedule v2 legado
      localStorage.removeItem('teacher_weekly_schedule_v2')

      // 4. Limpar tarefas de calendário simuladas
      const rawCal = localStorage.getItem('teacher_calendar_tasks')
      if (rawCal) {
        const parsed = JSON.parse(rawCal)
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter(t => !t.id?.startsWith('demo-') && !t.id?.startsWith('suggest-'))
          if (cleaned.length !== parsed.length) {
            localStorage.setItem('teacher_calendar_tasks', JSON.stringify(cleaned))
          }
        }
      }
    } catch {}

    const sbCfg = localStorage.getItem('teacher_supabase_config')
    if (!sbCfg || sbCfg === '{}' || sbCfg.includes('serviceKey')) {
      const defaultSb = {
        url: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://parxakvjvuvsmvbvrshk.supabase.co',
        anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcnhha3ZqdnV2c212YnZyc2hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNjgyMDcsImV4cCI6MjA5Mzg0NDIwN30.m7usRhAT6Z_wHxZsykPjV_op5GyRscz3Gnu9teKTMoM',
      }
      localStorage.setItem('teacher_supabase_config', JSON.stringify(defaultSb))
    }

    // Verificar sessão atual (ou inicializar padrão quando auth estiver pausado)
    let currentSession = getCurrentSession()
    if (!currentSession) {
      currentSession = {
        accessToken: `teacher_token_${Date.now()}`,
        refreshToken: '',
        expiresAt: Date.now() + 30 * 86400000,
        user: {
          id: 'usr_rafaela_elt',
          email: 'rafaelaelt@gmail.com',
          name: 'Rafaela',
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

    const handler = (e: Event) => setActive((e as CustomEvent).detail as ModuleKey)
    const togglePaletteHandler = () => setIsCommandPaletteOpen(prev => !prev)
    const authChangeHandler = (e: Event) => {
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
      timer = setTimeout(() => {
        syncToSupabase().catch(() => {})
      }, 2500)
    }
    window.addEventListener('storage', handleDataChange)
    window.addEventListener('teacher:data_changed', handleDataChange)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('storage', handleDataChange)
      window.removeEventListener('teacher:data_changed', handleDataChange)
    }
  }, [])

  // Se ainda não montou no cliente, renderizar splash limpo para evitar hydration mismatch
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

  // ─── JANELA DE AUTENTICAÇÃO E ONBOARDING PAUSADAS TEMPORARIAMENTE ───
  // Permite acesso direto a todas as funcionalidades do aplicativo
  return (
    <ToastProvider>
    <ConfirmProvider>
    <div className="flex w-full h-screen overflow-hidden" style={{ background: '#fdf8f2' }}>
      <div className="sidebar-wrapper">
        <Sidebar active={active} onNavigate={setActive} />
      </div>
      <main
        className="flex-1 min-w-0 overflow-hidden flex flex-col relative main-content"
        style={{
          transition: 'all 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
          width: '100%',
        }}
      >
        <Topbar module={active} isAiLoading={false} onNavigate={setActive} />
        <div key={active} className="module-enter flex-1 min-h-0 min-w-0 h-full overflow-y-auto overflow-x-hidden">
          <Module />
        </div>
      </main>

      {/* Command Palette Modal (Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={setActive}
      />

      {/* WisprFlow Overlay (Alt+Shift+V) */}
      <WisprFlowOverlay />

      {/* Scratchpad — Bloco de Notas Rápidas Persistente (#26) */}
      <Scratchpad />

      {/* Bottom Tab Bar — Mobile Navigation (#42) */}
      <BottomTabBar active={active} onNavigate={setActive} />

      {/* RafinhaChat */}
      <RafinhaChat
        onNavigate={setActive}
        onCommandReady={(fn) => { rafinhaCommandRef.current = fn }}
      />
    </div>
    </ConfirmProvider>
    </ToastProvider>
  )
}