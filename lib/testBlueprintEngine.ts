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
  isSpacedRetrieval?: boolean
  spacedOriginTopic?: string
  isContrastPair?: boolean
  contrastPartnerTopic?: string
}

export interface TestBlueprint {
  title: string
  subject: string
  totalItems: number
  hasSpacedRetrieval?: boolean
  spacedRetrievalCount?: number
  spacedNotice?: string
  hasInterleaving?: boolean
  contrastPairsCount?: number
  items: BlueprintItemSpec[]
}


/**
 * Recupera tópicos lecionados anteriormente para a turma (2 a 4 semanas atrás)
 */
export function getPastTopicsForClass(classRef?: string, currentTopic?: string): string[] {
  if (typeof localStorage === 'undefined' || !classRef) return []
  try {
    const topicsSet = new Set<string>()
    const curLower = (currentTopic || '').toLowerCase().trim()

    // 1. Busca em registros de aula (classLog / teacher_class_logs)
    const rawLogs = localStorage.getItem('teacher_class_logs') || localStorage.getItem('teacher_classlog')
    if (rawLogs) {
      const logs = JSON.parse(rawLogs)
      if (Array.isArray(logs)) {
        logs.filter((l: any) => l.classRef === classRef || l.className === classRef || !classRef)
          .forEach((l: any) => {
            const top = (l.topic || l.title || '').trim()
            if (top && !curLower.includes(top.toLowerCase()) && !top.toLowerCase().includes(curLower)) {
              topicsSet.add(top)
            }
          })
      }
    }

    // 2. Busca em atividades do Maestro (teacher_maestro_activities)
    const rawMaestro = localStorage.getItem('teacher_maestro_activities')
    if (rawMaestro) {
      const activities = JSON.parse(rawMaestro)
      if (Array.isArray(activities)) {
        activities.filter((a: any) => a.classRef === classRef || !classRef)
          .forEach((a: any) => {
            const top = (a.title || a.topic || '').trim()
            if (top && !curLower.includes(top.toLowerCase()) && !top.toLowerCase().includes(curLower)) {
              topicsSet.add(top)
            }
          })
      }
    }

    return Array.from(topicsSet).slice(0, 5)
  } catch {
    return []
  }
}

/**
 * Verifica se dois tópicos possuem relação declarada de contraste pedagógico (Interleaving Effect).
 * 
 * Justificativas Pedagógicas dos Pares (Ciência da Aprendizagem / Kornell & Bjork):
 * 1. Present Perfect ↔ Simple Past: Discriminação entre tempo indefinido/relevância presente vs tempo pontual concluído no passado.
 * 2. First Conditional ↔ Second Conditional: Discriminação entre condição real/provável (presente+will) vs condição hipotética/irreal (passado+would).
 * 3. Since ↔ For: Discriminação entre ponto inicial no tempo (since Monday) vs duração do período (for 3 days).
 * 4. Comparative ↔ Superlative: Discriminação entre comparação binária (-er/more than) vs destaque de grupo (-est/the most).
 * 5. Some ↔ Any: Discriminação de quantificadores indefinidos em orações afirmativas vs negativas/interrogativas.
 * 6. Much ↔ Many: Discriminação entre substantivos incontáveis (much water) vs contáveis no plural (many books).
 * 7. Crase Obrigatória ↔ Crase Proibida: Discriminação entre regência com preposição 'a' + artigo feminino vs antes de masculino/verbo.
 * 8. Mas ↔ Mais: Discriminação homófona entre conjunção adversativa (oposição/porém) vs advérbio/adjetivo de intensidade e quantidade.
 * 9. Onde ↔ Aonde: Discriminação entre localização física estática (verbo em repouso) vs destino com movimento (verbo com prep. a).
 * 10. Porque ↔ Por que: Discriminação entre conjunção explicativa/causal (resposta) vs locução interrogativa (motivo/pergunta).
 * 11. Regência Assistir ↔ Regência Chegar: Discriminação de transitividade culta com preposição 'a' (assistir ao filme / chegar a casa).
 * 12. Próclise ↔ Ênclise: Discriminação entre atração obrigatória por palavras negativas/relativos vs proibição no início absoluto de período.
 * 13. Concordância Sujeito Composto ↔ Sujeito Partitivo: Discriminação de regra obrigatória de plural anteposto vs faculdade atrativa com partitivos.
 */
export function checkTopicsAreContrastPairs(t1: string, t2: string): boolean {
  const a = (t1 || '').toLowerCase().trim()
  const b = (t2 || '').toLowerCase().trim()
  if (!a || !b || a === b) return false

  const pairs: Array<[string, string]> = [
    ['present perfect', 'simple past'],
    ['present perfect', 'past simple'],
    ['first conditional', 'second conditional'],
    ['since', 'for'],
    ['comparative', 'superlative'],
    ['some', 'any'],
    ['much', 'many'],
    ['crase', 'crase'],
    ['mas', 'mais'],
    ['onde', 'aonde'],
    ['porque', 'por que'],
    ['assistir', 'chegar'],
    ['próclise', 'ênclise'],
    ['concordância', 'concordância']
  ]

  return pairs.some(([p1, p2]) => {
    return (a.includes(p1) && b.includes(p2)) || (a.includes(p2) && b.includes(p1))
  })
}

/**
 * Constrói uma Matriz de Especificação balanceada a partir de tópicos, habilidades, percentuais de Bloom,
 * espiral de recuperação espaçada (Spaced Retrieval) e intercalação contrastante (Interleaving Effect).
 */
export function createBalancedBlueprint(opts: {
  title: string
  subject: string
  totalQuestions: number
  topics: string[]
  bnccCodes?: string[]
  bloomDistribution?: { remember: number; apply: number; analyze: number; evaluate: number }
  difficultyDistribution?: { easy: number; medium: number; hard: number; challenge: number }
  includeSpacedRetrieval?: boolean
  pastTopics?: string[]
  spacedRatio?: number // Padrão 0.25 (25% dos itens)
}): TestBlueprint {
  const total = Math.max(1, opts.totalQuestions || 10)
  const currentTopics = opts.topics.length > 0 ? opts.topics : ['Conteúdo Geral']
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

  // ─── Detecção de Pares de Contraste Pedagógico (Interleaving) ───────────────
  let hasInterleaving = false
  let contrastPairsCount = 0
  if (currentTopics.length >= 2) {
    for (let i = 0; i < currentTopics.length; i++) {
      for (let j = i + 1; j < currentTopics.length; j++) {
        if (checkTopicsAreContrastPairs(currentTopics[i], currentTopics[j])) {
          hasInterleaving = true
          contrastPairsCount++
        }
      }
    }
  }

  // ─── Espiral de Recuperação Espaçada (Spaced Retrieval) ─────────────────────
  let spacedCount = 0
  let pastTopicsList: string[] = []
  let spacedNotice: string | undefined = undefined

  if (opts.includeSpacedRetrieval) {
    const rawPast = opts.pastTopics && opts.pastTopics.length > 0 
      ? opts.pastTopics 
      : getPastTopicsForClass(undefined, currentTopics[0])

    pastTopicsList = rawPast.filter(pt => !currentTopics.some(ct => ct.toLowerCase() === pt.toLowerCase()))

    if (pastTopicsList.length > 0 && total >= 3) {
      const ratio = opts.spacedRatio || 0.25
      spacedCount = Math.max(1, Math.round(total * ratio))
    } else {
      spacedNotice = 'Sem tópicos anteriores suficientes registrados para recuperação espaçada: 100% dos itens alocados no conteúdo atual.'
    }
  }

  const items: BlueprintItemSpec[] = []
  const currentCount = total - spacedCount

  for (let i = 0; i < total; i++) {
    const bloomLevel = bloomSeq[i] || 'apply'
    const skill = skills[i % skills.length]
    
    let difficulty: BlueprintItemSpec['difficulty'] = 'medium'
    if (i === total - 1 && diff.challenge > 0) difficulty = 'challenge'
    else if (bloomLevel === 'remember') difficulty = 'easy'
    else if (bloomLevel === 'analyze' || bloomLevel === 'evaluate') difficulty = 'hard'

    const isSpaced = i >= currentCount && pastTopicsList.length > 0
    const topic = isSpaced 
      ? pastTopicsList[(i - currentCount) % pastTopicsList.length]
      : currentTopics[i % currentTopics.length]

    // Verifica se este item faz parte de um par contrastante intercalado
    let isContrast = false
    let partnerTopic: string | undefined = undefined
    if (!isSpaced && hasInterleaving && currentTopics.length >= 2) {
      const otherTopic = currentTopics[(i + 1) % currentTopics.length]
      if (checkTopicsAreContrastPairs(topic, otherTopic)) {
        isContrast = true
        partnerTopic = otherTopic
      }
    }

    items.push({
      itemNumber: i + 1,
      topic,
      bloomLevel,
      difficulty,
      bnccCode: skill || undefined,
      questionType: i === 0 && topic.toLowerCase().includes('leitura') ? 'reading_text' : 'multiple_choice',
      isSpacedRetrieval: isSpaced ? true : undefined,
      spacedOriginTopic: isSpaced ? topic : undefined,
      isContrastPair: isContrast ? true : undefined,
      contrastPartnerTopic: partnerTopic
    })
  }

  return {
    title: opts.title || 'Matriz de Avaliação',
    subject: opts.subject || 'Língua Inglesa',
    totalItems: total,
    hasSpacedRetrieval: spacedCount > 0,
    spacedRetrievalCount: spacedCount,
    spacedNotice,
    hasInterleaving,
    contrastPairsCount,
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
    const spacedTag = item.isSpacedRetrieval ? ` [🔄 REVISÃO ESPAÇADA / CONSOLIDAÇÃO]` : ''
    const contrastTag = item.isContrastPair && item.contrastPartnerTopic ? ` [🔀 PAR CONTRASTANTE ↔ ${item.contrastPartnerTopic}]` : ''
    return `• Questão ${item.itemNumber}${spacedTag}${contrastTag}: [Tópico: ${item.topic}] × [Cognição: ${bloomLabel}] × [Dificuldade: ${diffLabel}]${skillText}`
  }).join('\n')

  let header = `=== MATRIZ DE ESPECIFICAÇÃO DA PROVA (TEST BLUEPRINT PSICOMÉTRICO) ===\n`
  if (blueprint.hasSpacedRetrieval && blueprint.spacedRetrievalCount) {
    header += `🔄 ESPIRAL DE RECUPERAÇÃO ESPAÇADA (SPACED RETRIEVAL): ${blueprint.spacedRetrievalCount} de ${blueprint.totalItems} itens revisam ativamente tópicos anteriores para retenção de longo prazo.\n`
  }
  if (blueprint.hasInterleaving) {
    header += `🔀 INTERCALAÇÃO CONTRASTANTE (INTERLEAVING EFFECT): Itens de tópicos contrastantes foram intercalados propositalmente para forçar a discriminação ativa de regras pelo aluno.\n`
  }
  header += `Cada uma das ${blueprint.totalItems} questões DEVE obedecer rigorosamente à sua célula designada na matriz:\n${lines}\n`

  return header
}


