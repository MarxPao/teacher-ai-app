/**
 * classroomHeuristics.ts — Algoritmos Acústicos e Heurísticos em O(N)
 *
 * Implementa:
 * 1. Janela deslizante Two-Pointer (dois ponteiros) O(N) para detecção de picos de participação e sobreposição.
 * 2. Detecção determinística de anomalias de Wait Time pós-perguntas docentes.
 * 3. Cálculo de métricas objetivas de sala de aula (TTT, STT, tempos de espera).
 * 4. Cálculo do Índice Gini de dispersão de turnos entre alunos.
 */

export interface ClassroomSegment {
  id: string
  speaker: string
  startMs: number
  endMs: number
  durationMs: number
  text: string
  confidence?: number
}

export interface HeuristicHighlight {
  type: 'momento_duvida' | 'alta_participacao' | 'explicacao_chave' | 'dispersao_ruido' | 'conceito_dificil' | 'engajamento_pico' | 'wait_time_anomalo'
  title: string
  summary: string
  startMs: number
  endMs: number
  triggerHeuristic: string
  heuristicScore: number
  pedagogicalInsight: string
  suggestedAction: string
}

export interface ClassroomObjectiveMetrics {
  totalDurationMs: number
  teacherTalkTimeMs: number
  studentTalkTimeMs: number
  silenceTimeMs: number
  teacherTalkRatio: number // TTT % (0.00 a 100.00)
  studentTalkRatio: number // STT % (0.00 a 100.00)
  questionsAskedCount: number
  avgWaitTimeMs: number
  minWaitTimeMs: number
  maxWaitTimeMs: number
  uniqueStudentVoicesCount: number
  turnDistribution: Record<string, number>
  giniIndex: number // 0.00 (perfeitamente distribuído) a 1.00 (monopolizado)
}

/**
 * Normaliza o rótulo de locutor para categorias canônicas
 */
export function isTeacher(speaker: string): boolean {
  return speaker.toLowerCase() === 'professor' || speaker.toLowerCase() === 'teacher'
}

export function isStudent(speaker: string): boolean {
  const lower = speaker.toLowerCase()
  return lower.startsWith('aluno_') || lower === 'coro_alunos'
}

/**
 * Algoritmo Two-Pointer estritamente O(N) para análise de janelas temporais de 60s
 */
export function detectTemporalOverlapsAndBursts(
  segments: ClassroomSegment[],
  windowDurationMs = 60_000
): HeuristicHighlight[] {
  if (!segments || segments.length === 0) return []

  const highlights: HeuristicHighlight[] = []
  const speakerCounts = new Map<string, number>()
  let left = 0

  for (let right = 0; right < segments.length; right++) {
    const current = segments[right]
    speakerCounts.set(current.speaker, (speakerCounts.get(current.speaker) || 0) + 1)

    // Contrai a janela pela esquerda enquanto a amplitude temporal exceder windowDurationMs
    while (left < right && (current.endMs - segments[left].startMs) > windowDurationMs) {
      const leftSpeaker = segments[left].speaker
      const count = speakerCounts.get(leftSpeaker)! - 1
      if (count <= 0) speakerCounts.delete(leftSpeaker)
      else speakerCounts.set(leftSpeaker, count)
      left++
    }

    // Avaliação em O(1) do estado acumulado da janela ativa [left..right]
    const distinctSpeakers = speakerCounts.size
    const totalTurnsInWindow = right - left + 1

    // Gatilho 1: Alta Participação Coletiva (>= 4 vozes distintas e >= 8 turnos em 60s)
    if (distinctSpeakers >= 4 && totalTurnsInWindow >= 8) {
      // Evita duplicatas consecutivas sobrepostas
      const lastH = highlights[highlights.length - 1]
      if (!lastH || (segments[left].startMs > lastH.endMs)) {
        highlights.push({
          type: 'alta_participacao',
          title: `Pico de Debate Coletivo (${distinctSpeakers} vozes)`,
          summary: `Intercalação dinâmica com ${totalTurnsInWindow} turnos de fala entre ${distinctSpeakers} vozes em 60 segundos.`,
          startMs: segments[left].startMs,
          endMs: current.endMs,
          triggerHeuristic: 'burst_participation_sliding_window',
          heuristicScore: Math.min(1.0, 0.75 + (distinctSpeakers * 0.05)),
          pedagogicalInsight: 'Momento de alta mobilização e troca entre os alunos.',
          suggestedAction: 'Registrar estratégias de mediação que incentivaram este engajamento.'
        })
      }
    }
  }

  // Gatilho 2: Sobreposição prolongada de falas (Overlapping speech >= 2000ms)
  for (let i = 0; i < segments.length - 1; i++) {
    const curr = segments[i]
    const next = segments[i + 1]

    if (next.startMs < curr.endMs) {
      const overlapDuration = Math.min(curr.endMs, next.endMs) - next.startMs
      if (overlapDuration >= 2000) {
        highlights.push({
          type: 'dispersao_ruido',
          title: `Sobreposição de Vozes (${(overlapDuration / 1000).toFixed(1)}s)`,
          summary: `Falas simultâneas entre ${curr.speaker} e ${next.speaker} por mais de 2 segundos.`,
          startMs: next.startMs,
          endMs: Math.max(curr.endMs, next.endMs),
          triggerHeuristic: 'overlapping_speech_burst',
          heuristicScore: 0.82,
          pedagogicalInsight: 'Sobreposição de vozes ou agitação na sala.',
          suggestedAction: 'Verificar se foi entusiasmo construtivo ou ruído paralelo.'
        })
      }
    }
  }

  return highlights
}

/**
 * Detecção de anomalias de Wait-Time pós-pergunta docente (silêncio >= 4.5s)
 */
export function detectWaitTimeAnomalies(
  segments: ClassroomSegment[],
  thresholdMs = 4500
): HeuristicHighlight[] {
  if (!segments || segments.length < 2) return []

  const highlights: HeuristicHighlight[] = []

  for (let i = 0; i < segments.length - 1; i++) {
    const curr = segments[i]
    const next = segments[i + 1]

    const textTrimmed = curr.text.trim()
    const isQuestion = isTeacher(curr.speaker) && (
      textTrimmed.endsWith('?') ||
      /\b(o que|quem|qual|como|onde|por que|por quê|quando|quanto|explica|diz pra mim)\b/i.test(textTrimmed)
    )

    if (isQuestion) {
      const waitTimeMs = next.startMs - curr.endMs
      if (waitTimeMs >= thresholdMs) {
        highlights.push({
          type: 'wait_time_anomalo',
          title: `Pausa Reflexiva Prolongada (${(waitTimeMs / 1000).toFixed(1)}s)`,
          summary: `O professor fez uma pergunta e houve ${(waitTimeMs / 1000).toFixed(1)}s de espera antes da intervenção de ${next.speaker}.`,
          startMs: curr.endMs,
          endMs: next.startMs,
          triggerHeuristic: 'prolonged_silence_after_question',
          heuristicScore: 0.88,
          pedagogicalInsight: waitTimeMs > 8000 
            ? 'Hesitação excessiva: o conceito pode não ter ficado claro para a turma.'
            : 'Tempo de espera produtivo favorecendo processamento cognitivo profundo (Mary Budd Rowe).',
          suggestedAction: waitTimeMs > 8000
            ? 'Reformular a pergunta em termos mais simples ou pedir resposta em duplas.'
            : 'Manter a pausa deliberada antes de dar a resposta.'
        })
      }
    }
  }

  return highlights
}

/**
 * Calcula o Índice de Gini de concentração de turnos (0.00 = igualitário, 1.00 = monopolizado)
 */
export function computeSpeakerGiniIndex(turnDistribution: Record<string, number>): number {
  const values = Object.values(turnDistribution).filter(v => v > 0).sort((a, b) => a - b)
  const n = values.length
  if (n <= 1) return 0.0 // Sem desigualdade mensurável com 0 ou 1 aluno

  const sumValues = values.reduce((acc, v) => acc + v, 0)
  if (sumValues === 0) return 0.0

  let cumulativeNumerator = 0
  for (let i = 0; i < n; i++) {
    cumulativeNumerator += (2 * (i + 1) - n - 1) * values[i]
  }

  const gini = cumulativeNumerator / (n * sumValues)
  return Math.max(0.0, Math.min(1.0, Number(gini.toFixed(3))))
}

/**
 * Computa o conjunto integral de métricas objetivas de sala de aula
 */
export function computeClassroomTalkMetrics(segments: ClassroomSegment[]): ClassroomObjectiveMetrics {
  if (!segments || segments.length === 0) {
    return {
      totalDurationMs: 0,
      teacherTalkTimeMs: 0,
      studentTalkTimeMs: 0,
      silenceTimeMs: 0,
      teacherTalkRatio: 0.0,
      studentTalkRatio: 0.0,
      questionsAskedCount: 0,
      avgWaitTimeMs: 0,
      minWaitTimeMs: 0,
      maxWaitTimeMs: 0,
      uniqueStudentVoicesCount: 0,
      turnDistribution: {},
      giniIndex: 0.0
    }
  }

  const firstStart = segments[0].startMs
  const lastEnd = segments[segments.length - 1].endMs
  const totalDurationMs = Math.max(1, lastEnd - firstStart)

  let teacherTalkMs = 0
  let studentTalkMs = 0
  let totalSpeechMs = 0
  let questionsCount = 0
  const waitTimes: number[] = []
  const studentTurns: Record<string, number> = {}

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const dur = Math.max(0, seg.endMs - seg.startMs)
    totalSpeechMs += dur

    if (isTeacher(seg.speaker)) {
      teacherTalkMs += dur
      if (seg.text.includes('?') || /\b(o que|quem|qual|como|onde|por que|quando)\b/i.test(seg.text)) {
        questionsCount++
        if (i < segments.length - 1) {
          const nextSeg = segments[i + 1]
          if (isStudent(nextSeg.speaker) && nextSeg.startMs >= seg.endMs) {
            waitTimes.push(nextSeg.startMs - seg.endMs)
          }
        }
      }
    } else if (isStudent(seg.speaker)) {
      studentTalkMs += dur
      studentTurns[seg.speaker] = (studentTurns[seg.speaker] || 0) + 1
    }
  }

  const silenceMs = Math.max(0, totalDurationMs - totalSpeechMs)
  const teacherRatio = Number(((teacherTalkMs / totalDurationMs) * 100).toFixed(2))
  const studentRatio = Number(((studentTalkMs / totalDurationMs) * 100).toFixed(2))

  const avgWait = waitTimes.length > 0 
    ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) 
    : 0
  const minWait = waitTimes.length > 0 ? Math.min(...waitTimes) : 0
  const maxWait = waitTimes.length > 0 ? Math.max(...waitTimes) : 0

  const gini = computeSpeakerGiniIndex(studentTurns)
  const uniqueStudentCount = Object.keys(studentTurns).length

  return {
    totalDurationMs,
    teacherTalkTimeMs: teacherTalkMs,
    studentTalkTimeMs: studentTalkMs,
    silenceTimeMs: silenceMs,
    teacherTalkRatio: teacherRatio,
    studentTalkRatio: studentRatio,
    questionsAskedCount: questionsCount,
    avgWaitTimeMs: avgWait,
    minWaitTimeMs: minWait,
    maxWaitTimeMs: maxWait,
    uniqueStudentVoicesCount: uniqueStudentCount,
    turnDistribution: studentTurns,
    giniIndex: gini
  }
}
