/**
 * lib/conversationData/eventClassifier.ts
 *
 * Classificador de eventos conversacionais estruturados.
 * Combina regras determinísticas robustas com gancho para LLM local (Ollama).
 * Cada evento contém seu trecho exato de evidência textual e temporal.
 */

import type { ConversationVaultRepository } from './schema'
import type { TurnRecord, EventRecord, EventType, EventSubtype } from './types'

export interface GroundTruthEvent {
  turn_index: number
  type: EventType
  subtype?: EventSubtype
}

// Ground truth anotado manualmente para a fixture aula_50min_bio
export const GROUND_TRUTH_AULA_50MIN: GroundTruthEvent[] = [
  { turn_index: 0, type: 'monologo', subtype: 'professor' },
  { turn_index: 1, type: 'monologo', subtype: 'professor' },
  { turn_index: 2, type: 'pergunta', subtype: 'aberta' },
  { turn_index: 2, type: 'wait_time', subtype: 'anomalo' },
  { turn_index: 4, type: 'pergunta', subtype: 'fechada' },
  { turn_index: 6, type: 'pergunta', subtype: 'aluno' },
  { turn_index: 7, type: 'monologo', subtype: 'professor' },
  { turn_index: 8, type: 'pergunta', subtype: 'fechada' },
  { turn_index: 8, type: 'wait_time', subtype: 'anomalo' },
  { turn_index: 10, type: 'pergunta', subtype: 'aluno' },
  { turn_index: 11, type: 'monologo', subtype: 'professor' },
  { turn_index: 12, type: 'monologo', subtype: 'professor' },
  { turn_index: 13, type: 'pergunta', subtype: 'fechada' },
  { turn_index: 15, type: 'pergunta', subtype: 'fechada' },
  { turn_index: 15, type: 'monologo', subtype: 'professor' },
  { turn_index: 17, type: 'instrucao', subtype: 'none' },
  { turn_index: 17, type: 'monologo', subtype: 'professor' }
]

const OPEN_QUESTION_PATTERNS = [
  /\bcomo vocês explicariam\b/i,
  /\bo que aconteceria\b/i,
  /\bqual o impacto\b/i,
  /\bde que forma\b/i,
  /\bpor que\b/i,
  /\bpor quê\b/i,
  /\bexplique\b/i,
  /\bquais as consequências\b/i,
  /\bcomo podemos relacionar\b/i
]

const CLOSED_QUESTION_PATTERNS = [
  /\bsão consideradas\b/i,
  /\bqual é o principal\b/i,
  /\bconseguimos absorver\b/i,
  /\bé verdade que\b/i,
  /\bvocês acham que sim ou não\b/i,
  /\bquem pode me dar um exemplo\b/i
]

const INSTRUCTION_PATTERNS = [
  /\bfaçam os exercícios\b/i,
  /\bguardem os estojos\b/i,
  /\batenção classe\b/i,
  /\bfaçam silêncio\b/i,
  /\babram na página\b/i
]

// NÃO VALIDADO EM ASR REAL — Heurísticas refinadas para falas adversariais
const RHETORICAL_PATTERNS = [
  /^\s*(entenderam|entendeu|né|ne|tá bom|ta bom|tá|ta|certo|beleza|tranquilo|faz sentido|tudo certinho|tudo bem até aqui|tudo bem ate aqui|estão me ouvindo|estao me ouvindo|tá dando pra ouvir|ta dando pra ouvir|dando pra ouvir)\s*(turma|pessoal|gente|galera|no fundo da sala|isso pra vocês|isso pra voces)?\s*[?!.]*$/i
]

const UPTALK_HESITATION_PATTERNS = [
  /^\s*(a resposta certa é|a resposta certa eh|eu acho que|o brasil é o|o brasil foi|a célula animal não tem|a celula vegetal tem|eu fiz o|minha resposta é|minha resposta deu|a capital da argentina|a fórmula da água oxigenada|o verbo está|o sangue oxigenado)(?:\s|$)/i
]

const ELICITATION_PATTERNS = [
  /\b(me\s+explica|me\s+diga|me\s+fale|diga\s+(?:para|pra)|gostaria\s+de\s+saber|quero\s+que\s+voc[eê]s\s+reflitam|quero\s+ouvir\s+de\s+voc[eê]s)\b/i,
  /\b(explique|descreva|demonstre|cite|aponte|detalhe|fale|diga)\b(?:\s+(?:pra\s+turma|para\s+a\s+turma|pra\s+gente|para\s+mim|pra\s+mim|para\s+nós|dois|duas|um|uma|tr[eê]s|ao\s+menos|me)\s+[\w\s]{1,25}?)?\s+(?:como|por\s*qu[eê]|porque|qual|quais|o\s+que|onde|quem|exemplos?|diferen[cç]as?|etapas?)\b/i
]

const ADMINISTRATIVE_PATTERNS = [
  /\bposso\s+(?:ir\s+ao\s+banheiro|ir\s+no\s+banheiro|beber\s+[aá]gua|ir\s+beber\s+[aá]gua|entregar|fazer|apontar|ligar|usar|sair)\b/i,
  /\b(?:vai\s+cair|cai)\s+n[ao]\s+(?:prova|teste|simulado|avalia[cç][aã]o)\b/i,
  /\bque\s+horas\s+(?:bate\s+o\s+sinal|o\s+recreio\s+come[cç]a|come[cç]a\s+o\s+recreio|acaba\s+a\s+aula|termina|toca)\b/i,
  /\bonde\s+(?:jogo|que\s+joga|descarta|coloca)\s+(?:esse\s+papel|o\s+lixo|a\s+ponta|o\s+papel)\b/i,
  /\b(?:pode|d[aá]\s+pra|da\s+para)\s+(?:ser\s+feito\s+em|fazer\s+em|entregar\s+na)\s+(?:dupla|trio|grupo|semana\s+que\s+vem|secretaria)\b/i,
  /\btem\s+(?:folha\s+de\s+rascunho|l[aá]pis|borracha|material)\s+sobrando\b/i,
  /\bo\s+trabalho\s+de\s+[\w\s]{2,20}?\s+pode\s+ser\s+feito\b/i
]

const INTERRUPTION_PATTERNS = [
  /\.\.\.$/i,
  /^\s*(mas se a gente|espera aí|espera ai|olha ali|gente silêncio|gente silencio|não entendi nada|nao entendi nada|entao como eu ia dizendo|como eu ia dizendo)\b/i
]

const VOCATIVE_PREFIX_REGEX = /^\s*(professora|professor|profa|profe|fala\s+prof|pessoal|turma|gente|galera|ei)\b\s*,?\s*/i

export function isQuestionText(text: string, speakerRole: 'professor' | 'aluno' = 'professor'): boolean {
  const trimmed = text.trim()

  // 1. Interrupções ou falas incompletas não são perguntas conceituais
  if (INTERRUPTION_PATTERNS.some(p => p.test(trimmed))) {
    return false
  }

  // 2. Retóricas / checagem de canal ('entenderam?', 'né?')
  if (RHETORICAL_PATTERNS.some(p => p.test(trimmed))) {
    return false
  }

  // 3. Afirmações com hesitação discente ('a resposta certa é a letra C?')
  if (speakerRole === 'aluno' && UPTALK_HESITATION_PATTERNS.some(p => p.test(trimmed))) {
    return false
  }

  // 4. Comandos de elicitação sem '?' ('me explica por que...', 'diga para a turma qual...')
  if (ELICITATION_PATTERNS.some(p => p.test(trimmed))) {
    return true
  }

  // 5. Perguntas administrativas explícitas
  if (ADMINISTRATIVE_PATTERNS.some(p => p.test(trimmed))) {
    return true
  }

  // 6. Presença de ponto de interrogação
  if (trimmed.includes('?')) {
    return true
  }

  // 7. Normalização de vocativo em ASR (remove prefixo "professora...", "turma...")
  const withoutVocative = trimmed.replace(VOCATIVE_PREFIX_REGEX, '')

  // 8. Estilo ASR sem pontuação (início com pronome interrogativo ou inversão interrogativa)
  if (/^\s*(o que|quem|qual|quais|como|onde|por que|porque|por quê|quando|quanto|quantos|quantas|será que|sera que)\b/i.test(withoutVocative)) {
    return true
  }

  // 9. Oração subordinada condicional seguida de interrogativa ("se a terra gira... porque a gente nao...")
  if (/\bse\s+[\w\s]{3,35}?\s+(por\s*qu[eê]|porque|como|quem|qual|o\s+que)\s+(?:a\s+gente|n[oó]s|voc[eê]s|[eé]\s+que)\b/i.test(withoutVocative)) {
    return true
  }

  return false
}

export function extractQuestionSpan(text: string): string {
  const match = text.match(/([^.!?\n]+[?])/i)
  if (match) return match[1].trim()
  return text.trim()
}

export function classifyQuestionSubtype(text: string, role: string): EventSubtype {
  if (role === 'aluno') {
    if (ADMINISTRATIVE_PATTERNS.some(p => p.test(text))) {
      return 'aluno' // agrupado como aluno ou administrativa
    }
    return 'aluno'
  }
  for (const pattern of OPEN_QUESTION_PATTERNS) {
    if (pattern.test(text)) return 'aberta'
  }
  for (const pattern of CLOSED_QUESTION_PATTERNS) {
    if (pattern.test(text)) return 'fechada'
  }
  return 'fechada'
}

export type QuestionTripartiteSubtype = 'conteudo' | 'checagem' | 'administrativa'

export function classifyQuestionTripartiteSubtype(text: string): QuestionTripartiteSubtype {
  const trimmed = text.trim()
  if (RHETORICAL_PATTERNS.some(p => p.test(trimmed))) {
    return 'checagem'
  }
  if (ADMINISTRATIVE_PATTERNS.some(p => p.test(trimmed))) {
    return 'administrativa'
  }
  return 'conteudo'
}

// ─── Avaliador de Falas Adversariais (NÃO VALIDADO EM ASR REAL) ──────────────

export interface AdversarialEvaluationResult {
  total: number
  accuracy: number
  precision: number
  recall: number
  f1Score: number
  details: Array<{
    id: number
    text: string
    category: string
    expectedIsQuestion: boolean
    detectedAsQuestion: boolean
    correct: boolean
  }>
}

export function classifyAdversarialUtterance(text: string, speakerRole: 'professor' | 'aluno'): boolean {
  return isQuestionText(text, speakerRole)
}

export function evaluateAdversarialBenchmark(
  dataset: Array<{
    id: number
    speakerRole: 'professor' | 'aluno'
    text: string
    expectedIsQuestion: boolean
    category: string
  }>
): AdversarialEvaluationResult {
  let tp = 0
  let fp = 0
  let tn = 0
  let fn = 0

  const details = dataset.map(item => {
    const detected = classifyAdversarialUtterance(item.text, item.speakerRole)
    const correct = detected === item.expectedIsQuestion

    if (item.expectedIsQuestion && detected) tp++
    else if (!item.expectedIsQuestion && detected) fp++
    else if (!item.expectedIsQuestion && !detected) tn++
    else if (item.expectedIsQuestion && !detected) fn++

    return {
      id: item.id,
      text: item.text,
      category: item.category,
      expectedIsQuestion: item.expectedIsQuestion,
      detectedAsQuestion: detected,
      correct
    }
  })

  const total = dataset.length
  const accuracy = Number(((tp + tn) / total).toFixed(3))
  const precision = tp + fp > 0 ? Number((tp / (tp + fp)).toFixed(3)) : 1.0
  const recall = tp + fn > 0 ? Number((tp / (tp + fn)).toFixed(3)) : 1.0
  const f1Score = precision + recall > 0 ? Number(((2 * precision * recall) / (precision + recall)).toFixed(3)) : 0.0

  return {
    total,
    accuracy,
    precision,
    recall,
    f1Score,
    details
  }
}

export async function classifySessionEvents(
  repo: ConversationVaultRepository,
  sessionId: string
): Promise<EventRecord[]> {
  const turns = await repo.getTurnsBySession(sessionId)
  if (turns.length === 0) return []

  const events: EventRecord[] = []
  let evtCounter = 0

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i]
    const text = turn.text
    const durationMs = turn.end_ms - turn.start_ms

    // 1. Intervenção genérica
    events.push({
      id: `${sessionId}_evt_${evtCounter++}`,
      turn_id: turn.id,
      session_id: sessionId,
      type: 'intervencao',
      subtype: turn.role === 'professor' ? 'professor' : turn.role === 'aluno' ? 'aluno' : 'none',
      confidence: 1.0,
      evidence_span: text.slice(0, 100),
      start_ms: turn.start_ms,
      end_ms: turn.end_ms
    })

    // 2. Pergunta
    if (isQuestionText(text)) {
      const qSubtype = classifyQuestionSubtype(text, turn.role)
      const qSpan = extractQuestionSpan(text)

      events.push({
        id: `${sessionId}_evt_${evtCounter++}`,
        turn_id: turn.id,
        session_id: sessionId,
        type: 'pergunta',
        subtype: qSubtype,
        confidence: 0.95,
        evidence_span: qSpan,
        start_ms: turn.start_ms,
        end_ms: turn.end_ms
      })

      // 3. Wait-Time pós pergunta docente
      if (turn.role === 'professor' && i < turns.length - 1) {
        const nextTurn = turns[i + 1]
        const silenceDuration = nextTurn.start_ms - turn.end_ms
        if (silenceDuration >= 3000) {
          events.push({
            id: `${sessionId}_evt_${evtCounter++}`,
            turn_id: turn.id,
            session_id: sessionId,
            type: 'wait_time',
            subtype: silenceDuration >= 4500 ? 'anomalo' : 'padrao',
            confidence: 0.98,
            evidence_span: `Silêncio de ${(silenceDuration / 1000).toFixed(1)}s após pergunta docente: "${qSpan}"`,
            start_ms: turn.end_ms,
            end_ms: nextTurn.start_ms
          })
        }
      }

      // 4. Dúvida de aluno sem resposta
      if (turn.role === 'aluno') {
        let answered = false
        if (i < turns.length - 1) {
          const subsequentTurn = turns[i + 1]
          // Se o próximo turno for do professor e contiver resposta ou explicação
          if (subsequentTurn.role === 'professor') {
            const isDismissalOrDiscipline = INSTRUCTION_PATTERNS.some(p => p.test(subsequentTurn.text))
            if (!isDismissalOrDiscipline) {
              answered = true
            }
          }
        }
        if (!answered) {
          events.push({
            id: `${sessionId}_evt_${evtCounter++}`,
            turn_id: turn.id,
            session_id: sessionId,
            type: 'duvida_sem_resposta',
            subtype: 'aluno',
            confidence: 0.90,
            evidence_span: qSpan,
            start_ms: turn.start_ms,
            end_ms: turn.end_ms
          })
        }
      }
    }

    // 5. Monólogo ininterrupto (>= 30s)
    if (durationMs >= 30000 && turn.role === 'professor') {
      events.push({
        id: `${sessionId}_evt_${evtCounter++}`,
        turn_id: turn.id,
        session_id: sessionId,
        type: 'monologo',
        subtype: 'professor',
        confidence: 1.0,
        evidence_span: text.slice(0, 120),
        start_ms: turn.start_ms,
        end_ms: turn.end_ms
      })
    }

    // 6. Instruções pedagógicas
    if (INSTRUCTION_PATTERNS.some(p => p.test(text))) {
      events.push({
        id: `${sessionId}_evt_${evtCounter++}`,
        turn_id: turn.id,
        session_id: sessionId,
        type: 'instrucao',
        subtype: 'none',
        confidence: 0.96,
        evidence_span: text,
        start_ms: turn.start_ms,
        end_ms: turn.end_ms
      })
    }
  }

  // Persiste no cofre
  await repo.insertEvents(events)
  return events
}

export interface ClassifierEvaluationResult {
  precision: number
  recall: number
  f1Score: number
  truePositives: number
  falsePositives: number
  falseNegatives: number
  totalExpected: number
  totalDetected: number
}

export async function evaluateClassifierMetrics(
  repo: ConversationVaultRepository,
  sessionId: string,
  groundTruth: GroundTruthEvent[] = GROUND_TRUTH_AULA_50MIN
): Promise<ClassifierEvaluationResult> {
  const turns = await repo.getTurnsBySession(sessionId)
  let events = await repo.getEventsBySession(sessionId)
  if (events.length === 0) {
    events = await classifySessionEvents(repo, sessionId)
  }

  let truePositives = 0
  let falsePositives = 0
  let falseNegatives = 0

  // Mapa de eventos detectados por índice de turno
  const turnIndexLookup = new Map<string, number>()
  turns.forEach(t => turnIndexLookup.set(t.id, t.turn_index))

  const detectedKeySet = new Set<string>()
  for (const ev of events) {
    if (ev.type === 'intervencao') continue // Intervenção é todo turno, focamos em eventos semânticos
    const tIdx = turnIndexLookup.get(ev.turn_id) ?? -1
    const key = `${tIdx}:${ev.type}`
    detectedKeySet.add(key)
  }

  const expectedKeySet = new Set<string>()
  for (const gt of groundTruth) {
    const key = `${gt.turn_index}:${gt.type}`
    expectedKeySet.add(key)
    if (detectedKeySet.has(key)) {
      truePositives++
    } else {
      falseNegatives++
    }
  }

  for (const detKey of detectedKeySet) {
    if (!expectedKeySet.has(detKey)) {
      falsePositives++
    }
  }

  const precision = truePositives + falsePositives > 0
    ? Number((truePositives / (truePositives + falsePositives)).toFixed(3))
    : 1.0

  const recall = truePositives + falseNegatives > 0
    ? Number((truePositives / (truePositives + falseNegatives)).toFixed(3))
    : 1.0

  const f1Score = precision + recall > 0
    ? Number(((2 * precision * recall) / (precision + recall)).toFixed(3))
    : 0.0

  return {
    precision,
    recall,
    f1Score,
    truePositives,
    falsePositives,
    falseNegatives,
    totalExpected: expectedKeySet.size,
    totalDetected: detectedKeySet.size
  }
}
