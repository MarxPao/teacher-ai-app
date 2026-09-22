/**
 * analyticalRubricGenerator.ts — Gerador de Rubricas Analíticas com Escala Likert Ancorada em Evidências (Onda B - Fase B3)
 *
 * PROPÓSITO:
 * 1. Gerar matrizes de correção analítica multinível para questões discursivas/abertas.
 * 2. Escala Likert de 4 níveis de proficiência:
 *    - Nível 1: Insuficiente (25% dos pontos)
 *    - Nível 2: Básico (50% dos pontos)
 *    - Nível 3: Proficiente (75% dos pontos)
 *    - Nível 4: Avançado (100% dos pontos)
 * 3. Descritores comportamentais observáveis (Critério de Popham, 1997 & Andrade, 2005):
 *    - Proibição estrita de adjetivos vagos não ancorados ("bom", "razoável", "satisfatório", "ruim").
 *    - Foco em evidências verificáveis na produção do aluno (identificação, explicação, relação causal, fundamentação).
 */

export type RubricLevelKey = 'insufficient' | 'basic' | 'proficient' | 'advanced'

export interface RubricLevelDescriptor {
  level: 1 | 2 | 3 | 4
  levelKey: RubricLevelKey
  label: string
  pointsPercent: number // 0.25, 0.50, 0.75, 1.00
  observableDescriptor: string
  evidenceExamples: string[]
}

export interface RubricCriterion {
  criterionId: string
  name: string
  weight: number // Percentual (soma dos pesos = 100%)
  description: string
  levels: RubricLevelDescriptor[]
}

export interface VagueAdjectiveAuditResult {
  hasUnanchoredVagueAdjectives: boolean
  detectedVagueWords: string[]
}

export interface AnalyticalRubric {
  questionId?: string
  questionStem: string
  subject?: string
  topic?: string
  expectedKeyPoints: string[]
  criteria: RubricCriterion[]
  vagueAdjectiveAudit: VagueAdjectiveAuditResult
  formattedMarkdown: string
}

// Lista canônica de termos subjetivos e vagos proibidos em rubricas psicometricamente válidas
export const FORBIDDEN_VAGUE_ADJECTIVES = [
  'bom', 'boa', 'bons', 'boas',
  'ruim', 'ruins',
  'razoável', 'razoavelmente',
  'satisfatório', 'satisfatória', 'satisfatórios', 'satisfatórias',
  'mais ou menos', 'médio', 'média', 'médios', 'médias',
  'legal', 'bacana', 'fraco', 'fraca'
]

export const STATIC_FORBIDDEN_VAGUE_REGEX = new RegExp(`\\b(${FORBIDDEN_VAGUE_ADJECTIVES.join('|')})\\b`, 'gi')

// Cache de memoização para rubricas analíticas já geradas (elimina reavaliações redundantes durante digitação)
const ANALYTICAL_RUBRIC_CACHE = new Map<string, AnalyticalRubric>()
const MAX_RUBRIC_CACHE_SIZE = 500

/**
 * Audita um texto ou rubrica completa para detectar adjetivos vagos não ancorados em evidências.
 */
export function auditVagueAdjectivesInRubric(text: string): VagueAdjectiveAuditResult {
  if (!text || !text.trim()) {
    return { hasUnanchoredVagueAdjectives: false, detectedVagueWords: [] }
  }

  const matches = text.match(STATIC_FORBIDDEN_VAGUE_REGEX) || []
  const uniqueDetected = Array.from(new Set(matches.map(m => m.toLowerCase())))

  return {
    hasUnanchoredVagueAdjectives: uniqueDetected.length > 0,
    detectedVagueWords: uniqueDetected
  }
}

/**
 * Gera a Rubrica Analítica com 4 níveis Likert ancorados em evidências observáveis.
 * Utiliza cache de memoização para aceleração O(1) de questões inalteradas.
 */
export function generateAnalyticalRubric(params: {
  questionStem: string
  questionId?: string
  subject?: string
  topic?: string
  contextText?: string
}): AnalyticalRubric {
  const stem = (params.questionStem || '').trim()
  const context = (params.contextText || '').trim()
  const subject = params.subject || 'Geral'
  const topic = params.topic || 'Conhecimento Aplicado'

  const cacheKey = `${stem}:::${context}:::${subject}:::${topic}`
  const cached = ANALYTICAL_RUBRIC_CACHE.get(cacheKey)
  if (cached) {
    return {
      ...cached,
      questionId: params.questionId
    }
  }

  // Extrai conceitos centrais a partir de substantivos e verbos de comando
  const expectedKeyPoints = extractExpectedKeyPoints(stem, context)

  // Critério 1: Domínio Conceitual e Precisão Terminológica
  const criterion1: RubricCriterion = {
    criterionId: 'crit_conceptual_domain',
    name: 'Domínio Conceitual & Precisão Técnica',
    weight: 40,
    description: 'Avalia a exatidão na identificação e emprego dos conceitos fundamentais solicitados na questão.',
    levels: [
      {
        level: 1,
        levelKey: 'insufficient',
        label: '1 - Insuficiente',
        pointsPercent: 0.25,
        observableDescriptor: 'Não identifica os conceitos centrais da proposta ou apresenta formulações factualmente errôneas. Não utiliza terminologia específica da área.',
        evidenceExamples: [
          'Omissão dos conceitos solicitados',
          'Confusão conceitual que descaracteriza a explicação'
        ]
      },
      {
        level: 2,
        levelKey: 'basic',
        label: '2 - Básico',
        pointsPercent: 0.50,
        observableDescriptor: 'Menciona conceitos centrais de forma isolada ou incompleta, sem definir com exatidão suas propriedades ou sem articulá-los ao contexto do problema.',
        evidenceExamples: [
          'Citação de termos técnicos sem explicação de seu significado',
          'Definição parcial que omite elemento determinante'
        ]
      },
      {
        level: 3,
        levelKey: 'proficient',
        label: '3 - Proficiente',
        pointsPercent: 0.75,
        observableDescriptor: 'Define e aplica com precisão os conceitos solicitados, empregando vocabulário técnico correto e demonstrando compreensão das relações essenciais.',
        evidenceExamples: [
          'Definição completa dos termos pertinentes',
          'Aplicação correta da teoria ao caso apresentado'
        ]
      },
      {
        level: 4,
        levelKey: 'advanced',
        label: '4 - Avançado',
        pointsPercent: 1.00,
        observableDescriptor: 'Articula os conceitos centrais com profundidade, estabelecendo correlações interdisciplinares ou destacando exceções, limites de aplicação e nuances teóricas.',
        evidenceExamples: [
          'Integração de múltiplos conceitos em uma síntese conceitual coesa',
          'Identificação de implicações teóricas que extrapolam a descrição primária'
        ]
      }
    ]
  }

  // Critério 2: Estrutura Argumentativa & Relação Causa-Efeito
  const criterion2: RubricCriterion = {
    criterionId: 'crit_argumentative_structure',
    name: 'Raciocínio & Relação Causa-Efeito',
    weight: 40,
    description: 'Avalia a coerência da cadeia causal, a apresentação de justificativas lógicas e a sustentação da resposta.',
    levels: [
      {
        level: 1,
        levelKey: 'insufficient',
        label: '1 - Insuficiente',
        pointsPercent: 0.25,
        observableDescriptor: 'Apresenta afirmações desconexas ou circulares sem estabelecer elo causal entre premissa e conclusão. Resposta puramente opinativa sem justificativa.',
        evidenceExamples: [
          'Afirmação isolada ("é assim porque sim")',
          'Incoerência lógica entre premissa e conclusão'
        ]
      },
      {
        level: 2,
        levelKey: 'basic',
        label: '2 - Básico',
        pointsPercent: 0.50,
        observableDescriptor: 'Esboça uma justificativa inicial, mas a cadeia lógica apresenta lacunas demonstrativas ou passagens que requerem inferência não declarada pelo aluno.',
        evidenceExamples: [
          'Relação causa-efeito linear simples sem comprovação',
          'Presença de justificativa com salto argumentativo'
        ]
      },
      {
        level: 3,
        levelKey: 'proficient',
        label: '3 - Proficiente',
        pointsPercent: 0.75,
        observableDescriptor: 'Desenvolve raciocínio sequencial estruturado em premissas e conclusões explícitas, demonstrando como os dados levam logicamente ao resultado.',
        evidenceExamples: [
          'Cadeia de causa e efeito demonstrada passo a passo',
          'Justificativa fundamentada em princípios verificáveis'
        ]
      },
      {
        level: 4,
        levelKey: 'advanced',
        label: '4 - Avançado',
        pointsPercent: 1.00,
        observableDescriptor: 'Constrói argumentação rigorosa e abrangente, antecipando contra-argumentos ou analisando cenários alternativos e variáveis intervenientes.',
        evidenceExamples: [
          'Explicitação de condições de contorno e limites da conclusão',
          'Refutação fundamentada de hipóteses alternativas'
        ]
      }
    ]
  }

  // Critério 3: Clareza Textual & Norma Padrão
  const criterion3: RubricCriterion = {
    criterionId: 'crit_clarity_and_norm',
    name: 'Clareza Textual & Coesão',
    weight: 20,
    description: 'Avalia a inteligibilidade, a organização textual e a conformidade gramatical indispensável à clareza expositiva.',
    levels: [
      {
        level: 1,
        levelKey: 'insufficient',
        label: '1 - Insuficiente',
        pointsPercent: 0.25,
        observableDescriptor: 'Texto fragmentado com períodos truncados e ausência de conectivos lógicos, dificultando a apreensão do sentido pretendido.',
        evidenceExamples: [
          'Parágrafo único sem pontuação divisória',
          'Desvios gramaticais que geram ambiguidade semântica'
        ]
      },
      {
        level: 2,
        levelKey: 'basic',
        label: '2 - Básico',
        pointsPercent: 0.50,
        observableDescriptor: 'Texto compreensível, porém com repetição excessiva de conectivos elementares ("e", "aí") ou períodos excessivamente extensos que sobrecarregam a leitura.',
        evidenceExamples: [
          'Uso reiterado do mesmo elemento coesivo',
          'Estrutura frasal que demanda releitura'
        ]
      },
      {
        level: 3,
        levelKey: 'proficient',
        label: '3 - Proficiente',
        pointsPercent: 0.75,
        observableDescriptor: 'Redação fluida e organizada em parágrafos temáticos, com conectivos diversificados e respeito às normas gramaticais de concordância e pontuação.',
        evidenceExamples: [
          'Uso diversificado de conjunções explicativas e conclusivas',
          'Estrutura oracional límpida com pontuação adequada'
        ]
      },
      {
        level: 4,
        levelKey: 'advanced',
        label: '4 - Avançado',
        pointsPercent: 1.00,
        observableDescriptor: 'Domínio expressivo superior, com variedade sintática, riqueza coesiva inter e intraparágrafos e precisão formal impecável.',
        evidenceExamples: [
          'Emprego elegante de subordinação e intercalações expressivas',
          'Ausência total de ruídos comunicativos ou desvios formais'
        ]
      }
    ]
  }

  const criteria = [criterion1, criterion2, criterion3]

  // Auditoria de adjetivos vagos em toda a rubrica gerada
  const allDescriptorsText = criteria
    .flatMap(c => c.levels.map(l => l.observableDescriptor))
    .join(' ')
  const vagueAudit = auditVagueAdjectivesInRubric(allDescriptorsText)

  // Markdown formatado para visualização
  const formattedMarkdown = buildRubricMarkdown(stem, expectedKeyPoints, criteria)

  const result: AnalyticalRubric = {
    questionId: params.questionId,
    questionStem: stem,
    subject,
    topic,
    expectedKeyPoints,
    criteria,
    vagueAdjectiveAudit: vagueAudit,
    formattedMarkdown
  }

  if (ANALYTICAL_RUBRIC_CACHE.size >= MAX_RUBRIC_CACHE_SIZE) {
    ANALYTICAL_RUBRIC_CACHE.clear()
  }
  ANALYTICAL_RUBRIC_CACHE.set(cacheKey, result)

  return result
}

// ─── HELPERS AUXILIARES ──────────────────────────────────────────────────────

function extractExpectedKeyPoints(stem: string, context?: string): string[] {
  const combined = `${stem} ${context || ''}`
  const keyPoints: string[] = []

  if (/por que|justifique|explique/i.test(stem)) {
    keyPoints.push('Justificativa causal clara e fundamentada')
  }
  if (/compare|diferencie|distin/i.test(stem)) {
    keyPoints.push('Identificação de semelhanças e diferenças determinantes')
  }
  if (/exemplo|ilustre/i.test(stem)) {
    keyPoints.push('Apresentação de exemplos concretos pertinentes')
  }
  if (/consequ[êe]ncia|impacto|efeito/i.test(stem)) {
    keyPoints.push('Análise de causas e desdobramentos práticos')
  }
  if (keyPoints.length === 0) {
    keyPoints.push('Resposta direta e completa ao comando do enunciado')
    keyPoints.push('Demonstração de domínio dos conceitos centrais')
  }

  return keyPoints
}

function buildRubricMarkdown(
  stem: string,
  keyPoints: string[],
  criteria: RubricCriterion[]
): string {
  let md = `### 📊 Rubrica Analítica de Correção (Escala Likert 4 Níveis)\n\n`
  md += `**Enunciado:** ${stem}\n\n`
  md += `**Evidências Esperadas:**\n`
  keyPoints.forEach(kp => {
    md += `- ${kp}\n`
  })
  md += `\n| Critério (Peso) | 1 - Insuficiente (25%) | 2 - Básico (50%) | 3 - Proficiente (75%) | 4 - Avançado (100%) |\n`
  md += `| :--- | :--- | :--- | :--- | :--- |\n`

  criteria.forEach(c => {
    const l1 = c.levels.find(l => l.level === 1)?.observableDescriptor || ''
    const l2 = c.levels.find(l => l.level === 2)?.observableDescriptor || ''
    const l3 = c.levels.find(l => l.level === 3)?.observableDescriptor || ''
    const l4 = c.levels.find(l => l.level === 4)?.observableDescriptor || ''
    md += `| **${c.name}** (${c.weight}%) | ${l1} | ${l2} | ${l3} | ${l4} |\n`
  })

  return md
}
