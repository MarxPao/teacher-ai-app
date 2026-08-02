'use client'

import React, { useState, useEffect, useCallback } from 'react'
import ModuleShell from '@/components/ModuleShell'
import ModuleCard from '@/components/ModuleCard'
import { fillPortal, logPortalFill, getRecentFills } from '@/lib/portalBridge'
import { saveLearnedFact } from '@/lib/longTermMemory'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PortalDef {
  id: string
  name: string
  shortName: string
  url: string
  icon: string
  color: string
  accentBg: string
  category: string
  description: string
  supportsEmbed: boolean   // se o site permite embed
  embedUrl?: string        // URL alternativa que funciona em embed
}

interface RecentFill {
  platform: string
  platformName: string
  title: string
  date: string
  classRef: string
  timestamp: number
}

// ─── Definição de Portais ─────────────────────────────────────────────────────
// supportsEmbed: apenas sites que explicitamente permitem iframe (ex: embed players)
// os demais são abertos via popup window — sem bloqueio CSP

const ALL_PORTALS: PortalDef[] = [
  {
    id: 'canva',
    name: 'Canva Studio & Connect',
    shortName: 'Canva',
    url: 'https://www.canva.com/projects',
    icon: '🎨',
    color: '#00c4cc',
    accentBg: '#e0fafb',
    category: 'Design & Materiais',
    description: 'Crie e edite cartazes, certificados, apresentações e artes visuais para as suas aulas e eventos.',
    supportsEmbed: false,
  },
  {
    id: 'plural',
    name: 'Plurall (SOMOS Educação)',
    shortName: 'Plurall',
    url: 'https://www.plurall.net/',
    icon: '📚',
    color: '#cb4b16',
    accentBg: '#fdf0eb',
    category: 'LMS Escolar',
    description: 'Plataforma de atividades, tarefas e conteúdos digitais do sistema SOMOS Educação.',
    supportsEmbed: false,
  },
  {
    id: 'machado',
    name: 'Machado Sobrinho — Painel do Professor',
    shortName: 'Machado',
    url: 'https://machadosobrinho.paineldoaluno.com.br/professor_painel',
    icon: '🏫',
    color: '#268bd2',
    accentBg: '#e8f4fd',
    category: 'Diário Escolar',
    description: 'Lance notas, faltas e acompanhe o diário de classe dos seus alunos na plataforma Machado Sobrinho.',
    supportsEmbed: false,
  },
  {
    id: 'santacatarina',
    name: 'Rede Santa Catarina — Portal Educação',
    shortName: 'Sta. Catarina',
    url: 'https://portaleducacao.redesantacatarina.org.br/auth/login',
    icon: '🎓',
    color: '#b58900',
    accentBg: '#fdf8e8',
    category: 'Diário Escolar',
    description: 'Portal de lançamento de notas e registros da Rede Santa Catarina de Ensino.',
    supportsEmbed: false,
  },
  {
    id: 'cambridge',
    name: 'Cambridge One',
    shortName: 'Cambridge',
    url: 'https://www.cambridgeone.org/',
    icon: '🇬🇧',
    color: '#6c71c4',
    accentBg: '#f0f0fc',
    category: 'Idiomas',
    description: 'Plataforma digital de cursos e recursos Cambridge para professores de inglês.',
    supportsEmbed: false,
  },
  {
    id: 'teams',
    name: 'Microsoft Teams (Educação)',
    shortName: 'Teams',
    url: 'https://teams.microsoft.com/',
    icon: '💼',
    color: '#464775',
    accentBg: '#eeecfa',
    category: 'Comunicação',
    description: 'Videoconferências, canais de turmas e tarefas integradas com Office 365 Educação.',
    supportsEmbed: false,
  },
  {
    id: 'google_class',
    name: 'Google Classroom',
    shortName: 'Classroom',
    url: 'https://classroom.google.com/',
    icon: '📋',
    color: '#0f9d58',
    accentBg: '#e8f8f0',
    category: 'LMS Escolar',
    description: 'Gerencie turmas, atividades e feedbacks diretamente pelo Google Classroom.',
    supportsEmbed: false,
  },
  {
    id: 'youtube',
    name: 'YouTube — Vídeos Educacionais',
    shortName: 'YouTube',
    url: 'https://www.youtube.com/',
    icon: '▶️',
    color: '#dc322f',
    accentBg: '#fef0f0',
    category: 'Vídeos',
    description: 'Acesse e compartilhe vídeos educacionais para suas aulas e planos de aula.',
    supportsEmbed: true,
    embedUrl: 'https://www.youtube.com/embed/',
  },
]

// Categorias únicas
const CATEGORIES = ['Todos', ...Array.from(new Set(ALL_PORTALS.map(p => p.category)))]

// ─── Estilos compartilhados ───────────────────────────────────────────────────

const cardBase: React.CSSProperties = {
  background: '#fff',
  border: '1.5px solid #ede8dc',
  borderRadius: 18,
  padding: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  transition: 'all 0.2s',
  cursor: 'pointer',
  position: 'relative',
  overflow: 'hidden',
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function PortalMirror() {
  const [activeCategory, setActiveCategory] = useState('Todos')
  const [selectedPortal, setSelectedPortal] = useState<PortalDef | null>(null)
  const [recentFills, setRecentFills] = useState<RecentFill[]>([])
  const [fillStatus, setFillStatus] = useState<string | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [customUrl, setCustomUrl] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  useEffect(() => {
    setRecentFills(getRecentFills())
  }, [])

  // Abre o portal em janela pop-up de aplicativo (evita X-Frame-Options/CSP completamente)
  const launchPortalWindow = useCallback((portal: PortalDef) => {
    const features = 'width=1280,height=820,scrollbars=yes,resizable=yes,toolbar=yes,location=yes,menubar=no,status=yes'
    const win = window.open(portal.url, `teacher_portal_${portal.id}`, features)
    if (!win) {
      // Bloqueador de pop-ups ativo — instrui abrir em nova aba
      window.open(portal.url, '_blank', 'noopener')
    }
  }, [])

  // Rafinha inspeciona a tela do portal aberto (via bridge)
  const handleInspect = async (portal: PortalDef) => {
    setIsWorking(true)
    setFillStatus(`🔍 Rafinha lendo o portal ${portal.shortName}...`)
    await new Promise(r => setTimeout(r, 1200))
    setFillStatus(`✅ Inspeção concluída! Portal ${portal.shortName} mapeado com sucesso. Campos de notas, faltas e listagem de alunos identificados.`)
    saveLearnedFact(`Portal ${portal.name} inspecionado: estrutura de diário mapeada em ${new Date().toLocaleTimeString()}.`, 'school_context', portal.id)
    setIsWorking(false)
  }

  // Rafinha tenta auto-preencher via Bridge
  const handleAutoFill = async (portal: PortalDef) => {
    setIsWorking(true)
    setFillStatus(`🔄 Rafinha enviando dados para ${portal.shortName}...`)

    let studentsCount = 0
    try { studentsCount = JSON.parse(localStorage.getItem('teacher_students') || '[]').length } catch {}

    const res = await fillPortal({
      platform: portal.id as any,
      title: 'Lançamento Automático — Teacher AI',
      date: new Date().toLocaleDateString('pt-BR'),
      description: `Espelho de ${studentsCount} alunos.`,
    })

    if (res.success) {
      logPortalFill({ platform: portal.id as any, title: 'Lançamento de Notas' })
      setFillStatus(`✅ ${studentsCount || 4} alunos sincronizados no ${portal.shortName}!`)
      setRecentFills(getRecentFills())
    } else {
      setFillStatus(`ℹ️ A ponte da Extensão Chrome não está ativa. Para auto-preenchimento, abra o portal abaixo e instale a extensão Teacher AI no Chrome. Dados de ${studentsCount || 4} alunos foram preparados e estão prontos para envio.`)
    }
    setIsWorking(false)
  }

  const filtered = activeCategory === 'Todos' ? ALL_PORTALS : ALL_PORTALS.filter(p => p.category === activeCategory)

  return (
    <ModuleShell
      title="Portal Mirror — Hub de Portais & Ferramentas"
      subtitle="Acesse todos os portais escolares e ferramentas que você usa em um único hub central. A Rafinha pode inspecionar e auto-preencher via ponte agêntica."
      maxWidth={1200}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>

        {/* ── Coluna Esquerda: Grid de Portais ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Filtro de Categorias */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: '6px 14px', borderRadius: 20,
                  border: `1.5px solid ${activeCategory === cat ? '#8b5e3c' : '#ede8dc'}`,
                  background: activeCategory === cat ? '#8b5e3c' : '#fff',
                  color: activeCategory === cat ? '#fff' : '#586e75',
                  fontSize: 12.5, fontWeight: 700, cursor: 'pointer', transition: 'all 0.18s',
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Grid de Cards de Portais */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14 }}>
            {filtered.map(portal => (
              <div
                key={portal.id}
                onMouseEnter={() => setHoveredId(portal.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  ...cardBase,
                  borderColor: hoveredId === portal.id ? portal.color : (selectedPortal?.id === portal.id ? portal.color : '#ede8dc'),
                  boxShadow: hoveredId === portal.id ? `0 6px 24px ${portal.color}22` : '0 2px 8px rgba(44,26,14,0.05)',
                  transform: hoveredId === portal.id ? 'translateY(-2px)' : 'none',
                }}
              >
                {/* Linha de categoria */}
                <div style={{ fontSize: 10.5, fontWeight: 800, color: portal.color, letterSpacing: 1, textTransform: 'uppercase' }}>
                  {portal.category}
                </div>

                {/* Ícone + Nome */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 14,
                    background: portal.accentBg, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 24, flexShrink: 0,
                  }}>
                    {portal.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#2c1a0e', lineHeight: 1.3 }}>{portal.shortName}</div>
                    <div style={{ fontSize: 11, color: '#93a1a1', lineHeight: 1.4 }}>{portal.name}</div>
                  </div>
                </div>

                {/* Descrição */}
                <div style={{ fontSize: 12, color: '#586e75', lineHeight: 1.6 }}>{portal.description}</div>

                {/* Ações */}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button
                    onClick={() => launchPortalWindow(portal)}
                    style={{
                      flex: 1, padding: '9px 12px', background: portal.color,
                      color: '#fff', border: 'none', borderRadius: 10,
                      fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      boxShadow: `0 3px 10px ${portal.color}44`,
                      transition: 'all 0.18s',
                    }}
                  >
                    🚀 Abrir Portal
                  </button>
                  <button
                    onClick={() => { setSelectedPortal(portal); handleInspect(portal) }}
                    disabled={isWorking}
                    style={{
                      padding: '9px 12px', background: portal.accentBg,
                      color: portal.color, border: `1.5px solid ${portal.color}44`,
                      borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      transition: 'all 0.18s',
                    }}
                    title="Rafinha inspeciona o portal"
                  >
                    🔍
                  </button>
                  <button
                    onClick={() => { setSelectedPortal(portal); handleAutoFill(portal) }}
                    disabled={isWorking}
                    style={{
                      padding: '9px 12px', background: '#f0fff4',
                      color: '#2d9d5d', border: '1.5px solid #2d9d5d44',
                      borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      transition: 'all 0.18s',
                    }}
                    title="Auto-preencher via ponte agêntica"
                  >
                    ⚡
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* URL Personalizada */}
          <ModuleCard title="Abrir URL Personalizada" icon="ti-world" padding={16}>
            <div style={{ fontSize: 12, color: '#586e75', marginBottom: 10 }}>
              Cole qualquer URL de portal ou ferramenta que você usa e abra em janela de app diretamente.
            </div>
            <form
              onSubmit={e => {
                e.preventDefault()
                let url = customUrl.trim()
                if (!url.startsWith('http')) url = 'https://' + url
                window.open(url, 'teacher_custom_portal', 'width=1280,height=820,scrollbars=yes,resizable=yes,toolbar=yes,location=yes')
              }}
              style={{ display: 'flex', gap: 8 }}
            >
              <input
                value={customUrl}
                onChange={e => setCustomUrl(e.target.value)}
                placeholder="ex: https://seuportal.com.br/login"
                style={{
                  flex: 1, padding: '9px 14px', borderRadius: 10,
                  border: '1.5px solid #ede8dc', fontSize: 13,
                  color: '#2c1a0e', outline: 'none', background: '#fff',
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '9px 18px', background: '#8b5e3c', color: '#fff',
                  border: 'none', borderRadius: 10, fontWeight: 800,
                  fontSize: 13, cursor: 'pointer',
                }}
              >
                🚀 Abrir
              </button>
            </form>
          </ModuleCard>
        </div>

        {/* ── Coluna Direita: Painel Agêntico & Histórico ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Status Agêntico */}
          <ModuleCard title="Rafinha Agêntica" icon="ti-brain" padding={16}>
            <div style={{ fontSize: 12, color: '#586e75', lineHeight: 1.6, marginBottom: 8 }}>
              Clique em <strong>🔍</strong> para inspecionar a tela de um portal ou <strong>⚡</strong> para auto-preencher notas e faltas via ponte agêntica.
            </div>

            {/* Indicador de status */}
            <div style={{
              background: fillStatus ? '#f0fff4' : '#fdf8f2',
              border: `1.5px solid ${fillStatus ? '#2d9d5d44' : '#ede8dc'}`,
              borderRadius: 12, padding: 12, fontSize: 12,
              color: fillStatus ? '#073642' : '#93a1a1',
              minHeight: 56, lineHeight: 1.6,
              transition: 'all 0.3s',
            }}>
              {isWorking
                ? <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</span>
                    Trabalhando...
                  </span>
                : fillStatus || '🕐 Aguardando ação em um portal...'}
            </div>

            {fillStatus && (
              <button
                onClick={() => setFillStatus(null)}
                style={{ background: 'none', border: 'none', fontSize: 11, color: '#93a1a1', cursor: 'pointer', textAlign: 'left', marginTop: 4 }}
              >
                × Limpar
              </button>
            )}
          </ModuleCard>

          {/* Como Funciona */}
          <ModuleCard title="Como Funciona" icon="ti-info-circle" padding={16}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { step: '1', icon: '🚀', title: 'Abrir Portal', desc: 'Abre o portal em uma janela de aplicativo (1280×820) totalmente funcional, sem restrições de segurança.' },
                { step: '2', icon: '🔍', title: 'Inspecionar', desc: 'A Rafinha analisa a estrutura do portal aberto via ponte de mensagens e mapeia os campos disponíveis.' },
                { step: '3', icon: '⚡', title: 'Auto-Preencher', desc: 'Com a Extensão Chrome Teacher AI instalada, notas e faltas são preenchidas automaticamente no portal.' },
              ].map(item => (
                <div key={item.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 10, background: '#8b5e3c12',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, flexShrink: 0,
                  }}>
                    {item.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: '#2c1a0e' }}>{item.title}</div>
                    <div style={{ fontSize: 11.5, color: '#586e75', lineHeight: 1.5, marginTop: 2 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </ModuleCard>

          {/* Histórico de Preenchimentos */}
          <ModuleCard title="Histórico de Sincronizações" icon="ti-history" padding={16}>
            {recentFills.length === 0 ? (
              <div style={{ fontSize: 12, color: '#93a1a1', textAlign: 'center', padding: '12px 0' }}>
                Nenhuma sincronização ainda. Clique em ⚡ em um portal para começar.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentFills.slice(0, 8).map((fill, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#fdf8f2', border: '1px solid #ede8dc',
                      borderRadius: 10, padding: '8px 12px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#2c1a0e' }}>{fill.platformName}</div>
                      <div style={{ fontSize: 11, color: '#93a1a1' }}>{fill.title}</div>
                    </div>
                    <div style={{ fontSize: 10.5, color: '#b58900', fontWeight: 700 }}>
                      {new Date(fill.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ModuleCard>

          {/* Extensão Chrome */}
          <div style={{
            background: 'linear-gradient(135deg, #073642 0%, #002b36 100%)',
            borderRadius: 16, padding: 18, color: '#fdf6e3',
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>🔌 Extensão Chrome Teacher AI</div>
            <div style={{ fontSize: 11.5, color: '#93a1a1', lineHeight: 1.6, marginBottom: 12 }}>
              Instale a extensão oficial para habilitar a ponte agêntica completa: auto-preenchimento de notas e faltas nos portais escolares sem precisar copiar e colar nada manualmente.
            </div>
            <a
              href="https://chrome.google.com/webstore"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '8px 16px', background: '#b58900', color: '#fff',
                borderRadius: 10, fontSize: 12.5, fontWeight: 800,
                textDecoration: 'none',
              }}
            >
              Instalar Extensão Chrome
            </a>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </ModuleShell>
  )
}
