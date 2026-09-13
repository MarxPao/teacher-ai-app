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
  toggleTodoSubtask,
  updateTodoTag,
  getCompletedSystemTodoIds,
  exportChecklistHistoryCSV,
  getTodayKey,
  isDateInPeriod,
  formatRecurrenceText,
  parseTodoHierarchy,
  groupTodosByHierarchy,
  isImportedTodo,
  formatTimelineTime,
  groupTodosByTimeline,
  TimelineGroup,
} from '@/lib/checklistManager'
import TrelloImportModal from '@/components/modules/TrelloImportModal'
import ChecklistEditModal from '@/components/modules/ChecklistEditModal'
import Button from '@/components/Button'
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

  // Filtros de Período e Visualização: Ativas | Importadas (Trello) | Visual Trello (Kanban) | Histórico
  const [selectedPeriod, setSelectedPeriod] = useState<ChecklistPeriod>('dia')
  const [viewMode, setViewMode] = useState<'active' | 'imported' | 'trello' | 'history'>('active')
  const [activeViewStyle, setActiveViewStyle] = useState<'timeline' | 'hierarchy' | 'flat'>('timeline')
  const [importedViewStyle, setImportedViewStyle] = useState<'timeline' | 'hierarchy' | 'flat'>('timeline')
  const [groupByTopic, setGroupByTopic] = useState(true)
  const [filterCategory, setFilterCategory] = useState<'all' | 'recurrent' | 'one_off' | 'system_ai'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [isTrelloModalOpen, setIsTrelloModalOpen] = useState(false)

  // Formulário de Nova Tarefa com Camadas (Tópico & Subtópico)
  const [newText, setNewText] = useState('')
  const [newCategory, setNewCategory] = useState<'one_off' | 'recurrent'>('one_off')
  const [newTopic, setNewTopic] = useState('')
  const [newSubtopic, setNewSubtopic] = useState('')

  // Estados de Expansão (Camada 1: Tópicos, Camada 2: Subtópicos, Camada 3: Subtarefas)
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({})
  const [expandedSubtopics, setExpandedSubtopics] = useState<Record<string, boolean>>({})
  const [expandedTaskSubtasks, setExpandedTaskSubtasks] = useState<Record<string, boolean>>({})

  // Estado para rápida criação dentro de um subtópico ou coluna
  const [quickAddSubtopicKey, setQuickAddSubtopicKey] = useState<string | null>(null)
  const [quickAddSubtopicText, setQuickAddSubtopicText] = useState('')
  const [quickAddColumnTag, setQuickAddColumnTag] = useState<string | null>(null)
  const [quickAddText, setQuickAddText] = useState('')

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
    const finalTopic = newTopic.trim() || 'Geral'
    const finalSubtopic = newSubtopic.trim() || 'Tarefas Gerais'
    const newTodo: ChecklistTodo = {
      id: `${newCategory === 'recurrent' ? 'rec' : 'todo'}_${Date.now()}`,
      text: newText.trim(),
      done: false,
      category: newCategory,
      priority: newCategory === 'recurrent' ? 'high' : 'medium',
      topic: finalTopic,
      subtopic: finalSubtopic,
      tag: `${finalTopic} / ${finalSubtopic}`,
      createdAt: Date.now(),
      lastResetDate: newCategory === 'recurrent' ? todayKey : undefined,
    }

    const updated = [newTodo, ...todos]
    setTodos(updated)
    saveChecklistTodos(updated)
    setNewText('')
    toast.success('Tarefa adicionada com sucesso!')
  }

  const handleQuickAddInSubtopic = (topic: string, subtopic: string) => {
    if (!quickAddSubtopicText.trim()) return
    const todayKey = getTodayKey()
    const newTodo: ChecklistTodo = {
      id: `todo_${Date.now()}`,
      text: quickAddSubtopicText.trim(),
      done: false,
      category: 'one_off',
      priority: 'medium',
      topic,
      subtopic,
      tag: `${topic} / ${subtopic}`,
      createdAt: Date.now(),
      lastResetDate: todayKey,
    }

    const updated = [newTodo, ...todos]
    setTodos(updated)
    saveChecklistTodos(updated)
    setQuickAddSubtopicText('')
    setQuickAddSubtopicKey(null)
    toast.success(`Tarefa adicionada em "${subtopic}"!`)
  }

  const handleQuickAddInColumn = (tag: string) => {
    if (!quickAddText.trim()) return
    const todayKey = getTodayKey()
    const newTodo: ChecklistTodo = {
      id: `todo_${Date.now()}`,
      text: quickAddText.trim(),
      done: false,
      category: 'one_off',
      priority: 'medium',
      tag: tag,
      topic: tag,
      subtopic: 'Tarefas Gerais',
      createdAt: Date.now(),
      lastResetDate: todayKey,
    }

    const updated = [newTodo, ...todos]
    setTodos(updated)
    saveChecklistTodos(updated)
    setQuickAddText('')
    setQuickAddColumnTag(null)
    toast.success(`Cartão adicionado em "${tag}"!`)
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

  const handleToggleSubtask = (todoId: string, subtaskId: string) => {
    const updated = toggleTodoSubtask(todoId, subtaskId, todos)
    setTodos(updated)
  }

  const handleMoveTag = (todoId: string, newTag: string) => {
    const updated = updateTodoTag(todoId, newTag, todos)
    setTodos(updated)
    toast.success(`Cartão movido para "${newTag}"!`)
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
    toast.success('Relatório CSV exportado com sucesso!')
  }

  // Contagens para badges das abas
  const regularTodosCount = useMemo(() => todos.filter(t => !isImportedTodo(t)).length, [todos])
  const importedTodosCount = useMemo(() => todos.filter(t => isImportedTodo(t)).length, [todos])

  // Filtragem de Tarefas Ativas ou Importadas
  const filteredTodos = useMemo(() => {
    return todos.filter(t => {
      // Aba 'active' mostra exclusivamente tarefas regulares (sem Trello/importadas)
      if (viewMode === 'active' && isImportedTodo(t)) return false
      // Aba 'imported' mostra exclusivamente tarefas importadas (Trello)
      if (viewMode === 'imported' && !isImportedTodo(t)) return false

      if (filterCategory !== 'all' && t.category !== filterCategory) return false
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase()
        const matchText = t.text.toLowerCase().includes(term)
        const matchTag = t.tag?.toLowerCase().includes(term)
        const matchSubtasks = t.subtasks?.some(st => st.text.toLowerCase().includes(term))
        if (!matchText && !matchTag && !matchSubtasks) return false
      }
      return true
    })
  }, [todos, viewMode, filterCategory, searchTerm])

  // Agrupamento Hierárquico em Camadas: Tópico (Camada 1) -> Subtópico (Camada 2) -> Tarefas (Camada 3)
  const hierarchicalTodos = useMemo(() => {
    return groupTodosByHierarchy(filteredTodos)
  }, [filteredTodos])

  // Lista única de todos os tópicos e subtópicos para autocomplete/sugestões e Kanban
  const { existingTopics, existingSubtopics } = useMemo(() => {
    const topicsSet = new Set<string>()
    const subtopicsSet = new Set<string>()
    todos.forEach(t => {
      const h = parseTodoHierarchy(t)
      topicsSet.add(h.topic)
      subtopicsSet.add(h.subtopic)
    })
    if (topicsSet.size === 0) topicsSet.add('Rotina Diária')
    if (subtopicsSet.size === 0) subtopicsSet.add('Tarefas Gerais')
    return {
      existingTopics: Array.from(topicsSet),
      existingSubtopics: Array.from(subtopicsSet)
    }
  }, [todos])

  const allUniqueTopics = existingTopics

  const isTopicExpanded = useCallback((topicName: string, isFirst: boolean) => {
    if (searchTerm.trim()) return true
    if (expandedTopics[topicName] !== undefined) {
      return expandedTopics[topicName]
    }
    return isFirst
  }, [searchTerm, expandedTopics])

  const toggleTopic = (topicName: string, isFirst: boolean) => {
    setExpandedTopics(prev => ({
      ...prev,
      [topicName]: !isTopicExpanded(topicName, isFirst)
    }))
  }

  const isSubtopicExpanded = useCallback((topicName: string, subtopicName: string) => {
    if (searchTerm.trim()) return true
    const key = `${topicName}:::${subtopicName}`
    if (expandedSubtopics[key] !== undefined) {
      return expandedSubtopics[key]
    }
    return true
  }, [searchTerm, expandedSubtopics])

  const toggleSubtopic = (topicName: string, subtopicName: string) => {
    const key = `${topicName}:::${subtopicName}`
    setExpandedSubtopics(prev => ({
      ...prev,
      [key]: !isSubtopicExpanded(topicName, subtopicName)
    }))
  }

  const toggleTaskSubtasks = (todoId: string) => {
    setExpandedTaskSubtasks(prev => ({
      ...prev,
      [todoId]: !prev[todoId]
    }))
  }

  const expandAllTopics = () => {
    const nextT: Record<string, boolean> = {}
    const nextSt: Record<string, boolean> = {}
    Object.entries(hierarchicalTodos).forEach(([top, stMap]) => {
      nextT[top] = true
      Object.keys(stMap).forEach(sub => {
        nextSt[`${top}:::${sub}`] = true
      })
    })
    setExpandedTopics(nextT)
    setExpandedSubtopics(nextSt)
  }

  const collapseAllTopics = () => {
    const nextT: Record<string, boolean> = {}
    Object.keys(hierarchicalTodos).forEach(top => {
      nextT[top] = false
    })
    setExpandedTopics(nextT)
  }

  // Filtragem de Histórico no Período
  const filteredHistory = useMemo(() => {
    const now = new Date()
    return history.filter(item => {
      const matchPeriod = isDateInPeriod(item.completedAt || item.dateKey, selectedPeriod, now)
      if (!matchPeriod) return false
      if (filterCategory !== 'all' && item.category !== filterCategory) return false
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase()
        const matchText = item.text.toLowerCase().includes(term)
        const matchTag = item.tag?.toLowerCase().includes(term)
        if (!matchText && !matchTag) return false
      }
      return true
    })
  }, [history, selectedPeriod, filterCategory, searchTerm])

  // Métricas do Período
  const totalPeriodDone = filteredHistory.length
  const recurrentPeriodDone = filteredHistory.filter(h => h.category === 'recurrent').length
  const oneOffPeriodDone = filteredHistory.filter(h => h.category === 'one_off').length
  const aiPeriodDone = filteredHistory.filter(h => h.category === 'system_ai').length

  const StatCardStyle = {
    background: COLOR.surface1,
    borderRadius: RADIUS.lg,
    padding: '16px 20px',
    border: `1px solid ${BORDER.soft}`,
    boxShadow: SHADOW.sm,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  }

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

      {/* ─── CONTROLES DE SUB-ABA: TAREFAS ATIVAS vs IMPORTADAS (TRELLO) vs VISUAL TRELLO (KANBAN) vs HISTÓRICO ─── */}
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
            <span>Tarefas Ativas ({regularTodosCount})</span>
          </button>

          <button
            onClick={() => setViewMode('imported')}
            style={{
              padding: '8px 16px',
              borderRadius: RADIUS.sm,
              border: 'none',
              background: viewMode === 'imported' ? '#0079bf' : 'transparent',
              color: viewMode === 'imported' ? '#fff' : COLOR.paperWarm,
              fontSize: TEXT.bodyCompact,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: TRANSITION.button,
              fontFamily: FONT.sans,
              boxShadow: viewMode === 'imported' ? '0 2px 6px rgba(0,121,191,0.3)' : 'none',
            }}
          >
            <i className="ti ti-brand-trello" />
            <span>Importadas (Trello) ({importedTodosCount})</span>
          </button>

          <button
            onClick={() => setViewMode('trello')}
            style={{
              padding: '8px 16px',
              borderRadius: RADIUS.sm,
              border: 'none',
              background: viewMode === 'trello' ? COLOR.paperInk : 'transparent',
              color: viewMode === 'trello' ? '#fff' : COLOR.paperWarm,
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
            <i className="ti ti-layout-kanban" />
            <span>Visual Trello (Kanban)</span>
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

        {/* Filtros de Visualização, Categoria, Busca e Ações */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {(viewMode === 'active' || viewMode === 'imported') && (
            <div style={{ display: 'flex', gap: 2, background: COLOR.surface2, padding: 2, borderRadius: RADIUS.md, border: `1px solid ${BORDER.soft}` }}>
              <button
                type="button"
                onClick={() => (viewMode === 'active' ? setActiveViewStyle('timeline') : setImportedViewStyle('timeline'))}
                style={{
                  padding: '5px 10px',
                  borderRadius: RADIUS.sm,
                  border: 'none',
                  background: (viewMode === 'active' ? activeViewStyle === 'timeline' : importedViewStyle === 'timeline') ? COLOR.accent : 'transparent',
                  color: (viewMode === 'active' ? activeViewStyle === 'timeline' : importedViewStyle === 'timeline') ? '#fff' : COLOR.paperWarm,
                  fontSize: TEXT.caption,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontFamily: FONT.sans,
                }}
                title="Exibir tarefas na linha do tempo cronológica de quando foram postadas"
              >
                <i className="ti ti-clock-hour-4" />
                <span>Timeline</span>
              </button>

              <button
                type="button"
                onClick={() => (viewMode === 'active' ? setActiveViewStyle('hierarchy') : setImportedViewStyle('hierarchy'))}
                style={{
                  padding: '5px 10px',
                  borderRadius: RADIUS.sm,
                  border: 'none',
                  background: (viewMode === 'active' ? activeViewStyle === 'hierarchy' : importedViewStyle === 'hierarchy') ? COLOR.accent : 'transparent',
                  color: (viewMode === 'active' ? activeViewStyle === 'hierarchy' : importedViewStyle === 'hierarchy') ? '#fff' : COLOR.paperWarm,
                  fontSize: TEXT.caption,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontFamily: FONT.sans,
                }}
                title="Exibir agrupado por Tópicos e Subtópicos"
              >
                <i className="ti ti-category" />
                <span>Tópicos</span>
              </button>

              <button
                type="button"
                onClick={() => (viewMode === 'active' ? setActiveViewStyle('flat') : setImportedViewStyle('flat'))}
                style={{
                  padding: '5px 10px',
                  borderRadius: RADIUS.sm,
                  border: 'none',
                  background: (viewMode === 'active' ? activeViewStyle === 'flat' : importedViewStyle === 'flat') ? COLOR.accent : 'transparent',
                  color: (viewMode === 'active' ? activeViewStyle === 'flat' : importedViewStyle === 'flat') ? '#fff' : COLOR.paperWarm,
                  fontSize: TEXT.caption,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontFamily: FONT.sans,
                }}
                title="Exibir como lista corrida direta"
              >
                <i className="ti ti-list" />
                <span>Lista</span>
              </button>
            </div>
          )}

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

          {(viewMode === 'active' || viewMode === 'imported' || viewMode === 'trello') && (
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

      {/* ─── SUB-ABA 1: TAREFAS ATIVAS (COM SUPORTE A HIERARQUIA & COMPACIDADE) ─── */}
      {viewMode === 'active' && (
        <ModuleCard padding={18}>
          {/* Barra de Controles Rápidos: Expandir/Recolher Todos e Estatísticas Gerais */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 16,
            paddingBottom: 12,
            borderBottom: `1px solid ${BORDER.soft}`
          }}>
            {activeViewStyle === 'timeline' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: TEXT.caption, color: COLOR.paperWarm, fontWeight: 600 }}>
                <i className="ti ti-clock-hour-4" style={{ color: COLOR.accent, fontSize: 16 }} />
                <span>Linha do Tempo: ordenada cronologicamente pelas tarefas postadas mais recentemente</span>
              </div>
            ) : activeViewStyle === 'hierarchy' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={collapseAllTopics}
                  style={{
                    padding: '5px 12px',
                    borderRadius: RADIUS.sm,
                    border: `1px solid ${BORDER.medium}`,
                    background: COLOR.surface1,
                    color: COLOR.paperInk,
                    fontSize: TEXT.caption,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5
                  }}
                  title="Recolhe todos os tópicos para uma visão ultra compacta"
                >
                  <i className="ti ti-layout-sidebar-left-collapse" />
                  <span>Recolher Todos</span>
                </button>

                <button
                  type="button"
                  onClick={expandAllTopics}
                  style={{
                    padding: '5px 12px',
                    borderRadius: RADIUS.sm,
                    border: `1px solid ${BORDER.medium}`,
                    background: COLOR.surface1,
                    color: COLOR.paperInk,
                    fontSize: TEXT.caption,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5
                  }}
                  title="Expande todos os tópicos e subtópicos"
                >
                  <i className="ti ti-arrows-maximize" />
                  <span>Expandir Todos</span>
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: TEXT.caption, color: COLOR.paperWarm, fontWeight: 600 }}>
                <i className="ti ti-list" style={{ color: COLOR.accent, fontSize: 16 }} />
                <span>Lista corrida simples de tarefas</span>
              </div>
            )}

            {/* Progresso Geral Compacto */}
            {filteredTodos.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: TEXT.caption, fontWeight: 700, color: COLOR.paperWarm }}>
                  Progresso: <strong>{filteredTodos.filter(t => t.done).length}/{filteredTodos.length}</strong> ({Math.round((filteredTodos.filter(t => t.done).length / filteredTodos.length) * 100)}%)
                </span>
                <div style={{ width: 90, height: 6, background: 'rgba(139,94,60,0.15)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.round((filteredTodos.filter(t => t.done).length / filteredTodos.length) * 100)}%`,
                    background: COLOR.success,
                    borderRadius: 99
                  }} />
                </div>
              </div>
            )}
          </div>

          {/* Formulário de Criação de Tarefas com Camadas (Tópico & Subtópico) */}
          <form onSubmit={handleAddTodo} style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(220px, 2fr) minmax(130px, 1fr) minmax(130px, 1fr) auto auto',
            gap: 8,
            marginBottom: 20,
            alignItems: 'center'
          }}>
            <input
              type="text"
              value={newText}
              onChange={e => setNewText(e.target.value)}
              placeholder={newCategory === 'recurrent' ? 'Nova rotina (ex: Aquecimento, Chamada)...' : 'Nova tarefa pontual...'}
              style={{
                padding: '9px 12px',
                borderRadius: RADIUS.md,
                border: `1px solid ${BORDER.medium}`,
                background: COLOR.paperPage,
                fontSize: TEXT.bodyCompact,
                outline: 'none',
                color: COLOR.paperInk,
                fontFamily: FONT.sans,
              }}
            />

            {/* Input de Tópico (Camada 1) com Datalist */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                list="checklist-topics-datalist"
                value={newTopic}
                onChange={e => setNewTopic(e.target.value)}
                placeholder="Tópico (ex: Escola, Provas)"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 12px',
                  borderRadius: RADIUS.md,
                  border: `1px solid ${BORDER.medium}`,
                  background: COLOR.paperPage,
                  fontSize: TEXT.bodyCompact,
                  outline: 'none',
                  color: COLOR.paperInk,
                  fontFamily: FONT.sans,
                }}
              />
              <datalist id="checklist-topics-datalist">
                {existingTopics.map(t => <option key={t} value={t} />)}
              </datalist>
            </div>

            {/* Input de Subtópico (Camada 2) com Datalist */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                list="checklist-subtopics-datalist"
                value={newSubtopic}
                onChange={e => setNewSubtopic(e.target.value)}
                placeholder="Subtópico (ex: Turma 9A)"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 12px',
                  borderRadius: RADIUS.md,
                  border: `1px solid ${BORDER.medium}`,
                  background: COLOR.paperPage,
                  fontSize: TEXT.bodyCompact,
                  outline: 'none',
                  color: COLOR.paperInk,
                  fontFamily: FONT.sans,
                }}
              />
              <datalist id="checklist-subtopics-datalist">
                {existingSubtopics.map(st => <option key={st} value={st} />)}
              </datalist>
            </div>

            {/* Botões Categoria */}
            <div style={{ display: 'flex', background: COLOR.paperPage, padding: 3, borderRadius: RADIUS.md, border: `1px solid ${BORDER.medium}`, gap: 2 }}>
              <button
                type="button"
                onClick={() => setNewCategory('one_off')}
                style={{
                  padding: '6px 10px',
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
                  padding: '6px 10px',
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

            <Button
              type="submit"
              variant="primary"
              size="md"
              icon={<i className="ti ti-plus" />}
            >
              Adicionar
            </Button>
          </form>

          {/* Renderização Conforme activeViewStyle (Timeline, Tópicos ou Lista) */}
          {activeViewStyle === 'timeline' ? (
            renderTimelineView(filteredTodos)
          ) : activeViewStyle === 'hierarchy' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.keys(hierarchicalTodos).length === 0 ? (
                <div style={{ padding: '36px 0', textAlign: 'center', color: COLOR.paperMid, fontSize: TEXT.bodyCompact }}>
                  <i className="ti ti-circle-check" style={{ fontSize: 32, display: 'block', marginBottom: 8, color: COLOR.success }} />
                  Nenhuma tarefa ativa. Todas as pendências estão em dia!
                </div>
              ) : (
                Object.entries(hierarchicalTodos).map(([topicName, subtopicsMap], topicIdx) => {
                  const allTodosInTopic = Object.values(subtopicsMap).flat()
                  const doneInTopic = allTodosInTopic.filter(t => t.done).length
                  const totalInTopic = allTodosInTopic.length
                  const subtopicsCount = Object.keys(subtopicsMap).length
                  const isExpanded = isTopicExpanded(topicName, topicIdx === 0)
                  const progressPct = totalInTopic > 0 ? Math.round((doneInTopic / totalInTopic) * 100) : 0

                  const lowerName = topicName.toLowerCase()
                  const topicIcon = lowerName.includes('rotina')
                    ? 'ti-repeat'
                    : lowerName.includes('escola') || lowerName.includes('colegio')
                    ? 'ti-school'
                    : lowerName.includes('prova') || lowerName.includes('avalia')
                    ? 'ti-file-certificate'
                    : lowerName.includes('particular') || lowerName.includes('tutor')
                    ? 'ti-user-star'
                    : 'ti-folder'

                  return (
                    <div
                      key={topicName}
                      style={{
                        background: '#fff',
                        border: `1px solid ${isExpanded ? COLOR.accent : BORDER.medium}`,
                        borderRadius: RADIUS.lg,
                        overflow: 'hidden',
                        boxShadow: isExpanded ? '0 2px 8px rgba(44,26,14,0.05)' : SHADOW.sm,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {/* Accordion Header da Camada 1: TÓPICO */}
                      <div
                        onClick={() => toggleTopic(topicName, topicIdx === 0)}
                        style={{
                          padding: '9px 14px',
                          background: isExpanded ? 'rgba(139,94,60,0.07)' : 'rgba(253,248,242,0.85)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          userSelect: 'none',
                          borderBottom: isExpanded ? `1px solid ${BORDER.soft}` : 'none',
                          gap: 12
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                          <i
                            className="ti ti-chevron-right"
                            style={{
                              fontSize: 13,
                              color: COLOR.paperWarm,
                              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                              transition: 'transform 0.15s ease',
                              flexShrink: 0
                            }}
                          />
                          <div style={{
                            width: 26,
                            height: 26,
                            borderRadius: RADIUS.md,
                            background: isExpanded ? COLOR.accent : 'rgba(139,94,60,0.15)',
                            color: isExpanded ? '#fff' : COLOR.accent,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 14,
                            flexShrink: 0
                          }}>
                            <i className={`ti ${topicIcon}`} />
                          </div>
                          <span style={{ fontSize: 13.5, fontWeight: 800, color: COLOR.paperInk, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {topicName}
                          </span>
                          <span style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            padding: '1px 7px',
                            borderRadius: RADIUS.sm,
                            background: 'rgba(44,26,14,0.06)',
                            color: COLOR.paperWarm,
                            flexShrink: 0
                          }}>
                            {subtopicsCount} subtópico{subtopicsCount > 1 ? 's' : ''}
                          </span>
                        </div>

                        {/* Progresso Compacto do Tópico */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 60, height: 5, background: 'rgba(139,94,60,0.15)', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${progressPct}%`, background: progressPct === 100 ? COLOR.success : COLOR.accent, borderRadius: 99 }} />
                            </div>
                            <span style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: progressPct === 100 ? COLOR.success : COLOR.accent,
                              minWidth: 46
                            }}>
                              {doneInTopic}/{totalInTopic}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setNewTopic(topicName)
                              setNewSubtopic('')
                            }}
                            title={`Adicionar tarefa em "${topicName}"`}
                            style={{
                              background: 'transparent',
                              border: `1px dashed ${BORDER.medium}`,
                              borderRadius: RADIUS.sm,
                              padding: '2px 7px',
                              fontSize: 11,
                              fontWeight: 700,
                              color: COLOR.paperWarm,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3
                            }}
                          >
                            <i className="ti ti-plus" style={{ fontSize: 10 }} /> Subtópico
                          </button>
                        </div>
                      </div>

                      {/* Corpo do Tópico: Gavetas da Camada 2 (SUBTÓPICOS) */}
                      {isExpanded && (
                        <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8, background: '#faf6f0' }}>
                          {Object.entries(subtopicsMap).map(([subtopicName, subtopicTodos]) => {
                            const doneInSubtopic = subtopicTodos.filter(t => t.done).length
                            const isSubExpanded = isSubtopicExpanded(topicName, subtopicName)
                            const subtopicKey = `${topicName}:::${subtopicName}`
                            const isAddingInSubtopic = quickAddSubtopicKey === subtopicKey

                            return (
                              <div
                                key={subtopicName}
                                style={{
                                  background: '#fff',
                                  border: `1px solid ${BORDER.soft}`,
                                  borderRadius: RADIUS.md,
                                  overflow: 'hidden',
                                  boxShadow: '0 1px 3px rgba(44,26,14,0.02)'
                                }}
                              >
                                {/* Header do Subtópico */}
                                <div
                                  onClick={() => toggleSubtopic(topicName, subtopicName)}
                                  style={{
                                    padding: '6px 10px',
                                    background: isSubExpanded ? 'rgba(44,26,14,0.02)' : '#fff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    cursor: 'pointer',
                                    borderBottom: isSubExpanded ? `1px dashed ${BORDER.soft}` : 'none',
                                    userSelect: 'none'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                    <i
                                      className="ti ti-chevron-right"
                                      style={{
                                        fontSize: 11,
                                        color: COLOR.paperWarm,
                                        transform: isSubExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                        transition: 'transform 0.15s ease'
                                      }}
                                    />
                                    <i
                                      className={`ti ${isSubExpanded ? 'ti-folder-open' : 'ti-folder'}`}
                                      style={{ color: '#b58900', fontSize: 13 }}
                                    />
                                    <span style={{ fontSize: 12.5, fontWeight: 700, color: COLOR.paperInk }}>
                                      {subtopicName}
                                    </span>
                                    <span style={{
                                      fontSize: 10,
                                      fontWeight: 600,
                                      padding: '1px 5px',
                                      borderRadius: RADIUS.sm,
                                      background: doneInSubtopic === subtopicTodos.length ? '#e8f5e9' : 'rgba(44,26,14,0.06)',
                                      color: doneInSubtopic === subtopicTodos.length ? '#2e7d32' : COLOR.paperWarm
                                    }}>
                                      {doneInSubtopic}/{subtopicTodos.length}
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setQuickAddSubtopicKey(isAddingInSubtopic ? null : subtopicKey)
                                      setQuickAddSubtopicText('')
                                    }}
                                    title={`Adicionar tarefa direta em "${subtopicName}"`}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: COLOR.accent,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 3,
                                      padding: '2px 5px'
                                    }}
                                  >
                                    <i className="ti ti-plus" /> Tarefa
                                  </button>
                                </div>

                                {/* Conteúdo do Subtópico (Camada 3: TAREFAS) */}
                                {isSubExpanded && (
                                  <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {/* Formulário Inline Rápido do Subtópico */}
                                    {isAddingInSubtopic && (
                                      <form
                                        onSubmit={(e) => {
                                          e.preventDefault()
                                          handleQuickAddInSubtopic(topicName, subtopicName)
                                        }}
                                        style={{
                                          display: 'flex',
                                          gap: 6,
                                          padding: 6,
                                          background: '#fdf8f2',
                                          borderRadius: RADIUS.sm,
                                          border: `1px solid ${BORDER.soft}`,
                                          marginBottom: 4
                                        }}
                                      >
                                        <input
                                          type="text"
                                          autoFocus
                                          value={quickAddSubtopicText}
                                          onChange={e => setQuickAddSubtopicText(e.target.value)}
                                          placeholder={`Nova tarefa em ${subtopicName}...`}
                                          style={{
                                            flex: 1,
                                            padding: '5px 8px',
                                            borderRadius: RADIUS.sm,
                                            border: `1px solid ${BORDER.medium}`,
                                            fontSize: 12,
                                            outline: 'none',
                                            color: COLOR.paperInk
                                          }}
                                        />
                                        <button
                                          type="submit"
                                          style={{
                                            padding: '4px 10px',
                                            borderRadius: RADIUS.sm,
                                            background: COLOR.accent,
                                            color: '#fff',
                                            border: 'none',
                                            fontSize: 11,
                                            fontWeight: 700,
                                            cursor: 'pointer'
                                          }}
                                        >
                                          Salvar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setQuickAddSubtopicKey(null)}
                                          style={{
                                            padding: '4px 8px',
                                            borderRadius: RADIUS.sm,
                                            background: 'transparent',
                                            color: COLOR.paperWarm,
                                            border: 'none',
                                            fontSize: 11,
                                            cursor: 'pointer'
                                          }}
                                        >
                                          Cancelar
                                        </button>
                                      </form>
                                    )}

                                    {/* Tarefas Compactas dentro do Subtópico */}
                                    {subtopicTodos.map(todo => renderTodoCardItem(todo))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          ) : (
            /* Lista Corrida Simples */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filteredTodos.length === 0 ? (
                <div style={{ padding: '36px 0', textAlign: 'center', color: COLOR.paperMid, fontSize: TEXT.bodyCompact }}>
                  <i className="ti ti-circle-check" style={{ fontSize: 32, display: 'block', marginBottom: 8, color: COLOR.success }} />
                  Nenhuma tarefa ativa nesta categoria. Todas as pendências estão em dia!
                </div>
              ) : (
                filteredTodos.map(todo => renderTodoCardItem(todo))
              )}
            </div>
          )}
        </ModuleCard>
      )}

      {/* ─── SUB-ABA: TAREFAS IMPORTADAS (TRELLO & EXTERNAS) ─── */}
      {viewMode === 'imported' && (
        <ModuleCard padding={18}>
          {/* Banner de Isolamento do Trello */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(0, 121, 191, 0.08) 0%, rgba(0, 121, 191, 0.02) 100%)',
            border: '1px solid rgba(0, 121, 191, 0.25)',
            borderRadius: RADIUS.lg,
            padding: '16px 20px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: RADIUS.md,
                background: '#0079bf',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 2px 8px rgba(0, 121, 191, 0.3)',
                flexShrink: 0
              }}>
                <i className="ti ti-brand-trello" style={{ fontSize: 24 }} />
              </div>
              <div>
                <div style={{ fontSize: TEXT.subtitle, fontWeight: 800, color: COLOR.paperInk, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>Tarefas Importadas do Trello</span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 99,
                    background: '#0079bf',
                    color: '#fff'
                  }}>
                    {filteredTodos.length} cartões
                  </span>
                </div>
                <div style={{ fontSize: TEXT.bodyCompact, color: COLOR.paperWarm, maxWidth: 650, marginTop: 2 }}>
                  Estas tarefas foram importadas do Trello e ficam separadas nesta aba exclusiva para manter sua rotina de aula e checklist regular limpos.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setIsTrelloModalOpen(true)}
                style={{
                  padding: '8px 16px',
                  borderRadius: RADIUS.md,
                  border: 'none',
                  background: '#0079bf',
                  color: '#fff',
                  fontSize: TEXT.caption,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 6px rgba(0, 121, 191, 0.3)',
                }}
              >
                <i className="ti ti-plus" />
                <span>Importar Mais do Trello</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('trello')}
                style={{
                  padding: '8px 14px',
                  borderRadius: RADIUS.md,
                  border: `1px solid ${BORDER.medium}`,
                  background: COLOR.surface1,
                  color: COLOR.paperInk,
                  fontSize: TEXT.caption,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <i className="ti ti-layout-kanban" />
                <span>Ver no Kanban</span>
              </button>
            </div>
          </div>

          {/* Renderização de Acordo com importedViewStyle */}
          {filteredTodos.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: COLOR.paperMid }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'rgba(0, 121, 191, 0.1)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
                color: '#0079bf'
              }}>
                <i className="ti ti-brand-trello" style={{ fontSize: 28 }} />
              </div>
              <div style={{ fontSize: TEXT.subtitle, fontWeight: 700, color: COLOR.paperInk, marginBottom: 4 }}>
                Nenhuma tarefa importada no momento
              </div>
              <p style={{ fontSize: TEXT.bodyCompact, color: COLOR.paperWarm, maxWidth: 450, margin: '0 auto 16px' }}>
                Conecte seu Trello para importar cartões, checklists e anexos diretamente para esta aba dedicada.
              </p>
              <button
                type="button"
                onClick={() => setIsTrelloModalOpen(true)}
                style={{
                  padding: '9px 18px',
                  borderRadius: RADIUS.md,
                  border: 'none',
                  background: '#0079bf',
                  color: '#fff',
                  fontSize: TEXT.bodyCompact,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 6px rgba(0, 121, 191, 0.3)',
                }}
              >
                <i className="ti ti-layout-kanban" />
                <span>Conectar e Importar do Trello</span>
              </button>
            </div>
          ) : importedViewStyle === 'timeline' ? (
            renderTimelineView(filteredTodos)
          ) : importedViewStyle === 'hierarchy' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(hierarchicalTodos).map(([topicName, subtopicsMap], topicIdx) => {
                const allTodosInTopic = Object.values(subtopicsMap).flat()
                const doneInTopic = allTodosInTopic.filter(t => t.done).length
                const totalInTopic = allTodosInTopic.length
                const isExpanded = isTopicExpanded(topicName, topicIdx === 0)
                return (
                  <div key={topicName} style={{ background: '#fff', borderRadius: RADIUS.lg, border: `1px solid ${BORDER.medium}`, overflow: 'hidden' }}>
                    <div
                      onClick={() => toggleTopic(topicName, topicIdx === 0)}
                      style={{ padding: '10px 14px', background: 'rgba(0, 121, 191, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="ti ti-brand-trello" style={{ color: '#0079bf', fontSize: 16 }} />
                        <span style={{ fontSize: 14, fontWeight: 800, color: COLOR.paperInk }}>{topicName}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(0, 121, 191, 0.15)', color: '#0079bf' }}>
                          {doneInTopic}/{totalInTopic}
                        </span>
                      </div>
                      <i className={`ti ${isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ color: COLOR.paperWarm, fontSize: 14 }} />
                    </div>
                    {isExpanded && (
                      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {allTodosInTopic.map(todo => renderTodoCardItem(todo))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filteredTodos.map(todo => renderTodoCardItem(todo))}
            </div>
          )}
        </ModuleCard>
      )}

      {/* ─── SUB-ABA 2: VISUAL TRELLO (QUADRO KANBAN COM COLUNAS POR TÓPICO) ─── */}
      {viewMode === 'trello' && (
        <div style={{
          display: 'flex',
          gap: 16,
          overflowX: 'auto',
          paddingBottom: 16,
          alignItems: 'flex-start',
        }}>
          {allUniqueTopics.map(topic => {
            const columnTodos = filteredTodos.filter(t => (t.tag?.trim() || 'Geral') === topic)
            const completedCount = columnTodos.filter(t => t.done).length

            return (
              <div
                key={topic}
                style={{
                  minWidth: 300,
                  maxWidth: 320,
                  flex: '0 0 310px',
                  background: '#f4ece1',
                  borderRadius: RADIUS.lg,
                  border: `1px solid ${BORDER.medium}`,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  boxShadow: SHADOW.sm,
                }}
              >
                {/* Header da Coluna */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ti ti-list" style={{ color: COLOR.accent, fontSize: 16 }} />
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: COLOR.paperInk }}>
                      {topic}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: RADIUS.sm,
                    background: 'rgba(44,26,14,0.08)',
                    color: COLOR.paperWarm
                  }}>
                    {completedCount}/{columnTodos.length}
                  </span>
                </div>

                {/* Cartões da Coluna */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '65vh', overflowY: 'auto', paddingRight: 2 }}>
                  {columnTodos.length === 0 ? (
                    <div style={{ padding: '20px 10px', textAlign: 'center', color: COLOR.paperMid, fontSize: TEXT.caption, border: `1px dashed ${BORDER.soft}`, borderRadius: RADIUS.md }}>
                      Nenhum cartão nesta lista.
                    </div>
                  ) : (
                    columnTodos.map(todo => renderKanbanCardItem(todo, allUniqueTopics))
                  )}
                </div>

                {/* Ação Rápida de Adicionar Cartão na Coluna */}
                {quickAddColumnTag === topic ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#fff', padding: 8, borderRadius: RADIUS.md, border: `1px solid ${BORDER.medium}` }}>
                    <textarea
                      value={quickAddText}
                      onChange={e => setQuickAddText(e.target.value)}
                      placeholder="Título do novo cartão..."
                      rows={2}
                      style={{
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        fontSize: TEXT.bodyCompact,
                        fontFamily: FONT.sans,
                        resize: 'none',
                        color: COLOR.paperInk,
                      }}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setQuickAddColumnTag(null)
                          setQuickAddText('')
                        }}
                        style={{ padding: '4px 8px', borderRadius: RADIUS.sm, border: 'none', background: 'transparent', color: COLOR.paperWarm, fontSize: 11, cursor: 'pointer' }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickAddInColumn(topic)}
                        style={{ padding: '4px 10px', borderRadius: RADIUS.sm, border: 'none', background: COLOR.accent, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                      >
                        Adicionar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setQuickAddColumnTag(topic)
                      setQuickAddText('')
                    }}
                    style={{
                      padding: '8px 10px',
                      borderRadius: RADIUS.md,
                      border: 'none',
                      background: 'rgba(44,26,14,0.05)',
                      color: COLOR.paperWarm,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: TRANSITION.fast,
                    }}
                  >
                    <i className="ti ti-plus" style={{ fontSize: 13 }} />
                    <span>Adicionar Cartão</span>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ─── SUB-ABA 3: HISTÓRICO DE CONCLUSÕES ─── */}
      {viewMode === 'history' && (
        <ModuleCard padding={20}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredHistory.length === 0 ? (
              <div style={{ padding: '36px 0', textAlign: 'center', color: COLOR.paperMid, fontSize: TEXT.bodyCompact }}>
                <i className="ti ti-inbox" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
                Nenhum registro de tarefa concluída neste período ({periodLabelText}).
              </div>
            ) : (
              filteredHistory.map((item, idx) => (
                <div
                  key={item.id || idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '12px 16px',
                    borderRadius: RADIUS.md,
                    background: COLOR.surface1,
                    border: `1px solid ${BORDER.soft}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, background: COLOR.success, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className="ti ti-check" style={{ color: '#fff', fontSize: 13 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: TEXT.body, fontWeight: 600, color: COLOR.paperInk }}>
                        {item.text}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                        <span style={{ fontSize: TEXT.micro, color: COLOR.paperWarm, fontWeight: 600 }}>
                          {new Date(item.completedAt).toLocaleString('pt-BR')}
                        </span>
                        {item.tag && (
                          <span style={{ fontSize: TEXT.micro, color: COLOR.paperWarm, background: 'rgba(44,26,14,0.06)', padding: '1px 6px', borderRadius: RADIUS.sm }}>
                            {item.tag}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      deleteChecklistHistoryItem(item.id)
                      setHistory(loadChecklistHistory())
                      toast.info('Item removido do histórico.')
                    }}
                    style={{ background: 'none', border: 'none', color: COLOR.paperMid, cursor: 'pointer', fontSize: 14 }}
                    title="Excluir este registro"
                  >
                    <i className="ti ti-trash" />
                  </button>
                </div>
              ))
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

      {/* Modal de Edição de Tarefas */}
      {editingTodo && (
        <ChecklistEditModal
          todo={editingTodo}
          isOpen={Boolean(editingTodo)}
          onClose={() => setEditingTodo(null)}
          onSave={updated => {
            const list = todos.map(t => t.id === updated.id ? updated : t)
            setTodos(list)
            saveChecklistTodos(list)
            setEditingTodo(null)
          }}
        />
      )}
    </div>
  )

  // Helper para renderizar itens em Timeline Cronológica (ordenada por momento de postagem)
  function renderTimelineView(todoList: ChecklistTodo[]) {
    const groups = groupTodosByTimeline(todoList)

    if (groups.length === 0) {
      return (
        <div style={{ padding: '36px 0', textAlign: 'center', color: COLOR.paperMid, fontSize: TEXT.bodyCompact }}>
          <i className="ti ti-circle-check" style={{ fontSize: 32, display: 'block', marginBottom: 8, color: COLOR.success }} />
          Nenhuma tarefa nesta categoria no momento. Tudo em dia!
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '8px 4px' }}>
        {groups.map(group => {
          const groupDone = group.todos.filter(t => t.done).length
          const groupTotal = group.todos.length

          return (
            <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Cabeçalho do Bloco Temporal na Linha do Tempo */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px',
                background: group.key === 'today' ? 'rgba(139,94,60,0.08)' : 'rgba(44,26,14,0.04)',
                borderRadius: RADIUS.md,
                border: `1px solid ${group.key === 'today' ? 'rgba(139,94,60,0.2)' : BORDER.soft}`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: RADIUS.sm,
                    background: group.key === 'today' ? COLOR.accent : 'rgba(44,26,14,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: group.key === 'today' ? '#fff' : COLOR.paperInk,
                  }}>
                    <i className={`ti ${group.icon}`} style={{ fontSize: 15 }} />
                  </div>
                  <div>
                    <div style={{ fontSize: TEXT.bodyCompact, fontWeight: 800, color: COLOR.paperInk, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{group.label}</span>
                      <span style={{ fontSize: TEXT.micro, color: COLOR.paperWarm, fontWeight: 600 }}>
                        — {group.sublabel}
                      </span>
                    </div>
                  </div>
                </div>

                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 99,
                  background: groupDone === groupTotal ? '#e8f5e9' : 'rgba(44,26,14,0.08)',
                  color: groupDone === groupTotal ? '#2e7d32' : COLOR.paperWarm
                }}>
                  {groupDone}/{groupTotal} concluídas
                </span>
              </div>

              {/* Trilha da Linha do Tempo com Indicadores e Linha Vertical */}
              <div style={{
                position: 'relative',
                paddingLeft: 22,
                marginLeft: 14,
                borderLeft: `2px dashed ${group.key === 'today' ? COLOR.accent : BORDER.medium}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}>
                {group.todos.map(todo => (
                  <div key={todo.id} style={{ position: 'relative' }}>
                    {/* Nó da Timeline com status */}
                    <div
                      title={todo.done ? 'Concluída' : 'Pendente'}
                      style={{
                        position: 'absolute',
                        left: -29,
                        top: 18,
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: todo.done ? COLOR.success : isImportedTodo(todo) ? '#0079bf' : COLOR.accent,
                        border: '2.5px solid #fff',
                        boxShadow: '0 1px 4px rgba(44,26,14,0.2)',
                        zIndex: 2,
                      }}
                    />
                    {renderTodoCardItem(todo)}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Helper para renderizar item na Visualização em Lista / Tópicos
  function renderTodoCardItem(todo: ChecklistTodo) {
    const isRecurrent = todo.category === 'recurrent'
    const hasSubtasks = todo.subtasks && todo.subtasks.length > 0
    const completedSubtasks = hasSubtasks ? todo.subtasks!.filter(s => s.done).length : 0

    return (
      <div
        key={todo.id}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '12px 16px',
          borderRadius: RADIUS.md,
          background: todo.done ? COLOR.paperPage : COLOR.surface1,
          border: `1px solid ${todo.done ? BORDER.soft : BORDER.medium}`,
          transition: TRANSITION.fast,
          boxShadow: todo.done ? 'none' : SHADOW.sm,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
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
                {/* Badge de Categoria ou Origem (Trello) */}
                {isImportedTodo(todo) ? (
                  <span style={{
                    fontSize: TEXT.micro,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: RADIUS.sm,
                    background: '#0079bf',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    boxShadow: '0 1px 3px rgba(0,121,191,0.2)'
                  }}>
                    <i className="ti ti-brand-trello" style={{ fontSize: 11 }} />
                    Trello: {todo.tag || 'Importada'}
                  </span>
                ) : (
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
                )}

                {/* Badge de Horário / Momento de Postagem na Timeline */}
                <span style={{
                  fontSize: TEXT.micro,
                  color: COLOR.paperWarm,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }} title="Momento em que a tarefa foi postada">
                  <i className="ti ti-clock" style={{ fontSize: 11, color: COLOR.accent }} />
                  {formatTimelineTime(todo.createdAt)}
                </span>

                {hasSubtasks && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleTaskSubtasks(todo.id)
                    }}
                    style={{
                      fontSize: TEXT.micro,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: RADIUS.sm,
                      background: expandedTaskSubtasks[todo.id] ? 'rgba(34,197,94,0.22)' : 'rgba(34,197,94,0.12)',
                      color: '#15803d',
                      border: '1px solid rgba(34,197,94,0.3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'pointer',
                    }}
                    title={expandedTaskSubtasks[todo.id] ? 'Recolher subtarefas' : 'Ver subtarefas'}
                  >
                    <i className="ti ti-list-check" style={{ fontSize: 11 }} />
                    {completedSubtasks}/{todo.subtasks!.length} subtarefas
                    <i className={expandedTaskSubtasks[todo.id] ? 'ti ti-chevron-up' : 'ti ti-chevron-down'} style={{ fontSize: 10 }} />
                  </button>
                )}

                {todo.attachments && todo.attachments.length > 0 && (
                  <span style={{ fontSize: TEXT.micro, color: '#7e22ce', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <i className="ti ti-paperclip" style={{ fontSize: 11 }} />
                    {todo.attachments.length} anexo(s)
                  </span>
                )}

                {(todo.topic || todo.tag) && !isImportedTodo(todo) && (
                  <span style={{ fontSize: TEXT.micro, color: COLOR.paperWarm, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <i className="ti ti-folder" style={{ fontSize: 11 }} />
                    {todo.topic || todo.tag}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => setEditingTodo(todo)}
              style={{ background: 'none', border: 'none', color: COLOR.paperWarm, cursor: 'pointer', fontSize: 15, padding: 6 }}
              title="Editar tarefa"
            >
              <i className="ti ti-edit" />
            </button>
            <button
              onClick={() => handleDelete(todo.id)}
              style={{ background: 'none', border: 'none', color: COLOR.danger, cursor: 'pointer', fontSize: 15, padding: 6 }}
              title="Excluir tarefa"
            >
              <i className="ti ti-trash" />
            </button>
          </div>
        </div>

        {/* Subtarefas do Cartão com Checkboxes Clicáveis (Colapsável) */}
        {hasSubtasks && expandedTaskSubtasks[todo.id] && (
          <div style={{
            marginLeft: 34,
            padding: '8px 12px',
            background: 'rgba(44,26,14,0.03)',
            borderRadius: RADIUS.sm,
            borderLeft: `3px solid ${COLOR.accent}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            marginTop: 4,
          }}>
            {todo.subtasks!.map(st => (
              <div
                key={st.id}
                onClick={() => handleToggleSubtask(todo.id, st.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  fontSize: 12,
                  color: st.done ? COLOR.paperMid : COLOR.paperInk,
                  textDecoration: st.done ? 'line-through' : 'none',
                }}
              >
                <div style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  border: st.done ? 'none' : `1px solid ${BORDER.medium}`,
                  background: st.done ? COLOR.success : '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {st.done && <i className="ti ti-check" style={{ color: '#fff', fontSize: 10 }} />}
                </div>
                <span>{st.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Helper para renderizar item no Visual Trello / Kanban
  function renderKanbanCardItem(todo: ChecklistTodo, allTopics: string[]) {
    const isRecurrent = todo.category === 'recurrent'
    const hasSubtasks = todo.subtasks && todo.subtasks.length > 0
    const completedSubtasks = hasSubtasks ? todo.subtasks!.filter(s => s.done).length : 0

    return (
      <div
        key={todo.id}
        style={{
          background: todo.done ? 'rgba(253, 248, 242, 0.7)' : '#ffffff',
          borderRadius: RADIUS.md,
          border: `1px solid ${todo.done ? BORDER.soft : BORDER.medium}`,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          boxShadow: todo.done ? 'none' : '0 2px 5px rgba(44,26,14,0.06)',
          transition: TRANSITION.fast,
        }}
      >
        {/* Topo do Cartão: Checkbox Principal e Título */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div
            onClick={() => handleToggle(todo.id)}
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              border: todo.done ? 'none' : `2px solid ${COLOR.paperInk}`,
              background: todo.done ? COLOR.success : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            {todo.done && <i className="ti ti-check" style={{ color: '#fff', fontSize: 12 }} />}
          </div>

          <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: todo.done ? COLOR.paperMid : COLOR.paperInk, textDecoration: todo.done ? 'line-through' : 'none' }}>
            {todo.text}
          </div>
        </div>

        {/* Subtarefas / Checklist do Trello Interativo */}
        {hasSubtasks && (
          <div style={{
            background: 'rgba(44,26,14,0.03)',
            borderRadius: RADIUS.sm,
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}>
            <div
              onClick={() => toggleTaskSubtasks(todo.id)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 11,
                fontWeight: 700,
                color: COLOR.paperWarm,
                cursor: 'pointer',
              }}
              title={expandedTaskSubtasks[todo.id] ? 'Recolher itens' : 'Expandir itens'}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="ti ti-list-check" style={{ fontSize: 11 }} />
                Checklist
                <i className={expandedTaskSubtasks[todo.id] ? 'ti ti-chevron-up' : 'ti ti-chevron-down'} style={{ fontSize: 10 }} />
              </span>
              <span>{completedSubtasks}/{todo.subtasks!.length}</span>
            </div>

            {/* Barra de Progresso */}
            <div style={{ height: 4, background: 'rgba(44,26,14,0.1)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(completedSubtasks / todo.subtasks!.length) * 100}%`,
                background: completedSubtasks === todo.subtasks!.length ? COLOR.success : COLOR.accent,
                transition: TRANSITION.fast,
              }} />
            </div>

            {/* Itens do Checklist */}
            {expandedTaskSubtasks[todo.id] && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                {todo.subtasks!.map(st => (
                  <div
                    key={st.id}
                    onClick={() => handleToggleSubtask(todo.id, st.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    fontSize: 11.5,
                    color: st.done ? COLOR.paperMid : COLOR.paperInk,
                    textDecoration: st.done ? 'line-through' : 'none',
                  }}
                >
                  <div style={{
                    width: 12,
                    height: 12,
                    borderRadius: 2,
                    border: st.done ? 'none' : `1px solid ${BORDER.medium}`,
                    background: st.done ? COLOR.success : '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {st.done && <i className="ti ti-check" style={{ color: '#fff', fontSize: 9 }} />}
                  </div>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.text}</span>
                </div>
              ))}
            </div>
            )}
          </div>
        )}

        {/* Rodapé do Cartão com Badges e Menu Mover */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${BORDER.soft}`, paddingTop: 6, marginTop: 2 }}>
          {/* Seletor Rápido de Mover Coluna */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, color: COLOR.paperWarm, fontWeight: 700 }}>Mover:</span>
            <select
              value={todo.tag || 'Geral'}
              onChange={e => handleMoveTag(todo.id, e.target.value)}
              style={{
                fontSize: 10.5,
                padding: '2px 4px',
                borderRadius: RADIUS.sm,
                border: `1px solid ${BORDER.soft}`,
                background: '#fff',
                color: COLOR.paperInk,
                cursor: 'pointer',
                maxWidth: 110,
              }}
            >
              {allTopics.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              onClick={() => setEditingTodo(todo)}
              style={{ background: 'none', border: 'none', color: COLOR.paperWarm, cursor: 'pointer', fontSize: 13, padding: 3 }}
              title="Editar"
            >
              <i className="ti ti-edit" />
            </button>
            <button
              onClick={() => handleDelete(todo.id)}
              style={{ background: 'none', border: 'none', color: COLOR.danger, cursor: 'pointer', fontSize: 13, padding: 3 }}
              title="Excluir"
            >
              <i className="ti ti-trash" />
            </button>
          </div>
        </div>
      </div>
    )
  }
}
