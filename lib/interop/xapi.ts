/**
 * lib/interop/xapi.ts — xAPI Statement Builder (Gap 12 · Onda 3)
 *
 * Constrói xAPI statements (Tin Can API) para Learning Record Stores (LRS).
 * Segue a especificação xAPI 1.0.3 (ADL/IEEE).
 *
 * Uso:
 *   const stmt = buildAnsweredStatement(actor, item, correct, durationMs)
 *   await sendToLrs(stmt, lrsEndpoint, authToken)
 *
 * LGPD: O campo actor.name e actor.mbox são pseudonymizados antes do envio.
 * O teacherId/studentId nunca é enviado em claro.
 */

/* ─── xAPI Core Types (subset) ──────────────────────────────────────────────── */
export interface XApiActor {
  objectType: 'Agent'
  name:       string   // pseudonymizado
  mbox:       string   // mailto:hash@teacher-ia.local
}

export interface XApiVerb {
  id:      string   // IRI
  display: Record<string, string>  // lang → label
}

export interface XApiObject {
  objectType: 'Activity'
  id:         string  // IRI do item
  definition?: {
    name:        Record<string, string>
    description?: Record<string, string>
    type:        string
    interactionType?: string
    correctResponsesPattern?: string[]
    choices?: Array<{ id: string; description: Record<string, string> }>
  }
}

export interface XApiResult {
  score?:      { raw: number; min: number; max: number; scaled: number }
  success?:    boolean
  completion?: boolean
  duration?:   string   // ISO 8601 duration, e.g. "PT3M14S"
  response?:   string
}

export interface XApiContext {
  registration?: string
  extensions?:   Record<string, unknown>
}

export interface XApiStatement {
  id:        string
  actor:     XApiActor
  verb:      XApiVerb
  object:    XApiObject
  result?:   XApiResult
  context?:  XApiContext
  timestamp: string
  stored?:   string
  version:   '1.0.3'
}

/* ─── Verbs IRI ───────────────────────────────────────────────────────────────── */
export const VERBS = {
  answered:   { id: 'http://adlnet.gov/expapi/verbs/answered',   display: { 'pt-BR': 'respondeu',  'en': 'answered'   } },
  completed:  { id: 'http://adlnet.gov/expapi/verbs/completed',  display: { 'pt-BR': 'completou',  'en': 'completed'  } },
  passed:     { id: 'http://adlnet.gov/expapi/verbs/passed',     display: { 'pt-BR': 'passou',     'en': 'passed'     } },
  failed:     { id: 'http://adlnet.gov/expapi/verbs/failed',     display: { 'pt-BR': 'reprovou',   'en': 'failed'     } },
  experienced:{ id: 'http://adlnet.gov/expapi/verbs/experienced',display: { 'pt-BR': 'acessou',    'en': 'experienced'} },
  attempted:  { id: 'http://adlnet.gov/expapi/verbs/attempted',  display: { 'pt-BR': 'tentou',     'en': 'attempted'  } },
} as const

/* ─── Helpers ─────────────────────────────────────────────────────────────────── */
function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/** ISO 8601 duration from milliseconds. */
function msToDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  return `PT${h > 0 ? h + 'H' : ''}${m % 60 > 0 ? (m % 60) + 'M' : ''}${s % 60}S`
}

/** Pseudonymiza um ID para uso como mbox (nunca enviar ID real). */
export function pseudoActor(pseudoId: string, displayName?: string): XApiActor {
  return {
    objectType: 'Agent',
    name:       displayName ?? `student_${pseudoId.slice(-4)}`,
    mbox:       `mailto:${pseudoId}@teacher-ia.local`,
  }
}

/* ─── Statement builders ─────────────────────────────────────────────────────── */

/**
 * Statement para resposta a uma questão de múltipla escolha.
 */
export function buildAnsweredStatement(
  actor:       XApiActor,
  item: {
    id:       string   // IRI do item
    title:    string
    choices?: Array<{ id: string; text: string }>
    correctId?: string
  },
  correct:     boolean,
  durationMs?: number,
  score?:      { raw: number; max: number },
  registration?: string
): XApiStatement {
  const stmt: XApiStatement = {
    id:    uuid(),
    actor,
    verb:  correct ? VERBS.passed : VERBS.answered,
    object: {
      objectType: 'Activity',
      id: item.id.startsWith('http') ? item.id : `https://teacher-ia.local/items/${item.id}`,
      definition: {
        name:            { 'pt-BR': item.title, 'en': item.title },
        type:            'http://adlnet.gov/expapi/activities/cmi.interaction',
        interactionType: 'choice',
        correctResponsesPattern: item.correctId ? [item.correctId] : undefined,
        choices: item.choices?.map(c => ({ id: c.id, description: { 'pt-BR': c.text } })),
      },
    },
    result: {
      success:    correct,
      completion: true,
      duration:   durationMs !== undefined ? msToDuration(durationMs) : undefined,
      score:      score ? {
        raw:    score.raw,
        min:    0,
        max:    score.max,
        scaled: score.raw / score.max,
      } : undefined,
    },
    context: registration ? { registration } : undefined,
    timestamp: new Date().toISOString(),
    version: '1.0.3',
  }
  return stmt
}

/**
 * Statement para conclusão de aula/módulo.
 */
export function buildCompletedStatement(
  actor:       XApiActor,
  activity: { id: string; title: string },
  score?:   { raw: number; max: number },
  durationMs?: number
): XApiStatement {
  return {
    id:    uuid(),
    actor,
    verb:  VERBS.completed,
    object: {
      objectType: 'Activity',
      id: activity.id.startsWith('http') ? activity.id : `https://teacher-ia.local/activities/${activity.id}`,
      definition: {
        name: { 'pt-BR': activity.title, 'en': activity.title },
        type: 'http://adlnet.gov/expapi/activities/lesson',
      },
    },
    result: {
      completion: true,
      success:    score ? score.raw / score.max >= 0.6 : undefined,
      duration:   durationMs !== undefined ? msToDuration(durationMs) : undefined,
      score:      score ? { raw: score.raw, min: 0, max: score.max, scaled: score.raw / score.max } : undefined,
    },
    timestamp: new Date().toISOString(),
    version: '1.0.3',
  }
}

/* ─── LRS Transport ────────────────────────────────────────────────────────────── */

export interface LrsConfig {
  endpoint:   string   // e.g. "https://lrs.example.com/xapi/"
  authToken:  string   // Basic ou Bearer
  authType:   'basic' | 'bearer'
}

/**
 * Envia um ou mais statements para um LRS.
 * Retorna os IDs confirmados pelo LRS.
 */
export async function sendToLrs(
  statements: XApiStatement | XApiStatement[],
  config:     LrsConfig
): Promise<string[]> {
  const payload = Array.isArray(statements) ? statements : [statements]
  const authHeader = config.authType === 'bearer'
    ? `Bearer ${config.authToken}`
    : `Basic ${config.authToken}`

  const response = await fetch(`${config.endpoint}statements`, {
    method:  'POST',
    headers: {
      'Content-Type':   'application/json',
      'X-Experience-API-Version': '1.0.3',
      'Authorization':  authHeader,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`LRS error ${response.status}: ${await response.text()}`)
  }

  return response.json() as Promise<string[]>
}

/* ─── Buffer local (quando LRS não configurado) ─────────────────────────────── */

const BUFFER_KEY    = 'teacher_xapi_buffer'
const MAX_BUFFERED  = 500

/** Salva statement no buffer local para envio posterior. */
export function bufferStatement(stmt: XApiStatement): void {
  try {
    const buf: XApiStatement[] = JSON.parse(localStorage.getItem(BUFFER_KEY) || '[]')
    buf.push(stmt)
    localStorage.setItem(BUFFER_KEY, JSON.stringify(buf.slice(-MAX_BUFFERED)))
  } catch { /* quota */ }
}

/** Retorna statements pendentes (não enviados). */
export function getBufferedStatements(): XApiStatement[] {
  try { return JSON.parse(localStorage.getItem(BUFFER_KEY) || '[]') }
  catch { return [] }
}

/** Limpa buffer após envio bem-sucedido. */
export function clearBuffer(): void {
  try { localStorage.removeItem(BUFFER_KEY) } catch { /* ignore */ }
}
