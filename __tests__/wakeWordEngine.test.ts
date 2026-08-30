import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  detectWakeWord,
  normalizeAcousticText,
  levenshteinDistance,
  ActiveVoiceSession,
} from '@/lib/wakeWordEngine'

describe('wakeWordEngine & Hello Rafinha Suite', () => {
  describe('1. Normalização Acústica e Levenshtein', () => {
    it('normaliza acentos, maiúsculas e pontuações', () => {
      const input = '  Olá,   RAFÍNHÂ!!! Como você está?  '
      expect(normalizeAcousticText(input)).toBe('ola rafinha como voce esta')
    })

    it('calcula a distância de Levenshtein corretamente', () => {
      expect(levenshteinDistance('rafinha', 'rafinha')).toBe(0)
      expect(levenshteinDistance('rafinha', 'rafina')).toBe(1)
      expect(levenshteinDistance('rafinha', 'hafinha')).toBe(1)
      expect(levenshteinDistance('rafinha', 'rainha')).toBe(1) // 1 deletion
      expect(levenshteinDistance('alexa', 'rafinha')).toBe(5)
    })
  })

  describe('2. Detecção de Wake Word Canônica e Fonética', () => {
    it('detecta "Hello Rafinha" canônico com alta confiança', () => {
      const res = detectWakeWord('Hello Rafinha')
      expect(res.detected).toBe(true)
      expect(res.matchedPhrase).toBe('hello rafinha')
      expect(res.confidence).toBeGreaterThanOrEqual(0.95)
    })

    it('detecta "Ei Rafinha", "Oi Rafinha", "Ok Rafinha" e "Hey Rafinha"', () => {
      expect(detectWakeWord('Ei Rafinha').detected).toBe(true)
      expect(detectWakeWord('Oi Rafinha').detected).toBe(true)
      expect(detectWakeWord('Ok Rafinha').detected).toBe(true)
      expect(detectWakeWord('Hey Rafinha').detected).toBe(true)
      expect(detectWakeWord('Rafinha').detected).toBe(true)
    })

    it('detecta variações fonéticas coloquiais ("Alô Rafinha", "Olá Rafinha", "Hello Rafina")', () => {
      const res1 = detectWakeWord('Alô Rafinha')
      expect(res1.detected).toBe(true)

      const res2 = detectWakeWord('Olá Rafinha')
      expect(res2.detected).toBe(true)

      const res3 = detectWakeWord('Hello Rafina')
      expect(res3.detected).toBe(true)
    })
  })

  describe('3. Extração Inteligente de Comando Inline na Mesma Frase', () => {
    it('extrai comando completo falado junto com a wake word', () => {
      const res = detectWakeWord('Hello Rafinha, cria uma prova de inglês sobre Simple Past')
      expect(res.detected).toBe(true)
      expect(res.matchedPhrase).toBe('hello rafinha')
      expect(res.inlineCommand).toBe('cria uma prova de ingles sobre simple past')
    })

    it('extrai comando após "Ei Rafinha"', () => {
      const res = detectWakeWord('Ei Rafinha lance nota 9 para o aluno Pedro')
      expect(res.detected).toBe(true)
      expect(res.inlineCommand).toBe('lance nota 9 para o aluno pedro')
    })
  })

  describe('4. Proteção contra Falsos Positivos em Fala Ambiente', () => {
    it('rejeita frases cotidianas que não são wake words (incluindo palavras similares como rainha e farinha)', () => {
      expect(detectWakeWord('Hoje a aula foi muito boa com a turma').detected).toBe(false)
      expect(detectWakeWord('A rainha da Inglaterra visitou o castelo').detected).toBe(false)
      expect(detectWakeWord('Comprei um pacote de farinha na feira').detected).toBe(false)
      expect(detectWakeWord('A galinha do vizinho fugiu').detected).toBe(false)
      expect(detectWakeWord('Quem é a diretora da escola?').detected).toBe(false)
      expect(detectWakeWord('Preciso comprar pão e queijo na padaria').detected).toBe(false)
    })
  })

  describe('5. Sessão de Escuta Pós-Ativação (ActiveVoiceSession)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('ativa sessão e encerra após 10 segundos de silêncio', () => {
      const onTimeout = vi.fn()
      const session = new ActiveVoiceSession(10000, onTimeout)

      expect(session.isActive()).toBe(false)
      session.activate()
      expect(session.isActive()).toBe(true)

      // Passa 5s -> ainda ativa
      vi.advanceTimersByTime(5000)
      expect(session.isActive()).toBe(true)
      expect(onTimeout).not.toHaveBeenCalled()

      // Passa mais 5.1s -> deve expirar
      vi.advanceTimersByTime(5100)
      expect(session.isActive()).toBe(false)
      expect(onTimeout).toHaveBeenCalledTimes(1)
    })

    it('keepAlive renova a janela de tempo a cada fala', () => {
      const onTimeout = vi.fn()
      const session = new ActiveVoiceSession(10000, onTimeout)

      session.activate()

      // Passa 7 segundos e usuário fala novamente (keepAlive)
      vi.advanceTimersByTime(7000)
      session.keepAlive()

      // Passa mais 5 segundos (total 12s desde início, mas apenas 5s desde keepAlive) -> permanece ativa
      vi.advanceTimersByTime(5000)
      expect(session.isActive()).toBe(true)
      expect(onTimeout).not.toHaveBeenCalled()

      // Passa mais 5.1s -> expira
      vi.advanceTimersByTime(5100)
      expect(session.isActive()).toBe(false)
      expect(onTimeout).toHaveBeenCalledTimes(1)
    })
  })
})
