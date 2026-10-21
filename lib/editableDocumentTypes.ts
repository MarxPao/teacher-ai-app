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
  /** Observações ou Como foi trabalhado / Habilidade adaptada */
  workDoneOrAdaptedSkill: string
  /** Status oficial do PDI ("Sim" | "Em desenvolvimento" | "Não") ou códigos legados */
  status: 'Sim' | 'Em desenvolvimento' | 'Não' | 'HV' | 'HED' | 'HNV' | 'em_andamento' | 'concluida'
  criterion?: string
  /** Status no semestre anterior para comparação evolutiva (1º Semestre -> 2º Semestre) */
  previousSemesterStatus?: 'Sim' | 'Em desenvolvimento' | 'Não'
  previousSemesterPeriod?: string
  /** Registro de avaliações/atividades em que esta competência foi aferida */
  evaluatedInActivities?: Array<{
    activityId?: string
    activityTitle: string
    date: string
    status: 'Sim' | 'Em desenvolvimento' | 'Não'
    note?: string
  }>
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

// ─── SCHEMA DO PDI (Baseado no Modelo Oficial de Língua Inglesa — BNCC) ──────
export const PDI_SCHEMA: DocumentSchema = {
  type: 'pdi',
  title: 'PLANO DE DESENVOLVIMENTO INDIVIDUAL (PDI)',
  description: 'Acompanhamento pedagógico individualizado, estratégias de apoio e monitoramento semestral de habilidades da BNCC.',
  boxes: [
    {
      id: 'identificacao',
      title: '1. Identificação',
      description: 'Dados cadastrais do(a) aluno(a), componente curricular, equipe pedagógica e período de vigência semestral.',
      boxType: 'header_fields',
      required: true,
      config: {
        fields: [
          { key: 'studentName', label: 'Aluno(a)', type: 'text', placeholder: 'Ex: Carina Miranda de Oliveira' },
          { key: 'gradeCycle', label: 'Ano/turma', type: 'text', placeholder: 'Ex: 6º ano do Ensino Fundamental' },
          { key: 'shift', label: 'Turno', type: 'select', options: ['Matutino', 'Vespertino', 'Integral', 'Noturno'], defaultValue: 'Matutino' },
          { key: 'birthDate', label: 'Data de nascimento', type: 'text', placeholder: 'DD/MM/AAAA' },
          { key: 'creationDate', label: 'Data de elaboração', type: 'text', placeholder: 'Ex: 10/07/2026' },
          { key: 'curricularComponent', label: 'Componente curricular', type: 'text', placeholder: 'Ex: Língua Inglesa — 6º ano do Ensino Fundamental' },
          { key: 'regentTeacher', label: 'Professor(a) regente', type: 'text', placeholder: 'Ex: Rafaela Franco Toldo' },
          { key: 'pedagogicalTeam', label: 'Equipe pedagógica envolvida', type: 'text', placeholder: 'Ex: Marianna Panisset' },
          { key: 'guardians', label: 'Responsável(is) pelo(a) aluno(a)', type: 'text', placeholder: 'Nome dos responsáveis' },
          { key: 'validityPeriod', label: 'Período de vigência', type: 'select', options: ['1º semestre / 2026', '2º semestre / 2026', '1º semestre / 2027', '2º semestre / 2027', 'Anual / 2026'], defaultValue: '1º semestre / 2026' },
          { key: 'nextReviewDate', label: 'Próxima revisão', type: 'text', placeholder: 'Ex: Dezembro / 2026' },
          { key: 'schoolName', label: 'Instituição de Ensino', type: 'text', placeholder: 'Ex: Colégio Machado Sobrinho' }
        ]
      }
    },
    {
      id: 'objetivo_geral',
      title: '2. Objetivo geral do PDI',
      description: 'Finalidade pedagógica do acompanhamento individualizado no componente curricular.',
      boxType: 'rich_narrative',
      required: true,
      config: {
        subsections: [
          {
            key: 'objetivoGeral',
            title: 'Objetivo geral do PDI',
            placeholder: 'Acompanhar e apoiar o desenvolvimento do(a) aluno(a) no componente curricular de Língua Inglesa, monitorando o alcance progressivo das habilidades previstas pela BNCC...'
          }
        ],
        aiAssistPrompt: 'Elabore o Objetivo Geral do PDI para acompanhamento das habilidades previstas pela BNCC com estratégias pedagógicas individualizadas, revisão periódica e registro contínuo dos avanços.'
      }
    },
    {
      id: 'plano_intervencao',
      title: '3. Estratégias pedagógicas e recursos de apoio',
      description: 'Estratégias metodológicas, recursos visuais, rotina previsível e flexibilizações adotadas em sala e nas avaliações.',
      boxType: 'strategy_list',
      config: {
        category: 'intervention',
        defaultStrategies: [
          'Uso de instruções claras, objetivas e, quando necessário, apresentadas por escrito e oralmente.',
          'Divisão das atividades em etapas menores, com tempo estendido quando necessário.',
          'Apoio visual (imagens, esquemas, cartazes) para reforço do vocabulário e das estruturas trabalhadas.',
          'Rotina previsível de aula, com antecipação de mudanças sempre que possível.',
          'Reforço positivo e feedback frequente sobre o progresso.',
          'Pausas programadas e ambiente com o mínimo de estímulos distratores durante atividades de concentração.',
          'Flexibilização de formatos de avaliação (oral, escrita, prática), quando pertinente.'
        ]
      }
    },
    {
      id: 'matriz_habilidades',
      title: '4. Habilidades esperadas — BNCC (Língua Inglesa)',
      description: 'Monitoramento de competências e habilidades da BNCC (Sim • Em desenvolvimento • Não) com comparativo entre semestres.',
      boxType: 'skills_matrix_table',
      required: true,
      config: {
        mode: 'pdi',
        columns: ['Código', 'Habilidade (BNCC – Língua Inglesa)', 'Superada?', 'Observações']
      }
    },
    {
      id: 'observacoes_evolucao',
      title: '5. Observações gerais e evolução do aluno',
      description: 'Registro descritivo do desenvolvimento linguístico, participação, atenção, autorregulação emocional, convivência e necessidade de adaptações.',
      boxType: 'rich_narrative',
      config: {
        subsections: [
          {
            key: 'evolucaoGeral',
            title: 'Observações gerais e evolução do(a) aluno(a)',
            placeholder: 'Descreva o desenvolvimento do uso da língua, participação, domínio linguístico, impactos de faltas/concentração, manejo de frustrações, relacionamento interpessoal e necessidade ou não de adaptações de materiais/avaliações...'
          }
        ],
        aiAssistPrompt: 'Redija o parecer descritivo de Observações Gerais e Evolução do Aluno no PDI de Língua Inglesa, abordando participação, domínio do idioma, atenção/concentração, autorregulação diante de frustrações, convivência com colegas e necessidade de adaptações.'
      }
    },
    {
      id: 'acompanhamento_revisao',
      title: '6. Acompanhamento e revisão (Transição Semestral)',
      description: 'Diretrizes de revisão periódica com a equipe pedagógica e família, e parecer de evolução para o próximo semestre.',
      boxType: 'rich_narrative',
      config: {
        subsections: [
          {
            key: 'revisaoPeriodica',
            title: 'Diretriz de acompanhamento e revisão semestral',
            placeholder: 'Este PDI deverá ser revisado periodicamente pela equipe pedagógica, em conjunto com a família, ajustando metas e estratégias conforme a evolução do(a) aluno(a).'
          },
          {
            key: 'parecerProximoSemestre',
            title: 'Avaliação do Semestre Seguinte (Habilidades Concluídas vs. Pendentes)',
            placeholder: 'Registre aqui a avaliação do semestre seguinte sobre as habilidades que estavam "Em desenvolvimento" ou "Não" no semestre anterior...'
          }
        ],
        aiAssistPrompt: 'Sintetize o plano de acompanhamento e revisão semestral do PDI em conjunto com a equipe pedagógica e a família.'
      }
    },
    {
      id: 'relatorio_circunstanciado',
      title: 'Anexo Clínico (Opcional): Laudo Médico / Acompanhamento Especializado',
      description: 'Preencha caso o(a) estudante possua laudo clínico formal (TEA, TDAH, Dislexia, etc.) ou terapias externas.',
      boxType: 'checklist_conditional',
      config: {
        questionLabel: 'Há diagnóstico clínico formal ou acompanhamento terapêutico externo?',
        conditionalFields: [
          { key: 'cid10', label: 'CID-10 / Diagnóstico Formal', type: 'text', placeholder: 'Ex: F84.0 (TEA), F90 (TDAH), etc.' },
          { key: 'professionalName', label: 'Profissional Emissor', type: 'text', placeholder: 'Médico, Neurologista ou Psiquiatra' },
          { key: 'reportDate', label: 'Data do Laudo', type: 'date' },
          { key: 'specializedServices', label: 'Acompanhamentos Especializados', type: 'text', placeholder: 'Psicologia, Fonoaudiologia, T.O., etc.' },
          { key: 'medication', label: 'Uso de Medicação / Observações Clínicas', type: 'text', placeholder: 'Medicação e posologia, se relevante' }
        ]
      }
    },
    {
      id: 'assinaturas',
      title: '7. Assinaturas',
      description: 'Validação pelo(a) Professor(a) regente, Coordenação pedagógica, Responsável pelo(a) aluno(a) e Data.',
      boxType: 'signature_block',
      config: {
        roles: ['Professor(a) regente', 'Coordenação pedagógica', 'Responsável pelo(a) aluno(a)', 'Data']
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
