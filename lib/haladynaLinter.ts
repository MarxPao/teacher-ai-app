/**
 * haladynaLinter.ts — Linter Psicométrico Baseado nas Diretrizes de Haladyna
 *
 * Referência: Haladyna, T. M., Downing, S. M., & Rodriguez, M. C. (2002).
 * "A Review of Multiple-Choice Item-Writing Guidelines for Classroom Assessment."
 * Applied Measurement in Education, 15(3), 309-333.
 */

export interface HaladynaViolation {
  ruleId: 'ALL_NONE_ABOVE' | 'ANTI_CUEING' | 'LENGTH_CLUEING' | 'UNHIGHLIGHTED_NEGATIVE' | 'REDUNDANT_DISTRACTOR'
  ruleName: string
  message: string
  severity: 'warning' | 'error'
}

export interface HaladynaAuditResult {
  hasViolations: boolean
  violations: HaladynaViolation[]
}

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
    const allNoneRegex = /\b(todas\s+(as\s+)?(anteriores|alternativas|opções|respostas)|nenhuma\s+(das\s+)?(anteriores|alternativas|opções|respostas)|todas\s+estão\s+corretas|all\s+of\s+the\s+above|none\s+of\s+the\s+above)\b/i
    for (const opt of options) {
      if (allNoneRegex.test(opt.text)) {
        violations.push({
          ruleId: 'ALL_NONE_ABOVE',
          ruleName: 'Regra de Haladyna #1 (All/None of the above)',
          message: `A opção "${opt.letter ? opt.letter + ') ' : ''}${opt.text}" usa formato desaconselhado ("Todas/Nenhuma das anteriores"). Isso compromete a validade psicométrica do item.`,
          severity: 'warning'
        })
        break
      }
    }
  }

  // ─── REGRA 2: Anti-Cueing Gramatical no Enunciado ───────────────────────────
  const cueingMatch = cleanStem.match(/\b(an|a|é\s+um|é\s+uma|são\s+os|são\s+as|ao|à)\s*[:_—–-]?\s*$/i)
  if (cueingMatch && options && options.length >= 2) {
    const article = cueingMatch[1].toLowerCase()
    if (article === 'an') {
      const startsWithVowel = options.filter(o => /^[aeiou]/i.test(o.text.trim()))
      if (startsWithVowel.length > 0 && startsWithVowel.length < options.length) {
        violations.push({
          ruleId: 'ANTI_CUEING',
          ruleName: 'Regra de Haladyna #2 (Anti-Cueing Gramatical)',
          message: 'O enunciado termina com o artigo "an", fornecendo pista fonética que elimina alternativas iniciadas por consoante.',
          severity: 'warning'
        })
      }
    } else if (article === 'a') {
      const startsWithConsonant = options.filter(o => /^[^aeiou]/i.test(o.text.trim()))
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
  const negativeRegex = /\b(não|not|exceto|except|incorret[oa]|incorrect)\b/i
  if (negativeRegex.test(cleanStem)) {
    const matches = cleanStem.match(/\b(não|not|exceto|except|incorret[oa]|incorrect)\b/gi) || []
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
