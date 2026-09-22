/**
 * lib/connectors/apiConnector.ts — Adaptador do Tier "api" (FASE 2)
 *
 * PROPÓSITO:
 * Traduz invokeCapability de qualquer capability do tier "api" para as
 * funções do cliente correspondente (trelloClient.ts hoje, outros futuramente).
 *
 * PRINCÍPIOS DESTA FASE:
 * 1. ZERO reescrita de lógica de cliente. fetchTrelloBoards, fetchTrelloCardsFromBoard,
 *    fetchTrelloLists etc. vivem onde sempre viveram (trelloClient.ts). Este arquivo só
 *    mapeia entrada/saída para o contrato genérico do engine.
 * 2. BYOK respeito: credenciais (apiKey/apiToken) nunca são armazenadas no engine — vêm
 *    de api_config.credentials do Connector ou do getTrelloConfig() do localStorage.
 * 3. requires_review: false para todos os reads de API bem-sucedidos — dados de API são
 *    determinísticos e não passam por pipeline de visão; não exigem homologação humana.
 * 4. O adaptador não toma decisões sobre o conteúdo dos cartões (routeTrelloCard,
 *    executeTrelloDecisions). Isso é responsabilidade de quem consome o CapabilityResult.
 *
 * Capabilities registradas nesta fase:
 *   api:read_board   → fetchTrelloBoards (lista de quadros do professor)
 *   api:read_roster  → fetchTrelloCardsFromBoard (cartões como proxy de turma)
 *
 * Capabilities futuras: post_grade, read_assignments, read_calendar
 */

import {
  registerCapabilityHandler,
  type Connector,
  type CapabilityResult,
} from '@/lib/connectorEngine'

import {
  getTrelloConfig,
  fetchTrelloBoards,
  fetchTrelloCardsFromBoard,
  fetchTrelloLists,
  type TrelloConfig,
  type TrelloBoard,
  type TrelloCard,
  type TrelloList,
} from '@/lib/trelloClient'

import {
  validateTeamsCredentials,
  listJoinedTeams,
  listChannels,
  postChannelMessage,
  postChatMessage,
  type TeamsOAuthConfig,
} from '@/lib/teamsClient'

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Resolve as credenciais Trello com prioridade:
 * 1. Credentials embutidas no api_config do Connector (passadas no momento do registro)
 * 2. getTrelloConfig() do localStorage (BYOK padrão)
 */
function resolveCredentials(
  connector: Connector
): { apiKey: string; apiToken: string } | null {
  const embedded = connector.api_config?.credentials as TrelloConfig | undefined
  if (embedded?.apiKey?.trim() && embedded?.apiToken?.trim()) {
    return { apiKey: embedded.apiKey.trim(), apiToken: embedded.apiToken.trim() }
  }
  const stored = getTrelloConfig()
  if (stored?.apiKey?.trim() && stored?.apiToken?.trim()) {
    return { apiKey: stored.apiKey.trim(), apiToken: stored.apiToken.trim() }
  }
  return null
}

// ─── HANDLER: read_board ─────────────────────────────────────────────────────

/**
 * Lista os quadros abertos do professor no Trello.
 *
 * Params esperados:
 *   boardId?: string  — se fornecido, traz listas e cartões desse board específico
 *                       se omitido, retorna a lista de todos os boards abertos
 */
async function readBoardHandler(
  connector: Connector,
  params: Record<string, unknown>
): Promise<CapabilityResult> {
  const creds = resolveCredentials(connector)
  if (!creds) {
    return {
      success: false,
      requires_review: false,
      error: '[ApiConnector:read_board] Credenciais do Trello não encontradas. Configure sua chave API e Token nas Extensões.',
    }
  }

  try {
    if (params.boardId && typeof params.boardId === 'string') {
      // Leitura de board específico: listas + cartões
      const [lists, cards] = await Promise.all([
        fetchTrelloLists(params.boardId, creds.apiKey, creds.apiToken) as Promise<TrelloList[]>,
        fetchTrelloCardsFromBoard(params.boardId, creds.apiKey, creds.apiToken) as Promise<TrelloCard[]>,
      ])
      return {
        success: true,
        requires_review: false,
        layer_used: 'api',
        data: {
          board_id: params.boardId,
          lists,
          cards,
          total_lists: lists.length,
          total_cards: cards.length,
        },
      }
    } else {
      // Listagem de todos os boards abertos
      const boards = await fetchTrelloBoards(creds.apiKey, creds.apiToken) as TrelloBoard[]
      return {
        success: true,
        requires_review: false,
        layer_used: 'api',
        data: {
          boards,
          total_boards: boards.length,
        },
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      requires_review: false,
      error: `[ApiConnector:read_board] Falha ao chamar API do Trello: ${message}`,
      layer_used: 'api',
    }
  }
}

// ─── HANDLER: read_roster (via cartões do Trello) ────────────────────────────

/**
 * Lê cartões de um board Trello e os devolve como lista de alunos/membros.
 * O roteamento semântico (qual lista é "alunos") é responsabilidade do consumidor
 * (trelloRouterEngine.ts) — este handler só traz os dados brutos.
 *
 * Params esperados:
 *   boardId: string  — obrigatório
 */
async function readRosterFromTrelloHandler(
  connector: Connector,
  params: Record<string, unknown>
): Promise<CapabilityResult> {
  const creds = resolveCredentials(connector)
  if (!creds) {
    return {
      success: false,
      requires_review: false,
      error: '[ApiConnector:read_roster] Credenciais do Trello não encontradas.',
    }
  }

  const boardId = typeof params.boardId === 'string' ? params.boardId.trim() : ''
  if (!boardId) {
    return {
      success: false,
      requires_review: false,
      error: '[ApiConnector:read_roster] Parâmetro obrigatório ausente: boardId.',
    }
  }

  try {
    const cards = await fetchTrelloCardsFromBoard(boardId, creds.apiKey, creds.apiToken) as TrelloCard[]
    return {
      success: true,
      requires_review: false,
      layer_used: 'api',
      data: {
        students: cards.map(c => ({
          name: c.name,
          portal_native_id: c.id,
          rollNumber: c.shortUrl,
          classRef: c.idList,
        })),
        total: cards.length,
        raw_cards: cards,
      },
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      requires_review: false,
      error: `[ApiConnector:read_roster] Falha ao buscar cartões do Trello: ${message}`,
      layer_used: 'api',
    }
  }
}

// ─── TEAMS HELPERS & HANDLERS ────────────────────────────────────────────────

function resolveTeamsCredentials(connector: Connector): TeamsOAuthConfig | null {
  const embedded = connector.api_config?.credentials as TeamsOAuthConfig | undefined
  if (embedded?.accessToken?.trim() || (embedded?.clientId?.trim() && embedded?.tenantId?.trim())) {
    return embedded
  }
  return null
}

async function listJoinedTeamsHandler(
  connector: Connector,
  params: Record<string, unknown>
): Promise<CapabilityResult> {
  const creds = resolveTeamsCredentials(connector)
  const authError = validateTeamsCredentials(creds)
  if (authError) {
    return {
      success: false,
      requires_review: false,
      error: authError.message,
      data: authError,
      layer_used: 'api'
    }
  }

  try {
    const teams = await listJoinedTeams(creds!.accessToken!)
    return {
      success: true,
      requires_review: false,
      layer_used: 'api',
      data: { teams }
    }
  } catch (err: any) {
    return {
      success: false,
      requires_review: false,
      error: err.message || 'Erro ao listar equipes do Teams',
      data: err.type === 'AZURE_AD_CREDENTIALS_REQUIRED' ? err : undefined,
      layer_used: 'api'
    }
  }
}

async function listChannelsHandler(
  connector: Connector,
  params: Record<string, unknown>
): Promise<CapabilityResult> {
  const teamId = params.teamId as string | undefined
  if (!teamId) {
    return {
      success: false,
      requires_review: false,
      error: '[ApiConnector:list_channels] Parâmetro "teamId" é obrigatório.',
      layer_used: 'api'
    }
  }

  const creds = resolveTeamsCredentials(connector)
  const authError = validateTeamsCredentials(creds)
  if (authError) {
    return {
      success: false,
      requires_review: false,
      error: authError.message,
      data: authError,
      layer_used: 'api'
    }
  }

  try {
    const channels = await listChannels(teamId, creds!.accessToken!)
    return {
      success: true,
      requires_review: false,
      layer_used: 'api',
      data: { channels }
    }
  } catch (err: any) {
    return {
      success: false,
      requires_review: false,
      error: err.message || 'Erro ao listar canais do Teams',
      data: err.type === 'AZURE_AD_CREDENTIALS_REQUIRED' ? err : undefined,
      layer_used: 'api'
    }
  }
}

async function postChannelMessageHandler(
  connector: Connector,
  params: Record<string, unknown>
): Promise<CapabilityResult> {
  const teamId = params.teamId as string | undefined
  const channelId = params.channelId as string | undefined
  const content = params.content as string | undefined
  const contentType = (params.contentType as 'text' | 'html') || 'html'

  if (!teamId || !channelId || !content) {
    return {
      success: false,
      requires_review: true,
      error: '[ApiConnector:post_channel_message] Parâmetros "teamId", "channelId" e "content" são obrigatórios.',
      layer_used: 'api'
    }
  }

  const creds = resolveTeamsCredentials(connector)
  const authError = validateTeamsCredentials(creds)
  if (authError) {
    return {
      success: false,
      requires_review: true,
      error: authError.message,
      data: authError,
      layer_used: 'api'
    }
  }

  try {
    const result = await postChannelMessage(teamId, channelId, content, creds!.accessToken!, contentType)
    return {
      success: true,
      requires_review: false,
      layer_used: 'api',
      data: result
    }
  } catch (err: any) {
    return {
      success: false,
      requires_review: true,
      error: err.message || 'Erro ao postar mensagem no canal do Teams',
      data: err.type === 'AZURE_AD_CREDENTIALS_REQUIRED' ? err : undefined,
      layer_used: 'api'
    }
  }
}

async function postChatMessageHandler(
  connector: Connector,
  params: Record<string, unknown>
): Promise<CapabilityResult> {
  const chatId = params.chatId as string | undefined
  const content = params.content as string | undefined
  const contentType = (params.contentType as 'text' | 'html') || 'html'

  if (!chatId || !content) {
    return {
      success: false,
      requires_review: true,
      error: '[ApiConnector:post_chat_message] Parâmetros "chatId" e "content" são obrigatórios.',
      layer_used: 'api'
    }
  }

  const creds = resolveTeamsCredentials(connector)
  const authError = validateTeamsCredentials(creds)
  if (authError) {
    return {
      success: false,
      requires_review: true,
      error: authError.message,
      data: authError,
      layer_used: 'api'
    }
  }

  try {
    const result = await postChatMessage(chatId, content, creds!.accessToken!, contentType)
    return {
      success: true,
      requires_review: false,
      layer_used: 'api',
      data: result
    }
  } catch (err: any) {
    return {
      success: false,
      requires_review: true,
      error: err.message || 'Erro ao postar no chat do Teams',
      data: err.type === 'AZURE_AD_CREDENTIALS_REQUIRED' ? err : undefined,
      layer_used: 'api'
    }
  }
}

import { checkDataSufficiency } from '@/lib/dataSufficiencyGate'

// ─── HANDLER: grade_exam ─────────────────────────────────────────────────────

async function gradeExamHandler(
  connector: Connector,
  params: Record<string, unknown>
): Promise<CapabilityResult> {
  try {
    const { processOMRBatchAndUpdatePsychometrics } = await import('@/lib/omrPsychometricsBridge')
    const { generateExecutivePedagogicalSummary } = await import('@/lib/executivePedagogicalSummary')
    const sheets = (params.sheets as any[]) || []
    const examId = (params.examId as string) || 'exam_default'
    const examTitle = (params.examTitle as string) || 'Avaliação'
    const topic = (params.topic as string) || 'Geral'
    const answerKey = (params.answerKey as Record<number, string>) || { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A' }

    const sufficiency = checkDataSufficiency(sheets, {
      minRequired: 1,
      entityName: 'folhas de resposta',
      contextLabel: examTitle
    })

    let finalSheets = sheets
    if (!sufficiency.isSufficient) {
      if (params.simulation === true && typeof params.studentCount === 'number' && params.studentCount > 0) {
        const count = params.studentCount as number
        finalSheets = Array.from({ length: count }, (_, i) => ({
          studentId: `student_${i + 1}`,
          studentName: `Aluno ${i + 1}`,
          group: i % 2 === 0 ? 'reference' : 'focus',
          detectedAnswers: { ...answerKey }
        }))
      } else {
        return {
          success: false,
          hasData: false,
          requires_review: false,
          layer_used: 'api',
          error: sufficiency.message,
          data: null
        }
      }
    }

    const batchResult = processOMRBatchAndUpdatePsychometrics(finalSheets, {
      examId,
      examTitle,
      topic,
      answerKey,
      totalQuestions: Object.keys(answerKey).length
    })

    const questionMetadata = Object.keys(answerKey).map(qStr => {
      const qNum = parseInt(qStr, 10)
      return {
        questionNumber: qNum,
        correctAnswer: answerKey[qNum],
        topic
      }
    })

    const executiveSummary = generateExecutivePedagogicalSummary({
      examTitle,
      topic,
      studentBKTUpdates: batchResult.studentBKTUpdates,
      questionMetadata
    })

    return {
      success: true,
      hasData: true,
      requires_review: false,
      layer_used: 'api',
      data: {
        ...batchResult,
        totalStudents: batchResult.totalSheetsProcessed,
        averageScore: executiveSummary.classroomProfile.averageMasteryPercentage,
        executiveSummary
      }
    }
  } catch (err: unknown) {
    return {
      success: false,
      requires_review: false,
      error: `[ApiConnector:grade_exam] Falha ao processar lote de avaliação: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

// ─── HANDLER: get_exam_summary ───────────────────────────────────────────────

async function getExamSummaryHandler(
  connector: Connector,
  params: Record<string, unknown>
): Promise<CapabilityResult> {
  try {
    const { generateExecutivePedagogicalSummary } = await import('@/lib/executivePedagogicalSummary')
    const examTitle = (params.examTitle as string) || 'Avaliação Bimestral'
    const topic = (params.topic as string) || 'Geral'
    const classRef = (params.classRef as string) || ''
    let studentBKTUpdates = (params.studentBKTUpdates as any[]) || []

    // Se não forneceu updates explícitos, busca no histórico real de provas do professor
    if (studentBKTUpdates.length === 0 && (typeof window !== 'undefined' || typeof localStorage !== 'undefined')) {
      try {
        const rawHistory = localStorage.getItem('teacher_exam_history')
        if (rawHistory) {
          const history = JSON.parse(rawHistory)
          if (Array.isArray(history)) {
            const match = history.find((e: any) =>
              (!classRef || e.classRef === classRef || (e.classRef && String(e.classRef).toLowerCase().includes(classRef.toLowerCase()))) &&
              (!topic || topic === 'Geral' || (e.topic && String(e.topic).toLowerCase().includes(topic.toLowerCase())))
            )
            if (match && Array.isArray(match.results) && match.results.length > 0) {
              studentBKTUpdates = match.results.map((r: any) => ({
                studentId: r.studentId || 'std',
                studentName: r.studentName,
                topic: match.topic || topic,
                previousMastery: 0.30,
                newMastery: (r.totalScore / (r.maxScore || 10)),
                isMastered: (r.totalScore / (r.maxScore || 10)) >= 0.70,
                responses: (r.questionResults || []).map((qr: any, idx: number) => ({
                  questionNumber: idx + 1,
                  detectedAnswer: null,
                  correctAnswer: '',
                  isCorrect: Boolean(qr.correct || qr.isCorrect)
                }))
              }))
            }
          }
        }
      } catch {}
    }

    const sufficiency = checkDataSufficiency(studentBKTUpdates, {
      minRequired: 1,
      entityName: 'simulados ou avaliações registradas',
      contextLabel: classRef ? `a turma ${classRef}` : undefined
    })

    if (!sufficiency.isSufficient) {
      if (params.simulation === true && typeof params.studentCount === 'number' && params.studentCount > 0) {
        const count = params.studentCount as number
        studentBKTUpdates = Array.from({ length: count }, (_, i) => ({
          studentId: `student_${i + 1}`,
          studentName: `Aluno ${i + 1}`,
          topic,
          previousMastery: 0.20,
          newMastery: i % 3 === 0 ? 0.45 : 0.85,
          isMastered: i % 3 !== 0,
          responses: [
            { questionNumber: 1, detectedAnswer: 'A', correctAnswer: 'A', isCorrect: true },
            { questionNumber: 2, detectedAnswer: i % 3 === 0 ? 'B' : 'C', correctAnswer: 'C', isCorrect: i % 3 !== 0 }
          ]
        }))
      } else {
        // Retorno honesto sem fabricação
        return {
          success: true,
          hasData: false,
          requires_review: false,
          layer_used: 'api',
          data: null,
          message: sufficiency.message
        }
      }
    }

    const summary = generateExecutivePedagogicalSummary({
      examTitle,
      topic,
      studentBKTUpdates,
      questionMetadata: (params.questionMetadata as any[]) || [
        { questionNumber: 1, correctAnswer: 'A', topic: `${topic} - Fundamentos` },
        { questionNumber: 2, correctAnswer: 'C', topic: `${topic} - Aplicação` }
      ]
    })

    return {
      success: true,
      hasData: true,
      requires_review: false,
      layer_used: 'api',
      data: summary
    }
  } catch (err: unknown) {
    return {
      success: false,
      requires_review: false,
      error: `[ApiConnector:get_exam_summary] Falha ao gerar sumário executivo: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

// ─── REGISTRO NO ENGINE ───────────────────────────────────────────────────────

/**
 * Registra todos os handlers do tier api no Connector Engine.
 * Deve ser chamado uma única vez na inicialização do app,
 * APÓS registerAgenticBrowserHandlers().
 */
export function registerApiHandlers(): void {
  registerCapabilityHandler('api', 'read_board', readBoardHandler)
  registerCapabilityHandler('api', 'read_roster', readRosterFromTrelloHandler)
  registerCapabilityHandler('api', 'list_joined_teams', listJoinedTeamsHandler)
  registerCapabilityHandler('api', 'list_channels', listChannelsHandler)
  registerCapabilityHandler('api', 'post_channel_message', postChannelMessageHandler)
  registerCapabilityHandler('api', 'post_chat_message', postChatMessageHandler)
  registerCapabilityHandler('api', 'grade_exam', gradeExamHandler)
  registerCapabilityHandler('api', 'get_exam_summary', getExamSummaryHandler)
}

/**
 * Handlers exportados para testes unitários sem efeito colateral no engine global.
 * @internal
 */
export const _handlers = {
  readBoard: readBoardHandler,
  readRosterFromTrello: readRosterFromTrelloHandler,
  listJoinedTeams: listJoinedTeamsHandler,
  listChannels: listChannelsHandler,
  postChannelMessage: postChannelMessageHandler,
  postChatMessage: postChatMessageHandler,
  gradeExam: gradeExamHandler,
  getExamSummary: getExamSummaryHandler,
} as const

