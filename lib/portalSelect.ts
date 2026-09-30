/**
 * lib/portalSelect.ts — Resolução e Seleção Estrita de Campos em Portais Escolares
 *
 * Diretrizes Canônicas:
 * 1. Exclui de qualquer resolução os <select> fora de <form> (ex: #periodos).
 * 2. Identifica opções por { selectId, index, text }; aplica e verifica estritamente
 *    por selectedIndex (evitando colisão de values duplicados como em #disciplina).
 * 3. Mapeia conceito -> id por tabela fixa (turma->#turma, mes/bimestre/divisao->#divisao,
 *    disciplina->#disciplina, dia->#dia, ordem->#ordem, ativos->#ativos).
 *    Sem match ou conceito "geral" retorna 'UnknownConcept'.
 * 4. Remove variantes de token único e o ramo "já está com X". Sucesso somente se
 *    selectedIndex lido de volta == índice pedido.
 * 5. Casamento: normaliza acento/caixa, exige todos os tokens significativos.
 */

export interface SelectOptionIdentifier {
  selectId: string
  index: number
  text: string
}

export type ConceptMapKey =
  | 'turma'
  | 'mes'
  | 'mês'
  | 'bimestre'
  | 'divisao'
  | 'divisão'
  | 'disciplina'
  | 'dia'
  | 'ordem'
  | 'ativos'

export const CONCEPT_TO_ID_MAP: Record<string, string> = Object.freeze({
  turma: '#turma',
  mes: '#divisao',
  mês: '#divisao',
  bimestre: '#divisao',
  divisao: '#divisao',
  divisão: '#divisao',
  disciplina: '#disciplina',
  dia: '#dia',
  ordem: '#ordem',
  ativos: '#ativos',
})

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos',
  'e', 'em', 'no', 'na', 'nos', 'nas',
  'para', 'pra', 'pro', 'com', 'por',
  'um', 'uma', 'o', 'a', 'os', 'as'
])

const ORDINAL_WORDS_MAP: Record<string, string> = {
  primeiro: '1',
  segundo: '2',
  terceiro: '3',
  quarto: '4',
  quinto: '5',
  sexto: '6',
  setimo: '7',
  oitavo: '8',
  nono: '9',
  decimo: '10'
}

/**
 * Normaliza caixa (minúsculas), remove diacríticos/acentos e espaços excedentes,
 * e converte ordinais por extenso ou sufixados (6º, 6o, 6O, setimo -> 7) para dígitos.
 */
export function normalizeString(str: unknown): string {
  if (str === null || str === undefined) return ''
  let s = String(str)
    .replace(/(\d+)\s*[º°ª]/g, '$1')
    .replace(/(\d+)[oO]\b/g, '$1')
    .replace(/[º°ª]/g, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

  for (const [word, num] of Object.entries(ORDINAL_WORDS_MAP)) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi')
    s = s.replace(regex, num)
  }
  return s
}

/**
 * Extrai todos os tokens significativos de uma string de busca.
 * Exclui stopwords da língua portuguesa, garantindo que termos reais sejam preservados.
 */
export function extractSignificantTokens(query: string): string[] {
  const norm = normalizeString(query)
  const rawTokens = norm.split(/[^a-z0-9]+/i).filter(Boolean)
  const filtered = rawTokens.filter(t => !STOPWORDS.has(t) && t.length > 0)
  return filtered.length > 0 ? filtered : rawTokens
}

/**
 * Resolve conceito semântico para o seletor correspondente via tabela fixa.
 * O conceito "geral" foi removido. Sem match retorna 'UnknownConcept'.
 */
export function resolveConceptToId(concept: string): string | 'UnknownConcept' {
  const norm = normalizeString(concept)
  if (!norm || norm === 'geral') {
    return 'UnknownConcept'
  }
  const selector = CONCEPT_TO_ID_MAP[norm]
  return selector || 'UnknownConcept'
}

/**
 * Obtém todos os selects válidos contidos estritamente dentro de elementos <form>.
 * Descarta qualquer <select> que resida fora de um <form> (ex: #periodos).
 */
export function getValidFormSelects(root: Document | HTMLElement): HTMLSelectElement[] {
  const allSelects = Array.from(root.querySelectorAll('select'))
  return allSelects.filter(s => {
    // 1. Deve pertencer a um <form>
    return s.closest('form') !== null
  })
}

/**
 * Localiza um <select> pelo seletor CSS ou ID, garantindo que ele pertença a um <form>.
 * Se o elemento estiver fora de um <form>, é imediatamente descartado (retorna null).
 */
export function findFormSelect(root: Document | HTMLElement, selectorOrId: string): HTMLSelectElement | null {
  const selector = selectorOrId.startsWith('#') || selectorOrId.startsWith('.') || selectorOrId.startsWith('[')
    ? selectorOrId
    : `#${selectorOrId}`

  const el = root.querySelector(selector)
  if (!el || !(el instanceof HTMLSelectElement)) {
    return null
  }

  // Regra 1: descarta se estiver fora de <form>
  if (!el.closest('form')) {
    return null
  }

  return el
}

/**
 * Encontra a opção correspondente em um <select> aplicando:
 * - Normalização de acentos e caixa alta/baixa
 * - Exigência de correspondência de TODOS os tokens significativos do termo buscado
 * - Proibição de casamento fraco por token único quando a busca é composta
 * Retorna { selectId, index, text } ou null se não houver match integral.
 */
export function findOptionByMatch(selectEl: HTMLSelectElement, query: string): SelectOptionIdentifier | null {
  const tokens = extractSignificantTokens(query)
  if (tokens.length === 0) return null

  const options = Array.from(selectEl.options)

  for (let i = 0; i < options.length; i++) {
    const opt = options[i]
    const optTextNorm = normalizeString(opt.text || opt.textContent || '')
    const optValNorm = normalizeString(opt.value || '')

    // Ignora placeholders vazios ("Selecione...")
    if (i === 0 && !opt.value && /selecione/i.test(optTextNorm)) {
      continue
    }

    // Regra 5: Exige que TODOS os tokens significativos estejam presentes no texto da opção
    const textHasAllTokens = tokens.every(tok => optTextNorm.includes(tok))
    const valHasAllTokens = tokens.every(tok => optValNorm.includes(tok))

    if (textHasAllTokens || valHasAllTokens) {
      return {
        selectId: selectEl.id || selectEl.name || '',
        index: i,
        text: (opt.text || opt.textContent || '').trim()
      }
    }
  }

  return null
}

/**
 * Aplica a seleção de uma opção identificada por { selectId, index, text }:
 * - Aplica estritamente por selectedIndex (não por value, permitindo values duplicados como em #disciplina)
 * - Dispara eventos 'input' e 'change'
 * - Não usa o ramo "já está com X"
 * - Sucesso SOMENTE se selectedIndex lido de volta == índice pedido
 */
export function applySelectOption(
  rootOrSelect: Document | HTMLElement | HTMLSelectElement,
  targetOption: SelectOptionIdentifier
): { success: boolean; selectedIndex: number; targetIndex: number; error?: string } {
  let selectEl: HTMLSelectElement | null = null

  if (rootOrSelect instanceof HTMLSelectElement) {
    selectEl = rootOrSelect
  } else {
    selectEl = findFormSelect(rootOrSelect, targetOption.selectId)
  }

  if (!selectEl) {
    return {
      success: false,
      selectedIndex: -1,
      targetIndex: targetOption.index,
      error: 'SelectNotFoundOrOutsideForm'
    }
  }

  // Validação do índice nos limites do select
  if (targetOption.index < 0 || targetOption.index >= selectEl.options.length) {
    return {
      success: false,
      selectedIndex: selectEl.selectedIndex,
      targetIndex: targetOption.index,
      error: 'IndexOutOfBounds'
    }
  }

  // Regra 2 & 4: Aplica diretamente via selectedIndex, disparando eventos
  selectEl.selectedIndex = targetOption.index
  selectEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
  selectEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))

  // Leitura de volta no DOM
  const verifiedIndex = selectEl.selectedIndex

  // Regra 4: Sucesso SOMENTE se o índice lido de volta for exatamente o pedido
  const isVerified = (verifiedIndex === targetOption.index)

  return {
    success: isVerified,
    selectedIndex: verifiedIndex,
    targetIndex: targetOption.index,
    error: isVerified ? undefined : 'SelectedIndexMismatch'
  }
}

/**
 * Função orquestradora completa: resolve conceito -> seleciona campo no formulário -> aplica por selectedIndex.
 */
export function resolveAndSelectField(
  doc: Document | HTMLElement,
  concept: string,
  targetQuery: string
): {
  success: boolean
  concept: string
  selectId?: string
  appliedOption?: SelectOptionIdentifier
  error?: 'UnknownConcept' | 'SelectNotFoundOrOutsideForm' | 'OptionNotFound' | 'SelectedIndexMismatch'
} {
  // 1. Mapeamento conceito -> id por tabela fixa
  const selectorOrErr = resolveConceptToId(concept)
  if (selectorOrErr === 'UnknownConcept') {
    return { success: false, concept, error: 'UnknownConcept' }
  }

  // 2. Busca o select garantindo que esteja dentro de <form>
  const selectEl = findFormSelect(doc, selectorOrErr)
  if (!selectEl) {
    return { success: false, concept, error: 'SelectNotFoundOrOutsideForm' }
  }

  // 3. Identifica opção exigindo todos os tokens significativos (sem variantes de token único)
  const option = findOptionByMatch(selectEl, targetQuery)
  if (!option) {
    return { success: false, concept, selectId: selectEl.id, error: 'OptionNotFound' }
  }

  // 4. Aplica por selectedIndex e verifica retorno
  const applyRes = applySelectOption(selectEl, option)
  if (!applyRes.success) {
    return {
      success: false,
      concept,
      selectId: selectEl.id,
      appliedOption: option,
      error: 'SelectedIndexMismatch'
    }
  }

  return {
    success: true,
    concept,
    selectId: selectEl.id,
    appliedOption: option
  }
}

export interface SlotCommand {
  concept: string
  query: string
}

export interface SlotExecutionResult {
  concept: string
  query: string
  selectId: string
  selectedIndex: number
  targetIndex: number
  appliedText: string
  verified: boolean
  success: boolean
  error?: string
}

/**
 * Executa uma sequência de seleção baseada em múltiplos slots.
 * Para cada slot, resolve o conceito para o ID do form, casa a opção e aplica,
 * verificando obrigatoriamente a leitura de volta do selectedIndex no DOM.
 */
export function executeSlots(
  doc: Document | HTMLElement,
  slots: SlotCommand[]
): SlotExecutionResult[] {
  return slots.map(slot => {
    const res = resolveAndSelectField(doc, slot.concept, slot.query)
    if (!res.success || !res.appliedOption) {
      return {
        concept: slot.concept,
        query: slot.query,
        selectId: res.selectId || '',
        selectedIndex: -1,
        targetIndex: -1,
        appliedText: '',
        verified: false,
        success: false,
        error: res.error
      }
    }

    // Leitura real e direta de volta do DOM para auditoria estrita
    const selectEl = findFormSelect(doc, res.selectId || '')
    const verifiedIndex = selectEl ? selectEl.selectedIndex : -1
    const isVerified = (verifiedIndex === res.appliedOption.index)

    return {
      concept: slot.concept,
      query: slot.query,
      selectId: res.selectId || '',
      selectedIndex: verifiedIndex,
      targetIndex: res.appliedOption.index,
      appliedText: res.appliedOption.text,
      verified: isVerified,
      success: res.success && isVerified
    }
  })
}

/**
 * Extrai slots conceituais a partir de texto delimitado por vírgula ou conectivos.
 * Classifica cada segmento no conceito semântico correspondente da tabela fixa.
 */
export function parseCommandToSlots(command: string): SlotCommand[] {
  const segments = command.split(/[,;]+/).map(s => s.trim()).filter(Boolean)
  const slots: SlotCommand[] = []

  for (const seg of segments) {
    const norm = normalizeString(seg)
    if (/\b(?:turma|ano|serie)\b/.test(norm) || /\b\d+\b/.test(norm)) {
      slots.push({ concept: 'turma', query: seg })
    } else if (/\b(?:ingles|inglesa|portugues|portuguesa|matematica|historia|geografia|ciencias|disciplina)\b/.test(norm)) {
      slots.push({ concept: 'disciplina', query: seg })
    } else if (/\b(?:ordem|alfabetica|matricula|chamada)\b/.test(norm)) {
      slots.push({ concept: 'ordem', query: seg })
    } else if (/\b(?:bimestre|mes|divisao)\b/.test(norm)) {
      slots.push({ concept: 'divisao', query: seg })
    } else if (/\b(?:dia|data)\b/.test(norm)) {
      slots.push({ concept: 'dia', query: seg })
    } else if (/\b(?:ativos|inativos|todos)\b/.test(norm)) {
      slots.push({ concept: 'ativos', query: seg })
    }
  }

  return slots
}

