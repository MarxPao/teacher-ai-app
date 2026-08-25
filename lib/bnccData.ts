/**
 * bnccData.ts — Matriz Central de Competências e Habilidades BNCC
 * Suporta múltiplas disciplinas: Língua Inglesa (padrão), Língua Portuguesa e futuras.
 * Reutilizável em Turmas, Planejamento de Aula, Provas e Relatórios de Cobertura Curricular.
 */

export interface BnccSkill {
  id: string
  code: string
  gradeYear: string // "6º Fund.", "7º Fund.", "8º Fund.", "9º Fund.", "1º Médio", "2º Médio", "3º Médio"
  /** Matéria — 'EF_LI' = Língua Inglesa (padrão), 'EF_LP' = Língua Portuguesa */
  subject?: 'EF_LI' | 'EF_LP' | 'EF_MA' | 'EF_CI' | 'EF_HI' | 'EM_LGG' | string
  axis: 'Oralidade' | 'Leitura' | 'Escrita' | 'Conhecimentos Linguísticos' | 'Dimensão Intercultural' | 'Análise Linguística' | 'Produção de Textos'
  description: string
  unit?: string
  isCustom?: boolean
}

export const DEFAULT_BNCC_SKILLS: BnccSkill[] = [
  // ─── 6º ANO ENSINO FUNDAMENTAL ─────────────────────────────────────────────
  {
    id: 'EF06LI01',
    code: 'EF06LI01',
    gradeYear: '6º Fund.',
    axis: 'Oralidade',
    description: 'Interagir em situações de intercâmbio oral, demonstrando iniciativa para utilizar a língua inglesa.',
    unit: 'Interação Discursiva'
  },
  {
    id: 'EF06LI02',
    code: 'EF06LI02',
    gradeYear: '6º Fund.',
    axis: 'Oralidade',
    description: 'Coletar informações do grupo, perguntando e respondendo sobre a família, os amigos, a escola e a comunidade.',
    unit: 'Interação Discursiva'
  },
  {
    id: 'EF06LI07',
    code: 'EF06LI07',
    gradeYear: '6º Fund.',
    axis: 'Leitura',
    description: 'Formular hipóteses sobre a finalidade de um texto em língua inglesa, com base em sua estrutura, organização visual e pistas textuais.',
    unit: 'Estratégias de Leitura'
  },
  {
    id: 'EF06LI15',
    code: 'EF06LI15',
    gradeYear: '6º Fund.',
    axis: 'Escrita',
    description: 'Produzir textos escritos em língua inglesa (histórias em quadrinhos, cartazes, chats, posts) sobre si mesmo e sua rotina.',
    unit: 'Práticas de Escrita'
  },
  {
    id: 'EF06LI19',
    code: 'EF06LI19',
    gradeYear: '6º Fund.',
    axis: 'Conhecimentos Linguísticos',
    description: 'Utilizar o presente do indicativo (Simple Present) para identificar pessoas e descrever rotinas diárias.',
    unit: 'Gramática: Present Simple'
  },
  {
    id: 'EF06LI25',
    code: 'EF06LI25',
    gradeYear: '6º Fund.',
    axis: 'Dimensão Intercultural',
    description: 'Reconhecer a presença da língua inglesa na sociedade brasileira/comunidade e seu significado.',
    unit: 'Presença do Inglês no Cotidiano'
  },

  // ─── 7º ANO ENSINO FUNDAMENTAL ─────────────────────────────────────────────
  {
    id: 'EF07LI01',
    code: 'EF07LI01',
    gradeYear: '7º Fund.',
    axis: 'Oralidade',
    description: 'Interagir em situações de intercâmbio oral para realizar as atividades em sala de aula, de forma respeitosa e colaborativa.',
    unit: 'Interação em Sala'
  },
  {
    id: 'EF07LI06',
    code: 'EF07LI06',
    gradeYear: '7º Fund.',
    axis: 'Leitura',
    description: 'Antecipar o sentido global de textos em língua inglesa por inferências com base em leitura rápida (skimming, scanning).',
    unit: 'Compreensão Geral e Específica'
  },
  {
    id: 'EF07LI12',
    code: 'EF07LI12',
    gradeYear: '7º Fund.',
    axis: 'Escrita',
    description: 'Planejar a escrita de textos em função do contexto (público, finalidade, layout e suporte).',
    unit: 'Planejamento Textual'
  },
  {
    id: 'EF07LI15',
    code: 'EF07LI15',
    gradeYear: '7º Fund.',
    axis: 'Conhecimentos Linguísticos',
    description: 'Construir repertório lexical relativo a verbos regulares e irregulares no passado (Simple Past) para narrar fatos.',
    unit: 'Gramática: Simple Past'
  },
  {
    id: 'EF07LI23',
    code: 'EF07LI23',
    gradeYear: '7º Fund.',
    axis: 'Dimensão Intercultural',
    description: 'Reconhecer a variação linguística como manifestação de formas de pensar e expressar o mundo.',
    unit: 'Variação Linguística e Cultura'
  },

  // ─── 8º ANO ENSINO FUNDAMENTAL ─────────────────────────────────────────────
  {
    id: 'EF08LI01',
    code: 'EF08LI01',
    gradeYear: '8º Fund.',
    axis: 'Oralidade',
    description: 'Fazer uso da língua inglesa para debater assuntos de interesse coletivo e escolar.',
    unit: 'Debate e Argumentação'
  },
  {
    id: 'EF08LI05',
    code: 'EF08LI05',
    gradeYear: '8º Fund.',
    axis: 'Leitura',
    description: 'Reconhecer o tema principal, a tese e as ideias secundárias em textos argumentativos e jornalísticos.',
    unit: 'Leitura Crítica'
  },
  {
    id: 'EF08LI14',
    code: 'EF08LI14',
    gradeYear: '8º Fund.',
    axis: 'Conhecimentos Linguísticos',
    description: 'Utilizar formas verbais do futuro (will, going to, present continuous) para expressar planos, previsões e decisões.',
    unit: 'Gramática: Formas de Futuro'
  },
  {
    id: 'EF08LI16',
    code: 'EF08LI16',
    gradeYear: '8º Fund.',
    axis: 'Conhecimentos Linguísticos',
    description: 'Utilizar os quantificadores (much, many, a lot of, few, little) e comparativos/superlativos.',
    unit: 'Gramática: Quantificadores e Graus'
  },

  // ─── 9º ANO ENSINO FUNDAMENTAL ─────────────────────────────────────────────
  {
    id: 'EF09LI01',
    code: 'EF09LI01',
    gradeYear: '9º Fund.',
    axis: 'Oralidade',
    description: 'Fazer uso da língua inglesa para expor pontos de vista, argumentos e contra-argumentos, considerando o contexto.',
    unit: 'Persuasão e Opinião'
  },
  {
    id: 'EF09LI02',
    code: 'EF09LI02',
    gradeYear: '9º Fund.',
    axis: 'Oralidade',
    description: 'Compilar as ideias-chave de textos por meio de tomada de notas.',
    unit: 'Compreensão Oral e Notas'
  },
  {
    id: 'EF09LI03',
    code: 'EF09LI03',
    gradeYear: '9º Fund.',
    axis: 'Oralidade',
    description: 'Analisar posicionamentos defendidos e refutados em textos orais sobre temas de interesse social e coletivo.',
    unit: 'Argumentação Oral'
  },
  {
    id: 'EF09LI08',
    code: 'EF09LI08',
    gradeYear: '9º Fund.',
    axis: 'Leitura',
    description: 'Identificar os recursos de persuasão (escolha vocabular, pontuação, figuras de linguagem) em textos publicitários e editoriais.',
    unit: 'Recursos Persuasivos'
  },
  {
    id: 'EF09LI14',
    code: 'EF09LI14',
    gradeYear: '9º Fund.',
    axis: 'Conhecimentos Linguísticos',
    description: 'Utilizar os conectores discursivos (linkers: however, although, therefore, furthermore) para estabelecer relações de causa, contraste e conclusão.',
    unit: 'Gramática: Conectivos Discursivos'
  },
  {
    id: 'EF09LI15',
    code: 'EF09LI15',
    gradeYear: '9º Fund.',
    axis: 'Conhecimentos Linguísticos',
    description: 'Empregar o Present Perfect (com since, for, already, yet) para expressar ações iniciadas no passado que continuam no presente.',
    unit: 'Gramática: Present Perfect'
  },
  {
    id: 'EF09LI16',
    code: 'EF09LI16',
    gradeYear: '9º Fund.',
    axis: 'Conhecimentos Linguísticos',
    description: 'Empregar as orações condicionais (First and Second Conditionals) para analisar hipóteses e consequências.',
    unit: 'Gramática: Condicionais (1st/2nd)'
  },
  {
    id: 'EF09LI19',
    code: 'EF09LI19',
    gradeYear: '9º Fund.',
    axis: 'Dimensão Intercultural',
    description: 'Discutir a comunicação intercultural por meio da língua inglesa como língua franca em âmbito global.',
    unit: 'Inglês como Língua Franca'
  },

  // ─── ENSINO MÉDIO (1º AO 3º ANO) ──────────────────────────────────────────
  {
    id: 'EM13LGG101',
    code: 'EM13LGG101',
    gradeYear: '1º Médio',
    axis: 'Leitura',
    description: 'Compreender e analisar processos de produção e circulação de discursos nas diferentes linguagens.',
    unit: 'Análise do Discurso e Mídia'
  },
  {
    id: 'EM13LGG401',
    code: 'EM13LGG401',
    gradeYear: '2º Médio',
    axis: 'Escrita',
    description: 'Analisar criticamente textos de divulgação científica e ensaios acadêmicos em língua inglesa, produzindo resenhas e artigos.',
    unit: 'Produção Acadêmica e Argumentativa'
  },
  {
    id: 'EM13LGG604',
    code: 'EM13LGG604',
    gradeYear: '3º Médio',
    axis: 'Dimensão Intercultural',
    description: 'Relacionar as práticas de linguagem em língua inglesa às exigências do mundo do trabalho e exames vestibulares/ENEM.',
    unit: 'Inglês para Fins Acadêmicos e Profissionais'
  }
]

/**
 * Retorna as competências salvas ou a lista padrão inicial
 */
export function getStoredBnccSkills(): BnccSkill[] {
  if (typeof localStorage === 'undefined') return DEFAULT_BNCC_SKILLS
  try {
    const raw = localStorage.getItem('teacher_bncc_skills')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
    localStorage.setItem('teacher_bncc_skills', JSON.stringify(DEFAULT_BNCC_SKILLS))
    return DEFAULT_BNCC_SKILLS
  } catch {
    return DEFAULT_BNCC_SKILLS
  }
}

/**
 * Salva a lista personalizada de competências
 */
export function saveStoredBnccSkills(skills: BnccSkill[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem('teacher_bncc_skills', JSON.stringify(skills))
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('storage'))
  } catch {}
}

/**
 * Filtra competências por ano escolar / série
 */
export function getBnccSkillsForGrade(gradeYear: string): BnccSkill[] {
  const all = getStoredBnccSkills()
  if (!gradeYear || gradeYear === 'all') return all
  const cleanGrade = gradeYear.toLowerCase().replace(/ano|série/g, '').trim()
  return all.filter(s => s.gradeYear.toLowerCase().includes(cleanGrade) || gradeYear.toLowerCase().includes(s.gradeYear.toLowerCase()))
}

/**
 * Gerenciamento de Backlog de Habilidades Adiadas por Turma
 */
export function getClassPostponedSkills(classId: string): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(`teacher_backlog_skills_${classId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveClassPostponedSkills(classId: string, skillCodes: string[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(`teacher_backlog_skills_${classId}`, JSON.stringify(skillCodes))
  } catch {}
}

// ─── Habilidades BNCC — Língua Portuguesa (piloto A.3) ────────────────────────

export const PORTUGUESE_BNCC_SKILLS: BnccSkill[] = [
  // ─── 6º ANO ───────────────────────────────────────────────────────────────
  { id: 'EF06LP01', code: 'EF06LP01', gradeYear: '6º Fund.', subject: 'EF_LP',
    axis: 'Leitura', unit: 'Estratégias de Leitura',
    description: 'Selecionar e utilizar, com ajuda do professor, estratégias de leitura (skimming, scanning, leitura detalhada) adequadas ao objetivo e ao gênero textual.' },
  { id: 'EF06LP06', code: 'EF06LP06', gradeYear: '6º Fund.', subject: 'EF_LP',
    axis: 'Leitura', unit: 'Gêneros Textuais',
    description: 'Identificar o gênero textual com base em suas características composicionais (forma de organização interna, recursos linguísticos e marcas enunciativas).' },
  { id: 'EF06LP15', code: 'EF06LP15', gradeYear: '6º Fund.', subject: 'EF_LP',
    axis: 'Produção de Textos', unit: 'Planejamento Textual',
    description: 'Planejar textos considerando o contexto de produção (finalidade, interlocutores, suporte, gênero), selecionando forma de tratamento e registro adequados.' },
  { id: 'EF06LP32', code: 'EF06LP32', gradeYear: '6º Fund.', subject: 'EF_LP',
    axis: 'Análise Linguística', unit: 'Morfologia',
    description: 'Identificar e classificar as classes de palavras (substantivos, adjetivos, verbos, artigos, pronomes, numerais, advérbios, preposições, conjunções e interjeições).' },
  { id: 'EF06LP33', code: 'EF06LP33', gradeYear: '6º Fund.', subject: 'EF_LP',
    axis: 'Análise Linguística', unit: 'Sintaxe',
    description: 'Reconhecer a estrutura básica da oração (sujeito e predicado) e a relação de concordância verbal e nominal.' },
  { id: 'EF06LP36', code: 'EF06LP36', gradeYear: '6º Fund.', subject: 'EF_LP',
    axis: 'Análise Linguística', unit: 'Semântica',
    description: 'Identificar sinonímia, antonímia e polissemia no texto, e compreender seus efeitos de sentido.' },
  { id: 'EF06LP38', code: 'EF06LP38', gradeYear: '6º Fund.', subject: 'EF_LP',
    axis: 'Análise Linguística', unit: 'Ortografia e Acentuação',
    description: 'Empregar as regras básicas de acentuação gráfica (palavras oxítonas, paroxítonas e proparoxítonas) e o hífen.' },
  // ─── 7º ANO ───────────────────────────────────────────────────────────────
  { id: 'EF07LP01', code: 'EF07LP01', gradeYear: '7º Fund.', subject: 'EF_LP',
    axis: 'Leitura', unit: 'Estratégias de Leitura',
    description: 'Inferir, com base em dados do texto e do contexto, o sentido de palavras, expressões ou trechos desconhecidos.' },
  { id: 'EF07LP03', code: 'EF07LP03', gradeYear: '7º Fund.', subject: 'EF_LP',
    axis: 'Leitura', unit: 'Implícitos e Subentendidos',
    description: 'Identificar implícitos e pressupostos nos textos lidos, reconhecendo as diferentes vozes sociais que neles circulam.' },
  { id: 'EF07LP15', code: 'EF07LP15', gradeYear: '7º Fund.', subject: 'EF_LP',
    axis: 'Produção de Textos', unit: 'Planejamento Textual',
    description: 'Produzir textos em diferentes gêneros, considerando sua adequação ao contexto (tema, interlocutores, finalidade e suporte).' },
  { id: 'EF07LP31', code: 'EF07LP31', gradeYear: '7º Fund.', subject: 'EF_LP',
    axis: 'Análise Linguística', unit: 'Sintaxe',
    description: 'Reconhecer e empregar os recursos de concordância verbal e nominal, emprego de pronomes e regência de verbos frequentes.' },
  // ─── 8º ANO ───────────────────────────────────────────────────────────────
  { id: 'EF08LP01', code: 'EF08LP01', gradeYear: '8º Fund.', subject: 'EF_LP',
    axis: 'Leitura', unit: 'Estratégias de Leitura',
    description: 'Fazer inferências e deduções em textos de maior complexidade, articulando conhecimentos prévios com os dados do texto.' },
  { id: 'EF08LP14', code: 'EF08LP14', gradeYear: '8º Fund.', subject: 'EF_LP',
    axis: 'Leitura', unit: 'Figuras de Linguagem',
    description: 'Identificar e analisar os efeitos de sentido provocados pelo uso de figuras de linguagem (metáfora, metonímia, hipérbole, ironia, eufemismo, antítese, paradoxo).' },
  { id: 'EF08LP16', code: 'EF08LP16', gradeYear: '8º Fund.', subject: 'EF_LP',
    axis: 'Produção de Textos', unit: 'Argumentação',
    description: 'Produzir textos argumentativos (artigo de opinião, editorial), apresentando tese, argumentos e contra-argumentos com uso de conectivos adequados.' },
  { id: 'EF08LP30', code: 'EF08LP30', gradeYear: '8º Fund.', subject: 'EF_LP',
    axis: 'Análise Linguística', unit: 'Sintaxe',
    description: 'Empregar adequadamente as regras de regência verbal e nominal, colocação pronominal e emprego de crase.' },
  // ─── 9º ANO ───────────────────────────────────────────────────────────────
  { id: 'EF09LP01', code: 'EF09LP01', gradeYear: '9º Fund.', subject: 'EF_LP',
    axis: 'Leitura', unit: 'Estratégias de Leitura',
    description: 'Analisar diferentes textos de divulgação científica, artigos de opinião e textos literários, identificando argumentos, pressupostos e implícitos.' },
  { id: 'EF09LP09', code: 'EF09LP09', gradeYear: '9º Fund.', subject: 'EF_LP',
    axis: 'Leitura', unit: 'Figuras de Linguagem e Sentido',
    description: 'Analisar o efeito de sentido de figuras de linguagem (ironia, eufemismo, antítese, paradoxo) em textos literários e jornalísticos.' },
  { id: 'EF09LP15', code: 'EF09LP15', gradeYear: '9º Fund.', subject: 'EF_LP',
    axis: 'Produção de Textos', unit: 'Dissertação-Argumentativa',
    description: 'Produzir texto dissertativo-argumentativo em prosa, defendendo uma tese com argumentos consistentes, articulados e coerentes, e com proposta de intervenção.' },
  { id: 'EF09LP29', code: 'EF09LP29', gradeYear: '9º Fund.', subject: 'EF_LP',
    axis: 'Análise Linguística', unit: 'Sintaxe Avançada',
    description: 'Identificar e empregar orações subordinadas substantivas, adjetivas e adverbiais, reconhecendo os conectivos que as introduzem e os efeitos de sentido que produzem.' },
  { id: 'EF09LP26', code: 'EF09LP26', gradeYear: '9º Fund.', subject: 'EF_LP',
    axis: 'Oralidade', unit: 'Variação Linguística',
    description: 'Analisar, em textos orais e escritos, as marcas de variação linguística (regional, social, etária, de registro) e seus efeitos de sentido.' }
]

// ─── Índice Multi-Matéria ─────────────────────────────────────────────────────

/**
 * Retorna todas as habilidades BNCC de uma matéria específica.
 * subject: 'EF_LI' (Inglês, padrão), 'EF_LP' (Português), etc.
 */
export function getBnccSkillsBySubject(subject: 'EF_LI' | 'EF_LP' | string): BnccSkill[] {
  if (subject === 'EF_LP') return PORTUGUESE_BNCC_SKILLS
  // Padrão: retorna habilidades de inglês (comportamento original)
  return DEFAULT_BNCC_SKILLS
}

// ─── Relatório de Cobertura Curricular BNCC (Bloco A.5) ─────────────────────

export interface CurriculumCoverageReport {
  gradeYear: string
  totalSkills: number
  coveredCount: number
  postponedCount: number
  plannedCount: number
  uncoveredCount: number
  coveragePercentage: number
  byAxis: Record<string, { total: number; covered: number; percentage: number }>
  skillsDetail: Array<{
    code: string
    axis: string
    description: string
    status: 'covered' | 'postponed' | 'planned' | 'uncovered'
    coveredCount: number
    lastLessonDate?: string
  }>
}

export function getCurriculumCoverageReport(
  gradeYear: string,
  lessonPlans: Array<{ date: string; classId?: string; selectedSkills?: Array<{ code: string; desc?: string; status: string }> }>,
  classId?: string
): CurriculumCoverageReport {
  const allGradeSkills = getBnccSkillsForGrade(gradeYear)
  const filteredPlans = classId ? lessonPlans.filter(p => p.classId === classId) : lessonPlans
  
  const skillOccurrences = new Map<string, { count: number; lastDate: string; status: 'covered' | 'postponed' | 'planned' }>()

  filteredPlans.forEach(plan => {
    if (Array.isArray(plan.selectedSkills)) {
      plan.selectedSkills.forEach(s => {
        const existing = skillOccurrences.get(s.code)
        const currentCount = (existing?.count || 0) + (s.status === 'covered' ? 1 : 0)
        skillOccurrences.set(s.code, {
          count: currentCount,
          lastDate: plan.date || existing?.lastDate || '',
          status: s.status as any
        })
      })
    }
  })

  // Se tiver backlog salvo na turma
  const postponedBacklog = classId ? getClassPostponedSkills(classId) : []

  const byAxis: Record<string, { total: number; covered: number; percentage: number }> = {}
  let coveredCount = 0
  let postponedCount = 0
  let plannedCount = 0

  const skillsDetail = allGradeSkills.map(skill => {
    const axis = skill.axis || 'Geral'
    if (!byAxis[axis]) {
      byAxis[axis] = { total: 0, covered: 0, percentage: 0 }
    }
    byAxis[axis].total++

    const record = skillOccurrences.get(skill.code)
    let status: 'covered' | 'postponed' | 'planned' | 'uncovered' = 'uncovered'

    if (postponedBacklog.includes(skill.code)) {
      status = 'postponed'
      postponedCount++
    } else if (record) {
      if (record.status === 'covered' || record.count > 0) {
        status = 'covered'
        coveredCount++
        byAxis[axis].covered++
      } else if (record.status === 'postponed') {
        status = 'postponed'
        postponedCount++
      } else {
        status = 'planned'
        plannedCount++
      }
    }

    return {
      code: skill.code,
      axis,
      description: skill.description,
      status,
      coveredCount: record?.count || 0,
      lastLessonDate: record?.lastDate
    }
  })

  // Calcula percentuais por eixo
  Object.keys(byAxis).forEach(axis => {
    const item = byAxis[axis]
    item.percentage = item.total > 0 ? Math.round((item.covered / item.total) * 100) : 0
  })

  const totalSkills = allGradeSkills.length
  const uncoveredCount = totalSkills - coveredCount - postponedCount - plannedCount
  const coveragePercentage = totalSkills > 0 ? Math.round((coveredCount / totalSkills) * 100) : 0

  return {
    gradeYear,
    totalSkills,
    coveredCount,
    postponedCount,
    plannedCount,
    uncoveredCount: Math.max(0, uncoveredCount),
    coveragePercentage,
    byAxis,
    skillsDetail
  }
}
