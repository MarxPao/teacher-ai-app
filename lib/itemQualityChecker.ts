export interface ParallelismCheckResult {
  isParallel: boolean
  warning: string
  violatingOptions?: string[]
}

export function checkOptionParallelism(options: string[]): ParallelismCheckResult {
  if (!options || options.length < 2) return { isParallel: true, warning: '' }

  const getStructureType = (opt: string): string => {
    const text = opt.replace(/^[A-Ea-e][.)\s]+/, '').trim()
    if (/^(is|are|was|were|has|have|had|do|does|did|will|would|can|could|should|must|may|might|shall)\b/i.test(text)) return 'auxiliary'
    if (/^\w+ing\b/i.test(text)) return 'gerund'
    if (/^to \w+/i.test(text)) return 'infinitive'
    if (/^(the|a|an)\b/i.test(text)) return 'noun_phrase'
    if (/^[A-Z][^.!?]*[.!?]$/.test(text)) return 'full_sentence'
    return 'other'
  }

  const types = options.map(o => getStructureType(o))
  const uniqueTypes = new Set(types)
  
  if (uniqueTypes.size === 1) return { isParallel: true, warning: '' }

  // Allow mix of full_sentence and auxiliary (common in Cambridge)
  const nonOther = [...uniqueTypes].filter(t => t !== 'other')
  if (nonOther.length <= 1) return { isParallel: true, warning: '' }

  const warning = `Alternativas com estruturas mistas: ${[...uniqueTypes].join(', ')}. Revise o paralelismo gramatical.`
  return { isParallel: false, warning, violatingOptions: options.filter((_, i) => types[i] !== types[0]) }
}
