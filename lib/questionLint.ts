/**
 * lib/questionLint.ts — Question Linting (Gap 17 · Onda 4)
 *
 * Verifica questões de múltipla escolha em tempo real contra as
 * diretrizes de Haladyna, Downing & Rodriguez (2002):
 *   "A Review of Multiple-Choice Item-Writing Guidelines"
 *
 * 44 diretrizes originais — implementamos as 15 mais impactantes e
 * verificáveis automaticamente.
 *
 * Uso:
 *   const issues = lintQuestion(question)
 *   // issues é vazio se a questão passa em todas as checagens
 */

/* ─── Types ────────────────────────────────────────────────────────────────── */
export interface LintIssue {
  code:     string         // ex: 'H1', 'H7', 'H15'
  rule:     string         // descrição curta
  detail:   string         // explicação e sugestão
  severity: 'error' | 'warning' | 'info'
}

export interface Question {
  stem:          string           // enunciado / prompt
  choices:       string[]         // alternativas (incluindo correta)
  correctIndex:  number           // índice da alternativa correta
  explanation?:  string           // justificativa (opcional)
  difficulty?:   number           // 0–1
}

/* ─── Regras Haladyna ───────────────────────────────────────────────────────── */

type Rule = (q: Question) => LintIssue | null

const RULES: Rule[] = [

  // H1: Evite enunciados negativos (especialmente dupla negação)
  (q) => {
    const neg = /(não|never|not|nenhum|exceto|except)\s+(não|never|not|nenhum)/i.test(q.stem)
    if (neg) return {
      code: 'H1', severity: 'error',
      rule: 'Dupla negação no enunciado',
      detail: 'Reescreva o enunciado na forma afirmativa. Dupla negação confunde o aluno e mede lógica em vez de conhecimento.',
    }
    return null
  },

  // H2: Enunciado deve ser uma questão ou afirmação incompleta clara
  (q) => {
    if (q.stem.trim().length < 15) return {
      code: 'H2', severity: 'warning',
      rule: 'Enunciado muito curto',
      detail: 'O enunciado tem menos de 15 caracteres. Forneça contexto suficiente para que o aluno entenda o que está sendo pedido.',
    }
    return null
  },

  // H3: Número mínimo de alternativas (3 distratores + 1 correta)
  (q) => {
    if (q.choices.length < 3) return {
      code: 'H3', severity: 'error',
      rule: 'Poucas alternativas',
      detail: `Questões de múltipla escolha devem ter pelo menos 3 alternativas. Esta tem ${q.choices.length}.`,
    }
    return null
  },

  // H4: Número máximo de alternativas (evitar mais de 5)
  (q) => {
    if (q.choices.length > 5) return {
      code: 'H4', severity: 'warning',
      rule: 'Muitas alternativas',
      detail: `Esta questão tem ${q.choices.length} alternativas. Haladyna recomenda no máximo 4–5 para manter o foco no construto.`,
    }
    return null
  },

  // H5: Alternativas devem ter comprimento similar (evitar "correta mais longa")
  (q) => {
    if (q.choices.length < 2) return null
    const lens  = q.choices.map(c => c.length)
    const avg   = lens.reduce((a, b) => a + b, 0) / lens.length
    const corr  = lens[q.correctIndex]
    if (corr > avg * 1.6 && corr > avg + 30) return {
      code: 'H5', severity: 'warning',
      rule: 'Alternativa correta muito mais longa',
      detail: 'A alternativa correta é consideravelmente mais longa que as demais. Isso pode fornecer dicas não intencionais ao aluno. Equilibre os comprimentos.',
    }
    return null
  },

  // H6: Evitar "todas as anteriores" / "nenhuma das anteriores"
  (q) => {
    const patterns = /todas?\s+(as|da|de)\s+(anteriores?|opções?|alternativas?)|nenhuma?\s+(das?)\s+(anteriores?)|all\s+of\s+the\s+above|none\s+of\s+the\s+above/i
    const found = q.choices.some(c => patterns.test(c))
    if (found) return {
      code: 'H6', severity: 'error',
      rule: '"Todas as anteriores" / "Nenhuma das anteriores"',
      detail: 'Evite essas opções — elas medem estratégia de teste em vez de conhecimento e têm efeito negativo na validade psicométrica.',
    }
    return null
  },

  // H7: Evitar palavras absolutas nos distratores ("nunca", "sempre", "todos")
  (q) => {
    const absolutes = /\b(sempre|nunca|todos?|nenhum|jamais|always|never|all|none)\b/i
    const distractors = q.choices.filter((_, i) => i !== q.correctIndex)
    const found = distractors.some(c => absolutes.test(c))
    if (found) return {
      code: 'H7', severity: 'warning',
      rule: 'Palavras absolutas em distratores',
      detail: 'Palavras como "sempre", "nunca", "todos" em distratores são dicas de que a alternativa é incorreta. Reformule.',
    }
    return null
  },

  // H8: Conteúdo do enunciado não deve se repetir nas alternativas
  (q) => {
    const stemWords = new Set(q.stem.toLowerCase().split(/\s+/).filter(w => w.length > 5))
    const repeatedInAll = q.choices.every(c => {
      const choiceWords = c.toLowerCase().split(/\s+/)
      return choiceWords.some(w => stemWords.has(w))
    })
    if (repeatedInAll && stemWords.size > 3) return {
      code: 'H8', severity: 'info',
      rule: 'Palavras do enunciado repetidas em todas as alternativas',
      detail: 'Move palavras comuns a todas as alternativas para o enunciado — reduz leitura redundante.',
    }
    return null
  },

  // H9: Alternativas não devem se sobrepor semanticamente
  (q) => {
    if (q.choices.length < 2) return null
    // Verificação simples: comprimentos muito similares + prefixo compartilhado
    const prefixLen = (a: string, b: string) => {
      let i = 0
      while (i < a.length && i < b.length && a[i] === b[i]) i++
      return i
    }
    for (let i = 0; i < q.choices.length; i++) {
      for (let j = i + 1; j < q.choices.length; j++) {
        const a = q.choices[i].toLowerCase().trim()
        const b = q.choices[j].toLowerCase().trim()
        if (a === b) return {
          code: 'H9', severity: 'error',
          rule: 'Alternativas duplicadas',
          detail: `As alternativas ${i + 1} e ${j + 1} são idênticas. Remova a duplicata.`,
        }
        const shared = prefixLen(a, b)
        if (shared > 20 && shared > Math.min(a.length, b.length) * 0.7) return {
          code: 'H9', severity: 'warning',
          rule: 'Alternativas muito similares',
          detail: `As alternativas ${i + 1} e ${j + 1} compartilham muito texto. Considere diversificar os distratores.`,
        }
      }
    }
    return null
  },

  // H10: Evitar ambiguidade gramatical ("...é a/o _____")
  (q) => {
    if (/(é\s+a?o?\s+_+|is\s+a?\s+_+|____+)/i.test(q.stem) && q.choices.some(c => /^[aeiouAEIOU]/i.test(c))) {
      // stem usa artigo indefinido antes do blank — pode gerar a/an mismatch
      return {
        code: 'H10', severity: 'info',
        rule: 'Possível ambiguidade de artigo no blank',
        detail: 'Quando o enunciado termina em "é um/uma ___", certifique-se de que o artigo concorda com todas as alternativas, ou use "é: ___" sem artigo.',
      }
    }
    return null
  },

  // H11: Distratores devem ser plausíveis (teste de especialista)
  // — verificação automática limitada: checa se distratores são muito curtos
  (q) => {
    const distractors = q.choices.filter((_, i) => i !== q.correctIndex)
    const veryShort = distractors.filter(c => c.trim().length < 3)
    if (veryShort.length > 0) return {
      code: 'H11', severity: 'warning',
      rule: 'Distratores suspeitos (muito curtos)',
      detail: `${veryShort.length} distrator(es) com menos de 3 caracteres. Distratores muito curtos não são plausíveis e reduzem o poder discriminativo.`,
    }
    return null
  },

  // H12: Correta não deve ser sistematicamente na mesma posição
  // — verificação de banco: aqui apenas alerta se estiver na última posição
  (q) => {
    if (q.correctIndex === q.choices.length - 1 && q.choices.length >= 4) return {
      code: 'H12', severity: 'info',
      rule: 'Correta sempre na última posição?',
      detail: 'Se a alternativa correta está sistematicamente na última posição no banco, alunos podem explorar esse padrão. Randomize as posições.',
    }
    return null
  },

  // H13: Enunciado deve medir um único construto
  (q) => {
    const multiConstruct = /\s+(e|and|ou|or)\s+/i.test(q.stem) && q.stem.length > 80
    if (multiConstruct) return {
      code: 'H13', severity: 'info',
      rule: 'Enunciado pode medir múltiplos construtos',
      detail: 'O enunciado é longo e contém conectivos ("e", "ou"). Verifique se está testando apenas um conceito por vez.',
    }
    return null
  },

  // H14: Evitar dicas nos distratores pela gramática do enunciado
  (q) => {
    const endsVerb = /\s+(is|are|was|were|é|são|era|eram)\s*$/i.test(q.stem)
    if (endsVerb) {
      const singular = q.choices.filter(c => !/s\b/i.test(c.split(' ').pop() ?? ''))
      const plural   = q.choices.filter(c => /s\b/i.test(c.split(' ').pop() ?? ''))
      if (singular.length > 0 && plural.length > 0) return {
        code: 'H14', severity: 'info',
        rule: 'Gramática das alternativas pode fornecer dica',
        detail: 'Algumas alternativas estão no singular e outras no plural. Se o enunciado termina em verbo, isso pode revelar qual está correta.',
      }
    }
    return null
  },

  // H15: Complexidade cognitiva — checar se apenas pede memorização óbvia
  (q) => {
    const trivialStems = /^(qual|what)\s+(é|is)\s+(a\s+capital|the\s+capital|o\s+símbolo|the\s+symbol)/i
    if (trivialStems.test(q.stem)) return {
      code: 'H15', severity: 'info',
      rule: 'Questão pode ser de memorização pura',
      detail: 'Considere elevar o nível cognitivo (Bloom): análise, avaliação ou criação em vez de apenas recordação.',
    }
    return null
  },
]

/* ─── API Principal ─────────────────────────────────────────────────────────── */

/**
 * Verifica uma questão e retorna todos os problemas encontrados.
 * Array vazio = questão passou em todos os checks ativos.
 */
export function lintQuestion(question: Question): LintIssue[] {
  return RULES
    .map(rule => rule(question))
    .filter((issue): issue is LintIssue => issue !== null)
}

/**
 * Verifica e retorna apenas erros (severity === 'error').
 */
export function lintErrors(question: Question): LintIssue[] {
  return lintQuestion(question).filter(i => i.severity === 'error')
}

/**
 * Score de qualidade [0–100] baseado nas issues encontradas.
 * Erros custam 20 pontos, warnings 8, infos 2.
 */
export function qualityScore(question: Question): number {
  const issues = lintQuestion(question)
  const penalty = issues.reduce((acc, i) => {
    if (i.severity === 'error')   return acc + 20
    if (i.severity === 'warning') return acc + 8
    return acc + 2
  }, 0)
  return Math.max(0, 100 - penalty)
}
