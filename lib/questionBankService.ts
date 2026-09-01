/**
 * lib/questionBankService.ts
 * Camada Unificada de Persistência e Gerenciamento do Banco de Atividades & Questões
 * Unifica teacher_questions e teacher_question_bank com migração transparente.
 */

import {
  EmpiricalPsychometrics,
  StudentItemResponse,
  evaluateItemPsychometrics
} from './psychometricsEngine'

export type ActivityKind = 'lesson' | 'exercise' | 'exam' | 'question'
export type QuestionType = 'mc' | 'essay' | 'tf' | 'fill'

export interface UnifiedQuestion {
  id: string
  statement: string
  type: QuestionType
  activityKind?: ActivityKind
  options?: string[]
  answer?: string
  explanation?: string
  subject?: string
  topic?: string
  eltCategory?: string
  eltSubcategory?: string
  bnccCode?: string
  level?: string
  year?: string
  schoolId?: string
  classRef?: string
  tags?: string[]
  sourceBookTitle?: string
  sourceBookUnit?: string
  createdAt: number
  source?: 'manual' | 'ai' | 'library_extraction'
  responseHistory?: Array<{ studentId: string; correct: boolean; totalExamScore?: number; timestamp: number }>
  psychometrics?: EmpiricalPsychometrics
}

const STORAGE_KEY_PRIMARY = 'teacher_unified_questions'
const STORAGE_KEY_LEGACY_QUESTIONS = 'teacher_questions'
const STORAGE_KEY_LEGACY_BANK = 'teacher_question_bank'

/**
 * Normaliza e migra itens legados para o formato unificado
 */
function normalizeLegacyItem(item: any): UnifiedQuestion {
  const history = Array.isArray(item.responseHistory) ? item.responseHistory : []
  const psychometrics = item.psychometrics || (history.length > 0 ? evaluateItemPsychometrics(history, item.level) : undefined)

  return {
    id: item.id || `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    statement: item.statement || item.title || item.question || item.text || 'Questão sem enunciado',
    type: item.type || (Array.isArray(item.options) && item.options.length > 0 ? 'mc' : 'essay'),
    activityKind: item.activityKind || (item.title?.toLowerCase().includes('prova') ? 'exam' : 'question'),
    options: Array.isArray(item.options) ? item.options : undefined,
    answer: item.answer || item.correctAnswer || '',
    explanation: item.explanation || item.comments || '',
    subject: item.subject || 'Inglês',
    topic: item.topic || 'Geral',
    eltCategory: item.eltCategory,
    eltSubcategory: item.eltSubcategory,
    bnccCode: item.bnccCode,
    level: item.level || 'Básico',
    year: item.year || new Date().getFullYear().toString(),
    schoolId: item.schoolId || '',
    classRef: item.classRef || item.classId || '',
    tags: Array.isArray(item.tags) ? item.tags : [],
    sourceBookTitle: item.sourceBookTitle || item.bookTitle,
    sourceBookUnit: item.sourceBookUnit || item.unit,
    createdAt: item.createdAt || Date.now(),
    source: item.source || 'manual',
    responseHistory: history,
    psychometrics
  }
}


/**
 * Recupera todas as questões unificadas do armazenamento
 */
export function getStoredQuestions(): UnifiedQuestion[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const rawPrimary = localStorage.getItem(STORAGE_KEY_PRIMARY)
    if (rawPrimary) {
      const parsed = JSON.parse(rawPrimary)
      if (Array.isArray(parsed)) return parsed
    }

    // Se a chave primária não existir, faz a migração de ambas as chaves legadas
    const rawLegQ = localStorage.getItem(STORAGE_KEY_LEGACY_QUESTIONS)
    const rawLegB = localStorage.getItem(STORAGE_KEY_LEGACY_BANK)

    const listQ: any[] = rawLegQ ? JSON.parse(rawLegQ) : []
    const listB: any[] = rawLegB ? JSON.parse(rawLegB) : []

    const combinedMap = new Map<string, UnifiedQuestion>()

    listQ.forEach(q => {
      const norm = normalizeLegacyItem(q)
      combinedMap.set(norm.id, norm)
    })

    listB.forEach(b => {
      // Se for um pacote de prova com perguntas internas, ou uma questão direta
      if (Array.isArray(b.questions)) {
        b.questions.forEach((subQ: any, idx: number) => {
          const norm = normalizeLegacyItem({ ...subQ, id: `${b.id || 'exam'}_${idx}`, topic: b.topic || subQ.topic })
          combinedMap.set(norm.id, norm)
        })
      } else {
        const norm = normalizeLegacyItem(b)
        combinedMap.set(norm.id, norm)
      }
    })

    const unifiedList = Array.from(combinedMap.values())
    if (unifiedList.length > 0) {
      saveStoredQuestions(unifiedList)
    }

    return unifiedList
  } catch (err) {
    console.error('Erro ao ler questões do storage:', err)
    return []
  }
}

/**
 * Salva a lista de questões em todas as chaves sincronizadas
 */
export function saveStoredQuestions(questions: UnifiedQuestion[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    const serialized = JSON.stringify(questions)
    localStorage.setItem(STORAGE_KEY_PRIMARY, serialized)
    localStorage.setItem(STORAGE_KEY_LEGACY_QUESTIONS, serialized)
    localStorage.setItem(STORAGE_KEY_LEGACY_BANK, serialized)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'))
    }
  } catch (err) {
    console.error('Erro ao salvar questões no storage:', err)
  }
}

/**
 * Adiciona um lote de questões ao banco
 */
export function addQuestionsBatch(newQuestions: UnifiedQuestion[]): UnifiedQuestion[] {
  const current = getStoredQuestions()
  const map = new Map<string, UnifiedQuestion>()
  
  // Adiciona novas primeiro
  newQuestions.forEach(q => map.set(q.id, q))
  // Mantém existentes
  current.forEach(q => {
    if (!map.has(q.id)) map.set(q.id, q)
  })

  const merged = Array.from(map.values())
  saveStoredQuestions(merged)
  return merged
}

/**
 * Deleta uma questão pelo ID
 */
export function deleteQuestionById(id: string): UnifiedQuestion[] {
  const current = getStoredQuestions()
  const filtered = current.filter(q => q.id !== id)
  saveStoredQuestions(filtered)
  return filtered
}

/**
 * Assistente Inteligente de Extração de Exercícios a partir de Texto de Livro/PDF
 * Identifica enunciados numerados, alternativas (A, B, C, D) e lacunas.
 */
export function extractQuestionsFromBookText(
  bookTitle: string,
  rawText: string,
  unitChapter?: string
): UnifiedQuestion[] {
  if (!rawText || !rawText.trim()) return []

  const extracted: UnifiedQuestion[] = []
  
  // Divide o texto em blocos de parágrafos/exercícios
  // Reconhece padrões como "1.", "1)", "Exercício 1", "Question 1", "Activity 1"
  const questionBlocks = rawText.split(/(?=(?:^|\n)\s*(?:\d+[\.\)]|(?:Exercício|Question|Activity|Questão)\s*\d+[:\.\)]))/i)

  questionBlocks.forEach((block, idx) => {
    const trimmed = block.trim()
    if (!trimmed || trimmed.length < 15) return

    // Procura alternativas no formato A) ... B) ... ou a. ... b. ...
    const optionMatches = [...trimmed.matchAll(/(?:^|\n)\s*([A-Da-d])[\.\)]\s*([^\n]+)/g)]
    const isExercise = /^\s*(?:\d+[\.\)]|(?:Exercício|Question|Activity|Questão)\s*\d+[:\.\)])/i.test(trimmed) ||
      optionMatches.length >= 2 ||
      trimmed.includes('_____') ||
      trimmed.includes('.....') ||
      /\b(true\s+or\s+false|verdadeiro\s+ou\s+falso|v\s+ou\s+f)\b/i.test(trimmed)

    if (!isExercise) return

    let statement = trimmed
    let options: string[] | undefined = undefined
    let type: QuestionType = 'essay'

    if (optionMatches.length >= 2) {
      type = 'mc'
      // Separa o enunciado da primeira alternativa
      const firstOptIndex = trimmed.search(/(?:^|\n)\s*[A-Da-d][\.\)]/)
      if (firstOptIndex > 0) {
        statement = trimmed.substring(0, firstOptIndex).trim()
      }
      options = optionMatches.map(m => `${m[1].toUpperCase()}) ${m[2].trim()}`)
    } else if (trimmed.includes('_____') || trimmed.includes('.....') || trimmed.includes('____')) {
      type = 'fill'
    } else if (/\b(true\s+or\s+false|verdadeiro\s+ou\s+falso|v\s+ou\s+f)\b/i.test(trimmed)) {
      type = 'tf'
    }

    // Limpa números iniciais do enunciado se redundantes
    const cleanStatement = statement.replace(/^\s*(?:\d+[\.\)]|(?:Exercício|Question|Activity|Questão)\s*\d+[:\.\)]\s*)/i, '').trim()

    if (cleanStatement.length >= 8) {
      extracted.push({
        id: `ext_${Date.now()}_${idx}`,
        statement: cleanStatement || statement,
        type,
        activityKind: 'exercise',
        options,
        subject: 'Inglês',
        topic: unitChapter ? `${bookTitle} — ${unitChapter}` : bookTitle,
        sourceBookTitle: bookTitle,
        sourceBookUnit: unitChapter || '',
        level: 'Intermediário',
        year: new Date().getFullYear().toString(),
        tags: [bookTitle, unitChapter || 'Extração'].filter(Boolean),
        createdAt: Date.now(),
        source: 'library_extraction'
      })
    }
  })

  return extracted
}

/**
 * Registra respostas de alunos para uma questão e recalibra seus parâmetros psicométricos
 */
export function recordQuestionResponsesInBank(
  questionId: string,
  newResponses: Array<{ studentId: string; correct: boolean; totalExamScore?: number }>
): UnifiedQuestion | null {
  const all = getStoredQuestions()
  const idx = all.findIndex(q => q.id === questionId)
  if (idx === -1) return null

  const q = all[idx]
  const existingHistory = Array.isArray(q.responseHistory) ? [...q.responseHistory] : []
  const now = Date.now()

  // Adiciona novas respostas
  newResponses.forEach(r => {
    existingHistory.push({
      studentId: r.studentId,
      correct: r.correct,
      totalExamScore: r.totalExamScore,
      timestamp: now
    })
  })

  // Recalcula psicometria
  const psychometrics = evaluateItemPsychometrics(existingHistory, q.level)

  const updated: UnifiedQuestion = {
    ...q,
    responseHistory: existingHistory,
    psychometrics
  }

  all[idx] = updated
  saveStoredQuestions(all)
  return updated
}

/**
 * Retorna questões com aviso de calibração empírica e divergência em relação ao nominal
 */
export function getCalibratedQuestionWarning(q: UnifiedQuestion): string | null {
  if (!q.psychometrics) return null
  if (q.psychometrics.discriminationWarning) return q.psychometrics.discriminationWarning
  if (q.psychometrics.isDivergentFromNominal && q.psychometrics.divergenceMessage) {
    return q.psychometrics.divergenceMessage
  }
  return null
}

