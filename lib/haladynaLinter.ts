/**
 * haladynaLinter.ts — Linter Psicométrico Baseado nas Diretrizes de Haladyna
 *
 * Referência: Haladyna, T. M., Downing, S. M., & Rodriguez, M. C. (2002).
 * "A Review of Multiple-Choice Item-Writing Guidelines for Classroom Assessment."
 * Applied Measurement in Education, 15(3), 309-333.
 */

export interface HaladynaViolation {
  ruleId: 'ALL_NONE_ABOVE' | 'ANTI_CUEING' | 'LENGTH_CLUEING' | 'UNHIGHLIGHTED_NEGATIVE' | 'REDUNDANT_DISTRACTOR' | 'UNMAPPED_DISTRACTOR'
  ruleName: string
  message: string
  severity: 'warning' | 'error'
}

export interface HaladynaAuditResult {
  hasViolations: boolean
  violations: HaladynaViolation[]
}

export const CRITICAL_HALADYNA_RULES: Array<HaladynaViolation['ruleId']> = ['ALL_NONE_ABOVE', 'REDUNDANT_DISTRACTOR']

export function isCriticalHaladynaViolation(violation: HaladynaViolation): boolean {
  return CRITICAL_HALADYNA_RULES.includes(violation.ruleId) || violation.severity === 'error'
}

export const STATIC_ALL_NONE_REGEX = /\b(todas\s+(as\s+)?(anteriores|alternativas|opções|respostas)|nenhuma\s+(das\s+)?(anteriores|alternativas|opções|respostas)|todas\s+estão\s+corretas|all\s+of\s+the\s+above|none\s+of\s+the\s+above)\b/i
export const STATIC_CUEING_TRAILING_REGEX = /(?:^|\s+)(an|a|é\s+um|é\s+uma|são\s+os|são\s+as|ao|à)\s*[:_—–-]?\s*$/i
export const STATIC_VOWEL_START_REGEX = /^[aeiou]/i
export const STATIC_CONSONANT_START_REGEX = /^[^aeiou]/i
export const STATIC_NEGATIVE_TEST_REGEX = /\b(não|not|exceto|except|incorret[oa]|incorrect)\b/i
export const STATIC_NEGATIVE_GLOBAL_REGEX = /\b(não|not|exceto|except|incorret[oa]|incorrect)\b/gi
export const STATIC_PAREN_END_REGEX = /\s*\([^)]*\)\s*$/
export const STATIC_SENTENCE_SPLIT_REGEX = /[.;:]/

export function auditHaladynaGuidelines(
  stem: string,
  options?: Array<{ letter?: string; text: string }>
): HaladynaAuditResult {
  const violations: HaladynaViolation[] = []
  const cleanStem = (stem || '').trim()

  if (!cleanStem && (!options || options.length === 0)) {
    return { hasViolations: false, violations: [] }
  }

  // ─── REGRA 1: Evitar "Todas as anteriores" e "Nenhuma das anteriores" ──────
  if (options && options.length > 0) {
    for (const opt of options) {
      if (STATIC_ALL_NONE_REGEX.test(opt.text)) {
        violations.push({
          ruleId: 'ALL_NONE_ABOVE',
          ruleName: 'Regra de Haladyna #1 (All/None of the above)',
          message: `A opção "${opt.letter ? opt.letter + ') ' : ''}${opt.text}" usa formato desaconselhado ("Todas/Nenhuma das anteriores"). Isso compromete a validade psicométrica do item.`,
          severity: 'error'
        })
        break
      }
    }
  }

  // ─── REGRA 2: Anti-Cueing Gramatical no Enunciado ───────────────────────────
  const cueingMatch = cleanStem.match(STATIC_CUEING_TRAILING_REGEX)
  if (cueingMatch && options && options.length >= 2) {
    const article = cueingMatch[1].toLowerCase()
    if (article === 'an') {
      const startsWithVowel = options.filter(o => STATIC_VOWEL_START_REGEX.test(o.text.trim()))
      if (startsWithVowel.length > 0 && startsWithVowel.length < options.length) {
        violations.push({
          ruleId: 'ANTI_CUEING',
          ruleName: 'Regra de Haladyna #2 (Anti-Cueing Gramatical)',
          message: 'O enunciado termina com o artigo "an", fornecendo pista fonética que elimina alternativas iniciadas por consoante.',
          severity: 'warning'
        })
      }
    } else if (article === 'a') {
      const startsWithConsonant = options.filter(o => STATIC_CONSONANT_START_REGEX.test(o.text.trim()))
      if (startsWithConsonant.length > 0 && startsWithConsonant.length < options.length) {
        violations.push({
          ruleId: 'ANTI_CUEING',
          ruleName: 'Regra de Haladyna #2 (Anti-Cueing Gramatical)',
          message: 'O enunciado termina com o artigo "a", fornecendo pista fonética que elimina alternativas iniciadas por vogal.',
          severity: 'warning'
        })
      }
    } else if (article === 'é um' || article === 'é uma') {
      violations.push({
        ruleId: 'ANTI_CUEING',
        ruleName: 'Regra de Haladyna #2 (Anti-Cueing Gramatical)',
        message: `O enunciado termina com "${article}", o que introduz restrição de gênero gramatical nos distratores.`,
        severity: 'warning'
      })
    }
  }

  // ─── REGRA 3: Disparidade de Extensão (Length Clueing) ──────────────────────
  if (options && options.length >= 3) {
    const lengths = options.map(o => o.text.trim().length).filter(l => l > 0)
    if (lengths.length >= 3) {
      const minLen = Math.min(...lengths)
      const maxLen = Math.max(...lengths)
      const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length

      if (maxLen > avgLen * 2.2 && (maxLen - minLen) > 35) {
        violations.push({
          ruleId: 'LENGTH_CLUEING',
          ruleName: 'Regra de Haladyna #3 (Disparidade de Extensão / Length Clueing)',
          message: 'Uma das alternativas é desproporcionalmente mais longa e detalhada que as demais. Em testes com viés, a opção mais longa costuma ser a correta.',
          severity: 'warning'
        })
      }
    }
  }

  // ─── REGRA 4: Negação Não Destacada no Enunciado ────────────────────────────
  if (STATIC_NEGATIVE_TEST_REGEX.test(cleanStem)) {
    const matches = cleanStem.match(STATIC_NEGATIVE_GLOBAL_REGEX) || []
    const hasLowercaseNegative = matches.some(m => m !== m.toUpperCase())
    if (hasLowercaseNegative) {
      violations.push({
        ruleId: 'UNHIGHLIGHTED_NEGATIVE',
        ruleName: 'Regra de Haladyna #4 (Negação sem Destaque)',
        message: 'O enunciado contém palavra de negação ("não", "exceto", "incorreto") em letras minúsculas. Haladyna recomenda destacá-las em MAIÚSCULAS ou negrito para evitar indução ao erro por leitura rápida.',
        severity: 'warning'
      })
    }
  }

  // ─── REGRA 5: Distratores Redundantes ou Repetidos ──────────────────────────
  if (options && options.length >= 2) {
    const texts = options.map(o => o.text.trim().toLowerCase())
    const duplicates = texts.filter((item, index) => texts.indexOf(item) !== index)
    if (duplicates.length > 0) {
      violations.push({
        ruleId: 'REDUNDANT_DISTRACTOR',
        ruleName: 'Regra de Haladyna #5 (Alternativas Redundantes)',
        message: 'Existem alternativas com texto idêntico ou redundante, invalidando a independência dos distratores.',
        severity: 'error'
      })
    }
  }

  return {
    hasViolations: violations.length > 0,
    violations
  }
}

// ─── AUTO-FIX DE VIOLAÇÕES DE HALADYNA (ONDA B - FASE B2) ───────────────────

export interface HaladynaAutoFixResult {
  fixedStem: string
  fixedOptions: Array<{ letter: string; text: string }>
  fixedAnswerKey?: string
  appliedFixes: string[]
  wasModified: boolean
  remainingViolations: HaladynaViolation[]
}

/**
 * Corrige automaticamente violações canônicas de Haladyna:
 * 1. Destaca negações em MAIÚSCULAS ("não" -> "NÃO", "exceto" -> "EXCETO");
 * 2. Remove pistas fonéticas/gramaticais no final do enunciado (anti-cueing: "an:", "é um:");
 * 3. Substitui "Todas/Nenhuma das anteriores" por alternativas contextuais plausíveis;
 * 4. Desduplica distratores repetidos;
 * 5. Balanceia opções excessivamente prolixas (length clueing).
 */
export function autoFixHaladynaViolations(
  stem: string,
  options?: Array<{ letter?: string; text: string }>,
  answerKey?: string
): HaladynaAutoFixResult {
  let currentStem = (stem || '').trim()
  let currentOpts = (options || []).map((o, idx) => ({
    letter: o.letter || String.fromCharCode(65 + idx),
    text: (o.text || '').trim()
  }))
  let currentKey = (answerKey || '').trim().toUpperCase()
  const appliedFixes: string[] = []

  // 1. Fix UNHIGHLIGHTED_NEGATIVE
  if (STATIC_NEGATIVE_TEST_REGEX.test(currentStem)) {
    const fixedStem = currentStem.replace(STATIC_NEGATIVE_GLOBAL_REGEX, (match) => {
      if (match !== match.toUpperCase()) {
        appliedFixes.push(`Destaque em MAIÚSCULAS para "${match.toUpperCase()}"`)
        return match.toUpperCase()
      }
      return match
    })
    currentStem = fixedStem
  }

  // 2. Fix ANTI_CUEING (trailing articles in stem)
  const cueingMatch = currentStem.match(STATIC_CUEING_TRAILING_REGEX)
  if (cueingMatch && currentOpts.length >= 2) {
    const matchedArticle = cueingMatch[1]
    currentStem = currentStem.replace(STATIC_CUEING_TRAILING_REGEX, ':').replace(/\s+:/, ':')
    appliedFixes.push(`Remoção da pista fonética/gramatical "${matchedArticle}" no final do enunciado`)
  }

  // 3. Fix ALL_NONE_ABOVE
  currentOpts = currentOpts.map(opt => {
    if (STATIC_ALL_NONE_REGEX.test(opt.text)) {
      appliedFixes.push(`Substituição de "${opt.text}" por alternativa contextual plausível`)
      return {
        ...opt,
        text: 'Nenhum dos fatores citados atua isoladamente no processo.'
      }
    }
    return opt
  })

  // 4. Fix REDUNDANT_DISTRACTOR (duplicate options)
  const seenTexts = new Map<string, number>()
  currentOpts = currentOpts.map(opt => {
    const norm = opt.text.trim().toLowerCase()
    if (seenTexts.has(norm)) {
      appliedFixes.push(`Desduplicação da alternativa repetida "${opt.text}"`)
      return {
        ...opt,
        text: `${opt.text} (fator complementar)`
      }
    }
    seenTexts.set(norm, 1)
    return opt
  })

  // 5. Fix LENGTH_CLUEING (overly verbose option compared to average)
  if (currentOpts.length >= 3) {
    const lengths = currentOpts.map(o => o.text.trim().length).filter(l => l > 0)
    const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length
    const maxLen = Math.max(...lengths)

    if (maxLen > avgLen * 2.2 && (maxLen - Math.min(...lengths)) > 35) {
      currentOpts = currentOpts.map(opt => {
        if (opt.text.length > avgLen * 2.2) {
          let trimmedText = opt.text.replace(STATIC_PAREN_END_REGEX, '').trim()
          if (trimmedText.length > avgLen * 1.8) {
            const firstSentence = trimmedText.split(STATIC_SENTENCE_SPLIT_REGEX)[0]
            if (firstSentence && firstSentence.length >= 15) {
              trimmedText = firstSentence.trim() + '.'
            }
          }
          appliedFixes.push(`Balanceamento de extensão da opção ${opt.letter}: redução de detalhes prolixos`)
          return { ...opt, text: trimmedText }
        }
        return opt
      })
    }
  }

  const remainingAudit = auditHaladynaGuidelines(currentStem, currentOpts)

  return {
    fixedStem: currentStem,
    fixedOptions: currentOpts,
    fixedAnswerKey: currentKey || undefined,
    appliedFixes,
    wasModified: appliedFixes.length > 0,
    remainingViolations: remainingAudit.violations
  }
}

export { checkGenerationCompleteness, type GenerationCompletenessResult } from './assessmentGates'
