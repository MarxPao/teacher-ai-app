/**
 * lib/formativeFeedbackRouter.ts — Roteamento de Feedback Formativo Imediato por Distrator Selecionado
 * Onda F — Fase F3
 * 
 * Base Teórica:
 * - Hattie, J., & Timperley, H. (2007). "The Power of Feedback." Review of Educational Research, 77(1), 81-112.
 * - Shute, V. J. (2008). "Focus on formative feedback." Review of Educational Research, 78(1), 153-189.
 * - Sadler, P. M., et al. (2013). "The influence of teachers' knowledge on student learning."
 *   American Educational Research Journal, 50(5), 1020-1049.
 * - Black, P., & Wiliam, D. (1998). "Assessment and classroom learning." Assessment in Education, 5(1), 7-74.
 * 
 * Princípio Metodológico:
 * Em avaliações formativas e adaptativas, a simples indicação de erro/acerto é insuficiente.
 * Cada distrator escolhido aciona um feedback imediato multidimensional estruturado nos 3 níveis
 * canônicos de Hattie & Timperley (2007):
 * 1. Nível de Tarefa (FT - Feedback about the Task): o que está correto/incorreto na resposta.
 * 2. Nível de Processo (FP - Feedback about the Processing of the Task): o mecanismo mental subjacente
 *    (bug conceitual ou heurística) e a estratégia correta de processamento.
 * 3. Nível de Auto-Regulação (FR - Feedback about Self-Regulation): pergunta reflexiva (scaffolding)
 *    que estimula o estudante a monitorar seu próprio raciocínio e metacognição.
 */

import { EditableQuestionItem } from '@/components/EditableQuestionBoxes'
import { COGNITIVE_ERROR_REGISTRY, CognitiveErrorType } from '@/lib/diagnosticDistractorEngine'
import { matchDistractorToCatalog } from '@/lib/misconceptionCatalog'

export type FormativeFeedbackLevel = 'task' | 'process' | 'self_regulation'

export interface ImmediateFormativeFeedback {
  chosenOption: string       // Letra escolhida ('A', 'B', 'C', 'D', ...)
  isCorrect: boolean
  feedbackTitle: string
  taskLevelFeedback: string        // FT: O que está certo/errado
  processLevelFeedback: string     // FP: Qual processo mental falhou e qual o correto
  selfRegulationPrompt: string     // FR: Pergunta metacognitiva / scaffolding
  cognitiveErrorType?: CognitiveErrorType
  errorLabel?: string
  remediationAction: string        // Ação corretiva prática imediata
  recommendedStudySnippet?: string
}

export interface ItemFormativeFeedbackMatrix {
  itemId: string
  correctLetter: string
  optionFeedbacks: Record<string, ImmediateFormativeFeedback>
  totalOptions: number
  coveredDistractorsCount: number
  coveragePercentage: number
  isFullyRouted: boolean
}

/**
 * Roteia e constrói o feedback formativo imediato para a alternativa selecionada pelo aluno.
 */
export function routeDistractorFeedback(params: {
  question: EditableQuestionItem
  chosenLetter: string
  studentTheta?: number
  subject?: string
}): ImmediateFormativeFeedback {
  const { question, chosenLetter, studentTheta = 0.0, subject = 'portuguese' } = params
  const normChosen = chosenLetter.trim().toUpperCase()
  const cleanAnswerKey = (question.answerKey || '').trim().toUpperCase()
  const options = question.options || []

  const chosenOpt = options.find(o => (o.letter || '').toUpperCase() === normChosen)
  const isCorrect = cleanAnswerKey.includes(normChosen)

  // 1. Cenário: Resposta Correta
  if (isCorrect) {
    const thetaNotice = studentTheta > 1.0
      ? 'Excelente domínio conceitual! Você demonstrou autonomia completa nesta habilidade.'
      : 'Parabéns pelo acerto! Raciocínio alinhado ao padrão da norma/critério.'

    return {
      chosenOption: normChosen,
      isCorrect: true,
      feedbackTitle: '🎉 Resposta Correta!',
      taskLevelFeedback: `A alternativa (${normChosen}) está plenamente correta: ${chosenOpt?.text || 'critério atendido'}.`,
      processLevelFeedback: `Seu processo de resolução aplicou a regra conceitual correta. ${thetaNotice}`,
      selfRegulationPrompt: 'Você conseguiria explicar para um colega por que as outras alternativas estão incorretas?',
      remediationAction: 'Continue avançando para o próximo tópico ou explore itens de maior profundidade analítica.',
      recommendedStudySnippet: question.answerKey || undefined
    }
  }

  // 2. Cenário: Distrator Selecionado (Resposta Incorreta)
  const optText = chosenOpt?.text || ''
  const optTextLower = optText.toLowerCase()

  // Consulta se o distrator foi catalogado previamente em diagnosticDistractors
  const preModelled = question.diagnosticDistractors?.find(d => d.letter.toUpperCase() === normChosen)
  const catalogMatch = matchDistractorToCatalog(optText, subject)

  let errorType: CognitiveErrorType = preModelled?.errorType || 'surface_heuristic'
  let cognitiveFlaw = preModelled?.cognitiveMechanism || ''
  let remediationHint = preModelled?.remediationHint || ''

  if (catalogMatch) {
    if (!cognitiveFlaw) cognitiveFlaw = catalogMatch.cognitiveFlaw
    if (!remediationHint) remediationHint = catalogMatch.remediationAdvice
    if (!preModelled?.errorType) {
      if (catalogMatch.id.includes('FALSE_COGNATE')) errorType = 'l1_interference'
      else if (catalogMatch.id.includes('ONDE_TEMPORAL') || catalogMatch.id.includes('CRASE')) errorType = 'overgeneralization'
      else if (catalogMatch.id.includes('INVERSION') || catalogMatch.id.includes('REGENCIA')) errorType = 'concept_inversion'
    }
  } else if (!preModelled) {
    if (optTextLower.includes('actually') || optTextLower.includes('pretend') || optTextLower.includes('atualmente')) {
      errorType = 'l1_interference'
      cognitiveFlaw = 'Interferência morfológica direta da língua materna (falso cognato).'
      remediationHint = 'Verifique o sentido real do termo no dicionário antes de assumir semelhança com o português.'
    } else if (optTextLower.includes('onde') || optTextLower.includes('aonde') || optTextLower.includes('à ')) {
      errorType = 'overgeneralization'
      cognitiveFlaw = 'Aplicação generalizada de regra sem respeitar suas condições de contorno ou restrições.'
      remediationHint = 'Lembre-se das exceções e restrições específicas de uso dessa estrutura.'
    } else if (optTextLower.includes('porque') || optTextLower.includes('oposto') || optTextLower.includes('inverso')) {
      errorType = 'concept_inversion'
      cognitiveFlaw = 'Inversão da relação de causa e efeito ou dos papéis sintáticos.'
      remediationHint = 'Mapeie claramente quem pratica a ação e quem sofre o efeito antes de decidir.'
    }
  }

  const meta = COGNITIVE_ERROR_REGISTRY[errorType]
  const errorLabel = meta.label
  const mechanism = cognitiveFlaw || meta.typicalMechanism
  const advice = remediationHint || meta.pedagogicalRemediation

  // Scaffolding metacognitivo personalizado por tipo de erro
  let selfRegulationPrompt = 'Qual pista do texto você utilizou para escolher esta alternativa?'
  if (errorType === 'overgeneralization') {
    selfRegulationPrompt = 'Esta regra vale para todas as situações ou há restrições de contexto aqui?'
  } else if (errorType === 'concept_inversion') {
    selfRegulationPrompt = 'Quem determina quem nesta relação? A ordem dos fatores altera o sentido?'
  } else if (errorType === 'l1_interference') {
    selfRegulationPrompt = 'A palavra parece com o português, mas será que ela realmente tem o mesmo significado?'
  } else if (errorType === 'surface_heuristic') {
    selfRegulationPrompt = 'Você escolheu essa opção por ter lido palavras parecidas no enunciado ou após analisar a lógica?'
  } else if (errorType === 'incomplete_rule') {
    selfRegulationPrompt = 'Faltou alguma etapa intermediária antes de chegar a essa conclusão?'
  }

  // Adaptação para estudantes com proficiência mais baixa (scaffolding mais acolhedor)
  const taskLevel = `A alternativa (${normChosen}) não está correta: "${optText}".`
  const processLevel = `Diagnóstico Cognitivo [${errorLabel}]: ${mechanism}`
  const remediation = `Sugestão de Estudo Imediato: ${advice}`

  return {
    chosenOption: normChosen,
    isCorrect: false,
    feedbackTitle: `💡 Feedback Formativo: ${errorLabel}`,
    taskLevelFeedback: taskLevel,
    processLevelFeedback: processLevel,
    selfRegulationPrompt,
    cognitiveErrorType: errorType,
    errorLabel,
    remediationAction: remediation,
    recommendedStudySnippet: question.stem.slice(0, 80) + '...'
  }
}

/**
 * Gera a matriz completa de feedbacks formativos para todas as opções de uma questão.
 */
export function generateItemFeedbackMatrix(
  question: EditableQuestionItem,
  subject?: string
): ItemFormativeFeedbackMatrix {
  const options = question.options || []
  const cleanAnswerKey = (question.answerKey || '').trim().toUpperCase()

  let correctLetter = 'A'
  options.forEach((o, idx) => {
    const l = (o.letter || String.fromCharCode(65 + idx)).toUpperCase()
    if (cleanAnswerKey.includes(l)) {
      correctLetter = l
    }
  })

  const optionFeedbacks: Record<string, ImmediateFormativeFeedback> = {}
  let coveredCount = 0

  options.forEach((opt, idx) => {
    const letter = (opt.letter || String.fromCharCode(65 + idx)).toUpperCase()
    const feedback = routeDistractorFeedback({
      question,
      chosenLetter: letter,
      subject
    })
    optionFeedbacks[letter] = feedback
    if (!feedback.isCorrect && feedback.cognitiveErrorType) {
      coveredCount++
    }
  })

  const totalDistractors = Math.max(1, options.length - 1)
  const coveragePercentage = Math.round((coveredCount / totalDistractors) * 100)
  const isFullyRouted = coveredCount === totalDistractors && options.length >= 2

  return {
    itemId: question.id || `q_${question.number}`,
    correctLetter,
    optionFeedbacks,
    totalOptions: options.length,
    coveredDistractorsCount: coveredCount,
    coveragePercentage,
    isFullyRouted
  }
}
