/**
 * lib/chatMemory.ts — Sistema de Memória Episódica e Gerenciador de Sessões de Chat da Rafinha
 *
 * Responsável por:
 * 1. Persistência de sessões de chat no localStorage sem perda no reload (F5).
 * 2. Sliding window (janela deslizante de 20 turnos) para controle de contexto de tokens.
 * 3. Sumarização progressiva automática de conversas antigas (Hot vs Cold memory).
 * 4. Injeção de memórias episódicas recentes nas instruções da assistente.
 */

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  toolCalls?: Array<{
    name: string
    result?: string
  }>
}

export interface ChatSession {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
  summary?: string
  archivedMessages?: ChatMessage[]
}

export interface ChatMemoryStore {
  activeSessionId: string
  sessions: Record<string, ChatSession>
}

const CHAT_STORAGE_KEY = 'teacher_chat_sessions_v1'
const MAX_ACTIVE_MESSAGES = 20
const MAX_ARCHIVED_MESSAGES = 60
const MAX_STORED_SESSIONS = 10

export const DEFAULT_WELCOME_MESSAGE: ChatMessage = {
  id: 'init_welcome_msg',
  role: 'assistant',
  content: 'Oi! Sou a Rafinha Pode falar: "vá para alunos", "crie uma prova de Present Perfect", "lance nota 9 para o Pedro" eu executo na hora!',
  timestamp: '2026-09-01T00:00:00.000Z'
}

function generateId(prefix = 'msg'): string {
  const ts = Date.now().toString(36)
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 6)
    : Math.random().toString(36).slice(2, 8)
  return `${prefix}_${ts}_${rand}`
}

function loadStore(): ChatMemoryStore {
  if (typeof localStorage === 'undefined') {
    const defaultId = generateId('session')
    return {
      activeSessionId: defaultId,
      sessions: {
        [defaultId]: {
          id: defaultId,
          title: 'Conversa Atual',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [{ ...DEFAULT_WELCOME_MESSAGE, timestamp: new Date().toISOString() }],
          archivedMessages: []
        }
      }
    }
  }

  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY)
    if (!raw) {
      const defaultId = generateId('session')
      const initialStore: ChatMemoryStore = {
        activeSessionId: defaultId,
        sessions: {
          [defaultId]: {
            id: defaultId,
            title: 'Conversa Atual',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [{ ...DEFAULT_WELCOME_MESSAGE, timestamp: new Date().toISOString() }],
            archivedMessages: []
          }
        }
      }
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(initialStore))
      return initialStore
    }

    const parsed: ChatMemoryStore = JSON.parse(raw)
    if (!parsed.sessions || typeof parsed.sessions !== 'object') {
      throw new Error('Formato inválido de sessões')
    }
    return parsed
  } catch {
    const defaultId = generateId('session')
    return {
      activeSessionId: defaultId,
      sessions: {
        [defaultId]: {
          id: defaultId,
          title: 'Conversa Atual',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [{ ...DEFAULT_WELCOME_MESSAGE, timestamp: new Date().toISOString() }],
          archivedMessages: []
        }
      }
    }
  }
}

function saveStore(store: ChatMemoryStore): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(store))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('teacher:chat_updated', { detail: { activeSessionId: store.activeSessionId } }))
    }
  } catch {}
}

/**
 * Obtém ou inicializa a sessão de chat ativa
 */
export function getActiveSession(): ChatSession {
  const store = loadStore()
  let session = store.sessions[store.activeSessionId]

  if (!session) {
    const newId = generateId('session')
    session = {
      id: newId,
      title: 'Conversa Atual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [{ ...DEFAULT_WELCOME_MESSAGE, timestamp: new Date().toISOString() }],
      archivedMessages: []
    }
    store.activeSessionId = newId
    store.sessions[newId] = session
    saveStore(store)
  }

  return session
}

/**
 * Retorna as mensagens ativas da sessão informada (ou ativa)
 */
export function getChatHistory(sessionId?: string): ChatMessage[] {
  const store = loadStore()
  const targetId = sessionId || store.activeSessionId
  const session = store.sessions[targetId]
  if (!session || !session.messages || session.messages.length === 0) {
    return [{ ...DEFAULT_WELCOME_MESSAGE, timestamp: new Date().toISOString() }]
  }
  return session.messages
}

/**
 * Salva uma nova mensagem no histórico episódico ativo
 */
export function saveChatMessage(
  message: { role: 'user' | 'assistant' | 'system'; content: string; toolCalls?: Array<{ name: string; result?: string }> },
  sessionId?: string
): ChatMessage {
  const store = loadStore()
  const targetId = sessionId || store.activeSessionId
  let session = store.sessions[targetId]

  if (!session) {
    session = {
      id: targetId,
      title: 'Conversa Atual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      archivedMessages: []
    }
    store.sessions[targetId] = session
  }

  const newMsg: ChatMessage = {
    id: generateId('msg'),
    role: message.role,
    content: message.content,
    timestamp: new Date().toISOString(),
    toolCalls: message.toolCalls
  }

  session.messages.push(newMsg)
  session.updatedAt = new Date().toISOString()

  // Atualiza título da sessão automaticamente com base na primeira mensagem do usuário
  if (session.title === 'Conversa Atual' && message.role === 'user') {
    const cleanTitle = message.content.slice(0, 32).trim()
    if (cleanTitle) session.title = cleanTitle
  }

  // Compactação progressiva (Sliding Window de 20 turnos)
  compactSessionProgressively(session)

  saveStore(store)
  return newMsg
}

/**
 * Realiza a compactação progressiva quando as mensagens ativas ultrapassam MAX_ACTIVE_MESSAGES (20)
 */
export function compactSessionProgressively(session: ChatSession): void {
  if (session.messages.length <= MAX_ACTIVE_MESSAGES) return

  const cutoff = session.messages.length - MAX_ACTIVE_MESSAGES
  const oldChunk = session.messages.slice(0, cutoff)
  const remaining = session.messages.slice(cutoff)

  // Extração rápida de temas tratados no bloco antigo
  const topics: string[] = []
  const userActions = oldChunk.filter(m => m.role === 'user').map(m => m.content.toLowerCase())

  if (userActions.some(t => t.includes('prova') || t.includes('exame') || t.includes('questão'))) {
    topics.push('Criação/Avaliação de Provas')
  }
  if (userActions.some(t => t.includes('nota') || t.includes('caderneta') || t.includes('lançar'))) {
    topics.push('Lançamento de Notas/Faltas')
  }
  if (userActions.some(t => t.includes('plano') || t.includes('aula') || t.includes('planejamento'))) {
    topics.push('Planejamento de Aulas')
  }
  if (userActions.some(t => t.includes('recado') || t.includes('mensagem') || t.includes('comunicado'))) {
    topics.push('Comunicação/Recados')
  }

  const topicSummary = topics.length > 0 ? topics.join(', ') : 'Operações gerais no app'
  const dateFormatted = new Date().toLocaleDateString('pt-BR')
  const newChunkSummary = `[${dateFormatted}]: ${oldChunk.length} interações consolidadas. Temas: ${topicSummary}.`

  session.summary = session.summary ? `${session.summary}\n${newChunkSummary}` : newChunkSummary
  session.archivedMessages = [...(session.archivedMessages || []), ...oldChunk].slice(-MAX_ARCHIVED_MESSAGES)
  session.messages = remaining
}

/**
 * Cria uma nova sessão limpa de conversa, preservando o histórico da anterior
 */
export function createNewChatSession(title = 'Nova Conversa'): ChatSession {
  const store = loadStore()
  const newId = generateId('session')

  const newSession: ChatSession = {
    id: newId,
    title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [{ ...DEFAULT_WELCOME_MESSAGE, timestamp: new Date().toISOString() }],
    archivedMessages: []
  }

  store.activeSessionId = newId
  store.sessions[newId] = newSession

  // Limita quantidade máxima de sessões salvas para não inflar localStorage
  const sessionEntries = Object.entries(store.sessions)
  if (sessionEntries.length > MAX_STORED_SESSIONS) {
    const sorted = sessionEntries.sort((a, b) => new Date(a[1].updatedAt).getTime() - new Date(b[1].updatedAt).getTime())
    const toRemove = sorted.slice(0, sessionEntries.length - MAX_STORED_SESSIONS)
    toRemove.forEach(([id]) => {
      if (id !== newId) delete store.sessions[id]
    })
  }

  saveStore(store)
  return newSession
}

/**
 * Limpa as mensagens da sessão atual voltando para a saudação inicial
 */
export function clearCurrentSession(): void {
  const store = loadStore()
  const session = store.sessions[store.activeSessionId]
  if (session) {
    session.messages = [{ ...DEFAULT_WELCOME_MESSAGE, timestamp: new Date().toISOString() }]
    session.summary = undefined
    session.archivedMessages = []
    session.updatedAt = new Date().toISOString()
    saveStore(store)
  }
}

/**
 * Constrói snippet de memória episódica recente para ser injetado no prompt da Rafinha
 */
export function buildEpisodicMemorySnippet(): string {
  const store = loadStore()
  const summaries: string[] = []

  // Coleta sumários das 3 sessões mais recentes
  const recentSessions = Object.values(store.sessions)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 3)

  recentSessions.forEach(s => {
    if (s.summary) {
      summaries.push(`- Sessão "${s.title}":\n  ${s.summary.replace(/\n/g, '\n  ')}`)
    }
  })

  if (!summaries.length) return ''

  return `
=== MEMÓRIA EPISÓDICA DE CONVERSAS ANTERIORES ===
A professora já interagiu com você recentemente sobre os seguintes tópicos:
${summaries.join('\n')}
(Use estas informações para manter a continuidade natural do atendimento se a professora retomar tópicos anteriores.)
`
}
