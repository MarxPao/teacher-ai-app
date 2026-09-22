/**
 * lib/classroomAudioPurge.ts — Serviço de Purga Física e Descarte de Áudio (LGPD / Zero-Retention)
 *
 * Garante a eliminação definitiva de arquivos de áudio bruto e chunks no Supabase Storage
 * assim que o prazo de retenção (7 dias) expirar (audio_retained_until <= NOW()).
 *
 * Políticas:
 * 1. Zero-Retention: áudio de menores não pode ser mantido indefinidamente por omissão.
 * 2. Limpeza em 2 vias: exclusão física no Storage Bucket + anulação de ponteiros no DB.
 * 3. Idempotência: sessões já purgadas (audio_purged_at IS NOT NULL) são ignoradas.
 * 4. Modo Simulação (dryRun): auditoria prévia sem mutação física.
 */

export interface AudioPurgeOptions {
  dryRun?: boolean
  referenceNow?: Date
  supabaseUrl?: string
  serviceKey?: string
}

export interface AudioPurgeReport {
  timestamp: string
  dryRun: boolean
  expiredSessionsCount: number
  purgedSessionsCount: number
  deletedFilesCount: number
  deletedStoragePaths: string[]
  errors: string[]
  summary: string
}

interface SessionRecord {
  id: string
  audio_storage_path?: string | null
  created_at: string
  audio_retained_until: string
}

interface ChunkRecord {
  id: string
  storage_path?: string | null
}

export async function purgeExpiredClassroomAudio(
  options: AudioPurgeOptions = {}
): Promise<AudioPurgeReport> {
  const now = options.referenceNow || new Date()
  const nowIso = now.toISOString()
  const dryRun = options.dryRun ?? false

  const supabaseUrl =
    options.supabaseUrl ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'https://parxakvjvuvsmvbvrshk.supabase.co'

  const serviceKey =
    options.serviceKey ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''

  const headers: Record<string, string> = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json'
  }

  const deletedStoragePaths: string[] = []
  const errors: string[] = []
  let expiredSessionsCount = 0
  let purgedSessionsCount = 0

  try {
    // 1. Buscar sessões com retenção expirada e ainda não purgadas
    const queryUrl = `${supabaseUrl}/rest/v1/class_recording_sessions?audio_retained_until=lte.${encodeURIComponent(nowIso)}&audio_purged_at=is.null&select=id,audio_storage_path,created_at,audio_retained_until`

    const resSessions = await fetch(queryUrl, { method: 'GET', headers })
    if (!resSessions.ok) {
      const errText = await resSessions.text().catch(() => '')
      throw new Error(`Falha ao consultar sessões expiradas: HTTP ${resSessions.status} - ${errText}`)
    }

    const sessions: SessionRecord[] = await resSessions.json()
    expiredSessionsCount = sessions.length

    if (expiredSessionsCount === 0) {
      return {
        timestamp: nowIso,
        dryRun,
        expiredSessionsCount: 0,
        purgedSessionsCount: 0,
        deletedFilesCount: 0,
        deletedStoragePaths: [],
        errors: [],
        summary: 'Nenhuma gravação de aula com prazo de retenção expirado encontrada.'
      }
    }

    for (const session of sessions) {
      const sessionFilePaths: string[] = []

      if (session.audio_storage_path) {
        sessionFilePaths.push(session.audio_storage_path)
      }

      // 2. Buscar chunks de áudio associados à sessão
      const chunksUrl = `${supabaseUrl}/rest/v1/class_recording_chunks?session_id=eq.${encodeURIComponent(session.id)}&storage_path=not.is.null&select=id,storage_path`
      const resChunks = await fetch(chunksUrl, { method: 'GET', headers })

      if (resChunks.ok) {
        const chunks: ChunkRecord[] = await resChunks.json()
        for (const chunk of chunks) {
          if (chunk.storage_path) {
            sessionFilePaths.push(chunk.storage_path)
          }
        }
      }

      if (dryRun) {
        deletedStoragePaths.push(...sessionFilePaths)
        purgedSessionsCount++
        continue
      }

      // 3. Execução Física: Deletar arquivos no Supabase Storage (bucket 'class-recordings')
      if (sessionFilePaths.length > 0) {
        const storageDeleteUrl = `${supabaseUrl}/storage/v1/object/class-recordings`
        const storageRes = await fetch(storageDeleteUrl, {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ prefixes: sessionFilePaths })
        })

        if (!storageRes.ok) {
          const errDetail = await storageRes.text().catch(() => '')
          errors.push(`Erro ao deletar arquivos da sessão ${session.id} no Storage: ${errDetail}`)
          // Continua para tentar marcar o banco e evitar loop infinito se o arquivo já foi removido
        } else {
          deletedStoragePaths.push(...sessionFilePaths)
        }
      }

      // 4. Marcar sessão como purgada e limpar ponteiros de storage
      const patchSessionUrl = `${supabaseUrl}/rest/v1/class_recording_sessions?id=eq.${encodeURIComponent(session.id)}`
      const patchSessionRes = await fetch(patchSessionUrl, {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          audio_purged_at: nowIso,
          audio_storage_path: null
        })
      })

      if (!patchSessionRes.ok) {
        errors.push(`Erro ao atualizar status de purga da sessão ${session.id}`)
      } else {
        purgedSessionsCount++
      }

      // 5. Limpar ponteiros de chunks
      const patchChunksUrl = `${supabaseUrl}/rest/v1/class_recording_chunks?session_id=eq.${encodeURIComponent(session.id)}`
      await fetch(patchChunksUrl, {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          storage_path: null
        })
      }).catch(() => {})
    }

    return {
      timestamp: nowIso,
      dryRun,
      expiredSessionsCount,
      purgedSessionsCount,
      deletedFilesCount: deletedStoragePaths.length,
      deletedStoragePaths,
      errors,
      summary: dryRun
        ? `[SIMULAÇÃO] ${expiredSessionsCount} sessão(ões) expirada(s) elegível(is) para purga (${deletedStoragePaths.length} arquivos mapeados).`
        : `[PURGA CONCLUÍDA] ${purgedSessionsCount}/${expiredSessionsCount} sessão(ões) descartada(s) fisicamente (${deletedStoragePaths.length} arquivos excluídos do Storage).`
    }
  } catch (err: any) {
    errors.push(err?.message || 'Erro inesperado no processo de purga')
    return {
      timestamp: nowIso,
      dryRun,
      expiredSessionsCount,
      purgedSessionsCount,
      deletedFilesCount: deletedStoragePaths.length,
      deletedStoragePaths,
      errors,
      summary: `Falha crítica durante a purga de áudio: ${err?.message}`
    }
  }
}
