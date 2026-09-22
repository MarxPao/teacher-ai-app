/**
 * __tests__/retrievalBenchmark.test.ts — Golden Dataset & Benchmark de Retrieval (Memory Engine Fase 5 & 5.1 Hardening)
 *
 * Valida os 20 cenários canônicos de regressão crítica:
 * 1. Prevenção absoluta de vazamento de dados de alunos (forbiddenIncludeIds).
 * 2. Supressão total de regras substituídas (status: 'superseded').
 * 3. Dinâmica de pesos e meia-vida (tau_1/2) por categoria.
 * 4. Ativação de procedimentos operacionais via taskBinding match.
 * 5. Orçamento estrito de tokens e isolamento entre escolas.
 * 6. Métricas: Recall >= 95%, Precision@K >= 70%, Latência p95 <= 35ms.
 */

import { describe, it, expect } from 'vitest'
import {
  rerankRetrievedNodes,
  retrieveRelevantMemories,
  computeCompositeScore,
  formatGroundedKnowledgeSnippet,
  MemoryNode
} from '../lib/hybridRetriever'

export interface RetrievalTestCase {
  id: string
  scenarioName: string
  query: string
  taskContext?: string
  targetStudentId?: string
  schoolId?: string
  tokenBudget?: number
  topK?: number
  minPrecisionAtK?: number
  expectedIncludeIds: string[]
  forbiddenIncludeIds: string[]
  rationale: string
}

// ==============================================================================
// 1. POOL GLOBAL DE MEMÓRIAS PARA O BENCHMARK (Fixtures Canônicas)
// ==============================================================================
const BENCHMARK_MEMORY_POOL: MemoryNode[] = [
  // TC-01: Isolamento de Aluno
  {
    id: 'dossier_alice_baesso',
    studentId: 'std_alice_baesso',
    studentName: 'Alice Bitencourt Baesso',
    category: 'student_fact',
    text: 'Alice Bitencourt Baesso: Rendimento recente consistente em leitura e listening, mas apresenta dúvidas em tempos perfeitos.',
    confidence: 0.90,
    daysAgo: 2,
    accessCount: 12
  },
  {
    id: 'dossier_bernardo_silva',
    studentId: 'std_bernardo_silva',
    studentName: 'Bernardo Silva',
    category: 'student_fact',
    text: 'Bernardo Silva: Rendimento excelente em conversação, pontuação máxima no simulado.',
    confidence: 0.85,
    daysAgo: 2,
    accessCount: 5
  },
  {
    id: 'dossier_pedro_costa',
    studentId: 'std_pedro_costa',
    studentName: 'Pedro Costa',
    category: 'student_fact',
    text: 'Pedro Costa: Dificuldades em redação formal e uso de pronomes relativos.',
    confidence: 0.80,
    daysAgo: 5,
    accessCount: 3
  },

  // TC-02: Isolamento de Homônimo
  {
    id: 'dossier_lucas_silva_9a',
    studentId: 'std_lucas_silva_9a',
    studentName: 'Lucas Silva',
    category: 'student_fact',
    text: 'Lucas Silva (Turma 9A): Feedback positivo sobre evolução na participação oral.',
    confidence: 0.90,
    daysAgo: 3,
    accessCount: 10
  },
  {
    id: 'dossier_lucas_mendes_8b',
    studentId: 'std_lucas_mendes_8b',
    studentName: 'Lucas Mendes',
    category: 'student_fact',
    text: 'Lucas Mendes (Turma 8B): Feedback pendente sobre entrega do trabalho de artes.',
    confidence: 0.85,
    daysAgo: 3,
    accessCount: 4
  },

  // TC-03: Supressão de Regra Substituída
  {
    id: 'fact_grading_active_v2',
    category: 'grading_rigor',
    text: 'Critério de pontuação de redação: descontar 0.25 por desvio gramatical até o teto de 2.0 pontos.',
    confidence: 0.95,
    status: 'ativo',
    daysAgo: 4,
    accessCount: 15
  },
  {
    id: 'fact_grading_superseded_v1',
    category: 'grading_rigor',
    text: 'Critério de pontuação de redação: descontar 0.50 por desvio gramatical sem teto.',
    confidence: 0.95,
    status: 'superseded', // TERMINANTEMENTE PROIBIDO
    daysAgo: 60,
    accessCount: 1
  },

  // TC-04: Revogação de Arredondamento
  {
    id: 'fact_round_decimal_new',
    category: 'grading_rigor',
    taskBinding: 'gradebook',
    text: 'Lançamento de notas na caderneta: manter uma casa decimal (ex: 6.7 permanece 6.7 sem arredondar).',
    confidence: 0.95,
    status: 'ativo',
    daysAgo: 2,
    accessCount: 18
  },
  {
    id: 'fact_round_integer_old',
    category: 'grading_rigor',
    taskBinding: 'gradebook',
    text: 'Lançamento de notas na caderneta: arredondar sempre para o inteiro mais próximo (ex: 6.7 vira 7.0).',
    confidence: 0.90,
    status: 'superseded',
    daysAgo: 90,
    accessCount: 0
  },

  // TC-05: Regras Conflitantes
  {
    id: 'fact_late_conflict_a',
    category: 'pedagogical_rule',
    text: 'Tolerância de horário de entrega de tarefas: aceitar até 23h59 do dia estipulado sem penalidade.',
    confidence: 0.70,
    status: 'conflitante',
    daysAgo: 5,
    accessCount: 4
  },
  {
    id: 'fact_late_conflict_b',
    category: 'pedagogical_rule',
    text: 'Tolerância de horário de entrega de tarefas: tolerância máxima de 15 minutos após o sinal da aula.',
    confidence: 0.65,
    status: 'conflitante',
    daysAgo: 5,
    accessCount: 4
  },

  // TC-06: Recência
  {
    id: 'fact_exam_yesterday',
    category: 'teaching_style',
    taskBinding: 'exam_generator',
    text: 'Anotações recentes sobre critérios da prova: incluir 4 alternativas em vez de 5 nas questões de múltipla escolha.',
    confidence: 0.90,
    daysAgo: 1, // Muito recente
    accessCount: 8
  },
  {
    id: 'fact_exam_six_months_ago',
    category: 'teaching_style',
    taskBinding: 'exam_generator',
    text: 'Anotações sobre critérios da prova: incluir 5 alternativas nas questões objetivas.',
    confidence: 0.90,
    daysAgo: 180, // 6 meses atrás (decay profundo)
    accessCount: 1
  },

  // TC-07: Frequência
  {
    id: 'fact_comm_frequent_30acc',
    category: 'communication_rule',
    text: 'Estilo geral de comunicação da professora: respostas objetivas, empáticas e em tópicos estruturados.',
    confidence: 0.85,
    daysAgo: 15,
    accessCount: 30 // Alta consolidação por frequência
  },
  {
    id: 'fact_comm_rare_0acc',
    category: 'communication_rule',
    text: 'Estilo geral de comunicação da professora: usar linguagem excessivamente formal e rebuscada.',
    confidence: 0.50,
    daysAgo: 25,
    accessCount: 0 // Sem acessos
  },

  // TC-08: Núcleo Duro Institucional
  {
    id: 'fact_inst_presence_75',
    category: 'school_policy',
    scope: 'institutional',
    taskBinding: 'attendance',
    text: 'Regra institucional da escola sobre faltas e frequência: O aluno precisa de no mínimo 75% de presença para evitar reprovação.',
    confidence: 0.95,
    daysAgo: 300, // Antigo, mas institucional (tau_1/2 = 180d)
    accessCount: 20
  },

  // TC-09: Procedural em Avaliação
  {
    id: 'proc_exam_cambridge_tkt',
    category: 'procedural',
    taskBinding: 'exam_generator',
    text: 'Procedimento Cambridge TKT para avaliação bimestral de inglês: 1. Warm-up contextualizado, 2. Reading com 3 questões, 3. Grammar em lacunas, 4. Gabarito com rubrica.',
    confidence: 0.95,
    daysAgo: 10,
    accessCount: 14
  },

  // TC-10: Procedural em Correção (OmniGrader)
  {
    id: 'proc_essay_rubric_4levels',
    category: 'procedural',
    taskBinding: 'omnigrader',
    text: 'Procedimento para corrigir ensaio dissertativo no OmniGrader: aplicar rubrica em 4 níveis (Tese, Argumentação, Coesão, Norma Culta) com nota por faixa.',
    confidence: 0.95,
    daysAgo: 8,
    accessCount: 16
  },

  // TC-12: TEA / Acomodação
  {
    id: 'dossier_daniel_tea_accomodation',
    studentId: 'std_daniel_tea',
    studentName: 'Daniel Oliveira',
    category: 'student_fact',
    text: 'Daniel Oliveira: Diagnóstico de TEA. Orientações para avaliações: tempo estendido em 30min, fonte tamanho 14 e enunciados diretos sem metáforas.',
    confidence: 0.98,
    daysAgo: 5,
    accessCount: 22
  },

  // TC-13: Rigor com Alta Confiança
  {
    id: 'fact_rigor_high_confidence',
    category: 'grading_rigor',
    text: 'Tolerância para vocabulário informal na produção textual: aceitar gírias leves apenas se contextualizadas em diálogos de personagens.',
    confidence: 0.95, // Alta confiança certificada
    daysAgo: 7,
    accessCount: 15
  },
  {
    id: 'fact_rigor_low_confidence_drift',
    category: 'grading_rigor',
    text: 'Tolerância para vocabulário informal: tolerar qualquer expressão moderna sem penalização.',
    confidence: 0.30, // Inferência fraca
    daysAgo: 20,
    accessCount: 0
  },

  // TC-14: Tarefa Expirada
  {
    id: 'fact_task_expired_45days',
    category: 'task',
    text: 'Lembrar de comprar cartolina amarela na papelaria para a aula da semana passada.',
    confidence: 0.40,
    daysAgo: 45, // Tarefa com 45 dias (tau_1/2 = 3d => decaiu para ~0)
    accessCount: 0
  },

  // TC-15: Macro-Diretriz Fundida
  {
    id: 'fact_consolidated_parent_style',
    category: 'parent_comms',
    taskBinding: 'parent_comms',
    text: 'Diretriz Consolidada de Comunicação com Pais: Manter tom acolhedor, destacar pontos fortes antes dos desafios e encerrar com proposta prática de colaboração.',
    confidence: 0.95,
    daysAgo: 3,
    accessCount: 20
  },
  {
    id: 'fact_frag_parent_1',
    category: 'parent_comms',
    taskBinding: 'parent_comms',
    text: 'Responder aos pais de forma amigável.',
    status: 'superseded',
    daysAgo: 40,
    accessCount: 1
  },
  {
    id: 'fact_frag_parent_2',
    category: 'parent_comms',
    taskBinding: 'parent_comms',
    text: 'Evitar termos técnicos nas mensagens enviadas aos responsáveis.',
    status: 'superseded',
    daysAgo: 40,
    accessCount: 1
  },

  // TC-16: Unidade Temática
  {
    id: 'fact_topic_simple_past_unit3',
    category: 'subject_matter',
    taskBinding: 'lesson_planner',
    text: 'Conteúdo trabalhado no Simple Past (Unidade 3): verbos regulares com terminação -ed e lista dos 20 verbos irregulares mais comuns.',
    confidence: 0.90,
    daysAgo: 10,
    accessCount: 12
  },
  {
    id: 'fact_topic_passive_voice',
    category: 'subject_matter',
    taskBinding: 'lesson_planner',
    text: 'Conteúdo programático de Voz Passiva: conversão de agente da passiva com by.',
    confidence: 0.90,
    daysAgo: 10,
    accessCount: 3
  },

  // TC-17: Orçamento de Tokens
  {
    id: 'top_k_items_under_budget',
    category: 'personal_convention',
    text: 'Regras da turma 9A: chamada nos primeiros 5 minutos e entrega de cadernos no início.',
    confidence: 0.90,
    daysAgo: 2,
    accessCount: 10
  },
  {
    id: 'overflow_items_beyond_budget',
    category: 'personal_convention',
    text: 'Regras adicionais secundárias da turma 9A com texto excessivamente prolixo e detalhado que excede o orçamento de tokens especificado no benchmark de contexto estrito.',
    confidence: 0.70,
    daysAgo: 20,
    accessCount: 1
  },

  // TC-18: Cross-School
  {
    id: 'fact_school_machado_recovery',
    schoolId: 'machado',
    category: 'school_policy',
    text: 'Diretriz de recuperação na Escola Machado: prova substitutiva aplicada no final de cada bimestre valendo até 10 pontos.',
    confidence: 0.95,
    daysAgo: 5,
    accessCount: 10
  },
  {
    id: 'fact_school_outro_colegio',
    schoolId: 'outro_colegio',
    category: 'school_policy',
    text: 'Diretriz de recuperação do Colégio Externo: prova contínua com média aritmética simples sem prova substitutiva.',
    confidence: 0.95,
    daysAgo: 5,
    accessCount: 2
  },

  // TC-19: Tarefa Agendada
  {
    id: 'task_due_tomorrow_grading',
    category: 'task',
    taskBinding: 'general',
    text: 'Compromisso agendado para amanhã: corrigir as 35 provas da turma 9A e fechar notas no sistema.',
    confidence: 0.95,
    daysAgo: 0, // Hoje
    accessCount: 5
  },
  {
    id: 'task_completed_last_month',
    category: 'task',
    taskBinding: 'general',
    text: 'Compromisso concluído no mês passado: emitir boletins do 1º bimestre.',
    confidence: 0.40,
    daysAgo: 35,
    accessCount: 0
  },

  // TC-20: Excursão vs Rigor de Notas
  {
    id: 'fact_event_excursion_lunch',
    category: 'school_context',
    text: 'Orientações para a excursão pedagógica: autorização assinada e preparar lanche saudável individual para os alunos.',
    confidence: 0.90,
    daysAgo: 4,
    accessCount: 8
  },
  {
    id: 'fact_grading_rigor_generic',
    category: 'grading_rigor',
    text: 'Rigor de notas de provas bimestrais e cálculo de médias do conselho de classe.',
    confidence: 0.90,
    daysAgo: 30,
    accessCount: 2
  }
]

// ==============================================================================
// 2. CONJUNTO DOS 20 CENÁRIOS CANÔNICOS
// ==============================================================================
const CANONICAL_20_TEST_CASES: RetrievalTestCase[] = [
  {
    id: 'TC-01',
    scenarioName: 'Isolamento de Aluno (Dossiê)',
    query: 'Qual o rendimento recente de Alice Baesso?',
    taskContext: 'general',
    targetStudentId: 'std_alice_baesso',
    expectedIncludeIds: ['dossier_alice_baesso'],
    forbiddenIncludeIds: ['dossier_bernardo_silva', 'dossier_pedro_costa'],
    rationale: 'Prevenção estrita de vazamento entre alunos (LGPD).'
  },
  {
    id: 'TC-02',
    scenarioName: 'Isolamento de Aluno Homônimo',
    query: 'Feedback para Lucas Silva',
    taskContext: 'omnigrader',
    targetStudentId: 'std_lucas_silva_9a',
    expectedIncludeIds: ['dossier_lucas_silva_9a'],
    forbiddenIncludeIds: ['dossier_lucas_mendes_8b'],
    rationale: 'Desambiguação de homônimo com classe e ID corretos.'
  },
  {
    id: 'TC-03',
    scenarioName: 'Supressão de Regra Substituída',
    query: 'Critério de pontuação de redação',
    taskContext: 'omnigrader',
    expectedIncludeIds: ['fact_grading_active_v2'],
    forbiddenIncludeIds: ['fact_grading_superseded_v1'],
    rationale: 'Regra superseded nunca pode ser recuperada.'
  },
  {
    id: 'TC-04',
    scenarioName: 'Respeito à Revogação de Arredondamento',
    query: 'Como devo lançar a nota de 6.7?',
    taskContext: 'gradebook',
    expectedIncludeIds: ['fact_round_decimal_new'],
    forbiddenIncludeIds: ['fact_round_integer_old'],
    rationale: 'Prevalece a regra nova em detrimento da revogada.'
  },
  {
    id: 'TC-05',
    scenarioName: 'Sinalização de Regra Conflitante',
    query: 'Qual a tolerância de horário de entrega?',
    taskContext: 'general',
    expectedIncludeIds: ['fact_late_conflict_a', 'fact_late_conflict_b'],
    forbiddenIncludeIds: [],
    rationale: 'Fatos em conflito devem ser recuperados com sinalização de status.'
  },
  {
    id: 'TC-06',
    scenarioName: 'Efeito do Score Composto (Recência)',
    query: 'Anotações recentes sobre critérios da prova',
    taskContext: 'exam_generator',
    topK: 1,
    expectedIncludeIds: ['fact_exam_yesterday'],
    forbiddenIncludeIds: ['fact_exam_six_months_ago'],
    rationale: 'Fato de ontem vence o de 6 meses atrás devido ao decaimento exponencial.'
  },
  {
    id: 'TC-07',
    scenarioName: 'Efeito do Score Composto (Frequência)',
    query: 'Qual estilo geral de comunicação adotar?',
    taskContext: 'general',
    expectedIncludeIds: ['fact_comm_frequent_30acc'],
    forbiddenIncludeIds: ['fact_comm_rare_0acc'],
    rationale: 'Hábito com 30 acessos vence fato pontual com 0 acessos.'
  },
  {
    id: 'TC-08',
    scenarioName: 'Proteção de Núcleo Duro Institucional',
    query: 'Quantas faltas reprovam o aluno?',
    taskContext: 'attendance',
    expectedIncludeIds: ['fact_inst_presence_75'],
    forbiddenIncludeIds: [],
    rationale: 'Regra institucional antiga é imune a decaimento agressivo (tau_1/2 = 180d).'
  },
  {
    id: 'TC-09',
    scenarioName: 'Ativação Procedural em Elaboração de Prova',
    query: 'Gerar avaliação bimestral de inglês B1',
    taskContext: 'exam_generator',
    expectedIncludeIds: ['proc_exam_cambridge_tkt'],
    forbiddenIncludeIds: [],
    rationale: 'Memória procedural ativada pelo bônus de tarefa (taskBinding: exam_generator).'
  },
  {
    id: 'TC-10',
    scenarioName: 'Ativação Procedural em Correção de Textos',
    query: 'Corrigir ensaio dissertativo',
    taskContext: 'omnigrader',
    expectedIncludeIds: ['proc_essay_rubric_4levels'],
    forbiddenIncludeIds: [],
    rationale: 'Procedimento de rubrica ativado pelo OmniGrader.'
  },
  {
    id: 'TC-11',
    scenarioName: 'Chitchat Bypass (Fast-Path Router)',
    query: 'Bom dia Rafinha, tudo bem?',
    taskContext: 'general',
    expectedIncludeIds: [],
    forbiddenIncludeIds: ['fact_grading_active_v2', 'dossier_alice_baesso'],
    rationale: 'Nenhum fato pesado deve ser recuperado em saudação trivial.'
  },
  {
    id: 'TC-12',
    scenarioName: 'Acomodação Específica de Aluno com TEA',
    query: 'Orientações para aplicar prova no Daniel',
    taskContext: 'exam_generator',
    targetStudentId: 'std_daniel_tea',
    expectedIncludeIds: ['dossier_daniel_tea_accomodation'],
    forbiddenIncludeIds: [],
    rationale: 'Acomodação legal prioritária resgatada com alta confiança.'
  },
  {
    id: 'TC-13',
    scenarioName: 'Rigor Avaliativo com Alta Confiança',
    query: 'Qual a tolerância para vocabulário informal?',
    taskContext: 'general',
    expectedIncludeIds: ['fact_rigor_high_confidence'],
    forbiddenIncludeIds: ['fact_rigor_low_confidence_drift'],
    rationale: 'Alta confiança (0.95) prevalece sobre inferência fraca (0.30).'
  },
  {
    id: 'TC-14',
    scenarioName: 'Não Recuperação de Fato Expirado',
    query: 'Lembrar de comprar cartolina amarela',
    taskContext: 'general',
    expectedIncludeIds: [],
    forbiddenIncludeIds: ['fact_task_expired_45days'],
    rationale: 'Fato expirado decaiu e fica abaixo do threshold.'
  },
  {
    id: 'TC-15',
    scenarioName: 'Macro-Diretriz Fundida na Dream Phase',
    query: 'Como formatar minhas respostas aos pais?',
    taskContext: 'parent_comms',
    expectedIncludeIds: ['fact_consolidated_parent_style'],
    forbiddenIncludeIds: ['fact_frag_parent_1', 'fact_frag_parent_2'],
    rationale: 'Macro-regra fundida prevalece e fragmentos superseded são bloqueados.'
  },
  {
    id: 'TC-16',
    scenarioName: 'Recuperação Transversal por Unidade Temática',
    query: 'O que trabalhamos no Simple Past?',
    taskContext: 'lesson_planner',
    expectedIncludeIds: ['fact_topic_simple_past_unit3'],
    forbiddenIncludeIds: ['fact_topic_passive_voice'],
    rationale: 'Similaridade foca na unidade temática solicitada.'
  },
  {
    id: 'TC-17',
    scenarioName: 'Orçamento Estrito de Tokens (Corte Limpo)',
    query: 'Resumo geral de todas as regras da turma 9A',
    taskContext: 'general',
    tokenBudget: 35, // Força corte do segundo nó prolixo
    expectedIncludeIds: ['top_k_items_under_budget'],
    forbiddenIncludeIds: ['overflow_items_beyond_budget'],
    rationale: 'O retriever corta rigorosamente respeitando o token budget.'
  },
  {
    id: 'TC-18',
    scenarioName: 'Reconciliação Cross-School',
    query: 'Diretriz de recuperação na Escola Machado',
    taskContext: 'exam_generator',
    schoolId: 'machado',
    expectedIncludeIds: ['fact_school_machado_recovery'],
    forbiddenIncludeIds: ['fact_school_outro_colegio'],
    rationale: 'Similaridade e escopo isolam a escola solicitada.'
  },
  {
    id: 'TC-19',
    scenarioName: 'Tarefa Agendada Próxima',
    query: 'O que tenho para fechar notas esta semana?',
    taskContext: 'general',
    expectedIncludeIds: ['task_due_tomorrow_grading'],
    forbiddenIncludeIds: ['task_completed_last_month'],
    rationale: 'Tarefa recente e pendente pontua alto; antiga decaiu.'
  },
  {
    id: 'TC-20',
    scenarioName: 'Imunização contra Falsas Correspondências',
    query: 'Preparar lanche para a excursão',
    taskContext: 'general',
    expectedIncludeIds: ['fact_event_excursion_lunch'],
    forbiddenIncludeIds: ['fact_grading_rigor_generic'],
    rationale: 'Nenhuma colisão com regras de notas em queries de excursão.'
  }
]

describe('Memory Engine — Fase 5 & 5.1 Hardening: Golden Dataset Benchmark (20 Cenários)', () => {
  let totalRecalled = 0
  let totalExpected = 0
  let precisionSum = 0
  let totalQueriesEvaluated = 0
  let totalMinSlots = 0

  CANONICAL_20_TEST_CASES.forEach((tc) => {
    it(`[${tc.id}] ${tc.scenarioName} — ${tc.rationale}`, () => {
      const topK = tc.topK ?? 5
      const result = retrieveRelevantMemories(
        tc.query,
        BENCHMARK_MEMORY_POOL,
        undefined,
        {
          topK,
          taskContext: tc.taskContext,
          targetStudentId: tc.targetStudentId,
          schoolId: tc.schoolId,
          tokenBudget: tc.tokenBudget,
          threshold: 0.20
        }
      )

      const returnedIds = result.nodes.map(n => n.id)

      // 1. REGRA SUPREMA: Tolerância ZERO para itens proibidos (Vazamento LGPD / Superseded)
      for (const forbiddenId of tc.forbiddenIncludeIds) {
        expect(returnedIds).not.toContain(forbiddenId)
      }

      // 2. Verificação dos itens obrigatórios (Recall)
      for (const expectedId of tc.expectedIncludeIds) {
        expect(returnedIds).toContain(expectedId)
      }

      // 3. Cálculo de métricas para agregações CI
      if (tc.expectedIncludeIds.length > 0) {
        const matches = tc.expectedIncludeIds.filter(id => returnedIds.includes(id)).length
        const minKAndExpected = Math.min(topK, tc.expectedIncludeIds.length)

        totalRecalled += matches
        totalExpected += tc.expectedIncludeIds.length
        totalMinSlots += minKAndExpected

        /**
         * NOTA MATEMÁTICA SOBRE O ESPAÇO DISCRETO DE Precision@K:
         * Precision@K = |R_K ∩ E| / min(K, |E|)
         * Como |R_K ∩ E| é um inteiro em {0, ..., min(K, |E|)}:
         * - Se min(K, |E|) = 1 => Valores possíveis: { 0.00, 1.00 }
         * - Se min(K, |E|) = 2 => Valores possíveis: { 0.00, 0.50, 1.00 }
         * - Se min(K, |E|) = 3 => Valores possíveis: { 0.00, 0.33, 0.67, 1.00 }
         * Um piso nominal arbitrário (ex: 0.66 com min=2) na prática força 100% (2/2).
         * Aqui garantimos piso individual estrito (>= 0.50) para que nenhum caso falhe silenciosamente.
         */
        const pAtK = matches / minKAndExpected
        precisionSum += pAtK
        totalQueriesEvaluated++

        // Proteção contra mascaramento: cada caso individual deve pontuar com sucesso
        expect(pAtK).toBeGreaterThanOrEqual(0.50)

        if (tc.minPrecisionAtK !== undefined) {
          expect(pAtK).toBeGreaterThanOrEqual(tc.minPrecisionAtK)
        }
      } else {
        // Fast-path ou query sem expectativa de RAG
        if (result.fastPath) {
          expect(returnedIds.length).toBe(0)
        }
      }
    })
  })

  it('Garante métricas agregadas globais do CI (Macro e Micro-Ponderada) sem mascaramento estatístico', () => {
    // 1. Recall Global
    const globalRecall = totalRecalled / Math.max(1, totalExpected)

    // 2. Macro-Média de Precisão (Média simples sobre as N consultas avaliadas)
    const macroPrecision = precisionSum / Math.max(1, totalQueriesEvaluated)

    // 3. Micro-Média Ponderada (Total absoluto de matches sobre o total de slots esperados)
    // Previne que consultas com K menor e precisão binária mascarem ou sejam mascaradas por consultas com K maior
    const microWeightedPrecision = totalRecalled / Math.max(1, totalMinSlots)

    expect(globalRecall).toBeGreaterThanOrEqual(0.95)
    expect(macroPrecision).toBeGreaterThanOrEqual(0.70)
    expect(microWeightedPrecision).toBeGreaterThanOrEqual(0.70)
  })

  it('Garante que Grounding XML é estruturado corretamente com tags <grounded_knowledge>', () => {
    const sampleRanked = rerankRetrievedNodes(
      'Qual o rendimento de Alice?',
      BENCHMARK_MEMORY_POOL,
      undefined,
      { targetStudentId: 'std_alice_baesso', topK: 1 }
    )

    const xml = formatGroundedKnowledgeSnippet(sampleRanked)
    expect(xml).toContain('<grounded_knowledge>')
    expect(xml).toContain('</grounded_knowledge>')
    expect(xml).toContain('<memory_item id="dossier_alice_baesso"')
    expect(xml).toContain('type="student_fact"')
    expect(xml).toContain('confidence=')
  })

  it('Garante performance e latência p95 <= 35ms para re-ranquear 50 candidatos', () => {
    // Gera pool sintético de 50 nós
    const largePool: MemoryNode[] = Array.from({ length: 50 }, (_, i) => ({
      id: `synthetic_node_${i}`,
      text: `Diretriz pedagógica número ${i} sobre avaliação formativa, rubricas e feedback com palavras-chave relevantes.`,
      category: i % 2 === 0 ? 'grading_rigor' : 'teaching_style',
      confidence: 0.80,
      daysAgo: i * 2,
      accessCount: i % 10
    }))

    const iterations = 30
    const latencies: number[] = []

    for (let j = 0; j < iterations; j++) {
      const start = performance.now()
      rerankRetrievedNodes(
        'Como aplicar avaliação formativa e feedback nos alunos do 9º ano?',
        largePool,
        undefined,
        { topK: 5, taskContext: 'omnigrader' }
      )
      const duration = performance.now() - start
      latencies.push(duration)
    }

    latencies.sort((a, b) => a - b)
    const p95Index = Math.floor(latencies.length * 0.95)
    const p95Latency = latencies[p95Index]

    expect(p95Latency).toBeLessThanOrEqual(35)
  })
})
