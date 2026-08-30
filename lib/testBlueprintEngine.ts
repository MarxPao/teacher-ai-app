/**
 * testBlueprintEngine.ts — Matriz de Especificação Psicométrica (Test Blueprint)
 * 
 * Estrutura a distribuição bidimensional da avaliação cruzando:
 * Tópico de Conteúdo × Habilidade BNCC × Nível de Bloom × Dificuldade × Quantidade de Itens.
 */

export interface BlueprintItemSpec {
  itemNumber: number
  topic: string
  bloomLevel: 'remember' | 'apply' | 'analyze' | 'evaluate'
  difficulty: 'easy' | 'medium' | 'hard' | 'challenge'
  bnccCode?: string
  questionType: 'multiple_choice' | 'discursive' | 'reading_text' | 'gap_fill'
}

export interface TestBlueprint {
  title: string
  subject: string
  totalItems: number
  items: BlueprintItemSpec[]
}

/**
 * Constrói uma Matriz de Especificação balanceada a partir de tópicos, habilidades e percentuais de Bloom
 */
export function createBalancedBlueprint(opts: {
  title: string
  subject: string
  totalQuestions: number
  topics: string[]
  bnccCodes?: string[]
  bloomDistribution?: { remember: number; apply: number; analyze: number; evaluate: number }
  difficultyDistribution?: { easy: number; medium: number; hard: number; challenge: number }
}): TestBlueprint {
  const total = Math.max(1, opts.totalQuestions || 10)
  const topics = opts.topics.length > 0 ? opts.topics : ['Conteúdo Geral']
  const skills = opts.bnccCodes && opts.bnccCodes.length > 0 ? opts.bnccCodes : []

  const bloom = opts.bloomDistribution || { remember: 25, apply: 30, analyze: 25, evaluate: 20 }
  const diff = opts.difficultyDistribution || { easy: 20, medium: 50, hard: 25, challenge: 5 }

  const bloomSeq: Array<'remember' | 'apply' | 'analyze' | 'evaluate'> = []
  const countRemember = Math.round((bloom.remember / 100) * total)
  const countApply = Math.round((bloom.apply / 100) * total)
  const countAnalyze = Math.round((bloom.analyze / 100) * total)
  const countEvaluate = total - (countRemember + countApply + countAnalyze)

  for (let i = 0; i < countRemember; i++) bloomSeq.push('remember')
  for (let i = 0; i < countApply; i++) bloomSeq.push('apply')
  for (let i = 0; i < countAnalyze; i++) bloomSeq.push('analyze')
  for (let i = 0; i < Math.max(0, countEvaluate); i++) bloomSeq.push('evaluate')

  while (bloomSeq.length < total) bloomSeq.push('apply')

  const items: BlueprintItemSpec[] = []

  for (let i = 0; i < total; i++) {
    const topic = topics[i % topics.length]
    const skill = skills[i % skills.length]
    const bloomLevel = bloomSeq[i] || 'apply'
    
    let difficulty: BlueprintItemSpec['difficulty'] = 'medium'
    if (i === total - 1 && diff.challenge > 0) difficulty = 'challenge'
    else if (bloomLevel === 'remember') difficulty = 'easy'
    else if (bloomLevel === 'analyze' || bloomLevel === 'evaluate') difficulty = 'hard'

    items.push({
      itemNumber: i + 1,
      topic,
      bloomLevel,
      difficulty,
      bnccCode: skill || undefined,
      questionType: i === 0 && topic.toLowerCase().includes('leitura') ? 'reading_text' : 'multiple_choice'
    })
  }

  return {
    title: opts.title || 'Matriz de Avaliação',
    subject: opts.subject || 'Língua Inglesa',
    totalItems: total,
    items
  }
}

/**
 * Converte a Matriz de Especificação em instrução detalhada item a item para o prompt da IA
 */
export function generateBlueprintPromptSection(blueprint: TestBlueprint): string {
  if (!blueprint || !blueprint.items || blueprint.items.length === 0) return ''

  const lines = blueprint.items.map(item => {
    const bloomLabel = item.bloomLevel === 'remember' ? 'Lembrar/Compreender' : item.bloomLevel === 'apply' ? 'Aplicar' : item.bloomLevel === 'analyze' ? 'Analisar' : 'Avaliar/Criar'
    const diffLabel = item.difficulty === 'easy' ? 'Fácil' : item.difficulty === 'medium' ? 'Médio' : item.difficulty === 'hard' ? 'Difícil' : '⭐ Desafio'
    const skillText = item.bnccCode ? ` | BNCC: ${item.bnccCode}` : ''
    return `• Questão ${item.itemNumber}: [Tópico: ${item.topic}] × [Cognição: ${bloomLabel}] × [Dificuldade: ${diffLabel}]${skillText}`
  }).join('\n')

  return `=== MATRIZ DE ESPECIFICAÇÃO DA PROVA (TEST BLUEPRINT PSICOMÉTRICO) ===
Cada uma das ${blueprint.totalItems} questões DEVE obedecer rigorosamente à sua célula designada na matriz:
${lines}
`
}
