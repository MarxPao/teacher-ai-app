/**
 * lib/conversationData/desktopIpc.ts
 *
 * Handlers de IPC para o Desktop Core (Electron), sem adicionar novas permissões.
 * Métodos:
 * - conversation.import
 * - conversation.sessions.list
 * - conversation.ask
 * - conversation.summary
 * - conversation.delete
 * - conversation.turns.list
 * - conversation.labels.save
 * - conversation.labels.benchmark
 * - conversation.purgeExpired
 */

import type { SqlDriver } from '../desktop-core/db/SqlDriver'
import { ConversationVaultRepository } from './schema'
import { importTranscriptFile } from './transcriptParsers'
import { importConversationJson } from './importer'
import { classifySessionEvents } from './eventClassifier'
import { executeConversationQuery, routeQueryWithOllama } from './queryEngine'
import { generateStructuredSummary } from './summarizer'
import { calculateLabelMetrics } from './labelingEvaluation'
import { getUnifiedSessionPedagogicalData } from './insightIntegrationAdapter'
import type { SessionType } from './types'

export interface ConversationImportParams {
  content: string
  format: 'vtt' | 'srt' | 'txt' | 'json'
  sessionId?: string
  title: string
  sessionType: SessionType
  teacherSpeakerName: string
  retentionDays?: number
}

export interface ConversationAskParams {
  sessionId: string
  query: string
  useOllama?: boolean
}

/**
 * Validação rigorosa e fail-closed do estado operacional do driver SQLite.
 * Suporta contratos explícitos com isOpen() e contratos com propriedade db (in-memory / sqlite nativo),
 * além de validar a presença de todos os métodos SQL fundamentais sem uso de duck typing frágil.
 */
export function assertVaultReady(driver: unknown): asserts driver is SqlDriver {
  if (!driver || typeof driver !== 'object') {
    throw new Error('E_VAULT_DRIVER_NOT_OPEN: Cofre local seguro indisponível no Desktop. Operação cancelada por segurança.')
  }
  const candidate = driver as Partial<SqlDriver>

  // Contrato fail-closed estrito: o driver DEVE implementar isOpen() e retornar true
  if (typeof candidate.isOpen !== 'function' || !candidate.isOpen()) {
    throw new Error('E_VAULT_DRIVER_NOT_OPEN: Cofre local seguro indisponível no Desktop. O driver SQL deve implementar isOpen() e estar aberto.')
  }

  // Validação dos métodos essenciais da interface SqlDriver
  if (
    typeof candidate.execute !== 'function' ||
    typeof candidate.query !== 'function' ||
    typeof candidate.queryOne !== 'function' ||
    typeof candidate.transaction !== 'function'
  ) {
    throw new Error('E_VAULT_DRIVER_INVALID: Driver SQL incompleto no Desktop. Métodos execute, query, queryOne e transaction são obrigatórios.')
  }
}

/**
 * Validação estrita da chave criptográfica DEK (Buffer de 32 bytes).
 * Lança erro explícito E_VAULT_KEY_MISSING se ausente ou inválida.
 */
export function assertValidDataKey(dataKey: unknown): Buffer {
  if (!dataKey || !Buffer.isBuffer(dataKey) || dataKey.length !== 32) {
    throw new Error('E_VAULT_KEY_MISSING: Chave criptográfica do cofre ausente ou inválida (requer Buffer de 32 bytes).')
  }
  return dataKey
}

export async function executeConversationMethod(
  method: string,
  params: any,
  driver: SqlDriver,
  dataKey?: Buffer
): Promise<any> {
  assertVaultReady(driver)
  const validKey = assertValidDataKey(dataKey)
  const repo = new ConversationVaultRepository(driver, validKey)

  switch (method) {
    case 'conversation.import': {
      const p = params as ConversationImportParams
      const sessionId = p.sessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

      let session
      if (p.format === 'json') {
        const parsedJson = typeof p.content === 'string' ? JSON.parse(p.content) : p.content
        session = await importConversationJson(repo, parsedJson)
      } else {
        session = await importTranscriptFile(repo, {
          content: p.content,
          format: p.format,
          sessionId,
          title: p.title,
          sessionType: p.sessionType,
          teacherSpeakerName: p.teacherSpeakerName,
          retentionDays: p.retentionDays
        })
      }

      const events = await classifySessionEvents(repo, session.id)
      const turns = await repo.getTurnsBySession(session.id)

      return {
        success: true,
        sessionId: session.id,
        title: session.title,
        totalDurationMs: session.total_duration_ms,
        turnCount: turns.length,
        eventCount: events.length
      }
    }

    case 'conversation.sessions.list': {
      await repo.purgeExpiredSessions()
      const sessions = await repo.listSessions()
      return {
        success: true,
        sessions
      }
    }

    case 'conversation.ask': {
      const p = params as ConversationAskParams
      if (!p.sessionId || !p.query) {
        throw new Error('Parâmetros "sessionId" e "query" são obrigatórios.')
      }

      if (p.useOllama) {
        await routeQueryWithOllama(p.query)
      }

      const response = await executeConversationQuery(repo, p.sessionId, p.query)
      return {
        success: true,
        response
      }
    }

    case 'conversation.summary': {
      const sessionId = params.sessionId as string
      if (!sessionId) throw new Error('Parâmetro "sessionId" é obrigatório.')
      const summary = await generateStructuredSummary(repo, sessionId)
      return {
        success: true,
        summary
      }
    }

    case 'conversation.delete': {
      const sessionId = params.sessionId as string
      if (!sessionId) throw new Error('Parâmetro "sessionId" é obrigatório.')
      try {
        await repo.deleteSession(sessionId)
      } catch (err: any) {
        throw new Error(`Falha ao compactar e expurgar fisicamente o cofre (VACUUM): ${err.message || String(err)}`)
      }
      return {
        success: true,
        deletedSessionId: sessionId
      }
    }

    case 'conversation.turns.list': {
      const sessionId = params.sessionId as string
      if (!sessionId) throw new Error('Parâmetro "sessionId" é obrigatório.')
      const turns = await repo.getTurnsBySession(sessionId)
      const userLabels = await repo.getUserTurnLabels(sessionId)
      const labelMap = new Map(userLabels.map(l => [l.turn_id, l.user_label]))

      return {
        success: true,
        turns: turns.map(t => ({
          ...t,
          userLabel: labelMap.get(t.id) || null
        }))
      }
    }

    case 'conversation.labels.save': {
      const { sessionId, turnId, userLabel } = params
      if (!sessionId || !turnId || !userLabel) {
        throw new Error('Parâmetros "sessionId", "turnId" e "userLabel" são obrigatórios.')
      }
      await repo.saveUserTurnLabel({ sessionId, turnId, userLabel })
      return { success: true, saved: true }
    }

    case 'conversation.labels.benchmark': {
      const sessionId = params.sessionId as string | undefined
      const allSessions = Boolean(params.allSessions || sessionId === 'all' || !sessionId)

      let turns: any[]
      let events: any[]
      let userLabels: Array<{ session_id?: string; turn_id: string; user_label: string }>

      if (!allSessions && sessionId) {
        turns = await repo.getTurnsBySession(sessionId)
        events = await repo.getEventsBySession(sessionId)
        userLabels = await repo.getUserTurnLabels(sessionId)
      } else {
        turns = await repo.getAllTurns()
        events = await repo.getAllEvents()
        userLabels = await repo.getAllUserTurnLabels()
      }

      const questionTurnIds = new Set(events.filter(e => e.type === 'pergunta').map(e => e.turn_id))
      const metrics = calculateLabelMetrics(turns, questionTurnIds, userLabels)

      return {
        success: true,
        ...metrics
      }
    }

    case 'conversation.purgeExpired': {
      const purgedCount = await repo.purgeExpiredSessions()
      return {
        success: true,
        purgedCount
      }
    }

    case 'conversation.insights.get': {
      const sessionId = params.sessionId as string
      if (!sessionId) throw new Error('Parâmetro "sessionId" é obrigatório.')
      const discipline = params.discipline as string | undefined
      const allowFixturesForTesting = Boolean(params.allowFixturesForTesting)
      const data = await getUnifiedSessionPedagogicalData(sessionId, repo, {
        discipline,
        allowFixturesForTesting
      })
      return { success: true, ...data }
    }

    default:
      throw new Error(`Método de conversação desconhecido: ${method}`)
  }
}

/**
 * Dispara purga periódica das sessões vencidas no SQLite do Desktop.
 */
export function startPeriodicRetentionPurge(
  driver: SqlDriver,
  intervalMs: number = 3600000,
  dataKey?: Buffer
): NodeJS.Timeout {
  assertVaultReady(driver)
  const validKey = assertValidDataKey(dataKey)
  return setInterval(async () => {
    try {
      const repo = new ConversationVaultRepository(driver, validKey)
      const purged = await repo.purgeExpiredSessions()
      if (purged > 0) {
        console.log(`[conversationData] ${purged} sessões vencidas expurgadas periodicamente.`)
      }
    } catch {}
  }, intervalMs)
}
