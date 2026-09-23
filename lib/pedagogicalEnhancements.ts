/**
 * lib/pedagogicalEnhancements.ts — Motor de Inovações Pedagógicas de Alto Valor
 *
 * Implementa:
 * 1. Andaimes UDL em 3 Níveis (Tiered Scaffolding — Universal Design for Learning)
 * 2. Gerador de CCQs e ICQs (Concept & Instruction Checking Questions)
 * 3. Rotinas de Pensamento Visível de Harvard (Project Zero)
 * 4. Estimador de TTT vs. STT (Teacher Talking Time vs. Student Talking Time)
 * 5. Descritores "Eu Consigo..." (Student-Facing Can-Do Descriptors)
 * 6. Planejamento Integrado CLIL (Content and Language Integrated Learning)
 * 7. Adaptações para Neurodiversidade e PEI (Plano de Ensino Individualizado)
 */

// ─── 1. ANDAIMES UDL EM 3 NÍVEIS (TIERED SCAFFOLDING) ─────────────────────────

export interface ScaffoldingTiers {
  tier1Support: string    // Apoio alto: sentence starters, bancos de vocabulário, modelos guiados
  tier2Standard: string   // Padrão: instruções regulares da turma
  tier3Extension: string  // Extensão/Desafio: perguntas abertas, metacognição, restrições criativas
}

export function generateScaffoldingTiers(topic: string, stageName: string, studentAction: string): ScaffoldingTiers {
  const tLower = (topic || '').toLowerCase()
  const isGrammar = /present perfect|past|verb|conditional|tense|gramática/i.test(tLower)
  const isWriting = /writing|redação|essay|parágrafo|texto/i.test(studentAction) || /writing|produção escrita/i.test(stageName)
  const isSpeaking = /speaking|oral|apresentação|debate|entrevista|mingle/i.test(studentAction) || /oral|speaking/i.test(stageName)

  let tier1 = ''
  let tier2 = studentAction || 'Execução da atividade proposta em duplas ou individualmente.'
  let tier3 = ''

  if (isSpeaking) {
    tier1 = 'Apoio Alto (Scaffold): Cartão com prompts prontos ("Have you ever...?", "Yes, I have / No, I haven\'t") + banco visual de 4 verbos no particípio.'
    tier3 = 'Desafio/Extensão: Proibido responder apenas "Yes/No"; deve obrigatoriamente fazer uma pergunta de follow-up ("When was that?", "Who were you with?") e justificar.'
  } else if (isWriting) {
    tier1 = 'Apoio Alto (Scaffold): Parágrafo com lacunas (fill-in-the-blanks) e conectivos de apoio ("First...", "Then...", "Because...").'
    tier3 = 'Desafio/Extensão: Redigir parágrafo estendido utilizando pelo menos 2 advérbios de frequência e 1 oração contrastiva ("Although...").'
  } else if (isGrammar) {
    tier1 = 'Apoio Alto (Scaffold): Tabela visual com regras de formação (Sujeito + have/has + particípio) e lista de verbos regulares/irregulares aberta para consulta.'
    tier3 = 'Desafio/Extensão: Formular 2 frases verdadeiras e 1 mentira sobre sua vida usando a estrutura para desafiar o colega (Two Truths and a Lie).'
  } else {
    tier1 = 'Apoio Alto (Scaffold): Modelo resolvido de exemplo projetado na lousa + lista de vocabulário-chave com tradução/ícone de apoio.'
    tier3 = 'Desafio/Extensão: Criar uma variação inédita da tarefa para propor a outra dupla e atuar como mediador de feedback.'
  }

  return {
    tier1Support: tier1,
    tier2Standard: tier2,
    tier3Extension: tier3
  }
}

// ─── 2. GERADOR DE CCQs E ICQs (CONCEPT & INSTRUCTION CHECKING QUESTIONS) ─────

export interface ConceptCheckQuestion {
  question: string
  expectedAnswer: string
  targetConcept: string
}

export interface InstructionCheckQuestion {
  question: string
  expectedAnswer: string
}

export interface CheckingQuestions {
  ccqs: ConceptCheckQuestion[]
  icqs: InstructionCheckQuestion[]
}

export function generateCheckingQuestions(topic: string, stageName?: string): CheckingQuestions {
  const tLower = (topic || '').toLowerCase()
  const ccqs: ConceptCheckQuestion[] = []
  const icqs: InstructionCheckQuestion[] = []

  // ICQs universais de gestão de sala
  icqs.push(
    { question: 'Vocês vão trabalhar sozinhos, em duplas ou em grupos?', expectedAnswer: 'Em duplas.' },
    { question: 'Quantos minutos vocês têm para completar a tarefa?', expectedAnswer: '8 minutos.' },
    { question: 'Vocês devem apenas falar ou também registrar por escrito?', expectedAnswer: 'Ambos: conversar e anotar as respostas.' }
  )

  // CCQs por temática linguística
  if (/present perfect|life experience|have you ever/i.test(tLower)) {
    ccqs.push(
      { question: 'A ação de viajar aconteceu em algum momento da vida da pessoa? (Is it about past experience?)', expectedAnswer: 'Sim.', targetConcept: 'Experiência prévia de vida' },
      { question: 'O interlocutor disse o dia ou ano exato em que a ação aconteceu? (Did they state a specific time?)', expectedAnswer: 'Não.', targetConcept: 'Tempo não especificado / indefinido' },
      { question: 'Podemos usar "yesterday" com o Present Perfect nessa frase? (Can we say "I have been to London yesterday"?)', expectedAnswer: 'Não, se houver tempo específico usamos Simple Past.', targetConcept: 'Contraste com Simple Past' }
    )
  } else if (/simple past|past continuous|passado|yesterday/i.test(tLower)) {
    ccqs.push(
      { question: 'A ação já terminou ou ainda está acontecendo? (Is the action finished?)', expectedAnswer: 'Já terminou completamente.', targetConcept: 'Ação concluída no passado' },
      { question: 'Sabemos quando a ação aconteceu? (Do we know when it happened?)', expectedAnswer: 'Sim, há uma data/momento delimitado no passado.', targetConcept: 'Delimitação temporal' }
    )
  } else if (/conditional|if |se /i.test(tLower)) {
    ccqs.push(
      { question: 'Esta situação é real ou uma hipótese/imaginação? (Is it real or hypothetical?)', expectedAnswer: 'É uma hipótese / imaginação.', targetConcept: 'Irrealis / Condição hipotética' },
      { question: 'Essa condição já aconteceu? (Has it happened yet?)', expectedAnswer: 'Não, depende da condição se realizar.', targetConcept: 'Dependência condicional' }
    )
  } else {
    ccqs.push(
      { question: 'O que essa palavra/estrutura significa nesse contexto específico?', expectedAnswer: 'Significa expressar a ação central do tema.', targetConcept: 'Significado contextual' },
      { question: 'Podemos usar essa frase em uma situação formal ou informal?', expectedAnswer: 'Adequada ao registro trabalhado na aula.', targetConcept: 'Registro sociolinguístico' }
    )
  }

  return { ccqs, icqs }
}

// ─── 3. ROTINAS DE PENSAMENTO VISÍVEL DE HARVARD (PROJECT ZERO) ───────────────

export interface HarvardThinkingRoutine {
  id: string
  name: string
  phase: 'hook' | 'explore' | 'explain' | 'evaluate'
  steps: string[]
  pedagogicalPurpose: string
  suggestedPrompt: string
}

export const HARVARD_THINKING_ROUTINES: HarvardThinkingRoutine[] = [
  {
    id: 'see_think_wonder',
    name: 'See - Think - Wonder (Ver - Pensar - Perguntar)',
    phase: 'hook',
    steps: ['O que você VÊ? (Observação factual)', 'O que você PENSA sobre isso? (Interpretação)', 'O que isso faz você PERGUNTAR? (Curiosidade investigativa)'],
    pedagogicalPurpose: 'Ativação inicial a partir de estímulo visual ou textual autêntico, estimulando observação minuciosa e formulação de hipóteses.',
    suggestedPrompt: 'Mostre a imagem/vídeo e peça aos alunos que preencham 3 colunas: 1. O que veem, 2. O que pensam, 3. O que querem saber.'
  },
  {
    id: 'think_pair_share',
    name: 'Think - Pair - Share (Pensar - Compartilhar em Duplas - Socializar)',
    phase: 'explore',
    steps: ['Pense individualmente por 1 min', 'Converse e compare com sua dupla por 3 min', 'Compartilhe um achado conjunto com o grande grupo'],
    pedagogicalPurpose: 'Garante que 100% dos alunos formulem uma resposta antes de falar em público, reduzindo a ansiedade linguística.',
    suggestedPrompt: 'Lance a pergunta investigativa. Dê 1 minuto de silêncio para pensar, 3 minutos para afinar em duplas e chame 3 duplas para socializar.'
  },
  {
    id: 'claim_support_question',
    name: 'Claim - Support - Question (Afirmação - Evidência - Pergunta)',
    phase: 'explain',
    steps: ['Faça uma Afirmação (Claim)', 'Apoie com uma Evidência do texto/dados (Support)', 'Formule uma Pergunta desafiadora (Question)'],
    pedagogicalPurpose: 'Desenvolvimento do raciocínio argumentativo e checagem de evidências no texto autêntico.',
    suggestedPrompt: 'Peça aos alunos para defenderem uma tese sobre a temática da aula indicando qual parte do texto ou áudio comprova sua ideia.'
  },
  {
    id: '3_2_1_bridge',
    name: '3 - 2 - 1 Bridge (Ponte de Conhecimento)',
    phase: 'evaluate',
    steps: ['3 Ideias novas aprendidas hoje', '2 Perguntas que ainda ficaram na mente', '1 Metáfora ou Conexão com o mundo real'],
    pedagogicalPurpose: 'Metacognição e fechamento formativo, construindo a ponte entre o que o aluno sabia antes e o que consolidou agora.',
    suggestedPrompt: 'Nos 5 minutos finais, os alunos registram seu 3-2-1 Bridge no caderno ou post-it de saída (Exit Ticket).'
  },
  {
    id: 'compass_points',
    name: 'Compass Points (Pontos Cardeais: N, S, E, W)',
    phase: 'explore',
    steps: [
      'E (East/Leste) = Excitement: O que te empolga nessa ideia?',
      'W (West/Oeste) = Worrisome: O que te preocupa ou parece difícil?',
      'N (North/Norte) = Need to know: O que mais você precisa saber?',
      'S (South/Sul) = Stance/Suggestion: Qual é a sua postura ou sugestão?'
    ],
    pedagogicalPurpose: 'Exploração multidimensional de temas controversos ou projetos complexos.',
    suggestedPrompt: 'Divida a lousa nos 4 pontos cardeais e convide os grupos a colarem post-its com seus pensamentos sobre o tema.'
  }
]

export function suggestThinkingRoutine(frameworkId: string, stageIndex: number): HarvardThinkingRoutine {
  if (stageIndex === 0) {
    return HARVARD_THINKING_ROUTINES.find(r => r.id === 'see_think_wonder')!
  }
  if (stageIndex === 1) {
    return HARVARD_THINKING_ROUTINES.find(r => r.id === 'think_pair_share')!
  }
  if (frameworkId === '5e_inquiry' && stageIndex === 2) {
    return HARVARD_THINKING_ROUTINES.find(r => r.id === 'claim_support_question')!
  }
  return HARVARD_THINKING_ROUTINES.find(r => r.id === '3_2_1_bridge')!
}

// ─── 4. ESTIMADOR DE TTT VS. STT (TEACHER TALKING TIME VS. STUDENT TALKING TIME) ─

export interface TalkTimeAnalysis {
  teacherPercent: number
  studentPercent: number
  balanceStatus: 'ideal' | 'balanced' | 'teacher_heavy' | 'student_heavy'
  statusLabel: string
  pedagogicalAdvice: string
  isWarning: boolean
}

export function calculateTalkTimeRatio(stages: Array<{
  name: string
  durationMin: number
  teacherAction: string
  studentAction: string
}>): TalkTimeAnalysis {
  if (!stages || stages.length === 0) {
    return {
      teacherPercent: 40,
      studentPercent: 60,
      balanceStatus: 'ideal',
      statusLabel: 'Equilíbrio Ideal',
      pedagogicalAdvice: 'Insira as etapas da aula para calcular a estimativa de tempo de fala.',
      isWarning: false
    }
  }

  let totalTeacherScore = 0
  let totalStudentScore = 0

  const teacherKeywords = /explica|apresenta|expõe|corrige|demonstra|leciona|fala|conduz|orienta|instrui|leitura pelo professor/i
  const studentKeywords = /em duplas|em grupos|mingle|produzem|debatem|conversam|apresentam|escrevem|criam|pesquisam|praticam|role-play/i

  stages.forEach(stg => {
    const dur = stg.durationMin || 10
    const tText = stg.teacherAction || ''
    const sText = stg.studentAction || ''

    // Análise de peso por estágio
    let tWeight = 0.5
    let sWeight = 0.5

    if (/warm-up|lead-in|hook|engage/i.test(stg.name)) {
      tWeight = 0.45
      sWeight = 0.55
    } else if (/presentation|explain|formalização/i.test(stg.name)) {
      tWeight = 0.65
      sWeight = 0.35
    } else if (/controlled practice|practice|task|explore/i.test(stg.name)) {
      tWeight = 0.25
      sWeight = 0.75
    } else if (/free production|report|elaborate|evaluate/i.test(stg.name)) {
      tWeight = 0.15
      sWeight = 0.85
    }

    // Ajuste fino por palavras-chave
    if (teacherKeywords.test(tText)) tWeight += 0.05
    if (studentKeywords.test(sText)) sWeight += 0.05

    // Normalização por duração
    const sum = tWeight + sWeight
    totalTeacherScore += (tWeight / sum) * dur
    totalStudentScore += (sWeight / sum) * dur
  })

  const totalScore = totalTeacherScore + totalStudentScore || 1
  const teacherPercent = Math.round((totalTeacherScore / totalScore) * 100)
  const studentPercent = 100 - teacherPercent

  let balanceStatus: 'ideal' | 'balanced' | 'teacher_heavy' | 'student_heavy' = 'balanced'
  let statusLabel = 'Equilibrado (30-40% Prof. / 60-70% Alunos)'
  let pedagogicalAdvice = 'Excelente proporção! Os alunos têm tempo adequado de fala e prática autônoma.'
  let isWarning = false

  if (teacherPercent > 55) {
    balanceStatus = 'teacher_heavy'
    statusLabel = '⚠️ Alto Tempo de Fala do Professor (TTT > 55%)'
    pedagogicalAdvice = 'Atenção pedagógica: Reduza a fala expositiva na etapa de prática. Substitua explicações longas por checagens de conceito (CCQs) e aumente a interação em duplas (Pair Work).'
    isWarning = true
  } else if (studentPercent >= 65 && studentPercent <= 80) {
    balanceStatus = 'ideal'
    statusLabel = '✨ Padrão Internacional Comunicativo (STT ≥ 65%)'
    pedagogicalAdvice = 'Parabéns! A aula é altamente comunicativa e centrada no estudante, alinhada aos padrões Cambridge/CELTA.'
    isWarning = false
  } else if (studentPercent > 80) {
    balanceStatus = 'student_heavy'
    statusLabel = 'Foco em Autonomia Máxima (STT > 80%)'
    pedagogicalAdvice = 'Certifique-se de prever momentos pontuais de instrução e feedback corretivo para não deixar lacunas conceituais abertas.'
    isWarning = false
  }

  return {
    teacherPercent,
    studentPercent,
    balanceStatus,
    statusLabel,
    pedagogicalAdvice,
    isWarning
  }
}

// ─── 5. DESCRITORES "EU CONSIGO..." (STUDENT-FACING CAN-DO DESCRIPTORS) ────────

export function generateStudentCanDoStatements(topic: string, cefrLevel = 'A2', bnccCodes: string[] = []): string[] {
  const tLower = (topic || '').toLowerCase()
  const statements: string[] = []

  if (/present perfect|experience|have you ever/i.test(tLower)) {
    statements.push(
      'Eu consigo perguntar para 3 colegas sobre experiências marcantes da vida deles usando "Have you ever...?"',
      'Eu consigo responder se já fiz ou não uma atividade no passado sem precisar dizer a data exata.',
      'Eu consigo reconhecer e usar o particípio de pelo menos 5 verbos comuns em inglês.'
    )
  } else if (/past|yesterday|viagem|narrat/i.test(tLower)) {
    statements.push(
      'Eu consigo contar 3 coisas que fiz nas minhas últimas férias usando o passado em inglês.',
      'Eu consigo fazer perguntas para um amigo sobre o que ele fez no final de semana passado.',
      'Eu consigo identificar a diferença entre verbos regulares (-ed) e irregulares em um texto de viagem.'
    )
  } else if (/conditional|dreams|se /i.test(tLower)) {
    statements.push(
      'Eu consigo falar sobre sonhos e situações hipotéticas usando "If I had... I would...".',
      'Eu consigo entender e debater ideias imaginárias propostas pelos meus colegas.'
    )
  } else {
    statements.push(
      `Eu consigo explicar as ideias centrais sobre "${topic}" em inglês com minhas próprias palavras.`,
      'Eu consigo colaborar com minha dupla para resolver o desafio comunicativo proposto na aula.',
      'Eu consigo autoavaliar se atingi o objetivo da aula e identificar o que preciso praticar mais.'
    )
  }

  if (cefrLevel === 'A1') {
    statements.push('Eu consigo usar frases curtas e palavras conhecidas para me apresentar e falar da minha rotina.')
  } else if (cefrLevel === 'B1' || cefrLevel === 'B2') {
    statements.push('Eu consigo expressar e defender minha opinião pessoal sobre o tema da aula com justificativas claras.')
  }

  return statements
}

// ─── 6. PLANEJAMENTO INTEGRADO CLIL (CONTENT AND LANGUAGE INTEGRATED LEARNING) ─

export interface ClilSubjectOption {
  id: string
  name: string
  icon: string
  sampleTopics: string[]
}

export const CLIL_SUBJECTS: ClilSubjectOption[] = [
  {
    id: 'science',
    name: 'Ciências da Natureza / Science',
    icon: 'ti-microscope',
    sampleTopics: ['Cadeia Alimentar & Ecossistemas', 'Ciclo da Água & Mudanças Climáticas', 'Corpo Humano & Sistema Imunológico']
  },
  {
    id: 'geography',
    name: 'Geografia / Geography',
    icon: 'ti-world',
    sampleTopics: ['Biomas Globais & Desmatamento', 'Migrações & Diversidade Cultural', 'Recursos Renováveis & Sustentabilidade']
  },
  {
    id: 'history',
    name: 'História / History',
    icon: 'ti-clock-hour-4',
    sampleTopics: ['Grandes Navegações & Encontros Culturais', 'Revolução Industrial & Trabalho', 'Direitos Humanos & Cidadania']
  },
  {
    id: 'arts',
    name: 'Artes / Arts',
    icon: 'ti-palette',
    sampleTopics: ['Movimentos Artísticos & Expressão Visual', 'Fotografia & Crítica Social', 'Música e Identidade']
  }
]

export function buildClilDualObjectives(topic: string, clilSubjectId: string, clilContentTopic: string): {
  languageObjective: string
  contentObjective: string
  promptDirective: string
} {
  const subj = CLIL_SUBJECTS.find(s => s.id === clilSubjectId) || CLIL_SUBJECTS[0]
  const langObj = `Desenvolver precisão e fluência comunicativa em inglês ao articular vocabulário e estruturas em torno de "${topic}".`
  const contObj = `Compreender, investigar e aplicar conceitos centrais de ${subj.name} referentes a "${clilContentTopic || 'tópico interdisciplinar'}".`

  const promptDirective = `
[CONFIGURAÇÃO CLIL — ABORDAGEM BILÍNGUE INTEGRADA (CONTENT & LANGUAGE)]:
- Disciplina Integrada: ${subj.name}
- Conteúdo Específico: "${clilContentTopic || topic}"
- Objetivo Linguístico (Language Goal): ${langObj}
- Objetivo de Conteúdo (Content Goal): ${contObj}
- DIRETIVA PEDAGÓGICA CLIL: Conduza a aula integrando as 4 dimensões de Coyle (Content, Communication, Cognition, Culture). O idioma inglês deve funcionar como veículo autêntico de aprendizagem do conteúdo acadêmico, e não apenas como fim em si mesmo.
`

  return {
    languageObjective: langObj,
    contentObjective: contObj,
    promptDirective
  }
}

// ─── 7. ADAPTAÇÕES PARA NEURODIVERSIDADE E PEI ─────────────────────────────────

export interface InclusionProfile {
  id: string
  name: string
  shortDesc: string
  accommodations: string[]
}

export const INCLUSION_PROFILES: InclusionProfile[] = [
  {
    id: 'adhd',
    name: 'TDAH (Transtorno do Déficit de Atenção e Hiperatividade)',
    shortDesc: 'Apoio executivo, foco atencional e regulação motora',
    accommodations: [
      'Segmentar instruções longas em no máximo 2 passos por vez (Chunking).',
      'Disponibilizar temporizador visual de contagem regressiva na tela.',
      'Permitir pausas ativas de movimento de 30 segundos entre transições de etapas.',
      'Fornecer folha de atividades com menos elementos visuais concorrentes por página.'
    ]
  },
  {
    id: 'dyslexia',
    name: 'Dislexia e Transtornos Específicos de Leitura',
    shortDesc: 'Acessibilidade de texto, decodificação e processamento fonológico',
    accommodations: [
      'Utilizar fontes sem serifa com espaçamento entre linhas de 1.5 e suporte a cores de alto contraste.',
      'Garantir leitura oral prévia dos enunciados pelo professor ou colega de dupla.',
      'Permitir respostas orais ou ilustradas como alternativa à produção textual extensa.',
      'Não penalizar erros pontuais de ortografia em etapas focadas em fluência e criatividade.'
    ]
  },
  {
    id: 'autism',
    name: 'TEA (Transtorno do Espectro Autista)',
    shortDesc: 'Previsibilidade de rotina, conforto sensorial e clareza literal',
    accommodations: [
      'Apresentar a agenda visual da aula na lousa antes de iniciar (Schedule antecipado).',
      'Avisar com 2 minutos de antecedência sobre transições e mudanças de dinâmica.',
      'Oferecer opção de trabalho em duplas familiares ou individual em caso de sobrecarga sensorial.',
      'Utilizar linguagem literal e direta, evitando sarcasmos ou metáforas sem explicação explícita.'
    ]
  },
  {
    id: 'gifted',
    name: 'Altas Habilidades / Superdotação',
    shortDesc: 'Aprofundamento cognitivo, complexidade e autonomia investigativa',
    accommodations: [
      'Disponibilizar desafios de extensão abertos com criação de produtos autênticos.',
      'Incentivar a formulação de hipóteses e conexões interdisciplinares com outros campos do conhecimento.',
      'Permitir papel de consultor ou mediador em discussões em grupo sem sobrecarregar o aluno.'
    ]
  }
]

export function getInclusionAccommodations(profileIds: string[]): string[] {
  if (!profileIds || profileIds.length === 0) return []
  const accs: string[] = []
  profileIds.forEach(id => {
    const p = INCLUSION_PROFILES.find(item => item.id === id)
    if (p) {
      accs.push(...p.accommodations)
    }
  })
  return Array.from(new Set(accs))
}
