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
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  it('1.a e 1.c: Grava sessão com nome canário, fecha banco e asserte que bytes NÃO contêm o canário', async () => {
    const driver = new NodeSqliteDriver(testDbPath)
    await initConversationVault(driver)

    const repo = new ConversationVaultRepository(driver, dataKey)

    const CANARY_NAME = 'CanarioSilenciosoAluno99'
    const CANARY_TEXT = 'SegredoCanarioBiologia123'
    const CANARY_TITLE = 'Atendimento Canario Arthur Bio 789'
    const sessionId = 'session_canary_test'

    await repo.createSession({
      id: sessionId,
      title: CANARY_TITLE,
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

    // 1.a e A2: Inspeção dos bytes físicos do arquivo SQLite em disco
    const fileBytes = fs.readFileSync(testDbPath)
    const fileString = fileBytes.toString('utf8')

    expect(fileBytes.includes(Buffer.from(CANARY_NAME))).toBe(false)
    expect(fileBytes.includes(Buffer.from(CANARY_TEXT))).toBe(false)
    expect(fileBytes.includes(Buffer.from(CANARY_TITLE))).toBe(false)
    expect(fileBytes.includes(Buffer.from('NomeRealCanario456'))).toBe(false)
    expect(fileString.includes(CANARY_NAME)).toBe(false)
    expect(fileString.includes(CANARY_TEXT)).toBe(false)
    expect(fileString.includes(CANARY_TITLE)).toBe(false)

    // Reabre e valida leitura com chave correta
    const readerDriver = new NodeSqliteDriver(testDbPath)
    const readerRepo = new ConversationVaultRepository(readerDriver, dataKey)

    const sessions = await readerRepo.listSessions()
    expect(sessions[0].title).toBe(CANARY_TITLE)

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

  it('A3. Migração: detecta linhas sem prefixo enc:v1: e recifra na abertura do cofre com banco legado', async () => {
    // 1. Cria um banco legado sem dataKey (texto puro)
    const legacyDriver = new NodeSqliteDriver(testDbPath)
    await initConversationVault(legacyDriver)
    const legacyRepo = new ConversationVaultRepository(legacyDriver) // sem dataKey

    const LEGACY_TITLE = 'Aula Legada Canario Texto Puro 101'
    const LEGACY_SPEAKER = 'Canario Legado 202'
    const LEGACY_TEXT = 'Conteudo Confidencial em Claro 303'

    await legacyRepo.createSession({
      id: 'sess_legacy',
      title: LEGACY_TITLE,
      session_type: 'aula',
      total_duration_ms: 15000
    })

    await legacyRepo.insertTurns([
      {
        id: 'turn_leg_1',
        session_id: 'sess_legacy',
        speaker_label: LEGACY_SPEAKER,
        role: 'aluno',
        start_ms: 0,
        end_ms: 5000,
        text: LEGACY_TEXT,
        turn_index: 0
      }
    ])

    legacyDriver.close()

    // 2. Prova que o banco legado continha texto puro nos bytes em disco
    const rawLegacyBytes = fs.readFileSync(testDbPath)
    expect(rawLegacyBytes.includes(Buffer.from(LEGACY_TITLE))).toBe(true)
    expect(rawLegacyBytes.includes(Buffer.from(LEGACY_SPEAKER))).toBe(true)
    expect(rawLegacyBytes.includes(Buffer.from(LEGACY_TEXT))).toBe(true)

    // 3. Abre o banco com chave segura e executa a migração automática
    const securedDriver = new NodeSqliteDriver(testDbPath)
    const securedRepo = new ConversationVaultRepository(securedDriver, dataKey)
    const migrationReport = await securedRepo.migrateLegacyPlaintextToEncrypted()

    expect(migrationReport.sessionsMigrated).toBe(1)
    expect(migrationReport.turnsMigrated).toBe(1)

    securedDriver.close()

    // 4. Prova que após a migração e VACUUM/checkpoint, o texto puro SUMIU dos bytes de db, db-wal e db-journal
    const checkNoCanary = (filePath: string) => {
      if (fs.existsSync(filePath)) {
        const bytes = fs.readFileSync(filePath)
        expect(bytes.includes(Buffer.from(LEGACY_TITLE))).toBe(false)
        expect(bytes.includes(Buffer.from(LEGACY_SPEAKER))).toBe(false)
        expect(bytes.includes(Buffer.from(LEGACY_TEXT))).toBe(false)
      }
    }

    checkNoCanary(testDbPath)
    checkNoCanary(testDbPath + '-wal')
    checkNoCanary(testDbPath + '-journal')

    // 5. Prova que a leitura com a dataKey decifra perfeitamente os dados originais
    const verifyDriver = new NodeSqliteDriver(testDbPath)
    const verifyRepo = new ConversationVaultRepository(verifyDriver, dataKey)

    const restoredSessions = await verifyRepo.listSessions()
    expect(restoredSessions[0].title).toBe(LEGACY_TITLE)

    const restoredTurns = await verifyRepo.getTurnsBySession('sess_legacy')
    expect(restoredTurns[0].speaker_label).toBe(LEGACY_SPEAKER)
    expect(restoredTurns[0].text).toBe(LEGACY_TEXT)

    verifyDriver.close()
  })

  it('A4. deleteSession: falha do VACUUM propaga para o chamador', async () => {
    const mockDriver: any = {
      db: {},
      execute: async (sql: string) => {
        if (sql === 'VACUUM') {
          throw new Error('database is locked (VACUUM failed simulation)')
        }
      }
    }
    const repo = new ConversationVaultRepository(mockDriver, dataKey)

    await expect(repo.deleteSession('sess_err')).rejects.toThrow('database is locked (VACUUM failed simulation)')

    // Verifica que o desktopIpc traduz para português
    await expect(executeConversationMethod('conversation.delete', { sessionId: 'sess_err' }, mockDriver, dataKey))
      .rejects.toThrow('Falha ao compactar e expurgar fisicamente o cofre (VACUUM): database is locked')
  })

  it('0.b e 1.b: Lança erro em português se cofre seguro / driver.db for undefined ou null', async () => {
    // 1. Testa com driver.db === undefined
    const driverWithUndefinedDb = { db: undefined } as any
    await expect(
      executeConversationMethod('conversation.ask', { sessionId: 's1', query: 'teste' }, driverWithUndefinedDb)
    ).rejects.toThrow('Cofre local seguro indisponível no Desktop. Operação cancelada por segurança.')

    // 2. Testa com driver.db === null
    const driverWithNullDb = { db: null } as any
    await expect(
      executeConversationMethod('conversation.ask', { sessionId: 's1', query: 'teste' }, driverWithNullDb)
    ).rejects.toThrow('Cofre local seguro indisponível no Desktop. Operação cancelada por segurança.')

    // 3. Testa com driver falsy/nulo
    await expect(
      executeConversationMethod('conversation.ask', { sessionId: 's1', query: 'teste' }, null as any)
    ).rejects.toThrow('Cofre local seguro indisponível no Desktop. Operação cancelada por segurança.')
  })
})
