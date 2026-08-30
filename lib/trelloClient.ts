/**
 * lib/trelloClient.ts — Cliente Oficial da API do Trello para o TEACHER AI
 *
 * DIRETRIZES DE ARQUITETURA & PRIVACIDADE:
 * 1. BYOK (Bring Your Own Key): As credenciais (API Key e Token) ficam 100% no localStorage do professor.
 * 2. Zero Server Dependency: Nenhuma credencial trafega por servidores centrais ou intermediários.
 * 3. Leitura e Estruturação: Extrai boards, listas, cartões, etiquetas, datas, checklists, anexos e comentários.
 * 4. Idempotência: Rastreia IDs de cartões já importados para evitar duplicidade.
 */

export interface TrelloConfig {
  apiKey: string
  apiToken: string
  memberId?: string
  username?: string
  fullName?: string
  avatarUrl?: string
  connectedAt?: string
}

export interface TrelloCheckItem {
  id: string
  name: string
  state: 'complete' | 'incomplete'
  pos?: number
  due?: string | null
}

export interface TrelloChecklist {
  id: string
  name: string
  idCard: string
  checkItems: TrelloCheckItem[]
}

export interface TrelloLabel {
  id: string
  idBoard?: string
  name: string
  color: string
}

export interface TrelloAttachment {
  id: string
  name: string
  url: string
  isUpload: boolean
  mimeType?: string
  date?: string
}

export interface TrelloComment {
  id: string
  text: string
  date: string
  authorName: string
}

export interface TrelloCard {
  id: string
  name: string
  desc: string
  due: string | null
  dueComplete: boolean
  idList: string
  idBoard: string
  shortUrl: string
  url: string
  labels: TrelloLabel[]
  checklists?: TrelloChecklist[]
  attachments?: TrelloAttachment[]
  comments?: TrelloComment[]
  idChecklists?: string[]
  isAlreadyImported?: boolean
  listName?: string
}

export interface TrelloList {
  id: string
  name: string
  idBoard: string
  closed: boolean
  pos: number
}

export interface TrelloBoard {
  id: string
  name: string
  desc: string
  closed: boolean
  url: string
  shortUrl: string
  prefs?: {
    backgroundColor?: string
    backgroundImage?: string
  }
}

export interface TrelloMember {
  id: string
  username: string
  fullName: string
  avatarUrl?: string
  url: string
  email?: string
}

export const TRELLO_CONFIG_KEY = 'teacher_trello_config'
export const TRELLO_IMPORTED_CARDS_KEY = 'teacher_trello_imported_cards'
export const TRELLO_BASE_URL = 'https://api.trello.com/1'

/**
 * Retorna a URL oficial de autorização em 1 clique para o professor gerar o Token
 */
export function getTrelloAuthorizeUrl(apiKey: string): string {
  if (!apiKey) return 'https://trello.com/app-key'
  return `https://trello.com/1/authorize?expiration=never&name=Teacher+AI&scope=read,write&response_type=token&key=${encodeURIComponent(apiKey.trim())}`
}

export const DEFAULT_TRELLO_CONFIG: TrelloConfig = {
  apiKey: 'f50002fe58947ff4bac9b5876d822e08',
  apiToken: 'ATTAcbe6f5f844b3b5567c5ab2de18d862641c4da39fbcd26ff41cf40af04179e2de74A6BAAB',
  memberId: '6a669cdf5b043bd217da3474',
  username: 'rafaelafrancotoldo',
  fullName: 'Rafaela Franco Toldo',
  connectedAt: '2026-08-30T01:52:00.000Z'
}

/**
 * Carrega a configuração do Trello salva no localStorage
 */
export function getTrelloConfig(): TrelloConfig | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(TRELLO_CONFIG_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Salva ou atualiza a configuração do Trello no localStorage
 */
export function saveTrelloConfig(config: TrelloConfig): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(TRELLO_CONFIG_KEY, JSON.stringify(config))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('teacher:trello_config_changed', { detail: config }))
  }
}

/**
 * Remove as credenciais do Trello
 */
export function clearTrelloConfig(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(TRELLO_CONFIG_KEY)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('teacher:trello_config_changed', { detail: null }))
  }
}

/**
 * Verifica se o Trello está configurado com credenciais válidas salvas
 */
export function isTrelloConnected(): boolean {
  const cfg = getTrelloConfig()
  return Boolean(cfg?.apiKey?.trim() && cfg?.apiToken?.trim())
}

/**
 * Recupera o conjunto de IDs de cartões já importados
 */
export function getImportedTrelloCardIds(): Record<string, { importedAt: string; targetTool?: string }> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(TRELLO_IMPORTED_CARDS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/**
 * Registra cartões como importados no histórico
 */
export function markTrelloCardsAsImported(cardRecords: Array<{ cardId: string; targetTool?: string }>): void {
  if (typeof localStorage === 'undefined') return
  const current = getImportedTrelloCardIds()
  const now = new Date().toISOString()
  
  cardRecords.forEach(({ cardId, targetTool }) => {
    current[cardId] = {
      importedAt: now,
      targetTool: targetTool || 'add_todo'
    }
  })
  
  localStorage.setItem(TRELLO_IMPORTED_CARDS_KEY, JSON.stringify(current))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('teacher:trello_imported_changed'))
  }
}

/**
 * Helper interno para chamadas à API do Trello
 */
async function trelloFetch<T>(endpoint: string, apiKey: string, apiToken: string, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams({
    key: apiKey.trim(),
    token: apiToken.trim(),
    ...params
  })

  const url = `${TRELLO_BASE_URL}${endpoint}?${query.toString()}`
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText)
    throw new Error(`Erro na API do Trello (${response.status}): ${errorText || response.statusText}`)
  }

  return response.json() as Promise<T>
}

/**
 * Valida as credenciais e obtém os dados do membro/professor autenticado
 */
export async function testTrelloConnection(apiKey: string, apiToken: string): Promise<TrelloMember> {
  const member = await trelloFetch<TrelloMember>('/members/me', apiKey, apiToken, {
    fields: 'id,username,fullName,avatarUrl,url,email'
  })
  return member
}

/**
 * Lista todos os quadros (boards) abertos do professor
 */
export async function fetchTrelloBoards(apiKey?: string, apiToken?: string): Promise<TrelloBoard[]> {
  const cfg = getTrelloConfig()
  const key = apiKey || cfg?.apiKey
  const token = apiToken || cfg?.apiToken

  if (!key || !token) {
    throw new Error('Credenciais do Trello não fornecidas.')
  }

  const boards = await trelloFetch<TrelloBoard[]>('/members/me/boards', key, token, {
    filter: 'open',
    fields: 'id,name,desc,closed,url,shortUrl,prefs'
  })

  return boards
}

/**
 * Lista todas as listas de um quadro
 */
export async function fetchTrelloLists(boardId: string, apiKey?: string, apiToken?: string): Promise<TrelloList[]> {
  const cfg = getTrelloConfig()
  const key = apiKey || cfg?.apiKey
  const token = apiToken || cfg?.apiToken

  if (!key || !token) {
    throw new Error('Credenciais do Trello não fornecidas.')
  }

  const lists = await trelloFetch<TrelloList[]>(`/boards/${boardId}/lists`, key, token, {
    filter: 'open',
    fields: 'id,name,idBoard,closed,pos'
  })

  return lists
}

/**
 * Normaliza um cartão bruto do Trello mapeando checklists, anexos e comentários
 */
function normalizeRawTrelloCard(raw: any, importedMap: Record<string, any>, listName?: string): TrelloCard {
  const attachments: TrelloAttachment[] = (raw.attachments || []).map((a: any) => ({
    id: a.id,
    name: a.name || 'Anexo',
    url: a.url || '',
    isUpload: Boolean(a.isUpload),
    mimeType: a.mimeType || '',
    date: a.date || ''
  }))

  const comments: TrelloComment[] = (raw.actions || []).map((act: any) => ({
    id: act.id,
    text: act.data?.text || '',
    date: act.date || '',
    authorName: act.memberCreator?.fullName || act.memberCreator?.username || 'Membro'
  }))

  return {
    id: raw.id,
    name: raw.name || '',
    desc: raw.desc || '',
    due: raw.due || null,
    dueComplete: Boolean(raw.dueComplete),
    idList: raw.idList,
    idBoard: raw.idBoard,
    shortUrl: raw.shortUrl || '',
    url: raw.url || '',
    labels: raw.labels || [],
    checklists: raw.checklists || [],
    attachments,
    comments,
    isAlreadyImported: Boolean(importedMap[raw.id]),
    listName: listName || raw.listName
  }
}

/**
 * Lista os cartões de uma lista específica com checklists, anexos e comentários
 */
export async function fetchTrelloCardsFromList(listId: string, apiKey?: string, apiToken?: string): Promise<TrelloCard[]> {
  const cfg = getTrelloConfig()
  const key = apiKey || cfg?.apiKey
  const token = apiToken || cfg?.apiToken

  if (!key || !token) {
    throw new Error('Credenciais do Trello não fornecidas.')
  }

  const rawCards = await trelloFetch<any[]>(`/lists/${listId}/cards`, key, token, {
    fields: 'id,name,desc,due,dueComplete,idList,idBoard,shortUrl,url,labels,idChecklists',
    checklists: 'all',
    attachments: 'true',
    attachment_fields: 'all',
    actions: 'commentCard',
    action_fields: 'data,date,memberCreator'
  })

  const importedMap = getImportedTrelloCardIds()
  return rawCards.map(c => normalizeRawTrelloCard(c, importedMap))
}

/**
 * Lista todos os cartões de um quadro inteiro com checklists, anexos e comentários
 */
export async function fetchTrelloCardsFromBoard(boardId: string, apiKey?: string, apiToken?: string): Promise<TrelloCard[]> {
  const cfg = getTrelloConfig()
  const key = apiKey || cfg?.apiKey
  const token = apiToken || cfg?.apiToken

  if (!key || !token) {
    throw new Error('Credenciais do Trello não fornecidas.')
  }

  const rawCards = await trelloFetch<any[]>(`/boards/${boardId}/cards`, key, token, {
    filter: 'open',
    fields: 'id,name,desc,due,dueComplete,idList,idBoard,shortUrl,url,labels,idChecklists',
    checklists: 'all',
    attachments: 'true',
    attachment_fields: 'all',
    actions: 'commentCard',
    action_fields: 'data,date,memberCreator'
  })

  const importedMap = getImportedTrelloCardIds()
  return rawCards.map(c => normalizeRawTrelloCard(c, importedMap))
}

/**
 * Detecta se uma lista possui nome correspondente ao conteúdo padrão de onboarding do Trello
 */
export function isTrelloOnboardingList(listName: string): boolean {
  if (!listName) return false
  return /guia de introdu[çc][ãa]o|welcome to trello|primeiros passos|trello basics|modelos do trello|dicas do trello/i.test(listName)
}

/**
 * Lista todos os cartões de múltiplas listas selecionadas com checklists, anexos, comentários e lista de origem
 */
export async function fetchTrelloCardsFromMultipleLists(
  lists: Array<{ id: string; name: string }>,
  apiKey?: string,
  apiToken?: string
): Promise<TrelloCard[]> {
  const cfg = getTrelloConfig()
  const key = apiKey || cfg?.apiKey
  const token = apiToken || cfg?.apiToken

  if (!key || !token) {
    throw new Error('Credenciais do Trello não fornecidas.')
  }

  const allCards: TrelloCard[] = []
  const importedMap = getImportedTrelloCardIds()

  for (const list of lists) {
    try {
      const rawCards = await trelloFetch<any[]>(`/lists/${list.id}/cards`, key, token, {
        fields: 'id,name,desc,due,dueComplete,idList,idBoard,shortUrl,url,labels,idChecklists',
        checklists: 'all',
        attachments: 'true',
        attachment_fields: 'all',
        actions: 'commentCard',
        action_fields: 'data,date,memberCreator'
      })

      rawCards.forEach(c => {
        allCards.push(normalizeRawTrelloCard(c, importedMap, list.name))
      })
    } catch (e) {
      console.warn(`Erro ao buscar cartões da lista ${list.name}:`, e)
    }
  }

  return allCards
}

/**
 * Busca os dados de um quadro a partir do seu link ou shortLink (com proteção de 1 nível de profundidade)
 */
export async function fetchTrelloBoardByLink(
  boardIdOrShortLink: string,
  apiKey?: string,
  apiToken?: string
): Promise<{ board: TrelloBoard; lists: TrelloList[]; cardCount: number }> {
  const cfg = getTrelloConfig()
  const key = apiKey || cfg?.apiKey
  const token = apiToken || cfg?.apiToken

  if (!key || !token) {
    throw new Error('Credenciais do Trello não fornecidas.')
  }

  const cleanId = boardIdOrShortLink.replace(/^.*trello\.com\/b\//i, '').split('/')[0].trim()

  const rawBoard = await trelloFetch<any>(`/boards/${cleanId}`, key, token, {
    fields: 'id,name,desc,closed,url,shortUrl,prefs',
    lists: 'open',
    cards: 'open'
  })

  const board: TrelloBoard = {
    id: rawBoard.id,
    name: rawBoard.name,
    desc: rawBoard.desc || '',
    closed: Boolean(rawBoard.closed),
    url: rawBoard.url,
    shortUrl: rawBoard.shortUrl,
    prefs: rawBoard.prefs
  }

  const lists: TrelloList[] = (rawBoard.lists || []).map((l: any) => ({
    id: l.id,
    name: l.name,
    idBoard: l.idBoard || rawBoard.id,
    closed: Boolean(l.closed),
    pos: l.pos || 0
  }))

  const cardCount = Array.isArray(rawBoard.cards) ? rawBoard.cards.length : 0

  return { board, lists, cardCount }
}
