/**
 * lib/pdiManagement.ts — Gerenciamento, Persistência (Local + Supabase) e Evolução Semestral
 * de Planos de Desenvolvimento Individual (PDI).
 *
 * Baseado no modelo oficial do componente curricular de Língua Inglesa (BNCC):
 * 1. Identificação
 * 2. Objetivo geral do PDI
 * 3. Estratégias pedagógicas e recursos de apoio
 * 4. Habilidades esperadas — BNCC (Código | Habilidade | Superada? | Observações)
 * 5. Observações gerais e evolução do aluno
 * 6. Acompanhamento e revisão (com transição semestral e rastreio de superação)
 * 7. Assinaturas
 */

import { SkillsMatrixRow, DocumentStrategyItem, SignatureItem } from './editableDocumentTypes'
import { DEFAULT_BNCC_SKILLS } from './bnccData'
import { syncToSupabase, loadFromSupabase } from './supabaseClient'

export interface PdiSemesterSnapshot {
  id: string
  period: string
  archivedAt: string
  summaryStats: {
    total: number
    mastered: number
    developing: number
    notMastered: number
  }
  skillsSnapshot: Array<{
    skillCode: string
    status: 'Sim' | 'Em desenvolvimento' | 'Não'
    observations: string
  }>
  generalEvolutionSnapshot?: string
  reviewNotesSnapshot?: string
}

export interface PdiIdentification {
  studentName?: string
  gradeCycle?: string
  shift?: string
  birthDate?: string
  creationDate?: string
  curricularComponent?: string
  regentTeacher?: string
  pedagogicalTeam?: string
  guardians?: string
  validityPeriod?: string
  nextReviewDate?: string
  schoolName?: string
  city?: string
  directors?: string
  fatherName?: string
  motherName?: string
}

export interface PdiRecord {
  id: string
  studentId: string
  studentName: string
  classId?: string
  schoolName?: string
  academicYear?: string
  status: 'active' | 'archived' | 'draft'

  // Seção 1: Identificação Unificada (Modelo Oficial)
  identification?: PdiIdentification

  // Compatibilidade legada Box 1 & 2
  schoolInfo?: {
    schoolName?: string
    city?: string
    directors?: string
    creationDate?: string
  }
  studentInfo?: {
    studentName?: string
    birthDate?: string
    gradeCycle?: string
    fatherName?: string
    motherName?: string
    shift?: string
    curricularComponent?: string
    regentTeacher?: string
    pedagogicalTeam?: string
    guardians?: string
    validityPeriod?: string
    nextReviewDate?: string
    schoolName?: string
  }

  // Seção 2: Objetivo Geral do PDI
  generalObjective?: {
    objetivoGeral?: string
  }

  // Seção 3: Estratégias pedagógicas e recursos de apoio
  interventionPlan: DocumentStrategyItem[]

  // Seção 4: Habilidades esperadas — BNCC
  skillsMatrix: SkillsMatrixRow[]

  // Seção 5: Observações gerais e evolução do aluno
  generalObservations?: {
    evolucaoGeral?: string
  }

  // Seção 6: Acompanhamento e revisão (Transição Semestral)
  followUpReview?: {
    revisaoPeriodica?: string
    parecerProximoSemestre?: string
  }

  // Anexo Clínico Opcional
  clinicalReport?: {
    hasClinicalDiagnosis: boolean
    cid10?: string
    professionalName?: string
    reportDate?: string
    specializedServices?: string
    medication?: string
  }

  // Compatibilidade legada Box 4 & 5
  developmentAssessment?: {
    percepcao?: string
    atencao?: string
    memoria?: string
    linguagem?: string
    raciocinio?: string
    emocional?: string
  }
  curricularProposal?: {
    proposta?: string
  }

  // Seção 7: Assinaturas
  signatures: SignatureItem[]

  // Histórico Longitudinal de Semestres Anteriores
  semesterHistory?: PdiSemesterSnapshot[]

  createdAt: string
  updatedAt: string
  lastSyncedAt?: string
}

export const PDI_STORAGE_KEY = 'teacher_pdi_records_v1'
export const PDI_ARCHIVE_STORAGE_KEY = 'teacher_pdi_archive_v1'

let _memoryPdi: Record<string, PdiRecord> = {}
let _memoryPdiArchive: Record<string, PdiRecord[]> = {}

// ─── ESTRATÉGIAS CANÔNICAS DO MODELO OFICIAL ─────────────────────────────────
export const CANONICAL_PDI_STRATEGIES: DocumentStrategyItem[] = [
  {
    id: 'strat_pdi_1',
    description: 'Uso de instruções claras, objetivas e, quando necessário, apresentadas por escrito e oralmente.',
    isActive: true
  },
  {
    id: 'strat_pdi_2',
    description: 'Divisão das atividades em etapas menores, com tempo estendido quando necessário.',
    isActive: true
  },
  {
    id: 'strat_pdi_3',
    description: 'Apoio visual (imagens, esquemas, cartazes) para reforço do vocabulário e das estruturas trabalhadas.',
    isActive: true
  },
  {
    id: 'strat_pdi_4',
    description: 'Rotina previsível de aula, com antecipação de mudanças sempre que possível.',
    isActive: true
  },
  {
    id: 'strat_pdi_5',
    description: 'Reforço positivo e feedback frequente sobre o progresso.',
    isActive: true
  },
  {
    id: 'strat_pdi_6',
    description: 'Pausas programadas e ambiente com o mínimo de estímulos distratores durante atividades de concentração.',
    isActive: true
  },
  {
    id: 'strat_pdi_7',
    description: 'Flexibilização de formatos de avaliação (oral, escrita, prática), quando pertinente.',
    isActive: true
  }
]

// ─── MATRIZ CANÔNICA DE 26 HABILIDADES BNCC 6º ANO (CARINA MIRANDA DE OLIVEIRA) ───
export const CANONICAL_CARINA_6ANO_SKILLS: SkillsMatrixRow[] = [
  {
    id: 'bncc_EF06LI01',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI01',
    skillDescription: 'Interagir em situações de intercâmbio oral, demonstrando iniciativa para utilizar a língua inglesa.',
    workDoneOrAdaptedSkill: '',
    status: 'Sim'
  },
  {
    id: 'bncc_EF06LI02',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI02',
    skillDescription: 'Coletar informações do grupo, perguntando e respondendo sobre a família, os amigos, a escola e a comunidade.',
    workDoneOrAdaptedSkill: '',
    status: 'Em desenvolvimento'
  },
  {
    id: 'bncc_EF06LI03',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI03',
    skillDescription: 'Solicitar esclarecimentos em língua inglesa sobre o que não entendeu e o significado de palavras ou expressões desconhecidas.',
    workDoneOrAdaptedSkill: '',
    status: 'Sim'
  },
  {
    id: 'bncc_EF06LI04',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI04',
    skillDescription: 'Reconhecer, com o apoio de palavras cognatas e pistas do contexto discursivo, o assunto e as informações principais em textos orais sobre temas familiares.',
    workDoneOrAdaptedSkill: '',
    status: 'Sim'
  },
  {
    id: 'bncc_EF06LI05',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI05',
    skillDescription: 'Aplicar os conhecimentos da língua inglesa para falar de si e de outras pessoas, explicitando informações pessoais e características relacionadas a gostos, preferências e rotinas.',
    workDoneOrAdaptedSkill: '',
    status: 'Sim'
  },
  {
    id: 'bncc_EF06LI06',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI06',
    skillDescription: 'Planejar apresentação sobre a família, a comunidade e a escola, compartilhando-a oralmente com o grupo.',
    workDoneOrAdaptedSkill: 'Habilidade será trabalhada no segundo semestre',
    status: 'Não'
  },
  {
    id: 'bncc_EF06LI07',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI07',
    skillDescription: 'Formular hipóteses sobre a finalidade de um texto em língua inglesa, com base em sua estrutura, organização textual e pistas gráficas.',
    workDoneOrAdaptedSkill: 'Habilidade será trabalhada no segundo semestre',
    status: 'Não'
  },
  {
    id: 'bncc_EF06LI08',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI08',
    skillDescription: 'Identificar o assunto de um texto, reconhecendo sua organização textual e palavras cognatas.',
    workDoneOrAdaptedSkill: '',
    status: 'Sim'
  },
  {
    id: 'bncc_EF06LI09',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI09',
    skillDescription: 'Localizar informações específicas em texto.',
    workDoneOrAdaptedSkill: '',
    status: 'Sim'
  },
  {
    id: 'bncc_EF06LI10',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI10',
    skillDescription: 'Conhecer a organização de um dicionário bilíngue (impresso e/ou on-line) para construir repertório lexical.',
    workDoneOrAdaptedSkill: 'Habilidade será trabalhada no segundo semestre',
    status: 'Não'
  },
  {
    id: 'bncc_EF06LI11',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI11',
    skillDescription: 'Explorar ambientes virtuais e/ou aplicativos para construir repertório lexical na língua inglesa.',
    workDoneOrAdaptedSkill: 'Habilidade será trabalhada no segundo semestre',
    status: 'Não'
  },
  {
    id: 'bncc_EF06LI12',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI12',
    skillDescription: 'Interessar-se pelo texto lido, compartilhando suas ideias sobre o que o texto informa/comunica.',
    workDoneOrAdaptedSkill: '',
    status: 'Sim'
  },
  {
    id: 'bncc_EF06LI13',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI13',
    skillDescription: 'Listar ideias para a produção de textos, levando em conta o tema e o assunto.',
    workDoneOrAdaptedSkill: '',
    status: 'Em desenvolvimento'
  },
  {
    id: 'bncc_EF06LI14',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI14',
    skillDescription: 'Organizar ideias, selecionando-as em função da estrutura e do objetivo do texto.',
    workDoneOrAdaptedSkill: '',
    status: 'Em desenvolvimento'
  },
  {
    id: 'bncc_EF06LI15',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI15',
    skillDescription: 'Produzir textos escritos em língua inglesa (histórias em quadrinhos, cartazes, chats, blogues, agendas, fotolegendas, entre outros), sobre si mesmo, sua família, seus amigos, sua comunidade e sua escola.',
    workDoneOrAdaptedSkill: 'Habilidade será trabalhada no segundo semestre',
    status: 'Não'
  },
  {
    id: 'bncc_EF06LI16',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI16',
    skillDescription: 'Construir repertório relativo às expressões usadas para o convívio social e o uso da língua inglesa em sala de aula.',
    workDoneOrAdaptedSkill: '',
    status: 'Sim'
  },
  {
    id: 'bncc_EF06LI17',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI17',
    skillDescription: 'Construir repertório lexical relativo a temas familiares (escola, família, rotina diária, atividades de lazer, esportes, entre outros).',
    workDoneOrAdaptedSkill: '',
    status: 'Sim'
  },
  {
    id: 'bncc_EF06LI18',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI18',
    skillDescription: 'Reconhecer semelhanças e diferenças na pronúncia de palavras da língua inglesa e da língua materna e/ou outras línguas conhecidas.',
    workDoneOrAdaptedSkill: '',
    status: 'Sim'
  },
  {
    id: 'bncc_EF06LI19',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI19',
    skillDescription: 'Utilizar o presente do indicativo para identificar pessoas (verbo to be) e descrever rotinas diárias.',
    workDoneOrAdaptedSkill: '',
    status: 'Em desenvolvimento'
  },
  {
    id: 'bncc_EF06LI20',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI20',
    skillDescription: 'Utilizar o presente contínuo para descrever ações em progresso.',
    workDoneOrAdaptedSkill: 'Habilidade será trabalhada no 7º ano',
    status: 'Não'
  },
  {
    id: 'bncc_EF06LI21',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI21',
    skillDescription: 'Reconhecer o uso do imperativo em enunciados de atividades, comandos e instruções.',
    workDoneOrAdaptedSkill: 'Habilidade será trabalhada no segundo semestre',
    status: 'Não'
  },
  {
    id: 'bncc_EF06LI22',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI22',
    skillDescription: "Descrever relações por meio do uso de apóstrofo (') + s.",
    workDoneOrAdaptedSkill: 'Habilidade será trabalhada no segundo semestre',
    status: 'Não'
  },
  {
    id: 'bncc_EF06LI23',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI23',
    skillDescription: 'Empregar, de forma inteligível, os adjetivos possessivos.',
    workDoneOrAdaptedSkill: 'Habilidade será trabalhada no segundo semestre',
    status: 'Não'
  },
  {
    id: 'bncc_EF06LI24',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI24',
    skillDescription: 'Investigar o alcance da língua inglesa no mundo: como língua materna e/ou oficial (primeira ou segunda língua).',
    workDoneOrAdaptedSkill: '',
    status: 'Em desenvolvimento'
  },
  {
    id: 'bncc_EF06LI25',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI25',
    skillDescription: 'Identificar a presença da língua inglesa na sociedade brasileira/comunidade (palavras, expressões, suportes e esferas de circulação e consumo) e seu significado.',
    workDoneOrAdaptedSkill: '',
    status: 'Sim'
  },
  {
    id: 'bncc_EF06LI26',
    subject: 'Língua Inglesa',
    skillCode: 'EF06LI26',
    skillDescription: 'Avaliar, problematizando elementos/produtos culturais de países de língua inglesa absorvidos pela sociedade brasileira/comunidade.',
    workDoneOrAdaptedSkill: '',
    status: 'Em desenvolvimento'
  }
]

export const CANONICAL_CARINA_EVOLUTION_TEXT = [
  'A aluna apresenta um bom desenvolvimento do uso da língua, é participativa e colabora nas atividades em sala. A aluna também é proativa e sabe questionar a professora e esclarecer dúvidas durante o desenvolvimento das aulas.',
  'Aluna possui um domínio da língua inglesa avançado para a idade e para a série. Entretanto, suas constantes faltas e desentendimentos durante as aulas acabam por prejudicar seu desempenho geral.',
  'A falta de concentração devido aos estímulos apresentados em sala pode causar um prejuízo ao rendimento da aluna.',
  'Em alguns momentos a estudante apresenta certa resistência em obedecer comandos e em alguns momentos decide fazer atividades não relacionadas à aula de língua inglesa que, apesar de não comprometerem em seu rendimento, podem causar problemas de relacionamento professor-aluno e aluno com os colegas.',
  'A aluna não sabe lidar muito bem com frustrações e é muito focada no seu rendimento acadêmico em relação às notas, com comparações constantes com as notas dos colegas, o que impede a reflexão sobre o seu rendimento pessoal, seus avanços e melhoras durante o período letivo. Especialmente durante o segundo bimestre, a aluna apresentou comportamentos agressivos em relação aos colegas e reclamações de exclusão e isolamento causados por causa dos atritos constantes.',
  'A aluna é respeitosa com a professora e se engaja em atividades de movimento físico, como música, dança e jogos. Entretanto, em alguns momentos a dificuldade de lidar com frustrações acaba causando discussões e momentos de irritabilidade.',
  'A aluna não necessita de adaptações de materiais ou de avaliações, sendo apenas acompanhada em sala para controle de crises e monitoramento de saídas da sala de aula.'
].join('\n\n')

export const CANONICAL_PDI_OBJECTIVE_TEXT =
  'Acompanhar e apoiar o desenvolvimento da aluna no componente curricular de Língua Inglesa, monitorando o alcance progressivo das habilidades previstas pela BNCC para o 6º ano do Ensino Fundamental, com estratégias pedagógicas individualizadas, revisão periódica e registro contínuo dos avanços.'

export const CANONICAL_PDI_REVIEW_TEXT =
  'Este PDI deverá ser revisado periodicamente pela equipe pedagógica, em conjunto com a família, ajustando metas e estratégias conforme a evolução da aluna.'

/**
 * Normaliza status legados ('HV', 'HED', 'HNV', 'concluida', 'em_andamento') para o padrão
 * oficial do documento ('Sim' | 'Em desenvolvimento' | 'Não').
 */
export function normalizePdiSkillStatus(
  rawStatus?: string
): 'Sim' | 'Em desenvolvimento' | 'Não' {
  if (!rawStatus) return 'Em desenvolvimento'
  const clean = rawStatus.trim().toLowerCase()
  if (clean === 'sim' || clean === 'hv' || clean === 'concluida' || clean === 'superada') {
    return 'Sim'
  }
  if (clean === 'não' || clean === 'nao' || clean === 'hnv' || clean === 'nao_superada') {
    return 'Não'
  }
  return 'Em desenvolvimento'
}

/**
 * Constrói a matriz completa de habilidades BNCC de Língua Inglesa para uma série/ano escolar.
 * Se for 6º ano, retorna as 26 habilidades EF06LI01–EF06LI26.
 */
export function buildBnccSkillsMatrixForGrade(
  gradeLabel: string = '6º ano do Ensino Fundamental',
  useCarinaDefaults: boolean = false
): SkillsMatrixRow[] {
  const normalizedGrade = gradeLabel.toLowerCase()
  if (useCarinaDefaults || (normalizedGrade.includes('6') && useCarinaDefaults)) {
    return CANONICAL_CARINA_6ANO_SKILLS.map(r => ({ ...r }))
  }

  let targetGradeCode = '6º Fund.'
  if (normalizedGrade.includes('7')) targetGradeCode = '7º Fund.'
  else if (normalizedGrade.includes('8')) targetGradeCode = '8º Fund.'
  else if (normalizedGrade.includes('9')) targetGradeCode = '9º Fund.'
  else if (normalizedGrade.includes('1º') || normalizedGrade.includes('1o') || normalizedGrade.includes('médio') || normalizedGrade.includes('medio')) {
    targetGradeCode = '1º Médio'
  }

  if (targetGradeCode === '6º Fund.') {
    return CANONICAL_CARINA_6ANO_SKILLS.map(r => ({
      ...r,
      status: 'Em desenvolvimento',
      workDoneOrAdaptedSkill: ''
    }))
  }

  const matched = DEFAULT_BNCC_SKILLS.filter(
    s => s.gradeYear === targetGradeCode && (!s.subject || s.subject === 'EF_LI' || s.subject === 'EM_LGG')
  )

  if (matched.length === 0) {
    return CANONICAL_CARINA_6ANO_SKILLS.map(r => ({ ...r }))
  }

  return matched.map((sk, idx) => ({
    id: `bncc_${sk.code}_${idx}`,
    subject: 'Língua Inglesa',
    skillCode: sk.code,
    skillDescription: sk.description,
    workDoneOrAdaptedSkill: '',
    status: 'Em desenvolvimento'
  }))
}

/**
 * Cria o PDI canônico completo da aluna Carina Miranda de Oliveira (6º ano — Matutino)
 * exatamente como no documento oficial enviado pela professora.
 */
export function createCarinaReferencePdi(
  studentId: string = 'student_carina_miranda_6ano',
  studentName: string = 'Carina Miranda de Oliveira',
  classId?: string,
  schoolName: string = 'Colégio Machado Sobrinho'
): PdiRecord {
  const nowIso = new Date().toISOString()
  const identification: PdiIdentification = {
    studentName,
    gradeCycle: '6º ano do Ensino Fundamental',
    shift: 'Matutino',
    birthDate: '',
    creationDate: '10/07/2026',
    curricularComponent: 'Língua Inglesa — 6º ano do Ensino Fundamental',
    regentTeacher: 'Rafaela Franco Toldo',
    pedagogicalTeam: 'Marianna Panisset',
    guardians: '',
    validityPeriod: '1º semestre / 2026',
    nextReviewDate: 'Dezembro / 2026',
    schoolName,
    city: 'Juiz de Fora - MG',
    directors: 'Marianna Panisset'
  }

  return {
    id: `pdi_carina_miranda_2026`,
    studentId,
    studentName,
    classId,
    schoolName,
    academicYear: '2026',
    status: 'active',
    identification,
    schoolInfo: {
      schoolName,
      city: 'Juiz de Fora - MG',
      directors: 'Marianna Panisset',
      creationDate: '2026-07-10'
    },
    studentInfo: {
      studentName,
      birthDate: '',
      gradeCycle: '6º ano do Ensino Fundamental',
      shift: 'Matutino',
      curricularComponent: 'Língua Inglesa — 6º ano do Ensino Fundamental',
      regentTeacher: 'Rafaela Franco Toldo',
      pedagogicalTeam: 'Marianna Panisset',
      guardians: '',
      validityPeriod: '1º semestre / 2026',
      nextReviewDate: 'Dezembro / 2026',
      fatherName: '',
      motherName: ''
    },
    generalObjective: {
      objetivoGeral: CANONICAL_PDI_OBJECTIVE_TEXT
    },
    interventionPlan: CANONICAL_PDI_STRATEGIES.map(s => ({ ...s })),
    skillsMatrix: CANONICAL_CARINA_6ANO_SKILLS.map(s => ({ ...s })),
    generalObservations: {
      evolucaoGeral: CANONICAL_CARINA_EVOLUTION_TEXT
    },
    followUpReview: {
      revisaoPeriodica: CANONICAL_PDI_REVIEW_TEXT,
      parecerProximoSemestre: ''
    },
    clinicalReport: {
      hasClinicalDiagnosis: false,
      cid10: '',
      professionalName: '',
      reportDate: '',
      specializedServices: '',
      medication: ''
    },
    developmentAssessment: {
      percepcao: 'A aluna apresenta bom desenvolvimento do uso da língua e domínio avançado para a idade e série.',
      atencao: 'A falta de concentração devido aos estímulos apresentados em sala pode causar prejuízo ao rendimento.',
      memoria: 'Ótima retenção linguística e participação ativa quando engajada.',
      linguagem: 'Proativa, questiona a professora e esclarece dúvidas durante o desenvolvimento das aulas.',
      raciocinio: 'Engaja-se em atividades de movimento físico, como música, dança e jogos.',
      emocional: 'Dificuldade em lidar com frustrações e comparações constantes com notas dos colegas; acompanhamento em sala para controle de crises e monitoramento de saídas.'
    },
    curricularProposal: {
      proposta: CANONICAL_PDI_OBJECTIVE_TEXT
    },
    signatures: [
      { role: 'Professor(a) regente', name: 'Rafaela Franco Toldo', signed: true, signedAt: '2026-07-10T12:00:00.000Z' },
      { role: 'Coordenação pedagógica', name: 'Marianna Panisset', signed: false },
      { role: 'Responsável pelo(a) aluno(a)', name: '', signed: false },
      { role: 'Data', name: '10/07/2026', signed: true, signedAt: '2026-07-10T12:00:00.000Z' }
    ],
    semesterHistory: [],
    createdAt: nowIso,
    updatedAt: nowIso
  }
}

export function getAllPdiRecords(): Record<string, PdiRecord> {
  if (typeof window === 'undefined') {
    if (Object.keys(_memoryPdi).length === 0) {
      const seeded = createCarinaReferencePdi()
      _memoryPdi[seeded.studentId] = seeded
    }
    return _memoryPdi
  }
  try {
    const raw = localStorage.getItem(PDI_STORAGE_KEY)
    const parsed: Record<string, PdiRecord> = raw ? JSON.parse(raw) : {}
    // Garante que o PDI modelo da Carina Miranda de Oliveira esteja disponível caso não exista nenhum para ela
    const hasCarina = Object.values(parsed).some(
      r => r.studentName?.toLowerCase().includes('carina miranda')
    )
    if (!hasCarina) {
      const carina = createCarinaReferencePdi()
      parsed[carina.studentId] = carina
      localStorage.setItem(PDI_STORAGE_KEY, JSON.stringify(parsed))
    }
    _memoryPdi = parsed
    return parsed
  } catch {
    return _memoryPdi
  }
}

export function getStudentPdi(studentId: string): PdiRecord | null {
  const all = getAllPdiRecords()
  if (all[studentId]) return all[studentId]
  // Fallback por nome se o ID mudou entre roster e seed
  const byPartial = Object.values(all).find(r => r.studentId === studentId)
  return byPartial || null
}

/**
 * Salva o PDI localmente e dispara sincronização assíncrona com o Supabase Cloud.
 */
export function saveStudentPdi(pdi: PdiRecord): void {
  const all = getAllPdiRecords()
  const nowIso = new Date().toISOString()

  // Sincroniza identification <-> studentInfo / schoolInfo para manter compatibilidade total
  const ident: PdiIdentification = {
    ...(pdi.identification || {}),
    studentName: pdi.identification?.studentName || pdi.studentInfo?.studentName || pdi.studentName,
    gradeCycle: pdi.identification?.gradeCycle || pdi.studentInfo?.gradeCycle || '6º ano do Ensino Fundamental',
    shift: pdi.identification?.shift || pdi.studentInfo?.shift || 'Matutino',
    birthDate: pdi.identification?.birthDate ?? pdi.studentInfo?.birthDate ?? '',
    creationDate: pdi.identification?.creationDate || pdi.schoolInfo?.creationDate || '10/07/2026',
    curricularComponent:
      pdi.identification?.curricularComponent ||
      pdi.studentInfo?.curricularComponent ||
      `Língua Inglesa — ${pdi.identification?.gradeCycle || pdi.studentInfo?.gradeCycle || '6º ano do Ensino Fundamental'}`,
    regentTeacher: pdi.identification?.regentTeacher || pdi.studentInfo?.regentTeacher || 'Rafaela Franco Toldo',
    pedagogicalTeam: pdi.identification?.pedagogicalTeam || pdi.studentInfo?.pedagogicalTeam || 'Marianna Panisset',
    guardians: pdi.identification?.guardians ?? pdi.studentInfo?.guardians ?? '',
    validityPeriod: pdi.identification?.validityPeriod || pdi.studentInfo?.validityPeriod || '1º semestre / 2026',
    nextReviewDate: pdi.identification?.nextReviewDate || pdi.studentInfo?.nextReviewDate || 'Dezembro / 2026',
    schoolName: pdi.identification?.schoolName || pdi.schoolInfo?.schoolName || pdi.schoolName || 'Colégio Machado Sobrinho'
  }

  const updated: PdiRecord = {
    ...pdi,
    studentName: ident.studentName || pdi.studentName,
    schoolName: ident.schoolName || pdi.schoolName,
    identification: ident,
    schoolInfo: {
      ...pdi.schoolInfo,
      schoolName: ident.schoolName,
      creationDate: ident.creationDate
    },
    studentInfo: {
      ...pdi.studentInfo,
      studentName: ident.studentName,
      birthDate: ident.birthDate,
      gradeCycle: ident.gradeCycle,
      shift: ident.shift,
      curricularComponent: ident.curricularComponent,
      regentTeacher: ident.regentTeacher,
      pedagogicalTeam: ident.pedagogicalTeam,
      guardians: ident.guardians,
      validityPeriod: ident.validityPeriod,
      nextReviewDate: ident.nextReviewDate
    },
    updatedAt: nowIso
  }

  all[pdi.studentId] = updated
  _memoryPdi = all

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(PDI_STORAGE_KEY, JSON.stringify(all))
      window.dispatchEvent(new CustomEvent('teacher:pdi_changed', { detail: updated }))
    } catch (e) {
      console.error('[pdiManagement] Erro ao salvar PDI:', e)
    }
  }

  // Persiste no Supabase em background
  void syncPdiToSupabase(all)
}

/**
 * Sincroniza todos os registros de PDI e arquivo de histórico com o Supabase Cloud.
 */
export async function syncPdiToSupabase(
  recordsOverride?: Record<string, PdiRecord>
): Promise<{ ok: boolean; error?: string }> {
  try {
    const all = recordsOverride || getAllPdiRecords()
    const archive =
      typeof window !== 'undefined'
        ? JSON.parse(localStorage.getItem(PDI_ARCHIVE_STORAGE_KEY) || '{}')
        : _memoryPdiArchive
    return await syncToSupabase({
      [PDI_STORAGE_KEY]: all,
      [PDI_ARCHIVE_STORAGE_KEY]: archive
    })
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Falha ao sincronizar PDI com Supabase' }
  }
}

/**
 * Carrega e hidrata os PDIs salvos no Supabase Cloud.
 */
export async function hydratePdisFromSupabase(): Promise<{ ok: boolean; count: number }> {
  try {
    const res = await loadFromSupabase()
    const all = getAllPdiRecords()
    return { ok: res.ok, count: Object.keys(all).length }
  } catch {
    const all = getAllPdiRecords()
    return { ok: false, count: Object.keys(all).length }
  }
}

export function getStudentPdiArchive(studentId: string): PdiRecord[] {
  if (typeof window === 'undefined') return _memoryPdiArchive[studentId] || []
  try {
    const raw = localStorage.getItem(PDI_ARCHIVE_STORAGE_KEY)
    const archive = raw ? JSON.parse(raw) : {}
    return archive[studentId] || []
  } catch {
    return []
  }
}

export function archiveStudentPdi(studentId: string): boolean {
  const current = getStudentPdi(studentId)
  if (!current) return false

  const archivedRecord: PdiRecord = {
    ...current,
    status: 'archived',
    updatedAt: new Date().toISOString()
  }

  const archive =
    typeof window !== 'undefined'
      ? JSON.parse(localStorage.getItem(PDI_ARCHIVE_STORAGE_KEY) || '{}')
      : _memoryPdiArchive

  if (!archive[studentId]) archive[studentId] = []
  archive[studentId].unshift(archivedRecord)
  _memoryPdiArchive = archive

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(PDI_ARCHIVE_STORAGE_KEY, JSON.stringify(archive))
      const all = getAllPdiRecords()
      delete all[studentId]
      localStorage.setItem(PDI_STORAGE_KEY, JSON.stringify(all))
      window.dispatchEvent(new CustomEvent('teacher:pdi_changed', { detail: { studentId, archived: true } }))
      void syncPdiToSupabase(all)
      return true
    } catch {
      return false
    }
  }
  return true
}

/**
 * Avança o PDI do aluno para o próximo semestre (ex: 1º semestre / 2026 -> 2º semestre / 2026),
 * arquivando uma fotografia completa do semestre anterior e mantendo o status anterior
 * (`previousSemesterStatus`) em cada habilidade BNCC para avaliar se o aluno concluiu (`Sim`)
 * as competências que estavam `"Em desenvolvimento"` ou `"Não"`.
 */
export function advancePdiToNextSemester(
  studentId: string,
  nextValidityPeriod: string = '2º semestre / 2026',
  nextReviewDate: string = 'Julho / 2027'
): PdiRecord | null {
  const current = getStudentPdi(studentId)
  if (!current) return null

  const previousPeriod =
    current.identification?.validityPeriod ||
    current.studentInfo?.validityPeriod ||
    '1º semestre / 2026'

  const normalizedRows = (current.skillsMatrix || []).map(row => ({
    ...row,
    normalized: normalizePdiSkillStatus(row.status)
  }))

  const snapshot: PdiSemesterSnapshot = {
    id: `sem_${Date.now()}`,
    period: previousPeriod,
    archivedAt: new Date().toISOString(),
    summaryStats: {
      total: normalizedRows.length,
      mastered: normalizedRows.filter(r => r.normalized === 'Sim').length,
      developing: normalizedRows.filter(r => r.normalized === 'Em desenvolvimento').length,
      notMastered: normalizedRows.filter(r => r.normalized === 'Não').length
    },
    skillsSnapshot: normalizedRows.map(r => ({
      skillCode: r.skillCode,
      status: r.normalized,
      observations: r.workDoneOrAdaptedSkill || ''
    })),
    generalEvolutionSnapshot: current.generalObservations?.evolucaoGeral || '',
    reviewNotesSnapshot: current.followUpReview?.revisaoPeriodica || ''
  }

  // Também salva uma cópia no arquivo de versões
  const archive =
    typeof window !== 'undefined'
      ? JSON.parse(localStorage.getItem(PDI_ARCHIVE_STORAGE_KEY) || '{}')
      : _memoryPdiArchive
  if (!archive[studentId]) archive[studentId] = []
  archive[studentId].unshift({
    ...current,
    id: `${current.id}_archive_${Date.now()}`,
    status: 'archived',
    updatedAt: new Date().toISOString()
  })
  _memoryPdiArchive = archive
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(PDI_ARCHIVE_STORAGE_KEY, JSON.stringify(archive))
    } catch { /* ignore */ }
  }

  // Atualiza cada habilidade preservando o status do semestre anterior para acompanhamento
  const updatedSkills: SkillsMatrixRow[] = (current.skillsMatrix || []).map(row => {
    const prevStatus = normalizePdiSkillStatus(row.status)
    const wasScheduledFor2ndSem = (row.workDoneOrAdaptedSkill || '')
      .toLowerCase()
      .includes('segundo semestre')
    return {
      ...row,
      previousSemesterStatus: prevStatus,
      previousSemesterPeriod: previousPeriod,
      // Se estava previsto para ser trabalhado no segundo semestre, entra "Em desenvolvimento"
      status: wasScheduledFor2ndSem && prevStatus === 'Não' ? 'Em desenvolvimento' : prevStatus,
      workDoneOrAdaptedSkill: wasScheduledFor2ndSem
        ? `Em foco neste semestre (Anterior: ${prevStatus} — ${row.workDoneOrAdaptedSkill})`
        : row.workDoneOrAdaptedSkill
    }
  })

  const nextRecord: PdiRecord = {
    ...current,
    identification: {
      ...(current.identification || {}),
      validityPeriod: nextValidityPeriod,
      nextReviewDate,
      creationDate: new Date().toLocaleDateString('pt-BR')
    },
    studentInfo: {
      ...(current.studentInfo || {}),
      validityPeriod: nextValidityPeriod,
      nextReviewDate
    },
    skillsMatrix: updatedSkills,
    followUpReview: {
      revisaoPeriodica: current.followUpReview?.revisaoPeriodica || CANONICAL_PDI_REVIEW_TEXT,
      parecerProximoSemestre:
        current.followUpReview?.parecerProximoSemestre ||
        `Ciclo iniciado em ${nextValidityPeriod} (Transição de ${previousPeriod}). Avaliar conclusão das habilidades anteriormente "Em desenvolvimento" (${snapshot.summaryStats.developing}) e "Não" (${snapshot.summaryStats.notMastered}).`
    },
    semesterHistory: [snapshot, ...(current.semesterHistory || [])],
    updatedAt: new Date().toISOString()
  }

  saveStudentPdi(nextRecord)
  return nextRecord
}

/**
 * Registra a avaliação de competências BNCC do PDI a partir de uma Prova ou Atividade
 * aplicada ao aluno, atualizando diretamente o status da habilidade ("Sim" | "Em desenvolvimento" | "Não")
 * e sincronizando com o Supabase.
 */
export function recordPdiCompetencyEvaluation(
  studentId: string,
  activityTitle: string,
  evaluations: Array<{
    skillCode: string
    status: 'Sim' | 'Em desenvolvimento' | 'Não'
    note?: string
  }>,
  activityId?: string
): PdiRecord | null {
  const current = getStudentPdi(studentId)
  if (!current) return null

  const evalMap = new Map(evaluations.map(e => [e.skillCode.trim().toUpperCase(), e]))
  const today = new Date().toLocaleDateString('pt-BR')

  const updatedMatrix = (current.skillsMatrix || []).map(row => {
    const codeKey = (row.skillCode || '').trim().toUpperCase()
    const match = evalMap.get(codeKey)
    if (!match) return row

    const prevActivities = Array.isArray(row.evaluatedInActivities) ? row.evaluatedInActivities : []
    const newEntry = {
      activityId,
      activityTitle,
      date: today,
      status: match.status,
      note: match.note
    }

    const updatedObs = match.note
      ? `${row.workDoneOrAdaptedSkill ? row.workDoneOrAdaptedSkill + ' | ' : ''}[${activityTitle} - ${today}]: ${match.note}`
      : row.workDoneOrAdaptedSkill

    return {
      ...row,
      status: match.status,
      workDoneOrAdaptedSkill: updatedObs,
      evaluatedInActivities: [newEntry, ...prevActivities]
    }
  })

  const updated: PdiRecord = {
    ...current,
    skillsMatrix: updatedMatrix,
    updatedAt: new Date().toISOString()
  }

  saveStudentPdi(updated)
  return updated
}

export function deleteStudentPdi(studentId: string): boolean {
  const all = getAllPdiRecords()
  delete all[studentId]
  _memoryPdi = all
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(PDI_STORAGE_KEY, JSON.stringify(all))
      window.dispatchEvent(new CustomEvent('teacher:pdi_changed', { detail: { studentId, deleted: true } }))
      void syncPdiToSupabase(all)
      return true
    } catch {
      return false
    }
  }
  return true
}

export function createDefaultPdi(
  studentId: string,
  studentName: string,
  classId?: string,
  schoolName: string = 'Colégio Machado Sobrinho',
  gradeCycle: string = '6º ano do Ensino Fundamental'
): PdiRecord {
  const isCarina = studentName.toLowerCase().includes('carina miranda')
  if (isCarina) {
    return createCarinaReferencePdi(studentId, studentName, classId, schoolName)
  }

  const todayBr = new Date().toLocaleDateString('pt-BR')
  const nowIso = new Date().toISOString()
  const componentLabel = `Língua Inglesa — ${gradeCycle}`

  const identification: PdiIdentification = {
    studentName,
    gradeCycle,
    shift: 'Matutino',
    birthDate: '',
    creationDate: todayBr,
    curricularComponent: componentLabel,
    regentTeacher: 'Rafaela Franco Toldo',
    pedagogicalTeam: 'Marianna Panisset',
    guardians: '',
    validityPeriod: '1º semestre / 2026',
    nextReviewDate: 'Dezembro / 2026',
    schoolName,
    city: 'Juiz de Fora - MG',
    directors: 'Marianna Panisset'
  }

  return {
    id: `pdi_${studentId}_${Date.now()}`,
    studentId,
    studentName,
    classId,
    schoolName,
    academicYear: String(new Date().getFullYear()),
    status: 'active',
    identification,
    schoolInfo: {
      schoolName,
      city: 'Juiz de Fora - MG',
      directors: 'Marianna Panisset',
      creationDate: new Date().toISOString().split('T')[0]
    },
    studentInfo: {
      studentName,
      birthDate: '',
      gradeCycle,
      shift: 'Matutino',
      curricularComponent: componentLabel,
      regentTeacher: 'Rafaela Franco Toldo',
      pedagogicalTeam: 'Marianna Panisset',
      guardians: '',
      validityPeriod: '1º semestre / 2026',
      nextReviewDate: 'Dezembro / 2026',
      fatherName: '',
      motherName: ''
    },
    generalObjective: {
      objetivoGeral: `Acompanhar e apoiar o desenvolvimento do(a) aluno(a) no componente curricular de Língua Inglesa, monitorando o alcance progressivo das habilidades previstas pela BNCC para o ${gradeCycle}, com estratégias pedagógicas individualizadas, revisão periódica e registro contínuo dos avanços.`
    },
    interventionPlan: CANONICAL_PDI_STRATEGIES.map(s => ({ ...s })),
    skillsMatrix: buildBnccSkillsMatrixForGrade(gradeCycle, false),
    generalObservations: {
      evolucaoGeral:
        'O(a) estudante apresenta bom desenvolvimento no uso da língua inglesa, participando das atividades propostas em sala de aula com mediação pedagógica.'
    },
    followUpReview: {
      revisaoPeriodica: CANONICAL_PDI_REVIEW_TEXT,
      parecerProximoSemestre: ''
    },
    clinicalReport: {
      hasClinicalDiagnosis: false,
      cid10: '',
      professionalName: '',
      reportDate: '',
      specializedServices: '',
      medication: ''
    },
    developmentAssessment: {
      percepcao: 'Em observação pedagógica inicial.',
      atencao: 'Necessita de mediação para sustentação de foco prolongado.',
      memoria: 'Boa retenção com recursos visuais e repetição espaçada.',
      linguagem: 'Compreensão satisfatória; expressão oral participativa.',
      raciocinio: 'Evolução consistente na resolução de problemas concretos.',
      emocional: 'Boa relação interpessoal com a turma.'
    },
    curricularProposal: {
      proposta: CANONICAL_PDI_OBJECTIVE_TEXT
    },
    signatures: [
      { role: 'Professor(a) regente', name: 'Rafaela Franco Toldo', signed: false },
      { role: 'Coordenação pedagógica', name: 'Marianna Panisset', signed: false },
      { role: 'Responsável pelo(a) aluno(a)', name: '', signed: false },
      { role: 'Data', name: todayBr, signed: false }
    ],
    semesterHistory: [],
    createdAt: nowIso,
    updatedAt: nowIso
  }
}
