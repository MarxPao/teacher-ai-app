/**
 * lib/bnccDissector.ts — Dissecador Pedagógico Estrutural da BNCC
 *
 * Disseca habilidades BNCC em seus 3 elementos curriculares canônicos:
 * 1. Processo Cognitivo (Verbo de Ação classificado na Taxonomia de Bloom)
 * 2. Objeto de Conhecimento (Conteúdo, conceito ou temática)
 * 3. Modificador / Contexto (Condição, instrumento ou circunstância de aprendizagem)
 */

export type BloomLevel = 'Lembrar' | 'Compreender' | 'Aplicar' | 'Analisar' | 'Avaliar' | 'Criar'

export interface BloomInfo {
  level: BloomLevel
  color: string
  bg: string
  description: string
}

export const BLOOM_LEVELS: Record<BloomLevel, BloomInfo> = {
  Lembrar: {
    level: 'Lembrar',
    color: '#2563eb',
    bg: '#eff6ff',
    description: 'Recuperar, reconhecer e memorizar informações e fatos.'
  },
  Compreender: {
    level: 'Compreender',
    color: '#059669',
    bg: '#ecfdf5',
    description: 'Interpretar, exemplificar, classificar e explicar significados.'
  },
  Aplicar: {
    level: 'Aplicar',
    color: '#d97706',
    bg: '#fffbeb',
    description: 'Executar, implementar e usar conhecimentos em situações práticas.'
  },
  Analisar: {
    level: 'Analisar',
    color: '#7c3aed',
    bg: '#f5f3ff',
    description: 'Decompor informações, diferenciar partes e correlacionar causas.'
  },
  Avaliar: {
    level: 'Avaliar',
    color: '#dc2626',
    bg: '#fef2f2',
    description: 'Julgar, criticar, justificar e defender pontos de vista com critérios.'
  },
  Criar: {
    level: 'Criar',
    color: '#c026d3',
    bg: '#fdf4ff',
    description: 'Conceber, planejar, produzir e formular novas ideias ou projetos.'
  }
}

// Dicionário de verbos frequentes da BNCC para níveis de Bloom
const VERB_BLOOM_MAP: Record<string, BloomLevel> = {
  // Lembrar
  'identificar': 'Lembrar',
  'localizar': 'Lembrar',
  'reconhecer': 'Lembrar',
  'nomear': 'Lembrar',
  'listar': 'Lembrar',
  'apontar': 'Lembrar',
  'relatar': 'Lembrar',
  'memorizar': 'Lembrar',
  'citar': 'Lembrar',
  'observar': 'Lembrar',

  // Compreender
  'comparar': 'Compreender',
  'descrever': 'Compreender',
  'explicar': 'Compreender',
  'interpretar': 'Compreender',
  'resumir': 'Compreender',
  'associar': 'Compreender',
  'distinguir': 'Compreender',
  'relacionar': 'Compreender',
  'classificar': 'Compreender',
  'inferir': 'Compreender',
  'exemplificar': 'Compreender',
  'compreender': 'Compreender',
  'ordenar': 'Compreender',
  'ler': 'Compreender',
  'entender': 'Compreender',

  // Aplicar
  'utilizar': 'Aplicar',
  'usar': 'Aplicar',
  'empregar': 'Aplicar',
  'calcular': 'Aplicar',
  'resolver': 'Aplicar',
  'construir': 'Aplicar',
  'demonstrar': 'Aplicar',
  'executar': 'Aplicar',
  'operar': 'Aplicar',
  'praticar': 'Aplicar',
  'manipular': 'Aplicar',
  'produzir': 'Aplicar',
  'escrever': 'Aplicar',
  'fazer': 'Aplicar',
  'interagir': 'Aplicar',
  'apropriar-se': 'Aplicar',
  'aplicar': 'Aplicar',
  'organizar': 'Aplicar',
  'apresentar': 'Aplicar',

  // Analisar
  'analisar': 'Analisar',
  'diferenciar': 'Analisar',
  'categorizar': 'Analisar',
  'investigar': 'Analisar',
  'examinar': 'Analisar',
  'decompor': 'Analisar',
  'contrastar': 'Analisar',
  'discernir': 'Analisar',
  'selecionar': 'Analisar',
  'correlacionar': 'Analisar',
  'testar': 'Analisar',
  'verificar': 'Analisar',

  // Avaliar
  'avaliar': 'Avaliar',
  'julgar': 'Avaliar',
  'criticar': 'Avaliar',
  'defender': 'Avaliar',
  'justificar': 'Avaliar',
  'validar': 'Avaliar',
  'argumentar': 'Avaliar',
  'posicionar-se': 'Avaliar',
  'apreciar': 'Avaliar',
  'debater': 'Avaliar',

  // Criar
  'criar': 'Criar',
  'planejar': 'Criar',
  'elaborar': 'Criar',
  'conceber': 'Criar',
  'compor': 'Criar',
  'formular': 'Criar',
  'projetar': 'Criar',
  'desenhar': 'Criar',
  'propor': 'Criar',
  'inventar': 'Criar',
  'desenvolver': 'Criar',
  'revisar': 'Criar',
  'editar': 'Criar'
}

export interface DissectedSkill {
  code: string
  actionVerbs: string[]
  bloomLevel: BloomLevel
  bloomInfo: BloomInfo
  knowledgeObject: string
  contextModifier: string
  classroomSuggestion: string
}

/**
 * Disseca pedagogicamente o texto da habilidade BNCC
 */
export function dissectBnccSkill(code: string, description: string, subjectName?: string): DissectedSkill {
  const cleanDesc = description.trim()

  // 1. Extração de verbos de ação iniciais (ex: "Comparar, ordenar, ler e escrever...")
  const initialSegment = cleanDesc.split(/[,;\n]/)[0] || ''
  const words = cleanDesc.split(/\s+/).slice(0, 8)

  const foundVerbs: string[] = []
  let detectedBloom: BloomLevel = 'Compreender'

  for (const word of words) {
    const cleanWord = word.toLowerCase().replace(/[^\w\s-]/g, '').trim()
    if (VERB_BLOOM_MAP[cleanWord]) {
      foundVerbs.push(cleanWord)
      if (foundVerbs.length === 1) {
        detectedBloom = VERB_BLOOM_MAP[cleanWord]
      }
    }
  }

  // Se não achou verbo nos primeiros tokens, busca no texto completo
  if (foundVerbs.length === 0) {
    for (const [verb, level] of Object.entries(VERB_BLOOM_MAP)) {
      const regex = new RegExp(`\\b${verb}\\b`, 'i')
      if (regex.test(cleanDesc)) {
        foundVerbs.push(verb)
        detectedBloom = level
        break
      }
    }
  }

  if (foundVerbs.length === 0) {
    foundVerbs.push('analisar')
    detectedBloom = 'Analisar'
  }

  // 2. Extração heurística do Modificador / Contexto (iniciado por conectivos circunstanciais)
  // ex: "fazendo uso de...", "por meio de...", "com apoio de...", "a partir de...", "em situações de..."
  const modifierRegex = /\b(fazendo uso d[eao]s?|por meio d[eao]s?|com o uso d[eao]s?|com base em|a partir d[eao]s?|em diferentes|em situações d[eao]s?|utilizando|por intermédio d[eao]s?|com e sem uso d[eao]s?|de modo a|com o auxílio d[eao]s?|sob orientação d[eao]s?)\b([\s\S]+)$/i
  const modifierMatch = cleanDesc.match(modifierRegex)

  let contextModifier = ''
  let knowledgeObject = ''

  if (modifierMatch && modifierMatch.index !== undefined) {
    contextModifier = modifierMatch[0].trim()
    // Objeto de conhecimento é o miolo entre os verbos e o modificador
    const beforeModifier = cleanDesc.slice(0, modifierMatch.index).trim()
    // Remove os verbos de ação iniciais
    knowledgeObject = beforeModifier.replace(/^[A-ZÀ-Úa-zà-ú\s,e/]+?\b(que|de|sobre|para|em|os|as|o|a|um|uma)\b/i, '$1').trim()
    if (!knowledgeObject || knowledgeObject === beforeModifier) {
      knowledgeObject = beforeModifier
    }
  } else {
    // Sem modificador claro: divide em duas partes
    const parts = cleanDesc.split(/,\s*(?=reconhecendo|destacando|considerando|identificando|garantindo)/i)
    if (parts.length > 1) {
      knowledgeObject = parts[0].trim()
      contextModifier = parts.slice(1).join(', ').trim()
    } else {
      knowledgeObject = cleanDesc
      contextModifier = 'Contexto autônomo e colaborativo em sala de aula.'
    }
  }

  // 3. Sugestão didática prática para o professor
  const classroomSuggestion = generateClassroomSuggestion(code, foundVerbs[0] || 'trabalhar', detectedBloom, subjectName)

  return {
    code,
    actionVerbs: foundVerbs,
    bloomLevel: detectedBloom,
    bloomInfo: BLOOM_LEVELS[detectedBloom],
    knowledgeObject,
    contextModifier,
    classroomSuggestion
  }
}

function generateClassroomSuggestion(
  code: string,
  verb: string,
  bloom: BloomLevel,
  subjectName?: string
): string {
  const subj = subjectName ? `em ${subjectName}` : 'neste tema'
  switch (bloom) {
    case 'Lembrar':
      return `Organize uma atividade de ativação de repertório ou flashcards diagnósticos para que os alunos possam ${verb} os conceitos essenciais ${subj}.`
    case 'Compreender':
      return `Proponha uma leitura mediada com mapa conceitual ou quadro comparativo, incentivando os alunos a ${verb} com suas próprias palavras.`
    case 'Aplicar':
      return `Desenvolva uma oficina prática ou estudo de caso real no qual os estudantes precisem ${verb} em duplas ou grupos colaborativos.`
    case 'Analisar':
      return `Estimule uma rotação por estações ou debate orientado para ${verb} evidências, causas e efeitos ${subj}.`
    case 'Avaliar':
      return `Promova um júri simulado, seminário ou produção de resenha crítica onde os alunos devam ${verb} com argumentos fundamentados.`
    case 'Criar':
      return `Proponha um projeto integrador ou produto final (podcast, mural, campanha ou maquete) para os alunos ${verb} soluções inovadoras.`
  }
}
