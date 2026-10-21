import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type { SqlDriver } from '../../lib/desktop-core/db/SqlDriver'
import { initConversationVault, ConversationVaultRepository } from '../../lib/conversationData/schema'
import { executeConversationMethod } from '../../lib/conversationData/desktopIpc'
import { wilsonScoreInterval, calculateLabelMetrics } from '../../lib/conversationData/labelingEvaluation'

class InMemorySqlDriver implements SqlDriver {
  private db: DatabaseSync
  constructor() { this.db = new DatabaseSync(':memory:') }
  async execute(sql: string, params: unknown[] = []): Promise<void> { this.db.prepare(sql).run(...(params as any[])) }
  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> { return this.db.prepare(sql).all(...(params as any[])) as T[] }
  async queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> { return (this.db.prepare(sql).get(...(params as any[])) as T) || null }
  async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
    this.db.exec('BEGIN TRANSACTION')
    try { const res = await fn(this); this.db.exec('COMMIT'); return res } catch (e) { this.db.exec('ROLLBACK'); throw e }
  }
}

describe('T3: Rotulagem Local da Professora, Intervalo de Wilson e Avaliação Estatística', () => {
  let driver: SqlDriver

  beforeEach(async () => {
    driver = new InMemorySqlDriver()
    await initConversationVault(driver)
  })

  describe('1. Função Pura do Intervalo de Confiança de Wilson (95%)', () => {
    it('retorna [0, 1] quando total é 0', () => {
      const interval = wilsonScoreInterval(0, 0)
      expect(interval).toEqual({ lower: 0, upper: 1 })
    })

    it('calcula limites válidos e matematicamente consistentes para proporções arbitrárias', () => {
      // 10 sucessos em 20 tentativas (p = 0.5)
      const res = wilsonScoreInterval(10, 20)
      expect(res.lower).toBeGreaterThan(0.25)
      expect(res.lower).toBeLessThan(0.5)
      expect(res.upper).toBeGreaterThan(0.5)
      expect(res.upper).toBeLessThan(0.75)
    })

    it('trata casos extremos (0 sucessos e 100% sucessos) mantendo limites entre 0 e 1', () => {
      const zeroSucc = wilsonScoreInterval(0, 40)
      expect(zeroSucc.lower).toBe(0)
      expect(zeroSucc.upper).toBeGreaterThan(0)
      expect(zeroSucc.upper).toBeLessThan(0.15)

      const allSucc = wilsonScoreInterval(40, 40)
      expect(allSucc.lower).toBeGreaterThan(0.85)
      expect(allSucc.upper).toBe(1)
    })
  })

  describe('2. calculateLabelMetrics: Filtragem, Matriz de Confusão e Aviso de Amostra', () => {
    it('ignora turnos com rótulo "pular" e turnos sem anotação do cálculo de n', () => {
      const turns = [
        { id: 't1' },
        { id: 't2' },
        { id: 't3' },
        { id: 't4' },
      ]
      const questionTurns = new Set(['t1', 't2'])
      const labels = [
        { turn_id: 't1', user_label: 'pergunta' },      // TP
        { turn_id: 't2', user_label: 'pular' },         // IGNORADO
        { turn_id: 't3', user_label: 'nao_pergunta' },  // TN
        // t4 não tem rótulo                             // IGNORADO
      ]

      const metrics = calculateLabelMetrics(turns, questionTurns, labels)
      expect(metrics.evaluatedCount).toBe(2)
      expect(metrics.tp).toBe(1)
      expect(metrics.fp).toBe(0)
      expect(metrics.tn).toBe(1)
      expect(metrics.fn).toBe(0)
      expect(metrics.precision).toBe(1)
      expect(metrics.recall).toBe(1)
      expect(metrics.accuracy).toBe(1)
    })

    it('emite aviso explícito para n < 100 com o formato exato', () => {
      const turns = [{ id: 't1' }, { id: 't2' }]
      const questionTurns = new Set(['t1'])
      const labels = [
        { turn_id: 't1', user_label: 'pergunta' },
        { turn_id: 't2', user_label: 'nao_pergunta' },
      ]

      const metrics = calculateLabelMetrics(turns, questionTurns, labels)
      expect(metrics.evaluatedCount).toBe(2)
      expect(metrics.insufficientSampleWarning).toBe(true)
      expect(metrics.warningMessage).toBe('Amostra insuficiente para conclusão estatística (n = 2 < 100)')
    })

    it('remove o aviso quando n >= 100 e reporta intervalos de Wilson calculados', () => {
      const turns: Array<{ id: string }> = []
      const questionTurns = new Set<string>()
      const labels: Array<{ turn_id: string; user_label: string }> = []

      for (let i = 0; i < 120; i++) {
        const id = `t_${i}`
        turns.push({ id })
        if (i < 60) {
          questionTurns.add(id)
          labels.push({ turn_id: id, user_label: 'pergunta' }) // 60 TP
        } else {
          labels.push({ turn_id: id, user_label: 'nao_pergunta' }) // 60 TN
        }
      }

      const metrics = calculateLabelMetrics(turns, questionTurns, labels)
      expect(metrics.evaluatedCount).toBe(120)
      expect(metrics.insufficientSampleWarning).toBe(false)
      expect(metrics.warningMessage).toBeNull()
      expect(metrics.precision).toBe(1)
      expect(metrics.recall).toBe(1)
      expect(metrics.precisionWilson.lower).toBeGreaterThan(0.9)
      expect(metrics.precisionWilson.upper).toBe(1)
    })
  })

  describe('3. Persistência no Cofre Local e Fluxo Acumulativo Real (Zero Rede)', () => {
    it('grava e atualiza rótulos no cofre (saveUserTurnLabel) e recupera sem vazamento', async () => {
      const key = Buffer.alloc(32, 0x42)
      const repo = new ConversationVaultRepository(driver, key)

      await repo.createSession({
        id: 'sess_1',
        title: 'Aula de Teste',
        session_type: 'aula',
        total_duration_ms: 10000
      })

      await repo.insertTurns([
        { id: 'turn_1', session_id: 'sess_1', speaker_label: 'Docente', role: 'professor', start_ms: 0, end_ms: 2000, text: 'Quem sabe responder?', turn_index: 0 },
        { id: 'turn_2', session_id: 'sess_1', speaker_label: 'Aluno 1', role: 'aluno', start_ms: 2100, end_ms: 4000, text: 'Eu acho que é mitocôndria', turn_index: 1 }
      ])

      // Salva primeiro rótulo
      await repo.saveUserTurnLabel({ sessionId: 'sess_1', turnId: 'turn_1', userLabel: 'pergunta' })
      let labels = await repo.getUserTurnLabels('sess_1')
      expect(labels).toHaveLength(1)
      expect(labels[0].user_label).toBe('pergunta')

      // Atualiza rótulo existente (idempotência ON CONFLICT)
      await repo.saveUserTurnLabel({ sessionId: 'sess_1', turnId: 'turn_1', userLabel: 'nao_pergunta' })
      labels = await repo.getUserTurnLabels('sess_1')
      expect(labels).toHaveLength(1)
      expect(labels[0].user_label).toBe('nao_pergunta')

      // Adiciona rótulo de outro turno acumulando na sessão
      await repo.saveUserTurnLabel({ sessionId: 'sess_1', turnId: 'turn_2', userLabel: 'pergunta' })
      labels = await repo.getUserTurnLabels('sess_1')
      expect(labels).toHaveLength(2)
    })

    it('benchmark via IPC executa no cofre local, calcula Wilson e acumula múltiplas sessões sem rede', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch')
      const dataKey = Buffer.alloc(32, 0x42)

      // Cria sessão 1
      await executeConversationMethod('conversation.import', {
        content: `00:00:00.000 --> 00:00:02.000\nProfessora: O que e celula?\n\n00:00:03.000 --> 00:00:05.000\nAluno: E a unidade da vida.`,
        format: 'vtt',
        title: 'Sessão 1',
        sessionType: 'aula',
        sessionId: 'sess_ipc_1'
      }, driver, dataKey)

      // Cria sessão 2
      await executeConversationMethod('conversation.import', {
        content: `00:00:00.000 --> 00:00:02.000\nProfessora: Qual e a formula da agua?\n\n00:00:03.000 --> 00:00:05.000\nAluno: E H2O.`,
        format: 'vtt',
        title: 'Sessão 2',
        sessionType: 'aula',
        sessionId: 'sess_ipc_2'
      }, driver, dataKey)

      // Rotula turnos da sessão 1
      const turnsSess1 = await executeConversationMethod('conversation.turns.list', { sessionId: 'sess_ipc_1' }, driver, dataKey)
      const t1 = turnsSess1.turns[0].id
      const t2 = turnsSess1.turns[1].id
      await executeConversationMethod('conversation.labels.save', { sessionId: 'sess_ipc_1', turnId: t1, userLabel: 'pergunta' }, driver, dataKey)
      await executeConversationMethod('conversation.labels.save', { sessionId: 'sess_ipc_1', turnId: t2, userLabel: 'nao_pergunta' }, driver, dataKey)

      // Rotula turnos da sessão 2
      const turnsSess2 = await executeConversationMethod('conversation.turns.list', { sessionId: 'sess_ipc_2' }, driver, dataKey)
      const t3 = turnsSess2.turns[0].id
      const t4 = turnsSess2.turns[1].id
      await executeConversationMethod('conversation.labels.save', { sessionId: 'sess_ipc_2', turnId: t3, userLabel: 'pergunta' }, driver, dataKey)
      await executeConversationMethod('conversation.labels.save', { sessionId: 'sess_ipc_2', turnId: t4, userLabel: 'pular' }, driver, dataKey)

      // Benchmark da sessão 1 isolada
      const bench1 = await executeConversationMethod('conversation.labels.benchmark', { sessionId: 'sess_ipc_1' }, driver, dataKey)
      expect(bench1.success).toBe(true)
      expect(bench1.evaluatedCount).toBe(2)
      expect(bench1.insufficientSampleWarning).toBe(true)
      expect(bench1.warningMessage).toContain('n = 2 < 100')
      expect(bench1.precisionWilson).toBeDefined()
      expect(bench1.recallWilson).toBeDefined()

      // Benchmark acumulado (todas as sessões)
      const benchAll = await executeConversationMethod('conversation.labels.benchmark', { allSessions: true }, driver, dataKey)
      expect(benchAll.success).toBe(true)
      // Sessão 1 contribui com 2 (pergunta, nao_pergunta), Sessão 2 contribui com 1 (pergunta; 'pular' é ignorado)
      expect(benchAll.evaluatedCount).toBe(3)
      expect(benchAll.tp).toBeGreaterThanOrEqual(1)
      expect(benchAll.insufficientSampleWarning).toBe(true)
      expect(benchAll.warningMessage).toContain('n = 3 < 100')

      // Prova cabal: nenhuma chamada de rede foi disparada
      expect(fetchSpy).not.toHaveBeenCalled()
      fetchSpy.mockRestore()
    })
  })
})
