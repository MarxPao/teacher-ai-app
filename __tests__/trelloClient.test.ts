import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  saveTrelloConfig,
  getTrelloConfig,
  clearTrelloConfig,
  isTrelloConnected,
  getTrelloAuthorizeUrl,
  getImportedTrelloCardIds,
  markTrelloCardsAsImported,
  testTrelloConnection,
  fetchTrelloBoards,
  fetchTrelloLists,
  fetchTrelloCardsFromList,
  fetchTrelloCardsFromBoard,
  TrelloConfig,
  TRELLO_CONFIG_KEY,
  TRELLO_IMPORTED_CARDS_KEY
} from '../lib/trelloClient'

describe('Trello Client & BYOK Storage', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} },
    })
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('salva e recupera a configuração BYOK do Trello localmente', () => {
    const config: TrelloConfig = {
      apiKey: 'test_key_123',
      apiToken: 'test_token_456',
      memberId: 'mem_999',
      username: 'teacher_lucas',
      fullName: 'Professor Lucas'
    }

    expect(isTrelloConnected()).toBe(false)
    saveTrelloConfig(config)
    expect(isTrelloConnected()).toBe(true)

    const loaded = getTrelloConfig()
    expect(loaded).toEqual(config)

    clearTrelloConfig()
    expect(isTrelloConnected()).toBe(false)
    expect(getTrelloConfig()).toBeNull()
  })

  it('gera a URL de autorização correta em 1-clique com escopo read,write', () => {
    const url = getTrelloAuthorizeUrl('my_test_api_key')
    expect(url).toContain('https://trello.com/1/authorize')
    expect(url).toContain('expiration=never')
    expect(url).toContain('scope=read,write')
    expect(url).toContain('key=my_test_api_key')
  })

  it('rastreia e memoriza IDs de cartões já importados para idempotência', () => {
    expect(getImportedTrelloCardIds()).toEqual({})

    markTrelloCardsAsImported([
      { cardId: 'card_1', targetTool: 'add_todo' },
      { cardId: 'card_2', targetTool: 'record_student_observation' }
    ])

    const imported = getImportedTrelloCardIds()
    expect(imported['card_1']).toBeDefined()
    expect(imported['card_1'].targetTool).toBe('add_todo')
    expect(imported['card_2'].targetTool).toBe('record_student_observation')
  })

  it('testa conexão com API do Trello e obtém perfil do membro', async () => {
    const mockMember = {
      id: 'mem_1',
      username: 'proflucas',
      fullName: 'Lucas Silva',
      avatarUrl: 'https://avatar.url',
      url: 'https://trello.com/proflucas'
    }

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockMember
    }))

    const result = await testTrelloConnection('valid_key', 'valid_token')
    expect(result.username).toBe('proflucas')
    expect(result.fullName).toBe('Lucas Silva')
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/members/me?key=valid_key&token=valid_token'),
      expect.anything()
    )
  })

  it('busca quadros e listas do Trello com filtros abertos', async () => {
    saveTrelloConfig({ apiKey: 'k1', apiToken: 't1' })

    const mockBoards = [
      { id: 'b1', name: 'Planejamento 2026', desc: 'Quadro de aulas', closed: false, url: '', shortUrl: '' },
      { id: 'b2', name: 'Alunos & Acompanhamento', desc: '', closed: false, url: '', shortUrl: '' }
    ]

    const mockLists = [
      { id: 'l1', name: 'A Fazer / Pendências', idBoard: 'b1', closed: false, pos: 1 },
      { id: 'l2', name: 'Em Andamento', idBoard: 'b1', closed: false, pos: 2 }
    ]

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockBoards })
      .mockResolvedValueOnce({ ok: true, json: async () => mockLists })
    )

    const boards = await fetchTrelloBoards()
    expect(boards.length).toBe(2)
    expect(boards[0].name).toBe('Planejamento 2026')

    const lists = await fetchTrelloLists('b1')
    expect(lists.length).toBe(2)
    expect(lists[0].name).toBe('A Fazer / Pendências')
  })

  it('busca cartões com checklists e sinaliza cartões já importados', async () => {
    saveTrelloConfig({ apiKey: 'k1', apiToken: 't1' })
    markTrelloCardsAsImported([{ cardId: 'card_already_in' }])

    const mockCards = [
      {
        id: 'card_already_in',
        name: 'Elaborar Prova 9º Ano',
        desc: 'Unidades 3 e 4',
        due: '2026-09-01T12:00:00.000Z',
        dueComplete: false,
        idList: 'l1',
        idBoard: 'b1',
        shortUrl: 'https://trello.com/c/1',
        url: 'https://trello.com/c/1',
        labels: [{ id: 'lbl1', name: 'Urgente', color: 'red' }],
        checklists: [
          {
            id: 'chk1',
            name: 'Etapas',
            idCard: 'card_already_in',
            checkItems: [
              { id: 'ci1', name: 'Grammar section', state: 'complete' },
              { id: 'ci2', name: 'Reading passage', state: 'incomplete' }
            ]
          }
        ]
      },
      {
        id: 'card_new',
        name: 'Conversar com mãe do Pedro',
        desc: 'Comportamento na aula de listening',
        due: null,
        dueComplete: false,
        idList: 'l1',
        idBoard: 'b1',
        shortUrl: 'https://trello.com/c/2',
        url: 'https://trello.com/c/2',
        labels: [],
        checklists: []
      }
    ]

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockCards
    }))

    const cards = await fetchTrelloCardsFromList('l1')
    expect(cards.length).toBe(2)

    // O primeiro cartão deve estar marcado como isAlreadyImported: true
    expect(cards[0].isAlreadyImported).toBe(true)
    expect(cards[0].checklists?.[0].checkItems.length).toBe(2)
    expect(cards[0].checklists?.[0].checkItems[0].state).toBe('complete')

    // O segundo cartão não foi importado ainda
    expect(cards[1].isAlreadyImported).toBe(false)
  })
})
