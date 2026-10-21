import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type { SqlDriver } from '../../lib/desktop-core/db/SqlDriver'
import { initConversationVault, ConversationVaultRepository } from '../../lib/conversationData/schema'
import { importConversationJson } from '../../lib/conversationData/importer'
import { classifySessionEvents } from '../../lib/conversationData/eventClassifier'
import { fixtureAula50Min, fixtureReuniaoPedagogica, fixtureAulaSobreposicaoDesconhecido } from '../../lib/conversationData/fixtures'
import { executeConversationQuery } from '../../lib/conversationData/queryEngine'
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

describe('TESTES DOURADOS: 12 Perguntas Canônicas + Salvaguardas de Privacidade', () => {
  let driver: SqlDriver
  let repo: ConversationVaultRepository

  beforeEach(async () => {
    driver = new InMemorySqlDriver()
    await initConversationVault(driver)
    repo = new ConversationVaultRepository(driver)

    // Ingestão e classificação das 3 fixtures com nomes canário
    await importConversationJson(repo, fixtureAula50Min)
    await classifySessionEvents(repo, 'aula_50min_bio')

    await importConversationJson(repo, fixtureReuniaoPedagogica)
    await classifySessionEvents(repo, 'reuniao_coord_pedag')

    await importConversationJson(repo, fixtureAulaSobreposicaoDesconhecido)
    await classifySessionEvents(repo, 'aula_sobreposicao_unk')
  })

  // 1. Quantas vezes eu falei?
  it('Q1: Quantas vezes eu falei? -> Resposta exata: 11 turnos com horários', async () => {
    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Quantas vezes eu falei?')
    expect(res.numericResult).toBe(11)
    expect(res.formattedAnswer).toContain('falou 11 vezes')
    expect(res.items.length).toBe(11)
    res.items.forEach(item => expect(item.timeRange).toMatch(/^\[\d{2}:\d{2} - \d{2}:\d{2}\]$/))
  })

  // 2. Quanto tempo falei vs. alunos?
  it('Q2: Quanto tempo falei vs. alunos? -> Proporção exata TTT vs STT com horários', async () => {
    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Quanto tempo falei vs. alunos?')
    expect(res.primitiveUsed).toBe('tempo_de_fala')
    expect(res.formattedAnswer).toContain('Professor:')
    expect(res.formattedAnswer).toContain('Alunos:')
    expect(res.items.length).toBeGreaterThan(0)
    res.items.forEach(item => expect(item.timeRange).toBeDefined())
  })

  // 3. Quantas perguntas eu fiz?
  it('Q3: Quantas perguntas eu fiz? -> Resposta exata: 5 perguntas docentes', async () => {
    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Quantas perguntas eu fiz?')
    expect(res.numericResult).toBe(5)
    expect(res.items.length).toBe(5)
  })

  // 4. Quantas eram abertas?
  it('Q4: Quantas eram abertas? -> Resposta exata: 1 pergunta aberta', async () => {
    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Quantas perguntas eram abertas?')
    expect(res.numericResult).toBe(1)
    expect(res.items[0].evidence).toContain('como vocês explicariam')
  })

  // 5. Quantas perguntas os alunos fizeram?
  it('Q5: Quantas perguntas os alunos fizeram? -> Resposta exata: 2 perguntas discentes', async () => {
    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Quantas perguntas os alunos fizeram?')
    expect(res.numericResult).toBe(2)
    expect(res.items.length).toBe(2)
  })

  // 6. Quem fez cada pergunta?
  it('Q6: Quem fez cada pergunta? -> Lista completa e exata de autores e horários', async () => {
    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Quem fez cada pergunta?')
    expect(res.numericResult).toBe(7)
    const authors = res.items.map(i => i.speaker)
    expect(authors).toContain('Professora Helena')
    expect(authors).toContain('Canário Carlos')
    expect(authors).toContain('Canária Beatriz')
    res.items.forEach(item => expect(item.timeRange).toBeDefined())
  })

  // 7. Qual foi o maior trecho de fala só minha?
  it('Q7: Qual foi o maior trecho de fala só minha? -> Monólogo exato de 90s', async () => {
    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Qual foi o maior trecho de fala só minha?')
    expect(res.numericResult).toBe(90000)
    expect(res.items[0].startMs).toBe(265000)
    expect(res.items[0].endMs).toBe(355000)
    expect(res.items[0].timeRange).toBe('[04:25 - 05:55]')
  })

  // 8. Quanto tempo esperei após perguntar?
  it('Q8: Quanto tempo esperei após perguntar? -> Esperas com horários e média', async () => {
    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Quanto tempo esperei após perguntar?')
    expect(res.numericResult).toBe(3)
    expect(res.formattedAnswer).toContain('média de 5.0s')
    expect(res.items[0].timeRange).toBe('[02:17 - 02:23]')
    expect(res.items[1].timeRange).toBe('[06:52 - 06:57]')
    expect(res.items[2].timeRange).toBe('[11:55 - 11:58]')
  })

  // 9. Dúvidas dos alunos que ficaram sem resposta?
  it('Q9: Dúvidas dos alunos que ficaram sem resposta? -> Detecta dúvida pendente de Canário Arthur', async () => {
    const res = await executeConversationQuery(repo, 'aula_sobreposicao_unk', 'Dúvidas dos alunos que ficaram sem resposta?')
    expect(res.numericResult).toBe(1)
    expect(res.items[0].speaker).toBe('Canário Arthur')
    expect(res.items[0].evidence).toContain('como os seres bentônicos sobrevivem')
    expect(res.items[0].timeRange).toBe('[00:50 - 01:02]')
  })

  // 10. Resumo da aula
  it('Q10: Resumo da aula -> Tópicos, dúvidas e tarefas com horários de origem', async () => {
    const summary = await generateStructuredSummary(repo, 'aula_50min_bio')
    expect(summary.type).toBe('aula')
    if (summary.type === 'aula') {
      expect(summary.topics.length).toBeGreaterThanOrEqual(3)
      summary.topics.forEach(t => expect(t.timeRange).toBeDefined())
      expect(summary.studentDoubts.length).toBe(2)
      expect(summary.pendingTasks.length).toBe(1)
      expect(summary.pendingTasks[0].timeRange).toBe('[48:20 - 49:40]')
    }
  })

  // 11. Decisões e responsáveis desta reunião
  it('Q11: Decisões e responsáveis desta reunião -> Ações de Marcos e Helena com prazos', async () => {
    const summary = await generateStructuredSummary(repo, 'reuniao_coord_pedag')
    expect(summary.type).toBe('reuniao')
    if (summary.type === 'reuniao') {
      expect(summary.actionItems.length).toBe(2)
      const marcos = summary.actionItems.find(a => a.assignee.includes('Marcos'))
      expect(marcos?.deadline?.toLowerCase()).toContain('sexta-feira')
      expect(marcos?.timeRange).toBe('[01:02 - 01:15]')

      const helena = summary.actionItems.find(a => a.assignee.includes('Helena'))
      expect(helena?.deadline?.toLowerCase()).toContain('segunda-feira')
      expect(helena?.timeRange).toBe('[01:48 - 02:05]')
    }
  })

  // 12. Compare com a aula anterior
  it('Q12: Compare com a aula anterior -> Comparativo com horários e métricas', async () => {
    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Compare com a aula anterior')
    expect(res.primitiveUsed).toBe('comparar_sessoes')
    expect(res.formattedAnswer).toContain('Comparativo entre Sessões')
  })

  // Salvaguarda 1: Falante desconhecido não vira nome (nunca chute)
  it('Salvaguarda: Falante desconhecido é estritamente rotulado como "não identificado"', async () => {
    const res = await executeConversationQuery(repo, 'aula_sobreposicao_unk', 'Quem falou?')
    const unknownItem = res.items.find(i => i.evidence.includes('caneta vermelha'))
    expect(unknownItem).toBeDefined()
    expect(unknownItem?.speaker).toBe('não identificado')
    expect(unknownItem?.speaker).not.toBe('Canário Arthur')
  })

  // Salvaguarda 2: Pergunta sem primitiva => "não sei"
  it('Salvaguarda: Pergunta que não mapeia responde "não sei" e oferece catálogo', async () => {
    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Quantos pássaros cantaram hoje?')
    expect(res.primitiveUsed).toBe('nao_suportado')
    expect(res.formattedAnswer).toContain('Não sei responder a esta pergunta')
    expect(res.formattedAnswer).toContain('consultas disponíveis')
  })

  // Salvaguarda 3: Idempotência determinística (mesma entrada => mesma resposta)
  it('Salvaguarda: Mesma entrada produz exatamente a mesma resposta', async () => {
    const res1 = await executeConversationQuery(repo, 'aula_50min_bio', 'Quantas vezes eu falei?')
    const res2 = await executeConversationQuery(repo, 'aula_50min_bio', 'Quantas vezes eu falei?')
    expect(res1).toEqual(res2)
  })

  // Salvaguarda 4: Resposta SEMPRE com horários
  it('Salvaguarda: Toda resposta de evento possui timeRange devidamente delimitado', async () => {
    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Quem fez cada pergunta?')
    expect(res.items.length).toBeGreaterThan(0)
    for (const item of res.items) {
      expect(item.timeRange).toMatch(/^\[\d{2}:\d{2} - \d{2}:\d{2}\]$/)
    }
  })

  // Salvaguarda 5: Nenhum campo de transcrição em log ou storage desprotegido
  it('Salvaguarda de Privacidade LGPD: Nenhum dado de transcrição vaza para console.log ou storage global', async () => {
    const logSpy = vi.spyOn(console, 'log')
    const warnSpy = vi.spyOn(console, 'warn')
    const errorSpy = vi.spyOn(console, 'error')

    // Executa operações completas
    await executeConversationQuery(repo, 'aula_50min_bio', 'Quantas perguntas eu fiz?')
    await generateStructuredSummary(repo, 'aula_50min_bio')

    const allLoggedArgs = [
      ...logSpy.mock.calls.flat(),
      ...warnSpy.mock.calls.flat(),
      ...errorSpy.mock.calls.flat()
    ].map(a => String(a))

    // Nenhum trecho de transcrição ou nome de aluno foi impresso em stdout/console
    for (const logText of allLoggedArgs) {
      expect(logText).not.toContain('cloroplastos')
      expect(logText).not.toContain('fotossíntese')
      expect(logText).not.toContain('Canário Arthur')
      expect(logText).not.toContain('Canária Beatriz')
    }

    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
