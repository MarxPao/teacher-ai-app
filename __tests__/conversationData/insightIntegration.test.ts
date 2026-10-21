import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type { SqlDriver } from '../../lib/desktop-core/db/SqlDriver'
import {
  initConversationVault,
  ConversationVaultRepository
} from '../../lib/conversationData/schema'
import {
  convertToInsightV1,
  adaptAndValidatePedagogicalInsights,
  getUnifiedSessionPedagogicalData
} from '../../lib/conversationData/insightIntegrationAdapter'
import { validateInsightContract } from '../../lib/insights/insightEngineV1'
import { computeSessionPedagogicalReport } from '../../lib/conversationData/pedagogicalMetrics'
import { INSIGHT_RULES } from '../../lib/conversationData/insightRules'
import { fixtureAula50Min } from '../../lib/conversationData/fixtures'
import type { TurnRecord, EventRecord, SessionRecord } from '../../lib/conversationData/types'

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

describe('I5: Integração com Módulo de Insights/Analytics e Validação de Contrato V1', () => {
  let driver: SqlDriver
  const dataKey = Buffer.alloc(32, 0x42)
  let repo: ConversationVaultRepository

  beforeEach(async () => {
    driver = new InMemorySqlDriver()
    await initConversationVault(driver)
    repo = new ConversationVaultRepository(driver, dataKey)
  })

  it('1. Valida conformidade estrita com validateInsightContract (sem validador paralelo)', () => {
    const session: SessionRecord = {
      id: 'sess_bio',
      title: 'Aula de Biologia',
      session_type: 'aula',
      total_duration_ms: 3000000
    }
    const turns: TurnRecord[] = fixtureAula50Min.turns.map((t, idx) => ({
      id: `turn_${idx}`,
      session_id: 'sess_bio',
      speaker_label: t.speaker,
      role: t.speaker === 'spk_prof' ? 'professor' : 'aluno',
      start_ms: t.startMs,
      end_ms: t.endMs,
      text: t.text,
      turn_index: idx
    }))

    const report = computeSessionPedagogicalReport({ session, turns, events: [] })
    const rule = INSIGHT_RULES.find(r => r.id === 'rule_teacher_speaking_ratio')!
    const generated = rule.gerarInsight(report)

    // Converte e submete ao validador canônico do InsightV1
    const v1 = convertToInsightV1(generated, report, 'Inglês')
    expect(validateInsightContract(v1)).toBe(true)

    // Verifica integridade dos campos
    expect(v1.id).toBe(`ins_rule_teacher_speaking_ratio_sess_bio`)
    expect(v1.rule_id).toBe('rule_teacher_speaking_ratio')
    expect(v1.confidence).toBe('alta') // n=18 >= 15
    expect(v1.approach_id).toBe('CLT')
    expect(v1.applies_to.disciplinas).toContain('Inglês')
    expect(v1.suggested_action).toContain('think-pair-share')
    expect(v1.caveats).toHaveLength(3)
    expect(v1.facts).toHaveLength(1)
    expect(v1.hypotheses).toHaveLength(1)
  })

  it('2. Fluxo unificado (Analytics & Insights) com persistência cifrada no cofre local', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')

    const session: SessionRecord = {
      id: 'sess_ingles_9ano',
      title: 'Aula de Inglês 9º Ano',
      session_type: 'aula',
      total_duration_ms: 3000000
    }
    await repo.createSession(session)

    const turns: TurnRecord[] = fixtureAula50Min.turns.map((t, idx) => ({
      id: `turn_${idx}`,
      session_id: session.id,
      speaker_label: t.speaker,
      role: t.speaker === 'spk_prof' ? 'professor' : 'aluno',
      start_ms: t.startMs,
      end_ms: t.endMs,
      text: t.text,
      turn_index: idx
    }))
    await repo.insertTurns(turns)

    // Executa fluxo unificado com liberação de fixture para teste
    const unified = await getUnifiedSessionPedagogicalData(session.id, repo, {
      discipline: 'Inglês',
      allowFixturesForTesting: true
    })

    expect(unified.sessionId).toBe(session.id)
    expect(unified.pedagogicalReport.speakingRatio.value.teacherPct).toBe(88.4)
    expect(unified.gateResult.passed).toBe(true)
    expect(unified.validInsightV1List.length).toBeGreaterThanOrEqual(1)

    // Todos os insights validados pelo contrato oficial
    expect(unified.validInsightV1List.every(ins => validateInsightContract(ins))).toBe(true)

    // Prova persistência cifrada no cofre e recuperação com integridade
    const storedInsights = await repo.getSessionInsights(session.id)
    expect(storedInsights).toHaveLength(unified.validInsightV1List.length)
    expect(storedInsights[0].rule_id).toBe('rule_teacher_speaking_ratio')

    // Prova de isolamento de rede: zero chamadas a serviços externos
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
