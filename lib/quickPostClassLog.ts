/**
 * Diário de Bordo de 30 Segundos Pós-Aula (R3)
 * Processamento 100% Local (LGPD Trilho 1 — Zero Egress de PII para LLMs em nuvem).
 * Extrai e distribui automaticamente uma nota rápida (voz ou texto) em:
 *   1. Sequência Didática (onde a turma parou / página / unidade);
 *   2. Seção 5 ("Observações gerais e evolução do aluno") do PDI / PEI de alunos citados + Sync Supabase;
 *   3. Lembrete para a Próxima Aula (exibido no topo do Planejamento / Sequência Didática).
 */

import { getAllPdiRecords, savePdiRecord, type PdiRecord } from './pdiManagement'
import { getAllPeiRecords, savePeiRecord } from './peiManagement'
import { syncToSupabase } from './supabaseClient'

export interface QuickPostClassLogParsedPreview {
  rawNote: string
  detectedClassLabel: string
  detectedPageOrStopPoint: string | null
  detectedUnitReference: string | null
  nextClassReminderText: string
  matchedPdiStudents: Array<{
    studentId: string
    studentName: string
    gradeCycle: string
    observationSnippet: string
  }>
  lgpdProcessingMode: 'LOCAL_DETERMINISTIC_ZERO_EGRESS'
}

export interface QuickPostClassLogSavedRecord extends QuickPostClassLogParsedPreview {
  id: string
  createdAt: string
  dateFormatted: string
  updatedPdiIds: string[]
  updatedSequenceCount: number
}

export interface NextClassReminderItem {
  id: string
  classLabel: string
  reminderText: string
  stoppedAtPage: string | null
  unitReference: string | null
  createdAt: string
  resolved: boolean
}

const LOGS_STORAGE_KEY = 'teacher_quick_post_class_logs_v1'
const REMINDERS_STORAGE_KEY = 'teacher_next_class_reminders_v1'
const SEQUENCES_STORAGE_KEY = 'teacher_didactic_sequences_v1'

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Analisa deterministicamente (100% local, sem enviar PII para a nuvem) a nota pós-aula.
 */
export function parseQuickPostClassNote(
  rawNote: string,
  defaultClassLabel: string = '6º Ano'
): QuickPostClassLogParsedPreview {
  const cleanNote = String(rawNote || '').trim()
  const normNote = normalizeText(cleanNote)

  // 1. Detectar turma (ex: "6º A", "9º ano", "7º B", "8º Fund")
  const classMatch = cleanNote.match(/\b([1-9]º\s*(?:ano\s*)?[A-D]?|[1-3]ª\s*s[eé]rie\s*[A-D]?|[6-9]º\s*Fund\.?)\b/i)
  const detectedClassLabel = classMatch ? classMatch[1].trim() : defaultClassLabel

  // 2. Detectar ponto de parada / página (ex: "página 34", "pág. 34", "pag 18", "exercício 4")
  const pageMatch = cleanNote.match(/\b(?:p[aá]gina|p[aá]g\.?|page)\s*(\d+(?:\s*e\s*\d+)?)/i)
  const exMatch = cleanNote.match(/\b(?:exerc[ií]cios?|ex\.?|atividade)\s*([0-9]+(?:\s*(?:,|e|a)\s*[0-9]+)*)/i)
  let detectedPageOrStopPoint: string | null = null
  if (pageMatch && exMatch) {
    detectedPageOrStopPoint = `Página ${pageMatch[1]} (Exercícios ${exMatch[1]})`
  } else if (pageMatch) {
    detectedPageOrStopPoint = `Página ${pageMatch[1]}`
  } else if (exMatch) {
    detectedPageOrStopPoint = `Exercícios ${exMatch[1]}`
  }

  // 3. Detectar Unidade / Capítulo (ex: "Unit 2", "Unidade 3", "Capítulo 4")
  const unitMatch = cleanNote.match(/\b(?:unit|unidade|cap[ií]tulo|m[oó]dulo)\s*([0-9]+|[IVX]+)\b/i)
  const detectedUnitReference = unitMatch ? unitMatch[0].trim() : null

  // 4. Detectar alunos com PDI / PEI ativo citados na nota (ex: "Carina", "Carina Miranda")
  const pdiMap = getAllPdiRecords()
  const peiMap = getAllPeiRecords()
  const matchedPdiStudents: QuickPostClassLogParsedPreview['matchedPdiStudents'] = []
  const seenIds = new Set<string>()

  const checkStudentMatch = (studentId: string, studentName: string, gradeCycle: string) => {
    if (!studentName || seenIds.has(studentId)) return
    const normFull = normalizeText(studentName)
    const parts = normFull.split(/\s+/).filter(p => p.length >= 3 && !['dos', 'das', 'para'].includes(p))
    const firstName = parts[0]

    const hasFullMatch = normFull.length > 0 && normNote.includes(normFull)
    const hasFirstMatch =
      firstName &&
      new RegExp(`\\b${firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(normNote)

    if (hasFullMatch || hasFirstMatch) {
      seenIds.add(studentId)
      // Extrai a sentença específica em que o estudante foi mencionado ou a nota completa
      const clauses = cleanNote
        .split(/[.;!?\n]+/)
        .map(s => s.trim())
        .filter(Boolean)
      const specificClause = clauses.find(c => normalizeText(c).includes(firstName || normFull))
      matchedPdiStudents.push({
        studentId,
        studentName,
        gradeCycle: gradeCycle || detectedClassLabel,
        observationSnippet: specificClause || cleanNote
      })
    }
  }

  Object.values(pdiMap).forEach((rec: PdiRecord) => {
    checkStudentMatch(
      rec.studentId,
      rec.studentName,
      rec.identification?.gradeCycle || rec.studentInfo?.gradeCycle || defaultClassLabel
    )
  })
  Object.values(peiMap).forEach(rec => {
    checkStudentMatch(rec.studentId, rec.studentName, (rec as any).studentInfo?.gradeCycle || defaultClassLabel)
  })

  // 5. Construir Lembrete Inteligente para a Próxima Aula
  let nextClassReminderText = cleanNote
  const pendingClause = cleanNote.match(
    /\b(?:faltam?|ficou\s+pendente|para\s+a\s+pr[oó]xima\s+aula|retomar|corrigir)\s+([^.;\n]+)/i
  )
  if (pendingClause) {
    nextClassReminderText = `Retomar: ${pendingClause[0].trim()}`
    if (detectedPageOrStopPoint && ! normalizeText(nextClassReminderText).includes('pag')) {
      nextClassReminderText += ` (${detectedPageOrStopPoint})`
    }
  } else if (detectedPageOrStopPoint) {
    nextClassReminderText = `Parou em ${detectedPageOrStopPoint}${
      detectedUnitReference ? ` — ${detectedUnitReference}` : ''
    }. Nota: ${cleanNote}`
  }

  return {
    rawNote: cleanNote,
    detectedClassLabel,
    detectedPageOrStopPoint,
    detectedUnitReference,
    nextClassReminderText,
    matchedPdiStudents,
    lgpdProcessingMode: 'LOCAL_DETERMINISTIC_ZERO_EGRESS'
  }
}

/**
 * Executa o despacho completo do Diário de Bordo Pós-Aula:
 *  - Atualiza Seção 5 ("Observações gerais e evolução do aluno") de cada PDI/PEI citado e sincroniza com Supabase;
 *  - Atualiza a Sequência Didática ativa com o ponto de parada;
 *  - Cria o Lembrete para a Próxima Aula e sincroniza com Supabase.
 */
export function dispatchQuickPostClassLog(
  rawNote: string,
  defaultClassLabel: string = '6º Ano',
  explicitStudentId?: string
): QuickPostClassLogSavedRecord {
  const parsed = parseQuickPostClassNote(rawNote, defaultClassLabel)
  const now = new Date()
  const dateFormatted = now.toLocaleDateString('pt-BR')
  const updatedPdiIds: string[] = []

  const pdiMap = getAllPdiRecords()
  const peiMap = getAllPeiRecords()

  // Se o professor selecionou explicitamente um aluno com PDI além da detecção automática:
  if (explicitStudentId && pdiMap[explicitStudentId]) {
    const alreadyInList = parsed.matchedPdiStudents.some(s => s.studentId === explicitStudentId)
    if (!alreadyInList) {
      const rec = pdiMap[explicitStudentId]
      parsed.matchedPdiStudents.push({
        studentId: rec.studentId,
        studentName: rec.studentName,
        gradeCycle: rec.identification?.gradeCycle || rec.studentInfo?.gradeCycle || defaultClassLabel,
        observationSnippet: parsed.rawNote
      })
    }
  }

  // 1. Atualizar Seção 5 do PDI e PEI de cada aluno citado
  parsed.matchedPdiStudents.forEach(match => {
    const pdi = pdiMap[match.studentId]
    if (pdi) {
      const entryLine = `[${dateFormatted} — Diário Pós-Aula (${parsed.detectedClassLabel})]: ${match.observationSnippet}`
      const prevEvolucao = pdi.generalObservations?.evolucaoGeral || ''
      const nextEvolucao = prevEvolucao ? `${prevEvolucao}\n${entryLine}` : entryLine
      const updatedPdi: PdiRecord = {
        ...pdi,
        generalObservations: {
          ...(pdi.generalObservations || {
            interesses: '',
            Lazer: '',
            Amizades: '',
            HabitosEstudo: '',
            evolucaoGeral: ''
          }),
          evolucaoGeral: nextEvolucao
        }
      }
      savePdiRecord(updatedPdi)
      updatedPdiIds.push(pdi.studentId)
    }

    const pei = peiMap[match.studentId]
    if (pei) {
      const entryLine = `[${dateFormatted} — Diário Pós-Aula (${parsed.detectedClassLabel})]: ${match.observationSnippet}`
      const prevObs = pei.generalObservations || ''
      savePeiRecord({
        ...pei,
        generalObservations: prevObs ? `${prevObs}\n${entryLine}` : entryLine
      })
    }
  })

  // 2. Salvar Lembrete da Próxima Aula
  const reminder: NextClassReminderItem = {
    id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    classLabel: parsed.detectedClassLabel,
    reminderText: parsed.nextClassReminderText,
    stoppedAtPage: parsed.detectedPageOrStopPoint,
    unitReference: parsed.detectedUnitReference,
    createdAt: now.toISOString(),
    resolved: false
  }
  const existingReminders = getNextClassReminders()
  const nextReminders = [reminder, ...existingReminders].slice(0, 50)
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(nextReminders))
    } catch {}
  }

  // 3. Atualizar Sequência Didática em localStorage (se houver unidades cadastradas)
  let updatedSequenceCount = 0
  if (typeof window !== 'undefined') {
    try {
      const rawSeq = localStorage.getItem(SEQUENCES_STORAGE_KEY)
      if (rawSeq) {
        const parsedSeq = JSON.parse(rawSeq)
        if (Array.isArray(parsedSeq) && parsedSeq.length > 0) {
          const updatedSeq = parsedSeq.map((seq: any, idx: number) => {
            if (idx === 0 || (seq.grade && normalizeText(seq.grade).includes(normalizeText(parsed.detectedClassLabel)))) {
              updatedSequenceCount++
              return {
                ...seq,
                lastClassStopNote: `[${dateFormatted}] ${parsed.nextClassReminderText}`,
                updatedAt: now.toISOString()
              }
            }
            return seq
          })
          localStorage.setItem(SEQUENCES_STORAGE_KEY, JSON.stringify(updatedSeq))
        }
      }
    } catch {}
  }

  const savedRecord: QuickPostClassLogSavedRecord = {
    ...parsed,
    id: `qlog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now.toISOString(),
    dateFormatted,
    updatedPdiIds,
    updatedSequenceCount
  }

  const allLogs = getSavedQuickPostClassLogs()
  const nextLogs = [savedRecord, ...allLogs].slice(0, 100)
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(nextLogs))
    } catch {}
  }

  // Sincronização assíncrona com Supabase (resiliente)
  void syncQuickLogsToSupabase(nextLogs, nextReminders)

  return savedRecord
}

export function getSavedQuickPostClassLogs(): QuickPostClassLogSavedRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LOGS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function getNextClassReminders(classLabelFilter?: string): NextClassReminderItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(REMINDERS_STORAGE_KEY)
    if (!raw) return []
    const parsed: NextClassReminderItem[] = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const active = parsed.filter(r => !r.resolved)
    if (!classLabelFilter) return active
    const normFilter = normalizeText(classLabelFilter)
    const filtered = active.filter(
      r => normalizeText(r.classLabel).includes(normFilter) || normFilter.includes(normalizeText(r.classLabel))
    )
    return filtered.length > 0 ? filtered : active
  } catch {
    return []
  }
}

export function resolveNextClassReminder(reminderId: string): NextClassReminderItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(REMINDERS_STORAGE_KEY)
    const parsed: NextClassReminderItem[] = raw ? JSON.parse(raw) : []
    const updated = parsed.map(r => (r.id === reminderId ? { ...r, resolved: true } : r))
    localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(updated))
    return updated.filter(r => !r.resolved)
  } catch {
    return []
  }
}

async function syncQuickLogsToSupabase(
  logs: QuickPostClassLogSavedRecord[],
  reminders: NextClassReminderItem[]
): Promise<void> {
  try {
    await syncToSupabase({
      [LOGS_STORAGE_KEY]: {
        logs: logs.slice(0, 30),
        reminders: reminders.slice(0, 20),
        syncedAt: new Date().toISOString()
      }
    })
  } catch {
    // Mantém persistência local resiliente caso offline
  }
}
