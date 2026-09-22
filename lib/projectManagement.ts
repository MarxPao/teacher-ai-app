/**
 * lib/projectManagement.ts — Gerenciamento e Persistência de Projetos Pedagógicos Interdisciplinares / PBL
 */

import {
  SkillsMatrixRow,
  DocumentMilestoneItem,
  DocumentStrategyItem,
  RubricCriterionItem,
  ProgressLogEntry
} from './editableDocumentTypes'

export interface ProjectRecord {
  id: string
  title: string
  schoolName?: string
  subjects: string[]
  classes: string[]
  durationWeeks: number
  startDate: string
  endDate: string
  status: 'planejado' | 'em_andamento' | 'concluido' | 'atrasado'

  // Pergunta norteadora e produto final
  drivingQuestion: string
  finalProduct: string

  // Habilidades BNCC
  targetSkills: SkillsMatrixRow[]

  // Cronograma de Marcos (Milestones)
  milestones: DocumentMilestoneItem[]

  // Papéis e dinâmica de equipe
  teamRoles: DocumentStrategyItem[]

  // Rubrica Avaliativa
  rubric: RubricCriterionItem[]

  // Diário de bordo e acompanhamento
  progressLogs: ProgressLogEntry[]

  createdAt: string
  updatedAt: string
}

const PROJECT_STORAGE_KEY = 'teacher_project_records_v1'

let _memoryProjects: ProjectRecord[] = []

export function getAllProjects(): ProjectRecord[] {
  if (typeof window === 'undefined') return _memoryProjects
  try {
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY)
    return raw ? JSON.parse(raw) : INITIAL_PROJECTS
  } catch {
    return INITIAL_PROJECTS
  }
}

export function getProjectById(id: string): ProjectRecord | null {
  const all = getAllProjects()
  return all.find(p => p.id === id) || null
}

export function saveProject(project: ProjectRecord): void {
  const all = getAllProjects()
  const idx = all.findIndex(p => p.id === project.id)
  const updated = {
    ...project,
    updatedAt: new Date().toISOString()
  }

  let nextList: ProjectRecord[]
  if (idx !== -1) {
    nextList = [...all]
    nextList[idx] = updated
  } else {
    nextList = [updated, ...all]
  }

  _memoryProjects = nextList
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(nextList))
      window.dispatchEvent(new CustomEvent('teacher:project_changed', { detail: updated }))
    } catch (e) {
      console.error('[projectManagement] Erro ao salvar Projeto:', e)
    }
  }
}

export function deleteProject(id: string): boolean {
  const all = getAllProjects()
  const nextList = all.filter(p => p.id !== id)
  _memoryProjects = nextList
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(nextList))
      window.dispatchEvent(new CustomEvent('teacher:project_changed', { detail: { id, deleted: true } }))
      return true
    } catch {
      return false
    }
  }
  return true
}

export function updateProjectMilestone(
  projectId: string,
  milestoneId: string,
  status: DocumentMilestoneItem['status']
): boolean {
  const project = getProjectById(projectId)
  if (!project) return false

  const updatedMilestones = project.milestones.map(m =>
    m.id === milestoneId ? { ...m, status } : m
  )

  // Recalcula status geral do projeto
  const allDone = updatedMilestones.every(m => m.status === 'concluido')
  const hasDelayed = updatedMilestones.some(m => m.status === 'atrasado')
  const newProjectStatus: ProjectRecord['status'] = allDone
    ? 'concluido'
    : hasDelayed
    ? 'atrasado'
    : 'em_andamento'

  saveProject({
    ...project,
    milestones: updatedMilestones,
    status: newProjectStatus
  })
  return true
}

export function addProjectLogEntry(
  projectId: string,
  entry: Omit<ProgressLogEntry, 'id'>
): boolean {
  const project = getProjectById(projectId)
  if (!project) return false

  const newEntry: ProgressLogEntry = {
    ...entry,
    id: `log_${Date.now()}`
  }

  saveProject({
    ...project,
    progressLogs: [newEntry, ...project.progressLogs]
  })
  return true
}

export const INITIAL_PROJECTS: ProjectRecord[] = [
  {
    id: 'proj_eco_2026',
    title: 'EcoCidade: Soluções Sustentáveis para Juiz de Fora',
    schoolName: 'Colégio Machado Sobrinho',
    subjects: ['Ciências', 'Geografia', 'Língua Inglesa'],
    classes: ['9º Ano B', '9º Ano A'],
    durationWeeks: 6,
    startDate: '2026-03-01',
    endDate: '2026-04-12',
    status: 'em_andamento',
    drivingQuestion: 'Como podemos transformar a gestão de resíduos e espaços verdes da nossa comunidade escolar?',
    finalProduct: 'Mural interativo bilíngue, podcasts investigativos e protótipo de horta vertical automatizada.',
    targetSkills: [
      {
        id: 'sk_p1',
        subject: 'Ciências',
        skillCode: 'EF09CI13',
        skillDescription: 'Propor iniciativas individuais e coletivas para a conservação da biodiversidade.',
        workDoneOrAdaptedSkill: 'Pesquisa empírica de campo no entorno do colégio.',
        status: 'em_andamento'
      },
      {
        id: 'sk_p2',
        subject: 'Língua Inglesa',
        skillCode: 'EF09LI12',
        skillDescription: 'Produzir textos com o uso de estratégias de escrita apontando soluções sustentáveis.',
        workDoneOrAdaptedSkill: 'Gravação de podcasts curtos (3-5 min) em inglês sobre eco-soluções.',
        status: 'em_andamento'
      }
    ],
    milestones: [
      {
        id: 'm1',
        title: 'Marco 1: Lançamento do Projeto & Pergunta-Guia',
        expectedDate: '2026-03-05',
        deliverable: 'Painel de Brainstorming e Mapa de Problemas Locais',
        status: 'concluido'
      },
      {
        id: 'm2',
        title: 'Marco 2: Pesquisa de Campo e Entrevistas',
        expectedDate: '2026-03-18',
        deliverable: 'Relatório Preliminar de Dados Coletados',
        status: 'concluido'
      },
      {
        id: 'm3',
        title: 'Marco 3: Prototipagem da Horta & Roteiro do Podcast',
        expectedDate: '2026-03-29',
        deliverable: 'Protótipo em escala reduzida e rascunho dos scripts em inglês',
        status: 'em_andamento'
      },
      {
        id: 'm4',
        title: 'Marco 4: Feira de Ciências & Apresentação Comunitária',
        expectedDate: '2026-04-12',
        deliverable: 'Apresentação oral com estande interativo e exibição dos episódios',
        status: 'pendente'
      }
    ],
    teamRoles: [
      { id: 'r1', description: 'Líder / Facilitador: Coordena reuniões e prazos', isActive: true },
      { id: 'r2', description: 'Pesquisador / Curador: Busca e valida fontes de informação', isActive: true },
      { id: 'r3', description: 'Projetista / Maker: Constrói protótipos e maquetes', isActive: true },
      { id: 'r4', description: 'Relator / Comunicador: Redige sínteses e organiza a apresentação', isActive: true }
    ],
    rubric: [
      {
        id: 'rub_1',
        name: 'Investigação e Rigor Científico',
        weight: 30,
        levels: [
          { label: 'Insuficiente', score: 1, description: 'Dados superficiais sem fontes confiáveis.' },
          { label: 'Adequado', score: 2, description: 'Pesquisa consistente com fontes validadas.' },
          { label: 'Avançado', score: 3, description: 'Análise aprofundada com cruzamento de dados locais e globais.' }
        ]
      },
      {
        id: 'rub_2',
        name: 'Comunicação e Fluência Bilíngue',
        weight: 35,
        levels: [
          { label: 'Insuficiente', score: 1, description: 'Vocabulário restrito com leitura mecânica.' },
          { label: 'Adequado', score: 2, description: 'Apresentação clara em inglês com suporte visual.' },
          { label: 'Avançado', score: 3, description: 'Discurso autônomo, pronúncia articulada e engajamento com o público.' }
        ]
      },
      {
        id: 'rub_3',
        name: 'Colaboração e Trabalho em Equipe',
        weight: 35,
        levels: [
          { label: 'Insuficiente', score: 1, description: 'Divisão desequilibrada de tarefas e pouca integração.' },
          { label: 'Adequado', score: 2, description: 'Todos os membros cumpriram seus papéis com respeito mútuo.' },
          { label: 'Avançado', score: 3, description: 'Sinergia exemplar, resolução autônoma de conflitos e suporte mútuo.' }
        ]
      }
    ],
    progressLogs: [
      {
        id: 'plog_1',
        date: '2026-03-19',
        author: 'Prof. Rafael',
        milestoneRef: 'Marco 2: Pesquisa de Campo',
        notes: 'As equipes apresentaram os primeiros dados coletados com a comunidade do bairro. A equipe 3 surpreendeu ao entrevistar feirantes sobre descarte orgânico.',
        nextSteps: 'Iniciar a escrita dos roteiros de podcast na aula de inglês de sexta-feira.'
      }
    ],
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-19T14:30:00.000Z'
  }
]

export function createDefaultProject(
  classId?: string,
  schoolName: string = 'Colégio Machado Sobrinho'
): ProjectRecord {
  const now = new Date().toISOString().split('T')[0]
  const end = new Date(Date.now() + 42 * 86400000).toISOString().split('T')[0] // 6 semanas

  return {
    id: `proj_${Date.now()}`,
    title: 'Novo Projeto Interdisciplinar',
    schoolName,
    subjects: ['Língua Inglesa'],
    classes: classId ? [classId] : ['Turma Geral'],
    durationWeeks: 6,
    startDate: now,
    endDate: end,
    status: 'planejado',
    drivingQuestion: 'Qual problema real da nossa comunidade podemos solucionar?',
    finalProduct: 'Campanha de conscientização com produto autêntico entregável.',
    targetSkills: [
      {
        id: 'sk_init_1',
        subject: 'Língua Inglesa',
        skillCode: 'EF08LI01',
        skillDescription: 'Fazer uso dos recursos linguísticos para expressar ideias e experiências.',
        workDoneOrAdaptedSkill: 'Produção colaborativa do projeto.',
        status: 'em_andamento'
      }
    ],
    milestones: [
      {
        id: 'm_init_1',
        title: 'Marco 1: Lançamento do Projeto & Pergunta-Guia',
        expectedDate: now,
        deliverable: 'Mapa de ideias e definição de equipes',
        status: 'em_andamento'
      },
      {
        id: 'm_init_2',
        title: 'Marco 2: Pesquisa e Prototipagem',
        expectedDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
        deliverable: 'Esboço do produto final e validação preliminar',
        status: 'pendente'
      },
      {
        id: 'm_init_3',
        title: 'Marco 3: Apresentação Final e Avaliação',
        expectedDate: end,
        deliverable: 'Exposição pública e avaliação com rubrica',
        status: 'pendente'
      }
    ],
    teamRoles: [
      { id: 'r_init_1', description: 'Líder / Facilitador', isActive: true },
      { id: 'r_init_2', description: 'Pesquisador / Curador', isActive: true },
      { id: 'r_init_3', description: 'Projetista / Maker', isActive: true },
      { id: 'r_init_4', description: 'Relator / Comunicador', isActive: true }
    ],
    rubric: [
      {
        id: 'rub_init_1',
        name: 'Qualidade do Entregável Final',
        weight: 50,
        levels: [
          { label: 'Insuficiente', score: 1, description: 'Incompleto ou sem conexão com a pergunta-guia.' },
          { label: 'Adequado', score: 2, description: 'Produto atende a todos os requisitos mínimos.' },
          { label: 'Avançado', score: 3, description: 'Produto autêntico com impacto além da sala de aula.' }
        ]
      },
      {
        id: 'rub_init_2',
        name: 'Engajamento e Colaboração',
        weight: 50,
        levels: [
          { label: 'Insuficiente', score: 1, description: 'Baixa participação da equipe.' },
          { label: 'Adequado', score: 2, description: 'Boa distribuição de tarefas.' },
          { label: 'Avançado', score: 3, description: 'Liderança compartilhada e alta proatividade.' }
        ]
      }
    ],
    progressLogs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}
