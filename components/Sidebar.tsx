'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT, SPACE } from '@/styles/tokens'

import React, { useState, useEffect, useRef } from 'react'
import { ModuleKey } from '@/app/page'
import TeacherLogo from '@/components/TeacherLogo'
import Icon from '@/components/Icon'

interface NavItem { key: ModuleKey; label: string; icon: string }
interface Section { label: string; items: NavItem[] }

const NAV: Section[] = [
  { label: '', items: [
    { key: 'dashboard', label: 'Início', icon: 'home-2' },
  ]},
  { label: 'Organização', items: [
    { key: 'students',       label: 'Alunos',                icon: 'user-circle' },
    { key: 'classes',        label: 'Turmas',                icon: 'school' },
    { key: 'organization',   label: 'Escolas',               icon: 'building-community' },
    { key: 'insights',       label: 'Insights',              icon: 'bulb' },
    { key: 'checklist',      label: 'Checklist',             icon: 'list-check' },
    { key: 'repo',           label: 'Biblioteca',            icon: 'books' },
    { key: 'bncc',           label: 'Central BNCC',          icon: 'certificate' },
    { key: 'privatetutoring',label: 'Alunos Particulares',   icon: 'user-dollar' },
    { key: 'lessonstudio',   label: 'Planejamento',          icon: 'chalkboard' },
    { key: 'didacticsequence', label: 'Sequência Didática',  icon: 'layers-linked' },
  ]},
  { label: 'Área do Professor', items: [
    { key: 'maestro',             label: 'Maestro',                 icon: 'subtask' },
    { key: 'wellbeing',           label: 'Bem-Estar',               icon: 'heart' },
    { key: 'calendar',            label: 'Calendário',              icon: 'calendar' },
    { key: 'mindmap',             label: 'Mapa Mental',             icon: 'hierarchy-2' },
    { key: 'meetingclassrecorder',label: 'Diário de Aulas',         icon: 'notebook' },
    { key: 'classlog',            label: 'Registro de Aula',        icon: 'book' },
    { key: 'reflectivepractice',  label: 'Reflexão da Prática',     icon: 'bulb' },
  ]},
  { label: 'Criação', items: [
    { key: 'test_and_worksheets', label: 'Test & Worksheets',     icon: 'file-certificate' },
    { key: 'qbank',               label: 'Banco de Atividades',   icon: 'archive' },
    { key: 'visualstudio',        label: 'Estúdio Visual & Artes',icon: 'palette' },
    { key: 'eventos',             label: 'Eventos Escolares',     icon: 'sparkles' },
    { key: 'rubric',              label: 'Rubrica & Gabarito',    icon: 'list-check' },
    { key: 'editor',              label: 'Editor de Documentos',  icon: 'file-pencil' },
    { key: 'audiopronunciation',  label: 'Pronúncia & Áudio',     icon: 'microphone' },
  ]},
  { label: 'Em Sala de Aula', items: [
    { key: 'flashcardmode',      label: 'Flashcards',           icon: 'layers' },
    { key: 'livequiz',           label: 'Quiz ao Vivo',         icon: 'device-gamepad-2' },
    { key: 'classroommode',      label: 'Auxiliar de Sala',     icon: 'layout-dashboard' },
    { key: 'attendancelist',     label: 'Lista de Presença',    icon: 'list-check' },
    { key: 'classroomanalytics', label: 'Classroom Analytics',  icon: 'device-analytics' },
  ]},
  { label: 'Alunos & Avaliação', items: [
    { key: 'omnigrader',     label: 'OmniCorretor',          icon: 'camera' },
    { key: 'gradebook',      label: 'Caderneta de Notas',    icon: 'chart-bar' },
    { key: 'analytics',      label: 'Desempenho & Evolução', icon: 'chart-line' },
  ]},
  { label: 'Comunicação', items: [
    { key: 'portfolio',      label: 'Portfólio',           icon: 'award' },
    { key: 'communications', label: 'Comunicação',         icon: 'brand-whatsapp' },
    { key: 'autoreport',     label: 'Relatórios Mensais',  icon: 'file-report' },
  ]},
  { label: 'Configurações', items: [
    { key: 'settings',   label: 'Preferências',               icon: 'settings' },
    { key: 'skills',     label: 'Skills dos Portais',         icon: 'sparkles' },
    { key: 'api',        label: 'Modelos de IA',              icon: 'brain' },
    { key: 'extensions', label: 'Portais Conectados & Extensões', icon: 'plug-connected' },
  ]},
]

// Ícones de seção (Lucide names)
const SECTION_ICONS: Record<string, string> = {
  'Organização': 'building-community',
  'Área do Professor': 'user-circle',
  'Criação': 'sparkles',
  'Em Sala de Aula': 'chalkboard',
  'Alunos & Avaliação': 'chart-bar',
  'Comunicação': 'brand-whatsapp',
  'Configurações': 'settings',
}

export type WorkspaceMode = 'all' | 'prep' | 'classroom' | 'admin' | 'insights'

const WORKSPACE_TABS: Array<{ mode: WorkspaceMode; label: string; icon: string }> = [
  { mode: 'all',       label: 'Todos',       icon: 'layout-grid' },
  { mode: 'prep',      label: 'Preparação',  icon: 'chalkboard' },
  { mode: 'classroom', label: 'Sala de Aula',icon: 'presentation' },
  { mode: 'admin',     label: 'Portais',     icon: 'plug-connected' },
  { mode: 'insights',  label: 'Alunos',      icon: 'chart-line' },
]

const WORKSPACE_MODULES: Record<WorkspaceMode, ModuleKey[]> = {
  all: [],
  prep: ['dashboard', 'bncc', 'lessonstudio', 'didacticsequence', 'test_and_worksheets', 'qbank', 'repo', 'rubric', 'editor', 'settings'],
  classroom: ['dashboard', 'classroommode', 'attendancelist', 'flashcardmode', 'livequiz'],
  admin: ['dashboard', 'gradebook', 'omnigrader', 'extensions', 'checklist', 'communications', 'autoreport'],
  insights: ['dashboard', 'bncc', 'students', 'classes', 'analytics', 'insights', 'portfolio', 'privatetutoring'],
}

interface Props { active: ModuleKey; onNavigate: (k: ModuleKey) => void }

export default function Sidebar({ active, onNavigate }: Props) {
  const [isHovered, setIsHovered] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('all')

  useEffect(() => {
    try {
      const savedPin = localStorage.getItem('teacher_sidebar_pinned')
      if (savedPin === 'true') setIsPinned(true)
      const savedMode = localStorage.getItem('teacher_workspace_mode') as WorkspaceMode
      if (savedMode && WORKSPACE_MODULES[savedMode]) setWorkspaceMode(savedMode)
    } catch {}
  }, [])

  const handleSetWorkspaceMode = (mode: WorkspaceMode) => {
    setWorkspaceMode(mode)
    try { localStorage.setItem('teacher_workspace_mode', mode) } catch {}
  }

  const filteredNav = React.useMemo(() => {
    if (workspaceMode === 'all') return NAV
    const allowed = WORKSPACE_MODULES[workspaceMode]
    return NAV.map(sec => ({
      ...sec,
      items: sec.items.filter(it => allowed.includes(it.key))
    })).filter(sec => sec.items.length > 0)
  }, [workspaceMode])

  const togglePin = () => {
    setIsPinned(prev => {
      const next = !prev
      try { localStorage.setItem('teacher_sidebar_pinned', String(next)) } catch {}
      return next
    })
  }

  const isExpanded = isPinned || isHovered

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const activeSection = NAV.find(sec => sec.items.some(it => it.key === active))
    if (activeSection && activeSection.label) {
      return { [activeSection.label]: true }
    }
    return {}
  })

  useEffect(() => {
    const activeSection = NAV.find(sec => sec.items.some(it => it.key === active))
    if (activeSection && activeSection.label) {
      setOpenSections(prev => ({ ...prev, [activeSection.label]: true }))
    }
  }, [active])

  const toggleSection = (label: string) => {
    setOpenSections(prev => ({
      ...prev,
      [label]: !prev[label]
    }))
  }

  return (
    <nav
      className="sidebar-scrollbar"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: isExpanded ? 256 : 64,
        flexShrink: 0,
        height: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        // Fundo mais elegante: camadas de profundidade em vez de gradiente linear simples
        background: 'linear-gradient(180deg, #261608 0%, #1e1007 50%, #170c05 100%)',
        borderRight: '1px solid rgba(255,220,170,0.06)',
        boxShadow: isExpanded
          ? '6px 0 32px rgba(0,0,0,0.45), 1px 0 0 rgba(255,220,170,0.06)'
          : '2px 0 12px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        padding: isExpanded ? '0 8px 24px 8px' : '0 6px 24px 6px',
        gap: 0,
        zIndex: 50,
        transition: 'width 0.22s cubic-bezier(0.16, 1, 0.3, 1), padding 0.22s ease, box-shadow 0.22s ease',
      }}
    >
      {/* ── Brand & Pin ─────────────────────────────────────────── */}
      <div style={{
        padding: isExpanded ? '16px 8px 14px' : '14px 0 12px',
        borderBottom: '1px solid rgba(255,220,170,0.07)',
        marginBottom: 12,
        position: 'sticky',
        top: 0,
        background: 'linear-gradient(180deg, #261608 80%, transparent 100%)',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: isExpanded ? 'flex-start' : 'center',
        transition: 'all 0.22s ease',
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
              fontWeight: 600,
              color: '#fdf8f2',
              letterSpacing: '-0.4px',
              lineHeight: 1.15,
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              whiteSpace: 'nowrap',
            }}>
              <TeacherLogo size={28} variant="badge" rounded={7} />
              <span>Teacher AI</span>
            </div>
          ) : (
            <div title="Teacher AI" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
              <TeacherLogo size={38} variant="badge" rounded={10} />
            </div>
          )}

          {isExpanded && (
            <button
              onClick={togglePin}
              title={isPinned ? 'Desafixar menu' : 'Fixar menu'}
              style={{
                background: isPinned ? 'rgba(196,131,74,0.15)' : 'transparent',
                border: '1px solid ' + (isPinned ? 'rgba(196,131,74,0.3)' : 'rgba(255,255,255,0.07)'),
                color: isPinned ? '#c4834a' : 'rgba(196,160,120,0.4)',
                borderRadius: 8,
                padding: '4px 7px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                transition: 'all 0.15s ease',
                flexShrink: 0,
              }}
            >
              <Icon
                name={isPinned ? 'pin-off' : 'pin'}
                size={12}
                strokeWidth={2}
                color={isPinned ? '#c4834a' : 'rgba(196,160,120,0.45)'}
              />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.4px' }}>
                {isPinned ? 'FIXADA' : 'AUTO'}
              </span>
            </button>
          )}
        </div>

        {isExpanded && (
          <div style={{
            fontSize: 10,
            color: 'rgba(196,160,120,0.38)',
            marginTop: 5,
            fontWeight: 600,
            letterSpacing: '1.8px',
            textTransform: 'uppercase',
            fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
            whiteSpace: 'nowrap',
            paddingLeft: 37,
          }}>
            Assistente Pedagógico
          </div>
        )}
      </div>

      {/* ── Workspace mode filter ────────────────────────────────── */}
      {isExpanded && (
        <div style={{
          display: 'flex',
          gap: 3,
          padding: '2px 4px 10px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          marginBottom: 8,
        }}>
          {WORKSPACE_TABS.map(tab => {
            const isTabActive = workspaceMode === tab.mode
            return (
              <button
                key={tab.mode}
                onClick={() => handleSetWorkspaceMode(tab.mode)}
                title={tab.label}
                style={{
                  background: isTabActive ? 'rgba(139,94,60,0.9)' : 'rgba(255,255,255,0.04)',
                  color: isTabActive ? '#fdf8f2' : 'rgba(196,160,120,0.55)',
                  border: '1px solid ' + (isTabActive ? 'rgba(196,131,74,0.4)' : 'rgba(255,255,255,0.05)'),
                  borderRadius: 12,
                  padding: '3px 8px',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.2px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon name={tab.icon} size={10} strokeWidth={2} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Nav sections ────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {filteredNav.map((section) => {
          const isSectionOpen = !section.label || !!openSections[section.label]

          return (
            <div key={section.label || 'inicio'} style={{ marginBottom: section.label ? 2 : 0 }}>
              {section.label && isExpanded && (
                <button
                  type="button"
                  onClick={() => toggleSection(section.label)}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '1.6px',
                    color: isSectionOpen ? 'rgba(196,160,120,0.7)' : 'rgba(196,160,120,0.35)',
                    padding: '10px 8px 5px',
                    fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: 7,
                    transition: 'all 0.15s ease',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'rgba(253,248,242,0.8)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = isSectionOpen ? 'rgba(196,160,120,0.7)' : 'rgba(196,160,120,0.35)'
                  }}
                >
                  {SECTION_ICONS[section.label] && (
                    <Icon
                      name={SECTION_ICONS[section.label]}
                      size={11}
                      strokeWidth={2}
                      color="currentColor"
                    />
                  )}
                  <span style={{ flex: 1 }}>{section.label}</span>
                  <Icon
                    name={isSectionOpen ? 'chevron-down' : 'chevron-right'}
                    size={10}
                    strokeWidth={2.5}
                    color="currentColor"
                    style={{ opacity: 0.6 }}
                  />
                </button>
              )}

              {(isSectionOpen || !isExpanded) && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                  marginTop: section.label && isExpanded ? 1 : 0,
                }}>
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
              )}
            </div>
          )
        })}
      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      {isExpanded && (
        <div style={{
          marginTop: 12,
          padding: '10px 8px 0',
          borderTop: '1px solid rgba(255,220,170,0.05)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#4ade80',
            flexShrink: 0,
          }} />
          <div style={{
            fontSize: 10,
            color: 'rgba(196,160,120,0.35)',
            letterSpacing: '0.4px',
            fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
            fontWeight: 600,
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
  const [isHov, setIsHov] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        onClick={() => onNavigate(item.key)}
        onMouseEnter={() => setIsHov(true)}
        onMouseLeave={() => setIsHov(false)}
        title={!isExpanded ? item.label : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isExpanded ? 'flex-start' : 'center',
          gap: isExpanded ? 10 : 0,
          width: '100%',
          padding: isExpanded ? '8px 10px 8px 9px' : '9px 0',
          borderRadius: 9,
          border: 'none',
          // Estado ativo: fundo quente + borda esquerda dourada
          background: isActive
            ? 'rgba(196,131,74,0.14)'
            : isHov
              ? 'rgba(255,255,255,0.05)'
              : 'transparent',
          color: isActive ? '#fdf8f2' : isHov ? 'rgba(253,248,242,0.85)' : 'rgba(196,160,120,0.6)',
          fontSize: 13.5,
          fontWeight: isActive ? 600 : 400,
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.14s ease',
          // Borda esquerda: strip de acento dourado só quando ativo
          boxShadow: isExpanded && isActive
            ? 'inset 2px 0 0 #c4834a'
            : 'none',
          marginBottom: 0,
          lineHeight: 1.3,
          fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
          letterSpacing: isActive ? '-0.1px' : '0',
        }}
      >
        {/* Icon wrapper */}
        <div style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isActive
            ? 'rgba(196,131,74,0.2)'
            : isHov
              ? 'rgba(255,255,255,0.06)'
              : 'transparent',
          transition: 'background 0.14s ease',
          flexShrink: 0,
        }}>
          <Icon
            name={item.icon}
            size={16}
            strokeWidth={isActive ? 2 : 1.5}
            color={isActive ? '#d4914e' : isHov ? 'rgba(196,160,120,0.9)' : 'rgba(196,131,74,0.55)'}
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

        {/* Dot indicator (collapsed mode — active) */}
        {!isExpanded && isActive && (
          <div style={{
            position: 'absolute',
            right: 4,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 3,
            height: 14,
            borderRadius: 2,
            background: '#c4834a',
          }} />
        )}
      </button>

      {/* Tooltip (collapsed only) */}
      {!isExpanded && isHov && (
        <div style={{
          position: 'fixed',
          left: 72,
          transform: 'translateY(-50%) translateY(-2px)',
          background: '#1c110a',
          color: '#fdf8f2',
          padding: '5px 11px',
          borderRadius: 8,
          fontSize: 12.5,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,220,170,0.1)',
          zIndex: 9999,
          pointerEvents: 'none',
          fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
        }}>
          {item.label}
          {/* Arrow */}
          <div style={{
            position: 'absolute',
            left: -4,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 0,
            height: 0,
            borderTop: '4px solid transparent',
            borderBottom: '4px solid transparent',
            borderRight: '4px solid rgba(255,220,170,0.1)',
          }} />
        </div>
      )}
    </div>
  )
}
