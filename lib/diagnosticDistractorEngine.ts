/**
 * lib/diagnosticDistractorEngine.ts — Geração Dinâmica de Distratores com Modelagem de Erro Cognitivo
 * Onda F — Fase F1
 * 
 * Base Teórica:
 * - Sadler, P. M., et al. (2013). "The influence of teachers' knowledge on student learning."
 *   American Educational Research Journal, 50(5), 1020-1049.
 * - Haladyna, T. M., Downing, S. M., & Rodriguez, M. C. (2002). "A review of multiple-choice
 *   item-writing guidelines." Applied Measurement in Education, 15(3), 309-333.
 * - DiBattista, D., & Kurzawa, L. (2011). "Examination of the quality of multiple-choice items
 *   on classroom tests." The Canadian Journal for the Scholarship of Teaching and Learning, 2(2).
 * - Gierl, M. J., Bulut, O., Guo, Q., & Zhang, X. (2017). "Developing, Analyzing, and Using
 *   Distractors for Multiple-Choice Tests in Education." Review of Educational Research, 87(6), 1082-1116.
 * 
 * Princípio Psicométrico:
 * Um item de múltipla escolha só possui validade diagnóstica quando cada alternativa incorreta (distrator)
 * reflete uma hipótese de erro conceitual ou mecanismo cognitivo específico.
 * Distratores aleatórios ("fillers") ou implausíveis não fornecem informação sobre a proficiência (\theta),
 * violam as diretrizes de Haladyna et al. (2002) e devem ser estritamente eliminados da avaliação.
 */

import { EditableQuestionItem } from '@/components/EditableQuestionBoxes'
import { MISCONCEPTION_CATALOG, MisconceptionEntry, matchDistractorToCatalog } from '@/lib/misconceptionCatalog'
import { getSubjectProfile } from '@/lib/subjectProfile'

export type CognitiveErrorType =
  | 'overgeneralization'    // Hipergeneralização de regra válida a contextos onde ela não se aplica
  | 'concept_inversion'     // Inversão de premissas, papéis semânticos ou causalidade
  | 'l1_interference'       // Interferência léxica/sintática da língua materna (falsos cognatos, decalque)
  | 'surface_heuristic'     // Atalho mental superficial (associação por contiguidade ou palavra-chave)
  | 'incomplete_rule'       // Aplicação parcial de regra de múltiplos passos
  | 'computational_slip'    // Deslize em operação intermediária ou sinal aritmético

export interface CognitiveErrorMetadata {
  type: CognitiveErrorType
  label: string
  description: string
  typicalMechanism: string
  pedagogicalRemediation: string
}

export const COGNITIVE_ERROR_REGISTRY: Record<CognitiveErrorType, CognitiveErrorMetadata> = {
  overgeneralization: {
    type: 'overgeneralization',
    label: 'Hipergeneralização de Regra',
    description: 'Extensão indevida de uma regra válida a exceções ou domínios onde ela não se aplica.',
    typicalMechanism: 'O estudante internalizou a regra canônica mas ainda não mapeou seus limites de validade ou casos especiais.',
    pedagogicalRemediation: 'Apresentar pares contrastivos destacando as condições de contorno onde a regra padrão falha.'
  },
  concept_inversion: {
    type: 'concept_inversion',
    label: 'Inversão Conceitual / Causal',
    description: 'Troca da ordem de premissas, inversão de causa e efeito ou confusão de papéis semânticos/sintáticos.',
    typicalMechanism: 'O estudante compreende os elementos envolvidos mas inverte o vetor de dependência ou direcionalidade relacional.',
    pedagogicalRemediation: 'Utilizar diagramas de fluxo ou esquemas relacionais destacando explicitamente a direcionalidade agente-paciente ou causa-efeito.'
  },
  l1_interference: {
    type: 'l1_interference',
    label: 'Interferência de L1 (Língua Materna)',
    description: 'Decalque de estruturas gramaticais ou atribuição de sentido por semelhança morfológica com a língua nativa.',
    typicalMechanism: 'Ativação automática de esquemas da língua materna sem inibição lexical ou checagem sintática no idioma-alvo.',
    pedagogicalRemediation: 'Trabalhar explicitamente falsos amigos e matrizes de discrepância estrutural L1 vs L2.'
  },
  surface_heuristic: {
    type: 'surface_heuristic',
    label: 'Heurística Superficial / Atalho Mental',
    description: 'Escolha guiada por semelhança superficial de palavras-chave, tamanho de alternativa ou contiguidade textual.',
    typicalMechanism: 'O estudante evita o custo cognitivo do raciocínio analítico, recorrendo ao Sistema 1 (Kahneman) baseado em familiaridade rápida.',
    pedagogicalRemediation: 'Construir distratores que usem termos familiares do enunciado de forma incorreta e correções com formulações originais.'
  },
  incomplete_rule: {
    type: 'incomplete_rule',
    label: 'Regra Incompleta / Passo Truncado',
    description: 'Execução bem-sucedida do passo inicial com abandono ou truncamento do passo subsequente obrigatório.',
    typicalMechanism: 'Sobrecarga de memória de trabalho levando ao encerramento precoce da resolução assim que o primeiro resultado intermediário surge.',
    pedagogicalRemediation: 'Estruturar checklists procedimentais e destacar o resultado final versus intermediário.'
  },
  computational_slip: {
    type: 'computational_slip',
    label: 'Deslize Operacional / Aritmético',
    description: 'Erro de cálculo aritmético, troca de sinal ou descuido posicional em etapa intermediária.',
    typicalMechanism: 'Lapsos atencionais em operações mecânicas, mantendo o raciocínio conceitual correto.',
    pedagogicalRemediation: 'Estimular conferência por estimativa de grandeza antes do cálculo detalhado.'
  }
}

export interface DiagnosticDistractor {
  letter: string
  text: string
  errorType: CognitiveErrorType
  errorLabel: string
  misconceptionId?: string
  cognitiveMechanism: string
  remediationHint: string
  plausibilityScore: number       // 0.0 a 1.0 (atratividade diagnóstica para \theta <= 0)
  targetProficiencyBand: 'abaixo_basico' | 'basico' | 'intermediario'
}

export interface DiagnosticItemDistractorAnalysis {
  itemId: string
  stem: string
  correctAnswer: {
    letter: string
    text: string
  }
  distractors: DiagnosticDistractor[]
  totalDistractors: number
  cognitiveDistractorsCount: number
  unmappedDistractorsCount: number
  diagnosticCoverageRate: number  // 0.0 a 1.0
  diagnosticCoveragePercentage: number // 0 a 100
  hasOnlyCognitiveDistractors: boolean
  qualityRating: 'padrao_ouro' | 'adequado' | 'insuficiente'
  summaryFeedback: string
}

/**
 * Cria e valida um distrator diagnóstico ancorado em modelo de erro cognitivo.
 */
export function modelCognitiveDistractor(params: {
  letter: string
  text: string
  errorType: CognitiveErrorType
  misconceptionId?: string
  customMechanism?: string
  customRemediation?: string
  plausibilityScore?: number
  targetProficiencyBand?: 'abaixo_basico' | 'basico' | 'intermediario'
}): DiagnosticDistractor {
  const meta = COGNITIVE_ERROR_REGISTRY[params.errorType]
  const plausibility = Math.max(0.10, Math.min(0.95, params.plausibilityScore ?? 0.30))

  return {
    letter: params.letter.toUpperCase(),
    text: params.text.trim(),
    errorType: params.errorType,
    errorLabel: meta.label,
    misconceptionId: params.misconceptionId,
    cognitiveMechanism: params.customMechanism || meta.typicalMechanism,
    remediationHint: params.customRemediation || meta.pedagogicalRemediation,
    plausibilityScore: Number(plausibility.toFixed(2)),
    targetProficiencyBand: params.targetProficiencyBand || 'basico'
  }
}

/**
 * Analisa e audita os distratores de uma questão contra a taxonomia de erros cognitivos e o catálogo de misconceptions.
 */
export function auditQuestionDistractorDiagnostics(
  question: EditableQuestionItem,
  subject?: string
): DiagnosticItemDistractorAnalysis {
  const options = question.options || []
  const cleanAnswerKey = (question.answerKey || '').trim().toUpperCase()
  const activeSubject = subject || 'portuguese'

  let correctLetter = 'A'
  let correctText = ''
  const incorrectOptions: Array<{ letter: string; text: string }> = []

  options.forEach((opt, idx) => {
    const letter = (opt.letter || String.fromCharCode(65 + idx)).toUpperCase()
    const isCorrect = cleanAnswerKey.includes(letter)
    if (isCorrect && !correctText) {
      correctLetter = letter
      correctText = opt.text
    } else {
      incorrectOptions.push({ letter, text: opt.text })
    }
  })

  // Se não identificou o gabarito pelas letras, assume a primeira como gabarito provisório
  if (!correctText && options.length > 0) {
    correctLetter = (options[0].letter || 'A').toUpperCase()
    correctText = options[0].text
    incorrectOptions.shift()
  }

  const distractors: DiagnosticDistractor[] = []
  let unmappedCount = 0

  incorrectOptions.forEach(opt => {
    const textLower = opt.text.toLowerCase()
    
    // 1. Tenta correspondência direta no Catálogo de Misconceptions
    const catalogMatch = matchDistractorToCatalog(opt.text, activeSubject)

    if (catalogMatch) {
      // Infere o CognitiveErrorType a partir da misconception
      let errorType: CognitiveErrorType = 'overgeneralization'
      if (catalogMatch.id.includes('FALSE_COGNATE')) {
        errorType = 'l1_interference'
      } else if (catalogMatch.id.includes('ONDE_TEMPORAL') || catalogMatch.id.includes('CRASE')) {
        errorType = 'overgeneralization'
      } else if (catalogMatch.id.includes('INVERSION') || catalogMatch.id.includes('REGENCIA')) {
        errorType = 'concept_inversion'
      }

      distractors.push(
        modelCognitiveDistractor({
          letter: opt.letter,
          text: opt.text,
          errorType,
          misconceptionId: catalogMatch.id,
          customMechanism: catalogMatch.cognitiveFlaw,
          customRemediation: catalogMatch.remediationAdvice,
          plausibilityScore: 0.35,
          targetProficiencyBand: 'basico'
        })
      )
      return
    }

    // 2. Heurística de classificação baseada em marcadores léxicos e padrões
    if (textLower.includes('actually') || textLower.includes('pretend') || textLower.includes('atualmente') || textLower.includes('pretender')) {
      distractors.push(
        modelCognitiveDistractor({
          letter: opt.letter,
          text: opt.text,
          errorType: 'l1_interference',
          customMechanism: 'Interferência lexical direta da língua materna (falso cognato).',
          plausibilityScore: 0.32
        })
      )
    } else if (textLower.includes('onde ') || textLower.includes('aonde ') || textLower.includes('à ')) {
      distractors.push(
        modelCognitiveDistractor({
          letter: opt.letter,
          text: opt.text,
          errorType: 'overgeneralization',
          customMechanism: 'Hipergeneralização de regra gramatical a contexto não-permitido.',
          plausibilityScore: 0.30
        })
      )
    } else if (textLower.includes('porque') || textLower.includes('por que') || textLower.includes('inverso') || textLower.includes('oposto')) {
      distractors.push(
        modelCognitiveDistractor({
          letter: opt.letter,
          text: opt.text,
          errorType: 'concept_inversion',
          customMechanism: 'Inversão da relação causal ou lógica entre os termos.',
          plausibilityScore: 0.28
        })
      )
    } else if (opt.text.length > 80 && (question.stem.toLowerCase().includes('qual') || question.stem.toLowerCase().includes('assinale'))) {
      distractors.push(
        modelCognitiveDistractor({
          letter: opt.letter,
          text: opt.text,
          errorType: 'surface_heuristic',
          customMechanism: 'Heurística superficial de escolher a alternativa com maior extensão ou detalhes.',
          plausibilityScore: 0.22,
          targetProficiencyBand: 'abaixo_basico'
        })
      )
    } else {
      unmappedCount++
      // Registra como distrator sem modelo cognitivo explícito (filler potencial)
      distractors.push({
        letter: opt.letter,
        text: opt.text,
        errorType: 'surface_heuristic',
        errorLabel: 'Distrator Não-Modelado (Filler Potencial)',
        cognitiveMechanism: 'Distrator genérico sem ancoragem conceitual em modelo de erro documentado.',
        remediationHint: 'Reescrever o distrator para refletir uma concepção alternativa específica do tópico.',
        plausibilityScore: 0.15,
        targetProficiencyBand: 'abaixo_basico'
      })
    }
  })

  const totalDistractors = incorrectOptions.length
  const cognitiveCount = totalDistractors - unmappedCount
  const coverageRate = totalDistractors > 0 ? Number((cognitiveCount / totalDistractors).toFixed(2)) : 1.0
  const coveragePercentage = Math.round(coverageRate * 100)
  const hasOnlyCognitiveDistractors = unmappedCount === 0 && totalDistractors > 0

  let qualityRating: DiagnosticItemDistractorAnalysis['qualityRating'] = 'insuficiente'
  let summaryFeedback = ''

  if (hasOnlyCognitiveDistractors && totalDistractors >= 3) {
    qualityRating = 'padrao_ouro'
    summaryFeedback = 'Excelente: 100% dos distratores modelam erros cognitivos documentados (zero fillers).'
  } else if (coverageRate >= 0.65) {
    qualityRating = 'adequado'
    summaryFeedback = `Adequado: ${coveragePercentage}% dos distratores ancorados em modelos de erro (${unmappedCount} distrator(es) aprimorável(is)).`
  } else {
    qualityRating = 'insuficiente'
    summaryFeedback = `Atenção: Apenas ${coveragePercentage}% dos distratores possuem diagnóstico conceitual. Alto risco de alternativas implausíveis (fillers).`
  }

  return {
    itemId: question.id || `q_${question.number}`,
    stem: question.stem,
    correctAnswer: {
      letter: correctLetter,
      text: correctText
    },
    distractors,
    totalDistractors,
    cognitiveDistractorsCount: cognitiveCount,
    unmappedDistractorsCount: unmappedCount,
    diagnosticCoverageRate: coverageRate,
    diagnosticCoveragePercentage: coveragePercentage,
    hasOnlyCognitiveDistractors,
    qualityRating,
    summaryFeedback
  }
}

/**
 * Gera dinamicamente um conjunto de distratores diagnósticos completos para uma questão,
 * ancorados na matéria e tópico especificados.
 */
export function generateDiagnosticDistractorsForStem(params: {
  stem: string
  correctAnswerText: string
  correctLetter?: string
  subject: 'portuguese' | 'english' | 'math' | 'science'
  topic: string
}): DiagnosticDistractor[] {
  const { stem, correctAnswerText, correctLetter = 'A', subject, topic } = params

  // 1. Busca concepções alternativas disponíveis no catálogo para a matéria
  const relevantMisconceptions = MISCONCEPTION_CATALOG.filter(
    m => m.subject === subject && (m.topic.toLowerCase().includes(topic.toLowerCase()) || topic.toLowerCase().includes(m.topic.toLowerCase()))
  )

  const letters = ['A', 'B', 'C', 'D'].filter(l => l !== correctLetter.toUpperCase())
  const generated: DiagnosticDistractor[] = []

  // Se houver misconceptions catalogadas para o tópico, usa seus exemplos reais
  if (relevantMisconceptions.length > 0) {
    relevantMisconceptions.slice(0, letters.length).forEach((mis, idx) => {
      const letter = letters[idx]
      const exampleText = mis.distractorExamples[0] || `Alternativa baseada em ${mis.name}`
      
      let errorType: CognitiveErrorType = 'overgeneralization'
      if (mis.id.includes('FALSE_COGNATE')) errorType = 'l1_interference'
      else if (mis.id.includes('INVERSION') || mis.id.includes('REGENCIA')) errorType = 'concept_inversion'

      generated.push(
        modelCognitiveDistractor({
          letter,
          text: exampleText,
          errorType,
          misconceptionId: mis.id,
          customMechanism: mis.cognitiveFlaw,
          customRemediation: mis.remediationAdvice,
          plausibilityScore: 0.35,
          targetProficiencyBand: 'basico'
        })
      )
    })
  }

  // Preenche distratores restantes com padrões cognitivos fundamentados
  const fallbackPatterns: Array<{ type: CognitiveErrorType; textSuffix: string; mechanism: string; remediation: string }> = [
    {
      type: 'overgeneralization',
      textSuffix: 'aplicando a regra de forma irrestrita sem considerar as exceções do contexto',
      mechanism: 'Hipergeneralização da regra padrão para contextos restritos.',
      remediation: 'Revisar os limites e exceções de aplicação da regra.'
    },
    {
      type: 'concept_inversion',
      textSuffix: 'invertendo a ordem das premissas ou a relação de causalidade apresentada',
      mechanism: 'Inversão da direcionalidade lógica ou relação de causa e efeito.',
      remediation: 'Identificar explicitamente qual termo determina o outro na relação.'
    },
    {
      type: 'incomplete_rule',
      textSuffix: 'executando apenas a primeira etapa da análise e interrompendo o raciocínio',
      mechanism: 'Aplicação parcial do procedimento por sobrecarga de memória de trabalho.',
      remediation: 'Checar se todas as etapas do procedimento foram concluídas antes de assinalar.'
    }
  ]

  while (generated.length < letters.length) {
    const idx = generated.length
    const letter = letters[idx]
    const pattern = fallbackPatterns[idx % fallbackPatterns.length]
    
    generated.push(
      modelCognitiveDistractor({
        letter,
        text: `${correctAnswerText.slice(0, 25)}... (${pattern.textSuffix})`,
        errorType: pattern.type,
        customMechanism: pattern.mechanism,
        customRemediation: pattern.remediation,
        plausibilityScore: 0.28,
        targetProficiencyBand: 'intermediario'
      })
    )
  }

  return generated
}
