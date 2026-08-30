'use client'

import { toast, showConfirm } from '@/components/Toast'
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import ModuleCard from '@/components/ModuleCard'
import {
  ChecklistTodo,
  ChecklistHistoryItem,
  ChecklistPeriod,
  loadChecklistTodos,
  saveChecklistTodos,
  loadChecklistHistory,
  clearChecklistHistory,
  deleteChecklistHistoryItem,
  toggleRegularTodo,
  toggleSystemAiTodo,
  getCompletedSystemTodoIds,
  exportChecklistHistoryCSV,
  getTodayKey,
  isDateInPeriod,
  formatRecurrenceText,
} from '@/lib/checklistManager'
import TrelloImportModal from '@/components/modules/TrelloImportModal'
import ChecklistEditModal from '@/components/modules/ChecklistEditModal'
import { COLOR, FONT, TEXT, RADIUS, SHADOW, BORDER, TRANSITION } from '@/styles/tokens'

const PERIOD_LABELS: { id: ChecklistPeriod; label: string; icon: string; desc: string }[] = [
  { id: 'dia',       label: 'Dia',       icon: 'ti-calendar-event', desc: 'Hoje (24 Horas)' },
  { id: 'semana',    label: 'Semana',    icon: 'ti-calendar-week',  desc: 'Últimos 7 dias' },
  { id: 'mes',       label: 'Mês',       icon: 'ti-calendar-month', desc: 'Últimos 30 dias' },
  { id: 'trimestre', label: 'Trimestre', icon: 'ti-chart-pie',      desc: 'Últimos 90 dias' },
  { id: 'ano',       label: 'Ano',       icon: 'ti-calendar',       desc: 'Ano Letivo (365 dias)' },
]

export default function ChecklistHistoryModule() {
  const [todos, setTodos] = useState<ChecklistTodo[]>([])
  const [history, setHistory] = useState<ChecklistHistoryItem[]>([])
  const [completedSysIds, setCompletedSysIds] = useState<string[]>([])
  const [editingTodo, setEditingTodo] = useState<ChecklistTodo | null>(null)

  // Filtros de Período e Visualização
  const [selectedPeriod, setSelectedPeriod] = useState<ChecklistPeriod>('dia')
  const [viewMode, setViewMode] = useState<'active' | 'history'>('active')
  const [filterCategory, setFilterCategory] = useState<'all' | 'recurrent' | 'one_off' | 'system_ai'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [isTrelloModalOpen, setIsTrelloModalOpen] = useState(false)

  // Formulário de Nova Tarefa
  const [newText, setNewText] = useState('')
  const [newCategory, setNewCategory] = useState<'one_off' | 'recurrent'>('one_off')
  const [newTag, setNewTag] = useState('')

  const loadData = useCallback(() => {
    const loadedTodos = loadChecklistTodos()
    setTodos(loadedTodos)
    const loadedHistory = loadChecklistHistory()
    setHistory(loadedHistory)
    const today = getTodayKey()
    setCompletedSysIds(getCompletedSystemTodoIds(today))
  }, [])

  useEffect(() => {
    loadData()
    const handleHistoryChange = () => setHistory(loadChecklistHistory())
    window.addEventListener('storage', loadData)
    window.addEventListener('teacher:data_changed', loadData)
    window.addEventListener('teacher:checklist_history_changed', handleHistoryChange)
    return () => {
      window.removeEventListener('storage', loadData)
      window.removeEventListener('teacher:data_changed', loadData)
      window.removeEventListener('teacher:checklist_history_changed', handleHistoryChange)
    }
  }, [loadData])

  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newText.trim()) return
    const todayKey = getTodayKey()
    const newTodo: ChecklistTodo = {
      id: `${newCategory === 'recurrent' ? 'rec' : 'todo'}_${Date.now()}`,
      text: newText.trim(),
      done: false,
      category: newCategory,
      priority: newCategory === 'recurrent' ? 'high' : 'medium',
      tag: newTag.trim() || (newCategory === 'recurrent' ? 'Rotina Diária' : 'Geral'),
      createdAt: Date.now(),
      lastResetDate: newCategory === 'recurrent' ? todayKey : undefined,
    }

    const updated = [newTodo, ...todos]
    setTodos(updated)
    saveChecklistTodos(updated)
    setNewText('')
    setNewTag('')
    toast.success('Tarefa adicionada com sucesso!')
  }

  const handleToggle = (id: string) => {
    if (id.startsWith('sys_')) {
      const isNowDone = toggleSystemAiTodo(id)
      setCompletedSysIds(prev => isNowDone ? [...prev, id] : prev.filter(i => i !== id))
      return
    }
    const updated = toggleRegularTodo(id, todos)
    setTodos(updated)
  }

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirm({
      title: 'Remover Tarefa?',
      message: 'Deseja remover esta tarefa da lista ativa?',
      danger: true,
    })
    if (!confirmed) return

    const updated = todos.filter(t => t.id !== id)
    setTodos(updated)
    saveChecklistTodos(updated)
    toast.info('Tarefa removida.')
  }

  const handleClearCompleted = async () => {
    const completedCount = todos.filter(t => t.done).length
    if (completedCount === 0) {
      toast.info('Nenhuma tarefa concluída para limpar.')
      return
    }

    const confirmed = await showConfirm({
      title: 'Limpar Concluídas?',
      message: `Deseja remover ${completedCount} tarefa(s) concluída(s) da lista ativa? O histórico continuará salvo.`,
    })
    if (!confirmed) return

    const updated = todos.filter(t => !t.done)
    setTodos(updated)
    saveChecklistTodos(updated)
    toast.success('Tarefas concluídas removidas da lista ativa.')
  }

  const handleExportCSV = () => {
    const csvContent = exportChecklistHistoryCSV(filteredHistory)
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `historico_checklist_${selectedPeriod}_${getTodayKey()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Histórico exportado em CSV com sucesso!')
  }

  const handleSaveEditedTodo = (updatedTodo: ChecklistTodo) => {
    const updated = todos.map(t => t.id === updatedTodo.id ? updatedTodo : t)
    setTodos(updated)
    saveChecklistTodos(updated)
    setEditingTodo(null)
    toast.success('Tarefa e frequência de repetição atualizadas com sucesso!')
  }

  // Filtragem do Histórico por Período e Categoria
  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      if (!isDateInPeriod(item.completedAt, selectedPeriod)) return false
      if (filterCategory !== 'all' && item.category !== filterCategory) return false
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        const textMatch = item.text?.toLowerCase().includes(q)
        const tagMatch = item.tag?.toLowerCase().includes(q)
        if (!textMatch && !tagMatch) return false
      }
      return true
    })
  }, [history, selectedPeriod, filterCategory, searchTerm])

  // Filtragem das Tarefas Ativas
  const filteredTodos = useMemo(() => {
    return todos.filter(t => {
      if (filterCategory !== 'all' && t.category !== filterCategory) return false
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        const textMatch = t.text?.toLowerCase().includes(q)
        const tagMatch = t.tag?.toLowerCase().includes(q)
        if (!textMatch && !tagMatch) return false
      }
      return true
    })
  }, [todos, filterCategory, searchTerm])

  // Métricas do Período Selecionado
  const historyForPeriod = useMemo(() => {
    return history.filter(item => isDateInPeriod(item.completedAt, selectedPeriod))
  }, [history, selectedPeriod])

  const totalPeriodDone = historyForPeriod.length
  const recurrentPeriodDone = historyForPeriod.filter(h => h.category === 'recurrent').length
  const oneOffPeriodDone = historyForPeriod.filter(h => h.category === 'one_off').length
  const aiPeriodDone = historyForPeriod.filter(h => h.category === 'system_ai').length

  const periodLabelText = PERIOD_LABELS.find(p => p.id === selectedPeriod)?.desc || ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: FONT.sans }}>
      {/* ─── SELETOR DE PERÍODO: DIA | SEMANA | MÊS | TRIMESTRE | ANO ─── */}
      <div style={{
        background: COLOR.surface1,
        borderRadius: RADIUS.lg,
        padding: '10px 16px',
        border: `1px solid ${BORDER.soft}`,
        boxShadow: SHADOW.sm,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: TEXT.caption, fontWeight: 800, color: COLOR.paperWarm, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Período:
          </span>
          <div style={{ display: 'flex', gap: 4, background: COLOR.surface2, padding: 3, borderRadius: RADIUS.md, border: `1px solid ${BORDER.soft}` }}>
            {PERIOD_LABELS.map(p => {
              const isSelected = selectedPeriod === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPeriod(p.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: RADIUS.sm,
                    border: 'none',
                    background: isSelected ? COLOR.accent : 'transparent',
                    color: isSelected ? '#fff' : COLOR.paperWarm,
                    fontSize: TEXT.bodyCompact,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: TRANSITION.button,
                    boxShadow: isSelected ? '0 2px 6px rgba(139,94,60,0.2)' : 'none',
                    fontFamily: FONT.sans,
                  }}
                >
                  <i className={`ti ${p.icon}`} style={{ fontSize: 14 }} />
                  <span>{p.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ fontSize: TEXT.caption, color: COLOR.paperWarm, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-clock" style={{ color: COLOR.accent }} />
          <span>Exibindo: <strong>{periodLabelText}</strong></span>
        </div>
      </div>

      {/* ─── CARDS DE MÉTRICAS DO PERÍODO ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <div style={StatCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: RADIUS.md, background: COLOR.successBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-circle-check" style={{ fontSize: 22, color: COLOR.success }} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: COLOR.paperInk }}>{totalPeriodDone}</div>
              <div style={{ fontSize: TEXT.micro, color: COLOR.paperWarm, fontWeight: 600 }}>Concluídas no {PERIOD_LABELS.find(p => p.id === selectedPeriod)?.label}</div>
            </div>
          </div>
        </div>

        <div style={StatCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: RADIUS.md, background: 'rgba(139,94,60,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-repeat" style={{ fontSize: 22, color: COLOR.accent }} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: COLOR.paperInk }}>{recurrentPeriodDone}</div>
              <div style={{ fontSize: TEXT.micro, color: COLOR.paperWarm, fontWeight: 600 }}>Rotinas Realizadas</div>
            </div>
          </div>
        </div>

        <div style={StatCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: RADIUS.md, background: COLOR.warningBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-pin" style={{ fontSize: 22, color: COLOR.warning }} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: COLOR.paperInk }}>{oneOffPeriodDone}</div>
              <div style={{ fontSize: TEXT.micro, color: COLOR.paperWarm, fontWeight: 600 }}>Tarefas Pontuais</div>
            </div>
          </div>
        </div>

        <div style={StatCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: RADIUS.md, background: COLOR.infoBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-sparkles" style={{ fontSize: 22, color: COLOR.info }} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: COLOR.paperInk }}>{aiPeriodDone}</div>
              <div style={{ fontSize: TEXT.micro, color: COLOR.paperWarm, fontWeight: 600 }}>Pendências IA Resolvidas</div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── CONTROLES DE SUB-ABA: TAREFAS ATIVAS vs HISTÓRICO DE CONCLUSÕES ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6, background: COLOR.surface2, padding: 3, borderRadius: RADIUS.md, border: `1px solid ${BORDER.soft}` }}>
          <button
            onClick={() => setViewMode('active')}
            style={{
              padding: '8px 16px',
              borderRadius: RADIUS.sm,
              border: 'none',
              background: viewMode === 'active' ? COLOR.paperInk : 'transparent',
              color: viewMode === 'active' ? '#fff' : COLOR.paperWarm,
              fontSize: TEXT.bodyCompact,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: TRANSITION.button,
              fontFamily: FONT.sans,
            }}
          >
            <i className="ti ti-list-check" />
            <span>Tarefas Ativas ({todos.length})</span>
          </button>

          <button
            onClick={() => setViewMode('history')}
            style={{
              padding: '8px 16px',
              borderRadius: RADIUS.sm,
              border: 'none',
              background: viewMode === 'history' ? COLOR.paperInk : 'transparent',
              color: viewMode === 'history' ? '#fff' : COLOR.paperWarm,
              fontSize: TEXT.bodyCompact,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: TRANSITION.button,
              fontFamily: FONT.sans,
            }}
          >
            <i className="ti ti-history" />
            <span>Histórico ({filteredHistory.length})</span>
          </button>
        </div>

        {/* Filtros de Categoria, Busca e Ações */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Seletor de Categoria */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { id: 'all', label: 'Todas' },
              { id: 'recurrent', label: 'Rotinas' },
              { id: 'one_off', label: 'Pontuais' },
              { id: 'system_ai', label: 'IA' },
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setFilterCategory(cat.id as any)}
                style={{
                  padding: '6px 12px',
                  borderRadius: RADIUS.sm,
                  border: filterCategory === cat.id ? `1px solid ${COLOR.accent}` : `1px solid ${BORDER.medium}`,
                  background: filterCategory === cat.id ? 'rgba(139,94,60,0.12)' : COLOR.surface1,
                  color: filterCategory === cat.id ? COLOR.accent : COLOR.paperWarm,
                  fontSize: TEXT.caption,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: FONT.sans,
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: 10, fontSize: 14, color: COLOR.paperMid, pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Buscar tarefas..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                padding: '7px 12px 7px 30px',
                borderRadius: RADIUS.md,
                border: `1px solid ${BORDER.medium}`,
                background: COLOR.surface1,
                fontSize: TEXT.caption,
                outline: 'none',
                color: COLOR.paperInk,
                fontFamily: FONT.sans,
                width: 170,
              }}
            />
          </div>

          {viewMode === 'history' && (
            <>
              <button
                onClick={handleExportCSV}
                title="Exportar dados do período em CSV"
                style={{
                  padding: '7px 14px',
                  borderRadius: RADIUS.md,
                  border: '1px solid rgba(61,122,78,0.3)',
                  background: COLOR.successBg,
                  color: COLOR.success,
                  fontSize: TEXT.caption,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontFamily: FONT.sans,
                }}
              >
                <i className="ti ti-download" /> Exportar CSV
              </button>

              <button
                onClick={async () => {
                  const confirmed = await showConfirm({
                    title: 'Limpar Histórico?',
                    message: 'Tem certeza que deseja limpar todo o histórico de conclusões?',
                    danger: true,
                  })
                  if (confirmed) {
                    clearChecklistHistory()
                    toast.success('Histórico de conclusões limpo com sucesso.')
                  }
                }}
                title="Limpar histórico completo"
                style={{
                  padding: '7px 14px',
                  borderRadius: RADIUS.md,
                  border: '1px solid rgba(168,50,50,0.3)',
                  background: COLOR.dangerBg,
                  color: COLOR.danger,
                  fontSize: TEXT.caption,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontFamily: FONT.sans,
                }}
              >
                <i className="ti ti-trash" /> Limpar
              </button>
            </>
          )}

          {viewMode === 'active' && (
            <>
              <button
                onClick={() => setIsTrelloModalOpen(true)}
                title="Importar tarefas e checklists do Trello"
                style={{
                  padding: '7px 14px',
                  borderRadius: RADIUS.md,
                  border: '1px solid #0079bf',
                  background: '#0079bf',
                  color: '#ffffff',
                  fontSize: TEXT.caption,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontFamily: FONT.sans,
                  boxShadow: '0 2px 6px rgba(0, 121, 191, 0.25)'
                }}
              >
                <i className="ti ti-layout-kanban" /> Importar Trello
              </button>

              <button
                onClick={handleClearCompleted}
                title="Limpar tarefas concluídas da lista ativa"
                style={{
                  padding: '7px 14px',
                  borderRadius: RADIUS.md,
                  border: `1px solid ${BORDER.medium}`,
                  background: COLOR.surface1,
                  color: COLOR.paperWarm,
                  fontSize: TEXT.caption,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontFamily: FONT.sans,
                }}
              >
                <i className="ti ti-check" /> Limpar Concluídas
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─── SUB-ABA 1: TAREFAS ATIVAS ─── */}
      {viewMode === 'active' && (
        <ModuleCard padding={20}>
          {/* Formulário de Criação de Tarefas */}
          <form onSubmit={handleAddTodo} style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={newText}
              onChange={e => setNewText(e.target.value)}
              placeholder={newCategory === 'recurrent' ? 'Nova rotina diária (ex: Conferir frequência, Aquecimento)...' : 'Nova tarefa pontual da rotina...'}
              style={{
                flex: 2,
                minWidth: 260,
                padding: '9px 14px',
                borderRadius: RADIUS.md,
                border: `1px solid ${BORDER.medium}`,
                background: COLOR.paperPage,
                fontSize: TEXT.bodyCompact,
                outline: 'none',
                color: COLOR.paperInk,
                fontFamily: FONT.sans,
              }}
            />

            <input
              type="text"
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              placeholder="Tag (ex: Inglês, Chamada, Prova)"
              style={{
                flex: 1,
                minWidth: 160,
                padding: '9px 14px',
                borderRadius: RADIUS.md,
                border: `1px solid ${BORDER.medium}`,
                background: COLOR.paperPage,
                fontSize: TEXT.bodyCompact,
                outline: 'none',
                color: COLOR.paperInk,
                fontFamily: FONT.sans,
              }}
            />

            <div style={{ display: 'flex', background: COLOR.paperPage, padding: 3, borderRadius: RADIUS.md, border: `1px solid ${BORDER.medium}`, gap: 2 }}>
              <button
                type="button"
                onClick={() => setNewCategory('one_off')}
                style={{
                  padding: '6px 12px',
                  borderRadius: RADIUS.sm,
                  border: 'none',
                  background: newCategory === 'one_off' ? COLOR.paperInk : 'transparent',
                  color: newCategory === 'one_off' ? '#fff' : COLOR.paperWarm,
                  fontSize: TEXT.caption,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontFamily: FONT.sans,
                }}
              >
                <i className="ti ti-pin" /> Pontual
              </button>
              <button
                type="button"
                onClick={() => setNewCategory('recurrent')}
                style={{
                  padding: '6px 12px',
                  borderRadius: RADIUS.sm,
                  border: 'none',
                  background: newCategory === 'recurrent' ? COLOR.accent : 'transparent',
                  color: newCategory === 'recurrent' ? '#fff' : COLOR.paperWarm,
                  fontSize: TEXT.caption,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontFamily: FONT.sans,
                }}
              >
                <i className="ti ti-repeat" /> Recorrente
              </button>
            </div>

            <button
              type="submit"
              style={{
                padding: '9px 18px',
                borderRadius: RADIUS.md,
                border: 'none',
                background: COLOR.accent,
                color: '#fff',
                fontSize: TEXT.bodyCompact,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 8px rgba(139,94,60,0.25)',
                fontFamily: FONT.sans,
              }}
            >
              <i className="ti ti-plus" /> Adicionar
            </button>
          </form>

          {/* Listagem de Tarefas Ativas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredTodos.length === 0 ? (
              <div style={{ padding: '36px 0', textAlign: 'center', color: COLOR.paperMid, fontSize: TEXT.bodyCompact }}>
                <i className="ti ti-circle-check" style={{ fontSize: 32, display: 'block', marginBottom: 8, color: COLOR.success }} />
                Nenhuma tarefa ativa nesta categoria. Todas as pendências estão em dia!
              </div>
            ) : (
              filteredTodos.map(todo => {
                const isRecurrent = todo.category === 'recurrent'
                return (
                  <div
                    key={todo.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '12px 16px',
                      borderRadius: RADIUS.md,
                      background: todo.done ? COLOR.paperPage : COLOR.surface1,
                      border: `1px solid ${todo.done ? BORDER.soft : BORDER.medium}`,
                      transition: TRANSITION.fast,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                      <div
                        onClick={() => handleToggle(todo.id)}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          border: todo.done ? 'none' : isRecurrent ? `2px solid ${COLOR.accent}` : `2px solid ${COLOR.paperInk}`,
                          background: todo.done ? COLOR.success : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          flexShrink: 0,
                          transition: TRANSITION.fast,
                        }}
                      >
                        {todo.done && <i className="ti ti-check" style={{ color: '#fff', fontSize: 14 }} />}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span
                          onClick={() => handleToggle(todo.id)}
                          style={{
                            fontSize: TEXT.body,
                            fontWeight: todo.done ? 500 : 700,
                            color: todo.done ? COLOR.paperMid : COLOR.paperInk,
                            textDecoration: todo.done ? 'line-through' : 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {todo.text}
                        </span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: TEXT.micro,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: RADIUS.sm,
                            background: isRecurrent ? 'rgba(139,94,60,0.12)' : COLOR.warningBg,
                            color: isRecurrent ? COLOR.accent : COLOR.warning,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}>
                            <i className={isRecurrent ? 'ti ti-repeat' : 'ti ti-pin'} style={{ fontSize: 11 }} />
                            {isRecurrent ? formatRecurrenceText(todo.recurrence || { type: 'daily' }) : 'Pontual'}
                          </span>
                          {todo.tag && (
                            <span style={{ fontSize: TEXT.micro, color: COLOR.paperWarm, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <i className="ti ti-tag" style={{ fontSize: 11 }} />
                              {todo.tag}
                            </span>
                          )}
                          {todo.done && todo.completedAt && (
                            <span style={{ fontSize: TEXT.micro, color: COLOR.success, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <i className="ti ti-check" style={{ fontSize: 11 }} />
                              Concluída (visível por 24h)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button
                        onClick={() => setEditingTodo(todo)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: COLOR.paperWarm,
                          opacity: 0.8,
                          cursor: 'pointer',
                          fontSize: 15,
                          padding: 6,
                          borderRadius: RADIUS.sm,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title="Editar tarefa e frequência de repetição"
                      >
                        <i className="ti ti-edit" />
                      </button>
                      <button
                        onClick={() => handleDelete(todo.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: COLOR.danger,
                          opacity: 0.6,
                          cursor: 'pointer',
                          fontSize: 15,
                          padding: 6,
                          borderRadius: RADIUS.sm,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title="Excluir tarefa"
                      >
                        <i className="ti ti-trash" />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </ModuleCard>
      )}

      {/* ─── SUB-ABA 2: HISTÓRICO DE CONCLUSÕES ─── */}
      {viewMode === 'history' && (
        <ModuleCard padding={20}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h4 style={{ margin: 0, fontSize: TEXT.body, fontWeight: 700, color: COLOR.paperInk, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-calendar-check" style={{ color: COLOR.success }} />
              <span>Histórico de Tarefas Concluídas — {PERIOD_LABELS.find(p => p.id === selectedPeriod)?.label} ({filteredHistory.length})</span>
            </h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredHistory.length === 0 ? (
              <div style={{ padding: '36px 0', textAlign: 'center', color: COLOR.paperMid, fontSize: TEXT.bodyCompact }}>
                <i className="ti ti-history-toggle" style={{ fontSize: 32, display: 'block', marginBottom: 8, opacity: 0.5 }} />
                Nenhum registro de conclusão no período selecionado ({PERIOD_LABELS.find(p => p.id === selectedPeriod)?.desc}).
              </div>
            ) : (
              filteredHistory.map(item => {
                const dateFormatted = new Date(item.completedAt).toLocaleString('pt-BR', {
                  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })
                const isRec = item.category === 'recurrent'
                const isAi = item.category === 'system_ai'

                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '12px 16px',
                      borderRadius: RADIUS.md,
                      background: COLOR.surface1,
                      border: `1px solid ${BORDER.soft}`,
                      boxShadow: SHADOW.flat,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: RADIUS.sm,
                        background: COLOR.successBg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                      }}>
                        <i className="ti ti-check" style={{ color: COLOR.success, fontSize: 16 }} />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: TEXT.bodyCompact, fontWeight: 700, color: COLOR.paperInk }}>
                          {item.text}
                        </span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: TEXT.micro,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: RADIUS.sm,
                            background: isAi ? COLOR.warningBg : isRec ? 'rgba(139,94,60,0.1)' : COLOR.infoBg,
                            color: isAi ? COLOR.warning : isRec ? COLOR.accent : COLOR.info,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}>
                            <i className={isAi ? 'ti ti-sparkles' : isRec ? 'ti ti-repeat' : 'ti ti-pin'} style={{ fontSize: 11 }} />
                            {isAi ? 'Pendência da IA' : isRec ? 'Rotina Diária' : 'Pontual'}
                          </span>
                          {item.tag && (
                            <span style={{ fontSize: TEXT.micro, color: COLOR.paperWarm, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <i className="ti ti-tag" style={{ fontSize: 11 }} />
                              {item.tag}
                            </span>
                          )}
                          <span style={{ fontSize: TEXT.micro, color: COLOR.paperMid, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <i className="ti ti-clock" style={{ fontSize: 11 }} />
                            Concluído em {dateFormatted}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => deleteChecklistHistoryItem(item.id)}
                      style={{ background: 'none', border: 'none', color: COLOR.danger, opacity: 0.5, cursor: 'pointer', fontSize: 13, padding: 4 }}
                      title="Excluir do histórico"
                    >
                      <i className="ti ti-trash" />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </ModuleCard>
      )}

      {/* Modal de Importação do Trello */}
      <TrelloImportModal
        isOpen={isTrelloModalOpen}
        onClose={() => setIsTrelloModalOpen(false)}
        onImportSuccess={() => loadData()}
      />

      {/* Modal de Edição de Post / Recorrência */}
      <ChecklistEditModal
        isOpen={!!editingTodo}
        todo={editingTodo}
        onClose={() => setEditingTodo(null)}
        onSave={handleSaveEditedTodo}
      />
    </div>
  )
}

const StatCardStyle: React.CSSProperties = {
  background: COLOR.surface1,
  border: `1px solid ${BORDER.soft}`,
  borderRadius: RADIUS.lg,
  padding: '14px 18px',
  boxShadow: SHADOW.sm,
}
