import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type { SqlDriver } from '../../lib/desktop-core/db/SqlDriver'
import { initConversationVault, ConversationVaultRepository } from '../../lib/conversationData/schema'
import { importConversationJson } from '../../lib/conversationData/importer'
import { classifySessionEvents } from '../../lib/conversationData/eventClassifier'
import { fixtureAula50Min, fixtureAulaSobreposicaoDesconhecido } from '../../lib/conversationData/fixtures'
import { executeConversationQuery } from '../../lib/conversationData/queryEngine'

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

describe('2.4 Camada de Consulta com Primitivas Fechadas e Definições Auditáveis', () => {
  let driver: SqlDriver
  let repo: ConversationVaultRepository

  beforeEach(async () => {
    driver = new InMemorySqlDriver()
    await initConversationVault(driver)
    repo = new ConversationVaultRepository(driver)

    await importConversationJson(repo, fixtureAula50Min)
    await classifySessionEvents(repo, 'aula_50min_bio')
  })

  it('1. Quantas vezes eu falei? -> Retorna contagem de turnos docentes com definição e horários', async () => {
    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Quantas vezes eu falei?')
    expect(res.primitiveUsed).toBe('contar_por_papel')
    expect(res.definitionUsed).toContain('[DEFINIÇÃO A VALIDAR (dono)]')
    expect(res.numericResult).toBe(11) // 11 turnos da Professora Helena
    expect(res.items.length).toBe(11)
    expect(res.items[0].timeRange).toBeDefined()
  })

  it('2. Quanto tempo falei vs. alunos? -> Retorna métrica TTT vs STT com horários', async () => {
    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Quanto tempo falei vs. alunos?')
    expect(res.primitiveUsed).toBe('tempo_de_fala')
    expect(res.formattedAnswer).toContain('Professor:')
    expect(res.formattedAnswer).toContain('Alunos:')
    expect(res.definitionUsed).toBeDefined()
  })

  it('3. Quantas perguntas eu fiz? -> Retorna total de perguntas docentes', async () => {
    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Quantas perguntas eu fiz?')
    expect(res.primitiveUsed).toBe('contar_por_papel')
    expect(res.numericResult).toBe(5) // 5 perguntas feitas pela professora
    expect(res.items.length).toBe(5)
    res.items.forEach(item => expect(item.evidence).toContain('?'))
  })

  it('4. Quantas eram abertas? -> Retorna perguntas abertas com horários e evidência', async () => {
    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Quantas perguntas eram abertas?')
    expect(res.primitiveUsed).toBe('contar_por_papel')
    expect(res.numericResult).toBe(1)
    expect(res.items[0].evidence).toContain('como vocês explicariam')
    expect(res.definitionUsed).toContain('aberta')
  })

  it('5. Quantas perguntas os alunos fizeram? -> Contabiliza perguntas discentes', async () => {
    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Quantas perguntas os alunos fizeram?')
    expect(res.primitiveUsed).toBe('contar_por_papel')
    expect(res.numericResult).toBe(2) // Carlos e Beatriz
    expect(res.items.length).toBe(2)
  })

  it('6. Quem fez cada pergunta? -> Lista autores e perguntas com horários exatos', async () => {
    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Quem fez cada pergunta?')
    expect(res.primitiveUsed).toBe('listar_com_horarios')
    expect(res.items.length).toBe(7) // 5 da professora + 2 dos alunos
    const authors = res.items.map(i => i.speaker)
    expect(authors).toContain('Professora Helena')
    expect(authors).toContain('Canário Carlos')
    expect(authors).toContain('Canária Beatriz')
  })

  it('7. Qual foi o maior trecho de fala só minha? -> Identifica monólogo de 90s com horários', async () => {
    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Qual foi o maior trecho de fala só minha?')
    expect(res.primitiveUsed).toBe('maior_monologo')
    expect(res.numericResult).toBe(90000) // 90 segundos (265000 a 355000)
    expect(res.items[0].startMs).toBe(265000)
    expect(res.items[0].endMs).toBe(355000)
    expect(res.items[0].evidence).toContain('segunda lei da termodinâmica')
  })

  it('8. Quanto tempo esperei após perguntar? -> Retorna tempos de espera com horários', async () => {
    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Quanto tempo esperei após perguntar?')
    expect(res.primitiveUsed).toBe('tempo_de_espera')
    expect(res.items.length).toBeGreaterThanOrEqual(2)
    expect(res.items[0].timeRange).toBeDefined()
    expect(res.definitionUsed).toContain('Mary Budd Rowe')
  })

  it('9. Dúvidas dos alunos que ficaram sem resposta? -> Detecta pergunta pendente na fixture 3', async () => {
    await importConversationJson(repo, fixtureAulaSobreposicaoDesconhecido)
    await classifySessionEvents(repo, 'aula_sobreposicao_unk')

    const res = await executeConversationQuery(repo, 'aula_sobreposicao_unk', 'Dúvidas dos alunos que ficaram sem resposta?')
    expect(res.primitiveUsed).toBe('duvidas_sem_resposta')
    expect(res.items.length).toBe(1)
    expect(res.items[0].speaker).toBe('Canário Arthur')
    expect(res.items[0].evidence).toContain('como os seres bentônicos sobrevivem')
  })

  it('12. Compare com a aula anterior -> Executa comparativo entre sessões', async () => {
    await importConversationJson(repo, fixtureAulaSobreposicaoDesconhecido)
    await classifySessionEvents(repo, 'aula_sobreposicao_unk')

    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Compare com a aula anterior')
    expect(res.primitiveUsed).toBe('comparar_sessoes')
    expect(res.formattedAnswer).toContain('Comparativo entre Sessões')
  })

  it('Pergunta sem primitiva mapeada -> Responde "não sei" e sugere as mais próximas', async () => {
    const res = await executeConversationQuery(repo, 'aula_50min_bio', 'Qual é a previsão do tempo para amanhã?')
    expect(res.primitiveUsed).toBe('nao_suportado')
    expect(res.formattedAnswer).toContain('Não sei responder a esta pergunta')
    expect(res.formattedAnswer).toContain('consultas disponíveis')
  })

  it('Falante desconhecido -> Retorna "não identificado", NUNCA chuta nome de aluno', async () => {
    await importConversationJson(repo, fixtureAulaSobreposicaoDesconhecido)
    await classifySessionEvents(repo, 'aula_sobreposicao_unk')

    const res = await executeConversationQuery(repo, 'aula_sobreposicao_unk', 'Quem falou?')
    const unknownSpeakerItem = res.items.find(i => i.evidence.includes('caneta vermelha'))
    expect(unknownSpeakerItem?.speaker).toBe('não identificado')
  })
})
