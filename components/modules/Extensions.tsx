'use client'

import { useState, useEffect, useCallback } from 'react'
import { CalendarTask } from '@/lib/calendarUtils'

interface PlatformConfig {
  id: string
  name: string
  url: string
  description: string
  type: 'extension' | 'api'
  icon: string
  color: string
  bg: string
  border: string
  fieldsMapped: string[]
  status: 'active' | 'pending' | 'error'
}

interface AgentLogEntry {
  ts: string
  type: 'ok' | 'err' | 'info'
  msg: string
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: 'machado',
    name: 'Machado Sobrinho',
    url: 'https://machadosobrinho.paineldoaluno.com.br/professor_painel',
    description: 'Painel oficial de professores para lançamento de diários, tarefas e avaliações.',
    type: 'extension',
    icon: 'ti-chalkboard',
    color: '#b58900',
    bg: '#fef9c3',
    border: '#fef08a',
    fieldsMapped: ['Título do Diário', 'Conteúdo Programado', 'Data da Aula', 'Frequência'],
    status: 'active'
  },
  {
    id: 'santacatarina',
    name: 'Rede Santa Catarina',
    url: 'https://portaleducacao.redesantacatarina.org.br/auth/login',
    description: 'Portal acadêmico oficial para controle de planos de aula e boletins escolares.',
    type: 'extension',
    icon: 'ti-shield-check',
    color: '#dc322f',
    bg: '#fee2e2',
    border: '#fca5a5',
    fieldsMapped: ['Planejamento de Aula', 'Pauta Escolar', 'Datas de Provas', 'Notas'],
    status: 'active'
  },
  {
    id: 'plural',
    name: 'Plural (SOMOS Educação)',
    url: 'https://www.plural.net/',
    description: 'Portal de tarefas, avaliações e acompanhamento pedagógico escolar.',
    type: 'extension',
    icon: 'ti-notebook',
    color: '#cb4b16',
    bg: '#fff7ed',
    border: '#ffedd5',
    fieldsMapped: ['Título da Tarefa', 'Data Limite', 'Descrição', 'Turma'],
    status: 'active'
  },
  {
    id: 'canva',
    name: 'Canva Studio & Canva Connect',
    url: 'https://www.canva.com/',
    description: 'Integração oficial para importação de pastas, projetos, estúdio embutido e modelos visuais de eventos escolares.',
    type: 'extension',
    icon: 'ti-palette',
    color: '#00c4cc',
    bg: '#e6fffa',
    border: '#99f6e4',
    fieldsMapped: ['Importador de Pastas/Projetos', 'Estúdio Canva Embutido (Iframe)', 'Modelos de Eventos Escolares', 'Exportação de Artes'],
    status: 'active'
  },
  {
    id: 'cambridge',
    name: 'Cambridge One',
    url: 'https://www.cambridgeone.org/',
    description: 'Portal de English Language Teaching (ELT) para materiais e diários de notas digitais.',
    type: 'extension',
    icon: 'ti-book-2',
    color: '#268bd2',
    bg: '#f0f9ff',
    border: '#bae6fd',
    fieldsMapped: ['Nome da Lição', 'Prazo de Entrega', 'Notas (Importação)'],
    status: 'pending'
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    url: 'https://teams.microsoft.com/',
    description: 'Ambiente de colaboração escolar para chats, avisos em canais e tarefas (Assignments).',
    type: 'api',
    icon: 'ti-brand-office',
    color: '#6c71c4',
    bg: '#faf5ff',
    border: '#e9d5ff',
    fieldsMapped: ['Postagens de Canais', 'Tarefas Globais', 'Calendário Acadêmico'],
    status: 'pending'
  }
]

const INSTALL_STEPS = [
  { icon: '📁', title: 'Localize a Pasta', desc: 'A extensão já foi criada em: C:\\Users\\rafae\\.gemini\\antigravity\\scratch\\teacher-extension' },
  { icon: '🌐', title: 'Abra o Chrome', desc: 'Digite chrome://extensions/ na barra de endereços do Chrome.' },
  { icon: '🔧', title: 'Ative o Modo Dev', desc: 'Ative a chave "Modo do desenvolvedor" no canto superior direito.' },
  { icon: '📂', title: 'Carregue a Pasta', desc: 'Clique em "Carregar sem compactação" e selecione a pasta teacher-extension.' },
  { icon: '✅', title: 'Pronto!', desc: 'O ícone 🧑‍🏫 aparecerá no Chrome. Abra um portal escolar para testá-lo.' },
]

export default function Extensions() {
  const [tasks, setTasks] = useState<CalendarTask[]>([])
  const [selectedTasks, setSelectedTasks] = useState<Record<string, string>>({})
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'ok' | 'err' | 'info' } | null>(null)
  const [activeTab, setActiveTab] = useState<'platforms' | 'install' | 'logs'>('platforms')
  const [agentLogs, setAgentLogs] = useState<AgentLogEntry[]>([])
  const [fillingPlatform, setFillingPlatform] = useState<string | null>(null)

  useEffect(() => {
    try {
      const savedTasks = localStorage.getItem('teacher_calendar_tasks')
      if (savedTasks) {
        setTasks(JSON.parse(savedTasks).filter((t: CalendarTask) => !t.done))
      }
    } catch (e) {}

    // Load persisted logs from localStorage
    try {
      const savedLogs = localStorage.getItem('teacher_agent_logs')
      if (savedLogs) setAgentLogs(JSON.parse(savedLogs))
    } catch (e) {}
  }, [])

  const addLog = useCallback((type: 'ok' | 'err' | 'info', msg: string) => {
    const now = new Date()
    const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
    const entry: AgentLogEntry = { ts, type, msg }
    setAgentLogs(prev => {
      const next = [entry, ...prev].slice(0, 50)
      try { localStorage.setItem('teacher_agent_logs', JSON.stringify(next)) } catch (e) {}
      return next
    })
  }, [])

  const triggerToast = (text: string, type: 'ok' | 'err' | 'info' = 'info') => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 5000)
  }

  const handleTriggerExtension = async (platform: PlatformConfig) => {
    const taskId = selectedTasks[platform.id]
    if (!taskId) {
      triggerToast(`⚠️ Selecione uma tarefa para plotar no ${platform.name}!`, 'err')
      return
    }

    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    setFillingPlatform(platform.id)

    const payload = {
      action: 'FILL_DEADLINE',
      platform: platform.id,
      task: {
        title: task.title,
        date: task.date,
        description: task.description || '',
        classRef: task.classRef || '',
        type: task.type
      }
    }

    // Broadcast via postMessage (caught by extension content script on localhost)
    window.postMessage(payload, '*')

    addLog('info', `📤 Enviado para ${platform.name}: "${task.title}"`)
    triggerToast(`🔌 Agente disparado! Abra o portal ${platform.name} no Chrome.`, 'ok')

    setTimeout(() => setFillingPlatform(null), 3000)
  }

  const handleClearLogs = () => {
    setAgentLogs([])
    try { localStorage.removeItem('teacher_agent_logs') } catch (e) {}
  }

  const TAB_STYLE = (isActive: boolean, color = '#b58900') => ({
    background: 'none', border: 'none', padding: '10px 20px', fontSize: 14, fontWeight: 700,
    cursor: 'pointer', color: isActive ? '#073642' : '#93a1a1',
    borderBottom: isActive ? `3px solid ${color}` : '3px solid transparent',
    marginBottom: -3, transition: 'all 0.2s', fontFamily: "'Outfit', sans-serif"
  } as React.CSSProperties)

  const toastColors = { ok: '#859900', err: '#dc322f', info: '#2aa198' }

  return (
    <div style={{ padding: '36px 48px', maxWidth: 1440, margin: '0 auto', background: '#fdf6e3', fontFamily: "'Outfit', sans-serif", minHeight: '100%' }}>

      {/* Toast */}
      {toastMessage && (
        <div style={{
          position: 'fixed', top: 24, right: 24, background: '#002b36', color: '#fdf6e3',
          padding: '14px 20px', borderRadius: 16, boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 13.5, fontWeight: 600,
          zIndex: 1100, border: `1px solid ${toastColors[toastMessage.type]}50`, maxWidth: 420
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: toastColors[toastMessage.type], flexShrink: 0, display: 'inline-block' }} />
          {toastMessage.text}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #b58900, #cb4b16)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
            🔌
          </div>
          <div>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 32, fontWeight: 700, color: '#073642', margin: 0 }}>
              Central de Extensões Agênticas
            </h1>
            <p style={{ color: '#586e75', fontSize: 13, margin: 0 }}>
              Rafinha age diretamente nos portais escolares via extensão Chrome
            </p>
          </div>
        </div>

        {/* Extension status banner */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(133,153,0,0.08), rgba(42,161,152,0.08))',
          border: '1px solid rgba(133,153,0,0.2)', borderRadius: 14, padding: '12px 20px',
          display: 'flex', alignItems: 'center', gap: 12, marginTop: 20
        }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#859900', boxShadow: '0 0 10px #859900', display: 'inline-block', flexShrink: 0 }} />
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#073642' }}>Extensão pronta para uso</span>
            <span style={{ fontSize: 12, color: '#586e75', marginLeft: 12 }}>
              Pasta: <code style={{ background: '#eee8d5', padding: '1px 6px', borderRadius: 4 }}>teacher-extension/</code> já existe — basta carregar no Chrome
            </span>
          </div>
          <button
            onClick={() => setActiveTab('install')}
            style={{ marginLeft: 'auto', background: '#859900', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            Ver Como Instalar →
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 24, borderBottom: '3px solid rgba(88,110,117,0.1)' }}>
          <button style={TAB_STYLE(activeTab === 'platforms')} onClick={() => setActiveTab('platforms')}>🔌 Plataformas ({PLATFORMS.length})</button>
          <button style={TAB_STYLE(activeTab === 'install')} onClick={() => setActiveTab('install')}>🛠️ Instalação</button>
          <button style={TAB_STYLE(activeTab === 'logs', '#2aa198')} onClick={() => setActiveTab('logs')}>
            📋 Log de Atividade {agentLogs.length > 0 && <span style={{ background: '#2aa198', color: '#fff', fontSize: 9, padding: '1px 5px', borderRadius: 8, marginLeft: 4 }}>{agentLogs.length}</span>}
          </button>
        </div>
      </div>

      {/* ——— PLATFORMS TAB ——— */}
      {activeTab === 'platforms' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 20 }}>
          {PLATFORMS.map(platform => {
            const selTaskId = selectedTasks[platform.id] || ''
            const isFilling = fillingPlatform === platform.id

            return (
              <div
                key={platform.id}
                style={{
                  background: '#fff', border: '1px solid rgba(88,110,117,0.12)', borderRadius: 22,
                  boxShadow: '0 4px 20px rgba(0,43,54,0.04)', padding: 24,
                  display: 'flex', flexDirection: 'column', gap: 18, transition: 'all 0.2s'
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,43,54,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,43,54,0.04)' }}
              >
                {/* Platform Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 12, background: platform.bg, border: `2px solid ${platform.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className={`ti ${platform.icon}`} style={{ fontSize: 22, color: platform.color }} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#073642', margin: 0 }}>{platform.name}</h3>
                      <a href={platform.url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#93a1a1', textDecoration: 'none' }}>
                        🔗 {platform.url.replace('https://', '').split('/')[0]}
                      </a>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px',
                      color: platform.type === 'extension' ? '#2aa198' : '#6c71c4',
                      background: platform.type === 'extension' ? '#f0fdfa' : '#faf5ff',
                      padding: '3px 8px', borderRadius: 6, border: '1px solid currentColor'
                    }}>
                      {platform.type === 'extension' ? '🔌 Extension' : '🌐 API'}
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 700,
                      color: platform.status === 'active' ? '#859900' : '#93a1a1',
                      display: 'flex', alignItems: 'center', gap: 4
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: platform.status === 'active' ? '#859900' : '#93a1a1', display: 'inline-block' }} />
                      {platform.status === 'active' ? 'Ativo' : 'Em Breve'}
                    </span>
                  </div>
                </div>

                <p style={{ fontSize: 13, color: '#586e75', lineHeight: 1.5, margin: 0 }}>{platform.description}</p>

                {/* Agêntic Action Panel */}
                <div style={{ background: '#fcfaf7', border: '1px solid #ede8dc', borderRadius: 16, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#073642', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    🤖 Disparo Agêntico
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#93a1a1', marginBottom: 4 }}>TAREFA DO CALENDÁRIO:</label>
                      <select
                        value={selTaskId}
                        onChange={e => setSelectedTasks(prev => ({ ...prev, [platform.id]: e.target.value }))}
                        style={{ width: '100%', padding: '9px 12px', background: '#fff', border: '1px solid #ede8dc', borderRadius: 10, fontSize: 13, color: '#073642', outline: 'none' }}
                      >
                        <option value="">-- Escolher tarefa ativa --</option>
                        {tasks.map(t => (
                          <option key={t.id} value={t.id}>{t.title} ({t.classRef || 'Geral'})</option>
                        ))}
                      </select>
                      {tasks.length === 0 && (
                        <p style={{ fontSize: 10, color: '#93a1a1', marginTop: 4 }}>Nenhuma tarefa ativa — crie no módulo Planejador.</p>
                      )}
                    </div>

                    <button
                      onClick={() => handleTriggerExtension(platform)}
                      disabled={isFilling}
                      style={{
                        background: isFilling ? '#93a1a1' : platform.color,
                        color: '#fff', border: 'none', padding: '11px 16px', borderRadius: 12,
                        fontWeight: 700, fontSize: 13, cursor: isFilling ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        boxShadow: isFilling ? 'none' : `0 4px 12px ${platform.color}30`,
                        transition: 'all 0.2s', fontFamily: "'Outfit', sans-serif"
                      }}
                    >
                      {isFilling ? (
                        <><i className="ti ti-loader-2" style={{ fontSize: 15, animation: 'spin 1s linear infinite' }} /> Agente em Ação...</>
                      ) : (
                        <><i className="ti ti-plug" style={{ fontSize: 15 }} /> Preencher Agênticamente</>
                      )}
                    </button>
                  </div>
                </div>

                {/* Mapped fields */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ fontSize: 9, color: '#93a1a1', width: '100%', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Campos Mapeados:</span>
                  {platform.fieldsMapped.map(f => (
                    <span key={f} style={{ fontSize: 10, fontWeight: 600, color: '#586e75', background: '#f5f0e8', padding: '3px 8px', borderRadius: 5 }}>• {f}</span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ——— INSTALL TAB ——— */}
      {activeTab === 'install' && (
        <div style={{ maxWidth: 780 }}>
          <div style={{ background: '#fff', borderRadius: 22, border: '1px solid rgba(88,110,117,0.12)', padding: 32, marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#073642', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>🛠️</span> Como Instalar a Extensão no Chrome
            </h2>
            <p style={{ color: '#586e75', fontSize: 13.5, marginBottom: 28, lineHeight: 1.5 }}>
              A extensão agêntica é o "corpo" da Rafinha dentro do Chrome — ela entra nos portais escolares e preenche formulários automaticamente para você.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {INSTALL_STEPS.map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 20px', background: '#fdf6e3', borderRadius: 14, border: '1px solid #ede8dc' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: '#073642', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                    {step.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: '#073642', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, background: '#b58900', color: '#fff', borderRadius: 20, padding: '1px 8px', fontWeight: 700 }}>Passo {i + 1}</span>
                      {step.title}
                    </div>
                    <div style={{ fontSize: 13, color: '#586e75', lineHeight: 1.4 }}>
                      {i === 0 ? (
                        <><code style={{ background: '#eee8d5', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>C:\Users\rafae\.gemini\antigravity\scratch\teacher-extension</code></>
                      ) : step.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* File checklist */}
          <div style={{ background: '#fff', borderRadius: 22, border: '1px solid rgba(88,110,117,0.12)', padding: 28 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#073642', marginBottom: 16 }}>📁 Arquivos da Extensão</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { file: 'manifest.json', desc: 'Configuração e permissões da extensão', status: '✅' },
                { file: 'content.js',   desc: 'Script injetado nas páginas escolares — preenche os campos', status: '✅' },
                { file: 'background.js',desc: 'Service worker — rota mensagens entre abas', status: '✅' },
                { file: 'popup.html',   desc: 'Interface visual quando você clica no ícone do Chrome', status: '✅' },
                { file: 'popup.js',     desc: 'Lógica do popup — log, scan de página e ações rápidas', status: '✅' },
              ].map(item => (
                <div key={item.file} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fcfaf7', borderRadius: 10, border: '1px solid #ede8dc' }}>
                  <span style={{ fontSize: 14 }}>{item.status}</span>
                  <code style={{ fontSize: 12, color: '#b58900', fontWeight: 700, minWidth: 130 }}>{item.file}</code>
                  <span style={{ fontSize: 12, color: '#586e75' }}>{item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ——— LOGS TAB ——— */}
      {activeTab === 'logs' && (
        <div style={{ background: '#073642', borderRadius: 22, border: '1px solid rgba(42,161,152,0.2)', padding: 24, fontFamily: "'Courier New', monospace" }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#859900', boxShadow: '0 0 8px #859900', display: 'inline-block' }} />
              <span style={{ color: '#fdf6e3', fontWeight: 700, fontSize: 14, fontFamily: "'Outfit', sans-serif" }}>Log de Atividade do Agente</span>
            </div>
            <button
              onClick={handleClearLogs}
              style={{ background: 'rgba(220,50,47,0.15)', color: '#dc322f', border: '1px solid rgba(220,50,47,0.3)', padding: '5px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}
            >
              Limpar Log
            </button>
          </div>

          <div style={{ minHeight: 300, maxHeight: 500, overflowY: 'auto' }}>
            {agentLogs.length === 0 ? (
              <div style={{ color: '#586e75', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
                Nenhuma atividade registrada ainda.<br />Dispare o agente em uma plataforma para ver o log aqui.
              </div>
            ) : agentLogs.map((log, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12 }}>
                <span style={{ color: '#2aa198', flexShrink: 0 }}>[{log.ts}]</span>
                <span style={{ color: log.type === 'ok' ? '#859900' : log.type === 'err' ? '#dc322f' : '#93a1a1' }}>
                  {log.type === 'ok' ? '✓' : log.type === 'err' ? '✗' : '·'}
                </span>
                <span style={{ color: '#fdf6e3' }}>{log.msg}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 10, color: '#586e75', fontFamily: "'Outfit', sans-serif" }}>
            {agentLogs.length} entrada(s) • O log é persistido no navegador
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
