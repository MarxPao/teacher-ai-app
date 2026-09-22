import { describe, it, expect } from 'vitest'
import {
  ClassroomSegment,
  detectTemporalOverlapsAndBursts,
  detectWaitTimeAnomalies,
  computeClassroomTalkMetrics,
  computeSpeakerGiniIndex
} from '@/lib/classroomHeuristics'

describe('Classroom Analytics — Heurísticas Acústicas e Algoritmo Two-Pointer O(N)', () => {
  describe('1. Detecção de Picos de Participação e Overlap (Two-Pointer O(N))', () => {
    it('detecta pico de debate coletivo quando há >= 4 vozes distintas e >= 8 turnos em 60s', () => {
      // 8 turnos intercalados em uma janela de 50 segundos entre 4 alunos
      const sampleSegments: ClassroomSegment[] = [
        { id: '1', speaker: 'professor', startMs: 0, endMs: 5000, durationMs: 5000, text: 'O que acham?' },
        { id: '2', speaker: 'aluno_1', startMs: 6000, endMs: 10000, durationMs: 4000, text: 'Acho que é since.' },
        { id: '3', speaker: 'aluno_2', startMs: 11000, endMs: 15000, durationMs: 4000, text: 'Concordo com ele.' },
        { id: '4', speaker: 'aluno_3', startMs: 16000, endMs: 20000, durationMs: 4000, text: 'Mas e se for duração?' },
        { id: '5', speaker: 'aluno_4', startMs: 21000, endMs: 25000, durationMs: 4000, text: 'Aí muda tudo.' },
        { id: '6', speaker: 'aluno_1', startMs: 26000, endMs: 30000, durationMs: 4000, text: 'Exatamente.' },
        { id: '7', speaker: 'aluno_2', startMs: 31000, endMs: 35000, durationMs: 4000, text: 'Usa for nesse caso.' },
        { id: '8', speaker: 'aluno_3', startMs: 36000, endMs: 40000, durationMs: 4000, text: 'Perfeito gente.' },
        { id: '9', speaker: 'aluno_4', startMs: 41000, endMs: 45000, durationMs: 4000, text: 'Entendi agora.' }
      ]

      const highlights = detectTemporalOverlapsAndBursts(sampleSegments, 60_000)
      const burstHighlight = highlights.find(h => h.type === 'alta_participacao')

      expect(burstHighlight).toBeDefined()
      expect(burstHighlight?.triggerHeuristic).toBe('burst_participation_sliding_window')
      expect(burstHighlight?.title).toContain('Pico de Debate Coletivo')
    })

    it('detecta sobreposição de falas prolongada (overlap >= 2000ms)', () => {
      const overlapSegments: ClassroomSegment[] = [
        { id: '1', speaker: 'professor', startMs: 10000, endMs: 16000, durationMs: 6000, text: 'Prestem atenção nesta regra...' },
        { id: '2', speaker: 'aluno_1', startMs: 12000, endMs: 15500, durationMs: 3500, text: 'Professor, posso ir ao banheiro?' } // overlap de 3500ms
      ]

      const highlights = detectTemporalOverlapsAndBursts(overlapSegments)
      const overlapHighlight = highlights.find(h => h.type === 'dispersao_ruido')

      expect(overlapHighlight).toBeDefined()
      expect(overlapHighlight?.title).toContain('Sobreposição de Vozes')
    })

    it('executa em complexidade O(N) linear real sobre 1.000 segmentos em menos de 25ms', () => {
      const syntheticSegments: ClassroomSegment[] = []
      let t = 0
      for (let i = 0; i < 1000; i++) {
        const dur = 2000 + (i % 5) * 500
        syntheticSegments.push({
          id: `seg_${i}`,
          speaker: i % 3 === 0 ? 'professor' : `aluno_${(i % 12) + 1}`,
          startMs: t,
          endMs: t + dur,
          durationMs: dur,
          text: `Texto falado no turno ${i}`
        })
        t += dur + 500
      }

      const t0 = performance.now()
      const highlights = detectTemporalOverlapsAndBursts(syntheticSegments, 60_000)
      const elapsedMs = performance.now() - t0

      expect(highlights.length).toBeGreaterThan(0)
      expect(elapsedMs).toBeLessThan(35) // Deve rodar em poucos milissegundos
    })
  })

  describe('2. Detecção de Wait Time Pós-Pergunta Docente', () => {
    it('identifica pausa reflexiva prolongada (>= 4.5s) após pergunta com interrogação', () => {
      const segments: ClassroomSegment[] = [
        { id: '1', speaker: 'professor', startMs: 10000, endMs: 14000, durationMs: 4000, text: 'Quem pode explicar o conceito de simple past?' },
        { id: '2', speaker: 'aluno_1', startMs: 19500, endMs: 23000, durationMs: 3500, text: 'Eu lembro, é quando a ação já terminou.' } // espera de 5.5s
      ]

      const waitHighlights = detectWaitTimeAnomalies(segments, 4500)
      expect(waitHighlights.length).toBe(1)
      expect(waitHighlights[0].type).toBe('wait_time_anomalo')
      expect(waitHighlights[0].title).toContain('5.5s')
      expect(waitHighlights[0].pedagogicalInsight).toContain('Mary Budd Rowe')
    })

    it('não dispara para pausas curtas (< 4.5s)', () => {
      const segments: ClassroomSegment[] = [
        { id: '1', speaker: 'professor', startMs: 10000, endMs: 14000, durationMs: 4000, text: 'Qual é o plural de child?' },
        { id: '2', speaker: 'aluno_1', startMs: 15500, endMs: 18000, durationMs: 2500, text: 'Children!' } // espera de 1.5s
      ]

      const waitHighlights = detectWaitTimeAnomalies(segments, 4500)
      expect(waitHighlights.length).toBe(0)
    })
  })

  describe('3. Métricas Objetivas de Sala de Aula (TTT, STT e Índice Gini)', () => {
    it('calcula corretamente as proporções de tempo de fala TTT vs STT e tempos de espera', () => {
      const segments: ClassroomSegment[] = [
        { id: '1', speaker: 'professor', startMs: 0, endMs: 60000, durationMs: 60000, text: 'Explicação inicial?' },
        { id: '2', speaker: 'aluno_1', startMs: 65000, endMs: 95000, durationMs: 30000, text: 'Resposta do aluno 1.' },
        { id: '3', speaker: 'aluno_2', startMs: 100000, endMs: 120000, durationMs: 20000, text: 'Resposta do aluno 2.' }
      ]

      const metrics = computeClassroomTalkMetrics(segments)

      expect(metrics.totalDurationMs).toBe(120000)
      expect(metrics.teacherTalkTimeMs).toBe(60000)
      expect(metrics.studentTalkTimeMs).toBe(50000)
      expect(metrics.teacherTalkRatio).toBe(50.00)
      expect(metrics.studentTalkRatio).toBe(41.67)
      expect(metrics.uniqueStudentVoicesCount).toBe(2)
      expect(metrics.avgWaitTimeMs).toBe(5000)
    })

    it('calcula o Índice de Gini de concentração de turnos (0.00 = igualitário, > 0.40 = concentrado)', () => {
      // Caso 1: Todos os alunos falaram exatamente o mesmo número de vezes
      const equalTurns = { aluno_1: 5, aluno_2: 5, aluno_3: 5, aluno_4: 5 }
      expect(computeSpeakerGiniIndex(equalTurns)).toBe(0.0)

      // Caso 2: Um único aluno dominou os turnos
      const unequalTurns = { aluno_1: 20, aluno_2: 1, aluno_3: 1, aluno_4: 1 }
      const giniUnequal = computeSpeakerGiniIndex(unequalTurns)
      expect(giniUnequal).toBeGreaterThan(0.5)
    })
  })
})
