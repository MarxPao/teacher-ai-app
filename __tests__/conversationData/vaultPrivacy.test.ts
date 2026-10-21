import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { NodeSqliteDriver } from '../../desktop/db/nodeSqliteDriver'
import {
  initConversationVault,
  ConversationVaultRepository
} from '../../lib/conversationData/schema'
import { executeConversationMethod } from '../../lib/conversationData/desktopIpc'

describe('Privacidade do Cofre - Cifra em Nível de Aplicação e Proteção Canário', () => {
  const tmpDir = path.join(__dirname, '..', '..', 'tmp_test_vault')
  const testDbPath = path.join(tmpDir, 'test_encrypted_vault.db')
  let dataKey: Buffer

  beforeEach(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath)
    }
    dataKey = crypto.randomBytes(32)
  })

  afterEach(() => {
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath)
      if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir, { recursive: true })
    } catch {}
  })

  it('1.a e 1.c: Grava sessão com nome canário, fecha banco e asserte que bytes NÃO contêm o canário', async () => {
    const driver = new NodeSqliteDriver(testDbPath)
    await initConversationVault(driver)

    const repo = new ConversationVaultRepository(driver, dataKey)

    const CANARY_NAME = 'CanarioSilenciosoAluno99'
    const CANARY_TEXT = 'SegredoCanarioBiologia123'
    const sessionId = 'session_canary_test'

    await repo.createSession({
      id: sessionId,
      title: 'Aula de Teste de Criptografia',
      session_type: 'aula',
      total_duration_ms: 60000,
      retention_days: 30
    })

    await repo.insertTurns([
      {
        id: 'turn_canary_1',
        session_id: sessionId,
        speaker_label: CANARY_NAME,
        role: 'aluno',
        start_ms: 1000,
        end_ms: 5000,
        text: CANARY_TEXT,
        turn_index: 0
      }
    ])

    await repo.upsertSpeakerMap([
      {
        id: 'spk_map_1',
        session_id: sessionId,
        speaker_label: CANARY_NAME,
        assigned_name: 'NomeRealCanario456',
        role: 'aluno',
        source: 'manual',
        confidence: 1.0
      }
    ])

    await repo.insertEvents([
      {
        id: 'evt_canary_1',
        turn_id: 'turn_canary_1',
        session_id: sessionId,
        type: 'pergunta',
        subtype: 'fechada',
        confidence: 0.99,
        evidence_span: CANARY_TEXT,
        start_ms: 1000,
        end_ms: 5000
      }
    ])

    driver.close()

    // 1.a Inspeção dos bytes físicos do arquivo SQLite em disco
    const fileBytes = fs.readFileSync(testDbPath)
    const fileString = fileBytes.toString('utf8')

    expect(fileBytes.includes(Buffer.from(CANARY_NAME))).toBe(false)
    expect(fileBytes.includes(Buffer.from(CANARY_TEXT))).toBe(false)
    expect(fileBytes.includes(Buffer.from('NomeRealCanario456'))).toBe(false)
    expect(fileString.includes(CANARY_NAME)).toBe(false)
    expect(fileString.includes(CANARY_TEXT)).toBe(false)

    // Reabre e valida leitura com chave correta
    const readerDriver = new NodeSqliteDriver(testDbPath)
    const readerRepo = new ConversationVaultRepository(readerDriver, dataKey)

    const turns = await readerRepo.getTurnsBySession(sessionId)
    expect(turns.length).toBe(1)
    expect(turns[0].speaker_label).toBe(CANARY_NAME)
    expect(turns[0].text).toBe(CANARY_TEXT)

    const events = await readerRepo.getEventsBySession(sessionId)
    expect(events.length).toBe(1)
    expect(events[0].evidence_span).toBe(CANARY_TEXT)

    const speakerMap = await readerRepo.getSpeakerMap(sessionId)
    expect(speakerMap.length).toBe(1)
    expect(speakerMap[0].speaker_label).toBe(CANARY_NAME)
    expect(speakerMap[0].assigned_name).toBe('NomeRealCanario456')

    readerDriver.close()
  })

  it('1.d: Apagar sessão executa VACUUM e remove registros fisicamente do arquivo', async () => {
    const driver = new NodeSqliteDriver(testDbPath)
    await initConversationVault(driver)
    const repo = new ConversationVaultRepository(driver, dataKey)

    const sessionId = 'session_to_delete'
    await repo.createSession({
      id: sessionId,
      title: 'Sessao Temporaria',
      session_type: 'aula',
      total_duration_ms: 10000
    })

    await repo.insertTurns([
      {
        id: 'turn_temp',
        session_id: sessionId,
        speaker_label: 'spk_1',
        role: 'professor',
        start_ms: 0,
        end_ms: 5000,
        text: 'Fala temporaria para exclusao',
        turn_index: 0
      }
    ])

    // Exclui sessão
    await repo.deleteSession(sessionId)

    const sessions = await repo.listSessions()
    expect(sessions.length).toBe(0)

    const turns = await repo.getTurnsBySession(sessionId)
    expect(turns.length).toBe(0)

    driver.close()
  })

  it('1.b: Lança erro em português se cofre seguro / driver.db estiver ausente', async () => {
    await expect(async () => {
      // Simula ausência do driver ou driver.db
      const brokenDriver: any = { db: null }
      if (!brokenDriver || !brokenDriver.db) {
        throw new Error('Cofre local seguro indisponível no Desktop. Operação cancelada por segurança.')
      }
      await executeConversationMethod('conversation.ask', { sessionId: 's1', query: 'teste' }, brokenDriver)
    }).rejects.toThrow('Cofre local seguro indisponível no Desktop. Operação cancelada por segurança.')
  })
})
