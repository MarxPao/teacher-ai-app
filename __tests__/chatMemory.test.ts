import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  getActiveSession,
  getChatHistory,
  saveChatMessage,
  createNewChatSession,
  clearCurrentSession,
  buildEpisodicMemorySnippet,
  compactSessionProgressively,
  DEFAULT_WELCOME_MESSAGE,
  ChatSession
} from '../lib/chatMemory'

describe('chatMemory — Sistema de Memória Episódica da Rafinha', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    vi.clearAllMocks()
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} }
    })
    vi.stubGlobal('window', {
      dispatchEvent: () => true
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('deve retornar a mensagem padrão de boas-vindas na primeira inicialização', () => {
    const history = getChatHistory()
    expect(history.length).toBe(1)
    expect(history[0].role).toBe('assistant')
    expect(history[0].content).toContain('Oi! Sou a Rafinha')
  })

  it('deve persistir mensagens de usuário e assistente na sessão ativa', () => {
    saveChatMessage({ role: 'user', content: 'Lançar nota 9 para o Pedro' })
    saveChatMessage({ role: 'assistant', content: 'Nota 9 do Pedro lançada com sucesso!' })

    const history = getChatHistory()
    expect(history.length).toBe(3) // 1 welcome + 2 novas
    expect(history[1].role).toBe('user')
    expect(history[1].content).toBe('Lançar nota 9 para o Pedro')
    expect(history[2].role).toBe('assistant')
    expect(history[2].content).toBe('Nota 9 do Pedro lançada com sucesso!')
  })

  it('deve aplicar sliding window de 20 turnos e gerar sumarização progressiva', () => {
    const session = getActiveSession()

    // Insere 25 mensagens
    for (let i = 1; i <= 25; i++) {
      saveChatMessage({
        role: i % 2 === 1 ? 'user' : 'assistant',
        content: `Interação ${i}: ${i % 2 === 1 ? 'Planejar aula de Present Perfect e prova' : 'Ok, plano criado'}`
      })
    }

    const history = getChatHistory()
    expect(history.length).toBeLessThanOrEqual(20)

    const updatedSession = getActiveSession()
    expect(updatedSession.summary).toBeDefined()
    expect(updatedSession.summary).toContain('interações consolidadas')
    expect(updatedSession.archivedMessages?.length).toBeGreaterThan(0)
  })

  it('deve criar uma nova sessão limpa preservando sessões anteriores', () => {
    saveChatMessage({ role: 'user', content: 'Primeira conversa' })
    const prevSession = getActiveSession()

    const newSession = createNewChatSession('Conversa sobre Avaliações')
    expect(newSession.id).not.toBe(prevSession.id)
    expect(newSession.title).toBe('Conversa sobre Avaliações')

    const newHistory = getChatHistory()
    expect(newHistory.length).toBe(1)
    expect(newHistory[0].content).toContain('Oi! Sou a Rafinha')
  })

  it('deve gerar snippet de memória episódica das sessões recentes', () => {
    const session = getActiveSession()
    session.summary = '[22/09/2026]: 5 interações consolidadas. Temas: Planejamento de Aulas.'
    localStorage.setItem('teacher_chat_sessions_v1', JSON.stringify({
      activeSessionId: session.id,
      sessions: { [session.id]: session }
    }))

    const snippet = buildEpisodicMemorySnippet()
    expect(snippet).toContain('MEMÓRIA EPISÓDICA DE CONVERSAS ANTERIORES')
    expect(snippet).toContain('Planejamento de Aulas')
  })

  it('deve limpar sessão atual ao chamar clearCurrentSession', () => {
    saveChatMessage({ role: 'user', content: 'Mensagem temporária' })
    expect(getChatHistory().length).toBe(2)

    clearCurrentSession()
    expect(getChatHistory().length).toBe(1)
    expect(getChatHistory()[0].content).toBe(DEFAULT_WELCOME_MESSAGE.content)
  })
})
