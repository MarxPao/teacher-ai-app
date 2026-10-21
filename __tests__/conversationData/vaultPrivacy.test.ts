import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import { NodeSqliteDriver } from '../../desktop/db/nodeSqliteDriver'
import type { SqlDriver } from '../../lib/desktop-core/db/SqlDriver'
import {
  initConversationVault,
  ConversationVaultRepository
} from '../../lib/conversationData/schema'
import {
  executeConversationMethod,
  assertVaultReady,
  assertValidDataKey
} from '../../lib/conversationData/desktopIpc'

describe('Privacidade do Cofre - Cifra em Nível de Aplicação e Proteção Canário (Bloco 1)', () => {
  let tmpDir: string
  let testDbPath: string
  let dataKey: Buffer

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teacher_vault_test_'))
    testDbPath = path.join(tmpDir, 'test_encrypted_vault.db')
    dataKey = crypto.randomBytes(32)
  })

  afterEach(() => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      }
    } catch {}
  })

  it('1.1 e 1.2: Contrato do driver (isOpen, db null/undefined, fechado vs válido) e obrigatoriedade da dataKey (32 bytes)', async () => {
    // 1. Driver nulo/undefined
    expect(() => assertVaultReady(null)).toThrow('Cofre local seguro indisponível no Desktop')
    expect(() => assertVaultReady(undefined)).toThrow('Cofre local seguro indisponível no Desktop')

    // 2. Driver com db undefined
    const driverWithUndefinedDb = {
      db: undefined,
      execute: async () => {},
      query: async () => [],
      queryOne: async () => null,
      transaction: async (fn: any) => fn({})
    }
    expect(() => assertVaultReady(driverWithUndefinedDb)).toThrow('Cofre local seguro indisponível no Desktop')

    // 3. Driver com db null
    const driverWithNullDb = {
      db: null,
      execute: async () => {},
      query: async () => [],
      queryOne: async () => null,
      transaction: async (fn: any) => fn({})
    }
    expect(() => assertVaultReady(driverWithNullDb)).toThrow('Cofre local seguro indisponível no Desktop')

    // 4. Driver fechado (isOpen() === false) ou sem isOpen (fail-closed obrigatório)
    const driverWithoutIsOpen = {
      execute: async () => {},
      query: async () => [],
      queryOne: async () => null,
      transaction: async (fn: any) => fn({})
    }
    expect(() => assertVaultReady(driverWithoutIsOpen)).toThrow('E_VAULT_DRIVER_NOT_OPEN')

    const closedDriver = {
      isOpen: () => false,
      execute: async () => {},
      query: async () => [],
      queryOne: async () => null,
      transaction: async (fn: any) => fn({})
    }
    expect(() => assertVaultReady(closedDriver)).toThrow('E_VAULT_DRIVER_NOT_OPEN')
    expect(() => assertVaultReady(closedDriver)).toThrow('Cofre local seguro indisponível no Desktop')

    // 5. Driver alternativo válido (ex: mock ou IPC driver sem db mas com isOpen() === true ou métodos completos)
    const validAlternativeDriver: SqlDriver = {
      isOpen: () => true,
      execute: async () => {},
      query: async () => [],
      queryOne: async () => null,
      transaction: async (fn: any) => fn(validAlternativeDriver)
    }
    expect(() => assertVaultReady(validAlternativeDriver)).not.toThrow()

    // 6. dataKey obrigatória (Buffer de 32 bytes) com erro E_VAULT_KEY_MISSING
    expect(() => assertValidDataKey(undefined)).toThrow('E_VAULT_KEY_MISSING')
    expect(() => assertValidDataKey(null)).toThrow('E_VAULT_KEY_MISSING')
    expect(() => assertValidDataKey('chave-em-texto-insegura')).toThrow('E_VAULT_KEY_MISSING')
    expect(() => assertValidDataKey(Buffer.from('chave-curta-16b'))).toThrow('E_VAULT_KEY_MISSING')
    expect(() => assertValidDataKey(Buffer.alloc(32, 0x42))).not.toThrow()

    // 7. Chamada de executeConversationMethod sem dataKey válida falha com E_VAULT_KEY_MISSING
    await expect(
      executeConversationMethod('conversation.sessions.list', {}, validAlternativeDriver, undefined)
    ).rejects.toThrow('E_VAULT_KEY_MISSING')
  })

  it('1.4: Teste triplo de bytes com controle positivo, acentuação UTF-8/UTF-16LE, rotulagem e pós-delete', async () => {
    const CANARY_NAME = 'João Biologia 7º Ano Ação Pedagógica'
    const CANARY_TEXT = 'Conteúdo Confidencial de Avaliação ZDP com Árvore e Mitocôndria 987'
    const CANARY_TITLE = 'Atendimento Canário Arthur Atenção Especial'
    const CANARY_LABEL = 'Rótulo Exclusivo da Professora com Acentuação Crítica'
    const sessionId = 'session_canary_test'

    // a) CONTROLE POSITIVO: Insere registros legados em texto puro para provar detecção física
    const legacyDriver = new NodeSqliteDriver(testDbPath)
    await initConversationVault(legacyDriver)
    const legacyRepo = new ConversationVaultRepository(legacyDriver) // sem dataKey => grava plaintext

    await legacyRepo.createSession({
      id: sessionId,
      title: CANARY_TITLE,
      session_type: 'aula',
      total_duration_ms: 60000,
      retention_days: 30
    })

    await legacyRepo.insertTurns([
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

    legacyDriver.close()

    // Controle positivo: os canários DEVEM aparecer nos bytes físicos do arquivo antes da migração
    const rawLegacyBytes = fs.readFileSync(testDbPath)
    expect(rawLegacyBytes.includes(Buffer.from(CANARY_NAME, 'utf8'))).toBe(true)
    expect(rawLegacyBytes.includes(Buffer.from(CANARY_TEXT, 'utf8'))).toBe(true)
    expect(rawLegacyBytes.includes(Buffer.from(CANARY_TITLE, 'utf8'))).toBe(true)

    // b) MIGRAÇÃO E REABERTURA CIFRADA
    const securedDriver = new NodeSqliteDriver(testDbPath)
    const securedRepo = new ConversationVaultRepository(securedDriver, dataKey)
    const report = await securedRepo.migrateLegacyPlaintextToEncrypted()
    expect(report.sessionsMigrated).toBe(1)
    expect(report.turnsMigrated).toBe(1)

    // Salva rótulo de usuário cifrado
    await securedRepo.saveUserTurnLabel({
      sessionId,
      turnId: 'turn_canary_1',
      userLabel: CANARY_LABEL
    })

    securedDriver.close()

    // b) e d) Varredura rigorosa de arquivos físicos (-wal, -journal, -shm) em UTF-8 e UTF-16LE
    const candidateFiles = [
      testDbPath,
      testDbPath + '-wal',
      testDbPath + '-journal',
      testDbPath + '-shm'
    ]

    const existingFiles: string[] = []
    const canaries = [CANARY_NAME, CANARY_TEXT, CANARY_TITLE, CANARY_LABEL]

    for (const f of candidateFiles) {
      if (fs.existsSync(f)) {
        existingFiles.push(path.basename(f))
        const bytes = fs.readFileSync(f)

        for (const canary of canaries) {
          // Varredura UTF-8
          expect(bytes.includes(Buffer.from(canary, 'utf8'))).toBe(false)
          // Varredura UTF-16LE
          expect(bytes.includes(Buffer.from(canary, 'utf16le'))).toBe(false)
        }
      }
    }

    // Asserção explícita de quais arquivos existem em disco
    expect(existingFiles.length).toBeGreaterThanOrEqual(1)
    expect(existingFiles).toContain(path.basename(testDbPath))

    // c) PÓS-DELETE: apagar sessão executa VACUUM e varre novamente
    const deleteDriver = new NodeSqliteDriver(testDbPath)
    await executeConversationMethod('conversation.delete', { sessionId }, deleteDriver, dataKey)
    deleteDriver.close()

    for (const f of candidateFiles) {
      if (fs.existsSync(f)) {
        const bytes = fs.readFileSync(f)
        for (const canary of canaries) {
          expect(bytes.includes(Buffer.from(canary, 'utf8'))).toBe(false)
          expect(bytes.includes(Buffer.from(canary, 'utf16le'))).toBe(false)
        }
      }
    }
  })

  it('A4. deleteSession: falha do VACUUM propaga para o chamador com erro em português', async () => {
    const mockDriver: any = {
      isOpen: () => true,
      db: {},
      execute: async (sql: string) => {
        if (sql === 'VACUUM') {
          throw new Error('database is locked (VACUUM failed simulation)')
        }
      },
      query: async () => [],
      queryOne: async () => null,
      transaction: async (fn: any) => fn(mockDriver)
    }
    const repo = new ConversationVaultRepository(mockDriver, dataKey)
    await expect(repo.deleteSession('sess_err')).rejects.toThrow('database is locked (VACUUM failed simulation)')

    await expect(
      executeConversationMethod('conversation.delete', { sessionId: 'sess_err' }, mockDriver, dataKey)
    ).rejects.toThrow('Falha ao compactar e expurgar fisicamente o cofre (VACUUM): database is locked')
  })

  it('1.d isolado: Apagar sessão executa VACUUM e remove registros fisicamente do cofre', async () => {
    const driver = new NodeSqliteDriver(testDbPath)
    await initConversationVault(driver)
    const repo = new ConversationVaultRepository(driver, dataKey)

    await repo.createSession({
      id: 'sess_del',
      title: 'Sessão Deletável',
      session_type: 'aula',
      total_duration_ms: 10000
    })
    await repo.insertTurns([
      { id: 't_del', session_id: 'sess_del', speaker_label: 'spk', role: 'professor', start_ms: 0, end_ms: 1000, text: 'Texto', turn_index: 0 }
    ])

    await repo.deleteSession('sess_del')
    expect(await repo.listSessions()).toHaveLength(0)
    expect(await repo.getTurnsBySession('sess_del')).toHaveLength(0)
    driver.close()
  })

  it('1.a isolado: Reabertura com dataKey restaura campos cifrados (speakerMap, turns, title)', async () => {
    const driver = new NodeSqliteDriver(testDbPath)
    await initConversationVault(driver)
    const repo = new ConversationVaultRepository(driver, dataKey)

    await repo.createSession({
      id: 's_dec',
      title: 'Título Cifrado 123',
      session_type: 'aula',
      total_duration_ms: 5000
    })
    await repo.insertTurns([
      { id: 't_dec', session_id: 's_dec', speaker_label: 'Aluno João', role: 'aluno', start_ms: 0, end_ms: 1000, text: 'Pergunta secreta', turn_index: 0 }
    ])
    await repo.upsertSpeakerMap([
      { id: 'sm_1', session_id: 's_dec', speaker_label: 'Aluno João', assigned_name: 'Nome Real João', role: 'aluno', source: 'manual', confidence: 1.0 }
    ])
    driver.close()

    const readerDriver = new NodeSqliteDriver(testDbPath)
    const readerRepo = new ConversationVaultRepository(readerDriver, dataKey)
    const sessions = await readerRepo.listSessions()
    expect(sessions[0].title).toBe('Título Cifrado 123')
    const turns = await readerRepo.getTurnsBySession('s_dec')
    expect(turns[0].text).toBe('Pergunta secreta')
    expect(turns[0].speaker_label).toBe('Aluno João')
    const sm = await readerRepo.getSpeakerMap('s_dec')
    expect(sm[0].assigned_name).toBe('Nome Real João')
    readerDriver.close()
  })
})
