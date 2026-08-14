'use client'

export interface ApiConfig {
  id: string
  name: string
  provider: 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'groq' | 'zhipu' | 'siliconflow' | 'openrouter' | 'manual' | 'elevenlabs'
  key: string
  model: string
  active: boolean
  voiceId?: string // ElevenLabs
}

export const DEFAULT_APIS: ApiConfig[] = [
  { id: 'manual', name: 'Manual Copy (Free Mode)', provider: 'manual', key: '', model: '', active: true },
  { id: 'zhipu', name: 'Zhipu AI (GLM-4-Flash - Grátis)', provider: 'zhipu', key: '', model: 'glm-4-flash', active: false },
  { id: 'siliconflow', name: 'SiliconFlow (Qwen2.5 / DeepSeek - Grátis)', provider: 'siliconflow', key: '', model: 'Qwen/Qwen2.5-72B-Instruct', active: false },
  { id: 'openrouter', name: 'OpenRouter (Rota Gratuita Permanente)', provider: 'openrouter', key: '', model: 'google/gemma-2-9b-it:free', active: false },
  { id: 'groq', name: 'Groq Llama-3 (Rápido)', provider: 'groq', key: '', model: 'llama-3.3-70b-versatile', active: false },
  { id: 'gemini', name: 'Google Gemini Flash', provider: 'gemini', key: '', model: 'gemini-2.0-flash', active: false },
  { id: 'gpt', name: 'OpenAI GPT-4o', provider: 'openai', key: '', model: 'gpt-4o-mini', active: false },
  { id: 'claude', name: 'Anthropic Claude', provider: 'anthropic', key: '', model: 'claude-opus-4-5', active: false },
  { id: 'elevenlabs', name: 'ElevenLabs (Voz Ultra-Natural)', provider: 'elevenlabs', key: '', model: 'eleven_multilingual_v2', active: false, voiceId: 'MF3mGyEYCl7XYWbV9V6O' },
]

export interface ApiGuideItem {
  id: string
  icon: string
  color: string
  label: string
  cost: string
  usage: string
  steps: string[]
  link: string
  linkLabel: string
  tip: string
}

export const API_GUIDE: ApiGuideItem[] = [
  {
    id: 'zhipu', icon: 'ti-trident', color: '#cb4b16', label: 'Zhipu AI (GLM-4-Flash)', cost: 'GRÁTIS (100%)',
    usage: 'Trator da operação: latência ultrabaixa, 131k de contexto e alto throughput sem engasgos.',
    steps: ['Acesse open.bigmodel.cn/usercenter/apikeys','Crie conta gratuita com e-mail','Clique em "API Keys" no User Center','Clique em "Create API Key"','Copie a chave e cole no campo'],
    link: 'https://open.bigmodel.cn/usercenter/apikeys', linkLabel: 'Acessar Zhipu BigModel Console',
    tip: 'Modelo recomendado: glm-4-flash. Totalmente gratuito no tier de dev.',
  },
  {
    id: 'siliconflow', icon: 'ti-cpu', color: '#268bd2', label: 'SiliconFlow (Hub Qwen)', cost: 'GRÁTIS ILIMITADO',
    usage: 'Motor hiperotimizado para inferência de modelos open-source (Qwen2.5, DeepSeek V3/R1).',
    steps: ['Acesse cloud.siliconflow.cn/account/ak','Faça login/cadastro gratuito','Clique em "API Keys" no menu lateral','Clique em "Create New API Key"','Copie a chave e cole no campo'],
    link: 'https://cloud.siliconflow.cn/account/ak', linkLabel: 'Acessar SiliconFlow Cloud',
    tip: 'Modelo recomendado: Qwen/Qwen2.5-72B-Instruct. Redução de 32% na latência.',
  },
  {
    id: 'openrouter', icon: 'ti-route', color: '#b58900', label: 'OpenRouter (Failover)', cost: 'GRÁTIS PERMANENTE',
    usage: 'Rota de contingência e redundância ilimitada para dezenas de modelos gratuitos.',
    steps: ['Acesse openrouter.ai/keys','Crie conta com Google ou GitHub sem cartão','Clique em "Create Key"','Copie a chave e cole no campo'],
    link: 'https://openrouter.ai/keys', linkLabel: 'Acessar OpenRouter Keys',
    tip: 'Modelos recomendados: google/gemma-2-9b-it:free ou meta-llama/llama-3.1-8b-instruct:free.',
  },
  {
    id: 'groq', icon: 'ti-bolt', color: '#dc322f', label: 'Groq Llama-3', cost: 'GRÁTIS',
    usage: 'Chat agêntico rápido (Rafinha) + Transcrição de voz (Whisper)',
    steps: ['Acesse console.groq.com','Crie conta gratuita com e-mail ou Google','Clique em "API Keys" no menu lateral','Clique em "Create API Key"','Copie a chave e cole no campo'],
    link: 'https://console.groq.com/keys', linkLabel: 'Acessar Groq Console',
    tip: 'Modelo recomendado: llama-3.3-70b-versatile. Limite generoso no plano gratuito.',
  },
  {
    id: 'gemini', icon: 'ti-stars', color: '#859900', label: 'Google Gemini', cost: 'GRÁTIS',
    usage: 'Geração de questões ELT, planos de aula, análise de áudio/imagem',
    steps: ['Acesse aistudio.google.com','Faça login com sua conta Google','Clique em "Get API key" no painel','Clique em "Create API key in new project"','Copie e cole no campo'],
    link: 'https://aistudio.google.com/app/apikey', linkLabel: 'Acessar Google AI Studio',
    tip: 'Modelo recomendado: gemini-2.0-flash. 15 req/min gratuito.',
  },
  {
    id: 'gpt', icon: 'ti-sparkles', color: '#268bd2', label: 'OpenAI GPT-4o', cost: 'PAGO',
    usage: 'Raciocínio pedagógico complexo + TTS (voz HD para a Rafinha)',
    steps: ['Acesse platform.openai.com','Crie conta e adicione créditos ($5 mínimo)','Clique em "API keys" -> "Create new secret key"','Copie e cole'],
    link: 'https://platform.openai.com/api-keys', linkLabel: 'Acessar OpenAI Platform',
    tip: 'Se ativar OpenAI, a Rafinha usará a voz TTS HD automatically.',
  },
  {
    id: 'claude', icon: 'ti-brain', color: '#b58900', label: 'Anthropic Claude', cost: 'PAGO',
    usage: 'Planejamento pedagógico avançado e análises longas e detalhadas',
    steps: ['Acesse console.anthropic.com','Crie conta e adicione método de pagamento','Vá em "API Keys" -> "Create Key"','Defina limite de gasto mensal (recomendado: $10)','Copie a chave'],
    link: 'https://console.anthropic.com', linkLabel: 'Acessar Anthropic Console',
    tip: 'Modelo recomendado: claude-opus-4-5. Mais inteligente para raciocínio pedagógico.',
  },
  {
    id: 'elevenlabs', icon: 'ti-microphone-2', color: '#6c71c4', label: 'ElevenLabs', cost: 'FREEMIUM',
    usage: 'Voz ultra-natural para a Rafinha em Português Brasileiro',
    steps: ['Acesse elevenlabs.io','Crie conta gratuita (10.000 caracteres/mês)','Clique no ícone do usuário -> "Profile + API key"','Copie a API key e cole','Escolha uma voz no seletor'],
    link: 'https://elevenlabs.io', linkLabel: 'Acessar ElevenLabs',
    tip: 'Prioridade: ElevenLabs > OpenAI TTS > Web Speech. Voz Bella é ótima em PT-BR.',
  },
]

export const ELEVEN_VOICES = [
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli Expressiva, jovem' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi Confiante, clara' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella Natural, quente' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni Masculina, grave' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold Energética' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam Profissional' },
]
