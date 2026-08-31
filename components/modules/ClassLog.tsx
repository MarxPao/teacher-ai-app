'use client'
import { toast, showConfirm } from '@/components/Toast'

import { useState, useEffect, useMemo } from 'react'
import { fillPortal, logPortalFill } from '@/lib/portalBridge'
import { createBrowserTask, BrowserAutomationTask, DiffItem } from '@/lib/browserAutomationClient'
import { sanitizeOutboundPayload } from '@/lib/portalSanitizer'
import AutomationDiffModal from '@/components/modules/AutomationDiffModal'

export interface ClassLogEntry {
  id: string
  school: string
  className: string
  date: string
  dayOfWeek: string
  semester: '1º Semestre' | '2º Semestre'
  quarter: '1º Trimestre' | '2º Trimestre' | '3º Trimestre'

  // Planejamento & Sequência
  topic: string
  focusSkill: string
  resources: string
  warmup: string
  presentation: string
  practice: string
  wrapup: string

  // Reflexão Pós-Aula
  whatWorked: string
  whatCanImprove: string
  whatWasMissing: string
  needsReviewNextClass: string

  // Observações Gerais
  groupObservations: string
  spaceUsed: string
  studentNotes: string

  createdAt: string
}

const POSTIT_COLORS = [
  { bg: '#fff9b1', border: '#e6df7b', text: '#5c5400', shadow: 'rgba(230,223,123,0.4)' }, // Amarelo
  { bg: '#ffdae9', border: '#f0b4ce', text: '#6b1d43', shadow: 'rgba(240,180,206,0.4)' }, // Rosa
  { bg: '#d4f0f7', border: '#a5dbe8', text: '#0e4f5f', shadow: 'rgba(165,219,232,0.4)' }, // Azul
  { bg: '#d9f7be', border: '#b7eb8f', text: '#235e00', shadow: 'rgba(183,235,143,0.4)' }, // Verde
  { bg: '#ffe5b4', border: '#ffd180', text: '#6b3f00', shadow: 'rgba(255,209,128,0.4)' }, // Laranja
]

const INITIAL_LOGS: ClassLogEntry[] = [
  {
    id: 'log_1',
    school: 'Machado Sobrinho',
    className: '9º Ano B',
    date: '2026-07-22',
    dayOfWeek: 'Quarta-feira',
    semester: '2º Semestre',
    quarter: '2º Trimestre',
    topic: 'Present Perfect vs. Simple Past & Life Experiences',
    focusSkill: 'Speaking & Reading',
    resources: 'Projetor, Workbook pág. 42 e Cartões de Perguntas',
    warmup: 'Find Someone Who... com perguntas sobre experiências marcantes.',
    presentation: 'Apresentação de contraste usando linha do tempo visual no quadro.',
    practice: 'Pair work com cartões de conversa usando Have you ever...?',
    wrapup: 'CCQs para checar a diferença entre passado definido e indefinido.',
    whatWorked: 'O jogo inicial animou muito a turma e todos participaram.',
    whatCanImprove: 'A transição para os exercícios impressos demorou mais que o previsto.',
    whatWasMissing: 'Não deu tempo de corrigir os exercícios 4 e 5 da pág. 42.',
    needsReviewNextClass: 'Iniciar a próxima aula corrigindo os exercícios 4 e 5 e reforçando os verbos irregulares.',
    groupObservations: 'O grupo do fundo (Pedro, Lucas e Gabriel) dispersou durante a prática em duplas.',
    spaceUsed: 'Sala de aula tradicional com carteiras dispostas em duplas.',
    studentNotes: 'Ana Júlia demonstrou excelente domínio dos particípios passados.',
    createdAt: '2026-07-22T14:30:00Z',
  },
  {
    id: 'log_2',
    school: 'Rede Santa Catarina',
    className: '8º Ano A',
    date: '2026-07-24',
    dayOfWeek: 'Sexta-feira',
    semester: '2º Semestre',
    quarter: '2º Trimestre',
    topic: 'Conditionals & Future Predictions (Will / Going to)',
    focusSkill: 'Grammar & Writing',
    resources: 'Slides interativos, Quadro e Fichas de Exercícios',
    warmup: 'Brainstorming de previsões para o ano de 2050.',
    presentation: 'Explicação de First Conditional com frases de causa e efeito.',
    practice: 'Criação de histórias em cadeia em grupos de 4 alunos.',
    wrapup: 'Quiz rápido de 3 questões no quadro.',
    whatWorked: 'As histórias em cadeia geraram muitas risadas e engajamento.',
    whatCanImprove: 'Supervisionar mais de perto o tempo gasto na escrita.',
    whatWasMissing: 'Faltou tempo para a leitura das histórias de dois grupos.',
    needsReviewNextClass: 'Ouvir as leituras restantes antes de iniciar o novo tópico.',
    groupObservations: 'Turma colaborativa e participativa durante a dinâmica.',
    spaceUsed: 'Laboratório de Idiomas com disposição em ilhas.',
    studentNotes: 'Mateus ajudou os colegas com o uso de Will.',
    createdAt: '2026-07-24T10:00:00Z',
  },
]

export default function ClassLog() {
  const [logs, setLogs] = useState<ClassLogEntry[]>([])
  const [schools, setSchools] = useState<string[]>(['Machado Sobrinho', 'Rede Santa Catarina', 'Anglo', 'Colegio Oxford'])
  const [classes, setClasses] = useState<string[]>(['9º Ano B', '8º Ano A', '3º Médio A', '7º Ano C'])

  // Contexto selecionado
  const [selectedSchool, setSelectedSchool] = useState('Machado Sobrinho')
  const [selectedClass, setSelectedClass] = useState('9º Ano B')
  const [semester, setSemester] = useState<'1º Semestre' | '2º Semestre'>('2º Semestre')
  const [quarter, setQuarter] = useState<'1º Trimestre' | '2º Trimestre' | '3º Trimestre'>('2º Trimestre')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [dayOfWeek, setDayOfWeek] = useState('Segunda-feira')

  // Formulário da Aula Atual
  const [topic, setTopic] = useState('')
  const [focusSkill, setFocusSkill] = useState('Speaking & Listening')
  const [resources, setResources] = useState('')
  const [warmup, setWarmup] = useState('')
  const [presentation, setPresentation] = useState('')
  const [practice, setPractice] = useState('')
  const [wrapup, setWrapup] = useState('')

  // Reflexão Pós-Aula
  const [whatWorked, setWhatWorked] = useState('')
  const [whatCanImprove, setWhatCanImprove] = useState('')
  const [whatWasMissing, setWhatWasMissing] = useState('')
  const [needsReviewNextClass, setNeedsReviewNextClass] = useState('')

  // Observações
  const [groupObservations, setGroupObservations] = useState('')
  const [spaceUsed, setSpaceUsed] = useState('Sala de Aula Padrão')
  const [studentNotes, setStudentNotes] = useState('')

  const [activeTab, setActiveTab] = useState<'calendar' | 'new' | 'history'>('calendar')
  const [selectedLogModal, setSelectedLogModal] = useState<ClassLogEntry | null>(null)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [activeTask, setActiveTask] = useState<BrowserAutomationTask | null>(null)

  // Controle de mês no Calendário Post-it
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth())
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())

  useEffect(() => {
    const rawLogs = localStorage.getItem('teacher_class_logs_v1')
    if (rawLogs) {
      try { setLogs(JSON.parse(rawLogs)) } catch { setLogs(INITIAL_LOGS) }
    } else {
      setLogs(INITIAL_LOGS)
      localStorage.setItem('teacher_class_logs_v1', JSON.stringify(INITIAL_LOGS))
    }

    const stSchools = localStorage.getItem('teacher_schools')
    if (stSchools) {
      try { setSchools(JSON.parse(stSchools).map((s: any) => s.name)) } catch {}
    }

    const stClasses = localStorage.getItem('teacher_classes')
    if (stClasses) {
      try { setClasses(JSON.parse(stClasses).map((c: any) => c.name)) } catch {}
    }
  }, [])

  useEffect(() => {
    if (!date) return
    const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
    const d = new Date(date + 'T00:00:00')
    setDayOfWeek(days[d.getDay()])
  }, [date])

  const saveLogsToStorage = (updated: ClassLogEntry[]) => {
    setLogs(updated)
    localStorage.setItem('teacher_class_logs_v1', JSON.stringify(updated))
    window.dispatchEvent(new Event('storage'))
  }

  // MEMÓRIA HISTÓRICA DA TURMA
  const previousClassMemory = useMemo(() => {
    const classLogs = logs.filter(l => l.school === selectedSchool && l.className === selectedClass)
    if (!classLogs.length) return null
    return classLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
  }, [logs, selectedSchool, selectedClass])

  const aiMemoryTip = useMemo(() => {
    if (!previousClassMemory) return null
    const tips: string[] = []
    if (previousClassMemory.needsReviewNextClass) {
      tips.push(`📌 Lembrete para esta aula: Na aula de ${new Date(previousClassMemory.date).toLocaleDateString('pt-BR')}, você anotou: "${previousClassMemory.needsReviewNextClass}"`)
    }
    if (previousClassMemory.groupObservations) {
      tips.push(`👥 Atenção ao comportamento: "${previousClassMemory.groupObservations}"`)
    }
    return tips.join(' | ')
  }, [previousClassMemory])

  // Status do Lançamento
  const [classStatus, setClassStatus] = useState<'Realizada' | 'Cancelada' | 'Revisão' | 'Avaliação'>('Realizada')

  const handleSaveClassLog = () => {
    const effectiveTopic = topic.trim() || (classStatus === 'Cancelada' ? 'Aula Cancelada / Reprogramada' : `Registro de Aula — ${selectedClass || 'Geral'}`)

    const newEntry: ClassLogEntry = {
      id: `log_${Date.now()}`,
      school: selectedSchool,
      className: selectedClass,
      date,
      dayOfWeek,
      semester,
      quarter,
      topic: effectiveTopic,
      focusSkill: classStatus === 'Cancelada' ? 'N/A (Cancelada)' : focusSkill,
      resources,
      warmup,
      presentation,
      practice,
      wrapup,
      whatWorked,
      whatCanImprove,
      whatWasMissing,
      needsReviewNextClass,
      groupObservations,
      spaceUsed,
      studentNotes,
      createdAt: new Date().toISOString(),
    }

    // Ordenação cronológica estrita por data da aula (não por data de lançamento)
    const updated = [newEntry, ...logs].sort((a, b) => new Date(b.date + 'T00:00:00').getTime() - new Date(a.date + 'T00:00:00').getTime())
    saveLogsToStorage(updated)
    setSavedSuccess(true)
    setTimeout(() => setSavedSuccess(false), 3000)

    setTopic('')
    setResources('')
    setWarmup('')
    setPresentation('')
    setPractice('')
    setWrapup('')
    setWhatWorked('')
    setWhatCanImprove('')
    setWhatWasMissing('')
    setNeedsReviewNextClass('')
    setGroupObservations('')
    setStudentNotes('')

    setActiveTab('calendar')
  }

  const filteredLogs = useMemo(() => {
    return logs
      .filter(l =>
        (selectedSchool === 'all' || l.school === selectedSchool) &&
        (selectedClass === 'all' || l.className === selectedClass)
      )
      .sort((a, b) => new Date(b.date + 'T00:00:00').getTime() - new Date(a.date + 'T00:00:00').getTime())
  }, [logs, selectedSchool, selectedClass])

  // CÁLCULO DA GRADE MENSAL DE DIAS (CALENDÁRIO REAL DE POST-ITS)
  const calendarDaysGrid = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1)
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0)

    const startingDayOfWeek = firstDay.getDay() // 0 = Domingo, 1 = Segunda...
    const totalDays = lastDay.getDate()

    const grid = []
    // Dias em branco antes do início do mês
    for (let i = 0; i < startingDayOfWeek; i++) {
      grid.push({ dayNumber: null, dateStr: '', logsForDay: [] })
    }

    // Dias do mês
    for (let day = 1; day <= totalDays; day++) {
      const monthStr = String(calendarMonth + 1).padStart(2, '0')
      const dayStr = String(day).padStart(2, '0')
      const dateStr = `${calendarYear}-${monthStr}-${dayStr}`

      const dayLogs = filteredLogs.filter(l => l.date === dateStr)
      grid.push({ dayNumber: day, dateStr, logsForDay: dayLogs })
    }

    return grid
  }, [calendarYear, calendarMonth, filteredLogs])

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ]

  const weekDayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  const nextMonth = () => {
    if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y => y + 1) }
    else { setCalendarMonth(m => m + 1) }
  }

  const prevMonth = () => {
    if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y => y - 1) }
    else { setCalendarMonth(m => m - 1) }
  }

  return (
    <div style={{ padding: '36px 48px', height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 1650, margin: '0 auto', boxSizing: 'border-box', width: '100%' }}>
      
      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ textAlign: 'center', fontFamily: "'Fraunces', Georgia, serif", fontSize: 34, fontWeight: 600, color: '#2c1a0e', margin: '0 auto' }}>
              Diário de Aula
            </h1>
            <span style={{ background: '#2c1a0e', color: '#b58900', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12, textTransform: 'uppercase' }}>
              Diário Online & Calendário de Post-its
            </span>
          </div>
          <p style={{ color: '#7a5c42', fontSize: 14, marginTop: 4 }}>
            Grade mensal estilo Post-it por dias da semana, planejamento sequencial e memória contínua das turmas.
          </p>
        </div>

        {/* Tabs de Navegação */}
        <div style={{ display: 'flex', gap: 6, background: '#f0e8d8', padding: 4, borderRadius: 12 }}>
          <button
            onClick={() => setActiveTab('calendar')}
            style={{
              padding: '8px 16px', borderRadius: 10, border: 'none',
              background: activeTab === 'calendar' ? '#2c1a0e' : 'transparent',
              color: activeTab === 'calendar' ? '#fff' : '#7a5c42',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <i className="ti ti-calendar" /> Calendário Post-it
          </button>

          <button
            onClick={() => setActiveTab('new')}
            style={{
              padding: '8px 16px', borderRadius: 10, border: 'none',
              background: activeTab === 'new' ? '#2c1a0e' : 'transparent',
              color: activeTab === 'new' ? '#fff' : '#7a5c42',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <i className="ti ti-edit" /> Registrar Aula de Hoje
          </button>

          <button
            onClick={() => setActiveTab('history')}
            style={{
              padding: '8px 16px', borderRadius: 10, border: 'none',
              background: activeTab === 'history' ? '#2c1a0e' : 'transparent',
              color: activeTab === 'history' ? '#fff' : '#7a5c42',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <i className="ti ti-list" /> Lista Completa ({filteredLogs.length})
          </button>
        </div>
      </div>

      {/* BARRA DE SELEÇÃO CONTEXTUAL (ESCOLA, TURMA, DATA, TRIMESTRE) */}
      <div style={{ background: '#fff', padding: '14px 20px', borderRadius: 16, border: '1px solid #ede8dc', marginBottom: 20, boxShadow: '0 2px 10px rgba(44,26,14,0.04)', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, alignItems: 'center' }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 4 }}>🏫 Escola</label>
          <select value={selectedSchool} onChange={e => setSelectedSchool(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#2c1a0e', outline: 'none' }}>
            <option value="all">Todas as Escolas</option>
            {schools.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 4 }}>👥 Turma</label>
          <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#2c1a0e', outline: 'none' }}>
            <option value="all">Todas as Turmas</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 4 }}>📅 Data da Aula</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', padding: '7px 8px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 12, color: '#2c1a0e' }} />
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 4 }}>🎯 Período / Trimestre</label>
          <select value={quarter} onChange={e => setQuarter(e.target.value as any)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#2c1a0e', outline: 'none' }}>
            <option value="1º Trimestre">1º Trimestre</option>
            <option value="2º Trimestre">2º Trimestre</option>
            <option value="3º Trimestre">3º Trimestre</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 4 }}>⏳ Semestre</label>
          <select value={semester} onChange={e => setSemester(e.target.value as any)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#2c1a0e', outline: 'none' }}>
            <option value="1º Semestre">1º Semestre</option>
            <option value="2º Semestre">2º Semestre</option>
          </select>
        </div>
      </div>

      {/* TELA 1: CALENDÁRIO MENSAL REAL COM POST-ITS */}
      {activeTab === 'calendar' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {/* Controls do Mês */}
          <div style={{ background: '#fff', padding: '14px 20px', borderRadius: 16, border: '1px solid #ede8dc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#2c1a0e', margin: 0, fontFamily: "'Fraunces', Georgia, serif" }}>
                Calendário do Diário {monthNames[calendarMonth]} de {calendarYear}
              </h2>
              <span style={{ fontSize: 12, background: '#f0e8d8', color: '#7a5c42', padding: '4px 12px', borderRadius: 12, fontWeight: 700 }}>
                {filteredLogs.filter(l => new Date(l.date + 'T00:00:00').getMonth() === calendarMonth).length} aula(s) este mês
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={prevMonth} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', cursor: 'pointer', fontSize: 13, color: '#2c1a0e', fontWeight: 700 }}>
                Mês Anterior
              </button>
              <button onClick={nextMonth} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', cursor: 'pointer', fontSize: 13, color: '#2c1a0e', fontWeight: 700 }}>
                Próximo Mês 
              </button>
            </div>
          </div>

          {/* Grade de Calendário Real (7 Colunas com os Dias da Semana) */}
          <div style={{ background: '#fff', borderRadius: 20, padding: 20, border: '1px solid #ede8dc', boxShadow: '0 4px 16px rgba(44,26,14,0.04)' }}>
            {/* Header dos Dias da Semana */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, marginBottom: 12, textAlign: 'center' }}>
              {weekDayNames.map((d, i) => (
                <div key={d} style={{ padding: '8px', background: i === 0 || i === 6 ? '#f5f0e8' : '#2c1a0e', color: i === 0 || i === 6 ? '#7a5c42' : '#fff', fontWeight: 800, borderRadius: 8, fontSize: 12, textTransform: 'uppercase' }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Células dos Dias */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
              {calendarDaysGrid.map((cell, idx) => {
                if (!cell.dayNumber) {
                  return <div key={`empty_${idx}`} style={{ minHeight: 130, background: '#faf8f5', borderRadius: 12, border: '1px dashed #f0e8d8' }} />
                }

                const hasLogs = cell.logsForDay.length > 0

                return (
                  <div
                    key={cell.dateStr}
                    style={{
                      minHeight: 140,
                      background: hasLogs ? '#fdfcf7' : '#fff',
                      borderRadius: 12,
                      border: '1px solid #ede8dc',
                      padding: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    {/* Número do Dia */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: hasLogs ? '#2c1a0e' : '#a08060', background: hasLogs ? '#f0e8d8' : 'transparent', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {cell.dayNumber}
                      </span>
                    </div>

                    {/* Post-it visual se houver aula registrada */}
                    {cell.logsForDay.map((item, pIdx) => {
                      const palette = POSTIT_COLORS[pIdx % POSTIT_COLORS.length]
                      const rot = (pIdx % 2 === 0 ? 1 : -1) * 1.5

                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedLogModal(item)}
                          style={{
                            background: palette.bg,
                            border: `1px solid ${palette.border}`,
                            borderRadius: 10,
                            padding: 10,
                            cursor: 'pointer',
                            transform: `rotate(${rot}deg)`,
                            boxShadow: `0 4px 12px ${palette.shadow}`,
                            transition: 'all 0.2s ease',
                            position: 'relative',
                          }}
                          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.04) rotate(0deg)'}
                          onMouseLeave={e => e.currentTarget.style.transform = `rotate(${rot}deg)`}
                        >
                          {/* Pin */}
                          <div style={{ position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)', width: 10, height: 10, borderRadius: '50%', background: '#dc322f', border: '1.5px solid #fff' }} />

                          <div style={{ fontSize: 9.5, fontWeight: 800, color: palette.text, textTransform: 'uppercase', marginBottom: 2 }}>
                            {item.className}
                          </div>

                          <div style={{ fontSize: 11, fontWeight: 800, color: palette.text, lineHeight: 1.2, margin: '2px 0 4px 0' }}>
                            {item.topic.length > 32 ? item.topic.slice(0, 32) + '...' : item.topic}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* TELA 2: REGISTRAR NOVA AULA */}
      {activeTab === 'new' && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24, paddingRight: 4 }}>
          {/* Box de Memória */}
          {aiMemoryTip && (
            <div style={{ background: '#fdf8f2', border: '2px solid #b58900', borderRadius: 16, padding: 18, boxShadow: '0 4px 14px rgba(181,137,0,0.12)', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: '#b58900', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                🧠
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#b58900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Memória Pedagógica Contínua (Dica da Rafinha para a Turma {selectedClass}):
                </div>
                <p style={{ fontSize: 13.5, color: '#2c1a0e', margin: '4px 0 0 0', lineHeight: 1.5, fontWeight: 500 }}>
                  {aiMemoryTip}
                </p>
              </div>
            </div>
          )}

          {/* Planejamento Diário */}
          <div style={{ background: '#fff', padding: 24, borderRadius: 20, border: '1px solid #ede8dc', boxShadow: '0 2px 10px rgba(44,26,14,0.04)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#2c1a0e', marginTop: 0, marginBottom: 16 }}>
              Planejamento Diário da Aula ({dayOfWeek}, {new Date(date + 'T00:00:00').toLocaleDateString('pt-BR')})
            </h3>

            {/* Status da Aula */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 6 }}>
                Status da Aula
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['Realizada', 'Cancelada', 'Revisão', 'Avaliação'] as const).map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setClassStatus(st)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 8,
                      border: classStatus === st ? '2px solid #2c1a0e' : '1px solid #d5c0b0',
                      background: classStatus === st ? (st === 'Cancelada' ? '#fee2e2' : '#f5eee6') : '#fff',
                      color: classStatus === st ? (st === 'Cancelada' ? '#991b1b' : '#2c1a0e') : '#7a5c42',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    {st === 'Cancelada' ? '❌ Cancelada' : st === 'Realizada' ? '✅ Realizada' : st === 'Revisão' ? '🔄 Revisão' : '📝 Avaliação'}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 6 }}>
                  Tema / Tópico Principal da Aula {classStatus === 'Cancelada' ? '(Opcional — Cancelada)' : '(Opcional)'}
                </label>
                <input
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder={classStatus === 'Cancelada' ? 'Motivo do cancelamento (opcional)...' : 'Ex: Past Continuous & Interrupted Actions in Past'}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13.5, color: '#2c1a0e', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 6 }}>Habilidade Foco (ELT/BNCC)</label>
                <select value={focusSkill} onChange={e => setFocusSkill(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13.5, color: '#2c1a0e', outline: 'none', boxSizing: 'border-box' }}>
                  <option>Speaking & Listening</option>
                  <option>Reading & Vocabulary</option>
                  <option>Grammar & Writing</option>
                  <option>Integrated Skills (PPP)</option>
                  <option>Task-Based Learning (TBLT)</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 6 }}>Recursos & Materiais Utilizados</label>
              <input value={resources} onChange={e => setResources(e.target.value)} placeholder="Ex: Projetor, Livro Digital pág. 48, Caixas de Som, Flashcards..." style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13.5, color: '#2c1a0e', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Sequência Didática */}
          <div style={{ background: '#fff', padding: 24, borderRadius: 20, border: '1px solid #ede8dc', boxShadow: '0 2px 10px rgba(44,26,14,0.04)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#2c1a0e', marginTop: 0, marginBottom: 16 }}>
              Sequência Didática (Passo a Passo da Aula)
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#cb4b16', display: 'block', marginBottom: 4 }}>1. Warm-up / Engajamento (5-10 min)</label>
                <textarea value={warmup} onChange={e => setWarmup(e.target.value)} placeholder="Dinâmica inicial, contexto ou revisão rápida..." rows={3} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#2c1a0e', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#268bd2', display: 'block', marginBottom: 4 }}>2. Apresentação / Input (15-20 min)</label>
                <textarea value={presentation} onChange={e => setPresentation(e.target.value)} placeholder="Apresentação do conteúdo, explicação ou leitura de texto..." rows={3} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#2c1a0e', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#6c71c4', display: 'block', marginBottom: 4 }}>3. Prática Guiada & Autônoma (20 min)</label>
                <textarea value={practice} onChange={e => setPractice(e.target.value)} placeholder="Exercícios em duplas/grupos, resolução de lista ou debate..." rows={3} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#2c1a0e', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#859900', display: 'block', marginBottom: 4 }}>4. Wrap-up / Checagem (5-10 min)</label>
                <textarea value={wrapup} onChange={e => setWrapup(e.target.value)} placeholder="CCQs, encerramento e indicação de dever de casa..." rows={3} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#2c1a0e', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>

          {/* Reflexão Pós-Aula */}
          <div style={{ background: '#fff', padding: 24, borderRadius: 20, border: '1px solid #ede8dc', boxShadow: '0 2px 10px rgba(44,26,14,0.04)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#2c1a0e', marginTop: 0, marginBottom: 16 }}>
              Reflexão Pós-Aula (Auto-Avaliação Docente)
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#2d9d5d', display: 'block', marginBottom: 4 }}>1. O que deu certo / pode ser feito?</label>
                <textarea value={whatWorked} onChange={e => setWhatWorked(e.target.value)} placeholder="Pontos fortes da aula, engajamento e conquistas dos alunos..." rows={3} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#2c1a0e', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#b58900', display: 'block', marginBottom: 4 }}>2. O que pode melhorar?</label>
                <textarea value={whatCanImprove} onChange={e => setWhatCanImprove(e.target.value)} placeholder="Aspectos de ritmo, clareza nas instruções ou gestão do tempo..." rows={3} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#2c1a0e', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#dc322f', display: 'block', marginBottom: 4 }}>3. O que faltou nesta aula?</label>
                <textarea value={whatWasMissing} onChange={e => setWhatWasMissing(e.target.value)} placeholder="Conteúdos não concluídos ou exercícios não corrigidos..." rows={3} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#2c1a0e', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#268bd2', display: 'block', marginBottom: 4 }}>4. O que precisa ser revisado para a próxima aula?</label>
                <textarea value={needsReviewNextClass} onChange={e => setNeedsReviewNextClass(e.target.value)} placeholder="Tópicos que exigem retomada no início da próxima aula..." rows={3} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#2c1a0e', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>

          {/* Observações */}
          <div style={{ background: '#fff', padding: 24, borderRadius: 20, border: '1px solid #ede8dc', boxShadow: '0 2px 10px rgba(44,26,14,0.04)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#2c1a0e', marginTop: 0, marginBottom: 16 }}>
              Observações da Turma, Comportamento & Espaços Usados
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 4 }}>👥 Dinâmica de Grupos & Comportamento</label>
                <textarea value={groupObservations} onChange={e => setGroupObservations(e.target.value)} placeholder="Observações sobre entrosamento, grupos dispersos ou engajados..." rows={4} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#2c1a0e', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 4 }}>🏛️ Espaço Usado & Arranjo Físico</label>
                <textarea value={spaceUsed} onChange={e => setSpaceUsed(e.target.value)} placeholder="Sala, laboratório, pátio, arranjo em U, duplas, etc..." rows={4} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#2c1a0e', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#7a5c42', display: 'block', marginBottom: 4 }}>⭐ Alunos em Destaque / Necessidades</label>
                <textarea value={studentNotes} onChange={e => setStudentNotes(e.target.value)} placeholder="Alunos que se destacaram ou precisam de apoio pedagógico..." rows={4} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e8e0d0', background: '#f5f0e8', fontSize: 13, color: '#2c1a0e', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 40 }}>
            {savedSuccess && (
              <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-check" /> Registro Salvo no Mural Post-it da Turma!
              </span>
            )}

            <button
              onClick={handleSaveClassLog}
              style={{
                padding: '14px 32px', borderRadius: 12, border: 'none',
                background: '#2c1a0e', color: '#fff', fontSize: 15, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                boxShadow: '0 4px 16px rgba(7,54,66,0.2)',
              }}
            >
              <i className="ti ti-device-floppy" /> Salvar Diário no Mural Post-it
            </button>
          </div>
        </div>
      )}

      {/* TELA 3: LISTA COMPLETA */}
      {activeTab === 'history' && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filteredLogs.map(item => (
            <div
              key={item.id}
              onClick={() => setSelectedLogModal(item)}
              style={{
                background: '#fff', borderRadius: 16, padding: 22, cursor: 'pointer',
                border: '1px solid #ede8dc', boxShadow: '0 2px 10px rgba(44,26,14,0.04)',
                display: 'flex', flexDirection: 'column', gap: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#2c1a0e', color: '#b58900' }}>
                      {item.school} {item.className}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#7a5c42' }}>
                      {item.dayOfWeek}, {new Date(item.date + 'T00:00:00').toLocaleDateString('pt-BR')} ({item.quarter} / {item.semester})
                    </span>
                  </div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: '#2c1a0e', margin: 0 }}>
                    {item.topic}
                  </h3>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#268bd2', background: 'rgba(38,139,210,0.1)', padding: '4px 10px', borderRadius: 8 }}>
                  {item.focusSkill}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL DE POST-IT EXPANDIDO (ZOOM DA AULA) */}
      {selectedLogModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,54,66,0.65)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}>
          <div
            style={{
              background: '#fff9b1',
              border: '3px solid #e6df7b',
              borderRadius: 24,
              padding: 36,
              width: 800,
              maxWidth: '95vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              color: '#5c5400',
            }}
          >
            <button
              onClick={() => setSelectedLogModal(null)}
              style={{
                position: 'absolute', top: 20, right: 20, background: 'rgba(0,0,0,0.1)',
                border: 'none', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                fontSize: 20, fontWeight: 700, color: '#5c5400', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              ×
            </button>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 800, background: '#5c5400', color: '#fff9b1', padding: '3px 10px', borderRadius: 8 }}>
                  REGISTRO COMPLETO DA AULA
                </span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                  {selectedLogModal.school} {selectedLogModal.className}
                </span>
              </div>

              <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 6px 0', fontFamily: "'Fraunces', Georgia, serif" }}>
                {selectedLogModal.topic}
              </h2>

              <p style={{ fontSize: 13, margin: 0, opacity: 0.9 }}>
                <strong>{selectedLogModal.dayOfWeek}, {new Date(selectedLogModal.date + 'T00:00:00').toLocaleDateString('pt-BR')}</strong> ({selectedLogModal.quarter} / {selectedLogModal.semester}) · Habilidade: <strong>{selectedLogModal.focusSkill}</strong>
              </p>
            </div>

            <hr style={{ border: 'none', borderTop: '2px dashed #e6df7b', margin: 0 }} />

            <div style={{ background: 'rgba(255,255,255,0.6)', padding: 18, borderRadius: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 10px 0', textTransform: 'uppercase' }}>
                Sequência Didática Aplicada
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                <div><strong>1. Warm-up:</strong> {selectedLogModal.warmup || 'N/A'}</div>
                <div><strong>2. Apresentação:</strong> {selectedLogModal.presentation || 'N/A'}</div>
                <div><strong>3. Prática:</strong> {selectedLogModal.practice || 'N/A'}</div>
                <div><strong>4. Wrap-up / CCQs:</strong> {selectedLogModal.wrapup || 'N/A'}</div>
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.6)', padding: 18, borderRadius: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 10px 0', textTransform: 'uppercase' }}>
                Auto-Avaliação & Reflexão Pós-Aula
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                <div style={{ color: '#235e00' }}><strong>✅ O que deu certo:</strong><br />{selectedLogModal.whatWorked || 'N/A'}</div>
                <div style={{ color: '#6b3f00' }}><strong>⚠️ O que pode melhorar:</strong><br />{selectedLogModal.whatCanImprove || 'N/A'}</div>
                <div style={{ color: '#8c1d1d' }}><strong>❌ O que faltou:</strong><br />{selectedLogModal.whatWasMissing || 'N/A'}</div>
                <div style={{ color: '#0e4f5f' }}><strong>🔄 Precisar revisar na próxima:</strong><br />{selectedLogModal.needsReviewNextClass || 'N/A'}</div>
              </div>
            </div>

            {(selectedLogModal.groupObservations || selectedLogModal.studentNotes) && (
              <div style={{ background: 'rgba(255,255,255,0.6)', padding: 18, borderRadius: 16, fontSize: 13 }}>
                <h4 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 8px 0', textTransform: 'uppercase' }}>
                  Comportamento, Grupos & Alunos
                </h4>
                {selectedLogModal.groupObservations && <div><strong>👥 Grupos/Comportamento:</strong> {selectedLogModal.groupObservations} ({selectedLogModal.spaceUsed})</div>}
                {selectedLogModal.studentNotes && <div style={{ marginTop: 6 }}><strong>⭐ Destaques/Alunos:</strong> {selectedLogModal.studentNotes}</div>}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
              <button
                onClick={async () => {
                  const targetPortal = selectedLogModal.school.toLowerCase().includes('santa') ? 'santacatarina' : (selectedLogModal.school.toLowerCase().includes('machado') ? 'machado' : 'plural')
                  const portalName = selectedLogModal.school || 'Machado Sobrinho'
                  
                  const diff: DiffItem[] = [
                    { studentName: 'Diário de Classe', field: 'Tema / Assunto da Aula', beforeValue: '', afterValue: selectedLogModal.topic, approved: true },
                    { studentName: 'Diário de Classe', field: 'Data da Aula', beforeValue: '', afterValue: selectedLogModal.date, approved: true },
                    { studentName: 'Diário de Classe', field: 'Turma', beforeValue: '', afterValue: selectedLogModal.className, approved: true },
                    { studentName: 'Diário de Classe', field: 'Habilidade Foco (BNCC/ELT)', beforeValue: '', afterValue: selectedLogModal.focusSkill, approved: true },
                    { studentName: 'Diário de Classe', field: 'Sequência Didática', beforeValue: '', afterValue: `Warm-up: ${selectedLogModal.warmup || 'N/A'}\nApresentação: ${selectedLogModal.presentation || 'N/A'}\nPrática: ${selectedLogModal.practice || 'N/A'}\nWrap-up: ${selectedLogModal.wrapup || 'N/A'}`, approved: true },
                    { studentName: 'Diário de Classe', field: 'Recursos Utilizados', beforeValue: '', afterValue: selectedLogModal.resources || 'Padrão', approved: true }
                  ]

                  const cleanPayload = sanitizeOutboundPayload({
                    platform: targetPortal,
                    actionType: 'diary',
                    title: `Lançar Diário — ${selectedLogModal.topic}`,
                    date: selectedLogModal.date,
                    classRef: selectedLogModal.className,
                    description: `Diário: ${selectedLogModal.topic}`,
                    mode: 'supervised',
                    diff
                  })

                  const createdTask = await createBrowserTask({
                    portal: targetPortal,
                    actionType: 'diary',
                    payload: cleanPayload,
                    approvalMode: 'batch',
                    classRef: selectedLogModal.className,
                    studentCount: 1
                  })

                  logPortalFill({
                    platform: targetPortal,
                    platformName: portalName,
                    actionType: 'diary',
                    title: selectedLogModal.topic,
                    date: selectedLogModal.date,
                    classRef: selectedLogModal.className
                  } as any)

                  setSelectedLogModal(null)
                  setActiveTask(createdTask)
                }}
                style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#16a34a', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                ⚡ Espelhar Diário no Portal Oficial
              </button>
              <button
                onClick={() => window.print()}
                style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#5c5400', color: '#fff9b1', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <i className="ti ti-printer" /> Imprimir Registro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DE APROVAÇÃO & DIFF (AUTOMATION DIFF MODAL) ─────────────── */}
      {activeTask && (
        <AutomationDiffModal
          task={activeTask}
          onClose={() => setActiveTask(null)}
          onCompleted={(res) => {
            setActiveTask(null)
            toast.success(`Diário de aula publicado no portal oficial!`)
          }}
        />
      )}
    </div>
  )
}