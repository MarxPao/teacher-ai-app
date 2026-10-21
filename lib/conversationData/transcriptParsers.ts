/**
 * lib/conversationData/transcriptParsers.ts
 *
 * Parsers tolerantes para .vtt, .srt e .txt com formato "Nome: fala" ou "<v Nome>fala".
 * Zero dependências novas (implementação pura em TypeScript).
 *
 * NOTA DE CONFORMIDADE:
 * Formato real de exportação de Zoom/Teams/Meet: NÃO VERIFICADO até o dono fornecer uma exportação real.
 */

import type { ConversationVaultRepository } from './schema'
import type { SessionRecord, TurnRecord, SpeakerMapRecord, SpeakerRole, SessionType } from './types'

export interface ParsedRawTurn {
  speakerRaw: string
  startMs: number
  endMs: number
  text: string
}

export function parseTimestampToMs(timestampStr: string): number {
  const clean = timestampStr.trim().replace(',', '.')
  const parts = clean.split(':')

  if (parts.length === 3) {
    const hours = parseFloat(parts[0])
    const minutes = parseFloat(parts[1])
    const seconds = parseFloat(parts[2])
    return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000)
  }

  if (parts.length === 2) {
    const minutes = parseFloat(parts[0])
    const seconds = parseFloat(parts[1])
    return Math.round((minutes * 60 + seconds) * 1000)
  }

  const sec = parseFloat(clean)
  return isNaN(sec) ? 0 : Math.round(sec * 1000)
}

/**
 * Parser tolerante para WebVTT (.vtt)
 */
export function parseVtt(content: string): ParsedRawTurn[] {
  const lines = content.split(/\r?\n/)
  const turns: ParsedRawTurn[] = []

  let currentStart = 0
  let currentEnd = 0
  let isBlockActive = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('WEBVTT') || line.startsWith('NOTE')) {
      isBlockActive = false
      continue
    }

    // Linha de timestamp: 00:00:02.000 --> 00:00:08.500
    if (line.includes('-->')) {
      const [startStr, endStr] = line.split('-->').map(s => s.trim().split(' ')[0])
      currentStart = parseTimestampToMs(startStr)
      currentEnd = parseTimestampToMs(endStr)
      isBlockActive = true
      continue
    }

    if (isBlockActive && line) {
      let speakerRaw = 'Desconhecido'
      let text = line

      // 1. Tag de locutor WebVTT: <v Nome>fala</v>
      const vMatch = line.match(/^<v\s+([^>]+)>(.*?)<\/v>$/i) || line.match(/^<v\s+([^>]+)>(.*)$/i)
      if (vMatch) {
        speakerRaw = vMatch[1].trim()
        text = vMatch[2].replace(/<\/v>/gi, '').trim()
      } else {
        // 2. Formato convencional: Nome: fala
        const colonMatch = line.match(/^([^:\n]+):\s*(.*)$/)
        if (colonMatch) {
          speakerRaw = colonMatch[1].trim()
          text = colonMatch[2].trim()
        }
      }

      turns.push({
        speakerRaw,
        startMs: currentStart,
        endMs: currentEnd > currentStart ? currentEnd : currentStart + 5000,
        text
      })
    }
  }

  return turns
}

/**
 * Parser tolerante para SubRip (.srt)
 */
export function parseSrt(content: string): ParsedRawTurn[] {
  const blocks = content.split(/\r?\n\r?\n/)
  const turns: ParsedRawTurn[] = []

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) continue

    // A linha com timestamp pode ser a primeira ou a segunda (se houver índice numérico)
    const timeLineIdx = lines[0].includes('-->') ? 0 : lines[1]?.includes('-->') ? 1 : -1
    if (timeLineIdx === -1) continue

    const [startStr, endStr] = lines[timeLineIdx].split('-->').map(s => s.trim())
    const startMs = parseTimestampToMs(startStr)
    const endMs = parseTimestampToMs(endStr)

    const textLines = lines.slice(timeLineIdx + 1).join(' ')
    let speakerRaw = 'Desconhecido'
    let text = textLines

    const colonMatch = textLines.match(/^([^:\n]+):\s*(.*)$/)
    if (colonMatch) {
      speakerRaw = colonMatch[1].trim()
      text = colonMatch[2].trim()
    }

    turns.push({
      speakerRaw,
      startMs,
      endMs: endMs > startMs ? endMs : startMs + 5000,
      text
    })
  }

  return turns
}

/**
 * Parser tolerante para .txt com linhas no formato [00:01:00 - 00:01:20] Nome: fala ou Nome: fala
 */
export function parseTxtTranscript(content: string): ParsedRawTurn[] {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const turns: ParsedRawTurn[] = []
  let syntheticClockMs = 0

  for (const line of lines) {
    let startMs = syntheticClockMs
    let endMs = syntheticClockMs + 5000
    let cleanLine = line

    // Detecta [MM:SS - MM:SS] ou [MM:SS]
    const bracketTimeMatch = line.match(/^\[([0-9:.,]+)(?:\s*-\s*([0-9:.,]+))?\]\s*(.*)$/)
    if (bracketTimeMatch) {
      startMs = parseTimestampToMs(bracketTimeMatch[1])
      if (bracketTimeMatch[2]) {
        endMs = parseTimestampToMs(bracketTimeMatch[2])
      } else {
        endMs = startMs + 5000
      }
      cleanLine = bracketTimeMatch[3]
    }

    let speakerRaw = 'Desconhecido'
    let text = cleanLine

    const colonMatch = cleanLine.match(/^([^:\n]+):\s*(.*)$/)
    if (colonMatch) {
      speakerRaw = colonMatch[1].trim()
      text = colonMatch[2].trim()
    }

    turns.push({
      speakerRaw,
      startMs,
      endMs,
      text
    })

    syntheticClockMs = endMs + 1000
  }

  return turns
}

export function isUnknownSpeakerName(name: string): boolean {
  const lower = name.toLowerCase().trim()
  return (
    lower === 'desconhecido' ||
    lower === 'voz desconhecida' ||
    lower === 'spk_unknown' ||
    lower === 'spk_desconhecido' ||
    lower.startsWith('desconhecido') ||
    lower === ''
  )
}

export interface ImportTranscriptParams {
  content: string
  format: 'vtt' | 'srt' | 'txt'
  sessionId: string
  title: string
  sessionType: SessionType
  teacherSpeakerName: string
  retentionDays?: number
}

export async function importTranscriptFile(
  repo: ConversationVaultRepository,
  params: ImportTranscriptParams
): Promise<SessionRecord> {
  let rawTurns: ParsedRawTurn[] = []

  if (params.format === 'vtt') {
    rawTurns = parseVtt(params.content)
  } else if (params.format === 'srt') {
    rawTurns = parseSrt(params.content)
  } else {
    rawTurns = parseTxtTranscript(params.content)
  }

  if (rawTurns.length === 0) {
    throw new Error('Nenhum turno de fala identificado no arquivo fornecido.')
  }

  const totalDurationMs = rawTurns[rawTurns.length - 1].endMs

  const session: SessionRecord = {
    id: params.sessionId,
    title: params.title,
    session_type: params.sessionType,
    total_duration_ms: totalDurationMs,
    retention_days: params.retentionDays || 90
  }

  await repo.createSession(session)

  // Mapeamento de papéis e falantes
  const uniqueSpeakers = Array.from(new Set(rawTurns.map(t => t.speakerRaw)))
  const speakerRoleLookup = new Map<string, SpeakerRole>()
  const speakerMaps: SpeakerMapRecord[] = []

  uniqueSpeakers.forEach((spkName, idx) => {
    const label = `spk_${idx + 1}`
    let role: SpeakerRole = 'aluno'
    let source: 'manual' | 'inferido' = 'inferido'
    let assignedName: string | null = spkName

    if (isUnknownSpeakerName(spkName)) {
      role = 'desconhecido'
      assignedName = null
    } else if (
      spkName.toLowerCase().trim() === params.teacherSpeakerName.toLowerCase().trim() ||
      spkName.toLowerCase().includes(params.teacherSpeakerName.toLowerCase().trim())
    ) {
      role = params.sessionType === 'reuniao' ? 'coordenador' : 'professor'
      source = 'manual'
    } else {
      role = 'aluno'
    }

    speakerRoleLookup.set(spkName, role)

    speakerMaps.push({
      id: `${params.sessionId}_spk_${idx}`,
      session_id: params.sessionId,
      speaker_label: label,
      assigned_name: assignedName,
      role,
      source,
      confidence: source === 'manual' ? 1.0 : role === 'desconhecido' ? 0.4 : 0.85
    })
  })

  await repo.upsertSpeakerMap(speakerMaps)

  // Turnos persistidos
  const turns: TurnRecord[] = rawTurns.map((t, idx) => {
    const role = speakerRoleLookup.get(t.speakerRaw) || 'desconhecido'
    const spkMapEntry = speakerMaps.find(m => m.assigned_name === t.speakerRaw) || speakerMaps.find(m => m.role === 'desconhecido')
    const speakerLabel = spkMapEntry?.speaker_label || `spk_unk_${idx}`

    return {
      id: `${params.sessionId}_turn_${idx}`,
      session_id: params.sessionId,
      speaker_label: speakerLabel,
      role,
      start_ms: t.startMs,
      end_ms: t.endMs,
      text: t.text,
      turn_index: idx
    }
  })

  await repo.insertTurns(turns)

  return session
}
