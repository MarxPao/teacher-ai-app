'use client'
import { COLOR, RADIUS, TEXT, SHADOW, FONT } from '@/styles/tokens'
import React, { useState, useMemo, useEffect } from 'react'
import { analyzeSpacing, TopicSpacingInfo, CalendarTask, QuestionBankEntry } from '@/lib/spacingScheduler'

// --- Types ---

export interface QuestionResult {
  questionId: string
  correct: boolean
  weight: number
  bloomLevel?: string
  difficultyLevel?: string
  chosenOption?: string   // What the student selected
  correctOption?: string  // What was correct
}

export interface ExamHistoryEntry {
  examId: string
  examTitle: string
  examDate: string
  classRef: string
  topic: string
  cefrLevel?: string
  questionCount: number
  results: Array<{
    studentId: string
    studentName: string
    totalScore: number
    maxScore: number
    questionResults: QuestionResult[]
    tabSwitchCount?: number
  }>
}

export interface AssessmentInsight {
  id: string
  type: 'bloom_adjust' | 'difficulty_adjust' | 'spacing_review' | 'weak_item' | 'class_gap' | 'student_gap' | 'interleave'
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  action: string
  accepted: boolean | null   // null = pending
  // Suggested param changes
  bloomAdjust?: { remember?: number; apply?: number; analyze?: number; evaluate?: number }
  difficultyAdjust?: { easy?: number; medium?: number; hard?: number; challenge?: number }
  topicsToInclude?: string[]
  questionsToReplace?: string[]
}

interface SmartInsightsPanelProps {
  classRef: string
  topic: string
  cefrLevel?: string
  onInsightsAccepted: (params: {
    bloomRemember: number
    bloomApply: number
    bloomAnalyze: number
    bloomEvaluate: number
    diffEasy: number
    diffMedium: number
    diffHard: number
    diffChallenge: number
    spacingTopics: string[]
    additionalPromptContext: string
  }) => void
  onDismiss: () => void
}

const STORAGE_KEYS = {
  examHistory: 'teacher_exam_history',
  questionBank: 'teacher_question_bank',
  calendar: 'teacher_calendar_tasks',
}

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

export default function SmartInsightsPanel({
  classRef,
  topic,
  cefrLevel,
  onInsightsAccepted,
  onDismiss
}: SmartInsightsPanelProps) {
  const [insights, setInsights] = useState<AssessmentInsight[]>([])
  const [loading, setLoading] = useState(true)
  const [spacingTopics, setSpacingTopics] = useState<TopicSpacingInfo[]>([])

  useEffect(() => {
    const history: ExamHistoryEntry[] = loadJson(STORAGE_KEYS.examHistory, [])
    const questionBank: QuestionBankEntry[] = loadJson(STORAGE_KEYS.questionBank, [])
    const calendar: CalendarTask[] = loadJson(STORAGE_KEYS.calendar, [])

    // Filter history for this class
    const classHistory = history.filter(e => e.classRef === classRef)
    const lastExam = classHistory[classHistory.length - 1]

    const generated: AssessmentInsight[] = []

    // --- INSIGHT 1: Bloom Distribution Analysis ---
    if (lastExam && lastExam.results.length > 0) {
      const bloomCounts: Record<string, number> = {}
      let totalQ = 0
      lastExam.results[0]?.questionResults.forEach(qr => {
        if (qr.bloomLevel) {
          bloomCounts[qr.bloomLevel] = (bloomCounts[qr.bloomLevel] || 0) + 1
          totalQ++
        }
      })
      if (totalQ > 0) {
        const rememberPct = Math.round(((bloomCounts.remember || 0) + (bloomCounts.understand || 0)) / totalQ * 100)
        const analyzePct = Math.round(((bloomCounts.analyze || 0) + (bloomCounts.evaluate || 0) + (bloomCounts.create || 0)) / totalQ * 100)
        
        if (rememberPct > 50) {
          generated.push({
            id: 'bloom_too_low',
            type: 'bloom_adjust',
            priority: 'high',
            title: '🧠 Bloom: muitas questões de recall',
            description: `A última prova teve ${rememberPct}% de questões no nível Lembrar/Compreender. O recomendado é máximo 30%.`,
            action: 'Ajustar para: Lembrar 20%, Aplicar 35%, Analisar 30%, Avaliar/Criar 15%',
            accepted: null,
            bloomAdjust: { remember: 20, apply: 35, analyze: 30, evaluate: 15 }
          })
        } else if (analyzePct < 15) {
          generated.push({
            id: 'bloom_too_low_hots',
            type: 'bloom_adjust',
            priority: 'medium',
            title: '🧠 Bloom: poucas questões de ordem superior',
            description: `Apenas ${analyzePct}% das questões exigiram análise ou avaliação.`,
            action: 'Aumentar Analisar/Avaliar para pelo menos 25%',
            accepted: null,
            bloomAdjust: { remember: 25, apply: 30, analyze: 25, evaluate: 20 }
          })
        }
      }
    }

    // --- INSIGHT 2: Average Score + Difficulty Adjust ---
    if (lastExam && lastExam.results.length >= 2) {
      const avgScore = lastExam.results.reduce((acc, r) =>
        acc + (r.maxScore > 0 ? r.totalScore / r.maxScore * 10 : 0), 0
      ) / lastExam.results.length

      if (avgScore < 5.0) {
        generated.push({
          id: 'avg_too_low',
          type: 'difficulty_adjust',
          priority: 'high',
          title: `⚖️ Nota média baixa: ${avgScore.toFixed(1)}`,
          description: 'A média da turma ficou abaixo de 5.0. A próxima prova deve ter menos questões difíceis.',
          action: 'Reduzir Difícil de 25%→15%, aumentar Médio para 55%',
          accepted: null,
          difficultyAdjust: { easy: 20, medium: 55, hard: 15, challenge: 5 }
        })
      } else if (avgScore > 8.5) {
        generated.push({
          id: 'avg_too_high',
          type: 'difficulty_adjust',
          priority: 'medium',
          title: `⚖️ Nota média alta: ${avgScore.toFixed(1)}`,
          description: 'A turma está com desempenho acima de 8.5. Pode aumentar o desafio.',
          action: 'Aumentar Difícil para 30%, adicionar 10% Desafio',
          accepted: null,
          difficultyAdjust: { easy: 15, medium: 45, hard: 30, challenge: 10 }
        })
      }
    }

    // --- INSIGHT 3: Weak Items (p < 0.35 and D > 0.25 = ZDP) ---
    if (lastExam && lastExam.results.length >= 3) {
      const questionCount = lastExam.results[0]?.questionResults.length || 0
      const weakItems: number[] = []
      const badItems: number[] = [] // D < 0.20 = item doesn't discriminate

      for (let qi = 0; qi < questionCount; qi++) {
        const responses = lastExam.results.map(r => r.questionResults[qi]).filter(Boolean)
        const correct = responses.filter(r => r.correct).length
        const p = responses.length > 0 ? correct / responses.length : 0

        // Discrimination index
        const sorted = lastExam.results.slice().sort((a, b) =>
          (b.totalScore / (b.maxScore || 1)) - (a.totalScore / (a.maxScore || 1))
        )
        const cutoff = Math.max(1, Math.floor(lastExam.results.length * 0.27))
        const top = sorted.slice(0, cutoff)
        const bottom = sorted.slice(-cutoff)
        const pHigh = top.filter(r => r.questionResults[qi]?.correct).length / Math.max(top.length, 1)
        const pLow = bottom.filter(r => r.questionResults[qi]?.correct).length / Math.max(bottom.length, 1)
        const D = pHigh - pLow

        if (p < 0.35 && D >= 0.25) weakItems.push(qi + 1)
        if (p < 0.40 && D < 0.15) badItems.push(qi + 1)
      }

      if (weakItems.length > 0) {
        generated.push({
          id: 'zdp_topics',
          type: 'weak_item',
          priority: 'high',
          title: `🎯 ${weakItems.length} questão(ões) na Zona de Desenvolvimento Proximal`,
          description: `Q${weakItems.join(', Q')} tiveram p < 0.35 com boa discriminação — conteúdo em ZDP da turma. Merecem revisão e questões similares.`,
          action: `Incluir questões de revisão sobre os tópicos dessas questões na próxima prova`,
          accepted: null
        })
      }

      if (badItems.length > 0) {
        generated.push({
          id: 'bad_items',
          type: 'weak_item',
          priority: 'medium',
          title: `⚠️ ${badItems.length} item(ns) com discriminação fraca`,
          description: `Q${badItems.join(', Q')} todos erram da mesma forma (D < 0.15) — lacuna curricular coletiva, não problema de item.`,
          action: 'Aula de revisão recomendada antes da próxima prova sobre esses tópicos',
          accepted: null,
          questionsToReplace: badItems.map(n => `Q${n}`)
        })
      }
    }

    // --- INSIGHT 4: Spacing Scheduler ---
    const spacing = analyzeSpacing(calendar, questionBank)
      .filter(t => (t.classRef === classRef || t.classRef === 'all') && t.recommendedForReview)
      .slice(0, 4)
    setSpacingTopics(spacing)

    if (spacing.length > 0) {
      const overdueTopics = spacing.filter(t => t.spacingStatus === 'overdue' || t.spacingStatus === 'never_tested')
      if (overdueTopics.length > 0) {
        generated.push({
          id: 'spacing_review',
          type: 'spacing_review',
          priority: 'high',
          title: `⏰ ${overdueTopics.length} tópico(s) para revisão espaçada`,
          description: overdueTopics.map(t =>
            `• ${t.topic} — ${t.spacingStatus === 'never_tested' ? 'nunca testado' : `${t.daysSinceLast} dias sem testar`}`
          ).join('\n'),
          action: 'Incluir questões de revisão desses tópicos na próxima prova',
          accepted: null,
          topicsToInclude: overdueTopics.map(t => t.topic)
        })
      }
    }

    // --- INSIGHT 5: Interleaving ---
    if (lastExam) {
      generated.push({
        id: 'interleave',
        type: 'interleave',
        priority: 'low',
        title: '🔀 Ativar intercalação de tipos de questão',
        description: 'Intercalar tipos de questão dentro de cada seção aumenta retenção em 40–60% (Rohrer et al., 2020).',
        action: 'Instruir IA a intercalar subtipos dentro de cada seção (ex: não agrupar todo Past Perfect junto)',
        accepted: null
      })
    }

    setInsights(generated)
    setLoading(false)
  }, [classRef, topic])

  const acceptedCount = insights.filter(i => i.accepted === true).length
  const pendingCount = insights.filter(i => i.accepted === null).length

  const handleToggle = (id: string, value: boolean | null) => {
    setInsights(prev => prev.map(i => i.id === id ? { ...i, accepted: value } : i))
  }

  const handleApplyAll = () => {
    // Merge all accepted insights into param set
    const accepted = insights.filter(i => i.accepted === true)
    
    // Start from defaults
    let bloomRemember = 25, bloomApply = 30, bloomAnalyze = 25, bloomEvaluate = 20
    let diffEasy = 20, diffMedium = 50, diffHard = 25, diffChallenge = 5
    const spacingTopicsList: string[] = []
    const contextParts: string[] = []

    for (const insight of accepted) {
      if (insight.bloomAdjust) {
        if (insight.bloomAdjust.remember !== undefined) bloomRemember = insight.bloomAdjust.remember
        if (insight.bloomAdjust.apply !== undefined) bloomApply = insight.bloomAdjust.apply
        if (insight.bloomAdjust.analyze !== undefined) bloomAnalyze = insight.bloomAdjust.analyze
        if (insight.bloomAdjust.evaluate !== undefined) bloomEvaluate = insight.bloomAdjust.evaluate
      }
      if (insight.difficultyAdjust) {
        if (insight.difficultyAdjust.easy !== undefined) diffEasy = insight.difficultyAdjust.easy
        if (insight.difficultyAdjust.medium !== undefined) diffMedium = insight.difficultyAdjust.medium
        if (insight.difficultyAdjust.hard !== undefined) diffHard = insight.difficultyAdjust.hard
        if (insight.difficultyAdjust.challenge !== undefined) diffChallenge = insight.difficultyAdjust.challenge
      }
      if (insight.topicsToInclude) spacingTopicsList.push(...insight.topicsToInclude)
      if (insight.type === 'interleave') contextParts.push('IMPORTANTE: Intercale os tipos de questão dentro de cada seção — não agrupe todos os itens de um mesmo subtópico juntos.')
      if (insight.type === 'weak_item' && insight.id === 'zdp_topics') {
        contextParts.push('Inclua questões de revisão sobre os tópicos em que a turma teve maior dificuldade na última avaliação, com scaffolding adicional.')
      }
    }

    if (spacingTopicsList.length > 0) {
      contextParts.push(`Inclua questões de REVISÃO ESPAÇADA sobre: ${spacingTopicsList.join(', ')}. Essas questões devem ter dificuldade FÁCIL/MÉDIO pois servem para consolidação.`)
    }

    onInsightsAccepted({
      bloomRemember, bloomApply, bloomAnalyze, bloomEvaluate,
      diffEasy, diffMedium, diffHard, diffChallenge,
      spacingTopics: spacingTopicsList,
      additionalPromptContext: contextParts.join('\n\n')
    })
  }

  const priorityColor = { high: 'border-red-200 bg-red-50', medium: 'border-yellow-200 bg-yellow-50', low: 'border-blue-200 bg-blue-50' }
  const priorityBadge = { high: 'bg-red-100 text-red-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-blue-100 text-blue-700' }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-500">
        <span className="animate-spin mr-2">⚙️</span> Analisando dados históricos...
      </div>
    )
  }

  if (insights.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p className="text-2xl mb-2">✅</p>
        <p>Nenhum dado histórico suficiente para gerar insights.</p>
        <p className="text-sm mt-1">Aplique pelo menos 1 prova com 3+ alunos para ativar o sistema de análise.</p>
        <button onClick={onDismiss} className="mt-4 px-4 py-2 bg-gray-100 rounded-lg text-sm">Fechar</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-gradient-to-r from-indigo-50 to-purple-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg text-indigo-900">🧠 Smart Insights</h3>
            <p className="text-sm text-indigo-600">{classRef} · Baseado em {insights.length} análises</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">{pendingCount} pendente(s)</div>
            <div className="text-xs text-green-600 font-medium">{acceptedCount} aceito(s)</div>
          </div>
        </div>
      </div>

      {/* Insights list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {insights.map(insight => (
          <div key={insight.id} className={`border rounded-xl p-4 transition-all ${
            insight.accepted === true ? 'border-green-300 bg-green-50' :
            insight.accepted === false ? 'border-gray-200 bg-gray-50 opacity-50' :
            priorityColor[insight.priority]
          }`}>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityBadge[insight.priority]}`}>
                    {insight.priority === 'high' ? '🔴 Alta' : insight.priority === 'medium' ? '🟡 Média' : '🔵 Baixa'}
                  </span>
                  <span className="font-semibold text-sm">{insight.title}</span>
                </div>
                <p className="text-xs text-gray-600 whitespace-pre-line mb-2">{insight.description}</p>
                <p className="text-xs text-indigo-700 font-medium">→ {insight.action}</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={() => handleToggle(insight.id, insight.accepted === true ? null : true)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    insight.accepted === true
                      ? 'bg-green-600 text-white'
                      : 'bg-white border border-green-300 text-green-700 hover:bg-green-50'
                  }`}
                >
                  ✓ Aceitar
                </button>
                <button
                  onClick={() => handleToggle(insight.id, insight.accepted === false ? null : false)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    insight.accepted === false
                      ? 'bg-gray-500 text-white'
                      : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  ✕ Ignorar
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Spacing topics visual */}
        {spacingTopics.length > 0 && (
          <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50">
            <h4 className="font-semibold text-sm text-indigo-800 mb-2">📅 Mapa de Espaçamento da Turma</h4>
            <div className="space-y-1">
              {spacingTopics.map(t => (
                <div key={`${t.classRef}::${t.topic}`} className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    t.urgency === 'high' ? 'bg-red-500' :
                    t.urgency === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                  }`} />
                  <span className="font-medium">{t.topic}</span>
                  <span className="text-gray-400">
                    {t.spacingStatus === 'never_tested' ? '— nunca testado' :
                     t.spacingStatus === 'overdue' ? `— ${t.daysSinceLast}d sem testar (vencido)` :
                     t.spacingStatus === 'ideal' ? `— ${t.daysSinceLast}d (janela ideal)` :
                     `— ${t.daysSinceLast}d (recente)`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="p-4 border-t bg-gray-50 flex gap-2">
        <button
          onClick={() => setInsights(prev => prev.map(i => ({ ...i, accepted: true })))}
          className="flex-1 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-200"
        >
          ✓ Aceitar todos
        </button>
        <button
          onClick={handleApplyAll}
          disabled={acceptedCount === 0}
          className={`flex-1 py-2 rounded-lg text-sm font-medium ${
            acceptedCount > 0
              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          🚀 Aplicar {acceptedCount} insight{acceptedCount !== 1 ? 's' : ''}
        </button>
        <button onClick={onDismiss} className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          ✕
        </button>
      </div>
    </div>
  )
}
