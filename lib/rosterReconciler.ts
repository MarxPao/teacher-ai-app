/**
 * lib/rosterReconciler.ts — Motor de Conciliação em 4 Vias do Roster Escolar
 *
 * Princípio Inegociável: O Portal Escolar é a fonte primária de verdade para identidade de alunos.
 * Aplica algoritmo de reconciliação em 4 vias:
 * 1. Match Exato (Matrícula ou Nome + Turma) -> Mesclagem automática (autoridade do portal nos dados oficiais, preserva enriquecimentos locais).
 * 2. Match Ambíguo / Baixa Confiança (Nome parecido) -> Exige confirmação humana explícita.
 * 3. Sem Match no Local -> Criar novo aluno com source_type = 'portal_scrape'.
 * 4. Local Não Encontrado no Portal -> Mantém ativo com badge 'Manual / Não Vinculado'.
 */

import { normalizeStudentName, matchStudentByName, StudentMatchCandidate } from './studentMatcher'
import { sanitizeInboundScrapedData } from './portalSanitizer'

export interface ScrapedStudent {
  name: string
  portal_native_id?: string
  rollNumber?: string
  classRef?: string
  status?: 'active' | 'transferred' | 'inactive'
  nee_flag?: boolean
  grade?: number
  attendanceStatus?: string
  [key: string]: any
}

export interface LocalStudentRecord {
  id: string
  name: string
  classId?: string
  className?: string
  class_name?: string
  schoolId?: string
  source_type?: 'portal_scrape' | 'trello_import' | 'manual_entry' | 'csv_import'
  source_portal?: string
  portal_native_id?: string
  sync_status?: 'synced' | 'local_only' | 'conflict_pending'
  last_synced_at?: string
  notes?: string
  level?: string
  grades?: Record<string, any>
  metrics?: Record<string, any>
  email?: string
  [key: string]: any
}

export type ReconciliationItemStatus =
  | 'auto_merged'        // Match 100% por ID ou Nome+Turma
  | 'ambiguous_match'    // Nome parecido, aguarda confirmação do professor
  | 'new_from_portal'    // Aluno novo para importar do portal
  | 'unmatched_local'    // Aluno local que não apareceu no scrape do portal

export interface ReconciliationItem {
  id: string
  portalStudent?: ScrapedStudent
  matchedLocalStudent?: LocalStudentRecord | null
  status: ReconciliationItemStatus
  confidence: number
  reason: string
  candidateLocalStudents?: LocalStudentRecord[]
  resolvedAction?: 'merge' | 'create_new' | 'keep_local'
}

export interface RosterReconciliationResult {
  totalPortalCount: number
  autoMergedCount: number
  ambiguousCount: number
  newImportedCount: number
  unmatchedLocalCount: number
  items: ReconciliationItem[]
}

function hasNameOverlap(nameA: string, nameB: string): boolean {
  const cleanA = normalizeStudentName(nameA).replace(/[.,]/g, '')
  const cleanB = normalizeStudentName(nameB).replace(/[.,]/g, '')
  const tokensA = cleanA.split(/\s+/).filter(t => t.length > 0)
  const tokensB = cleanB.split(/\s+/).filter(t => t.length > 0)
  if (tokensA.length === 0 || tokensB.length === 0) return false

  const firstA = tokensA[0]
  const firstB = tokensB[0]
  const firstMatch = firstA === firstB || firstA.startsWith(firstB) || firstB.startsWith(firstA)

  const lastA = tokensA[tokensA.length - 1]
  const lastB = tokensB[tokensB.length - 1]
  const lastMatch = lastA === lastB

  return firstMatch && lastMatch
}

/**
 * Executa a reconciliação em 4 vias entre a lista raspada do portal e os alunos locais
 */
export function reconcileRosterBatch(
  rawScrapedStudents: Array<Record<string, any>>,
  localStudents: LocalStudentRecord[],
  options?: {
    portalName?: string
    targetClassRef?: string
  }
): RosterReconciliationResult {
  const sanitizedScraped: ScrapedStudent[] = sanitizeInboundScrapedData(rawScrapedStudents) as ScrapedStudent[]
  const matchedLocalIds = new Set<string>()
  const items: ReconciliationItem[] = []

  // Prepara candidatos para o studentMatcher
  const matchCandidates: StudentMatchCandidate[] = localStudents.map(s => ({
    id: s.id,
    name: s.name,
    class_name: s.className || s.class_name,
    school_name: s.source_portal || options?.portalName,
  }))

  // 1. Processa cada aluno retornado pelo Portal
  sanitizedScraped.forEach((pStudent, idx) => {
    const pCleanName = normalizeStudentName(pStudent.name)
    const pNativeId = pStudent.portal_native_id ? String(pStudent.portal_native_id).trim() : ''
    const pClassRef = (pStudent.classRef || options?.targetClassRef || '').trim()

    // 1.1 Match Direto por portal_native_id (se já vinculado no passado)
    if (pNativeId) {
      const idMatch = localStudents.find(
        s => s.portal_native_id && String(s.portal_native_id).trim() === pNativeId
      )
      if (idMatch) {
        matchedLocalIds.add(idMatch.id)
        items.push({
          id: `rec_${idx}_${idMatch.id}`,
          portalStudent: pStudent,
          matchedLocalStudent: idMatch,
          status: 'auto_merged',
          confidence: 1.0,
          reason: `Correspondência exata de matrícula do portal (#${pNativeId}).`,
          resolvedAction: 'merge'
        })
        return
      }
    }

    // 1.2 Match Exato por Nome e Turma
    const exactMatches = localStudents.filter(s => {
      const sClean = normalizeStudentName(s.name)
      if (sClean !== pCleanName) return false
      if (pClassRef && s.className) {
        return normalizeStudentName(s.className) === normalizeStudentName(pClassRef)
      }
      return true
    })

    if (exactMatches.length === 1) {
      const exact = exactMatches[0]
      matchedLocalIds.add(exact.id)
      items.push({
        id: `rec_${idx}_${exact.id}`,
        portalStudent: pStudent,
        matchedLocalStudent: exact,
        status: 'auto_merged',
        confidence: 1.0,
        reason: `Nome completo e turma correspondem perfeitamente (${exact.name}).`,
        resolvedAction: 'merge'
      })
      return
    }

    // 1.3 Verificação de Nome Parecido (Iniciais / Abreviaturas / Token Overlap)
    const overlapMatch = localStudents.find(s => !matchedLocalIds.has(s.id) && hasNameOverlap(s.name, pStudent.name))
    if (overlapMatch) {
      matchedLocalIds.add(overlapMatch.id)
      items.push({
        id: `rec_${idx}_${overlapMatch.id}`,
        portalStudent: pStudent,
        matchedLocalStudent: overlapMatch,
        candidateLocalStudents: [overlapMatch],
        status: 'ambiguous_match',
        confidence: 0.75,
        reason: `Nome parecido com o aluno cadastrado "${overlapMatch.name}". Confirmar se é a mesma pessoa?`,
        resolvedAction: undefined // Requer confirmação humana
      })
      return
    }

    // 1.4 Busca Fuzzy via studentMatcher
    const matchResult = matchStudentByName(pStudent.name, matchCandidates)

    if (matchResult.status === 'confident_match' && matchResult.student && matchResult.confidence >= 0.85) {
      const candidateLocal = localStudents.find(s => s.id === matchResult.student!.id)
      if (candidateLocal && !matchedLocalIds.has(candidateLocal.id)) {
        const isNameIdentical = normalizeStudentName(candidateLocal.name) === pCleanName
        if (isNameIdentical) {
          matchedLocalIds.add(candidateLocal.id)
          items.push({
            id: `rec_${idx}_${candidateLocal.id}`,
            portalStudent: pStudent,
            matchedLocalStudent: candidateLocal,
            status: 'auto_merged',
            confidence: matchResult.confidence,
            reason: `Correspondência automática (${candidateLocal.name}).`,
            resolvedAction: 'merge'
          })
          return
        } else {
          matchedLocalIds.add(candidateLocal.id)
          items.push({
            id: `rec_${idx}_${candidateLocal.id}`,
            portalStudent: pStudent,
            matchedLocalStudent: candidateLocal,
            candidateLocalStudents: [candidateLocal],
            status: 'ambiguous_match',
            confidence: matchResult.confidence,
            reason: `Nome parecido com o aluno cadastrado "${candidateLocal.name}". Confirmar se é a mesma pessoa?`,
            resolvedAction: undefined // Requer confirmação humana
          })
          return
        }
      }
    } else if (matchResult.status === 'ambiguous' && matchResult.candidates.length > 0) {
      const topLocals = matchResult.candidates
        .map(c => localStudents.find(s => s.id === c.id))
        .filter(Boolean) as LocalStudentRecord[]

      topLocals.forEach(tl => matchedLocalIds.add(tl.id))
      items.push({
        id: `rec_${idx}_ambiguous`,
        portalStudent: pStudent,
        candidateLocalStudents: topLocals,
        status: 'ambiguous_match',
        confidence: matchResult.confidence,
        reason: matchResult.disambiguationPrompt || 'Múltiplos alunos com grafia similar encontrados.',
        resolvedAction: undefined // Requer confirmação humana
      })
      return
    }

    // 1.5 Sem Match no Local -> Novo Aluno do Portal
    items.push({
      id: `rec_new_${idx}`,
      portalStudent: pStudent,
      matchedLocalStudent: null,
      status: 'new_from_portal',
      confidence: 1.0,
      reason: 'Aluno novo identificado na lista oficial do portal escolar.',
      resolvedAction: 'create_new'
    })
  })

  // 2. Alunos Locais Não Encontrados no Portal (Via 4)
  localStudents.forEach(loc => {
    // Se estivermos filtrando por uma turma específica e o aluno não for dessa turma, não marcamos como ausente
    if (options?.targetClassRef && options.targetClassRef !== 'all' && loc.className) {
      if (normalizeStudentName(loc.className) !== normalizeStudentName(options.targetClassRef)) {
        return
      }
    }

    if (!matchedLocalIds.has(loc.id)) {
      items.push({
        id: `rec_unmatched_${loc.id}`,
        matchedLocalStudent: loc,
        status: 'unmatched_local',
        confidence: 1.0,
        reason: 'Aluno cadastrado previamente no Teacher AI, mas não listado nesta chamada do portal.',
        resolvedAction: 'keep_local'
      })
    }
  })

  const autoMergedCount = items.filter(i => i.status === 'auto_merged').length
  const ambiguousCount = items.filter(i => i.status === 'ambiguous_match').length
  const newImportedCount = items.filter(i => i.status === 'new_from_portal').length
  const unmatchedLocalCount = items.filter(i => i.status === 'unmatched_local').length

  return {
    totalPortalCount: sanitizedScraped.length,
    autoMergedCount,
    ambiguousCount,
    newImportedCount,
    unmatchedLocalCount,
    items
  }
}

/**
 * Aplica as decisões de reconciliação aprovadas à base de alunos
 */
export function applyReconciliationDecisions(
  items: ReconciliationItem[],
  currentStudents: LocalStudentRecord[],
  portalName: string = 'machado'
): { updatedStudents: LocalStudentRecord[]; logSummary: Record<string, number> } {
  const now = new Date().toISOString()
  const studentMap = new Map<string, LocalStudentRecord>()

  currentStudents.forEach(s => studentMap.set(s.id, { ...s }))

  let mergedCount = 0
  let createdCount = 0
  let preservedCount = 0

  items.forEach(item => {
    // 1. Mesclagem de Aluno Existente
    if (item.resolvedAction === 'merge' && item.matchedLocalStudent && item.portalStudent) {
      const existing = studentMap.get(item.matchedLocalStudent.id)
      if (existing) {
        studentMap.set(existing.id, {
          ...existing,
          // Atualiza dados autoritativos do portal
          name: item.portalStudent.name,
          portal_native_id: item.portalStudent.portal_native_id || existing.portal_native_id,
          source_type: 'portal_scrape',
          source_portal: portalName,
          sync_status: 'synced',
          last_synced_at: now,
          className: item.portalStudent.classRef || existing.className,
          // Preserva estritamente dados pedagógicos locais
          notes: existing.notes || '',
          grades: existing.grades || {},
          metrics: existing.metrics || {},
          level: existing.level || 'B1'
        })
        mergedCount++
      }
    }

    // 2. Novo Aluno do Portal
    else if (item.resolvedAction === 'create_new' && item.portalStudent) {
      const newId = `st_portal_${item.portalStudent.portal_native_id || Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      studentMap.set(newId, {
        id: newId,
        name: item.portalStudent.name,
        portal_native_id: item.portalStudent.portal_native_id,
        className: item.portalStudent.classRef || 'Geral',
        schoolId: portalName,
        source_type: 'portal_scrape',
        source_portal: portalName,
        sync_status: 'synced',
        last_synced_at: now,
        notes: '',
        level: 'A1',
        grades: {},
        metrics: {}
      })
      createdCount++
    }

    // 3. Aluno Local Não Encontrado no Portal
    else if (item.status === 'unmatched_local' && item.matchedLocalStudent) {
      const existing = studentMap.get(item.matchedLocalStudent.id)
      if (existing) {
        studentMap.set(existing.id, {
          ...existing,
          sync_status: 'local_only' // Mantém como local não vinculado
        })
        preservedCount++
      }
    }
  })

  const updatedStudents = Array.from(studentMap.values())
  const logSummary = {
    total: updatedStudents.length,
    merged: mergedCount,
    created: createdCount,
    preserved: preservedCount
  }

  return { updatedStudents, logSummary }
}
