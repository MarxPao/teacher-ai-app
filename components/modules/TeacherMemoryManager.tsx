'use client'

import { useState, useEffect } from 'react'
import { COLOR, RADIUS } from '@/styles/tokens'
import { toast } from '@/components/Toast'
import Button from '@/components/Button'
import ModuleCard from '@/components/ModuleCard'
import {
  getCuratedMemory,
  saveCuratedMemory,
  exportCuratedMemoryMarkdown,
  CuratedTeacherMemory
} from '@/lib/curatedMemory'
import {
  getStoredTasks,
  createAgentTask,
  updateAgentTaskStatus,
  deleteAgentTask,
  AgentTask,
  TaskPriority
} from '@/lib/taskMemory'
import { LearnedFact } from '@/lib/longTermMemory'

export default function TeacherMemoryManager() {
  const [memory, setMemory] = useState<CuratedTeacherMemory | null>(null)
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [activeSubTab, setActiveSubTab] = useState<'tasks' | 'semantic' | 'lgpd'>('tasks')

  // Form de Nova Tarefa
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDate, setNewTaskDate] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('media')

  // Form de Novo Fato
  const [newFactCategory, setNewFactCategory] = useState<LearnedFact['category']>('grading_rigor')
  const [newFactText, setNewFactText] = useState('')
  const [newFactImportance, setNewFactImportance] = useState(0.8)

  // LGPD Purge
  const [studentToPurge, setStudentToPurge] = useState('')

  function refreshData() {
    setMemory(getCuratedMemory())
    setTasks(getStoredTasks())
  }

  useEffect(() => {
    refreshData()
    const handleTasks = () => setTasks(getStoredTasks())
    const handleStorage = () => refreshData()

    window.addEventListener('teacher:tasks_changed', handleTasks)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('teacher:tasks_changed', handleTasks)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  /* Exportar MEMORY.md */
  function handleDownloadMarkdown() {
    const md = exportCuratedMemoryMarkdown()
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `MEMORY_RAFINHA_${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Arquivo MEMORY.md exportado com sucesso!')
  }

  function handleCopyMarkdown() {
    const md = exportCuratedMemoryMarkdown()
    navigator.clipboard.writeText(md)
    toast.success('Conteúdo de MEMORY.md copiado para a área de transferência!')
  }

  /* Criação de Tarefa */
  function handleCreateTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTaskTitle.trim()) {
      toast.error('Informe o título do compromisso.')
      return
    }

    const due = newTaskDate ? new Date(newTaskDate).toISOString() : new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    createAgentTask({
      title: newTaskTitle.trim(),
      dueDate: due,
      priority: newTaskPriority
    })

    setNewTaskTitle('')
    setNewTaskDate('')
    refreshData()
    toast.success('Compromisso agendado com sucesso!')
  }

  /* Criação de Fato Semântico */
  function handleCreateFact(e: React.FormEvent) {
    e.preventDefault()
    if (!newFactText.trim()) {
      toast.error('Descreva a preferência ou regra.')
      return
    }

    if (!memory) return

    const newFact: LearnedFact = {
      id: `fact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      category: newFactCategory,
      fact: newFactText.trim(),
      learnedAt: new Date().toISOString(),
      confidence: newFactImportance
    }

    const updated: CuratedTeacherMemory = {
      ...memory,
      learnedFacts: [newFact, ...memory.learnedFacts],
      lastUpdated: new Date().toISOString()
    }

    saveCuratedMemory(updated)
    setNewFactText('')
    refreshData()
    toast.success('Nova preferência salva no cérebro da Rafinha!')
  }

  /* Exclusão de Fato */
  function handleDeleteFact(id: string) {
    if (!memory) return
    const filtered = memory.learnedFacts.filter(f => f.id !== id)
    saveCuratedMemory({
      ...memory,
      learnedFacts: filtered,
      lastUpdated: new Date().toISOString()
    })
    refreshData()
    toast.success('Fato removido da memória.')
  }

  /* Atualização inline de Fato */
  function handleUpdateFact(id: string, newText: string) {
    if (!memory || !newText.trim()) return
    const updatedFacts = memory.learnedFacts.map(f => {
      if (f.id === id) return { ...f, fact: newText.trim() }
      return f
    })
    saveCuratedMemory({
      ...memory,
      learnedFacts: updatedFacts,
      lastUpdated: new Date().toISOString()
    })
    refreshData()
    toast.success('Fato atualizado com sucesso!')
  }

  /* Purga de Aluno (LGPD) */
  function handlePurgeStudent() {
    const clean = studentToPurge.trim().toLowerCase()
    if (!clean) {
      toast.error('Digite o nome do aluno para expurgar.')
      return
    }

    // 1. Limpar de student_memory
    try {
      const rawMem = localStorage.getItem('teacher_student_memory')
      if (rawMem) {
        const parsed = JSON.parse(rawMem)
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((entry: any) => {
            const n = String(entry.studentName || '').toLowerCase()
            return !n.includes(clean)
          })
          localStorage.setItem('teacher_student_memory', JSON.stringify(filtered))
        }
      }
    } catch {}

    // 2. Limpar tarefas relacionadas
    const currentTasks = getStoredTasks()
    const filteredTasks = currentTasks.filter(t => {
      const rel = String(t.relatedStudentName || '').toLowerCase()
      return !rel.includes(clean)
    })
    localStorage.setItem('teacher_agent_tasks_v1', JSON.stringify(filteredTasks))

    setStudentToPurge('')
    refreshData()
    toast.success(`Todos os dados e registros relacionados a "${clean}" foram expurgados (LGPD).`)
  }

  if (!memory) return null

  return (
    <div className="space-y-6">
      {/* CARD PRINCIPAL: Identidade e Resumo do Cérebro */}
      <ModuleCard title="Cérebro & Memória da Assistente (Rafinha)" icon="ti-brain" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: '#7a5c42', margin: '0 0 16px', lineHeight: 1.5 }}>
          A Rafinha utiliza uma memória persistente com governança de regras. Visualize abaixo suas preferências curadas, compromissos ativos e audite tudo o que ela aprendeu durante as interações.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div style={{ padding: '12px 14px', background: '#fdf8f2', borderRadius: RADIUS.md, border: '1px solid #ebd8c8' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#a08060', textTransform: 'uppercase' }}>Rigor de Avaliação</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#2c1a0e', textTransform: 'capitalize' }}>{memory.gradingRigor}</div>
          </div>
          <div style={{ padding: '12px 14px', background: '#fdf8f2', borderRadius: RADIUS.md, border: '1px solid #ebd8c8' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#a08060', textTransform: 'uppercase' }}>Disciplina Principal</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#2c1a0e', textTransform: 'capitalize' }}>{memory.defaultSubject}</div>
          </div>
          <div style={{ padding: '12px 14px', background: '#fdf8f2', borderRadius: RADIUS.md, border: '1px solid #ebd8c8' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#a08060', textTransform: 'uppercase' }}>Fatos Aprendidos</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>{memory.learnedFacts.length}</div>
          </div>
          <div style={{ padding: '12px 14px', background: '#fdf8f2', borderRadius: RADIUS.md, border: '1px solid #ebd8c8' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#a08060', textTransform: 'uppercase' }}>Compromissos Pendentes</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>{tasks.filter(t => t.status === 'pendente').length}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" icon={<i className="ti ti-download" />} onClick={handleDownloadMarkdown}>
            Exportar MEMORY.md
          </Button>
          <Button variant="secondary" size="sm" icon={<i className="ti ti-copy" />} onClick={handleCopyMarkdown}>
            Copiar MEMORY.md
          </Button>
        </div>
      </ModuleCard>

      {/* NAVEGAÇÃO DE SUB-ABAS */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #d5c8bb', paddingBottom: 8 }}>
        <button
          onClick={() => setActiveSubTab('tasks')}
          style={{
            padding: '7px 14px',
            borderRadius: RADIUS.md,
            background: activeSubTab === 'tasks' ? '#8b5e3c' : 'transparent',
            color: activeSubTab === 'tasks' ? '#fff' : '#7a5c42',
            border: 'none',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          ⏰ Tarefas & Lembretes ({tasks.filter(t => t.status === 'pendente').length})
        </button>
        <button
          onClick={() => setActiveSubTab('semantic')}
          style={{
            padding: '7px 14px',
            borderRadius: RADIUS.md,
            background: activeSubTab === 'semantic' ? '#8b5e3c' : 'transparent',
            color: activeSubTab === 'semantic' ? '#fff' : '#7a5c42',
            border: 'none',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          💡 Fatos & Preferências ({memory.learnedFacts.length})
        </button>
        <button
          onClick={() => setActiveSubTab('lgpd')}
          style={{
            padding: '7px 14px',
            borderRadius: RADIUS.md,
            background: activeSubTab === 'lgpd' ? '#8b5e3c' : 'transparent',
            color: activeSubTab === 'lgpd' ? '#fff' : '#7a5c42',
            border: 'none',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          🛡️ Governança & LGPD
        </button>
      </div>

      {/* SUB-ABA 1: TAREFAS & COMPROMISSOS */}
      {activeSubTab === 'tasks' && (
        <ModuleCard title="Compromissos e Prazos Docentes" icon="ti-calendar-time">
          {/* Form de Criação */}
          <form onSubmit={handleCreateTask} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr auto', gap: 10, marginBottom: 20, alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#a08060', marginBottom: 4 }}>O que precisa ser feito?</label>
              <input
                type="text"
                placeholder="Ex: Lançar notas da recuperação"
                value={newTaskTitle}
                onChange={e => setNewTaskTitle(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: RADIUS.md, border: '1px solid #d5c8bb', background: '#fff', fontSize: 13 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#a08060', marginBottom: 4 }}>Prazo / Data e Hora</label>
              <input
                type="datetime-local"
                value={newTaskDate}
                onChange={e => setNewTaskDate(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: RADIUS.md, border: '1px solid #d5c8bb', background: '#fff', fontSize: 12 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#a08060', marginBottom: 4 }}>Prioridade</label>
              <select
                value={newTaskPriority}
                onChange={e => setNewTaskPriority(e.target.value as TaskPriority)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: RADIUS.md, border: '1px solid #d5c8bb', background: '#fff', fontSize: 12 }}
              >
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica</option>
              </select>
            </div>
            <Button type="submit" variant="primary" size="sm" icon={<i className="ti ti-plus" />}>
              Agendar
            </Button>
          </form>

          {/* Lista de Tarefas */}
          {tasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: '#a08060', fontSize: 13 }}>
              Nenhum compromisso cadastrado. Diga à Rafinha no chat: <em>"Lembre-me de fechar a chamada até sexta"</em>!
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map(t => {
                const isDone = t.status === 'concluida'
                const due = new Date(t.dueDate)
                const formattedDate = isNaN(due.getTime()) ? t.dueDate : due.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

                return (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: isDone ? '#f0ede8' : '#fffcf8',
                      borderRadius: RADIUS.md,
                      border: '1px solid #ebd8c8',
                      opacity: isDone ? 0.65 : 1
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button
                        onClick={() => {
                          updateAgentTaskStatus(t.id, isDone ? 'pendente' : 'concluida')
                          refreshData()
                        }}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          border: `2px solid ${isDone ? '#16a34a' : '#a08060'}`,
                          background: isDone ? '#16a34a' : 'transparent',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          fontSize: 12
                        }}
                      >
                        {isDone && <i className="ti ti-check" />}
                      </button>

                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e', textDecoration: isDone ? 'line-through' : 'none' }}>
                          {t.title}
                        </div>
                        <div style={{ fontSize: 11, color: '#7a5c42', display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                          <span>📅 {formattedDate}</span>
                          <span style={{
                            padding: '1px 6px',
                            borderRadius: 6,
                            fontSize: 10,
                            fontWeight: 700,
                            background: t.priority === 'alta' || t.priority === 'critica' ? '#fee2e2' : '#e0f2fe',
                            color: t.priority === 'alta' || t.priority === 'critica' ? '#b91c1c' : '#0369a1'
                          }}>
                            {t.priority.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        deleteAgentTask(t.id)
                        refreshData()
                      }}
                      style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', padding: 6 }}
                      title="Excluir tarefa"
                    >
                      <i className="ti ti-trash" style={{ fontSize: 16 }} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </ModuleCard>
      )}

      {/* SUB-ABA 2: FATOS & PREFERÊNCIAS */}
      {activeSubTab === 'semantic' && (
        <ModuleCard title="Fatos e Preferências Curadas da Professora" icon="ti-bulb">
          {/* Form de Adicionar Fato */}
          <form onSubmit={handleCreateFact} style={{ display: 'grid', gridTemplateColumns: '1.5fr 3fr auto', gap: 10, marginBottom: 20, alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#a08060', marginBottom: 4 }}>Categoria</label>
              <select
                value={newFactCategory}
                onChange={e => setNewFactCategory(e.target.value as any)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: RADIUS.md, border: '1px solid #d5c8bb', background: '#fff', fontSize: 12 }}
              >
                <option value="grading_rigor">Rigor de Avaliação</option>
                <option value="teaching_style">Estilo de Ensino</option>
                <option value="communication_rule">Regra de Comunicação</option>
                <option value="school_context">Contexto Institucional</option>
                <option value="student_insight">Insight Pedagógico</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#a08060', marginBottom: 4 }}>Regra ou Preferência</label>
              <input
                type="text"
                placeholder="Ex: Descontar 0.5 por erro de pontuação grave"
                value={newFactText}
                onChange={e => setNewFactText(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: RADIUS.md, border: '1px solid #d5c8bb', background: '#fff', fontSize: 13 }}
              />
            </div>
            <Button type="submit" variant="primary" size="sm" icon={<i className="ti ti-plus" />}>
              Aprender
            </Button>
          </form>

          {/* Lista de Fatos com Edição Inline */}
          {memory.learnedFacts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: '#a08060', fontSize: 13 }}>
              Nenhum fato registrado. À medida que você conversa ou corrige redações, a Rafinha aprende suas preferências automaticamente.
            </div>
          ) : (
            <div className="space-y-3">
              {memory.learnedFacts.map(fact => (
                <div
                  key={fact.id}
                  style={{
                    padding: '12px 14px',
                    background: '#fffcf8',
                    borderRadius: RADIUS.md,
                    border: '1px solid #ebd8c8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 700,
                        background: '#f5efe6',
                        color: '#7a5c42'
                      }}>
                        {fact.category.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 11, color: '#a08060' }}>
                        Confiança: {Math.round((fact.confidence || 0.8) * 100)}%
                      </span>
                    </div>

                    <input
                      type="text"
                      defaultValue={fact.fact}
                      onBlur={e => handleUpdateFact(fact.id, e.target.value)}
                      style={{
                        width: '100%',
                        fontSize: 13,
                        color: '#2c1a0e',
                        fontWeight: 600,
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px dashed #d5c8bb',
                        padding: '2px 0',
                        outline: 'none'
                      }}
                      title="Clique para editar este fato diretamente"
                    />
                  </div>

                  <button
                    onClick={() => handleDeleteFact(fact.id)}
                    style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', padding: 6 }}
                    title="Remover fato"
                  >
                    <i className="ti ti-trash" style={{ fontSize: 16 }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </ModuleCard>
      )}

      {/* SUB-ABA 3: LGPD & DIREITO AO ESQUECIMENTO */}
      {activeSubTab === 'lgpd' && (
        <ModuleCard title="Direito ao Esquecimento e Governança LGPD" icon="ti-shield-lock">
          <p style={{ fontSize: 13, color: '#7a5c42', margin: '0 0 16px', lineHeight: 1.5 }}>
            Em conformidade com a Lei Geral de Proteção de Dados (LGPD), você possui controle soberano sobre a memória da inteligência artificial. Caso um aluno seja transferido ou solicite a exclusão de seus dados, utilize a ferramenta de expurgo definitivo abaixo.
          </p>

          <div style={{ padding: '16px', background: '#fdf8f2', borderRadius: RADIUS.md, border: '1px solid #ebd8c8', marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 6 }}>
              Expurgar Aluno Específico da Memória da IA
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="text"
                placeholder="Nome do aluno (ex: Alice ou Hugo)"
                value={studentToPurge}
                onChange={e => setStudentToPurge(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid #d5c8bb', background: '#fff', fontSize: 13 }}
              />
              <Button variant="danger" size="sm" icon={<i className="ti ti-trash" />} onClick={handlePurgeStudent}>
                Expurgar Dados
              </Button>
            </div>
            <div style={{ fontSize: 11, color: '#a08060', marginTop: 6 }}>
              Esta ação removerá permanentemente notas de observação, tarefas e ocorrências vinculadas a este nome.
            </div>
          </div>
        </ModuleCard>
      )}
    </div>
  )
}
