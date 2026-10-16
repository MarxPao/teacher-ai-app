import { describe, it, expect, beforeEach } from 'vitest'
// @ts-ignore
import { DatabaseSync } from 'node:sqlite'
import * as crypto from 'node:crypto'
import type { SqlDriver } from '../lib/desktop-core/db/SqlDriver'
import { LlmGateway } from '../desktop/llm/llmGateway'
import {
  encryptEnvelope,
  decryptEnvelope,
  generateDataKey,
  createEncryptedBackup,
  restoreEncryptedBackup,
  MigrationRunner,
  INITIAL_SCHEMA_SQL,
  SqlStudentRepository,
  SqlPrivateStudentRepository,
  SqlSkillGraphRepository,
  SqlAuditRepository,
  SqlConsentRepository,
  SqlSettingsRepository,
  ExportService,
  ErasureService,
  FixedClock,
  DesktopCoreError,
  ProtocolRequestSchema,
  MethodParamSchemas,
  MAX_MESSAGE_BYTES,
  EXTENSION_ALLOWED_METHODS,
  migrateLocalStorageToDesktop,
  Pseudonymizer,
} from '../lib/desktop-core'
import type { SkillGraphV2 } from '../lib/contracts/skillgraph'
import type { AuditEntry } from '../lib/contracts/audit'

class TestSqliteDriver implements SqlDriver {
  public db: DatabaseSync

  constructor() {
    this.db = new DatabaseSync(':memory:')
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    const stmt = this.db.prepare(sql)
    stmt.run(...(params as any[]))
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql)
    return stmt.all(...(params as any[])) as T[]
  }

  async queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
    const stmt = this.db.prepare(sql)
    const row = stmt.get(...(params as any[]))
    return (row as T) || null
  }

  async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
    this.db.exec('BEGIN TRANSACTION')
    try {
      const res = await fn(this)
      this.db.exec('COMMIT')
      return res
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  close(): void {
    this.db.close()
  }
}

describe('Desktop Core — Teste de Fronteira (Fase 6)', () => {
  let driver: TestSqliteDriver
  let dataKey: Buffer
  let clock: FixedClock

  beforeEach(async () => {
    driver = new TestSqliteDriver()
    dataKey = generateDataKey()
    clock = new FixedClock(1700000000000) // 2023-11-14T22:13:20.000Z

    // Executa migração inicial
    const runner = new MigrationRunner(driver, clock)
    await runner.run()
  })

  // 1. Envelope Criptográfico
  describe('1. Envelope Criptográfico', () => {
    it('deve cifrar e decifrar com sucesso mantendo integridade', () => {
      const original = 'Zeca Canário'
      const envelope = encryptEnvelope(original, dataKey)
      expect(envelope).toMatch(/^enc:v1:/)

      const decrypted = decryptEnvelope(envelope, dataKey)
      expect(decrypted).toBe(original)
    })

    it('deve detectar adulteração de dados ou tag e lançar E_CRYPTO_TAMPERED', () => {
      const envelope = encryptEnvelope('Mariana Lima', dataKey)
      // Altera o último caractere do base64
      const tampered = envelope.slice(0, -2) + (envelope.endsWith('A') ? 'B' : 'A') + '='

      expect(() => decryptEnvelope(tampered, dataKey)).toThrowError(DesktopCoreError)
      try {
        decryptEnvelope(tampered, dataKey)
      } catch (err: any) {
        expect(err.code).toBe('E_CRYPTO_TAMPERED')
      }
    })

    it('deve gerar nonces únicos a cada cifra do mesmo texto plano', () => {
      const text = 'Texto Canário Repetido'
      const env1 = encryptEnvelope(text, dataKey)
      const env2 = encryptEnvelope(text, dataKey)

      expect(env1).not.toBe(env2)
      expect(decryptEnvelope(env1, dataKey)).toBe(text)
      expect(decryptEnvelope(env2, dataKey)).toBe(text)
    })
  })

  // 2. Backup e Restauração Cifrada
  describe('2. Backup Cifrado', () => {
    it('deve criar backup e restaurar com a senha correta', async () => {
      const payload = JSON.stringify({ alunos: ['Zeca Canário', 'Rafaela ELT'] })
      const passphrase = 'SenhaForte123!'

      const backupBuf = await createEncryptedBackup(payload, passphrase)
      expect(backupBuf.subarray(0, 4).toString('utf8')).toBe('TABK')

      const restored = await restoreEncryptedBackup(backupBuf, passphrase)
      expect(restored).toBe(payload)
    })

    it('deve rejeitar senha incorreta com E_BACKUP_BAD_PASSPHRASE', async () => {
      const backupBuf = await createEncryptedBackup('dados secretos', 'SenhaCerta123')

      await expect(
        restoreEncryptedBackup(backupBuf, 'SenhaErrada999')
      ).rejects.toThrowError(DesktopCoreError)

      try {
        await restoreEncryptedBackup(backupBuf, 'SenhaErrada999')
      } catch (err: any) {
        expect(err.code).toBe('E_BACKUP_BAD_PASSPHRASE')
      }
    })
  })

  // 3. Migrações e Idempotência
  describe('3. Migrações', () => {
    it('deve ser idempotente (segunda execução aplica 0 migrações)', async () => {
      const runner = new MigrationRunner(driver, clock)
      const res = await runner.run()
      expect(res.applied).toBe(0)
    })

    it('deve recusar migração com checksum divergente com E_MIGRATION_FAILED', async () => {
      const tamperedRunner = new MigrationRunner(driver, clock, [
        {
          version: 1,
          name: '001_initial_schema',
          sql: INITIAL_SCHEMA_SQL + '\n-- Adulteracao',
        },
      ])

      await expect(tamperedRunner.run()).rejects.toThrowError(DesktopCoreError)
      try {
        await tamperedRunner.run()
      } catch (err: any) {
        expect(err.code).toBe('E_MIGRATION_FAILED')
      }
    })
  })

  // 4. SkillGraphs e Imutabilidade
  describe('4. SkillGraphs Imutáveis', () => {
    const dummyGraph: SkillGraphV2 = {
      spec_version: '2.0',
      identity: {
        portal_id: 'portal_teste',
        domain: 'teste.escola.com.br',
        task_id: 'lancar_falta',
        version: 1,
        name: 'Lançar Falta Teste',
        description: 'Automação de teste',
      },
      compat: {
        support_tier: 1,
        archetype_tags: ['standard_table'],
        tested_archetypes: ['standard_table'],
        min_runner_version: '2.0.0',
      },
      entry_point: {
        url_pattern: 'https://teste.escola.com.br/frequencia',
        navigation_flow: [],
      },
      safety: {
        allowed_hosts: ['teste.escola.com.br'],
        max_writes: 50,
        checkpoint_mode: 'before_write',
        dry_run_supported: true,
      },
      variables: {},
      constants: {},
      flow: {
        start_node: 'n1',
        nodes: {
          n1: {
            id: 'n1',
            type: 'WAIT',
            label: 'Espera tabela',
            anchor: {
              kind: 'role_name',
              role: 'table',
              name: 'Frequência',
            },
            on_success: 'end',
            on_fail: 'end',
          },
        },
      },
    }

    it('save nunca sobrescreve e incrementa versão automaticamente', async () => {
      const repo = new SqlSkillGraphRepository(driver, clock)

      const saved1 = await repo.save(dummyGraph)
      expect(saved1.identity.version).toBe(1)

      const saved2 = await repo.save(dummyGraph)
      expect(saved2.identity.version).toBe(2)

      const versions = await repo.listVersions('portal_teste', 'lancar_falta')
      expect(versions).toHaveLength(2)
      expect(versions.map((v) => v.version)).toEqual([1, 2])
    })

    it('setActive alterna a versão ativa e get retorna a ativa', async () => {
      const repo = new SqlSkillGraphRepository(driver, clock)
      await repo.save(dummyGraph) // v1 (ativa por ser a primeira)
      await repo.save(dummyGraph) // v2

      let current = await repo.get('portal_teste', 'lancar_falta')
      expect(current?.identity.version).toBe(1)

      await repo.setActive('portal_teste', 'lancar_falta', 2)
      current = await repo.get('portal_teste', 'lancar_falta')
      expect(current?.identity.version).toBe(2)
    })
  })

  // 5. Repositórios de Alunos e Isolamento
  describe('5. Repositórios de Alunos e Isolamento', () => {
    it('deve gravar e ler alunos canônicos com campos sensíveis cifrados no banco', async () => {
      const repo = new SqlStudentRepository(driver, dataKey, clock)
      await driver.execute("INSERT INTO schools (id, name, created_at) VALUES ('sch1', 'Escola Modelo', '2023-01-01')")
      await driver.execute("INSERT INTO classes (id, school_id, name, created_at) VALUES ('cls1', 'sch1', '3A', '2023-01-01')")

      await repo.upsertStudentsFromPortal(
        'cls1',
        [{ name: 'Zeca Canário', portal_id: '1001', email: 'zeca@escola.com' }],
        { portalId: 'portal_1', readAt: clock.toISOString() }
      )

      // Verificação em repouso: no banco bruto, o nome deve estar cifrado
      const rawRow = await driver.queryOne<{ name_encrypted: string }>(
        'SELECT name_encrypted FROM students WHERE portal_id = ?',
        ['1001']
      )
      expect(rawRow?.name_encrypted).toMatch(/^enc:v1:/)
      expect(rawRow?.name_encrypted).not.toContain('Zeca Canário')

      // Verificação na interface: retorna decifrado
      const students = await repo.listStudents({ classId: 'cls1' })
      expect(students).toHaveLength(1)
      expect(students[0].name).toBe('Zeca Canário')
      expect(students[0].email).toBe('zeca@escola.com')
    })

    it('deve isolar alunos particulares de turmas regulares', async () => {
      const privateRepo = new SqlPrivateStudentRepository(driver, dataKey, clock)
      const studentRepo = new SqlStudentRepository(driver, dataKey, clock)

      await privateRepo.savePrivateStudent({
        name: 'Aluno Particular Canário',
        subject: 'Inglês',
        monthlyFee: 350,
        status: 'active',
        guardians: [{ name: 'Responsável Canário', relationship: 'Mãe', phone: '11999999999' }],
      })

      const privates = await privateRepo.listPrivateStudents()
      expect(privates).toHaveLength(1)
      expect(privates[0].name).toBe('Aluno Particular Canário')
      expect(privates[0].monthlyFee).toBe(350)
      expect(privates[0].guardians?.[0].name).toBe('Responsável Canário')

      // Não vaza para os alunos regulares
      const regulars = await studentRepo.listStudents()
      expect(regulars).toHaveLength(0)
    })
  })

  // 6. Auditoria com Ack e Purga por Retenção
  describe('6. Auditoria Write-Ahead', () => {
    it('deve gravar auditoria cifrada com confirmação e purgar por retenção', async () => {
      const auditRepo = new SqlAuditRepository(driver, dataKey, clock)

      const entry: AuditEntry = {
        run_id: 'run_101',
        graph: { portal_id: 'p1', task_id: 'lancar_falta', version: 1 },
        node_id: 'n_write_1',
        action: 'write',
        status: 'success',
        target_ref: 'Aluno Canário',
        before_value: 'P',
        after_value: 'F',
        verified_by: 'read_back',
        at: new Date(clock.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // 100 dias atrás
      }

      const ackId = await auditRepo.append(entry)
      expect(ackId).toBeGreaterThan(0)

      // Adiciona entrada recente (hoje)
      const entryRecent: AuditEntry = {
        ...entry,
        run_id: 'run_102',
        at: clock.toISOString(),
      }
      await auditRepo.append(entryRecent)

      // Purga com retenção de 90 dias
      const purgedCount = await auditRepo.purgeOlderThan(90)
      expect(purgedCount).toBe(1)

      const remaining = await auditRepo.query()
      expect(remaining).toHaveLength(1)
      expect(remaining[0].run_id).toBe('run_102')
      expect(remaining[0].before_value).toBe('P')
      expect(remaining[0].after_value).toBe('F')
    })
  })

  // 7. Exportação LGPD
  describe('7. Exportação LGPD (Art. 18)', () => {
    it('deve exportar todos os dados de um aluno e nada de outro', async () => {
      const repo = new SqlStudentRepository(driver, dataKey, clock)
      const exportService = new ExportService(repo)

      await driver.execute("INSERT INTO schools (id, name, created_at) VALUES ('sch1', 'Escola', '2023-01-01')")
      await driver.execute("INSERT INTO classes (id, school_id, name, created_at) VALUES ('cls1', 'sch1', '3A', '2023-01-01')")

      const [alunoA, alunoB] = await repo.upsertStudentsFromPortal(
        'cls1',
        [{ name: 'Zeca Canário', portal_id: '1' }, { name: 'Outro Aluno', portal_id: '2' }],
        { portalId: 'p1', readAt: clock.toISOString() }
      )

      await repo.recordGrade({
        studentId: alunoA.id,
        classId: 'cls1',
        subject: 'Matemática',
        term: '1_bim',
        score: 9.5,
      })

      const exported = await exportService.exportStudent(alunoA.id)
      expect(exported.json).toContain('Zeca Canário')
      expect(exported.json).not.toContain('Outro Aluno')
      expect(exported.csv).toContain('Matemática')
      expect(exported.csv).toContain('9.5')
    })
  })

  // 8. Apagamento Seguro e Verificação de Não-Vazamento
  describe('8. Apagamento Seguro LGPD', () => {
    it('deve remover aluno, anonimizar auditoria e registrar erasure_log sem PII', async () => {
      const studentRepo = new SqlStudentRepository(driver, dataKey, clock)
      const auditRepo = new SqlAuditRepository(driver, dataKey, clock)
      const erasureService = new ErasureService(driver, clock)

      await driver.execute("INSERT INTO schools (id, name, created_at) VALUES ('sch1', 'Escola', '2023-01-01')")
      await driver.execute("INSERT INTO classes (id, school_id, name, created_at) VALUES ('cls1', 'sch1', '3A', '2023-01-01')")

      const [aluno] = await studentRepo.upsertStudentsFromPortal(
        'cls1',
        [{ name: 'Zeca Canário', portal_id: '1' }],
        { portalId: 'p1', readAt: clock.toISOString() }
      )

      await auditRepo.append({
        run_id: 'run_1',
        graph: { portal_id: 'p1', task_id: 't1', version: 1 },
        node_id: 'n1',
        action: 'write',
        status: 'success',
        target_ref: `Registro do aluno ${aluno.id}`,
        before_value: 'P',
        after_value: 'F',
        verified_by: 'none',
        at: clock.toISOString(),
      })

      const report = await erasureService.eraseStudent(aluno.id)
      expect(report.recordsPurged).toBeGreaterThan(0)
      expect(report.auditEntriesAnonymized).toBe(1)

      // Aluno removido
      const found = await studentRepo.getStudent(aluno.id)
      expect(found).toBeNull()

      // Auditoria anonimizada
      const audits = await auditRepo.query({ runId: 'run_1' })
      expect(audits[0].target_ref).toBe('[ALUNO_EXPURGADO]')
      expect(audits[0].before_value).toBeUndefined()

      // erasure_log não contém o nome nem o ID cru
      const erasureLog = await driver.queryOne<{ student_id_hash: string }>(
        'SELECT student_id_hash FROM erasure_log'
      )
      expect(erasureLog?.student_id_hash).not.toContain('Zeca')
      expect(erasureLog?.student_id_hash).not.toContain(aluno.id)
      expect(erasureLog?.student_id_hash).toHaveLength(64) // SHA-256
    })
  })

  // 9. Protocolo e Schemas Estritos
  describe('9. Protocolo e Validação Estrita', () => {
    it('deve validar requisições e rejeitar campos extras (.strict())', () => {
      const validReq = {
        v: 1,
        id: 'req_1',
        method: 'students.list',
        params: { classId: 'cls1' },
      }
      expect(ProtocolRequestSchema.safeParse(validReq).success).toBe(true)

      const invalidExtra = {
        ...validReq,
        campoInvasor: 'tentativa',
      }
      expect(ProtocolRequestSchema.safeParse(invalidExtra).success).toBe(false)
    })

    it('deve rejeitar versão de protocolo incompatível', () => {
      const badVersion = {
        v: 2,
        id: 'req_1',
        method: 'app.status',
        params: {},
      }
      expect(ProtocolRequestSchema.safeParse(badVersion).success).toBe(false)
    })

    it('deve validar métodos autorizados para extensão', () => {
      expect(EXTENSION_ALLOWED_METHODS).toContain('audit.append')
      expect(EXTENSION_ALLOWED_METHODS).not.toContain('data.eraseStudent')
    })

    it('deve validar limites máximos de mensagem (1 MB)', () => {
      const payloadTamanho = MAX_MESSAGE_BYTES
      expect(payloadTamanho).toBe(1048576)
    })
  })

  // 10. Consentimentos e Configurações
  describe('10. Consentimentos e Configurações', () => {
    it('deve persistir e consultar consentimentos por provedor', async () => {
      const consentRepo = new SqlConsentRepository(driver, clock)
      const settingsRepo = new SqlSettingsRepository(driver, clock)

      expect(await consentRepo.getConsent('openai')).toBe(false)
      await consentRepo.setConsent('openai', true, 'correcao_redacoes')
      expect(await consentRepo.getConsent('openai')).toBe(true)

      await settingsRepo.set('theme', { mode: 'dark' })
      const theme = await settingsRepo.get<{ mode: string }>('theme')
      expect(theme?.mode).toBe('dark')
    })
  })

  // 11. Migração Segura de localStorage
  describe('11. Migração Segura de localStorage', () => {
    it('deve migrar segredos para o cofre e discentes para o SQLite, expurgando as chaves sensíveis', async () => {
      const storageMap = new Map<string, string>()
      storageMap.set('teacher_apis', JSON.stringify({ openai: 'sk-test-123', anthropic: 'sk-ant-456' }))
      storageMap.set('teacher_byok_key', 'sk-single-789')
      storageMap.set('teacher_students', JSON.stringify([{ id: 'st1', name: 'Zeca' }]))
      storageMap.set('teacher_theme', 'dark')

      const fakeStorage = {
        getItem: (k: string) => storageMap.get(k) ?? null,
        setItem: (k: string, v: string) => { storageMap.set(k, v) },
        removeItem: (k: string) => { storageMap.delete(k) },
      }

      const invokedCalls: Array<{ method: string; params: any }> = []
      const fakeBridge = {
        invoke: async (method: string, params?: any) => {
          invokedCalls.push({ method, params })
          return { ok: true }
        },
      }

      const report = await migrateLocalStorageToDesktop(fakeBridge, fakeStorage)
      expect(report.alreadyMigrated).toBe(false)
      expect(report.secretsMigrated).toBe(3)
      expect(report.studentsMigrated).toBe(1)
      expect(report.keysPurged).toContain('teacher_apis')
      expect(report.keysPurged).toContain('teacher_students')

      // Chaves sensíveis foram apagadas
      expect(fakeStorage.getItem('teacher_apis')).toBeNull()
      expect(fakeStorage.getItem('teacher_students')).toBeNull()
      // Chaves não sensíveis permanecem
      expect(fakeStorage.getItem('teacher_theme')).toBe('dark')
      expect(fakeStorage.getItem('teacher_migrated_to_desktop_v1')).toBe('done')

      // Segunda execução idempotente
      const rerun = await migrateLocalStorageToDesktop(fakeBridge, fakeStorage)
      expect(rerun.alreadyMigrated).toBe(true)
    })
  })

  // 12. Pseudonimizador LGPD
  describe('12. Pseudonimizador LGPD', () => {
    it('deve substituir nomes, CPFs e e-mails por tokens reversíveis e restaurar perfeitamente', () => {
      const known = [
        { name: 'Mariana Lima', identifier: 'MAT-101' },
        { name: 'Zeca Canário', identifier: 'MAT-102' },
      ]
      const originalText = 'Lançar 2 faltas para Mariana Lima (CPF 123.456.789-00, email mariana@escola.com) e nota 9.5 para Zeca Canário.'

      const session = Pseudonymizer.pseudonymize(originalText, known)

      expect(session.sanitizedText).not.toContain('Mariana Lima')
      expect(session.sanitizedText).not.toContain('Zeca Canário')
      expect(session.sanitizedText).not.toContain('123.456.789-00')
      expect(session.sanitizedText).not.toContain('mariana@escola.com')
      expect(session.sanitizedText).toContain('ALUNO_1')
      expect(session.sanitizedText).toContain('ALUNO_2')
      expect(session.sanitizedText).toContain('CPF_1')
      expect(session.sanitizedText).toContain('EMAIL_1')

      const restored = Pseudonymizer.depseudonymize(session.sanitizedText, session.tokenToOriginal)
      expect(restored).toBe(originalText)
    })
  })

  // 13. Habilidades Genéricas e Roteamento de Catálogo (G5)
  describe('13. Habilidades Genéricas e Roteamento de Catálogo (G5)', () => {
    it('(1) menu/parse não contém id literal fora do catálogo', async () => {
      const gateway = new LlmGateway({ consentRepo: {} as any, vault: {} as any })
      const catalog = [
        { id: 'custom:registrar-chamada', name: 'Registrar Chamada', params: [{ name: 'attendance_status', type: 'string' }] },
        { id: 'custom:comunicado', name: 'Enviar Comunicado', params: [{ name: 'texto', type: 'string' }] },
      ]
      const res = await gateway.parseIntent('marcar falta para o aluno', [], catalog)
      expect(res.no_match).toBe(false)
      expect(catalog.some((s) => s.id === res.skill_id)).toBe(true)
      expect(['read_roster', 'lancar_falta', 'lancar_nota']).not.toContain(res.skill_id)
    })

    it('(2) skill_id fora do catálogo -> no_match', async () => {
      const gateway = new LlmGateway({ consentRepo: {} as any, vault: {} as any })
      const catalog = [
        { id: 'custom:registrar-chamada', name: 'Registrar Chamada' },
      ]
      const res = await gateway.parseIntent('lançar nota 9.5 em matemática', [], catalog)
      expect(res.no_match).toBe(true)
      expect(res.skill_id).toBeUndefined()
    })

    it('(4) texto gerado com CPF é barrado antes do CHECKPOINT', async () => {
      const gateway = new LlmGateway({ consentRepo: {} as any, vault: {} as any })
      await expect(
        gateway.generateSafeText('Plano de aula com CPF do orientador: 123.456.789-00')
      ).rejects.toThrowError(/CPF/)
    })

    it('(5) suporta params em Record<string, GraphParam>, autocorreção de nota, data relativa e bloqueio de negação', async () => {
      const gateway = new LlmGateway({ consentRepo: {} as any, vault: {} as any })
      const catalog = [
        {
          id: 'lancar_nota',
          name: 'Lançar Nota',
          params: {
            student_ref: { type: 'string', required: true },
            grade_value: { type: 'number', required: true },
            data: { type: 'date', required: false },
          },
        },
      ]
      const resCorrected = await gateway.parseIntent(
        'Lançar nota 6,0 para Mariana Lima de ontem, na verdade 7,5',
        [{ name: 'Mariana Lima' }],
        catalog
      )
      expect(resCorrected.no_match).toBe(false)
      expect(resCorrected.skill_id).toBe('lancar_nota')
      expect(resCorrected.params.student_ref).toBe('Mariana Lima')
      expect(resCorrected.params.grade_value).toBe(7.5)
      expect(resCorrected.params.data).toMatch(/^\d{4}-\d{2}-\d{2}$/)

      const resNegated = await gateway.parseIntent(
        'Não lance nota 7,5 para Mariana Lima',
        [{ name: 'Mariana Lima' }],
        catalog
      )
      expect(resNegated.no_match).toBe(true)

      const resException = await gateway.parseIntent(
        'Lançar presença para todos menos o João',
        [{ name: 'João' }],
        catalog
      )
      expect(resException.no_match).toBe(true)
      expect(resException.clarification_needed).toBe(true)
      expect(resException.params.student_ref).toBeUndefined()
    })
  })
})

