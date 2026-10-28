/**
 * lib/contentEval.ts — Content Eval + Sentiment Stub (Gaps 18/20 · Onda 4)
 *
 * Dois módulos em um arquivo:
 *
 * 1. ContentEval: avalia segurança e adequação pedagógica de textos
 *    gerados por LLM antes de exibir ao professor/aluno.
 *    Detecta: PII acidental, linguagem inapropriada, viés de gênero,
 *    afirmações perigosas sobre saúde/segurança.
 *
 * 2. SentimentAnalyzer: análise de sentimento leve (léxico PT/EN)
 *    para observações de alunos e comunicações com pais.
 *    Sem chamada de API — funciona offline com léxico embutido.
 */

/* ═══════════════════════════════════════════════════════════════════════════════
   CONTENT EVAL
═══════════════════════════════════════════════════════════════════════════════ */

export type ContentRisk = 'pii' | 'inappropriate' | 'bias' | 'health_safety' | 'hallucination_risk'

export interface ContentFlag {
  risk:      ContentRisk
  severity:  'block' | 'warn' | 'info'
  excerpt:   string    // trecho que disparou a flag (sem PII completo)
  rule:      string    // descrição da regra
}

export interface ContentEvalResult {
  safe:    boolean
  score:   number          // 0–100 (100 = sem problemas)
  flags:   ContentFlag[]
  summary: string
}

/* ─── Padrões de risco ────────────────────────────────────────────────────────── */
type PatternDef = { pattern: RegExp; risk: ContentRisk; severity: ContentFlag['severity']; rule: string }

const CONTENT_PATTERNS: PatternDef[] = [
  // PII: CPF
  {
    pattern:  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/,
    risk:     'pii', severity: 'block',
    rule:     'CPF detectado no texto',
  },
  // PII: telefone BR
  {
    pattern:  /\b(\+55\s?)?(\(?\d{2}\)?\s?)?\d{4,5}[-\s]?\d{4}\b/,
    risk:     'pii', severity: 'warn',
    rule:     'Possível número de telefone',
  },
  // PII: e-mail
  {
    pattern:  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
    risk:     'pii', severity: 'warn',
    rule:     'Endereço de e-mail no texto',
  },
  // Linguagem inapropriada (básico)
  {
    pattern:  /\b(idiota|burro|imbecil|estúpid[ao]|retardad[ao]|lixo)\b/i,
    risk:     'inappropriate', severity: 'block',
    rule:     'Linguagem ofensiva detectada',
  },
  // Saúde / segurança: receitas médicas
  {
    pattern:  /\b(tome|ingerir?|dose\s+de)\s+\d+\s*(mg|ml|comprimido)/i,
    risk:     'health_safety', severity: 'block',
    rule:     'Possível prescrição médica no texto pedagógico',
  },
  // Viés de gênero: generalizações
  {
    pattern:  /\b(meninas?\s+(são|é)\s+(melhores?|piores?|mais)\s+(em|na?)\s+\w+|boys?\s+(are|is)\s+(better|worse)\s+(at|in))/i,
    risk:     'bias', severity: 'warn',
    rule:     'Possível generalização por gênero',
  },
  // Risco de alucinação: afirmações absolutas sobre datas/fatos históricos
  {
    pattern:  /\bem\s+(exatamente|precisamente)?\s+\d{4}\s+(ocorreu|aconteceu|foi\s+criado)/i,
    risk:     'hallucination_risk', severity: 'info',
    rule:     'Afirmação histórica muito precisa — verificar com fonte',
  },
]

function truncate(s: string, max = 60): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}

/**
 * Avalia o conteúdo de um texto e retorna flags de risco.
 */
export function evalContent(text: string): ContentEvalResult {
  const flags: ContentFlag[] = []

  for (const def of CONTENT_PATTERNS) {
    const match = def.pattern.exec(text)
    if (match) {
      // Para PII: não expõe o match completo
      const excerpt = def.risk === 'pii'
        ? '[redacted]'
        : truncate(match[0])
      flags.push({ risk: def.risk, severity: def.severity, excerpt, rule: def.rule })
    }
  }

  const blockers = flags.filter(f => f.severity === 'block').length
  const warns    = flags.filter(f => f.severity === 'warn').length
  const infos    = flags.filter(f => f.severity === 'info').length
  const score    = Math.max(0, 100 - blockers * 40 - warns * 15 - infos * 5)
  const safe     = blockers === 0

  return {
    safe,
    score,
    flags,
    summary: safe
      ? warns + infos > 0 ? `${warns} aviso(s), ${infos} informação(ões) — revisar antes de usar`
                          : 'Conteúdo aprovado'
      : `${blockers} problema(s) crítico(s) — NÃO exibir sem revisão`,
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SENTIMENT ANALYZER
═══════════════════════════════════════════════════════════════════════════════ */

export type SentimentLabel = 'positive' | 'negative' | 'neutral' | 'mixed'

export interface SentimentResult {
  label:       SentimentLabel
  score:       number    // -1 (muito negativo) a +1 (muito positivo)
  confidence:  number    // 0–1
  highlights:  string[]  // palavras que contribuíram mais
}

/* ─── Léxico simplificado PT/EN ──────────────────────────────────────────────── */
const POSITIVE_WORDS = new Set([
  // PT
  'excelente','ótimo','bom','boa','parabéns','dedicado','esforçado','progresso',
  'melhora','evoluiu','participativo','engajado','criativo','responsável','capaz',
  'superou','alcançou','compreendeu','desenvolveu','demonstrou','interesse',
  // EN
  'excellent','great','good','well','congratulations','dedicated','progress',
  'improved','participative','engaged','creative','capable','achieved','understood',
])

const NEGATIVE_WORDS = new Set([
  // PT
  'fraco','ruim','dificuldade','problema','baixo','não','jamais','nunca','falta',
  'ausente','desatento','desinteressado','atrasado','reprovado','preocupante',
  'abaixo','insuficiente','negligente','recusa','resistência',
  // EN
  'weak','poor','difficulty','problem','low','not','never','absent','inattentive',
  'disengaged','late','failed','concerning','below','insufficient','refuses',
])

const INTENSIFIERS = new Set([
  'muito','bastante','extremamente','pouco','levemente','quase','sempre','frequentemente',
  'very','quite','extremely','slightly','almost','always','frequently',
])

/**
 * Analisa o sentimento de um texto (observação de aluno, comunicação com pais).
 */
export function analyzeSentiment(text: string): SentimentResult {
  const words   = text.toLowerCase().split(/[\s,;.!?]+/).filter(Boolean)
  const highlights: string[] = []
  let score = 0
  let n     = 0
  let intensifier = 1.0

  for (let i = 0; i < words.length; i++) {
    const w = words[i]

    if (INTENSIFIERS.has(w)) {
      intensifier = /pouco|slightly|levemente/.test(w) ? 0.5 : 1.5
      continue
    }

    if (POSITIVE_WORDS.has(w)) {
      score += 1 * intensifier
      n++
      highlights.push(w)
    } else if (NEGATIVE_WORDS.has(w)) {
      score -= 1 * intensifier
      n++
      highlights.push(w)
    }

    intensifier = 1.0
  }

  if (n === 0) return { label: 'neutral', score: 0, confidence: 0.5, highlights: [] }

  const normalizedScore = Math.max(-1, Math.min(1, score / n))
  const confidence = Math.min(1, n / 5 * 0.5 + 0.5)

  let label: SentimentLabel
  if (score > 0.3 && score < 0) label = 'mixed'
  else if (normalizedScore > 0.2) label = 'positive'
  else if (normalizedScore < -0.2) label = 'negative'
  else label = 'neutral'

  return {
    label,
    score: normalizedScore,
    confidence,
    highlights: [...new Set(highlights)].slice(0, 5),
  }
}

/**
 * Avalia uma observação de aluno e retorna um diagnóstico combinado
 * (segurança + sentimento) útil para o módulo Communications.
 */
export function evaluateObservation(text: string): {
  content: ContentEvalResult
  sentiment: SentimentResult
  recommendation: string
} {
  const content   = evalContent(text)
  const sentiment = analyzeSentiment(text)

  let recommendation = ''
  if (!content.safe) {
    recommendation = '⚠️ Revisar antes de salvar: ' + content.summary
  } else if (sentiment.label === 'negative' && sentiment.confidence > 0.6) {
    recommendation = '💬 Tom negativo detectado. Considere reformular para comunicação com responsáveis.'
  } else if (sentiment.label === 'positive') {
    recommendation = '✅ Observação positiva e segura.'
  } else {
    recommendation = 'ℹ️ Conteúdo neutro — verificar contexto antes de compartilhar.'
  }

  return { content, sentiment, recommendation }
}
