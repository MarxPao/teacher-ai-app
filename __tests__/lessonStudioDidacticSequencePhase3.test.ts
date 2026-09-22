import { describe, it, expect, beforeEach } from 'vitest'
import {
  getDidacticSequences,
  getDidacticSequenceById,
  saveDidacticSequence,
  deleteDidacticSequence,
  linkLessonPlanToSequence,
  unlinkLessonPlanFromSequence,
  calculateCurricularPace,
  DidacticSequenceDocument,
  SequenceLessonSlot
} from '../lib/didacticSequenceService'
import fs from 'fs'
import path from 'path'

class LocalStorageMock {
  private store: Record<string, string> = {}

  clear() {
    this.store = {}
  }

  getItem(key: string): string | null {
    return this.store[key] || null
  }

  setItem(key: string, value: string) {
    this.store[key] = String(value)
  }

  removeItem(key: string) {
    delete this.store[key]
  }
}

describe('FASE 3 — Sequência Didática & Ritmo Curricular (Feedback Usuária 0)', () => {
  let localStorageMock: LocalStorageMock
  let dispatchedEvents: any[] = []

  beforeEach(() => {
    localStorageMock = new LocalStorageMock()
    dispatchedEvents = []

    // Configura mocks no ambiente global
    // @ts-ignore
    global.localStorage = localStorageMock
    // @ts-ignore
    global.window = {
      localStorage: localStorageMock,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: (event: any) => {
        dispatchedEvents.push(event)
        return true
      }
    }
    // @ts-ignore
    global.CustomEvent = class CustomEvent {
      type: string
      detail: any
      constructor(type: string, params: any = {}) {
        this.type = type
        this.detail = params.detail
      }
    }
  })

  it('1. Deve inicializar e retornar sequências didáticas padrão quando o armazenamento estiver vazio', () => {
    const sequences = getDidacticSequences()
    expect(sequences.length).toBeGreaterThan(0)
    expect(sequences.some(s => s.className === '9º Ano B')).toBe(true)
    expect(sequences.some(s => s.className === 'Luís Felipe Franco Rodriguez')).toBe(true)

    // Verifica se salvou no localStorage
    const stored = localStorageMock.getItem('teacher_didactic_sequences')
    expect(stored).not.toBeNull()
  })

  it('2. Deve filtrar sequências corretamente por turma regular e por aluno particular', () => {
    const seq9B = getDidacticSequences('9º Ano B')
    expect(seq9B.length).toBe(1)
    expect(seq9B[0].className).toBe('9º Ano B')

    const seqLuis = getDidacticSequences('Luís Felipe Franco Rodriguez')
    expect(seqLuis.length).toBe(1)
    expect(seqLuis[0].className).toBe('Luís Felipe Franco Rodriguez')
    expect(seqLuis[0].school).toBe('Particular')
  })

  it('3. Deve salvar nova sequência didática e emitir evento didactic-sequence-updated', () => {
    const newSeq: DidacticSequenceDocument = {
      id: 'seq_unit1_8a',
      title: 'Unit 1: Making Connections',
      school: 'Machado Sobrinho',
      className: '8º Ano A',
      subject: 'Inglês',
      term: '1º Trimestre',
      generalGoal: 'Consolidar apresentações pessoais e rotinas em duplas.',
      currentLessonOrder: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lessons: [
        { id: 's1', order: 1, title: 'Aula 1: Icebreakers', status: 'completed', expectedDate: '2026-03-01', actualDate: '2026-03-01' },
        { id: 's2', order: 2, title: 'Aula 2: Daily Routines', status: 'planned', expectedDate: '2026-03-05' },
        { id: 's3', order: 3, title: 'Aula 3: Speaking Task', status: 'pending', expectedDate: '2026-03-08' }
      ]
    }

    const saved = saveDidacticSequence(newSeq)
    expect(saved.id).toBe('seq_unit1_8a')

    const retrieved = getDidacticSequenceById('seq_unit1_8a')
    expect(retrieved).not.toBeNull()
    expect(retrieved?.title).toBe('Unit 1: Making Connections')

    const event = dispatchedEvents.find(e => e.type === 'didactic-sequence-updated')
    expect(event).toBeDefined()
    expect(event.detail.sequenceId).toBe('seq_unit1_8a')
  })

  it('4. Deve calcular corretamente o ritmo curricular (Previsto vs. Realizado) — No Ritmo, Atrasada e Adiantada', () => {
    // Caso A: No Ritmo (completedCount == expectedCount)
    const seqOnTrack: DidacticSequenceDocument = {
      id: 'seq_pace_1',
      title: 'Pace Test On Track',
      className: '9º B',
      subject: 'Inglês',
      generalGoal: 'Goal',
      currentLessonOrder: 2,
      createdAt: '',
      updatedAt: '',
      lessons: [
        { id: '1', order: 1, title: 'A1', status: 'completed', actualDate: '2026-03-01' },
        { id: '2', order: 2, title: 'A2', status: 'completed', actualDate: '2026-03-05' },
        { id: '3', order: 3, title: 'A3', status: 'pending' }
      ]
    }
    const pace1 = calculateCurricularPace(seqOnTrack)
    expect(pace1.pace).toBe('on_track')
    expect(pace1.difference).toBe(0)
    expect(pace1.message).toContain('No ritmo planejado')

    // Caso B: Atrasada (completedCount < expectedCount)
    const seqBehind: DidacticSequenceDocument = {
      id: 'seq_pace_2',
      title: 'Pace Test Behind',
      className: '9º B',
      subject: 'Inglês',
      generalGoal: 'Goal',
      currentLessonOrder: 3,
      createdAt: '',
      updatedAt: '',
      lessons: [
        { id: '1', order: 1, title: 'A1', status: 'completed', actualDate: '2026-03-01' },
        { id: '2', order: 2, title: 'A2', status: 'planned', expectedDate: '2026-03-05' },
        { id: '3', order: 3, title: 'A3', status: 'pending', expectedDate: '2026-03-10' }
      ]
    }
    const pace2 = calculateCurricularPace(seqBehind)
    expect(pace2.pace).toBe('behind')
    expect(pace2.difference).toBe(-2) // 1 completed vs 3 expected
    expect(pace2.message).toContain('Atrasada em 2 aulas')
    expect(pace2.badgeColor).toBe('#b91c1c')

    // Caso C: Adiantada (completedCount > expectedCount)
    const seqAhead: DidacticSequenceDocument = {
      id: 'seq_pace_3',
      title: 'Pace Test Ahead',
      className: '9º B',
      subject: 'Inglês',
      generalGoal: 'Goal',
      currentLessonOrder: 1,
      createdAt: '',
      updatedAt: '',
      lessons: [
        { id: '1', order: 1, title: 'A1', status: 'completed', actualDate: '2026-03-01' },
        { id: '2', order: 2, title: 'A2', status: 'completed', actualDate: '2026-03-05' },
        { id: '3', order: 3, title: 'A3', status: 'planned' }
      ]
    }
    const pace3 = calculateCurricularPace(seqAhead)
    expect(pace3.pace).toBe('ahead')
    expect(pace3.difference).toBe(1) // 2 completed vs 1 expected
    expect(pace3.message).toContain('Adiantada em 1 aula')
  })

  it('5. Deve vincular um plano de aula do LessonStudio a um slot da sequência didática', () => {
    // Inicializa sequências
    getDidacticSequences()

    // Vincula plano ao slot 4 da Unit 4 (seq_unit4_9b)
    const linked = linkLessonPlanToSequence(
      'seq_unit4_9b',
      4,
      'plan_unit4_lesson4_test',
      'Produção de Narrativas em Duplas',
      '2026-03-12'
    )
    expect(linked).toBe(true)

    const updatedSeq = getDidacticSequenceById('seq_unit4_9b')
    const slot4 = updatedSeq?.lessons.find(l => l.order === 4)
    expect(slot4?.lessonPlanId).toBe('plan_unit4_lesson4_test')
    expect(slot4?.status).toBe('completed')
    expect(slot4?.actualDate).toBe('2026-03-12')
    expect(slot4?.title).toContain('Produção de Narrativas em Duplas')
  })

  it('6. Deve desvincular plano de aula se o plano for excluído ou desassociado', () => {
    getDidacticSequences()
    linkLessonPlanToSequence('seq_unit4_9b', 4, 'plan_to_unlink', 'Plano Temporário', '2026-03-12')

    unlinkLessonPlanFromSequence('plan_to_unlink')

    const updatedSeq = getDidacticSequenceById('seq_unit4_9b')
    const slot4 = updatedSeq?.lessons.find(l => l.order === 4)
    expect(slot4?.lessonPlanId).toBeUndefined()
    expect(slot4?.status).toBe('planned')
  })

  it('7. Deve verificar que LessonStudio possui integração bidirecional e campos de Sequência Didática', () => {
    const studioContent = fs.readFileSync(
      path.resolve(__dirname, '../components/modules/LessonStudio.tsx'),
      'utf-8'
    )

    // Verifica schema e estados
    expect(studioContent).toContain('didacticSequenceRef?: DidacticSequenceReference')
    expect(studioContent).toContain('const [availableSequences, setAvailableSequences] = useState<DidacticSequenceDocument[]>([])')
    expect(studioContent).toContain('const selectedSequence = useMemo(')
    expect(studioContent).toContain('const sequencePaceResult = useMemo(')
    expect(studioContent).toContain('handleSelectSequence')
    expect(studioContent).toContain('handleSelectSequenceSlot')

    // Verifica persistência bidirecional
    expect(studioContent).toContain('linkLessonPlanToSequence(')
    expect(studioContent).toContain('prefill.didacticSequenceRef')

    // Verifica renderização visual no Box 1
    expect(studioContent).toContain('🔗 Sequência Didática (Ritmo Curricular)')
    expect(studioContent).toContain('Sequência da Turma:')
    expect(studioContent).toContain('Posição da Aula na Sequência:')
    expect(studioContent).toContain('Ver Sequência Completa ↗')
  })

  it('8. Deve verificar que DidacticSequence.tsx possui navegação para LessonStudio e suporte a turmas unificadas', () => {
    const seqContent = fs.readFileSync(
      path.resolve(__dirname, '../components/modules/DidacticSequence.tsx'),
      'utf-8'
    )

    // Verifica importações e estados
    expect(seqContent).toContain("from '@/lib/didacticSequenceService'")
    expect(seqContent).toContain('handlePlanSlotInStudio')
    expect(seqContent).toContain('handleOpenSlotPlanInStudio')
    expect(seqContent).toContain('handleCreateSequence')
    expect(seqContent).toContain('activeSequencePace')

    // Verifica slots e botões
    expect(seqContent).toContain('Planejar no Studio')
    expect(seqContent).toContain('Ver Plano no Studio')
    expect(seqContent).toContain('Nova Sequência Didática')
    expect(seqContent).toContain('teacher_lesson_studio_prefill')
  })
})
