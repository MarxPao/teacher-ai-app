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

export async function executeConversationMethod(
  method: string,
  params: any,
  driver: SqlDriver
): Promise<any> {
  const repo = new ConversationVaultRepository(driver)

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
      await repo.deleteSession(sessionId)
      return {
        success: true,
        deletedSessionId: sessionId
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
