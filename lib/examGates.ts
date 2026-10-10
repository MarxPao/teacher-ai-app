/**
 * lib/examGates.ts — Portões Bloqueantes de Confiabilidade do Engine de Provas (Lote B)
 *
 * Arquitetura de 4 Portões Canônicos:
 * - G1: Estrutura (schema válido, 1 correta existente, alternativas distintas e não vazias, enunciado não vazio);
 * - G2: Regras Haladyna sem auto-fix criativo (ALL_NONE_ABOVE, REDUNDANT_DISTRACTOR e violações críticas bloqueiam);
 * - G3: Distratores (Anti-quase-duplicatas com Jaccard > 0.80, razão de comprimento extrema [0.25, 2.50], tamanho mínimo >= 2);
 * - G4: Idioma (detecção determinística de vocabulário em português em provas de inglês).
 */

import { Question } from './examSchema'
import { auditHaladynaGuidelines } from './haladynaLinter'
import { DEFAULT_GATES_THRESHOLDS } from './pedagogicalConfig'

export interface GateResult {
  id: 'G1' | 'G2' | 'G3' | 'G4'
  name: string
  pass: boolean
  severity: 'error' | 'warning'
  evidence: string
}

export interface ExamGatesEvaluation {
  canAutoSave: boolean
  allPassed: boolean
  gates: GateResult[]
  failedBlockingGate?: GateResult
  warning?: {
    requested?: number
    received?: number
    reason?: string
  }
}

export interface EvaluateExamGatesOptions {
  requestedCount?: number
  targetLanguage?: string
  jaccardThreshold?: number
  minOptionLength?: number
  lengthRatioMin?: number
  lengthRatioMax?: number
  lengthDeltaMin?: number
}

// ─── Helpers Determinísticos ────────────────────────────────────────────────

export function cleanText(input: string): string {
  if (!input || typeof input !== 'string') return ''
  return input
    .replace(/<[^>]*>/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function calculateCharacterBigramJaccard(strA: string, strB: string): number {
  const normA = cleanText(strA)
  const normB = cleanText(strB)

  if (normA === normB) return 1.0
  if (normA.length < 2 || normB.length < 2) return 0.0

  const getBigrams = (str: string): Set<string> => {
    const bigrams = new Set<string>()
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.slice(i, i + 2))
    }
    return bigrams
  }

  const setA = getBigrams(normA)
  const setB = getBigrams(normB)

  let intersectionSize = 0
  for (const item of setA) {
    if (setB.has(item)) intersectionSize++
  }

  const unionSize = setA.size + setB.size - intersectionSize
  if (unionSize === 0) return 0.0

  return Number((intersectionSize / unionSize).toFixed(3))
}

const PORTUGUESE_STOP_WORDS_REGEX = /\b(nao|sao|para|com|como|qual|quais|assinale|alternativa|alternativas|correta|incorreta|sobre|entre|quando|onde|porque|por que|este|esta|estes|estas|esse|essa|esses|essas|aquele|aquela|conforme|segundo|de acordo|funcao|questao)\b/i

// ─── Portão G1: Estrutura ───────────────────────────────────────────────────

export function evaluateGateG1(questions: any[]): GateResult {
  if (!Array.isArray(questions) || questions.length === 0) {
    return {
      id: 'G1',
      name: 'G1 — Estrutura',
      pass: false,
      severity: 'error',
      evidence: 'Nenhuma questão fornecida para validação estrutural.'
    }
  }

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const qIndex = i + 1
    const rawStem = q.stem || q.statement || ''
    const stemClean = cleanText(rawStem)

    if (!stemClean) {
      return {
        id: 'G1',
        name: 'G1 — Estrutura',
        pass: false,
        severity: 'error',
        evidence: `Questão #${qIndex} possui enunciado vazio.`
      }
    }

    const type = q.type || 'multiple_choice'
    if (type === 'multiple_choice' || type === 'mc') {
      const opts = Array.isArray(q.options) ? q.options : []
      if (opts.length < 2) {
        return {
          id: 'G1',
          name: 'G1 — Estrutura',
          pass: false,
          severity: 'error',
          evidence: `Questão #${qIndex} possui apenas ${opts.length} alternativa(s). Mínimo exigido: 2.`
        }
      }

      const validKeys = new Set<string>()
      const seenTexts = new Map<string, number>()

      for (let oIdx = 0; oIdx < opts.length; oIdx++) {
        const opt = opts[oIdx]
        const optText = typeof opt === 'string' ? opt : (opt?.text || '')
        const optClean = cleanText(optText)
        const optKey = (opt?.id || opt?.letter || String.fromCharCode(65 + oIdx)).toUpperCase()

        validKeys.add(optKey)

        if (!optClean) {
          return {
            id: 'G1',
            name: 'G1 — Estrutura',
            pass: false,
            severity: 'error',
            evidence: `Questão #${qIndex} possui a alternativa ${optKey} com texto vazio.`
          }
        }

        if (seenTexts.has(optClean)) {
          return {
            id: 'G1',
            name: 'G1 — Estrutura',
            pass: false,
            severity: 'error',
            evidence: `Questão #${qIndex} possui alternativas com texto idêntico: "${optText}".`
          }
        }
        seenTexts.set(optClean, oIdx)
      }

      const answer = (q.correctOptionId || q.answer || q.answerKey || '').toString().trim().toUpperCase()
      if (!answer) {
        return {
          id: 'G1',
          name: 'G1 — Estrutura',
          pass: false,
          severity: 'error',
          evidence: `Questão #${qIndex} não possui gabarito definido.`
        }
      }

      if (!validKeys.has(answer)) {
        return {
          id: 'G1',
          name: 'G1 — Estrutura',
          pass: false,
          severity: 'error',
          evidence: `Questão #${qIndex} possui gabarito inválido '${answer}' (não existe nas opções cadastradas).`
        }
      }
    }
  }

  return {
    id: 'G1',
    name: 'G1 — Estrutura',
    pass: true,
    severity: 'error',
    evidence: 'Todas as questões possuem estrutura válida, enunciados íntegros e gabaritos alinhados.'
  }
}

// ─── Portão G2: Haladyna Sem Auto-Fix Criativo ───────────────────────────────

export function evaluateGateG2(questions: any[]): GateResult {
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const qIndex = i + 1
    const rawStem = q.stem || q.statement || ''
    const opts = Array.isArray(q.options)
      ? q.options.map((o: any, idx: number) => ({
          letter: o.id || o.letter || String.fromCharCode(65 + idx),
          text: typeof o === 'string' ? o : (o?.text || '')
        }))
      : []

    const audit = auditHaladynaGuidelines(rawStem, opts)
    const errorViolations = audit.violations.filter(v => v.severity === 'error' || v.ruleId === 'ALL_NONE_ABOVE' || v.ruleId === 'REDUNDANT_DISTRACTOR')

    if (errorViolations.length > 0) {
      const v = errorViolations[0]
      return {
        id: 'G2',
        name: 'G2 — Haladyna Estrito',
        pass: false,
        severity: 'error',
        evidence: `Questão #${qIndex} viola diretriz crítica de Haladyna: ${v.ruleId} — ${v.message}`
      }
    }
  }

  return {
    id: 'G2',
    name: 'G2 — Haladyna Estrito',
    pass: true,
    severity: 'error',
    evidence: 'Nenhuma violação crítica de Haladyna identificada nas questões.'
  }
}

// ─── Portão G3: Distratores (Limiares Aprovados) ─────────────────────────────

export function evaluateGateG3(
  questions: any[],
  options: {
    jaccardThreshold?: number
    minOptionLength?: number
    lengthRatioMin?: number
    lengthRatioMax?: number
    lengthDeltaMin?: number
  } = {}
): GateResult {
  const JACCARD_LIMIT = options.jaccardThreshold ?? DEFAULT_GATES_THRESHOLDS.jaccardMaxSimilarity
  const MIN_CHARS = options.minOptionLength ?? DEFAULT_GATES_THRESHOLDS.minOptionLength
  const RATIO_MIN = options.lengthRatioMin ?? DEFAULT_GATES_THRESHOLDS.lengthRatioMin
  const RATIO_MAX = options.lengthRatioMax ?? DEFAULT_GATES_THRESHOLDS.lengthRatioMax
  const DELTA_MIN = options.lengthDeltaMin ?? DEFAULT_GATES_THRESHOLDS.lengthDeltaMin

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const qIndex = i + 1
    const type = q.type || 'multiple_choice'

    if (type !== 'multiple_choice' && type !== 'mc') continue

    const opts = Array.isArray(q.options) ? q.options : []
    const answerKey = (q.correctOptionId || q.answer || q.answerKey || '').toString().trim().toUpperCase()

    let correctOptText = ''
    const distractors: Array<{ key: string; text: string }> = []

    for (let oIdx = 0; oIdx < opts.length; oIdx++) {
      const opt = opts[oIdx]
      const text = typeof opt === 'string' ? opt : (opt?.text || '')
      const key = (opt?.id || opt?.letter || String.fromCharCode(65 + oIdx)).toUpperCase()

      if (key === answerKey) {
        correctOptText = text
      } else {
        distractors.push({ key, text })
      }
    }

    // G3.3: Conteúdo Mínimo Não-Trivial
    for (const d of distractors) {
      const cleanLen = d.text.replace(/[^a-zA-Z0-9À-ÿ]/g, '').length
      if (cleanLen < MIN_CHARS) {
        return {
          id: 'G3',
          name: 'G3 — Distratores',
          pass: false,
          severity: 'error',
          evidence: `Questão #${qIndex} possui distrator trivial ou vazio: opção ${d.key} ("${d.text}").`
        }
      }
    }

    // G3.1: Anti-Quase-Duplicatas (Jaccard entre quaisquer alternativas)
    const allOptions = opts.map((opt: any, oIdx: number) => ({
      key: (opt?.id || opt?.letter || String.fromCharCode(65 + oIdx)).toUpperCase(),
      text: typeof opt === 'string' ? opt : (opt?.text || '')
    }))

    for (let a = 0; a < allOptions.length; a++) {
      for (let b = a + 1; b < allOptions.length; b++) {
        const o1 = allOptions[a]
        const o2 = allOptions[b]
        const jaccard = calculateCharacterBigramJaccard(o1.text, o2.text)
        if (jaccard > JACCARD_LIMIT) {
          return {
            id: 'G3',
            name: 'G3 — Distratores',
            pass: false,
            severity: 'error',
            evidence: `Questão #${qIndex} possui alternativas quase idênticas: ${o1.key} ("${o1.text}") e ${o2.key} ("${o2.text}") (Similaridade de Jaccard: ${(jaccard * 100).toFixed(1)}% > ${(JACCARD_LIMIT * 100).toFixed(0)}%).`
          }
        }
      }
    }

    // G3.2: Disparidade Extrema de Comprimento em Relação ao Gabarito
    if (correctOptText) {
      const corrLen = correctOptText.trim().length
      for (const d of distractors) {
        const dLen = d.text.trim().length
        const delta = Math.abs(dLen - corrLen)
        const ratio = corrLen > 0 ? dLen / corrLen : 1

        if (delta > DELTA_MIN && (ratio < RATIO_MIN || ratio > RATIO_MAX)) {
          return {
            id: 'G3',
            name: 'G3 — Distratores',
            pass: false,
            severity: 'error',
            evidence: `Questão #${qIndex} apresenta disparidade extrema de extensão entre distrator ${d.key} (${dLen} chars) e gabarito (${corrLen} chars, razão: ${ratio.toFixed(2)}).`
          }
        }
      }
    }
  }

  return {
    id: 'G3',
    name: 'G3 — Distratores',
    pass: true,
    severity: 'error',
    evidence: 'Distratores plausíveis, sem sobreposição quase-duplicada e com extensões equilibradas.'
  }
}

// ─── Portão G4: Idioma Determinístico ───────────────────────────────────────

export function evaluateGateG4(
  questions: any[],
  options: { targetLanguage?: string } = {}
): GateResult {
  const isEnTarget = options.targetLanguage === 'en'

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const qIndex = i + 1
    const qLang = q.language || (isEnTarget ? 'en' : 'pt')

    if (qLang === 'en' || isEnTarget) {
      const rawStem = q.stem || q.statement || ''
      const stemNorm = cleanText(rawStem)

      // Checa vazamento no stem
      const matchStem = stemNorm.match(PORTUGUESE_STOP_WORDS_REGEX)
      if (matchStem) {
        return {
          id: 'G4',
          name: 'G4 — Idioma',
          pass: false,
          severity: 'error',
          evidence: `Questão #${qIndex} contém termos em português em questão configurada como inglês: "${matchStem[0]}".`
        }
      }

      // Checa vazamento nas opções
      const opts = Array.isArray(q.options) ? q.options : []
      for (const opt of opts) {
        const text = typeof opt === 'string' ? opt : (opt?.text || '')
        const optNorm = cleanText(text)
        const matchOpt = optNorm.match(PORTUGUESE_STOP_WORDS_REGEX)
        if (matchOpt) {
          return {
            id: 'G4',
            name: 'G4 — Idioma',
            pass: false,
            severity: 'error',
            evidence: `Questão #${qIndex} contém vocabulário em português em questão configurada como inglês na alternativa: "${matchOpt[0]}".`
          }
        }
      }
    }
  }

  return {
    id: 'G4',
    name: 'G4 — Idioma',
    pass: true,
    severity: 'error',
    evidence: 'Consistência idiomática verificada com sucesso em todas as questões.'
  }
}

// ─── Avaliação Global de Portões ────────────────────────────────────────────

export function evaluateExamGates(
  questions: any[],
  options: EvaluateExamGatesOptions = {}
): ExamGatesEvaluation {
  const g1 = evaluateGateG1(questions)
  const g2 = evaluateGateG2(questions)
  const g3 = evaluateGateG3(questions, options)
  const g4 = evaluateGateG4(questions, options)

  const gates = [g1, g2, g3, g4]
  const blockingFailures = gates.filter(g => !g.pass && g.severity === 'error')
  const allPassed = gates.every(g => g.pass)
  const canAutoSave = blockingFailures.length === 0

  const requestedCount = options.requestedCount ?? (Array.isArray(questions) ? questions.length : 0)
  const receivedCount = Array.isArray(questions) ? questions.length : 0

  let warning: ExamGatesEvaluation['warning'] = undefined
  if (!canAutoSave && blockingFailures.length > 0) {
    warning = {
      requested: requestedCount,
      received: receivedCount,
      reason: `Bloqueado pelo portão ${blockingFailures[0].name}: ${blockingFailures[0].evidence}`
    }
  } else if (requestedCount > 0 && receivedCount !== requestedCount) {
    warning = {
      requested: requestedCount,
      received: receivedCount,
      reason: `Divergência na contagem solicitada: esperado ${requestedCount}, recebido ${receivedCount}.`
    }
  }

  return {
    canAutoSave: canAutoSave && (receivedCount === requestedCount || requestedCount === 0),
    allPassed,
    gates,
    failedBlockingGate: blockingFailures[0],
    warning
  }
}
