/**
 * lib/executivePedagogicalSummary.ts — Sumário Executivo Pedagógico (1 Página)
 * 
 * Objetivo Pedagógico (Onda A — Fase A2):
 * Gerar um relatório executivo de 1 página em linguagem natural, acolhedora e pedagógica,
 * traduzindo os resultados psicométricos complexos (BKT, DINA, DIF) em orientações práticas
 * para o professor.
 * 
 * Regra Inegociável de Linguagem (Zero Jargão Psicométrico):
 * - PROIBIDO expor nesta camada: logits, Delta_MH, chiSquare, slippage (s_j), guessing (g_j),
 *   Q-Matrix, MIRT ou termos de código.
 * - Todos os dados técnicos continuam restritos ao Card 5 de Psicometria Avançada.
 * - Foco: "68% dominou X, 74% falhou em Y, principal armadilha foi Z, sugestão de intervenção".
 */

import { StudentBKTBatchUpdate } from './omrPsychometricsBridge'

export interface QuestionMetadataForSummary {
  questionNumber: number
  stem?: string
  correctAnswer: string
  topic?: string
  misconceptionsByOption?: Record<string, string>
  options?: Array<{ letter: string; text: string }>
}

export interface ExecutiveSummaryInput {
  examTitle: string
  subjectName?: string
  topic: string
  studentBKTUpdates: Array<{
    studentId: string
    studentName?: string
    topic: string
    previousMastery: number
    newMastery: number
    isMastered: boolean
    responses: Array<{
      questionNumber: number
      detectedAnswer: string | null
      correctAnswer: string
      isCorrect: boolean
    }>
  }>
  questionMetadata?: QuestionMetadataForSummary[]
}

export interface TopicMasteryInsight {
  topicName: string
  masteryPercentage: number
  masteredCount: number
  totalCount: number
  status: 'consolidado' | 'em_desenvolvimento' | 'atencao_prioritaria'
}

export interface MisconceptionTrapInsight {
  questionNumber: number
  topic: string
  trapOption: string
  selectedPercentage: number
  explanation: string
}

export interface ExecutivePedagogicalSummary {
  examTitle: string
  topic: string
  classroomProfile: {
    totalEvaluated: number
    averageMasteryPercentage: number
    masteredRatePercentage: number
    headline: string
  }
  strengths: TopicMasteryInsight[]
  growthAreas: TopicMasteryInsight[]
  topMisconceptionTrap?: MisconceptionTrapInsight
  pedagogicalInterventions: string[]
  formattedPageText: string
  generatedAt: number
}

/**
 * Gera o Sumário Executivo Pedagógico de 1 página a partir dos dados do lote avaliado.
 */
export function generateExecutivePedagogicalSummary(
  input: ExecutiveSummaryInput
): ExecutivePedagogicalSummary {
  const {
    examTitle,
    topic,
    studentBKTUpdates,
    questionMetadata = []
  } = input

  const totalEvaluated = studentBKTUpdates.length
  if (totalEvaluated === 0) {
    return {
      examTitle,
      topic,
      classroomProfile: {
        totalEvaluated: 0,
        averageMasteryPercentage: 0,
        masteredRatePercentage: 0,
        headline: 'Nenhuma resposta de aluno disponível para compor o sumário.'
      },
      strengths: [],
      growthAreas: [],
      pedagogicalInterventions: ['Aguardando aplicação de avaliação para gerar diagnóstico da turma.'],
      formattedPageText: 'Sem dados de alunos.',
      generatedAt: Date.now()
    }
  }

  // 1. Médias Gerais da Turma
  const sumMastery = studentBKTUpdates.reduce((acc, s) => acc + s.newMastery, 0)
  const averageMasteryPercentage = Math.round((sumMastery / totalEvaluated) * 100)
  const masteredCount = studentBKTUpdates.filter(s => s.isMastered).length
  const masteredRatePercentage = Math.round((masteredCount / totalEvaluated) * 100)

  // 2. Análise por Questão / Subtópico
  const questionMap: Record<number, {
    correctCount: number
    totalCount: number
    optionCounts: Record<string, number>
    topic: string
  }> = {}

  studentBKTUpdates.forEach(st => {
    st.responses.forEach(r => {
      const qNum = r.questionNumber
      if (!questionMap[qNum]) {
        const meta = questionMetadata.find(m => m.questionNumber === qNum)
        questionMap[qNum] = {
          correctCount: 0,
          totalCount: 0,
          optionCounts: {},
          topic: meta?.topic || topic
        }
      }
      questionMap[qNum].totalCount++
      if (r.isCorrect) {
        questionMap[qNum].correctCount++
      }
      if (r.detectedAnswer) {
        const opt = r.detectedAnswer.toUpperCase()
        questionMap[qNum].optionCounts[opt] = (questionMap[qNum].optionCounts[opt] || 0) + 1
      }
    })
  })

  // 3. Identificação de Pontos Fortes e Áreas de Fragilidade
  const strengths: TopicMasteryInsight[] = []
  const growthAreas: TopicMasteryInsight[] = []

  // Agrupa acertos por subtópico
  const topicStats: Record<string, { correct: number; total: number }> = {}
  Object.entries(questionMap).forEach(([qNum, stat]) => {
    const t = stat.topic
    if (!topicStats[t]) topicStats[t] = { correct: 0, total: 0 }
    topicStats[t].correct += stat.correctCount
    topicStats[t].total += stat.totalCount
  })

  Object.entries(topicStats).forEach(([tName, stat]) => {
    const pct = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0
    const insight: TopicMasteryInsight = {
      topicName: tName,
      masteryPercentage: pct,
      masteredCount: Math.round((pct / 100) * totalEvaluated),
      totalCount: totalEvaluated,
      status: pct >= 70 ? 'consolidado' : pct >= 50 ? 'em_desenvolvimento' : 'atencao_prioritaria'
    }

    if (pct >= 65) {
      strengths.push(insight)
    } else {
      growthAreas.push(insight)
    }
  })

  // Se tudo caiu em uma só categoria, garante preenchimento equilibrado
  if (strengths.length === 0 && growthAreas.length > 0) {
    const sorted = [...growthAreas].sort((a, b) => b.masteryPercentage - a.masteryPercentage)
    strengths.push(sorted[0])
  }

  // 4. Detecção da Principal Armadilha (Misconception Trap)
  let topTrap: MisconceptionTrapInsight | undefined
  let maxTrapCount = 0

  Object.entries(questionMap).forEach(([qStr, stat]) => {
    const qNum = parseInt(qStr, 10)
    const meta = questionMetadata.find(m => m.questionNumber === qNum)
    const correctOpt = meta?.correctAnswer?.toUpperCase() || ''

    Object.entries(stat.optionCounts).forEach(([opt, count]) => {
      if (opt !== correctOpt && count > maxTrapCount) {
        maxTrapCount = count
        const selectedPct = Math.round((count / stat.totalCount) * 100)
        const customExplanation = meta?.misconceptionsByOption?.[opt]
        const defaultExplanation = `A alternativa ${opt} atraiu ${selectedPct}% dos alunos, indicando confusão conceitual recorrente na questão ${qNum}.`

        topTrap = {
          questionNumber: qNum,
          topic: stat.topic,
          trapOption: opt,
          selectedPercentage: selectedPct,
          explanation: customExplanation ? `Questão ${qNum}: ${customExplanation} (${selectedPct}% da turma escolheu a opção ${opt}).` : defaultExplanation
        }
      }
    })
  })

  // 5. Formulação da Chamada Pedagógica (Headline)
  let headline = ''
  if (masteredRatePercentage >= 70) {
    headline = `Excelente consolidação da turma: ${masteredRatePercentage}% dos alunos demonstraram domínio sólido em "${topic}".`
  } else if (masteredRatePercentage >= 45) {
    headline = `Turma em fase de consolidação: ${masteredRatePercentage}% dos alunos dominaram o construto central, com foco necessário nas etapas intermediárias.`
  } else {
    headline = `Atenção prioritária recomendada: apenas ${masteredRatePercentage}% da turma atingiu o domínio esperado em "${topic}". Sugere-se retomada conceitual.`
  }

  // 6. Sugestões de Intervenção Pedagógica (Linguagem Acolhedora e Acionável)
  const pedagogicalInterventions: string[] = []

  if (topTrap) {
    pedagogicalInterventions.push(
      `Dedique os primeiros 10 minutos da próxima aula para discutir especificamente a Questão ${topTrap.questionNumber}. Peça para alunos que acertaram explicarem por que a alternativa ${topTrap.trapOption} parecia certa mas não era.`
    )
  }

  if (growthAreas.length > 0) {
    const mainWeakness = growthAreas[0]
    pedagogicalInterventions.push(
      `Trabalhe atividades em duplas cooperativas focadas em "${mainWeakness.topicName}", onde ${100 - mainWeakness.masteryPercentage}% dos estudantes ainda apresentam dúvidas.`
    )
  }

  if (strengths.length > 0) {
    const mainStrength = strengths[0]
    pedagogicalInterventions.push(
      `Aproveite a segurança da turma em "${mainStrength.topicName}" (${mainStrength.masteryPercentage}% de acertos) como ponto de partida ou âncora para introduzir os tópicos mais desafiadores.`
    )
  }

  // 7. Formatação do Texto da Página Única
  const strengthsLines = strengths.map(s => `- **${s.topicName}:** ${s.masteryPercentage}% da turma demonstrou compreensão segura.`).join('\n')
  const growthLines = growthAreas.length > 0
    ? growthAreas.map(g => `- **${g.topicName}:** ${100 - g.masteryPercentage}% dos alunos necessitam de intervenção ou revisão guiada.`).join('\n')
    : '- Nenhum ponto crítico identificado; turma apresentou desempenho homogêneo acima da meta.'

  const trapLine = topTrap
    ? `**Principal Armadilha Identificada:**\n${topTrap.explanation}`
    : '**Armadilhas:** Não houve concentração anômala de erros em um distrator específico.'

  const interventionLines = pedagogicalInterventions.map((action, i) => `${i + 1}. ${action}`).join('\n')

  const formattedPageText = `
# 📋 Sumário Executivo Pedagógico (1 Página)
**Avaliação:** ${examTitle}
**Tópico Avaliado:** ${topic}
**Alunos Participantes:** ${totalEvaluated} &bull; **Taxa de Domínio Global:** ${masteredRatePercentage}%

---

### 🌟 Síntese da Turma
${headline}

---

### 📈 Pontos Fortes (O que a turma já dominou)
${strengthsLines}

---

### ⚠️ Oportunidades de Melhoria (Onde focar)
${growthLines}

---

### 🎯 Padrão de Erro Recorrente
${trapLine}

---

### 💡 Plano de Ação para a Próxima Aula
${interventionLines}
`.trim()

  return {
    examTitle,
    topic,
    classroomProfile: {
      totalEvaluated,
      averageMasteryPercentage,
      masteredRatePercentage,
      headline
    },
    strengths,
    growthAreas,
    topMisconceptionTrap: topTrap,
    pedagogicalInterventions,
    formattedPageText,
    generatedAt: Date.now()
  }
}
