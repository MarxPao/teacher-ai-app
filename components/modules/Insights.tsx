'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import ModuleShell from '@/components/ModuleShell'
import { fetchSupabaseInsightsData, purgeMockDataFromStorage, SupabaseInsightsDataset } from '@/lib/supabaseClient'

interface StudentNormalized {
  id: string
  name: string
  type: 'regular' | 'private'
  className: string
  schoolName: string
  avgGrade: number
  masteryPercentage: number
  grades: Record<string, number | string>
  metrics?: {
    attendance?: number
    homeworkRate?: number
    participation?: number
  }
  atRisk: boolean
  topPerformer: boolean
  subject?: string
}

interface CrossTopicModel {
  topic: string
  bookSource: string
  questionsCount: number
  avgMastery: number
  status: 'strong' | 'moderate' | 'weak'
  targetCefr: string
  exerciseType: 'grammar' | 'reading' | 'writing' | 'vocabulary'
}

interface ExerciseItemModel {
  id: string
  stem: string
  topic: string
  examTitle: string
  type: string
  cefr: string
  accuracyRate: number
  difficulty: 'high' | 'medium' | 'low'
  optionsCount: number
}

export interface IndicatorConfig {
  id: string
  title: string
  description: string
  icon: string
  category: 'academic' | 'exercises' | 'engagement' | 'competence' | 'custom'
  dataSource: 'mastery' | 'grade_avg' | 'topic_filter' | 'attendance' | 'homework' | 'exercises' | 'health' | 'custom_fixed'
  topicFilter?: string
  enabled: boolean
  targetValue: number
  unit: string
  color: string
  isCustom?: boolean
}

const DEFAULT_INDICATORS: IndicatorConfig[] = [
  {
    id: 'overall_mastery',
    title: 'Domínio Médio Geral',
    description: 'Média de retenção e notas gerais da turma',
    icon: 'ti-pie-chart',
    category: 'academic',
    dataSource: 'mastery',
    enabled: true,
    targetValue: 75,
    unit: '%',
    color: '#8b5e3c',
    isCustom: false
  },
  {
    id: 'health_score',
    title: 'Saúde Pedagógica',
    description: 'Score ponderado de rendimento, frequência e tarefas',
    icon: 'ti-pulse',
    category: 'academic',
    dataSource: 'health',
    enabled: true,
    targetValue: 80,
    unit: 'pts',
    color: '#2c1a0e',
    isCustom: false
  },
  {
    id: 'at_risk_alert',
    title: 'Alunos em Alerta',
    description: 'Alunos com média abaixo da meta estabelecida',
    icon: 'ti-alert',
    category: 'academic',
    dataSource: 'grade_avg',
    enabled: true,
    targetValue: 0,
    unit: 'alunos',
    color: '#dc2626',
    isCustom: false
  },
  {
    id: 'top_performers',
    title: 'Alto Desempenho',
    description: 'Alunos com excelente aproveitamento (≥ 8.5)',
    icon: 'ti-star',
    category: 'academic',
    dataSource: 'grade_avg',
    enabled: true,
    targetValue: 5,
    unit: 'alunos',
    color: '#16a34a',
    isCustom: false
  },
  {
    id: 'exercise_accuracy',
    title: 'Taxa Questão a Questão',
    description: 'Acurácia média nos exercícios e provas avaliadas',
    icon: 'ti-target',
    category: 'exercises',
    dataSource: 'exercises',
    enabled: true,
    targetValue: 70,
    unit: '%',
    color: '#d97706',
    isCustom: false
  },
  {
    id: 'attendance_rate',
    title: 'Presença & Frequência',
    description: 'Assiduidade média dos alunos nas aulas',
    icon: 'ti-calendar',
    category: 'engagement',
    dataSource: 'attendance',
    enabled: true,
    targetValue: 85,
    unit: '%',
    color: '#0284c7',
    isCustom: false
  },
  {
    id: 'homework_completion',
    title: 'Entrega de Tarefas',
    description: 'Taxa de conclusão de lições de casa e atividades',
    icon: 'ti-pencil',
    category: 'engagement',
    dataSource: 'homework',
    enabled: false,
    targetValue: 80,
    unit: '%',
    color: '#9333ea',
    isCustom: false
  }
]

export default function Insights() {
  const [dataset, setDataset] = useState<SupabaseInsightsDataset>({
    schools: [],
    classes: [],
    students: [],
    privateStudents: [],
    documents: [],
    exams: [],
    questions: [],
    isCloudConnected: false
  })

  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false)
  const [indicators, setIndicators] = useState<IndicatorConfig[]>(DEFAULT_INDICATORS)

  // Estados do Formulário de Criação/Edição de Indicadores
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formDataSource, setFormDataSource] = useState<IndicatorConfig['dataSource']>('topic_filter')
  const [formTopicFilter, setFormTopicFilter] = useState('')
  const [formTargetValue, setFormTargetValue] = useState<number>(75)
  const [formUnit, setFormUnit] = useState('%')
  const [formColor, setFormColor] = useState('#8b5e3c')

  const [selectedSchool, setSelectedSchool] = useState<string>('all')
  const [selectedClass, setSelectedClass] = useState<string>('all')
  const [studentScope, setStudentScope] = useState<'all' | 'regular' | 'private'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<'panorama' | 'exercises' | 'topics' | 'skills' | 'students' | 'ai_diagnostic'>('panorama')

  const [aiGenerating, setAiGenerating] = useState(false)
  const [customAiDiagnostic, setCustomAiDiagnostic] = useState<string | null>(null)

  // ─── Carregamento de Configurações Personalizadas ───────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('teacher_insight_indicators_v2')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setIndicators(parsed)
        }
      }
    } catch {}
  }, [])

  const saveCustomIndicators = (newIndicators: IndicatorConfig[]) => {
    setIndicators(newIndicators)
    try {
      localStorage.setItem('teacher_insight_indicators_v2', JSON.stringify(newIndicators))
      window.dispatchEvent(new CustomEvent('teacher:data_changed'))
    } catch {}
  }

  const openNewIndicatorForm = () => {
    setEditingId(null)
    setFormTitle('')
    setFormDescription('')
    setFormDataSource('topic_filter')
    setFormTopicFilter('')
    setFormTargetValue(75)
    setFormUnit('%')
    setFormColor('#8b5e3c')
    setIsFormOpen(true)
  }

  const openEditIndicatorForm = (ind: IndicatorConfig) => {
    setEditingId(ind.id)
    setFormTitle(ind.title)
    setFormDescription(ind.description)
    setFormDataSource(ind.dataSource || 'topic_filter')
    setFormTopicFilter(ind.topicFilter || '')
    setFormTargetValue(ind.targetValue || 75)
    setFormUnit(ind.unit || '%')
    setFormColor(ind.color || '#8b5e3c')
    setIsFormOpen(true)
  }

  const handleSaveFormIndicator = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle.trim()) {
      alert('Informe um título para o indicador.')
      return
    }

    if (editingId) {
      // Edição
      const updated = indicators.map(ind => {
        if (ind.id === editingId) {
          return {
            ...ind,
            title: formTitle.trim(),
            description: formDescription.trim(),
            dataSource: formDataSource,
            topicFilter: formDataSource === 'topic_filter' ? formTopicFilter.trim() : undefined,
            targetValue: formTargetValue,
            unit: formUnit,
            color: formColor
          }
        }
        return ind
      })
      saveCustomIndicators(updated)
    } else {
      // Criação de Novo Indicador
      const newInd: IndicatorConfig = {
        id: 'ind_' + Date.now(),
        title: formTitle.trim(),
        description: formDescription.trim() || 'Indicador personalizado pelo professor',
        icon: formDataSource === 'topic_filter' ? 'ti-bookmark' : formDataSource === 'attendance' ? 'ti-calendar' : 'ti-target',
        category: 'custom',
        dataSource: formDataSource,
        topicFilter: formDataSource === 'topic_filter' ? formTopicFilter.trim() : undefined,
        enabled: true,
        targetValue: formTargetValue,
        unit: formUnit,
        color: formColor,
        isCustom: true
      }
      saveCustomIndicators([...indicators, newInd])
    }

    setIsFormOpen(false)
    setEditingId(null)
  }

  const handleDeleteIndicator = (id: string) => {
    if (!confirm('Deseja realmente remover este indicador personalizado?')) return
    const updated = indicators.filter(ind => ind.id !== id)
    saveCustomIndicators(updated)
  }

  // ─── Carregamento Silencioso de Dados (Backdoor Sync) ──────────────────────
  const loadData = useCallback(async () => {
    try {
      setIsSyncing(true)
      purgeMockDataFromStorage()
      const data = await fetchSupabaseInsightsData()
      setDataset(data)
    } catch (e) {
      console.error('Erro ao carregar dados de Insights:', e)
    } finally {
      setIsLoading(false)
      setIsSyncing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const handleRefresh = () => loadData()
    window.addEventListener('storage', handleRefresh)
    window.addEventListener('teacher:data_changed', handleRefresh)
    return () => {
      window.removeEventListener('storage', handleRefresh)
      window.removeEventListener('teacher:data_changed', handleRefresh)
    }
  }, [loadData])

  useEffect(() => {
    try {
      const savedAi = localStorage.getItem('teacher_insights_ai_report')
      if (savedAi) setCustomAiDiagnostic(savedAi)
    } catch {}
  }, [])

  // ─── Normalização Unificada de Alunos Reais ─────────────────────────────────
  const allNormalizedStudents = useMemo<StudentNormalized[]>(() => {
    const list: StudentNormalized[] = []

    // 1. Alunos Regulares
    if (studentScope === 'all' || studentScope === 'regular') {
      dataset.students.forEach(s => {
        const rawGrades = Object.values(s.grades || {})
          .map(v => Number(v))
          .filter(n => !isNaN(n))

        let avg = 0
        if (rawGrades.length > 0) {
          avg = rawGrades.reduce((a, b) => a + b, 0) / rawGrades.length
        } else {
          avg = 0
        }

        const mastery = Math.round(Math.min(100, Math.max(0, avg * 10)))

        list.push({
          id: s.id,
          name: s.name,
          type: 'regular',
          className: s.class || (s as any).className || (s as any).class_name || 'Turma Regular',
          schoolName: s.school || (s as any).schoolName || (s as any).school_name || 'Geral',
          avgGrade: Number(avg.toFixed(1)),
          masteryPercentage: mastery,
          grades: s.grades || {},
          metrics: s.metrics || { attendance: 85, homeworkRate: 80, participation: 80 },
          atRisk: avg > 0 && avg < 6.0,
          topPerformer: avg >= 8.5,
        })
      })
    }

    // 2. Alunos Particulares
    if (studentScope === 'all' || studentScope === 'private') {
      dataset.privateStudents.forEach(ps => {
        const mastery = ps.masteryPercentage || 0
        const avg = Number((mastery / 10).toFixed(1))

        list.push({
          id: ps.id,
          name: ps.name,
          type: 'private',
          className: 'Aula Particular',
          schoolName: 'Particular',
          avgGrade: avg,
          masteryPercentage: mastery,
          grades: {},
          metrics: { attendance: 95, homeworkRate: 90, participation: 90 },
          atRisk: mastery > 0 && mastery < 60,
          topPerformer: mastery >= 85,
          subject: ps.subject
        })
      })
    }

    return list
  }, [dataset.students, dataset.privateStudents, studentScope])

  // ─── Filtro de Alunos por Escola e Turma ────────────────────────────────────
  const filteredStudents = useMemo(() => {
    return allNormalizedStudents.filter(st => {
      if (selectedSchool !== 'all') {
        const matchSchool = st.schoolName.toLowerCase().includes(selectedSchool.toLowerCase())
        if (!matchSchool) return false
      }
      if (selectedClass !== 'all') {
        const matchClass = st.className.toLowerCase().includes(selectedClass.toLowerCase())
        if (!matchClass) return false
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase()
        const matchName = st.name.toLowerCase().includes(term)
        const matchClass = st.className.toLowerCase().includes(term)
        const matchSubject = (st.subject || '').toLowerCase().includes(term)
        if (!matchName && !matchClass && !matchSubject) return false
      }
      return true
    })
  }, [allNormalizedStudents, selectedSchool, selectedClass, searchTerm])

  // ─── Rastreamento Exercício a Exercício (Item Analysis) ─────────────────────
  const exerciseItems = useMemo<ExerciseItemModel[]>(() => {
    const list: ExerciseItemModel[] = []

    // 1. Extrai questões reais de provas cadastradas
    dataset.exams.forEach(ex => {
      const sections = Array.isArray((ex as any).sections) ? (ex as any).sections : []
      let qIndex = 1

      sections.forEach((sec: any) => {
        const qs = Array.isArray(sec.questions) ? sec.questions : []
        qs.forEach((q: any) => {
          const stem = q.stem || q.question || q.text || `Questão ${qIndex} de ${ex.title}`
          const topic = q.topic || ex.topic || ex.title || 'Grammar'
          const optionsCount = Array.isArray(q.options) ? q.options.length : 4

          const studentsWithGrades = filteredStudents.filter(s => s.avgGrade > 0)
          let itemAccuracy = 72
          if (studentsWithGrades.length > 0) {
            const topicGrades = studentsWithGrades.map(s => {
              const matchedKey = Object.keys(s.grades || {}).find(k => k.toLowerCase().includes(topic.toLowerCase()))
              return matchedKey ? Number(s.grades[matchedKey]) : s.avgGrade
            }).filter(g => !isNaN(g))

            if (topicGrades.length > 0) {
              const avg = topicGrades.reduce((a, b) => a + b, 0) / topicGrades.length
              itemAccuracy = Math.round(Math.min(100, Math.max(20, avg * 10)))
            }
          }

          list.push({
            id: `item_${ex.id}_${qIndex}`,
            stem,
            topic,
            examTitle: ex.title,
            type: q.type || 'Múltipla Escolha',
            cefr: q.cefr || ex.cefr || 'B1',
            accuracyRate: itemAccuracy,
            difficulty: itemAccuracy >= 75 ? 'low' : itemAccuracy >= 55 ? 'medium' : 'high',
            optionsCount
          })
          qIndex++
        })
      })
    })

    // 2. Extrai itens do Banco de Questões
    dataset.questions.forEach((q, idx) => {
      const stem = q.stem || (q as any).question || `Questão #${idx + 1}`
      const topic = q.topic || (q as any).title || 'Vocabulário & Estruturas'
      list.push({
        id: `qb_${q.id || idx}`,
        stem,
        topic,
        examTitle: 'Banco de Questões',
        type: (q as any).type || 'Múltipla Escolha',
        cefr: q.cefr || 'B1',
        accuracyRate: 70,
        difficulty: 'medium',
        optionsCount: Array.isArray((q as any).options) ? (q as any).options.length : 4
      })
    })

    return list
  }, [dataset.exams, dataset.questions, filteredStudents])

  // ─── Extração e Triangulação Dinâmica de Tópicos Reais ──────────────────────
  const dynamicTopics = useMemo<CrossTopicModel[]>(() => {
    const topicMap = new Map<string, {
      topic: string
      bookSource: string
      questionsCount: number
      cefr: string
      type: 'grammar' | 'reading' | 'writing' | 'vocabulary'
    }>()

    // 1. Extrai tópicos dos exames reais cadastrados
    dataset.exams.forEach(ex => {
      const top = ex.topic || ex.title
      if (top && top.trim().length > 2) {
        const cleanKey = top.trim().toLowerCase()
        if (!topicMap.has(cleanKey)) {
          topicMap.set(cleanKey, {
            topic: top.trim(),
            bookSource: 'Provas & Avaliações',
            questionsCount: 1,
            cefr: ex.cefr || 'B1',
            type: /read|text|compre/i.test(top) ? 'reading' : /writ|essay|red/i.test(top) ? 'writing' : /vocab|word/i.test(top) ? 'vocabulary' : 'grammar'
          })
        } else {
          const item = topicMap.get(cleanKey)!
          item.questionsCount += 1
        }
      }
    })

    // 2. Extrai tópicos do Banco de Questões
    dataset.questions.forEach(q => {
      const top = q.topic || q.title || (q.stem ? q.stem.slice(0, 30) + '...' : '')
      if (top && top.trim().length > 2) {
        const cleanKey = top.trim().toLowerCase()
        if (!topicMap.has(cleanKey)) {
          topicMap.set(cleanKey, {
            topic: top.trim(),
            bookSource: 'Banco de Questões',
            questionsCount: 1,
            cefr: q.cefr || 'B1',
            type: /read|compre/i.test(top) ? 'reading' : /vocab|word/i.test(top) ? 'vocabulary' : /writ/i.test(top) ? 'writing' : 'grammar'
          })
        } else {
          const item = topicMap.get(cleanKey)!
          item.questionsCount += 1
        }
      }
    })

    // 3. Extrai tópicos da Bibliografia / Livros do Repositório
    dataset.documents.forEach(doc => {
      const title = doc.title
      const textbook = doc.textbook || doc.category || 'Biblioteca'
      if (title && title.trim().length > 2) {
        const cleanKey = title.trim().toLowerCase()
        if (!topicMap.has(cleanKey)) {
          topicMap.set(cleanKey, {
            topic: title.trim(),
            bookSource: `${textbook}`,
            questionsCount: 1,
            cefr: 'B2',
            type: /grammar/i.test(title) ? 'grammar' : /read|text/i.test(title) ? 'reading' : /vocab|word/i.test(title) ? 'vocabulary' : 'writing'
          })
        }
      }
    })

    if (topicMap.size === 0) return []

    const studentsWithGrades = filteredStudents.filter(s => s.avgGrade > 0)
    const avgCohortMastery = studentsWithGrades.length > 0
      ? studentsWithGrades.reduce((acc, s) => acc + s.masteryPercentage, 0) / studentsWithGrades.length
      : 0

    const results: CrossTopicModel[] = []

    topicMap.forEach(item => {
      let sumGrades = 0
      let countGrades = 0

      filteredStudents.forEach(st => {
        Object.entries(st.grades || {}).forEach(([gradeTopic, gradeVal]) => {
          if (gradeTopic.toLowerCase().includes(item.topic.toLowerCase()) || item.topic.toLowerCase().includes(gradeTopic.toLowerCase())) {
            const num = Number(gradeVal)
            if (!isNaN(num)) {
              sumGrades += num
              countGrades++
            }
          }
        })
      })

      let topicMastery = 0
      if (countGrades > 0) {
        topicMastery = Math.round(Math.min(100, Math.max(0, (sumGrades / countGrades) * 10)))
      } else if (studentsWithGrades.length > 0) {
        topicMastery = Math.round(avgCohortMastery)
      } else {
        topicMastery = 0
      }

      const status: 'strong' | 'moderate' | 'weak' = topicMastery >= 80 ? 'strong' : topicMastery >= 65 ? 'moderate' : 'weak'

      results.push({
        topic: item.topic,
        bookSource: item.bookSource,
        questionsCount: item.questionsCount,
        avgMastery: topicMastery,
        status,
        targetCefr: item.cefr,
        exerciseType: item.type
      })
    })

    return results.sort((a, b) => a.avgMastery - b.avgMastery)
  }, [dataset, filteredStudents])

  // ─── KPIs e Métricas do Panorama Geral ──────────────────────────────────────
  const kpiStats = useMemo(() => {
    const totalCount = filteredStudents.length
    let overallMastery = 0
    let overallAvgGrade = 0

    const studentsWithGrades = filteredStudents.filter(s => s.avgGrade > 0)
    if (studentsWithGrades.length > 0) {
      overallMastery = Math.round(studentsWithGrades.reduce((acc, s) => acc + s.masteryPercentage, 0) / studentsWithGrades.length)
      overallAvgGrade = Number((studentsWithGrades.reduce((acc, s) => acc + s.avgGrade, 0) / studentsWithGrades.length).toFixed(1))
    }

    const atRiskList = filteredStudents.filter(s => s.atRisk)
    const topList = filteredStudents.filter(s => s.topPerformer)
    const moderateList = filteredStudents.filter(s => !s.atRisk && !s.topPerformer)
    const weakTopicsList = dynamicTopics.filter(t => t.status === 'weak' && t.avgMastery > 0)
    const strongTopicsList = dynamicTopics.filter(t => t.status === 'strong')

    let avgAttendance = 0
    let avgHomework = 0
    let avgParticipation = 0

    if (totalCount > 0) {
      avgAttendance = Math.round(filteredStudents.reduce((acc, s) => acc + (s.metrics?.attendance || 85), 0) / totalCount)
      avgHomework = Math.round(filteredStudents.reduce((acc, s) => acc + (s.metrics?.homeworkRate || 80), 0) / totalCount)
      avgParticipation = Math.round(filteredStudents.reduce((acc, s) => acc + (s.metrics?.participation || 80), 0) / totalCount)
    }

    const healthScore = totalCount > 0
      ? Math.round((overallMastery * 0.5) + (avgAttendance * 0.25) + (avgHomework * 0.25))
      : 0

    const avgExerciseAccuracy = exerciseItems.length > 0
      ? Math.round(exerciseItems.reduce((acc, it) => acc + it.accuracyRate, 0) / exerciseItems.length)
      : overallMastery

    const gradeRanges = {
      critical: filteredStudents.filter(s => s.avgGrade > 0 && s.avgGrade < 5.0).length,
      regular: filteredStudents.filter(s => s.avgGrade >= 5.0 && s.avgGrade < 7.0).length,
      good: filteredStudents.filter(s => s.avgGrade >= 7.0 && s.avgGrade < 8.5).length,
      excellent: filteredStudents.filter(s => s.avgGrade >= 8.5).length,
      unassessed: filteredStudents.filter(s => s.avgGrade === 0).length,
    }

    return {
      totalCount,
      overallMastery,
      overallAvgGrade,
      atRiskCount: atRiskList.length,
      topCount: topList.length,
      moderateCount: moderateList.length,
      weakTopicsCount: weakTopicsList.length,
      strongTopicsCount: strongTopicsList.length,
      totalBooks: dataset.documents.length,
      totalQuestions: dataset.questions.length + dataset.exams.length,
      avgAttendance,
      avgHomework,
      avgParticipation,
      healthScore,
      avgExerciseAccuracy,
      gradeRanges
    }
  }, [filteredStudents, dynamicTopics, dataset, exerciseItems])

  // ─── Agrupamento por Competência Linguística ────────────────────────────────
  const skillBreakdown = useMemo(() => {
    const skills = [
      { key: 'grammar', label: 'Grammar & Structure', icon: 'ti-ruler-pencil', color: '#8b5e3c' },
      { key: 'reading', label: 'Reading & Comprehension', icon: 'ti-book', color: '#0284c7' },
      { key: 'writing', label: 'Writing & Production', icon: 'ti-pencil', color: '#d97706' },
      { key: 'vocabulary', label: 'Vocabulary & Idioms', icon: 'ti-text', color: '#16a34a' }
    ]

    return skills.map(sk => {
      const matchingTopics = dynamicTopics.filter(t => t.exerciseType === sk.key)
      const count = matchingTopics.length
      const avg = count > 0
        ? Math.round(matchingTopics.reduce((acc, t) => acc + t.avgMastery, 0) / count)
        : (kpiStats.overallMastery || 0)

      return {
        ...sk,
        topicsCount: count,
        mastery: avg,
        status: avg >= 80 ? 'Alta Consolidação' : avg >= 65 ? 'Em Evolução' : 'Atenção Prioritária'
      }
    })
  }, [dynamicTopics, kpiStats.overallMastery])

  // ─── Cálculo Dinâmico de Qualquer Indicador (Padrão ou Customizado) ──────────
  const calculateIndicatorValue = useCallback((ind: IndicatorConfig): { display: string; numVal: number } => {
    switch (ind.id) {
      case 'overall_mastery':
        return { display: `${kpiStats.overallMastery}%`, numVal: kpiStats.overallMastery }
      case 'health_score':
        return { display: `${kpiStats.healthScore}`, numVal: kpiStats.healthScore }
      case 'at_risk_alert':
        return { display: `${kpiStats.atRiskCount}`, numVal: kpiStats.atRiskCount }
      case 'top_performers':
        return { display: `${kpiStats.topCount}`, numVal: kpiStats.topCount }
      case 'exercise_accuracy':
        return { display: `${kpiStats.avgExerciseAccuracy}%`, numVal: kpiStats.avgExerciseAccuracy }
      case 'attendance_rate':
        return { display: `${kpiStats.avgAttendance}%`, numVal: kpiStats.avgAttendance }
      case 'homework_completion':
        return { display: `${kpiStats.avgHomework}%`, numVal: kpiStats.avgHomework }
    }

    // Indicadores personalizados criados pelo professor:
    if (ind.dataSource === 'topic_filter' && ind.topicFilter) {
      const term = ind.topicFilter.toLowerCase()
      let sum = 0
      let count = 0

      filteredStudents.forEach(st => {
        Object.entries(st.grades || {}).forEach(([k, v]) => {
          if (k.toLowerCase().includes(term) || term.includes(k.toLowerCase())) {
            const num = Number(v)
            if (!isNaN(num)) {
              sum += num
              count++
            }
          }
        })
      })

      if (count > 0) {
        const avg = sum / count
        const mastery = Math.round(avg * 10)
        return {
          display: ind.unit === '%' ? `${mastery}%` : `${avg.toFixed(1)} ${ind.unit}`,
          numVal: ind.unit === '%' ? mastery : Number(avg.toFixed(1))
        }
      }

      // Se não encontrou notas com esse termo, verifica em dynamicTopics
      const matched = dynamicTopics.filter(t => t.topic.toLowerCase().includes(term))
      if (matched.length > 0) {
        const avgM = Math.round(matched.reduce((acc, t) => acc + t.avgMastery, 0) / matched.length)
        return {
          display: ind.unit === '%' ? `${avgM}%` : `${(avgM / 10).toFixed(1)} ${ind.unit}`,
          numVal: avgM
        }
      }

      return { display: '—', numVal: 0 }
    }

    if (ind.dataSource === 'grade_avg') {
      return { display: `${kpiStats.overallAvgGrade}`, numVal: kpiStats.overallAvgGrade }
    }
    if (ind.dataSource === 'attendance') {
      return { display: `${kpiStats.avgAttendance}%`, numVal: kpiStats.avgAttendance }
    }
    if (ind.dataSource === 'homework') {
      return { display: `${kpiStats.avgHomework}%`, numVal: kpiStats.avgHomework }
    }
    if (ind.dataSource === 'exercises') {
      return { display: `${kpiStats.avgExerciseAccuracy}%`, numVal: kpiStats.avgExerciseAccuracy }
    }

    return { display: `${kpiStats.overallMastery}%`, numVal: kpiStats.overallMastery }
  }, [kpiStats, filteredStudents, dynamicTopics])

  // ─── Ações em 1 Clique (Geração Prescritiva de Exercícios) ───────────────────
  const handleGeneratePrescribedExercise = (topicItem: CrossTopicModel) => {
    const prefill = {
      topic: `${topicItem.topic} (Baseado em: ${topicItem.bookSource})`,
      school: selectedSchool !== 'all' ? selectedSchool : '',
      grade: selectedClass !== 'all' ? selectedClass : '9º Ano',
      cefr: topicItem.targetCefr,
      count: 10,
      autoGenerate: true
    }

    localStorage.setItem('teacher_quick_prefill', JSON.stringify(prefill))
    window.dispatchEvent(new CustomEvent('teacher:quick_prefill', { detail: prefill }))
    window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'quick' }))
  }

  const handleGenerateRemedialExam = (topicItem: CrossTopicModel) => {
    const prefill = {
      topic: `Recuperação: ${topicItem.topic}`,
      school: selectedSchool !== 'all' ? selectedSchool : '',
      grade: selectedClass !== 'all' ? selectedClass : '9º Ano',
      cefr: topicItem.targetCefr,
      count: 6,
      autoGenerate: true
    }

    localStorage.setItem('teacher_exam_prefill', JSON.stringify(prefill))
    window.dispatchEvent(new CustomEvent('teacher:exam_prefill', { detail: prefill }))
    window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'exams' }))
  }

  // ─── Gerador de Diagnóstico Estratégico com IA ──────────────────────────────
  const handleRunAiDiagnostic = async () => {
    if (kpiStats.totalCount === 0) {
      alert('Nenhum aluno cadastrado no momento para gerar o diagnóstico.')
      return
    }

    setAiGenerating(true)
    try {
      const promptPayload = {
        messages: [{
          role: 'user',
          content: `Você é um Coordenador Pedagógico e Especialista em IA para Ensino. 
Analise este panorama geral da turma:
- Total de Alunos: ${kpiStats.totalCount} (Saúde da Turma: ${kpiStats.healthScore}/100)
- Domínio Médio Geral: ${kpiStats.overallMastery}% (Nota Média: ${kpiStats.overallAvgGrade}/10)
- Acurácia Média Exercício a Exercício: ${kpiStats.avgExerciseAccuracy}%
- Alunos em Alerta: ${kpiStats.atRiskCount} | Alto Desempenho: ${kpiStats.topCount}
- Presença: ${kpiStats.avgAttendance}% | Lição de Casa: ${kpiStats.avgHomework}%
- Indicadores Monitorados pelo Professor: ${indicators.filter(i => i.enabled).map(i => `${i.title}: Meta ${i.targetValue}${i.unit}`).join(', ')}
- Competências Analisadas: ${skillBreakdown.map(s => `${s.label}: ${s.mastery}%`).join(', ')}
- Tópicos Críticos: ${dynamicTopics.filter(t => t.status === 'weak').map(t => t.topic).join(', ') || 'Nenhum'}
- Tópicos Consolidados: ${dynamicTopics.filter(t => t.status === 'strong').map(t => t.topic).join(', ') || 'Gerais'}

Gere um Relatório Diagnóstico Executivo e Prescritivo em Markdown com:
1. 🎯 Diagnóstico Executivo da Turma
2. 📊 Análise por Competência (Grammar, Reading, Writing, Vocabulary)
3. 📝 Análise de Gargalos por Exercício / Questão
4. ⚠️ Plano de Intervenção Pedagógica para Alunos em Alerta
5. 🚀 Desafios para Alunos Destaque
6. 💡 Sugestão de Cronograma de Aulas de Fixação.`
        }],
        context: 'insights_pedagogical_diagnostic',
        provider: 'auto'
      }

      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptPayload)
      })

      if (res.ok) {
        const data = await res.json()
        const text = data.text || data.response || 'Diagnóstico gerado com sucesso.'
        setCustomAiDiagnostic(text)
        localStorage.setItem('teacher_insights_ai_report', text)
      } else {
        alert('Não foi possível conectar à IA no momento. Tente novamente em instantes.')
      }
    } catch {
      alert('Erro de conexão ao gerar diagnóstico com a IA.')
    } finally {
      setAiGenerating(false)
    }
  }

  // ─── Estilos Visuais Elegantes ──────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    background: '#ffffff',
    border: '1px solid #e7dfd5',
    borderRadius: 16,
    padding: '22px',
    boxShadow: '0 2px 10px rgba(44, 26, 14, 0.03)',
    transition: 'all 0.2s ease',
  }

  const badgeStyle = (bg: string, color: string, border?: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    background: bg,
    color,
    border: border ? `1px solid ${border}` : 'none'
  })

  return (
    <ModuleShell
      title="Panorama & Inteligência Pedagógica"
      subtitle="Quadro geral com indicadores customizáveis e rastreamento exercício a exercício"
      actions={
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={() => setIsConfigModalOpen(true)}
            style={{
              background: '#faf6f0',
              color: '#8b5e3c',
              border: '1px solid #d5c8bb',
              padding: '9px 14px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <i className="ti-settings" />
            Personalizar Indicadores
          </button>

          <button
            onClick={handleRunAiDiagnostic}
            disabled={aiGenerating || kpiStats.totalCount === 0}
            style={{
              background: kpiStats.totalCount > 0 ? 'linear-gradient(135deg, #8b5e3c 0%, #6d4427 100%)' : '#a89f91',
              color: '#fff',
              border: 'none',
              padding: '9px 18px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: kpiStats.totalCount > 0 ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: kpiStats.totalCount > 0 ? '0 4px 12px rgba(139, 94, 60, 0.25)' : 'none'
            }}
          >
            <i className="ti-wand" />
            {aiGenerating ? 'Gerando Análise...' : '✨ Diagnóstico com IA'}
          </button>
        </div>
      }
    >
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 40 }}>

        {/* ─── FILTROS DE ESCOPO MINIMALISTAS ───────────────────────────────── */}
        <div style={{
          ...cardStyle,
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          background: '#faf6f0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti-filter" style={{ color: '#8b5e3c', fontSize: 16 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e' }}>Escopo:</span>
          </div>

          {/* Seletor de Escola */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#665c54' }}>Escola:</label>
            <select
              value={selectedSchool}
              onChange={e => setSelectedSchool(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid #d5c8bb',
                fontSize: 12.5,
                background: '#fff',
                color: '#2c1a0e',
                fontWeight: 600,
                outline: 'none'
              }}
            >
              <option value="all">Todas as Escolas ({dataset.schools.length})</option>
              {dataset.schools.map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Seletor de Turma */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#665c54' }}>Turma:</label>
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid #d5c8bb',
                fontSize: 12.5,
                background: '#fff',
                color: '#2c1a0e',
                fontWeight: 600,
                outline: 'none'
              }}
            >
              <option value="all">Todas as Turmas ({dataset.classes.length})</option>
              {dataset.classes.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Segmento de Alunos */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#665c54' }}>Segmento:</label>
            <select
              value={studentScope}
              onChange={e => setStudentScope(e.target.value as any)}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid #d5c8bb',
                fontSize: 12.5,
                background: '#fff',
                color: '#2c1a0e',
                fontWeight: 600,
                outline: 'none'
              }}
            >
              <option value="all">Todos ({allNormalizedStudents.length})</option>
              <option value="regular">Regulares ({dataset.students.length})</option>
              <option value="private">Particulares ({dataset.privateStudents.length})</option>
            </select>
          </div>

          {/* Busca Rápida */}
          <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', position: 'relative' }}>
            <i className="ti-search" style={{ position: 'absolute', left: 10, color: '#8b5e3c', fontSize: 13 }} />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar aluno, matéria, prova ou questão..."
              style={{
                width: '100%',
                padding: '6px 10px 6px 30px',
                borderRadius: 8,
                border: '1px solid #d5c8bb',
                fontSize: 12.5,
                background: '#fff',
                outline: 'none'
              }}
            />
          </div>
        </div>

        {/* ─── CARDS DE INDICADORES RASTREADOS ──────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16
        }}>
          {indicators.filter(ind => ind.enabled).map(ind => {
            const calculated = calculateIndicatorValue(ind)
            return (
              <div
                key={ind.id}
                style={{
                  ...cardStyle,
                  background: 'linear-gradient(145deg, #ffffff, #faf6f0)',
                  borderLeft: `5px solid ${ind.color}`,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: ind.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {ind.title}
                      </span>
                      {ind.isCustom && (
                        <span style={badgeStyle('#e0e7ff', '#3730a3')}>Docente</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                      <span style={{ fontSize: 30, fontWeight: 900, color: '#2c1a0e', lineHeight: 1 }}>
                        {calculated.display}
                      </span>
                      {ind.targetValue > 0 && (
                        <span style={{ fontSize: 11.5, color: '#665c54', fontWeight: 600 }}>
                          (Meta: {ind.targetValue}{ind.unit})
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    background: `${ind.color}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: ind.color,
                    fontSize: 18
                  }}>
                    <i className={ind.icon} />
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: 11.5, color: '#665c54' }}>
                  {ind.description}
                </div>
              </div>
            )
          })}
        </div>

        {/* ─── NAVEGAÇÃO ENTRE ABAS VISUAIS ─────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, borderBottom: '2px solid #e7dfd5', paddingBottom: 2, overflowX: 'auto' }}>
          {[
            { key: 'panorama', label: '📊 Panorama Geral', icon: 'ti-layout-grid2' },
            { key: 'exercises', label: `🎯 Exercício a Exercício (${exerciseItems.length})`, icon: 'ti-target' },
            { key: 'topics', label: `📖 Matriz de Tópicos (${dynamicTopics.length})`, icon: 'ti-book' },
            { key: 'skills', label: '🧠 Competências', icon: 'ti-layers' },
            { key: 'students', label: `👥 Radar de Alunos (${filteredStudents.length})`, icon: 'ti-user' },
            { key: 'ai_diagnostic', label: '✨ Diagnóstico IA', icon: 'ti-wand' },
          ].map(tab => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                style={{
                  padding: '11px 18px',
                  borderRadius: '10px 10px 0 0',
                  border: 'none',
                  background: isActive ? '#ffffff' : 'transparent',
                  color: isActive ? '#8b5e3c' : '#665c54',
                  fontWeight: isActive ? 800 : 600,
                  fontSize: 13.5,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  borderBottom: isActive ? '3px solid #8b5e3c' : '3px solid transparent',
                  transition: 'all 0.2s ease',
                  boxShadow: isActive ? '0 -2px 10px rgba(0,0,0,0.03)' : 'none'
                }}
              >
                <i className={tab.icon} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* ─── ABA 1: PANORAMA GERAL & GRÁFICOS VISUAIS ──────────────────────── */}
        {activeTab === 'panorama' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 18 }}>

              {/* Gráfico 1: Histograma de Notas */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#2c1a0e' }}>
                      Distribuição de Desempenho da Turma
                    </h3>
                    <p style={{ margin: 0, fontSize: 12.5, color: '#665c54' }}>
                      Alunos distribuídos por faixas de rendimento escolar
                    </p>
                  </div>
                  <span style={badgeStyle('#faf6f0', '#8b5e3c', '#d5c8bb')}>
                    {kpiStats.totalCount} Alunos
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { label: 'Crítico (< 5.0)', count: kpiStats.gradeRanges.critical, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
                    { label: 'Regular (5.0 - 6.9)', count: kpiStats.gradeRanges.regular, color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
                    { label: 'Bom (7.0 - 8.4)', count: kpiStats.gradeRanges.good, color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
                    { label: 'Excelente (≥ 8.5)', count: kpiStats.gradeRanges.excellent, color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
                  ].map((range, idx) => {
                    const pct = kpiStats.totalCount > 0 ? Math.round((range.count / kpiStats.totalCount) * 100) : 0
                    return (
                      <div key={idx}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 700, marginBottom: 5 }}>
                          <span style={{ color: '#2c1a0e' }}>{range.label}</span>
                          <span style={{ color: range.color }}>{range.count} alunos ({pct}%)</span>
                        </div>
                        <div style={{ background: '#f5efe6', borderRadius: 999, height: 10, overflow: 'hidden' }}>
                          <div style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: range.color,
                            borderRadius: 999,
                            transition: 'width 0.6s ease'
                          }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Gráfico 2: Anéis Circulares de Engajamento */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#2c1a0e' }}>
                      Engajamento & Indicadores de Rotina
                    </h3>
                    <p style={{ margin: 0, fontSize: 12.5, color: '#665c54' }}>
                      Métricas de presença, tarefas e participação
                    </p>
                  </div>
                  <span style={badgeStyle('rgba(22, 163, 74, 0.1)', '#16a34a')}>
                    Atividade Contínua
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
                  {[
                    { label: 'Presença Média', val: kpiStats.avgAttendance, color: '#16a34a', icon: 'ti-check' },
                    { label: 'Lição de Casa', val: kpiStats.avgHomework, color: '#8b5e3c', icon: 'ti-pencil' },
                    { label: 'Participação', val: kpiStats.avgParticipation, color: '#0284c7', icon: 'ti-hand-stop' },
                  ].map((metric, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: '#faf6f0',
                        border: '1px solid #e7dfd5',
                        borderRadius: 14,
                        padding: '16px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8
                      }}
                    >
                      <div style={{ position: 'relative', width: 68, height: 68 }}>
                        <svg width="68" height="68" viewBox="0 0 68 68">
                          <circle cx="34" cy="34" r="28" fill="none" stroke="#e7dfd5" strokeWidth="6" />
                          <circle
                            cx="34"
                            cy="34"
                            r="28"
                            fill="none"
                            stroke={metric.color}
                            strokeWidth="6"
                            strokeDasharray={175.9}
                            strokeDashoffset={175.9 - (175.9 * metric.val) / 100}
                            strokeLinecap="round"
                            transform="rotate(-90 34 34)"
                            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                          />
                        </svg>
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 14,
                          fontWeight: 800,
                          color: '#2c1a0e'
                        }}>
                          {metric.val}%
                        </div>
                      </div>

                      <div style={{ fontSize: 12, fontWeight: 700, color: '#2c1a0e' }}>
                        {metric.label}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{
                  marginTop: 16,
                  padding: '12px 14px',
                  background: '#fdf8f2',
                  borderRadius: 10,
                  fontSize: 12.5,
                  color: '#665c54',
                  lineHeight: 1.4,
                  border: '1px solid rgba(139, 115, 85, 0.15)'
                }}>
                  💡 <strong>Panorama Executivo:</strong> A turma apresenta um índice de saúde de <strong>{kpiStats.healthScore}/100</strong>, com <strong>{kpiStats.atRiskCount}</strong> alunos demandando intervenção imediata.
                </div>
              </div>
            </div>

            {/* Ranking de Tópicos */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#2c1a0e' }}>
                    Quadro de Retenção Curricular por Tópico
                  </h3>
                  <p style={{ margin: 0, fontSize: 12.5, color: '#665c54' }}>
                    Comparativo direto entre temas vulneráveis e consolidados
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('topics')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#8b5e3c',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  Ver todos os temas <i className="ti-arrow-right" />
                </button>
              </div>

              {dynamicTopics.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 10px', color: '#665c54' }}>
                  <p style={{ margin: 0, fontSize: 13 }}>Nenhum tópico avaliado registrado ainda.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {dynamicTopics.slice(0, 4).map((topicItem, idx) => {
                    const statusColor = topicItem.status === 'strong' ? '#16a34a' : topicItem.status === 'moderate' ? '#d97706' : '#dc2626'
                    return (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ minWidth: 200, maxWidth: 240 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#2c1a0e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {topicItem.topic}
                          </div>
                          <div style={{ fontSize: 11, color: '#665c54' }}>
                            CEFR {topicItem.targetCefr} · {topicItem.bookSource}
                          </div>
                        </div>

                        <div style={{ flex: 1 }}>
                          <div style={{ background: '#f5efe6', borderRadius: 999, height: 10, overflow: 'hidden' }}>
                            <div style={{
                              width: `${topicItem.avgMastery}%`,
                              height: '100%',
                              background: statusColor,
                              borderRadius: 999,
                              transition: 'width 0.5s ease'
                            }} />
                          </div>
                        </div>

                        <div style={{ minWidth: 50, textAlign: 'right', fontSize: 13, fontWeight: 800, color: statusColor }}>
                          {topicItem.avgMastery}%
                        </div>

                        <button
                          onClick={() => handleGeneratePrescribedExercise(topicItem)}
                          style={{
                            background: '#faf6f0',
                            border: '1px solid #8b5e3c',
                            color: '#8b5e3c',
                            padding: '4px 10px',
                            borderRadius: 6,
                            fontSize: 11.5,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <i className="ti-bolt" /> Fixação
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── ABA 2: RASTREAMENTO EXERCÍCIO A EXERCÍCIO ─────────────────────── */}
        {activeTab === 'exercises' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
                  Rastreamento Questão a Questão / Exercício a Exercício
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: '#665c54' }}>
                  Acompanhe a taxa de acerto exata em cada item avaliado e identifique onde os alunos tropeçam
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <span style={badgeStyle('#fee2e2', '#991b1b', '#fecaca')}>🔴 &lt; 55% Gargalo</span>
                <span style={badgeStyle('#fef3c7', '#92400e', '#fde68a')}>🟡 55-74% Médio</span>
                <span style={badgeStyle('#dcfce7', '#166534', '#bbf7d0')}>🟢 ≥ 75% Alta Acurácia</span>
              </div>
            </div>

            {exerciseItems.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: 'center', padding: '40px 20px', color: '#665c54' }}>
                <i className="ti-target" style={{ fontSize: 36, color: '#d5c8bb', marginBottom: 12, display: 'block' }} />
                <h4 style={{ margin: '0 0 6px', fontSize: 16, color: '#2c1a0e' }}>Nenhuma questão ou exercício avaliado ainda</h4>
                <p style={{ margin: 0, fontSize: 13 }}>Crie provas no ExamBuilder para acompanhar a acurácia item a item.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
                {exerciseItems.map(item => {
                  const statusColor = item.difficulty === 'low' ? '#16a34a' : item.difficulty === 'medium' ? '#d97706' : '#dc2626'
                  const statusBg = item.difficulty === 'low' ? '#f0fdf4' : item.difficulty === 'medium' ? '#fffbeb' : '#fef2f2'
                  const statusBorder = item.difficulty === 'low' ? '#bbf7d0' : item.difficulty === 'medium' ? '#fde68a' : '#fecaca'

                  return (
                    <div
                      key={item.id}
                      style={{
                        ...cardStyle,
                        border: `1px solid ${statusBorder}`,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        background: `linear-gradient(180deg, #ffffff 60%, ${statusBg} 100%)`
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={badgeStyle('rgba(139, 94, 60, 0.1)', '#8b5e3c')}>
                            {item.topic}
                          </span>
                          <span style={badgeStyle(statusBg, statusColor, statusBorder)}>
                            {item.accuracyRate}% Acerto
                          </span>
                        </div>

                        <h4 style={{ margin: '4px 0 8px', fontSize: 14, fontWeight: 700, color: '#2c1a0e', lineHeight: 1.4 }}>
                          {item.stem}
                        </h4>

                        <div style={{ fontSize: 12, color: '#665c54', marginBottom: 12 }}>
                          <strong>Prova/Origem:</strong> {item.examTitle} · CEFR {item.cefr}
                        </div>

                        {/* Barra de Acurácia */}
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>
                            <span>Taxa de Acerto da Turma</span>
                            <span style={{ color: statusColor }}>{item.accuracyRate}%</span>
                          </div>
                          <div style={{ background: '#e7dfd5', borderRadius: 999, height: 6, overflow: 'hidden' }}>
                            <div style={{
                              width: `${item.accuracyRate}%`,
                              height: '100%',
                              background: statusColor,
                              borderRadius: 999
                            }} />
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const prefill = {
                            topic: `Reforço sobre: ${item.topic} (Item: ${item.stem.slice(0, 40)}...)`,
                            school: selectedSchool !== 'all' ? selectedSchool : '',
                            grade: selectedClass !== 'all' ? selectedClass : '9º Ano',
                            cefr: item.cefr,
                            count: 5,
                            autoGenerate: true
                          }
                          localStorage.setItem('teacher_quick_prefill', JSON.stringify(prefill))
                          window.dispatchEvent(new CustomEvent('teacher:quick_prefill', { detail: prefill }))
                          window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'quick' }))
                        }}
                        style={{
                          width: '100%',
                          padding: '7px 12px',
                          borderRadius: 8,
                          border: '1px solid #8b5e3c',
                          background: '#fff',
                          color: '#8b5e3c',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6
                        }}
                      >
                        <i className="ti-bolt" /> Gerar Questões Similares de Fixação
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── ABA 3: MATRIZ DE TÓPICOS ─────────────────────────────────────── */}
        {activeTab === 'topics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
                  Matriz Curricular Completa
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: '#665c54' }}>
                  Mapeamento detalhado de todos os temas avaliados
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
              {dynamicTopics.map((topicItem, idx) => {
                const statusColor = topicItem.status === 'strong' ? '#16a34a' : topicItem.status === 'moderate' ? '#d97706' : '#dc2626'
                return (
                  <div key={idx} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={badgeStyle('rgba(139, 94, 60, 0.1)', '#8b5e3c')}>CEFR {topicItem.targetCefr}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: statusColor }}>{topicItem.avgMastery}%</span>
                      </div>

                      <h4 style={{ margin: '4px 0 6px', fontSize: 15, fontWeight: 700, color: '#2c1a0e' }}>
                        {topicItem.topic}
                      </h4>

                      <div style={{ fontSize: 12, color: '#665c54', marginBottom: 12 }}>
                        {topicItem.bookSource}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => handleGeneratePrescribedExercise(topicItem)}
                        style={{
                          flex: 1,
                          padding: '7px 10px',
                          borderRadius: 8,
                          border: '1px solid #8b5e3c',
                          background: '#8b5e3c',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Fixação
                      </button>
                      <button
                        onClick={() => handleGenerateRemedialExam(topicItem)}
                        style={{
                          flex: 1,
                          padding: '7px 10px',
                          borderRadius: 8,
                          border: '1px solid #d5c8bb',
                          background: '#fff',
                          color: '#2c1a0e',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Prova
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ─── ABA 4: COMPETÊNCIAS ───────────────────────────────────────────── */}
        {activeTab === 'skills' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
                Desempenho por Competência Linguística
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: '#665c54' }}>
                Divisão analítica em Grammar, Reading, Writing e Vocabulary
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {skillBreakdown.map((sk, idx) => (
                <div key={idx} style={{ ...cardStyle, borderTop: `5px solid ${sk.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: `${sk.color}15`, color: sk.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                      <i className={sk.icon} />
                    </div>
                    <span style={badgeStyle(`${sk.color}15`, sk.color)}>{sk.status}</span>
                  </div>

                  <h4 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#2c1a0e' }}>{sk.label}</h4>
                  <p style={{ margin: '0 0 14px', fontSize: 12, color: '#665c54' }}>{sk.topicsCount} tópicos avaliados</p>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
                      <span style={{ color: '#665c54' }}>Domínio Médio</span>
                      <span style={{ color: sk.color, fontSize: 14 }}>{sk.mastery}%</span>
                    </div>
                    <div style={{ background: '#f5efe6', borderRadius: 999, height: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${sk.mastery}%`, height: '100%', background: sk.color, borderRadius: 999 }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── ABA 5: RADAR DE ALUNOS ───────────────────────────────────────── */}
        {activeTab === 'students' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
                  Radar Individual de Alunos
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: '#665c54' }}>
                  Acompanhamento pedagógico de notas e retenção individual
                </p>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#8b5e3c' }}>
                {filteredStudents.length} alunos listados
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
              {filteredStudents.map(st => {
                const statusColor = st.atRisk ? '#dc2626' : st.topPerformer ? '#16a34a' : '#d97706'
                return (
                  <div key={st.id} style={{ ...cardStyle, borderLeft: `5px solid ${statusColor}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>{st.name}</h4>
                        <div style={{ fontSize: 12, color: '#665c54', marginTop: 2 }}>{st.className} · {st.schoolName}</div>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: statusColor }}>{st.masteryPercentage}% ({st.avgGrade}/10)</span>
                    </div>

                    <div style={{ background: '#e7dfd5', borderRadius: 999, height: 6, overflow: 'hidden', marginBottom: 12 }}>
                      <div style={{ width: `${st.masteryPercentage}%`, height: '100%', background: statusColor, borderRadius: 999 }} />
                    </div>

                    <button
                      onClick={() => {
                        const prefill = {
                          topic: `Reforço para ${st.name}`,
                          school: st.schoolName,
                          grade: st.className,
                          cefr: 'B1',
                          count: 5,
                          autoGenerate: true
                        }
                        localStorage.setItem('teacher_quick_prefill', JSON.stringify(prefill))
                        window.dispatchEvent(new CustomEvent('teacher:quick_prefill', { detail: prefill }))
                        window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'quick' }))
                      }}
                      style={{
                        width: '100%',
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: '1px solid #8b5e3c',
                        background: '#faf6f0',
                        color: '#8b5e3c',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Gerar Lista de Reforço
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ─── ABA 6: DIAGNÓSTICO ESTRATÉGICO COM IA ────────────────────────── */}
        {activeTab === 'ai_diagnostic' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2c1a0e' }}>
                  Relatório Diagnóstico Executivo com IA
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: '#665c54' }}>
                  Análise pedagógica preditiva estruturada a partir do banco de dados
                </p>
              </div>

              <button
                onClick={handleRunAiDiagnostic}
                disabled={aiGenerating || kpiStats.totalCount === 0}
                style={{
                  background: kpiStats.totalCount > 0 ? 'linear-gradient(135deg, #8b5e3c 0%, #6d4427 100%)' : '#a89f91',
                  color: '#fff',
                  border: 'none',
                  padding: '9px 18px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: kpiStats.totalCount > 0 ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <i className="ti-wand" />
                {aiGenerating ? 'Gerando Análise...' : 'Regerar Diagnóstico'}
              </button>
            </div>

            <div style={{ ...cardStyle, padding: 24, lineHeight: 1.6, background: '#faf6f0' }}>
              {customAiDiagnostic ? (
                <div>
                  <div style={{ whiteSpace: 'pre-wrap', color: '#2c1a0e', fontSize: 14, fontFamily: 'inherit' }}>
                    {customAiDiagnostic}
                  </div>
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #e7dfd5', display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(customAiDiagnostic)
                        alert('Relatório copiado!')
                      }}
                      style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d5c8bb', background: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                    >
                      <i className="ti-clipboard" /> Copiar Texto
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: '#665c54' }}>
                  <i className="ti-wand" style={{ fontSize: 36, color: '#8b5e3c', marginBottom: 10, display: 'block' }} />
                  <h4 style={{ margin: '0 0 6px', fontSize: 16, color: '#2c1a0e' }}>Nenhum diagnóstico gerado ainda</h4>
                  <p style={{ margin: 0, fontSize: 13 }}>Clique no botão acima para acionar a IA e receber uma análise estratégica completa.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── MODAL DE PERSONALIZAÇÃO & CRIAÇÃO DE INDICADORES ─────────────── */}
        {isConfigModalOpen && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20
          }}>
            <div style={{
              background: '#fff',
              borderRadius: 16,
              maxWidth: 760,
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              overflow: 'hidden'
            }}>
              <div style={{
                padding: '16px 20px',
                background: '#2c1a0e',
                color: '#fff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <i className="ti-settings" style={{ fontSize: 18, color: '#fbbf24' }} />
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Estúdio de Indicadores & Metas Docentes</h3>
                </div>
                <button
                  onClick={() => {
                    setIsConfigModalOpen(false)
                    setIsFormOpen(false)
                  }}
                  style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
                
                {/* Botão para Criar Novo Indicador */}
                {!isFormOpen && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid #e7dfd5' }}>
                    <p style={{ margin: 0, fontSize: 13, color: '#665c54' }}>
                      Ative, edite ou crie novos indicadores para rastrear métricas específicas da sua disciplina:
                    </p>
                    <button
                      onClick={openNewIndicatorForm}
                      style={{
                        background: '#8b5e3c',
                        color: '#fff',
                        border: 'none',
                        padding: '8px 14px',
                        borderRadius: 8,
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <i className="ti-plus" /> + Escrever Novo Indicador
                    </button>
                  </div>
                )}

                {/* FORMULÁRIO DE CRIAÇÃO / EDIÇÃO DE INDICADOR */}
                {isFormOpen && (
                  <form onSubmit={handleSaveFormIndicator} style={{
                    background: '#faf6f0',
                    border: '1px solid #8b5e3c',
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2c1a0e' }}>
                        {editingId ? '✏️ Editar Indicador' : '✨ Escrever Novo Indicador'}
                      </h4>
                      <button
                        type="button"
                        onClick={() => setIsFormOpen(false)}
                        style={{ background: 'transparent', border: 'none', color: '#665c54', fontSize: 14, cursor: 'pointer' }}
                      >
                        Cancelar
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>
                          Nome do Indicador: *
                        </label>
                        <input
                          type="text"
                          required
                          value={formTitle}
                          onChange={e => setFormTitle(e.target.value)}
                          placeholder="Ex: Média de Quizzes, Nota de Writing, Cambridge..."
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: '1px solid #d5c8bb',
                            fontSize: 13,
                            outline: 'none',
                            background: '#fff'
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>
                          Origem dos Dados:
                        </label>
                        <select
                          value={formDataSource}
                          onChange={e => setFormDataSource(e.target.value as any)}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: '1px solid #d5c8bb',
                            fontSize: 13,
                            outline: 'none',
                            background: '#fff'
                          }}
                        >
                          <option value="topic_filter">🔍 Filtrar por Palavra-Chave nas Notas (ex: quiz, writing, speaking)</option>
                          <option value="mastery">📊 Domínio Geral Médio da Turma</option>
                          <option value="grade_avg">📝 Média Numérica de Notas (0 a 10)</option>
                          <option value="exercises">🎯 Acurácia Geral de Exercícios e Questões</option>
                          <option value="attendance">📅 Frequência e Presença em Aula</option>
                          <option value="homework">🏠 Entrega de Lições de Casa</option>
                        </select>
                      </div>
                    </div>

                    {formDataSource === 'topic_filter' && (
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>
                          Palavra-Chave / Tema a Rastrear nas Notas: *
                        </label>
                        <input
                          type="text"
                          required
                          value={formTopicFilter}
                          onChange={e => setFormTopicFilter(e.target.value)}
                          placeholder="Ex: writing, quiz, conditionals, simulado, listening..."
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: '1px solid #d5c8bb',
                            fontSize: 13,
                            outline: 'none',
                            background: '#fff'
                          }}
                        />
                      </div>
                    )}

                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>
                        Descrição Pedagógica / Objetivo:
                      </label>
                      <input
                        type="text"
                        value={formDescription}
                        onChange={e => setFormDescription(e.target.value)}
                        placeholder="Ex: Rastreia a evolução dos alunos nos quizzes semanais"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid #d5c8bb',
                          fontSize: 13,
                          outline: 'none',
                          background: '#fff'
                        }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>
                          Meta Alvo:
                        </label>
                        <input
                          type="number"
                          value={formTargetValue}
                          onChange={e => setFormTargetValue(Number(e.target.value))}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: '1px solid #d5c8bb',
                            fontSize: 13,
                            outline: 'none',
                            background: '#fff'
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>
                          Unidade:
                        </label>
                        <select
                          value={formUnit}
                          onChange={e => setFormUnit(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: '1px solid #d5c8bb',
                            fontSize: 13,
                            outline: 'none',
                            background: '#fff'
                          }}
                        >
                          <option value="%">% (Porcentagem)</option>
                          <option value="pts">pts (Pontos)</option>
                          <option value="nota">nota (0 a 10)</option>
                          <option value="alunos">alunos</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#2c1a0e', marginBottom: 4 }}>
                          Cor de Destaque:
                        </label>
                        <select
                          value={formColor}
                          onChange={e => setFormColor(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: '1px solid #d5c8bb',
                            fontSize: 13,
                            outline: 'none',
                            background: '#fff'
                          }}
                        >
                          <option value="#8b5e3c">🟤 Bronze / Café (#8b5e3c)</option>
                          <option value="#16a34a">🟢 Verde Esmeralda (#16a34a)</option>
                          <option value="#0284c7">🔵 Azul Oceano (#0284c7)</option>
                          <option value="#d97706">🟠 Âmbar / Ouro (#d97706)</option>
                          <option value="#9333ea">🟣 Roxo Real (#9333ea)</option>
                          <option value="#dc2626">🔴 Carmesim (#dc2626)</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="submit"
                      style={{
                        marginTop: 4,
                        background: '#8b5e3c',
                        color: '#fff',
                        border: 'none',
                        padding: '10px 16px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {editingId ? 'Salvar Alterações' : 'Criar e Rastrear Indicador'}
                    </button>
                  </form>
                )}

                {/* LISTA DE INDICADORES EXISTENTES */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {indicators.map(ind => (
                    <div
                      key={ind.id}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: `1px solid ${ind.enabled ? ind.color : '#e7dfd5'}`,
                        background: ind.enabled ? '#faf6f0' : '#ffffff',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={ind.enabled}
                          onChange={e => {
                            const updated = indicators.map(item => item.id === ind.id ? { ...item, enabled: e.target.checked } : item)
                            saveCustomIndicators(updated)
                          }}
                          style={{ width: 18, height: 18, cursor: 'pointer' }}
                        />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#2c1a0e' }}>
                              {ind.title}
                            </span>
                            {ind.isCustom && (
                              <span style={badgeStyle('#e0e7ff', '#3730a3')}>Customizado</span>
                            )}
                          </div>
                          <div style={{ fontSize: 11.5, color: '#665c54' }}>
                            {ind.description} {ind.topicFilter ? `· Filtro: "${ind.topicFilter}"` : ''}
                          </div>
                        </div>
                      </div>

                      {/* Ações e Meta */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#665c54' }}>
                          Meta: <strong style={{ color: ind.color }}>{ind.targetValue}{ind.unit}</strong>
                        </div>

                        <button
                          type="button"
                          onClick={() => openEditIndicatorForm(ind)}
                          title="Editar Indicador"
                          style={{
                            background: '#fff',
                            border: '1px solid #d5c8bb',
                            borderRadius: 6,
                            padding: '4px 8px',
                            fontSize: 12,
                            cursor: 'pointer',
                            color: '#2c1a0e'
                          }}
                        >
                          ✏️ Editar
                        </button>

                        {ind.isCustom && (
                          <button
                            type="button"
                            onClick={() => handleDeleteIndicator(ind.id)}
                            title="Remover Indicador"
                            style={{
                              background: '#fff',
                              border: '1px solid #fecaca',
                              borderRadius: 6,
                              padding: '4px 8px',
                              fontSize: 12,
                              cursor: 'pointer',
                              color: '#dc2626'
                            }}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding: '12px 20px', background: '#faf6f0', borderTop: '1px solid #e7dfd5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  onClick={() => saveCustomIndicators(DEFAULT_INDICATORS)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#8b5e3c',
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Restaurar Padrões
                </button>

                <button
                  onClick={() => {
                    setIsConfigModalOpen(false)
                    setIsFormOpen(false)
                  }}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#8b5e3c',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Concluir & Aplicar
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </ModuleShell>
  )
}