/**
 * bnccData.ts — Matriz Central de Competências e Habilidades BNCC para Língua Inglesa
 * Reutilizável em Turmas, Planejamento de Aula, Provas e Relatórios de Cobertura Curricular
 */

export interface BnccSkill {
  id: string
  code: string
  gradeYear: string // "6º Fund.", "7º Fund.", "8º Fund.", "9º Fund.", "1º Médio", "2º Médio", "3º Médio"
  axis: 'Oralidade' | 'Leitura' | 'Escrita' | 'Conhecimentos Linguísticos' | 'Dimensão Intercultural'
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
  if (typeof window === 'undefined') return DEFAULT_BNCC_SKILLS
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
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('teacher_bncc_skills', JSON.stringify(skills))
    window.dispatchEvent(new Event('storage'))
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
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(`teacher_backlog_skills_${classId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveClassPostponedSkills(classId: string, skillCodes: string[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`teacher_backlog_skills_${classId}`, JSON.stringify(skillCodes))
  } catch {}
}
