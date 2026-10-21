import { ApiConfig } from '@/components/modules/ApiManager'
import { guardEgressFetch, maskPii } from '@/lib/piiMasking'
import { getAvailableApisForSelect, selectBestApi } from '@/lib/autoApiSelector'

export interface FactCheckResult {
  score: number          // 0-100
  level: 'ok' | 'warn' | 'error'
  issues: string[]
  suggestions: string[]
  coverage: 'full' | 'chunked' | 'partial'
  totalCharacters: number
  analyzedCharacters: number
  coverageNotice: string
}

const FACT_CHECK_PROMPT = (content: string, grade: string, subject: string) => `
Você é um especialista em educação e revisão de conteúdo pedagógico.
Analise o seguinte conteúdo gerado por IA para uso em sala de aula (${subject}, ${grade}) e verifique:

1. CONSISTÊNCIA FACTUAL: Há datas, nomes, fórmulas ou fatos incorretos?
2. ADEQUAÇÃO ETÁRIA: O vocabulário e complexidade estão adequados para ${grade}?
3. QUALIDADE DO GABARITO: As respostas marcadas como corretas estão de fato corretas?
4. AMBIGUIDADE: Há questões com dupla interpretação ou enunciados confusos?
5. CONFORMIDADE PEDAGÓGICA: O conteúdo segue boas práticas de ensino?

CONTEÚDO A ANALISAR:
${content.substring(0, 3000)}

Responda EXATAMENTE neste formato JSON (sem markdown, sem explicações extras):
{
  "score": <número de 0 a 100>,
  "issues": ["<problema 1>", "<problema 2>"],
  "suggestions": ["<sugestão 1>", "<sugestão 2>"]
}
Se não houver problemas, retorne issues e suggestions como arrays vazios e score 95+.
`

export async function runFactCheck(
  content: string,
  grade: string,
  subject: string,
  api: ApiConfig
): Promise<FactCheckResult> {
  const totalChars = (content || '').length
  const isLong = totalChars > 3000
  const analyzedChars = Math.min(totalChars, 3000)
  const coverageType: 'full' | 'partial' = isLong ? 'partial' : 'full'
  const coverageNotice = isLong
    ? `Verificação factual parcial (primeiros ${analyzedChars} caracteres analisados de ${totalChars} caracteres totais).`
    : `Verificação factual integral (100% do conteúdo analisado: ${totalChars} caracteres).`

  let effectiveApi: ApiConfig | null = api
  if (!effectiveApi || effectiveApi.provider === 'manual' || effectiveApi.id === 'auto' || !effectiveApi.key) {
    const best = selectBestApi(getAvailableApisForSelect(), 'reasoning', true)
    if (best && best.provider !== 'manual' && best.key) {
      effectiveApi = best
    }
  }

  if (!effectiveApi || effectiveApi.provider === 'manual' || !effectiveApi.key) {
    return {
      score: 0,
      level: 'warn',
      issues: ['API não configurada — revisão manual necessária.'],
      suggestions: [],
      coverage: coverageType,
      totalCharacters: totalChars,
      analyzedCharacters: analyzedChars,
      coverageNotice
    }
  }

  const rawPrompt = FACT_CHECK_PROMPT(content, grade, subject)
  const maskedPromptObj = maskPii(rawPrompt)
  const prompt = maskedPromptObj.maskedText

  try {
    let raw = ''

    if (effectiveApi.provider === 'anthropic') {
      const r = await guardEgressFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': effectiveApi.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerously-allow-browser': 'true' },
        body: JSON.stringify({ model: effectiveApi.model || 'claude-3-5-sonnet-20241022', max_tokens: 800, messages: [{ role: 'user', content: prompt }] })
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error.message || 'Erro Anthropic')
      raw = d.content?.[0]?.text || '{}'
    } else if (['openai', 'deepseek', 'groq', 'openrouter', 'zhipu', 'siliconflow'].includes(effectiveApi.provider)) {
      const baseUrl = effectiveApi.provider === 'deepseek' ? 'https://api.deepseek.com/v1/chat/completions'
        : effectiveApi.provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions'
        : effectiveApi.provider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions'
        : effectiveApi.provider === 'zhipu' ? 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
        : effectiveApi.provider === 'siliconflow' ? 'https://api.siliconflow.cn/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions'
      const r = await guardEgressFetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${effectiveApi.key}` },
        body: JSON.stringify({ model: effectiveApi.model || (effectiveApi.provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini'), messages: [{ role: 'user', content: prompt }] })
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error.message || `Erro ${effectiveApi.provider}`)
      raw = d.choices?.[0]?.message?.content || '{}'
    } else if (effectiveApi.provider === 'gemini') {
      // F1: garantir modelo padrão para não gerar URL inválida
      const model = effectiveApi.model && !effectiveApi.model.includes('gemini-2.0') && !effectiveApi.model.includes('gemini-1.5') && !effectiveApi.model.includes('gemini-2.5') ? effectiveApi.model : 'gemini-2.5-flash'
      const r = await guardEgressFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': effectiveApi.key
        },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error.message || 'Erro Gemini')
      raw = d.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    }

    raw = maskedPromptObj.unmask(raw)

    // F2-style: clean markdown fences and extract JSON robustly
    raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()

    interface ParsedFactCheck {
      score?: number
      issues?: string[]
      suggestions?: string[]
    }

    let parsed: ParsedFactCheck = {}
    try {
      parsed = JSON.parse(raw) as ParsedFactCheck
    } catch {
      // Try to extract JSON object from conversational text
      const start = raw.indexOf('{')
      const end   = raw.lastIndexOf('}')
      if (start !== -1 && end > start) {
        try {
          parsed = JSON.parse(raw.slice(start, end + 1)) as ParsedFactCheck
        } catch {
          throw new Error('Resposta da IA em formato inválido para fact-check.')
        }
      } else {
        throw new Error('Resposta da IA em formato inválido para fact-check.')
      }
    }
    const score: number = typeof parsed.score === 'number' ? parsed.score : 80
    return {
      score,
      level: score >= 85 ? 'ok' : score >= 60 ? 'warn' : 'error',
      issues:      Array.isArray(parsed.issues)      ? parsed.issues      : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      coverage: coverageType,
      totalCharacters: totalChars,
      analyzedCharacters: analyzedChars,
      coverageNotice
    }
  } catch {
    return {
      score: 50,
      level: 'warn',
      issues: ['Não foi possível validar o conteúdo automaticamente.'],
      suggestions: ['Revise manualmente antes de usar.'],
      coverage: coverageType,
      totalCharacters: totalChars,
      analyzedCharacters: analyzedChars,
      coverageNotice
    }
  }
}
