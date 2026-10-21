import { analyzeSpacing, TopicSpacingInfo, CalendarTask, QuestionBankEntry } from '@/lib/spacingScheduler'
import {
  N_MIN_CLASS_AGGREGATE,
  N_MIN_ITEM_DISCRIMINATION_ZDP,
  N_ITEM_CONFIDENCE_ALTA,
} from '@/lib/insights/insightEngineV1'
import type { ExamHistoryEntry, AssessmentInsight } from './SmartInsightsPanel'

export function computeSmartInsights(
  history: ExamHistoryEntry[],
  questionBank: QuestionBankEntry[],
  calendar: CalendarTask[],
  classRef: string
): { insights: AssessmentInsight[]; spacingTopics: TopicSpacingInfo[] } {
  const classHistory = history.filter(e => e.classRef === classRef)
  const lastExam = classHistory[classHistory.length - 1]

  const generated: AssessmentInsight[] = []

  // Validação Fail-Closed: sem prova ou sem resultados => zero insights
  if (!lastExam || !Array.isArray(lastExam.results) || lastExam.results.length === 0) {
    const spacing = analyzeSpacing(calendar, questionBank)
      .filter(t => (t.classRef === classRef || t.classRef === 'all') && t.recommendedForReview)
      .slice(0, 4)
    return { insights: [], spacingTopics: spacing }
  }

  // 1 nota baixa isolada (N=1) => sem insight de trajetória ou turma
  if (lastExam.results.length === 1 && !lastExam.results[0]?.questionResults?.length) {
    return { insights: [], spacingTopics: [] }
  }

  // --- INSIGHT 1: Bloom Distribution Analysis ---
  if (lastExam.results.length >= 2) {
    const bloomCounts: Record<string, number> = {}
    let totalQ = 0
    lastExam.results[0]?.questionResults?.forEach(qr => {
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
          bloomAdjust: { remember: 20, apply: 35, analyze: 30, evaluate: 15 },
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
          bloomAdjust: { remember: 25, apply: 30, analyze: 25, evaluate: 20 },
        })
      }
    }
  }

  // --- INSIGHT 2: Average Score + Difficulty Adjust ---
  if (lastExam.results.length >= 1 && lastExam.results.length < N_MIN_CLASS_AGGREGATE) {
    generated.push({
      id: 'avg_small_sample',
      type: 'difficulty_adjust',
      priority: 'low',
      title: 'ℹ️ Amostra pequena para média da turma',
      description: `A turma possui apenas ${lastExam.results.length} alunos avaliados. A média agregada requer no mínimo ${N_MIN_CLASS_AGGREGATE} alunos para fundamentar ajustes curriculares.`,
      action: 'Aguardar mais avaliações antes de calibrar a dificuldade da prova',
      accepted: null,
    })
  } else if (lastExam.results.length >= N_MIN_CLASS_AGGREGATE) {
    const avgScore =
      lastExam.results.reduce(
        (acc, r) => acc + (r.maxScore > 0 ? (r.totalScore / r.maxScore) * 10 : 0),
        0
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
        difficultyAdjust: { easy: 20, medium: 55, hard: 15, challenge: 5 },
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
        difficultyAdjust: { easy: 15, medium: 45, hard: 30, challenge: 10 },
      })
    }
  }

  // --- INSIGHT 3: Weak Items (p < 0.35 and D > 0.25 = ZDP) ---
  if (lastExam.results.length >= 1 && lastExam.results.length < N_MIN_ITEM_DISCRIMINATION_ZDP) {
    generated.push({
      id: 'small_sample_warning',
      type: 'weak_item',
      priority: 'low',
      title: 'ℹ️ Amostra pequena para cálculo psicométrico',
      description: `A turma possui apenas ${lastExam.results.length} alunos avaliados. O cálculo de discriminação e inferência de ZDP exige no mínimo ${N_MIN_ITEM_DISCRIMINATION_ZDP} alunos para validade estatística.`,
      action: 'Aguardar aplicação com mais estudantes para habilitar análise de itens',
      accepted: null,
    })
  } else if (lastExam.results.length >= N_MIN_ITEM_DISCRIMINATION_ZDP) {
    const questionCount = lastExam.results[0]?.questionResults?.length || 0
    const weakItems: number[] = []
    const badItems: number[] = []
    const nStudents = lastExam.results.length
    const isHighConfidence = nStudents >= N_ITEM_CONFIDENCE_ALTA

    for (let qi = 0; qi < questionCount; qi++) {
      const responses = lastExam.results.map(r => r.questionResults?.[qi]).filter(Boolean)
      const correct = responses.filter(r => r.correct).length
      const p = responses.length > 0 ? correct / responses.length : 0

      // Discrimination index
      const sorted = lastExam.results
        .slice()
        .sort((a, b) => b.totalScore / (b.maxScore || 1) - a.totalScore / (a.maxScore || 1))
      const cutoff = Math.max(1, Math.floor(lastExam.results.length * 0.27))
      const top = sorted.slice(0, cutoff)
      const bottom = sorted.slice(-cutoff)
      const pHigh = top.filter(r => r.questionResults?.[qi]?.correct).length / Math.max(top.length, 1)
      const pLow = bottom.filter(r => r.questionResults?.[qi]?.correct).length / Math.max(bottom.length, 1)
      const D = pHigh - pLow

      if (p < 0.35 && D >= 0.25) weakItems.push(qi + 1)
      if (p < 0.40 && D < 0.15) badItems.push(qi + 1)
    }

    if (weakItems.length > 0) {
      generated.push({
        id: 'zdp_topics',
        type: 'weak_item',
        priority: isHighConfidence ? 'high' : 'low',
        title: isHighConfidence
          ? `🎯 ${weakItems.length} questão(ões) na Zona de Desenvolvimento Proximal`
          : `🎯 ${weakItems.length} questão(ões) em zona de atenção formativa (amostra preliminar)`,
        description: isHighConfidence
          ? `Q${weakItems.join(', Q')} tiveram p < 0.35 com boa discriminação — conteúdo em ZDP da turma. Merecem revisão e questões similares.`
          : `Amostra preliminar (${nStudents} alunos). Q${weakItems.join(', Q')} sugerem conteúdo em desenvolvimento da turma; recomenda-se verificar em novas avaliações antes de inferir construto ZDP consolidado.`,
        action: `Incluir questões de revisão sobre os tópicos dessas questões na próxima prova`,
        accepted: null,
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
        questionsToReplace: badItems.map(n => `Q${n}`),
      })
    }
  }

  // --- INSIGHT 4: Spacing Scheduler ---
  const spacing = analyzeSpacing(calendar, questionBank)
    .filter(t => (t.classRef === classRef || t.classRef === 'all') && t.recommendedForReview)
    .slice(0, 4)

  if (spacing.length > 0) {
    const overdueTopics = spacing.filter(t => t.spacingStatus === 'overdue' || t.spacingStatus === 'never_tested')
    if (overdueTopics.length > 0) {
      generated.push({
        id: 'spacing_review',
        type: 'spacing_review',
        priority: 'high',
        title: `📅 ${overdueTopics.length} tópico(s) precisam de revisão espaçada`,
        description: `Tópicos: ${overdueTopics.map(t => `${t.topic} (${t.daysSinceLast}d)`).join(', ')}. Revisar agora consolida a memória de longo prazo.`,
        action: 'Incluir questões desses tópicos na prova atual',
        accepted: null,
        topicsToInclude: overdueTopics.map(t => t.topic),
      })
    }
  }

  // Validação estrita: descarta qualquer item com campos obrigatórios ausentes
  const validInsights = generated.filter(
    i => i && typeof i.id === 'string' && i.title && i.description && i.action
  )

  return { insights: validInsights, spacingTopics: spacing }
}
