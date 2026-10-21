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
 */

import type { SqlDriver } from '../desktop-core/db/SqlDriver'
import { ConversationVaultRepository } from './schema'
import { importTranscriptFile } from './transcriptParsers'
import { importConversationJson } from './importer'
import { classifySessionEvents } from './eventClassifier'
import { executeConversationQuery, routeQueryWithOllama } from './queryEngine'
import { generateStructuredSummary } from './summarizer'
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

type DriverWithOptionalDb = SqlDriver & { db?: unknown }

export async function executeConversationMethod(
  method: string,
  params: any,
  driver: SqlDriver,
  dataKey?: Buffer
): Promise<any> {
  const driverWithDb = driver as DriverWithOptionalDb
  if (!driver || !driverWithDb.db) {
    throw new Error('Cofre local seguro indisponível no Desktop. Operação cancelada por segurança.')
  }
  const repo = new ConversationVaultRepository(driver, dataKey)

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
      const sessionId = params.sessionId as string
      if (!sessionId) throw new Error('Parâmetro "sessionId" é obrigatório.')
      const turns = await repo.getTurnsBySession(sessionId)
      const events = await repo.getEventsBySession(sessionId)
      const userLabels = await repo.getUserTurnLabels(sessionId)

      const labelMap = new Map(userLabels.map(l => [l.turn_id, l.user_label]))
      const questionTurns = new Set(events.filter(e => e.type === 'pergunta').map(e => e.turn_id))

      let tp = 0, fp = 0, tn = 0, fn = 0
      let evaluatedCount = 0

      for (const turn of turns) {
        const manualLabel = labelMap.get(turn.id)
        if (!manualLabel || manualLabel === 'pular') continue

        evaluatedCount++
        const expectedIsQuestion = manualLabel === 'pergunta'
        const predictedIsQuestion = questionTurns.has(turn.id)

        if (predictedIsQuestion && expectedIsQuestion) tp++
        else if (predictedIsQuestion && !expectedIsQuestion) fp++
        else if (!predictedIsQuestion && !expectedIsQuestion) tn++
        else fn++
      }

      const precision = tp + fp > 0 ? tp / (tp + fp) : 0
      const recall = tp + fn > 0 ? tp / (tp + fn) : 0
      const accuracy = evaluatedCount > 0 ? (tp + tn) / evaluatedCount : 0
      const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0

      return {
        success: true,
        evaluatedCount,
        tp, fp, tn, fn,
        precision,
        recall,
        accuracy,
        f1
      }
    }

    case 'conversation.purgeExpired': {
      const purgedCount = await repo.purgeExpiredSessions()
      return {
        success: true,
        purgedCount
      }
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
  return setInterval(async () => {
    try {
      const repo = new ConversationVaultRepository(driver, dataKey)
      const purged = await repo.purgeExpiredSessions()
      if (purged > 0) {
        console.log(`[conversationData] ${purged} sessões vencidas expurgadas periodicamente.`)
      }
    } catch {}
  }, intervalMs)
}
