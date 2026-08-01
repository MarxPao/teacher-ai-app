'use client'

import { useState, useEffect } from 'react'
import ModuleShell from '@/components/ModuleShell'
import ModuleCard from '@/components/ModuleCard'

export default function Dashboard() {
  const [todos, setTodos] = useState<{ id: string; text: string; done: boolean }[]>([])
  const [newTodo, setNewTodo] = useState('')

  const [nextTask, setNextTask] = useState<any>(null)
  const [data, setData] = useState({
    studentsCount: 0,
    materialsCount: 0,
    overallAvg: 0,
    classes: 0,
    topStudents: [] as any[],
  })

  useEffect(() => {
    let studentsCount = 0
    let materialsCount = 0
    let overallAvg = 0
    let classesCount = 0
    let topStudents: any[] = []

    const studentsStr = localStorage.getItem('teacher_students')
    const configStr = localStorage.getItem('teacher_gbConfig')
    if (studentsStr && configStr) {
      const students = JSON.parse(studentsStr)
      const config = JSON.parse(configStr)
      studentsCount = students.length
      classesCount = new Set(students.map((s: any) => s.class)).size

      // Calcular médias
      const avgs = students.map((s: any) => {
        const vals = Object.values(s.grades || {}).map((v: any) => parseFloat(String(v).replace(',', '.'))).filter((n: number) => !isNaN(n))
        return {
          name: s.name,
          avg: vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null,
          initials: s.name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
        }
      }).filter((s: any) => s.avg !== null)

      if (avgs.length > 0) {
        overallAvg = avgs.reduce((a: number, s: any) => a + s.avg, 0) / avgs.length
        topStudents = avgs.sort((a: any, b: any) => b.avg - a.avg).slice(0, 3)
      }
    }

    const repoStr = localStorage.getItem('teacher_repo')
    if (repoStr) {
      materialsCount = JSON.parse(repoStr).length
    }

    setData({ studentsCount, materialsCount, overallAvg, classes: classesCount, topStudents })

    try {
      const savedTasks = localStorage.getItem('teacher_calendar_tasks')
      if (savedTasks) {
        const tasks = JSON.parse(savedTasks)
        const pending = tasks.filter((t: any) => !t.done)
        if (pending.length > 0) {
          // Ordena pela data mais próxima
          pending.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
          setNextTask(pending[0])
        }
      }
    } catch {}

    try {
      const savedTodos = localStorage.getItem('teacher_dashboard_todos')
      if (savedTodos) setTodos(JSON.parse(savedTodos))
      else setTodos([
        { id: '1', text: 'Preparar aula do 9º Ano', done: false },
        { id: '2', text: 'Corrigir provas de Grammar', done: true },
        { id: '3', text: 'Enviar bilhete para os pais do João', done: false }
      ])
    } catch {}
  }, [])

  function addTodo(e: React.FormEvent) {
    e.preventDefault()
    if (!newTodo.trim()) return
    const updated = [...todos, { id: Date.now().toString(), text: newTodo.trim(), done: false }]
    setTodos(updated)
    localStorage.setItem('teacher_dashboard_todos', JSON.stringify(updated))
    setNewTodo('')
  }

  function toggleTodo(id: string) {
    const updated = todos.map(t => t.id === id ? { ...t, done: !t.done } : t)
    setTodos(updated)
    localStorage.setItem('teacher_dashboard_todos', JSON.stringify(updated))
  }

  function deleteTodo(id: string) {
    const updated = todos.filter(t => t.id !== id)
    setTodos(updated)
    localStorage.setItem('teacher_dashboard_todos', JSON.stringify(updated))
  }

  const today = new Date()
  const greeting = today.getHours() < 12 ? 'Bom dia' : today.getHours() < 18 ? 'Boa tarde' : 'Boa noite'
  const dateStr = today.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  const stats = [
    { label: 'Alunos ativos',    value: data.studentsCount,  icon: 'ti-users',       color: '#268bd2', bg: '#e8f4fb' },
    { label: 'Materiais (Repo)', value: data.materialsCount, icon: 'ti-file-text',   color: '#859900', bg: '#eef2d5' },
    { label: 'Média geral',      value: data.overallAvg.toFixed(1), icon: 'ti-chart-line',  color: '#2aa198', bg: '#e5f4f3' },
    { label: 'Turmas totais',    value: data.classes,  icon: 'ti-chalkboard',    color: '#b58900', bg: '#f5edcc' },
  ]

  const recentMaterials = [
    { title: 'Present Perfect Worksheet', type: 'Worksheet', level: 'B1', date: 'Hoje' },
    { title: 'Reading Comprehension Quiz', type: 'Quiz',      level: 'B2', date: 'Ontem' },
  ]

  return (
    <ModuleShell 
      title={`${greeting}, Professora 👋`}
      subtitle="Aqui está um resumo dinâmico das suas turmas (baseado nos seus dados locais)."
    >
      <div style={{ fontSize: 13, color: '#93a1a1', marginBottom: -30, position: 'relative', top: -75, textTransform: 'capitalize' }}>{dateStr}</div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 40 }}>
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`animate-fade-up stagger-${i + 1}`}
            style={{
              background: '#fff',
              border: '1px solid rgba(88,110,117,0.1)',
              borderRadius: 20,
              padding: '20px 22px',
              boxShadow: '0 2px 12px rgba(0,43,54,0.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#93a1a1' }}>
                {s.label}
              </div>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={`ti ${s.icon}`} style={{ fontSize: 18, color: s.color }} />
              </div>
            </div>
            <div style={{ fontSize: 34, fontWeight: 700, color: '#073642', lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        {/* Materiais Recentes */}
        <ModuleCard 
          title="Materiais Recentes (Exemplos)" 
          headerAction={<span style={{ fontSize: 12, color: '#b58900', fontWeight: 600, cursor: 'pointer' }}>Ver todos →</span>}
        >
          {recentMaterials.map((m) => (
            <div key={m.title} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid rgba(88,110,117,0.08)' }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: m.type === 'Exam' ? '#fce9e8' : m.type === 'Quiz' ? '#e5f4f3' : '#f5edcc',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <i className={m.type === 'Exam' ? 'ti ti-file-certificate' : m.type === 'Quiz' ? 'ti ti-bolt' : 'ti ti-pencil'}
                  style={{ fontSize: 18, color: m.type === 'Exam' ? '#dc322f' : m.type === 'Quiz' ? '#2aa198' : '#b58900' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: '#073642', marginBottom: 2 }}>{m.title}</div>
                <div style={{ fontSize: 12, color: '#93a1a1' }}>{m.level} · {m.type}</div>
              </div>
              <div style={{ fontSize: 11, color: '#93a1a1', flexShrink: 0 }}>{m.date}</div>
            </div>
          ))}
          <button style={{
            marginTop: 16, width: '100%', padding: '10px', borderRadius: 10, border: '1.5px dashed rgba(88,110,117,0.25)',
            background: 'transparent', color: '#586e75', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
          }}>
            <i className="ti ti-plus" /> Criar novo material
          </button>
        </ModuleCard>

        {/* Top Alunos */}
        <ModuleCard title="Destaques Reais (Gradebook)">
          {data.topStudents.length === 0 ? (
            <div style={{ color: '#93a1a1', fontSize: 13, textAlign: 'center', padding: 20 }}>Sem dados de alunos suficientes. Adicione notas no Gradebook.</div>
          ) : data.topStudents.map((s, i) => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: i === 0 ? '#f5edcc' : i === 1 ? '#e5f4f3' : '#eee8d5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: i === 0 ? '#b58900' : i === 1 ? '#2aa198' : '#586e75', flexShrink: 0 }}>
                {s.initials}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: '#073642' }}>{s.name}</div>
                <div style={{ height: 4, background: '#eee8d5', borderRadius: 99, marginTop: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(s.avg / 10) * 100}%`, background: s.avg >= 9 ? '#859900' : '#b58900', borderRadius: 99 }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#073642' }}>{s.avg.toFixed(1)}</div>
              </div>
            </div>
          ))}

          {/* Mini calendar hint */}
          {nextTask ? (
            <div style={{ marginTop: 20, padding: '14px 16px', background: '#fdf6e3', borderRadius: 12, border: '1px solid rgba(181,137,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="ti ti-pin" style={{ color: '#cb4b16', fontSize: 16 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#073642' }}>Próximo Prazo / Atividade</div>
                  <div style={{ fontSize: 11, color: '#586e75', fontWeight: 500 }}>
                    {nextTask.title} {nextTask.classRef ? `(${nextTask.classRef})` : ''}
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#cb4b16', background: 'rgba(203,75,22,0.1)', padding: '3px 8px', borderRadius: 6 }}>
                {nextTask.date.split('-').reverse().slice(0, 2).join('/')}
              </span>
            </div>
          ) : (
            <div style={{ marginTop: 20, padding: '14px 16px', background: '#fdf6e3', borderRadius: 12, border: '1px solid rgba(133,153,0,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="ti ti-circle-check" style={{ color: '#859900', fontSize: 16 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#073642' }}>Sem prazos urgentes</div>
                  <div style={{ fontSize: 11, color: '#93a1a1' }}>Tudo em dia! Agende no calendário.</div>
                </div>
              </div>
            </div>
          )}
        </ModuleCard>
      </div>

      <div style={{ marginTop: 20 }}>
        {/* Checklist */}
        <ModuleCard title="Checklist de Atividades">
          <form onSubmit={addTodo} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input 
              value={newTodo} onChange={e => setNewTodo(e.target.value)} 
              placeholder="Adicionar nova tarefa..." 
              style={{ flex: 1, padding: '10px 14px', background: '#f5f0e8', border: '1px solid #e8e0d0', borderRadius: 10, outline: 'none', color: '#073642', fontSize: 13, fontFamily: 'inherit' }}
            />
            <button type="submit" style={{ padding: '0 16px', background: '#073642', color: '#fff', border: 'none', borderRadius: 10, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-plus" />
            </button>
          </form>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {todos.map(todo => (
              <div key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: todo.done ? '#f5f0e8' : '#fff', border: '1px solid #e8e0d0', borderRadius: 10, transition: 'all 0.2s' }}>
                <div 
                  onClick={() => toggleTodo(todo.id)}
                  style={{ width: 20, height: 20, borderRadius: 6, border: todo.done ? 'none' : '2px solid #93a1a1', background: todo.done ? '#859900' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                  {todo.done && <i className="ti ti-check" style={{ color: '#fff', fontSize: 14 }} />}
                </div>
                <div style={{ flex: 1, fontSize: 13, color: todo.done ? '#93a1a1' : '#073642', textDecoration: todo.done ? 'line-through' : 'none', cursor: 'pointer' }} onClick={() => toggleTodo(todo.id)}>
                  {todo.text}
                </div>
                <button onClick={() => deleteTodo(todo.id)} style={{ background: 'transparent', border: 'none', color: '#dc322f', fontSize: 16, cursor: 'pointer', opacity: 0.6, display: 'flex', alignItems: 'center', padding: 4 }}>
                  <i className="ti ti-trash" />
                </button>
              </div>
            ))}
            {todos.length === 0 && <div style={{ textAlign: 'center', fontSize: 12, color: '#93a1a1', padding: '20px 0' }}>Tudo pronto por aqui! 🎉</div>}
          </div>
        </ModuleCard>
      </div>
    </ModuleShell>
  )
}
