import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type { SqlDriver } from '../../lib/desktop-core/db/SqlDriver'
import { initConversationVault, ConversationVaultRepository } from '../../lib/conversationData/schema'
import { importConversationJson } from '../../lib/conversationData/importer'
import { classifySessionEvents } from '../../lib/conversationData/eventClassifier'
import { fixtureAula50Min, fixtureReuniaoPedagogica, fixtureAulaSobreposicaoDesconhecido } from '../../lib/conversationData/fixtures'
import { generateStructuredSummary } from '../../lib/conversationData/summarizer'

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

describe('2.5 Resumos Estruturados com Horários de Origem e Map-Reduce', () => {
  let driver: SqlDriver
  let repo: ConversationVaultRepository

  beforeEach(async () => {
    driver = new InMemorySqlDriver()
    await initConversationVault(driver)
    repo = new ConversationVaultRepository(driver)
  })

  it('10. Resumo da Aula -> Gera tópicos, dúvidas dos alunos e pendências com horário em CADA item', async () => {
    await importConversationJson(repo, fixtureAula50Min)
    await classifySessionEvents(repo, 'aula_50min_bio')

    const summary = await generateStructuredSummary(repo, 'aula_50min_bio')
    expect(summary.type).toBe('aula')

    if (summary.type === 'aula') {
      // Tópicos com horário
      expect(summary.topics.length).toBeGreaterThan(0)
      summary.topics.forEach(t => {
        expect(t.timeRange).toBeDefined()
        expect(t.startMs).toBeGreaterThanOrEqual(0)
        expect(t.endMs).toBeGreaterThan(t.startMs)
      })

      // Dúvidas de alunos
      expect(summary.studentDoubts.length).toBeGreaterThanOrEqual(2)
      expect(summary.studentDoubts.some(d => d.description.includes('fluxo de energia'))).toBe(true)

      // Pendências e tarefas de casa
      expect(summary.pendingTasks.length).toBeGreaterThan(0)
      expect(summary.pendingTasks[0].description).toContain('exercícios da página 45 a 48')
      expect(summary.pendingTasks[0].timeRange).toBeDefined()
    }
  })

  it('11. Decisões e responsáveis desta reunião -> Extrai ações, prazos e horários de origem', async () => {
    await importConversationJson(repo, fixtureReuniaoPedagogica)
    await classifySessionEvents(repo, 'reuniao_coord_pedag')

    const summary = await generateStructuredSummary(repo, 'reuniao_coord_pedag')
    expect(summary.type).toBe('reuniao')

    if (summary.type === 'reuniao') {
      expect(summary.actionItems.length).toBe(2)

      const marcosAction = summary.actionItems.find(a => a.assignee.includes('Marcos'))
      expect(marcosAction).toBeDefined()
      expect(marcosAction?.task.toLowerCase()).toContain('tabular as notas')
      expect(marcosAction?.deadline?.toLowerCase()).toContain('sexta-feira')
      expect(marcosAction?.timeRange).toBeDefined()

      const helenaAction = summary.actionItems.find(a => a.assignee.includes('Helena'))
      expect(helenaAction).toBeDefined()
      expect(helenaAction?.task).toContain('recuperação paralela')
      expect(helenaAction?.deadline?.toLowerCase()).toContain('segunda-feira')
      expect(helenaAction?.timeRange).toBeDefined()

      expect(summary.decisions.length).toBeGreaterThan(0)
      expect(summary.decisions[0].timeRange).toBeDefined()
    }
  })

  it('Abstenção honesta: quando um tópico não consta na transcrição, o sistema se abstém', async () => {
    await importConversationJson(repo, fixtureAulaSobreposicaoDesconhecido)
    await classifySessionEvents(repo, 'aula_sobreposicao_unk')

    const summary = await generateStructuredSummary(repo, 'aula_sobreposicao_unk')
    if (summary.type === 'aula') {
      expect(summary.pendingTasks.length).toBe(0) // Não há lição de casa nesta aula
    }
  })

  it('Aplica Map-Reduce temporal para sessões longas (> 15 minutos)', async () => {
    await importConversationJson(repo, fixtureAula50Min)
    await classifySessionEvents(repo, 'aula_50min_bio')

    const summary = await generateStructuredSummary(repo, 'aula_50min_bio')
    expect(summary.mapReduceApplied).toBe(true)
    expect(summary.chunksProcessed).toBeGreaterThanOrEqual(3)
  })
})
