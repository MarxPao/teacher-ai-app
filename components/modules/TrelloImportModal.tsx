'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from '@/components/Toast'
import {
  TrelloBoard,
  TrelloList,
  TrelloCard,
  getTrelloConfig,
  fetchTrelloBoards,
  fetchTrelloLists,
  fetchTrelloCardsFromMultipleLists,
  fetchTrelloBoardByLink,
  isTrelloConnected,
  isTrelloOnboardingList,
} from '@/lib/trelloClient'
import {
  TrelloRoutingDecision,
  routeTrelloCardsBatch,
  executeTrelloDecisions,
} from '@/lib/trelloRouterEngine'
import { TOOL_DISPLAY_NAMES } from '@/lib/agentTools'
import { COLOR, FONT, TEXT, RADIUS, SHADOW, BORDER, TRANSITION } from '@/styles/tokens'

interface TrelloImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImportSuccess?: (count: number) => void
}

const PREF_LAST_BOARD_KEY = 'teacher_trello_pref_last_board'
const PREF_LAST_LISTS_KEY = 'teacher_trello_pref_last_lists'

type WizardStep = 'select_board' | 'select_lists' | 'review_decisions'

export default function TrelloImportModal({
  isOpen,
  onClose,
  onImportSuccess
}: TrelloImportModalProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [step, setStep] = useState<WizardStep>('select_board')

  // Dados carregados do Trello
  const [boards, setBoards] = useState<TrelloBoard[]>([])
  const [selectedBoard, setSelectedBoard] = useState<TrelloBoard | null>(null)
  
  const [lists, setLists] = useState<TrelloList[]>([])
  const [selectedListIds, setSelectedListIds] = useState<string[]>([])

  const [includeDone, setIncludeDone] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [decisions, setDecisions] = useState<TrelloRoutingDecision[]>([])

  // Estado para Quadro Vinculado Detectado (Confirmação Explícita)
  const [inspectingLinkedBoard, setInspectingLinkedBoard] = useState<{
    url: string
    boardIdOrShortLink: string
  } | null>(null)
  const [linkedBoardPreview, setLinkedBoardPreview] = useState<{
    board: TrelloBoard
    lists: TrelloList[]
    cardCount: number
  } | null>(null)
  const [isLoadingLinkedBoard, setIsLoadingLinkedBoard] = useState(false)

  // 1. Carrega Quadros ao Abrir
  useEffect(() => {
    if (!isOpen) return
    const connected = isTrelloConnected()
    setIsConnected(connected)

    if (connected) {
      const cfg = getTrelloConfig()
      if (cfg) {
        setIsLoading(true)
        fetchTrelloBoards(cfg.apiKey, cfg.apiToken)
          .then(bList => {
            setBoards(bList)
            // Se houver apenas 1 quadro ou preferência salva, seleciona
            const savedBoardId = localStorage.getItem(PREF_LAST_BOARD_KEY)
            const active = bList.find(b => b.id === savedBoardId) || (bList.length === 1 ? bList[0] : null)
            if (active) {
              setSelectedBoard(active)
              setStep('select_lists')
            } else {
              setStep('select_board')
            }
          })
          .catch(err => {
            toast.error(err.message || 'Erro ao carregar quadros do Trello.')
          })
          .finally(() => setIsLoading(false))
      }
    }
  }, [isOpen])

  // 2. Carrega Listas quando um quadro é selecionado
  const loadListsForBoard = useCallback(async (board: TrelloBoard) => {
    const cfg = getTrelloConfig()
    if (!cfg) return

    setSelectedBoard(board)
    localStorage.setItem(PREF_LAST_BOARD_KEY, board.id)
    setIsLoading(true)

    try {
      const lList = await fetchTrelloLists(board.id, cfg.apiKey, cfg.apiToken)
      setLists(lList)

      // Seleção padrão inteligente: marca todas as listas QUE NÃO SÃO onboarding
      const nonOnboarding = lList.filter(l => !isTrelloOnboardingList(l.name)).map(l => l.id)
      setSelectedListIds(nonOnboarding.length > 0 ? nonOnboarding : lList.map(l => l.id))
      setStep('select_lists')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar listas do quadro.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 3. Processa e Roteia Cartões das Listas Selecionadas
  const handleProceedToRouting = async () => {
    if (selectedListIds.length === 0) {
      toast.warning('Selecione ao menos uma lista para importar.')
      return
    }

    const cfg = getTrelloConfig()
    if (!cfg) return

    setIsLoading(true)
    try {
      localStorage.setItem(PREF_LAST_LISTS_KEY, JSON.stringify(selectedListIds))
      
      const selectedListsObjects = lists
        .filter(l => selectedListIds.includes(l.id))
        .map(l => ({ id: l.id, name: l.name }))

      const rawCards = await fetchTrelloCardsFromMultipleLists(selectedListsObjects, cfg.apiKey, cfg.apiToken)

      if (rawCards.length === 0) {
        toast.info('Nenhum cartão encontrado nas listas selecionadas.')
        setIsLoading(false)
        return
      }

      let filteredCards = rawCards
      if (!includeDone) {
        filteredCards = rawCards.filter(c => !c.dueComplete)
      }

      let knownStudents: Array<{ id: string; name: string }> = []
      try {
        const raw = localStorage.getItem('teacher_students')
        if (raw) knownStudents = JSON.parse(raw)
      } catch {}

      const routed = routeTrelloCardsBatch(filteredCards, knownStudents)
      setDecisions(routed)
      setStep('review_decisions')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao processar cartões das listas.')
    } finally {
      setIsLoading(false)
    }
  }

  // 4. Inspeciona Quadro Vinculado com confirmação explícita
  const handleInspectLinkedBoard = async (linkInfo: { url: string; boardIdOrShortLink: string }) => {
    const cfg = getTrelloConfig()
    if (!cfg) return

    setInspectingLinkedBoard(linkInfo)
    setIsLoadingLinkedBoard(true)
    setLinkedBoardPreview(null)

    try {
      const data = await fetchTrelloBoardByLink(linkInfo.boardIdOrShortLink, cfg.apiKey, cfg.apiToken)
      setLinkedBoardPreview(data)
    } catch (err: any) {
      toast.error(`Não foi possível carregar o quadro vinculado: ${err.message}`)
      setInspectingLinkedBoard(null)
    } finally {
      setIsLoadingLinkedBoard(false)
    }
  }

  // 5. Confirma carregar o quadro vinculado no wizard
  const handleConfirmLoadLinkedBoard = () => {
    if (!linkedBoardPreview) return
    loadListsForBoard(linkedBoardPreview.board)
    setInspectingLinkedBoard(null)
    setLinkedBoardPreview(null)
    toast.info(`Quadro "${linkedBoardPreview.board.name}" carregado. Selecione as listas para importar.`)
  }

  // Toggle de seleção de lista individual
  const toggleListSelection = (listId: string) => {
    setSelectedListIds(prev =>
      prev.includes(listId) ? prev.filter(id => id !== listId) : [...prev, listId]
    )
  }

  // Selecionar todas as listas úteis (exceto onboarding)
  const selectAllUsefulLists = () => {
    const useful = lists.filter(l => !isTrelloOnboardingList(l.name)).map(l => l.id)
    setSelectedListIds(useful)
  }

  // Selecionar absolutamente todas
  const selectAllLists = () => {
    setSelectedListIds(lists.map(l => l.id))
  }

  // Limpar seleção
  const clearListSelection = () => {
    setSelectedListIds([])
  }

  // Verifica se o usuário marcou alguma lista de Onboarding
  const hasSelectedOnboardingList = useMemo(() => {
    return lists.some(l => selectedListIds.includes(l.id) && isTrelloOnboardingList(l.name))
  }, [lists, selectedListIds])

  // Contagem de cartões de onboarding detectados na etapa 3
  const onboardingCardsCount = useMemo(() => {
    return decisions.filter(d => d.isOnboarding).length
  }, [decisions])

  // Alternar aprovação de decisão
  const toggleDecisionApproval = (index: number) => {
    setDecisions(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], approved: !copy[index].approved }
      return copy
    })
  }

  // Trocar ferramenta sugerida
  const changeSuggestedTool = (index: number, newTool: string) => {
    setDecisions(prev => {
      const copy = [...prev]
      const current = copy[index]
      const alt = current.alternativeTools.find(a => a.toolName === newTool)
      copy[index] = {
        ...current,
        suggestedTool: newTool,
        suggestedPayload: alt ? alt.payload : current.suggestedPayload
      }
      return copy
    })
  }

  // Aprovar todos os não-onboarding
  const approveAllUseful = () => {
    setDecisions(prev => prev.map(d => ({
      ...d,
      approved: !d.isAlreadyImported && !d.dueComplete && !d.isOnboarding
    })))
  }

  // Desmarcar todos
  const unapproveAll = () => {
    setDecisions(prev => prev.map(d => ({ ...d, approved: false })))
  }

  // Executar Importação
  const handleExecute = async () => {
    const approved = decisions.filter(d => d.approved)
    if (approved.length === 0) {
      toast.warning('Nenhum cartão selecionado para importação.')
      return
    }

    setIsExecuting(true)
    try {
      const res = await executeTrelloDecisions(decisions)
      if (res.errors.length > 0) {
        toast.error(`Importados ${res.executedCount} itens com alguns avisos: ${res.errors[0]}`)
      } else {
        toast.success(`🎉 ${res.executedCount} cartões importados com checklists, anexos e detalhes no app!`)
      }
      if (onImportSuccess) onImportSuccess(res.executedCount)
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Falha ao executar importação agêntica.')
    } finally {
      setIsExecuting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(44,26,14,0.6)',
      backdropFilter: 'blur(5px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      fontFamily: FONT.sans,
    }}>
      <div style={{
        background: COLOR.surface1,
        border: `1px solid ${BORDER.medium}`,
        borderRadius: RADIUS.xl,
        padding: '24px 28px',
        maxWidth: 820,
        width: '100%',
        boxShadow: SHADOW.lg,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        maxHeight: '92vh',
        overflowY: 'auto',
      }}>
        {/* Header do Modal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${BORDER.soft}`, paddingBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-trello" style={{ fontSize: 22, color: '#0079bf' }} />
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: COLOR.paperInk }}>
                Importação Agêntica Profunda do Trello
              </h3>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: TEXT.caption, color: COLOR.paperWarm }}>
              Importa cartões com checklists internos completos, anexos, comentários e quadros vinculados.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 22, color: COLOR.paperMid, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        {/* Indicador de Passos (Wizard) */}
        <div style={{ display: 'flex', gap: 6, background: COLOR.surface2, padding: 4, borderRadius: RADIUS.md, border: `1px solid ${BORDER.soft}` }}>
          {[
            { id: 'select_board', label: '1. Quadro (Board)', icon: 'ti-layout-board' },
            { id: 'select_lists', label: '2. Selecionar Listas', icon: 'ti-list-check' },
            { id: 'review_decisions', label: '3. Revisão com IA & Detalhes', icon: 'ti-sparkles' },
          ].map((s) => {
            const isActive = step === s.id
            return (
              <div
                key={s.id}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: RADIUS.sm,
                  background: isActive ? COLOR.paperInk : 'transparent',
                  color: isActive ? '#fff' : COLOR.paperWarm,
                  fontSize: TEXT.caption,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  transition: TRANSITION.fast,
                }}
              >
                <i className={`ti ${s.icon}`} />
                <span>{s.label}</span>
              </div>
            )
          })}
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            PASSO 1: SELEÇÃO DE QUADRO
           ══════════════════════════════════════════════════════════════════════ */}
        {step === 'select_board' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: COLOR.paperInk }}>
                Seus Quadros Disponíveis ({boards.length}):
              </span>
            </div>

            {isLoading ? (
              <div style={{ padding: 30, textAlign: 'center', color: COLOR.paperWarm }}>
                <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 24, marginBottom: 8, display: 'block' }} />
                Buscando quadros da sua conta do Trello...
              </div>
            ) : boards.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', background: COLOR.surface2, borderRadius: RADIUS.md }}>
                Nenhum quadro aberto encontrado na sua conta.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                {boards.map(b => (
                  <div
                    key={b.id}
                    onClick={() => loadListsForBoard(b)}
                    style={{
                      padding: 16,
                      borderRadius: RADIUS.lg,
                      border: selectedBoard?.id === b.id ? `2px solid ${COLOR.accent}` : `1px solid ${BORDER.medium}`,
                      background: selectedBoard?.id === b.id ? 'rgba(139,94,60,0.1)' : COLOR.surface1,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      boxShadow: SHADOW.sm,
                      transition: TRANSITION.fast,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 32, height: 32, borderRadius: RADIUS.sm, background: '#0079bf', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                        <i className="ti ti-layout-board" style={{ fontSize: 18 }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: COLOR.paperInk }}>{b.name}</div>
                        <div style={{ fontSize: 11, color: COLOR.paperWarm }}>{b.desc || 'Quadro ativo'}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => loadListsForBoard(b)}
                      style={{
                        marginTop: 4,
                        padding: '6px 12px',
                        borderRadius: RADIUS.sm,
                        border: 'none',
                        background: COLOR.accent,
                        color: '#fff',
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4
                      }}
                    >
                      <span>Ver Listas & Selecionar</span>
                      <i className="ti ti-arrow-right" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            PASSO 2: SELEÇÃO DE LISTAS (COM FILTRO DE ONBOARDING)
           ══════════════════════════════════════════════════════════════════════ */}
        {step === 'select_lists' && selectedBoard && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Header com Nome do Quadro e Botão de Trocar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: COLOR.surface2, padding: '10px 14px', borderRadius: RADIUS.md }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="ti ti-layout-board" style={{ color: '#0079bf', fontSize: 16 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: COLOR.paperInk }}>
                  Quadro: <strong>{selectedBoard.name}</strong> ({lists.length} listas encontradas)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setStep('select_board')}
                style={{ background: 'none', border: 'none', color: COLOR.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                ← Trocar Quadro
              </button>
            </div>

            {/* Ações de Seleção Rápida */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={selectAllUsefulLists}
                  style={{ padding: '6px 12px', borderRadius: RADIUS.sm, border: `1px solid ${BORDER.medium}`, background: COLOR.surface1, fontSize: 11.5, fontWeight: 700, color: COLOR.accent, cursor: 'pointer' }}
                >
                  ✨ Selecionar Todas as Listas de Conteúdo
                </button>
                <button
                  type="button"
                  onClick={selectAllLists}
                  style={{ padding: '6px 10px', borderRadius: RADIUS.sm, border: `1px solid ${BORDER.soft}`, background: COLOR.surface2, fontSize: 11.5, fontWeight: 600, color: COLOR.paperWarm, cursor: 'pointer' }}
                >
                  Marcar Todas
                </button>
                <button
                  type="button"
                  onClick={clearListSelection}
                  style={{ padding: '6px 10px', borderRadius: RADIUS.sm, border: `1px solid ${BORDER.soft}`, background: COLOR.surface2, fontSize: 11.5, fontWeight: 600, color: COLOR.paperWarm, cursor: 'pointer' }}
                >
                  Limpar
                </button>
              </div>

              <span style={{ fontSize: 12, fontWeight: 700, color: COLOR.paperWarm }}>
                {selectedListIds.length} de {lists.length} listas selecionadas
              </span>
            </div>

            {/* Alerta se o usuário marcou a lista de Onboarding */}
            {hasSelectedOnboardingList && (
              <div style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: RADIUS.md,
                padding: '10px 14px',
                fontSize: 12,
                color: '#92400e',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: 16, marginTop: 1, flexShrink: 0 }} />
                <div>
                  <strong>Aviso sobre Conteúdo Padrão:</strong> Você selecionou a lista <em>"Guia de introdução ao Trello"</em>. Esta lista contém tutoriais do Trello/Atlassian (ex: "Baixe o app", "Capture do Slack"), não tarefas escolares suas. Se não desejar importá-la, recomendamos desmarcá-la.
                </div>
              </div>
            )}

            {/* Grade de Listas Reais */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
              {lists.map(l => {
                const isSelected = selectedListIds.includes(l.id)
                const isOnboarding = isTrelloOnboardingList(l.name)

                return (
                  <div
                    key={l.id}
                    onClick={() => toggleListSelection(l.id)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: RADIUS.md,
                      border: isSelected
                        ? (isOnboarding ? '2px solid #f59e0b' : `2px solid ${COLOR.accent}`)
                        : `1px solid ${BORDER.medium}`,
                      background: isSelected
                        ? (isOnboarding ? '#fffbeb' : 'rgba(139,94,60,0.08)')
                        : COLOR.surface1,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      transition: TRANSITION.fast,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleListSelection(l.id)}
                      onClick={e => e.stopPropagation()}
                      style={{ marginTop: 3, cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.paperInk }}>
                        {l.name}
                      </div>
                      {isOnboarding ? (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: RADIUS.sm,
                          background: '#fef3c7',
                          color: '#b45309',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          marginTop: 4
                        }}>
                          <i className="ti ti-alert-circle" style={{ fontSize: 10 }} />
                          Guia Padrão (Onboarding)
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: COLOR.paperWarm }}>
                          Conteúdo escolar / tarefas
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Opção de Concluídos & Botão de Avanço */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${BORDER.soft}`, paddingTop: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: COLOR.paperWarm, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={includeDone}
                  onChange={e => setIncludeDone(e.target.checked)}
                />
                <span>Incluir cartões já marcados como concluídos</span>
              </label>

              <button
                type="button"
                onClick={handleProceedToRouting}
                disabled={selectedListIds.length === 0 || isLoading}
                style={{
                  padding: '9px 20px',
                  borderRadius: RADIUS.md,
                  border: 'none',
                  background: selectedListIds.length === 0 ? COLOR.paperMid : COLOR.accent,
                  color: '#fff',
                  fontSize: TEXT.bodyCompact,
                  fontWeight: 700,
                  cursor: selectedListIds.length === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: SHADOW.sm,
                }}
              >
                {isLoading ? (
                  <>
                    <i className="ti ti-loader-2 ti-spin" />
                    <span>Lendo cartões, checklists e anexos...</span>
                  </>
                ) : (
                  <>
                    <span>Analisar com IA ({selectedListIds.length} listas)</span>
                    <i className="ti ti-arrow-right" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            PASSO 3: REVISÃO AGÊNTICA & CONFIRMAÇÃO DE ROTEAMENTO (LEITURA PROFUNDA)
           ══════════════════════════════════════════════════════════════════════ */}
        {step === 'review_decisions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Header da Revisão */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: COLOR.surface2, padding: '10px 14px', borderRadius: RADIUS.md }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: COLOR.paperInk }}>
                  {decisions.filter(d => d.approved).length} de {decisions.length} cartões aprovados para importação
                </span>
              </div>
              <button
                type="button"
                onClick={() => setStep('select_lists')}
                style={{ background: 'none', border: 'none', color: COLOR.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                ← Voltar e Ajustar Listas
              </button>
            </div>

            {/* Modal/Dialog de Inspecionar Quadro Vinculado */}
            {inspectingLinkedBoard && (
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: RADIUS.md,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="ti ti-link" style={{ fontSize: 18, color: '#16a34a' }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#166534' }}>
                    Quadro Trello Vinculado Detectado
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#14532d' }}>
                  Link: <code>{inspectingLinkedBoard.url}</code>
                </div>

                {isLoadingLinkedBoard ? (
                  <div style={{ fontSize: 12, color: '#15803d', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ti ti-loader-2 ti-spin" />
                    <span>Buscando detalhes do quadro vinculado na API...</span>
                  </div>
                ) : linkedBoardPreview ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                    <div style={{ fontSize: 12, color: '#166534' }}>
                      📦 Quadro: <strong>{linkedBoardPreview.board.name}</strong> ({linkedBoardPreview.lists.length} listas, {linkedBoardPreview.cardCount} cartões)
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={handleConfirmLoadLinkedBoard}
                        style={{
                          padding: '6px 14px',
                          borderRadius: RADIUS.sm,
                          border: 'none',
                          background: '#16a34a',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        📥 Sim, Carregar e Selecionar Listas deste Quadro
                      </button>
                      <button
                        type="button"
                        onClick={() => setInspectingLinkedBoard(null)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: RADIUS.sm,
                          border: '1px solid #bbf7d0',
                          background: '#fff',
                          color: '#166534',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Não, Apenas Importar como Link
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Alerta de Cartões de Onboarding Detectados */}
            {onboardingCardsCount > 0 && (
              <div style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: RADIUS.md,
                padding: '10px 14px',
                fontSize: 12,
                color: '#92400e',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}>
                <i className="ti ti-shield-alert" style={{ fontSize: 16, marginTop: 1, flexShrink: 0 }} />
                <div>
                  <strong>Filtro de Proteção Ativo:</strong> Detectamos {onboardingCardsCount} cartão(ões) com conteúdo de introdução da Atlassian/Trello. Eles foram <strong>desmarcados por padrão</strong>.
                </div>
              </div>
            )}

            {/* Ações em Lote */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={approveAllUseful}
                style={{ padding: '4px 10px', borderRadius: RADIUS.sm, border: `1px solid ${BORDER.medium}`, background: COLOR.surface1, fontSize: 11, fontWeight: 700, color: COLOR.accent, cursor: 'pointer' }}
              >
                Aprovar Todos os Cartões Úteis
              </button>
              <button
                type="button"
                onClick={unapproveAll}
                style={{ padding: '4px 10px', borderRadius: RADIUS.sm, border: `1px solid ${BORDER.soft}`, background: COLOR.surface2, fontSize: 11, fontWeight: 600, color: COLOR.paperWarm, cursor: 'pointer' }}
              >
                Desmarcar Todos
              </button>
            </div>

            {/* Lista de Cartões Roteados com Checklists, Anexos e Comentários */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
              {decisions.map((d, idx) => {
                return (
                  <div
                    key={d.cardId || idx}
                    style={{
                      padding: '12px 14px',
                      borderRadius: RADIUS.md,
                      border: d.approved ? `1px solid ${BORDER.medium}` : `1px solid ${BORDER.soft}`,
                      background: d.approved ? COLOR.surface1 : COLOR.surface2,
                      opacity: d.approved ? 1 : 0.65,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      transition: TRANSITION.fast,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={d.approved}
                      onChange={() => toggleDecisionApproval(idx)}
                      style={{ marginTop: 4, cursor: 'pointer' }}
                    />

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* Título & Badges */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: COLOR.paperInk }}>
                          {d.cardName}
                        </span>

                        {d.listName && (
                          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: RADIUS.sm, background: 'rgba(0,121,191,0.1)', color: '#0079bf' }}>
                            📋 {d.listName}
                          </span>
                        )}

                        {d.checkItems.length > 0 && (
                          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: RADIUS.sm, background: 'rgba(34,197,94,0.12)', color: '#15803d', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <i className="ti ti-list-check" style={{ fontSize: 11 }} />
                            {d.checkItems.length} subtarefas
                          </span>
                        )}

                        {d.attachments && d.attachments.length > 0 && (
                          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: RADIUS.sm, background: 'rgba(168,85,247,0.12)', color: '#7e22ce', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <i className="ti ti-paperclip" style={{ fontSize: 11 }} />
                            {d.attachments.length} anexo(s)
                          </span>
                        )}

                        {d.comments && d.comments.length > 0 && (
                          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: RADIUS.sm, background: 'rgba(234,88,12,0.12)', color: '#c2410c', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <i className="ti ti-message-circle" style={{ fontSize: 11 }} />
                            {d.comments.length} comentário(s)
                          </span>
                        )}

                        {d.isOnboarding && (
                          <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: RADIUS.sm, background: '#fef3c7', color: '#b45309' }}>
                            ⚠️ Onboarding Trello
                          </span>
                        )}

                        {d.due && (
                          <span style={{ fontSize: 10.5, color: COLOR.paperWarm, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                            <i className="ti ti-calendar" style={{ fontSize: 11 }} />
                            {new Date(d.due).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>

                      {/* Descrição do Cartão */}
                      {d.cardDesc && (
                        <div style={{ fontSize: 11.5, color: COLOR.paperWarm, lineHeight: 1.4 }}>
                          {d.cardDesc.length > 150 ? d.cardDesc.slice(0, 150) + '...' : d.cardDesc}
                        </div>
                      )}

                      {/* Subtarefas / Checklists Internos */}
                      {d.checkItems.length > 0 && (
                        <div style={{
                          background: 'rgba(44,26,14,0.03)',
                          border: `1px dashed ${BORDER.soft}`,
                          borderRadius: RADIUS.sm,
                          padding: '6px 10px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 3,
                          marginTop: 2
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: COLOR.paperInk, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <i className="ti ti-checkbox" style={{ color: COLOR.accent }} />
                            <span>Itens do Checklist Interno ({d.checkItems.length}):</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 4 }}>
                            {d.checkItems.slice(0, 6).map((ci, cIdx) => (
                              <div key={ci.id || cIdx} style={{ fontSize: 11, color: ci.state === 'complete' ? COLOR.paperMid : COLOR.paperInk, textDecoration: ci.state === 'complete' ? 'line-through' : 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span>{ci.state === 'complete' ? '☑' : '☐'}</span>
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ci.name}</span>
                              </div>
                            ))}
                            {d.checkItems.length > 6 && (
                              <span style={{ fontSize: 10.5, color: COLOR.paperMid, fontStyle: 'italic' }}>
                                ... e mais {d.checkItems.length - 6} itens
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Anexos e Comentários Detectados */}
                      {( (d.attachments && d.attachments.length > 0) || (d.comments && d.comments.length > 0) ) && (
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: COLOR.paperWarm, marginTop: 2 }}>
                          {d.attachments && d.attachments.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <i className="ti ti-paperclip" style={{ color: '#7e22ce' }} />
                              <span>{d.attachments.map(a => a.name).join(', ')}</span>
                            </div>
                          )}
                          {d.comments && d.comments.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <i className="ti ti-message" style={{ color: '#c2410c' }} />
                              <span>"{d.comments[0].text.slice(0, 50)}..."</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Aviso de Quadro Vinculado com Botão de Confirmação */}
                      {d.linkedBoard && (
                        <div style={{
                          background: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          borderRadius: RADIUS.sm,
                          padding: '6px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          marginTop: 4
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#166534' }}>
                            <i className="ti ti-link" />
                            <span>Link para outro quadro do Trello detectado: <strong>{d.linkedBoard.boardIdOrShortLink}</strong></span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleInspectLinkedBoard(d.linkedBoard!)}
                            style={{
                              padding: '3px 8px',
                              borderRadius: RADIUS.sm,
                              border: '1px solid #16a34a',
                              background: '#fff',
                              color: '#166534',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            🔍 Inspecionar Quadro Vinculado
                          </button>
                        </div>
                      )}

                      {/* Seletor de Ferramenta & Explicação da IA */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: COLOR.paperWarm }}>Destino:</span>
                          <select
                            value={d.suggestedTool}
                            onChange={e => changeSuggestedTool(idx, e.target.value)}
                            style={{
                              padding: '3px 8px',
                              borderRadius: RADIUS.sm,
                              border: `1px solid ${BORDER.medium}`,
                              background: '#fff',
                              fontSize: 11,
                              fontWeight: 700,
                              color: COLOR.paperInk,
                              cursor: 'pointer'
                            }}
                          >
                            <option value="add_todo">📌 To-Do / Checklist</option>
                            <option value="create_calendar_task">📅 Evento no Calendário</option>
                            <option value="create_lesson_plan">📖 Plano de Aula</option>
                            <option value="generate_exam_content">📝 Prova / Avaliação</option>
                            <option value="record_student_observation">🧠 Memória do Aluno</option>
                            <option value="generate_parent_communication">💬 Comunicado aos Pais</option>
                          </select>
                        </div>

                        <span style={{ fontSize: 11, color: COLOR.paperMid, fontStyle: 'italic' }}>
                          💡 {d.reasoning}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer com Botão de Executar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${BORDER.soft}`, paddingTop: 14 }}>
              <button
                type="button"
                onClick={onClose}
                style={{ padding: '8px 16px', borderRadius: RADIUS.md, border: `1px solid ${BORDER.medium}`, background: COLOR.surface2, color: COLOR.paperWarm, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleExecute}
                disabled={isExecuting || decisions.filter(d => d.approved).length === 0}
                style={{
                  padding: '9px 24px',
                  borderRadius: RADIUS.md,
                  border: 'none',
                  background: COLOR.accent,
                  color: '#fff',
                  fontSize: TEXT.bodyCompact,
                  fontWeight: 800,
                  cursor: isExecuting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: SHADOW.md,
                }}
              >
                {isExecuting ? (
                  <>
                    <i className="ti ti-loader-2 ti-spin" />
                    <span>Importando...</span>
                  </>
                ) : (
                  <>
                    <i className="ti ti-check" />
                    <span>Importar {decisions.filter(d => d.approved).length} Cartões Aprovados</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
