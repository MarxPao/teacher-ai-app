'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import { toast, showConfirm } from '@/components/Toast'

import { useState, useEffect, useMemo, useRef } from 'react'
import { buildTeacherStyleSystemPrompt } from '@/lib/teacherStyleProfile'


export interface SequenceUnit {
  id: string
  unitNumber: number
  title: string
  bookRef: string
  topics: string[]
  grammarFocus: string
  vocabularyFocus: string
  status: 'completed' | 'current' | 'upcoming'
  masteryPercentage: number // 0 a 100% de domínio da turma
  aiAssessment: string
  suggestedAction: string
  // Timeline fields (Previsto vs Realizado)
  plannedMonthStart: string
  plannedMonthEnd: string
  plannedWeekStart?: number // 1 a 44
  plannedWeekEnd?: number   // 1 a 44
  plannedQuarter?: string   // 'T1', 'T2', 'T3', 'T4'
  plannedLessons: number
  actualMonthStart?: string
  actualMonthEnd?: string
  actualWeekStart?: number
  actualWeekEnd?: number
  actualQuarter?: string
  actualLessonsGiven?: number
  completionStatus?: 'completed' | 'in_progress' | 'delayed' | 'pending'
  delayDays?: number // dias de desvio (negativo = atrasado, positivo = adiantado)
}

export type TimeScale = 'week' | 'month' | 'quarter' | 'year'

const MONTHS_LIST = [
  { key: 'Fev', label: 'Fevereiro', index: 1, weeks: [1, 2, 3, 4], quarter: 'T1' },
  { key: 'Mar', label: 'Março', index: 2, weeks: [5, 6, 7, 8], quarter: 'T1' },
  { key: 'Abr', label: 'Abril', index: 3, weeks: [9, 10, 11, 12], quarter: 'T1' },
  { key: 'Mai', label: 'Maio', index: 4, weeks: [13, 14, 15, 16], quarter: 'T1' },
  { key: 'Jun', label: 'Junho', index: 5, weeks: [17, 18, 19, 20], quarter: 'T2' },
  { key: 'Jul', label: 'Julho', index: 6, weeks: [21, 22, 23, 24], quarter: 'T2' },
  { key: 'Ago', label: 'Agosto', index: 7, weeks: [25, 26, 27, 28], quarter: 'T2' },
  { key: 'Set', label: 'Setembro', index: 8, weeks: [29, 30, 31, 32], quarter: 'T3' },
  { key: 'Out', label: 'Outubro', index: 9, weeks: [33, 34, 35, 36], quarter: 'T3' },
  { key: 'Nov', label: 'Novembro', index: 10, weeks: [37, 38, 39, 40], quarter: 'T3' },
  { key: 'Dez', label: 'Dezembro', index: 11, weeks: [41, 42, 43, 44], quarter: 'T3' },
]

const QUARTERS_LIST = [
  { key: 'T1', label: '1º Trimestre (Fev - Mai)', months: ['Fev', 'Mar', 'Abr', 'Mai'], span: 4 },
  { key: 'T2', label: '2º Trimestre (Jun - Ago)', months: ['Jun', 'Jul', 'Ago'], span: 3 },
  { key: 'T3', label: '3º Trimestre (Set - Dez)', months: ['Set', 'Out', 'Nov', 'Dez'], span: 4 },
]

// All 44 school weeks for the week scale
const WEEKS_LIST = Array.from({ length: 44 }, (_, i) => {
  const weekNum = i + 1
  const parentMonth = MONTHS_LIST.find(m => m.weeks.includes(weekNum))
  return {
    weekNum,
    label: `Sem ${weekNum}`,
    monthKey: parentMonth?.key || 'Fev',
    monthLabel: parentMonth?.label || 'Fevereiro',
  }
})

const INITIAL_UNITS: SequenceUnit[] = [
  {
    id: 'unit_1',
    unitNumber: 1,
    title: 'Unit 1: Break the Ice — Personal & Social Life',
    bookRef: 'Evolve 3 Students Book (pág. 2 a 14)',
    topics: ['Greetings & Icebreakers', 'Describing Personalities', 'Free Time Activities'],
    grammarFocus: 'Simple Present vs. Present Continuous',
    vocabularyFocus: 'Adjectives of Personality & Hobbies',
    status: 'completed',
    masteryPercentage: 92,
    aiAssessment: 'Turma demonstrou excelente fluência inicial e alto engajamento em pares.',
    suggestedAction: 'Conteúdo consolidado com sucesso no prazo previsto.',
    plannedMonthStart: 'Fev',
    plannedMonthEnd: 'Fev',
    plannedWeekStart: 1,
    plannedWeekEnd: 4,
    plannedQuarter: 'T1',
    plannedLessons: 8,
    actualMonthStart: 'Fev',
    actualMonthEnd: 'Fev',
    actualWeekStart: 1,
    actualWeekEnd: 4,
    actualQuarter: 'T1',
    actualLessonsGiven: 8,
    completionStatus: 'completed',
    delayDays: 0,
  },
  {
    id: 'unit_2',
    unitNumber: 2,
    title: 'Unit 2: Memories & Life Stories',
    bookRef: 'Evolve 3 Students Book (pág. 16 a 28)',
    topics: ['Childhood Memories', 'Biography & Historical Events'],
    grammarFocus: 'Simple Past (Regular & Irregular Verbs) & Used to',
    vocabularyFocus: 'Time Expressions & Life Milestones',
    status: 'completed',
    masteryPercentage: 84,
    aiAssessment: 'Bom domínio geral. Pequena hesitação apenas com verbos irregulares de baixa frequência.',
    suggestedAction: 'Reforçar listas de verbos em aquecimentos rápidos de 5 minutos.',
    plannedMonthStart: 'Mar',
    plannedMonthEnd: 'Mar',
    plannedWeekStart: 5,
    plannedWeekEnd: 8,
    plannedQuarter: 'T1',
    plannedLessons: 8,
    actualMonthStart: 'Mar',
    actualMonthEnd: 'Mar',
    actualWeekStart: 5,
    actualWeekEnd: 9,
    actualQuarter: 'T1',
    actualLessonsGiven: 9,
    completionStatus: 'completed',
    delayDays: -3,
  },
  {
    id: 'unit_3',
    unitNumber: 3,
    title: 'Unit 3: Life Experiences & Travel',
    bookRef: 'Evolve 3 Students Book (pág. 30 a 44)',
    topics: ['Travel Stories', 'Bucket Lists & Unforgettable Trips'],
    grammarFocus: 'Present Perfect with Ever / Never / Already / Yet',
    vocabularyFocus: 'Travel Vocabulary & Extreme Sports',
    status: 'completed',
    masteryPercentage: 78,
    aiAssessment: 'Compreensão sólida do conceito, porém demandou 2 aulas extras para fixação do particípio.',
    suggestedAction: 'Aplicado quiz interativo para consolidar antes do fechamento.',
    plannedMonthStart: 'Abr',
    plannedMonthEnd: 'Mai',
    plannedWeekStart: 9,
    plannedWeekEnd: 15,
    plannedQuarter: 'T1',
    plannedLessons: 10,
    actualMonthStart: 'Abr',
    actualMonthEnd: 'Jun',
    actualWeekStart: 9,
    actualWeekEnd: 18,
    actualQuarter: 'T1',
    actualLessonsGiven: 12,
    completionStatus: 'completed',
    delayDays: -8,
  },
  {
    id: 'unit_4',
    unitNumber: 4,
    title: 'Unit 4: Narratives & Unfinished Actions',
    bookRef: 'Evolve 3 Students Book (pág. 46 a 58)',
    topics: ['Storytelling', 'Accidents & Interrupted Past Events'],
    grammarFocus: 'Present Perfect Continuous vs. Present Perfect Simple & Past Continuous',
    vocabularyFocus: 'Adverbs of Degree & Connectors',
    status: 'current',
    masteryPercentage: 62,
    aiAssessment: 'ALERTA DE CONTEÚDO: 38% da turma está com dificuldade na diferença entre Ação Contínua e Concluída.',
    suggestedAction: 'Recomendação da Rafinha: Inserir mais 1 aula de prática guiada antes de avançar para a Unit 5.',
    plannedMonthStart: 'Jun',
    plannedMonthEnd: 'Ago',
    plannedWeekStart: 16,
    plannedWeekEnd: 26,
    plannedQuarter: 'T2',
    plannedLessons: 8,
    actualMonthStart: 'Jun',
    actualMonthEnd: 'Ago',
    actualWeekStart: 19,
    actualWeekEnd: 28,
    actualQuarter: 'T2',
    actualLessonsGiven: 7,
    completionStatus: 'in_progress',
    delayDays: -6,
  },
  {
    id: 'unit_5',
    unitNumber: 5,
    title: 'Unit 5: Future Horizons & Environmental Tech',
    bookRef: 'Evolve 3 Students Book (pág. 60 a 74)',
    topics: ['Climate Change', 'Future Predictions & Inventions'],
    grammarFocus: 'Future Forms (Will, Going to, Present Continuous for Future)',
    vocabularyFocus: 'Environment & Sustainability',
    status: 'upcoming',
    masteryPercentage: 0,
    aiAssessment: 'Próxima unidade prevista no planejamento anual.',
    suggestedAction: 'Preparar slides de aquecimento sobre tecnologias verdes.',
    plannedMonthStart: 'Ago',
    plannedMonthEnd: 'Set',
    plannedWeekStart: 27,
    plannedWeekEnd: 34,
    plannedQuarter: 'T2',
    plannedLessons: 8,
    actualMonthStart: 'Set',
    actualMonthEnd: 'Out',
    actualWeekStart: 29,
    actualWeekEnd: 36,
    actualQuarter: 'T3',
    actualLessonsGiven: 0,
    completionStatus: 'pending',
    delayDays: -7,
  },
  {
    id: 'unit_6',
    unitNumber: 6,
    title: 'Unit 6: Hypothetical Worlds & Choices',
    bookRef: 'Evolve 3 Students Book (pág. 76 a 90)',
    topics: ['Dilemmas & Decisions', 'If I Were You... Advice'],
    grammarFocus: 'First & Second Conditionals',
    vocabularyFocus: 'Collocations with Make/Do & Dilemmas',
    status: 'upcoming',
    masteryPercentage: 0,
    aiAssessment: 'Unidade prevista para o 3º Trimestre / Fechamento do Ano.',
    suggestedAction: 'Planejado para o próximo ciclo.',
    plannedMonthStart: 'Out',
    plannedMonthEnd: 'Nov',
    plannedWeekStart: 35,
    plannedWeekEnd: 42,
    plannedQuarter: 'T3',
    plannedLessons: 8,
    actualMonthStart: 'Out',
    actualMonthEnd: 'Nov',
    actualWeekStart: 37,
    actualWeekEnd: 43,
    actualQuarter: 'T3',
    actualLessonsGiven: 0,
    completionStatus: 'pending',
    delayDays: 0,
  },
]

export default function DidacticSequence() {
  const [activeTab, setActiveTab] = useState<'timeline' | 'units' | 'analytics'>('timeline')
  const [timeScale, setTimeScale] = useState<TimeScale>('month')
  const [units, setUnits] = useState<SequenceUnit[]>(INITIAL_UNITS)
  const [schools, setSchools] = useState<string[]>(['Machado Sobrinho', 'Rede Santa Catarina', 'Anglo', 'Colegio Oxford'])
  const [classes, setClasses] = useState<string[]>(['9º Ano B', '8º Ano A', '3º Médio A', '7º Ano C'])

  const [selectedSchool, setSelectedSchool] = useState('Machado Sobrinho')
  const [selectedClass, setSelectedClass] = useState('9º Ano B')
  const [selectedYear, setSelectedYear] = useState('2026')

  const [selectedUnit, setSelectedUnit] = useState<SequenceUnit | null>(null)
  const [analyzingAi, setAnalyzingAi] = useState(false)
  const [aiReport, setAiReport] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Edit / Add Modal State
  const [editModalUnit, setEditModalUnit] = useState<SequenceUnit | null>(null)
  const [isAddingNewUnit, setIsAddingNewUnit] = useState(false)

  // Scroll Container Ref for Lateral Infinite Scroll
  const timelineScrollRef = useRef<HTMLDivElement>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  // Load from Storage
  useEffect(() => {
    let currentUnits = INITIAL_UNITS
    const rawUnits = localStorage.getItem('teacher_didactic_sequence_units_v3')
    if (rawUnits) {
      try { currentUnits = JSON.parse(rawUnits) } catch {}
    } else {
      const oldUnits = localStorage.getItem('teacher_didactic_sequence_units_v2')
      if (oldUnits) {
        try {
          const parsed = JSON.parse(oldUnits)
          currentUnits = currentUnits.map((u, i) => ({
            ...u,
            ...(parsed[i] || {})
          }))
        } catch {}
      }
    }

    setUnits(currentUnits)
    localStorage.setItem('teacher_didactic_sequence_units_v3', JSON.stringify(currentUnits))

    try {
      const rawCl = localStorage.getItem('teacher_classes')
      const rawSc = localStorage.getItem('teacher_schools')
      const rawPriv = localStorage.getItem('teacher_private_students')
      if (rawSc) setSchools(['Todas as Escolas', ...JSON.parse(rawSc).map((s: any) => s.name)])
      let clList: string[] = ['9º Ano B', '8º Ano A', '3º Médio A', '7º Ano C']
      if (rawCl) clList = JSON.parse(rawCl).map((c: any) => c.name)
      if (rawPriv) {
        const privs = JSON.parse(rawPriv)
        const privNames = privs.map((p: any) => `🎓 Particular: ${p.name}`)
        clList = [...clList, ...privNames]
      }
      setClasses(clList)
    } catch {}
  }, [])

  const saveUnits = (updated: SequenceUnit[]) => {
    setUnits(updated)
    localStorage.setItem('teacher_didactic_sequence_units_v3', JSON.stringify(updated))
    window.dispatchEvent(new Event('storage'))
  }

  // Smooth Horizontal Scroll Handlers
  const scrollTimeline = (direction: 'left' | 'right') => {
    if (timelineScrollRef.current) {
      const offset = direction === 'left' ? -350 : 350
      timelineScrollRef.current.scrollBy({ left: offset, behavior: 'smooth' })
    }
  }

  const scrollToCurrentMonth = () => {
    if (timelineScrollRef.current) {
      const totalWidth = timelineScrollRef.current.scrollWidth
      // Agosto é aprox 60% do calendário
      const targetPos = totalWidth * 0.55 - timelineScrollRef.current.clientWidth / 2
      timelineScrollRef.current.scrollTo({ left: Math.max(0, targetPos), behavior: 'smooth' })
    }
  }

  // Progresso do Currículo Anual (%)
  const completedCount = units.filter(u => u.status === 'completed').length
  const currentUnit = units.find(u => u.status === 'current')
  const curriculumProgressPct = Math.round(((completedCount + (currentUnit ? 0.5 : 0)) / units.length) * 100)

  // Média de Domínio Geral da Turma (%)
  const averageMastery = Math.round(
    units.filter(u => u.status === 'completed' || u.status === 'current')
      .reduce((acc, u) => acc + u.masteryPercentage, 0) / (completedCount + (currentUnit ? 1 : 0) || 1)
  )

  // Cálculos da Timeline (Previsto vs Realizado)
  const timelineStats = useMemo(() => {
    const totalPlannedLessons = units.reduce((acc, u) => acc + u.plannedLessons, 0)
    const totalActualLessonsGiven = units.reduce((acc, u) => acc + (u.actualLessonsGiven || 0), 0)
    const totalDelayDays = units.reduce((acc, u) => acc + (u.delayDays || 0), 0)
    const delayWeeks = Math.abs(Math.round((totalDelayDays / 5) * 10) / 10)
    const isDelayed = totalDelayDays < -2
    const isAhead = totalDelayDays > 2

    const paceStatus = isDelayed 
      ? `Atraso de ~${delayWeeks} semanas`
      : isAhead 
        ? `Adiantado em ~${delayWeeks} semanas`
        : 'Cronograma 100% em Dia'

    const paceColor = isDelayed ? '#cb4b16' : isAhead ? '#268bd2' : '#859900'
    const adherenceRate = Math.max(10, Math.min(100, Math.round(100 - (Math.abs(totalDelayDays) * 2.2))))

    return {
      totalPlannedLessons,
      totalActualLessonsGiven,
      totalDelayDays,
      delayWeeks,
      paceStatus,
      paceColor,
      adherenceRate,
    }
  }, [units])

  const handleSetCurrentUnit = (id: string) => {
    const updated = units.map(u => {
      if (u.id === id) return { ...u, status: 'current' as const, completionStatus: 'in_progress' as const }
      if (u.unitNumber < units.find(x => x.id === id)!.unitNumber) return { ...u, status: 'completed' as const, completionStatus: 'completed' as const }
      return { ...u, status: 'upcoming' as const, completionStatus: 'pending' as const }
    })
    saveUnits(updated)
    showToast('Unidade atual da turma atualizada!')
  }

  const handleOpenAddModal = () => {
    setIsAddingNewUnit(true)
    const nextNum = units.length + 1
    const newUnit: SequenceUnit = {
      id: `unit_${Date.now()}`,
      unitNumber: nextNum,
      title: `Unit ${nextNum}: Novo Conteúdo Curricular`,
      bookRef: 'Livro Didático / Material Próprio',
      topics: ['Tópico 1', 'Tópico 2'],
      grammarFocus: 'Estrutura Gramatical Principal',
      vocabularyFocus: 'Vocabulário Chave',
      status: 'upcoming',
      masteryPercentage: 0,
      aiAssessment: 'Nova unidade adicionada ao cronograma.',
      suggestedAction: 'Planejar atividades iniciais.',
      plannedMonthStart: 'Set',
      plannedMonthEnd: 'Out',
      plannedWeekStart: 30,
      plannedWeekEnd: 36,
      plannedQuarter: 'T3',
      plannedLessons: 8,
      actualMonthStart: 'Set',
      actualMonthEnd: 'Out',
      actualWeekStart: 30,
      actualWeekEnd: 36,
      actualQuarter: 'T3',
      actualLessonsGiven: 0,
      completionStatus: 'pending',
      delayDays: 0,
    }
    setEditModalUnit(newUnit)
  }

  const handleSaveUnitEdit = () => {
    if (!editModalUnit) return
    if (isAddingNewUnit) {
      saveUnits([...units, editModalUnit])
      showToast(`Nova unidade "${editModalUnit.title}" adicionada ao cronograma!`)
    } else {
      const updated = units.map(u => u.id === editModalUnit.id ? editModalUnit : u)
      saveUnits(updated)
      showToast(`Unidade "${editModalUnit.title}" atualizada com sucesso!`)
    }
    setEditModalUnit(null)
    setIsAddingNewUnit(false)
  }

  const handleDeleteUnit = async (id: string) => {
    if (!(await showConfirm({ message: 'Deseja excluir esta unidade do cronograma?' }))) return
    const updated = units.filter(u => u.id !== id)
    saveUnits(updated)
    showToast('Unidade removida da timeline.')
    setEditModalUnit(null)
  }

  const handleRunRafinhaCrossing = async () => {
    setAnalyzingAi(true)
    setAiReport(null)
    try {
      const prompt = `Atue como a Rafinha, assistente de IA especialista em engenharia pedagógica e gestão de cronograma curricular ELT.
Analise a Linha do Tempo Comparativa da turma ${selectedClass} (${selectedSchool}) no ano ${selectedYear} na escala ${timeScale.toUpperCase()}:

DADOS DE CRONOGRAMA:
- Unidade Atual: ${currentUnit?.title || 'Unit 4'}
- Progresso Geral: ${curriculumProgressPct}% do livro coberto
- Aulas Previstas até agora vs Aulas Dadas: ${timelineStats.totalActualLessonsGiven} aulas dadas
- Desvio de Ritmo: ${timelineStats.paceStatus} (Aderência: ${timelineStats.adherenceRate}%)
- Domínio Médio da Turma: ${averageMastery}%

DETALHE POR UNIDADE:
${units.map(u => `- ${u.title}: Previsto (${u.plannedMonthStart}-${u.plannedMonthEnd}, ${u.plannedLessons} aulas, Semanas ${u.plannedWeekStart || 1}-${u.plannedWeekEnd || 4}) | Real (${u.actualMonthStart || '-'}-${u.actualMonthEnd || '-'}, ${u.actualLessonsGiven || 0} aulas) | Domínio: ${u.masteryPercentage}% | Status: ${u.status}`).join('\n')}

Gere um diagnóstico estruturado com:
1. Análise comparativa entre o Conteúdo Programático Previsto vs. o Conteúdo Realmente Ministrado.
2. Identificação precisa de onde ocorreu o gargalo temporal (ex: por que atrasou na Unit 3 ou 4).
3. Três recomendações táticas práticas para o professor recuperar o cronograma sem sacrificar o domínio e a fluência dos alunos.

${buildTeacherStyleSystemPrompt()}`


      const r = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
      })
      const d = await r.json()
      setAiReport(d.response || d.text || d.reply || 'Diagnóstico de cronograma concluído com sucesso.')
      showToast('Diagnóstico da Rafinha IA gerado com sucesso!')
    } catch (e: any) {
      setAiReport(`Erro na análise de cronograma: ${e.message}`)
    } finally {
      setAnalyzingAi(false)
    }
  }

  // Dynamic Column Count and Headers based on selected TimeScale
  const scaleConfig = useMemo(() => {
    switch (timeScale) {
      case 'week':
        return {
          totalCols: WEEKS_LIST.length,
          minWidth: 2800,
          colWidth: 62,
          headers: WEEKS_LIST.map(w => ({ key: String(w.weekNum), label: w.label, sublabel: w.monthKey, isCurrent: w.weekNum >= 25 && w.weekNum <= 28 })),
        }
      case 'quarter':
        return {
          totalCols: QUARTERS_LIST.length,
          minWidth: 1000,
          colWidth: 320,
          headers: QUARTERS_LIST.map(q => ({ key: q.key, label: q.label, sublabel: q.months.join(' · '), isCurrent: q.key === 'T2' })),
        }
      case 'year':
        return {
          totalCols: 2,
          minWidth: 900,
          colWidth: 440,
          headers: [
            { key: 'S1', label: '1º Semestre (Fev - Jun)', sublabel: 'Units 1, 2, 3', isCurrent: false },
            { key: 'S2', label: '2º Semestre (Jul - Dez)', sublabel: 'Units 4, 5, 6', isCurrent: true },
          ],
        }
      case 'month':
      default:
        return {
          totalCols: MONTHS_LIST.length,
          minWidth: 1350,
          colWidth: 115,
          headers: MONTHS_LIST.map(m => ({ key: m.key, label: m.label, sublabel: m.key, isCurrent: m.key === 'Ago' })),
        }
    }
  }, [timeScale])

  // Helper to compute CSS Grid column placement for each unit under the active scale
  const getUnitPlacement = (u: SequenceUnit, isActual = false) => {
    if (timeScale === 'week') {
      const start = isActual ? (u.actualWeekStart || u.plannedWeekStart || 1) : (u.plannedWeekStart || 1)
      const end = isActual ? (u.actualWeekEnd || u.plannedWeekEnd || 4) : (u.plannedWeekEnd || 4)
      const colStart = Math.max(1, Math.min(44, start))
      const span = Math.max(1, Math.min(44 - colStart + 1, end - start + 1))
      return { colStart, span }
    }

    if (timeScale === 'quarter') {
      const qKey = isActual ? (u.actualQuarter || u.plannedQuarter || 'T1') : (u.plannedQuarter || 'T1')
      const idx = QUARTERS_LIST.findIndex(q => q.key === qKey)
      return { colStart: idx !== -1 ? idx + 1 : 1, span: 1 }
    }

    if (timeScale === 'year') {
      const monthStart = isActual ? (u.actualMonthStart || u.plannedMonthStart) : u.plannedMonthStart
      const isS2 = ['Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'].includes(monthStart)
      return { colStart: isS2 ? 2 : 1, span: 1 }
    }

    // Default: Month scale
    const startMonth = isActual ? (u.actualMonthStart || u.plannedMonthStart) : u.plannedMonthStart
    const endMonth = isActual ? (u.actualMonthEnd || u.plannedMonthEnd) : u.plannedMonthEnd
    const startIdx = MONTHS_LIST.findIndex(m => m.key === startMonth)
    const endIdx = MONTHS_LIST.findIndex(m => m.key === endMonth)
    const colStart = startIdx !== -1 ? startIdx + 1 : 1
    const span = Math.max(1, (endIdx !== -1 ? endIdx : startIdx) - colStart + 1)
    return { colStart, span }
  }

  return (
    <div style={{ padding: '32px 48px', minHeight: '100%', boxSizing: 'border-box', background: '#fdf8f2', color: '#2c1a0e', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: '#8b5e3c', color: '#fff', padding: '12px 20px', borderRadius: RADIUS.md,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: 8,
          fontSize: TEXT.body, fontWeight: 600
        }}>
          <i className="ti ti-circle-check" /> {toastMessage}
        </div>
      )}

      {/* Header do Módulo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20, marginBottom: 24, borderBottom: '1px solid rgba(139,115,85,0.14)', paddingBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 30, fontWeight: 700, color: '#2c1a0e', margin: 0 }}>
              Sequência Didática & Timeline Curricular
            </h1>
            <span style={{ background: '#2c1a0e', color: '#b58900', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, textTransform: 'uppercase' }}>
              Previsto vs. Realizado
            </span>
          </div>
          <p style={{ color: '#7a5c42', fontSize: 14, margin: '6px 0 0' }}>
            Acompanhamento longitudinal de ementa com visão escalonável por Semana, Mês, Trimestre e Ano.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleOpenAddModal}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px',
              borderRadius: RADIUS.md, border: 'none', background: '#2c1a0e', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(44,26,14,0.2)'
            }}
          >
            <i className="ti ti-plus" /> Adicionar Unidade / Marco
          </button>

          <button
            onClick={handleRunRafinhaCrossing}
            disabled={analyzingAi}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px',
              borderRadius: RADIUS.md, border: 'none', background: '#8b5e3c', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: analyzingAi ? 'wait' : 'pointer',
              boxShadow: '0 2px 8px rgba(139,94,60,0.25)',
            }}
          >
            <i className={analyzingAi ? 'ti ti-loader ti-spin' : 'ti ti-sparkles'} />
            {analyzingAi ? 'Cruzando com IA...' : '✨ Cruzar com Rafinha IA'}
          </button>
        </div>
      </div>

      {/* Barra de Filtros de Contexto (Escola / Turma / Ano) */}
      <div style={{ background: '#fffcf8', padding: '16px 20px', borderRadius: RADIUS.xl, border: '1px solid rgba(139,115,85,0.14)', marginBottom: 24, boxShadow: '0 2px 8px rgba(44,26,14,0.04)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: 16, alignItems: 'center' }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Escola</label>
          <select value={selectedSchool} onChange={e => setSelectedSchool(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.22)', background: '#fff', fontSize: 13, color: '#2c1a0e', outline: 'none', fontWeight: 600 }}>
            {schools.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Turma</label>
          <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.22)', background: '#fff', fontSize: 13, color: '#2c1a0e', outline: 'none', fontWeight: 600 }}>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Ano Letivo</label>
          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.22)', background: '#fff', fontSize: 13, color: '#2c1a0e', outline: 'none', fontWeight: 600 }}>
            <option>2026</option>
            <option>2025</option>
          </select>
        </div>

        {/* Resumo Rápido de Ritmo */}
        <div style={{ background: '#f5efe6', padding: '10px 16px', borderRadius: RADIUS.lg, display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: 10.5, color: '#7a5c42', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Ritmo de Aulas</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: timelineStats.paceColor }}>{timelineStats.paceStatus}</span>
          </div>
          <div style={{ width: 1, height: 26, background: 'rgba(139,115,85,0.2)' }} />
          <div>
            <span style={{ fontSize: 10.5, color: '#7a5c42', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Domínio Médio</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: averageMastery >= 75 ? '#3d7a4e' : '#cb4b16' }}>{averageMastery}% de Acerto</span>
          </div>
        </div>
      </div>

      {/* Sub-abas de Navegação */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, borderBottom: '2px solid #ede8dc', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { key: 'timeline', icon: 'ti-timeline', label: 'Timeline: Previsto vs. Realizado' },
            { key: 'units', icon: 'ti-list-tree', label: 'Sequência Curricular' },
            { key: 'analytics', icon: 'ti-chart-line', label: 'Diagnóstico & Desempenho' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as typeof activeTab)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px',
                borderRadius: '10px 10px 0 0', border: 'none', cursor: 'pointer',
                background: activeTab === t.key ? '#fff' : 'transparent',
                color: activeTab === t.key ? '#2c1a0e' : '#a08060',
                borderBottom: activeTab === t.key ? '2px solid #8b5e3c' : '2px solid transparent',
                marginBottom: -2, fontWeight: activeTab === t.key ? 700 : 500, fontSize: TEXT.body,
              }}
            >
              <i className={`ti ${t.icon}`} /> {t.label}
            </button>
          ))}
        </div>

        {/* Seletor de Escala Temporal (Semana / Mês / Trimestre / Ano) */}
        {activeTab === 'timeline' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f5efe6', padding: '4px 8px', borderRadius: RADIUS.lg }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', paddingLeft: 4 }}>
              Escala:
            </span>
            {[
              { key: 'week', label: 'Semana' },
              { key: 'month', label: 'Mês' },
              { key: 'quarter', label: 'Trimestre' },
              { key: 'year', label: 'Ano' },
            ].map(sc => (
              <button
                key={sc.key}
                onClick={() => setTimeScale(sc.key as TimeScale)}
                style={{
                  padding: '5px 12px', borderRadius: RADIUS.md, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700,
                  background: timeScale === sc.key ? '#8b5e3c' : 'transparent',
                  color: timeScale === sc.key ? '#fff' : '#7a5c42',
                  boxShadow: timeScale === sc.key ? '0 1px 4px rgba(139,94,60,0.2)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                {sc.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 1. ABA: TIMELINE (PREVISTO VS REALIZADO COM 2 LINHAS EM SETA E ROLAGEM INFINITA) */}
      {activeTab === 'timeline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* BOX SUPERIOR DE ANALYTICS & INTELIGÊNCIA DE CRONOGRAMA */}
          <div style={{
            background: '#fffcf8', border: '1px solid rgba(139,115,85,0.18)', borderRadius: RADIUS.xl,
            padding: '20px 24px', boxShadow: '0 4px 16px rgba(44,26,14,0.06)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: RADIUS.md, background: '#8b5e3c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  <i className="ti ti-chart-dots" />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#2c1a0e', margin: 0, fontFamily: "'Fraunces', Georgia, serif" }}>
                    Analytics de Aderência Curricular & Projeção Temporal
                  </h3>
                  <p style={{ fontSize: 12, color: '#7a5c42', margin: '2px 0 0' }}>
                    Cruzamento automático entre a ementa prevista no livro didático e o avanço real da turma {selectedClass} na escala <strong>{timeScale.toUpperCase()}</strong>.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                  background: `${timelineStats.paceColor}15`, color: timelineStats.paceColor,
                  border: `1px solid ${timelineStats.paceColor}30`
                }}>
                  {timelineStats.paceStatus}
                </span>
              </div>
            </div>

            {/* 4 Cards de Métricas de Ritmo */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#fdf8f2', borderRadius: RADIUS.lg, padding: '12px 16px', border: '1px solid rgba(139,115,85,0.12)' }}>
                <span style={{ fontSize: 11, color: '#7a5c42', textTransform: 'uppercase', fontWeight: 700 }}>Aderência ao Cronograma</span>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#2c1a0e', marginTop: 2 }}>{timelineStats.adherenceRate}%</div>
                <div style={{ fontSize: 11, color: '#a08060' }}>Conformidade com o plano anual</div>
              </div>

              <div style={{ background: '#fdf8f2', borderRadius: RADIUS.lg, padding: '12px 16px', border: '1px solid rgba(139,115,85,0.12)' }}>
                <span style={{ fontSize: 11, color: '#7a5c42', textTransform: 'uppercase', fontWeight: 700 }}>Aulas Ministradas</span>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#8b5e3c', marginTop: 2 }}>
                  {timelineStats.totalActualLessonsGiven} <span style={{ fontSize: 13, fontWeight: 500, color: '#a08060' }}>/ {timelineStats.totalPlannedLessons} previstas</span>
                </div>
                <div style={{ fontSize: 11, color: '#a08060' }}>{Math.round((timelineStats.totalActualLessonsGiven / timelineStats.totalPlannedLessons) * 100)}% da carga horária</div>
              </div>

              <div style={{ background: '#fdf8f2', borderRadius: RADIUS.lg, padding: '12px 16px', border: '1px solid rgba(139,115,85,0.12)' }}>
                <span style={{ fontSize: 11, color: '#7a5c42', textTransform: 'uppercase', fontWeight: 700 }}>Unidade em Andamento</span>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#cb4b16', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {currentUnit?.title.split(':')[0] || 'Unit 4'}
                </div>
                <div style={{ fontSize: 11, color: '#a08060' }}>{currentUnit?.masteryPercentage}% de retenção média</div>
              </div>

              <div style={{ background: '#fdf8f2', borderRadius: RADIUS.lg, padding: '12px 16px', border: '1px solid rgba(139,115,85,0.12)' }}>
                <span style={{ fontSize: 11, color: '#7a5c42', textTransform: 'uppercase', fontWeight: 700 }}>Previsão de Conclusão</span>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#3d7a4e', marginTop: 2 }}>28 de Novembro</div>
                <div style={{ fontSize: 11, color: '#a08060' }}>Dentro do calendário escolar</div>
              </div>
            </div>

            {/* Parecer / Alerta da Rafinha */}
            <div style={{ background: '#f5efe6', borderRadius: RADIUS.md, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, border: '1px solid rgba(139,115,85,0.14)' }}>
              <i className="ti ti-bulb" style={{ fontSize: 22, color: '#8b5e3c', flexShrink: 0 }} />
              <div style={{ fontSize: TEXT.bodyCompact, color: '#4a3728', lineHeight: 1.4 }}>
                <strong>Diagnóstico Pedagógico de Ritmo:</strong> A turma {selectedClass} precisou de 2 aulas adicionais de fixação na <strong>Unit 3</strong> (Present Perfect). O ritmo atual está 6 dias atrás do planejado, mas perfeitamente recuperável unificando as atividades de produção livre da Unit 5.
              </div>
            </div>
          </div>

          {/* DIAGRAMA VISUAL COM ROLAGEM INFINITA LATERAL E 2 LINHAS EM SETA */}
          <div style={{
            background: '#fffcf8', border: '1px solid rgba(139,115,85,0.18)', borderRadius: RADIUS.xl,
            padding: '24px', boxShadow: '0 4px 16px rgba(44,26,14,0.06)', position: 'relative'
          }}>
            {/* Controles de Rolagem Lateral */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e' }}>
                  <i className="ti ti-arrows-horizontal" style={{ marginRight: 6, color: '#8b5e3c' }} />
                  Linha do Tempo Visual ({scaleConfig.headers.length} períodos na escala {timeScale})
                </span>
                <span style={{ fontSize: 11, color: '#7a5c42' }}>
                  (Use o scroll lateral ou os botões de navegação)
                </span>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => scrollTimeline('left')}
                  style={{
                    padding: '6px 12px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.25)',
                    background: '#fff', color: '#7a5c42', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 4
                  }}
                  title="Rolar para a esquerda"
                >
                  <i className="ti ti-chevron-left" /> Anterior
                </button>
                <button
                  onClick={scrollToCurrentMonth}
                  style={{
                    padding: '6px 12px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.25)',
                    background: '#f5efe6', color: '#8b5e3c', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 4
                  }}
                  title="Centralizar no momento atual"
                >
                  📍 Centralizar em Hoje
                </button>
                <button
                  onClick={() => scrollTimeline('right')}
                  style={{
                    padding: '6px 12px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.25)',
                    background: '#fff', color: '#7a5c42', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 4
                  }}
                  title="Rolar para a direita"
                >
                  Próximo <i className="ti ti-chevron-right" />
                </button>
              </div>
            </div>

            {/* Container com Rolagem Lateral Fluida */}
            <div
              ref={timelineScrollRef}
              style={{
                overflowX: 'auto',
                overflowY: 'hidden',
                paddingBottom: 16,
                scrollbarWidth: 'thin',
                scrollbarColor: '#8b5e3c #f5efe6',
              }}
            >
              <div style={{ minWidth: scaleConfig.minWidth, padding: '10px 4px' }}>
                {/* 1. Eixo do Calendário Dinâmico (Semana / Mês / Trimestre / Ano) */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${scaleConfig.totalCols}, minmax(${scaleConfig.colWidth}px, 1fr))`,
                  borderBottom: '2px solid rgba(139,115,85,0.2)',
                  paddingBottom: 12,
                  marginBottom: 28,
                  gap: 4
                }}>
                  {scaleConfig.headers.map((h, i) => (
                    <div key={i} style={{ textAlign: 'center', position: 'relative' }}>
                      <div style={{
                        fontSize: timeScale === 'week' ? 10.5 : 12,
                        fontWeight: 700,
                        color: h.isCurrent ? '#8b5e3c' : '#7a5c42',
                        background: h.isCurrent ? '#f5efe6' : 'transparent',
                        padding: '4px 6px',
                        borderRadius: 6,
                        border: h.isCurrent ? '1px solid rgba(139,115,85,0.3)' : 'none',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {h.label}
                        {timeScale === 'week' && (
                          <div style={{ fontSize: 9, color: '#a08060', fontWeight: 500 }}>{h.sublabel}</div>
                        )}
                      </div>
                      {h.isCurrent && (
                        <div style={{ position: 'absolute', top: 32, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
                          <span style={{ background: '#8b5e3c', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                            📍 Hoje
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* 2. SETA SUPERIOR: CONTEÚDO PROGRAMÁTICO PREVISTO (EMENTA / PLANEJAMENTO) */}
                <div style={{ marginBottom: 36, position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: '50%', background: '#268bd2', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800
                    }}>
                      1
                    </span>
                    <strong style={{ fontSize: 13, color: '#2c1a0e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Seta 1: Conteúdo Programático Previsto (Cronograma Oficial)
                    </strong>
                    <span style={{ fontSize: 11, color: '#7a5c42' }}>— Planejamento da ementa distribuído na escala {timeScale}</span>
                  </div>

                  {/* Seta Visual Previsto */}
                  <div style={{
                    position: 'relative', height: 68, background: '#f0f6fa', borderRadius: '12px 0 0 12px',
                    border: '1px solid #c8e1f5', display: 'flex', alignItems: 'center', padding: '0 8px'
                  }}>
                    {/* Ponta da seta no final */}
                    <div style={{
                      position: 'absolute', right: -16, top: '50%', transform: 'translateY(-50%)',
                      width: 0, height: 0,
                      borderTop: '34px solid transparent',
                      borderBottom: '34px solid transparent',
                      borderLeft: '18px solid #f0f6fa',
                      zIndex: 2,
                    }} />

                    {/* Blocos de Unidades Previstas */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${scaleConfig.totalCols}, minmax(${scaleConfig.colWidth}px, 1fr))`,
                      width: '100%',
                      gap: 4
                    }}>
                      {units.map(u => {
                        const { colStart, span } = getUnitPlacement(u, false)

                        return (
                          <div
                            key={u.id}
                            onClick={() => { setIsAddingNewUnit(false); setEditModalUnit(u) }}
                            style={{
                              gridColumn: `${colStart} / span ${span}`,
                              background: '#268bd2', color: '#fff', borderRadius: RADIUS.md,
                              padding: '6px 10px', fontSize: 11, fontWeight: 700,
                              display: 'flex', flexDirection: 'column', justifyContent: 'center',
                              cursor: 'pointer', boxShadow: '0 2px 6px rgba(38,139,210,0.3)',
                              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                              transition: 'transform 0.15s',
                            }}
                            title={`Clique para editar: ${u.title} (${u.plannedLessons} aulas previstas)`}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>{u.title.split(':')[0]}</span>
                              <span style={{ fontSize: 9.5, opacity: 0.85 }}>{u.plannedLessons} aulas</span>
                            </div>
                            <div style={{ fontSize: 9.5, opacity: 0.9, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {u.title.split(':')[1]?.trim() || ''}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* 3. SETA INFERIOR: CONTEÚDO REALMENTE MINISTRADO (EXECUÇÃO REAL EM SALA) */}
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: '50%', background: '#8b5e3c', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800
                    }}>
                      2
                    </span>
                    <strong style={{ fontSize: 13, color: '#2c1a0e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Seta 2: Conteúdo Realmente Ministrado (Aulas Lecionadas)
                    </strong>
                    <span style={{ fontSize: 11, color: '#7a5c42' }}>— Registro real do que foi ministrado na turma</span>
                  </div>

                  {/* Seta Visual Realizado */}
                  <div style={{
                    position: 'relative', height: 68, background: '#fdf4ea', borderRadius: '12px 0 0 12px',
                    border: '1px solid rgba(139,94,60,0.25)', display: 'flex', alignItems: 'center', padding: '0 8px'
                  }}>
                    {/* Ponta da seta no final */}
                    <div style={{
                      position: 'absolute', right: -16, top: '50%', transform: 'translateY(-50%)',
                      width: 0, height: 0,
                      borderTop: '34px solid transparent',
                      borderBottom: '34px solid transparent',
                      borderLeft: '18px solid #fdf4ea',
                      zIndex: 2,
                    }} />

                    {/* Blocos de Unidades Realizadas */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${scaleConfig.totalCols}, minmax(${scaleConfig.colWidth}px, 1fr))`,
                      width: '100%',
                      gap: 4
                    }}>
                      {units.map(u => {
                        const { colStart, span } = getUnitPlacement(u, true)
                        const isCompleted = u.status === 'completed'
                        const isCurrent = u.status === 'current'
                        const bg = isCompleted ? '#3d7a4e' : isCurrent ? '#cb4b16' : '#dcd6ca'
                        const textColor = isCompleted || isCurrent ? '#fff' : '#7a5c42'

                        return (
                          <div
                            key={u.id}
                            onClick={() => { setIsAddingNewUnit(false); setEditModalUnit(u) }}
                            style={{
                              gridColumn: `${colStart} / span ${span}`,
                              background: bg, color: textColor, borderRadius: RADIUS.md,
                              padding: '6px 10px', fontSize: 11, fontWeight: 700,
                              display: 'flex', flexDirection: 'column', justifyContent: 'center',
                              cursor: 'pointer',
                              boxShadow: isCurrent ? '0 0 0 3px rgba(203,75,22,0.3)' : '0 2px 6px rgba(0,0,0,0.08)',
                              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                              border: isCurrent ? '1px solid #fff' : 'none',
                              transition: 'transform 0.15s',
                            }}
                            title={`Realizado: ${u.title} (${u.actualLessonsGiven || 0} aulas dadas, ${u.masteryPercentage}% domínio)`}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>{u.title.split(':')[0]} {isCurrent ? '⚡ (Atual)' : isCompleted ? '✓' : ''}</span>
                              <span style={{ fontSize: 9.5, opacity: 0.9 }}>
                                {u.actualLessonsGiven || 0} aulas
                              </span>
                            </div>
                            <div style={{ fontSize: 9.5, opacity: 0.95, fontWeight: 600 }}>
                              {isCompleted || isCurrent ? `Domínio: ${u.masteryPercentage}%` : 'Pendente'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Legenda Explicativa do Diagrama */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, fontSize: 12, color: '#7a5c42', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: '#268bd2' }} /> Previsto (Planejamento)
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: '#3d7a4e' }} /> Ministrado & Concluído
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: '#cb4b16' }} /> Em Andamento (Hoje)
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: '#dcd6ca' }} /> Próximos Conteúdos
                    </span>
                  </div>

                  <span>💡 Dica: Clique em qualquer bloco para editar períodos, aulas e domínio da turma.</span>
                </div>
              </div>
            </div>
          </div>

          {/* TABELA DETALHADA DE COMPARAÇÃO PREVISTO VS REAL (COM BOTÃO DE ADICIONAR E EDITAR) */}
          <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.18)', borderRadius: RADIUS.xl, padding: '20px 24px', boxShadow: '0 4px 16px rgba(44,26,14,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#2c1a0e', margin: 0, fontFamily: "'Fraunces', Georgia, serif" }}>
                Tabela de Detalhamento: Previsto vs. Executado
              </h3>
              <button
                onClick={handleOpenAddModal}
                style={{
                  padding: '6px 14px', borderRadius: RADIUS.md, border: 'none', background: '#8b5e3c', color: '#fff',
                  fontSize: TEXT.bodyCompact, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                <i className="ti ti-plus" /> Adicionar Linha / Unidade
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #ede8dc', color: '#7a5c42', fontSize: 11, textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 12px' }}>Unidade & Tópicos</th>
                    <th style={{ padding: '10px 12px' }}>Período Previsto</th>
                    <th style={{ padding: '10px 12px' }}>Aulas Prev.</th>
                    <th style={{ padding: '10px 12px' }}>Período Real</th>
                    <th style={{ padding: '10px 12px' }}>Aulas Dadas</th>
                    <th style={{ padding: '10px 12px' }}>Domínio Turma</th>
                    <th style={{ padding: '10px 12px' }}>Status</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map(u => {
                    const isCurrent = u.status === 'current'
                    const isCompleted = u.status === 'completed'

                    return (
                      <tr key={u.id} style={{ borderBottom: '1px solid #f5efe6', background: isCurrent ? '#fff9f0' : 'transparent' }}>
                        <td style={{ padding: '12px', fontWeight: 600, color: '#2c1a0e' }}>
                          <div>{u.title}</div>
                          <div style={{ fontSize: 11, color: '#a08060' }}>{u.grammarFocus}</div>
                        </td>
                        <td style={{ padding: '12px', color: '#268bd2', fontWeight: 600 }}>
                          {u.plannedMonthStart} → {u.plannedMonthEnd} (Sem {u.plannedWeekStart || 1}-{u.plannedWeekEnd || 4})
                        </td>
                        <td style={{ padding: '12px', color: '#7a5c42' }}>
                          {u.plannedLessons} aulas
                        </td>
                        <td style={{ padding: '12px', color: '#8b5e3c', fontWeight: 700 }}>
                          {u.actualMonthStart || '-'} → {u.actualMonthEnd || '-'} (Sem {u.actualWeekStart || '-'}-{u.actualWeekEnd || '-'})
                        </td>
                        <td style={{ padding: '12px', color: '#2c1a0e', fontWeight: 700 }}>
                          {u.actualLessonsGiven || 0} aulas
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            padding: '3px 8px', borderRadius: RADIUS.lg, fontSize: 11, fontWeight: 700,
                            background: u.masteryPercentage >= 75 ? '#e8f7ee' : u.masteryPercentage > 0 ? '#fdf4ea' : '#f5efe6',
                            color: u.masteryPercentage >= 75 ? '#2d7a00' : u.masteryPercentage > 0 ? '#cb4b16' : '#a08060'
                          }}>
                            {u.masteryPercentage}%
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>
                          {isCurrent ? (
                            <span style={{ background: '#cb4b16', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6 }}>
                              EM ANDAMENTO
                            </span>
                          ) : isCompleted ? (
                            <span style={{ background: '#3d7a4e', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6 }}>
                              CONCLUÍDO
                            </span>
                          ) : (
                            <span style={{ background: '#f0e8d8', color: '#7a5c42', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>
                              PENDENTE
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => { setIsAddingNewUnit(false); setEditModalUnit(u) }}
                              style={{ padding: '6px 10px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.25)', background: '#fff', fontSize: 12, fontWeight: 700, color: '#8b5e3c', cursor: 'pointer' }}
                            >
                              <i className="ti ti-pencil" />
                            </button>
                            <button
                              onClick={() => handleDeleteUnit(u.id)}
                              style={{ padding: '6px 10px', borderRadius: RADIUS.md, border: '1px solid rgba(220,50,47,0.25)', background: '#fff', fontSize: 12, fontWeight: 700, color: '#dc322f', cursor: 'pointer' }}
                            >
                              <i className="ti ti-trash" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. ABA: SEQUÊNCIA CURRICULAR VERTICAL (VISÃO POR UNIDADE) */}
      {activeTab === 'units' && (
        <div style={{ flex: 1, overflowY: 'auto', background: '#fffcf8', padding: 32, borderRadius: 20, border: '1px solid rgba(139,115,85,0.14)', boxShadow: '0 2px 10px rgba(44,26,14,0.04)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
            {/* Linha vertical central da timeline */}
            <div style={{ position: 'absolute', left: 40, top: 20, bottom: 40, width: 4, background: '#f0e8d8', zIndex: 1 }} />

            {units.map((unit) => {
              const isCurrent = unit.status === 'current'
              const isCompleted = unit.status === 'completed'

              return (
                <div
                  key={unit.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 24,
                    marginBottom: 32,
                    position: 'relative',
                    zIndex: 2,
                  }}
                >
                  {/* Nó/Ícone da Timeline */}
                  <div
                    onClick={() => handleSetCurrentUnit(unit.id)}
                    title="Clique para definir esta unidade como o conteúdo atual da matéria"
                    style={{
                      width: 48, height: 48, borderRadius: '50%',
                      background: isCurrent ? '#cb4b16' : isCompleted ? '#3d7a4e' : '#f0e8d8',
                      color: isCurrent || isCompleted ? '#fff' : '#a08060',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, fontWeight: 800, cursor: 'pointer',
                      boxShadow: isCurrent ? '0 0 0 6px rgba(203,75,22,0.2)' : 'none',
                      border: '3px solid #fff', transition: 'all 0.3s ease', flexShrink: 0
                    }}
                  >
                    {isCurrent ? <i className="ti ti-pin" /> : isCompleted ? <i className="ti ti-check" /> : unit.unitNumber}
                  </div>

                  {/* Conteúdo do Card da Timeline */}
                  <div
                    style={{
                      flex: 1, background: isCurrent ? '#fff9f0' : '#fff',
                      border: `2px solid ${isCurrent ? '#cb4b16' : isCompleted ? '#e8e0d0' : '#ede8dc'}`,
                      borderRadius: RADIUS.xl, padding: 22,
                      boxShadow: isCurrent ? '0 6px 20px rgba(203,75,22,0.1)' : '0 2px 8px rgba(44,26,14,0.03)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          {isCurrent && (
                            <span style={{ background: '#cb4b16', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              VOCÊ ESTÁ AQUI (Conteúdo Atual)
                            </span>
                          )}
                          {isCompleted && (
                            <span style={{ background: '#3d7a4e', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase' }}>
                              Concluído
                            </span>
                          )}
                          {!isCurrent && !isCompleted && (
                            <span style={{ background: '#f0e8d8', color: '#7a5c42', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase' }}>
                              Próxima Unidade
                            </span>
                          )}

                          <span style={{ fontSize: 12, fontWeight: 600, color: '#7a5c42' }}>
                            {unit.bookRef}
                          </span>
                        </div>

                        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#2c1a0e', margin: 0 }}>
                          {unit.title}
                        </h3>
                      </div>

                      {/* Indicador de Domínio da Turma */}
                      {(isCompleted || isCurrent) && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#7a5c42' }}>Domínio da Turma</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 100, height: 8, background: '#f0e8d8', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{ width: `${unit.masteryPercentage}%`, height: '100%', background: unit.masteryPercentage > 75 ? '#3d7a4e' : '#cb4b16', borderRadius: 4 }} />
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 800, color: unit.masteryPercentage > 75 ? '#3d7a4e' : '#cb4b16' }}>
                              {unit.masteryPercentage}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Tópicos e Foco Gramatical */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, margin: '12px 0', padding: 12, background: 'rgba(255,255,255,0.7)', borderRadius: RADIUS.lg, fontSize: 13 }}>
                      <div>
                        <strong style={{ color: '#2c1a0e' }}> Gramática:</strong> {unit.grammarFocus}<br />
                        <strong style={{ color: '#2c1a0e' }}> Vocabulário:</strong> {unit.vocabularyFocus}
                      </div>
                      <div>
                        <strong style={{ color: '#2c1a0e' }}> Tópicos Curriculares:</strong>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                          {unit.topics.map(t => (
                            <span key={t} style={{ fontSize: 11, background: '#f5efe6', color: '#7a5c42', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Diagnóstico da IA e Ação Recomendada */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px dashed #e8e0d0', fontSize: TEXT.bodyCompact }}>
                      <span style={{ color: '#7a5c42' }}>
                        <strong>IA Status:</strong> {unit.aiAssessment}
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => { setIsAddingNewUnit(false); setEditModalUnit(unit) }}
                          style={{ padding: '6px 12px', borderRadius: RADIUS.md, border: '1px solid #e8e0d0', background: '#fff', fontSize: 12, fontWeight: 700, color: '#8b5e3c', cursor: 'pointer' }}
                        >
                          Editar Datas
                        </button>
                        <button
                          onClick={() => setSelectedUnit(unit)}
                          style={{ padding: '6px 12px', borderRadius: RADIUS.md, border: '1px solid #e8e0d0', background: '#8b5e3c', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
                        >
                          Ver Detalhes
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 3. ABA: ANALYTICS & DIAGNÓSTICO RAFINHA */}
      {activeTab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Relatório de Cruzamento Inteligente da Rafinha */}
          <div style={{ background: '#2c1a0e', color: '#fdf8f2', padding: 24, borderRadius: RADIUS.xl, boxShadow: '0 4px 16px rgba(44,26,14,0.15)', border: '1px solid #002b36' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className="ti ti-sparkles" style={{ fontSize: 24, color: '#b58900' }} />
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, fontFamily: "'Fraunces', Georgia, serif" }}>
                  Diagnóstico Agêntico de Sequência — Turma {selectedClass} ({selectedSchool})
                </h3>
              </div>
              <button
                onClick={handleRunRafinhaCrossing}
                disabled={analyzingAi}
                style={{ padding: '6px 14px', borderRadius: RADIUS.md, border: 'none', background: '#b58900', color: '#2c1a0e', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                {analyzingAi ? 'Analisando...' : 'Reavaliar Agora'}
              </button>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: '#f0e8d8', whiteSpace: 'pre-wrap' }}>
              {aiReport || 'Clique em "Cruzar com Rafinha IA" para gerar um relatório aprofundado cruzando a linha do tempo, a ementa do livro e as notas dos alunos.'}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CRIAÇÃO / EDIÇÃO DE UNIDADE DA TIMELINE */}
      {editModalUnit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,26,14,0.5)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.2)', borderRadius: RADIUS.xl, padding: '24px 28px', width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(44,26,14,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#2c1a0e', margin: 0, fontFamily: "'Fraunces', Georgia, serif" }}>
                {isAddingNewUnit ? 'Adicionar Nova Unidade / Marco' : `Editar Cronograma: ${editModalUnit.title.split(':')[0]}`}
              </h3>
              <button onClick={() => setEditModalUnit(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#a08060' }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Título da Unidade</label>
                <input
                  type="text"
                  value={editModalUnit.title}
                  onChange={e => setEditModalUnit({ ...editModalUnit, title: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.22)', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Livro / Material de Referência</label>
                <input
                  type="text"
                  value={editModalUnit.bookRef}
                  onChange={e => setEditModalUnit({ ...editModalUnit, bookRef: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.22)', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              {/* Previsto */}
              <div style={{ background: '#f0f6fa', padding: '12px 14px', borderRadius: RADIUS.md, border: '1px solid #c8e1f5' }}>
                <strong style={{ fontSize: 12, color: '#2c1a0e', display: 'block', marginBottom: 8 }}>Seta 1: Cronograma Previsto (Ementa)</strong>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 10, color: '#7a5c42', display: 'block' }}>Mês Início</label>
                    <select
                      value={editModalUnit.plannedMonthStart}
                      onChange={e => setEditModalUnit({ ...editModalUnit, plannedMonthStart: e.target.value })}
                      style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px solid #c8e1f5', fontSize: 12 }}
                    >
                      {MONTHS_LIST.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 10, color: '#7a5c42', display: 'block' }}>Mês Término</label>
                    <select
                      value={editModalUnit.plannedMonthEnd}
                      onChange={e => setEditModalUnit({ ...editModalUnit, plannedMonthEnd: e.target.value })}
                      style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px solid #c8e1f5', fontSize: 12 }}
                    >
                      {MONTHS_LIST.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 10, color: '#7a5c42', display: 'block' }}>Aulas Previstas</label>
                    <input
                      type="number"
                      value={editModalUnit.plannedLessons}
                      onChange={e => setEditModalUnit({ ...editModalUnit, plannedLessons: Number(e.target.value) })}
                      style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px solid #c8e1f5', fontSize: 12, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 8 }}>
                  <div>
                    <label style={{ fontSize: 10, color: '#7a5c42', display: 'block' }}>Semana Início (1-44)</label>
                    <input
                      type="number"
                      min={1} max={44}
                      value={editModalUnit.plannedWeekStart || 1}
                      onChange={e => setEditModalUnit({ ...editModalUnit, plannedWeekStart: Number(e.target.value) })}
                      style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px solid #c8e1f5', fontSize: 12, boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 10, color: '#7a5c42', display: 'block' }}>Semana Fim (1-44)</label>
                    <input
                      type="number"
                      min={1} max={44}
                      value={editModalUnit.plannedWeekEnd || 4}
                      onChange={e => setEditModalUnit({ ...editModalUnit, plannedWeekEnd: Number(e.target.value) })}
                      style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px solid #c8e1f5', fontSize: 12, boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 10, color: '#7a5c42', display: 'block' }}>Trimestre</label>
                    <select
                      value={editModalUnit.plannedQuarter || 'T1'}
                      onChange={e => setEditModalUnit({ ...editModalUnit, plannedQuarter: e.target.value })}
                      style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px solid #c8e1f5', fontSize: 12 }}
                    >
                      <option value="T1">1º Trimestre</option>
                      <option value="T2">2º Trimestre</option>
                      <option value="T3">3º Trimestre</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Realizado */}
              <div style={{ background: '#fdf4ea', padding: '12px 14px', borderRadius: RADIUS.md, border: '1px solid rgba(139,94,60,0.25)' }}>
                <strong style={{ fontSize: 12, color: '#2c1a0e', display: 'block', marginBottom: 8 }}>Seta 2: Execução Real (Aulas Ministradas)</strong>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 10, color: '#7a5c42', display: 'block' }}>Mês Real Início</label>
                    <select
                      value={editModalUnit.actualMonthStart || editModalUnit.plannedMonthStart}
                      onChange={e => setEditModalUnit({ ...editModalUnit, actualMonthStart: e.target.value })}
                      style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px solid rgba(139,94,60,0.25)', fontSize: 12 }}
                    >
                      {MONTHS_LIST.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 10, color: '#7a5c42', display: 'block' }}>Mês Real Fim</label>
                    <select
                      value={editModalUnit.actualMonthEnd || editModalUnit.plannedMonthEnd}
                      onChange={e => setEditModalUnit({ ...editModalUnit, actualMonthEnd: e.target.value })}
                      style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px solid rgba(139,94,60,0.25)', fontSize: 12 }}
                    >
                      {MONTHS_LIST.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 10, color: '#7a5c42', display: 'block' }}>Aulas Dadas</label>
                    <input
                      type="number"
                      value={editModalUnit.actualLessonsGiven || 0}
                      onChange={e => setEditModalUnit({ ...editModalUnit, actualLessonsGiven: Number(e.target.value) })}
                      style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px solid rgba(139,94,60,0.25)', fontSize: 12, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 8 }}>
                  <div>
                    <label style={{ fontSize: 10, color: '#7a5c42', display: 'block' }}>Semana Real Início</label>
                    <input
                      type="number"
                      min={1} max={44}
                      value={editModalUnit.actualWeekStart || editModalUnit.plannedWeekStart || 1}
                      onChange={e => setEditModalUnit({ ...editModalUnit, actualWeekStart: Number(e.target.value) })}
                      style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px solid rgba(139,94,60,0.25)', fontSize: 12, boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 10, color: '#7a5c42', display: 'block' }}>Semana Real Fim</label>
                    <input
                      type="number"
                      min={1} max={44}
                      value={editModalUnit.actualWeekEnd || editModalUnit.plannedWeekEnd || 4}
                      onChange={e => setEditModalUnit({ ...editModalUnit, actualWeekEnd: Number(e.target.value) })}
                      style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px solid rgba(139,94,60,0.25)', fontSize: 12, boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 10, color: '#7a5c42', display: 'block' }}>Trimestre Real</label>
                    <select
                      value={editModalUnit.actualQuarter || editModalUnit.plannedQuarter || 'T1'}
                      onChange={e => setEditModalUnit({ ...editModalUnit, actualQuarter: e.target.value })}
                      style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px solid rgba(139,94,60,0.25)', fontSize: 12 }}
                    >
                      <option value="T1">1º Trimestre</option>
                      <option value="T2">2º Trimestre</option>
                      <option value="T3">3º Trimestre</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Status e Domínio */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Status</label>
                  <select
                    value={editModalUnit.status}
                    onChange={e => setEditModalUnit({ ...editModalUnit, status: e.target.value as any })}
                    style={{ width: '100%', padding: '8px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.22)', fontSize: 12 }}
                  >
                    <option value="completed">Concluída</option>
                    <option value="current">Em Andamento (Atual)</option>
                    <option value="upcoming">Pendente (Futura)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#7a5c42', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Domínio da Turma (%)</label>
                  <input
                    type="number"
                    min={0} max={100}
                    value={editModalUnit.masteryPercentage}
                    onChange={e => setEditModalUnit({ ...editModalUnit, masteryPercentage: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.22)', fontSize: 12, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, borderTop: '1px solid rgba(139,115,85,0.14)', paddingTop: 16 }}>
              {!isAddingNewUnit ? (
                <button
                  onClick={() => handleDeleteUnit(editModalUnit.id)}
                  style={{ padding: '8px 14px', borderRadius: RADIUS.md, border: '1px solid rgba(220,50,47,0.3)', background: '#fff', fontSize: TEXT.bodyCompact, fontWeight: 700, color: '#dc322f', cursor: 'pointer' }}
                >
                  <i className="ti ti-trash" /> Excluir
                </button>
              ) : <div />}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { setEditModalUnit(null); setIsAddingNewUnit(false) }}
                  style={{ padding: '8px 16px', borderRadius: RADIUS.md, border: '1px solid rgba(139,115,85,0.25)', background: '#fff', fontSize: 13, fontWeight: 600, color: '#7a5c42', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveUnitEdit}
                  style={{ padding: '8px 18px', borderRadius: RADIUS.md, border: 'none', background: '#8b5e3c', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
                >
                  {isAddingNewUnit ? 'Adicionar Unidade' : 'Salvar Alterações'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALHES DA UNIDADE */}
      {selectedUnit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,54,66,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 28, width: 500, maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 12px 40px rgba(44,26,14,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#2c1a0e', margin: 0, fontFamily: "'Fraunces', Georgia, serif" }}>
                {selectedUnit.title}
              </h3>
              <button onClick={() => setSelectedUnit(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#a08060' }}>×</button>
            </div>

            <div style={{ fontSize: 13, color: '#7a5c42', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><strong>Livro / Material:</strong> {selectedUnit.bookRef}</div>
              <div><strong>Foco Gramatical:</strong> {selectedUnit.grammarFocus}</div>
              <div><strong>Vocabulário:</strong> {selectedUnit.vocabularyFocus}</div>
              <div><strong>Índice de Domínio:</strong> {selectedUnit.masteryPercentage}%</div>
              <div><strong>Aulas Previstas vs Dadas:</strong> {selectedUnit.plannedLessons} previstas / {selectedUnit.actualLessonsGiven || 0} ministradas</div>
              <div style={{ background: '#f5efe6', padding: 12, borderRadius: RADIUS.md, color: '#2c1a0e' }}>
                <strong>Recomendação Pedagógica:</strong><br />{selectedUnit.suggestedAction}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button
                onClick={() => { handleSetCurrentUnit(selectedUnit.id); setSelectedUnit(null) }}
                style={{ flex: 1, padding: '12px', borderRadius: RADIUS.md, border: 'none', background: '#cb4b16', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Definir Como Conteúdo Atual da Turma
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}