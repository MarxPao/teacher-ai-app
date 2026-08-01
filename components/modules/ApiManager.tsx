'use client'
import { useState, useEffect } from 'react'
import ModuleShell from '@/components/ModuleShell'
import ModuleCard from '@/components/ModuleCard'
import { syncToSupabase, loadFromSupabase, testSupabaseConnection } from '@/lib/supabaseClient'
import { TASK_DESCRIPTIONS, TaskType } from '@/lib/autoApiSelector'

export interface ApiConfig {
  id: string
  name: string
  provider: 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'groq' | 'zhipu' | 'siliconflow' | 'openrouter' | 'manual' | 'elevenlabs'
  key: string
  model: string
  active: boolean
  voiceId?: string  // ElevenLabs
}

const DEFAULT_APIS: ApiConfig[] = [
  { id: 'manual',      name: 'Manual Copy (Free Mode)',               provider: 'manual',      key: '', model: '',                           active: true  },
  { id: 'zhipu',       name: 'Zhipu AI (GLM-4-Flash - Grátis)',        provider: 'zhipu',       key: '', model: 'glm-4-flash',                active: false },
  { id: 'siliconflow',  name: 'SiliconFlow (Qwen2.5 / DeepSeek - Grátis)', provider: 'siliconflow', key: '', model: 'Qwen/Qwen2.5-72B-Instruct',    active: false },
  { id: 'openrouter',  name: 'OpenRouter (Rota Gratuita Permanente)', provider: 'openrouter',  key: '', model: 'google/gemma-2-9b-it:free',   active: false },
  { id: 'groq',        name: 'Groq Llama-3 (Rápido)',                 provider: 'groq',        key: '', model: 'llama-3.3-70b-versatile',    active: false },
  { id: 'gemini',      name: 'Google Gemini Flash',                   provider: 'gemini',      key: '', model: 'gemini-2.0-flash',           active: false },
  { id: 'gpt',         name: 'OpenAI GPT-4o',                        provider: 'openai',      key: '', model: 'gpt-4o-mini',                active: false },
  { id: 'claude',      name: 'Anthropic Claude',                      provider: 'anthropic',   key: '', model: 'claude-opus-4-5',            active: false },
  { id: 'elevenlabs',  name: 'ElevenLabs (Voz Ultra-Natural)',        provider: 'elevenlabs',  key: '', model: 'eleven_multilingual_v2',     active: false, voiceId: 'MF3mGyEYCl7XYWbV9V6O' },
]

/* ─── Guia de APIs ──────────────────────────────────────────────────────────── */
const API_GUIDE = [
  {
    id: 'zhipu', icon: 'ti-trident', color: '#cb4b16', label: 'Zhipu AI (GLM-4-Flash)', cost: 'GRÁTIS (100%)',
    usage: 'Trator da operação: latência ultrabaixa, 131k de contexto e alto throughput sem engasgos.',
    steps: ['Acesse open.bigmodel.cn/usercenter/apikeys','Crie conta gratuita com e-mail','Clique em "API Keys" no User Center','Clique em "Create API Key"','Copie a chave e cole no campo'],
    link: 'https://open.bigmodel.cn/usercenter/apikeys', linkLabel: 'Acessar Zhipu BigModel Console →',
    tip: 'Modelo recomendado: glm-4-flash. Totalmente gratuito no tier de dev.',
  },
  {
    id: 'siliconflow', icon: 'ti-cpu', color: '#268bd2', label: 'SiliconFlow (Hub Qwen)', cost: 'GRÁTIS ILIMITADO',
    usage: 'Motor hiperotimizado para inferência de modelos open-source (Qwen2.5, DeepSeek V3/R1).',
    steps: ['Acesse cloud.siliconflow.cn/account/ak','Faça login/cadastro gratuito','Clique em "API Keys" no menu lateral','Clique em "Create New API Key"','Copie a chave e cole no campo'],
    link: 'https://cloud.siliconflow.cn/account/ak', linkLabel: 'Acessar SiliconFlow Cloud →',
    tip: 'Modelo recomendado: Qwen/Qwen2.5-72B-Instruct. Redução de 32% na latência.',
  },
  {
    id: 'openrouter', icon: 'ti-route', color: '#b58900', label: 'OpenRouter (Failover)', cost: 'GRÁTIS PERMANENTE',
    usage: 'Rota de contingência e redundância ilimitada para dezenas de modelos gratuitos.',
    steps: ['Acesse openrouter.ai/keys','Crie conta com Google ou GitHub sem cartão','Clique em "Create Key"','Copie a chave e cole no campo'],
    link: 'https://openrouter.ai/keys', linkLabel: 'Acessar OpenRouter Keys →',
    tip: 'Modelos recomendados: google/gemma-2-9b-it:free ou meta-llama/llama-3.1-8b-instruct:free.',
  },
  {
    id: 'groq', icon: 'ti-bolt', color: '#dc322f', label: 'Groq Llama-3', cost: 'GRÁTIS',
    usage: 'Chat agêntico rápido (Rafinha) + Transcrição de voz (Whisper)',
    steps: ['Acesse console.groq.com','Crie conta gratuita com e-mail ou Google','Clique em "API Keys" no menu lateral','Clique em "Create API Key"','Copie a chave e cole no campo'],
    link: 'https://console.groq.com/keys', linkLabel: 'Acessar Groq Console →',
    tip: 'Modelo recomendado: llama-3.3-70b-versatile. Limite generoso no plano gratuito.',
  },
  {
    id: 'gemini', icon: 'ti-stars', color: '#859900', label: 'Google Gemini', cost: 'GRÁTIS',
    usage: 'Geração de questões ELT, planos de aula, análise de áudio/imagem',
    steps: ['Acesse aistudio.google.com','Faça login com sua conta Google','Clique em "Get API key" no painel','Clique em "Create API key in new project"','Copie e cole no campo'],
    link: 'https://aistudio.google.com/app/apikey', linkLabel: 'Acessar Google AI Studio →',
    tip: 'Modelo recomendado: gemini-2.0-flash. 15 req/min gratuito.',
  },
  {
    id: 'gpt', icon: 'ti-sparkles', color: '#268bd2', label: 'OpenAI GPT-4o', cost: 'PAGO',
    usage: 'Raciocínio pedagógico complexo + TTS (voz HD para a Rafinha)',
    steps: ['Acesse platform.openai.com','Crie conta e adicione créditos ($5 mínimo)','Clique em "API keys" → "Create new secret key"','Copie e cole'],
    link: 'https://platform.openai.com/api-keys', linkLabel: 'Acessar OpenAI Platform →',
    tip: 'Se ativar OpenAI, a Rafinha usará a voz TTS HD automaticamente.',
  },
  {
    id: 'claude', icon: 'ti-brain', color: '#b58900', label: 'Anthropic Claude', cost: 'PAGO',
    usage: 'Planejamento pedagógico avançado e análises longas e detalhadas',
    steps: ['Acesse console.anthropic.com','Crie conta e adicione método de pagamento','Vá em "API Keys" → "Create Key"','Defina limite de gasto mensal (recomendado: $10)','Copie a chave'],
    link: 'https://console.anthropic.com', linkLabel: 'Acessar Anthropic Console →',
    tip: 'Modelo recomendado: claude-opus-4-5. Mais inteligente para raciocínio pedagógico.',
  },
  {
    id: 'elevenlabs', icon: 'ti-microphone-2', color: '#6c71c4', label: 'ElevenLabs', cost: 'FREEMIUM',
    usage: 'Voz ultra-natural para a Rafinha em Português Brasileiro',
    steps: ['Acesse elevenlabs.io','Crie conta gratuita (10.000 caracteres/mês)','Clique no ícone do usuário → "Profile + API key"','Copie a API key e cole','Escolha uma voz no seletor'],
    link: 'https://elevenlabs.io', linkLabel: 'Acessar ElevenLabs →',
    tip: 'Prioridade: ElevenLabs > OpenAI TTS > Web Speech. Voz Bella é ótima em PT-BR.',
  },
]

/* ─── Vozes ElevenLabs para PT-BR ───────────────────────────────────────────── */
const ELEVEN_VOICES = [
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli — Expressiva, jovem' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi — Confiante, clara' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella — Natural, quente' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni — Masculina, grave' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold — Energética' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam — Profissional' },
]

/* ─── Mapa de prioridade do modo AUTO por tipo de tarefa ─────────────────────── */
const AUTO_PRIORITY: Record<TaskType, string[]> = {
  chat:        ['groq',       'gemini',    'openai', 'anthropic'],
  exam:        ['gemini',     'openai',    'anthropic', 'groq'],
  lesson_plan: ['anthropic',  'openai',    'gemini', 'groq'],
  reasoning:   ['openai',     'anthropic', 'gemini', 'groq'],
  vision:      ['openai',     'gemini',    'anthropic'],
  tts:         ['elevenlabs', 'openai',    'groq'],
  stt:         ['groq',       'openai'],
}

function TokenProgressBar({ provider }: { provider: string }) {
  const [usage, setUsage] = useState<any>(null)
  const [isHovered, setIsHovered] = useState(false)

  const reload = () => {
    try {
      const { getProviderUsage } = require('@/lib/tokenTracker')
      setUsage(getProviderUsage(provider))
    } catch {}
  }

  useEffect(() => {
    reload()
    window.addEventListener('storage', reload)
    return () => window.removeEventListener('storage', reload)
  }, [provider])

  if (!usage) return null

  const softLimit = usage.softLimitTokens || 500000
  const exactPct = (usage.totalTokens / softLimit) * 100
  const pct = Math.min(Math.round(exactPct), 100)
  const formattedPct = exactPct > 0 && exactPct < 1 ? exactPct.toFixed(1) : pct.toString()
  const barColor = pct > 85 ? '#dc322f' : pct > 60 ? '#b58900' : '#2d9d5d'

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const { resetProviderUsage } = require('@/lib/tokenTracker')
      resetProviderUsage(provider)
      reload()
    } catch {}
  }

  const tooltipText = `${formattedPct}% do limite utilizado (${usage.totalTokens.toLocaleString('pt-BR')} / ${softLimit.toLocaleString('pt-BR')} Tokens)`

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed rgba(88,110,117,0.15)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#073642' }}>
          <i className="ti ti-chart-bar" style={{ color: barColor }} />
          <span>Consumo de Tokens: <strong>{usage.totalTokens.toLocaleString('pt-BR')}</strong> / {softLimit.toLocaleString('pt-BR')} ({formattedPct}%)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: usage.estimatedCostUsd > 0 ? '#b58900' : '#859900' }}>
            {usage.estimatedCostUsd > 0 ? `~$${usage.estimatedCostUsd.toFixed(4)} USD` : 'Grátis'}
          </span>
          <button onClick={handleReset} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(88,110,117,0.2)', background: '#fdf6e3', color: '#586e75', cursor: 'pointer' }} title="Zerar consumo de tokens">
            Zerar
          </button>
        </div>
      </div>

      {/* Container com Hover & Tooltip Flutuante */}
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={tooltipText}
        style={{ position: 'relative', padding: '4px 0', cursor: 'pointer' }}
      >
        {/* Tooltip flutuante no Hover */}
        {isHovered && (
          <div style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%) translateY(-6px)',
            background: '#073642',
            color: '#fdf6e3',
            padding: '5px 12px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 14px rgba(0,43,54,0.25)',
            zIndex: 50,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            animation: 'fadeIn 0.15s ease'
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: barColor }} />
            <span><strong>{formattedPct}%</strong> Usado ({usage.totalTokens.toLocaleString('pt-BR')} / {softLimit.toLocaleString('pt-BR')} Tokens)</span>
          </div>
        )}

        {/* Barra de Progresso Visual */}
        <div style={{ width: '100%', height: 10, background: '#ede8dc', borderRadius: 5, overflow: 'hidden', position: 'relative', border: isHovered ? `1px solid ${barColor}` : '1px solid transparent', transition: 'all 0.2s' }}>
          <div style={{ width: `${Math.max(pct, usage.totalTokens > 0 ? 2 : 0)}%`, background: barColor, height: '100%', borderRadius: 5, transition: 'width 0.4s ease' }} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#93a1a1', marginTop: 4 }}>
        <span>Entrada: {usage.promptTokens.toLocaleString('pt-BR')}t | Saída: {usage.completionTokens.toLocaleString('pt-BR')}t</span>
        <span>{usage.requestsCount} requisições {usage.lastUsedAt !== 'Nunca' ? `· Último: ${usage.lastUsedAt}` : ''}</span>
      </div>
    </div>
  )
}

/* ─── Componente ─────────────────────────────────────────────────────────────── */
export default function ApiManager() {
  const [apis,        setApis]        = useState<ApiConfig[]>([])
  const [saved,       setSaved]       = useState(false)
  const [showKeys,    setShowKeys]    = useState<Record<string, boolean>>({})
  const [tab,         setTab]         = useState<'hierarchy' | 'config' | 'auto' | 'supabase' | 'guide' | 'test'>('hierarchy')
  const [openGuide,   setOpenGuide]   = useState<string | null>(null)
  const [testResult,  setTestResult]  = useState<Record<string, string>>({})
  const [testing,     setTesting]     = useState<string | null>(null)
  const [autoMode,    setAutoMode]    = useState(false)
  const [sbUrl,       setSbUrl]       = useState('')
  const [sbAnonKey,   setSbAnonKey]   = useState('')
  const [sbServiceKey,setSbServiceKey]= useState('')
  const [sbStatus,    setSbStatus]    = useState<string | null>(null)
  const [sbSyncing,   setSbSyncing]   = useState(false)
  const [sbLoading,   setSbLoading]   = useState(false)

  useEffect(() => {
    // Carregar APIs do localStorage
    const stored = localStorage.getItem('teacher_apis')
    if (stored) {
      try {
        const parsed: ApiConfig[] = JSON.parse(stored)
        // Garante que todas as APIs padrão existem
        const merged = DEFAULT_APIS.map(def => parsed.find(p => p.id === def.id) || def)
        setApis(merged)
      } catch { setApis(DEFAULT_APIS) }
    } else {
      setApis(DEFAULT_APIS)
    }

    // Carregar modo AUTO
    setAutoMode(localStorage.getItem('teacher_auto_mode') === 'true')

    // Carregar config Supabase
    const sbCfg = localStorage.getItem('teacher_supabase_config')
    if (sbCfg) {
      try {
        const c = JSON.parse(sbCfg)
        setSbUrl(c.url || '')
        setSbAnonKey(c.anonKey || '')
        setSbServiceKey(c.serviceKey || '')
      } catch {}
    }
  }, [])

  function save(newApis: ApiConfig[]) {
    setApis(newApis)
    localStorage.setItem('teacher_apis', JSON.stringify(newApis))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    window.postMessage({ action: 'SYNC_APIS', apis: newApis }, '*')
  }

  function updateApi(id: string, field: keyof ApiConfig, value: unknown) {
    save(apis.map(api => api.id === id ? { ...api, [field]: value } : api))
  }

  function toggleAutoMode() {
    const newVal = !autoMode
    setAutoMode(newVal)
    localStorage.setItem('teacher_auto_mode', String(newVal))
    window.postMessage({ action: 'TOGGLE_AUTO_MODE', autoMode: newVal }, '*')
  }

  function saveSupabaseConfig() {
    const cfg = { url: sbUrl, anonKey: sbAnonKey, serviceKey: sbServiceKey }
    localStorage.setItem('teacher_supabase_config', JSON.stringify(cfg))
    setSbStatus('✅ Configuração salva!')
    setTimeout(() => setSbStatus(null), 3000)
  }

  async function testSupabase() {
    if (!sbUrl || !sbAnonKey) { setSbStatus('⚠️ Preencha a URL e a anon key primeiro.'); return }
    setSbStatus('🔄 Testando conexão...')
    const result = await testSupabaseConnection(sbUrl, sbAnonKey)
    setSbStatus(result.ok ? '✅ Conexão com Supabase bem-sucedida!' : `❌ ${result.error}`)
  }

  async function syncNow() {
    setSbSyncing(true)
    setSbStatus('🔄 Sincronizando para a nuvem...')
    const payload: Record<string, unknown> = {}
    const KEYS = ['teacher_apis', 'teacher_students', 'teacher_lessons', 'teacher_gradebook', 'teacher_repo', 'teacher_auto_mode']
    for (const k of KEYS) {
      const v = localStorage.getItem(k)
      if (v) { try { payload[k] = JSON.parse(v) } catch { payload[k] = v } }
    }
    const res = await syncToSupabase(payload)
    setSbStatus(res.ok ? '✅ Dados sincronizados com Supabase!' : `❌ ${res.error}`)
    setSbSyncing(false)
  }

  async function loadFromCloud() {
    setSbLoading(true)
    setSbStatus('🔄 Restaurando dados da nuvem...')
    const res = await loadFromSupabase()
    if (res.ok) {
      setSbStatus(`✅ ${res.count} itens restaurados. Recarregando...`)
      setTimeout(() => window.location.reload(), 1500)
    } else {
      setSbStatus(`❌ ${res.error}`)
    }
    setSbLoading(false)
  }

  async function testConnection(api: ApiConfig) {
    if (!api.key) { setTestResult(r => ({ ...r, [api.id]: '⚠️ Insira a chave primeiro' })); return }
    setTesting(api.id)
    try {
      let ok = false
      if (api.provider === 'groq') {
        const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${api.key}` } })
        ok = r.ok
      } else if (api.provider === 'gemini') {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${api.key}`)
        ok = r.ok
      } else if (api.provider === 'openai') {
        const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${api.key}` } })
        ok = r.ok
      } else if (api.provider === 'anthropic') {
        const r = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': api.key, 'anthropic-version': '2023-06-01' } })
        ok = r.ok
      } else if (api.provider === 'elevenlabs') {
        const r = await fetch('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': api.key } })
        ok = r.ok
      }
      setTestResult(r => ({ ...r, [api.id]: ok ? '✅ Conexão bem-sucedida!' : '❌ Chave inválida ou sem acesso' }))
    } catch {
      setTestResult(r => ({ ...r, [api.id]: '❌ Erro de rede' }))
    } finally { setTesting(null) }
  }

  const providerIcon: Record<string, string> = {
    manual: 'ti-copy', anthropic: 'ti-brain', openai: 'ti-sparkles',
    gemini: 'ti-stars', groq: 'ti-bolt', deepseek: 'ti-fish',
    zhipu: 'ti-trident', siliconflow: 'ti-cpu', openrouter: 'ti-route',
    elevenlabs: 'ti-microphone-2',
  }

  const providerColor: Record<string, string> = {
    anthropic: '#b58900', openai: '#268bd2', gemini: '#859900', deepseek: '#2aa198',
    groq: '#dc322f', zhipu: '#cb4b16', siliconflow: '#268bd2', openrouter: '#b58900',
    elevenlabs: '#6c71c4', manual: '#586e75',
  }

  const Tabs = [
    { key: 'hierarchy', label: '📊 Hierarquia & Gestão de Tokens', icon: 'ti-chart-donut' },
    { key: 'config',    label: '⚙️ Configurar APIs',              icon: 'ti-settings' },
    { key: 'auto',      label: '🤖 Modo AUTO',                   icon: 'ti-sparkles' },
    { key: 'supabase',  label: '☁️ Cloud Sync',                   icon: 'ti-cloud' },
    { key: 'guide',     label: '📖 Como Obter',                   icon: 'ti-help-circle' },
    { key: 'test',      label: '🔌 Testar Conexão',               icon: 'ti-plug-connected' },
  ] as const

  const activeCount = apis.filter(a => a.active && a.key && a.provider !== 'manual').length

  return (
    <ModuleShell
      title="Gerenciador de APIs"
      subtitle="Configure IAs, Cloud Sync e ative o modo de roteamento inteligente automático."
      maxWidth={880}
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Indicador de APIs ativas */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20, background: activeCount > 0 ? 'rgba(33,150,83,0.12)' : 'rgba(150,33,33,0.1)', border: `1px solid ${activeCount > 0 ? '#2d9d5d' : '#dc322f'}` }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: activeCount > 0 ? '#2d9d5d' : '#dc322f', animation: activeCount > 0 ? 'pulse 2s infinite' : 'none' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: activeCount > 0 ? '#2d9d5d' : '#dc322f' }}>
              {activeCount > 0 ? `${activeCount} API${activeCount > 1 ? 's' : ''} ativa${activeCount > 1 ? 's' : ''}` : 'Nenhuma API ativa'}
            </span>
          </div>

          {/* Botão AUTO */}
          <button
            onClick={toggleAutoMode}
            title={autoMode ? 'Modo AUTO ativo: a IA escolhe a melhor API por tarefa' : 'Clique para ativar o roteamento automático de APIs'}
            style={{
              padding: '8px 18px', borderRadius: 22, border: 'none', cursor: 'pointer',
              background: autoMode ? 'linear-gradient(135deg, #2d9d5d, #1a7a3d)' : '#073642',
              color: '#fff', fontWeight: 700, fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: autoMode ? '0 0 16px rgba(45,157,93,0.4)' : 'none',
              transition: 'all 0.3s',
            }}
          >
            <i className={`ti ${autoMode ? 'ti-brain' : 'ti-brain'}`} style={{ animation: autoMode ? 'pulse 2s infinite' : 'none' }} />
            {autoMode ? '🤖 AUTO ON' : 'AUTO OFF'}
          </button>

          <button onClick={() => save(apis)} style={{ padding: '8px 20px', borderRadius: 10, border: 'none', background: saved ? '#859900' : '#073642', color: '#fdf6e3', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s' }}>
            <i className={`ti ${saved ? 'ti-check' : 'ti-device-floppy'}`} />
            {saved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      }
    >
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #ede8dc', overflowX: 'auto' }}>
        {Tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 16px', borderRadius: '10px 10px 0 0', border: 'none', whiteSpace: 'nowrap',
            background: tab === t.key ? '#fff' : 'transparent',
            color: tab === t.key ? '#073642' : '#93a1a1', fontWeight: tab === t.key ? 700 : 400,
            cursor: 'pointer', fontSize: 13, marginBottom: -2,
            borderBottom: tab === t.key ? '2px solid #b58900' : '2px solid transparent',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── ABA: HIERARQUIA & GESTÃO DE TOKENS ───────────────────────────────── */}
      {tab === 'hierarchy' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Header informativo */}
          <div style={{ background: '#073642', color: '#fdf6e3', padding: 22, borderRadius: 16, border: '1px solid #002b36', boxShadow: '0 4px 16px rgba(0,43,54,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className="ti ti-crown" style={{ fontSize: 24, color: '#b58900' }} />
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, fontFamily: 'Georgia, serif' }}>
                  Administração de Hierarquia & Tokens de IA
                </h2>
              </div>
              <span style={{ background: '#859900', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 12 }}>
                🛡️ Proteção Ativa Contra Estouro de Cota (429)
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#93a1a1', margin: 0, lineHeight: 1.5 }}>
              O sistema gerencia os tokens reservando as <strong>IAs de alta capacidade cognitiva (Tier 1)</strong> exclusivamente para exames e planos pedagógicos complexos, enquanto utiliza as <strong>IAs de latência ultrabaixa (Tier 2)</strong> e a <strong>rede de contingência permanente (Tier 3)</strong> para manter o app veloz e com custo zero.
            </p>
          </div>

          {/* 📊 Painel de Consumo Real de Tokens por Modelo (Com Hover %) */}
          <div style={{ background: '#fff', padding: 22, borderRadius: 16, border: '1px solid #ede8dc', boxShadow: '0 2px 10px rgba(0,43,54,0.04)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#073642', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-activity" style={{ color: '#2d9d5d', fontSize: 20 }} />
              Monitor de Consumo em Tempo Real (Passe o mouse na barra para ver a % exata)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {[
                { provider: 'groq', label: '⚡ Groq Llama-3.3 70B' },
                { provider: 'gemini', label: '✨ Google Gemini 2.0 Flash' },
                { provider: 'zhipu', label: '🚀 Zhipu AI GLM-4-Flash' },
                { provider: 'siliconflow', label: '🔷 SiliconFlow Qwen2.5' },
                { provider: 'openrouter', label: '🌐 OpenRouter (Rota Grátis)' },
                { provider: 'deepseek', label: '🐋 DeepSeek V3 / R1' },
                { provider: 'openai', label: '🟢 OpenAI GPT-4o' },
                { provider: 'anthropic', label: '🟣 Anthropic Claude 3.5' },
              ].map(item => (
                <div key={item.provider} style={{ background: '#fcfbf9', border: '1px solid #ede8dc', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#073642', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{item.label}</span>
                  </div>
                  <TokenProgressBar provider={item.provider} />
                </div>
              ))}
            </div>
          </div>

          {/* Gráfico da Pirâmide de Hierarquia de Capacidade */}
          <div style={{ background: '#fff', padding: 24, borderRadius: 16, border: '1px solid #ede8dc', boxShadow: '0 2px 10px rgba(0,43,54,0.04)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#073642', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-chart-bar" style={{ color: '#b58900' }} /> Pirâmide de Capacidade & Roteamento Inteligente
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* TIER 1 */}
              <div style={{ background: '#fff9e6', border: '2px solid #b58900', borderRadius: 14, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ background: '#b58900', color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 8 }}>
                      TIER 1 — HEAVYWEIGHTS PEDAGÓGICOS
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#073642' }}>Capacidade Cognitiva: 9.8 / 10</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#b58900' }}>4.096 Tokens Reservados / Req</span>
                </div>
                <p style={{ fontSize: 12.5, color: '#586e75', marginBottom: 12 }}>
                  <strong>Provedores:</strong> DeepSeek V3/R1 · Anthropic Claude Opus · OpenAI GPT-4o · SiliconFlow (Qwen2.5-72B).<br />
                  <strong>Destino Pedagógico:</strong> Provas Finais, Matriz TRI, Planos de Aula TKT, Rubricas Cambridge e Análise Dissertativa.
                </p>
                {/* Barra de Progresso Capacidade */}
                <div style={{ width: '100%', height: 8, background: '#eee8d5', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: '98%', height: '100%', background: '#b58900', borderRadius: 4 }} />
                </div>
              </div>

              {/* TIER 2 */}
              <div style={{ background: '#fcf2ee', border: '2px solid #cb4b16', borderRadius: 14, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ background: '#cb4b16', color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 8 }}>
                      TIER 2 — HIGH SPEEDSTERS & EXECUÇÃO
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#073642' }}>Capacidade Cognitiva: 8.8 / 10 (Latência: ~350ms)</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#cb4b16' }}>2.048 Tokens Reservados / Req</span>
                </div>
                <p style={{ fontSize: 12.5, color: '#586e75', marginBottom: 12 }}>
                  <strong>Provedores:</strong> Zhipu AI (GLM-4-Flash - 131k tokens) · Groq (Llama-3.3 70B).<br />
                  <strong>Destino Pedagógico:</strong> Chat Agêntico Rápido (Rafinha), Ações no App, Quick Generate, Mapas Mentais.
                </p>
                <div style={{ width: '100%', height: 8, background: '#eee8d5', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: '88%', height: '100%', background: '#cb4b16', borderRadius: 4 }} />
                </div>
              </div>

              {/* TIER 3 */}
              <div style={{ background: '#f5f9e8', border: '2px solid #859900', borderRadius: 14, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ background: '#859900', color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 8 }}>
                      TIER 3 — PERMANENT SAFETY NET
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#073642' }}>Capacidade Cognitiva: 8.2 / 10 (Tokens Ilimitados)</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#859900' }}>Contingência Permanente</span>
                </div>
                <p style={{ fontSize: 12.5, color: '#586e75', marginBottom: 12 }}>
                  <strong>Provedores:</strong> OpenRouter (Gemma 2 9B Free / Llama 3.1 Free) · Google Gemini 2.0 Flash.<br />
                  <strong>Destino Pedagógico:</strong> Rota de redundância absoluta. Se qualquer API sofrer rate-limit, assume o tráfego sem pausar.
                </p>
                <div style={{ width: '100%', height: 8, background: '#eee8d5', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: '82%', height: '100%', background: '#859900', borderRadius: 4 }} />
                </div>
              </div>
            </div>
          </div>

          {/* Tabela de Alocação por Tipo de Tarefa */}
          <div style={{ background: '#fff', padding: 24, borderRadius: 16, border: '1px solid #ede8dc', boxShadow: '0 2px 10px rgba(0,43,54,0.04)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#073642', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-subtask" style={{ color: '#268bd2' }} /> Matriz Roteamento & Reserva de Tokens
            </h3>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f5f0e8', textAlign: 'left', color: '#586e75', fontWeight: 700 }}>
                  <th style={{ padding: '10px 14px', borderRadius: '8px 0 0 8px' }}>Tipo de Tarefa</th>
                  <th style={{ padding: '10px 14px' }}>IA Primária (Recomendada)</th>
                  <th style={{ padding: '10px 14px' }}>Rota de Fallback</th>
                  <th style={{ padding: '10px 14px', borderRadius: '0 8px 8px 0' }}>Orçamento Max Tokens</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #eee8d5' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: '#073642' }}>📝 Provas & Exames (ELT/ENEM)</td>
                  <td style={{ padding: '12px 14px', color: '#b58900', fontWeight: 600 }}>DeepSeek / SiliconFlow Qwen2.5</td>
                  <td style={{ padding: '12px 14px', color: '#586e75' }}>Claude ➔ Zhipu GLM-4 ➔ OpenRouter</td>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: '#2d9d5d' }}>4.096 tokens</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #eee8d5' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: '#073642' }}>🎓 Plano de Aula & TKT Timed</td>
                  <td style={{ padding: '12px 14px', color: '#b58900', fontWeight: 600 }}>Claude / DeepSeek</td>
                  <td style={{ padding: '12px 14px', color: '#586e75' }}>SiliconFlow ➔ Groq ➔ OpenRouter</td>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: '#2d9d5d' }}>4.096 tokens</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #eee8d5' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: '#073642' }}>💬 Chat Agêntico (Rafinha)</td>
                  <td style={{ padding: '12px 14px', color: '#dc322f', fontWeight: 600 }}>Groq Llama-3.3 70B</td>
                  <td style={{ padding: '12px 14px', color: '#586e75' }}>Zhipu GLM-4 ➔ SiliconFlow ➔ OpenRouter</td>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: '#2d9d5d' }}>2.048 tokens</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #eee8d5' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: '#073642' }}>⚡ Quick Generate & Exercícios</td>
                  <td style={{ padding: '12px 14px', color: '#cb4b16', fontWeight: 600 }}>Zhipu AI GLM-4-Flash</td>
                  <td style={{ padding: '12px 14px', color: '#586e75' }}>Groq ➔ SiliconFlow ➔ OpenRouter</td>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: '#2d9d5d' }}>2.048 tokens</td>
                </tr>
                <tr>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: '#073642' }}>📷 OmniGrader (OCR / Correção)</td>
                  <td style={{ padding: '12px 14px', color: '#268bd2', fontWeight: 600 }}>OpenAI GPT-4o Vision</td>
                  <td style={{ padding: '12px 14px', color: '#586e75' }}>Gemini 2.0 Flash</td>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: '#2d9d5d' }}>2.500 tokens</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── ABA: CONFIGURAÇÃO DAS APIs ──────────────────────────────────────── */}
      {tab === 'config' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {apis.map(api => (
            <ModuleCard key={api.id} padding="0">
              {/* Header do card */}
              <div style={{ padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: api.active && api.key ? `${providerColor[api.provider]}18` : '#f5f0e8',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `2px solid ${api.active && api.key ? providerColor[api.provider] : 'transparent'}`,
                    transition: 'all 0.3s',
                  }}>
                    <i className={`ti ${providerIcon[api.provider]}`} style={{ fontSize: 22, color: api.active && api.key ? providerColor[api.provider] : '#93a1a1', transition: 'all 0.3s' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#073642' }}>{api.name}</div>
                    {api.key && api.provider !== 'manual' && (
                      <div style={{ fontSize: 11, color: '#2aa198', fontWeight: 600, marginTop: 2 }}>🔑 Chave configurada</div>
                    )}
                    {!api.key && api.provider !== 'manual' && (
                      <div style={{ fontSize: 11, color: '#93a1a1', marginTop: 2 }}>Sem chave — configure abaixo</div>
                    )}
                  </div>
                </div>

                {/* Toggle estilo iOS */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: api.active ? '#2d9d5d' : '#93a1a1' }}>
                    {api.active ? 'ON' : 'OFF'}
                  </span>
                  <button
                    onClick={() => updateApi(api.id, 'active', !api.active)}
                    style={{
                      width: 52, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
                      background: api.active ? '#2d9d5d' : '#ccc',
                      position: 'relative', transition: 'background 0.3s', flexShrink: 0,
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: 3, left: api.active ? 27 : 3,
                      width: 22, height: 22, borderRadius: '50%', background: '#fff',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.3s',
                    }} />
                  </button>
                </div>
              </div>

              {/* Formulário de configuração (só quando ativo e não é manual) */}
              {api.provider !== 'manual' && api.active && (
                <div style={{ padding: '0 22px 20px', borderTop: '1px dashed rgba(88,110,117,0.15)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, paddingTop: 16 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#93a1a1', marginBottom: 6 }}>API Key</div>
                      <div style={{ position: 'relative' }}>
                        <input type={showKeys[api.id] ? 'text' : 'password'} value={api.key}
                          onChange={e => updateApi(api.id, 'key', e.target.value)}
                          placeholder="Cole sua chave aqui..."
                          style={{ width: '100%', border: `1.5px solid ${api.key ? '#2aa198' : 'rgba(88,110,117,0.2)'}`, borderRadius: 9, padding: '9px 40px 9px 12px', fontSize: 13.5, background: '#fdf6e3', color: '#073642', outline: 'none', fontFamily: 'monospace', letterSpacing: showKeys[api.id] ? 0 : '2px', boxSizing: 'border-box', transition: 'border-color 0.2s' }} />
                        <button onClick={() => setShowKeys(p => ({ ...p, [api.id]: !p[api.id] }))} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: '#93a1a1' }}>
                          <i className={`ti ${showKeys[api.id] ? 'ti-eye-off' : 'ti-eye'}`} />
                        </button>
                      </div>
                      {api.id === 'groq'       && <a href="https://console.groq.com/keys"          target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 6, fontSize: 11, color: '#2aa198', fontWeight: 600 }}><i className="ti ti-external-link" /> Pegar chave grátis no Groq</a>}
                      {api.id === 'gemini'     && <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 6, fontSize: 11, color: '#2aa198', fontWeight: 600 }}><i className="ti ti-external-link" /> Pegar chave grátis no Google</a>}
                      {api.id === 'claude'     && <a href="https://console.anthropic.com"          target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 6, fontSize: 11, color: '#b58900', fontWeight: 600 }}><i className="ti ti-external-link" /> Anthropic Console</a>}
                      {api.id === 'gpt'        && <a href="https://platform.openai.com/api-keys"   target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 6, fontSize: 11, color: '#268bd2', fontWeight: 600 }}><i className="ti ti-external-link" /> OpenAI Platform</a>}
                      {api.id === 'elevenlabs' && <a href="https://elevenlabs.io"                  target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 6, fontSize: 11, color: '#6c71c4', fontWeight: 600 }}><i className="ti ti-external-link" /> ElevenLabs</a>}
                    </div>
                    <div>
                      {api.provider === 'elevenlabs' ? (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#93a1a1', marginBottom: 6 }}>Voz da Rafinha (Seletor ou Voice ID)</div>
                          <select value={api.voiceId || ''} onChange={e => updateApi(api.id, 'voiceId', e.target.value)}
                            style={{ width: '100%', border: '1px solid rgba(88,110,117,0.2)', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, background: '#fdf6e3', color: '#073642', outline: 'none', marginBottom: 8 }}>
                            <option value="">-- Selecione uma voz ou digite abaixo --</option>
                            <option value="EXAVITQu4vr4xnSDxMaL">Bella — Natural, quente (PT-BR recomendado)</option>
                            <option value="MF3mGyEYCl7XYWbV9V6O">Elli — Expressiva, jovem</option>
                            <option value="AZnzlk1XvdvUeBnXmlld">Domi — Confiante, clara</option>
                            <option value="ErXwobaYiN019PkySvjV">Antoni — Masculina, grave</option>
                            <option value="pNInz6obpgDQGcFmaJgB">Adam — Profissional</option>
                          </select>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#6c71c4', marginBottom: 4 }}>
                            ✨ Ou digite o Voice ID de Yasmin Alves / Voz da Comunidade:
                          </div>
                          <input
                            type="text"
                            value={api.voiceId || ''}
                            onChange={e => updateApi(api.id, 'voiceId', e.target.value.trim())}
                            placeholder="Cole o Voice ID aqui (ex: 21m00Tcm4TlvDq8ikWAM)"
                            style={{ width: '100%', border: '1.5px solid #6c71c4', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, background: '#fdf6e3', color: '#073642', outline: 'none', fontFamily: 'monospace' }}
                          />
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#93a1a1', marginBottom: 6 }}>Modelo Padrão</div>
                          <input value={api.model} onChange={e => updateApi(api.id, 'model', e.target.value)}
                            style={{ width: '100%', border: '1px solid rgba(88,110,117,0.2)', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, background: '#fdf6e3', color: '#073642', outline: 'none', fontFamily: 'monospace' }} />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {/* Barra de Progresso de Tokens */}
              {api.active && api.provider !== 'manual' && (
                <div style={{ padding: '0 22px 18px' }}>
                  <TokenProgressBar provider={api.provider} />
                </div>
              )}

              {api.provider === 'manual' && api.active && (
                <div style={{ fontSize: 13, color: '#586e75', margin: '0 22px 16px', padding: '12px 16px', borderTop: '1px dashed rgba(88,110,117,0.1)', background: '#f5f0e8', borderRadius: 8 }}>
                  Modo sem conexão automática. Gera o <strong>Prompt Estruturado</strong> para copiar e colar no ChatGPT/Claude/Gemini gratuito.
                </div>
              )}
            </ModuleCard>
          ))}
        </div>
      )}

      {/* ─── ABA: MODO AUTO ────────────────────────────────────────────────────── */}
      {tab === 'auto' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Card principal do AUTO */}
          <ModuleCard padding="28px">
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
              <div style={{
                width: 64, height: 64, borderRadius: 18,
                background: autoMode ? 'linear-gradient(135deg, #2d9d5d22, #1a7a3d22)' : '#f5f0e8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `3px solid ${autoMode ? '#2d9d5d' : '#ede8dc'}`,
                transition: 'all 0.4s',
              }}>
                <i className="ti ti-brain" style={{ fontSize: 32, color: autoMode ? '#2d9d5d' : '#93a1a1', transition: 'color 0.4s' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#073642', marginBottom: 4 }}>
                  Roteamento Inteligente de APIs
                </div>
                <div style={{ fontSize: 13, color: '#586e75', lineHeight: 1.5 }}>
                  A Rafinha analisa cada tarefa e escolhe automaticamente qual API oferece o melhor custo-benefício para o trabalho em questão.
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={toggleAutoMode}
                  style={{
                    width: 72, height: 36, borderRadius: 18, border: 'none', cursor: 'pointer',
                    background: autoMode ? 'linear-gradient(135deg, #2d9d5d, #1a7a3d)' : '#e0ddd5',
                    position: 'relative', transition: 'all 0.3s',
                    boxShadow: autoMode ? '0 0 20px rgba(45,157,93,0.4)' : 'none',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 4, left: autoMode ? 38 : 4,
                    width: 28, height: 28, borderRadius: '50%', background: '#fff',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.2)', transition: 'left 0.3s',
                  }} />
                </button>
                <span style={{ fontSize: 12, fontWeight: 800, color: autoMode ? '#2d9d5d' : '#93a1a1' }}>
                  {autoMode ? 'ATIVO' : 'INATIVO'}
                </span>
              </div>
            </div>

            {autoMode && (
              <div style={{ background: 'linear-gradient(135deg, rgba(45,157,93,0.08), rgba(26,122,61,0.04))', border: '1.5px solid rgba(45,157,93,0.2)', borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#2d9d5d', marginBottom: 4 }}>✅ Modo AUTO ativado</div>
                <div style={{ fontSize: 12, color: '#586e75' }}>A Rafinha está roteando cada pedido para a API mais adequada com base no tipo de tarefa.</div>
              </div>
            )}
          </ModuleCard>

          {/* Tabela de prioridade por tarefa */}
          <div style={{ fontSize: 15, fontWeight: 700, color: '#073642', marginBottom: 4, paddingLeft: 4 }}>
            Mapa de Prioridade por Tipo de Tarefa
          </div>
          {(Object.entries(TASK_DESCRIPTIONS) as [TaskType, string][]).map(([task, label]) => {
            const priority = AUTO_PRIORITY[task]
            const available = apis.filter(a => a.active && a.key && a.provider !== 'manual')
            const selected = priority.find(p => available.some(a => a.provider === p)) || null
            return (
              <ModuleCard key={task} padding="16px 20px">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#073642', marginBottom: 4 }}>{label}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {priority.map((p, i) => {
                        const isSelected = p === selected && autoMode
                        const isActive = available.some(a => a.provider === p)
                        return (
                          <span key={p} style={{
                            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                            background: isSelected ? '#2d9d5d' : isActive ? '#eee8d5' : '#f5f0e8',
                            color: isSelected ? '#fff' : isActive ? '#073642' : '#93a1a1',
                            border: `1px solid ${isSelected ? '#2d9d5d' : isActive ? '#ede8dc' : 'transparent'}`,
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                            {i === 0 ? '1º' : i === 1 ? '2º' : i === 2 ? '3º' : '4º'} {p}
                            {isSelected && <i className="ti ti-check" style={{ fontSize: 10 }} />}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <div style={{
                    padding: '6px 14px', borderRadius: 8,
                    background: selected ? 'rgba(45,157,93,0.1)' : 'rgba(150,33,33,0.08)',
                    fontSize: 12, fontWeight: 700,
                    color: selected ? '#2d9d5d' : '#dc322f',
                  }}>
                    {selected ? `→ ${selected}` : 'Sem API'}
                  </div>
                </div>
              </ModuleCard>
            )
          })}
        </div>
      )}

      {/* ─── ABA: SUPABASE CLOUD SYNC ──────────────────────────────────────────── */}
      {tab === 'supabase' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ModuleCard padding="24px">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #3ecf8e22, #2b8a5e22)', border: '2px solid #3ecf8e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ti ti-cloud" style={{ fontSize: 26, color: '#3ecf8e' }} />
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#073642' }}>Supabase Cloud Sync</div>
                <div style={{ fontSize: 13, color: '#586e75' }}>Sincronize todos os dados do app com o banco de dados na nuvem.</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#93a1a1', marginBottom: 6 }}>URL do Projeto Supabase</div>
                <input value={sbUrl} onChange={e => setSbUrl(e.target.value)}
                  placeholder="https://xxxxxxxxxxx.supabase.co"
                  style={{ width: '100%', border: `1.5px solid ${sbUrl ? '#3ecf8e' : 'rgba(88,110,117,0.2)'}`, borderRadius: 9, padding: '10px 14px', fontSize: 13.5, background: '#fdf6e3', color: '#073642', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#93a1a1', marginBottom: 6 }}>Anon Public Key (JWT)</div>
                <input type="password" value={sbAnonKey} onChange={e => setSbAnonKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  style={{ width: '100%', border: `1.5px solid ${sbAnonKey ? '#3ecf8e' : 'rgba(88,110,117,0.2)'}`, borderRadius: 9, padding: '10px 14px', fontSize: 13.5, background: '#fdf6e3', color: '#073642', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#93a1a1', marginBottom: 6 }}>Service Role Key (Secret)</div>
                <input type="password" value={sbServiceKey} onChange={e => setSbServiceKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  style={{ width: '100%', border: `1.5px solid ${sbServiceKey ? '#3ecf8e' : 'rgba(88,110,117,0.2)'}`, borderRadius: 9, padding: '10px 14px', fontSize: 13.5, background: '#fdf6e3', color: '#073642', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }} />
              </div>

              {sbStatus && (
                <div style={{ padding: '10px 16px', borderRadius: 10, background: sbStatus.includes('✅') ? 'rgba(45,157,93,0.1)' : sbStatus.includes('❌') ? 'rgba(220,50,47,0.08)' : 'rgba(88,110,117,0.08)', border: `1px solid ${sbStatus.includes('✅') ? '#2d9d5d' : sbStatus.includes('❌') ? '#dc322f' : '#93a1a1'}`, fontSize: 13, fontWeight: 600, color: '#073642' }}>
                  {sbStatus}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 4 }}>
                <button onClick={saveSupabaseConfig} style={{ flex: 1, padding: '10px 18px', borderRadius: 10, border: 'none', background: '#073642', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                  <i className="ti ti-device-floppy" /> Salvar Config
                </button>
                <button onClick={testSupabase} style={{ flex: 1, padding: '10px 18px', borderRadius: 10, border: '1.5px solid #3ecf8e', background: 'transparent', color: '#2b8a5e', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                  <i className="ti ti-plug-connected" /> Testar Conexão
                </button>
              </div>
            </div>
          </ModuleCard>

          {/* Sync & Load */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <ModuleCard padding="20px">
              <div style={{ fontSize: 14, fontWeight: 700, color: '#073642', marginBottom: 6 }}>☁️ Enviar para a Nuvem</div>
              <div style={{ fontSize: 12, color: '#586e75', marginBottom: 14 }}>Salva todos os dados locais (alunos, aulas, notas, APIs) no Supabase.</div>
              <button onClick={syncNow} disabled={sbSyncing} style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #3ecf8e, #2b8a5e)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {sbSyncing ? <><i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} /> Sincronizando...</> : <><i className="ti ti-cloud-upload" /> Sincronizar Agora</>}
              </button>
            </ModuleCard>
            <ModuleCard padding="20px">
              <div style={{ fontSize: 14, fontWeight: 700, color: '#073642', marginBottom: 6 }}>📥 Restaurar da Nuvem</div>
              <div style={{ fontSize: 12, color: '#586e75', marginBottom: 14 }}>Carrega os dados do Supabase e restaura o aplicativo para o último estado salvo.</div>
              <button onClick={loadFromCloud} disabled={sbLoading} style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1.5px solid #3ecf8e', background: 'transparent', color: '#2b8a5e', fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {sbLoading ? <><i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} /> Carregando...</> : <><i className="ti ti-cloud-download" /> Restaurar</>}
              </button>
            </ModuleCard>
          </div>
        </div>
      )}

      {/* ─── ABA: COMO OBTER ────────────────────────────────────────────────────── */}
      {tab === 'guide' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#eee8d5', borderRadius: 14, padding: '16px 20px', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, color: '#073642', marginBottom: 6 }}>🚀 Por onde começar?</div>
            <p style={{ color: '#586e75', fontSize: 13, margin: 0 }}>
              Recomendamos começar pelo <strong>Groq</strong> (grátis, rápido) para o chat da Rafinha, e pelo <strong>ElevenLabs</strong> para a voz natural. Ambos têm planos gratuitos suficientes para uso diário.
            </p>
          </div>
          {API_GUIDE.map(g => (
            <ModuleCard key={g.id} padding="0">
              <button onClick={() => setOpenGuide(openGuide === g.id ? null : g.id)} style={{ width: '100%', padding: '18px 24px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left' }}>
                <i className={`ti ${g.icon}`} style={{ fontSize: 28, color: g.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#073642', fontSize: 15 }}>{g.label}</div>
                  <div style={{ fontSize: 12, color: '#586e75', marginTop: 2 }}>{g.usage}</div>
                </div>
                <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: g.cost === 'GRÁTIS' ? '#d0f0c0' : g.cost === 'FREEMIUM' ? '#ffe4b5' : '#fde2e2', color: '#333' }}>
                  {g.cost}
                </span>
                <i className={`ti ti-chevron-${openGuide === g.id ? 'up' : 'down'}`} style={{ color: '#93a1a1' }} />
              </button>
              {openGuide === g.id && (
                <div style={{ padding: '0 24px 20px', borderTop: '1px solid #ede8dc' }}>
                  <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#586e75', textTransform: 'uppercase', marginBottom: 10 }}>Passo a Passo</div>
                      {g.steps.map((step, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                          <div style={{ width: 22, height: 22, borderRadius: '50%', background: g.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                          <span style={{ fontSize: 13, color: '#586e75', lineHeight: 1.5 }}>{step}</span>
                        </div>
                      ))}
                      <a href={g.link} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '8px 16px', background: g.color, color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                        <i className="ti ti-external-link" /> {g.linkLabel}
                      </a>
                    </div>
                    <div style={{ background: '#f5f0e8', borderRadius: 12, padding: '14px 16px', maxWidth: 260 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#93a1a1', marginBottom: 6 }}>💡 DICA</div>
                      <p style={{ fontSize: 13, color: '#586e75', margin: 0, lineHeight: 1.5 }}>{g.tip}</p>
                    </div>
                  </div>
                </div>
              )}
            </ModuleCard>
          ))}
        </div>
      )}

      {/* ─── ABA: TESTAR CONEXÃO ──────────────────────────────────────────────── */}
      {tab === 'test' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: '#586e75', fontSize: 13 }}>Verifique se suas chaves estão funcionando antes de usar o app.</p>
          {apis.filter(a => a.provider !== 'manual').map(api => (
            <ModuleCard key={api.id} padding="16px 20px">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <i className={`ti ${providerIcon[api.provider]}`} style={{ fontSize: 22, color: providerColor[api.provider] }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: '#073642' }}>{api.name}</div>
                  <div style={{ fontSize: 12, color: api.key ? '#2aa198' : '#93a1a1' }}>
                    {api.key ? '🔑 Chave configurada' : '⚠️ Sem chave'}
                  </div>
                </div>
                {testResult[api.id] && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: testResult[api.id].includes('✅') ? '#2d7a00' : '#dc322f' }}>
                    {testResult[api.id]}
                  </span>
                )}
                <button onClick={() => testConnection(api)} disabled={!api.key || testing === api.id}
                  style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#073642', color: '#fff', cursor: api.key ? 'pointer' : 'not-allowed', opacity: api.key ? 1 : 0.4, fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {testing === api.id ? <><i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} /> Testando...</> : <><i className="ti ti-plug-connected" /> Testar</>}
                </button>
              </div>
            </ModuleCard>
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } }
      `}</style>
    </ModuleShell>
  )
}
