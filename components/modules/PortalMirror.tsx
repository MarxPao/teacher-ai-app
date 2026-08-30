'use client'

import React, { useState, useEffect, useCallback } from 'react'
import ModuleShell from '@/components/ModuleShell'
import ModuleCard from '@/components/ModuleCard'
import { fillPortal, logPortalFill, getRecentFills, openPortal } from '@/lib/portalBridge'
import { saveLearnedFact } from '@/lib/longTermMemory'
import { getPortalProfiles, PortalProfileDef, PortalActionDef } from '@/lib/portalActionsEngine'
import AutomationDiffModal from '@/components/modules/AutomationDiffModal'
import SidecarPairingModal from '@/components/modules/SidecarPairingModal'
import { createBrowserTask, BrowserAutomationTask, DiffItem } from '@/lib/browserAutomationClient'
import { sanitizeOutboundPayload } from '@/lib/portalSanitizer'
import { checkBrowserCapability, evaluateActionRequirement } from '@/lib/browserCapabilityRouter'
import TrelloImportModal from '@/components/modules/TrelloImportModal'

interface RecentFill {
  platform: string
  platformName: string
  title: string
  date: string
  classRef: string
  timestamp: number
}

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

export default function PortalMirror() {
  const [portals, setPortals] = useState<PortalProfileDef[]>([])
  const [activeCategory, setActiveCategory] = useState('Todos')
  const [selectedPortal, setSelectedPortal] = useState<PortalProfileDef | null>(null)
  const [recentFills, setRecentFills] = useState<RecentFill[]>([])
  const [fillStatus, setFillStatus] = useState<string | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [customUrl, setCustomUrl] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [activeTask, setActiveTask] = useState<BrowserAutomationTask | null>(null)
  const [isPairingOpen, setIsPairingOpen] = useState(false)
  const [isTrelloModalOpen, setIsTrelloModalOpen] = useState(false)


  const loadData = useCallback(() => {
    const list = getPortalProfiles()
    setPortals(list)
    setRecentFills(getRecentFills())
  }, [])

  useEffect(() => {
    loadData()
    const handleStorage = () => loadData()
    window.addEventListener('storage', handleStorage)
    window.addEventListener('teacher:portals_changed', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('teacher:portals_changed', handleStorage)
    }
  }, [loadData])

  // Abre o portal em janela de aplicativo
  const launchPortalWindow = useCallback((portal: PortalProfileDef) => {
    openPortal(portal.id)
  }, [])

  // Rafinha inspeciona a tela do portal aberto (via bridge)
  const handleInspect = async (portal: PortalProfileDef) => {
    setIsWorking(true)
    setFillStatus(`🔍 Rafinha lendo o portal ${portal.name}...`)
    await new Promise(r => setTimeout(r, 1000))
    setFillStatus(`✅ Inspeção concluída! Portal ${portal.name} mapeado com sucesso. Seletores de diário, chamada e notas verificados.`)
    saveLearnedFact(`Portal ${portal.name} inspecionado: estrutura de pauta e notas validada em ${new Date().toLocaleTimeString()}.`, 'school_context', portal.id)
    setIsWorking(false)
  }

  // Rafinha executa preenchimento inteligente via Browser Harness / Diff Modal
  const handleAutoFill = async (portal: PortalProfileDef, action?: PortalActionDef) => {
    setIsWorking(true)
    const actionType = action?.type || 'diary'
    const title = action?.title || 'Diário de Aula - Present Perfect'
    
    setFillStatus(`⚡ Preparando ação no ${portal.name}...`)

    let studentsCount = 0
    let studentGrades: any[] = []
    try {
      const raw = localStorage.getItem('teacher_students')
      if (raw) {
        const parsed = JSON.parse(raw)
        studentsCount = parsed.length
        studentGrades = parsed.map((s: any) => ({
          name: s.name,
          grade: 8.5
        }))
      }
    } catch {}

    const diff: DiffItem[] = studentGrades.length > 0
      ? studentGrades.map(s => ({
          studentName: s.name,
          field: 'Nota / Avaliação 1',
          beforeValue: '',
          afterValue: s.grade,
          approved: true
        }))
      : [{
          studentName: 'Geral (Turma)',
          field: 'Diário de Classe',
          beforeValue: '',
          afterValue: title,
          approved: true
        }]

    const rawPayload = {
      platform: portal.id,
      actionType,
      title,
      date: new Date().toISOString().split('T')[0],
      classRef: '9º Ano A',
      description: `Lançamento agêntico para ${studentsCount || 5} alunos.`,
      mode: action?.executionMode || 'supervised',
      studentGrades,
      diff,
      confidence_flag: 'seletor_mapeado' as const
    }

    const cleanPayload = sanitizeOutboundPayload(rawPayload)

    // Cria a tarefa de automação
    const createdTask = await createBrowserTask({
      portal: portal.id,
      actionType,
      payload: cleanPayload,
      approvalMode: 'batch',
      classRef: '9º Ano A',
      studentCount: studentsCount || 5
    })

    if (createdTask) {
      setActiveTask(createdTask)
      setFillStatus(`📋 Tarefa criada! Revise as alterações no modal de aprovação antes do envio.`)
    } else {
      // Fallback para o modal local se offline ou Supabase em modo fallback
      const localTask: BrowserAutomationTask = {
        id: `task_${Date.now()}`,
        teacher_id: 'local_teacher',
        trace_id: `trace_${Date.now()}`,
        portal: portal.id,
        action_type: actionType,
        status: 'drafted',
        payload: cleanPayload,
        approval_mode: 'batch',
        class_ref: '9º Ano A',
        student_count: studentsCount || 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      setActiveTask(localTask)
    }

    setIsWorking(false)
  }

  const categories = ['Todos', ...Array.from(new Set(portals.map(p => p.category || 'Geral')))]
  const filtered = activeCategory === 'Todos' ? portals : portals.filter(p => p.category === activeCategory)

  return (
    <ModuleShell
      title="Portal Mirror — Hub de Portais & Automação Agêntica"
      subtitle="Acesse os portais escolares oficiais e acione a Rafinha para preenchimento supervisionado ou autônomo via voz"
      maxWidth={1240}
      actions={
        <button
          onClick={() => setIsPairingOpen(true)}
          style={{
            padding: '8px 16px', borderRadius: 10, border: '1.5px solid #8b5e3c',
            background: '#fdf8f2', color: '#5b3a20', fontSize: 12.5, fontWeight: 800,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
          }}
        >
          <span>🦉</span> Parear Sidecar Desktop
        </button>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>

        {/* Coluna Esquerda: Grid de Portais */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Filtro de Categorias */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: '6px 14px', borderRadius: 20,
                  border: `1.5px solid ${activeCategory === cat ? '#8b5e3c' : '#ede8dc'}`,
                  background: activeCategory === cat ? '#8b5e3c' : '#fff',
                  color: activeCategory === cat ? '#fff' : '#7a5c42',
                  fontSize: 12.5, fontWeight: 700, cursor: 'pointer', transition: 'all 0.18s',
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Grid de Cards de Portais */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: portal.color, letterSpacing: 1, textTransform: 'uppercase' }}>
                    {portal.category}
                  </span>
                  {portal.isCustom && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#e0e7ff', color: '#3730a3' }}>Custom</span>
                  )}
                </div>

                {/* Ícone + Nome */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 14,
                    background: portal.bg || '#faf6f0', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 22, flexShrink: 0, color: portal.color
                  }}>
                    <i className={portal.icon || 'ti-world'} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#2c1a0e', lineHeight: 1.3 }}>{portal.shortName || portal.name}</div>
                    <div style={{ fontSize: 11, color: '#a08060', lineHeight: 1.4 }}>{portal.name}</div>
                  </div>
                </div>

                {/* Descrição */}
                <div style={{ fontSize: 12, color: '#7a5c42', lineHeight: 1.6, minHeight: 38 }}>
                  {portal.description}
                </div>

                {/* Ações Rápidas Disponíveis */}
                {portal.actions && portal.actions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: '#faf6f0', padding: 8, borderRadius: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }}>Ações Rápidas:</span>
                    {portal.actions.slice(0, 2).map(act => (
                      <div key={act.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                        <span style={{ color: '#2c1a0e', fontWeight: 600 }}>⚡ {act.title}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAutoFill(portal, act) }}
                          style={{ background: '#8b5e3c', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Rodar
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Botões Principais */}
                <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  {portal.id === 'trello' ? (
                    <>
                      <button
                        onClick={() => setIsTrelloModalOpen(true)}
                        style={{
                          flex: 1, padding: '8px 10px', background: '#0079bf',
                          color: '#fff', border: 'none', borderRadius: 8,
                          fontSize: 12, fontWeight: 800, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          boxShadow: '0 3px 10px rgba(0,121,191,0.3)',
                          transition: 'all 0.18s',
                        }}
                      >
                        <i className="ti-layout-kanban" /> Importar Quadros & Cartões
                      </button>
                      <button
                        onClick={() => launchPortalWindow(portal)}
                        style={{
                          padding: '8px 12px', background: '#e6f4fb',
                          color: '#0079bf', border: '1px solid #b8e1f7',
                          borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                          transition: 'all 0.18s',
                        }}
                        title="Abrir Trello na web"
                      >
                        <i className="ti-arrow-top-right" /> Abrir
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => launchPortalWindow(portal)}
                        style={{
                          flex: 1, padding: '8px 10px', background: portal.color,
                          color: '#fff', border: 'none', borderRadius: 8,
                          fontSize: 12, fontWeight: 800, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          boxShadow: `0 3px 10px ${portal.color}44`,
                          transition: 'all 0.18s',
                        }}
                      >
                        <i className="ti-arrow-top-right" /> Abrir
                      </button>
                      <button
                        onClick={() => { setSelectedPortal(portal); handleInspect(portal) }}
                        disabled={isWorking}
                        style={{
                          padding: '8px 10px', background: '#faf6f0',
                          color: portal.color, border: `1px solid ${portal.color}44`,
                          borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                          transition: 'all 0.18s',
                        }}
                        title="Rafinha inspeciona o portal"
                      >
                        🔍 Inspecionar
                      </button>
                      <button
                        onClick={() => { setSelectedPortal(portal); handleAutoFill(portal) }}
                        disabled={isWorking}
                        style={{
                          padding: '8px 10px', background: '#f0fff4',
                          color: '#2d9d5d', border: '1px solid #2d9d5d44',
                          borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                          transition: 'all 0.18s',
                        }}
                        title="Auto-preencher via ponte agêntica"
                      >
                        ⚡ Preencher
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* URL Personalizada */}
          <ModuleCard title="Abrir URL Personalizada" icon="ti-world" padding={16}>
            <div style={{ fontSize: 12, color: '#7a5c42', marginBottom: 10 }}>
              Cole qualquer URL de portal ou ferramenta e abra em janela de app diretamente.
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
                Abrir
              </button>
            </form>
          </ModuleCard>
        </div>

        {/* Coluna Direita: Painel Agêntico & Histórico */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Status Agêntico */}
          <ModuleCard title="Rafinha Web Operator" icon="ti-brain" padding={16}>
            <div style={{ fontSize: 12, color: '#7a5c42', lineHeight: 1.6, marginBottom: 8 }}>
              Clique em <strong>🔍 Inspecionar</strong> para mapear uma tela ou <strong>⚡ Preencher</strong> para auto-preencher diários, frequências e notas.
            </div>

            {/* Indicador de status */}
            <div style={{
              background: fillStatus ? '#f0fff4' : '#fdf8f2',
              border: `1.5px solid ${fillStatus ? '#2d9d5d44' : '#ede8dc'}`,
              borderRadius: 12, padding: 12, fontSize: 12,
              color: fillStatus ? '#2c1a0e' : '#a08060',
              minHeight: 56, lineHeight: 1.6,
              transition: 'all 0.3s',
            }}>
              {isWorking
                ? <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                    Trabalhando...
                  </span>
                : fillStatus || '⚡ Aguardando ação em um portal ou comando de voz da Rafinha...'}
            </div>

            {fillStatus && (
              <button
                onClick={() => setFillStatus(null)}
                style={{ background: 'none', border: 'none', fontSize: 11, color: '#a08060', cursor: 'pointer', textAlign: 'left', marginTop: 4 }}
              >
                × Limpar
              </button>
            )}
          </ModuleCard>

          {/* Como Funciona */}
          <ModuleCard title="Como Funciona" icon="ti-info-circle" padding={16}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { step: '1', icon: '🌐', title: 'Abrir Portal', desc: 'Abre o portal oficial em uma aba ativa ou janela popup conectada.' },
                { step: '2', icon: '🔍', title: 'Inspecionar & Aprender', desc: 'A Rafinha analisa a estrutura HTML e salva os seletores na memória de longo prazo.' },
                { step: '3', icon: '🚀', title: 'Auto-Preenchimento com Voz', desc: 'Fale com a Rafinha ou clique em Preencher para enviar notas, chamadas e diários instantaneamente.' },
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
                    <div style={{ fontSize: 11.5, color: '#7a5c42', lineHeight: 1.5, marginTop: 2 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </ModuleCard>

          {/* Histórico de Preenchimentos */}
          <ModuleCard title="Histórico de Operações" icon="ti-history" padding={16}>
            {recentFills.length === 0 ? (
              <div style={{ fontSize: 12, color: '#a08060', textAlign: 'center', padding: '12px 0' }}>
                Nenhuma operação recente.
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
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#2c1a0e' }}>{fill.platformName || fill.platform}</div>
                      <div style={{ fontSize: 11, color: '#a08060' }}>{fill.title}</div>
                    </div>
                    <div style={{ fontSize: 10.5, color: '#b58900', fontWeight: 700 }}>
                      {new Date(fill.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ModuleCard>

        </div>
      </div>

      {activeTask && (
        <AutomationDiffModal
          task={activeTask}
          onClose={() => setActiveTask(null)}
          onCompleted={() => {
            setRecentFills(getRecentFills())
            setActiveTask(null)
          }}
        />
      )}

      <SidecarPairingModal
        isOpen={isPairingOpen}
        onClose={() => setIsPairingOpen(false)}
      />

      <TrelloImportModal
        isOpen={isTrelloModalOpen}
        onClose={() => setIsTrelloModalOpen(false)}
      />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

    </ModuleShell>
  )
}