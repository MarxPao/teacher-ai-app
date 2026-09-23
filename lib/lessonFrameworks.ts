/**
 * lessonFrameworks.ts — Motor de Frameworks Pedagógicos Reais para o LessonStudio
 * 
 * Suporta estruturas dinâmicas reais:
 * - 5E Inquiry Model (Rodger Bybee): Engage, Explore, Explain, Elaborate, Evaluate (5 etapas)
 * - TBLT Autêntico (Jane Willis): Pre-Task, Task, Planning, Report, Language Analysis, Language Practice (6 etapas)
 * - Backward Design / UbD (Wiggins & McTighe): Raciocínio reverso (Evidências de Avaliação ANTES do plano)
 * - PPP (Presentation, Practice, Production): Estrutura clássica de precisão comunicativa (4 etapas)
 * - Demais metodologias conectadas a lib/pedagogicalMethodologies.ts
 */

import { buildMethodologyInstructions, PEDAGOGICAL_METHODOLOGIES } from './pedagogicalMethodologies'
import {
  HARVARD_THINKING_ROUTINES,
  buildClilDualObjectives,
  ScaffoldingTiers,
  CheckingQuestions,
  HarvardThinkingRoutine
} from './pedagogicalEnhancements'

export interface FrameworkStageDefinition {
  name: string
  durationMin: number
  teacherAction: string
  studentAction: string
  targetBnccCode?: string
  pedagogicalRole?: string
  scaffoldingTiers?: ScaffoldingTiers
  checkingQuestions?: CheckingQuestions
  thinkingRoutine?: HarvardThinkingRoutine
}

export interface LessonFrameworkConfig {
  id: string
  name: string
  badge: string
  desc: string
  defaultStages: FrameworkStageDefinition[]
  promptDirective: string
  schemaStagesExample: Array<{
    name: string
    durationMin: number
    teacherAction: string
    studentAction: string
    targetBnccCode: string
  }>
  reasoningOrder: 'standard' | 'backward_design'
}

export const LESSON_FRAMEWORKS: LessonFrameworkConfig[] = [
  // ─── 1. PPP (PRESENTATION, PRACTICE, PRODUCTION) ───────────────────────────
  {
    id: 'ppp',
    name: 'PPP (Presentation, Practice, Production)',
    badge: '#268bd2',
    desc: 'Estruturado para gramática e vocabulário MFP (Warm-up, Presentation, Practice, Production)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: 'Warm-up / Lead-in',
        durationMin: 5,
        teacherAction: 'Contextualizar a temática com recurso visual/pergunta disparadora',
        studentAction: 'Compartilhar impressões iniciais e ativar vocabulário prévio',
        pedagogicalRole: 'Ativação & Contexto'
      },
      {
        name: 'Presentation (MFP)',
        durationMin: 15,
        teacherAction: 'Apresentar a linguagem-alvo destacando Significado, Forma e Pronúncia (MFP)',
        studentAction: 'Observar exemplos no contexto, deduzir regras e repetir pronúncia/entonação',
        pedagogicalRole: 'Apresentação Conceitual'
      },
      {
        name: 'Controlled Practice',
        durationMin: 15,
        teacherAction: 'Fornecer exercícios de lacunas, transformação ou drills guiados para precisão',
        studentAction: 'Resolver tarefas estruturadas em pares com checagem mútua de respostas',
        pedagogicalRole: 'Prática de Precisão'
      },
      {
        name: 'Free Production',
        durationMin: 15,
        teacherAction: 'Propor desafio comunicativo autônomo (role-play, debate ou texto pessoal)',
        studentAction: 'Produzir mensagens orais/escritas usando as novas estruturas com liberdade',
        pedagogicalRole: 'Fluência & Produção Livre'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — PPP (Presentation, Practice, Production):
Divida a aula exatamente nas 4 etapas canônicas do PPP:
1. Warm-up / Lead-in (5 min): Ativação contextualizada.
2. Presentation (MFP) (15 min): Apresentação explícita de Significado, Forma e Pronúncia.
3. Controlled Practice (15 min): Prática controlada para precisão gramatical/lexical.
4. Free Production (15 min): Produção comunicativa livre focada em fluência e autonomia.`,
    schemaStagesExample: [
      {
        name: 'Warm-up / Lead-in',
        durationMin: 5,
        teacherAction: 'Ação do professor na ativação',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC específico da habilidade ativada'
      },
      {
        name: 'Presentation (MFP)',
        durationMin: 15,
        teacherAction: 'Apresentação de Meaning, Form, Pronunciation',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC de conhecimentos linguísticos/análise'
      },
      {
        name: 'Controlled Practice',
        durationMin: 15,
        teacherAction: 'Mediação de exercícios de precisão',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC de leitura/escrita guiada'
      },
      {
        name: 'Free Production',
        durationMin: 15,
        teacherAction: 'Facilitação da comunicação autônoma',
        studentAction: 'Produção oral ou escrita autêntica',
        targetBnccCode: 'Código BNCC de oralidade/produção textual'
      }
    ]
  },

  // ─── 2. TBLT AUTÊNTICO (JANE WILLIS FRAMEWORK) ──────────────────────────────
  {
    id: 'tblt_willis',
    name: 'TBLT Autêntico (Jane Willis Framework)',
    badge: '#d97706',
    desc: 'Estrutura canônica de Willis: Pre-Task → Task Cycle (Task, Planning, Report) → Language Focus (Analysis, Practice)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: 'Pre-Task',
        durationMin: 8,
        teacherAction: 'Apresentar o tema, destacar vocabulário-chave e demonstrar modelo autêntico da tarefa',
        studentAction: 'Notar expressões do modelo e preparar ideias para o desafio comunicativo',
        pedagogicalRole: 'Introdução & Modelo'
      },
      {
        name: 'Task Cycle — Task',
        durationMin: 14,
        teacherAction: 'Monitorar os grupos à distância, incentivando a fluência e a comunicação espontânea',
        studentAction: 'Executar a tarefa comunicativa em pares/grupos com foco no significado',
        pedagogicalRole: 'Execução da Tarefa'
      },
      {
        name: 'Task Cycle — Planning',
        durationMin: 8,
        teacherAction: 'Circular entre os grupos atuando como consultor linguístico e tirando dúvidas de formulação',
        studentAction: 'Rascunhar e ensaiar o relatório oral/escrito que será apresentado para a turma',
        pedagogicalRole: 'Planejamento do Relatório'
      },
      {
        name: 'Task Cycle — Report',
        durationMin: 10,
        teacherAction: 'Mediar a apresentação dos relatórios e registrar usos linguísticos autênticos no quadro',
        studentAction: 'Apresentar descobertas do grupo e comparar conclusões com os colegas',
        pedagogicalRole: 'Apresentação & Troca'
      },
      {
        name: 'Language Focus — Analysis',
        durationMin: 6,
        teacherAction: 'Guiar os alunos a analisarem frases reais coletadas durante o Task Cycle (Noticing)',
        studentAction: 'Identificar padrões sintáticos, colocações e estruturas gramaticais relevantes',
        pedagogicalRole: 'Conscientização / Noticing'
      },
      {
        name: 'Language Focus — Practice',
        durationMin: 4,
        teacherAction: 'Conduzir prática breve de consolidação das estruturas analisadas',
        studentAction: 'Realizar exercícios rápidos de fixação das formas identificadas',
        pedagogicalRole: 'Prática de Consolidação'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — TBLT AUTÊNTICO (JANE WILLIS, 1996):
Siga ESTRITAMENTE a estrutura canônica de Jane Willis com 6 fases integradas:
1. Pre-Task (~8 min): Ativação de vocabulário e demonstração do modelo da tarefa.
2. Task Cycle — Task (~14 min): Trabalho em grupo com foco no significado e na troca de informações.
3. Task Cycle — Planning (~8 min): Preparação do relatório oral ou escrito com auxílio linguístico do professor.
4. Task Cycle — Report (~10 min): Apresentação dos resultados e troca entre pares.
5. Language Focus — Analysis (~6 min): Reflexão consciente (Noticing) sobre formas gramaticais e léxico utilizados.
6. Language Focus — Practice (~4 min): Exercícios curtos de fixação das estruturas analisadas.
NÃO comprima essas etapas em blocos genéricos de 'apresentação'. A reflexão sobre a forma OCORRE APENAS no Language Focus pós-tarefa.`,
    schemaStagesExample: [
      {
        name: 'Pre-Task',
        durationMin: 8,
        teacherAction: 'Ativação e apresentação do modelo da tarefa',
        studentAction: 'Compreensão do objetivo comunicativo e vocabulário',
        targetBnccCode: 'Código BNCC de oralidade/escuta'
      },
      {
        name: 'Task Cycle — Task',
        durationMin: 14,
        teacherAction: 'Mediação sem interrupções',
        studentAction: 'Interação fluente em grupos',
        targetBnccCode: 'Código BNCC de interação discursiva'
      },
      {
        name: 'Task Cycle — Planning',
        durationMin: 8,
        teacherAction: 'Apoio linguístico e consultoria',
        studentAction: 'Redação e ensaio do relatório',
        targetBnccCode: 'Código BNCC de escrita/planejamento'
      },
      {
        name: 'Task Cycle — Report',
        durationMin: 10,
        teacherAction: 'Coordenação das apresentações',
        studentAction: 'Apresentação oral para a turma',
        targetBnccCode: 'Código BNCC de apresentação oral'
      },
      {
        name: 'Language Focus — Analysis',
        durationMin: 6,
        teacherAction: 'Guia de Noticing das formas',
        studentAction: 'Análise de estruturas gramaticais',
        targetBnccCode: 'Código BNCC de conhecimentos linguísticos'
      },
      {
        name: 'Language Focus — Practice',
        durationMin: 4,
        teacherAction: 'Condução de prática de fixação',
        studentAction: 'Resolução de exercícios pontuais',
        targetBnccCode: 'Código BNCC de consolidação gramatical'
      }
    ]
  },

  // ─── 3. 5E INQUIRY MODEL (RODGER BYBEE / BSCS) ──────────────────────────────
  {
    id: '5e_inquiry',
    name: '5E Inquiry Model (Bybee)',
    badge: '#0284c7',
    desc: 'Engage → Explore → Explain → Elaborate → Evaluate (Ciclo investigativo BSCS)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Engage (Engajamento & Desafio)',
        durationMin: 8,
        teacherAction: 'Lançar uma questão investigativa provocadora ou enigma contextualizado',
        studentAction: 'Formular palpites iniciais e demonstrar conhecimentos prévios sobre o tema',
        pedagogicalRole: 'Gancho Investigativo'
      },
      {
        name: '2. Explore (Exploração & Investigação)',
        durationMin: 12,
        teacherAction: 'Disponibilizar amostras de textos/áudios autênticos e orientar a busca de padrões',
        studentAction: 'Analisar os dados em colaboração sem regras prontas fornecidas pelo professor',
        pedagogicalRole: 'Exploração Ativa'
      },
      {
        name: '3. Explain (Explicação Conceitual & Noticing)',
        durationMin: 12,
        teacherAction: 'Sistematizar as descobertas dos alunos, introduzindo terminologias e regras formais',
        studentAction: 'Explicar com suas próprias palavras o funcionamento das estruturas e registrar conceitos',
        pedagogicalRole: 'Formalização Conceitual'
      },
      {
        name: '4. Elaborate (Elaboração & Aplicação em Novo Contexto)',
        durationMin: 13,
        teacherAction: 'Apresentar um novo cenário comunicativo desafiador para transferência de aprendizado',
        studentAction: 'Aplicar as competências adquiridas resolvendo um problema inédito em duplas',
        pedagogicalRole: 'Transferência de Aprendizagem'
      },
      {
        name: '5. Evaluate (Avaliação & Reflexão Formativa)',
        durationMin: 5,
        teacherAction: 'Conduzir rubrica de autoavaliação e checagem de evidências formativas',
        studentAction: 'Demonstrar compreensão individual e registrar autoavaliação de progresso',
        pedagogicalRole: 'Avaliação Formativa'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — 5E INQUIRY MODEL (RODGER BYBEE / BSCS):
Estruture a aula ESTRITAMENTE segundo as 5 fases do ciclo investigativo 5E:
1. 1. Engage (~8 min): Gancho instigante e Pergunta Essencial de partida.
2. 2. Explore (~12 min): Investigação colaborativa com materiais autênticos sem explicação prévia do professor.
3. 3. Explain (~12 min): Alunos verbalizam hipóteses e professor formaliza regras/estruturas linguísticas (MFP).
4. 4. Elaborate (~13 min): Aplicação e transferência dos conceitos para um novo contexto desafiador.
5. 5. Evaluate (~5 min): Avaliação formativa, autoavaliação e evidência observável de alcance.`,
    schemaStagesExample: [
      {
        name: '1. Engage (Engajamento)',
        durationMin: 8,
        teacherAction: 'Apresentação da questão investigativa',
        studentAction: 'Levantamento de hipóteses',
        targetBnccCode: 'Código BNCC de interação oral/reflexão'
      },
      {
        name: '2. Explore (Exploração)',
        durationMin: 12,
        teacherAction: 'Mediação da pesquisa com materiais',
        studentAction: 'Análise colaborativa de textos/dados',
        targetBnccCode: 'Código BNCC de leitura/investigação'
      },
      {
        name: '3. Explain (Explicação)',
        durationMin: 12,
        teacherAction: 'Formalização dos conceitos e regras',
        studentAction: 'Articulação de descobertas',
        targetBnccCode: 'Código BNCC de conhecimentos linguísticos'
      },
      {
        name: '4. Elaborate (Elaboração)',
        durationMin: 13,
        teacherAction: 'Orientação do desafio estendido',
        studentAction: 'Aplicação prática em novo cenário',
        targetBnccCode: 'Código BNCC de produção oral/escrita'
      },
      {
        name: '5. Evaluate (Avaliação)',
        durationMin: 5,
        teacherAction: 'Condução do feedback formativo',
        studentAction: 'Autoavaliação e checagem de metas',
        targetBnccCode: 'Código BNCC de avaliação/compreensão'
      }
    ]
  },

  // ─── 4. BACKWARD DESIGN / UBD (WIGGINS & MCTIGHE) ──────────────────────────
  {
    id: 'ubd_backward',
    name: 'Backward Design / UbD (Wiggins & McTighe)',
    badge: '#7c3aed',
    desc: 'Planejamento Reverso: Resultados & Evidências de Avaliação ANTES das etapas de ensino',
    reasoningOrder: 'backward_design',
    defaultStages: [
      {
        name: 'Stage 3: Hook & Hold (Engajamento no Desafio Final)',
        durationMin: 8,
        teacherAction: 'Apresentar a Pergunta Essencial e o desafio autêntico de desempenho (Performance Task)',
        studentAction: 'Compreender os critérios de sucesso e o produto final esperado da aula',
        pedagogicalRole: 'Hook & Final Goal'
      },
      {
        name: 'Stage 3: Equip & Explore (Equipar para a Performance)',
        durationMin: 20,
        teacherAction: 'Equipar os alunos com vocabulário, estruturas sintáticas e modelos práticos essenciais',
        studentAction: 'Praticar as habilidades intermediárias necessárias para a tarefa final',
        pedagogicalRole: 'Equip with Tools'
      },
      {
        name: 'Stage 3: Rethink & Revise (Aperfeiçoamento Crítico)',
        durationMin: 14,
        teacherAction: 'Fornecer feedback formativo durante o ensaio e orientar ajustes de qualidade',
        studentAction: 'Revisar o trabalho com base em critérios explícitos e feedback dos colegas',
        pedagogicalRole: 'Rethink & Self-Regulation'
      },
      {
        name: 'Stage 3: Evaluate & Demonstrate (Evidência Observável)',
        durationMin: 8,
        teacherAction: 'Avaliar a demonstração de desempenho com base nas evidências UbD definidas no início',
        studentAction: 'Executar a tarefa de desempenho demonstrando a compreensão duradoura alcançada',
        pedagogicalRole: 'Demonstrate Evidence'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — BACKWARD DESIGN / UbD (WIGGINS & MCTIGHE):
O raciocínio DEVE ser rigorosamente inverso:
ESTÁGIO 1: Resultados Desejados (Perguntas Essenciais e o que os alunos devem compreender).
ESTÁGIO 2: Evidências de Avaliação (Critério observável e Performance Task definidos ANTES de planejar as aulas).
ESTÁGIO 3: Plano de Aprendizagem (Etapas concebidas estritamente para EQUIPAR os alunos a alcançarem a evidência do Estágio 2, orientadas por W.H.E.R.E.T.O.).
Portanto, determine a evidência no início e estruture as etapas de ensino em função dela.`,
    schemaStagesExample: [
      {
        name: 'Stage 3: Hook & Hold (Objetivo & Desafio Final)',
        durationMin: 8,
        teacherAction: 'Apresentação do desafio e critérios',
        studentAction: 'Engajamento com o objetivo da aula',
        targetBnccCode: 'Código BNCC de interação/contexto'
      },
      {
        name: 'Stage 3: Equip & Explore (Equipamento de Ferramentas)',
        durationMin: 20,
        teacherAction: 'Instrução e prática guiada de estruturas',
        studentAction: 'Construção do repertório linguístico',
        targetBnccCode: 'Código BNCC de conhecimentos linguísticos'
      },
      {
        name: 'Stage 3: Rethink & Revise (Reflexão e Ajuste)',
        durationMin: 14,
        teacherAction: 'Mediação do feedback formativo',
        studentAction: 'Aperfeiçoamento da produção em duplas',
        targetBnccCode: 'Código BNCC de prática discursiva'
      },
      {
        name: 'Stage 3: Evaluate & Demonstrate (Execução da Evidência)',
        durationMin: 8,
        teacherAction: 'Avaliação observável contra critérios UbD',
        studentAction: 'Apresentação ou entrega da evidência',
        targetBnccCode: 'Código BNCC de consolidação e avaliação'
      }
    ]
  },

  // ─── 5. TBLT PADRÃO (Legado/Compatibilidade) ────────────────────────────────
  {
    id: 'tblt',
    name: 'TBLT (Task-Based)',
    badge: '#b58900',
    desc: 'Foco em tarefas práticas reais (Pre-Task, Task Cycle, Language Focus)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: 'Pre-Task (Aquecimento & Modelo)',
        durationMin: 10,
        teacherAction: 'Introduzir o tópico e demonstrar modelo da tarefa comunicativa',
        studentAction: 'Compreender o objetivo e ativar vocabulário prévio',
        pedagogicalRole: 'Pre-Task'
      },
      {
        name: 'Task Cycle (Execução da Tarefa)',
        durationMin: 20,
        teacherAction: 'Monitorar a interação dos grupos garantindo foco no significado',
        studentAction: 'Realizar a tarefa comunicativa em duplas/grupos',
        pedagogicalRole: 'Task Cycle'
      },
      {
        name: 'Language Focus (Análise & Prática)',
        durationMin: 15,
        teacherAction: 'Conduzir análise linguística das estruturas usadas e tirar dúvidas',
        studentAction: 'Analisar formas linguísticas e realizar prática de consolidação',
        pedagogicalRole: 'Language Focus'
      },
      {
        name: 'Wrap-up & Feedback',
        durationMin: 5,
        teacherAction: 'Feedback corretivo coletivo e orientações finais',
        studentAction: 'Registrar anotações e dúvidas no caderno',
        pedagogicalRole: 'Wrap-up'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — TBLT (Task-Based Language Teaching):
Foco na execução de tarefas autênticas em 3 fases:
1. Pre-Task: Aquecimento e modelo.
2. Task Cycle: Execução e relatório em grupos.
3. Language Focus: Noticing e análise linguística pós-tarefa.
4. Wrap-up: Feedback coletivo.`,
    schemaStagesExample: [
      {
        name: 'Pre-Task (Aquecimento & Modelo)',
        durationMin: 10,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC de interação oral'
      },
      {
        name: 'Task Cycle (Execução)',
        durationMin: 20,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC de produção/comunicação'
      },
      {
        name: 'Language Focus (Análise)',
        durationMin: 15,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC de conhecimentos linguísticos'
      },
      {
        name: 'Wrap-up & Feedback',
        durationMin: 5,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC de fechamento'
      }
    ]
  },

  // ─── 6. GUIDED DISCOVERY ──────────────────────────────────────────────────
  {
    id: 'guided_discovery',
    name: 'Guided Discovery (Descoberta Guiada)',
    badge: '#2aa198',
    desc: 'Indução de regras através de exemplos, perguntas conceituais e Noticing',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: 'Lead-in & Contextualização',
        durationMin: 8,
        teacherAction: 'Apresentar contexto rico e engajador onde a linguagem ocorre naturalmente',
        studentAction: 'Mergulhar no contexto e compartilhar experiências',
        pedagogicalRole: 'Contexto'
      },
      {
        name: 'Guided Observation & Noticing',
        durationMin: 15,
        teacherAction: 'Fornecer perguntas-guia de checagem conceitual (CCQs) direcionando a atenção',
        studentAction: 'Sublinhar e analisar os padrões linguísticos nos exemplos autênticos',
        pedagogicalRole: 'Noticing'
      },
      {
        name: 'Rule Formulation & Verification',
        durationMin: 12,
        teacherAction: 'Conduzir os alunos a verbalizarem e formularem as regras gramaticais',
        studentAction: 'Articular a regra com suas palavras e confirmar compreensão',
        pedagogicalRole: 'Indução da Regra'
      },
      {
        name: 'Communicative Activation',
        durationMin: 15,
        teacherAction: 'Propor atividade interativa para aplicação imediata das descobertas',
        studentAction: 'Utilizar a linguagem descoberta em tarefas comunicativas autênticas',
        pedagogicalRole: 'Aplicação'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — GUIDED DISCOVERY:
Ensino indutivo: os alunos descobrem a regra a partir de dados autênticos e perguntas de checagem conceitual (CCQs) antes de qualquer explicação do professor.`,
    schemaStagesExample: [
      {
        name: 'Lead-in & Contextualização',
        durationMin: 8,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Guided Observation & Noticing',
        durationMin: 15,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Rule Formulation & Verification',
        durationMin: 12,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Communicative Activation',
        durationMin: 15,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      }
    ]
  },

  // ─── 7. TTT (TEST-TEACH-TEST) ──────────────────────────────────────────────
  {
    id: 'ttt',
    name: 'TTT (Test-Teach-Test)',
    badge: '#cb4b16',
    desc: 'Diagnóstico inicial para identificar lacunas, seguido de ensino focal e pós-teste',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: 'Warm-up & Contexto',
        durationMin: 5,
        teacherAction: 'Apresentar a temática e motivar a turma',
        studentAction: 'Ativação inicial do vocabulário',
        pedagogicalRole: 'Aquecimento'
      },
      {
        name: 'Test 1 (Diagnóstico Inicial)',
        durationMin: 15,
        teacherAction: 'Aplicar desafio comunicativo sem instrução prévia, anotando lacunas reais dos alunos',
        studentAction: 'Realizar a atividade com a linguagem que já possuem, expondo dúvidas e necessidades',
        pedagogicalRole: 'Diagnóstico'
      },
      {
        name: 'Teach (Instrução Focal nas Lacunas)',
        durationMin: 15,
        teacherAction: 'Ensinar exclusivamente os pontos e estruturas onde os alunos demonstraram dificuldade',
        studentAction: 'Tirar dúvidas focais e assimilar os ajustes linguísticos explicados',
        pedagogicalRole: 'Ensino Sob Medida'
      },
      {
        name: 'Test 2 (Consolidação & Aplicação)',
        durationMin: 15,
        teacherAction: 'Apresentar novo desafio comunicativo similar para verificar a superação das lacunas',
        studentAction: 'Executar a tarefa aplicando com sucesso as correções aprendidas',
        pedagogicalRole: 'Pós-teste & Consolidação'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — TTT (Test-Teach-Test):
1. Warm-up (5 min).
2. Test 1 (15 min): Tarefa diagnóstica sem ensino prévio.
3. Teach (15 min): Instrução cirúrgica focada apenas nas lacunas evidenciadas no Test 1.
4. Test 2 (15 min): Nova tarefa comunicativa para validar o aprendizado.`,
    schemaStagesExample: [
      {
        name: 'Warm-up & Contexto',
        durationMin: 5,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Test 1 (Diagnóstico Inicial)',
        durationMin: 15,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Teach (Instrução Focal)',
        durationMin: 15,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Test 2 (Consolidação)',
        durationMin: 15,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      }
    ]
  },

  // ─── 8. CLIL (CONTENT & LANGUAGE INTEGRATED LEARNING) ──────────────────────
  {
    id: 'clil',
    name: 'CLIL (Content & Language)',
    badge: '#2aa198',
    desc: 'Integração de conteúdo curricular interdisciplinar com suporte duplo em língua-alvo',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: 'Content Lead-in & Hook',
        durationMin: 8,
        teacherAction: 'Introduzir o tópico interdisciplinar (ciências, história, geografia) com imagem/fato curioso',
        studentAction: 'Relacionar o tema com seus conhecimentos enciclopédicos prévios',
        pedagogicalRole: 'Ativação do Conteúdo'
      },
      {
        name: 'Input & Scaffolding (4Cs)',
        durationMin: 17,
        teacherAction: 'Apresentar texto informativo autêntico com suporte duplo: glossário visual e organizadores gráficos',
        studentAction: 'Ler/ouvir o material identificando conceitos-chave e vocabulário acadêmico (Tier 2/3)',
        pedagogicalRole: 'Compreensão de Conteúdo & Linguagem'
      },
      {
        name: 'Task & Communication',
        durationMin: 15,
        teacherAction: 'Propor tarefa investigativa ou resolução de problema conceitual em grupos',
        studentAction: 'Colaborar em inglês para resolver o desafio disciplinar e preparar conclusões',
        pedagogicalRole: 'Aplicação Conceitual'
      },
      {
        name: 'Plenary & Content Review',
        durationMin: 10,
        teacherAction: 'Consolidar as descobertas interdisciplinares e fazer o fechamento léxico',
        studentAction: 'Compartilhar sínteses dos grupos e registrar novas conexões conceituais',
        pedagogicalRole: 'Síntese Interdisciplinar'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — CLIL (Content & Language Integrated Learning):
Foco nos 4Cs: Content (Conteúdo), Communication (Linguagem), Cognition (Habilidades cognitivas) e Culture (Contexto intercultural).`,
    schemaStagesExample: [
      {
        name: 'Content Lead-in & Hook',
        durationMin: 8,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Input & Scaffolding',
        durationMin: 17,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Task & Communication',
        durationMin: 15,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Plenary & Content Review',
        durationMin: 10,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      }
    ]
  },

  // ─── 9. PBL (PROJECT-BASED LEARNING) ───────────────────────────────────────
  {
    id: 'pbl',
    name: 'PBL (Project-Based Learning)',
    badge: '#859900',
    desc: 'Resolução de problemas reais em projetos colaborativos com entregável autêntico',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: 'Driving Question & Project Launch',
        durationMin: 10,
        teacherAction: 'Lançar a Pergunta Motriz desafiadora e apresentar o produto final esperado',
        studentAction: 'Debater o problema e organizar o plano de trabalho da equipe',
        pedagogicalRole: 'Lançamento'
      },
      {
        name: 'Collaborative Inquiry & Prototyping',
        durationMin: 20,
        teacherAction: 'Supervisionar a pesquisa dos grupos e orientar o rascunho do entregável',
        studentAction: 'Pesquisar fontes em inglês e criar o protótipo do produto do projeto',
        pedagogicalRole: 'Investigação & Produção'
      },
      {
        name: 'Peer Critique & Tuning Protocol',
        durationMin: 12,
        teacherAction: 'Mediar rodada de feedback estruturado (I like, I wonder, Next steps)',
        studentAction: 'Apresentar prévia aos colegas e refinar o produto com base no feedback',
        pedagogicalRole: 'Crítica Construtiva'
      },
      {
        name: 'Showcase & Reflection',
        durationMin: 8,
        teacherAction: 'Organizar mostra dos resultados e guiar reflexão sobre o processo',
        studentAction: 'Compartilhar o produto final e avaliar o trabalho em equipe',
        pedagogicalRole: 'Celebração & Avaliação'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — PBL (Project-Based Learning):
Estruture em torno da Driving Question, Investigação Colaborativa, Crítica entre pares e Showcase.`,
    schemaStagesExample: [
      {
        name: 'Driving Question Launch',
        durationMin: 10,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Inquiry & Prototyping',
        durationMin: 20,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Peer Critique',
        durationMin: 12,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Showcase & Reflection',
        durationMin: 8,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      }
    ]
  },

  // ─── 10. 4C SKILLS (SÉCULO XXI) ───────────────────────────────────────────
  {
    id: 'four_c',
    name: '4C Skills (Século XXI)',
    badge: '#6c71c4',
    desc: 'Desenvolvimento de Criatividade, Colaboração, Comunicação e Pensamento Crítico',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: 'Communication Challenge',
        durationMin: 10,
        teacherAction: 'Apresentar desafio comunicativo que exija tomada de posição argumentada',
        studentAction: 'Compreender o cenário e articular pontos de vista iniciais',
        pedagogicalRole: 'Comunicação'
      },
      {
        name: 'Collaborative Brainstorming',
        durationMin: 15,
        teacherAction: 'Facilitar a negociação de ideias e a divisão de papéis nas equipes',
        studentAction: 'Trabalhar em grupo cooperativo integrando diferentes perspectivas',
        pedagogicalRole: 'Colaboração'
      },
      {
        name: 'Critical Thinking & Creation',
        durationMin: 15,
        teacherAction: 'Estimular a criatividade e o questionamento de premissas',
        studentAction: 'Criar uma solução inovadora justificando cada escolha com evidências',
        pedagogicalRole: 'Criatividade & Crítica'
      },
      {
        name: 'Presentation & Reflection',
        durationMin: 10,
        teacherAction: 'Conduzir debate final e avaliação dos 4 pilares',
        studentAction: 'Apresentar a solução e refletir sobre a colaboração do grupo',
        pedagogicalRole: 'Síntese das 4Cs'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — 4C SKILLS (Século XXI):
Integre intencionalmente Comunicação, Colaboração, Pensamento Crítico e Criatividade em cada etapa.`,
    schemaStagesExample: [
      {
        name: 'Communication Challenge',
        durationMin: 10,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Collaborative Brainstorming',
        durationMin: 15,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Critical Thinking & Creation',
        durationMin: 15,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Presentation & Reflection',
        durationMin: 10,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      }
    ]
  },

  // ─── 11. SALA DE AULA INVERTIDA (FLIPPED CLASSROOM) ───────────────────────
  {
    id: 'flipped',
    name: 'Sala de Aula Invertida (Flipped)',
    badge: '#6c71c4',
    desc: 'Estudo prévio individual de conceitos seguido de aplicação prática profunda na aula',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: 'Pre-Class Check & Warm-up',
        durationMin: 8,
        teacherAction: 'Checar pontos-chave do material estudado previamente com quiz dinâmico',
        studentAction: 'Demonstrar os aprendizados prévios e registrar dúvidas imediatas',
        pedagogicalRole: 'Checagem do Estudo Prévio'
      },
      {
        name: 'Collaborative Deep Dive',
        durationMin: 22,
        teacherAction: 'Propor estudos de caso e desafios complexos de alta cognição',
        studentAction: 'Resolver desafios práticos em duplas aplicando a teoria estudada em casa',
        pedagogicalRole: 'Aplicação de Alta Cognição'
      },
      {
        name: 'Creative Synthesis',
        durationMin: 12,
        teacherAction: 'Orientar produção de síntese ou mapa conceitual pelos alunos',
        studentAction: 'Consolidar as conclusões em um produto visual/textual conciso',
        pedagogicalRole: 'Síntese Ativa'
      },
      {
        name: 'Closure & Next Steps',
        durationMin: 8,
        teacherAction: 'Esclarecer dúvidas remanescentes e orientar a próxima tarefa prévia',
        studentAction: 'Autoavaliar a preparação e registrar orientações para a próxima aula',
        pedagogicalRole: 'Fechamento & Próximo Ciclo'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — SALA DE AULA INVERTIDA:
Foque o tempo presencial em atividades de alta ordem cognitiva (análise, síntese, resolução de problemas), partindo da premissa de que o conteúdo básico foi estudado previamente.`,
    schemaStagesExample: [
      {
        name: 'Pre-Class Check',
        durationMin: 8,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Collaborative Deep Dive',
        durationMin: 22,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Creative Synthesis',
        durationMin: 12,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Closure & Next Steps',
        durationMin: 8,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      }
    ]
  },

  // ─── 12. ABORDAGEM LÉXICA (MICHAEL LEWIS) ──────────────────────────────────
  {
    id: 'lexical',
    name: 'Abordagem Léxica (Lexical Approach)',
    badge: '#d33682',
    desc: 'Foco em chunks, collocations e expressões prontas para fluência idiomática',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: 'Co-textualized Encounter',
        durationMin: 10,
        teacherAction: 'Apresentar texto com alta densidade de colocações naturais e blocos léxicos',
        studentAction: 'Compreender o sentido global e identificar o contexto das expressões',
        pedagogicalRole: 'Encontro com Chunks'
      },
      {
        name: 'Chunk Identification & Noticing',
        durationMin: 15,
        teacherAction: 'Guiar os alunos a destacarem blocos de palavras (collocations) em vez de palavras isoladas',
        studentAction: 'Agrupar palavras fixas e semifixas em seus cadernos lexicais',
        pedagogicalRole: 'Noticing Lexical'
      },
      {
        name: 'Collocation Practice',
        durationMin: 15,
        teacherAction: 'Fornecer exercícios de matching, substituição de chunks e concordância lexical',
        studentAction: 'Manipular os blocos em exercícios estruturados focando na naturalidade',
        pedagogicalRole: 'Prática de Collocations'
      },
      {
        name: 'Personalization & Production',
        durationMin: 10,
        teacherAction: 'Propor produção pessoal onde os alunos incorporem os novos blocos léxicos',
        studentAction: 'Escrever ou falar sobre sua própria realidade utilizando as frases prontas',
        pedagogicalRole: 'Personalização'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — ABORDAGEM LÉXICA (MICHAEL LEWIS):
Privilegie chunks, collocations e expressões idiomáticas frequentes, sem focar em regras gramaticais isoladas.`,
    schemaStagesExample: [
      {
        name: 'Co-textualized Encounter',
        durationMin: 10,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Chunk Identification',
        durationMin: 15,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Collocation Practice',
        durationMin: 15,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      },
      {
        name: 'Personalization',
        durationMin: 10,
        teacherAction: 'Ação do professor',
        studentAction: 'Ação do aluno',
        targetBnccCode: 'Código BNCC'
      }
    ]
  }
]

/**
 * Retorna a configuração completa do framework pedagógico a partir do ID selecionado.
 */
export function getLessonFrameworkConfig(methodologyId: string): LessonFrameworkConfig {
  const cleanId = (methodologyId || '').toLowerCase().trim()
  const found = LESSON_FRAMEWORKS.find(f => f.id.toLowerCase() === cleanId)
  if (found) return found

  // Mapeamentos parciais
  if (cleanId.includes('5e') || cleanId.includes('inquiry')) {
    return LESSON_FRAMEWORKS.find(f => f.id === '5e_inquiry')!
  }
  if (cleanId.includes('willis') || cleanId === 'tblt_willis') {
    return LESSON_FRAMEWORKS.find(f => f.id === 'tblt_willis')!
  }
  if (cleanId.includes('ubd') || cleanId.includes('backward')) {
    return LESSON_FRAMEWORKS.find(f => f.id === 'ubd_backward')!
  }
  if (cleanId.includes('ppp')) {
    return LESSON_FRAMEWORKS.find(f => f.id === 'ppp')!
  }

  // Padrão: TBLT legado
  return LESSON_FRAMEWORKS.find(f => f.id === 'tblt') || LESSON_FRAMEWORKS[0]
}

/**
 * Infere o nível CEFR sugerido com base no ano escolar da turma
 */
export function inferCefrLevelForGrade(gradeYear: string): string {
  const g = (gradeYear || '').toLowerCase()
  if (g.includes('6º') || g.includes('6o') || g.includes('6th')) return 'A1'
  if (g.includes('7º') || g.includes('7o') || g.includes('7th') || g.includes('8º') || g.includes('8o') || g.includes('8th')) return 'A2'
  if (g.includes('9º') || g.includes('9o') || g.includes('9th') || g.includes('1º em') || g.includes('1o em') || g.includes('1ª série')) return 'B1'
  if (g.includes('2º em') || g.includes('2o em') || g.includes('3º em') || g.includes('3o em') || g.includes('ensino médio')) return 'B2'
  return 'A2' // Fallback padrão para EFII
}

/**
 * Retorna as regras de gating e limites de complexidade gramatical e lexical para o nível CEFR
 */
export function getCefrGatingRules(cefrLevel: string): string {
  const lvl = (cefrLevel || '').toUpperCase().trim()
  switch (lvl) {
    case 'A1':
      return `NÍVEL CEFR A1 (Breakthrough):
- Vocabulário restrito a alta frequência (família, rotina, escola, hobbies, cores, números, comida).
- Frases curtas e coordenadas simples (máx 10-12 palavras por oração).
- Gramática permitida: Simple Present, Present Continuous, Can/Can't, There is/are, Imperatives, Pronomes básicos.
- PROIBIDO: Passive Voice, Past Perfect, Conditionals, Phrasal Verbs complexos, vocabulário abstrato.`
    case 'A2':
      return `NÍVEL CEFR A2 (Waystage - KET):
- Vocabulário prático e descritivo (viagens, compras, passado, planos futuros, saúde).
- Frases simples com conectivos básicos (and, but, because, so, when).
- Gramática permitida: Simple Past, Going to, Will (previsão), Comparatives/Superlatives, Have to, Modals (should, must).
- PROIBIDO: 2nd/3rd Conditionals, Past Perfect, Passive Voice múltiplos tempos, vocabulário B2.`
    case 'B1':
      return `NÍVEL CEFR B1 (Threshold - PET):
- Vocabulário intermediário (opiniões, sentimentos, trabalho, lazer, tecnologia, experiências).
- Gramática permitida: Present Perfect (since/for/already/yet), First & Second Conditionals, Relative Clauses (defining), Passive Voice (Simple Present/Past), Used to, Modals of Deduction (might, could).`
    case 'B2':
      return `NÍVEL CEFR B2 (Vantage - FCE):
- Vocabulário avançado e expressivo (argumentação, hipóteses, phrasal verbs idiomáticos, collocations formais).
- Gramática permitida: Third Conditional, Mixed Conditionals, Past Perfect Continuous, Passive Voice avançada, Reported Speech, Wish/If only, Linkers formais (However, Whereas, In spite of, Furthermore).`
    case 'C1':
    case 'C2':
      return `NÍVEL CEFR C1/C2 (Proficient):
- Vocabulário acadêmico e idiomático sofisticado, nuances estilísticas, inversão enfática, cleft sentences.`
    default:
      return ''
  }
}

/**
 * Mapeia armadilhas diagnósticas de interferência do Português Brasileiro (L1 -> EN)
 * para que o professor antecipe e remedie nas etapas da aula.
 */
export function getL1InterferenceDirectives(topic: string, activeProfileName: string): string {
  const pLower = (activeProfileName || '').toLowerCase()
  if (!pLower.includes('inglês') && !pLower.includes('ingles') && !pLower.includes('english')) {
    return ''
  }

  const tLower = (topic || '').toLowerCase()
  const directives: string[] = []

  // 1. Tempos Verbais / Aspecto (Present Perfect, Simple Past, etc.)
  if (/present perfect|perfect|experience|past|tempo|verb/i.test(tLower)) {
    directives.push(
      `- Interferência de Aspecto Verbal L1: Alunos brasileiros tendem a aplicar decalque direto do português usando Simple Past com datas ou Present Perfect indevidamente (ex: "I have seen him yesterday" ou "I am here since Monday" em vez de "I have been here since Monday").`,
      `- Formação de Perguntas: Tendência a omitir operadores auxiliares ("Where you went?" ou "Have you ever eat?"). Exija que a etapa de prática contenha checagem explícita de auxiliares (have/has/did).`
    )
  }

  // 2. Condicionais
  if (/conditional|if|hipótese|se /i.test(tLower)) {
    directives.push(
      `- Interferência Sintática em Condicionais: Tendência a traduzir o futuro do subjuntivo diretamente ("If I will go" ou "If I would have") em vez de "If I go" / "If I had".`,
      `- Alerta do Professor: Conduza perguntas de checagem de conceito (CCQs) contrastando o português com o inglês.`
    )
  }

  // 3. Falsos Cognatos e Vocabulário
  if (/vocabulary|vocabulário|reading|texto|travel|family|work/i.test(tLower) || directives.length === 0) {
    directives.push(
      `- Falsos Amigos (False Friends) e Regência: Alunos frequentemente confundem palavras com grafia similar (pretend/intend, attend/assist, actually/currently) e regência preposicional ("depend of", "interested for").`,
      `- Pluralização de Incontáveis: Prevenir erros comuns do padrão do português (ex: "informations", "advices", "homeworks").`
    )
  }

  return `ANTECIPAÇÃO DE INTERFERÊNCIA L1 (PORTUGUÊS BRASILEIRO ➔ INGLÊS):
${directives.join('\n')}`
}

/**
 * Constrói o bloco de prompt dinâmico adaptado ao framework pedagógico escolhido,
 * conectando lib/pedagogicalMethodologies.ts para enriquecimento, memória longitudinal da turma,
 * gating CEFR e interferência L1, e instruindo a diferenciação rigorosa de habilidades BNCC por etapa pedagógica.
 */
export function buildDynamicFrameworkPrompt(options: {
  activeProfileName: string
  className: string
  gradeYear: string
  topic: string
  methodologyId: string
  targetDurationMinutes: number
  bookTitle?: string
  unitChapter?: string
  bnccPromptString: string
  promptDirective: string
  systemPrompt: string
  classMemorySnippet?: string
  cefrLevel?: string
  l1InterferenceDirectives?: string
  clilConfig?: { subjectId: string; contentTopic: string }
  thinkingRoutineId?: string
  spacedRetrievalHook?: string
  includeGeneralCompetencies?: boolean
  bookReferenceContent?: string
}): string {
  const fw = getLessonFrameworkConfig(options.methodologyId)
  const enrichedMethodologyInfo = buildMethodologyInstructions([options.methodologyId, fw.id, fw.name])

  const cefrGating = options.cefrLevel ? getCefrGatingRules(options.cefrLevel) : ''
  const l1Directives = options.l1InterferenceDirectives || getL1InterferenceDirectives(options.topic, options.activeProfileName)

  // Injeções pedagógicas avançadas
  let clilSection = ''
  if (options.clilConfig && options.clilConfig.contentTopic) {
    const clilRes = buildClilDualObjectives(options.topic, options.clilConfig.subjectId, options.clilConfig.contentTopic)
    clilSection = clilRes.promptDirective
  }

  let routineSection = ''
  if (options.thinkingRoutineId) {
    const routine = HARVARD_THINKING_ROUTINES.find(r => r.id === options.thinkingRoutineId)
    if (routine) {
      routineSection = `\n[ROTINA DE PENSAMENTO VISÍVEL DE HARVARD — ${routine.name}]:\n- Etapas: ${routine.steps.join(' ➔ ')}\n- Propósito Pedagógico: ${routine.pedagogicalPurpose}\n- DIRETIVA: Integre explicitamente os passos desta rotina nas etapas iniciais de investigação/engajamento da aula.`
    }
  }

  const competenciesSection = options.includeGeneralCompetencies
    ? `\n[COMPETÊNCIAS GERAIS DA BNCC — FORMAÇÃO INTEGRAL]:\n- Assegure que as dinâmicas da aula promovam explicitamente competências como Comunicação (CG04), Pensamento Crítico e Criativo (CG02) e Empatia/Cooperação (CG09) no trabalho em duplas/grupos.`
    : ''

  const spacedRetrievalSection = options.spacedRetrievalHook
    ? `\n${options.spacedRetrievalHook}`
    : ''

  let bookContentSection = ''
  if (options.bookReferenceContent && options.bookReferenceContent.trim()) {
    bookContentSection = `\n[CONTEÚDO DE REFERÊNCIA DO LIVRO DIDÁTICO / RAG]:\n${options.bookReferenceContent}\n\nDIRETIVA OBRIGATÓRIA DE ANCORAGEM NO LIVRO DIDÁTICO:\nO plano de aula DEVE ser rigorosamente ancorado no conteúdo, conceitos, vocabulário e exercícios do livro didático acima reproduzido. Em cada etapa do roteiro ("stages"), referencie explicitamente as páginas, seções ou exercícios deste material no campo "materialReference" e incorpore os exemplos reais do livro nas ações do professor e do aluno.`
  }

  // Ajusta durações relativas de exemplo para somar targetDurationMinutes
  const totalBaseDur = fw.defaultStages.reduce((acc, s) => acc + s.durationMin, 0)
  const adjustedStagesExample = fw.schemaStagesExample.map(stg => ({
    ...stg,
    interactionType: stg.name.toLowerCase().includes('task') || stg.name.toLowerCase().includes('practice') || stg.name.toLowerCase().includes('production') ? 'pair' : 'whole_class',
    materialReference: 'Opcional: Livro pág. ou ex.',
    durationMin: Math.max(3, Math.round((stg.durationMin / (totalBaseDur || 50)) * options.targetDurationMinutes))
  }))

  const stagesSchemaJson = JSON.stringify(adjustedStagesExample, null, 2)

  // Instrução rigorosa sobre diferenciação de habilidades BNCC por ação pedagógica
  const bnccDifferentiatorInstruction = `
INSTRUÇÃO CRÍTICA SOBRE ATRIBUIÇÃO DE HABILIDADES BNCC POR ETAPA:
1. Analise a AÇÃO PEDAGÓGICA específica de CADA etapa (ex.: leitura, escrita, oralidade/escuta, conhecimentos linguísticos/gramática).
2. Atribua no campo "targetBnccCode" o código BNCC correspondente a essa prática específica (ex.: se a etapa é de leitura, use a habilidade de leitura; se é de debate oral, use a de oralidade; se é de escrita, use a de escrita).
3. NÃO repita o mesmo código em todas as etapas a menos que genuinamente a mesma e única habilidade esteja sendo trabalhada do início ao fim da aula.
4. Cada etapa DEVE refletir com precisão a modalidade linguística e o foco cognitivo trabalhado nela.
5. No campo "interactionType" de cada etapa, declare a dinâmica de interação: 'whole_class' (turma toda), 'pair' (dupla), 'group' (pequeno grupo), 'individual' (individual), ou 'teacher_student' (professor-aluno).
6. No campo "materialReference" de cada etapa, cite opcionalmente páginas ou exercícios do material/livro (ex: "Livro pág. 42 ex. 3-5").
`

  const contextualSections = [
    options.classMemorySnippet ? `\n${options.classMemorySnippet}` : '',
    spacedRetrievalSection,
    cefrGating ? `\n[GATING CEFR & LIMITES LINGUÍSTICOS (${options.cefrLevel})]:\n${cefrGating}` : '',
    l1Directives ? `\n[ESPECIALIZAÇÃO ELT BRASIL — ${l1Directives}]` : '',
    clilSection,
    routineSection,
    competenciesSection,
    bookContentSection
  ].filter(Boolean).join('\n')

  if (fw.reasoningOrder === 'backward_design') {
    return `Você é um coordenador pedagógico sênior especialista em Ensino de ${options.activeProfileName} e Planejamento Reverso (Backward Design / UbD de Grant Wiggins e Jay McTighe).
Elabore um Plano de Aula estruturado rigorosamente sob o framework ${fw.name} para a seguinte configuração:

DADOS DA AULA:
- Disciplina: ${options.activeProfileName}
- Turma: ${options.className} (${options.gradeYear})
- Tópico Central: "${options.topic}"
- Framework Pedagógico: ${fw.name} (${fw.desc})
- Duração Total da Aula: ${options.targetDurationMinutes} minutos (a soma de durationMin de todas as etapas DEVE totalizar exatamente ${options.targetDurationMinutes} min)
- Material de Apoio: ${options.bookTitle || 'Livro Didático'} ${options.unitChapter ? `(${options.unitChapter})` : ''}
- Habilidades BNCC Alvo: ${options.bnccPromptString}
${options.cefrLevel ? `- Nível CEFR Alvo: ${options.cefrLevel}` : ''}

${fw.promptDirective}
${enrichedMethodologyInfo}
${options.promptDirective}
${options.systemPrompt}
${contextualSections}
${bnccDifferentiatorInstruction}

ORDEM DE RACIOCÍNIO BACKWARD DESIGN (MANDATO DE INVERSÃO):
1. ESTÁGIO 1 & 2 (RESULTADO DESEJADO E EVIDÊNCIA ANTES DE TUDO):
   Primeiro, declare as Questões Essenciais e a Evidência Observável de Avaliação Formativa / Tarefa Autêntica de Desempenho (Stage 2) que comprova a compreensão duradoura dos alunos.
2. DESIGN RATIONALE (JUSTIFICATIVA METACONCEITUAL):
   Exponha explicitamente como e por que o plano foi concebido de trás para frente ("designRationale"), conectando a avaliação às etapas de ensino.
3. ESTÁGIO 3 (PLANO DE APRENDIZAGEM DERIVADO DA AVALIAÇÃO):
   Em seguida, derive o Roteiro de Aprendizagem (Estágio 3) como um meio estrito para capacitar o aluno a atingir a evidência do Estágio 2. Em cada etapa, inclua "stageRationale" explicando qual parte da evidência final ela constrói (Hook, Equip, Rethink, Demonstrate).

Retorne ESTRITAMENTE um objeto JSON no formato:
{
  "description": "Resumo geral conciso do que será realizado nesta aula",
  "generalObjective": "Objetivo geral de aprendizagem da aula",
  "specificObjectives": "1. Primeiro objetivo específico observável\n2. Segundo objetivo específico\n3. Terceiro objetivo específico",
  "socioemotionalObjectives": "Objetivo socioemocional ou de desenvolvimento pessoal (ex: cooperação, empatia, escuta ativa)",
  "lessonGoal": "Meta clara de sucesso da aula (o que os alunos serão capazes de realizar com autonomia ao final)",
  "anticipatedProblems": "Dificuldades e erros conceituais ou linguísticos mais prováveis da turma e estratégias de apoio",
  "priorKnowledge": "Conhecimentos e habilidades prévias que os alunos já dominam e que servem de base para esta aula",
  "preTeach": "Vocabulário-chave, estruturas ou conceitos prévios que precisam ser ensinados antes da atividade principal",
  "guidingQuestions": [
    "Questão Essencial 1 (UbD Stage 1)",
    "Questão Essencial 2 (UbD Stage 1)"
  ],
  "assessmentEvidence": "Critério claro e evidência observável de avaliação formativa/tarefa autêntica de desempenho (UbD Stage 2) definida ANTES das etapas de ensino",
  "designRationale": "Explicação metacognitiva explícita do raciocínio reverso: por que cada etapa foi derivada a partir do objetivo e da evidência de avaliação declarada",
  "stages": ${stagesSchemaJson},
  "homework": "Atividade de casa conectada aos objetivos duradouros"
}`
  }

  // Padrão para os demais frameworks (5E, TBLT Willis, PPP, etc.)
  return `Você é um coordenador pedagógico sênior especialista em Ensino de ${options.activeProfileName}.
Elabore um Plano de Aula estruturado sob o framework ${fw.name} para a seguinte configuração:

DADOS DA AULA:
- Disciplina: ${options.activeProfileName}
- Turma: ${options.className} (${options.gradeYear})
- Tópico Central: "${options.topic}"
- Metodologia Ativa / Framework: ${fw.name}
- Duração Total da Aula: ${options.targetDurationMinutes} minutos (a soma de durationMin de todas as etapas DEVE totalizar exatamente ${options.targetDurationMinutes} min)
- Material de Apoio: ${options.bookTitle || 'Livro Didático'} ${options.unitChapter ? `(${options.unitChapter})` : ''}
- Habilidades BNCC Alvo: ${options.bnccPromptString}
${options.cefrLevel ? `- Nível CEFR Alvo: ${options.cefrLevel}` : ''}

${fw.promptDirective}
${enrichedMethodologyInfo}
${options.promptDirective}
${options.systemPrompt}
${contextualSections}
${bnccDifferentiatorInstruction}

Retorne ESTRITAMENTE um objeto JSON no formato:
{
  "description": "Resumo geral conciso do que será realizado nesta aula",
  "generalObjective": "Objetivo geral de aprendizagem da aula",
  "specificObjectives": "1. Primeiro objetivo específico observável\n2. Segundo objetivo específico\n3. Terceiro objetivo específico",
  "socioemotionalObjectives": "Objetivo socioemocional ou de desenvolvimento pessoal (ex: cooperação, empatia, escuta ativa)",
  "lessonGoal": "Meta clara de sucesso da aula (o que os alunos serão capazes de realizar com autonomia ao final)",
  "anticipatedProblems": "Dificuldades e erros conceituais ou linguísticos mais prováveis da turma e estratégias de apoio",
  "priorKnowledge": "Conhecimentos e habilidades prévias que os alunos já dominam e que servem de base para esta aula",
  "preTeach": "Vocabulário-chave, estruturas ou conceitos prévios que precisam ser ensinados antes da atividade principal",
  "guidingQuestions": ["Pergunta-guia 1", "Pergunta-guia 2"],
  "assessmentEvidence": "Critério e evidência observável de avaliação formativa",
  "stages": ${stagesSchemaJson},
  "homework": "Sugestão concisa de atividade para casa"
}`
}

