// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type { SqlDriver } from '../../lib/desktop-core/db/SqlDriver'
import { initConversationVault, ConversationVaultRepository } from '../../lib/conversationData/schema'
import { executeConversationMethod } from '../../lib/conversationData/desktopIpc'
import { fixtureAula50Min } from '../../lib/conversationData/fixtures'
import type { SessionRecord, TurnRecord, EventRecord } from '../../lib/conversationData/types'

// Carrega o módulo de renderização de UI do Desktop
const { renderInsightsResult, formatTimeMs } = require('../../desktop/ui/conversationInsights.js')

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

describe('I6: Apresentação de Insights na UI Desktop com Selos e Marcos Temporais', () => {
  let driver: SqlDriver
  const dataKey = Buffer.alloc(32, 0x42)
  let repo: ConversationVaultRepository

  beforeEach(async () => {
    driver = new InMemorySqlDriver()
    await initConversationVault(driver)
    repo = new ConversationVaultRepository(driver, dataKey)
  })

  describe('1. IPC Handler: conversation.insights.get', () => {
    it('falha se "sessionId" não for fornecido', async () => {
      await expect(
        executeConversationMethod('conversation.insights.get', {}, driver, dataKey)
      ).rejects.toThrow('Parâmetro "sessionId" é obrigatório.')
    })

    it('falha com mensagem amigável em português se a sessão não existir no cofre', async () => {
      await expect(
        executeConversationMethod('conversation.insights.get', { sessionId: 'inexistente' }, driver, dataKey)
      ).rejects.toThrow('Sessão "inexistente" não encontrada no cofre local.')
    })

    it('executa ponta a ponta via IPC: gera parecer, avalia gate e persiste insights no cofre', async () => {
      // 1. Importa a sessão canônica via IPC
      const importRes = await executeConversationMethod('conversation.import', {
        content: JSON.stringify(fixtureAula50Min),
        format: 'json',
        title: 'Aula de Biologia Celular',
        sessionType: 'aula',
        teacherSpeakerName: 'Professora Helena'
      }, driver, dataKey)

      expect(importRes.success).toBe(true)
      const sessionId = importRes.sessionId

      // 2. Invoca o handler de parecer pedagógico
      const res = await executeConversationMethod(
        'conversation.insights.get',
        { sessionId, allowFixturesForTesting: true, discipline: 'Biologia' },
        driver,
        dataKey
      )

      expect(res.success).toBe(true)
      expect(res.sessionId).toBe(sessionId)
      expect(res.gateResult.passed).toBe(true)
      expect(res.pedagogicalReport).toBeDefined()
      expect(res.rawGeneratedInsights.length).toBeGreaterThan(0)
      expect(res.validInsightV1List.length).toBeGreaterThan(0)

      // Confirma que os insights foram gravados cifrados no cofre local
      const savedInsights = await repo.getSessionInsights(sessionId)
      expect(savedInsights.length).toBe(res.validInsightV1List.length)
    })
  })

  describe('2. Renderização de UI (renderInsightsResult & formatTimeMs)', () => {
    it('formata milissegundos para mm:ss com segurança', () => {
      expect(formatTimeMs(0)).toBe('00:00')
      expect(formatTimeMs(65000)).toBe('01:05')
      expect(formatTimeMs(300000)).toBe('05:00')
      expect(formatTimeMs(null)).toBe('00:00')
      expect(formatTimeMs(undefined)).toBe('00:00')
    })

    it('renderiza estado vazio honesto quando gateResult.passed é falso', () => {
      const mockContainer = document.createElement('div')

      renderInsightsResult(mockContainer, {
        gateResult: {
          passed: false,
          reason: 'E_SESSION_TOO_SHORT',
          message: 'Sessão com duração inferior a 5 minutos.',
          insights: []
        }
      }, () => {})

      expect(mockContainer.innerHTML).toContain('Análise Pedagógica Suspensa por Prudência Científica')
      expect(mockContainer.innerHTML).toContain('Sessão com duração inferior a 5 minutos.')
      expect(mockContainer.innerHTML).toContain('ti-shield-exclamation')
      // Garante que não inventa métricas nem cards quando o gate suspende a análise
      expect(mockContainer.querySelectorAll('.conv-insight-card')).toHaveLength(0)
    })

    it('renderiza métricas, parecer pedagógico, selos e marcos temporais quando aprovado', () => {
      const mockContainer = document.createElement('div')
      let ensureOpenCalled = false
      const ensureTurnsOpen = () => { ensureOpenCalled = true }

      const fakeData = {
        sessionId: 'sess_test',
        pedagogicalReport: {
          sessionId: 'sess_test',
          metrics: {
            tttPercent: 42,
            sttPercent: 18,
            silencePercent: 40,
            waitTimeI: {
              mediaSegundos: 3.2,
              medianaSegundos: 2.5,
              pausasMaioresOuIguaisA3s: 4,
              totalOportunidades: 6
            },
            questionRates: {
              totalPerguntasDocente: 8,
              taxaPorMinuto: 0.16
            }
          }
        },
        gateResult: {
          passed: true,
          insights: [
            {
              ruleId: 'swain_1985_output_hypothesis',
              ruleName: 'Hipótese da Produção Compressível (Swain 1985)',
              observacao: 'Fala discente representa 18% do tempo.',
              significadoPotencial: 'Pode indicar oportunidades para maior produção oral.',
              acaoSugerida: 'Considere atividades em pares.',
              seloEvidencia: '[FONTE CIENTÍFICA VERIFICADA]',
              fonteReferencia: 'Swain, M. (1985). Communicative competence.',
              turnosRelevantes: ['turn_3', 'turn_8']
            },
            {
              ruleId: 'rowe_1974_wait_time',
              ruleName: 'Tempo de Espera Pós-Pergunta (Rowe 1974)',
              observacao: 'Média de espera de 3.2s.',
              significadoPotencial: 'Permite elaboração de respostas mais complexas.',
              seloEvidencia: '[CITAÇÃO NÃO VERIFICADA]',
              fonteReferencia: 'Rowe, M. B. (1974). Wait-time and rewards.',
              turnosRelevantes: ['turn_5']
            }
          ]
        },
        rawGeneratedInsights: [
          {
            ruleId: 'swain_1985_output_hypothesis',
            ruleName: 'Hipótese da Produção Compressível (Swain 1985)',
            observacao: 'Fala discente representa 18% do tempo.',
            significadoPotencial: 'Pode indicar oportunidades para maior produção oral.',
            acaoSugerida: 'Considere atividades em pares.',
            seloEvidencia: '[FONTE CIENTÍFICA VERIFICADA]',
            fonteReferencia: 'Swain, M. (1985). Communicative competence.',
            turnosRelevantes: ['turn_3', 'turn_8']
          },
          {
            ruleId: 'rowe_1974_wait_time',
            ruleName: 'Tempo de Espera Pós-Pergunta (Rowe 1974)',
            observacao: 'Média de espera de 3.2s.',
            significadoPotencial: 'Permite elaboração de respostas mais complexas.',
            seloEvidencia: '[CITAÇÃO NÃO VERIFICADA]',
            fonteReferencia: 'Rowe, M. B. (1974). Wait-time and rewards.',
            turnosRelevantes: ['turn_5']
          }
        ]
      }

      renderInsightsResult(mockContainer, fakeData, ensureTurnsOpen)

      // 1. Métricas exibidas
      expect(mockContainer.innerHTML).toContain('42%') // TTT
      expect(mockContainer.innerHTML).toContain('18%') // STT
      expect(mockContainer.innerHTML).toContain('3.2s') // Wait-Time

      // 2. Dois cards de insight
      const cards = mockContainer.querySelectorAll('.conv-insight-card')
      expect(cards).toHaveLength(2)

      // 3. Selos de evidência corretos
      expect(mockContainer.innerHTML).toContain('[FONTE CIENTÍFICA VERIFICADA]')
      expect(mockContainer.innerHTML).toContain('[CITAÇÃO NÃO VERIFICADA]')

      // 4. Rodapé de transparência com selo honesto
      expect(mockContainer.innerHTML).toContain('[NÃO VALIDADO EM ASR REAL]')
      expect(mockContainer.innerHTML).toContain('Nota Metodológica de Transparência')

      // 5. Botões de salto de turno (marcos temporais)
      const jumpButtons = mockContainer.querySelectorAll('.conv-btn-jump-turn')
      expect(jumpButtons.length).toBe(3) // 2 de Swain + 1 de Rowe

      // Simula clique em marco temporal
      const firstBtn = jumpButtons[0] as HTMLButtonElement
      expect(firstBtn.getAttribute('data-turn-id')).toBe('turn_3')
      firstBtn.click()

      expect(ensureOpenCalled).toBe(true)
    })
  })
})
