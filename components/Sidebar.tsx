'use client'

import { ModuleKey } from '@/app/page'
import TeacherLogo from '@/components/TeacherLogo'

interface NavItem { key: ModuleKey; label: string; icon: string }
interface Section { label: string; items: NavItem[] }

const NAV: Section[] = [
  { label: '', items: [
    { key: 'dashboard', label: 'Início', icon: 'ti-home-2' },
  ]},
  { label: 'Organização', items: [
    { key: 'students',       label: 'Alunos',                icon: 'ti-user-circle' },
    { key: 'classes',        label: 'Turmas',                icon: 'ti-school' },
    { key: 'organization',   label: 'Escolas',               icon: 'ti-building-community' },
    { key: 'insights',       label: 'Insights',              icon: 'ti-bulb' },
    { key: 'checklist',      label: 'Checklist',             icon: 'ti-list-check' },
    { key: 'repo',           label: 'Biblioteca',            icon: 'ti-books' },
    { key: 'privatetutoring',label: 'Alunos Particulares',   icon: 'ti-user-dollar' },
    { key: 'lessonstudio',   label: 'Planejamento de Aula',  icon: 'ti-chalkboard' },
  ]},
  { label: 'Área do Professor', items: [
    { key: 'maestro',             label: 'Maestro',                 icon: 'ti-subtask' },
    { key: 'wellbeing',           label: 'Bem-Estar',               icon: 'ti-heart' },
    { key: 'calendar',            label: 'Calendário',              icon: 'ti-calendar' },
    { key: 'mindmap',             label: 'Mapa Mental',             icon: 'ti-hierarchy-2' },
    { key: 'meetingclassrecorder',label: 'Diário de Aulas',         icon: 'ti-notebook' },
    { key: 'classlog',            label: 'Registro de Aula',        icon: 'ti-book' },
    { key: 'reflectivepractice',  label: 'Reflexão da Prática',     icon: 'ti-bulb' },
  ]},
  { label: 'Criação', items: [
    { key: 'audiopronunciation',  label: 'Pronúncia & Áudio',     icon: 'ti-microphone' },
    { key: 'eventos',             label: 'Eventos Escolares',     icon: 'ti-sparkles' },
    { key: 'rubric',              label: 'Rubrica & Gabarito',    icon: 'ti-list-check' },
    { key: 'test_and_worksheets', label: 'Test & Worksheets',     icon: 'ti-file-certificate' },
    { key: 'qbank',               label: 'Banco de Atividades',   icon: 'ti-archive' },
    { key: 'editor',              label: 'Editor de Documentos',  icon: 'ti-file-pencil' },
  ]},
  { label: 'Em Sala de Aula', items: [
    { key: 'flashcardmode',  label: 'Flashcards',           icon: 'ti-cards' },
    { key: 'livequiz',       label: 'Quiz ao Vivo',         icon: 'ti-device-gamepad-2' },
    { key: 'classroommode',  label: 'Auxiliar de Sala',     icon: 'ti-layout-dashboard' },
    { key: 'attendancelist', label: 'Lista de Presença',    icon: 'ti-list-check' },
  ]},
  { label: 'Alunos & Avaliação', items: [
    { key: 'omnigrader',     label: 'OmniCorretor',          icon: 'ti-camera' },
    { key: 'gradebook',      label: 'Caderneta de Notas',    icon: 'ti-chart-bar' },
    { key: 'analytics',      label: 'Desempenho & Evolução', icon: 'ti-chart-line' },
  ]},
  { label: 'Comunicação', items: [
    { key: 'portfolio',      label: 'Portfólio',           icon: 'ti-award' },
    { key: 'communications', label: 'Comunicação',         icon: 'ti-brand-whatsapp' },
    { key: 'portalmirror',   label: 'Portal Conectado',    icon: 'ti-plug-connected' },
    { key: 'autoreport',     label: 'Relatórios Mensais',  icon: 'ti-file-report' },
  ]},
  { label: 'Configurações', items: [
    { key: 'settings',   label: 'Preferências',         icon: 'ti-settings' },
    { key: 'api',        label: 'Modelos de IA',        icon: 'ti-brain' },
    { key: 'extensions', label: 'Portais & Extensões',  icon: 'ti-plug' },
  ]},
]

import { useState, useEffect } from 'react'

interface Props { active: ModuleKey; onNavigate: (k: ModuleKey) => void }

export default function Sidebar({ active, onNavigate }: Props) {
  const [isHovered, setIsHovered] = useState(false)
  const [isPinned, setIsPinned] = useState(false)

  useEffect(() => {
    try {
      const savedPin = localStorage.getItem('teacher_sidebar_pinned')
      if (savedPin === 'true') setIsPinned(true)
    } catch {}
  }, [])

  const togglePin = () => {
    setIsPinned(prev => {
      const next = !prev
      try { localStorage.setItem('teacher_sidebar_pinned', String(next)) } catch {}
      return next
    })
  }

  const isExpanded = isPinned || isHovered

  return (
    <nav
      className="sidebar-scrollbar"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: isExpanded ? 320 : 82,
        flexShrink: 0,
        height: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'linear-gradient(180deg, #2e1a0c 0%, #231408 100%)',
        boxShadow: isExpanded
          ? '4px 0 28px rgba(28,17,10,0.32)'
          : '2px 0 10px rgba(28,17,10,0.18)',
        display: 'flex',
        flexDirection: 'column',
        padding: isExpanded ? '0 10px 24px 12px' : '0 6px 24px 6px',
        gap: 0,
        zIndex: 50,
        transition: 'width 0.24s cubic-bezier(0.16, 1, 0.3, 1), padding 0.24s ease, box-shadow 0.24s ease',
      }}
    >
      {/* Brand & Pin */}
      <div style={{
        padding: isExpanded ? '20px 10px 16px' : '18px 0 14px',
        borderBottom: '1px solid rgba(255,220,170,0.08)',
        marginBottom: 14,
        position: 'sticky',
        top: 0,
        background: '#2e1a0c',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: isExpanded ? 'flex-start' : 'center',
        transition: 'all 0.24s ease',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}>
          {isExpanded ? (
            <div style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: 24,
              fontWeight: 700,
              color: '#fdf8f2',
              letterSpacing: '-0.3px',
              lineHeight: 1.1,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              whiteSpace: 'nowrap',
            }}>
              <span>Teacher</span>
              <TeacherLogo size={30} variant="badge" rounded={8} />
            </div>
          ) : (
            <div title="Teacher AI">
              <TeacherLogo size={44} variant="badge" rounded={12} />
            </div>
          )}

          {isExpanded && (
            <button
              onClick={togglePin}
              title={isPinned ? 'Desafixar menu' : 'Fixar menu'}
              style={{
                background: isPinned ? 'rgba(196,131,74,0.18)' : 'transparent',
                border: isPinned
                  ? '1px solid rgba(196,131,74,0.35)'
                  : '1px solid rgba(255,255,255,0.08)',
                color: isPinned ? '#c4834a' : 'rgba(196,160,120,0.5)',
                borderRadius: 8,
                padding: '5px 8px',
                cursor: 'pointer',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.15s ease',
              }}
            >
              <i className={isPinned ? 'ti ti-pinned' : 'ti ti-pin'} style={{ fontSize: 14 }} />
              <span style={{ fontSize: 11, fontWeight: 600 }}>{isPinned ? 'Fixada' : 'Auto'}</span>
            </button>
          )}
        </div>

        {isExpanded && (
          <div style={{
            fontSize: 11,
            color: 'rgba(196,160,120,0.5)',
            marginTop: 6,
            fontWeight: 600,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
            whiteSpace: 'nowrap',
          }}>
            Assistente Pedagógico
          </div>
        )}
      </div>

      {/* Nav sections */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map((section) => (
          <div key={section.label} style={{ marginBottom: section.label ? 4 : 0 }}>
            {section.label && isExpanded && (
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '1.8px',
                color: 'rgba(196,160,120,0.42)',
                padding: '14px 10px 6px',
                fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <span style={{ fontSize: 13, opacity: 0.7 }}>
                  {section.label === 'Organização' ? '🏢' :
                   section.label === 'Área do Professor' ? '👨‍🏫' :
                   section.label === 'Criação' ? '✨' :
                   section.label === 'Em Sala de Aula' ? '🎓' :
                   section.label === 'Alunos & Avaliação' ? '📊' :
                   section.label === 'Comunicação' ? '💬' :
                   section.label === 'Configurações' ? '⚙️' : ''}
                </span>
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
                  isExpanded={isExpanded}
                  onNavigate={onNavigate}
                />
              )
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      {isExpanded && (
        <div style={{
          marginTop: 14,
          padding: '12px 10px 0',
          borderTop: '1px solid rgba(255,220,170,0.07)',
        }}>
          <div style={{
            fontSize: 11,
            color: 'rgba(196,160,120,0.4)',
            letterSpacing: '0.4px',
            fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}>
            TeacherAI v2.0
          </div>
        </div>
      )}
    </nav>
  )
}

function SidebarItem({ item, isActive, isExpanded, onNavigate }: {
  item: { key: ModuleKey; label: string; icon: string }
  isActive: boolean
  isExpanded: boolean
  onNavigate: (k: ModuleKey) => void
}) {
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => onNavigate(item.key)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={!isExpanded ? item.label : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isExpanded ? 'flex-start' : 'center',
          gap: isExpanded ? 12 : 0,
          width: '100%',
          padding: isExpanded ? '10px 14px' : '10px 0',
          borderRadius: 10,
          border: 'none',
          background: isActive
            ? 'rgba(253,248,242,0.12)'
            : 'transparent',
          color: isActive ? '#fdf8f2' : 'rgba(196,160,120,0.7)',
          fontSize: 15,
          fontWeight: isActive ? 700 : 500,
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.15s ease',
          borderLeft: isExpanded && isActive
            ? '3px solid rgba(196,131,74,0.75)'
            : '3px solid transparent',
          marginBottom: 3,
          lineHeight: 1.3,
          fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
        }}
      >
        {/* Icon Container (+40% scale) */}
        <div style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isActive ? 'rgba(196,131,74,0.18)' : 'transparent',
          transition: 'background 0.15s ease',
          flexShrink: 0,
        }}>
          <i
            className={`ti ${item.icon}`}
            style={{
              fontSize: 21,
              color: isActive ? '#c4834a' : 'rgba(196,131,74,0.65)',
              lineHeight: 1,
            }}
          />
        </div>

        {isExpanded && (
          <span style={{
            flex: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {item.label}
          </span>
        )}
      </button>

      {/* Tooltip when collapsed */}
      {!isExpanded && showTooltip && (
        <div style={{
          position: 'fixed',
          left: 88,
          transform: 'translateY(-34px)',
          background: '#1c110a',
          color: '#fdf8f2',
          padding: '6px 12px',
          borderRadius: 8,
          fontSize: 13.5,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.1)',
          zIndex: 9999,
          pointerEvents: 'none',
        }}>
          {item.label}
        </div>
      )}
    </div>
  )
}
