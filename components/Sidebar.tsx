'use client'

import { ModuleKey } from '@/app/page'

interface NavItem { key: ModuleKey; label: string; icon: string }
interface Section { label: string; items: NavItem[] }

const NAV: Section[] = [
  { label: '', items: [
    { key: 'dashboard', label: 'Início',         icon: 'ti-home-2' },
  ]},
  { label: 'Criar', items: [
    { key: 'lessonstudio',      label: 'Criar Aula 🎓',      icon: 'ti-chalkboard' },
    { key: 'quick',             label: 'Quick Generate',      icon: 'ti-sparkles' },
    { key: 'livequiz',          label: 'Live Quiz 🎮',        icon: 'ti-device-gamepad-2' },
    { key: 'exam',              label: 'Exam Builder',        icon: 'ti-file-text' },
    { key: 'plan',              label: 'Lesson Planner',      icon: 'ti-calendar-event' },
    { key: 'rubric',            label: 'Rubric & Key',        icon: 'ti-list-check' },
    { key: 'qbank',             label: 'Banco Questões',      icon: 'ti-archive' },
    { key: 'mindmap',           label: 'Mapa Mental',         icon: 'ti-atom-2' },
    { key: 'audiopronunciation',label: 'Pronúncia & Áudio 🔊',icon: 'ti-microphone' },
  ]},
  { label: '🏫 Em Sala', items: [
    { key: 'classroommode', label: 'Cockpit de Sala 🚀',   icon: 'ti-layout-dashboard' },
    { key: 'flashcardmode', label: 'Flashcards 🃏',         icon: 'ti-cards' },
  ]},
  { label: 'Alunos', items: [
    { key: 'gradebook', label: 'Gradebook',    icon: 'ti-chart-bar' },
    { key: 'omnigrader',label: 'OmniGrader 📷',icon: 'ti-camera' },
    { key: 'classes',   label: 'Turmas',       icon: 'ti-school' },
    { key: 'students',  label: 'Alunos',       icon: 'ti-user-circle' },
    { key: 'analytics', label: 'Desempenho',   icon: 'ti-chart-line' },
  ]},
  { label: 'Comunicação', items: [
    { key: 'parentcomms',    label: 'Whats com Pais 📲', icon: 'ti-brand-whatsapp' },
    { key: 'communications', label: 'Comunicados',       icon: 'ti-mail-forward' },
    { key: 'portfolio',      label: 'Portfólio',         icon: 'ti-award' },
  ]},
  { label: 'Área do Professor', items: [
    { key: 'classlog',         label: 'Dia de Aula 📖',        icon: 'ti-book' },
    { key: 'didacticsequence', label: 'Sequência Didática 🗺️', icon: 'ti-route-2' },
    { key: 'maestro',          label: 'Maestro 🎯',            icon: 'ti-subtask' },
    { key: 'portalmirror',     label: 'Portal Mirror',      icon: 'ti-plug-connected' },
    { key: 'calendar',      label: 'Calendário',        icon: 'ti-calendar' },
    { key: 'editor',        label: 'Editor Word',       icon: 'ti-file-text' },
    { key: 'repo',          label: 'Repository',       icon: 'ti-folder' },
    { key: 'wellbeing',     label: 'Bem-Estar',         icon: 'ti-heart' },
  ]},
  { label: 'Configurações', items: [
    { key: 'settings',   label: 'Geral & Preferências', icon: 'ti-settings' },
    { key: 'api',        label: 'APIs & Modelos',       icon: 'ti-brain' },
    { key: 'extensions', label: 'Extensões & Portais',  icon: 'ti-plug' },
  ]},
]

interface Props { active: ModuleKey; onNavigate: (k: ModuleKey) => void }

export default function Sidebar({ active, onNavigate }: Props) {
  return (
    <nav style={{
      width: 256,
      flexShrink: 0,
      height: '100vh',
      overflowY: 'auto',
      background: '#eee8d5',
      borderRight: '1px solid rgba(88,110,117,0.12)',
      display: 'flex',
      flexDirection: 'column',
      padding: '28px 12px',
      gap: 4,
    }}>
      {/* Brand */}
      <div style={{ padding: '0 12px 24px', borderBottom: '1px solid rgba(88,110,117,0.12)', marginBottom: 16 }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, color: '#073642', fontStyle: 'italic', letterSpacing: '-0.5px' }}>
          TEACHER<span style={{ color: '#b58900' }}>AI</span>
        </div>
        <div style={{ fontSize: 11, color: '#93a1a1', marginTop: 2, fontWeight: 400, letterSpacing: '0.5px' }}>
          Assistente Pedagógico
        </div>
      </div>

      {NAV.map((section) => (
        <div key={section.label} style={{ marginBottom: section.label ? 20 : 8 }}>
          {section.label && (
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#93a1a1', padding: '0 12px', marginBottom: 6 }}>
              {section.label}
            </div>
          )}
          {section.items.map((item) => {
            const isActive = active === item.key
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: 'none',
                  background: isActive ? '#fdf6e3' : 'transparent',
                  color: isActive ? '#073642' : '#586e75',
                  fontSize: 13.5,
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxShadow: isActive ? '0 1px 4px rgba(0,43,54,0.08)' : 'none',
                  marginBottom: 1,
                }}
                onMouseEnter={(e) => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'rgba(253,246,227,0.5)'; (e.currentTarget as HTMLElement).style.color = '#073642' } }}
                onMouseLeave={(e) => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#586e75' } }}
              >
                <i className={`ti ${item.icon}`} style={{ fontSize: 16, color: isActive ? '#b58900' : undefined, flexShrink: 0 }} />
                {item.label}
                {isActive && <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#b58900', flexShrink: 0 }} />}
              </button>
            )
          })}
        </div>
      ))}

      <div style={{ marginTop: 'auto', padding: '16px 12px 0', borderTop: '1px solid rgba(88,110,117,0.1)' }}>
        <div style={{ fontSize: 10, color: '#93a1a1' }}>Teacher.AI v2.0 · Enterprise</div>
      </div>
    </nav>
  )
}
