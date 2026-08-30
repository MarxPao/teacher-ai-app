import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  routeTrelloCard,
  routeTrelloCardsBatch,
  executeTrelloDecisions,
  extractCheckItems,
  TrelloRoutingDecision
} from '../lib/trelloRouterEngine'
import { TrelloCard } from '../lib/trelloClient'
import { loadChecklistTodos } from '../lib/checklistManager'

describe('Trello Router Engine & Intelligent Agent Mapping', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} },
    })
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('extrai subitens de checklists de cartões do Trello', () => {
    const card: TrelloCard = {
      id: 'c1',
      name: 'Cartão com Checklist',
      desc: '',
      due: null,
      dueComplete: false,
      idList: 'l1',
      idBoard: 'b1',
      shortUrl: '',
      url: '',
      labels: [],
      checklists: [
        {
          id: 'chk1',
          name: 'Checklist 1',
          idCard: 'c1',
          checkItems: [
            { id: 'i1', name: 'Item 1', state: 'complete' },
            { id: 'i2', name: 'Item 2', state: 'incomplete' }
          ]
        }
      ]
    }

    const items = extractCheckItems(card)
    expect(items.length).toBe(2)
    expect(items[0].name).toBe('Item 1')
    expect(items[1].state).toBe('incomplete')
  })

  it('classifica contato com responsáveis para aluno conhecido como generate_parent_communication (Alta Confiança)', () => {
    const knownStudents = [{ id: 's1', name: 'Lucas Silva' }]
    const card: TrelloCard = {
      id: 'c_parent',
      name: 'Ligar para os pais de Lucas Silva sobre tarefas atrasadas',
      desc: '9º Ano A - Não fez as lições das Units 3 e 4',
      due: '2026-09-02T15:00:00.000Z',
      dueComplete: false,
      idList: 'l1',
      idBoard: 'b1',
      shortUrl: '',
      url: '',
      labels: [{ id: 'l1', name: 'Família', color: 'purple' }]
    }

    const decision = routeTrelloCard(card, knownStudents)
    expect(decision.suggestedTool).toBe('generate_parent_communication')
    expect(decision.confidence).toBe('high')
    expect(decision.confidenceScore).toBeGreaterThanOrEqual(0.80)
    expect(decision.suggestedPayload.studentName).toBe('Lucas Silva')
  })

  it('classifica anotação comportamental/pedagógica como record_student_observation', () => {
    const knownStudents = [{ id: 's2', name: 'Maria Souza' }]
    const card: TrelloCard = {
      id: 'c_obs',
      name: 'Maria Souza evoluiu muito na pronúncia de th',
      desc: 'Participou ativamente do role-play na aula de ontem',
      due: null,
      dueComplete: false,
      idList: 'l1',
      idBoard: 'b1',
      shortUrl: '',
      url: '',
      labels: [{ id: 'l2', name: 'Comportamento', color: 'green' }]
    }

    const decision = routeTrelloCard(card, knownStudents)
    expect(decision.suggestedTool).toBe('record_student_observation')
    expect(decision.confidence).toBe('high')
    expect(decision.suggestedPayload.studentName).toBe('Maria Souza')
  })

  it('classifica montagem de prova/avaliação como generate_exam_content', () => {
    const card: TrelloCard = {
      id: 'c_exam',
      name: 'Elaborar Prova Bimestral de Simple Past',
      desc: '5 questões de múltipla escolha e 2 dissertativas',
      due: '2026-09-10T12:00:00.000Z',
      dueComplete: false,
      idList: 'l1',
      idBoard: 'b1',
      shortUrl: '',
      url: '',
      labels: [{ id: 'l3', name: 'Avaliação', color: 'red' }]
    }

    const decision = routeTrelloCard(card)
    expect(decision.suggestedTool).toBe('generate_exam_content')
    expect(decision.confidence).toBe('high')
  })

  it('classifica plano de aula e roteiro didático como create_lesson_plan', () => {
    const card: TrelloCard = {
      id: 'c_plan',
      name: 'Plano de Aula: Present Perfect com Música dos Beatles',
      desc: 'Aquecimento, listening com lacunas e discussão em duplas',
      due: '2026-09-05T08:00:00.000Z',
      dueComplete: false,
      idList: 'l1',
      idBoard: 'b1',
      shortUrl: '',
      url: '',
      labels: [{ id: 'l4', name: 'Planejamento', color: 'yellow' }]
    }

    const decision = routeTrelloCard(card)
    expect(decision.suggestedTool).toBe('create_lesson_plan')
    expect(decision.confidence).toBe('high')
    expect(decision.suggestedPayload.title).toContain('Present Perfect')
  })

  it('classifica reuniões e eventos com data agendada como create_calendar_task', () => {
    const card: TrelloCard = {
      id: 'c_meeting',
      name: 'Reunião de Conselho de Classe do 9º Ano',
      desc: 'Fechamento do 2º bimestre na sala dos professores',
      due: '2026-09-15T14:00:00.000Z',
      dueComplete: false,
      idList: 'l1',
      idBoard: 'b1',
      shortUrl: '',
      url: '',
      labels: [{ id: 'l5', name: 'Reunião', color: 'blue' }]
    }

    const decision = routeTrelloCard(card)
    expect(decision.suggestedTool).toBe('create_calendar_task')
    expect(decision.suggestedPayload.date).toBe('2026-09-15')
  })

  it('classifica tarefas operacionais gerais como add_todo', () => {
    const card: TrelloCard = {
      id: 'c_todo',
      name: 'Imprimir 30 cópias da atividade de listening',
      desc: 'Levar na sala dos professores até as 10h',
      due: null,
      dueComplete: false,
      idList: 'l1',
      idBoard: 'b1',
      shortUrl: '',
      url: '',
      labels: [{ id: 'l6', name: 'Impressão', color: 'orange' }]
    }

    const decision = routeTrelloCard(card)
    expect(decision.suggestedTool).toBe('add_todo')
    expect(decision.suggestedPayload.text).toContain('Imprimir')
  })

  it('executa despacho de decisões aprovadas criando To-Dos e registrando histórico', async () => {
    const decisions: TrelloRoutingDecision[] = [
      {
        cardId: 'card_exec_1',
        cardName: 'Comprar canetas para o quadro',
        cardDesc: 'Azul e vermelha',
        due: null,
        dueComplete: false,
        labels: [],
        checkItems: [],
        suggestedTool: 'add_todo',
        suggestedPayload: { text: 'Comprar canetas para o quadro', priority: 'medium' },
        confidence: 'high',
        confidenceScore: 0.9,
        reasoning: 'Tarefa',
        alternativeTools: [],
        approved: true,
        importChecklistAsSubtasks: true
      },
      {
        cardId: 'card_exec_2',
        cardName: 'Tarefa Não Aprovada (Ignorar)',
        cardDesc: '',
        due: null,
        dueComplete: false,
        labels: [],
        checkItems: [],
        suggestedTool: 'add_todo',
        suggestedPayload: { text: 'Tarefa Não Aprovada' },
        confidence: 'low',
        confidenceScore: 0.4,
        reasoning: 'Baixa confiança',
        alternativeTools: [],
        approved: false, // 0-TESTER: não deve ser gravada
        importChecklistAsSubtasks: true
      }
    ]

    const result = await executeTrelloDecisions(decisions)
    expect(result.executedCount).toBe(1)
    expect(result.errors.length).toBe(0)

    const todos = loadChecklistTodos()
    expect(todos.length).toBe(1)
    expect(todos[0].text).toContain('Comprar canetas')

    // Verifica que o histórico de cartões importados foi atualizado
    const rawImported = JSON.parse(mockStorage['teacher_trello_imported_cards'] || '{}')
    expect(rawImported['card_exec_1']).toBeDefined()
    expect(rawImported['card_exec_2']).toBeUndefined()
  })

  it('detecta e sinaliza conteúdo padrão de onboarding do Trello (ex: Guia de Introdução, Baixe o App)', () => {
    const onboardingCard: TrelloCard = {
      id: 'c_onb_1',
      name: 'Baixe o aplicativo para dispositivos móveis',
      desc: 'Acesse seus quadros no iOS e Android',
      due: null,
      dueComplete: false,
      idList: 'list_onb',
      idBoard: 'board_main',
      shortUrl: '',
      url: '',
      labels: [],
      // Metadado da lista
      ...( { listName: 'Guia de introdução ao Trello' } as any )
    }

    const decision = routeTrelloCard(onboardingCard)
    expect(decision.isOnboarding).toBe(true)
    expect(decision.onboardingWarning).toBeDefined()
    expect(decision.approved).toBe(false) // Desmarcado por padrão para proteger o usuário
  })

  it('detecta link para outro quadro do Trello no cartão sem seguir automaticamente', () => {
    const linkedCard: TrelloCard = {
      id: 'c_link_1',
      name: 'Planejamento do 4º Bimestre (Ver quadro)',
      desc: 'Detalhes completos em https://trello.com/b/abc12345/planejamento-4-bimestre',
      due: null,
      dueComplete: false,
      idList: 'list_1',
      idBoard: 'board_main',
      shortUrl: '',
      url: '',
      labels: []
    }

    const decision = routeTrelloCard(linkedCard)
    expect(decision.linkedBoard).toBeDefined()
    expect(decision.linkedBoard?.boardIdOrShortLink).toBe('abc12345')
    expect(decision.linkedBoard?.url).toContain('trello.com/b/abc12345')
  })

  it('grava checklists internos como subtarefas e anexa notas com comentários no ChecklistTodo', async () => {
    const deepCard: TrelloCard = {
      id: 'card_deep_1',
      name: 'English Week',
      desc: 'Semana de imersão cultural em inglês',
      due: null,
      dueComplete: false,
      idList: 'l1',
      idBoard: 'b1',
      shortUrl: '',
      url: '',
      labels: [],
      checklists: [
        {
          id: 'chk_1',
          name: 'Ações',
          idCard: 'card_deep_1',
          checkItems: [
            { id: 'i1', name: 'Marcar reunião com coordenação', state: 'complete' },
            { id: 'i2', name: 'Comprar materiais e brindes', state: 'incomplete' }
          ]
        }
      ],
      attachments: [
        { id: 'att_1', name: 'cronograma.pdf', url: 'https://link.com/cronograma.pdf', isUpload: true }
      ],
      comments: [
        { id: 'comm_1', text: 'Professores de arte já confirmaram apoio', date: '2026-08-30T14:00:00Z', authorName: 'Rafaela' }
      ]
    }

    const decision = routeTrelloCard(deepCard)
    expect(decision.checkItems.length).toBe(2)
    expect(decision.attachments?.length).toBe(1)
    expect(decision.comments?.length).toBe(1)

    const result = await executeTrelloDecisions([decision])
    expect(result.executedCount).toBe(1)

    const todos = loadChecklistTodos()
    expect(todos.length).toBe(1)
    expect(todos[0].text).toBe('English Week')
    expect(todos[0].subtasks?.length).toBe(2)
    expect(todos[0].subtasks?.[0].text).toBe('Marcar reunião com coordenação')
    expect(todos[0].subtasks?.[0].done).toBe(true)
    expect(todos[0].subtasks?.[1].done).toBe(false)
    expect(todos[0].notes).toContain('cronograma.pdf')
    expect(todos[0].notes).toContain('Professores de arte já confirmaram apoio')
    expect(todos[0].attachments?.length).toBe(1)
  })
})
