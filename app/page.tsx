'use client'

import { useState, useRef, useEffect } from 'react'
import { seedApiKeysIfNeeded } from '@/lib/seedApiKeys'
import { loadFromSupabase, syncToSupabase } from '@/lib/supabaseClient'
import Sidebar from '@/components/Sidebar'
import Dashboard from '@/components/modules/Dashboard'
import QuickGenerate from '@/components/modules/QuickGenerate'
import ExamBuilder from '@/components/modules/ExamBuilder'
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
import VoiceOrb from '@/components/VoiceOrb'
import WisprFlowOverlay from '@/components/WisprFlowOverlay'
import ClassroomMode from '@/components/modules/ClassroomMode'
import FlashcardMode from '@/components/modules/FlashcardMode'
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

import CommandPalette from '@/components/CommandPalette'
import LanguageSelector from '@/components/LanguageSelector'

export type ModuleKey = 'dashboard' | 'quick' | 'exam' | 'lessonstudio' | 'plan' | 'rubric' |
  'gradebook' | 'students' | 'classes' | 'organization' | 'privatetutoring' | 'eventos' | 'insights' | 'analytics' | 'calendar' | 'comms' | 'repo' |
  'wellbeing' | 'settings' | 'api' | 'qbank' | 'mindmap' | 'editor' |
  'communications' | 'portfolio' | 'extensions' | 'portalmirror' | 'omnigrader' | 'maestro' | 'classlog' | 'didacticsequence' | 'livequiz' | 'parentcomms' |
  'classroommode' | 'flashcardmode' | 'audiopronunciation' |
  'reflectivepractice' | 'meetingclassrecorder' | 'weeklyagenda' | 'batchgrader' | 'progresstracker' | 'autoreport'

const MODULES: Record<ModuleKey, React.ComponentType> = {
  dashboard:        Dashboard,
  quick:            QuickGenerate,
  exam:             ExamBuilder,
  lessonstudio:     LessonStudio,
  plan:             LessonPlanner,
  rubric:           Rubric,
  gradebook:        Gradebook,
  omnigrader:       OmniGrader,
  students:         Students,
  classes:          Classes,
  organization:     Organization,
  privatetutoring:  PrivateTutoring,
  eventos:          Eventos,
  insights:         Insights,
  analytics:        Analytics,
  calendar:         Planner,
  comms:            Communications,
  repo:             Repository,
  qbank:            QuestionBank,
  mindmap:          MindMap,
  editor:           Editor,
  communications:   Communications,
  portfolio:        Portfolio,
  wellbeing:           Wellbeing,
  settings:            Settings,
  api:                 ApiManager,
  extensions:          Extensions,
  portalmirror:        PortalMirrorModule,
  maestro:             Maestro,
  classlog:            ClassLog,
  didacticsequence:    DidacticSequence,
  livequiz:            LiveQuizModule,
  parentcomms:         ParentCommunicator,
  classroommode:       ClassroomMode,
  flashcardmode:       FlashcardMode,
  audiopronunciation:  AudioPronunciation,
  reflectivepractice:  ReflectivePractice,
  meetingclassrecorder:MeetingClassRecorder,
  weeklyagenda:        WeeklyAgenda,
  batchgrader:         BatchGrader,
  progresstracker:     ProgressTracker,
  autoreport:          AutoReport,
}


export default function Home() {
  const [active, setActive] = useState<ModuleKey>('dashboard')
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [showLangMenu, setShowLangMenu] = useState(false)
  const Module = MODULES[active]

  // Bridge: VoiceOrb sends commands → RafinhaChat processes them
  const rafinhaCommandRef = useRef<((text: string) => void) | null>(null)

  // ─── Auto-seed: configura APIs e Supabase no 1º carregamento ─────────────────
  useEffect(() => {
    seedApiKeysIfNeeded({
      elevenlabs_key: process.env.NEXT_PUBLIC_ELEVENLABS_KEY || '',
      groq_key:       process.env.NEXT_PUBLIC_GROQ_KEY || '',
      gemini_key:     process.env.NEXT_PUBLIC_GEMINI_KEY || '',
      openai_key:     process.env.NEXT_PUBLIC_OPENAI_KEY || '',
    })

    if (localStorage.getItem('teacher_auto_mode') === null) {
      localStorage.setItem('teacher_auto_mode', 'true')
    }

    const sbCfg = localStorage.getItem('teacher_supabase_config')
    if (!sbCfg || sbCfg === '{}' || !sbCfg.includes('parxakvjvuvsmvbvrshk')) {
      const defaultSb = {
        url:        'https://parxakvjvuvsmvbvrshk.supabase.co',
        anonKey:    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcnhha3ZqdnV2c212YnZyc2hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNjgyMDcsImV4cCI6MjA5Mzg0NDIwN30.m7usRhAT6Z_wHxZsykPjV_op5GyRscz3Gnu9teKTMoM',
        serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcnhha3ZqdnV2c212YnZyc2hrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODI2ODIwNywiZXhwIjoyMDkzODQ0MjA3fQ.ElMhM8T2IJpAIs8QIQm4temIdW1P533CRA3KSfs4oNw',
      }
      localStorage.setItem('teacher_supabase_config', JSON.stringify(defaultSb))
    }

    if (localStorage.getItem('teacher_supabase_config')) {
      loadFromSupabase().catch(() => {})
    }

    const handler = (e: Event) => setActive((e as CustomEvent).detail as ModuleKey)
    const togglePaletteHandler = () => setIsCommandPaletteOpen(prev => !prev)

    window.addEventListener('teacher:navigate', handler)
    window.addEventListener('teacher:toggle_command_palette', togglePaletteHandler)
    return () => {
      window.removeEventListener('teacher:navigate', handler)
      window.removeEventListener('teacher:toggle_command_palette', togglePaletteHandler)
    }
  }, [])

  // ─── Auto-Sync: sincroniza dados em background ao detectar mudanças ──────────
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

  return (
    <div className="flex w-full h-screen overflow-hidden" style={{ background: '#fdf8f2' }}>
      <Sidebar active={active} onNavigate={setActive} />
      <main
        className="flex-1 min-w-0 overflow-hidden flex flex-col relative"
        style={{
          transition: 'all 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
          width: '100%',
        }}
      >
        <div key={active} className="animate-fade-up flex-1 min-h-0 min-w-0 h-full overflow-y-auto overflow-x-hidden">
          <Module />
        </div>
      </main>


      {/* ─── DOCK FLUTUANTE DE AÇÕES EMBUTIDAS NO CANTO INFERIOR DIREITO ─── */}
      <div style={{
        position: 'fixed', bottom: 24, right: 94, zIndex: 9995,
        display: 'flex', alignItems: 'center', gap: 10
      }}>
        {/* Botão de Busca Rápida no Canto Inferior Direito */}
        <button
          onClick={() => setIsCommandPaletteOpen(true)}
          title="Abrir Busca Rápida (Ctrl+K)"
          style={{
            padding: '9px 16px', borderRadius: 24, border: '1px solid rgba(139,115,85,0.22)',
            background: '#fffcf8', color: '#2c1a0e', fontSize: 12.5, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 16px rgba(44,26,14,0.08)', transition: 'all 0.15s ease'
          }}
        >
          <i className="ti ti-search" style={{ color: '#8b5e3c', fontSize: 16 }} />
          <span>Busca Rápida</span>
          <kbd style={{ background: '#f5efe6', color: '#8b5e3c', padding: '2px 6px', borderRadius: 6, fontSize: 10, fontWeight: 700 }}>Ctrl+K</kbd>
        </button>
      </div>

      {/* Command Palette Modal (Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={setActive}
      />

      {/* VoiceOrb — UI visual pura */}
      <VoiceOrb />

      {/* WisprFlow Overlay (Alt+Shift+V) */}
      <WisprFlowOverlay />

      {/* RafinhaChat */}
      <RafinhaChat
        onNavigate={setActive}
        onCommandReady={(fn) => { rafinhaCommandRef.current = fn }}
      />
    </div>
  )
}

