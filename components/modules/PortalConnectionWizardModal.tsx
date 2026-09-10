'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { COLOR, TEXT, RADIUS, BORDER, SHADOW, TRANSITION } from '@/styles/tokens'
import { toast } from '@/components/Toast'
import {
  PortalConnection,
  getPortalConnection,
  upsertConnection,
  validateConnection,
  recordSyncSuccess,
  recordSyncFailure
} from '@/lib/portalConnectionService'
import {
  validateStudentName,
  WizardStudentItem,
  batchApproveWizardStudents,
  validateWizardRosterIntegrity
} from '@/lib/rosterReconciler'
import { extractDomain } from '@/lib/portalActionsEngine'
import { sanitizeOutboundPayload } from '@/lib/portalSanitizer'
import { createBrowserTask } from '@/lib/browserAutomationClient'

export type ScrapedStudentPreview = WizardStudentItem

export interface PortalConnectionWizardModalProps {
  isOpen: boolean
  onClose: () => void
  onConnectionComplete?: (conn: PortalConnection, count: number) => void
  initialName?: string
  initialUrl?: string
  initialTier?: 'agentic_browser' | 'api'
}

type WizardStep = 'step_1_input' | 'step_2_resolving' | 'step_3_preview' | 'step_4_complete'

export default function PortalConnectionWizardModal({
  isOpen,
  onClose,
  onConnectionComplete,
  initialName = '',
  initialUrl = '',
  initialTier = 'agentic_browser'
}: PortalConnectionWizardModalProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('step_1_input')
  const [tier, setTier] = useState<'agentic_browser' | 'api'>(initialTier)
  const [portalName, setPortalName] = useState(initialName)
  const [portalUrl, setPortalUrl] = useState(initialUrl)
  const [classRef, setClassRef] = useState('')
  const [trelloApiKey, setTrelloApiKey] = useState('')
  const [trelloApiToken, setTrelloApiToken] = useState('')

  // Estado da Resolução (Passo 2)
  const [naturalLanguageState, setNaturalLanguageState] = useState<string>('Conectando ao navegador...')
  const [naturalLanguageSubtext, setNaturalLanguageSubtext] = useState<string>('')
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false)
  const [hasResolveFailed, setHasResolveFailed] = useState<boolean>(false)
  const [resolveErrorMessage, setResolveErrorMessage] = useState<string>('')

  // Dados Lidos para Prévia (Passo 3)
  const [scrapedStudents, setScrapedStudents] = useState<ScrapedStudentPreview[]>([])
  const [resolvedStatus, setResolvedStatus] = useState<'mapped_validated' | 'mapped_untested' | 'broken_needs_rediscovery'>('mapped_untested')
  const [layerUsed, setLayerUsed] = useState<string>('layer_1_deterministic')
  const [pagesRead, setPagesRead] = useState<number>(1)

  // Status Final (Passo 4)
  const [finalConnection, setFinalConnection] = useState<PortalConnection | null>(null)

  useEffect(() => {
    if (isOpen) {
      setCurrentStep('step_1_input')
      const chosenTier = initialTier || (initialName.toLowerCase().includes('trello') ? 'api' : 'agentic_browser')
      setTier(chosenTier)
      setPortalName(initialName || (chosenTier === 'api' ? 'Trello' : ''))
      setPortalUrl(initialUrl)
      setHasResolveFailed(false)
      setResolveErrorMessage('')
      setScrapedStudents([])
    }
  }, [isOpen, initialName, initialUrl, initialTier])

  const domain = useMemo(() => {
    if (!portalUrl) return ''
    return extractDomain(portalUrl) || portalUrl.replace(/^https?:\/\//i, '').split('/')[0]
  }, [portalUrl])

  // ─── PASSO 1: ABRIR NAVEGADOR & DISPARAR LEITURA / AUTENTICAR API ───────────
  const handleStartConnection = async (e: React.FormEvent) => {
    e.preventDefault()

    // ── FLUXO TIER API (TRELLO) ──────────────────────────────────────────────
    if (tier === 'api') {
      if (!portalName.trim()) {
        toast.error('Informe um nome para a conexão (ex: Trello).')
        return
      }
      if (!trelloApiKey.trim() || !trelloApiToken.trim()) {
        toast.error('Informe a Chave de API e o Token de Acesso do Trello.')
        return
      }

      setCurrentStep('step_2_resolving')
      setNaturalLanguageState('Verificando credenciais do Trello...')
      setNaturalLanguageSubtext('Consultando sua conta e quadros abertos de forma segura...')
      setHasResolveFailed(false)
      setResolveErrorMessage('')

      try {
        const { testTrelloConnection, fetchTrelloBoards, fetchTrelloCardsFromBoard, saveTrelloConfig } = await import('@/lib/trelloClient')
        const member = await testTrelloConnection(trelloApiKey.trim(), trelloApiToken.trim())
        saveTrelloConfig({
          apiKey: trelloApiKey.trim(),
          apiToken: trelloApiToken.trim(),
          memberId: member.id,
          username: member.username,
          fullName: member.fullName
        })

        setNaturalLanguageState('Conexão autorizada! Buscando dados dos quadros...')
        setNaturalLanguageSubtext(`Autenticado como ${member.fullName || member.username}. Carregando cartões para prévia...`)

        const boards = await fetchTrelloBoards(trelloApiKey.trim(), trelloApiToken.trim())
        let cards: any[] = []
        if (boards.length > 0) {
          cards = await fetchTrelloCardsFromBoard(boards[0].id, trelloApiKey.trim(), trelloApiToken.trim())
        }

        const parsedPreview: WizardStudentItem[] = cards.map((c: any, idx: number) => {
          const val = validateStudentName(c.name || '')
          return {
            id: c.id || `card_${idx}`,
            name: c.name,
            rollNumber: c.shortUrl || '',
            portal_native_id: c.id,
            className: boards[0]?.name || 'Quadro Trello',
            confidence: val.isSuspicious ? 0.4 : 0.95,
            isSuspicious: val.isSuspicious,
            suspiciousReason: val.reason,
            decision: 'pending' as const
          }
        })

        setScrapedStudents(parsedPreview)
        setPagesRead(1)
        setLayerUsed('api')
        setResolvedStatus('mapped_validated')
        setCurrentStep('step_3_preview')
      } catch (err: any) {
        setHasResolveFailed(true)
        setNaturalLanguageState('Não foi possível conectar ao Trello')
        setNaturalLanguageSubtext(err.message || 'Verifique se a chave de API e o Token estão corretos.')
        setResolveErrorMessage(err.message || 'Falha na autenticação do Trello.')
      }
      return
    }

    // ── FLUXO TIER AGENTIC_BROWSER (PORTAL ESCOLAR) ───────────────────────────
    if (!portalName.trim() || !portalUrl.trim()) {
      toast.error('Informe o nome e a URL do portal para prosseguir.')
      return
    }

    setCurrentStep('step_2_resolving')
    setNaturalLanguageState('Verificando conexão com o navegador...')
    setNaturalLanguageSubtext('Certifique-se de que o Google Chrome está aberto na turma correspondente.')
    setHasResolveFailed(false)
    setResolveErrorMessage('')

    const cleanDomain = domain || 'portal.escola.com.br'

    // Verifica conexão existente
    const existingConn = getPortalConnection(cleanDomain) || getPortalConnection(portalName)
    const hasKnownMap = Boolean(existingConn && existingConn.status !== 'broken_needs_rediscovery' && existingConn.map)

    if (hasKnownMap) {
      setNaturalLanguageState('Portal reconhecido, lendo...')
      setNaturalLanguageSubtext('Estrutura de dados conhecida. Extraindo alunos via automação determinística direta sem uso de visão...')
      setIsDiscovering(false)
    } else {
      setNaturalLanguageState('Aprendendo a estrutura deste portal...')
      setNaturalLanguageSubtext('Primeira conexão identificada para este endereço. Analisando o layout visual com IA para mapear alunos...')
      setIsDiscovering(true)
    }

    try {
      // Registra tarefa de auditoria
      const payload = sanitizeOutboundPayload({
        platform: cleanDomain,
        actionType: 'read_roster',
        title: `Assistente de Conexão — ${portalName}`,
        classRef: classRef || 'all',
        url: portalUrl,
        read_only: true
      })

      await createBrowserTask({
        portal: cleanDomain,
        actionType: 'read_roster',
        payload,
        approvalMode: 'batch',
        classRef: classRef || 'all',
        studentCount: 0
      })

      // Chamada real ao Sidecar
      const res = await fetch('/api/sidecar-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'read_page_content',
          goal: `lista de chamada de alunos no portal ${portalName}`,
          pageHint: portalUrl || portalName,
          outputFormat: 'students'
        })
      })

      const data = await res.json()

      if (res.ok && data.success && Array.isArray(data.students) && data.students.length > 0) {
        // Processa os alunos lidos com validação individual de nome e id único
        const parsedPreview: WizardStudentItem[] = data.students.map((raw: any, idx: number) => {
          const rawName = String(raw.name || '').trim()
          const val = validateStudentName(rawName)
          const isSuspicious = val.isSuspicious || val.isNoise
          const confidence = raw.confidence ?? (isSuspicious ? 0.3 : 0.9)
          return {
            id: String(raw.id || raw.portal_native_id || `student_${idx}_${Date.now()}`),
            name: rawName,
            rollNumber: raw.rollNumber || raw.matricula || '',
            portal_native_id: raw.portal_native_id || raw.id || '',
            className: raw.classRef || classRef || 'Turma Detectada',
            confidence,
            isSuspicious,
            suspiciousReason: val.reason,
            decision: 'pending' as const
          }
        })

        setScrapedStudents(parsedPreview)
        setPagesRead(data.pages_read || 1)
        setLayerUsed(data.layer_used || (hasKnownMap ? 'layer_1_deterministic' : 'layer_2_vision'))

        const nextStatus = data.status || (data.layer_used === 'layer_2_vision' ? 'mapped_untested' : 'mapped_validated')
        setResolvedStatus(nextStatus)

        setCurrentStep('step_3_preview')
      } else {
        // Falha ou portal em broken_needs_rediscovery
        const isBroken = Boolean(
          data?.status === 'broken_needs_rediscovery' ||
          data?.requires_manual_rediscovery ||
          (data?.validation_failures || 0) >= 3
        )

        setHasResolveFailed(true)
        if (isBroken) {
          setResolvedStatus('broken_needs_rediscovery')
          setNaturalLanguageState('Leitura não realizada: portal precisa de redescoberta manual')
          setNaturalLanguageSubtext('O layout deste portal mudou após falhas consecutivas e foi invalidado para proteger seus dados contra alucinações. Nenhuma alteração foi sincronizada.')
          setResolveErrorMessage('Portal requer redescoberta manual de layout.')
        } else if (data?.status === 'domain_mismatch') {
          setNaturalLanguageState('Aba do navegador incorreta')
          setNaturalLanguageSubtext(data?.error || 'A aba aberta no navegador dedicado não corresponde ao portal informado.')
          setResolveErrorMessage(data?.error || 'Aba incorreta no navegador.')
        } else {
          setNaturalLanguageState('Não foi possível identificar a lista de alunos')
          setNaturalLanguageSubtext(data?.error || 'Verifique se o Google Chrome está com a aba da turma aberta e visível na tela.')
          setResolveErrorMessage(data?.error || 'Nenhum aluno identificado na página aberta.')
        }
      }
    } catch (err: any) {
      setHasResolveFailed(true)
      setNaturalLanguageState('Erro ao comunicar com o navegador dedicado')
      setNaturalLanguageSubtext('Verifique se o Chrome está aberto com o modo de depuração ativado.')
      setResolveErrorMessage(err.message || 'Falha de comunicação.')
    }
  }

  // ─── PASSO 3: GATES E DECISÕES INDIVIDUAIS (PARTE C NO WIZARD) ─────────────

  // Botão em massa: aprova SOMENTE nomes conferidos (válidos e com confiança >= 0.8)
  const handleBatchApproveClean = () => {
    const batchResult = batchApproveWizardStudents(scrapedStudents)
    setScrapedStudents(batchResult.updatedStudents)

    if (batchResult.skippedCount > 0) {
      toast.info(
        `${batchResult.approvedCount} nomes conferidos aprovados no lote. ${batchResult.skippedCount} aluno(s) suspeitos/mononímicos aguardam decisão individual.`
      )
    } else {
      toast.success(`Todos os ${batchResult.approvedCount} alunos foram aprovados no lote!`)
    }
  }

  // Decisão individual para itens suspeitos ou revisões pontuais
  const handleIndividualDecision = (studentId: string, decision: 'approved' | 'rejected') => {
    setScrapedStudents(prev =>
      prev.map(st => (st.id === studentId ? { ...st, decision } : st))
    )
    if (decision === 'approved') {
      toast.success('Aluno confirmado como legítimo no lote.')
    } else {
      toast.info('Item descartado do lote.')
    }
  }

  // ─── PASSO 3: APROVAÇÃO EXPLÍCITA & GRAVAÇÃO PERMANENTE COM GATE ESTRETO ───
  const handleApproveAndSave = () => {
    // 1. Executa o gate de lote por baixo dos panos para qualquer item ainda não avaliado
    const batchResult = batchApproveWizardStudents(scrapedStudents)
    setScrapedStudents(batchResult.updatedStudents)

    // 2. Validação Estrita de Integridade (Parte C): Bloqueia se restarem itens pendentes
    const integrity = validateWizardRosterIntegrity(batchResult.updatedStudents)
    if (!integrity.isValid) {
      toast.warning(integrity.reason || 'Conferência pendente: decida individualmente sobre os itens suspeitos.')
      return
    }

    if (tier === 'api') {
      const approvedStudents = batchResult.updatedStudents.filter(s => s.decision === 'approved')
      const trelloConn: PortalConnection = {
        id: 'trello_main',
        teacher_id: 'default_teacher',
        domain: 'trello.com',
        portal_name: portalName || 'Trello',
        url: 'https://trello.com',
        status: 'mapped_validated',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setFinalConnection(trelloConn)
      setCurrentStep('step_4_complete')
      toast.success(`🎉 Trello conectado com sucesso! (${approvedStudents.length} itens homologados)`)
      if (onConnectionComplete) {
        onConnectionComplete(trelloConn, approvedStudents.length)
      }
      return
    }

    const cleanDomain = domain || 'portal.escola.com.br'
    const approvedStudents = batchResult.updatedStudents.filter(s => s.decision === 'approved')

    // Status final: se era mapped_untested, a aprovação humana promove para mapped_validated
    const finalStatus = resolvedStatus === 'broken_needs_rediscovery'
      ? 'broken_needs_rediscovery'
      : 'mapped_validated'

    const savedConnection = upsertConnection(cleanDomain, {
      name: portalName,
      domain: cleanDomain,
      login_url: portalUrl,
      status: finalStatus,
      map: {
        selector_strategy: 'table_rows',
        semantic_role: 'roster',
        confidence: 'high',
        selectors: { roster_table: 'table' },
        last_validated_at: new Date().toISOString(),
        validation_failures: 0
      }
    })

    // Registra validação humana formal com a contagem dos alunos homologados
    const validLayer: 'layer_1_deterministic' | 'layer_2_vision' =
      layerUsed === 'layer_2_vision' ? 'layer_2_vision' : 'layer_1_deterministic'

    if (finalStatus === 'mapped_validated') {
      validateConnection(savedConnection.id, {
        humanApproved: true,
        wasPartial: false,
        syncData: {
          students_read: approvedStudents.length,
          students_expected: approvedStudents.length,
          layer_used: validLayer
        }
      })
      recordSyncSuccess(savedConnection.id, {
        students_read: approvedStudents.length,
        students_expected: approvedStudents.length,
        was_partial: false,
        layer_used: validLayer
      })
    } else {
      recordSyncFailure(savedConnection.id, 'Homologação rejeitada ou portal quebrado.')
    }

    setFinalConnection(savedConnection)
    setCurrentStep('step_4_complete')
    toast.success(`🎉 Portal "${portalName}" conectado com sucesso! (${approvedStudents.length} alunos homologados)`)

    if (onConnectionComplete) {
      onConnectionComplete(savedConnection, approvedStudents.length)
    }
  }

  // Contagem analítica da prévia
  const previewStats = useMemo(() => {
    const total = scrapedStudents.length
    const clean = scrapedStudents.filter(s => !s.isSuspicious).length
    const suspicious = scrapedStudents.filter(s => s.isSuspicious).length
    const approved = scrapedStudents.filter(s => s.decision === 'approved').length
    const rejected = scrapedStudents.filter(s => s.decision === 'rejected').length
    const pending = scrapedStudents.filter(s => !s.decision || s.decision === 'pending').length
    return { total, clean, suspicious, approved, rejected, pending }
  }, [scrapedStudents])

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(28, 14, 6, 0.7)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: 16
    }}>
      <div style={{
        background: COLOR.surface1,
        borderRadius: RADIUS.xl,
        maxWidth: 680,
        width: '100%',
        padding: '24px 28px',
        boxShadow: SHADOW.lg,
        border: `1px solid ${BORDER.medium}`,
        maxHeight: '90vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 18
      }}>
        {/* Header com Stepper */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${BORDER.soft}`, paddingBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-plug-connected" style={{ fontSize: 22, color: COLOR.accent }} />
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: COLOR.paperInk }}>
                Assistente de Conexão de Plataformas
              </h3>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: TEXT.caption, color: COLOR.paperWarm }}>
              Fluxo guiado de pareamento seguro de portais escolares e ferramentas externas.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: COLOR.paperMid }}
          >
            ×
          </button>
        </div>

        {/* Indicador de Passos (Stepper) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 8px' }}>
          {[
            { key: 'step_1_input', num: '1', label: 'Identificação' },
            { key: 'step_2_resolving', num: '2', label: 'Resolução' },
            { key: 'step_3_preview', num: '3', label: 'Prévia de Dados' },
            { key: 'step_4_complete', num: '4', label: 'Conexão Pronta' },
          ].map((s, idx) => {
            const isCurrent = currentStep === s.key
            const isPassed =
              (currentStep === 'step_2_resolving' && idx < 1) ||
              (currentStep === 'step_3_preview' && idx < 2) ||
              (currentStep === 'step_4_complete' && idx < 3)

            return (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: isCurrent ? COLOR.accent : isPassed ? '#16a34a' : '#e2e8f0',
                  color: isCurrent || isPassed ? '#fff' : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 800
                }}>
                  {isPassed ? '✓' : s.num}
                </div>
                <span style={{
                  fontSize: 11.5,
                  fontWeight: isCurrent ? 800 : 600,
                  color: isCurrent ? COLOR.paperInk : isPassed ? '#16a34a' : COLOR.paperMid,
                  whiteSpace: 'nowrap'
                }}>
                  {s.label}
                </span>
                {idx < 3 && (
                  <div style={{ flex: 1, height: 2, background: isPassed ? '#16a34a' : '#e2e8f0', margin: '0 4px' }} />
                )}
              </div>
            )
          })}
        </div>

        {/* ─── CORPO DO PASSO 1: IDENTIFICAÇÃO ─────────────────────────────── */}
        {currentStep === 'step_1_input' && (
          <form onSubmit={handleStartConnection} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Seletor de Tipo de Conexão */}
            <div style={{ display: 'flex', gap: 8, background: '#faf6f0', padding: 4, borderRadius: RADIUS.md, border: `1px solid ${BORDER.soft}` }}>
              <button
                type="button"
                onClick={() => {
                  setTier('agentic_browser')
                  if (portalName === 'Trello') setPortalName('')
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: RADIUS.sm,
                  border: 'none',
                  background: tier === 'agentic_browser' ? '#ffffff' : 'transparent',
                  color: tier === 'agentic_browser' ? '#2c1a0e' : '#665c54',
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: 'pointer',
                  boxShadow: tier === 'agentic_browser' ? SHADOW.sm : 'none',
                }}
              >
                🏫 Portal Escolar (Navegador)
              </button>
              <button
                type="button"
                onClick={() => {
                  setTier('api')
                  if (!portalName) setPortalName('Trello')
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: RADIUS.sm,
                  border: 'none',
                  background: tier === 'api' ? '#ffffff' : 'transparent',
                  color: tier === 'api' ? '#2c1a0e' : '#665c54',
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: 'pointer',
                  boxShadow: tier === 'api' ? SHADOW.sm : 'none',
                }}
              >
                📋 Trello / Quadros (API)
              </button>
            </div>

            {/* CAMPOS ESPECÍFICOS: PORTAL ESCOLAR */}
            {tier === 'agentic_browser' && (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COLOR.paperInk, marginBottom: 4 }}>
                    Nome do Portal Escolar
                  </label>
                  <input
                    type="text"
                    value={portalName}
                    onChange={e => setPortalName(e.target.value)}
                    placeholder="Ex: Machado Sobrinho, Positivo On, COC, Sala Virtual"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: RADIUS.sm,
                      border: `1px solid ${BORDER.medium}`,
                      fontSize: TEXT.bodyCompact,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COLOR.paperInk, marginBottom: 4 }}>
                    URL da Página de Chamada / Alunos no Chrome
                  </label>
                  <input
                    type="url"
                    value={portalUrl}
                    onChange={e => setPortalUrl(e.target.value)}
                    placeholder="https://paineldoaluno.com.br/chamada"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: RADIUS.sm,
                      border: `1px solid ${BORDER.medium}`,
                      fontSize: TEXT.bodyCompact,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Atalhos Rápidos para Portais Comuns */}
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: COLOR.paperWarm, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Atalhos rápidos:
                  </span>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    {[
                      { name: 'Machado Sobrinho', url: 'https://machadosobrinho.paineldoaluno.com.br/chamada' },
                      { name: 'Sistema Positivo', url: 'https://positivoon.com.br/diariodeclasse' },
                      { name: 'Google Classroom', url: 'https://classroom.google.com/u/0/r' }
                    ].map(p => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => {
                          setPortalName(p.name)
                          setPortalUrl(p.url)
                        }}
                        style={{
                          background: COLOR.surface2,
                          border: `1px solid ${BORDER.soft}`,
                          borderRadius: RADIUS.sm,
                          padding: '4px 10px',
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: COLOR.paperInk,
                          cursor: 'pointer'
                        }}
                      >
                        + {p.name}
                      </button>
                    ))}
                  </div>
                </div>

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
                    <strong>Como funciona:</strong> O assistente conecta diretamente ao seu Google Chrome para ler a lista de alunos sem pedir sua senha. Basta manter a aba da turma aberta no navegador.
                  </div>
                </div>
              </>
            )}

            {/* CAMPOS ESPECÍFICOS: TRELLO (API) */}
            {tier === 'api' && (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COLOR.paperInk, marginBottom: 4 }}>
                    Nome da Conexão
                  </label>
                  <input
                    type="text"
                    value={portalName}
                    onChange={e => setPortalName(e.target.value)}
                    placeholder="Trello"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: RADIUS.sm,
                      border: `1px solid ${BORDER.medium}`,
                      fontSize: TEXT.bodyCompact,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COLOR.paperInk, marginBottom: 4 }}>
                    Chave de API do Trello (API Key)
                  </label>
                  <input
                    type="text"
                    value={trelloApiKey}
                    onChange={e => setTrelloApiKey(e.target.value)}
                    placeholder="Cole sua chave de API aqui"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: RADIUS.sm,
                      border: `1px solid ${BORDER.medium}`,
                      fontSize: TEXT.bodyCompact,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COLOR.paperInk, marginBottom: 4 }}>
                    Token de Autorização
                  </label>
                  <input
                    type="password"
                    value={trelloApiToken}
                    onChange={e => setTrelloApiToken(e.target.value)}
                    placeholder="Cole seu token de acesso aqui"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: RADIUS.sm,
                      border: `1px solid ${BORDER.medium}`,
                      fontSize: TEXT.bodyCompact,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{
                  padding: '12px 14px',
                  borderRadius: RADIUS.md,
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10
                }}>
                  <div style={{ fontSize: 12, color: '#166534', lineHeight: 1.4 }}>
                    <strong>Privacidade Total (BYOK):</strong> Suas credenciais ficam gravadas com segurança no seu computador.
                  </div>
                  <a
                    href="https://trello.com/app-key"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#16a34a',
                      textDecoration: 'underline',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Gerar Chave no Trello ↗
                  </a>
                </div>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '9px 16px',
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
                  padding: '9px 20px',
                  borderRadius: RADIUS.sm,
                  border: 'none',
                  background: COLOR.paperInk,
                  color: '#fff',
                  fontSize: TEXT.bodyCompact,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <i className={tier === 'api' ? 'ti ti-brand-trello' : 'ti ti-browser'} />
                {tier === 'api' ? 'Verificar & Conectar Trello' : 'Abrir Navegador & Conectar'}
              </button>
            </div>
          </form>
        )}

        {/* ─── CORPO DO PASSO 2: RESOLUÇÃO COM LINGUAGEM NATURAL ───────────── */}
        {currentStep === 'step_2_resolving' && (
          <div style={{ padding: '28px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            {!hasResolveFailed ? (
              <>
                <div style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: isDiscovering ? '#fef3c7' : '#dcfce7',
                  color: isDiscovering ? '#d97706' : '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 26
                }}>
                  <i className="ti ti-loader-2 ti-spin" />
                </div>
                <div>
                  <h4 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800, color: COLOR.paperInk }}>
                    {naturalLanguageState}
                  </h4>
                  <p style={{ margin: 0, fontSize: TEXT.bodyCompact, color: COLOR.paperWarm, maxWidth: 480, lineHeight: 1.5 }}>
                    {naturalLanguageSubtext}
                  </p>
                </div>
                <div style={{
                  padding: '6px 12px',
                  borderRadius: RADIUS.full,
                  background: COLOR.surface2,
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: COLOR.paperMid,
                  marginTop: 6
                }}>
                  {isDiscovering ? '🔍 Modo de Descoberta Visual (Camada 2)' : '⚡ Modo Determinístico Direto (Camada 1)'}
                </div>
              </>
            ) : (
              <>
                <div style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 26
                }}>
                  <i className="ti ti-alert-triangle" />
                </div>
                <div>
                  <h4 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800, color: '#991b1b' }}>
                    {naturalLanguageState}
                  </h4>
                  <p style={{ margin: 0, fontSize: TEXT.bodyCompact, color: '#7f1d1d', maxWidth: 480, lineHeight: 1.5 }}>
                    {naturalLanguageSubtext}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    onClick={() => setCurrentStep('step_1_input')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: RADIUS.sm,
                      border: `1px solid ${BORDER.medium}`,
                      background: '#fff',
                      fontSize: TEXT.bodyCompact,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Voltar e ajustar URL
                  </button>
                  <button
                    onClick={handleStartConnection}
                    style={{
                      padding: '8px 16px',
                      borderRadius: RADIUS.sm,
                      border: 'none',
                      background: COLOR.paperInk,
                      color: '#fff',
                      fontSize: TEXT.bodyCompact,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Tentar novamente
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── CORPO DO PASSO 3: PRÉVIA DOS DADOS LIDOS (NOMES REAIS) ───────── */}
        {currentStep === 'step_3_preview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Banner de Homologação se for portal novo */}
            {resolvedStatus === 'mapped_untested' && (
              <div style={{
                padding: '12px 14px',
                borderRadius: RADIUS.md,
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10
              }}>
                <i className="ti ti-shield-check" style={{ fontSize: 20, color: '#2563eb', flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12, color: '#1e40af', lineHeight: 1.5 }}>
                  <strong>Primeira Conexão deste Portal (mapped_untested):</strong> O assistente identificou a lista de chamada.
                  Confira abaixo a prévia dos nomes reais lidos na tela. Nenhum dado será salvo até a sua confirmação explícita.
                </div>
              </div>
            )}

            {/* Banner de Aviso quando há itens suspeitos */}
            {previewStats.suspicious > 0 && previewStats.pending > 0 && (
              <div style={{
                padding: '10px 14px',
                borderRadius: RADIUS.md,
                background: '#fffbeb',
                border: '1px solid #fde68a',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10
              }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: 18, color: '#b45309', flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.4 }}>
                  <strong>Gate de Integridade Ativo:</strong> Detectamos {previewStats.suspicious} nome(s) mononímicos ou com termos suspeitos.
                  O botão em lote aprova SOMENTE nomes conferidos. Itens suspeitos exigem confirmação ou descarte individual antes da homologação final.
                </div>
              </div>
            )}

            {/* Cabeçalho de Métricas da Leitura & Botão em Massa */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: COLOR.surface2,
              padding: '10px 14px',
              borderRadius: RADIUS.md,
              flexWrap: 'wrap',
              gap: 8
            }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 800, color: COLOR.paperInk }}>
                  Alunos na Tela: {previewStats.total}
                </span>
                <span style={{ fontSize: 11, color: COLOR.paperMid, marginLeft: 6 }}>
                  ({previewStats.approved} aprovados • {previewStats.pending} pendentes)
                </span>
                {pagesRead > 1 && (
                  <span style={{ fontSize: 11, color: COLOR.paperMid, marginLeft: 6 }}>
                    • {pagesRead} páginas
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {previewStats.pending > 0 && (
                  <button
                    type="button"
                    onClick={handleBatchApproveClean}
                    style={{
                      background: '#fff',
                      border: '1px solid #16a34a',
                      borderRadius: RADIUS.sm,
                      padding: '5px 12px',
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: '#15803d',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <i className="ti ti-checklist" /> Aprovar todos os nomes conferidos
                  </button>
                )}
                <span style={{
                  padding: '3px 8px',
                  borderRadius: RADIUS.full,
                  fontSize: 11,
                  fontWeight: 700,
                  background: '#dcfce7',
                  color: '#16a34a'
                }}>
                  {previewStats.clean} limpos
                </span>
                {previewStats.suspicious > 0 && (
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: RADIUS.full,
                    fontSize: 11,
                    fontWeight: 700,
                    background: '#fef3c7',
                    color: '#b45309'
                  }}>
                    {previewStats.suspicious} suspeitos
                  </span>
                )}
              </div>
            </div>

            {/* Lista Real dos Alunos com Ações Individuais */}
            <div style={{
              maxHeight: 280,
              overflowY: 'auto',
              border: `1px solid ${BORDER.soft}`,
              borderRadius: RADIUS.md,
              background: '#fff'
            }}>
              {scrapedStudents.map((st, i) => (
                <div
                  key={st.id || st.portal_native_id || `prev_${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 12px',
                    borderBottom: i < scrapedStudents.length - 1 ? `1px solid ${BORDER.soft}` : 'none',
                    background: st.decision === 'rejected'
                      ? '#f8fafc'
                      : st.isSuspicious && st.decision === 'pending'
                        ? '#fffbeb'
                        : '#fff'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: st.decision === 'approved'
                        ? '#dcfce7'
                        : st.decision === 'rejected'
                          ? '#f1f5f9'
                          : st.isSuspicious
                            ? '#fef3c7'
                            : '#e0f2fe',
                      color: st.decision === 'approved'
                        ? '#16a34a'
                        : st.decision === 'rejected'
                          ? '#64748b'
                          : st.isSuspicious
                            ? '#b45309'
                            : '#0369a1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 800
                    }}>
                      {st.decision === 'approved' ? '✓' : st.decision === 'rejected' ? '✕' : i + 1}
                    </div>
                    <div>
                      <div style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: st.decision === 'rejected' ? '#94a3b8' : COLOR.paperInk,
                        textDecoration: st.decision === 'rejected' ? 'line-through' : 'none'
                      }}>
                        {st.name}
                      </div>
                      <div style={{ fontSize: 11, color: COLOR.paperMid }}>
                        Matrícula: {st.rollNumber || st.portal_native_id || 'N/D'} • Turma: {st.className || 'Padrão'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {st.decision === 'approved' ? (
                      <>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          borderRadius: RADIUS.full,
                          fontSize: 10.5,
                          fontWeight: 700,
                          background: '#f0fdf4',
                          color: '#16a34a',
                          border: '1px solid #bbf7d0'
                        }}>
                          <i className="ti ti-check" /> Aprovado
                        </span>
                        <button
                          type="button"
                          onClick={() => handleIndividualDecision(st.id, 'rejected')}
                          title="Descartar este aluno"
                          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}
                        >
                          ✕
                        </button>
                      </>
                    ) : st.decision === 'rejected' ? (
                      <>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          borderRadius: RADIUS.full,
                          fontSize: 10.5,
                          fontWeight: 700,
                          background: '#f1f5f9',
                          color: '#64748b',
                          border: '1px solid #e2e8f0'
                        }}>
                          ✕ Descartado
                        </span>
                        <button
                          type="button"
                          onClick={() => handleIndividualDecision(st.id, 'approved')}
                          title="Restaurar aluno"
                          style={{ background: 'none', border: 'none', color: '#16a34a', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
                        >
                          ↩ Restaurar
                        </button>
                      </>
                    ) : st.isSuspicious ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          borderRadius: RADIUS.full,
                          fontSize: 10.5,
                          fontWeight: 700,
                          background: '#fef3c7',
                          color: '#92400e',
                          border: '1px solid #fde68a'
                        }}>
                          <i className="ti ti-alert-triangle" /> {st.suspiciousReason || 'Nome mononímico'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleIndividualDecision(st.id, 'approved')}
                          style={{
                            background: '#dcfce7',
                            border: '1px solid #86efac',
                            color: '#15803d',
                            borderRadius: RADIUS.sm,
                            padding: '3px 8px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          ✓ Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleIndividualDecision(st.id, 'rejected')}
                          style={{
                            background: '#fee2e2',
                            border: '1px solid #fca5a5',
                            color: '#b91c1c',
                            borderRadius: RADIUS.sm,
                            padding: '3px 8px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          ✕ Descartar
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          borderRadius: RADIUS.full,
                          fontSize: 10.5,
                          fontWeight: 700,
                          background: '#f0fdf4',
                          color: '#16a34a',
                          border: '1px solid #bbf7d0'
                        }}>
                          <i className="ti ti-circle-check" /> Nome válido
                        </span>
                        <button
                          type="button"
                          onClick={() => handleIndividualDecision(st.id, 'approved')}
                          style={{
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            color: '#334155',
                            borderRadius: RADIUS.sm,
                            padding: '3px 8px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          ✓ Aprovar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Rodapé de Ação com Confirmação Explícita e Gate */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setCurrentStep('step_1_input')}
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
                Voltar
              </button>

              <button
                type="button"
                onClick={handleApproveAndSave}
                style={{
                  padding: '10px 20px',
                  borderRadius: RADIUS.sm,
                  border: 'none',
                  background: previewStats.pending > 0 ? '#d97706' : '#15803d',
                  color: '#fff',
                  fontSize: TEXT.bodyCompact,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: SHADOW.sm
                }}
              >
                <i className={previewStats.pending > 0 ? 'ti ti-alert-triangle' : 'ti ti-check'} />
                {previewStats.pending > 0
                  ? `Confirmar e Conectar Portal (${previewStats.pending} pendente${previewStats.pending > 1 ? 's' : ''})`
                  : `Confirmar e Conectar Portal (${previewStats.approved} alunos)`}
              </button>
            </div>
          </div>
        )}

        {/* ─── CORPO DO PASSO 4: STATUS PERMANENTE & CONCLUÍDO ─────────────── */}
        {currentStep === 'step_4_complete' && (
          <div style={{ padding: '24px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: '#dcfce7',
              color: '#16a34a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 30
            }}>
              <i className="ti ti-circle-check" />
            </div>

            <div>
              <h4 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: COLOR.paperInk }}>
                Portal Conectado e Homologado!
              </h4>
              <p style={{ margin: 0, fontSize: TEXT.bodyCompact, color: COLOR.paperWarm, maxWidth: 460, lineHeight: 1.5 }}>
                O portal <strong>{portalName}</strong> foi registrado na base com sucesso. O mapeamento determinístico foi salvo e futuras leituras ocorrerão em alta velocidade sem consumo de visão.
              </p>
            </div>

            {/* Card com Detalhes Permanentes */}
            <div style={{
              background: COLOR.surface2,
              border: `1px solid ${BORDER.soft}`,
              borderRadius: RADIUS.md,
              padding: '12px 18px',
              width: '100%',
              boxSizing: 'border-box',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: 6
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: COLOR.paperWarm, fontWeight: 600 }}>Status do Portal:</span>
                <span style={{ color: '#16a34a', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <i className="ti ti-circle-check" /> Mapeado & Validado (mapped_validated)
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: COLOR.paperWarm, fontWeight: 600 }}>Última Sincronização:</span>
                <span style={{ color: COLOR.paperInk, fontWeight: 700 }}>
                  {new Date().toLocaleString('pt-BR')}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: COLOR.paperWarm, fontWeight: 600 }}>Alunos Vinculados:</span>
                <span style={{ color: COLOR.paperInk, fontWeight: 700 }}>
                  {scrapedStudents.length} alunos
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                marginTop: 8,
                padding: '10px 24px',
                borderRadius: RADIUS.sm,
                border: 'none',
                background: COLOR.paperInk,
                color: '#fff',
                fontSize: TEXT.bodyCompact,
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Concluir e Ver no Painel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
