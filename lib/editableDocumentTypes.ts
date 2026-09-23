/**
 * lib/editableDocumentTypes.ts
 *
 * Padrão Arquitetural: "Documento = lista ordenada de Boxes editáveis"
 * Suporta Aula, PEI, PDI e Projeto com tipagem unificada e schemas declarativos.
 */

export type DocumentType = 'pdi' | 'pei' | 'projeto' | 'aula'

export type BoxType =
  | 'header_fields'
  | 'checklist_conditional'
  | 'rich_narrative'
  | 'skills_matrix_table'
  | 'goal_tracker'
  | 'strategy_list'
  | 'signature_block'
  // Tipos exclusivos de Projeto:
  | 'milestone_tracker'
  | 'rubric_builder'
  | 'progress_log'

export interface FieldDefinition {
  key: string
  label: string
  type: 'text' | 'textarea' | 'date' | 'select' | 'number'
  placeholder?: string
  options?: string[]
  defaultValue?: any
  readOnly?: boolean
  helpText?: string
}

export interface BoxSchema {
  id: string
  title: string
  description?: string
  boxType: BoxType
  required?: boolean
  config?: Record<string, any>
}

export interface DocumentSchema {
  type: DocumentType
  title: string
  description: string
  boxes: BoxSchema[]
}

// ─── ESTRUTURAS ESPECÍFICAS DE DADOS DOS BOXES ──────────────────────────────

export interface SkillsMatrixRow {
  id: string
  subject: string
  skillCode: string
  skillDescription: string
  workDoneOrAdaptedSkill: string
  status: 'HV' | 'HED' | 'HNV' | 'em_andamento' | 'concluida'
  criterion?: string
}

export interface DocumentGoalItem {
  id: string
  title: string
  category?: string
  baseline?: string
  target: string
  deadline: string
  status: 'pending' | 'in_progress' | 'achieved' | 'review' | 'active'
  progressPct?: number
}

export interface DocumentStrategyItem {
  id: string
  type?: string
  description: string
  isActive: boolean
}

export interface DocumentMilestoneItem {
  id: string
  title: string
  expectedDate: string
  deliverable: string
  status: 'pendente' | 'em_andamento' | 'concluido' | 'atrasado'
  notes?: string
}

export interface RubricCriterionLevel {
  label: string // ex: "Insuficiente", "Adequado", "Avançado"
  score: number // ex: 1, 2, 3
  description: string
}

export interface RubricCriterionItem {
  id: string
  name: string
  weight: number
  levels: RubricCriterionLevel[]
}

export interface ProgressLogEntry {
  id: string
  date: string
  author: string
  milestoneRef?: string
  notes: string
  challenges?: string
  nextSteps?: string
}

export interface SignatureItem {
  role: string
  name: string
  signed: boolean
  signedAt?: string
}

// ─── SCHEMA DO PDI (Extraído do Documento Oficial Escolar) ───────────────────
export const PDI_SCHEMA: DocumentSchema = {
  type: 'pdi',
  title: 'Plano de Desenvolvimento Individual (PDI)',
  description: 'Documento pedagógico de intervenção, desenvolvimento cognitivo e acompanhamento de habilidades.',
  boxes: [
    {
      id: 'dados_escola',
      title: '1. Dados da Instituição de Ensino',
      description: 'Identificação da escola, município e equipe gestora responsável.',
      boxType: 'header_fields',
      config: {
        fields: [
          { key: 'schoolName', label: 'Nome da Escola', type: 'text', placeholder: 'Ex: Colégio Machado Sobrinho' },
          { key: 'city', label: 'Município / UF', type: 'text', placeholder: 'Ex: Juiz de Fora - MG' },
          { key: 'directors', label: 'Direção / Coordenação Responsável', type: 'text', placeholder: 'Nomes da direção pedagógica' },
          { key: 'creationDate', label: 'Data de Elaboração', type: 'date' }
        ]
      }
    },
    {
      id: 'identificacao_aluno',
      title: '2. Identificação do Aluno',
      description: 'Dados cadastrais do estudante e filiação.',
      boxType: 'header_fields',
      config: {
        fields: [
          { key: 'studentName', label: 'Nome Completo do Aluno', type: 'text', placeholder: 'Nome do aluno' },
          { key: 'birthDate', label: 'Data de Nascimento', type: 'date' },
          { key: 'gradeCycle', label: 'Ano / Série / Ciclo', type: 'text', placeholder: 'Ex: 8º Ano do Ensino Fundamental' },
          { key: 'fatherName', label: 'Filiação (Pai)', type: 'text', placeholder: 'Nome do pai' },
          { key: 'motherName', label: 'Filiação (Mãe / Responsável)', type: 'text', placeholder: 'Nome da mãe ou responsável legal' }
        ]
      }
    },
    {
      id: 'relatorio_circunstanciado',
      title: '3. Relatório Circunstanciado & Laudo Clínico',
      description: 'Registro de acompanhamento clínico, diagnóstico médico e medicações.',
      boxType: 'checklist_conditional',
      config: {
        questionLabel: 'Há diagnóstico clínico ou laudo pericial formal?',
        conditionalFields: [
          { key: 'cid10', label: 'CID-10 / Diagnóstico Formal', type: 'text', placeholder: 'Ex: F84.0 (TEA), F90 (TDAH), etc.' },
          { key: 'professionalName', label: 'Profissional Emissor', type: 'text', placeholder: 'Médico, Neurologista ou Psiquiatra' },
          { key: 'reportDate', label: 'Data do Laudo', type: 'date' },
          { key: 'specializedServices', label: 'Acompanhamentos Especializados', type: 'text', placeholder: 'Psicologia, Fonoaudiologia, T.O., etc.' },
          { key: 'medication', label: 'Uso de Medicação', type: 'text', placeholder: 'Nome da medicação e posologia, se relevante' }
        ]
      }
    },
    {
      id: 'avaliacao_inicial',
      title: '4. Avaliação Inicial das Funções de Desenvolvimento',
      description: 'Mapeamento das funções cognitivas, linguísticas e socioafetivas do estudante.',
      boxType: 'rich_narrative',
      config: {
        subsections: [
          { key: 'percepcao', title: 'Percepção', placeholder: 'Discriminação visual, auditiva, espacial e temporal...' },
          { key: 'atencao', title: 'Atenção', placeholder: 'Atenção sustentada, alternada, tempo de foco e dispersão...' },
          { key: 'memoria', title: 'Memória', placeholder: 'Memória operacional, de curto e longo prazo...' },
          { key: 'linguagem', title: 'Linguagem', placeholder: 'Expressão oral, compreensão, vocabulário e leitura...' },
          { key: 'raciocinio', title: 'Raciocínio Lógico-Matemático', placeholder: 'Noções de número, operações, resolução de problemas...' },
          { key: 'emocional', title: 'Área Emocional-Afetiva-Social', placeholder: 'Interação com pares, autorregulação, frustração e vínculos...' }
        ],
        aiAssistPrompt: 'Gere um rascunho descritivo pedagógico para as funções de desenvolvimento do aluno com base no perfil e observações registradas.'
      }
    },
    {
      id: 'proposta_curricular',
      title: '5. Proposta Curricular Diferenciada',
      description: 'Síntese das prioridades pedagógicas e objetivos do período letivo.',
      boxType: 'rich_narrative',
      config: {
        subsections: [
          { key: 'proposta', title: 'Diretriz da Proposta', placeholder: 'Descreva a abordagem prioritária de aprendizagem para o ciclo...' }
        ],
        aiAssistPrompt: 'Sintetize uma proposta curricular inclusiva em um parágrafo claro e acolhedor.'
      }
    },
    {
      id: 'matriz_habilidades',
      title: '6. Matriz de Habilidades BNCC Adaptadas',
      description: 'Mapeamento curricular por disciplina com status de aquisição (HV: Validada • HED: Em Desenvolvimento • HNV: Não Validada).',
      boxType: 'skills_matrix_table',
      config: {
        mode: 'pdi',
        columns: ['Disciplina', 'Habilidade BNCC', 'Como foi trabalhado', 'Status (HV/HED/HNV)']
      }
    },
    {
      id: 'plano_intervencao',
      title: '7. Plano de Intervenção Pedagógica & AEE',
      description: 'Estratégias metodológicas adotadas em sala de aula e no Atendimento Educacional Especializado.',
      boxType: 'strategy_list',
      config: {
        category: 'intervention',
        defaultStrategies: [
          'Instruções verbais curtas divididas em etapas',
          'Uso de recursos visuais e esquemas gráficos',
          'Tempo adicional (+50%) em avaliações e tarefas',
          'Avaliações com número reduzido de distratores',
          'Pausas pedagógicas sensoriais programadas'
        ]
      }
    },
    {
      id: 'assinaturas',
      title: '8. Termo de Assinatura & Ciência',
      description: 'Validação da equipe escolar multiprofissional.',
      boxType: 'signature_block',
      config: {
        roles: ['Direção Pedagógica', 'Professores Regentes', 'Coordenação Pedagógica', 'Orientação Educacional / AEE']
      }
    }
  ]
}

// ─── SCHEMA DO PEI (Plano Educacional Individualizado / IEP) ────────────────
export const PEI_SCHEMA: DocumentSchema = {
  type: 'pei',
  title: 'Plano Educacional Individualizado (PEI)',
  description: 'Documento individualizado com metas SMART, flexibilização curricular e acomodações assistivas.',
  boxes: [
    {
      id: 'identificacao_equipe',
      title: '1. Identificação do Aluno & Equipe Multidisciplinar',
      description: 'Dados do estudante e profissionais de suporte envolvidos.',
      boxType: 'header_fields',
      config: {
        fields: [
          { key: 'studentName', label: 'Nome do Aluno', type: 'text', placeholder: 'Nome do estudante' },
          { key: 'gradeYear', label: 'Turma / Ano Escolar', type: 'text', placeholder: 'Ex: 9º Ano B' },
          { key: 'headTeacher', label: 'Professor(a) Regente', type: 'text', placeholder: 'Nome do professor regente' },
          { key: 'specialists', label: 'Especialistas / AEE', type: 'text', placeholder: 'Psicopedagoga, Fonoaudióloga, Tutor...' },
          { key: 'coordinator', label: 'Coordenação Pedagógica', type: 'text', placeholder: 'Nome do(a) coordenador(a)' }
        ]
      }
    },
    {
      id: 'diagnostico_clinico',
      title: '2. Diagnóstico Clínico & Laudo',
      description: 'Informações médicas e diagnósticas que orientam as acomodações.',
      boxType: 'checklist_conditional',
      config: {
        questionLabel: 'Estudante laudado com laudo médico arquivado na instituição?',
        conditionalFields: [
          { key: 'diagnosis', label: 'Diagnóstico Principal / Condição', type: 'text', placeholder: 'Ex: TEA Nível 1 de suporte, TDAH, Dislexia...' },
          { key: 'cid10', label: 'Código CID-10', type: 'text', placeholder: 'Ex: F84.0' },
          { key: 'issuedBy', label: 'Médico / Profissional Emissor', type: 'text', placeholder: 'Dr(a)...' },
          { key: 'issuedDate', label: 'Data da Emissão do Laudo', type: 'date' }
        ]
      }
    },
    {
      id: 'flexibilizacao_curricular',
      title: '3. Flexibilização Curricular (Habilidades BNCC da Turma vs. Adaptadas)',
      description: 'Mapeamento das habilidades trabalhadas na turma com a devida adaptação e critério de êxito diferenciado.',
      boxType: 'skills_matrix_table',
      config: {
        mode: 'pei',
        columns: ['Habilidade BNCC da Turma', 'Habilidade Adaptada para o Aluno', 'Critério de Êxito Diferenciado']
      }
    },
    {
      id: 'metas_smart',
      title: '4. Metas SMART Prioritárias',
      description: 'Objetivos específicos, mensuráveis, atingíveis, relevantes e temporais com linha de base.',
      boxType: 'goal_tracker',
      config: {}
    },
    {
      id: 'acomodacoes',
      title: '5. Acomodações Curriculares & Tecnologias Assistivas',
      description: 'Adaptações ativas de acesso, formato e tempo para avaliações e atividades.',
      boxType: 'strategy_list',
      config: {
        category: 'accommodation',
        defaultStrategies: [
          '+50% de tempo adicional em atividades e avaliações',
          'Adaptação para 3 alternativas em vez de 4 ou 5',
          'Ledor / Escriba para provas discursivas',
          'Fonte ampliada (16pt+) e espaçamento 1.5',
          'Uso de fones antirruído para regulação sensorial'
        ]
      }
    },
    {
      id: 'plano_aee',
      title: '6. Atendimento Educacional Especializado (AEE)',
      description: 'Frequência, horários e objetivos específicos da sala de recursos.',
      boxType: 'header_fields',
      config: {
        fields: [
          { key: 'aeeFrequency', label: 'Frequência Semanal', type: 'text', placeholder: 'Ex: 2x por semana (50 min cada)' },
          { key: 'aeeSchedule', label: 'Horário / Turno', type: 'text', placeholder: 'Ex: Terças e Quintas no Contraturno' },
          { key: 'aeeObjectives', label: 'Objetivos Centrais do AEE', type: 'textarea', placeholder: 'Desenvolvimento de estratégias de leitura mediada...' }
        ]
      }
    },
    {
      id: 'evolucao_longitudinal',
      title: '7. Parecer Descritivo de Evolução Longitudinal',
      description: 'Síntese das conquistas e avanços do estudante ao longo do período letivo.',
      boxType: 'rich_narrative',
      config: {
        subsections: [
          { key: 'parecer', title: 'Parecer do Período', placeholder: 'Descreva os avanços observados em relação às metas SMART...' }
        ],
        aiAssistPrompt: 'Redija um rascunho de parecer evolutivo com base no histórico de progresso das metas e observações pedagógicas.'
      }
    },
    {
      id: 'assinaturas',
      title: '8. Validação & Assinaturas',
      description: 'Assinaturas dos envolvidos no plano.',
      boxType: 'signature_block',
      config: {
        roles: ['Professor(a) Regente', 'Professor(a) AEE', 'Coordenação Pedagógica', 'Responsável pelo Aluno']
      }
    }
  ]
}

// ─── SCHEMA DE PROJETO (PBL / Interdisciplinar / Longo Prazo) ───────────────
export const PROJETO_SCHEMA: DocumentSchema = {
  type: 'projeto',
  title: 'Projeto Pedagógico Interdisciplinar / PBL',
  description: 'Estruturação de projetos investigativos de médio/longo prazo com marcos, entregáveis e rubricas.',
  boxes: [
    {
      id: 'identificacao_projeto',
      title: '1. Identificação do Projeto',
      description: 'Título, disciplinas conectadas, turmas envolvidas e cronograma geral.',
      boxType: 'header_fields',
      config: {
        fields: [
          { key: 'title', label: 'Título do Projeto', type: 'text', placeholder: 'Ex: EcoCidade: Soluções Sustentáveis para Juiz de Fora' },
          { key: 'subjects', label: 'Disciplinas Envolvidas', type: 'text', placeholder: 'Ex: Ciências, Geografia, Língua Inglesa, Matemática' },
          { key: 'classes', label: 'Turmas Participantes', type: 'text', placeholder: 'Ex: 8º Ano A, 8º Ano B' },
          { key: 'durationWeeks', label: 'Duração Estimada (Semanas)', type: 'number', placeholder: '6' },
          { key: 'startDate', label: 'Data de Início', type: 'date' },
          { key: 'endDate', label: 'Data Prevista de Conclusão / Apresentação', type: 'date' }
        ]
      }
    },
    {
      id: 'pergunta_norteadora',
      title: '2. Pergunta Norteadora & Produto Final',
      description: 'A pergunta-guia desafiadora (Driving Question) e a materialização autêntica do projeto.',
      boxType: 'rich_narrative',
      config: {
        subsections: [
          { key: 'drivingQuestion', title: 'Pergunta Norteadora (Driving Question)', placeholder: 'Ex: Como podemos reduzir o desperdício de alimentos na nossa escola em 30%?' },
          { key: 'finalProduct', title: 'Produto Final Esperado', placeholder: 'Ex: Campanha de conscientização com podcasts bilíngues, infográficos e protótipo de composteira.' }
        ],
        aiAssistPrompt: 'Sugira uma pergunta norteadora instigante e produtos finais autênticos com base no tema e disciplinas do projeto.'
      }
    },
    {
      id: 'habilidades_bncc_alvo',
      title: '3. Habilidades BNCC Conectadas',
      description: 'Habilidades de diferentes componentes curriculares desenvolvidas pelo projeto.',
      boxType: 'skills_matrix_table',
      config: {
        mode: 'projeto',
        columns: ['Disciplina', 'Habilidade BNCC', 'Papel no Projeto']
      }
    },
    {
      id: 'cronograma_marcos',
      title: '4. Cronograma de Marcos & Entregáveis (Milestones)',
      description: 'Etapas intermediárias ao longo das semanas com entregas pontuais e acompanhamento de status.',
      boxType: 'milestone_tracker',
      config: {}
    },
    {
      id: 'papeis_equipe',
      title: '5. Papéis na Equipe & Dinâmica de Grupo',
      description: 'Estruturação dos papéis colaborativos dos estudantes e critérios de composição.',
      boxType: 'strategy_list',
      config: {
        category: 'team_roles',
        defaultStrategies: [
          'Líder / Facilitador: Coordena reuniões e prazos',
          'Pesquisador / Curador: Busca e valida fontes de informação',
          'Projetista / Maker: Constrói protótipos e diagramas',
          'Relator / Comunicador: Redige sínteses e organiza a apresentação'
        ]
      }
    },
    {
      id: 'rubrica_avaliativa',
      title: '6. Rubrica Avaliativa do Projeto',
      description: 'Matriz com critérios formativos, pesos e níveis de desempenho.',
      boxType: 'rubric_builder',
      config: {}
    },
    {
      id: 'registro_acompanhamento',
      title: '7. Diário de Bordo & Registro de Acompanhamento',
      description: 'Notas periódicas do professor observando o avanço, desafios e redirecionamentos das equipes.',
      boxType: 'progress_log',
      config: {}
    }
  ]
}

export function getSchemaForType(type: DocumentType): DocumentSchema {
  switch (type) {
    case 'pdi':
      return PDI_SCHEMA
    case 'pei':
      return PEI_SCHEMA
    case 'projeto':
      return PROJETO_SCHEMA
    default:
      return PDI_SCHEMA
  }
}
