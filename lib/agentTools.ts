/**
 * agentTools.ts — Definições de Tools para o Motor Agêntico da Rafinha
 * Cobertura 100% de Todas as Funcionalidades do Aplicativo
 */

export interface ToolDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

/** Formato canônico de mensagem — agnóstico a provider */
export interface CanonicalMessage {
  role: 'user' | 'assistant'
  content: string
  toolUse?: Array<{ id: string; name: string; input: Record<string, unknown> }>
  toolResults?: Array<{ id: string; name: string; result: string }>
}

export const AGENT_TOOLS: ToolDefinition[] = [
  // 1. NAVEGAÇÃO
  {
    name: 'navigate_to_module',
    description: 'Navega para qualquer módulo do aplicativo (dashboard, quick, exam, plan, rubric, gradebook, omnigrader, students, classes, analytics, calendar, communications, repo, qbank, mindmap, editor, portfolio, extensions, settings, api).',
    input_schema: {
      type: 'object',
      properties: {
        module: {
          type: 'string',
          enum: ['dashboard', 'quick', 'exam', 'lessonstudio', 'plan', 'rubric', 'gradebook', 'omnigrader', 'students', 'classes', 'analytics', 'calendar', 'communications', 'repo', 'qbank', 'mindmap', 'editor', 'portfolio', 'extensions', 'settings', 'api', 'maestro', 'classlog', 'didacticsequence', 'livequiz', 'parentcomms', 'classroommode', 'flashcardmode', 'audiopronunciation', 'wellbeing', 'reflectivepractice', 'meetingclassrecorder', 'weeklyagenda', 'batchgrader', 'progresstracker', 'autoreport'],
          description: 'Módulo para navegar'
        }
      },
      required: ['module']
    }
  },

  // 2. CHECKLIST & TAREFAS
  {
    name: 'add_todo',
    description: 'Adiciona uma tarefa ao checklist do Dashboard.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Texto da tarefa' }
      },
      required: ['text']
    }
  },

  // 3. CALENDÁRIO & EVENTOS
  {
    name: 'create_calendar_task',
    description: 'Cria evento, prova ou tarefa no Calendário. Calcule datas relativas ("sexta" = próxima sexta, "amanhã" = +1 dia).',
    input_schema: {
      type: 'object',
      properties: {
        title:       { type: 'string',  description: 'Título da tarefa/prova/evento' },
        date:        { type: 'string',  description: 'Data YYYY-MM-DD' },
        classRef:    { type: 'string',  description: 'Turma, ex: 9A, 8B' },
        type:        { type: 'string',  enum: ['prova', 'tarefa', 'correcao', 'planejamento', 'reuniao', 'evento'] },
        description: { type: 'string' },
        priority:    { type: 'string',  enum: ['low', 'medium', 'high'] }
      },
      required: ['title', 'date']
    }
  },

  // 4. PLANO DE AULA (LESSON PLANNER)
  {
    name: 'create_lesson_plan',
    description: 'Cria um card de plano de aula no Lesson Planner.',
    input_schema: {
      type: 'object',
      properties: {
        title:      { type: 'string', description: 'Título do plano de aula' },
        subject:    { type: 'string', description: 'Assunto/gramática/vocabulário' },
        objectives: { type: 'string', description: 'Objetivos de aprendizagem' },
        className:  { type: 'string', description: 'Turma' },
        school:     { type: 'string', description: 'Escola' },
        duration:   { type: 'string', description: 'Duração em minutos, ex: 50' }
      },
      required: ['title', 'subject']
    }
  },

  // 5. COMUNICADOS & AVISOS
  {
    name: 'create_communication',
    description: 'Cria um comunicado, bilhete ou aviso para pais/responsáveis.',
    input_schema: {
      type: 'object',
      properties: {
        title:   { type: 'string', description: 'Título' },
        content: { type: 'string', description: 'Texto completo do comunicado' },
        type:    { type: 'string', enum: ['Aviso', 'Reunião', 'Bilhete', 'Convocação', 'Circular'] }
      },
      required: ['title', 'content']
    }
  },

  // 6. GRADEBOOK / BOLETIM
  {
    name: 'add_student_grade',
    description: 'Lança nota de um aluno no Gradebook.',
    input_schema: {
      type: 'object',
      properties: {
        studentName: { type: 'string', description: 'Nome do aluno' },
        column:      { type: 'string', description: 'Nome da avaliação, ex: Prova 1, Trabalho' },
        grade:       { type: 'number', description: 'Nota de 0 a 10' }
      },
      required: ['studentName', 'column', 'grade']
    }
  },

  // 7. PORTAIS ESCOLARES (INTEGRAÇÃO EXTENSÃO & AUTOMAÇÃO AGÊNTICA)
  {
    name: 'execute_portal_action',
    description: 'Executa ações operacionais reais em portais escolares (Machado Sobrinho, Plurall, Rede Santa Catarina, Cambridge One, etc.). Suporta lançamento de diários de classe, frequências/chamadas, notas de boletim e criação de tarefas, nos modos supervisionado ou autônomo.',
    input_schema: {
      type: 'object',
      properties: {
        platform:       { type: 'string', description: 'ID do portal, ex: machado, santacatarina, plural, cambridge, ou nome da escola' },
        actionType:     { type: 'string', enum: ['diary', 'attendance', 'grades', 'assignment', 'custom'], description: 'Tipo da ação: diário, chamada, notas, tarefa' },
        title:          { type: 'string', description: 'Título da aula, diário ou avaliação' },
        date:           { type: 'string', description: 'Data YYYY-MM-DD' },
        classRef:       { type: 'string', description: 'Turma vinculada, ex: 9º Ano A, 8B' },
        description:    { type: 'string', description: 'Conteúdo programático, pauta, metodologia ou instruções da tarefa' },
        mode:           { type: 'string', enum: ['supervised', 'autonomous'], description: 'Supervisionado (preenche e aguarda revisão) ou Autônomo (preenche e salva automaticamente)' },
        absentStudents: { type: 'array', items: { type: 'string' }, description: 'Lista de nomes de alunos ausentes/faltas na chamada' },
        evaluationName: { type: 'string', description: 'Nome da avaliação para lançamento de notas (ex: Prova 1, Simulado)' }
      },
      required: ['platform', 'title']
    }
  },
  {
    name: 'fill_school_portal',
    description: 'Preenche campos em portal escolar (Machado, Plural, Santa Catarina, Cambridge One, Teams).',
    input_schema: {
      type: 'object',
      properties: {
        platform:    { type: 'string', enum: ['machado', 'santacatarina', 'plural', 'cambridge', 'teams'] },
        title:       { type: 'string', description: 'Título da aula ou diário' },
        date:        { type: 'string' },
        classRef:    { type: 'string' },
        description: { type: 'string' }
      },
      required: ['platform', 'title']
    }
  },
  {
    name: 'open_school_portal',
    description: 'Abre portal escolar em nova aba.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string' }
      },
      required: ['platform']
    }
  },

  // 8. GERADOR DE PROVAS ELT
  {
    name: 'generate_exam_content',
    description: 'Gera prova de inglês com taxonomia ELT completa (Grammar, Vocabulary, Reading, Listening, Use of English, Writing, Speaking).',
    input_schema: {
      type: 'object',
      properties: {
        topic:         { type: 'string', description: 'Tópico ou assunto' },
        eltCategory:   { type: 'string', enum: ['Grammar', 'Vocabulary', 'Reading Comprehension', 'Listening Comprehension', 'Use of English', 'Writing', 'Speaking'] },
        eltSubcategory:{ type: 'string', description: 'Subcategoria específica, ex: Conditionals' },
        classRef:      { type: 'string' },
        questionCount: { type: 'number', default: 10 },
        level:         { type: 'string', enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
        type:          { type: 'string', enum: ['múltipla escolha', 'dissertativa', 'verdadeiro/falso', 'mista'] }
      },
      required: ['topic']
    }
  },

  {
    name: 'create_full_lesson',
    description: 'Cria uma aula completa no modelo Cambridge TKT com Plano de Aula, Tabela de Roteiro Timed, CCQs/ICQs e Guia Pedagógico de Regência.',
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Tópico ou conteúdo central da aula' },
        grade: { type: 'string', description: 'Ano ou série' },
        cefr: { type: 'string', description: 'Nível CEFR (A1, A2, B1, B2, C1, C2)' },
        duration: { type: 'string', description: 'Duração da aula, ex: 50 minutos' },
        methodologies: { type: 'array', items: { type: 'string' }, description: 'Metodologias em box, ex: PPP, TBLT, Flipped Classroom, Gamificação' }
      },
      required: ['topic']
    }
  },

  // 9. RESPOSTA FALADA (TTS)
  {
    name: 'speak_response',
    description: 'Faz a Rafinha falar uma resposta em voz alta.',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text']
    }
  },

  // 10. MÉTRICAS PEDAGÓGICAS DE ALUNO
  {
    name: 'update_student_metric',
    description: 'Atualiza nota radar (0-10) de métrica pedagógica de aluno.',
    input_schema: {
      type: 'object',
      properties: {
        studentName: { type: 'string' },
        metricKey:   { type: 'string', enum: ['academic', 'progression', 'regularity', 'engagement', 'oral', 'writing', 'vocabulary', 'grammar', 'autonomy', 'behavior'] },
        score:       { type: 'number' }
      },
      required: ['studentName', 'metricKey', 'score']
    }
  },

  // 11. MEMÓRIA VIVA DE ALUNOS
  {
    name: 'record_student_observation',
    description: 'Registra observação viva sobre aluno (dificuldades, virtudes, padrões de erro).',
    input_schema: {
      type: 'object',
      properties: {
        studentName:  { type: 'string' },
        note:         { type: 'string' },
        category:     { type: 'string', enum: ['Grammar', 'Vocabulary', 'Reading Comprehension', 'Listening Comprehension', 'Use of English', 'Writing', 'Speaking', 'Comportamento', 'Assiduidade'] },
        subcategory:  { type: 'string' }
      },
      required: ['studentName', 'note']
    }
  },

  // 12. GESTÃO DE TURMAS
  {
    name: 'create_class',
    description: 'Cria uma nova turma no aplicativo (ex: "9A", "Nono B", "Terceirão").',
    input_schema: {
      type: 'object',
      properties: {
        name:   { type: 'string', description: 'Nome da turma' },
        school: { type: 'string', description: 'Nome da escola' },
        year:   { type: 'string', description: 'Ano letivo' },
        shift:  { type: 'string', enum: ['Manhã', 'Tarde', 'Noite', 'Integral'] }
      },
      required: ['name']
    }
  },

  // 13. CADASTRO DE ALUNO [NOVO]
  {
    name: 'create_student',
    description: 'Cadastra um novo aluno no aplicativo e associa à sua turma.',
    input_schema: {
      type: 'object',
      properties: {
        name:     { type: 'string', description: 'Nome completo do aluno' },
        classRef: { type: 'string', description: 'Turma do aluno, ex: 9A, Nono B' },
        email:    { type: 'string', description: 'Email do aluno (opcional)' }
      },
      required: ['name', 'classRef']
    }
  },

  // 14. CONSULTA À BIBLIOTECA RAG [NOVO]
  {
    name: 'query_library',
    description: 'Pesquisa nos livros didáticos, apostilas e documentos da biblioteca escolar para obter textos, diálogos, regras gramaticais ou listas de vocabulário autênticos.',
    input_schema: {
      type: 'object',
      properties: {
        query:    { type: 'string', description: 'Termo de busca, tópico de aula ou conceito gramatical' },
        textbook: { type: 'string', description: 'Nome do livro didático (opcional)' },
        type:     { type: 'string', description: 'Tipo do livro (Student\'s Book, Workbook, CLIL, etc)' }
      },
      required: ['query']
    }
  },

  // 15. BUSCA EM TEMPO REAL NA INTERNET [NOVO]
  {
    name: 'search_web',
    description: 'Pesquisa na internet por informações em tempo real, notícias, curiosidades, diretrizes da BNCC, fatos atualizados ou qualquer assunto que não esteja presente nos livros da biblioteca.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Pergunta ou termo de pesquisa na internet' }
      },
      required: ['query']
    }
  },

  // 16. GRAVAÇÃO DE MEMÓRIA DE LONGO PRAZO [NOVO]
  {
    name: 'remember_fact',
    description: 'Grava um fato, preferência do professor, hábito ou regra pedagógica importante na memória de longo prazo para aprendizado contínuo.',
    input_schema: {
      type: 'object',
      properties: {
        fact:     { type: 'string', description: 'O fato ou regra a ser gravado na memória de longo prazo' },
        category: { type: 'string', enum: ['teacher_preference', 'class_insight', 'pedagogical_rule', 'student_fact', 'school_context'] }
      },
      required: ['fact']
    }
  },

  // 14. BANCO DE QUESTÕES ELT (QBANK) [NOVO]
  {
    name: 'add_qbank_question',
    description: 'Adiciona uma questão ao Banco de Questões ELT (QBank).',
    input_schema: {
      type: 'object',
      properties: {
        questionText:   { type: 'string', description: 'Enunciado da questão em inglês' },
        eltCategory:    { type: 'string', enum: ['Grammar', 'Vocabulary', 'Reading Comprehension', 'Listening Comprehension', 'Use of English', 'Writing', 'Speaking'] },
        eltSubcategory: { type: 'string' },
        level:          { type: 'string', enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
        options:        { type: 'array', items: { type: 'string' } },
        answer:         { type: 'string' }
      },
      required: ['questionText', 'eltCategory']
    }
  },

  // 15. MAPA MENTAL (MINDMAP) [NOVO]
  {
    name: 'create_mindmap',
    description: 'Gera um mapa mental visual sobre um tópico de inglês no módulo MindMap.',
    input_schema: {
      type: 'object',
      properties: {
        topic:    { type: 'string', description: 'Tópico principal' },
        branches: { type: 'array', items: { type: 'string' }, description: 'Ramos ou tópicos secundários' }
      },
      required: ['topic']
    }
  },

  // 16. EDITOR DE DOCUMENTOS & PROVAS [NOVO]
  {
    name: 'create_document',
    description: 'Cria e abre um novo documento ou prova no Editor de Texto com cabeçalho opcional.',
    input_schema: {
      type: 'object',
      properties: {
        title:   { type: 'string', description: 'Título do documento' },
        content: { type: 'string', description: 'Conteúdo inicial em HTML/Text' },
        school:  { type: 'string', description: 'Escola para cabeçalho' }
      },
      required: ['title']
    }
  },
  {
    name: 'apply_school_header',
    description: 'Aplica o cabeçalho oficial de uma escola (Machado Sobrinho, Santa Catarina) ao documento no Editor.',
    input_schema: {
      type: 'object',
      properties: {
        schoolName: { type: 'string', description: 'Nome da escola' }
      },
      required: ['schoolName']
    }
  },

  // 17. RUBRICAS DE AVALIAÇÃO [NOVO]
  {
    name: 'create_rubric',
    description: 'Cria uma rubrica pedagógica de avaliação (Writing, Speaking, Projeto) com critérios.',
    input_schema: {
      type: 'object',
      properties: {
        title:    { type: 'string', description: 'Título da rubrica' },
        skill:    { type: 'string', enum: ['Writing', 'Speaking', 'Project', 'General'] },
        criteria: { type: 'array', items: { type: 'string' }, description: 'Lista de critérios' }
      },
      required: ['title']
    }
  },

  // 18. PORTFÓLIO DE ALUNO [NOVO]
  {
    name: 'add_portfolio_item',
    description: 'Adiciona um projeto ou trabalho ao Portfólio do aluno.',
    input_schema: {
      type: 'object',
      properties: {
        studentName: { type: 'string', description: 'Nome do aluno' },
        title:       { type: 'string', description: 'Título do trabalho' },
        description: { type: 'string', description: 'Descrição' },
        category:    { type: 'string' }
      },
      required: ['studentName', 'title']
    }
  },

  // 19. REPOSITÓRIO DE MATERIAIS [NOVO]
  {
    name: 'save_repo_material',
    description: 'Salva um recurso didático ou arquivo no Repositório de Recursos do professor.',
    input_schema: {
      type: 'object',
      properties: {
        title:    { type: 'string', description: 'Título do material' },
        type:     { type: 'string', enum: ['PDF', 'Link', 'Vídeo', 'Áudio', 'Atividade', 'Jogo'] },
        category: { type: 'string' },
        url:      { type: 'string' }
      },
      required: ['title', 'type']
    }
  },

  // 20. QUESTÕES RÁPIDAS (QUICK WARM-UP) [NOVO]
  {
    name: 'generate_quick_questions',
    description: 'Gera 5 questões rápidas (Quick Questions) para aquecimento de aula (Warm-up) ou Exit Ticket.',
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Tópico da aula' },
        level: { type: 'string', description: 'Nível CEFR' }
      },
      required: ['topic']
    }
  }
]

// Converte tools para formato Gemini function_declarations
export function toGeminiTools(tools: ToolDefinition[]) {
  return [{
    function_declarations: tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema
    }))
  }]
}

// Nomes amigáveis das tools para exibição no UI
export const TOOL_DISPLAY_NAMES: Record<string, { label: string; icon: string; color: string }> = {
  navigate_to_module:         { label: 'Navegando',            icon: 'ti-arrow-right',       color: '#268bd2' },
  add_todo:                   { label: 'Adicionando tarefa',    icon: 'ti-checkbox',          color: '#859900' },
  create_calendar_task:       { label: 'Criando evento',       icon: 'ti-calendar-plus',      color: '#b58900' },
  create_lesson_plan:         { label: 'Criando plano',        icon: 'ti-notebook',           color: '#2aa198' },
  create_communication:       { label: 'Redigindo bilhete',    icon: 'ti-message',            color: '#6c71c4' },
  add_student_grade:          { label: 'Lançando nota',        icon: 'ti-report-analytics',   color: '#2aa198' },
  execute_portal_action:      { label: 'Operando no Portal',   icon: 'ti-wand',               color: '#8b5e3c' },
  fill_school_portal:         { label: 'Preenchendo portal',   icon: 'ti-plug-connected',     color: '#cb4b16' },
  open_school_portal:         { label: 'Abrindo portal',       icon: 'ti-external-link',      color: '#268bd2' },
  generate_exam_content:      { label: 'Gerando prova',        icon: 'ti-file-certificate',   color: '#d33682' },
  speak_response:             { label: 'Falando',              icon: 'ti-volume',             color: '#586e75' },
  update_student_metric:      { label: 'Métrica de aluno',     icon: 'ti-chart-radar',        color: '#859900' },
  record_student_observation: { label: 'Registrando memória',  icon: 'ti-brain',              color: '#b58900' },
  create_class:               { label: 'Criando turma',        icon: 'ti-school',             color: '#268bd2' },
  create_student:             { label: 'Cadastrando aluno',    icon: 'ti-user-plus',          color: '#2aa198' },
  add_qbank_question:         { label: 'Salvando no QBank',    icon: 'ti-database-plus',      color: '#d33682' },
  create_mindmap:             { label: 'Mapa Mental',          icon: 'ti-sitemap',            color: '#6c71c4' },
  create_document:            { label: 'Abrindo no Editor',    icon: 'ti-file-text',          color: '#268bd2' },
  apply_school_header:        { label: 'Aplicando cabeçalho',  icon: 'ti-template',           color: '#cb4b16' },
  create_rubric:              { label: 'Criando rubrica',      icon: 'ti-table-alias',        color: '#859900' },
  add_portfolio_item:         { label: 'Portfólio de Aluno',   icon: 'ti-folder-plus',        color: '#b58900' },
  save_repo_material:         { label: 'Salvando no Repositório', icon: 'ti-archive',         color: '#2aa198' },
  generate_quick_questions:   { label: 'Questões Rápidas',     icon: 'ti-bolt',               color: '#d33682' },
}

