'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { toast } from '@/components/Toast'
import {
  TrelloConfig,
  TrelloBoard,
  TrelloList,
  TrelloCard,
  TrelloMember,
  getTrelloConfig,
  saveTrelloConfig,
  clearTrelloConfig,
  getTrelloAuthorizeUrl,
  testTrelloConnection,
  fetchTrelloBoards,
  fetchTrelloLists,
  fetchTrelloCardsFromList,
  isTrelloConnected
} from '@/lib/trelloClient'

export default function TrelloPortalConnect() {
  const [config, setConfig] = useState<TrelloConfig | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('f50002fe58947ff4bac9b5876d822e08')
  const [tokenInput, setTokenInput] = useState('ATTAcbe6f5f844b3b5567c5ab2de18d862641c4da39fbcd26ff41cf40af04179e2de74A6BAAB')
  const [isLoadingAuth, setIsLoadingAuth] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  // Live Inspector States
  const [boards, setBoards] = useState<TrelloBoard[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState<string>('')
  const [lists, setLists] = useState<TrelloList[]>([])
  const [selectedListId, setSelectedListId] = useState<string>('')
  const [cards, setCards] = useState<TrelloCard[]>([])
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)

  // Carrega configuração salva
  const loadConfig = useCallback(() => {
    const saved = getTrelloConfig()
    setConfig(saved)
    if (saved) {
      setApiKeyInput(saved.apiKey || 'f50002fe58947ff4bac9b5876d822e08')
      setTokenInput(saved.apiToken || 'ATTAcbe6f5f844b3b5567c5ab2de18d862641c4da39fbcd26ff41cf40af04179e2de74A6BAAB')
    }
  }, [])

  useEffect(() => {
    loadConfig()
    const handleConfigChange = () => loadConfig()
    window.addEventListener('teacher:trello_config_changed', handleConfigChange)
    return () => window.removeEventListener('teacher:trello_trello_config_changed', handleConfigChange)
  }, [loadConfig])

  // Quando conectado, busca quadros
  const loadBoards = useCallback(async (key?: string, token?: string) => {
    setIsLoadingData(true)
    setAuthError(null)
    try {
      const result = await fetchTrelloBoards(key, token)
      setBoards(result)
      if (result.length > 0) {
        setSelectedBoardId(result[0].id)
      } else {
        setSelectedBoardId('')
        setLists([])
        setCards([])
      }
    } catch (err: any) {
      setAuthError(err.message || 'Erro ao carregar quadros do Trello.')
    } finally {
      setIsLoadingData(false)
    }
  }, [])

  useEffect(() => {
    if (config?.apiKey && config?.apiToken) {
      loadBoards(config.apiKey, config.apiToken)
    } else {
      setBoards([])
      setLists([])
      setCards([])
    }
  }, [config, loadBoards])

  // Quando o quadro muda, busca as listas
  useEffect(() => {
    if (!selectedBoardId || !config?.apiKey || !config?.apiToken) return

    let isMounted = true
    setIsLoadingData(true)
    fetchTrelloLists(selectedBoardId, config.apiKey, config.apiToken)
      .then(res => {
        if (!isMounted) return
        setLists(res)
        if (res.length > 0) {
          setSelectedListId(res[0].id)
        } else {
          setSelectedListId('')
          setCards([])
        }
      })
      .catch(err => {
        if (!isMounted) return
        toast.error(err.message || 'Erro ao carregar listas do quadro.')
      })
      .finally(() => {
        if (isMounted) setIsLoadingData(false)
      })

    return () => { isMounted = false }
  }, [selectedBoardId, config])

  // Quando a lista muda, busca os cartões
  useEffect(() => {
    if (!selectedListId || !config?.apiKey || !config?.apiToken) return

    let isMounted = true
    setIsLoadingData(true)
    fetchTrelloCardsFromList(selectedListId, config.apiKey, config.apiToken)
      .then(res => {
        if (!isMounted) return
        setCards(res)
      })
      .catch(err => {
        if (!isMounted) return
        toast.error(err.message || 'Erro ao carregar cartões da lista.')
      })
      .finally(() => {
        if (isMounted) setIsLoadingData(false)
      })

    return () => { isMounted = false }
  }, [selectedListId, config])

  // Teste e salvamento de credenciais
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!apiKeyInput.trim() || !tokenInput.trim()) {
      toast.error('Informe a API Key e o Token do Trello.')
      return
    }

    setIsLoadingAuth(true)
    setAuthError(null)

    try {
      const member: TrelloMember = await testTrelloConnection(apiKeyInput, tokenInput)
      const newConfig: TrelloConfig = {
        apiKey: apiKeyInput.trim(),
        apiToken: tokenInput.trim(),
        memberId: member.id,
        username: member.username,
        fullName: member.fullName,
        avatarUrl: member.avatarUrl,
        connectedAt: new Date().toISOString()
      }

      saveTrelloConfig(newConfig)
      setConfig(newConfig)
      toast.success(`🎉 Conectado ao Trello como ${member.fullName}!`)
      loadBoards(newConfig.apiKey, newConfig.apiToken)
    } catch (err: any) {
      setAuthError(err.message || 'Credenciais inválidas. Verifique sua API Key e Token.')
      toast.error('Falha na conexão com a API do Trello.')
    } finally {
      setIsLoadingAuth(false)
    }
  }

  const handleDisconnect = () => {
    clearTrelloConfig()
    setConfig(null)
    setApiKeyInput('')
    setTokenInput('')
    setBoards([])
    setLists([])
    setCards([])
    toast.success('Desconectado do Trello com sucesso.')
  }

  const isConnected = isTrelloConnected()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ─── CARD DE AUTENTICAÇÃO E STATUS BYOK ────────────────────────────── */}
      <div style={{
        background: '#ffffff',
        borderRadius: 16,
        border: '1.5px solid #0079bf',
        padding: '20px 24px',
        boxShadow: '0 4px 16px rgba(0, 121, 191, 0.08)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: '#0079bf',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              boxShadow: '0 2px 8px rgba(0, 121, 191, 0.3)'
            }}>
              <i className="ti ti-layout-kanban" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
                  Trello Workspace (Portal Conectado)
                </h3>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: isConnected ? '#e6f4ea' : '#f1f3f4',
                  color: isConnected ? '#137333' : '#5f6368',
                  border: `1px solid ${isConnected ? '#a8dab5' : '#dadce0'}`
                }}>
                  {isConnected ? '🟢 Conectado' : '⚪ Desconectado'}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#665c54' }}>
                Integração direta com seus quadros, cartões e checklists sem servidores intermediários (100% BYOK local).
              </p>
            </div>
          </div>

          {isConnected && config && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e' }}>{config.fullName}</div>
                <div style={{ fontSize: 11, color: '#0079bf', fontWeight: 600 }}>@{config.username}</div>
              </div>
              <button
                onClick={handleDisconnect}
                style={{
                  background: '#fee2e2',
                  color: '#dc2626',
                  border: '1px solid #fca5a5',
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Desconectar
              </button>
            </div>
          )}
        </div>

        {/* Formulário de Conexão */}
        {!isConnected ? (
          <form onSubmit={handleConnect} style={{ marginTop: 20, borderTop: '1px dashed #e7dfd5', paddingTop: 18 }}>
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 16,
              fontSize: 12.5,
              color: '#334155',
              lineHeight: 1.5
            }}>
              <strong>💡 Como conectar seu Trello em 30 segundos:</strong>
              <ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                <li>Acesse o portal de desenvolvedor do Trello clicando em <strong>"1. Obter API Key"</strong>.</li>
                <li>Copie sua <em>API Key</em> e cole no primeiro campo abaixo.</li>
                <li>Clique em <strong>"2. Gerar Token em 1 Clique"</strong>, autorize o acesso de leitura e cole o Token no segundo campo.</li>
              </ol>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#2c1a0e' }}>Trello API Key</label>
                  <a
                    href="https://trello.com/app-key"
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 11.5, color: '#0079bf', fontWeight: 700, textDecoration: 'none' }}
                  >
                    1. Obter API Key ↗
                  </a>
                </div>
                <input
                  type="text"
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  placeholder="Ex: 8f4c2e..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 13,
                    fontFamily: 'monospace'
                  }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#2c1a0e' }}>Trello API Token</label>
                  {apiKeyInput.trim() ? (
                    <a
                      href={getTrelloAuthorizeUrl(apiKeyInput)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 11.5, color: '#0079bf', fontWeight: 700, textDecoration: 'none' }}
                    >
                      2. Gerar Token em 1 Clique ↗
                    </a>
                  ) : (
                    <span style={{ fontSize: 11.5, color: '#94a3b8' }}>Insira a Key primeiro</span>
                  )}
                </div>
                <input
                  type="password"
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  placeholder="Ex: ATTA..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 13,
                    fontFamily: 'monospace'
                  }}
                />
              </div>
            </div>

            {authError && (
              <div style={{ marginTop: 12, color: '#dc2626', fontSize: 12, fontWeight: 600 }}>
                ⚠️ {authError}
              </div>
            )}

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={isLoadingAuth || !apiKeyInput.trim() || !tokenInput.trim()}
                style={{
                  background: '#0079bf',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '9px 20px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: isLoadingAuth ? 'not-allowed' : 'pointer',
                  opacity: (isLoadingAuth || !apiKeyInput.trim() || !tokenInput.trim()) ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                {isLoadingAuth ? 'Validando...' : '🔗 Testar & Conectar ao Trello'}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {/* ─── LIVE INSPECTOR: NAVEGADOR DE QUADROS, LISTAS E CARTÕES ───────── */}
      {isConnected && (
        <div style={{
          background: '#ffffff',
          borderRadius: 16,
          border: '1px solid #e7dfd5',
          padding: '20px 24px',
          boxShadow: '0 2px 10px rgba(44, 26, 14, 0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#2c1a0e' }}>
                🗂️ Navegador de Quadros & Checklists em Tempo Real
              </h4>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#665c54' }}>
                Leitura ao vivo das suas colunas, cartões e subtarefas para conferência visual.
              </p>
            </div>

            <button
              onClick={() => {
                if (config) loadBoards(config.apiKey, config.apiToken)
              }}
              style={{
                background: '#faf6f0',
                border: '1px solid #d5c8bb',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                color: '#7a5c42',
                cursor: 'pointer'
              }}
            >
              🔄 Recarregar Quadros
            </button>
          </div>

          {/* Seletores de Quadro e Lista */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>
                1. Selecione o Quadro ({boards.length})
              </label>
              <select
                value={selectedBoardId}
                onChange={e => setSelectedBoardId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1.5px solid #0079bf',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#2c1a0e',
                  background: '#f0f9ff'
                }}
              >
                {boards.map(b => (
                  <option key={b.id} value={b.id}>
                    📋 {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>
                2. Selecione a Lista / Coluna ({lists.length})
              </label>
              <select
                value={selectedListId}
                onChange={e => setSelectedListId(e.target.value)}
                disabled={lists.length === 0}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#2c1a0e',
                  background: '#ffffff'
                }}
              >
                {lists.map(l => (
                  <option key={l.id} value={l.id}>
                    📂 {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Lista de Cartões */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5e3c', textTransform: 'uppercase' }}>
                Cartões Detectados nesta Coluna ({cards.length}):
              </span>
              {isLoadingData && <span style={{ fontSize: 12, color: '#0079bf' }}>Carregando dados...</span>}
            </div>

            {cards.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', background: '#faf6f0', borderRadius: 10, color: '#665c54', fontSize: 13 }}>
                Nenhum cartão encontrado nesta coluna do Trello.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {cards.map(card => {
                  const isExpanded = expandedCardId === card.id
                  const hasChecklists = card.checklists && card.checklists.length > 0
                  const totalCheckItems = card.checklists?.reduce((acc, chk) => acc + chk.checkItems.length, 0) || 0

                  return (
                    <div
                      key={card.id}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 10,
                        padding: '12px 16px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                              {card.name}
                            </span>

                            {/* Labels / Etiquetas */}
                            {card.labels?.map(lbl => (
                              <span
                                key={lbl.id}
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: '#e0f2fe',
                                  color: '#0369a1'
                                }}
                              >
                                🏷️ {lbl.name || 'Etiqueta'}
                              </span>
                            ))}

                            {/* Data de Vencimento */}
                            {card.due && (
                              <span style={{
                                fontSize: 10.5,
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: card.dueComplete ? '#dcfce7' : '#fef3c7',
                                color: card.dueComplete ? '#15803d' : '#b45309'
                              }}>
                                📅 {new Date(card.due).toLocaleDateString('pt-BR')}
                              </span>
                            )}

                            {/* Status de Importação Prévia */}
                            {card.isAlreadyImported && (
                              <span style={{
                                fontSize: 10.5,
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: '#f1f5f9',
                                color: '#475569'
                              }}>
                                ✓ Já Importado
                              </span>
                            )}
                          </div>

                          {card.desc && (
                            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                              {card.desc.slice(0, 150)}{card.desc.length > 150 ? '...' : ''}
                            </p>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {hasChecklists && (
                            <button
                              onClick={() => setExpandedCardId(isExpanded ? null : card.id)}
                              style={{
                                background: '#f8fafc',
                                border: '1px solid #cbd5e1',
                                borderRadius: 6,
                                padding: '4px 8px',
                                fontSize: 11.5,
                                fontWeight: 700,
                                color: '#334155',
                                cursor: 'pointer'
                              }}
                            >
                              ☑️ {totalCheckItems} {totalCheckItems === 1 ? 'subitem' : 'subitens'} {isExpanded ? '▲' : '▼'}
                            </button>
                          )}

                          <a
                            href={card.url || card.shortUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              fontSize: 11.5,
                              color: '#0079bf',
                              fontWeight: 700,
                              textDecoration: 'none'
                            }}
                          >
                            Abrir ↗
                          </a>
                        </div>
                      </div>

                      {/* Itens de Checklist Expandidos */}
                      {isExpanded && hasChecklists && (
                        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {card.checklists?.map(chk => (
                            <div key={chk.id} style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: 6 }}>
                              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                                📋 {chk.name}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {chk.checkItems.map(item => (
                                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                                    <span style={{ color: item.state === 'complete' ? '#16a34a' : '#94a3b8' }}>
                                      {item.state === 'complete' ? '☑' : '☐'}
                                    </span>
                                    <span style={{
                                      color: item.state === 'complete' ? '#94a3b8' : '#334155',
                                      textDecoration: item.state === 'complete' ? 'line-through' : 'none'
                                    }}>
                                      {item.name}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
