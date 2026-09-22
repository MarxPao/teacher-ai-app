/**
 * bnccInference.ts — Motor Determinístico de Inferência de Habilidades BNCC
 * 
 * Regras e Garantias Arquiteturais:
 * 1. Determinístico: Busca por palavras-chave, lematização básica e thesaurus pedagógico ELT.
 * 2. Sem dependência de embeddings ou vetores externos (100% local, síncrono e instantâneo).
 * 3. Detecção honesta: Tópicos não correlacionados retornam [] (sem matching forçado/alucinado).
 * 4. Respeito à série/ano escolar: Prioriza habilidades da série informada.
 */

import { BnccSkill, getBnccSkillsForGrade, getStoredBnccSkills } from './bnccData'

export interface BnccInferenceMatch {
  skill: BnccSkill
  score: number
  matchedTerms: string[]
  confidence: 'high' | 'medium' | 'low'
}

/** Normaliza string removendo acentos e pontuação para matching determinístico */
export function normalizeText(text: string): string {
  if (!text) return ''
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normaliza o identificador de série escolar para o padrão do bnccData (ex: "8º ano" -> "8º Fund.") */
export function normalizeGradeYear(grade: string): string {
  if (!grade) return ''
  const g = grade.toLowerCase().trim()
  if (g.includes('6')) return '6º Fund.'
  if (g.includes('7')) return '7º Fund.'
  if (g.includes('8')) return '8º Fund.'
  if (g.includes('9')) return '9º Fund.'
  if (g.includes('1') && (g.includes('medio') || g.includes('médio') || g.includes('em'))) return '1º Médio'
  if (g.includes('2') && (g.includes('medio') || g.includes('médio') || g.includes('em'))) return '2º Médio'
  if (g.includes('3') && (g.includes('medio') || g.includes('médio') || g.includes('em'))) return '3º Médio'
  return grade
}

/** Stopwords que não agregam valor semântico pedagógico */
const STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'por', 'para', 'com', 'sem', 'sob', 'sobre', 'que', 'um', 'uma', 'uns', 'umas', 'se',
  'ou', 'e', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'and', 'or', 'is', 'are',
  'was', 'were', 'aula', 'plano', 'lesson', 'plan', 'student', 'students', 'teacher', 'ano',
  'ensino', 'fundamental', 'turma', 'modulo', 'unidade', 'unit', 'chapter', 'conteudo', 'topico'
])

interface ConceptThesaurus {
  category: string
  keywords: string[]
  gradeSkills: Record<string, string[]>
  genericSkills?: string[]
}

/** Thesaurus pedagógico especializado em ELT (English Language Teaching) alinhado à BNCC */
const ELT_THESAURUS: ConceptThesaurus[] = [
  {
    category: 'Present Perfect & Past Experiences',
    keywords: [
      'present perfect', 'have you ever', 'has ever', 'since', 'for', 'already', 'yet',
      'just', 'never', 'ever', 'experiencias passadas', 'experiencias presentes',
      'past experiences', 'acoes no passado e presente', 'vida pregressa'
    ],
    gradeSkills: {
      '8º Fund.': ['EF08LI19'],
      '9º Fund.': ['EF09LI15']
    }
  },
  {
    category: 'Simple Past & Narratives',
    keywords: [
      'simple past', 'past simple', 'passado simples', 'verbos no passado', 'regular verbs',
      'irregular verbs', 'did', 'didn', 'narrar fatos passados', 'biografia', 'biography',
      'memorias', 'historias passadas', 'acoes passadas'
    ],
    gradeSkills: {
      '7º Fund.': ['EF07LI15'],
      '8º Fund.': ['EF08LI19']
    }
  },
  {
    category: 'Simple Present, Habits & Daily Routine',
    keywords: [
      'simple present', 'present simple', 'presente simples', 'rotina', 'daily routine',
      'habits', 'hobbies', 'gostos', 'preferencias', 'third person', 'do does',
      'frequency adverbs', 'adverbios de frequencia', 'rotina diaria'
    ],
    gradeSkills: {
      '6º Fund.': ['EF06LI19', 'EF06LI15']
    }
  },
  {
    category: 'Future Forms & Predictions',
    keywords: [
      'future', 'futuro', 'will', 'going to', 'present continuous for future',
      'planos', 'previsoes', 'expectativas', 'plans', 'predictions', 'decisoes futuras'
    ],
    gradeSkills: {
      '8º Fund.': ['EF08LI14', 'EF08LI18']
    }
  },
  {
    category: 'Conditionals & Hypotheses',
    keywords: [
      'conditional', 'conditionals', 'condicionais', 'first conditional', 'second conditional',
      'zero conditional', 'third conditional', 'if clause', 'hipoteses', 'consequencias'
    ],
    gradeSkills: {
      '9º Fund.': ['EF09LI16']
    }
  },
  {
    category: 'Quantifiers, Comparatives & Superlatives',
    keywords: [
      'quantifiers', 'quantificadores', 'much', 'many', 'a lot of', 'few', 'little',
      'comparative', 'superlative', 'comparativos', 'superlativos', 'graus dos adjetivos',
      'as as', 'more than'
    ],
    gradeSkills: {
      '8º Fund.': ['EF08LI16']
    }
  },
  {
    category: 'Connectors & Linkers',
    keywords: [
      'connectors', 'linkers', 'conectivos', 'conectores', 'however', 'although',
      'therefore', 'furthermore', 'discourse markers', 'coesao textual'
    ],
    gradeSkills: {
      '9º Fund.': ['EF09LI14']
    }
  },
  {
    category: 'Relative Pronouns',
    keywords: [
      'relative pronouns', 'pronomes relativos', 'who', 'which', 'that', 'whose', 'where'
    ],
    gradeSkills: {
      '8º Fund.': ['EF08LI17']
    }
  },
  {
    category: 'Reading Strategies & Critical Literacy',
    keywords: [
      'reading', 'leitura', 'skimming', 'scanning', 'compreensao leitora', 'texto argumentativo',
      'artigo', 'noticia', 'perspectivas', 'tese', 'fake news', 'jornalistico'
    ],
    gradeSkills: {
      '6º Fund.': ['EF06LI07'],
      '7º Fund.': ['EF07LI06'],
      '8º Fund.': ['EF08LI05', 'EF08LI08'],
      '9º Fund.': ['EF09LI08'],
      '1º Médio': ['EM13LGG101'],
      '2º Médio': ['EM13LGG401']
    }
  },
  {
    category: 'Speaking, Debate & Oral Presentations',
    keywords: [
      'speaking', 'oralidade', 'debate', 'discussao', 'argumentacao oral', 'intercambio oral',
      'expor pontos de vista', 'tomada de notas', 'apresentacao oral'
    ],
    gradeSkills: {
      '6º Fund.': ['EF06LI01', 'EF06LI02'],
      '7º Fund.': ['EF07LI01'],
      '8º Fund.': ['EF08LI01'],
      '9º Fund.': ['EF09LI01', 'EF09LI03']
    }
  },
  {
    category: 'Writing & Text Production',
    keywords: [
      'writing', 'escrita', 'producao textual', 'produzir textos', 'redacao', 'planejar escrita',
      'quadrinhos', 'cartazes', 'posts', 'chats'
    ],
    gradeSkills: {
      '6º Fund.': ['EF06LI15'],
      '7º Fund.': ['EF07LI12'],
      '2º Médio': ['EM13LGG401']
    }
  },
  {
    category: 'Intercultural Dimension & Global English',
    keywords: [
      'cultura', 'culture', 'intercultural', 'lingua franca', 'global language',
      'variacao linguistica', 'sociedade brasileira', 'ingles no mundo'
    ],
    gradeSkills: {
      '6º Fund.': ['EF06LI25'],
      '7º Fund.': ['EF07LI23'],
      '9º Fund.': ['EF09LI19'],
      '3º Médio': ['EM13LGG604']
    }
  },
  {
    category: 'Imperative & Classroom Instructions',
    keywords: [
      'imperative', 'imperativo', 'instrucoes', 'commands', 'classroom language', 'diretrizes', 'regras', 'instructions'
    ],
    gradeSkills: {
      '6º Fund.': ['EF06LI18'],
      '7º Fund.': ['EF07LI13']
    }
  },
  {
    category: 'Present Continuous & Actions in Progress',
    keywords: [
      'present continuous', 'present progressive', 'presente continuo', 'acoes em progresso', 'acoes em andamento', 'now', 'at the moment'
    ],
    gradeSkills: {
      '6º Fund.': ['EF06LI20']
    }
  },
  {
    category: 'Past Continuous & Narrative Time Sequences',
    keywords: [
      'past continuous', 'past progressive', 'passado continuo', 'while', 'when', 'sequencia temporal', 'causalidade'
    ],
    gradeSkills: {
      '7º Fund.': ['EF07LI18']
    }
  },
  {
    category: 'Modal Verbs & Abilities / Permissions / Obligations',
    keywords: [
      'modal verbs', 'modais', 'can', 'could', 'should', 'must', 'may', 'might', 'habilidades e permissoes', 'obrigacao', 'conselho', 'advice', 'possibility'
    ],
    gradeSkills: {
      '6º Fund.': ['EF06LI23'],
      '8º Fund.': ['EF08LI15'],
      '9º Fund.': ['EF09LI13']
    }
  },
  {
    category: 'Genitive Case & Possession',
    keywords: [
      'genitive case', 'caso genitivo', 'apostrofo s', 'possession', 'posse', 'family members', 'pertences'
    ],
    gradeSkills: {
      '6º Fund.': ['EF06LI21']
    }
  },
  {
    category: 'Pronouns (Subject, Object, Possessive)',
    keywords: [
      'pronouns', 'pronomes', 'subject pronouns', 'object pronouns', 'possessive adjectives', 'demonstrative pronouns', 'pronomes retos', 'pronomes obliquos'
    ],
    gradeSkills: {
      '6º Fund.': ['EF06LI22'],
      '7º Fund.': ['EF07LI19']
    }
  },
  {
    category: 'Passive Voice & Formal Registers',
    keywords: [
      'passive voice', 'voz passiva', 'voz ativa e passiva', 'fatos historicos', 'noticias formais'
    ],
    gradeSkills: {
      '9º Fund.': ['EF09LI17']
    }
  },
  {
    category: 'Word Formation (Prefixes & Suffixes)',
    keywords: [
      'word formation', 'formacao de palavras', 'prefixes', 'suffixes', 'prefixos', 'sufixos', 'derivacao'
    ],
    gradeSkills: {
      '8º Fund.': ['EF08LI13'],
      '9º Fund.': ['EF09LI11']
    }
  },
  {
    category: 'Digital Genres, Social Media & Multimodal Texts',
    keywords: [
      'redes sociais', 'social media', 'memes', 'posts', 'chats', 'vlogs', 'podcasts', 'generos digitais', 'multimodal', 'fake news', 'checagem de fatos'
    ],
    gradeSkills: {
      '7º Fund.': ['EF07LI11'],
      '8º Fund.': ['EF08LI11'],
      '9º Fund.': ['EF09LI12']
    }
  }
]

/** Pontuação mínima de corte para evitar falsos positivos forçados */
const MIN_CONFIDENCE_THRESHOLD = 4

/**
 * Infere habilidades BNCC adequadas para um determinado tópico e série escolar.
 * 
 * @param topic Tema ou conteúdo da aula (ex: "Present Perfect", "Daily Routine", "Future with will")
 * @param grade Série escolar (ex: "8º ano", "8º Fund.", "9º Fund.")
 * @param maxSuggestions Limite máximo de sugestões retornadas (padrão: 3)
 * @returns Array de BnccSkill ordenadas por relevância e confiança.
 */
export function inferBnccSkillsForTopic(
  topic: string,
  grade: string,
  maxSuggestions = 3
): BnccSkill[] {
  if (!topic || !topic.trim()) return []

  const cleanTopic = normalizeText(topic)
  if (!cleanTopic) return []

  const normalizedGrade = normalizeGradeYear(grade)
  
  // 1. Obter base de habilidades da série (ou geral se série não definida)
  let candidateSkills = normalizedGrade ? getBnccSkillsForGrade(normalizedGrade) : []
  if (candidateSkills.length === 0) {
    candidateSkills = getBnccSkillsForGrade(grade)
  }
  if (candidateSkills.length === 0) {
    candidateSkills = getStoredBnccSkills()
  }

  // 2. Extrair tokens significativos do tópico (palavras >= 3 letras sem stopwords)
  const topicTokens = cleanTopic
    .split(' ')
    .filter(t => t.length >= 3 && !STOPWORDS.has(t))

  const scores = new Map<string, { skill: BnccSkill; score: number; terms: string[] }>()

  candidateSkills.forEach(skill => {
    scores.set(skill.code, { skill, score: 0, terms: [] })
  })

  // 3. Matching Exato de Código BNCC citado no tópico (ex: "Trabalhar EF08LI19")
  candidateSkills.forEach(skill => {
    const codeClean = skill.code.toLowerCase()
    if (cleanTopic.includes(codeClean)) {
      const entry = scores.get(skill.code)!
      entry.score += 100
      entry.terms.push(skill.code)
    }
  })

  // 4. Thesaurus Semântico ELT
  ELT_THESAURUS.forEach(concept => {
    const matchedKeyword = concept.keywords.find(kw => {
      const kwClean = normalizeText(kw)
      // Checa se frase inteira da keyword está no tópico
      return cleanTopic.includes(kwClean)
    })

    if (matchedKeyword) {
      // Verifica se há habilidades preferenciais para a série atual
      const preferredCodes = (normalizedGrade && concept.gradeSkills[normalizedGrade]) || []
      preferredCodes.forEach(code => {
        const entry = scores.get(code)
        if (entry) {
          entry.score += 20
          entry.terms.push(matchedKeyword)
        }
      })

      // Se não houver correspondência exata para a série, pontua habilidades de outras séries com menor peso
      if (preferredCodes.length === 0) {
        Object.entries(concept.gradeSkills).forEach(([gYear, codes]) => {
          codes.forEach(code => {
            const entry = scores.get(code)
            if (entry) {
              entry.score += 8
              entry.terms.push(`${matchedKeyword} (${gYear})`)
            }
          })
        })
      }
    }
  })

  // 5. Matching Lexical com a Descrição, Unidade e Eixo da Habilidade
  candidateSkills.forEach(skill => {
    const entry = scores.get(skill.code)!
    const unitClean = normalizeText(skill.unit || '')
    const descClean = normalizeText(skill.description)
    const axisClean = normalizeText(skill.axis)

    // Se a frase inteira do tópico estiver na descrição ou unidade
    if (descClean.includes(cleanTopic)) {
      entry.score += 12
      entry.terms.push('frase exata na descrição')
    } else if (unitClean.includes(cleanTopic)) {
      entry.score += 10
      entry.terms.push('frase exata na unidade')
    }

    // Matching por tokens individuais
    topicTokens.forEach(token => {
      if (unitClean.includes(token)) {
        entry.score += 4
        entry.terms.push(token)
      }
      if (descClean.includes(token)) {
        entry.score += 3
        entry.terms.push(token)
      }
      if (axisClean.includes(token)) {
        entry.score += 1
      }
    })
  })

  // 6. Filtrar pelo limiar de corte para honestidade algorítmica
  const filteredMatches = Array.from(scores.values())
    .filter(item => item.score >= MIN_CONFIDENCE_THRESHOLD)
    .sort((a, b) => b.score - a.score)

  // 7. Retorna top N habilidades
  return filteredMatches.slice(0, maxSuggestions).map(m => m.skill)
}
