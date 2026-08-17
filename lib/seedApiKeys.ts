/**
 * seedApiKeys.ts — Auto-seed das chaves de API fornecidas no Gerenciador
 *
 * Este arquivo é executado uma única vez para pré-configurar as APIs no localStorage.
 * As chaves NÃO devem ficar neste arquivo em produção — elas são apenas para inicialização local.
 * O usuário pode substituí-las a qualquer momento pelo Gerenciador de APIs no app.
 *
 * IMPORTANTE: Após configurar, remova (ou substitua por variáveis de ambiente) as chaves deste arquivo.
 */

export interface ApiSeed {
  id: string
  name: string
  provider: string
  key: string
  model: string
  active: boolean
  voiceId?: string
}

// ─── Executa seed somente se ainda não configurado ────────────────────────────
export function seedApiKeysIfNeeded(userProvidedKeys: Record<string, string>) {
  const STORAGE_KEY = 'teacher_apis'
  const SEED_VERSION_KEY = 'teacher_api_seed_v6'

  // Só roda uma vez por versão de seed
  if (typeof window === 'undefined') return
  const currentStatus = localStorage.getItem(SEED_VERSION_KEY)
  if (currentStatus === 'done' || currentStatus === 'pending') return
  localStorage.setItem(SEED_VERSION_KEY, 'pending')

  const existing: ApiSeed[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')

  const providerMap: Record<string, string> = {
    zhipu:       'zhipu',
    siliconflow: 'siliconflow',
    openrouter:  'openrouter',
    gemini:      'gemini',
    groq:        'groq',
    openai:      'openai',
    deepseek:    'deepseek',
    anthropic:   'anthropic',
    elevenlabs:  'elevenlabs',
  }

  const updated = existing.length ? [...existing] : [
    { id: 'manual',      name: 'Manual Copy (Free Mode)',               provider: 'manual',      key: '', model: '',                         active: true  },
    { id: 'zhipu',       name: 'Zhipu AI (GLM-4-Flash - Grátis)',        provider: 'zhipu',       key: '', model: 'glm-4-flash',              active: false },
    { id: 'siliconflow',  name: 'SiliconFlow (Qwen2.5 / DeepSeek - Grátis)', provider: 'siliconflow', key: '', model: 'Qwen/Qwen2.5-72B-Instruct',  active: false },
    { id: 'openrouter',  name: 'OpenRouter (Rota Gratuita Permanente)', provider: 'openrouter',  key: '', model: 'google/gemma-2-9b-it:free', active: false },
    { id: 'groq',        name: 'Groq Llama-3 (Rápido)',                 provider: 'groq',        key: '', model: 'llama-3.3-70b-versatile',  active: false },
    { id: 'deepseek',    name: 'DeepSeek AI (V3 / R1)',                 provider: 'deepseek',    key: '', model: 'deepseek-chat',            active: false },
    { id: 'gemini',      name: 'Google Gemini Flash',                   provider: 'gemini',      key: '', model: 'gemini-2.0-flash',         active: false },
    { id: 'gpt',         name: 'OpenAI GPT-4o',                        provider: 'openai',      key: '', model: 'gpt-4o-mini',              active: false },
    { id: 'claude',      name: 'Anthropic Claude',                      provider: 'anthropic',   key: '', model: 'claude-opus-4-5',          active: false },
    { id: 'elevenlabs',  name: 'ElevenLabs (Voz Ultra-Natural)',        provider: 'elevenlabs',  key: '', model: 'eleven_multilingual_v2',   active: false, voiceId: 'MF3mGyEYCl7XYWbV9V6O' },
  ]


  // Aplica as chaves fornecidas
  let anyKeySet = false
  for (const api of updated) {
    const pKey = providerMap[api.provider]
    if (!pKey) continue
    const newKey = userProvidedKeys[`${pKey}_key`] || userProvidedKeys[pKey]
    if (newKey) {
      api.key = newKey
      api.active = true
      anyKeySet = true
    }
  }

  if (anyKeySet) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    window.postMessage({ action: 'SYNC_APIS', apis: updated }, '*')
  }

  localStorage.setItem(SEED_VERSION_KEY, 'done')
}
