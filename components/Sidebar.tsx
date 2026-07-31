'use client'

import { ModuleKey } from '@/app/page'

interface NavItem { key: ModuleKey; label: string; icon: string }
interface Section { label: string; items: NavItem[] }

const NAV: Section[] = [
  { label: '', items: [
    { key: 'dashboard', label: 'Início', icon: 'ti-home-2' },
  ]},
  { label: 'Criação', items: [
    { key: 'lessonstudio',      label: 'Studio de Aula',        icon: 'ti-chalkboard' },
    { key: 'quick',             label: 'Geração Rápida',        icon: 'ti-sparkles' },
    { key: 'exam',              label: 'Criador de Provas',     icon: 'ti-file-text' },
    { key: 'plan',              label: 'Plano de Aula',         icon: 'ti-calendar-event' },
    { key: 'rubric',            label: 'Rubrica & Gabarito',    icon: 'ti-list-check' },
    { key: 'qbank',             label: 'Banco de Questões',     icon: 'ti-archive' },
    { key: 'audiopronunciation',label: 'Pronúncia & Áudio',     icon: 'ti-microphone' },
  ]},
  { label: 'Em Sala de Aula', items: [
    { key: 'classroommode', label: 'Cockpit de Sala',      icon: 'ti-layout-dashboard' },
    { key: 'flashcardmode', label: 'Flashcards',           icon: 'ti-cards' },
    { key: 'livequiz',      label: 'Quiz ao Vivo',         icon: 'ti-device-gamepad-2' },
  ]},
  { label: 'Alunos', items: [
    { key: 'gradebook',      label: 'Caderneta de Notas',  icon: 'ti-chart-bar' },
    { key: 'omnigrader',     label: 'OmniCorretor',        icon: 'ti-camera' },
    { key: 'batchgrader',    label: 'Correção em Lote',    icon: 'ti-files' },
    { key: 'classes',        label: 'Turmas',              icon: 'ti-school' },
    { key: 'students',       label: 'Alunos',              icon: 'ti-user-circle' },
    { key: 'progresstracker',label: 'Evolução do Aluno',   icon: 'ti-trending-up' },
    { key: 'analytics',      label: 'Desempenho',          icon: 'ti-chart-line' },
  ]},
  { label: 'Comunicação', items: [
    { key: 'parentcomms',    label: 'Mensagens aos Pais',  icon: 'ti-brand-whatsapp' },
    { key: 'autoreport',     label: 'Relatórios Mensais',  icon: 'ti-file-report' },
    { key: 'communications', label: 'Comunicados',         icon: 'ti-mail-forward' },
    { key: 'portfolio',      label: 'Portfólio',           icon: 'ti-award' },
  ]},
  { label: 'Área do Professor', items: [
    { key: 'reflectivepractice',  label: 'Reflexão da Prática',     icon: 'ti-bulb-spark' },
    { key: 'meetingclassrecorder',label: 'Diário de Aulas',         icon: 'ti-notebook' },
    { key: 'weeklyagenda',        label: 'Agenda Semanal',          icon: 'ti-calendar-time' },
    { key: 'mindmap',             label: 'Mapa Mental',             icon: 'ti-hierarchy-2' },
    { key: 'classlog',            label: 'Registro de Aula',        icon: 'ti-book' },
    { key: 'didacticsequence',    label: 'Sequência Didática',      icon: 'ti-route-2' },
    { key: 'maestro',             label: 'Maestro',                 icon: 'ti-subtask' },
    { key: 'portalmirror',        label: 'Portal Conectado',        icon: 'ti-plug-connected' },
    { key: 'calendar',            label: 'Calendário',              icon: 'ti-calendar' },
    { key: 'editor',              label: 'Editor de Documentos',    icon: 'ti-file-pencil' },
    { key: 'repo',                label: 'Repositório',             icon: 'ti-folder-open' },
    { key: 'wellbeing',           label: 'Bem-Estar Docente',       icon: 'ti-heart' },
  ]},
  { label: 'Configurações', items: [
    { key: 'settings',   label: 'Preferências',         icon: 'ti-settings' },
    { key: 'api',        label: 'Modelos de IA',        icon: 'ti-brain' },
    { key: 'extensions', label: 'Portais & Extensões',  icon: 'ti-plug' },
  ]},
]

interface Props { active: ModuleKey; onNavigate: (k: ModuleKey) => void }

export default function Sidebar({ active, onNavigate }: Props) {
  return (
    <nav style={{
      width: 260,
      flexShrink: 0,
      height: '100vh',
      overflowY: 'auto',
      background: '#f5efe6',
      borderRight: '1px solid rgba(139,115,85,0.14)',
      display: 'flex',
      flexDirection: 'column',
      padding: '0 10px 24px',
      gap: 0,
    }}>
      {/* Brand */}
      <div style={{
        padding: '24px 14px 20px',
        borderBottom: '1px solid rgba(139,115,85,0.12)',
        marginBottom: 14,
        position: 'sticky',
        top: 0,
        background: '#f5efe6',
        zIndex: 10,
      }}>
        <div style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 22,
          fontWeight: 700,
          color: '#2c1a0e',
          letterSpacing: '-0.3px',
          lineHeight: 1.1,
        }}>
          Teacher<span style={{ color: '#8b5e3c' }}>AI</span>
        </div>
        <div style={{
          fontSize: 10.5,
          color: '#a08060',
          marginTop: 4,
          fontWeight: 500,
          letterSpacing: '1.2px',
          textTransform: 'uppercase',
        }}>
          Assistente Pedagógico
        </div>
      </div>

      {/* Nav sections */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {NAV.map((section) => (
          <div key={section.label} style={{ marginBottom: section.label ? 4 : 0 }}>
            {section.label && (
              <div style={{
                fontSize: 9.5,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '1.8px',
                color: '#c4a882',
                padding: '14px 14px 5px',
              }}>
                {section.label}
              </div>
            )}
            {section.items.map((item) => {
              const isActive = active === item.key
              return (
                <SidebarItem
                  key={item.key}
                  item={item}
                  isActive={isActive}
                  onNavigate={onNavigate}
                />
              )
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 16,
        padding: '14px 14px 0',
        borderTop: '1px solid rgba(139,115,85,0.1)',
      }}>
        <div style={{ fontSize: 9.5, color: '#c4a882', letterSpacing: '0.5px' }}>
          TeacherAI v2.0 · Enterprise
        </div>
      </div>
    </nav>
  )
}

function SidebarItem({ item, isActive, onNavigate }: {
  item: { key: ModuleKey; label: string; icon: string }
  isActive: boolean
  onNavigate: (k: ModuleKey) => void
}) {
  return (
    <button
      onClick={() => onNavigate(item.key)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '8px 14px',
        borderRadius: 8,
        border: 'none',
        background: isActive
          ? 'linear-gradient(135deg, #fdf2e5 0%, #f5e6d0 100%)'
          : 'transparent',
        color: isActive ? '#2c1a0e' : '#7a5c42',
        fontSize: 13,
        fontWeight: isActive ? 600 : 400,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s ease',
        boxShadow: isActive
          ? 'inset 0 0 0 1px rgba(139,94,60,0.18), 0 1px 3px rgba(44,26,14,0.07)'
          : 'none',
        marginBottom: 1,
        borderLeft: isActive ? '2px solid #8b5e3c' : '2px solid transparent',
        lineHeight: 1.2,
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = 'rgba(139,94,60,0.06)'
          ;(e.currentTarget as HTMLElement).style.color = '#2c1a0e'
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = 'transparent'
          ;(e.currentTarget as HTMLElement).style.color = '#7a5c42'
        }
      }}
    >
      <i
        className={`ti ${item.icon}`}
        style={{
          fontSize: 15,
          color: isActive ? '#8b5e3c' : '#b89474',
          flexShrink: 0,
          lineHeight: 1,
        }}
      />
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {item.label}
      </span>
    </button>
  )
}
