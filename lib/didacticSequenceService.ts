/**
 * lib/didacticSequenceService.ts
 *
 * Serviço de gerenciamento, persistência e cálculo de ritmo curricular de Sequências Didáticas.
 * Suporta turmas regulares e alunos particulares com sincronização bidirecional com o LessonStudio.
 */

export interface SequenceLessonSlot {
  id: string
  order: number                     // 1, 2, 3...
  title: string                     // Ex: "Aula 1: Introdução ao Present Perfect"
  expectedDate?: string             // Data prevista (YYYY-MM-DD)
  actualDate?: string               // Data em que foi realizada (YYYY-MM-DD)
  status: 'planned' | 'completed' | 'delayed' | 'pending'
  lessonPlanId?: string             // ID do LessonPlanDocument vinculado
  assessmentId?: string             // Vínculo opcional com exercício/prova
  topics?: string[]
  notes?: string
}

export interface DidacticSequenceDocument {
  id: string
  title: string                     // Ex: "Unit 4: Present Perfect & Life Experiences"
  school?: string                   // Ex: "Machado Sobrinho"
  className: string                 // Ex: "9º Ano B"
  subject: string                   // Ex: "Inglês"
  term?: string                     // Ex: "2º Trimestre"
  bookRef?: string                  // Ex: "Evolve 3 p. 46-58"
  generalGoal: string               // Objetivo comum de médio prazo (ex: 6 aulas ao longo de 3 semanas)
  lessons: SequenceLessonSlot[]
  currentLessonOrder: number        // Onde a matéria deveria estar de acordo com o ritmo planejado
  createdAt: string
  updatedAt: string
}

export interface CurricularPaceResult {
  pace: 'on_track' | 'behind' | 'ahead'
  difference: number                // negativo = atrasado, positivo = adiantado, 0 = no ritmo
  completedCount: number
  expectedCount: number
  message: string
  badgeColor: string
  badgeBg: string
  badgeBorder: string
}

const STORAGE_KEY = 'teacher_didactic_sequences'

export const INITIAL_DIDACTIC_SEQUENCES: DidacticSequenceDocument[] = [
  {
    id: 'seq_unit4_9b',
    title: 'Unit 4: Narratives & Unfinished Actions',
    school: 'Machado Sobrinho',
    className: '9º Ano B',
    subject: 'Inglês',
    term: '2º Trimestre',
    bookRef: 'Evolve 3 Students Book (pág. 46 a 58)',
    generalGoal: 'Consolidar o uso do Present Perfect Continuous em contraste com o Present Perfect Simple para narrar experiências e ações em andamento.',
    currentLessonOrder: 4,
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-15T14:30:00.000Z',
    lessons: [
      {
        id: 'slot_9b_1',
        order: 1,
        title: 'Aula 1: Introdução ao Present Perfect Continuous — Chunks de Duração',
        expectedDate: '2026-03-02',
        actualDate: '2026-03-02',
        status: 'completed',
        topics: ['Storytelling', 'Accidents & Interrupted Past Events']
      },
      {
        id: 'slot_9b_2',
        order: 2,
        title: 'Aula 2: Contraste Simple vs Continuous com For / Since',
        expectedDate: '2026-03-05',
        actualDate: '2026-03-06',
        status: 'completed',
        topics: ['Time expressions', 'For vs Since']
      },
      {
        id: 'slot_9b_3',
        order: 3,
        title: 'Aula 3: Prática Oral Guiada — Entrevistas em Duplas sobre Hábitos Recentes',
        expectedDate: '2026-03-09',
        actualDate: '2026-03-10',
        status: 'completed',
        topics: ['Speaking Fluency', 'Pair Work']
      },
      {
        id: 'slot_9b_4',
        order: 4,
        title: 'Aula 4: Produção Textual — Narrativa de Evento Inacabado',
        expectedDate: '2026-03-12',
        status: 'planned',
        topics: ['Writing', 'Connectors']
      },
      {
        id: 'slot_9b_5',
        order: 5,
        title: 'Aula 5: Prática de Consolidação e Diagnóstico de Erros Férteis',
        expectedDate: '2026-03-16',
        status: 'pending',
        topics: ['Review', 'Fertile Errors']
      },
      {
        id: 'slot_9b_6',
        order: 6,
        title: 'Aula 6: Avaliação Formativa e Quiz de Fixação',
        expectedDate: '2026-03-19',
        status: 'pending',
        assessmentId: 'quiz_unit4_01',
        topics: ['Assessment', 'Can-Do Statements']
      }
    ]
  },
  {
    id: 'seq_unit3_luis',
    title: 'Unit 3: Life Experiences & Travel',
    school: 'Particular',
    className: 'Luís Felipe Franco Rodriguez',
    subject: 'Inglês',
    term: '1º Semestre',
    bookRef: 'Evolve 3 p. 30-44',
    generalGoal: 'Aumentar o tempo de fala (STT) narrando viagens reais e planos futuros com Present Perfect.',
    currentLessonOrder: 3,
    createdAt: '2026-03-05T09:00:00.000Z',
    updatedAt: '2026-03-18T11:00:00.000Z',
    lessons: [
      {
        id: 'slot_lf_1',
        order: 1,
        title: 'Aula 1: Bucket Lists & Have you ever...',
        expectedDate: '2026-03-06',
        actualDate: '2026-03-06',
        status: 'completed',
        topics: ['Travel Stories', 'Bucket Lists']
      },
      {
        id: 'slot_lf_2',
        order: 2,
        title: 'Aula 2: Extreme Sports & Anecdotes com Already / Yet',
        expectedDate: '2026-03-13',
        actualDate: '2026-03-13',
        status: 'completed',
        topics: ['Already / Yet', 'Sports']
      },
      {
        id: 'slot_lf_3',
        order: 3,
        title: 'Aula 3: Task-Based Fluency — Simulando Planejamento de Viagem Internacional',
        expectedDate: '2026-03-20',
        status: 'planned',
        topics: ['TBLT', 'Real World Negotiation']
      }
    ]
  }
]

export function getDidacticSequences(className?: string): DidacticSequenceDocument[] {
  if (typeof window === 'undefined') return INITIAL_DIDACTIC_SEQUENCES
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DIDACTIC_SEQUENCES))
      return filterByClass(INITIAL_DIDACTIC_SEQUENCES, className)
    }
    const parsed: DidacticSequenceDocument[] = JSON.parse(raw)
    return filterByClass(parsed, className)
  } catch (err) {
    console.error('Erro ao ler teacher_didactic_sequences do localStorage:', err)
    return filterByClass(INITIAL_DIDACTIC_SEQUENCES, className)
  }
}

function filterByClass(list: DidacticSequenceDocument[], className?: string): DidacticSequenceDocument[] {
  if (!className || className.trim() === '') return list
  const norm = className.trim().toLowerCase()
  return list.filter(s => s.className.trim().toLowerCase() === norm || s.className.toLowerCase().includes(norm))
}

export function getDidacticSequenceById(id: string): DidacticSequenceDocument | null {
  const all = getDidacticSequences()
  return all.find(s => s.id === id) || null
}

export function saveDidacticSequence(seq: DidacticSequenceDocument): DidacticSequenceDocument {
  if (typeof window === 'undefined') return seq
  try {
    const all = getDidacticSequences()
    const now = new Date().toISOString()
    const updatedSeq = { ...seq, updatedAt: now }
    const existingIndex = all.findIndex(s => s.id === seq.id)

    let nextList: DidacticSequenceDocument[]
    if (existingIndex >= 0) {
      nextList = [...all]
      nextList[existingIndex] = updatedSeq
    } else {
      nextList = [updatedSeq, ...all]
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextList))
    window.dispatchEvent(new CustomEvent('didactic-sequence-updated', { detail: { sequenceId: seq.id } }))
    return updatedSeq
  } catch (err) {
    console.error('Erro ao salvar didactic_sequence no localStorage:', err)
    return seq
  }
}

export function deleteDidacticSequence(id: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const all = getDidacticSequences()
    const filtered = all.filter(s => s.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
    window.dispatchEvent(new CustomEvent('didactic-sequence-updated', { detail: { sequenceId: id, deleted: true } }))
    return true
  } catch (err) {
    console.error('Erro ao deletar didactic_sequence do localStorage:', err)
    return false
  }
}

/**
 * Vincula um plano de aula do LessonStudio a um slot de uma sequência didática.
 */
export function linkLessonPlanToSequence(
  sequenceId: string,
  slotOrder: number,
  planId: string,
  planTitle?: string,
  actualDate?: string
): boolean {
  const seq = getDidacticSequenceById(sequenceId)
  if (!seq) return false

  const updatedLessons = seq.lessons.map(lesson => {
    if (lesson.order === slotOrder) {
      return {
        ...lesson,
        lessonPlanId: planId,
        title: planTitle ? `${lesson.title.split(' — ')[0]} — ${planTitle}` : lesson.title,
        status: (actualDate ? 'completed' : 'planned') as 'completed' | 'planned',
        actualDate: actualDate || lesson.actualDate
      }
    }
    return lesson
  })

  saveDidacticSequence({
    ...seq,
    lessons: updatedLessons
  })
  return true
}

/**
 * Remove qualquer vínculo de plano de aula excluído ou reatribuído.
 */
export function unlinkLessonPlanFromSequence(planId: string): void {
  const all = getDidacticSequences()
  let changed = false

  const updatedList = all.map(seq => {
    const hasPlan = seq.lessons.some(l => l.lessonPlanId === planId)
    if (!hasPlan) return seq

    changed = true
    return {
      ...seq,
      lessons: seq.lessons.map(l => {
        if (l.lessonPlanId === planId) {
          const { lessonPlanId, ...rest } = l
          return { ...rest, status: 'planned' as const }
        }
        return l
      }),
      updatedAt: new Date().toISOString()
    }
  })

  if (changed && typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList))
    window.dispatchEvent(new CustomEvent('didactic-sequence-updated', { detail: { unlinkedPlanId: planId } }))
  }
}

/**
 * Calcula o ritmo curricular (Previsto vs. Realizado) de uma Sequência Didática.
 * Retorna se a turma está no ritmo, atrasada ou adiantada com a contagem de aulas.
 */
export function calculateCurricularPace(
  seq: DidacticSequenceDocument,
  targetDateStr?: string
): CurricularPaceResult {
  const completedCount = seq.lessons.filter(l => l.status === 'completed' || !!l.actualDate).length

  // Se houver targetDateStr, calculamos quantos slots deveriam ter sido concluídos até aquela data
  let expectedCount = seq.currentLessonOrder || 0
  if (targetDateStr) {
    const passedSlots = seq.lessons.filter(l => l.expectedDate && l.expectedDate <= targetDateStr)
    if (passedSlots.length > 0) {
      expectedCount = Math.max(expectedCount, passedSlots.length)
    }
  }

  // Se expectedCount for zero ou indefinido, assume a ordem da primeira aula não concluída
  if (expectedCount === 0) {
    expectedCount = 1
  }

  const difference = completedCount - expectedCount

  if (difference < 0) {
    const absDiff = Math.abs(difference)
    return {
      pace: 'behind',
      difference,
      completedCount,
      expectedCount,
      message: `Atrasada em ${absDiff} aula${absDiff > 1 ? 's' : ''} em relação ao cronograma previsto`,
      badgeColor: '#b91c1c',
      badgeBg: '#fef2f2',
      badgeBorder: '#fecaca'
    }
  }

  if (difference > 0) {
    return {
      pace: 'ahead',
      difference,
      completedCount,
      expectedCount,
      message: `Adiantada em ${difference} aula${difference > 1 ? 's' : ''} em relação ao cronograma previsto`,
      badgeColor: '#1d4ed8',
      badgeBg: '#eff6ff',
      badgeBorder: '#bfdbfe'
    }
  }

  return {
    pace: 'on_track',
    difference: 0,
    completedCount,
    expectedCount,
    message: 'No ritmo planejado (previsto e realizado em paridade)',
    badgeColor: '#15803d',
    badgeBg: '#f0fdf4',
    badgeBorder: '#bbf7d0'
  }
}

export function subscribeToDidacticSequenceUpdates(callback: (event: CustomEvent) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (e: Event) => callback(e as CustomEvent)
  window.addEventListener('didactic-sequence-updated', handler)
  return () => window.removeEventListener('didactic-sequence-updated', handler)
}
