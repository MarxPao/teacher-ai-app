'use client'

import { ModuleKey } from '@/app/page'

interface NavItem { key: ModuleKey; label: string; icon: string }
interface Section { label: string; items: NavItem[] }

const NAV: Section[] = [
  { label: '', items: [
    { key: 'dashboard', label: 'Início', icon: 'ti-home-2' },
  ]},
  { label: 'Organização', items: [
    { key: 'organization',   label: 'Escolas',               icon: 'ti-building-community' },
    { key: 'classes',        label: 'Turmas',                icon: 'ti-school' },
    { key: 'students',       label: 'Alunos',                icon: 'ti-user-circle' },
    { key: 'privatetutoring',label: 'Alunos Particulares',   icon: 'ti-user-dollar' },
    { key: 'lessonstudio',   label: 'Planejamento de Aula',  icon: 'ti-chalkboard' },
    { key: 'repo',           label: 'Biblioteca',            icon: 'ti-books' },
  ]},
  { label: 'Área do Professor', items: [
    { key: 'meetingclassrecorder',label: 'Diário de Aulas',         icon: 'ti-notebook' },
    { key: 'classlog',            label: 'Registro de Aula',        icon: 'ti-book' },
    { key: 'mindmap',             label: 'Mapa Mental',             icon: 'ti-hierarchy-2' },
    { key: 'calendar',            label: 'Calendário',              icon: 'ti-calendar' },
    { key: 'maestro',             label: 'Maestro',                 icon: 'ti-subtask' },
    { key: 'reflectivepractice',  label: 'Reflexão da Prática',     icon: 'ti-bulb' },
    { key: 'wellbeing',           label: 'Bem-Estar',               icon: 'ti-heart' },
  ]},
  { label: 'Criação', items: [
    { key: 'quick',             label: 'Gerar Exercício',       icon: 'ti-sparkles' },
    { key: 'exam',              label: 'Gerar Prova',           icon: 'ti-file-text' },
    { key: 'eventos',           label: 'Eventos Escolares',     icon: 'ti-sparkles' },
    { key: 'editor',            label: 'Editor de Documentos',  icon: 'ti-file-pencil' },
    { key: 'rubric',            label: 'Rubrica & Gabarito',    icon: 'ti-list-check' },
    { key: 'qbank',             label: 'Banco de Atividades',   icon: 'ti-archive' },
    { key: 'audiopronunciation',label: 'Pronúncia & Áudio',     icon: 'ti-microphone' },
  ]},
  { label: 'Em Sala de Aula', items: [
    { key: 'attendancelist', label: 'Lista de Presença',    icon: 'ti-list-check' },
    { key: 'classroommode',  label: 'Auxiliar de Sala',     icon: 'ti-layout-dashboard' },
    { key: 'flashcardmode',  label: 'Flashcards',           icon: 'ti-cards' },
    { key: 'livequiz',       label: 'Quiz ao Vivo',         icon: 'ti-device-gamepad-2' },
  ]},
  { label: 'Alunos & Avaliação', items: [
    { key: 'gradebook',      label: 'Caderneta de Notas',    icon: 'ti-chart-bar' },
    { key: 'omnigrader',     label: 'OmniCorretor',          icon: 'ti-camera' },
    { key: 'batchgrader',    label: 'Correção em Lote',      icon: 'ti-files' },
    { key: 'analytics',      label: 'Desempenho & Evolução', icon: 'ti-chart-line' },
    { key: 'insights',       label: 'Insights Pedagógicos',  icon: 'ti-bulb' },
  ]},
  { label: 'Comunicação', items: [
    { key: 'parentcomms',    label: 'Mensagens aos Pais',  icon: 'ti-brand-whatsapp' },
    { key: 'autoreport',     label: 'Relatórios Mensais',  icon: 'ti-file-report' },
    { key: 'communications', label: 'Comunicados',         icon: 'ti-mail-forward' },
    { key: 'portfolio',      label: 'Portfólio',           icon: 'ti-award' },
    { key: 'portalmirror',   label: 'Portal Conectado',    icon: 'ti-plug-connected' },
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
        width: isExpanded ? 260 : 64,
        flexShrink: 0,
        height: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'linear-gradient(180deg, #2e1a0c 0%, #231408 100%)',
        boxShadow: isExpanded
          ? '4px 0 24px rgba(28,17,10,0.28)'
          : '2px 0 8px rgba(28,17,10,0.15)',
        display: 'flex',
        flexDirection: 'column',
        padding: isExpanded ? '0 8px 20px 10px' : '0 4px 20px 4px',
        gap: 0,
        zIndex: 50,
        transition: 'width 0.24s cubic-bezier(0.16, 1, 0.3, 1), padding 0.24s ease, box-shadow 0.24s ease',
      }}
    >
      {/* Brand & Pin */}
      <div style={{
        padding: isExpanded ? '18px 8px 14px' : '16px 0 12px',
        borderBottom: '1px solid rgba(255,220,170,0.08)',
        marginBottom: 12,
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
              fontSize: 20,
              fontWeight: 700,
              color: '#fdf8f2',
              letterSpacing: '-0.3px',
              lineHeight: 1.1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
            }}>
              <span>Teacher</span>
              <span style={{
                color: '#c4834a',
                background: 'rgba(196,131,74,0.15)',
                padding: '1px 7px',
                borderRadius: 5,
                fontSize: 14,
                fontWeight: 700,
                border: '1px solid rgba(196,131,74,0.25)',
                fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
                letterSpacing: '0.5px',
              }}>AI</span>
            </div>
          ) : (
            <div
              title="Teacher AI"
              style={{
                fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
                fontSize: 16,
                fontWeight: 800,
                color: '#c4834a',
                background: 'rgba(196,131,74,0.12)',
                border: '1px solid rgba(196,131,74,0.22)',
                width: 36,
                height: 36,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              T
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
                borderRadius: 6,
                padding: '4px 6px',
                cursor: 'pointer',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                transition: 'all 0.15s ease',
              }}
            >
              <i className={isPinned ? 'ti ti-pinned' : 'ti ti-pin'} style={{ fontSize: 13 }} />
              <span style={{ fontSize: 10, fontWeight: 600 }}>{isPinned ? 'Fixada' : 'Auto'}</span>
            </button>
          )}
        </div>

        {isExpanded && (
          <div style={{
            fontSize: 9,
            color: 'rgba(196,160,120,0.45)',
            marginTop: 5,
            fontWeight: 600,
            letterSpacing: '1.4px',
            textTransform: 'uppercase',
            fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
            whiteSpace: 'nowrap',
          }}>
            Assistente Pedagógico
          </div>
        )}
      </div>

      {/* Nav sections */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {NAV.map((section) => (
          <div key={section.label} style={{ marginBottom: section.label ? 2 : 0 }}>
            {section.label && isExpanded && (
              <div style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '1.8px',
                color: 'rgba(196,160,120,0.38)',
                padding: '12px 8px 4px',
                fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
                whiteSpace: 'nowrap',
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
          marginTop: 12,
          padding: '10px 8px 0',
          borderTop: '1px solid rgba(255,220,170,0.07)',
        }}>
          <div style={{
            fontSize: 9,
            color: 'rgba(196,160,120,0.35)',
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
          gap: isExpanded ? 10 : 0,
          width: '100%',
          padding: isExpanded ? '7px 10px' : '8px 0',
          borderRadius: 8,
          border: 'none',
          background: isActive
            ? 'rgba(253,248,242,0.10)'
            : 'transparent',
          color: isActive ? '#fdf8f2' : 'rgba(196,160,120,0.65)',
          fontSize: 13,
          fontWeight: isActive ? 600 : 400,
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.15s ease',
          borderLeft: isExpanded && isActive
            ? '2px solid rgba(196,131,74,0.65)'
            : '2px solid transparent',
          marginBottom: 1,
          lineHeight: 1.25,
          fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
        }}
      >
        {/* Icon */}
        <div style={{
          width: 26,
          height: 26,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isActive ? 'rgba(196,131,74,0.15)' : 'transparent',
          transition: 'background 0.15s ease',
          flexShrink: 0,
        }}>
          <i
            className={`ti ${item.icon}`}
            style={{
              fontSize: 17,
              color: isActive ? '#c4834a' : 'rgba(196,131,74,0.60)',
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
          left: 70,
          transform: 'translateY(-30px)',
          background: '#1c110a',
          color: '#fdf8f2',
          padding: '5px 10px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
          border: '1px solid rgba(255,255,255,0.08)',
          zIndex: 9999,
          pointerEvents: 'none',
        }}>
          {item.label}
        </div>
      )}
    </div>
  )
}
