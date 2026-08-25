export interface ParallelismCheckResult {
  isParallel: boolean
  warning: string
  violatingOptions?: string[]
}

/**
 * Valida o paralelismo sintático entre alternativas de múltipla escolha (Item Writing Guidelines).
 * Suporta construções em Língua Inglesa e Língua Portuguesa.
 */
export function checkOptionParallelism(options: string[]): ParallelismCheckResult {
  if (!options || options.length < 2) return { isParallel: true, warning: '' }

  const getStructureType = (opt: string): string => {
    const text = opt.replace(/^[A-Ea-e][.)\s]+/, '').trim()
    // Verbos e auxiliares de início (EN + PT)
    if (/^(is|are|was|were|has|have|had|do|does|did|will|would|can|could|should|must|may|might|shall|é|são|era|eram|foi|foram|tem|tinha|deve|devem|pode|podem)\b/i.test(text)) return 'auxiliary_or_verb'
    // Gerúndio (EN: -ing, PT: -ndo)
    if (/^(\w+ing|\w+ndo)\b/i.test(text)) return 'gerund'
    // Infinitivo (EN: to verb, PT: terminação em -ar, -er, -ir, -pôr)
    if (/^(to \w+|[a-záéíóúâêîôûãõ]+(ar|er|ir|por|pôr))\b/i.test(text)) return 'infinitive'
    // Sintagmas nominais / Artigos (EN + PT)
    if (/^(the|a|an|o|a|os|as|um|uma|uns|umas|este|esta|esse|essa|aquele|aquela)\b/i.test(text)) return 'noun_phrase'
    // Frase completa pontuada
    if (/^[A-ZÁÉÍÓÚÂÊÎÔÛ][^.!?]*[.!?]$/.test(text)) return 'full_sentence'
    return 'other'
  }

  const types = options.map(o => getStructureType(o))
  const uniqueTypes = new Set(types)
  
  if (uniqueTypes.size === 1) return { isParallel: true, warning: '' }

  // Permite combinação de full_sentence e auxiliary_or_verb
  const nonOther = [...uniqueTypes].filter(t => t !== 'other')
  if (nonOther.length <= 1) return { isParallel: true, warning: '' }

  const warning = `Alternativas com estruturas sintáticas mistas (${[...uniqueTypes].join(', ')}). Ajuste as alternativas para manterem o mesmo padrão gramatical.`
  return { isParallel: false, warning, violatingOptions: options.filter((_, i) => types[i] !== types[0]) }
}
