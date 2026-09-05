/**
 * lib/byokValidator.ts — Motor de Validação em Tempo Real para BYOK (APIs de IA & Supabase)
 *
 * Fornece testes de conexão reativos com medição de latência e diagnósticos didáticos
 * para impedir que o professor salve credenciais incorretas ou incompletas.
 */

export type ByokErrorType =
  | 'empty_credentials'
  | 'invalid_key'
  | 'quota_exceeded'
  | 'network_error'
  | 'invalid_url'
  | 'unknown'

export interface ByokValidationResult {
  ok: boolean
  provider: string
  latencyMs?: number
  message: string
  errorType?: ByokErrorType
}

/**
 * Valida chave de API de provedor de IA com chamada real aos endpoints de checagem.
 */
export async function validateProviderApiKey(provider: string, rawKey: string): Promise<ByokValidationResult> {
  const key = (rawKey || '').trim()
  const prov = (provider || '').toLowerCase().trim()

  if (!key) {
    return {
      ok: false,
      provider: prov,
      errorType: 'empty_credentials',
      message: 'Insira a chave de API antes de testar a conexão.'
    }
  }

  const startTime = Date.now()

  try {
    let res: Response | null = null

    if (prov === 'gemini') {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, {
        method: 'GET'
      })
    } else if (prov === 'openai') {
      res = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` }
      })
    } else if (prov === 'groq') {
      res = await fetch('https://api.groq.com/openai/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` }
      })
    } else if (prov === 'anthropic') {
      res = await fetch('https://api.anthropic.com/v1/models', {
        method: 'GET',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
      })
    } else if (prov === 'elevenlabs') {
      res = await fetch('https://api.elevenlabs.io/v1/user', {
        method: 'GET',
        headers: { 'xi-api-key': key }
      })
    } else {
      // Provedores manuais ou genéricos sem endpoint público de status
      return {
        ok: true,
        provider: prov,
        message: 'Provedor personalizado salvo sem validação remota obrigatória.'
      }
    }

    const latencyMs = Date.now() - startTime

    if (res.ok) {
      return {
        ok: true,
        provider: prov,
        latencyMs,
        message: `Conectado com sucesso (${latencyMs}ms)! Chave válida e ativa.`
      }
    }

    if (res.status === 401 || res.status === 403 || res.status === 400) {
      return {
        ok: false,
        provider: prov,
        latencyMs,
        errorType: 'invalid_key',
        message: `Chave inválida ou não autorizada para ${prov.toUpperCase()} (HTTP ${res.status}). Verifique o token digitado.`
      }
    }

    if (res.status === 429) {
      return {
        ok: false,
        provider: prov,
        latencyMs,
        errorType: 'quota_exceeded',
        message: `Chave válida, mas o limite de cota/saldo da sua conta ${prov.toUpperCase()} foi atingido (Rate Limit / Quota Exceeded).`
      }
    }

    return {
      ok: false,
      provider: prov,
      latencyMs,
      errorType: 'unknown',
      message: `Falha na verificação: o servidor retornou código HTTP ${res.status}.`
    }
  } catch (err: any) {
    const latencyMs = Date.now() - startTime
    return {
      ok: false,
      provider: prov,
      latencyMs,
      errorType: 'network_error',
      message: `Erro de rede ao contactar o servidor ${prov.toUpperCase()}: ${err?.message || 'Falha de conexão.'}`
    }
  }
}

/**
 * Valida credenciais do Supabase próprio do professor (URL e Anon Key).
 */
export async function validateSupabaseCredentials(rawUrl: string, rawAnonKey: string): Promise<ByokValidationResult> {
  const url = (rawUrl || '').trim()
  const anonKey = (rawAnonKey || '').trim()

  if (!url || !anonKey) {
    return {
      ok: false,
      provider: 'supabase',
      errorType: 'empty_credentials',
      message: 'Preencha a URL do projeto e a Chave Anônima (Anon Key).'
    }
  }

  if (!/^https?:\/\/.+/i.test(url)) {
    return {
      ok: false,
      provider: 'supabase',
      errorType: 'invalid_url',
      message: 'A URL do Supabase deve começar com https:// (ex: https://seu-projeto.supabase.co).'
    }
  }

  const cleanUrl = url.replace(/\/+$/, '')
  const startTime = Date.now()

  try {
    const res = await fetch(`${cleanUrl}/rest/v1/`, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`
      }
    })

    const latencyMs = Date.now() - startTime

    if (res.ok || res.status === 200 || res.status === 204) {
      return {
        ok: true,
        provider: 'supabase',
        latencyMs,
        message: `Conexão com Supabase bem-sucedida (${latencyMs}ms)! Projeto ativo e banco acessível.`
      }
    }

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        provider: 'supabase',
        latencyMs,
        errorType: 'invalid_key',
        message: 'A Anon Key informada foi recusada pelo Supabase. Verifique a chave anônima pública nas configurações de API do seu projeto.'
      }
    }

    return {
      ok: false,
      provider: 'supabase',
      latencyMs,
      errorType: 'unknown',
      message: `Supabase respondeu com código inesperado: HTTP ${res.status}.`
    }
  } catch (err: any) {
    const latencyMs = Date.now() - startTime
    return {
      ok: false,
      provider: 'supabase',
      latencyMs,
      errorType: 'network_error',
      message: `Supabase não respondeu na URL informada (${latencyMs}ms). Verifique se o projeto não está pausado ou com URL digitada incorretamente.`
    }
  }
}
