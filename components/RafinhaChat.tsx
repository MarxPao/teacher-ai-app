'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useVoiceCommand } from '@/hooks/useVoiceCommand'
import { useWhisperFlow } from '@/hooks/useWhisperFlow'
import { useGlobalWakeWord } from '@/hooks/useGlobalWakeWord'
import { fillPortal, openPortal, logPortalFill } from '@/lib/portalBridge'
import { addObservation, buildMemoryContext, diagnoseClassPerformance } from '@/lib/studentMemory'
import type { CanonicalMessage } from '@/lib/agentTools'
import type { ModuleKey } from '@/app/page'

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface LogEntry {
  id: string
  name: string
  input: Record<string, unknown>
  status: 'running' | 'done' | 'error'
  startedAt: number
  result?: string
  elapsed?: number
}

interface RafinhaChatProps {
  onNavigate?: (module: ModuleKey) => void
  onCommandReady?: (fn: (text: string) => void) => void
}

// ─── Tool display names ─────────────────────────────────────────────────────────
const TOOL_LABELS: Record<string, string> = {
  navigate_to_module:         '🧭 Navegando',
  add_todo:                   '✅ Adicionando tarefa',
  create_calendar_task:       '📅 Criando evento',
  create_lesson_plan:         '📖 Criando plano de aula',
  create_communication:       '📣 Criando comunicado',
  add_student_grade:          '📊 Lançando nota',
  fill_school_portal:         '🏫 Preenchendo portal',
  open_school_portal:         '🔗 Abrindo portal',
  generate_exam_content:      '📝 Preparando prova',
  speak_response:             '🔊 Falando',
  update_student_metric:      '📈 Métrica de aluno',
  record_student_observation: '📝 Registrando memória',
  create_class:               '🏫 Criando turma',
  create_student:             '👨‍🎓 Cadastrando aluno',
  add_qbank_question:         '📚 Salvando no QBank',
  create_mindmap:             '🧠 Gerando Mapa Mental',
  create_document:            '📄 Abrindo no Editor',
  apply_school_header:        '🏫 Aplicando cabeçalho',
  create_rubric:              '📋 Criando rubrica',
  add_portfolio_item:         '📁 Adicionando ao Portfólio',
  save_repo_material:         '💾 Salvando no Repositório',
  generate_quick_questions:   '⚡ Questões Rápidas',
}

const TOOL_EST_SECONDS: Record<string, number> = {
  navigate_to_module:         1,
  add_todo:                   1,
  create_calendar_task:       2,
  create_lesson_plan:         3,
  create_communication:       2,
  add_student_grade:          2,
  fill_school_portal:         5,
  open_school_portal:         2,
  generate_exam_content:      4,
  speak_response:             2,
  update_student_metric:      2,
  record_student_observation: 1,
  create_class:               1,
  create_student:             1,
  add_qbank_question:         2,
  create_mindmap:             3,
  create_document:            2,
  apply_school_header:        1,
  create_rubric:              2,
  add_portfolio_item:         2,
  save_repo_material:         2,
  generate_quick_questions:   3,
}

// ─── Avatar SVG ────────────────────────────────────────────────────────────────
const AvatarSVG = () => (
  <svg viewBox="0 0 100 100" width="100%" height="100%">
    <circle cx="50" cy="50" r="50" fill="#fdf6e3" />
    <path d="M 25 40 Q 20 60 25 85 Q 50 95 75 85 Q 80 60 75 40 Z" fill="#1a1a1a" />
    <path d="M 35 45 Q 50 80 65 45 Z" fill="#f4d2b3" />
    <path d="M 43 65 L 57 65 L 65 95 L 35 95 Z" fill="#073642" />
    <path d="M 25 45 Q 50 15 75 45 Q 65 25 50 30 Q 35 25 25 45 Z" fill="#1a1a1a" />
    <circle cx="43" cy="48" r="3" fill="#2d2d2d" />
    <circle cx="57" cy="48" r="3" fill="#2d2d2d" />
    <rect x="37" y="44" width="12" height="8" rx="2" fill="none" stroke="#dc322f" strokeWidth="1.5" />
    <rect x="51" y="44" width="12" height="8" rx="2" fill="none" stroke="#dc322f" strokeWidth="1.5" />
    <path d="M 49 48 L 51 48" stroke="#dc322f" strokeWidth="1.5" />
    <path d="M 45 56 Q 50 61 55 56" fill="none" stroke="#2d2d2d" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

// ─── Portal names ───────────────────────────────────────────────────────────────
const PORTAL_NAMES: Record<string, string> = {
  machado: 'Machado Sobrinho', santacatarina: 'Rede Santa Catarina',
  plural: 'Plural', cambridge: 'Cambridge One', teams: 'Microsoft Teams',
}

// ─── Snapshot / Undo ────────────────────────────────────────────────────────────
const SNAPSHOT_KEYS = [
  'teacher_students', 'teacher_calendar_tasks', 'teacher_dashboard_todos',
  'teacher_lessonplanner_boards', 'teacher_communications',
  'teacher_gbConfig', 'teacher_classes',
]
function takeSnapshot() {
  const snapshot: Record<string, string | null> = {}
  SNAPSHOT_KEYS.forEach(k => { snapshot[k] = localStorage.getItem(k) })
  const stack = JSON.parse(sessionStorage.getItem('teacher_undo_stack') || '[]')
  stack.push({ ts: Date.now(), snapshot })
  sessionStorage.setItem('teacher_undo_stack', JSON.stringify(stack.slice(-5)))
}
function undoLastAction(): boolean {
  const stack = JSON.parse(sessionStorage.getItem('teacher_undo_stack') || '[]')
  if (!stack.length) return false
  const last = stack.pop()
  Object.entries(last.snapshot).forEach(([key, value]) => {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value as string)
  })
  sessionStorage.setItem('teacher_undo_stack', JSON.stringify(stack))
  window.dispatchEvent(new Event('storage'))
  return true
}

// ─── App context (enriquecido com memória de alunos) ─────────────────────────────────
function getAppContext(): string {
  try {
    const students = JSON.parse(localStorage.getItem('teacher_students') || '[]')
    const classes  = JSON.parse(localStorage.getItem('teacher_classes')  || '[]')
    const tasks    = JSON.parse(localStorage.getItem('teacher_calendar_tasks') || '[]')
    const boards   = JSON.parse(localStorage.getItem('teacher_lessonplanner_boards') || '[]')
    const todos    = JSON.parse(localStorage.getItem('teacher_dashboard_todos') || '[]')
    const comms    = JSON.parse(localStorage.getItem('teacher_communications') || '[]')
    const pending  = tasks.filter((t: { done: boolean }) => !t.done)
    const upcoming = pending.slice(0, 5).map((t: { title: string; date: string; type: string }) => `${t.title} (${t.date})`).join(', ')
    const cardCount = boards.reduce((a: number, b: { cards: unknown[] }) => a + b.cards.length, 0)
    const base = [
      `Alunos (${students.length}): ${students.slice(0, 15).map((s: { name: string }) => s.name).join(', ') || 'nenhum'}`,
      `Turmas: ${classes.map((c: { name: string }) => c.name).join(', ') || 'nenhuma'}`,
      `Eventos pendentes (${pending.length}): ${upcoming || 'nenhum'}`,
      `Planos: ${cardCount} | Checklist: ${todos.filter((t: { done: boolean }) => !t.done).length} | Comunicados: ${comms.length}`,
    ].join(' | ')
    return base + buildMemoryContext()
  } catch { return 'Dados indisponíveis' }
}

// ─── Tool executor ──────────────────────────────────────────────────────────────
async function executeTool(
  name: string,
  input: Record<string, unknown>,
  onNavigate?: (m: ModuleKey) => void,
  speakFn?: (text: string) => void,
): Promise<string> {
  switch (name) {
    case 'navigate_to_module': {
      if (onNavigate) onNavigate(input.module as ModuleKey)
      return `Naveguei para ${input.module}`
    }
    case 'add_todo': {
      takeSnapshot()
      const todos = JSON.parse(localStorage.getItem('teacher_dashboard_todos') || '[]')
      todos.push({ id: Date.now().toString(), text: input.text, done: false })
      localStorage.setItem('teacher_dashboard_todos', JSON.stringify(todos))
      window.dispatchEvent(new Event('storage'))
      return `Tarefa "${input.text}" adicionada`
    }
    case 'create_calendar_task': {
      takeSnapshot()
      const tasks = JSON.parse(localStorage.getItem('teacher_calendar_tasks') || '[]')
      tasks.push({
        id: Date.now().toString(), title: input.title,
        date: input.date || new Date().toISOString().split('T')[0],
        description: input.description || '', classRef: input.classRef || '',
        type: input.type || 'tarefa', priority: input.priority || 'medium', done: false,
      })
      localStorage.setItem('teacher_calendar_tasks', JSON.stringify(tasks))
      window.dispatchEvent(new Event('storage'))
      return `"${input.title}" criado para ${input.date}`
    }
    case 'create_lesson_plan': {
      takeSnapshot()
      const boards = JSON.parse(localStorage.getItem('teacher_lessonplanner_boards') || '[]')
      if (!boards.length) boards.push({ id: 'default', title: 'Meu Workspace', cards: [] })
      boards[0].cards.push({
        id: Date.now().toString(), school: input.school || 'Escola',
        className: input.classRef || input.className || '',
        date: new Date().toISOString().slice(0, 10), title: input.title,
        subject: input.subject || '', objectives: input.objectives || '',
        duration: input.duration || '50', x: 80 + Math.random() * 200,
        y: 80 + Math.random() * 100, color: '#268bd2', period: 'Dia',
      })
      localStorage.setItem('teacher_lessonplanner_boards', JSON.stringify(boards))
      window.dispatchEvent(new Event('storage'))
      if (onNavigate) onNavigate('plan')
      return `Plano "${input.title}" criado`
    }
    case 'create_full_lesson': {
      takeSnapshot()
      if (onNavigate) onNavigate('lessonstudio')
      return `Abrindo módulo Criar Aula... gerando plano completo e roteiro timed sobre "${input.topic}" no padrão Cambridge TKT!`
    }
    case 'create_communication': {
      takeSnapshot()
      const comms = JSON.parse(localStorage.getItem('teacher_communications') || '[]')
      comms.push({
        id: Date.now().toString(), title: input.title, content: input.content || '',
        date: new Date().toISOString().slice(0, 10), type: input.type || 'Aviso', tone: 'Profissional',
      })
      localStorage.setItem('teacher_communications', JSON.stringify(comms))
      window.dispatchEvent(new Event('storage'))
      if (onNavigate) onNavigate('communications')
      return `Comunicado "${input.title}" criado`
    }
    case 'record_student_observation': {
      // Encontra o studentId real
      const students = JSON.parse(localStorage.getItem('teacher_students') || '[]')
      const found = students.find((s: { name: string; id: string }) =>
        s.name.toLowerCase().includes((input.studentName as string).toLowerCase()))
      if (!found) return `Aluno "${input.studentName}" não encontrado`
      addObservation(
        found.id,
        found.name,
        input.note as string,
        input.category as string | undefined,
        input.subcategory as string | undefined,
        'rafinha'
      )
      return `Observação registrada para ${found.name}: "${input.note}"`
    }
    case 'create_class': {
      takeSnapshot()
      const classes = JSON.parse(localStorage.getItem('teacher_classes') || '[]')
      const name = input.name as string
      if (!classes.some((c: { name: string }) => c.name.toLowerCase() === name.toLowerCase())) {
        classes.push({
          id: Date.now().toString(),
          name,
          school: input.school || 'Escola Principal',
          year: input.year || '2026',
          shift: input.shift || 'Manhã',
          studentIds: [],
        })
        localStorage.setItem('teacher_classes', JSON.stringify(classes))
        window.dispatchEvent(new Event('storage'))
      }
      if (onNavigate) onNavigate('classes')
      return `Turma "${name}" criada com sucesso!`
    }
    case 'create_student': {
      takeSnapshot()
      const students = JSON.parse(localStorage.getItem('teacher_students') || '[]')
      const name = input.name as string
      if (!students.some((s: { name: string }) => s.name.toLowerCase() === name.toLowerCase())) {
        students.push({
          id: Date.now().toString(),
          name,
          class: input.classRef || 'Sem Turma',
          email: input.email || '',
          grades: {},
        })
        localStorage.setItem('teacher_students', JSON.stringify(students))
        window.dispatchEvent(new Event('storage'))
      }
      if (onNavigate) onNavigate('students')
      return `Aluno "${name}" cadastrado com sucesso!`
    }
    case 'add_qbank_question': {
      const qbank = JSON.parse(localStorage.getItem('teacher_qbank_questions') || '[]')
      qbank.push({
        id: Date.now().toString(),
        text: input.questionText,
        eltCategory: input.eltCategory,
        eltSubcategory: input.eltSubcategory || '',
        level: input.level || 'B1',
        options: input.options || [],
        answer: input.answer || '',
        createdAt: new Date().toISOString(),
      })
      localStorage.setItem('teacher_qbank_questions', JSON.stringify(qbank))
      window.dispatchEvent(new Event('storage'))
      if (onNavigate) onNavigate('qbank')
      return `Questão sobre "${input.eltCategory}" adicionada ao Banco de Questões!`
    }
    case 'create_mindmap': {
      localStorage.setItem('teacher_mindmap_prefill', JSON.stringify({
        topic: input.topic,
        branches: input.branches || [],
        generatedAt: Date.now()
      }))
      window.dispatchEvent(new CustomEvent('teacher:mindmap_prefill'))
      if (onNavigate) onNavigate('mindmap')
      return `Mapa Mental sobre "${input.topic}" gerado!`
    }
    case 'create_document': {
      localStorage.setItem('teacher_editor_prefill', JSON.stringify({
        title: input.title,
        content: input.content || '',
        school: input.school || '',
        generatedAt: Date.now()
      }))
      window.dispatchEvent(new CustomEvent('teacher:editor_prefill'))
      if (onNavigate) onNavigate('editor')
      return `Documento "${input.title}" aberto no Editor!`
    }
    case 'apply_school_header': {
      window.dispatchEvent(new CustomEvent('teacher:editor_apply_header', { detail: input.schoolName }))
      if (onNavigate) onNavigate('editor')
      return `Cabeçalho da escola "${input.schoolName}" aplicado!`
    }
    case 'create_rubric': {
      takeSnapshot()
      const rubrics = JSON.parse(localStorage.getItem('teacher_rubrics') || '[]')
      rubrics.push({
        id: Date.now().toString(),
        title: input.title,
        skill: input.skill || 'General',
        criteria: input.criteria || ['Fluency', 'Accuracy', 'Vocabulary'],
        createdAt: new Date().toISOString()
      })
      localStorage.setItem('teacher_rubrics', JSON.stringify(rubrics))
      window.dispatchEvent(new Event('storage'))
      if (onNavigate) onNavigate('rubric')
      return `Rubrica "${input.title}" criada!`
    }
    case 'add_portfolio_item': {
      takeSnapshot()
      const portfolio = JSON.parse(localStorage.getItem('teacher_portfolio') || '[]')
      portfolio.push({
        id: Date.now().toString(),
        studentName: input.studentName,
        title: input.title,
        description: input.description || '',
        category: input.category || 'Projeto',
        date: new Date().toISOString().slice(0, 10)
      })
      localStorage.setItem('teacher_portfolio', JSON.stringify(portfolio))
      window.dispatchEvent(new Event('storage'))
      if (onNavigate) onNavigate('portfolio')
      return `Projeto "${input.title}" adicionado ao Portfólio de ${input.studentName}!`
    }
    case 'save_repo_material': {
      const repo = JSON.parse(localStorage.getItem('teacher_repo_materials') || '[]')
      repo.push({
        id: Date.now().toString(),
        title: input.title,
        type: input.type,
        category: input.category || 'Geral',
        url: input.url || '',
        createdAt: new Date().toISOString()
      })
      localStorage.setItem('teacher_repo_materials', JSON.stringify(repo))
      window.dispatchEvent(new Event('storage'))
      if (onNavigate) onNavigate('repo')
      return `Material "${input.title}" salvo no Repositório!`
    }
    case 'generate_quick_questions': {
      localStorage.setItem('teacher_quick_prefill', JSON.stringify({
        topic: input.topic,
        level: input.level || 'B1',
        generatedAt: Date.now()
      }))
      window.dispatchEvent(new CustomEvent('teacher:quick_prefill'))
      if (onNavigate) onNavigate('quick')
      return `5 Questões Rápidas de Warm-up geradas sobre "${input.topic}"!`
    }
    case 'add_student_grade': {
      takeSnapshot()
      const students = JSON.parse(localStorage.getItem('teacher_students') || '[]')
      const gbConfig = JSON.parse(localStorage.getItem('teacher_gbConfig') || '{"cols":[]}')
      const idx = students.findIndex((s: { name: string }) =>
        s.name.toLowerCase().includes((input.studentName as string).toLowerCase()))
      if (idx === -1) return `Aluno "${input.studentName}" não encontrado`
      students[idx].grades = { ...(students[idx].grades || {}), [input.column as string]: String(input.grade) }
      localStorage.setItem('teacher_students', JSON.stringify(students))
      if (!gbConfig.cols.includes(input.column)) {
        gbConfig.cols.push(input.column)
        localStorage.setItem('teacher_gbConfig', JSON.stringify(gbConfig))
      }
      window.dispatchEvent(new Event('storage'))

      // ── Diagnóstico proativo de turma após lançar nota ──────────────────
      const classRef = (students[idx] as { class?: string; classRef?: string }).class
        || (students[idx] as { class?: string; classRef?: string }).classRef || ''
      if (classRef) {
        setTimeout(() => {
          const diagnosis = diagnoseClassPerformance(classRef)
          if (diagnosis && speakFn) speakFn(diagnosis)
        }, 1500)
      }

      return `Nota ${input.grade} lançada para ${students[idx].name}`
    }
    case 'fill_school_portal': {
      takeSnapshot()
      await fillPortal({ platform: input.platform as never, title: input.title as string, date: input.date as string || '', classRef: input.classRef as string || '', description: input.description as string || '' })
      logPortalFill({ platform: input.platform as never, title: input.title as string, date: input.date as string || '', classRef: input.classRef as string || '' })
      window.dispatchEvent(new Event('storage'))
      return `Preenchido no ${PORTAL_NAMES[input.platform as string] || input.platform}`
    }
    case 'open_school_portal': {
      openPortal(input.platform as string)
      return `Abrindo ${PORTAL_NAMES[input.platform as string] || input.platform}...`
    }
    case 'generate_exam_content': {
      const topic    = input.topic as string
      const count    = (input.questionCount as number) || 10
      const level    = (input.level as string) || 'Intermediário'
      const qType    = (input.type as string) || 'múltipla escolha'
      const classRef = (input.classRef as string) || ''
      localStorage.setItem('teacher_exam_prefill', JSON.stringify({
        topic, classRef, questionCount: count, level, type: qType, generatedAt: Date.now(),
      }))
      window.dispatchEvent(new CustomEvent('teacher:exam_prefill'))
      if (onNavigate) onNavigate('exam')
      return `Prova com ${count} questões sobre "${topic}" (${level})`
    }
    case 'speak_response': {
      const text = input.text as string
      if (speakFn && text) speakFn(text)
      return `Falando: "${text?.slice(0, 50)}"`
    }
    case 'update_student_metric': {
      takeSnapshot()
      const studentName = input.studentName as string
      const metricKey   = input.metricKey as string
      const score       = Number(input.score)
      const students    = JSON.parse(localStorage.getItem('teacher_students') || '[]')
      const idx         = students.findIndex((s: { name: string }) =>
        s.name.toLowerCase().includes(studentName.toLowerCase()))
      if (idx === -1) return `Aluno "${studentName}" não encontrado`
      const studentId  = students[idx].id
      const allMetrics = JSON.parse(localStorage.getItem('teacher_student_metrics') || '[]')
      const upd        = allMetrics.filter((m: { studentId: string }) => m.studentId !== studentId)
      const old        = allMetrics.find((m: { studentId: string }) => m.studentId === studentId)?.scores || {}
      localStorage.setItem('teacher_student_metrics', JSON.stringify([...upd, { studentId, scores: { ...old, [metricKey]: score } }]))
      window.dispatchEvent(new Event('storage'))
      return `Métrica "${metricKey}" de ${students[idx].name} → ${score}/10`
    }
    default:
      return `${name} executado`
  }
}

// ─── Execution Timer Component ──────────────────────────────────────────────────
function ExecutionTimer({
  entry,
  onSkip,
}: {
  entry: LogEntry
  onSkip: () => void
}) {
  const [elapsed, setElapsed] = useState(0)
  const est = TOOL_EST_SECONDS[entry.name] || 3
  const pct = Math.min((elapsed / est) * 100, 95)

  useEffect(() => {
    if (entry.status !== 'running') return
    const t = setInterval(() => setElapsed(s => s + 0.1), 100)
    return () => clearInterval(t)
  }, [entry.status])

  const isDone = entry.status === 'done'
  const isErr  = entry.status === 'error'
  const label  = TOOL_LABELS[entry.name] || `⚙️ ${entry.name}`

  return (
    <div
      onClick={isDone || isErr ? undefined : onSkip}
      style={{
        margin: '4px 0',
        padding: '10px 14px',
        borderRadius: 14,
        background: isDone ? 'rgba(133,153,0,0.12)' : isErr ? 'rgba(220,50,47,0.1)' : 'rgba(42,161,152,0.1)',
        border: `1px solid ${isDone ? 'rgba(133,153,0,0.3)' : isErr ? 'rgba(220,50,47,0.3)' : 'rgba(42,161,152,0.25)'}`,
        cursor: isDone || isErr ? 'default' : 'pointer',
        transition: 'all 0.3s',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: entry.status === 'running' ? 6 : 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: isDone ? '#859900' : isErr ? '#dc322f' : '#2aa198' }}>
          {label}
          {entry.status === 'running' && (
            <span style={{ color: '#93a1a1', fontWeight: 400, marginLeft: 6 }}>
              {elapsed.toFixed(1)}s {!isDone && <span style={{ fontSize: 10 }}>· toque p/ pular</span>}
            </span>
          )}
        </span>
        <span style={{ fontSize: 11, color: isDone ? '#859900' : isErr ? '#dc322f' : '#93a1a1' }}>
          {isDone ? `✓ ${(entry.elapsed || 0).toFixed(1)}s` : isErr ? '✗ erro' : ''}
        </span>
      </div>

      {entry.status === 'running' && (
        <div style={{ height: 3, borderRadius: 2, background: 'rgba(42,161,152,0.15)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: 'linear-gradient(90deg, #2aa198, #268bd2)',
            borderRadius: 2,
            transition: 'width 0.1s linear',
            boxShadow: '0 0 6px rgba(42,161,152,0.5)',
          }} />
        </div>
      )}

      {entry.result && entry.status !== 'running' && (
        <div style={{ fontSize: 11.5, color: '#657b83', marginTop: 4 }}>
          {entry.result}
        </div>
      )}
    </div>
  )
}

// ─── Log Drawer ─────────────────────────────────────────────────────────────────
function LogDrawer({ logs, onClose }: { logs: LogEntry[]; onClose: () => void }) {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      background: '#002b36',
      borderTop: '1px solid rgba(42,161,152,0.3)',
      borderRadius: '0 0 20px 20px',
      maxHeight: '60%',
      overflowY: 'auto',
      zIndex: 10,
      animation: 'logSlideUp 0.25s cubic-bezier(0.16,1,0.3,1)',
      padding: '10px 12px 12px',
    }}>
      <style>{`@keyframes logSlideUp { from { transform:translateY(100%) } to { transform:none } }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#2aa198', letterSpacing: 1, textTransform: 'uppercase' }}>
          📋 Log de Ações ({logs.length})
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#657b83', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
      </div>
      {logs.length === 0 && (
        <div style={{ fontSize: 12, color: '#586e75', textAlign: 'center', padding: '16px 0' }}>
          Nenhuma ação executada ainda.
        </div>
      )}
      {[...logs].reverse().map(entry => (
        <div key={entry.id} style={{ marginBottom: 6, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: entry.status === 'done' ? '#859900' : entry.status === 'error' ? '#dc322f' : '#2aa198' }}>
              {TOOL_LABELS[entry.name] || entry.name}
            </span>
            <span style={{ fontSize: 10, color: '#586e75' }}>
              {entry.status === 'done' ? `✓ ${(entry.elapsed || 0).toFixed(1)}s` : entry.status === 'error' ? '✗' : '⏳'}
            </span>
          </div>
          {entry.result && (
            <div style={{ fontSize: 11, color: '#93a1a1', marginTop: 3 }}>{entry.result}</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────────
export default function RafinhaChat({ onNavigate, onCommandReady }: RafinhaChatProps) {
  const [isOpen, setIsOpen]           = useState(false)
  const [messages, setMessages]       = useState<Message[]>([{
    role: 'assistant',
    content: 'Oi! Sou a Rafinha 👋 Pode falar: "vá para alunos", "crie uma prova de Present Perfect", "lance nota 9 para o Pedro" — eu executo na hora!'
  }])
  const [interimText, setInterimText] = useState('')
  const [isLoading, setIsLoading]     = useState(false)
  const [voiceOut, setVoiceOut]       = useState(true)
  const [isLiveMode, setIsLiveMode]   = useState(false)
  const [isHDVoice, setIsHDVoice]     = useState(false)
  const [isSpeaking, setIsSpeaking]   = useState(false)
  const [inputText, setInputText]     = useState('')
  const [canUndo, setCanUndo]         = useState(false)
  const [showLog, setShowLog]         = useState(false)

  // Execution state
  const [runningTools, setRunningTools]   = useState<LogEntry[]>([])
  const [allLogs, setAllLogs]             = useState<LogEntry[]>([])
  const skipSignalRef                     = useRef(false) // flag to skip timer animation

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const audioRef       = useRef<HTMLAudioElement | null>(null)
  const isSpeakingRef  = useRef(false)
  const isLoadingRef   = useRef(false)
  const isLiveModeRef  = useRef(false)
  const isListeningRef = useRef(false)

  useEffect(() => {
    isLoadingRef.current  = isLoading
    isSpeakingRef.current = isSpeaking
    ;(window as any).rafinhaIsBusy = isLoading || isSpeaking
  }, [isLoading, isSpeaking])

  useEffect(() => { isLiveModeRef.current = isLiveMode }, [isLiveMode])

  // Wake word global — sempre escuta "Rafinha" em qualquer tela
  useGlobalWakeWord(true)

  // Expõe sendMessage para componentes externos
  useEffect(() => {
    if (onCommandReady) {
      onCommandReady((text: string) => {
        setIsOpen(true)
        setTimeout(() => dispatchSend(text), 200)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCommandReady])

  // Wake word
  useEffect(() => {
    const handleWake = () => setIsOpen(true)
    const handleSendText = (e: Event) => {
      const text = (e as CustomEvent<string>).detail
      if (text) { setIsOpen(true); setTimeout(() => dispatchSend(text), 200) }
    }
    window.addEventListener('rafinha:wake', handleWake)
    window.addEventListener('rafinha:send_text', handleSendText)
    return () => {
      window.removeEventListener('rafinha:wake', handleWake)
      window.removeEventListener('rafinha:send_text', handleSendText)
    }
  }, []) // eslint-disable-line

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading, interimText])

  useEffect(() => {
    const check = () => {
      const stack = JSON.parse(sessionStorage.getItem('teacher_undo_stack') || '[]')
      setCanUndo(stack.length > 0)
    }
    check()
    window.addEventListener('storage', check)
    return () => window.removeEventListener('storage', check)
  }, [])

  // ─── TTS ──────────────────────────────────────────────────────────────────────
  const speak = useCallback(async (text: string) => {
    if (!voiceOut || !text.trim()) return
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }

    const cleanText = text.replace(/[*_#`\[\]]/g, '').replace(/\n/g, ' ').slice(0, 400)
    setIsSpeaking(true)
    isSpeakingRef.current = true
    ;(window as any).rafinhaIsBusy = true
    voiceStop() // Para a escuta do microfone enquanto a Rafinha fala

    const onDone = () => {
      setIsSpeaking(false)
      isSpeakingRef.current = false
      ;(window as any).rafinhaIsBusy = false
      // Re-abre o microfone automaticamente após a resposta da Rafinha para conversa fluida mãos-livres!
      setTimeout(() => {
        if (!isSpeakingRef.current && !isLoadingRef.current) {
          voiceStart()
        }
      }, 400)
    }

    try {
      const apis = JSON.parse(localStorage.getItem('teacher_apis') || '[]')
      const elevenApi = apis.find((a: { provider: string; active: boolean; key: string }) =>
        a.provider === 'elevenlabs' && a.active && a.key)

      if (elevenApi) {
        const voiceId = elevenApi.voiceId || 'MF3mGyEYCl7XYWbV9V6O'
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: { 'xi-api-key': elevenApi.key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
          body: JSON.stringify({
            text: cleanText, model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.55, similarity_boost: 0.8 }
          })
        })
        if (res.ok) {
          setIsHDVoice(true)
          const blob = await res.blob()
          const audio = new Audio(URL.createObjectURL(blob))
          audioRef.current = audio
          audio.onended = onDone; audio.onerror = onDone; audio.play()
          return
        }
      }

      const oaiKey = apis.find((a: { provider: string; key: string }) => a.provider === 'openai')?.key
      const res = await fetch('/api/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, voice: 'nova', model: 'tts-1-hd', userKey: oaiKey }),
      })
      if (res.ok) {
        setIsHDVoice(true)
        const blob = await res.blob()
        const audio = new Audio(URL.createObjectURL(blob))
        audioRef.current = audio
        audio.onended = onDone; audio.onerror = onDone; audio.play()
        return
      }
    } catch { /* fallback */ }

    setIsHDVoice(false)
    if (!window.speechSynthesis) { onDone(); return }
    const u = new SpeechSynthesisUtterance(cleanText)
    u.lang = 'pt-BR'; u.rate = 0.98; u.pitch = 1.0
    const voices = window.speechSynthesis.getVoices()
    const bestVoice = voices.find(v => v.lang.startsWith('pt') && (v.name.includes('natural') || v.name.includes('neural') || v.name.includes('Google')))
      || voices.find(v => v.lang.startsWith('pt'))
    if (bestVoice) u.voice = bestVoice
    u.onend = onDone; u.onerror = onDone
    window.speechSynthesis.speak(u)
  }, [voiceOut]) // eslint-disable-line

  // ─── Voice dedup guard ────────────────────────────────────────────────────────
  const lastSentTextRef = useRef<string>('')
  const lastSentTimeRef = useRef<number>(0)

  const handleFinalVoice = useCallback((text: string) => {
    if (isSpeakingRef.current || isLoadingRef.current) return
    const now = Date.now()
    const trimmed = text.trim()
    if (!trimmed) return
    if (trimmed.toLowerCase() === lastSentTextRef.current.toLowerCase() && (now - lastSentTimeRef.current) < 3000) return
    lastSentTextRef.current = trimmed
    lastSentTimeRef.current = now
    setInterimText('')
    dispatchSend(trimmed)
  }, []) // eslint-disable-line

  const handleInterimVoice = useCallback((text: string) => {
    if (isSpeakingRef.current || isLoadingRef.current) return
    setInterimText(text)
  }, [])

  // ─── Voice engines ────────────────────────────────────────────────────────────
  const handleWhisperResult = useCallback((text: string) => {
    if (isSpeakingRef.current || isLoadingRef.current) return
    const now = Date.now()
    const trimmed = text.trim()
    if (!trimmed) return
    lastSentTextRef.current = trimmed
    lastSentTimeRef.current = now
    setInterimText('')
    dispatchSend(trimmed)
  }, []) // eslint-disable-line

  const whisper = useWhisperFlow({
    onFinalResult: handleWhisperResult,
    onVolumeUpdate: (vol: number) => {
      window.dispatchEvent(new CustomEvent('rafinha:orb_volume', { detail: vol }))
    },
  })

  const { isListening: isWebListening, start: webVoiceStart, stop: webVoiceStop } = useVoiceCommand({
    onFinalResult:   handleFinalVoice,
    onInterimResult: handleInterimVoice,
    silenceDebounceMs:  1200,  // Espera 1.2s de silêncio — ela não vai cortar você no meio da fala
    noiseGateThreshold: 2,
    minConfidence: 0.1,
    onWakePhrase: () => { setIsOpen(true) },
    onVolumeUpdate: (vol: number) => {
      window.dispatchEvent(new CustomEvent('rafinha:orb_volume', { detail: vol }))
    },
  })

  const isListening = isWebListening || whisper.isRecording || whisper.isTranscribing

  const voiceStart = useCallback(() => {
    if ((window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition
      || (window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition) {
      webVoiceStart()
    } else {
      whisper.startRecording().catch(() => {})
    }
  }, [webVoiceStart, whisper])

  const voiceStop = useCallback(() => {
    if (isWebListening) webVoiceStop()
    if (whisper.isRecording) whisper.stopAndTranscribe()
  }, [isWebListening, webVoiceStop, whisper])

  useEffect(() => { isListeningRef.current = isListening }, [isListening])

  useEffect(() => {
    const s = isLoading || whisper.isTranscribing ? 'processing' : isSpeaking ? 'speaking' : isListening ? 'listening' : 'idle'
    window.dispatchEvent(new CustomEvent('rafinha:orb_status', { detail: s }))
  }, [isListening, isLoading, isSpeaking, whisper.isTranscribing])

  useEffect(() => {
    const handler = () => {
      setIsOpen(true)
      setTimeout(() => {
        if (isListeningRef.current) voiceStop()
        else voiceStart()
      }, 150)
    }
    window.addEventListener('rafinha:orb_mic_toggle', handler)
    return () => window.removeEventListener('rafinha:orb_mic_toggle', handler)
  }, [voiceStart, voiceStop])

  useEffect(() => {
    if (!isOpen) { voiceStop(); setIsLiveMode(false); return }
    if (isLiveMode && !isListening && !isLoading && !isSpeaking) {
      voiceStart()
    }
  }, [isLiveMode, isOpen]) // eslint-disable-line

  useEffect(() => {
    if (!isOpen) {
      voiceStop()
      if (window.speechSynthesis) window.speechSynthesis.cancel()
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    }
  }, [isOpen]) // eslint-disable-line

  // ─── Agentic loop ─────────────────────────────────────────────────────────────
  const dispatchSendRef = useRef<(text: string) => void>(() => {})
  const dispatchSend = useCallback((text: string) => { dispatchSendRef.current(text) }, [])

  useEffect(() => {
    dispatchSendRef.current = async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isLoadingRef.current) return

      voiceStop()
      setInterimText('')
      setInputText('')

      const userMsg: Message = { role: 'user', content: trimmed }
      setMessages(prev => [...prev, userMsg])
      setIsLoading(true)
      isLoadingRef.current = true
      setRunningTools([])
      skipSignalRef.current = false

      const autoMode = localStorage.getItem('teacher_auto_mode') === 'true'
      let provider = 'gemini', userKey = ''
      const userKeys: Record<string, string> = {}
      try {
        const apis = JSON.parse(localStorage.getItem('teacher_apis') || '[]')
        for (const api of apis) {
          if (api.key && api.provider !== 'manual') userKeys[`${api.provider}_key`] = api.key
        }
        if (!autoMode) {
          const activeApi = apis.find((a: { active: boolean; provider: string; key: string }) =>
            a.active && a.provider !== 'manual' && a.key)
          if (activeApi) { provider = activeApi.provider; userKey = activeApi.key }
        }
      } catch {}

      const canonicalHistory: CanonicalMessage[] = [
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: trimmed },
      ]

      let accumulatedText = ''
      // Placeholder da resposta da assistente (sem toolCalls visíveis no chat)
      setMessages(prev => [...prev, { role: 'assistant', content: '' }])

      // ── Thinking em voz alta — Rafinha pensa junto com o professor ─────────────
      const THINKING_PHRASES = [
        'Deixa eu ver...', 'Um momento...', 'Verificando o contexto...',
        'Processando...', 'Analisando...', 'Pronto, já sei o que fazer!',
      ]
      const actionWords = /vá|vá|abra|abrir|crie|criar|lance|adicione|gere|mont|plan|comunic/i
      const thinkingLine = actionWords.test(trimmed)
        ? 'Executando agora...' : THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)]
      // Fala apenas se o texto for curto e voz estiver ativa
      if (voiceOut && trimmed.length < 120) {
        speak(thinkingLine)
      }

      try {
        for (let iteration = 0; iteration < 5; iteration++) {
          const res = await fetch('/api/agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: canonicalHistory, context: getAppContext(),
              provider, userKey, autoMode, userKeys,
            }),
          })

          if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`)
          const data = await res.json()
          const content = (data.content || []) as Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>

          const textParts = content.filter(c => c.type === 'text')
          const toolParts = content.filter(c => c.type === 'tool_use')

          const newText = textParts.map(b => b.text).join('\n').trim()
          if (newText) accumulatedText = newText

          setMessages(prev => {
            const last = { ...prev[prev.length - 1], content: accumulatedText }
            return [...prev.slice(0, -1), last]
          })

          if (toolParts.length === 0) break

          // ── Build running entries ──────────────────────────────────────────
          const newEntries: LogEntry[] = toolParts.map(tc => ({
            id: tc.id!, name: tc.name!, input: tc.input!,
            status: 'running', startedAt: Date.now(),
          }))

          setRunningTools(newEntries)

          canonicalHistory.push({
            role: 'assistant', content: newText,
            toolUse: toolParts.map(tc => ({ id: tc.id!, name: tc.name!, input: tc.input! })),
          })

          const toolResults: Array<{ id: string; name: string; result: string }> = []

          for (let i = 0; i < toolParts.length; i++) {
            const tc = toolParts[i]
            const est = TOOL_EST_SECONDS[tc.name!] || 2

            // Wait for estimated time or until user taps skip
            if (!skipSignalRef.current) {
              const startWait = Date.now()
              await new Promise<void>(resolve => {
                const check = setInterval(() => {
                  if (skipSignalRef.current || Date.now() - startWait >= est * 1000) {
                    clearInterval(check)
                    resolve()
                  }
                }, 50)
              })
            }
            skipSignalRef.current = false

            try {
              const result = await executeTool(tc.name!, tc.input!, onNavigate, speak)
              const elapsed = (Date.now() - newEntries[i].startedAt) / 1000

              setRunningTools(prev =>
                prev.map((e, idx) => idx === i ? { ...e, status: 'done', result, elapsed } : e)
              )
              setAllLogs(prev => {
                const updated = prev.map(e => e.id === tc.id ? { ...e, status: 'done' as const, result, elapsed } : e)
                const exists = prev.some(e => e.id === tc.id)
                return exists ? updated : [...prev, { ...newEntries[i], status: 'done', result, elapsed }]
              })
              toolResults.push({ id: tc.id!, name: tc.name!, result })
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : 'Erro'
              setRunningTools(prev =>
                prev.map((e, idx) => idx === i ? { ...e, status: 'error', result: errMsg } : e)
              )
              setAllLogs(prev => {
                const exists = prev.some(e => e.id === tc.id)
                return exists ? prev.map(e => e.id === tc.id ? { ...e, status: 'error' as const, result: errMsg } : e)
                             : [...prev, { ...newEntries[i], status: 'error', result: errMsg }]
              })
              toolResults.push({ id: tc.id!, name: tc.name!, result: `Erro: ${errMsg}` })
            }
          }

          canonicalHistory.push({ role: 'user', content: '', toolResults })

          // Pequena pausa para o modelo processar o resultado
          await new Promise(r => setTimeout(r, 300))
        }

        const finalText = accumulatedText ||
          (allLogs.filter(t => t.status === 'done').map(t => t.result).filter(Boolean).join('. ') + '!')

        setMessages(prev => {
          const last = { ...prev[prev.length - 1], content: finalText }
          return [...prev.slice(0, -1), last]
        })

        // Pequena pausa natural antes de falar (0.4s)
        await new Promise(r => setTimeout(r, 400))
        speak(finalText)

      } catch (error) {
        const rawMsg = error instanceof Error ? error.message : 'Erro de conexão'
        const isQuotaError = rawMsg.includes('429') || rawMsg.includes('quota') || rawMsg.includes('exceeded') || rawMsg.includes('provedor')
        const cleanMsg = isQuotaError
          ? '⚠️ As cotas das IAs atingiram o limite temporário. O aplicativo foi reencaminhado para o provedor Groq. Por favor, envie sua mensagem novamente!'
          : `⚠️ Não foi possível completar a ação: ${rawMsg}`

        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last.role === 'assistant' && !last.content)
            return [...prev.slice(0, -1), { role: 'assistant', content: cleanMsg }]
          return [...prev, { role: 'assistant', content: cleanMsg }]
        })
        speak('Ops, tive uma falha de conexão. Por favor, tente novamente.')
      } finally {
        setIsLoading(false)
        isLoadingRef.current = false
        // Limpa timers da tela após 2s
        setTimeout(() => setRunningTools([]), 2000)
      }
    }
  }, [messages, onNavigate, speak, voiceStop, allLogs]) // eslint-disable-line

  // ─── Undo ──────────────────────────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    if (undoLastAction()) {
      setMessages(prev => [...prev, { role: 'assistant', content: '↩️ Ação desfeita com sucesso!' }])
      speak('Ação desfeita!')
    }
  }, [speak])

  // ─── Render: botão flutuante ───────────────────────────────────────────────────
  if (!isOpen) return (
    <button onClick={() => setIsOpen(true)} style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      width: 64, height: 64, borderRadius: '50%', background: '#b58900',
      border: '3px solid #fff', boxShadow: '0 8px 32px rgba(181,137,0,0.4)',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'transform 0.2s', padding: 6,
    }}
      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
    >
      <AvatarSVG />
    </button>
  )

  // ─── Render: chat ──────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      width: 400, maxHeight: '80vh', background: '#fff', borderRadius: 20,
      boxShadow: '0 12px 48px rgba(0,43,54,0.18)', border: '1px solid #ede8dc',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      animation: 'rafSlideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
    }}>
      <style>{`
        @keyframes rafSlideUp { from { opacity:0; transform:translateY(20px) scale(0.95); } to { opacity:1; transform:none; } }
        @keyframes rafPulse   { from { opacity:0.3 } to { opacity:1 } }
        @keyframes rafSpin    { to { transform:rotate(360deg); } }
        @keyframes rafPing    { 0%,100%{box-shadow:0 0 0 0 rgba(220,50,47,.4)} 70%{box-shadow:0 0 0 10px rgba(220,50,47,0)} }
        @keyframes rafListen  { 0%,100%{box-shadow:0 0 0 0 rgba(42,161,152,.5)} 70%{box-shadow:0 0 0 8px rgba(42,161,152,0)} }
      `}</style>

      {/* ── Header ── */}
      <div style={{ padding: '13px 16px', background: '#073642', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#b58900', border: '2px solid #fff', overflow: 'hidden', flexShrink: 0 }}>
            <AvatarSVG />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fdf6e3' }}>Rafinha</div>
            <div style={{ fontSize: 10, color: '#93a1a1', display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%',
                background: isLoading ? '#b58900' : isSpeaking ? '#268bd2' : isListening ? '#2aa198' : '#859900',
                animation: isListening ? 'rafListen 1.5s infinite' : 'none',
              }} />
              {isLoading ? 'Executando...'
                : isSpeaking ? 'Falando...'
                : isListening ? '🎙️ Ouvindo...'
                : 'Online · Pronta'}
              {isHDVoice && !isLoading && <span style={{ color: '#b58900', marginLeft: 4 }}>· HD</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Log button */}
          <button
            onClick={() => setShowLog(v => !v)}
            title="Ver log de ações"
            style={{
              background: showLog ? 'rgba(42,161,152,0.2)' : 'rgba(255,255,255,0.08)',
              border: 'none', color: showLog ? '#2aa198' : '#93a1a1',
              padding: '5px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 4, position: 'relative',
            }}
          >
            <i className="ti ti-list" />
            {allLogs.length > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: '#2aa198', color: '#fff', fontSize: 9, borderRadius: 9, padding: '1px 4px', fontWeight: 700 }}>
                {allLogs.length}
              </span>
            )}
          </button>
          {/* Undo */}
          {canUndo && (
            <button onClick={handleUndo} title="Desfazer" style={{
              background: 'rgba(203,75,22,0.2)', border: '1px solid rgba(203,75,22,0.5)',
              color: '#cb4b16', padding: '4px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
            }}>
              <i className="ti ti-arrow-back-up" style={{ fontSize: 13 }} />
            </button>
          )}
          {/* Modo Alexa 24/7 */}
          <button
            onClick={() => setIsLiveMode(v => !v)}
            title={isLiveMode ? 'Modo Alexa Ativo (Mãos Livres Contínuo)' : 'Ativar Modo Alexa 24/7'}
            style={{
              background: isLiveMode ? '#dc322f' : 'rgba(255,255,255,0.12)', border: 'none', color: '#fff',
              padding: '5px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 4,
              animation: isLiveMode ? 'rafPing 2s ease-in-out infinite' : 'none',
            }}
          >
            <i className="ti ti-headset" />
            <span>{isLiveMode ? '📻 ALEXA ON' : '📻 Modo Alexa'}</span>
          </button>
          {/* Voz */}
          <button onClick={() => setVoiceOut(v => !v)} style={{
            background: voiceOut ? 'rgba(133,153,0,0.25)' : 'rgba(255,255,255,0.08)', border: 'none',
            color: voiceOut ? '#859900' : '#93a1a1', padding: 6, borderRadius: 8, cursor: 'pointer', fontSize: 15,
          }}>
            <i className={voiceOut ? 'ti ti-volume' : 'ti ti-volume-off'} />
          </button>
          <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: '#93a1a1', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
      </div>

      {/* ── Messages (CLEAN — só texto) ── */}
      <div style={{ flex: 1, padding: '14px', overflowY: 'auto', background: '#fdf6e3', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.content && (
              <div style={{
                maxWidth: '88%', padding: '10px 14px', borderRadius: 16,
                background: m.role === 'user' ? '#073642' : '#fff',
                color: m.role === 'user' ? '#fdf6e3' : '#073642',
                border: m.role === 'user' ? 'none' : '1px solid #ede8dc',
                boxShadow: m.role === 'user' ? 'none' : '0 1px 6px rgba(0,0,0,0.05)',
                fontSize: 13.5, lineHeight: 1.55,
              }}>
                <span dangerouslySetInnerHTML={{ __html: m.content.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br/>') }} />
              </div>
            )}
          </div>
        ))}

        {/* Execution timers — inline, clicáveis para pular */}
        {runningTools.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {runningTools.map((entry, i) => (
              <ExecutionTimer
                key={`${entry.id}-${i}`}
                entry={entry}
                onSkip={() => { skipSignalRef.current = true }}
              />
            ))}
          </div>
        )}

        {/* Loading dots (sem tools rodando) */}
        {isLoading && runningTools.length === 0 && (
          <div style={{ display: 'flex', gap: 5, padding: '10px 14px', background: '#fff', borderRadius: 14, width: 'fit-content', border: '1px solid #ede8dc' }}>
            {[0, 0.2, 0.4].map((d, i) => (
              <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#b58900', animation: `rafPulse 1s infinite alternate ${d}s` }} />
            ))}
          </div>
        )}

        {/* Interim voice text */}
        {interimText && !isLoading && (
          <div style={{
            alignSelf: 'flex-end', maxWidth: '85%', padding: '8px 14px',
            borderRadius: 14, background: 'rgba(7,54,66,0.06)',
            border: '1px dashed rgba(7,54,66,0.2)',
            fontSize: 13, color: '#93a1a1', fontStyle: 'italic',
          }}>
            {interimText}...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ── */}
      <div style={{ padding: '10px 12px', background: '#fff', borderTop: '1px solid #ede8dc', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => isListening ? voiceStop() : voiceStart()}
          disabled={isLoading || isSpeaking || isLiveMode}
          style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none', flexShrink: 0,
            background: isListening ? '#dc322f' : '#f5f0e8',
            color: isListening ? '#fff' : '#073642',
            cursor: isLoading || isSpeaking || isLiveMode ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: isListening ? 'rafListen 1.5s ease-in-out infinite' : 'none',
            opacity: isLoading || isSpeaking || isLiveMode ? 0.5 : 1,
          }}
        >
          <i className={isListening ? 'ti ti-microphone-off' : 'ti ti-microphone'} style={{ fontSize: 17 }} />
        </button>

        <input
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); dispatchSend(inputText) } }}
          placeholder={isLiveMode ? '🎙️ Mãos Livres ativo...' : isListening ? '🎙️ Ouvindo — pode falar!' : 'Digite ou fale...'}
          disabled={isLoading || isLiveMode}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 20,
            border: `1px solid ${isListening ? '#2aa198' : '#ede8dc'}`,
            background: isLiveMode ? '#eee8d5' : isListening ? 'rgba(42,161,152,0.06)' : '#f5f0e8',
            outline: 'none', fontSize: 13.5, color: '#073642',
            fontFamily: "'Outfit', sans-serif",
            transition: 'border 0.2s, background 0.2s',
          }}
        />

        {!isLiveMode && (
          <button
            onClick={() => dispatchSend(inputText)}
            disabled={isLoading || !inputText.trim()}
            style={{
              width: 40, height: 40, borderRadius: '50%', border: 'none',
              background: inputText.trim() && !isLoading ? '#b58900' : '#ede8dc',
              color: '#fff', flexShrink: 0,
              cursor: inputText.trim() && !isLoading ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.2s',
            }}
          >
            {isLoading
              ? <i className="ti ti-loader-2" style={{ fontSize: 15, animation: 'rafSpin 1s linear infinite' }} />
              : <i className="ti ti-send" style={{ fontSize: 15 }} />
            }
          </button>
        )}
      </div>

      {/* ── Log Drawer (overlay) ── */}
      {showLog && (
        <LogDrawer logs={allLogs} onClose={() => setShowLog(false)} />
      )}
    </div>
  )
}
