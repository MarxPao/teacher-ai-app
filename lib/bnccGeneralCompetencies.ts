/**
 * lib/bnccGeneralCompetencies.ts — Catálogo e Inferência das 10 Competências Gerais da BNCC (MEC)
 *
 * Mapeia as 10 Competências Gerais da Educação Básica para enriquecer os planos de aula
 * com alinhamento formal para diários de classe, reuniões pedagógicas e formação integral.
 */

export interface BnccGeneralCompetency {
  id: number
  code: string
  name: string
  shortTitle: string
  description: string
  keywords: string[]
  icon: string
}

export const BNCC_GENERAL_COMPETENCIES: BnccGeneralCompetency[] = [
  {
    id: 1,
    code: 'CG01',
    name: 'Conhecimento',
    shortTitle: '1. Conhecimento',
    description: 'Valorizar e utilizar os conhecimentos historicamente construídos sobre o mundo físico, social, cultural e digital para entender e explicar a realidade.',
    keywords: ['conhecimento', 'história', 'ciência', 'mundo', 'conceito', 'compreender', 'compreensão'],
    icon: 'ti-book'
  },
  {
    id: 2,
    code: 'CG02',
    name: 'Pensamento Científico, Crítico e Criativo',
    shortTitle: '2. Pensamento Crítico',
    description: 'Exercitar a curiosidade intelectual e recorrer à abordagem própria das ciências, incluindo a investigação, a reflexão, a análise crítica, a imaginação e a criatividade.',
    keywords: ['investigação', 'hipótese', 'crítico', 'criativo', 'análise', 'experimento', '5e', 'inquiry', 'descobrir', 'noticing'],
    icon: 'ti-bulb'
  },
  {
    id: 3,
    code: 'CG03',
    name: 'Repertório Cultural',
    shortTitle: '3. Repertório Cultural',
    description: 'Valorizar e fruir as diversas manifestações artísticas e culturais, das locais às mundiais, e também participar de práticas diversificadas da produção artístico-cultural.',
    keywords: ['cultura', 'arte', 'música', 'literatura', 'cinema', 'tradições', 'identidade', 'diversidade cultural', 'interculturalidade'],
    icon: 'ti-palette'
  },
  {
    id: 4,
    code: 'CG04',
    name: 'Comunicação',
    shortTitle: '4. Comunicação',
    description: 'Utilizar diferentes linguagens – verbal (oral ou visual-motora e escrita), corporal, visual, sonora e digital – para expressar-se e partilhar informações e sentimentos.',
    keywords: ['comunicação', 'oralidade', 'fala', 'escrita', 'leitura', 'diálogo', 'debate', 'apresentação', 'entrevista', 'expressão', 'speaking', 'writing'],
    icon: 'ti-message-circle'
  },
  {
    id: 5,
    code: 'CG05',
    name: 'Cultura Digital',
    shortTitle: '5. Cultura Digital',
    description: 'Compreender, utilizar e criar tecnologias digitais de informação e comunicação de forma crítica, significativa, reflexiva e ética.',
    keywords: ['digital', 'tecnologia', 'internet', 'redes sociais', 'mídia', 'computador', 'online', 'pesquisa web'],
    icon: 'ti-device-laptop'
  },
  {
    id: 6,
    code: 'CG06',
    name: 'Trabalho e Projeto de Vida',
    shortTitle: '6. Projeto de Vida',
    description: 'Valorizar a diversidade de saberes e vivências culturais e apropriar-se de conhecimentos e experiências que lhe possibilitem entender as relações próprias do mundo do trabalho.',
    keywords: ['projeto de vida', 'trabalho', 'profissão', 'carreira', 'futuro', 'metas', 'planejamento', 'autonomia'],
    icon: 'ti-briefcase'
  },
  {
    id: 7,
    code: 'CG07',
    name: 'Argumentação',
    shortTitle: '7. Argumentação',
    description: 'Argumentar com base em fatos, dados e informações confiáveis, para formular, negociar e defender ideias, pontos de vista e decisões comuns.',
    keywords: ['argumentação', 'debate', 'defender', 'ponto de vista', 'opinião', 'persuasão', 'contra-argumento', 'evidência'],
    icon: 'ti-scale'
  },
  {
    id: 8,
    code: 'CG08',
    name: 'Autoconhecimento e Autocuidado',
    shortTitle: '8. Autoconhecimento',
    description: 'Conhecer-se, apreciar-se e cuidar de sua saúde física e emocional, compreendendo-se na diversidade humana e reconhecendo suas emoções e as dos outros.',
    keywords: ['autoconhecimento', 'emoção', 'sentimentos', 'saúde', 'autoavaliação', 'metacognição', 'cuidado'],
    icon: 'ti-heart'
  },
  {
    id: 9,
    code: 'CG09',
    name: 'Empatia e Cooperação',
    shortTitle: '9. Empatia & Cooperação',
    description: 'Exercitar a empatia, o diálogo, a resolução de conflitos e a cooperação, fazendo-se respeitar e promovendo o respeito ao outro e aos direitos humanos.',
    keywords: ['empatia', 'cooperação', 'duplas', 'grupos', 'colaboração', 'respeito', 'solidariedade', 'ajuda mútua', 'pair work', 'teamwork'],
    icon: 'ti-users'
  },
  {
    id: 10,
    code: 'CG10',
    name: 'Responsabilidade e Cidadania',
    shortTitle: '10. Cidadania',
    description: 'Agir pessoal e coletivamente com autonomia, responsabilidade, flexibilidade, resiliência e determinação, tomando decisões com base em princípios éticos e democráticos.',
    keywords: ['cidadania', 'responsabilidade', 'ética', 'sociedade', 'meio ambiente', 'sustentabilidade', 'direitos', 'comunidade'],
    icon: 'ti-shield-check'
  }
]

export interface InferredCompetencyResult {
  competency: BnccGeneralCompetency
  score: number
  justification: string
}

/**
 * Infere as Competências Gerais da BNCC mais mobilizadas pela aula
 * com base no tópico, nas ações de alunos e professores e na metodologia.
 */
export function inferGeneralCompetencies(
  topic: string,
  stages: Array<{ name: string; teacherAction: string; studentAction: string }>,
  methodologyId?: string
): InferredCompetencyResult[] {
  const combinedText = [
    topic,
    methodologyId || '',
    ...stages.map(s => `${s.name} ${s.teacherAction} ${s.studentAction}`)
  ].join(' ').toLowerCase()

  const scored: InferredCompetencyResult[] = BNCC_GENERAL_COMPETENCIES.map(comp => {
    let score = 0
    const matchedKeywords: string[] = []

    comp.keywords.forEach(kw => {
      const regex = new RegExp(`\\b${kw}\\b`, 'i')
      if (regex.test(combinedText)) {
        score += 2
        matchedKeywords.push(kw)
      }
    })

    // Heurísticas pedagógicas específicas
    if (comp.id === 4) {
      // Comunicação é sempre mobilizada em aulas de idiomas ou produção de texto/oral
      score += 4
    }
    if (comp.id === 9 && /duplas|grupos|pair|mingle|colabor/i.test(combinedText)) {
      // Empatia e Cooperação mobilizada em dinâmicas colaborativas
      score += 3
    }
    if (comp.id === 2 && /inquiry|5e|investig|hipótese|noticing|analis/i.test(combinedText)) {
      // Pensamento Científico e Crítico mobilizado em metodologias ativas
      score += 3
    }

    let justification = ''
    if (comp.id === 4) {
      justification = 'Mobilizada pela prática ativa de expressão oral e escrita em diferentes momentos da aula.'
    } else if (comp.id === 9) {
      justification = 'Trabalhada nas atividades de colaboração em duplas e dinâmicas de escuta ativa e respeito mútuo.'
    } else if (comp.id === 2) {
      justification = 'Desenvolvida no levantamento de hipóteses, investigação de regras e observação ativa de padrões.'
    } else if (matchedKeywords.length > 0) {
      justification = `Evidenciada pela articulação de ${matchedKeywords.slice(0, 3).join(', ')} ao longo do roteiro.`
    } else {
      justification = `Contribuinte para a formação integral do estudante em ${comp.name}.`
    }

    return {
      competency: comp,
      score,
      justification
    }
  })

  // Retorna as 3 competências com maior pontuação
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}
