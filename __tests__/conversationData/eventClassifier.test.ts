import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type { SqlDriver } from '../../lib/desktop-core/db/SqlDriver'
import { initConversationVault, ConversationVaultRepository } from '../../lib/conversationData/schema'
import { importConversationJson } from '../../lib/conversationData/importer'
import { fixtureAula50Min, fixtureAulaSobreposicaoDesconhecido } from '../../lib/conversationData/fixtures'
import { classifySessionEvents, evaluateClassifierMetrics } from '../../lib/conversationData/eventClassifier'
import {
  DEFINITION_PERGUNTA,
  DEFINITION_PERGUNTA_ABERTA,
  DEFINITION_PERGUNTA_FECHADA,
  DEFINITION_INTERVENCAO,
  DEFINITION_WAIT_TIME
} from '../../lib/conversationData/definitions'

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

describe('2.3 Classificador de Eventos Estruturados (Regras Determinísticas + LLM Local)', () => {
  let driver: SqlDriver
  let repo: ConversationVaultRepository

  beforeEach(async () => {
    driver = new InMemorySqlDriver()
    await initConversationVault(driver)
    repo = new ConversationVaultRepository(driver)
  })

  it('expõe constantes nomeadas com aviso [DEFINIÇÃO A VALIDAR (dono)]', () => {
    expect(DEFINITION_PERGUNTA).toContain('[DEFINIÇÃO A VALIDAR (dono)]')
    expect(DEFINITION_PERGUNTA_ABERTA).toContain('[DEFINIÇÃO A VALIDAR (dono)]')
    expect(DEFINITION_PERGUNTA_FECHADA).toContain('[DEFINIÇÃO A VALIDAR (dono)]')
    expect(DEFINITION_INTERVENCAO).toContain('[DEFINIÇÃO A VALIDAR (dono)]')
    expect(DEFINITION_WAIT_TIME).toContain('[DEFINIÇÃO A VALIDAR (dono)]')
  })

  it('classifica eventos na fixture de 50 min extraindo trechos exatos de evidência', async () => {
    await importConversationJson(repo, fixtureAula50Min)
    const events = await classifySessionEvents(repo, 'aula_50min_bio')

    expect(events.length).toBeGreaterThan(0)

    // Pergunta aberta da professora Helena
    const openQuestion = events.find(e => e.type === 'pergunta' && e.subtype === 'aberta')
    expect(openQuestion).toBeDefined()
    expect(openQuestion?.evidence_span).toContain('como vocês explicariam o impacto na pirâmide ecológica')

    // Pergunta fechada da professora
    const closedQuestion = events.find(e => e.type === 'pergunta' && e.subtype === 'fechada')
    expect(closedQuestion).toBeDefined()
    expect(closedQuestion?.evidence_span).toContain('as plantas são consideradas autótrofas')

    // Pergunta do aluno Carlos
    const studentQuestion = events.find(e => e.type === 'pergunta' && e.subtype === 'aluno')
    expect(studentQuestion).toBeDefined()
    expect(studentQuestion?.evidence_span).toContain('o fluxo de energia sempre diminui')

    // Monólogo contínuo da professora (90s em start_ms: 265000)
    const monologues = events.filter(e => e.type === 'monologo')
    expect(monologues.length).toBeGreaterThan(0)
    expect(monologues.some(m => m.start_ms === 265000)).toBe(true)

    // Wait-time após pergunta aberta (6.5s)
    const waitTime = events.find(e => e.type === 'wait_time')
    expect(waitTime).toBeDefined()
    expect(waitTime?.start_ms).toBe(137000)
    expect(waitTime?.end_ms).toBe(143500)
  })

  it('detecta dúvida sem resposta e sobreposição na fixture 3', async () => {
    await importConversationJson(repo, fixtureAulaSobreposicaoDesconhecido)
    const events = await classifySessionEvents(repo, 'aula_sobreposicao_unk')

    const unanswered = events.find(e => e.type === 'duvida_sem_resposta')
    expect(unanswered).toBeDefined()
    expect(unanswered?.evidence_span).toContain('como os seres bentônicos sobrevivem')
  })

  it('mede precisão e recall contra rótulos manuais de referência (Ground Truth)', async () => {
    await importConversationJson(repo, fixtureAula50Min)
    const metrics = await evaluateClassifierMetrics(repo, 'aula_50min_bio')

    expect(metrics.precision).toBeGreaterThanOrEqual(0.85)
    expect(metrics.recall).toBeGreaterThanOrEqual(0.85)
    expect(metrics.f1Score).toBeGreaterThanOrEqual(0.85)
    expect(metrics.totalExpected).toBeGreaterThan(0)
    expect(metrics.totalDetected).toBeGreaterThan(0)
  })
})
