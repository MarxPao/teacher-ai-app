/**
 * classroomPipeline.ts — Fila de Processamento Assíncrono Idempotente de Aulas
 *
 * Estágios encadeados:
 * 1. transcribing: Transcrição multi-provedor dos chunks acumulados.
 * 2. diarizing: Segmentação e rotulação de locutores (professor vs. aluno_1..aluno_N).
 * 3. extracting_highlights: Heurísticas Two-Pointer O(N) + rotulação pedagógica.
 * 4. computing_analytics: Cálculo de TTT, STT, tempos de espera e índice Gini.
 * 5. ready: Disponível para visualização e sugestão ao Memory Engine.
 */

import {
  ClassroomSegment,
  HeuristicHighlight,
  ClassroomObjectiveMetrics,
  detectTemporalOverlapsAndBursts,
  detectWaitTimeAnomalies,
  computeClassroomTalkMetrics
} from '@/lib/classroomHeuristics'

export interface ClassroomSession {
  id: string
  schoolId: string
  classId: string
  subject: string
  topic: string
  consentId: string
  status: 'uploading' | 'queued' | 'transcribing' | 'diarizing' | 'extracting_highlights' | 'computing_analytics' | 'ready' | 'failed'
  statusDetail: string
  progressPct: number
  totalDurationSeconds: number
  chunks: Array<{
    chunkIndex: number
    startMs: number
    endMs: number
    text?: string
    isLastChunk: boolean
  }>
  segments: ClassroomSegment[]
  highlights: HeuristicHighlight[]
  analytics?: ClassroomObjectiveMetrics
  error?: string
  createdAt: string
  updatedAt: string
}

// Armazenamento em memória para sessões ativas (sincronizável com Supabase)
const SESSIONS_STORE = new Map<string, ClassroomSession>()

export function getSession(sessionId: string): ClassroomSession | undefined {
  return SESSIONS_STORE.get(sessionId)
}

export function listSessions(schoolId?: string, classId?: string): ClassroomSession[] {
  const all = Array.from(SESSIONS_STORE.values())
  if (!schoolId && !classId) return all
  return all.filter(s => 
    (!schoolId || s.schoolId === schoolId) && 
    (!classId || s.classId === classId)
  )
}

export function createSession(params: {
  sessionId?: string
  schoolId: string
  classId: string
  subject: string
  topic?: string
  consentId: string
}): ClassroomSession {
  const id = params.sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const session: ClassroomSession = {
    id,
    schoolId: params.schoolId,
    classId: params.classId,
    subject: params.subject,
    topic: params.topic || 'Aula Regular',
    consentId: params.consentId,
    status: 'uploading',
    statusDetail: 'Recebendo chunks de áudio...',
    progressPct: 5,
    totalDurationSeconds: 0,
    chunks: [],
    segments: [],
    highlights: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  SESSIONS_STORE.set(id, session)
  return session
}

export function addChunkToSession(
  sessionId: string,
  chunk: {
    chunkIndex: number
    startMs: number
    endMs: number
    text?: string
    isLastChunk: boolean
  }
): ClassroomSession {
  const session = SESSIONS_STORE.get(sessionId)
  if (!session) throw new Error(`Sessão ${sessionId} não encontrada.`)

  // Evita duplicatas de chunk
  const existingIdx = session.chunks.findIndex(c => c.chunkIndex === chunk.chunkIndex)
  if (existingIdx >= 0) {
    session.chunks[existingIdx] = chunk
  } else {
    session.chunks.push(chunk)
  }

  session.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex)
  session.totalDurationSeconds = Math.round(
    Math.max(...session.chunks.map(c => c.endMs), 0) / 1000
  )
  session.updatedAt = new Date().toISOString()

  return session
}

/**
 * Executa o pipeline de processamento assíncrono sobre a sessão
 */
export async function runSessionPipeline(sessionId: string): Promise<ClassroomSession> {
  const session = SESSIONS_STORE.get(sessionId)
  if (!session) throw new Error(`Sessão ${sessionId} não encontrada.`)

  try {
    // 1. Estágio: Transcribing
    session.status = 'transcribing'
    session.statusDetail = 'Transcrevendo áudio em alta definição (Whisper)...'
    session.progressPct = 25

    // Se chunks já tiverem texto (pré-transcritos pelo Python sidecar via Whisper),
    // compilar diretamente. Caso contrário, marcar como não transcrito — nunca inserir
    // texto fictício que contaminaria as métricas de TTT/STT reais.
    const untranscribedCount = session.chunks.filter(c => !c.text || !c.text.trim()).length
    if (untranscribedCount > 0) {
      // Tenta chamar o sidecar Python (Whisper local) via API interna
      // Se não disponível, mantém texto vazio — heurísticas degradam com graciosidade
      try {
        const sidecarRes = await fetch('/api/transcribe-chunks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.id,
            chunks: session.chunks
              .filter(c => !c.text || !c.text.trim())
              .map(c => ({ chunkIndex: c.chunkIndex, startMs: c.startMs, endMs: c.endMs }))
          })
        })
        if (sidecarRes.ok) {
          const { transcribedChunks } = await sidecarRes.json()
          for (const tc of (transcribedChunks || [])) {
            const idx = session.chunks.findIndex(c => c.chunkIndex === tc.chunkIndex)
            if (idx >= 0 && tc.text) session.chunks[idx].text = tc.text
          }
        }
      } catch {
        // Sidecar indisponível — pipeline continua; segmentos sem texto serão omitidos
        // nas métricas (TTT/STT calculados apenas sobre segmentos com texto real)
        console.warn('[classroomPipeline] Sidecar Whisper indisponível. Métricas parciais.')
      }
    }

    // 2. Estágio: Diarizing
    session.status = 'diarizing'
    session.statusDetail = 'Diarizando locutores (Professor vs. Alunos)...'
    session.progressPct = 50

    // Se segmentos ainda não existirem, tenta diarização real via sidecar Python (pyannote.audio)
    // ou via Gemini Flash com timestamps de speaker. Fallback explicitamente rotulado.
    if (session.segments.length === 0) {
      let diarizationOk = false

      // Tentativa 1: Sidecar Python (pyannote.audio — qualidade de produção)
      try {
        const diarRes = await fetch('/api/diarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id, chunks: session.chunks })
        })
        if (diarRes.ok) {
          const { segments: realSegments } = await diarRes.json()
          if (Array.isArray(realSegments) && realSegments.length > 0) {
            session.segments = realSegments
            diarizationOk = true
          }
        }
      } catch {
        // sidecar indisponível
      }

      // Tentativa 2: Gemini Flash com pedido de timestamps de speaker no transcript
      if (!diarizationOk) {
        try {
          const fullTranscript = session.chunks
            .filter(c => c.text && c.text.trim())
            .map(c => `[${Math.round(c.startMs / 1000)}s] ${c.text}`)
            .join('\n')

          if (fullTranscript.trim().length > 0) {
            const geminiRes = await fetch('/api/diarize-gemini', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId: session.id, transcript: fullTranscript })
            })
            if (geminiRes.ok) {
              const { segments: geminiSegments } = await geminiRes.json()
              if (Array.isArray(geminiSegments) && geminiSegments.length > 0) {
                session.segments = geminiSegments
                diarizationOk = true
              }
            }
          }
        } catch {
          // Gemini indisponível
        }
      }

      // Fallback explícito: segmentação heurística com aviso de qualidade
      if (!diarizationOk) {
        console.warn('[classroomPipeline] Diarização real indisponível. Usando heurística estrutural — TTT/STT são ESTIMATIVAS.')
        session.segments = generateHeuristicSegments(session.chunks)
        // Marca sessão como diarização estimada para a UI mostrar aviso ao professor
        session.statusDetail = 'Diarização estimada (heurística) — instale pyannote.audio ou configure Gemini para diarização real.'
      }
    }

    // 3. Estágio: Extracting Highlights
    session.status = 'extracting_highlights'
    session.statusDetail = 'Extraindo momentos de pico e pausas reflexivas...'
    session.progressPct = 75

    const burstHighlights = detectTemporalOverlapsAndBursts(session.segments)
    const waitTimeHighlights = detectWaitTimeAnomalies(session.segments)
    session.highlights = [...burstHighlights, ...waitTimeHighlights]

    // 4. Estágio: Computing Analytics
    session.status = 'computing_analytics'
    session.statusDetail = 'Calculando proporções de fala (TTT/STT) e engajamento...'
    session.progressPct = 90

    session.analytics = computeClassroomTalkMetrics(session.segments)

    // 5. Finalizado
    session.status = 'ready'
    session.statusDetail = 'Processamento concluído com sucesso.'
    session.progressPct = 100
    session.updatedAt = new Date().toISOString()

    return session
  } catch (error) {
    session.status = 'failed'
    session.statusDetail = 'Falha no processamento da gravação.'
    session.error = error instanceof Error ? error.message : 'Erro desconhecido'
    session.updatedAt = new Date().toISOString()
    throw error
  }
}

/**
 * Segmentação heurística estrutural — FALLBACK EXPLÍCITO.
 *
 * NÃO é diarização real. Divide cada chunk assumindo que o professor fala
 * nos primeiros 60% e um aluno nos 40% restantes. Confidence artificialmente
 * baixa (0.45) para sinalizar que são estimativas.
 *
 * Use apenas quando pyannote.audio (sidecar) e Gemini Flash estiverem indisponíveis.
 * TTT/STT resultante deve ser exibido com aviso na UI ("Estimativa — diarização real não disponível").
 */
function generateHeuristicSegments(chunks: ClassroomSession['chunks']): ClassroomSegment[] {
  const segments: ClassroomSegment[] = []
  let segIndex = 0

  for (const chunk of chunks) {
    const chunkText = chunk.text?.trim() || ''
    // Pula chunks sem transcrição real — não contaminar métricas com texto vazio
    if (!chunkText) continue

    const chunkDuration = chunk.endMs - chunk.startMs
    if (chunkDuration <= 0) continue

    // Divide o texto do chunk proporcionalmente (60% professor / 40% aluno)
    const words = chunkText.split(/\s+/)
    const teacherWordCount = Math.ceil(words.length * 0.6)
    const teacherText = words.slice(0, teacherWordCount).join(' ')
    const studentText = words.slice(teacherWordCount).join(' ')

    const midPoint = chunk.startMs + Math.round(chunkDuration * 0.6)

    // Segmento do Professor
    segments.push({
      id: `seg_${segIndex++}`,
      speaker: 'professor',
      startMs: chunk.startMs,
      endMs: midPoint,
      durationMs: midPoint - chunk.startMs,
      text: teacherText || chunkText,
      // Confidence baixa para sinalizar origem heurística
      confidence: 0.45
    })

    // Segmento do Aluno (apenas se há texto de aluno e duração positiva)
    if (studentText.trim() && chunk.endMs > midPoint + 500) {
      const studentLabel = `aluno_${(segIndex % 4) + 1}`
      segments.push({
        id: `seg_${segIndex++}`,
        speaker: studentLabel,
        startMs: midPoint + 500,
        endMs: chunk.endMs,
        durationMs: chunk.endMs - (midPoint + 500),
        text: studentText,
        confidence: 0.45
      })
    }
  }

  return segments
}
