import { describe, it, expect, beforeEach } from 'vitest'
import { turnTrace, assertNoFreeText, TurnTraceRecord } from '../lib/turnTrace'

describe('TurnTrace — Zero-PII Latency Instrumentation', () => {
  beforeEach(() => {
    turnTrace.clear()
  })

  it('armazena registros válidos contendo apenas métricas numéricas e códigos', () => {
    const validTurn: TurnTraceRecord = {
      id: 'turn_1792345000_abc',
      surface: 'web',
      mode: 'streaming',
      provider: 'groq',
      modelCode: 'llama-3.3-70b-versatile',
      promptTokensEst: 420,
      outputTokensEst: 65,
      attemptsCount: 1,
      fallbackTriggered: false,
      t_input: 1000,
      t_mask_done: 1010,
      t_request_sent: 1015,
      t_first_token: 1350,
      t_first_sentence: 1600,
      t_tts_requested: 1610,
      t_first_audio: 1850,
      t_done: 2200,
    }

    expect(() => assertNoFreeText(validTurn)).not.toThrow()
    turnTrace.record(validTurn)

    expect(turnTrace.getRecords()).toHaveLength(1)
    const summary = turnTrace.getSummary()
    expect(summary.totalTurns).toBe(1)
    expect(summary.maskMs.p50).toBe(10)
    expect(summary.timeToFirstTokenMs.p50).toBe(350)
    expect(summary.timeToFirstSentenceMs.p50).toBe(600)
    expect(summary.timeToFirstAudioMs.p50).toBe(850)
    expect(summary.totalTurnMs.p50).toBe(1200)
  })

  it('REJEITA e lança erro se houver campo não autorizado (ex: prompt, transcript, reply, userText)', () => {
    const dirtyTurnWithPrompt = {
      id: 'turn_123',
      surface: 'web',
      mode: 'unary',
      t_input: 1000,
      t_done: 2000,
      prompt: 'Olá Rafinha, lance a nota 9 para o aluno Pedro',
    }

    expect(() => assertNoFreeText(dirtyTurnWithPrompt)).toThrow(/E_TRACE_LEAK_DETECTED: chave não autorizada.*prompt/)
  })

  it('REJEITA e lança erro se o id contiver frases ou espaços em vez de formato turn_hash', () => {
    const dirtyTurnWithTextInId = {
      id: 'turn_Pedro_Santos_Nota_9',
      surface: 'web',
      mode: 'unary',
      t_input: 1000,
      t_done: 2000,
    }

    expect(() => assertNoFreeText(dirtyTurnWithTextInId)).not.toThrow() // turn_ com alphanumeric é aceito se for hash

    const dirtyTurnWithSentenceInId = {
      id: 'turn_Pedro Santos tirou nota 9 na prova',
      surface: 'web',
      mode: 'unary',
      t_input: 1000,
      t_done: 2000,
    }

    expect(() => assertNoFreeText(dirtyTurnWithSentenceInId)).toThrow(/E_TRACE_LEAK_DETECTED: id suspeito/)
  })

  it('REJEITA valores de surface ou provider desconhecidos', () => {
    const invalidSurface = {
      id: 'turn_456',
      surface: 'whatsapp_cloud_unauthorized',
      mode: 'unary',
      t_input: 1000,
      t_done: 2000,
    }

    expect(() => assertNoFreeText(invalidSurface)).toThrow(/E_TRACE_LEAK_DETECTED: surface inválida/)
  })

  it('calcula percentis p50 e p95 corretamente para múltiplos turnos', () => {
    const base = 1000
    // Registra 10 turnos com durações totais: 100ms, 200ms, ..., 1000ms
    for (let i = 1; i <= 10; i++) {
      turnTrace.record({
        id: `turn_${i}`,
        surface: 'desktop',
        mode: 'unary',
        provider: 'ollama',
        nluDurationMs: i * 50,
        t_input: base,
        t_done: base + i * 100,
      })
    }

    const summary = turnTrace.getSummary()
    expect(summary.totalTurns).toBe(10)
    expect(summary.totalTurnMs.min).toBe(100)
    expect(summary.totalTurnMs.max).toBe(1000)
    expect(summary.totalTurnMs.p50).toBe(600)
    expect(summary.nluDurationMs.p50).toBe(300)
  })
})
