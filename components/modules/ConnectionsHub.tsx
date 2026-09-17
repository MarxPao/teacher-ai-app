'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { COLOR, TEXT, RADIUS, BORDER, SHADOW, TRANSITION } from '@/styles/tokens'
import { toast } from '@/components/Toast'
import {
  listConnectors,
  getConnector,
  syncConnectorsFromStorage,
  initConnectorEngine,
  invokeCapability,
  type Connector,
  type ConnectorTier,
} from '@/lib/connectorEngine'
import {
  listPortalConnections,
  getPortalConnection,
  upsertConnection,
  validateConnection,
  type PortalConnection,
} from '@/lib/portalConnectionService'
import {
  isTrelloConnected,
  getTrelloConfig,
  clearTrelloConfig,
} from '@/lib/trelloClient'
import {
  getTelemetryMetrics,
  clearTelemetry,
  type TelemetryMetrics,
} from '@/lib/connectorTelemetry'
import PortalConnectionWizardModal from '@/components/modules/PortalConnectionWizardModal'
import RosterReconciliationModal from '@/components/modules/RosterReconciliationModal'
import { type RosterReconciliationResult, reconcileRosterBatch } from '@/lib/rosterReconciler'
import PortalCard from '@/components/modules/PortalCard'
import PortalDetailsModal, { type PortalData } from '@/components/modules/PortalDetailsModal'

export interface ConnectionsHubProps {
  embedded?: boolean
  initialTab?: 'connections' | 'actions' | 'logs'
  onNavigateToAiSettings?: () => void
}

export default function ConnectionsHub({
  embedded = false,
  initialTab = 'connections',
  onNavigateToAiSettings,
}: ConnectionsHubProps) {
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [filterTier, setFilterTier] = useState<'all' | 'portal' | 'api'>('all')
  const [activeTab, setActiveTab] = useState<'connections' | 'actions' | 'logs'>(initialTab)
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [wizardInitialTier, setWizardInitialTier] = useState<ConnectorTier>('agentic_browser')
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [showTelemetry, setShowTelemetry] = useState(false)
  const [telemetryMetrics, setTelemetryMetrics] = useState<TelemetryMetrics | null>(null)

  // Portais Escolares com Status Honesto (Itens 2, 3 e 4)
  const [portalsStatus, setPortalsStatus] = useState<PortalData[]>([])
  const [selectedPortalModal, setSelectedPortalModal] = useState<PortalData | null>(null)
  const [loadingPortals, setLoadingPortals] = useState(false)

  // Reconciliação de Alunos
  const [reconcileData, setReconcileData] = useState<{
    portalName: string
    classRef: string
    result: RosterReconciliationResult
  } | null>(null)

  // Carrega e sincroniza todos os conectores
  const refreshConnectors = useCallback(async () => {
    await initConnectorEngine()
    const all = listConnectors()
    setConnectors(all)
  }, [])

  // Carrega status honesto dos portais escolares
  const refreshPortalsStatus = useCallback(async () => {
    setLoadingPortals(true)
    try {
      const res = await fetch('/api/portals/status')
      if (res.ok) {
        const data = await res.json()
        if (data.portals) {
          setPortalsStatus(data.portals)
          setSelectedPortalModal(prev => {
            if (!prev) return null
            return data.portals.find((p: PortalData) => p.id === prev.id) || prev
          })
        }
      }
    } catch (err) {
      console.warn('[ConnectionsHub] Erro ao carregar status dos portais:', err)
    } finally {
      setLoadingPortals(false)
    }
  }, [])

  // Carrega métricas de telemetria
  const refreshTelemetry = useCallback(() => {
    setTelemetryMetrics(getTelemetryMetrics())
  }, [])

  useEffect(() => {
    refreshConnectors()
    refreshPortalsStatus()
    refreshTelemetry()

    // Ouve eventos de alteração de portais, Trello e telemetria
    const handlePortalChange = () => {
      refreshConnectors()
      refreshPortalsStatus()
    }
    const handleTrelloChange = () => refreshConnectors()
    const handleTelemetryChange = () => refreshTelemetry()
    const handleReconcileOpen = (e: any) => {
      if (e.detail?.result) {
        setReconcileData({
          portalName: e.detail.portalName || 'Portal Conectado',
          classRef: e.detail.classRef || 'Geral',
          result: e.detail.result,
        })
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('teacher:portal_connections_changed', handlePortalChange)
      window.addEventListener('teacher:trello_config_changed', handleTrelloChange)
      window.addEventListener('teacher:connector_telemetry_updated', handleTelemetryChange)
      window.addEventListener('teacher:open_roster_reconcile', handleReconcileOpen)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('teacher:portal_connections_changed', handlePortalChange)
        window.removeEventListener('teacher:trello_config_changed', handleTrelloChange)
        window.removeEventListener('teacher:connector_telemetry_updated', handleTelemetryChange)
        window.removeEventListener('teacher:open_roster_reconcile', handleReconcileOpen)
      }
    }
  }, [refreshConnectors, refreshTelemetry])

  // Filtra por categoria de conector
  const filteredConnectors = useMemo(() => {
    if (filterTier === 'portal') return connectors.filter(c => c.tier === 'agentic_browser')
    if (filterTier === 'api') return connectors.filter(c => c.tier === 'api')
    return connectors
  }, [connectors, filterTier])

  // Ação de leitura de alunos em 1 clique
  const handleSyncStudents = async (connector: Connector) => {
    setSyncingId(connector.id)
    try {
      const result = await invokeCapability(connector.id, 'read_roster')

      if (!result.success) {
        toast.error(result.error || `Não foi possível ler dados de "${connector.display_name}".`)
        return
      }

      const students = (result.data as any)?.students || []
      if (students.length === 0) {
        toast.info(`Leitura concluída em "${connector.display_name}", mas nenhum aluno foi identificado na página.`)
        return
      }

      // Reconcilia com os alunos locais
      let localStudents: any[] = []
      try {
        const raw = localStorage.getItem('teacher_students')
        if (raw) localStudents = JSON.parse(raw)
      } catch {}

      const isUntestedMap = result.requires_review
      const recResult = reconcileRosterBatch(students, localStudents, {
        portalName: connector.display_name,
        portalStatus: connector.status,
        isUntestedMap,
      })

      setReconcileData({
        portalName: connector.display_name,
        classRef: 'Geral',
        result: recResult,
      })
      toast.success(`✅ ${students.length} alunos encontrados em "${connector.display_name}". Abrindo revisão!`)
    } catch (err: any) {
      toast.error(`Erro ao sincronizar: ${err.message || 'Falha de comunicação.'}`)
    } finally {
      setSyncingId(null)
    }
  }

  // Desconectar plataforma
  const handleDisconnect = (connector: Connector) => {
    if (connector.tier === 'api' && connector.id.includes('trello')) {
      clearTrelloConfig()
      toast.info('Trello desconectado com sucesso.')
    } else {
      upsertConnection(connector.id, {
        status: 'never_connected',
        map: undefined,
      })
      toast.info(`Conexão com "${connector.display_name}" redefinida.`)
    }
    refreshConnectors()
  }

  // Rótulos 100% não técnicos para o status
  const getStatusDisplay = (status: Connector['status']) => {
    switch (status) {
      case 'mapped_validated':
        return { label: 'Conectado e Pronto', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: 'ti-check' }
      case 'mapped_untested':
        return { label: 'Aguardando Homologação', color: '#b45309', bg: '#fffbeb', border: '#fde68a', icon: 'ti-clock' }
      case 'discovering':
        return { label: 'Identificando Layout...', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', icon: 'ti-loader' }
      case 'broken_needs_rediscovery':
        return { label: 'Requer Nova Conexão', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: 'ti-alert-triangle' }
      default:
        return { label: 'Não Conectado', color: '#78716c', bg: '#f5f5f4', border: '#e7e5e4', icon: 'ti-plug-connected-x' }
    }
  }

  return (
    <div style={{ padding: embedded ? 0 : '24px 32px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ─── CABEÇALHO UNIFICADO ────────────────────────────────────────────── */}
      <div style={{
        background: '#ffffff',
        border: '1.5px solid #e7dfd5',
        borderRadius: RADIUS.lg,
        padding: '24px 28px',
        boxShadow: SHADOW.sm,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div style={{ maxWidth: 680 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: RADIUS.md,
              background: '#faf6f0',
              border: '1.5px solid #8b5e3c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#8b5e3c',
              fontSize: 20
            }}>
              <i className="ti ti-plug-connected" />
            </div>
            <h2 style={{ margin: 0, fontSize: TEXT.cardTitle, fontWeight: 800, color: '#2c1a0e' }}>
              Central de Conexões
            </h2>
            <span style={{
              fontSize: 11,
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: 6,
              background: '#faf6f0',
              border: '1px solid #d5c8bb',
              color: '#8b5e3c'
            }}>
              Connector Engine v1
            </span>
          </div>
          <p style={{ margin: 0, fontSize: TEXT.body, color: '#665c54', lineHeight: 1.5 }}>
            Conecte e sincronize em um único lugar todos os sistemas que você utiliza: portais escolares oficiais, diários de classe da sua escola e quadros do Trello.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              setShowTelemetry(prev => !prev)
              refreshTelemetry()
            }}
            data-testid="toggle-telemetry-btn"
            style={{
              background: showTelemetry ? '#2c1a0e' : '#faf6f0',
              color: showTelemetry ? '#ffffff' : '#8b5e3c',
              border: '1.5px solid #8b5e3c',
              borderRadius: RADIUS.md,
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: SHADOW.sm,
              transition: TRANSITION.fast,
            }}
          >
            <i className="ti ti-chart-bar" />
            {showTelemetry ? 'Ocultar Confiabilidade' : 'Confiabilidade & Métricas'}
          </button>

          <button
            onClick={() => {
              setWizardInitialTier('agentic_browser')
              setIsWizardOpen(true)
            }}
            style={{
              background: '#8b5e3c',
              color: '#ffffff',
              border: 'none',
              borderRadius: RADIUS.md,
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: SHADOW.sm,
              transition: TRANSITION.fast,
            }}
          >
            <i className="ti ti-plus" />
            Conectar Nova Plataforma
          </button>
        </div>
      </div>

      {/* ─── PAINEL DE TELEMETRIA & CONFIABILIDADE (FASE 5) ──────────────────── */}
      {showTelemetry && (
        <div
          data-testid="telemetry-panel"
          style={{
            background: '#ffffff',
            border: '1.5px solid #d5c8bb',
            borderRadius: RADIUS.lg,
            padding: '24px 28px',
            boxShadow: SHADOW.md,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {/* Header do Painel */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>📊</span>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
                  Confiabilidade & Métricas do Connector Engine
                </h3>
                <span style={{
                  fontSize: 11,
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#16a34a',
                }}>
                  🔒 100% Local • Zero PII
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#665c54' }}>
                Medição contínua da estabilidade do motor unificado, taxa de sucesso e acionamento de IA visual (Camada 2).
              </p>
            </div>

            <button
              onClick={() => {
                clearTelemetry()
                refreshTelemetry()
                toast.info('Histórico de telemetria limpo com sucesso.')
              }}
              style={{
                background: '#ffffff',
                color: '#78716c',
                border: '1px solid #d5c8bb',
                borderRadius: RADIUS.md,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <i className="ti ti-trash" />
              Limpar Telemetria
            </button>
          </div>

          {/* Cards de Métricas Agregadas */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
          }}>
            {/* Taxa de Sucesso Geral */}
            <div style={{
              background: '#faf6f0',
              border: '1px solid #e7dfd5',
              borderRadius: RADIUS.md,
              padding: '16px 20px',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#8c7e73', marginBottom: 4 }}>
                Taxa de Sucesso Geral
              </div>
              <div style={{
                fontSize: 28,
                fontWeight: 900,
                color: (telemetryMetrics?.success_rate ?? 100) >= 85 ? '#16a34a' : '#b45309',
              }}>
                {telemetryMetrics?.total_invocations === 0 ? '100%' : `${telemetryMetrics?.success_rate}%`}
              </div>
              <div style={{ fontSize: 11, color: '#78716c', marginTop: 4 }}>
                {telemetryMetrics?.success_count ?? 0} de {telemetryMetrics?.total_invocations ?? 0} operações com êxito
              </div>
            </div>

            {/* Acionamento Camada 2 (Visão IA) */}
            <div style={{
              background: '#faf6f0',
              border: '1px solid #e7dfd5',
              borderRadius: RADIUS.md,
              padding: '16px 20px',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#8c7e73', marginBottom: 4 }}>
                Acionamento Camada 2 (Visão)
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#2563eb' }}>
                {((telemetryMetrics?.layer_1_count ?? 0) + (telemetryMetrics?.layer_2_count ?? 0)) === 0
                  ? '0%'
                  : `${telemetryMetrics?.layer_2_rate}%`}
              </div>
              <div style={{ fontSize: 11, color: '#78716c', marginTop: 4 }}>
                {telemetryMetrics?.layer_2_count ?? 0} visões IA vs {telemetryMetrics?.layer_1_count ?? 0} determinísticas
              </div>
            </div>

            {/* Revisões Manuais Requeridas */}
            <div style={{
              background: '#faf6f0',
              border: '1px solid #e7dfd5',
              borderRadius: RADIUS.md,
              padding: '16px 20px',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#8c7e73', marginBottom: 4 }}>
                Revisões Manuais Requeridas
              </div>
              <div style={{
                fontSize: 28,
                fontWeight: 900,
                color: (telemetryMetrics?.requires_review_rate ?? 0) > 30 ? '#b45309' : '#16a34a',
              }}>
                {telemetryMetrics?.total_invocations === 0 ? '0%' : `${telemetryMetrics?.requires_review_rate}%`}
              </div>
              <div style={{ fontSize: 11, color: '#78716c', marginTop: 4 }}>
                {telemetryMetrics?.requires_review_count ?? 0} acionamentos de validação humana
              </div>
            </div>

            {/* Total de Invocações & Latência */}
            <div style={{
              background: '#faf6f0',
              border: '1px solid #e7dfd5',
              borderRadius: RADIUS.md,
              padding: '16px 20px',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#8c7e73', marginBottom: 4 }}>
                Latência Média
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#2c1a0e' }}>
                {telemetryMetrics?.total_invocations === 0 ? '0 ms' : `${telemetryMetrics?.avg_duration_ms} ms`}
              </div>
              <div style={{ fontSize: 11, color: '#78716c', marginTop: 4 }}>
                Total de {telemetryMetrics?.total_invocations ?? 0} invocações registradas
              </div>
            </div>
          </div>

          {/* Tabela por Conector */}
          {telemetryMetrics && Object.keys(telemetryMetrics.by_connector).length > 0 ? (
            <div style={{ borderTop: '1px solid #e7dfd5', paddingTop: 16 }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#2c1a0e' }}>
                Desempenho por Conector
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#faf6f0', borderBottom: '1.5px solid #e7dfd5', textAlign: 'left', color: '#665c54' }}>
                      <th style={{ padding: '8px 12px' }}>Conector</th>
                      <th style={{ padding: '8px 12px' }}>Tipo</th>
                      <th style={{ padding: '8px 12px' }}>Total</th>
                      <th style={{ padding: '8px 12px' }}>Sucesso (%)</th>
                      <th style={{ padding: '8px 12px' }}>Camada 2 (Visão)</th>
                      <th style={{ padding: '8px 12px' }}>Revisão Requerida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(telemetryMetrics.by_connector).map(item => (
                      <tr key={item.connector_id} style={{ borderBottom: '1px solid #f2ede4' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: '#2c1a0e' }}>
                          {item.connector_id}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#665c54' }}>
                          {item.tier === 'agentic_browser' ? '🏫 Portal' : '📋 API'}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#2c1a0e' }}>{item.total}</td>
                        <td style={{
                          padding: '8px 12px',
                          fontWeight: 700,
                          color: item.success_rate >= 85 ? '#16a34a' : '#b45309',
                        }}>
                          {item.success_rate}%
                        </td>
                        <td style={{ padding: '8px 12px', color: item.tier === 'agentic_browser' ? '#2563eb' : '#a8a29e' }}>
                          {item.tier === 'agentic_browser' ? `${item.layer_2_rate}% (${item.layer_2_count})` : 'N/A'}
                        </td>
                        <td style={{ padding: '8px 12px', color: item.requires_review_count > 0 ? '#b45309' : '#16a34a' }}>
                          {item.requires_review_rate}% ({item.requires_review_count})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '16px 20px',
              background: '#faf6f0',
              borderRadius: RADIUS.md,
              color: '#8c7e73',
              fontSize: 13,
            }}>
              Nenhuma invocação registrada ainda. Ao sincronizar alunos ou usar comandos via Rafinha, os tempos e taxas de sucesso aparecerão aqui automaticamente.
            </div>
          )}
        </div>
      )}

      {/* ─── FILTROS DE PLATAFORMA ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #e7dfd5', paddingBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setFilterTier('all')}
            style={{
              padding: '8px 16px',
              borderRadius: RADIUS.md,
              border: filterTier === 'all' ? '1.5px solid #8b5e3c' : '1px solid #e7dfd5',
              background: filterTier === 'all' ? '#8b5e3c' : '#ffffff',
              color: filterTier === 'all' ? '#ffffff' : '#665c54',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              transition: TRANSITION.fast,
            }}
          >
            Todas as Conexões ({portalsStatus.length + connectors.filter(c => c.tier === 'api').length})
          </button>
          <button
            onClick={() => setFilterTier('portal')}
            style={{
              padding: '8px 16px',
              borderRadius: RADIUS.md,
              border: filterTier === 'portal' ? '1.5px solid #8b5e3c' : '1px solid #e7dfd5',
              background: filterTier === 'portal' ? '#8b5e3c' : '#ffffff',
              color: filterTier === 'portal' ? '#ffffff' : '#665c54',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              transition: TRANSITION.fast,
            }}
          >
            🏫 Portais Escolares ({portalsStatus.length})
          </button>
          <button
            onClick={() => setFilterTier('api')}
            style={{
              padding: '8px 16px',
              borderRadius: RADIUS.md,
              border: filterTier === 'api' ? '1.5px solid #8b5e3c' : '1px solid #e7dfd5',
              background: filterTier === 'api' ? '#8b5e3c' : '#ffffff',
              color: filterTier === 'api' ? '#ffffff' : '#665c54',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              transition: TRANSITION.fast,
            }}
          >
            📋 Trello & APIs ({connectors.filter(c => c.tier === 'api').length})
          </button>
        </div>

        <button
          onClick={() => {
            refreshPortalsStatus()
            refreshConnectors()
          }}
          disabled={loadingPortals}
          title="Recarregar status e auditoria"
          style={{
            background: '#ffffff',
            border: '1px solid #d5c8bb',
            borderRadius: RADIUS.md,
            padding: '7px 14px',
            fontSize: 12,
            fontWeight: 700,
            color: '#665c54',
            cursor: loadingPortals ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <i className={loadingPortals ? 'ti ti-loader' : 'ti ti-refresh'} />
          {loadingPortals ? 'Atualizando...' : 'Atualizar Status'}
        </button>
      </div>

      {/* ─── GRADE UNIFICADA DE CONECTORES ─────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
        gap: 20,
      }}>
        {/* 1. Cards de Portais Escolares com Status Honesto (Itens 2, 3 e 4) */}
        {(filterTier === 'all' || filterTier === 'portal') &&
          portalsStatus.map(portal => (
            <PortalCard
              key={portal.id}
              portal={portal}
              onOpenDetails={p => setSelectedPortalModal(p)}
            />
          ))}

        {/* 2. Cards de Integrações Diretas / APIs (Trello, Teams, etc.) */}
        {(filterTier === 'all' || filterTier === 'api') &&
          filteredConnectors.filter(c => c.tier === 'api').map(connector => {
            const statusInfo = getStatusDisplay(connector.status)
            const isSyncing = syncingId === connector.id

            return (
              <div
                key={connector.id}
                style={{
                  background: '#ffffff',
                  border: '1.5px solid #e7dfd5',
                  borderRadius: RADIUS.lg,
                  padding: '20px 24px',
                  boxShadow: SHADOW.sm,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 16,
                  transition: TRANSITION.fast,
                }}
              >
                {/* Header do Card */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: RADIUS.md,
                        background: '#faf6f0',
                        border: '1px solid #d5c8bb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#8b5e3c',
                        fontSize: 22,
                      }}>
                        <i className="ti ti-brand-trello" />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#2c1a0e' }}>
                          {connector.display_name}
                        </h3>
                        <span style={{ fontSize: 12, color: '#8c7e73' }}>
                          Integração Oficial
                        </span>
                      </div>
                    </div>

                    {/* Badge de Tipo */}
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      color: '#16a34a',
                    }}>
                      Integração Direta
                    </span>
                  </div>

                  {/* Status */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: RADIUS.md,
                    background: statusInfo.bg,
                    border: `1px solid ${statusInfo.border}`,
                    color: statusInfo.color,
                    fontSize: 12,
                    fontWeight: 700,
                    marginBottom: 12,
                  }}>
                    <i className={`ti ${statusInfo.icon}`} style={{ fontSize: 14 }} />
                    {statusInfo.label}
                  </div>

                  {/* Capacidades Oferecidas */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {connector.capabilities.map(cap => (
                      <span
                        key={cap.name}
                        style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: '#faf6f0',
                          color: '#665c54',
                          border: '1px solid #e7dfd5',
                        }}
                      >
                        {cap.name === 'read_roster' && '👥 Alunos'}
                        {cap.name === 'read_board' && '📋 Quadros'}
                        {cap.name === 'read_calendar' && '📅 Calendário'}
                        {cap.name === 'read_assignments' && '📝 Atividades'}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Botões de Ação do Card */}
                <div style={{
                  display: 'flex',
                  gap: 8,
                  paddingTop: 14,
                  borderTop: '1px solid #f2ede4',
                }}>
                  <button
                    onClick={() => handleSyncStudents(connector)}
                    disabled={isSyncing}
                    style={{
                      flex: 1,
                      background: '#8b5e3c',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: RADIUS.md,
                      padding: '8px 14px',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: isSyncing ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      opacity: isSyncing ? 0.7 : 1,
                    }}
                  >
                    <i className={isSyncing ? 'ti ti-loader' : 'ti ti-refresh'} />
                    {isSyncing ? 'Lendo...' : 'Sincronizar Alunos'}
                  </button>

                  <button
                    onClick={() => handleDisconnect(connector)}
                    title="Desconectar ou redefinir conexão"
                    style={{
                      background: '#ffffff',
                      color: '#dc2626',
                      border: '1px solid #fecaca',
                      borderRadius: RADIUS.md,
                      padding: '8px 12px',
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    <i className="ti ti-trash" />
                  </button>
                </div>
              </div>
            )
          })}

        {/* Card Vazio para Conectar Nova Plataforma */}
        <div
          onClick={() => {
            setWizardInitialTier('agentic_browser')
            setIsWizardOpen(true)
          }}
          style={{
            border: '2px dashed #d5c8bb',
            borderRadius: RADIUS.lg,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            cursor: 'pointer',
            background: '#faf6f0',
            minHeight: 220,
            transition: TRANSITION.fast,
          }}
        >
          <div style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: '#ffffff',
            border: '1.5px solid #d5c8bb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#8b5e3c',
            fontSize: 22,
          }}>
            <i className="ti ti-plus" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#2c1a0e' }}>
              Adicionar Outra Plataforma
            </div>
            <div style={{ fontSize: 12, color: '#8c7e73', marginTop: 4 }}>
              Conecte um portal da sua escola ou sua conta do Trello
            </div>
          </div>
        </div>
      </div>

      {/* ─── WIZARD UNIFICADO DE CONEXÃO ───────────────────────────────────── */}
      <PortalConnectionWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        initialTier={wizardInitialTier}
        onConnectionComplete={() => {
          setIsWizardOpen(false)
          refreshConnectors()
        }}
      />

      {/* ─── MODAL DE RECONCILIAÇÃO DE ROSTER ──────────────────────────────── */}
      {reconcileData && (
        <RosterReconciliationModal
          isOpen={true}
          portalName={reconcileData.portalName}
          classRef={reconcileData.classRef}
          result={reconcileData.result}
          onClose={() => setReconcileData(null)}
          onSuccess={(count: number) => {
            toast.success(`🎉 ${count} alunos gravados com sucesso na sua turma!`)
            setReconcileData(null)
          }}
        />
      )}

      {/* ─── MODAL EXPANDIDO DE DETALHES DO PORTAL (ITEM 3) ────────────────── */}
      {selectedPortalModal && (
        <PortalDetailsModal
          portal={selectedPortalModal}
          isOpen={Boolean(selectedPortalModal)}
          onClose={() => setSelectedPortalModal(null)}
          onRefresh={refreshPortalsStatus}
        />
      )}
    </div>
  )
}
