// lib/explorer/domDistiller.ts
// Destilador de Árvore DOM Interativa (Browser-Use buildDomTree pattern) com Sanitização LGPD Trilho 2 e Anti-Loop State Hash

export interface DistilledInteractiveElement {
  idx: number
  tag: string
  role: string
  label: string
  context: string
  selector: string
  isDestructive: boolean
}

export interface DistilledDomSnapshot {
  urlPath: string
  stateHash: string
  elements: DistilledInteractiveElement[]
  compactPromptText: string
}

const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2}\b/g
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
const LONG_DIGITS_RE = /\b\d{6,14}\b/g

const DESTRUCTIVE_RE =
  /\b(excluir|apagar|deletar|remover|limpar|resetar|sair|logout|desconectar|cancelar|encerrar|fechar|fechamento|consolidar|finalizar|concluir|lancar|lançar|aprovar|reprovar|assinar|homologar|bloquear|desbloquear)\b/i

/**
 * Sanitiza rótulos estruturais removendo qualquer PII acidental (Trilho 2 LGPD).
 */
export function sanitizeStructuralLabel(raw: string): string {
  if (!raw) return ''
  return raw
    .replace(CPF_RE, '[CPF_PROTEGIDO]')
    .replace(EMAIL_RE, '[EMAIL_PROTEGIDO]')
    .replace(LONG_DIGITS_RE, '[ID_PROTEGIDO]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90)
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function buildStableSelector(el: Element): string {
  const tag = el.tagName.toLowerCase()
  if (el.id && !/^\d/.test(el.id) && !el.id.includes(':')) {
    return `#${el.id}`
  }
  const testId = el.getAttribute('data-testid') || el.getAttribute('data-cy') || el.getAttribute('data-qa')
  if (testId) return `${tag}[data-testid="${testId.replace(/"/g, '\\"')}"]`
  const name = el.getAttribute('name')
  if (name) return `${tag}[name="${name.replace(/"/g, '\\"')}"]`
  const ariaLabel = el.getAttribute('aria-label')
  if (ariaLabel) return `${tag}[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`
  const href = el.getAttribute('href')
  if (tag === 'a' && href && !href.startsWith('javascript:') && href !== '#') {
    return `a[href="${href.replace(/"/g, '\\"')}"]`
  }
  const taiIdx = el.getAttribute('data-tai-idx')
  if (taiIdx) return `[data-tai-idx="${taiIdx}"]`
  return tag
}

function isElementVisible(el: Element): boolean {
  if ((el as HTMLElement).hidden || el.getAttribute('aria-hidden') === 'true') return false
  if (typeof el.getClientRects === 'function') {
    const rects = el.getClientRects()
    if (rects && rects.length === 0) return false
  }
  if (typeof el.getBoundingClientRect === 'function') {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return false
  }
  return true
}

/**
 * Destila a página atual em uma lista indexada de controles interativos (~500 tokens),
 * atribuindo `data-tai-idx` aos elementos, mascarando PII (Trilho 2) e gerando `stateHash` anti-loop.
 */
export function distillInteractiveDom(doc: Document, maxElements = 60): DistilledDomSnapshot {
  const candidates = Array.from(
    doc.querySelectorAll(
      'a[href], button, select, input:not([type="hidden"]):not([type="password"]), [role="tab"], [role="menuitem"], [role="button"], [role="combobox"], [role="option"]'
    )
  )

  const elements: DistilledInteractiveElement[] = []
  let idxCounter = 1

  for (const el of candidates) {
    if (elements.length >= maxElements) break
    if (!isElementVisible(el)) continue

    // Evita indexar células individuais de tabelas de alunos como navegação estrutural (Trilho 2 LGPD)
    const inDataRow = el.closest?.('tbody tr, [role="row"]')
    if (inDataRow && !el.closest?.('thead, nav, header, [role="navigation"], [role="tablist"]')) {
      const tag = el.tagName.toLowerCase()
      if (tag === 'input' || tag === 'select') continue
    }

    const tag = el.tagName.toLowerCase()
    const role = el.getAttribute('role') || tag
    const rawLabel =
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      el.getAttribute('placeholder') ||
      (el as HTMLElement).innerText ||
      el.textContent ||
      (el as HTMLInputElement).value ||
      ''
    const label = sanitizeStructuralLabel(rawLabel)
    if (!label && tag !== 'select' && tag !== 'input') continue

    const containerEl = el.closest?.('nav, header, aside, [role="navigation"], [role="tablist"], form, section, main')
    const contextTag = containerEl
      ? containerEl.getAttribute('aria-label') || containerEl.tagName.toLowerCase()
      : 'body'
    const context = sanitizeStructuralLabel(contextTag)

    const idx = idxCounter++
    try {
      el.setAttribute('data-tai-idx', String(idx))
    } catch {}

    const selector = buildStableSelector(el)
    const isDestructive = DESTRUCTIVE_RE.test(label)
    const options =
      tag === 'select'
        ? Array.from((el as HTMLSelectElement).options || [])
            .filter((o) => !o.disabled && !(o as HTMLElement).hidden && (o as HTMLElement).style?.display !== 'none')
            .map((o) => ({ value: String(o.value ?? ''), text: sanitizeStructuralLabel(o.text || o.label || '') }))
            .filter((o) => o.text.length > 0)
        : undefined

    elements.push({
      idx,
      tag,
      role,
      label,
      context,
      selector,
      isDestructive,
      ...(options ? { options } : {}),
    })
  }

  const urlPath = doc.location?.pathname || '/'
  const signatureSource = `${urlPath}|` + elements.map(e => `${e.tag}:${e.role}:${e.label}`).join('|')
  const stateHash = fnv1aHex(signatureSource)

  const compactPromptText = elements
    .filter(e => !e.isDestructive)
    .map(e => `[${e.idx}] <${e.tag} role="${e.role}" ctx="${e.context}">${e.label}</${e.tag}>`)
    .join('\n')

  return {
    urlPath,
    stateHash,
    elements,
    compactPromptText,
  }
}

export interface DecomposedTeacherCommand {
  filters: Array<{ concept: 'turma' | 'bimestre' | 'disciplina' | 'data'; value: string }>
  navigationTarget: string | null
  taskIntent: 'lancar_falta' | 'lancar_nota' | 'read_roster' | 'explore'
  entities: {
    aluno?: string
    valor?: string
    data?: string
  }
}

const ORDINAL_MAP: Record<string, string> = {
  primeiro: '1', primeira: '1',
  segundo: '2', segunda: '2',
  terceiro: '3', terceira: '3',
  quarto: '4', quarta: '4',
  quinto: '5', quinta: '5',
  sexto: '6', sexta: '6',
  setimo: '7', setima: '7',
  oitavo: '8', oitava: '8',
  nono: '9', nona: '9',
}

export function normalizePortalGoalVariants(rawGoal: string): { cleanGoal: string; variants: string[] } {
  const base = String(rawGoal || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^(?:por\s+favor\s+)?(?:selecione|selecionar|escolha|escolher|filtre\s+por|filtrar\s+por|filtrar|ir\s+para|ir\s+em|va\s+para|abrir|abra|clicar\s+no\s+botao|clique\s+no\s+botao|clicar\s+em|clique\s+em|clicar\s+no|clique\s+no|clicar\s+na|clique\s+na|clicar|clique|aperte|apertar|pressione|pressionar|acessar|acesse|ver|mostrar|mudar\s+para)\s+/i, '')
    .replace(/\s+(?:nos\s+filtros|no\s+filtro|na\s+aba|nas\s+abas|no\s+menu|na\s+lista|no\s+campo|no\s+botao|do\s+portal|da\s+pagina)$/i, '')
    .replace(/^(?:a\s+turma|o\s+ano|a\s+disciplina|o\s+mes|a\s+aba|o\s+botao|o\s+filtro\s+de|o\s+filtro)\s+/i, '')
    .trim()

  const spaceNormalized = base.replace(/[/\-_,.;:]+/g, ' ').replace(/\s+/g, ' ').trim()
  const withoutYear = spaceNormalized.replace(/\b20\d{2}\b/g, '').replace(/\s+/g, ' ').trim()
  const variants = new Set<string>([base, spaceNormalized])
  if (withoutYear.length >= 3) variants.add(withoutYear)

  const subjectPairs: Array<[string, string]> = [
    ['lingua inglesa', 'ingles'],
    ['lingua portuguesa', 'portugues'],
    ['educacao fisica', 'ed fisica'],
    ['ensino religioso', 'religiao'],
  ]
  for (const [full, short] of subjectPairs) {
    if (spaceNormalized.includes(full)) variants.add(spaceNormalized.replace(full, short))
    if (spaceNormalized.includes(short)) variants.add(spaceNormalized.replace(short, full))
  }

  for (const [word, digit] of Object.entries(ORDINAL_MAP)) {
    if (new RegExp(`\\b${word}\\b`).test(base)) {
      variants.add(base.replace(new RegExp(`\\b${word}\\b`, 'g'), digit))
      variants.add(base.replace(new RegExp(`\\b${word}\\b`, 'g'), `${digit}º`))
      variants.add(base.replace(new RegExp(`\\b${word}\\b`, 'g'), `${digit}o`))
      variants.add(base.replace(new RegExp(`\\b${word}\\b`, 'g'), `${digit}ª`))
    } else if (new RegExp(`\\b${digit}[º°oaª]?\\b`).test(base)) {
      variants.add(base.replace(new RegExp(`\\b${digit}[º°oaª]?\\b`, 'g'), word))
      variants.add(base.replace(new RegExp(`\\b${digit}[º°oaª]?\\b`, 'g'), digit))
      variants.add(base.replace(new RegExp(`\\b${digit}[º°oaª]?\\b`, 'g'), `${digit}º`))
    }
  }
  return { cleanGoal: base, variants: Array.from(variants).filter(Boolean) }
}

/**
 * Divide comandos encadeados (com vírgulas, "depois", "em seguida" ou verbos repetidos como
 * "acesse frequencia, depois selecione setimo ano selecione lingua inglesa selecione julho/2026")
 * em até 10 passos individuais.
 */
export function splitMultiStepTeacherCommand(rawText: string): string[] {
  const cleaned = String(rawText || '').trim()
  if (!cleaned) return []
  return cleaned
    .split(
      /\s*(?:[,;]|->|>|›|\b(?:e\s+depois|depois|em\s+seguida|logo\s+ap[oó]s|ent[aã]o)\b|(?<!\bnotas|\bindique)\s+e\s+(?!faltas\b|ganhe\b)|\s+(?=(?:selecione|selecionar|escolha|escolher|clicar\s+em|clique\s+em|abrir|abra|ir\s+para|va\s+para|vá\s+para|acessar|acesse|filtrar\s+por|filtre\s+por)\b))\s*/i
    )
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 10)
}

/**
 * Decompõe comandos compostos multi-etapa da professora em filtros prévios, alvo de navegação e intenção final.
 */
export function decomposeCompoundTeacherCommand(rawText: string): DecomposedTeacherCommand {
  const text = String(rawText || '').trim()
  const norm = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const filters: Array<{ concept: 'turma' | 'bimestre' | 'disciplina' | 'data'; value: string }> = []

  const turmaMatch =
    text.match(/\bturma\s+([0-9]{1,2}[º°ª]?\s*(?:ano|serie|série|em)?\s*(?!(?:nos?|nas?|em|de|do|da|para|e)\b)[A-Za-z0-9\-]*)/i) ||
    norm.match(/\b((?:primeiro|segundo|terceiro|quarto|quinto|sexto|setimo|oitavo|nono|[1-9][º°oaª]?)\s*(?:ano|serie)(?:\s+(?!(?:nos?|nas?|em|de|do|da|para|e)\b)[a-z0-9]{1,3})?)\b/i)
  if (turmaMatch) {
    filters.push({ concept: 'turma', value: turmaMatch[1].trim().replace(/[,.]+$/, '') })
  }

  const bimMatch = text.match(/\b([1-4][º°]?\s*(?:bimestre|trimestre|semestre|etapa))/i)
  if (bimMatch) {
    filters.push({ concept: 'bimestre', value: bimMatch[1].trim() })
  }

  const discMatch = text.match(/\bdisciplina\s+(?:de\s+)?([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?)/i)
  if (discMatch) {
    filters.push({ concept: 'disciplina', value: discMatch[1].trim().replace(/[,.]+$/, '') })
  }

  const dateMatch = text.match(/\b(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\b/)
  if (dateMatch) {
    filters.push({ concept: 'data', value: dateMatch[1] })
  }

  let taskIntent: DecomposedTeacherCommand['taskIntent'] = 'explore'
  let navigationTarget: string | null = null

  if (/\b(falta|presenca|frequencia|chamada)\b/.test(norm)) {
    taskIntent = 'lancar_falta'
    navigationTarget = 'frequencia'
  } else if (/\b(nota|notas|avaliacao|conceito|media|boletim)\b/.test(norm)) {
    taskIntent = 'lancar_nota'
    navigationTarget = 'notas'
  } else if (/\b(lista|alunos|chamada|relacao|discentes)\b/.test(norm)) {
    taskIntent = 'read_roster'
    navigationTarget = 'alunos'
  }

  const entities: DecomposedTeacherCommand['entities'] = {}
  if (dateMatch) entities.data = dateMatch[1]

  const studentMatch = text.match(/\b(?:para|alun[oa])\s+([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)*)/)
  if (studentMatch) {
    entities.aluno = studentMatch[1].trim()
  }

  const gradeMatch = text.match(/\bnota\s+(\d+(?:[.,]\d+)?)/i)
  if (gradeMatch) {
    entities.valor = gradeMatch[1].replace(',', '.')
  } else if (taskIntent === 'lancar_falta') {
    entities.valor = /\bpresen[çc]a\b/i.test(text) ? 'presente' : 'falta'
  }

  return {
    filters,
    navigationTarget,
    taskIntent,
    entities,
  }
}

const SEMANTIC_CLUSTERS: string[][] = [
  ['notas', 'avaliacoes', 'avaliacao', 'conceitos', 'boletim', 'medias', 'digitacao de notas', 'rendimento'],
  ['frequencia', 'chamada', 'fazer chamada', 'faltas', 'presenca', 'assiduidade', 'diario de frequencia'],
  ['conteudo', 'conteudo ministrado', 'aula dada', 'plano de aula', 'registro de aula', 'diario de classe'],
  ['alunos', 'discentes', 'estudantes', 'meus alunos', 'relacao nominal', 'lista de alunos', 'turmas'],
]

export function selectBestDistilledAction(
  snapshot: DistilledDomSnapshot,
  goalText: string,
  visitedStateHashes: Set<string> = new Set(),
  clickedSelectors: Set<string> = new Set()
): {
  selected: DistilledInteractiveElement | null
  matchedOption?: { value: string; text: string }
  backtrack: boolean
  score: number
} {
  const isRepeatedState = visitedStateHashes.has(snapshot.stateHash)
  const { cleanGoal, variants } = normalizePortalGoalVariants(goalText)

  const expanded = new Set<string>(variants)
  for (const cluster of SEMANTIC_CLUSTERS) {
    if (cluster.some(c => cleanGoal.includes(c) || c.includes(cleanGoal))) {
      for (const c of cluster) expanded.add(c)
    }
  }

  let best: DistilledInteractiveElement | null = null
  let bestOption: { value: string; text: string } | undefined
  let bestScore = -1

  for (const el of snapshot.elements) {
    if (el.isDestructive) continue
    if (clickedSelectors.has(el.selector)) continue

    if (el.tag === 'select' && Array.isArray((el as any).options)) {
      for (const opt of (el as any).options as Array<{ value: string; text: string; disabled?: boolean; hidden?: boolean }>) {
        if (opt.disabled || opt.hidden) continue
        const normOpt = opt.text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[/\-_,.;:]+/g, ' ').replace(/\s+/g, ' ').trim()
        if (!normOpt || /^selecione\b/i.test(normOpt)) continue
        for (const v of variants) {
          if (!v) continue
          const vNoOrd = v.replace(/[º°ª]/g, '')
          const optNoOrd = normOpt.replace(/[º°ª]/g, '')
          let optScore = 0
          if (optNoOrd === vNoOrd) optScore = 98
          else if (optNoOrd.startsWith(vNoOrd) || optNoOrd.includes(vNoOrd)) optScore = 88
          else if (optNoOrd.length >= 4 && vNoOrd.includes(optNoOrd)) optScore = 84
          if (optScore > bestScore) {
            bestScore = optScore
            best = el
            bestOption = opt
          }
        }
      }
    }

    const normLabel = el.label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
    if (!normLabel) continue

    let score = 0
    for (const v of variants) {
      if (normLabel === v) score = Math.max(score, 100)
      else if (normLabel.startsWith(v) && v.length >= 3) score = Math.max(score, 85)
      else if (v.length >= 3 && normLabel.includes(v)) score = Math.max(score, 72)
    }
    if (score === 0 && normLabel.length >= 4) {
      for (const syn of expanded) {
        if (syn.length < 4) continue
        if (normLabel === syn) {
          score = Math.max(score, 78)
          break
        }
        if (normLabel.includes(syn)) {
          score = Math.max(score, 60)
        }
      }
    }

    if (score > 0) {
      if (el.role === 'tab' || el.role === 'menuitem' || el.context === 'nav') score += 12
      if (score > bestScore) {
        bestScore = score
        best = el
        bestOption = undefined
      }
    }
  }

  if (!best && isRepeatedState) {
    return { selected: null, backtrack: true, score: 0 }
  }

  return {
    selected: bestScore >= 40 ? best : null,
    ...(bestOption ? { matchedOption: bestOption } : {}),
    backtrack: false,
    score: Math.max(0, bestScore),
  }
}

/**
 * Reconcilia em malha fechada (Closed-Loop Self-Healing) todos os filtros <select>
 * previamente selecionados na página caso um filtro dependente subsequente (ex.: Mês -> Disciplina)
 * tenha resetado o valor via AJAX.
 */
export function reconcileDomSelectFilters(
  snapshot: DistilledDomSnapshot,
  priorSelectGoals: string[],
  currentSelectValues: Record<string, string>
): Array<{ selector: string; restoredValue: string; restoredText: string }> {
  const restored: Array<{ selector: string; restoredValue: string; restoredText: string }> = []
  if (!priorSelectGoals || priorSelectGoals.length === 0) return restored

  for (const goal of priorSelectGoals) {
    const match = selectBestDistilledAction(snapshot, goal)
    if (!match.selected || match.selected.tag !== 'select' || !match.matchedOption) continue
    const selector = match.selected.selector
    const curVal = currentSelectValues[selector] ?? ''
    if (curVal !== match.matchedOption.value && curVal !== match.matchedOption.text) {
      currentSelectValues[selector] = match.matchedOption.value
      restored.push({
        selector,
        restoredValue: match.matchedOption.value,
        restoredText: match.matchedOption.text,
      })
    }
  }
  return restored
}

export {
  planDomGroundedActions,
  verifySelectPostCondition,
  type PlannedDomAction,
  type SelectPostConditionResult,
} from './domActionPlanner'


