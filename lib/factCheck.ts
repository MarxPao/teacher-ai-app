import { ApiConfig } from '@/components/modules/ApiManager'

export interface FactCheckResult {
  score: number          // 0-100
  level: 'ok' | 'warn' | 'error'
  issues: string[]
  suggestions: string[]
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
  if (api.provider === 'manual' || !api.key) {
    return { score: 0, level: 'warn', issues: ['API não configurada — revisão manual necessária.'], suggestions: [] }
  }

  const prompt = FACT_CHECK_PROMPT(content, grade, subject)

  try {
    let raw = ''

    if (api.provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': api.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerously-allow-browser': 'true' },
        body: JSON.stringify({ model: api.model || 'claude-3-5-sonnet-20241022', max_tokens: 800, messages: [{ role: 'user', content: prompt }] })
      })
      const d = await r.json()
      raw = d.content?.[0]?.text || '{}'
    } else if (api.provider === 'openai' || api.provider === 'deepseek') {
      const baseUrl = api.provider === 'deepseek' ? 'https://api.deepseek.com/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions'
      const r = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api.key}` },
        body: JSON.stringify({ model: api.model, messages: [{ role: 'user', content: prompt }] })
      })
      const d = await r.json()
      raw = d.choices?.[0]?.message?.content || '{}'
    } else if (api.provider === 'gemini') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${api.model}:generateContent?key=${api.key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      })
      const d = await r.json()
      raw = d.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    }

    // Clean potential markdown fences
    raw = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(raw)
    const score: number = parsed.score ?? 80
    return {
      score,
      level: score >= 85 ? 'ok' : score >= 60 ? 'warn' : 'error',
      issues: parsed.issues || [],
      suggestions: parsed.suggestions || []
    }
  } catch {
    return { score: 50, level: 'warn', issues: ['Não foi possível validar o conteúdo automaticamente.'], suggestions: ['Revise manualmente antes de usar.'] }
  }
}
