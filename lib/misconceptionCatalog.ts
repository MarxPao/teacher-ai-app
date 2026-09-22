/**
 * lib/misconceptionCatalog.ts — Catálogo Pedagógico Curado de Concepções Alternativas (Misconceptions)
 * 
 * Base Teórica:
 * - Sadler, P. M., et al. (2013). "The influence of teachers' knowledge on student learning."
 *   American Educational Research Journal, 50(5), 1020-1049.
 * - Hestenes, D., Wells, M., & Swackhamer, G. (1992). "Force Concept Inventory." The Physics Teacher, 30(3).
 * - Smith, J. P., diSessa, A. A., & Roschelle, J. (1994). "Misconceptions reconceived: A constructivist
 *   analysis of knowledge in transition." Journal of the Learning Sciences, 3(2), 115-163.
 * 
 * Princípio Metodológico:
 * Cada alternativa incorreta em uma questão de múltipla escolha DEVE ser ancorada em uma
 * concepção alternativa (bug conceitual) documentada e diagnosticável. Distratores aleatórios
 * não informam a proficiência e violam a validade diagnóstica do item.
 */

export interface MisconceptionEntry {
  id: string
  code: string
  subject: 'portuguese' | 'english' | 'math' | 'science'
  topic: string
  bnccSkill?: string
  name: string
  description: string
  cognitiveFlaw: string // O mecanismo mental do erro
  distractorExamples: string[]
  matchKeywords: string[]
  matchRegex?: RegExp
  remediationAdvice: string
}

export const MISCONCEPTION_CATALOG: MisconceptionEntry[] = [
  // ─── LÍNGUA PORTUGUESA ──────────────────────────────────────────────────────
  {
    id: 'MIS_PT_ONDE_TEMPORAL',
    code: 'LP-MIS-01',
    subject: 'portuguese',
    topic: 'Pronomes Relativos',
    bnccSkill: 'EF09LP04',
    name: 'Espacialização de Tempo/Conceito Abstrato ("Onde" Temporal)',
    description: 'Emprego do pronome relativo "onde" para referenciar épocas, eventos, reuniões ou conceitos abstratos.',
    cognitiveFlaw: 'O aluno hipergeneraliza "onde" como pronome coringa para qualquer circunstância ou contexto situacional, ignorando que sua regência é estritamente espacial física.',
    distractorExamples: [
      'Foi uma reunião onde todos concordaram',
      'Na época onde não havia internet',
      'Um momento onde todos refletiram',
      'No caso onde houver dúvida'
    ],
    matchKeywords: ['onde todos', 'época onde', 'reunião onde', 'momento onde', 'caso onde', 'onde houver'],
    matchRegex: /\b(reunião|época|momento|caso|situação|filme|livro|fase|ano|século|dia)\s+onde\b/i,
    remediationAdvice: 'Lembre que "onde" só pode ser utilizado para indicar lugar físico com limites espaciais. Para tempo, use "em que" ou "quando"; para situações abstratas, use "em que" ou "na qual".'
  },
  {
    id: 'MIS_PT_ONDE_AONDE_MOTION',
    code: 'LP-MIS-02',
    subject: 'portuguese',
    topic: 'Pronomes Relativos',
    bnccSkill: 'EF09LP04',
    name: 'Confusão Estático vs Movimento ("Onde" vs "Aonde")',
    description: 'Uso de "aonde" com verbos estáticos ou "onde" com verbos que exigem preposição de movimento.',
    cognitiveFlaw: 'Desconhece a fusão da preposição "a" (vetor de movimento em direção a um destino) com o pronome "onde".',
    distractorExamples: [
      'Aonde você mora?',
      'Aonde você está?',
      'Onde você vai amanhã?'
    ],
    matchKeywords: ['aonde você mora', 'aonde você está', 'onde você vai'],
    matchRegex: /\b(aonde\s+(você\s+)?(mora|está|fica)|onde\s+(você\s+)?(vai|foi|irá))\b/i,
    remediationAdvice: 'Com verbos que expressam permanência/estado (morar, estar, ficar), usa-se "onde". Com verbos que exigem preposição "a" indicando destino/movimento (ir, chegar, dirigir-se), usa-se "aonde".'
  },
  {
    id: 'MIS_PT_REGENCIA_ASSISTIR',
    code: 'LP-MIS-03',
    subject: 'portuguese',
    topic: 'Regência Verbal',
    bnccSkill: 'EF09LP05',
    name: 'Omissão de Preposição em "Assistir" (Ver/Presenciar)',
    description: 'Tratar o verbo "assistir" no sentido de presenciar/ver como transitivo direto, sem preposição "a".',
    cognitiveFlaw: 'Influência do registro oral coloquial que apaga a preposição regida pelo verbo ("assisti o jogo").',
    distractorExamples: [
      'Assisti o filme ontem',
      'Assistimos a peça no teatro',
      'Eles assistiram o jogo da final'
    ],
    matchKeywords: ['assistir o filme', 'assisti o', 'assistiu o', 'assistiram o'],
    matchRegex: /\b(assisti|assistiu|assistimos|assistiram)\s+o\s+[a-z]+/i,
    remediationAdvice: 'O verbo "assistir" com sentido de ver/presenciar é transitivo indireto e exige a preposição "a" (assistir ao filme, assistir à peça). Com sentido de ajudar, é transitivo direto (o médico assiste o paciente).'
  },
  {
    id: 'MIS_PT_CRASE_VERBO',
    code: 'LP-MIS-04',
    subject: 'portuguese',
    topic: 'Crase',
    bnccSkill: 'EF09LP06',
    name: 'Crase Antes de Verbos no Infinitivo',
    description: 'Inserção indevida de acento grave indicativo de crase antes de verbos.',
    cognitiveFlaw: 'Confunde a preposição "a" obrigatória em locuções temporais/modais com a contração com artigo feminino, ignorando que verbos não admitem artigo.',
    distractorExamples: [
      'Estava à esperar uma resposta',
      'Começou à chorar',
      'A partir de hoje'
    ],
    matchKeywords: ['à esperar', 'à chorar', 'à partir', 'à fazer', 'à dizer'],
    matchRegex: /\bà\s+(esperar|chorar|partir|fazer|dizer|sair|ver|estudar)\b/i,
    remediationAdvice: 'Nunca ocorre crase antes de verbo no infinitivo, pois verbos não admitem artigo feminino "a" para haver fusão.'
  },

  // ─── LÍNGUA INGLESA ─────────────────────────────────────────────────────────
  {
    id: 'MIS_EN_FALSE_COGNATE_ACTUALLY',
    code: 'EN-MIS-01',
    subject: 'english',
    topic: 'Falsos Cognatos',
    bnccSkill: 'EF08LI05',
    name: 'Falso Cognato: "Actually" interpretado como "Atualmente"',
    description: 'Atribuição do significado de "atualmente" / "nos dias de hoje" ao advérbio "actually" (na verdade/realmente).',
    cognitiveFlaw: 'Interferência morfológica direta da língua materna (L1) presumindo identidade semântica por semelhança ortográfica.',
    distractorExamples: [
      'Actually I live in Brazil (significando atualmente)',
      'She is actually studying for tests',
      'Translate actually as atualmente'
    ],
    matchKeywords: ['actually', 'atualmente', 'nos dias de hoje', 'currently'],
    matchRegex: /\bactually\b.*(atualmente|nos dias de hoje|no momento)/i,
    remediationAdvice: '"Actually" significa "na verdade" ou "realmente". Para expressar "atualmente", o termo correto é "currently" ou "nowadays".'
  },
  {
    id: 'MIS_EN_FALSE_COGNATE_PRETEND',
    code: 'EN-MIS-02',
    subject: 'english',
    topic: 'Falsos Cognatos',
    bnccSkill: 'EF08LI05',
    name: 'Falso Cognato: "Pretend" interpretado como "Pretender"',
    description: 'Interpretar "pretend" (fingir / fazer de conta) como "pretender / ter intenção de".',
    cognitiveFlaw: 'Atração fonético-ortográfica de L1 sem verificação lexical.',
    distractorExamples: [
      'I pretend to buy a car next year',
      'She pretends to go to college',
      'Pretend significa pretender'
    ],
    matchKeywords: ['pretend', 'pretender', 'intenção de', 'intend'],
    matchRegex: /\bpretend\b.*(pretender|intenção|planejar)/i,
    remediationAdvice: '"Pretend" significa "fingir". Quando a intenção for expressar "pretender / planejar", o verbo correto em inglês é "intend" ou "plan".'
  },
  {
    id: 'MIS_EN_PRESENT_PERFECT_POINT_TIME',
    code: 'EN-MIS-03',
    subject: 'english',
    topic: 'Present Perfect vs Simple Past',
    bnccSkill: 'EF09LI15',
    name: 'Present Perfect com Marcador Pontual de Passado',
    description: 'Uso indevido do Present Perfect acompanhado de advérbios de tempo definido e finalizado (yesterday, last night, in 2010).',
    cognitiveFlaw: 'Foco apenas na ação pretérita sem considerar a restrição aspectual do Present Perfect (tempo indeterminado ou com conexão presente).',
    distractorExamples: [
      'I have visited Paris yesterday',
      'She has seen him last night',
      'They have arrived in 2018'
    ],
    matchKeywords: ['have visited yesterday', 'has seen last', 'have arrived in 20', 'have gone yesterday'],
    matchRegex: /\b(have|has)\s+[a-z]+ed?\s+(yesterday|last\s+(night|week|month|year)|in\s+19\d\d|in\s+20\d\d)\b/i,
    remediationAdvice: 'O Present Perfect não pode ser usado com datas ou advérbios de tempo finalizado no passado. Com "yesterday", "last year" ou anos específicos, use estritamente o Simple Past (ex: "I visited Paris yesterday").'
  },
  {
    id: 'MIS_EN_REGULAR_ED_ON_IRREGULAR',
    code: 'EN-MIS-04',
    subject: 'english',
    topic: 'Past Tense Irregular Verbs',
    bnccSkill: 'EF07LI15',
    name: 'Superregularização de Verbos Irregulares (Adição de -ed)',
    description: 'Criação de formas verbais inexistentes aplicando a regra geral regular "-ed" a raízes irregulares (goed, seed, buyed).',
    cognitiveFlaw: 'Aplicação mecânica de regra morfológica sem recuperação da forma irregular armazenada na memória léxica.',
    distractorExamples: [
      'She goed to school',
      'He seed the movie',
      'I buyed a book'
    ],
    matchKeywords: ['goed', 'seed', 'buyed', 'writed', 'eated', 'taked'],
    matchRegex: /\b(goed|seed|buyed|writed|eated|taked|bringed|cought)\b/i,
    remediationAdvice: 'Verbos irregulares possuem formas próprias no passado que não seguem o sufixo "-ed". O passado de go é "went", de see é "saw", de buy é "bought".'
  },

  // ─── MATEMÁTICA ─────────────────────────────────────────────────────────────
  {
    id: 'MIS_MATH_FRACTION_ADD_DENOM',
    code: 'MATH-MIS-01',
    subject: 'math',
    topic: 'Operações com Frações',
    bnccSkill: 'EF06MA09',
    name: 'Soma Direta de Denominadores em Frações',
    description: 'Somar numeradores entre si e denominadores entre si na adição de frações com denominadores distintos.',
    cognitiveFlaw: 'Transposição linear errônea da adição de números naturais para o domínio dos números racionais (a/b + c/d = (a+c)/(b+d)).',
    distractorExamples: [
      '1/2 + 1/3 = 2/5',
      '2/3 + 3/4 = 5/7',
      '1/4 + 2/3 = 3/7'
    ],
    matchKeywords: ['2/5', '5/7', '3/7', 'soma dos denominadores'],
    matchRegex: /\b(2\/5|5\/7|3\/7|4\/9)\b/,
    remediationAdvice: 'Na adição e subtração de frações com denominadores diferentes, nunca some os denominadores. É indispensável encontrar o Mínimo Múltiplo Comum (MMC) para igualar as partes antes de somar os numeradores.'
  },
  {
    id: 'MIS_MATH_SIGN_DISTRIBUTION',
    code: 'MATH-MIS-02',
    subject: 'math',
    topic: 'Álgebra e Equações',
    bnccSkill: 'EF08MA06',
    name: 'Falha na Distribuição do Sinal Negativo em Parênteses',
    description: 'Manter o sinal do segundo termo inalterado ao eliminar parênteses precedidos de sinal negativo: -(x - 3) = -x - 3.',
    cognitiveFlaw: 'Atenção visual limitada ao primeiro termo imediatamente após o sinal de menos, ignorando a propriedade distributiva da multiplicação por -1.',
    distractorExamples: [
      '-(x - 3) = -x - 3',
      '5 - (2x - 4) = 5 - 2x - 4',
      '2x - (x + 7) = 2x - x + 7'
    ],
    matchKeywords: ['-x - 3', '- 2x - 4', '- x + 7'],
    matchRegex: /-\s*\(\s*[a-z0-9]+\s*[\+\-]\s*[a-z0-9]+\s*\)\s*=\s*-\s*[a-z0-9]+\s*[\-]\s*[a-z0-9]+/i,
    remediationAdvice: 'O sinal negativo antes de parênteses atua como multiplicação por -1 sobre todos os termos internos, invertendo o sinal de cada um: -(a - b) = -a + b.'
  }
]

// Cache de memoização LRU/Map para validações recorrentes de distratores
const MISCONCEPTION_MATCH_CACHE = new Map<string, MisconceptionEntry | null>()
const MAX_MISCONCEPTION_CACHE_SIZE = 1000

// Pre-normaliza exemplos do catálogo para evitar regex e replace contínuos em loops
const NORMALIZED_CATALOG_EXAMPLES = new Map<string, string[]>()
MISCONCEPTION_CATALOG.forEach(m => {
  const cleaned = m.distractorExamples.map(ex =>
    ex.toLowerCase().replace(/[^a-z0-9\s]/gi, '').trim()
  )
  NORMALIZED_CATALOG_EXAMPLES.set(m.id, cleaned)
})

/**
 * Busca e valida se um distrator (alternativa incorreta) corresponde a uma misconception catalogada.
 * Utiliza cache de memoização para lookup O(1) em passadas subsequentes.
 */
export function matchDistractorToCatalog(
  optionText: string,
  subject?: string,
  topic?: string
): MisconceptionEntry | null {
  const cleanOption = (optionText || '').trim().toLowerCase()
  if (!cleanOption) return null

  const cacheKey = `${subject || 'all'}:${cleanOption}`
  if (MISCONCEPTION_MATCH_CACHE.has(cacheKey)) {
    return MISCONCEPTION_MATCH_CACHE.get(cacheKey)!
  }

  // Filtra por disciplina se fornecida
  const candidates = subject
    ? MISCONCEPTION_CATALOG.filter(m => m.subject === subject.toLowerCase() || subject.toLowerCase().includes(m.subject))
    : MISCONCEPTION_CATALOG

  let result: MisconceptionEntry | null = null

  for (const mis of candidates) {
    // 1. Verificação por Regex específico se existir
    if (mis.matchRegex && mis.matchRegex.test(cleanOption)) {
      result = mis
      break
    }

    // 2. Verificação por palavras-chave diagnósticas
    const matchedKey = mis.matchKeywords.some(kw => cleanOption.includes(kw.toLowerCase()))
    if (matchedKey) {
      result = mis
      break
    }

    // 3. Verificação por exemplos pré-normalizados do catálogo
    const preCleaned = NORMALIZED_CATALOG_EXAMPLES.get(mis.id) || []
    const matchedEx = preCleaned.some(cleanEx => {
      return cleanOption.includes(cleanEx) || cleanEx.includes(cleanOption)
    })
    if (matchedEx) {
      result = mis
      break
    }
  }

  if (MISCONCEPTION_MATCH_CACHE.size >= MAX_MISCONCEPTION_CACHE_SIZE) {
    MISCONCEPTION_MATCH_CACHE.clear()
  }
  MISCONCEPTION_MATCH_CACHE.set(cacheKey, result)

  return result
}
