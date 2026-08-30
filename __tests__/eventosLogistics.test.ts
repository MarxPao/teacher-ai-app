import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { populateEventDefaults, SchoolEvent } from '../components/modules/Eventos'

describe('School Events Logistics & Re-architecture Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockStorage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]) }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('popula automaticamente os 4 pilares logisticos para um novo evento', () => {
    const evt = populateEventDefaults({
      title: 'Feira de Robotica e Ciencias 2026',
      category: 'Feira de Ciências',
      date: '2026-11-20',
      location: 'Ginasio Poliesportivo'
    })

    expect(evt.title).toBe('Feira de Robotica e Ciencias 2026')
    expect(evt.category).toBe('Feira de Ciências')
    expect(evt.location).toBe('Ginasio Poliesportivo')

    // 1. Pipeline temporal
    expect(evt.pipelineSteps).toBeDefined()
    expect(evt.pipelineSteps.length).toBeGreaterThanOrEqual(5)
    expect(evt.pipelineSteps.some(s => s.timeOffset === 'Dia D (O Evento)')).toBe(true)

    // 2. Checklist por fases
    expect(evt.taskList).toBeDefined()
    expect(evt.taskList.length).toBeGreaterThanOrEqual(4)
    expect(evt.taskList.some(t => t.phase === 'Pré-Evento')).toBe(true)
    expect(evt.taskList.some(t => t.phase === 'Dia do Evento')).toBe(true)
    expect(evt.taskList.some(t => t.phase === 'Pós-Evento')).toBe(true)

    // 3. Orcamento e materiais
    expect(evt.budgetList).toBeDefined()
    expect(evt.budgetList.length).toBeGreaterThanOrEqual(4)
    const totalCost = evt.budgetList.reduce((acc, b) => acc + b.cost, 0)
    expect(totalCost).toBeGreaterThan(0)

    // 4. Links e Convites
    expect(evt.links).toBeDefined()
    expect(evt.links.some(l => l.type === 'canva')).toBe(true)
    expect(evt.invitationText).toContain('FEIRA DE ROBOTICA E CIENCIAS 2026')
  })

  it('preserva dados customizados informados pelo professor', () => {
    const customEvt: Partial<SchoolEvent> = {
      id: 'custom-123',
      title: 'Festival de Poesia e Musica',
      category: 'Talent Show',
      date: '2026-12-05',
      time: '18:00 - 21:00',
      location: 'Teatro Municipal',
      budgetList: [
        { id: 'b1', item: 'Locacao de Microfones Sem Fio', category: 'Som & Luz', cost: 450, paid: true }
      ],
      taskList: [
        { id: 't1', title: 'Afinar instrumentos e checar rider tecnico', phase: 'Dia do Evento', assignee: 'Prof. Som', completed: false }
      ]
    }

    const populated = populateEventDefaults(customEvt)
    expect(populated.id).toBe('custom-123')
    expect(populated.title).toBe('Festival de Poesia e Musica')
    expect(populated.budgetList.length).toBe(1)
    expect(populated.budgetList[0].cost).toBe(450)
    expect(populated.taskList.length).toBe(1)
    expect(populated.taskList[0].assignee).toBe('Prof. Som')
  })

  it('calcula balanco de custos e status de pagamento corretamente', () => {
    const evt = populateEventDefaults({
      budgetList: [
        { id: 'b1', item: 'Trofeus e Medalhas', category: 'Prêmios/Brindes', cost: 300, paid: true },
        { id: 'b2', item: 'Faixas e Cartazes', category: 'Decoração', cost: 150, paid: false },
        { id: 'b3', item: 'Lanche para Convidados', category: 'Alimentação', cost: 200, paid: true }
      ]
    })

    const total = evt.budgetList.reduce((acc, b) => acc + b.cost, 0)
    const paid = evt.budgetList.filter(b => b.paid).reduce((acc, b) => acc + b.cost, 0)
    const pending = total - paid

    expect(total).toBe(650)
    expect(paid).toBe(500)
    expect(pending).toBe(150)
  })
})
