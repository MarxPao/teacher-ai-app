'use client'
import { toast, showConfirm } from '@/components/Toast'

import React, { useState, useEffect, useCallback } from 'react'
import ModuleShell from '@/components/ModuleShell'
import {
  getPortalProfiles,
  savePortalProfiles,
  upsertPortalProfile,
  deletePortalProfile,
  upsertPortalAction,
  deletePortalAction,
  resetDefaultPortals,
  PortalProfileDef,
  PortalActionDef
} from '@/lib/portalActionsEngine'
import { fillPortal, openPortal, getRecentFills, logPortalFill } from '@/lib/portalBridge'

export default function Extensions() {
  const [portals, setPortals] = useState<PortalProfileDef[]>([])
  const [selectedPortal, setSelectedPortal] = useState<PortalProfileDef | null>(null)
  const [activeTab, setActiveTab] = useState<'portals' | 'actions' | 'logs' | 'install'>('portals')
  const [globalMode, setGlobalMode] = useState<'supervised' | 'autonomous'>('supervised')

  // Modais de Criação / Edição
  const [isPortalModalOpen, setIsPortalModalOpen] = useState(false)
  const [editingPortal, setEditingPortal] = useState<PortalProfileDef | null>(null)
  const [portalFormName, setPortalFormName] = useState('')
  const [portalFormUrl, setPortalFormUrl] = useState('')
  const [portalFormCategory, setPortalFormCategory] = useState('Diário & Notas')
  const [portalFormDescription, setPortalFormDescription] = useState('')
  const [portalFormColor, setPortalFormColor] = useState('#8b5e3c')

  const [isActionModalOpen, setIsActionModalOpen] = useState(false)
  const [editingAction, setEditingAction] = useState<PortalActionDef | null>(null)
  const [actionFormTitle, setActionFormTitle] = useState('')
  const [actionFormType, setActionFormType] = useState<PortalActionDef['type']>('diary')
  const [actionFormDescription, setActionFormDescription] = useState('')
  const [actionFormMode, setActionFormMode] = useState<'supervised' | 'autonomous'>('supervised')
  const [actionFormConfirmation, setActionFormConfirmation] = useState('')

  // Logs recentes
  const [recentLogs, setRecentLogs] = useState<any[]>([])

  const loadData = useCallback(() => {
    const list = getPortalProfiles()
    setPortals(list)
    if (!selectedPortal && list.length > 0) {
      setSelectedPortal(list[0])
    }
    setRecentLogs(getRecentFills())
  }, [selectedPortal])

  useEffect(() => {
    loadData()
    const handleChanged = () => loadData()
    window.addEventListener('teacher:portals_changed', handleChanged)
    return () => window.removeEventListener('teacher:portals_changed', handleChanged)
  }, [loadData])

  // Abertura de Modal de Portal
  const openNewPortalModal = () => {
    setEditingPortal(null)
    setPortalFormName('')
    setPortalFormUrl('')
    setPortalFormCategory('Diário & Notas')
    setPortalFormDescription('')
    setPortalFormColor('#8b5e3c')
    setIsPortalModalOpen(true)
  }

  const openEditPortalModal = (p: PortalProfileDef) => {
    setEditingPortal(p)
    setPortalFormName(p.name)
    setPortalFormUrl(p.url)
    setPortalFormCategory(p.category)
    setPortalFormDescription(p.description)
    setPortalFormColor(p.color)
    setIsPortalModalOpen(true)
  }

  const handleSavePortal = (e: React.FormEvent) => {
    e.preventDefault()
    if (!portalFormName.trim() || !portalFormUrl.trim()) {
      toast.success('Preencha o nome e a URL do portal.')
      return
    }

    const id = editingPortal ? editingPortal.id : 'portal_' + Date.now()
    const matchUrl = portalFormUrl.replace(/^https?:\/\//, '').split('/')[0]

    const updatedProfile: PortalProfileDef = {
      id,
      name: portalFormName.trim(),
      shortName: portalFormName.trim().slice(0, 12),
      url: portalFormUrl.trim(),
      matchUrl,
      icon: 'ti-world',
      color: portalFormColor,
      bg: '#faf6f0',
      border: '#d5c8bb',
      category: portalFormCategory,
      description: portalFormDescription.trim() || 'Portal escolar configurado pelo professor',
      isCustom: true,
      actions: editingPortal ? editingPortal.actions : [
        {
          id: `${id}_diary`,
          title: 'Lançar Diário de Aula',
          type: 'diary',
          description: 'Preenche conteúdo e data da aula',
          executionMode: 'supervised',
          spokenConfirmation: `Diário preenchido com sucesso no ${portalFormName}!`,
          fields: [
            { fieldId: 'title', label: 'Título/Assunto', type: 'text', selectors: ['input[name*="titulo"]', 'input[placeholder*="Assunto"]'], semanticKeywords: ['titulo', 'assunto'], description: 'Tema' },
            { fieldId: 'date', label: 'Data', type: 'date', selectors: ['input[type="date"]', 'input[name*="data"]'], semanticKeywords: ['data'], description: 'Data' },
            { fieldId: 'description', label: 'Conteúdo', type: 'textarea', selectors: ['textarea', 'div[contenteditable="true"]'], semanticKeywords: ['conteudo', 'descricao'], description: 'Descrição' }
          ]
        }
      ]
    }

    upsertPortalProfile(updatedProfile)
    setSelectedPortal(updatedProfile)
    setIsPortalModalOpen(false)
  }

  // Abertura de Modal de Ação
  const openNewActionModal = () => {
    setEditingAction(null)
    setActionFormTitle('')
    setActionFormType('diary')
    setActionFormDescription('')
    setActionFormMode('supervised')
    setActionFormConfirmation('')
    setIsActionModalOpen(true)
  }

  const openEditActionModal = (action: PortalActionDef) => {
    setEditingAction(action)
    setActionFormTitle(action.title)
    setActionFormType(action.type)
    setActionFormDescription(action.description)
    setActionFormMode('supervised')
    setActionFormConfirmation(action.spokenConfirmation)
    setIsActionModalOpen(true)
  }

  const handleSaveAction = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPortal || !actionFormTitle.trim()) {
      toast.success('Informe um título para a ação.')
      return
    }

    const actionId = editingAction ? editingAction.id : `act_${Date.now()}`
    const updatedAction: PortalActionDef = {
      id: actionId,
      title: actionFormTitle.trim(),
      type: actionFormType,
      description: actionFormDescription.trim() || 'Ação operacional agêntica',
      executionMode: 'supervised',
      spokenConfirmation: actionFormConfirmation.trim() || `${actionFormTitle} executada com sucesso!`,
      isCustom: true,
      fields: editingAction ? editingAction.fields : [
        { fieldId: 'title', label: 'Título', type: 'text', selectors: ['input[name*="titulo"]'], semanticKeywords: ['titulo', 'tema'], description: 'Campo de Título' },
        { fieldId: 'description', label: 'Texto/Conteúdo', type: 'textarea', selectors: ['textarea'], semanticKeywords: ['descricao', 'conteudo'], description: 'Corpo da Ação' }
      ]
    }

    upsertPortalAction(selectedPortal.id, updatedAction)
    setIsActionModalOpen(false)
    loadData()
  }

  // Teste de Execução da Ação com a Extensão
  const handleTestAction = async (portal: PortalProfileDef, action: PortalActionDef) => {
    const payload = {
      platform: portal.id,
      actionType: action.type,
      title: `Aula de Demonstração: Present Perfect (${action.title})`,
      date: new Date().toISOString().split('T')[0],
      classRef: '9º Ano A',
      description: 'Revisão estrutural de Present Perfect com foco em fluência e prática oral.',
      mode: action.executionMode || globalMode
    }

    logPortalFill(payload as any)
    const res = await fillPortal(payload as any)
    if (res.success) {
      toast.success(`✅ Sucesso!\n${res.message || 'Ação enviada para a aba do portal via Extensão da Rafinha.'}`)
    } else {
      toast.success(`⚠️ Aviso da Extensão:\n${res.error}\n\nCertifique-se de que a aba do portal "${portal.name}" está aberta no seu Google Chrome.`)
    }
    loadData()
  }

  const cardStyle: React.CSSProperties = {
    background: '#ffffff',
    border: '1px solid #e7dfd5',
    borderRadius: 16,
    padding: '20px',
    boxShadow: '0 2px 10px rgba(44, 26, 14, 0.03)',
  }

  return (
    <ModuleShell
      title="Portais Escolares & Automação com a Rafinha"
      subtitle="Estúdio agêntico para interação autônoma ou supervisionada em sites e portais oficiais"
      actions={
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Seletor Global de Modo */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#fdf8f2',
            padding: '6px 14px',
            borderRadius: 10,
            border: '1.5px solid #cb4b16'
          }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#cb4b16' }}>🛡️ Segurança 0-Tester:</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#2c1a0e' }}>
              🎛️ Modo Supervisionado Obrigatório (A IA preenche visualmente no portal e aguarda seu clique em Salvar)
            </span>
          </div>

          <button
            onClick={openNewPortalModal}
            style={{
              background: '#8b5e3c',
              color: '#fff',
              border: 'none',
              padding: '9px 16px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <i className="ti-plus" /> + Cadastrar Portal
          </button>
        </div>
      }
    >
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>

        {/* ─── BANNER EXECUTIVO COM STATUS DA EXTENSÃO ──────────────────────── */}
        <div style={{
          ...cardStyle,
          background: 'linear-gradient(135deg, #2c1a0e 0%, #4a2e18 100%)',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#16a34a', boxShadow: '0 0 10px #16a34a' }} />
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#fef3c7' }}>
                Rafinha Web Operator (Driver Chrome Ativo)
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#e7dfd5', maxWidth: 680 }}>
              A Rafinha opera nas abas autenticadas do seu navegador sem armazenar senhas. Ela pode lançar diários, preencher chamadas e subir notas por comando de voz no estilo Alexa.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setActiveTab('install')}
              style={{
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.3)',
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <i className="ti-download" /> Instruções da Extensão
            </button>
          </div>
        </div>

        {/* ─── ABAS DE NAVEGAÇÃO ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, borderBottom: '2px solid #e7dfd5' }}>
          {[
            { key: 'portals', label: `🏛️ Portais & Escolas (${portals.length})`, icon: 'ti-world' },
            { key: 'actions', label: '⚡ Estúdio de Ações da Rafinha', icon: 'ti-wand' },
            { key: 'logs', label: `📋 Histórico de Operações (${recentLogs.length})`, icon: 'ti-receipt' },
            { key: 'install', label: '📦 Extensão Chrome MV3', icon: 'ti-plug' },
          ].map(tab => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                style={{
                  padding: '11px 18px',
                  borderRadius: '10px 10px 0 0',
                  border: 'none',
                  background: isActive ? '#ffffff' : 'transparent',
                  color: isActive ? '#8b5e3c' : '#665c54',
                  fontWeight: isActive ? 800 : 600,
                  fontSize: 13.5,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  borderBottom: isActive ? '3px solid #8b5e3c' : '3px solid transparent',
                  boxShadow: isActive ? '0 -2px 10px rgba(0,0,0,0.03)' : 'none'
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* ─── ABA 1: CATÁLOGO DE PORTAIS ESCOLARES ─────────────────────────── */}
        {activeTab === 'portals' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
            {portals.map(p => (
              <div
                key={p.id}
                style={{
                  ...cardStyle,
                  borderTop: `5px solid ${p.color}`,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 14
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#2c1a0e' }}>{p.name}</h4>
                        {p.isCustom && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#e0e7ff', color: '#3730a3' }}>Custom</span>
                        )}
                      </div>
                      <span style={{ fontSize: 11.5, color: '#665c54', fontWeight: 600 }}>{p.category}</span>
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => openEditPortalModal(p)}
                        title="Editar Portal"
                        style={{ background: '#faf6f0', border: '1px solid #d5c8bb', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}
                      >
                        ✏️
                      </button>
                      {p.isCustom && (
                        <button
                          onClick={async () => {
                            if ((await showConfirm({ message: `Remover portal ${p.name}?` }))) deletePortalProfile(p.id)
                          }}
                          title="Remover"
                          style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer', color: '#dc2626' }}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>

                  <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#665c54', lineHeight: 1.4 }}>
                    {p.description}
                  </p>

                  {/* Ações disponíveis no portal */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#8b5e3c', textTransform: 'uppercase' }}>
                      Ações Prontas ({p.actions.length}):
                    </span>
                    {p.actions.map(act => (
                      <div key={act.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#faf6f0', padding: '6px 10px', borderRadius: 6, fontSize: 12 }}>
                        <span style={{ fontWeight: 600, color: '#2c1a0e' }}>⚡ {act.title}</span>
                        <button
                          onClick={() => handleTestAction(p, act)}
                          style={{ background: '#8b5e3c', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Executar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, paddingTop: 10, borderTop: '1px solid #e7dfd5' }}>
                  <button
                    onClick={() => openPortal(p.id)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #8b5e3c',
                      background: '#fff',
                      color: '#8b5e3c',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <i className="ti-arrow-top-right" /> Abrir Portal
                  </button>

                  <button
                    onClick={async () => {
                      setSelectedPortal(p)
                      setActiveTab('actions')
                    }}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#8b5e3c',
                      color: '#fff',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Estúdio de Ações
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── ABA 2: ESTÚDIO DE AÇÕES EDITÁVEIS DA RAFINHA ──────────────────── */}
        {activeTab === 'actions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#665c54' }}>Portal Selecionado:</span>
                <select
                  value={selectedPortal?.id || ''}
                  onChange={e => {
                    const found = portals.find(p => p.id === e.target.value)
                    if (found) setSelectedPortal(found)
                  }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid #d5c8bb',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#2c1a0e',
                    background: '#fff',
                    outline: 'none'
                  }}
                >
                  {portals.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={openNewActionModal}
                style={{
                  background: '#8b5e3c',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <i className="ti-plus" /> + Nova Ação Agêntica
              </button>
            </div>

            {selectedPortal && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
                {selectedPortal.actions.map(action => (
                  <div key={action.id} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
                            {action.title}
                          </h4>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#8b5e3c', textTransform: 'uppercase' }}>
                            Tipo: {action.type} · Modo: 🎛️ Supervisionado (Preenchimento Visual)
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => openEditActionModal(action)}
                            title="Editar Ação"
                            style={{ background: '#faf6f0', border: '1px solid #d5c8bb', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}
                          >
                            ✏️
                          </button>
                          {action.isCustom && (
                            <button
                              onClick={async () => {
                                if ((await showConfirm({ message: `Remover ação "${action.title}"?` }))) {
                                  deletePortalAction(selectedPortal.id, action.id)
                                  loadData()
                                }
                              }}
                              style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer', color: '#dc2626' }}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>

                      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#665c54' }}>
                        {action.description}
                      </p>

                      <div style={{ background: '#faf6f0', padding: '8px 10px', borderRadius: 8, fontSize: 12, color: '#2c1a0e', marginBottom: 8 }}>
                        🗣️ <strong>Resposta de Voz:</strong> <em>"{action.spokenConfirmation}"</em>
                      </div>

                      <div style={{ fontSize: 11.5, color: '#665c54' }}>
                        <strong>Campos Mapeados:</strong> {action.fields.map(f => f.label).join(', ')}
                      </div>
                    </div>

                    <button
                      onClick={() => handleTestAction(selectedPortal, action)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: 'none',
                        background: '#8b5e3c',
                        color: '#fff',
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      <i className="ti-bolt" /> Testar Execução no Portal
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── ABA 3: HISTÓRICO DE OPERAÇÕES ────────────────────────────────── */}
        {activeTab === 'logs' && (
          <div style={cardStyle}>
            <h4 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 800, color: '#2c1a0e' }}>
              Registro de Ações Agênticas Executadas pela Rafinha
            </h4>

            {recentLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: '#665c54', fontSize: 13 }}>
                Nenhuma ação registrada ainda. Execute uma ação ou fale com a Rafinha.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentLogs.map((log, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#faf6f0', padding: '10px 14px', borderRadius: 8, fontSize: 12.5 }}>
                    <div>
                      <span style={{ fontWeight: 800, color: '#2c1a0e' }}>{log.platformName || log.platform}</span> · 
                      <span style={{ color: '#8b5e3c', fontWeight: 600 }}> {log.title}</span>
                      <div style={{ fontSize: 11, color: '#665c54' }}>
                        Turma: {log.classRef || 'Geral'} · Modo: {log.mode || 'Supervisionado'}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: '#665c54' }}>
                      {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── ABA 4: INSTALAÇÃO DA EXTENSÃO CHROME ──────────────────────────── */}
        {activeTab === 'install' && (
          <div style={cardStyle}>
            <h4 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800, color: '#2c1a0e' }}>
              Como Instalar a Extensão da Rafinha no Google Chrome
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { step: '1', title: 'Abra a tela de extensões no Chrome', desc: 'Digite chrome://extensions no seu navegador Chrome.' },
                { step: '2', title: 'Ative o "Modo do desenvolvedor"', desc: 'Fica no canto superior direito da página do Chrome.' },
                { step: '3', title: 'Clique em "Carregar sem compactação"', desc: 'Selecione a pasta onde está a extensão: C:\\Users\\rafae\\.gemini\\antigravity\\scratch\\teacher-extension' },
                { step: '4', title: 'Pronto!', desc: 'O ícone da Rafinha aparecerá no seu Chrome e estará conectado ao Teacher AI!' }
              ].map(item => (
                <div key={item.step} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', background: '#faf6f0', padding: '12px 16px', borderRadius: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#8b5e3c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                    {item.step}
                  </div>
                  <div>
                    <h5 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#2c1a0e' }}>{item.title}</h5>
                    <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#665c54' }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── MODAL DE CADASTRO/EDIÇÃO DE PORTAL ────────────────────────────── */}
        {isPortalModalOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
            <div style={{ background: '#fff', borderRadius: 16, maxWidth: 540, width: '100%', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
              <div style={{ padding: '16px 20px', background: '#2c1a0e', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                  {editingPortal ? '✏️ Editar Portal Escolar' : '✨ Cadastrar Novo Portal Escolar'}
                </h3>
                <button onClick={() => setIsPortalModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
              </div>

              <form onSubmit={handleSavePortal} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>Nome do Portal/Escola: *</label>
                  <input
                    type="text"
                    required
                    value={portalFormName}
                    onChange={e => setPortalFormName(e.target.value)}
                    placeholder="Ex: SED - Secretaria Digital, SIGE, i-Educar..."
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d5c8bb', fontSize: 13, outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>URL Base do Portal: *</label>
                  <input
                    type="url"
                    required
                    value={portalFormUrl}
                    onChange={e => setPortalFormUrl(e.target.value)}
                    placeholder="https://portalescolar.exemplo.com.br/login"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d5c8bb', fontSize: 13, outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>Categoria:</label>
                    <select
                      value={portalFormCategory}
                      onChange={e => setPortalFormCategory(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d5c8bb', fontSize: 13, outline: 'none' }}
                    >
                      <option value="Diário & Notas">Diário & Notas</option>
                      <option value="Portal Acadêmico">Portal Acadêmico</option>
                      <option value="LMS & Tarefas">LMS & Tarefas</option>
                      <option value="Secretaria Digital">Secretaria Digital</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>Cor de Destaque:</label>
                    <select
                      value={portalFormColor}
                      onChange={e => setPortalFormColor(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d5c8bb', fontSize: 13, outline: 'none' }}
                    >
                      <option value="#8b5e3c">🟤 Bronze (#8b5e3c)</option>
                      <option value="#16a34a">🟢 Verde (#16a34a)</option>
                      <option value="#0284c7">🔵 Azul (#0284c7)</option>
                      <option value="#d97706">🟠 Âmbar (#d97706)</option>
                      <option value="#dc2626">🔴 Vermelho (#dc2626)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>Descrição:</label>
                  <input
                    type="text"
                    value={portalFormDescription}
                    onChange={e => setPortalFormDescription(e.target.value)}
                    placeholder="Ex: Portal de lançamento de pautas e diários"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d5c8bb', fontSize: 13, outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                  <button type="button" onClick={() => setIsPortalModalOpen(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#fff', fontSize: 12.5, cursor: 'pointer' }}>
                    Cancelar
                  </button>
                  <button type="submit" style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#8b5e3c', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    Salvar Portal
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─── MODAL DE CADASTRO/EDIÇÃO DE AÇÃO ──────────────────────────────── */}
        {isActionModalOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
            <div style={{ background: '#fff', borderRadius: 16, maxWidth: 540, width: '100%', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
              <div style={{ padding: '16px 20px', background: '#2c1a0e', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                  {editingAction ? '✏️ Editar Ação Agêntica' : '✨ Criar Nova Ação para o Portal'}
                </h3>
                <button onClick={() => setIsActionModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
              </div>

              <form onSubmit={handleSaveAction} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>Nome da Ação: *</label>
                  <input
                    type="text"
                    required
                    value={actionFormTitle}
                    onChange={e => setActionFormTitle(e.target.value)}
                    placeholder="Ex: Lançar Pauta BNCC, Registrar Faltas, Subir Notas de Redação..."
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d5c8bb', fontSize: 13, outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>Tipo de Operação:</label>
                    <select
                      value={actionFormType}
                      onChange={e => setActionFormType(e.target.value as any)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d5c8bb', fontSize: 13, outline: 'none' }}
                    >
                      <option value="diary">📝 Diário de Classe</option>
                      <option value="attendance">📋 Chamada / Frequência</option>
                      <option value="grades">📊 Lançamento de Notas</option>
                      <option value="assignment">🎯 Criar Tarefa / Atividade</option>
                      <option value="communication">✉️ Comunicado / Recado</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>Modo de Execução:</label>
                    <select
                      value="supervised"
                      disabled
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d5c8bb', fontSize: 13, outline: 'none', background: '#f5f0eb', color: '#7a5c42' }}
                    >
                      <option value="supervised">🎛️ Supervisionado (Preenche e aguarda seu clique)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>Descrição / Instrução:</label>
                  <input
                    type="text"
                    value={actionFormDescription}
                    onChange={e => setActionFormDescription(e.target.value)}
                    placeholder="Ex: Preenche o conteúdo programático e a data da aula"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d5c8bb', fontSize: 13, outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>Resposta Falada da Rafinha (TTS):</label>
                  <input
                    type="text"
                    value={actionFormConfirmation}
                    onChange={e => setActionFormConfirmation(e.target.value)}
                    placeholder="Ex: Diário preenchido com sucesso no portal!"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d5c8bb', fontSize: 13, outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                  <button type="button" onClick={() => setIsActionModalOpen(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#fff', fontSize: 12.5, cursor: 'pointer' }}>
                    Cancelar
                  </button>
                  <button type="submit" style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#8b5e3c', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    Salvar Ação
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </ModuleShell>
  )
}
