'use client'

import { ModuleKey } from '@/app/page'

interface NavItem { key: ModuleKey; label: string; icon: string }
interface Section { label: string; items: NavItem[] }

const NAV: Section[] = [
  { label: '', items: [
    { key: 'dashboard', label: 'Início', icon: 'ti-home-2' },
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
  { label: 'Organização', items: [
    { key: 'organization',   label: 'Escolas',               icon: 'ti-building-school' },
    { key: 'classes',        label: 'Turmas',                icon: 'ti-school' },
    { key: 'students',       label: 'Alunos',                icon: 'ti-user-circle' },
    { key: 'privatetutoring',label: 'Alunos Particulares',   icon: 'ti-user-dollar' },
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

interface Props { active: ModuleKey; onNavigate: (k: ModuleKey) => void }

export default function Sidebar({ active, onNavigate }: Props) {
  return (
    <nav
      className="sidebar-scrollbar"
      style={{
      width: 275,
      flexShrink: 0,
      height: '100vh',
      overflowY: 'auto',
      background: 'linear-gradient(180deg, #3d2510 0%, #2c1a0e 65%, #190f09 100%)',
      boxShadow: '4px 0 24px rgba(28,17,10,0.18)',
      display: 'flex',
      flexDirection: 'column',
      padding: '0 12px 24px',
      gap: 0,
      zIndex: 20,
    }}>

      {/* Brand */}
      <div style={{
        padding: '24px 14px 20px',
        borderBottom: '1px solid rgba(255,220,170,0.1)',
        marginBottom: 16,
        position: 'sticky',
        top: 0,
        background: 'linear-gradient(180deg, #3d2510 0%, #3d2510 90%, rgba(61,37,16,0.95) 100%)',
        backdropFilter: 'blur(8px)',
        zIndex: 10,
      }}>
        <div style={{
          fontFamily: "'Fraunces', 'Playfair Display', Georgia, serif",
          fontSize: 23,
          fontWeight: 700,
          color: '#fdf8f2',
          letterSpacing: '-0.4px',
          lineHeight: 1.1,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span>Teacher</span>
          <span style={{
            color: '#e2a355',
            background: 'rgba(226,163,85,0.18)',
            padding: '2px 8px',
            borderRadius: 6,
            fontSize: 18,
            border: '1px solid rgba(226,163,85,0.3)',
          }}>AI</span>
        </div>
        <div style={{
          fontSize: 10,
          color: 'rgba(212,180,140,0.6)',
          marginTop: 6,
          fontWeight: 600,
          letterSpacing: '1.8px',
          textTransform: 'uppercase',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}>
          Assistente Pedagógico
        </div>
      </div>

      {/* Nav sections */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {NAV.map((section) => (
          <div key={section.label} style={{ marginBottom: section.label ? 6 : 0 }}>
            {section.label && (
              <div style={{
                fontSize: 9.5,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '2.2px',
                color: 'rgba(212,180,140,0.45)',
                padding: '14px 14px 6px',
                fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
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
        marginTop: 20,
        padding: '14px 14px 0',
        borderTop: '1px solid rgba(255,220,170,0.08)',
      }}>
        <div style={{
          fontSize: 10,
          color: 'rgba(212,180,140,0.4)',
          letterSpacing: '0.5px',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          fontWeight: 500,
        }}>
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
        gap: 12,
        width: '100%',
        padding: '9.5px 14px',
        borderRadius: 10,
        border: 'none',
        background: isActive
          ? 'linear-gradient(135deg, rgba(253,248,242,0.16) 0%, rgba(253,248,242,0.08) 100%)'
          : 'transparent',
        color: isActive ? '#ffffff' : 'rgba(212,180,140,0.72)',
        fontSize: 13.5,
        fontWeight: isActive ? 600 : 500,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        boxShadow: isActive
          ? '0 4px 14px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 0 0 1px rgba(253,248,242,0.18)'
          : 'none',
        marginBottom: 2,
        borderLeft: isActive ? '3px solid #e2a355' : '3px solid transparent',
        lineHeight: 1.25,
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = 'rgba(253,248,242,0.08)';
          (e.currentTarget as HTMLElement).style.color = '#ffffff';
          (e.currentTarget as HTMLElement).style.transform = 'translateX(2px)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
          (e.currentTarget as HTMLElement).style.color = 'rgba(212,180,140,0.72)';
          (e.currentTarget as HTMLElement).style.transform = 'translateX(0px)';
        }
      }}
    >
      {/* Icon Wrapper com tamanho expandido (20px) e presenca marcante */}
      <div style={{
        width: 26,
        height: 26,
        borderRadius: 7,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isActive ? 'rgba(226,163,85,0.22)' : 'transparent',
        transition: 'all 0.2s ease',
        flexShrink: 0,
      }}>
        <i
          className={`ti ${item.icon}`}
          style={{
            fontSize: 20, // Aumentado significativamente de 15px para 20px
            color: isActive ? '#e2a355' : 'rgba(226,163,85,0.65)',
            flexShrink: 0,
            lineHeight: 1,
          }}
        />
      </div>

      <span style={{
        flex: 1,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {item.label}
      </span>

      {isActive && (
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
  )
}
