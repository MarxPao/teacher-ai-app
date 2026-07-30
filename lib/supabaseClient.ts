/**
 * supabaseClient.ts — Conexão com Supabase para Cloud Sync em tempo real
 * Utiliza preferencialmente a service_role key ou anonKey para acesso garantido.
 */

export interface SupabaseConfig {
  url: string
  anonKey: string
  serviceKey: string
}

function getSupabaseConfig(): SupabaseConfig | null {
  try {
    const s = localStorage.getItem('teacher_supabase_config')
    return s ? JSON.parse(s) : null
  } catch { return null }
}

function getActiveKey(cfg: SupabaseConfig): string {
  return cfg.serviceKey || cfg.anonKey || ''
}

/**
 * Sincroniza todos os dados do app com o Supabase.
 * Usa a tabela `teacher_sync` com colunas: `key` TEXT, `value` JSONB, `updated_at` TIMESTAMPTZ.
 */
export async function syncToSupabase(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return { ok: false, error: 'Supabase não configurado.' }
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return { ok: false, error: 'Chave do Supabase ausente.' }

  try {
    const rows = Object.entries(payload).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }))

    const res = await fetch(`${cfg.url}/rest/v1/teacher_sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { ok: false, error: err.message || `HTTP ${res.status}` }
    }

    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede' }
  }
}

/**
 * Carrega dados do Supabase e restaura para localStorage.
 */
export async function loadFromSupabase(): Promise<{ ok: boolean; count?: number; error?: string }> {
  const cfg = getSupabaseConfig()
  if (!cfg?.url) return { ok: false, error: 'Supabase não configurado.' }
  const apiKey = getActiveKey(cfg)
  if (!apiKey) return { ok: false, error: 'Chave do Supabase ausente.' }

  try {
    const res = await fetch(`${cfg.url}/rest/v1/teacher_sync?select=key,value`, {
      headers: { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}` },
    })

    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }

    const rows: Array<{ key: string; value: unknown }> = await res.json()
    let count = 0
    for (const row of rows) {
      if (row.key && row.value !== undefined) {
        localStorage.setItem(row.key, JSON.stringify(row.value))
        count++
      }
    }
    window.dispatchEvent(new Event('storage'))
    return { ok: true, count }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede' }
  }
}

/**
 * Verifica se a conexão com Supabase está funcionando.
 */
export async function testSupabaseConnection(url: string, key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    })
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede' }
  }
}
