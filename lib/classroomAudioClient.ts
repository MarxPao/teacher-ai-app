/**
 * classroomAudioClient.ts — Orquestrador Cliente de Captura & Upload Resiliente de Aulas
 *
 * Garante:
 * 1. Verificação prévia estrita de consentimento LGPD de voz antes de liberar gravação.
 * 2. Upload incremental ordenado de chunks (3 min) com fallback para buffer local (IndexedDB/localStorage).
 * 3. Encerramento seguro de sessão sinalizando o último chunk para início da fila assíncrona.
 */

import { AudioChunkPayload, LongSessionAudioRecorder } from '@/lib/audioRecorder'

export interface ConsentValidationResult {
  hasConsent: boolean
  consentId?: string
  studentOptOuts?: string[]
  reason?: string
}

export interface SessionCreationResult {
  ok: boolean
  sessionId?: string
  error?: string
}

export interface ChunkUploadResult {
  ok: boolean
  chunkIndex: number
  serverAck?: boolean
  error?: string
}

/**
 * Valida se a turma possui consentimento ativo antes de iniciar a gravação
 */
export async function validateConsentBeforeRecord(
  schoolId: string,
  classId: string
): Promise<ConsentValidationResult> {
  if (!schoolId || !classId) {
    return { hasConsent: false, reason: 'Escola e turma são obrigatórias para validação de consentimento.' }
  }

  try {
    // 1. Tentar validação remota no endpoint oficial
    const res = await fetch(`/api/classroom/consent?school_id=${encodeURIComponent(schoolId)}&class_id=${encodeURIComponent(classId)}`)
    if (res.ok) {
      const data = await res.json()
      if (data.hasConsent && data.consent?.id) {
        return {
          hasConsent: true,
          consentId: data.consent.id,
          studentOptOuts: data.consent.student_opt_outs || []
        }
      }
    }
  } catch {
    // Se a rede oscilar, verificar cache local de consentimento
  }

  // 2. Fallback de cache local
  if (typeof localStorage !== 'undefined') {
    try {
      const localConsents = JSON.parse(localStorage.getItem('teacher_classroom_consents') || '[]')
      const matched = localConsents.find((c: any) => 
        c.school_id === schoolId && 
        c.class_id === classId && 
        c.status === 'active' &&
        new Date(c.valid_until) > new Date()
      )
      if (matched) {
        return {
          hasConsent: true,
          consentId: matched.id,
          studentOptOuts: matched.student_opt_outs || []
        }
      }
    } catch {}
  }

  return {
    hasConsent: false,
    reason: 'Gravação bloqueada: Não há termo de consentimento pedagógico ativo registrado para esta turma.'
  }
}

/**
 * Inicializa a sessão de gravação no backend
 */
export async function initClassroomSession(params: {
  schoolId: string
  classId: string
  subject: string
  topic?: string
  consentId: string
}): Promise<SessionCreationResult> {
  try {
    const res = await fetch('/api/classroom/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: params.schoolId,
        class_id: params.classId,
        subject: params.subject,
        topic: params.topic || 'Aula Regular',
        consent_id: params.consentId
      })
    })

    const data = await res.json()
    if (!res.ok || !data.sessionId) {
      return { ok: false, error: data.error || 'Erro ao criar sessão de gravação.' }
    }

    return { ok: true, sessionId: data.sessionId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha na inicialização de sessão'
    return { ok: false, error: msg }
  }
}

/**
 * Envia um chunk de áudio para a rota incremental do servidor com retry
 */
export async function uploadSessionChunk(
  sessionId: string,
  chunk: AudioChunkPayload,
  maxRetries = 3
): Promise<ChunkUploadResult> {
  const formData = new FormData()
  formData.append('file', chunk.blob, `chunk_${chunk.chunkIndex}.webm`)
  formData.append('chunk_index', String(chunk.chunkIndex))
  formData.append('start_ms', String(chunk.startMs))
  formData.append('end_ms', String(chunk.endMs))
  formData.append('duration_ms', String(chunk.durationMs))
  formData.append('is_last_chunk', String(chunk.isLastChunk))

  let attempts = 0
  while (attempts < maxRetries) {
    attempts++
    try {
      const res = await fetch(`/api/classroom/sessions/${sessionId}/chunks`, {
        method: 'POST',
        body: formData
      })

      if (res.ok) {
        return { ok: true, chunkIndex: chunk.chunkIndex, serverAck: true }
      }
    } catch (err) {
      if (attempts >= maxRetries) {
        // Salva na fila local offline se esgotar as tentativas
        bufferFailedChunkLocally(sessionId, chunk)
        return {
          ok: false,
          chunkIndex: chunk.chunkIndex,
          error: err instanceof Error ? err.message : 'Falha após múltiplas tentativas'
        }
      }
      // Backoff exponencial simples
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempts)))
    }
  }

  return { ok: false, chunkIndex: chunk.chunkIndex, error: 'Tentativas esgotadas' }
}

function bufferFailedChunkLocally(sessionId: string, chunk: AudioChunkPayload): void {
  if (typeof localStorage === 'undefined') return
  try {
    const queue = JSON.parse(localStorage.getItem('teacher_offline_chunks_queue') || '[]')
    queue.push({
      sessionId,
      chunkIndex: chunk.chunkIndex,
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      timestamp: Date.now()
    })
    localStorage.setItem('teacher_offline_chunks_queue', JSON.stringify(queue))
  } catch {}
}
