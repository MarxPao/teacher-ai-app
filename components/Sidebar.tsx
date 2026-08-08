'use client'

import { ModuleKey } from '@/app/page'

interface NavItem { key: ModuleKey; label: string; icon: string }
interface Section { label: string; items: NavItem[] }

const NAV: Section[] = [
  { label: '', items: [
    { key: 'dashboard', label: 'Início', icon: 'ti-home-2' },
  ]},
  { label: 'Organização', items: [
    { key: 'organization',   label: 'Escolas',               icon: 'ti-building-school' },
    { key: 'classes',        label: 'Turmas',                icon: 'ti-school' },
    { key: 'students',       label: 'Alunos',                icon: 'ti-user-circle' },
    { key: 'privatetutoring',label: 'Alunos Particulares',   icon: 'ti-user-dollar' },
  ]},
  { label: 'Criação', items: [
    { key: 'lessonstudio',      label: 'Criar Aula',            icon: 'ti-chalkboard' },
    { key: 'quick',             label: 'Gerar Exercício',       icon: 'ti-sparkles' },
    { key: 'exam',              label: 'Gerar Prova',           icon: 'ti-file-text' },
    { key: 'plan',              label: 'Plano de Aula',         icon: 'ti-calendar-event' },
    { key: 'rubric',            label: 'Rubrica & Gabarito',    icon: 'ti-list-check' },
    { key: 'qbank',             label: 'Banco de Atividades',   icon: 'ti-archive' },
    { key: 'audiopronunciation',label: 'Pronúncia & Áudio',     icon: 'ti-microphone' },
  ]},
  { label: 'Em Sala de Aula', items: [
    { key: 'classroommode', label: 'Auxiliar de Sala',     icon: 'ti-layout-dashboard' },
    { key: 'flashcardmode', label: 'Flashcards',           icon: 'ti-cards' },
    { key: 'livequiz',      label: 'Quiz ao Vivo',         icon: 'ti-device-gamepad-2' },
  ]},

  { label: 'Alunos & Avaliação', items: [
    { key: 'gradebook',      label: 'Caderneta de Notas',  icon: 'ti-chart-bar' },
    { key: 'omnigrader',     label: 'OmniCorretor',        icon: 'ti-camera' },
    { key: 'batchgrader',    label: 'Correção em Lote',    icon: 'ti-files' },
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
    { key: 'eventos',             label: 'Eventos Escolares',       icon: 'ti-sparkles' },
    { key: 'reflectivepractice',  label: 'Reflexão da Prática',     icon: 'ti-bulb' },
    { key: 'meetingclassrecorder',label: 'Diário de Aulas',         icon: 'ti-notebook' },
    { key: 'weeklyagenda',        label: 'Agenda Semanal',          icon: 'ti-calendar-time' },
    { key: 'mindmap',             label: 'Mapa Mental',             icon: 'ti-hierarchy-2' },
    { key: 'classlog',            label: 'Registro de Aula',        icon: 'ti-book' },
    { key: 'didacticsequence',    label: 'Sequência Didática',      icon: 'ti-route-2' },
    { key: 'maestro',             label: 'Maestro',                 icon: 'ti-subtask' },
    { key: 'portalmirror',        label: 'Portal Conectado',        icon: 'ti-plug-connected' },
    { key: 'calendar',            label: 'Calendário',              icon: 'ti-calendar' },
    { key: 'editor',              label: 'Editor de Documentos',    icon: 'ti-file-pencil' },
    { key: 'repo',                label: 'Biblioteca',              icon: 'ti-books' },
    { key: 'wellbeing',           label: 'Bem-Estar',               icon: 'ti-heart' },
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
        width: isExpanded ? 275 : 68,
        flexShrink: 0,
        height: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'linear-gradient(180deg, #3d2510 0%, #2c1a0e 65%, #190f09 100%)',
        boxShadow: isExpanded ? '6px 0 32px rgba(28,17,10,0.35)' : '2px 0 12px rgba(28,17,10,0.18)',
        display: 'flex',
        flexDirection: 'column',
        padding: isExpanded ? '0 12px 24px' : '0 8px 24px',
        gap: 0,
        zIndex: 50,
        transition: 'width 0.28s cubic-bezier(0.16, 1, 0.3, 1), padding 0.28s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.28s ease',
      }}
    >
      {/* Brand & Pin Action */}
      <div style={{
        padding: isExpanded ? '20px 10px 16px' : '18px 4px 14px',
        borderBottom: '1px solid rgba(255,220,170,0.1)',
        marginBottom: 14,
        position: 'sticky',
        top: 0,
        background: 'linear-gradient(180deg, #3d2510 0%, #3d2510 90%, rgba(61,37,16,0.95) 100%)',
        backdropFilter: 'blur(8px)',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: isExpanded ? 'flex-start' : 'center',
        transition: 'all 0.28s ease',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}>
          {isExpanded ? (
            <div style={{
              fontFamily: "'Fraunces', 'Playfair Display', Georgia, serif",
              fontSize: 22,
              fontWeight: 700,
              color: '#fdf8f2',
              letterSpacing: '-0.4px',
              lineHeight: 1.1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
            }}>
              <span>Teacher</span>
              <span style={{
                color: '#e2a355',
                background: 'rgba(226,163,85,0.18)',
                padding: '2px 8px',
                borderRadius: 6,
                fontSize: 16,
                border: '1px solid rgba(226,163,85,0.3)',
              }}>AI</span>
            </div>
          ) : (
            <div
              title="Teacher AI (Passe o mouse para expandir o menu)"
              style={{
                fontFamily: "'Fraunces', 'Playfair Display', Georgia, serif",
                fontSize: 18,
                fontWeight: 800,
                color: '#e2a355',
                background: 'rgba(226,163,85,0.18)',
                border: '1.5px solid rgba(226,163,85,0.35)',
                width: 38,
                height: 38,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}
            >
              T
            </div>
          )}

          {/* Pin/Unpin Toggle */}
          {isExpanded && (
            <button
              onClick={togglePin}
              title={isPinned ? "Desafixar menu (Modo Retrátil no Hover)" : "Fixar menu na tela"}
              style={{
                background: isPinned ? 'rgba(226,163,85,0.25)' : 'rgba(255,255,255,0.06)',
                border: isPinned ? '1px solid #e2a355' : '1px solid rgba(255,255,255,0.1)',
                color: isPinned ? '#e2a355' : 'rgba(212,180,140,0.6)',
                borderRadius: 6,
                padding: '4px 7px',
                cursor: 'pointer',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                transition: 'all 0.15s ease',
              }}
            >
              <i className={isPinned ? 'ti ti-pinned' : 'ti ti-pin'} style={{ fontSize: 13 }} />
              <span style={{ fontSize: 10, fontWeight: 700 }}>{isPinned ? 'Fixada' : 'Auto'}</span>
            </button>
          )}
        </div>

        {isExpanded && (
          <div style={{
            fontSize: 9.5,
            color: 'rgba(212,180,140,0.6)',
            marginTop: 6,
            fontWeight: 600,
            letterSpacing: '1.6px',
            textTransform: 'uppercase',
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
            whiteSpace: 'nowrap',
          }}>
            Assistente Pedagógico
          </div>
        )}
      </div>

      {/* Nav sections */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {NAV.map((section) => (
          <div key={section.label} style={{ marginBottom: section.label ? 4 : 0 }}>
            {section.label && isExpanded && (
              <div style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '2px',
                color: 'rgba(212,180,140,0.45)',
                padding: '12px 10px 4px',
                fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
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
          marginTop: 16,
          padding: '12px 10px 0',
          borderTop: '1px solid rgba(255,220,170,0.08)',
        }}>
          <div style={{
            fontSize: 9.5,
            color: 'rgba(212,180,140,0.4)',
            letterSpacing: '0.5px',
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}>
            TeacherAI v2.0 · Enterprise
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
          gap: isExpanded ? 11 : 0,
          width: '100%',
          padding: isExpanded ? '8.5px 12px' : '9px 0',
          borderRadius: 10,
          border: 'none',
          background: isActive
            ? 'linear-gradient(135deg, rgba(253,248,242,0.16) 0%, rgba(253,248,242,0.08) 100%)'
            : 'transparent',
          color: isActive ? '#ffffff' : 'rgba(212,180,140,0.72)',
          fontSize: 13,
          fontWeight: isActive ? 600 : 500,
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow: isActive
            ? '0 4px 14px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 0 0 1px rgba(253,248,242,0.18)'
            : 'none',
          marginBottom: 2,
          borderLeft: isExpanded && isActive ? '3px solid #e2a355' : '3px solid transparent',
          lineHeight: 1.25,
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        {/* Icon Wrapper */}
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isActive ? 'rgba(226,163,85,0.22)' : 'transparent',
          transition: 'all 0.18s ease',
          flexShrink: 0,
        }}>
          <i
            className={`ti ${item.icon}`}
            style={{
              fontSize: 19,
              color: isActive ? '#e2a355' : 'rgba(226,163,85,0.68)',
              flexShrink: 0,
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

        {isExpanded && isActive && (
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#e2a355',
            boxShadow: '0 0 8px rgba(226,163,85,0.8)',
            flexShrink: 0,
          }} />
        )}
      </button>

      {/* Floating Tooltip when collapsed */}
      {!isExpanded && showTooltip && (
        <div style={{
          position: 'fixed',
          left: 74,
          top: 'auto',
          transform: 'translateY(-30px)',
          background: '#1c110a',
          color: '#fffcf8',
          padding: '6px 12px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 18px rgba(0,0,0,0.4), 0 0 0 1px rgba(226,163,85,0.25)',
          zIndex: 9999,
          pointerEvents: 'none',
          letterSpacing: '-0.2px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span>{item.label}</span>
          {isActive && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#e2a355' }} />}
        </div>
      )}
    </div>
  )
}

