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
  resolvedAction?: 'merge' | 'create_new' | 'keep_local' | 'discard'
}

export interface RosterCompletenessCheck {
  isPartial: boolean
  scrapedCount: number
  expectedCount: number
  ratio: number
  threshold: number
  warningMessage?: string
}

export interface RosterReconciliationResult {
  totalPortalCount: number
  autoMergedCount: number
  ambiguousCount: number
  newImportedCount: number
  unmatchedLocalCount: number
  items: ReconciliationItem[]
  completenessCheck?: RosterCompletenessCheck
  isUntestedMap?: boolean
  isBrokenMap?: boolean
  brokenReason?: string
  requiresManualReviewAll?: boolean
  forcedReviewReason?: string
}

export interface StudentNameValidation {
  isNoise: boolean
  isSuspicious: boolean
  reason?: string
}

export const UI_NAVIGATION_TERMS = new Set([
  'pagina', 'paginas', 'proximo', 'proxima', 'anterior', 'voltar', 'avancar',
  'total', 'alunos', 'aluno', 'turma', 'turmas', 'chamada', 'diario',
  'filtro', 'filtrar', 'buscar', 'pesquisar', 'pesquisa', 'matricula',
  'situacao', 'status', 'ativo', 'inativo', 'transferido', 'acoes', 'acao',
  'exportar', 'imprimir', 'salvar', 'editar', 'excluir', 'detalhes', 'perfil',
  'selecionar', 'todos', 'nenhum', 'inicio', 'fim', 'primeira', 'ultima'
])

/**
 * Valida se uma string raspada corresponde a um nome legítimo de aluno
 * ou a ruído de controle de interface (botões de página, totais, números).
 */
export function validateStudentName(name: string): StudentNameValidation {
  if (!name || typeof name !== 'string') {
    return { isNoise: true, isSuspicious: true, reason: 'Nome vazio ou inválido' }
  }

  const rawClean = name.trim()
  const clean = normalizeStudentName(name).trim()

  if (clean.length < 2) {
    return { isNoise: true, isSuspicious: true, reason: 'Nome muito curto' }
  }

  // Conteúdo puramente numérico ou de pontuação
  if (/^[\d\s./\-#]+$/.test(clean) || /^[\d\s./\-#]+$/.test(rawClean)) {
    return { isNoise: true, isSuspicious: true, reason: 'Conteúdo puramente numérico (não é nome de aluno)' }
  }

  // Frases conhecidas de rodapé/paginação
  if (/(exibindo|linhas\s+por\s+pagina|pagina\s+\d+|total\s+de\s+alunos|nenhum\s+registro)/i.test(clean)) {
    return { isNoise: true, isSuspicious: true, reason: 'Termo de controle de paginação ou rodapé de tabela' }
  }

  const tokens = clean.split(/\s+/).filter(t => t.length > 0)
  if (tokens.length === 0) {
    return { isNoise: true, isSuspicious: true, reason: 'Nome sem caracteres alfabéticos válidos' }
  }

  // Todos os tokens são palavras de navegação ou números
  const allUiTerms = tokens.every(t => UI_NAVIGATION_TERMS.has(t) || /^\d+$/.test(t))
  if (allUiTerms) {
    return { isNoise: true, isSuspicious: true, reason: 'Texto corresponde a controle ou rótulo de interface' }
  }

  // Nome com uma única palavra (mononômico sem sobrenome)
  if (tokens.length === 1) {
    if (UI_NAVIGATION_TERMS.has(tokens[0])) {
      return { isNoise: true, isSuspicious: true, reason: 'Palavra isolada de interface' }
    }
    return {
      isNoise: false,
      isSuspicious: true,
      reason: 'Nome mononômico (sem sobrenome) ou incompleto. Requer confirmação manual.'
    }
  }

  return { isNoise: false, isSuspicious: false }
}

/**
 * Avalia se a contagem raspada atinge o limiar esperado da turma (ex: 80%)
 */
export function checkRosterCompleteness(
  scrapedCount: number,
  expectedCount: number,
  threshold = 0.8
): RosterCompletenessCheck {
  if (expectedCount <= 0) {
    return { isPartial: false, scrapedCount, expectedCount, ratio: 1.0, threshold }
  }
  const ratio = scrapedCount / expectedCount
  const isPartial = ratio < threshold
  return {
    isPartial,
    scrapedCount,
    expectedCount,
    ratio,
    threshold,
    warningMessage: isPartial
      ? `Leitura parcial detectada: ${scrapedCount} de ${expectedCount} alunos esperados (${Math.round(ratio * 100)}%). Verifique se a página tem rolagem ou paginação antes de importar.`
      : undefined
  }
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
 * Opções de configuração do reconciliador de alunos.
 */
export interface ReconcileRosterOptions {
  portalName?: string
  targetClassRef?: string
  expectedCount?: number
  portalStatus?: 'never_connected' | 'discovering' | 'mapped_untested' | 'mapped_validated' | 'broken_needs_rediscovery'
  isUntestedMap?: boolean
}

/**
 * Executa a reconciliação em 4 vias entre a lista raspada do portal e os alunos locais.
 *
 * BARREIRA DE INTEGRIDADE (PARTE C):
 * 1. Gate de Contagem (checkRosterCompleteness): Se a leitura for parcial (< 80%), bloqueia auto-merge/auto-create.
 * 2. Gate de Confiança Dinâmica: Nomes suspeitos ou com grafia similar exigem decisão manual.
 * 3. Gate de Homologação (mapped_untested): Se o portal estiver em status mapped_untested (primeira leitura
 *    após descoberta), FORÇA revisão manual item a item independente da confiança (mesmo confiança 1.0).
 *    Nenhum item pode ser auto-mesclado ou auto-criado silenciosamente antes da validação humana formal.
 */
export function reconcileRosterBatch(
  rawScrapedStudents: Array<Record<string, any>>,
  localStudents: LocalStudentRecord[],
  options?: ReconcileRosterOptions
): RosterReconciliationResult {
  const sanitizedScraped: ScrapedStudent[] = sanitizeInboundScrapedData(rawScrapedStudents) as ScrapedStudent[]
  const matchedLocalIds = new Set<string>()
  const items: ReconciliationItem[] = []

  const isBrokenMap = options?.portalStatus === 'broken_needs_rediscovery'

  // Avalia se o portal está em fase de homologação (mapped_untested)
  const isUntestedMap = !isBrokenMap && Boolean(
    options?.isUntestedMap ||
    (options?.portalStatus && options.portalStatus !== 'mapped_validated')
  )

  // Prepara candidatos para o studentMatcher
  const matchCandidates: StudentMatchCandidate[] = localStudents.map(s => ({
    id: s.id,
    name: s.name,
    class_name: s.className || s.class_name,
    school_name: s.source_portal || options?.portalName,
  }))

  // 0. Filtra ruídos óbvios de interface
  const validScraped: ScrapedStudent[] = []
  for (const pStudent of sanitizedScraped) {
    const val = validateStudentName(pStudent.name)
    if (!val.isNoise) {
      validScraped.push(pStudent)
    }
  }

  // Gate de contagem contra o roster esperado
  let expected = options?.expectedCount
  if (expected === undefined) {
    if (options?.targetClassRef && options.targetClassRef !== 'all') {
      expected = localStudents.filter(
        s => s.className && normalizeStudentName(s.className) === normalizeStudentName(options.targetClassRef!)
      ).length
    } else {
      expected = localStudents.length
    }
  }
  const completenessCheck = checkRosterCompleteness(validScraped.length, expected, 0.8)

  // Regra central: auto-resolução só é permitida se a leitura for completa E o mapa for homologado
  const canAutoResolve = !completenessCheck.isPartial && !isUntestedMap

  // 1. Processa cada aluno retornado pelo Portal
  validScraped.forEach((pStudent, idx) => {
    const pCleanName = normalizeStudentName(pStudent.name)
    const pNativeId = pStudent.portal_native_id ? String(pStudent.portal_native_id).trim() : ''
    const pClassRef = (pStudent.classRef || options?.targetClassRef || '').trim()
    const nameVal = validateStudentName(pStudent.name)

    // 1.1 Match Direto por portal_native_id (se já vinculado no passado)
    if (pNativeId) {
      const idMatch = localStudents.find(
        s => s.portal_native_id && String(s.portal_native_id).trim() === pNativeId
      )
      if (idMatch) {
        matchedLocalIds.add(idMatch.id)
        const reason = isUntestedMap
          ? `Correspondência exata de matrícula (#${pNativeId}). Como o portal está em homologação (mapped_untested), a validação manual é obrigatória antes de gravar.`
          : `Correspondência exata de matrícula do portal (#${pNativeId}).`
        items.push({
          id: `rec_${idx}_${idMatch.id}`,
          portalStudent: pStudent,
          matchedLocalStudent: idMatch,
          status: 'auto_merged',
          confidence: 1.0,
          reason,
          resolvedAction: canAutoResolve ? 'merge' : undefined
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
      const reason = isUntestedMap
        ? `Nome completo e turma correspondem perfeitamente (${exact.name}). Como o portal está em homologação (mapped_untested), a validação manual é obrigatória antes de gravar.`
        : `Nome completo e turma correspondem perfeitamente (${exact.name}).`
      items.push({
        id: `rec_${idx}_${exact.id}`,
        portalStudent: pStudent,
        matchedLocalStudent: exact,
        status: 'auto_merged',
        confidence: 1.0,
        reason,
        resolvedAction: canAutoResolve ? 'merge' : undefined
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
        resolvedAction: undefined // Requer confirmação humana (< 0.8)
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
          const reason = isUntestedMap
            ? `Correspondência automática (${candidateLocal.name}). Homologação pendente (mapped_untested): confirmação manual obrigatória.`
            : `Correspondência automática (${candidateLocal.name}).`
          items.push({
            id: `rec_${idx}_${candidateLocal.id}`,
            portalStudent: pStudent,
            matchedLocalStudent: candidateLocal,
            status: 'auto_merged',
            confidence: matchResult.confidence,
            reason,
            resolvedAction: canAutoResolve ? 'merge' : undefined
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
    if (nameVal.isSuspicious) {
      // Nome suspeito/mononômico (ex: "Lucas", termo isolado): confiança baixa (0.3) e revisão manual obrigatória
      items.push({
        id: `rec_new_${idx}`,
        portalStudent: pStudent,
        matchedLocalStudent: null,
        status: 'new_from_portal',
        confidence: 0.3,
        reason: `Atenção: ${nameVal.reason || 'Nome suspeito ou termo de interface'}. Requer confirmação manual do professor.`,
        resolvedAction: undefined // Bloqueia auto-create!
      })
    } else {
      // Aluno novo legítimo com nome composto: confiança 0.85 (nunca 1.0 — 1.0 é só match exato com matrícula/nome)
      const reason = isUntestedMap
        ? 'Aluno novo identificado no portal. Homologação pendente (mapped_untested): confirmação manual obrigatória.'
        : 'Aluno novo identificado na lista oficial do portal escolar.'
      items.push({
        id: `rec_new_${idx}`,
        portalStudent: pStudent,
        matchedLocalStudent: null,
        status: 'new_from_portal',
        confidence: 0.85,
        reason,
        resolvedAction: canAutoResolve ? 'create_new' : undefined
      })
    }
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

  // Se o mapa for não testado ou quebrado, NENHUM item é auto-mesclado (autoMergedCount = 0)
  const autoMergedCount = (isUntestedMap || isBrokenMap) ? 0 : items.filter(i => i.status === 'auto_merged' && (!completenessCheck.isPartial || i.resolvedAction === 'merge')).length
  const ambiguousCount = items.filter(i => i.status === 'ambiguous_match' || (i.status === 'new_from_portal' && i.confidence < 0.8)).length
  const newImportedCount = (isUntestedMap || isBrokenMap) ? 0 : items.filter(i => i.status === 'new_from_portal' && (!completenessCheck.isPartial || i.resolvedAction === 'create_new')).length
  const unmatchedLocalCount = items.filter(i => i.status === 'unmatched_local').length

  return {
    totalPortalCount: validScraped.length,
    autoMergedCount,
    ambiguousCount,
    newImportedCount,
    unmatchedLocalCount,
    items,
    completenessCheck,
    isUntestedMap,
    isBrokenMap,
    brokenReason: isBrokenMap ? 'Leitura não realizada: portal precisa de redescoberta manual.' : undefined,
    requiresManualReviewAll: isUntestedMap || isBrokenMap,
    forcedReviewReason: isBrokenMap
      ? 'Leitura não realizada: portal precisa de redescoberta manual.'
      : isUntestedMap
      ? 'Portal em status mapped_untested: homologação e conferência humana item a item obrigatória antes da gravação.'
      : undefined
  }
}

/**
 * Aplica as decisões de reconciliação aprovadas à base de alunos
 */
export function applyReconciliationDecisions(
  items: ReconciliationItem[],
  currentStudents: LocalStudentRecord[],
  portalName: string = 'machado',
  options?: { sourceType?: 'portal_scrape' | 'csv_import' | 'manual_entry' | 'trello_import' }
): { updatedStudents: LocalStudentRecord[]; logSummary: Record<string, number> } {
  const now = new Date().toISOString()
  const studentMap = new Map<string, LocalStudentRecord>()

  currentStudents.forEach(s => studentMap.set(s.id, { ...s }))

  const resolvedSourceType = options?.sourceType || (
    portalName.toLowerCase().includes('csv') || portalName.toLowerCase().includes('sheet')
      ? 'csv_import'
      : 'portal_scrape'
  )

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
          source_type: resolvedSourceType,
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
        source_type: resolvedSourceType,
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

/**
 * Validação de integridade estrita (Gate) antes de qualquer gravação em teacher_students ou studentMemory.
 */
export function validatePortalRosterIntegrity(
  result: RosterReconciliationResult,
  options?: { isUntestedMap?: boolean; humanApproved?: boolean; portalStatus?: string }
): { isValid: boolean; reason?: string } {
  // Gate 0: Portal quebrado / em broken_needs_rediscovery proíbe qualquer gravação
  if (result.isBrokenMap || options?.portalStatus === 'broken_needs_rediscovery') {
    return {
      isValid: false,
      reason: result.brokenReason || 'Leitura não realizada: portal precisa de redescoberta manual.'
    }
  }

  // Gate 1: Leitura parcial exige aprovação explícita
  if (result.completenessCheck?.isPartial && !options?.humanApproved) {
    return {
      isValid: false,
      reason: 'Leitura parcial detectada. Gravação bloqueada sem aprovação humana expressa.'
    }
  }

  // Gate 2: Mapa em mapped_untested exige aprovação explícita
  const isUntested = Boolean(result.isUntestedMap || options?.isUntestedMap || options?.portalStatus === 'mapped_untested')
  if (isUntested && !options?.humanApproved) {
    return {
      isValid: false,
      reason: 'Portal em status mapped_untested. Gravação bloqueada sem revisão e aprovação humana item a item.'
    }
  }

  // Gate 3: Se em mapped_untested, nenhum item de portal pode estar pendente de resolução
  if (isUntested) {
    const unapproved = result.items.filter(i => !i.resolvedAction && i.status !== 'unmatched_local')
    if (unapproved.length > 0) {
      return {
        isValid: false,
        reason: `Existem ${unapproved.length} aluno(s) aguardando decisão individual para homologação do portal.`
      }
    }
  }

  return { isValid: true }
}

/**
 * Aprova em lote SOMENTE itens válidos:
 * 1. Que passaram em validateStudentName (sem ruído e sem suspeição)
 * 2. Que possuem confidence >= 0.8
 *
 * Itens mononímicos ("Lucas"), termos de interface ou confidence < 0.8
 * permanecem intocados (resolvedAction: undefined), exigindo decisão individual deliberada.
 */
export function batchApproveValidItems(items: ReconciliationItem[]): {
  updatedItems: ReconciliationItem[]
  approvedCount: number
  skippedCount: number
  skippedReasons: { id: string; name: string; reason: string }[]
} {
  let approvedCount = 0
  let skippedCount = 0
  const skippedReasons: { id: string; name: string; reason: string }[] = []

  const updatedItems = items.map(item => {
    if (item.resolvedAction || item.status === 'unmatched_local') {
      return item
    }

    const studentName = item.portalStudent?.name || ''
    const nameVal = validateStudentName(studentName)

    // Critério 1: Validação rigorosa de nome (sem ruído, sem suspeição / não mononímico)
    if (nameVal.isNoise || nameVal.isSuspicious) {
      skippedCount++
      skippedReasons.push({
        id: item.id,
        name: studentName,
        reason: nameVal.reason || 'Nome suspeito, mononímico ou termo de interface'
      })
      return item
    }

    // Critério 2: Confiança mínima alta (>= 0.8)
    if (item.confidence < 0.8) {
      skippedCount++
      skippedReasons.push({
        id: item.id,
        name: studentName,
        reason: `Confiança insuficiente (${(item.confidence * 100).toFixed(0)}% < 80%)`
      })
      return item
    }

    // Se aprovado:
    if (item.status === 'auto_merged') {
      approvedCount++
      return { ...item, resolvedAction: 'merge' as const }
    }

    if (item.status === 'new_from_portal') {
      approvedCount++
      return { ...item, resolvedAction: 'create_new' as const }
    }

    // Casos ambíguos ou outros permanecem para decisão humana
    skippedCount++
    skippedReasons.push({
      id: item.id,
      name: studentName,
      reason: 'Correspondência ambígua requer seleção individual'
    })
    return item
  })

  return { updatedItems, approvedCount, skippedCount, skippedReasons }
}

export interface WizardStudentItem {
  id: string
  name: string
  rollNumber?: string
  portal_native_id?: string
  className?: string
  confidence?: number
  isSuspicious?: boolean
  suspiciousReason?: string
  decision?: 'approved' | 'rejected' | 'pending'
}

export interface WizardBatchApprovalResult {
  updatedStudents: WizardStudentItem[]
  approvedCount: number
  skippedCount: number
  skippedReasons: { id: string; name: string; reason: string }[]
  canFinalize: boolean
}

/**
 * batchApproveWizardStudents:
 * Aplica o gate estrito da Parte C para a lista de prévia do Wizard de Conexão de Portais (Parte E).
 *
 * REGRAS INEGOCIÁVEIS:
 * 1. Aprova SOMENTE itens que passaram em validateStudentName (sem ruído, não mononímico)
 *    E possuem confidence >= 0.8.
 * 2. Itens mononímicos ("Lucas", "Rodrigo") ou com ruído/confidence < 0.8
 *    permanecem obrigatoriamente como 'pending', exigindo decisão individual da professora.
 * 3. Itens que já receberam decisão manual prévia ('approved' ou 'rejected') são rigorosamente preservados.
 */
export function batchApproveWizardStudents(students: WizardStudentItem[]): WizardBatchApprovalResult {
  let approvedCount = 0
  let skippedCount = 0
  const skippedReasons: { id: string; name: string; reason: string }[] = []

  const updatedStudents = students.map(st => {
    // Se o professor já decidiu individualmente, respeita a decisão prévia
    if (st.decision === 'approved' || st.decision === 'rejected') {
      return st
    }

    const nameVal = validateStudentName(st.name)
    const conf = st.confidence ?? (nameVal.isSuspicious ? 0.3 : 0.9)

    // Critério 1: Validação rigorosa de nome (ruído ou mononímico)
    if (nameVal.isNoise || nameVal.isSuspicious) {
      skippedCount++
      skippedReasons.push({
        id: st.id,
        name: st.name,
        reason: nameVal.reason || 'Nome suspeito, mononímico ou termo de interface'
      })
      return {
        ...st,
        confidence: conf,
        decision: 'pending' as const,
        isSuspicious: true,
        suspiciousReason: nameVal.reason || 'Nome suspeito ou mononímico'
      }
    }

    // Critério 2: Confiança mínima alta (>= 0.8)
    if (conf < 0.8) {
      skippedCount++
      skippedReasons.push({
        id: st.id,
        name: st.name,
        reason: `Confiança insuficiente (${(conf * 100).toFixed(0)}% < 80%)`
      })
      return {
        ...st,
        confidence: conf,
        decision: 'pending' as const,
        isSuspicious: true,
        suspiciousReason: `Confiança insuficiente (${(conf * 100).toFixed(0)}% < 80%)`
      }
    }

    // Aluno limpo e com alta confiança: aprovado no lote
    approvedCount++
    return {
      ...st,
      confidence: conf,
      decision: 'approved' as const,
      isSuspicious: false
    }
  })

  const pendingCount = updatedStudents.filter(s => !s.decision || s.decision === 'pending').length
  const canFinalize = pendingCount === 0 && updatedStudents.some(s => s.decision === 'approved')

  return {
    updatedStudents,
    approvedCount,
    skippedCount,
    skippedReasons,
    canFinalize
  }
}

/**
 * validateWizardRosterIntegrity:
 * Gatekeeper final antes da gravação permanente da conexão e promoção para mapped_validated.
 * Bloqueia estritamente se houver qualquer item em 'pending'.
 */
export function validateWizardRosterIntegrity(students: WizardStudentItem[]): {
  isValid: boolean
  reason?: string
  pendingCount: number
  approvedCount: number
  rejectedCount: number
} {
  const pending = students.filter(s => !s.decision || s.decision === 'pending')
  const approved = students.filter(s => s.decision === 'approved')
  const rejected = students.filter(s => s.decision === 'rejected')

  if (pending.length > 0) {
    return {
      isValid: false,
      reason: `Gate de integridade bloqueado: ${pending.length} aluno(s) aguardando decisão individual antes da gravação final.`,
      pendingCount: pending.length,
      approvedCount: approved.length,
      rejectedCount: rejected.length
    }
  }

  if (approved.length === 0) {
    return {
      isValid: false,
      reason: 'Nenhum aluno legítimo aprovado no lote para estabelecer a conexão.',
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: rejected.length
    }
  }

  return {
    isValid: true,
    pendingCount: 0,
    approvedCount: approved.length,
    rejectedCount: rejected.length
  }
}

