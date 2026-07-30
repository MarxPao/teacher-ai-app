'use client'

import { useState, useRef, useEffect } from 'react'
import { seedApiKeysIfNeeded } from '@/lib/seedApiKeys'
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

export type ModuleKey = 'dashboard' | 'quick' | 'exam' | 'lessonstudio' | 'plan' | 'rubric' |
  'gradebook' | 'students' | 'classes' | 'analytics' | 'calendar' | 'comms' | 'repo' |
  'wellbeing' | 'settings' | 'api' | 'qbank' | 'mindmap' | 'editor' |
  'communications' | 'portfolio' | 'extensions' | 'portalmirror' | 'omnigrader' | 'maestro' | 'classlog' | 'didacticsequence' | 'livequiz' | 'parentcomms' |
  'classroommode' | 'flashcardmode' | 'audiopronunciation'

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
  analytics:        Analytics,
  calendar:         Planner,
  comms:            ComingSoon,
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
}

export default function Home() {
  const [active, setActive] = useState<ModuleKey>('dashboard')
  const Module = MODULES[active]

  // Bridge: VoiceOrb sends commands → RafinhaChat processes them
  // We use a ref-callback pattern so the orb can trigger chat sends
  const rafinhaCommandRef = useRef<((text: string) => void) | null>(null)

  // ─── Auto-seed: configura APIs e Supabase no 1º carregamento ─────────────────
  useEffect(() => {
    seedApiKeysIfNeeded({
      elevenlabs_key: process.env.NEXT_PUBLIC_ELEVENLABS_KEY || '',
      groq_key:       process.env.NEXT_PUBLIC_GROQ_KEY || '',
      gemini_key:     process.env.NEXT_PUBLIC_GEMINI_KEY || '',
      openai_key:     process.env.NEXT_PUBLIC_OPENAI_KEY || '',
    })

    // Ativa o Modo AUTO por padrão se ainda não estiver definido
    if (localStorage.getItem('teacher_auto_mode') === null) {
      localStorage.setItem('teacher_auto_mode', 'true')
    }

    // Configura o Supabase automaticamente se ainda não estiver configurado
    const sbCfg = localStorage.getItem('teacher_supabase_config')
    if (!sbCfg || sbCfg === '{}' || !sbCfg.includes('parxakvjvuvsmvbvrshk')) {
      const defaultSb = {
        url:        'https://parxakvjvuvsmvbvrshk.supabase.co',
        anonKey:    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcnhha3ZqdnV2c212YnZyc2hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNjgyMDcsImV4cCI6MjA5Mzg0NDIwN30.m7usRhAT6Z_wHxZsykPjV_op5GyRscz3Gnu9teKTMoM',
        serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcnhha3ZqdnV2c212YnZyc2hrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODI2ODIwNywiZXhwIjoyMDkzODQ0MjA3fQ.ElMhM8T2IJpAIs8QIQm4temIdW1P533CRA3KSfs4oNw',
      }
      localStorage.setItem('teacher_supabase_config', JSON.stringify(defaultSb))
    }
  }, [])

  return (
    <div className="flex w-full h-screen overflow-hidden" style={{ background: '#fdf6e3' }}>
      <Sidebar active={active} onNavigate={setActive} />
      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        <div key={active} className="animate-fade-up flex-1 min-h-0 min-w-0 h-full overflow-y-auto overflow-x-hidden">
          <Module />
        </div>
      </main>

      {/* VoiceOrb — UI visual pura, sem microfone próprio */}
      <VoiceOrb />

      {/* Barra Flutuante Global de Ditado Estilo Wispr Flow (Alt+Shift+V) */}
      <WisprFlowOverlay />

      {/* RafinhaChat — motor central de voz + agente */}
      <RafinhaChat
        onNavigate={setActive}
        onCommandReady={(fn) => { rafinhaCommandRef.current = fn }}
      />
    </div>
  )
}
