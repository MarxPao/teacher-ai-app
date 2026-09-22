'use client'

import React, { useState } from 'react'
import { COLOR, RADIUS, SHADOW, TRANSITION } from '@/styles/tokens'
import { toast, showConfirm } from '@/components/Toast'
import { getValidAccessToken } from '@/lib/supabaseAuth'

export interface PortalSkillItem {
  id: string
  task_id: string
  task_name: string
  description: string
  statusBadge: 'never_executed' | 'proven' | 'failing'
  statusLabel: string
  lastExecutedAt: string | null
  lastStatus: string | null
  lastVerified: boolean | null
  lastMethod: string | null
  lastError: string | null
  executionsCount: number
}

export interface PortalHistoryItem {
  id: string
  executed_at: string
  task_name: string
  skill_id: string
  status: string
  verified: boolean
  statusBadge: 'verified_dom' | 'unverified_success' | 'failed'
  statusLabel: string
  verification_method: string
  duration_seconds: number
  source: string
  error_details: string | null
}

export interface PortalData {
  id: string
  name: string
  domain: string
  url: string
  category: string
  color: string
  isMapped: boolean
  mappingStrategy: string | null
  mappingDetails?: {
    strategy: string | null
    selectorsCount: number
    lastValidatedAt: string | null
    confidence: string
  } | null
  totalSkills: number
  provenSkillsCount: number
  unprovenOrBrokenSkillsCount: number
  skills: PortalSkillItem[]
  history: PortalHistoryItem[]
}

interface PortalDetailsModalProps {
  portal: PortalData
  isOpen: boolean
  onClose: () => void
  onRefresh: () => void
}

export default function PortalDetailsModal({
  portal,
  isOpen,
  onClose,
  onRefresh,
}: PortalDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<'history' | 'skills'>('history')
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null)
  const [executingSkillId, setExecutingSkillId] = useState<string | null>(null)
  const [deletingSkillId, setDeletingSkillId] = useState<string | null>(null)

  if (!isOpen) return null

  // Formatação de data/hora local
  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return 'Nunca executada'
    try {
      const d = new Date(isoString)
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return isoString
    }
  }

  // Executar skill diretamente (Ação direta do Item 3)
  const handleExecuteSkill = async (skill: PortalSkillItem) => {
    setExecutingSkillId(skill.id)
    try {
      const res = await fetch('/api/skills/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill_id: skill.id,
          portal_id: portal.id,
          task_name: skill.task_name,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const exec = data.execution
      if (exec.status === 'COMPLETED' && exec.verified) {
        toast.success(`✅ Skill "${skill.task_name}" executada e comprovada no DOM com sucesso!`)
      } else if (exec.status === 'COMPLETED' && !exec.verified) {
        toast.info(`⚠️ Skill "${skill.task_name}" concluída sem verificação no DOM.`)
      } else {
        toast.error(`❌ Falha na execução da skill: ${exec.error_details || 'Erro no portal'}`)
      }

      onRefresh()
    } catch (err: any) {
      toast.error(`Erro ao disparar execução: ${err.message}`)
    } finally {
      setExecutingSkillId(null)
    }
  }

  // Excluir skill do cadastro
  const handleDeleteSkill = async (skill: PortalSkillItem) => {
    const confirmed = await showConfirm({
      message: `Tem certeza que deseja excluir a skill "${skill.task_name}" do portal "${portal.name}"? Essa ação removerá o fluxo cadastrado do Supabase e do disco.`,
    })
    if (!confirmed) return

    setDeletingSkillId(skill.id)
    try {
      const token = await getValidAccessToken()
      const res = await fetch(`/api/skills?id=${encodeURIComponent(skill.id)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      toast.success(`Skill "${skill.task_name}" excluída com sucesso!`)
      onRefresh()
    } catch (err: any) {
      toast.error(`Falha ao excluir a skill: ${err.message}`)
    } finally {
      setDeletingSkillId(null)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: RADIUS.xl,
          width: '100%',
          maxWidth: 820,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: SHADOW.lg,
          border: '1.5px solid #e7dfd5',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ─── CABEÇALHO DO MODAL ────────────────────────────────────────── */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1.5px solid #e7dfd5',
            background: '#faf6f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: RADIUS.md,
                background: '#ffffff',
                border: '1.5px solid #d5c8bb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: portal.color || '#8b5e3c',
                fontSize: 24,
              }}
            >
              <i className="ti ti-school" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
                  {portal.name}
                </h2>
                {/* Badge de Mapeamento */}
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: portal.isMapped ? '#f0fdf4' : '#f5f5f4',
                    border: `1px solid ${portal.isMapped ? '#bbf7d0' : '#d6d3d1'}`,
                    color: portal.isMapped ? '#16a34a' : '#78716c',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <i className={`ti ${portal.isMapped ? 'ti-check' : 'ti-x'}`} />
                  {portal.isMapped ? `Mapeado (${portal.mappingStrategy || 'layout auto'})` : 'Não mapeado'}
                </span>
              </div>
              <span style={{ fontSize: 12, color: '#78716c' }}>
                {portal.domain} • {portal.category}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Fechar modal"
            style={{
              background: '#ffffff',
              border: '1px solid #d5c8bb',
              borderRadius: RADIUS.md,
              width: 34,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#665c54',
              fontSize: 18,
              transition: TRANSITION.fast,
            }}
          >
            <i className="ti ti-x" />
          </button>
        </div>

        {/* ─── ABAS DE NAVEGAÇÃO INTERNA ─────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            padding: '12px 24px 0',
            borderBottom: '1px solid #e7dfd5',
            background: '#ffffff',
            gap: 12,
          }}
        >
          <button
            onClick={() => setActiveTab('history')}
            style={{
              padding: '10px 16px',
              borderBottom: activeTab === 'history' ? '2.5px solid #8b5e3c' : '2.5px solid transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              background: 'transparent',
              color: activeTab === 'history' ? '#8b5e3c' : '#78716c',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: TRANSITION.fast,
            }}
          >
            <i className="ti ti-history" />
            Histórico de Ações ({portal.history.length})
          </button>

          <button
            onClick={() => setActiveTab('skills')}
            style={{
              padding: '10px 16px',
              borderBottom: activeTab === 'skills' ? '2.5px solid #8b5e3c' : '2.5px solid transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              background: 'transparent',
              color: activeTab === 'skills' ? '#8b5e3c' : '#78716c',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: TRANSITION.fast,
            }}
          >
            <i className="ti ti-sparkles" />
            Skills do Portal ({portal.skills.length})
          </button>
        </div>

        {/* ─── CONTEÚDO SCROLLÁVEL ───────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: '#fdfbf7' }}>
          {/* ════════ SEÇÃO A: HISTÓRICO DE AÇÕES ════════ */}
          {activeTab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#78716c', textTransform: 'uppercase' }}>
                  Auditoria de Execuções Reais (Ordem Cronológica Reversa)
                </span>
                <span style={{ fontSize: 11, color: '#a8a29e' }}>
                  Fonte: Supabase <code>skill_execution_log</code>
                </span>
              </div>

              {portal.history.length === 0 ? (
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px dashed #d5c8bb',
                    borderRadius: RADIUS.lg,
                    padding: '36px 20px',
                    textAlign: 'center',
                    color: '#78716c',
                  }}
                >
                  <i className="ti ti-clock-pause" style={{ fontSize: 32, color: '#d5c8bb', marginBottom: 8, display: 'block' }} />
                  <div style={{ fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>
                    Nenhuma execução registrada para este portal
                  </div>
                  <div style={{ fontSize: 12, color: '#8c7e73', maxWidth: 440, margin: '0 auto' }}>
                    Ao disparar uma skill via extensão Chrome ou pelo botão &quot;Executar agora&quot;, o resultado real e o método de verificação aparecerão aqui.
                  </div>
                </div>
              ) : (
                portal.history.map(item => {
                  const isErrorExpanded = expandedErrorId === item.id
                  const hasError = Boolean(item.error_details)

                  // Definição de cores do badge conforme especificação do Item 3
                  let badgeBg = '#f0fdf4'
                  let badgeColor = '#16a34a'
                  let badgeBorder = '#bbf7d0'
                  let badgeIcon = 'ti-shield-check'

                  if (item.statusBadge === 'unverified_success') {
                    badgeBg = '#fffbeb'
                    badgeColor = '#b45309'
                    badgeBorder = '#fde68a'
                    badgeIcon = 'ti-clock'
                  } else if (item.statusBadge === 'failed') {
                    badgeBg = '#fef2f2'
                    badgeColor = '#dc2626'
                    badgeBorder = '#fecaca'
                    badgeIcon = 'ti-alert-circle'
                  }

                  return (
                    <div
                      key={item.id}
                      style={{
                        background: '#ffffff',
                        border: '1.5px solid #e7dfd5',
                        borderRadius: RADIUS.md,
                        padding: '14px 18px',
                        boxShadow: SHADOW.sm,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 800, fontSize: 14, color: '#2c1a0e' }}>
                              {item.task_name}
                            </span>
                            {/* Badge de Status Real (Item 3) */}
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: badgeBg,
                                color: badgeColor,
                                border: `1px solid ${badgeBorder}`,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <i className={`ti ${badgeIcon}`} />
                              {item.statusLabel}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: '#78716c', marginTop: 4 }}>
                            {formatDateTime(item.executed_at)} • ID: <code>{item.skill_id}</code>
                          </div>
                        </div>

                        {/* Metadados: Duração e Fonte */}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span
                            title="Método de verificação"
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: '#faf6f0',
                              color: '#8b5e3c',
                              border: '1px solid #e7dfd5',
                            }}
                          >
                            <i className="ti ti-code" style={{ marginRight: 3 }} />
                            {item.verification_method}
                          </span>

                          <span
                            title="Duração da execução"
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: '#faf6f0',
                              color: '#665c54',
                              border: '1px solid #e7dfd5',
                            }}
                          >
                            <i className="ti ti-stopwatch" style={{ marginRight: 3 }} />
                            {item.duration_seconds}s
                          </span>

                          <span
                            title="Fonte da execução"
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: item.source === 'Sidecar' ? '#eff6ff' : '#faf6f0',
                              color: item.source === 'Sidecar' ? '#2563eb' : '#665c54',
                              border: `1px solid ${item.source === 'Sidecar' ? '#bfdbfe' : '#e7dfd5'}`,
                            }}
                          >
                            <i className="ti ti-device-laptop" style={{ marginRight: 3 }} />
                            {item.source}
                          </span>
                        </div>
                      </div>

                      {/* Motivo da Falha / Detalhe Expansível (Item 3) */}
                      {hasError && (
                        <div style={{ borderTop: '1px solid #f2ede4', paddingTop: 8 }}>
                          <button
                            onClick={() => setExpandedErrorId(isErrorExpanded ? null : item.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#dc2626',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                              padding: 0,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <i className={`ti ${isErrorExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}`} />
                            {isErrorExpanded ? 'Ocultar motivo da falha' : 'Ver motivo da falha no DOM'}
                          </button>

                          {isErrorExpanded && (
                            <div
                              style={{
                                marginTop: 8,
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                borderRadius: RADIUS.sm,
                                padding: '10px 12px',
                                fontSize: 12,
                                color: '#991b1b',
                                fontFamily: 'monospace',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}
                            >
                              {item.error_details}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* ════════ SEÇÃO B: SKILLS DO PORTAL ════════ */}
          {activeTab === 'skills' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#78716c', textTransform: 'uppercase' }}>
                  Skills Cadastradas & Honestidade de Execução (Regra do Item 4)
                </span>
                <span style={{ fontSize: 11, color: '#a8a29e' }}>
                  Total: {portal.skills.length}
                </span>
              </div>

              {portal.skills.length === 0 ? (
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px dashed #d5c8bb',
                    borderRadius: RADIUS.lg,
                    padding: '36px 20px',
                    textAlign: 'center',
                    color: '#78716c',
                  }}
                >
                  <i className="ti ti-sparkles" style={{ fontSize: 32, color: '#d5c8bb', marginBottom: 8, display: 'block' }} />
                  <div style={{ fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>
                    Nenhuma skill cadastrada para este portal
                  </div>
                  <div style={{ fontSize: 12, color: '#8c7e73', maxWidth: 440, margin: '0 auto' }}>
                    Abra o portal no navegador com a extensão Chrome ativada e grave um trajeto de automação ou leitura para este portal.
                  </div>
                </div>
              ) : (
                portal.skills.map(skill => {
                  const isExecuting = executingSkillId === skill.id
                  const isDeleting = deletingSkillId === skill.id

                  // Badge honesto do Item 4:
                  // - 'never_executed' => cinza/neutro (NUNCA verde)
                  // - 'proven' => verde
                  // - 'failing' => vermelho
                  let badgeBg = '#f5f5f4'
                  let badgeColor = '#78716c'
                  let badgeBorder = '#d6d3d1'
                  let badgeIcon = 'ti-minus'

                  if (skill.statusBadge === 'proven') {
                    badgeBg = '#f0fdf4'
                    badgeColor = '#16a34a'
                    badgeBorder = '#bbf7d0'
                    badgeIcon = 'ti-shield-check'
                  } else if (skill.statusBadge === 'failing') {
                    badgeBg = '#fef2f2'
                    badgeColor = '#dc2626'
                    badgeBorder = '#fecaca'
                    badgeIcon = 'ti-alert-triangle'
                  }

                  return (
                    <div
                      key={skill.id}
                      style={{
                        background: '#ffffff',
                        border: '1.5px solid #e7dfd5',
                        borderRadius: RADIUS.md,
                        padding: '16px 20px',
                        boxShadow: SHADOW.sm,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                        <div style={{ maxWidth: 500 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 800, fontSize: 15, color: '#2c1a0e' }}>
                              {skill.task_name}
                            </span>
                            {/* Badge Honesto Obrigatório (Item 4) */}
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: badgeBg,
                                color: badgeColor,
                                border: `1px solid ${badgeBorder}`,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <i className={`ti ${badgeIcon}`} />
                              {skill.statusLabel}
                            </span>
                          </div>

                          <div style={{ fontSize: 11, color: '#78716c', marginTop: 3 }}>
                            ID: <code>{skill.task_id || skill.id}</code>
                          </div>

                          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#57534e', lineHeight: 1.4 }}>
                            {skill.description}
                          </p>
                        </div>

                        {/* Botões de Ação da Skill (Item 3) */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button
                            onClick={() => handleExecuteSkill(skill)}
                            disabled={isExecuting || isDeleting}
                            style={{
                              background: '#8b5e3c',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: RADIUS.md,
                              padding: '8px 14px',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: isExecuting ? 'wait' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              opacity: isExecuting ? 0.7 : 1,
                              transition: TRANSITION.fast,
                            }}
                          >
                            <i className={isExecuting ? 'ti ti-loader' : 'ti ti-player-play'} />
                            {isExecuting ? 'Executando...' : 'Executar agora'}
                          </button>

                          <button
                            onClick={() => handleDeleteSkill(skill)}
                            disabled={isExecuting || isDeleting}
                            title="Excluir skill do cadastro"
                            style={{
                              background: '#ffffff',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              borderRadius: RADIUS.md,
                              padding: '8px 10px',
                              fontSize: 13,
                              cursor: isDeleting ? 'wait' : 'pointer',
                              transition: TRANSITION.fast,
                            }}
                          >
                            <i className={isDeleting ? 'ti ti-loader' : 'ti ti-trash'} />
                          </button>
                        </div>
                      </div>

                      {/* Informações de Execução e Erro */}
                      <div
                        style={{
                          background: '#faf6f0',
                          borderRadius: RADIUS.sm,
                          padding: '8px 12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: 11,
                          color: '#665c54',
                          flexWrap: 'wrap',
                          gap: 6,
                        }}
                      >
                        <div>
                          <strong>Última Execução:</strong> {formatDateTime(skill.lastExecutedAt)}
                        </div>

                        {skill.lastError && (
                          <div style={{ color: '#dc2626', fontWeight: 600, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={skill.lastError}>
                            ⚠️ {skill.lastError}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* ─── RODAPÉ DO MODAL ──────────────────────────────────────────── */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1.5px solid #e7dfd5',
            background: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 12, color: '#78716c' }}>
            <span style={{ color: '#16a34a', fontWeight: 700 }}>● {portal.provenSkillsCount} comprovadas</span>
            <span style={{ margin: '0 8px' }}>•</span>
            <span style={{ color: '#78716c', fontWeight: 700 }}>● {portal.unprovenOrBrokenSkillsCount} não comprovadas ou quebradas</span>
          </div>

          <button
            onClick={onClose}
            style={{
              background: '#2c1a0e',
              color: '#ffffff',
              border: 'none',
              borderRadius: RADIUS.md,
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
