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

export const NON_SPEAKER_PREFIXES = /^(atenção|atencao|exemplo|nota|obs|observação|observacao|importante|dica|questão|questao|exercício|exercicio|passo|resposta|item|aviso|lembrete|contexto|definição|definicao|fonte)\b/i

export function isValidSpeakerCandidate(
  candidate: string,
  knownSpeakers: string[] = [],
  frequencies: Map<string, number> = new Map()
): boolean {
  const trimmed = candidate.trim()
  if (!trimmed) return false
  if (NON_SPEAKER_PREFIXES.test(trimmed)) return false

  // Se estiver na lista informada pelo usuário
  if (knownSpeakers.some(k => k.toLowerCase() === trimmed.toLowerCase())) {
    return true
  }

  // Nome curto (máximo 4 palavras)
  const words = trimmed.split(/\s+/)
  if (words.length > 4) return false

  // Se tem prefixo típico de falante
  if (/^(prof|profa|professor|professora|aluno|aluna|estudante|coord|coordenador|coordenadora|spk|speaker|locutor|locutora)\b/i.test(trimmed)) {
    return true
  }

  // Se se repete mais de uma vez na transcrição
  const count = frequencies.get(trimmed.toLowerCase()) || 0
  if (count > 1) return true

  // Se parece com um nome próprio capitalizado curto (1 a 3 palavras capitalizadas)
  if (words.every(w => /^[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][a-záéíóúâêîôûãõç]+$/.test(w)) && words.length <= 3) {
    return true
  }

  return false
}

/**
 * Parser tolerante para .txt com linhas no formato [00:01:00 - 00:01:20] Nome: fala ou Nome: fala
 */
export function parseTxtTranscript(content: string, knownSpeakers: string[] = []): ParsedRawTurn[] {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const turns: ParsedRawTurn[] = []
  let syntheticClockMs = 0

  // 1. Contagem prévia de frequências para desambiguar falsos positivos de falantes
  const frequencies = new Map<string, number>()
  for (const line of lines) {
    const clean = line.replace(/^\[[0-9:.,\s-]+\]\s*/, '')
    const match = clean.match(/^([^:\n]+):\s*(.*)$/)
    if (match) {
      const cand = match[1].trim().toLowerCase()
      frequencies.set(cand, (frequencies.get(cand) || 0) + 1)
    }
  }

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
    if (colonMatch && isValidSpeakerCandidate(colonMatch[1], knownSpeakers, frequencies)) {
      speakerRaw = colonMatch[1].trim()
      text = colonMatch[2].trim()
    } else {
      speakerRaw = 'Desconhecido'
      text = cleanLine
    }

    turns.push({
      speakerRaw,
      startMs,
      endMs,
      text
    })

    syntheticClockMs = endMs + 1000
  }

  // Ordena rigorosamente os turnos por timestamp (startMs) crescente para corrigir desordenação
  turns.sort((a, b) => a.startMs - b.startMs)

  // Garante duração mínima se endMs <= startMs
  for (const t of turns) {
    if (t.endMs <= t.startMs) {
      t.endMs = t.startMs + 5000
    }
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
    rawTurns = parseTxtTranscript(params.content, [params.teacherSpeakerName].filter(Boolean))
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
