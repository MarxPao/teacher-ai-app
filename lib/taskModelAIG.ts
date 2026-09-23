/**
 * lib/taskModelAIG.ts — Automatic Item Generation (AIG) e Modelos de Tarefa (Task Models)
 * 
 * Base Teórica:
 * - Irvine, S. H., & Kyllonen, P. C. (2002). "Generating Items for Cognitive Tests: Theory and Practice."
 * - Gierl, M. J., & Haladyna, T. M. (2012). "Automatic Item Generation: Theory and Practice." Routledge.
 * - Fischer, G. H. (1973). "The linear logistic test model as an instrument in educational research."
 *   Acta Psychologica, 37(6), 359-374.
 * 
 * O Modelo Logístico Linear de Teste (LLTM) decompõe o parâmetro de dificuldade (b_j)
 * de um item na soma ponderada da carga cognitiva de seus "radicais" estruturais:
 * 
 *   b_j = c + \sum_{m=1}^M \eta_m \cdot f_{jm}
 * 
 * onde:
 * - c: Constante basal da família de tarefas
 * - \eta_m: Peso cognitivo (contribuição à dificuldade) do radical m
 * - f_{jm} \in {0, 1}: Indicador binário de presença do radical m no item j
 * - Incidentais: Variações contextuais superficiais (ex: nomes, cenários) que não afetam b_j
 */

export interface RadicalFactor {
  id: string
  name: string
  description: string
  weightEta: number // \eta_m na equação LLTM
  detect: (stem: string, options?: Array<{ letter?: string; text: string }>) => boolean
}

export interface IncidentalElement {
  id: string
  name: string
  category: 'context_setting' | 'real_world_domain' | 'character_name'
  examples: string[]
}

export interface TaskModel {
  id: string
  subject: string
  topic: string
  baseConstantC: number
  radicals: RadicalFactor[]
  incidentals: IncidentalElement[]
}

export interface DifficultyFactorExplanation {
  name: string
  impact: string
  description?: string
}

export interface DifficultyExplanation {
  summary: string
  activeFactors: DifficultyFactorExplanation[]
  confidenceLevel: 'alta' | 'moderada' | 'basica'
  confidenceLabel: string
  plainTextExplanation: string
}

export interface PredictedDifficultyResult {
  predictedDifficulty: number // b_j em escala logit (-3.0 a +3.0)
  difficultyLevel: 'facil' | 'medio' | 'dificil' | 'desafio'
  activeRadicals: Array<{ id: string; name: string; weightEta: number }>
  baseConstant: number
  formulaString: string
  isEmpiricallyCalibrated: false
  label: string
  explanation: DifficultyExplanation
}

// ─── MODELOS DE TAREFA PADRONIZADOS ──────────────────────────────────────────

export const MATH_FRACTIONS_TASK_MODEL: TaskModel = {
  id: 'TM_MATH_FRACTIONS',
  subject: 'Matemática',
  topic: 'Frações e Operações Racionais',
  baseConstantC: -1.20,
  radicals: [
    {
      id: 'fractions_same_denom',
      name: 'Denominadores Iguais',
      description: 'Adição ou subtração com mesmo denominador',
      weightEta: 0.40,
      detect: (stem) => /\b(mesmo\s+denominador|denominadores\s+iguais|\/\s*(\d+)\s*[\+\-]\s*\d+\s*\/\s*\2)\b/i.test(stem)
    },
    {
      id: 'fractions_diff_prime_denom',
      name: 'Denominadores Primos Distintos',
      description: 'Exige MMC entre denominadores coprimos (ex: 3 e 5, 7 e 2)',
      weightEta: 0.95,
      detect: (stem, options) => {
        const full = `${stem} ${(options || []).map(o => o.text).join(' ')}`
        return /\b(denominadores\s+(diferentes|distintos|primos)|mmc|\b(1\/3|2\/3|1\/5|2\/5|3\/5|1\/7|3\/7)\b)/i.test(full)
      }
    },
    {
      id: 'variable_in_denominator',
      name: 'Incógnita Fracionária',
      description: 'Presença de variável x no denominador (equação fracionária)',
      weightEta: 1.55,
      detect: (stem, options) => {
        const full = `${stem} ${(options || []).map(o => o.text).join(' ')}`
        return /\b(\/\s*x|\/\s*\([a-z]\s*[\+\-]|equação\s+fracionária)\b/i.test(full)
      }
    }
  ],
  incidentals: [
    {
      id: 'context_recipes',
      name: 'Culinária / Receitas',
      category: 'real_world_domain',
      examples: ['xícara de farinha', 'litro de leite', 'porções de bolo']
    },
    {
      id: 'context_finance',
      name: 'Orçamento / Salário',
      category: 'real_world_domain',
      examples: ['do salário gasto em aluguel', 'do orçamento para lazer']
    }
  ]
}

export const ENGLISH_PRESENT_PERFECT_TASK_MODEL: TaskModel = {
  id: 'TM_EN_PRESENT_PERFECT',
  subject: 'Língua Inglesa',
  topic: 'Present Perfect vs Simple Past',
  baseConstantC: -1.00,
  radicals: [
    {
      id: 'regular_participle',
      name: 'Particípio Regular (-ed)',
      description: 'Verbos regulares previsíveis (played, worked, lived)',
      weightEta: 0.35,
      detect: (stem, options) => {
        const full = `${stem} ${(options || []).map(o => o.text).join(' ')}`
        return /\b(worked|played|visited|lived|studied)\b/i.test(full)
      }
    },
    {
      id: 'irregular_participle',
      name: 'Particípio Irregular',
      description: 'Verbos irregulares de alta demanda mnêmica (seen, written, gone, driven)',
      weightEta: 0.75,
      detect: (stem, options) => {
        const full = `${stem} ${(options || []).map(o => o.text).join(' ')}`
        return /\b(seen|written|gone|been|eaten|spoken|driven|chosen|broken)\b/i.test(full)
      }
    },
    {
      id: 'duration_since_for',
      name: 'Duração Temporal (Since / For)',
      description: 'Contraste aspectual de tempo não concluído com marcadores de duração',
      weightEta: 0.90,
      detect: (stem, options) => {
        const full = `${stem} ${(options || []).map(o => o.text).join(' ')}`
        return /\b(since\s+(19\d\d|20\d\d|[a-z]+)|for\s+(\d+|many|several)\s+(years|months|days|hours))\b/i.test(full)
      }
    },
    {
      id: 'contrastive_past_adverb',
      name: 'Contraste com Advérbio Pontual de Passado',
      description: 'Exige diferenciar Present Perfect de Simple Past com yesterday, last year, ago',
      weightEta: 1.25,
      detect: (stem, options) => {
        const full = `${stem} ${(options || []).map(o => o.text).join(' ')}`
        return /\b(yesterday|last\s+(night|year|month|week)|in\s+20\d\d|\bago\b)\b/i.test(full)
      }
    }
  ],
  incidentals: [
    {
      id: 'incidental_travel',
      name: 'Experiências de Viagem',
      category: 'context_setting',
      examples: ['visited Paris', 'traveled to Japan', 'flown on an airplane']
    },
    {
      id: 'incidental_hobbies',
      name: 'Hobbies e Leitura',
      category: 'context_setting',
      examples: ['read three books', 'learned to play the guitar']
    }
  ]
}

export const PORTUGUESE_REGENCY_CRASIS_TASK_MODEL: TaskModel = {
  id: 'TM_PT_REGENCY_CRASIS',
  subject: 'Língua Portuguesa',
  topic: 'Regência Verbal e Crase',
  baseConstantC: -0.90,
  radicals: [
    {
      id: 'direct_transitive',
      name: 'Transitividade Direta Básica',
      description: 'Complemento sem preposição',
      weightEta: 0.20,
      detect: (stem, options) => {
        const full = `${stem} ${(options || []).map(o => o.text).join(' ')}`
        return /\b(objeto\s+direto|transitivo\s+direto|vtd)\b/i.test(full)
      }
    },
    {
      id: 'polysemic_verb_shift',
      name: 'Verbo Polissêmico de Dupla Regência',
      description: 'Verbos como assistir (ver vs ajudar) ou aspirar (desejar vs inalar)',
      weightEta: 0.85,
      detect: (stem, options) => {
        const full = `${stem} ${(options || []).map(o => o.text).join(' ')}`
        return /\b(assistir|aspirar|visar|obedecer|preferir)\b/i.test(full)
      }
    },
    {
      id: 'crasis_demonstrative',
      name: 'Crase com Pronomes Demonstrativos ou Palavra Masculina',
      description: 'Casos especiais: àquele(a), crase proibida antes de masculino/verbo',
      weightEta: 1.30,
      detect: (stem, options) => {
        const full = `${stem} ${(options || []).map(o => o.text).join(' ')}`
        return /\b(àquele|àquela|àquilo|antes\s+de\s+verbo|palavra\s+masculina|crase\s+(proibida|facultativa))\b/i.test(full)
      }
    }
  ],
  incidentals: [
    {
      id: 'context_cinema_work',
      name: 'Cinema e Ambiente de Trabalho',
      category: 'context_setting',
      examples: ['assistir ao filme', 'aspirar ao cargo de diretor']
    }
  ]
}

export const REGISTERED_TASK_MODELS: TaskModel[] = [
  MATH_FRACTIONS_TASK_MODEL,
  ENGLISH_PRESENT_PERFECT_TASK_MODEL,
  PORTUGUESE_REGENCY_CRASIS_TASK_MODEL
]

/**
 * Localiza o modelo de tarefa mais compatível com a matéria, tópico e enunciado informados.
 */
export function findTaskModelForSubjectAndTopic(subject?: string, topic?: string, stemText?: string): TaskModel | null {
  const normSubject = (subject || '').toLowerCase()
  const normTopic = (topic || '').toLowerCase()
  const normStem = (stemText || '').toLowerCase()

  for (const tm of REGISTERED_TASK_MODELS) {
    if (
      (normSubject && tm.subject.toLowerCase().includes(normSubject)) ||
      (normTopic && tm.topic.toLowerCase().includes(normTopic))
    ) {
      return tm
    }
  }

  // Fallback heurístico por palavras-chave no tópico ou no próprio enunciado
  const combined = `${normTopic} ${normStem}`
  if (combined.includes('fraç') || combined.includes('matemát') || combined.includes('racion') || combined.includes('denominador') || combined.includes('mmc')) {
    return MATH_FRACTIONS_TASK_MODEL
  }
  if (combined.includes('perfect') || combined.includes('english') || combined.includes('inglês') || combined.includes('past') || combined.includes('participle')) {
    return ENGLISH_PRESENT_PERFECT_TASK_MODEL
  }
  if (combined.includes('regência') || combined.includes('crase') || combined.includes('português')) {
    return PORTUGUESE_REGENCY_CRASIS_TASK_MODEL
  }

  return null
}

/**
 * Gera a explicação em linguagem simples da previsão de dificuldade (Onda A - Fase A4),
 * conectando diretamente aos radicais cognitivos ativos do item e à constante do modelo.
 */
export function generateDifficultyExplanation(
  predictedDifficulty: number,
  difficultyLevel: 'facil' | 'medio' | 'dificil' | 'desafio',
  activeRadicals: Array<{ id: string; name: string; weightEta: number }>,
  baseConstant: number,
  taskModel: TaskModel | null
): DifficultyExplanation {
  const levelLabels = {
    facil: 'Fácil',
    medio: 'Médio',
    dificil: 'Difícil',
    desafio: 'Desafio'
  }

  if (activeRadicals.length > 0) {
    const factorNames = activeRadicals.map(r => r.name).join(', ')
    const activeFactors: DifficultyFactorExplanation[] = activeRadicals.map(r => {
      const sign = r.weightEta >= 0 ? '+' : ''
      const impactDescription = r.weightEta >= 0.8
        ? 'forte aumento na carga cognitiva'
        : r.weightEta >= 0.4
          ? 'aumento moderado de complexidade'
          : 'pequeno acréscimo operacional'
      return {
        name: r.name,
        impact: `${sign}${r.weightEta.toFixed(2)} logits`,
        description: `${impactDescription} (${r.name})`
      }
    })

    const summary = `Classificada como ${levelLabels[difficultyLevel]} devido à presença de ${activeRadicals.length} característica(s) de complexidade no enunciado: ${factorNames}.`
    const plainTextExplanation = `A dificuldade prevista (${predictedDifficulty >= 0 ? '+' : ''}${predictedDifficulty.toFixed(2)} logits - ${levelLabels[difficultyLevel]}) reflete os elementos ativos detectados no item: ${activeRadicals.map(r => `${r.name} (${r.weightEta >= 0 ? '+' : ''}${r.weightEta.toFixed(2)} logits)`).join(', ')}, somados à complexidade de base do tópico (${baseConstant >= 0 ? '+' : ''}${baseConstant.toFixed(2)} logits).`

    return {
      summary,
      activeFactors,
      confidenceLevel: 'alta',
      confidenceLabel: 'Confiança Teórica Alta',
      plainTextExplanation
    }
  }

  // Sem radicais específicos ativos
  const summary = `Classificada no nível de referência basal (${levelLabels[difficultyLevel]}), pois o enunciado não apresenta fatores adicionais de complexidade algorítmica ou sintática mapeados.`
  const plainTextExplanation = `A dificuldade prevista (${predictedDifficulty >= 0 ? '+' : ''}${predictedDifficulty.toFixed(2)} logits - ${levelLabels[difficultyLevel]}) corresponde à constante base de referência do tópico (${baseConstant >= 0 ? '+' : ''}${baseConstant.toFixed(2)} logits). Não foram identificados fatores de complexidade suplementar no texto da questão.`

  return {
    summary,
    activeFactors: [],
    confidenceLevel: taskModel ? 'moderada' : 'basica',
    confidenceLabel: taskModel ? 'Confiança Teórica Padrão' : 'Estimativa Inicial Genérica',
    plainTextExplanation
  }
}

// Cache de memoização LRU/Map para previsões a priori de dificuldade via LLTM
const PREDICT_DIFFICULTY_CACHE = new Map<string, PredictedDifficultyResult>()
const MAX_PREDICT_DIFFICULTY_CACHE_SIZE = 1000

/**
 * Previsão de Dificuldade A Priori via LLTM (Fischer, 1973):
 *   b_j = c + \sum \eta_m \cdot f_{jm}
 * Utiliza cache de memoização para lookup O(1) em passadas subsequentes de edição.
 */
export function predictItemDifficulty(
  stem: string,
  options?: Array<{ letter?: string; text: string }>,
  modelOrSubject?: TaskModel | string,
  topic?: string
): PredictedDifficultyResult {
  const normStem = (stem || '').trim()
  const optsKey = (options || []).map(o => `${o.letter || ''}:${o.text || ''}`).join('|')
  const modelKey = typeof modelOrSubject === 'string' ? modelOrSubject : modelOrSubject?.id || 'none'
  const cacheKey = `${modelKey}:::${topic || ''}:::${normStem}:::${optsKey}`

  const cached = PREDICT_DIFFICULTY_CACHE.get(cacheKey)
  if (cached) return cached

  let taskModel: TaskModel | null = null

  if (typeof modelOrSubject === 'object' && modelOrSubject !== null) {
    taskModel = modelOrSubject
  } else {
    taskModel = findTaskModelForSubjectAndTopic(modelOrSubject, topic, stem)
  }

  // Fallback padrão se não houver TaskModel específico
  if (!taskModel) {
    const defaultExplanation = generateDifficultyExplanation(0.0, 'medio', [], 0.0, null)
    const fallbackResult: PredictedDifficultyResult = {
      predictedDifficulty: 0.0,
      difficultyLevel: 'medio',
      activeRadicals: [],
      baseConstant: 0.0,
      formulaString: 'b_j = 0.00 (sem TaskModel registrado — estimativa neutra)',
      isEmpiricallyCalibrated: false,
      label: 'Dificuldade Prevista (a priori - LLTM)',
      explanation: defaultExplanation
    }
    if (PREDICT_DIFFICULTY_CACHE.size >= MAX_PREDICT_DIFFICULTY_CACHE_SIZE) {
      PREDICT_DIFFICULTY_CACHE.clear()
    }
    PREDICT_DIFFICULTY_CACHE.set(cacheKey, fallbackResult)
    return fallbackResult
  }

  const activeRadicals: Array<{ id: string; name: string; weightEta: number }> = []
  let sumEta = 0

  for (const rad of taskModel.radicals) {
    if (rad.detect(stem, options)) {
      activeRadicals.push({ id: rad.id, name: rad.name, weightEta: rad.weightEta })
      sumEta += rad.weightEta
    }
  }

  const rawB = taskModel.baseConstantC + sumEta
  // Limita à escala clássica de logits de Rasch/2PL [-3.0, +3.0]
  const boundedB = Number(Math.max(-3.0, Math.min(3.0, rawB)).toFixed(2))

  let difficultyLevel: PredictedDifficultyResult['difficultyLevel'] = 'medio'
  if (boundedB < -0.60) {
    difficultyLevel = 'facil'
  } else if (boundedB <= 0.40) {
    difficultyLevel = 'medio'
  } else if (boundedB <= 1.20) {
    difficultyLevel = 'dificil'
  } else {
    difficultyLevel = 'desafio'
  }

  const parts = [taskModel.baseConstantC.toFixed(2)]
  for (const r of activeRadicals) {
    parts.push(`+ ${r.weightEta.toFixed(2)} (${r.id})`)
  }

  const explanation = generateDifficultyExplanation(
    boundedB,
    difficultyLevel,
    activeRadicals,
    taskModel.baseConstantC,
    taskModel
  )

  const result: PredictedDifficultyResult = {
    predictedDifficulty: boundedB,
    difficultyLevel,
    activeRadicals,
    baseConstant: taskModel.baseConstantC,
    formulaString: `b_j = ${parts.join(' ')} = ${boundedB >= 0 ? '+' : ''}${boundedB.toFixed(2)} logits`,
    isEmpiricallyCalibrated: false,
    label: 'Dificuldade Prevista (a priori - LLTM)',
    explanation
  }

  if (PREDICT_DIFFICULTY_CACHE.size >= MAX_PREDICT_DIFFICULTY_CACHE_SIZE) {
    PREDICT_DIFFICULTY_CACHE.clear()
  }
  PREDICT_DIFFICULTY_CACHE.set(cacheKey, result)

  return result
}
