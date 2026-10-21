import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type { SqlDriver } from '../../lib/desktop-core/db/SqlDriver'
import { initConversationVault, ConversationVaultRepository } from '../../lib/conversationData/schema'
import {
  parseVtt,
  parseSrt,
  parseTxtTranscript,
  importTranscriptFile
} from '../../lib/conversationData/transcriptParsers'

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

const SAMPLE_VTT = `WEBVTT - Exportação Sintética de Aula

00:00:02.000 --> 00:00:08.500
<v Professora Helena>Bom dia classe! Hoje estudaremos os biomas brasileiros.</v>

00:00:10.000 --> 00:00:15.000
Canário Arthur: Professora, qual a diferença entre cerrado e caatinga?

00:00:18.000 --> 00:00:23.000
Voz Desconhecida: Alguém tem um lápis aí?
`

const SAMPLE_SRT = `1
00:00:01,500 --> 00:00:06,000
Professora Helena: Vamos iniciar a discussão sobre recuperação paralela.

2
00:00:07,000 --> 00:00:12,500
Professor Marcos: Perfeito, já separei a lista dos alunos com pendência.
`

const SAMPLE_TXT = `[00:01:00 - 00:01:20] Professora Helena: Quem pode me dizer a principal característica da Caatinga?
[00:01:25 - 00:01:35] Canária Beatriz: A vegetação xerófila adaptada ao clima semiárido.
[00:01:40 - 00:01:50] Desconhecido: Ei, que horas são?
`

describe('2. Importadores Tolerantes (.vtt, .srt, .txt) sem Dependências Novas', () => {
  let driver: SqlDriver
  let repo: ConversationVaultRepository

  beforeEach(async () => {
    driver = new InMemorySqlDriver()
    await initConversationVault(driver)
    repo = new ConversationVaultRepository(driver)
  })

  it('faz o parse de arquivo .vtt com tags <v Nome> e Nome:', () => {
    const turns = parseVtt(SAMPLE_VTT)
    expect(turns).toHaveLength(3)
    expect(turns[0].speakerRaw).toBe('Professora Helena')
    expect(turns[0].startMs).toBe(2000)
    expect(turns[0].endMs).toBe(8500)
    expect(turns[0].text).toContain('Bom dia classe')

    expect(turns[1].speakerRaw).toBe('Canário Arthur')
    expect(turns[1].text).toContain('qual a diferença')
  })

  it('faz o parse de arquivo .srt com timestamps e vírgulas nos milissegundos', () => {
    const turns = parseSrt(SAMPLE_SRT)
    expect(turns).toHaveLength(2)
    expect(turns[0].speakerRaw).toBe('Professora Helena')
    expect(turns[0].startMs).toBe(1500)
    expect(turns[0].endMs).toBe(6000)
    expect(turns[1].speakerRaw).toBe('Professor Marcos')
  })

  it('faz o parse de arquivo .txt com formato [MM:SS - MM:SS] Nome: fala', () => {
    const turns = parseTxtTranscript(SAMPLE_TXT)
    expect(turns).toHaveLength(3)
    expect(turns[0].speakerRaw).toBe('Professora Helena')
    expect(turns[0].startMs).toBe(60000)
    expect(turns[0].endMs).toBe(80000)
    expect(turns[1].speakerRaw).toBe('Canária Beatriz')
    expect(turns[2].speakerRaw).toBe('Desconhecido')
  })

  it('importa .vtt no cofre com mapeamento: professor escolhido manualmente, demais alunos, desconhecido tratado como desconhecido', async () => {
    const session = await importTranscriptFile(repo, {
      content: SAMPLE_VTT,
      format: 'vtt',
      sessionId: 'sess_vtt_test',
      title: 'Aula VTT - Biomas',
      sessionType: 'aula',
      teacherSpeakerName: 'Professora Helena'
    })

    expect(session.id).toBe('sess_vtt_test')

    const speakerMap = await repo.getSpeakerMap('sess_vtt_test')
    const teacher = speakerMap.find(s => s.assigned_name === 'Professora Helena')
    expect(teacher?.role).toBe('professor')
    expect(teacher?.source).toBe('manual')

    const studentArthur = speakerMap.find(s => s.assigned_name === 'Canário Arthur')
    expect(studentArthur?.role).toBe('aluno')
    expect(studentArthur?.source).toBe('inferido')

    const unknownSpk = speakerMap.find(s => s.assigned_name === 'Voz Desconhecida' || s.role === 'desconhecido')
    expect(unknownSpk?.role).toBe('desconhecido')

    const turns = await repo.getTurnsBySession('sess_vtt_test')
    expect(turns[0].role).toBe('professor')
    expect(turns[1].role).toBe('aluno')
    expect(turns[2].role).toBe('desconhecido')
  })

  it('Item 6: "Atenção: abram o livro" e "Exemplo: x = 2" NÃO viram falantes e timestamps fora de ordem são reordenados', () => {
    const txtAdversarial = `
[00:03:00 - 00:03:10] Atenção: abram o livro na página 20
[00:01:00 - 00:01:15] Professora Helena: Vamos iniciar a aula de matemática
[00:02:00 - 00:02:20] Exemplo: x = 2 e y = 4
[00:01:20 - 00:01:35] Canário Arthur: Professora, qual capítulo?
`
    const turns = parseTxtTranscript(txtAdversarial, ['Professora Helena'])

    expect(turns).toHaveLength(4)

    // 1. "Atenção:" NÃO vira falante
    const atencaoTurn = turns.find(t => t.text.includes('abram o livro'))
    expect(atencaoTurn?.speakerRaw).toBe('Desconhecido')
    expect(atencaoTurn?.text).toContain('Atenção: abram o livro')

    // 2. "Exemplo:" NÃO vira falante
    const exemploTurn = turns.find(t => t.text.includes('x = 2'))
    expect(exemploTurn?.speakerRaw).toBe('Desconhecido')
    expect(exemploTurn?.text).toContain('Exemplo: x = 2')

    // 3. Timestamps fora de ordem foram rigorosamente ordenados por startMs
    expect(turns[0].startMs).toBe(60000) // 00:01:00 (Professora Helena)
    expect(turns[0].speakerRaw).toBe('Professora Helena')

    expect(turns[1].startMs).toBe(80000) // 00:01:20 (Canário Arthur)
    expect(turns[1].speakerRaw).toBe('Canário Arthur')

    expect(turns[2].startMs).toBe(120000) // 00:02:00 (Exemplo: x = 2)
    expect(turns[3].startMs).toBe(180000) // 00:03:00 (Atenção: abram o livro)
  })
})
