/**
 * lib/webSearch.ts — Utilitário de Busca na Internet para a Rafinha AI
 * Permite que a Rafinha pesquise fatos atualizados, diretrizes da BNCC, notícias,
 * regras gramaticais avançadas e qualquer informação geral em tempo real.
 */

export interface WebSearchResult {
  title: string
  snippet: string
  url?: string
}

/**
 * Realiza uma busca na web utilizando a API do DuckDuckGo Instant Answer / Search
 */
export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  if (!query || !query.trim()) return []

  try {
    const encodedQuery = encodeURIComponent(query.trim())
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodedQuery}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
      }
    })

    if (!response.ok) {
      // Fallback para API de DuckDuckGo Instant Answer
      return searchDuckDuckGoApi(query)
    }

    const html = await response.text()
    const results: WebSearchResult[] = []

    // Extrai snippets de resultados usando RegExp no HTML retornado pelo DuckDuckGo
    const resultRegex = /<a class="result__snippet[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
    const matches = Array.from(html.matchAll(resultRegex))

    for (let i = 0; i < Math.min(matches.length, 5); i++) {
      const match = matches[i]
      const rawUrl = match[1]
      let snippet = match[2].replace(/<[^>]*>/g, '').trim()
      
      // Decodifica entidades HTML básicas
      snippet = snippet
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&#x27;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')

      if (snippet.length > 20) {
        results.push({
          title: `Resultado da Web ${i + 1}`,
          snippet,
          url: rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl
        })
      }
    }

    if (results.length === 0) {
      return searchDuckDuckGoApi(query)
    }

    return results
  } catch (error) {
    console.warn('[Web Search Fallback Triggered]:', error)
    return searchDuckDuckGoApi(query)
  }
}

/**
 * Fallback para a API JSON do DuckDuckGo
 */
async function searchDuckDuckGoApi(query: string): Promise<WebSearchResult[]> {
  try {
    const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`)
    if (!res.ok) return []

    const data = await res.json()
    const results: WebSearchResult[] = []

    if (data.AbstractText) {
      results.push({
        title: data.Heading || 'Resultado Principal',
        snippet: data.AbstractText,
        url: data.AbstractURL || ''
      })
    }

    if (Array.isArray(data.RelatedTopics)) {
      for (const item of data.RelatedTopics.slice(0, 4)) {
        if (item.Text) {
          results.push({
            title: item.FirstURL ? item.FirstURL.split('/').pop() || 'Resultado' : 'Resultado Relacionado',
            snippet: item.Text,
            url: item.FirstURL || ''
          })
        }
      }
    }

    return results
  } catch {
    return []
  }
}
