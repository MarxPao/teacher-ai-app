import { describe, it, expect, beforeEach, vi } from 'vitest'
import { executeTool } from '../components/RafinhaChat'
import { AGENT_TOOLS } from '../lib/agentTools'
import { matchStudentByName } from '../lib/studentMatcher'

describe('RAFINHA AGENT HARNESS AUDIT — SUÍTE DE 4 PILARES (Seção 7)', () => {
  let localStorageMock: Record<string, string> = {}
  let sessionStorageMock: Record<string, string> = {}
  const dispatchedEvents: Array<{ type: string; detail?: unknown }> = []
  let navigatedModule: string | null = null
  let spokenText: string | null = null

  const mockNavigate = (m: string) => { navigatedModule = m }
  const mockSpeak = (t: string) => { spokenText = t }

  beforeEach(() => {
    localStorageMock = {}
    sessionStorageMock = {}
    dispatchedEvents.length = 0
    navigatedModule = null
    spokenText = null
    vi.clearAllMocks()

    vi.stubGlobal('localStorage', {
      getItem: (k: string) => localStorageMock[k] ?? null,
      setItem: (k: string, v: string) => { localStorageMock[k] = String(v) },
      removeItem: (k: string) => { delete localStorageMock[k] },
      clear: () => { localStorageMock = {} },
    })

    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => sessionStorageMock[k] ?? null,
      setItem: (k: string, v: string) => { sessionStorageMock[k] = String(v) },
      removeItem: (k: string) => { delete sessionStorageMock[k] },
      clear: () => { sessionStorageMock = {} },
    })

    vi.stubGlobal('window', {
      location: { origin: 'http://localhost:3000' },
      postMessage: vi.fn(),
      open: vi.fn(),
      addEventListener: vi.fn((type: string, handler: any) => {
        if (type === 'message') {
          setTimeout(() => {
            handler({
              origin: 'http://localhost:3000',
              data: { action: 'FILL_RESULT', success: true, platform: 'machado' }
            })
          }, 10)
        }
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: (evt: Event) => {
        dispatchedEvents.push({
          type: evt.type,
          detail: (evt as CustomEvent).detail
        })
        return true
      }
    })

    vi.stubGlobal('CustomEvent', class CustomEventMock {
      type: string
      detail: unknown
      constructor(type: string, params?: { detail?: unknown }) {
        this.type = type
        this.detail = params?.detail
      }
    })
  })

  // ============================================================================
  // PILAR 1: AUDITORIA DAS 24 FERRAMENTAS RESTANTES DO CATÁLOGO
  // ============================================================================
  describe('Pilar 1: Auditoria Individual de Efeito Colateral Real das 24 Ferramentas Restantes', () => {

    it('1. navigate_to_module: dispara navegação e retorna confirmação', async () => {
      const res = await executeTool('navigate_to_module', { module: 'gradebook' }, mockNavigate as any, mockSpeak)
      expect(navigatedModule).toBe('gradebook')
      expect(res).toContain('gradebook')
    })

    it('2. create_lesson_plan: cria card no board do LessonPlanner e navega para "plan"', async () => {
      const res = await executeTool('create_lesson_plan', {
        title: 'Simple Present vs Continuous',
        subject: 'Inglês',
        objectives: 'Diferenciar ações habituais de temporárias',
        duration: '50',
        classRef: '7º Ano A'
      }, mockNavigate as any, mockSpeak)

      const boards = JSON.parse(localStorageMock['teacher_lessonplanner_boards'] || '[]')
      expect(boards.length).toBeGreaterThan(0)
      expect(boards[0].cards.some((c: any) => c.title === 'Simple Present vs Continuous')).toBe(true)
      expect(navigatedModule).toBe('plan')
      expect(res).toContain('Simple Present vs Continuous')
    })

    it('3. create_communication: persiste aviso institucional e navega para "communications"', async () => {
      const res = await executeTool('create_communication', {
        title: 'Reunião de Pais e Mestres 2026',
        content: 'Convidamos todos os responsáveis para o alinhamento pedagógico.',
        type: 'Convocação'
      }, mockNavigate as any, mockSpeak)

      const comms = JSON.parse(localStorageMock['teacher_communications'] || '[]')
      expect(comms.some((c: any) => c.title === 'Reunião de Pais e Mestres 2026')).toBe(true)
      expect(navigatedModule).toBe('communications')
      expect(res).toContain('Reunião de Pais e Mestres 2026')
    })

    it('4. confirm_portal_submission: aprova tarefa ativa em sessionStorage e despacha evento de conclusão', async () => {
      const activeTask = {
        id: 'task_portal_123',
        portal: 'machado',
        action_type: 'write_attendance',
        status: 'pending_approval',
        payload: { summary: '3 faltas lançadas' }
      }
      sessionStorageMock['teacher_active_portal_task'] = JSON.stringify(activeTask)

      const res = await executeTool('confirm_portal_submission', { action: 'approve' }, mockNavigate as any, mockSpeak)
      expect(sessionStorageMock['teacher_active_portal_task']).toBeUndefined()
      expect(dispatchedEvents.some(e => e.type === 'teacher:portal_task_completed')).toBe(true)
      expect(res).toContain('confirmada e executada com sucesso')
    })

    it('5. show_portal_screenshot: recupera URL de preview do portal em sessionStorage', async () => {
      sessionStorageMock['teacher_active_portal_task'] = JSON.stringify({
        id: 'task_99',
        payload: { prefilled_screenshot_url: '/sandbox/preview_portal.html' }
      })

      const res = await executeTool('show_portal_screenshot', {}, mockNavigate as any, mockSpeak)
      expect(res).toContain('/sandbox/preview_portal.html')
      expect(res).toContain('Captura de Tela do Portal Preenchido')
    })

    it('6. fill_school_portal: registra preenchimento supervisionado', async () => {
      const res = await executeTool('fill_school_portal', {
        platform: 'machado',
        title: 'Aula de Pronúncia',
        classRef: '8º Ano'
      }, mockNavigate as any, mockSpeak)

      expect(res).toContain('Campos preenchidos visualmente no Machado Sobrinho')
      expect(dispatchedEvents.some(e => e.type === 'storage')).toBe(true)
    })

    it('7. open_school_portal: retorna mensagem de abertura do portal', async () => {
      const res = await executeTool('open_school_portal', { platform: 'santacatarina' }, mockNavigate as any, mockSpeak)
      expect(res).toContain('Rede Santa Catarina')
    })

    it('8. generate_exam_content: salva prefill de prova e navega para "exam"', async () => {
      const res = await executeTool('generate_exam_content', {
        topic: 'Conditionals (Zero, First, Second)',
        questionCount: 8,
        level: 'B1',
        type: 'múltipla escolha',
        classRef: '9º Ano A'
      }, mockNavigate as any, mockSpeak)

      const prefill = JSON.parse(localStorageMock['teacher_exam_prefill'] || '{}')
      expect(prefill.topic).toBe('Conditionals (Zero, First, Second)')
      expect(prefill.questionCount).toBe(8)
      expect(navigatedModule).toBe('exam')
      expect(dispatchedEvents.some(e => e.type === 'teacher:exam_prefill')).toBe(true)
      expect(res).toContain('8 questões')
    })

    it('9. speak_response: executa síntese de voz via callback speakFn', async () => {
      const res = await executeTool('speak_response', { text: 'Olá professor! O que vamos preparar hoje?' }, mockNavigate as any, mockSpeak)
      expect(spokenText).toBe('Olá professor! O que vamos preparar hoje?')
      expect(res).toContain('Falando:')
    })

    it('10. update_student_metric: atualiza indicador no array teacher_student_metrics', async () => {
      localStorageMock['teacher_students'] = JSON.stringify([
        { id: 'std_carlos', name: 'Carlos Eduardo', class: '8A' }
      ])

      const res = await executeTool('update_student_metric', {
        studentName: 'Carlos Eduardo',
        metricKey: 'fluency',
        score: 8.5
      }, mockNavigate as any, mockSpeak)

      const metrics = JSON.parse(localStorageMock['teacher_student_metrics'] || '[]')
      expect(metrics.length).toBe(1)
      expect(metrics[0].studentId).toBe('std_carlos')
      expect(metrics[0].scores.fluency).toBe(8.5)
      expect(res).toContain('atualizada para 8.5/10')
    })

    it('11. query_library: busca trechos no RAG da biblioteca pedagógica', async () => {
      const res = await executeTool('query_library', { query: 'Present Perfect' }, mockNavigate as any, mockSpeak)
      expect(typeof res).toBe('string')
      expect(res.length).toBeGreaterThan(5)
    })

    it('12. search_web: pesquisa na internet e retorna resultados formatados', async () => {
      const res = await executeTool('search_web', { query: 'BNCC Língua Inglesa habilidades EF09LI' }, mockNavigate as any, mockSpeak)
      expect(typeof res).toBe('string')
      expect(res.length).toBeGreaterThan(10)
    })

    it('13. remember_fact: persiste aprendizado na memória de longo prazo', async () => {
      const res = await executeTool('remember_fact', {
        fact: 'O professor prefere exercícios com foco comunicativo.',
        category: 'teacher_preference'
      }, mockNavigate as any, mockSpeak)

      const facts = JSON.parse(localStorageMock['teacher_rafinha_memory'] || '[]')
      expect(facts.some((f: any) => f.fact.includes('foco comunicativo'))).toBe(true)
      expect(res).toContain('memória de longo prazo')
    })

    it('14. add_qbank_question: adiciona questão no banco teacher_qbank_questions e navega', async () => {
      const res = await executeTool('add_qbank_question', {
        questionText: 'Choose the correct option: She ___ to London twice.',
        eltCategory: 'Grammar',
        eltSubcategory: 'Present Perfect',
        level: 'B1',
        options: ['has been', 'have been', 'was', 'is'],
        answer: 'has been'
      }, mockNavigate as any, mockSpeak)

      const qbank = JSON.parse(localStorageMock['teacher_qbank_questions'] || '[]')
      expect(qbank.length).toBe(1)
      expect(qbank[0].text).toContain('She ___ to London twice.')
      expect(navigatedModule).toBe('qbank')
      expect(res).toContain('adicionada ao Banco de Questões')
    })

    it('15. create_mindmap: configura prefill de mapa mental e emite evento', async () => {
      const res = await executeTool('create_mindmap', {
        topic: 'Modal Verbs',
        branches: ['Ability (Can/Could)', 'Obligation (Must/Have to)', 'Advice (Should)']
      }, mockNavigate as any, mockSpeak)

      const prefill = JSON.parse(localStorageMock['teacher_mindmap_prefill'] || '{}')
      expect(prefill.topic).toBe('Modal Verbs')
      expect(prefill.branches.length).toBe(3)
      expect(navigatedModule).toBe('mindmap')
      expect(dispatchedEvents.some(e => e.type === 'teacher:mindmap_prefill')).toBe(true)
      expect(res).toContain('Mapa Mental sobre "Modal Verbs" criado com 3 ramos')
    })

    it('16. create_document: configura prefill no editor e emite evento', async () => {
      const res = await executeTool('create_document', {
        title: 'Critérios de Avaliação Formativa',
        content: '# Critérios\n- Participação ativa\n- Produção textual',
        school: 'Machado Sobrinho'
      }, mockNavigate as any, mockSpeak)

      const prefill = JSON.parse(localStorageMock['teacher_editor_prefill'] || '{}')
      expect(prefill.title).toBe('Critérios de Avaliação Formativa')
      expect(navigatedModule).toBe('editor')
      expect(dispatchedEvents.some(e => e.type === 'teacher:editor_prefill')).toBe(true)
      expect(res).toContain('aberto no Editor')
    })

    it('17. apply_school_header: dispara evento customizado teacher:editor_apply_header e navega', async () => {
      const res = await executeTool('apply_school_header', { schoolName: 'Colégio Machado Sobrinho' }, mockNavigate as any, mockSpeak)
      expect(dispatchedEvents.some(e => e.type === 'teacher:editor_apply_header' && e.detail === 'Colégio Machado Sobrinho')).toBe(true)
      expect(navigatedModule).toBe('editor')
      expect(res).toContain('Cabeçalho da escola "Colégio Machado Sobrinho" aplicado!')
    })

    it('18. create_rubric: insere rubrica em teacher_rubrics e navega', async () => {
      const res = await executeTool('create_rubric', {
        title: 'Oral Presentation Rubric',
        skill: 'Speaking',
        criteria: ['Fluency', 'Pronunciation', 'Task Completion']
      }, mockNavigate as any, mockSpeak)

      const rubrics = JSON.parse(localStorageMock['teacher_rubrics'] || '[]')
      expect(rubrics.length).toBe(1)
      expect(rubrics[0].title).toBe('Oral Presentation Rubric')
      expect(navigatedModule).toBe('rubric')
      expect(res).toContain('Rubrica "Oral Presentation Rubric" criada!')
    })

    it('19. add_portfolio_item: adiciona item em teacher_portfolio e navega', async () => {
      const res = await executeTool('add_portfolio_item', {
        studentName: 'Mariana Costa',
        title: 'Redação Narrativa: My Future Trip',
        description: 'Texto estruturado com uso consistente de Going to.',
        category: 'Writing'
      }, mockNavigate as any, mockSpeak)

      const portfolio = JSON.parse(localStorageMock['teacher_portfolio'] || '[]')
      expect(portfolio.length).toBe(1)
      expect(portfolio[0].studentName).toBe('Mariana Costa')
      expect(navigatedModule).toBe('portfolio')
      expect(res).toContain('adicionado ao Portfólio de Mariana Costa')
    })

    it('20. save_repo_material: insere material em teacher_repo_materials e navega', async () => {
      const res = await executeTool('save_repo_material', {
        title: 'Cambridge B1 Vocabulary List.pdf',
        type: 'pdf',
        category: 'Vocabulário',
        url: 'https://storage.local/b1_vocab.pdf'
      }, mockNavigate as any, mockSpeak)

      const repo = JSON.parse(localStorageMock['teacher_repo_materials'] || '[]')
      expect(repo.length).toBe(1)
      expect(repo[0].title).toBe('Cambridge B1 Vocabulary List.pdf')
      expect(navigatedModule).toBe('repo')
      expect(res).toContain('salvo no Repositório')
    })

    it('21. generate_quick_questions: grava prefill de warmup e navega para "quick"', async () => {
      const res = await executeTool('generate_quick_questions', {
        topic: 'Passive Voice in Headlines',
        level: 'B2'
      }, mockNavigate as any, mockSpeak)

      const prefill = JSON.parse(localStorageMock['teacher_quick_prefill'] || '{}')
      expect(prefill.topic).toBe('Passive Voice in Headlines')
      expect(navigatedModule).toBe('quick')
      expect(dispatchedEvents.some(e => e.type === 'teacher:quick_prefill')).toBe(true)
      expect(res).toContain('5 Questões Rápidas de Warm-up')
    })

    it('22. manage_didactic_sequence: atualiza progresso de unidade em teacher_didactic_sequence_units_v3', async () => {
      const initialUnits = [
        { unitNumber: 1, title: 'Unit 1: Introductions', status: 'completed' },
        { unitNumber: 2, title: 'Unit 2: Past Memories', status: 'current' },
        { unitNumber: 3, title: 'Unit 3: Future Predictions', status: 'upcoming' },
      ]
      localStorageMock['teacher_didactic_sequence_units_v3'] = JSON.stringify(initialUnits)

      const res = await executeTool('manage_didactic_sequence', {
        action: 'advance_unit',
        unitNumber: 3
      }, mockNavigate as any, mockSpeak)

      const updated = JSON.parse(localStorageMock['teacher_didactic_sequence_units_v3'] || '[]')
      expect(updated.find((u: any) => u.unitNumber === 1).status).toBe('completed')
      expect(updated.find((u: any) => u.unitNumber === 2).status).toBe('completed')
      expect(updated.find((u: any) => u.unitNumber === 3).status).toBe('current')
      expect(navigatedModule).toBe('didacticsequence')
      expect(res).toContain('Unidade 3 definida como o conteúdo atual')
    })

    it('23. add_weekly_agenda_item: insere horário semanal em teacher_weekly_agenda_posts_v1', async () => {
      const res = await executeTool('add_weekly_agenda_item', {
        day: 'Terça',
        time: '10:00 - 10:50',
        title: 'Inglês Instrumental',
        className: '9º Ano B',
        room: 'Sala 04'
      }, mockNavigate as any, mockSpeak)

      const posts = JSON.parse(localStorageMock['teacher_weekly_agenda_posts_v1'] || '[]')
      expect(posts.length).toBe(1)
      expect(posts[0].day).toBe('Terça')
      expect(posts[0].title).toBe('Inglês Instrumental')
      expect(navigatedModule).toBe('weeklyagenda')
      expect(res).toContain('adicionado à Agenda Semanal na Terça!')
    })

    it('24. generate_parent_communication: grava prefill individualizado em teacher_parent_comms_prefill', async () => {
      const res = await executeTool('generate_parent_communication', {
        studentName: 'Felipe Ribeiro',
        topic: 'Evolução notável na leitura autônoma',
        tone: 'elogioso'
      }, mockNavigate as any, mockSpeak)

      const prefill = JSON.parse(localStorageMock['teacher_parent_comms_prefill'] || '{}')
      expect(prefill.studentName).toBe('Felipe Ribeiro')
      expect(prefill.tone).toBe('elogioso')
      expect(navigatedModule).toBe('parentcomms')
      expect(dispatchedEvents.some(e => e.type === 'teacher:parent_comms_prefill')).toBe(true)
      expect(res).toContain('Mensagem personalizada para os pais de Felipe Ribeiro')
    })
  })

  // ============================================================================
  // PILAR 2: PRECISÃO DE EXTRAÇÃO DE PARÂMETRO EM COMANDO AMBÍGUO NO HARNESS
  // ============================================================================
  describe('Pilar 2: Extração de Parâmetros e Desambiguação de Alunos no Fluxo de Function Calling', () => {
    const homonymStudents = [
      { id: 'std_lucas_santos', name: 'Lucas Santos', class: '8º A', grades: {} },
      { id: 'std_lucas_santana', name: 'Lucas Santana', class: '8º B', grades: {} },
      { id: 'std_gabriel_silva', name: 'Gabriel Silva', class: '9º A', grades: {} },
      { id: 'std_gabriela_silva', name: 'Gabriela Silva', class: '9º B', grades: {} },
    ]

    beforeEach(() => {
      localStorageMock['teacher_students'] = JSON.stringify(homonymStudents)
    })

    it('1. Bloqueia mutação indevida de nota se o nome for ambíguo ("Lucas") e exige desambiguação', async () => {
      const res = await executeTool('add_student_grade', {
        studentName: 'Lucas',
        column: 'Prova 1',
        grade: 9.5
      }, mockNavigate as any, mockSpeak)

      // Nenhuma nota deve ter sido lançada
      const students = JSON.parse(localStorageMock['teacher_students'])
      expect(students[0].grades['Prova 1']).toBeUndefined()
      expect(students[1].grades['Prova 1']).toBeUndefined()

      // Resposta deve conter o prompt de desambiguação com os dois nomes
      expect(res).toContain('Lucas Santos')
      expect(res).toContain('Lucas Santana')
    })

    it('2. Aplica mutação com precisão cirúrgica quando o nome completo for especificado ("Lucas Santos")', async () => {
      const res = await executeTool('add_student_grade', {
        studentName: 'Lucas Santos',
        column: 'Prova 1',
        grade: 9.0
      }, mockNavigate as any, mockSpeak)

      const students = JSON.parse(localStorageMock['teacher_students'])
      const lucasSantos = students.find((s: any) => s.id === 'std_lucas_santos')
      const lucasSantana = students.find((s: any) => s.id === 'std_lucas_santana')

      expect(lucasSantos.grades['Prova 1']).toBe('9')
      expect(lucasSantana.grades['Prova 1']).toBeUndefined()
      expect(res).toContain('Nota 9 lançada para Lucas Santos em "Prova 1"')
    })

    it('3. Bloqueia observação na memória pedagógica em nome ambíguo ("Gabri") sem corromper histórico', async () => {
      const res = await executeTool('record_student_observation', {
        studentName: 'Gabri',
        note: 'Demonstrou dificuldade com pronomes relativos.',
        category: 'Dificuldade'
      }, mockNavigate as any, mockSpeak)

      const memory = JSON.parse(localStorageMock['teacher_student_memory'] || '[]')
      expect(memory.length).toBe(0)
      expect(res).toContain('Gabriel Silva')
      expect(res).toContain('Gabriela Silva')
    })

    it('4. Grava observação na memória do aluno correto quando resolvido ("Gabriela Silva")', async () => {
      const res = await executeTool('record_student_observation', {
        studentName: 'Gabriela Silva',
        note: 'Excelente pontuação na leitura de textos longos.',
        category: 'Destaque'
      }, mockNavigate as any, mockSpeak)

      const memory = JSON.parse(localStorageMock['teacher_student_memory'] || '[]')
      expect(memory.length).toBe(1)
      expect(memory[0].studentId).toBe('std_gabriela_silva')
      expect(memory[0].studentName).toBe('Gabriela Silva')
      expect(res).toContain('Observação registrada para Gabriela Silva')
    })
  })

  // ============================================================================
  // PILAR 3: TRATAMENTO DE FALHAS DE FERRAMENTA (Transparência vs Alucinação)
  // ============================================================================
  describe('Pilar 3: Tratamento de Falhas e Integridade Factual de Erros', () => {

    it('1. add_student_grade com aluno inexistente reporta erro factual e não inventa gravação', async () => {
      localStorageMock['teacher_students'] = JSON.stringify([
        { id: '1', name: 'Rodrigo Faro', class: '7A', grades: {} }
      ])

      const res = await executeTool('add_student_grade', {
        studentName: 'Aluno Fantasma Que Nao Existe',
        column: 'Simulado',
        grade: 10
      }, mockNavigate as any, mockSpeak)

      expect(res).toMatch(/não encontrei|não encontrado/i)
      const students = JSON.parse(localStorageMock['teacher_students'])
      expect(students[0].grades['Simulado']).toBeUndefined()
    })

    it('2. update_student_metric com aluno inexistente retorna recusa factual sem mutação', async () => {
      localStorageMock['teacher_students'] = JSON.stringify([])

      const res = await executeTool('update_student_metric', {
        studentName: 'Beatriz inexistente',
        metricKey: 'fluency',
        score: 7
      }, mockNavigate as any, mockSpeak)

      expect(res).toMatch(/aluno encontrado|não encontrado/i)
      expect(localStorageMock['teacher_student_metrics']).toBeUndefined()
    })

    it('3. evaluate_student_audio chamado sem áudio ou com "N/A" recusa alucinar e redireciona', async () => {
      const res1 = await executeTool('evaluate_student_audio', {
        studentName: 'Pedro Alvares',
        audioUrl: 'N/A'
      }, mockNavigate as any, mockSpeak)

      expect(res1).toContain('Não recebi a gravação de áudio do aluno Pedro Alvares')
      expect(navigatedModule).toBe('audiopronunciation')
      expect(localStorageMock['teacher_student_memory']).toBeUndefined()

      const res2 = await executeTool('evaluate_student_audio', {
        studentName: 'Pedro Alvares',
        audioUrl: ''
      }, mockNavigate as any, mockSpeak)

      expect(res2).toContain('Não recebi a gravação de áudio')
    })

    it('4. confirm_portal_submission sem tarefa ativa reporta ausência factual', async () => {
      const res = await executeTool('confirm_portal_submission', { action: 'approve' }, mockNavigate as any, mockSpeak)
      expect(res).toContain('Não há nenhuma tarefa de portal aguardando confirmação no momento.')
    })

    it('5. show_portal_screenshot sem tarefa ativa reporta ausência factual de print', async () => {
      const res = await executeTool('show_portal_screenshot', {}, mockNavigate as any, mockSpeak)
      expect(res).toContain('Não há nenhuma tarefa pré-preenchida no momento para exibir print.')
    })

    it('6. create_class idempotente: não duplica turma com mesmo nome', async () => {
      localStorageMock['teacher_classes'] = JSON.stringify([
        { id: 'cls_1', name: '9º Ano A', school: 'Escola Central' }
      ])

      const res = await executeTool('create_class', {
        name: '9º Ano A',
        school: 'Escola Central'
      }, mockNavigate as any, mockSpeak)

      const classes = JSON.parse(localStorageMock['teacher_classes'])
      expect(classes.length).toBe(1)
      expect(res).toContain('Turma "9º Ano A" criada com sucesso!')
    })
  })

  // ============================================================================
  // PILAR 4: SELEÇÃO E DESAMBIGUAÇÃO ENTRE FERRAMENTAS CORRELATAS
  // ============================================================================
  describe('Pilar 4: Separação de Responsabilidade entre Ferramentas Correlatas', () => {

    it('1. add_todo vs create_calendar_task: checklist da dashboard vs agenda de tarefas', async () => {
      // Tarefa informal de checklist
      await executeTool('add_todo', { text: 'Comprar cartolina azul' }, mockNavigate as any, mockSpeak)
      const todos = JSON.parse(localStorageMock['teacher_dashboard_todos'] || '[]')
      expect(todos.some((t: any) => t.text === 'Comprar cartolina azul')).toBe(true)
      expect(localStorageMock['teacher_calendar_tasks']).toBeUndefined()

      // Tarefa formal de calendário com prazo e prioridade
      await executeTool('create_calendar_task', {
        title: 'Entrega das Provas Bimestrais',
        date: '2026-09-12',
        priority: 'high'
      }, mockNavigate as any, mockSpeak)
      const tasks = JSON.parse(localStorageMock['teacher_calendar_tasks'] || '[]')
      expect(tasks.some((t: any) => t.title === 'Entrega das Provas Bimestrais' && t.priority === 'high')).toBe(true)
    })

    it('2. create_lesson_plan vs create_full_lesson: card rápido vs pipeline Cambridge TKT', async () => {
      // Card no quadro visual do LessonPlanner
      await executeTool('create_lesson_plan', {
        title: 'Warmup de Phrasal Verbs',
        duration: '15'
      }, mockNavigate as any, mockSpeak)
      expect(navigatedModule).toBe('plan')
      expect(localStorageMock['teacher_lessonstudio_prefill']).toBeUndefined()

      // Geração de aula completa TKT no LessonStudio
      await executeTool('create_full_lesson', {
        topic: 'Passive Voice in Literature',
        cefr: 'B2',
        duration: '50'
      }, mockNavigate as any, mockSpeak)
      expect(navigatedModule).toBe('lessonstudio')
      const prefill = JSON.parse(localStorageMock['teacher_lessonstudio_prefill'] || '{}')
      expect(prefill.topic).toBe('Passive Voice in Literature')
      expect(prefill.cefr).toBe('B2')
    })

    it('3. create_communication vs generate_parent_communication: comunicado escolar geral vs mensagem familiar', async () => {
      // Circular geral da escola
      await executeTool('create_communication', {
        title: 'Horário de Provas Finais',
        type: 'Circular'
      }, mockNavigate as any, mockSpeak)
      expect(navigatedModule).toBe('communications')
      expect(localStorageMock['teacher_parent_comms_prefill']).toBeUndefined()

      // Mensagem direta de feedback para a família de um aluno
      await executeTool('generate_parent_communication', {
        studentName: 'Tiago Souza',
        topic: 'Avanço na pronúncia e engajamento em sala'
      }, mockNavigate as any, mockSpeak)
      expect(navigatedModule).toBe('parentcomms')
      const prefill = JSON.parse(localStorageMock['teacher_parent_comms_prefill'] || '{}')
      expect(prefill.studentName).toBe('Tiago Souza')
    })

    it('4. execute_portal_action vs record_private_tutoring_session: diário escolar oficial vs ledger particular', async () => {
      // Diário de escola formal via portal
      await executeTool('execute_portal_action', {
        platform: 'machado',
        actionType: 'diary',
        title: 'Conteúdo: First Conditional',
        classRef: '8A'
      }, mockNavigate as any, mockSpeak)
      expect(sessionStorageMock['teacher_active_portal_task']).toBeDefined()
      expect(localStorageMock['teacher_private_students']).toBeUndefined()

      // Aula particular individual com cobrança e data
      await executeTool('record_private_tutoring_session', {
        studentName: 'Ana Júlia Particular',
        date: '2026-09-15',
        time: '16:00',
        fee: 90,
        topic: 'Business English'
      }, mockNavigate as any, mockSpeak)
      expect(navigatedModule).toBe('privatetutoring')
      const privateStudents = JSON.parse(localStorageMock['teacher_private_students'] || '[]')
      expect(privateStudents.some((s: any) => s.name === 'Ana Júlia Particular' && s.lessonsHistory[0].topic === 'Business English')).toBe(true)
    })
  })
})
