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
  fetchTrelloCardsFromList,
  isTrelloConnected
} from '@/lib/trelloClient'
import {
  TrelloRoutingDecision,
  routeTrelloCardsBatch,
  executeTrelloDecisions
} from '@/lib/trelloRouterEngine'
import { TOOL_DISPLAY_NAMES } from '@/lib/agentTools'

interface TrelloImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImportSuccess?: (count: number) => void
}

const PREF_LAST_BOARD_KEY = 'teacher_trello_pref_last_board'
const PREF_LAST_LIST_KEY = 'teacher_trello_pref_last_list'

export default function TrelloImportModal({
  isOpen,
  onClose,
  onImportSuccess
}: TrelloImportModalProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [boards, setBoards] = useState<TrelloBoard[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState<string>('')
  const [lists, setLists] = useState<TrelloList[]>([])
  const [selectedListId, setSelectedListId] = useState<string>('')
  const [includeDone, setIncludeDone] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [decisions, setDecisions] = useState<TrelloRoutingDecision[]>([])

  // Verifica conexão ao abrir
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
            const savedBoardId = localStorage.getItem(PREF_LAST_BOARD_KEY)
            const activeBoard = bList.find(b => b.id === savedBoardId) || bList[0]
            if (activeBoard) {
              setSelectedBoardId(activeBoard.id)
            }
          })
          .catch(err => {
            toast.error(err.message || 'Erro ao carregar quadros do Trello.')
          })
          .finally(() => setIsLoading(false))
      }
    }
  }, [isOpen])

  // Busca listas do quadro selecionado
  useEffect(() => {
    if (!selectedBoardId || !isConnected) return
    const cfg = getTrelloConfig()
    if (!cfg) return

    localStorage.setItem(PREF_LAST_BOARD_KEY, selectedBoardId)
    setIsLoading(true)

    fetchTrelloLists(selectedBoardId, cfg.apiKey, cfg.apiToken)
      .then(lList => {
        setLists(lList)
        const savedListId = localStorage.getItem(PREF_LAST_LIST_KEY)
        const activeList = lList.find(l => l.id === savedListId) || lList[0]
        if (activeList) {
          setSelectedListId(activeList.id)
        } else {
          setSelectedListId('')
          setDecisions([])
        }
      })
      .catch(err => {
        toast.error(err.message || 'Erro ao carregar listas.')
      })
      .finally(() => setIsLoading(false))
  }, [selectedBoardId, isConnected])

  // Carrega cartões da lista e processa roteamento de IA
  const loadCardsAndRoute = useCallback(async () => {
    if (!selectedListId || !isConnected) return
    const cfg = getTrelloConfig()
    if (!cfg) return

    localStorage.setItem(PREF_LAST_LIST_KEY, selectedListId)
    setIsLoading(true)

    try {
      let knownStudents: Array<{ id: string; name: string }> = []
      try {
        const raw = localStorage.getItem('teacher_students')
        if (raw) knownStudents = JSON.parse(raw)
      } catch {}

      const rawCards = await fetchTrelloCardsFromList(selectedListId, cfg.apiKey, cfg.apiToken)

      // Filtra cartões de listas Done ou concluídos se includeDone for false
      const currentListObj = lists.find(l => l.id === selectedListId)
      const isDoneList = currentListObj ? /done|conclu[ií]d|finaliz/i.test(currentListObj.name) : false

      let filteredCards = rawCards
      if (!includeDone && isDoneList) {
        filteredCards = rawCards.filter(c => !c.dueComplete)
      } else if (!includeDone) {
        filteredCards = rawCards.filter(c => !c.dueComplete)
      }

      const routed = routeTrelloCardsBatch(filteredCards, knownStudents)
      setDecisions(routed)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao processar cartões da lista.')
    } finally {
      setIsLoading(false)
    }
  }, [selectedListId, isConnected, lists, includeDone])

  useEffect(() => {
    loadCardsAndRoute()
  }, [loadCardsAndRoute])

  // Métricas
  const approvedCount = useMemo(() => decisions.filter(d => d.approved).length, [decisions])
  const highConfidenceCount = useMemo(() => decisions.filter(d => d.confidence === 'high').length, [decisions])
  const needsChoiceCount = useMemo(() => decisions.filter(d => d.confidence !== 'high').length, [decisions])

  // Alternar aprovação individual
  const toggleItemApproval = (index: number) => {
    setDecisions(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], approved: !copy[index].approved }
      return copy
    })
  }

  // Alternar seleção de todos
  const handleSelectAllHighConfidence = () => {
    setDecisions(prev => prev.map(d => ({
      ...d,
      approved: d.confidence === 'high' && !d.isAlreadyImported
    })))
  }

  const handleSelectAll = (select: boolean) => {
    setDecisions(prev => prev.map(d => ({ ...d, approved: select })))
  }

  // Alterar ferramenta de destino de um cartão
  const handleSelectAlternativeTool = (cardIndex: number, toolName: string, payload: Record<string, any>) => {
    setDecisions(prev => {
      const copy = [...prev]
      copy[cardIndex] = {
        ...copy[cardIndex],
        suggestedTool: toolName,
        suggestedPayload: { ...copy[cardIndex].suggestedPayload, ...payload },
        confidence: 'high',
        confidenceScore: 0.95,
        approved: true
      }
      return copy
    })
  }

  // Alternar modo de checklist (subtarefas vs tarefas separadas)
  const toggleChecklistMode = (cardIndex: number) => {
    setDecisions(prev => {
      const copy = [...prev]
      copy[cardIndex] = {
        ...copy[cardIndex],
        importChecklistAsSubtasks: !copy[cardIndex].importChecklistAsSubtasks
      }
      return copy
    })
  }

  // Executar importação final
  const handleConfirmImport = async () => {
    if (approvedCount === 0) {
      toast.error('Selecione ao menos um cartão para importar.')
      return
    }

    setIsExecuting(true)
    try {
      const { executedCount, errors } = await executeTrelloDecisions(decisions)
      if (errors.length > 0) {
        toast.error(`Importados ${executedCount} itens com ${errors.length} avisos.`)
      } else {
        toast.success(`🎉 ${executedCount} itens do Trello importados com sucesso!`)
      }

      if (onImportSuccess) onImportSuccess(executedCount)
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao executar importação.')
    } finally {
      setIsExecuting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(44, 26, 14, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: 16
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: 18,
        maxWidth: 860,
        width: '100%',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.3)',
        border: '1.5px solid #0079bf',
        overflow: 'hidden'
      }}>
        {/* ─── CABEÇALHO DO MODAL ────────────────────────────────────────── */}
        <div style={{
          padding: '16px 24px',
          background: 'linear-gradient(135deg, #0079bf 0%, #026aa7 100%)',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: '#ffffff',
              color: '#0079bf',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20
            }}>
              <i className="ti ti-layout-kanban" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                Importar do Trello (Roteador Agêntico da Rafinha)
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, opacity: 0.9 }}>
                Classificação automática para To-Dos, Calendário, Memória de Alunos e Planos com confirmação humana.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              color: '#ffffff',
              fontSize: 16,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>

        {/* ─── CORPO DO MODAL ────────────────────────────────────────────── */}
        <div style={{ padding: '18px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!isConnected ? (
            <div style={{
              padding: 32,
              textAlign: 'center',
              background: '#f8fafc',
              borderRadius: 14,
              border: '1.5px dashed #cbd5e1'
            }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🔌</div>
              <h4 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                Trello não conectado
              </h4>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', maxWidth: 460, marginInline: 'auto' }}>
                Para importar seus cartões e checklists, vincule sua conta do Trello na aba <strong>Portais & Extensões</strong> em menos de 1 minuto (100% BYOK).
              </p>
              <button
                onClick={onClose}
                style={{
                  background: '#0079bf',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '9px 18px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Ir para Portais & Extensões
              </button>
            </div>
          ) : (
            <>
              {/* Seletores Rápidos de Quadro e Lista (Smart Defaults) */}
              <div style={{
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: 12,
                padding: '14px 16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
                alignItems: 'center'
              }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#0369a1', marginBottom: 4 }}>
                    📋 Quadro do Trello:
                  </label>
                  <select
                    value={selectedBoardId}
                    onChange={e => setSelectedBoardId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 8,
                      border: '1px solid #7dd3fc',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#0c4a6e',
                      background: '#ffffff'
                    }}
                  >
                    {boards.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#0369a1', marginBottom: 4 }}>
                    📂 Lista / Coluna:
                  </label>
                  <select
                    value={selectedListId}
                    onChange={e => setSelectedListId(e.target.value)}
                    disabled={lists.length === 0}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 8,
                      border: '1px solid #7dd3fc',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#0c4a6e',
                      background: '#ffffff'
                    }}
                  >
                    {lists.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 16 }}>
                  <input
                    type="checkbox"
                    id="chk_include_done"
                    checked={includeDone}
                    onChange={e => setIncludeDone(e.target.checked)}
                    style={{ cursor: 'pointer', width: 16, height: 16 }}
                  />
                  <label htmlFor="chk_include_done" style={{ fontSize: 12, fontWeight: 600, color: '#0369a1', cursor: 'pointer' }}>
                    Incluir concluídos como histórico
                  </label>
                </div>
              </div>

              {/* Barra de Métricas e Ações em Lote */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1e293b' }}>
                    {decisions.length} cartões detectados
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: '#e0f2fe', color: '#0369a1' }}>
                    ✓ {approvedCount} selecionados
                  </span>
                  {needsChoiceCount > 0 && (
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: '#fef3c7', color: '#b45309' }}>
                      ⚠️ {needsChoiceCount} requerem conferência
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleSelectAllHighConfidence}
                    style={{
                      background: '#faf6f0',
                      border: '1px solid #d5c8bb',
                      borderRadius: 6,
                      padding: '5px 10px',
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: '#7a5c42',
                      cursor: 'pointer'
                    }}
                  >
                    Marcar Alta Confiança
                  </button>
                  <button
                    onClick={() => handleSelectAll(approvedCount < decisions.length)}
                    style={{
                      background: '#faf6f0',
                      border: '1px solid #d5c8bb',
                      borderRadius: 6,
                      padding: '5px 10px',
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: '#7a5c42',
                      cursor: 'pointer'
                    }}
                  >
                    {approvedCount === decisions.length ? 'Desmarcar Todos' : 'Marcar Todos'}
                  </button>
                </div>
              </div>

              {/* Lista de Cartões com Roteamento Agêntico */}
              {isLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#0079bf', fontSize: 13 }}>
                  ⚡ Analisando cartões com o catálogo agêntico da Rafinha...
                </div>
              ) : decisions.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', background: '#faf6f0', borderRadius: 12, color: '#665c54', fontSize: 13 }}>
                  Nenhum cartão elegível encontrado nesta lista do Trello.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {decisions.map((dec, idx) => {
                    const toolMeta = TOOL_DISPLAY_NAMES[dec.suggestedTool] || {
                      label: dec.suggestedTool,
                      icon: 'ti-wand',
                      color: '#8b5e3c'
                    }

                    return (
                      <div
                        key={dec.cardId}
                        style={{
                          background: dec.approved ? '#ffffff' : '#f8fafc',
                          border: `1.5px solid ${dec.approved ? '#0079bf' : '#e2e8f0'}`,
                          borderRadius: 12,
                          padding: '14px 16px',
                          transition: 'all 0.15s ease',
                          opacity: dec.approved ? 1 : 0.8
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          {/* Checkbox de Seleção */}
                          <input
                            type="checkbox"
                            checked={dec.approved}
                            onChange={() => toggleItemApproval(idx)}
                            style={{ marginTop: 3, width: 18, height: 18, cursor: 'pointer' }}
                          />

                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                              <div>
                                <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                                  {dec.cardName}
                                </span>

                                {/* Labels do Trello */}
                                {dec.labels.map((lbl, lIdx) => (
                                  <span
                                    key={lIdx}
                                    style={{
                                      marginLeft: 6,
                                      fontSize: 10.5,
                                      fontWeight: 700,
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      background: '#f1f5f9',
                                      color: '#475569'
                                    }}
                                  >
                                    🏷️ {lbl}
                                  </span>
                                ))}

                                {dec.isAlreadyImported && (
                                  <span style={{
                                    marginLeft: 6,
                                    fontSize: 10.5,
                                    fontWeight: 700,
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    background: '#ecfdf5',
                                    color: '#059669'
                                  }}>
                                    ✓ Já Importado
                                  </span>
                                )}
                              </div>

                              {/* Badge de Ferramenta Alvo */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{
                                  fontSize: 11.5,
                                  fontWeight: 800,
                                  padding: '3px 8px',
                                  borderRadius: 6,
                                  background: `${toolMeta.color}15`,
                                  color: toolMeta.color,
                                  border: `1px solid ${toolMeta.color}40`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4
                                }}>
                                  <i className={toolMeta.icon} /> Destino: {toolMeta.label}
                                </span>

                                <span style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  padding: '3px 6px',
                                  borderRadius: 4,
                                  background: dec.confidence === 'high' ? '#dcfce7' : '#fef3c7',
                                  color: dec.confidence === 'high' ? '#15803d' : '#b45309'
                                }}>
                                  {Math.round(dec.confidenceScore * 100)}% Confiança
                                </span>
                              </div>
                            </div>

                            {/* Descrição e Raciocínio da IA */}
                            {dec.cardDesc && (
                              <p style={{ margin: '4px 0', fontSize: 12, color: '#64748b', lineHeight: 1.3 }}>
                                {dec.cardDesc}
                              </p>
                            )}

                            <div style={{ fontSize: 11.5, color: '#8b5e3c', fontWeight: 600, marginTop: 4 }}>
                              🤖 <em>{dec.reasoning}</em>
                            </div>

                            {/* Checklist do Cartão */}
                            {dec.checkItems.length > 0 && (
                              <div style={{
                                marginTop: 8,
                                padding: '8px 12px',
                                background: '#f8fafc',
                                borderRadius: 8,
                                border: '1px dashed #cbd5e1'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#334155' }}>
                                    ☑️ Checklists ({dec.checkItems.length} subitens):
                                  </span>
                                  <button
                                    onClick={() => toggleChecklistMode(idx)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#0079bf',
                                      fontSize: 11,
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      textDecoration: 'underline'
                                    }}
                                  >
                                    {dec.importChecklistAsSubtasks ? 'Modo: Subtarefas anexas' : 'Modo: Criar tarefas separadas'}
                                  </button>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                  {dec.checkItems.map(ci => (
                                    <span
                                      key={ci.id}
                                      style={{
                                        fontSize: 11,
                                        padding: '2px 6px',
                                        borderRadius: 4,
                                        background: ci.state === 'complete' ? '#e2e8f0' : '#ffffff',
                                        border: '1px solid #e2e8f0',
                                        color: ci.state === 'complete' ? '#94a3b8' : '#334155',
                                        textDecoration: ci.state === 'complete' ? 'line-through' : 'none'
                                      }}
                                    >
                                      {ci.state === 'complete' ? '☑' : '☐'} {ci.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Alternância Rápida de Ferramenta */}
                            {dec.alternativeTools.length > 0 && (
                              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Trocar destino:</span>
                                {dec.alternativeTools.map(alt => (
                                  <button
                                    key={alt.toolName}
                                    onClick={() => handleSelectAlternativeTool(idx, alt.toolName, alt.payload)}
                                    style={{
                                      background: '#ffffff',
                                      border: '1px solid #cbd5e1',
                                      borderRadius: 4,
                                      padding: '2px 8px',
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: '#334155',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    ➡️ {alt.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* ─── RODAPÉ DO MODAL COM CONFIRMAÇÃO 0-TESTER ──────────────────── */}
        <div style={{
          padding: '14px 24px',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12
        }}>
          <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🛡️ <strong>Diretiva 0-Tester:</strong> Nada é gravado sem sua aprovação explícita.</span>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              disabled={isExecuting}
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>

            <button
              onClick={handleConfirmImport}
              disabled={isExecuting || approvedCount === 0}
              style={{
                background: '#0079bf',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 800,
                cursor: isExecuting || approvedCount === 0 ? 'not-allowed' : 'pointer',
                opacity: isExecuting || approvedCount === 0 ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 2px 8px rgba(0, 121, 191, 0.3)'
              }}
            >
              {isExecuting ? 'Importando...' : `📥 Importar ${approvedCount} Itens Aprovados`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
