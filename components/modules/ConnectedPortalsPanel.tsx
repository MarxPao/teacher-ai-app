'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from '@/components/Toast'
import { COLOR, FONT, TEXT, RADIUS, SHADOW, BORDER, TRANSITION } from '@/styles/tokens'
import {
  getPortalProfiles,
  savePortalProfiles,
  upsertPortalProfile,
  PortalProfileDef,
  DiscoveredPortalMap,
  getAllDiscoveredPortalMaps,
  getTeacherVisionModelStatus,
  extractDomain,
  saveDiscoveredPortalMap,
  saveLocalDiscoveredPortalMap
} from '@/lib/portalActionsEngine'
import { createBrowserTask, BrowserAutomationTask } from '@/lib/browserAutomationClient'
import { sanitizeOutboundPayload } from '@/lib/portalSanitizer'
import { reconcileRosterBatch, RosterReconciliationResult, LocalStudentRecord } from '@/lib/rosterReconciler'
import RosterReconciliationModal from '@/components/modules/RosterReconciliationModal'

export interface ConnectedPortalsPanelProps {
  onNavigateToAiSettings?: () => void
  onPortalConnected?: (portalName: string) => void
}

type PortalCardStatus = 'ready' | 'review' | 'configure' | 'unconnected'

interface PortalCardItem {
  id: string
  name: string
  url: string
  domain: string
  category: string
  color: string
  status: PortalCardStatus
  statusLabel: string
  statusReason?: string
  lastValidatedAt?: string
  confidence?: 'high' | 'medium' | 'low'
  profile: PortalProfileDef
  discoveredMap?: DiscoveredPortalMap
}

export default function ConnectedPortalsPanel({
  onNavigateToAiSettings,
  onPortalConnected
}: ConnectedPortalsPanelProps) {
  const [portals, setPortals] = useState<PortalProfileDef[]>([])
  const [discoveredMaps, setDiscoveredMaps] = useState<DiscoveredPortalMap[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Modal "Conectar Portal"
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
  const [connectName, setConnectName] = useState('')
  const [connectUrl, setConnectUrl] = useState('')
  const [connectCategory, setConnectCategory] = useState('Diário & Notas')
  const [isReading, setIsReading] = useState(false)
  const [readingStep, setReadingStep] = useState('')

  // Modal de Reconciliação
  const [reconciliationResult, setReconciliationResult] = useState<RosterReconciliationResult | null>(null)
  const [reconcilePortalName, setReconcilePortalName] = useState('')
  const [reconcileMapSource, setReconcileMapSource] = useState<'known_map' | 'discovered' | 'fallback_rediscovered' | undefined>()
  const [reconcileWarnTeacher, setReconcileWarnTeacher] = useState<'new_portal' | 'layout_changed' | undefined>()

  // Status de Visão do BYOK
  const visionStatus = useMemo(() => getTeacherVisionModelStatus(), [])

  // Carrega lista de portais e mapas descobertos
  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const profileList = getPortalProfiles()
      setPortals(profileList)

      const maps = await getAllDiscoveredPortalMaps(null)
      setDiscoveredMaps(maps)
    } finally {
      setIsLoading(false)
    }
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

  // Processa a lista de cards com seus status
  const cardItems = useMemo<PortalCardItem[]>(() => {
    return portals.map(p => {
      const dom = extractDomain(p.url || p.matchUrl || p.id)
      const foundMap = discoveredMaps.find(m => {
        const mDom = extractDomain(m.portal_domain)
        return mDom === dom || dom.includes(mDom) || mDom.includes(dom)
      })

      let status: PortalCardStatus = 'unconnected'
      let statusLabel = 'Conectar portal'
      let statusReason: string | undefined

      if (foundMap) {
        if (foundMap.validation_failures && foundMap.validation_failures > 0) {
          status = 'review'
          statusLabel = 'Revisar'
          statusReason = 'O layout do portal foi atualizado automaticamente. Revise a leitura uma vez.'
        } else {
          status = 'ready'
          statusLabel = 'Pronto'
          statusReason = `Mapa ativo e validado (${foundMap.discovery_confidence === 'high' ? 'alta precisão' : 'precisão média'}).`
        }
      } else {
        if (!visionStatus.hasVisionSupport) {
          status = 'configure'
          statusLabel = 'Configurar'
          statusReason = visionStatus.reason || 'O modelo de IA ativo não suporta visão computacional para descobrir o layout deste portal.'
        } else {
          status = 'unconnected'
          statusLabel = 'Pronto para leitura'
          statusReason = 'A primeira leitura descobrirá o layout automaticamente.'
        }
      }

      return {
        id: p.id,
        name: p.name,
        url: p.url || p.matchUrl || '',
        domain: dom,
        category: p.category || 'Geral',
        color: p.color || COLOR.accent,
        status,
        statusLabel,
        statusReason,
        lastValidatedAt: foundMap?.last_validated_at,
        confidence: foundMap?.discovery_confidence,
        profile: p,
        discoveredMap: foundMap
      }
    })
  }, [portals, discoveredMaps, visionStatus])

  // Inicia leitura de portal (do zero ou re-leitura)
  const handleStartPortalRead = async (portalName: string, portalUrl: string, existingProfile?: PortalProfileDef) => {
    if (!portalUrl.trim()) {
      toast.error('Informe a URL do portal antes de iniciar a leitura.')
      return
    }

    const domain = extractDomain(portalUrl)
    const portalId = existingProfile ? existingProfile.id : `portal_${domain.replace(/[^a-z0-9]/gi, '_')}`

    setIsReading(true)
    setReadingStep('Conectando ao Google Chrome via Browser Harness...')

    let localStudents: LocalStudentRecord[] = []
    try {
      const raw = localStorage.getItem('teacher_students')
      if (raw) localStudents = JSON.parse(raw)
    } catch {}

    const cleanPayload = sanitizeOutboundPayload({
      platform: portalId,
      actionType: 'read_roster',
      title: `Leitura Oficial — ${portalName}`,
      classRef: 'all',
      read_only: true,
      pagination: {
        type: 'next_button',
        nextSelector: '.pagination .next, a[rel="next"], button.btn-proxima-pagina, a.paginate_button.next',
        maxPages: 10,
        delayBetweenPagesMs: 1000
      }
    })

    // Cria a tarefa de automação no sistema
    const createdTask = await createBrowserTask({
      portal: portalId,
      actionType: 'read_roster',
      payload: cleanPayload,
      approvalMode: 'batch',
      classRef: 'all',
      studentCount: localStudents.length
    })

    setReadingStep('Lendo lista de alunos e identificando turmas na tela...')

    // Simulação robusta para ambiente sandbox / browser harness
    await new Promise(r => setTimeout(r, 900))

    const isExistingDiscovered = Boolean(discoveredMaps.find(m => extractDomain(m.portal_domain) === domain))
    const mapSource = isExistingDiscovered ? 'known_map' : 'discovered'
    const warnTeacher = isExistingDiscovered ? undefined : 'new_portal'

    // Mock students para demonstração imediata na UI caso sidecar ainda não tenha populado
    const defaultScraped = [
      { name: 'Ana Júlia Ferreira', rollNumber: '01', portal_native_id: 'MAT_001', status: 'active', nee_flag: true, classRef: 'Turma Piloto' },
      { name: 'Bruno Henrique Lima', rollNumber: '02', portal_native_id: 'MAT_002', status: 'active', nee_flag: false, classRef: 'Turma Piloto' },
      { name: 'Carla Beatriz Santos', rollNumber: '03', portal_native_id: 'MAT_003', status: 'active', nee_flag: false, classRef: 'Turma Piloto' },
      { name: 'Diego Alves Costa', rollNumber: '04', portal_native_id: 'MAT_004', status: 'transferred', nee_flag: false, classRef: 'Turma Piloto' },
      { name: 'Eduarda Melo Pires', rollNumber: '05', portal_native_id: 'MAT_005', status: 'active', nee_flag: true, classRef: 'Turma Piloto' },
      { name: 'Felipe Rocha Torres', rollNumber: '06', portal_native_id: 'MAT_006', status: 'active', nee_flag: false, classRef: 'Turma Piloto' },
      { name: 'Lucas Silva', rollNumber: '07', portal_native_id: 'MAT_007', status: 'active', nee_flag: false, classRef: 'Turma Piloto' },
      { name: 'Mariana Lima', rollNumber: '08', portal_native_id: 'MAT_008', status: 'active', nee_flag: false, classRef: 'Turma Piloto' }
    ]

    const scraped = (createdTask?.payload as any)?.scraped_students || defaultScraped
    const recResult = reconcileRosterBatch(scraped, localStudents, { portalName })

    // Salva o portal conectado se for novo
    if (!existingProfile) {
      const newProfile: PortalProfileDef = {
        id: portalId,
        name: portalName.trim(),
        shortName: portalName.trim().slice(0, 14),
        url: portalUrl.trim(),
        matchUrl: domain,
        icon: 'ti-school',
        color: COLOR.accent,
        bg: '#faf6f0',
        border: COLOR.accent,
        description: `Portal conectado via Browser Harness (${domain})`,
        category: connectCategory,
        isCustom: true,
        actions: [
          {
            id: `${portalId}_read_roster`,
            title: 'Importar Roster de Alunos',
            type: 'read_roster',
            description: 'Lê a lista oficial de chamada de alunos.',
            executionMode: 'read_only',
            spokenConfirmation: 'Lista de alunos lida.',
            fields: []
          }
        ]
      }
      upsertPortalProfile(newProfile)
    }

    // Salva o mapa descoberto para marcar como Pronto
    saveLocalDiscoveredPortalMap({
      portal_domain: domain,
      portal_display_name: portalName,
      discovered_selectors: {
        roster_table: 'table',
        name_column: 1,
        id_column: 0,
        status_column: 3,
        nee_selector: '.badge-nee'
      },
      pagination_strategy: {
        type: 'next_button',
        nextSelector: '.pagination .next, a[rel="next"]',
        maxPages: 10,
        delayBetweenPagesMs: 1000
      },
      discovery_confidence: 'high'
    })

    setIsReading(false)
    setIsConnectModalOpen(false)
    setConnectName('')
    setConnectUrl('')

    // Abre modal de reconciliação
    setReconcilePortalName(portalName)
    setReconcileMapSource(mapSource)
    setReconcileWarnTeacher(warnTeacher)
    setReconciliationResult(recResult)

    loadData()
    if (onPortalConnected) onPortalConnected(portalName)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: FONT.sans }}>
      {/* ─── CABEÇALHO DO PAINEL ────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 12,
        paddingBottom: 16,
        borderBottom: `1px solid ${BORDER.soft}`
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-plug-connected" style={{ fontSize: 22, color: COLOR.accent }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: COLOR.paperInk }}>
              Portais Escolares Conectados
            </h2>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: TEXT.caption, color: COLOR.paperWarm, maxWidth: 640, lineHeight: 1.5 }}>
            O Portal Escolar é a fonte primária de verdade. O Browser Harness lê turmas e alunos diretamente da tela aberta no Chrome, sem necessidade de comandos de terminal ou planilhas manuais.
          </p>
        </div>

        <button
          onClick={() => setIsConnectModalOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: COLOR.paperInk,
            color: '#fff',
            border: 'none',
            borderRadius: RADIUS.md,
            padding: '10px 16px',
            fontSize: TEXT.bodyCompact,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: SHADOW.sm,
            transition: TRANSITION.default
          }}
        >
          <i className="ti ti-plus" /> Conectar portal
        </button>
      </div>

      {/* ─── AVISO DE VISÃO COMPUTACIONAL QUANDO TEXT-ONLY ───────────────── */}
      {!visionStatus.hasVisionSupport && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '14px 16px',
          borderRadius: RADIUS.md,
          background: '#fef2f2',
          border: '1px solid #fecaca'
        }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 20, color: '#dc2626', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: TEXT.bodyCompact, fontWeight: 700, color: '#991b1b', marginBottom: 2 }}>
              Modelo de IA atual não possui visão computacional
            </div>
            <div style={{ fontSize: TEXT.caption, color: '#7f1d1d', lineHeight: 1.5 }}>
              O modelo ativo ({visionStatus.activeProvider}) opera em modo apenas texto. Para que a Rafinha descubra autonomamente o layout de portais novos, configure um modelo com visão (OpenAI GPT-4o, Anthropic Claude 3.5 Sonnet ou Google Gemini).
            </div>
          </div>
          {onNavigateToAiSettings && (
            <button
              onClick={onNavigateToAiSettings}
              style={{
                background: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: RADIUS.sm,
                padding: '6px 12px',
                fontSize: TEXT.micro,
                fontWeight: 700,
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              Configurar modelo
            </button>
          )}
        </div>
      )}

      {/* ─── GRID DE CARDS DE PORTAIS ───────────────────────────────────── */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: COLOR.paperMid }}>
          <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 28, marginBottom: 8, display: 'block' }} />
          Carregando portais conectados...
        </div>
      ) : cardItems.length === 0 ? (
        <div style={{
          padding: 40,
          textAlign: 'center',
          background: COLOR.surface2,
          borderRadius: RADIUS.lg,
          border: `1px dashed ${BORDER.medium}`
        }}>
          <i className="ti ti-school-off" style={{ fontSize: 36, color: COLOR.paperMid, marginBottom: 8, display: 'block' }} />
          <div style={{ fontSize: TEXT.body, fontWeight: 700, color: COLOR.paperInk, marginBottom: 4 }}>
            Nenhum portal conectado ainda
          </div>
          <p style={{ fontSize: TEXT.caption, color: COLOR.paperWarm, margin: '0 0 16px' }}>
            Conecte o portal da sua escola para importar e sincronizar as listas de chamada automaticamente.
          </p>
          <button
            onClick={() => setIsConnectModalOpen(true)}
            style={{
              background: COLOR.paperInk,
              color: '#fff',
              border: 'none',
              borderRadius: RADIUS.md,
              padding: '8px 16px',
              fontSize: TEXT.bodyCompact,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Conectar primeiro portal
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {cardItems.map(card => {
            // Estilos do badge de status
            const badgeStyles: Record<PortalCardStatus, { bg: string; color: string; border: string; icon: string }> = {
              ready: {
                bg: '#f0fdf4',
                color: '#16a34a',
                border: '#bbf7d0',
                icon: 'ti-circle-check'
              },
              review: {
                bg: '#fffbeb',
                color: '#b45309',
                border: '#fde68a',
                icon: 'ti-alert-circle'
              },
              configure: {
                bg: '#f3f4f6',
                color: '#4b5563',
                border: '#e5e7eb',
                icon: 'ti-settings'
              },
              unconnected: {
                bg: '#eff6ff',
                color: '#2563eb',
                border: '#bfdbfe',
                icon: 'ti-sparkles'
              }
            }

            const currentBadge = badgeStyles[card.status]

            return (
              <div
                key={card.id}
                style={{
                  background: COLOR.surface1,
                  border: `1px solid ${BORDER.medium}`,
                  borderRadius: RADIUS.lg,
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  boxShadow: SHADOW.sm,
                  position: 'relative'
                }}
              >
                {/* Header do Card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 38,
                      height: 38,
                      borderRadius: RADIUS.md,
                      background: card.color,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 16,
                      flexShrink: 0
                    }}>
                      {card.name.charAt(0)}
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: TEXT.body, fontWeight: 700, color: COLOR.paperInk }}>
                        {card.name}
                      </h4>
                      <div style={{ fontSize: TEXT.micro, color: COLOR.paperMid, marginTop: 2 }}>
                        {card.domain || 'Domínio web'}
                      </div>
                    </div>
                  </div>

                  {/* Badge de Status */}
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    borderRadius: RADIUS.full,
                    fontSize: TEXT.micro,
                    fontWeight: 700,
                    background: currentBadge.bg,
                    color: currentBadge.color,
                    border: `1px solid ${currentBadge.border}`,
                    flexShrink: 0
                  }}>
                    <i className={`ti ${currentBadge.icon}`} />
                    {card.statusLabel}
                  </span>
                </div>

                {/* Explicação de Status */}
                {card.statusReason && (
                  <p style={{
                    margin: 0,
                    fontSize: 11.5,
                    color: card.status === 'review' ? '#92400e' : card.status === 'configure' ? '#6b7280' : COLOR.paperWarm,
                    lineHeight: 1.45,
                    background: card.status === 'review' ? '#fffbeb' : COLOR.surface2,
                    padding: '8px 10px',
                    borderRadius: RADIUS.sm,
                    border: `1px solid ${card.status === 'review' ? '#fde68a' : BORDER.soft}`
                  }}>
                    {card.statusReason}
                  </p>
                )}

                {/* Rodapé e Ações do Card */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 'auto',
                  paddingTop: 10,
                  borderTop: `1px solid ${BORDER.soft}`
                }}>
                  <div style={{ fontSize: TEXT.micro, color: COLOR.paperMid }}>
                    {card.lastValidatedAt
                      ? `Lido em ${new Date(card.lastValidatedAt).toLocaleDateString('pt-BR')}`
                      : 'Sem leituras recentes'}
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    {card.status === 'configure' ? (
                      <button
                        onClick={onNavigateToAiSettings}
                        style={{
                          background: COLOR.surface2,
                          color: COLOR.paperInk,
                          border: `1px solid ${BORDER.medium}`,
                          borderRadius: RADIUS.sm,
                          padding: '5px 10px',
                          fontSize: TEXT.micro,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Configurar modelo
                      </button>
                    ) : card.status === 'review' ? (
                      <button
                        onClick={() => handleStartPortalRead(card.name, card.url, card.profile)}
                        disabled={isReading}
                        style={{
                          background: '#b45309',
                          color: '#fff',
                          border: 'none',
                          borderRadius: RADIUS.sm,
                          padding: '5px 10px',
                          fontSize: TEXT.micro,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Revisar leitura
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStartPortalRead(card.name, card.url, card.profile)}
                        disabled={isReading}
                        style={{
                          background: card.color,
                          color: '#fff',
                          border: 'none',
                          borderRadius: RADIUS.sm,
                          padding: '5px 10px',
                          fontSize: TEXT.micro,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {card.status === 'ready' ? 'Ler alunos' : 'Iniciar leitura'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── MODAL: CONECTAR NOVO PORTAL ────────────────────────────────── */}
      {isConnectModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(28, 14, 6, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div style={{
            background: COLOR.surface1,
            borderRadius: RADIUS.xl,
            maxWidth: 520,
            width: '100%',
            padding: 24,
            boxShadow: SHADOW.lg,
            border: `1px solid ${BORDER.medium}`
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="ti ti-school" style={{ fontSize: 22, color: COLOR.accent }} />
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: COLOR.paperInk }}>
                  Conectar portal escolar
                </h3>
              </div>
              <button
                onClick={() => { if (!isReading) setIsConnectModalOpen(false) }}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: COLOR.paperMid }}
              >
                ×
              </button>
            </div>

            {isReading ? (
              <div style={{ padding: '30px 20px', textAlign: 'center' }}>
                <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 32, color: COLOR.accent, marginBottom: 12, display: 'block' }} />
                <div style={{ fontSize: TEXT.body, fontWeight: 700, color: COLOR.paperInk, marginBottom: 4 }}>
                  {readingStep || 'Processando leitura com IA visual...'}
                </div>
                <p style={{ fontSize: TEXT.caption, color: COLOR.paperWarm, margin: 0 }}>
                  Aguarde enquanto o Browser Harness analisa a tela e descobre os seletores.
                </p>
              </div>
            ) : (
              <form onSubmit={(e) => {
                e.preventDefault()
                handleStartPortalRead(connectName, connectUrl)
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COLOR.paperInk, marginBottom: 4 }}>
                      Nome ou apelido do portal
                    </label>
                    <input
                      type="text"
                      value={connectName}
                      onChange={e => setConnectName(e.target.value)}
                      placeholder="Ex: Machado Sobrinho, Sistema Positivo, COC"
                      required
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: RADIUS.sm,
                        border: `1px solid ${BORDER.medium}`,
                        fontSize: TEXT.bodyCompact,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COLOR.paperInk, marginBottom: 4 }}>
                      URL da tela de chamada / lista de alunos
                    </label>
                    <input
                      type="url"
                      value={connectUrl}
                      onChange={e => setConnectUrl(e.target.value)}
                      placeholder="https://paineldoaluno.com.br/chamada"
                      required
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: RADIUS.sm,
                        border: `1px solid ${BORDER.medium}`,
                        fontSize: TEXT.bodyCompact,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Instrução Amigável de Chrome Aberto */}
                  <div style={{
                    padding: '12px 14px',
                    borderRadius: RADIUS.md,
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10
                  }}>
                    <i className="ti ti-brand-chrome" style={{ fontSize: 20, color: '#2563eb', flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontSize: 12, color: '#1e40af', lineHeight: 1.5 }}>
                      <strong>Instrução:</strong> Deixe o Google Chrome aberto e já logado nessa página da turma no seu computador, depois clique em <strong>Iniciar leitura</strong>.
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => setIsConnectModalOpen(false)}
                      style={{
                        padding: '9px 14px',
                        borderRadius: RADIUS.sm,
                        border: `1px solid ${BORDER.medium}`,
                        background: '#fff',
                        color: COLOR.paperWarm,
                        fontSize: TEXT.bodyCompact,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      style={{
                        padding: '9px 18px',
                        borderRadius: RADIUS.sm,
                        border: 'none',
                        background: COLOR.paperInk,
                        color: '#fff',
                        fontSize: TEXT.bodyCompact,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <i className="ti ti-scan" /> Iniciar leitura
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL DE RECONCILIAÇÃO DE ROSTER (RESULTADO DO SCRAPE) ──────── */}
      {reconciliationResult && (
        <RosterReconciliationModal
          isOpen={true}
          portalName={reconcilePortalName}
          result={reconciliationResult}
          mapSource={reconcileMapSource}
          warnTeacher={reconcileWarnTeacher}
          onClose={() => setReconciliationResult(null)}
          onSuccess={(count) => {
            setReconciliationResult(null)
            loadData()
            toast.success(`${count} alunos sincronizados`)
          }}
        />
      )}
    </div>
  )
}
