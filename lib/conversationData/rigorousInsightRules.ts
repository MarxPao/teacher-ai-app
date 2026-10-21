/**
 * lib/conversationData/rigorousInsightRules.ts
 *
 * Catálogo Pedagógico Formal Rigoroso (C2, C3, C4, C5, C6, C7).
 *
 * Princípios Fundamentais:
 * 1. Separação estrita entre fonteTeorica (obra que fundamenta o conceito) e limiarOrigem ('definicao_a_validar').
 * 2. Nenhum número numérico é falsamente atribuído a autores (Swain, Long & Sato, Rowe, Sweller, Black & Wiliam).
 * 3. Todos os limiares são configuráveis pela professora com valores padrão documentados.
 * 4. Toda a devolutiva gerada é estritamente DESCRITIVA e reflexiva ("pode indicar", "vale observar").
 * 5. Termos proibidos eliminados: ['reflete', 'prejudica', 'garante', 'ideal', 'deveria', 'correto', 'inadequado', 'insuficiente'].
 * 6. Escopo por disciplina/tipo de sessão: regras de língua adicional só ativam com marcação explícita de L2.
 * 7. Incerteza documentada de perguntas com limite inferior e recall de Wilson.
 */

import type { SessionPedagogicalReport } from './pedagogicalMetrics'

export interface MinimoAmostral {
  minTurns?: number
  minDurationMs?: number
  minTeacherQuestions?: number
  minStudentQuestions?: number
}

export interface GeneratedInsight {
  ruleId: string
  tipo: 'descritivo' | 'prescritivo'
  titulo: string
  observacao: string
  significadoPotencial: string
  acaoSugerida: string | null
  fonte: string
  evidencia: 'verificada' | 'nao_verificada'
  seloEvidencia: string
  limiarOrigem: string
  n: number
  incertezaNota: string
  timestampsOrigem?: Array<{ startMs: number; endMs: number; label: string }>
}

/**
 * Valida se os dados da sessão atingem os requisitos mínimos amostrais da regra.
 */
export function meetsSampleMinimum(report: SessionPedagogicalReport, min: MinimoAmostral): boolean {
  if (min.minTurns !== undefined && report.speakingRatio.n < min.minTurns) {
    return false
  }
  if (min.minDurationMs !== undefined && report.sessionDurationMs < min.minDurationMs) {
    return false
  }
  if (min.minTeacherQuestions !== undefined && report.teacherQuestions.value.totalObserved < min.minTeacherQuestions) {
    return false
  }
  if (min.minStudentQuestions !== undefined && report.studentQuestions.value.totalObserved < min.minStudentQuestions) {
    return false
  }
  return true
}

export interface InsightRuleThresholds {
  sttMinPctThreshold?: number // padrão: 30.0% (Swain - definicao_a_validar)
  openQuestionsRatioThreshold?: number // padrão: 0.20 (Long & Sato - definicao_a_validar)
  monologueDurationSecThreshold?: number // padrão: 120.0s (Sweller - definicao_a_validar)
  unansweredQuestionsThreshold?: number // padrão: 2 (Black & Wiliam - definicao_a_validar)
  waitTimeSecThreshold?: number // padrão: 3.0s (Rowe - definicao_a_validar)
}

export interface RuleScope {
  disciplinas?: string[]
  tiposSessao?: ('aula' | 'reuniao')[]
}

export interface RigorousInsightRule {
  id: string
  titulo: string
  fonteTeorica: string
  teoria: string
  evidencia: 'verificada' | 'nao_verificada'
  limiarOrigem: 'definicao_a_validar'
  limiarPadraoDescricao: string
  escopo: RuleScope
  tipo: 'descritivo'
  minimoAmostral: MinimoAmostral
  condicao: (report: SessionPedagogicalReport, thresholds?: InsightRuleThresholds) => boolean
  gerarInsight: (report: SessionPedagogicalReport, thresholds?: InsightRuleThresholds) => GeneratedInsight
}

/**
 * Termos proibidos em todo e qualquer texto de hipótese ou parecer pedagógico.
 */
export const PROHIBITED_WORDS = [
  'reflete',
  'prejudica',
  'garante',
  'ideal',
  'deveria',
  'correto',
  'inadequado',
  'insuficiente'
] as const

/**
 * Verifica se uma regra se aplica ao escopo da sessão (disciplina e tipo).
 */
export function isRuleInScope(
  rule: RigorousInsightRule,
  sessionInfo?: { discipline?: string; sessionType?: 'aula' | 'reuniao' }
): boolean {
  // Verifica tipo de sessão se especificado na regra
  if (rule.escopo.tiposSessao && rule.escopo.tiposSessao.length > 0) {
    const sType = sessionInfo?.sessionType ?? 'aula'
    if (!rule.escopo.tiposSessao.includes(sType)) {
      return false
    }
  }

  // Verifica disciplina se especificada na regra (ex: L2)
  if (rule.escopo.disciplinas && rule.escopo.disciplinas.length > 0) {
    const disc = (sessionInfo?.discipline || '').trim().toLowerCase()
    if (!disc) {
      // Sessão sem disciplina marcada gera escopo indefinido e não ativa regras específicas de disciplina
      return false
    }
    const match = rule.escopo.disciplinas.some(d => disc.includes(d.toLowerCase()))
    if (!match) {
      return false
    }
  }

  return true
}

/**
 * Catálogo Rigoroso de Regras Pedagógicas com Escopo e Limiares Descritivos.
 */
export const RIGOROUS_INSIGHT_RULES: RigorousInsightRule[] = [
  // 1. Swain (1985) - Output Hypothesis em Língua Adicional
  {
    id: 'swain_1985_output_hypothesis',
    titulo: 'Tempo de Fala Discente em Língua Adicional (Output Compreensível)',
    fonteTeorica:
      'Swain, M. (1985). Communicative competence: Some roles of comprehensible input and comprehensible output in its development. In S. Gass & C. Madden (Eds.), Input in Second Language Acquisition (pp. 235-253). Newbury House.',
    teoria:
      'Conceito da Hipótese do Output Compreensível: a produção ativa em língua-alvo permite ao estudante testar hipóteses estruturais e consolidar recursos comunicativos.',
    evidencia: 'verificada',
    limiarOrigem: 'definicao_a_validar',
    limiarPadraoDescricao: 'Fala discente (STT) < 30.0% do tempo total falado [DEFINIÇÃO A VALIDAR (dono)]',
    escopo: {
      disciplinas: ['Inglês', 'Espanhol', 'Língua Inglesa', 'L2', 'Ingles', 'Espanhol'],
      tiposSessao: ['aula']
    },
    tipo: 'descritivo',
    minimoAmostral: {
      minTurns: 10,
      minDurationMs: 600000 // 10 min
    },
    condicao: (report, thresholds) => {
      const limit = thresholds?.sttMinPctThreshold ?? 30.0
      return report.speakingRatio.value.studentPct < limit
    },
    gerarInsight: (report, thresholds) => {
      const val = report.speakingRatio.value
      const limit = thresholds?.sttMinPctThreshold ?? 30.0
      return {
        ruleId: 'swain_1985_output_hypothesis',
        tipo: 'descritivo',
        titulo: 'Distribuição de Fala em Língua Adicional (Output Oral)',
        observacao: `O tempo de fala de estudantes representou ${val.studentPct}% do tempo total falado na aula (limiar configurado: ${limit.toFixed(1)}%).`,
        significadoPotencial:
          'Em aulas de língua adicional, pode indicar oportunidade para observar se há momentos favoráveis à experimentação oral direta pelos aprendizes.',
        acaoSugerida:
          'Pode-se experimentar a inclusão de breves trocas de hipóteses em duplas antes do compartilhamento aberto com a turma inteira.',
        fonte:
          'Swain, M. (1985). Communicative competence: Some roles of comprehensible input and comprehensible output in its development.',
        evidencia: 'verificada',
        seloEvidencia: '[FONTE CIENTÍFICA VERIFICADA - OBRA EXISTENTE]',
        limiarOrigem: '[DEFINIÇÃO A VALIDAR (dono)]: Limiar não definido por Swain; configurável pelo docente.',
        n: report.speakingRatio.n,
        incertezaNota: 'Cálculo aritmético determinístico a partir dos timestamps de fala da transcrição.'
      }
    }
  },

  // 2. Rowe (1974) - Tempo de Espera Pós-Pergunta (Wait-Time I)
  {
    id: 'rowe_1974_wait_time',
    titulo: 'Tempo de Espera Pós-Pergunta Docente (Wait-Time I)',
    fonteTeorica:
      'Rowe, M. B. (1974). Wait-time and rewards as instructional variables: Part one—wait-time. Journal of Research in Science Teaching, 11(2), 81-94.',
    teoria:
      'Estudo empírico descritivo sobre duração de pausas após perguntas em aulas de ciências: observou correlação entre pausas mais estendidas e respostas mais ricas dos alunos.',
    evidencia: 'nao_verificada',
    limiarOrigem: 'definicao_a_validar',
    limiarPadraoDescricao: 'Média de espera < 3.0s ou menos de 50% de pausas ≥ 3.0s [DEFINIÇÃO A VALIDAR (dono)]',
    escopo: {
      tiposSessao: ['aula']
    },
    tipo: 'descritivo',
    minimoAmostral: {
      minTeacherQuestions: 3
    },
    condicao: (report, thresholds) => {
      const limit = thresholds?.waitTimeSecThreshold ?? 3.0
      const wt = report.waitTime.value
      if (wt.countMeasured === 0) return false
      // Dispara quando média está abaixo do limiar OU minoria de pausas atinge o limiar
      return wt.meanSec < limit || wt.pausesAboveThreshold < wt.countMeasured / 2
    },
    gerarInsight: (report, thresholds) => {
      const wt = report.waitTime.value
      const limit = thresholds?.waitTimeSecThreshold ?? 3.0
      return {
        ruleId: 'rowe_1974_wait_time',
        tipo: 'descritivo',
        titulo: 'Registro do Tempo de Espera Pós-Pergunta (Wait-Time I)',
        observacao: `A média de espera registrada pós-pergunta foi de ${wt.meanSec}s (mediana ${wt.medianSec}s). Das ${wt.countMeasured} perguntas com resposta, ${wt.pausesAboveThreshold} registraram pausa ≥ ${limit.toFixed(1)}s.`,
        significadoPotencial:
          'Vale observar a variação de pausas conforme o objetivo da pergunta: perguntas de raciocínio aberto podem se beneficiar de tempo adicional para elaboração.',
        acaoSugerida: null, // Sem prescrição (fonte não verificada)
        fonte:
          'Rowe, M. B. (1974). Wait-time and rewards as instructional variables: Part one—wait-time.',
        evidencia: 'nao_verificada',
        seloEvidencia: '[CITAÇÃO NÃO VERIFICADA]',
        limiarOrigem: 'Mary Budd Rowe (1974) [CITAÇÃO NÃO VERIFICADA]: Limiar temporal descritivo a validar.',
        n: wt.countMeasured,
        incertezaNota:
          'Diferença temporal direta entre fim da fala docente e início do turno do aluno. Selo: [NÃO VALIDADO EM ASR REAL].'
      }
    }
  },

  // 3. Long & Sato (1983) - Perguntas Abertas / Referenciais em Língua Adicional
  {
    id: 'long_sato_1983_question_types',
    titulo: 'Proporção de Perguntas de Resposta Aberta em Língua Adicional',
    fonteTeorica:
      'Long, M. H., & Sato, C. J. (1983). Classroom foreigner talk discourse: Forms and functions of teachers\' questions. In H. W. Seliger & M. H. Long (Eds.), Classroom-Oriented Research in Second Language Acquisition (pp. 268-285). Newbury House.',
    teoria:
      'Análise tipológica de perguntas em interação de sala de aula: contraste entre perguntas de exibição (resposta previamente conhecida) e perguntas referenciais (resposta aberta e autêntica).',
    evidencia: 'verificada',
    limiarOrigem: 'definicao_a_validar',
    limiarPadraoDescricao: 'Perguntas abertas < 20.0% das perguntas com formato identificado [DEFINIÇÃO A VALIDAR (dono)]',
    escopo: {
      disciplinas: ['Inglês', 'Espanhol', 'Língua Inglesa', 'L2', 'Ingles', 'Espanhol'],
      tiposSessao: ['aula']
    },
    tipo: 'descritivo',
    minimoAmostral: {
      minTeacherQuestions: 4
    },
    condicao: (report, thresholds) => {
      const limit = thresholds?.openQuestionsRatioThreshold ?? 0.20
      const q = report.teacherQuestions.value
      const totalContent = q.byFormat.aberta + q.byFormat.fechada
      if (totalContent === 0) return false
      return q.byFormat.aberta / totalContent < limit
    },
    gerarInsight: (report, thresholds) => {
      const q = report.teacherQuestions.value
      const totalContent = q.byFormat.aberta + q.byFormat.fechada
      const pct = totalContent > 0 ? Number(((q.byFormat.aberta / totalContent) * 100).toFixed(1)) : 0
      const limitPct = ((thresholds?.openQuestionsRatioThreshold ?? 0.20) * 100).toFixed(0)
      return {
        ruleId: 'long_sato_1983_question_types',
        tipo: 'descritivo',
        titulo: 'Estrutura das Perguntas Docentes em Língua Adicional [NÃO VALIDADO]',
        observacao: `Dentre as perguntas com formato morfologicamente estimado [NÃO VALIDADO], ${q.byFormat.aberta} (${pct}%) apresentaram formato aberto, contra ${q.byFormat.fechada} fechadas (limiar configurado: < ${limitPct}%).`,
        significadoPotencial:
          'Pode indicar oportunidade para introduzir perguntas com espaço para respostas pessoais abertas além da checagem factual imediata.',
        acaoSugerida:
          'Em leituras ou debates, pode-se avaliar a inserção de perguntas que convidem à expressão de posicionamentos dos estudantes.',
        fonte:
          'Long, M. H., & Sato, C. J. (1983). Classroom foreigner talk discourse: Forms and functions of teachers\' questions.',
        evidencia: 'verificada',
        seloEvidencia: '[FONTE CIENTÍFICA VERIFICADA - OBRA EXISTENTE]',
        limiarOrigem: '[DEFINIÇÃO A VALIDAR (dono)]: Limiar não fixado por Long & Sato; configurável pelo docente.',
        n: totalContent,
        incertezaNota:
          'Classificação morfológica preliminar de formato aberta/fechada. Selo: [NÃO VALIDADO].'
      }
    }
  },

  // 4. Black & Wiliam (1998) - Acolhimento e Retorno a Dúvidas Discentes
  {
    id: 'black_wiliam_1998_formative_assessment',
    titulo: 'Acompanhamento e Retorno a Dúvidas Levantadas por Alunos',
    fonteTeorica:
      'Black, P., & Wiliam, D. (1998). Assessment and classroom learning. Assessment in Education: Principles, Policy & Practice, 5(1), 7-74.',
    teoria:
      'Avaliação Formativa: o acompanhamento das manifestações de dúvida dos estudantes possibilita o ajuste pedagógico durante a mediação da aula.',
    evidencia: 'verificada',
    limiarOrigem: 'definicao_a_validar',
    limiarPadraoDescricao: 'Perguntas discentes sem retorno imediato detectado ≥ 2 [DEFINIÇÃO A VALIDAR (dono)]',
    escopo: {
      tiposSessao: ['aula']
    },
    tipo: 'descritivo',
    minimoAmostral: {
      minStudentQuestions: 2
    },
    condicao: (report, thresholds) => {
      const limit = thresholds?.unansweredQuestionsThreshold ?? 2
      return report.studentQuestions.value.unansweredQuestionsCount >= limit
    },
    gerarInsight: (report, thresholds) => {
      const sq = report.studentQuestions.value
      const limit = thresholds?.unansweredQuestionsThreshold ?? 2
      return {
        ruleId: 'black_wiliam_1998_formative_assessment',
        tipo: 'descritivo',
        titulo: 'Registro de Dúvidas Discentes sem Retorno Imediato Detectado',
        observacao: `Foram registradas ${sq.unansweredQuestionsCount} pergunta(s) discentes sem retorno verbal docente imediato identificado nos turnos subsequentes (limiar configurado: ≥ ${limit}).`,
        significadoPotencial:
          'Pode indicar momentos de simultaneidade de falas, atividades em grupo paralelas ou dúvidas que cabem ser revisitadas em encontros futuros.',
        acaoSugerida:
          'Vale conferir os marcos temporais das perguntas e, se conveniente, retomar os pontos como revisão inicial no próximo encontro.',
        fonte: 'Black, P., & Wiliam, D. (1998). Assessment and classroom learning.',
        evidencia: 'verificada',
        seloEvidencia: '[FONTE CIENTÍFICA VERIFICADA - OBRA EXISTENTE]',
        limiarOrigem: '[DEFINIÇÃO A VALIDAR (dono)]: Limiar não fixado por Black & Wiliam; configurável pelo docente.',
        n: sq.unansweredQuestionsCount,
        incertezaNota:
          'Identificado pela ausência de turno com papel professor nos dois turnos seguintes à fala do aluno.',
        timestampsOrigem: sq.unansweredTurnIndices.map(idx => ({
          startMs: 0,
          endMs: 0,
          label: `Turno #${idx + 1}`
        }))
      }
    }
  },

  // 5. Sweller (1988) - Duração de Monólogos Expositivos Contínuos
  {
    id: 'sweller_1988_cognitive_load',
    titulo: 'Duração de Trechos Expositivos Ininterruptos',
    fonteTeorica:
      'Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. Cognitive Science, 12(2), 257-285.',
    teoria:
      'Teoria da Carga Cognitiva: a capacidade de retenção em memória de trabalho beneficia-se da alternância entre exposição de conteúdo e checagem de assimilação.',
    evidencia: 'verificada',
    limiarOrigem: 'definicao_a_validar',
    limiarPadraoDescricao: 'Maior monólogo contínuo docente > 120.0s [DEFINIÇÃO A VALIDAR (dono)]',
    escopo: {
      tiposSessao: ['aula', 'reuniao']
    },
    tipo: 'descritivo',
    minimoAmostral: {
      minTurns: 5,
      minDurationMs: 300000 // 5 min
    },
    condicao: (report, thresholds) => {
      const limitSec = thresholds?.monologueDurationSecThreshold ?? 120.0
      return report.longestMonologue.value.durationSec > limitSec
    },
    gerarInsight: (report, thresholds) => {
      const mono = report.longestMonologue.value
      const limitSec = thresholds?.monologueDurationSecThreshold ?? 120.0
      return {
        ruleId: 'sweller_1988_cognitive_load',
        tipo: 'descritivo',
        titulo: 'Registro de Monólogo Docente Contínuo',
        observacao: `O maior trecho contínuo de fala docente durou ${mono.durationSec}s (${(mono.durationSec / 60).toFixed(1)} min), ocorrido no turno #${mono.turnIndex + 1} (limiar configurado: > ${limitSec}s).`,
        significadoPotencial:
          'Vale observar se em trechos explicativos prolongados é oportuno intercalar checagens breves para acompanhamento da turma.',
        acaoSugerida:
          'Pode-se testar a colocação de breves perguntas de checagem conceitual após blocos expositivos densos.',
        fonte: 'Sweller, J. (1988). Cognitive load during problem solving: Effects on learning.',
        evidencia: 'verificada',
        seloEvidencia: '[FONTE CIENTÍFICA VERIFICADA - OBRA EXISTENTE]',
        limiarOrigem: '[DEFINIÇÃO A VALIDAR (dono)]: Limiar não fixado por Sweller; configurável pelo docente.',
        n: mono.durationSec,
        incertezaNota: 'Duração exata do maior turno docente contínuo identificado na transcrição.',
        timestampsOrigem: [
          {
            startMs: mono.startMs,
            endMs: mono.endMs,
            label: `Turno #${mono.turnIndex + 1} (${mono.durationSec}s)`
          }
        ]
      }
    }
  }
]

export interface RigorousEvaluationOptions {
  discipline?: string
  sessionType?: 'aula' | 'reuniao'
  thresholds?: InsightRuleThresholds
}

export interface RuleEvaluationDetail {
  ruleId: string
  ruleTitle: string
  inScope: boolean
  sampleMinimumMet: boolean
  conditionMet: boolean
  disparou: boolean
  motivo: string
}

export interface RigorousEvaluationResult {
  insights: GeneratedInsight[]
  evaluationDetails: RuleEvaluationDetail[]
}

/**
 * Avalia todas as regras de forma rigorosa, considerando escopo, mínimo amostral e condição estrita.
 */
export function evaluateRigorousInsightRules(
  report: SessionPedagogicalReport,
  options?: RigorousEvaluationOptions
): RigorousEvaluationResult {
  const insights: GeneratedInsight[] = []
  const evaluationDetails: RuleEvaluationDetail[] = []

  const sessionInfo = {
    discipline: options?.discipline,
    sessionType: options?.sessionType ?? 'aula'
  }

  for (const rule of RIGOROUS_INSIGHT_RULES) {
    const inScope = isRuleInScope(rule, sessionInfo)
    if (!inScope) {
      evaluationDetails.push({
        ruleId: rule.id,
        ruleTitle: rule.titulo,
        inScope: false,
        sampleMinimumMet: false,
        conditionMet: false,
        disparou: false,
        motivo: `Fora do escopo da sessão (disciplina: "${sessionInfo.discipline || 'não informada'}", tipo: "${sessionInfo.sessionType}").`
      })
      continue
    }

    const sampleMinimumMet = meetsSampleMinimum(report, rule.minimoAmostral)
    if (!sampleMinimumMet) {
      evaluationDetails.push({
        ruleId: rule.id,
        ruleTitle: rule.titulo,
        inScope: true,
        sampleMinimumMet: false,
        conditionMet: false,
        disparou: false,
        motivo: 'Mínimo amostral não atingido nos dados da sessão.'
      })
      continue
    }

    const conditionMet = rule.condicao(report, options?.thresholds)
    if (!conditionMet) {
      evaluationDetails.push({
        ruleId: rule.id,
        ruleTitle: rule.titulo,
        inScope: true,
        sampleMinimumMet: true,
        conditionMet: false,
        disparou: false,
        motivo: 'Condição da regra não atendida (valor observado dentro dos parâmetros esperados).'
      })
      continue
    }

    // Regra disparou!
    const insight = rule.gerarInsight(report, options?.thresholds)
    insights.push(insight)
    evaluationDetails.push({
      ruleId: rule.id,
      ruleTitle: rule.titulo,
      inScope: true,
      sampleMinimumMet: true,
      conditionMet: true,
      disparou: true,
      motivo: `Condição atendida: ${insight.observacao}`
    })
  }

  return { insights, evaluationDetails }
}

/**
 * Valida que o relatório pedagógico e insights calculam incerteza de perguntas
 * a partir do recall de Wilson (C7).
 */
export function formatQuestionCountWithUncertainty(
  observedQuestions: number,
  wilsonRecall: { point: number; lower: number; upper: number } = { point: 0.778, lower: 0.548, upper: 0.910 }
): {
  textoApresentacao: string
  limiteInferiorObservado: number
  estimativaIntervalo: { min: number; max: number }
  formula: string
  premissa: string
} {
  const minEst = Math.max(observedQuestions, Math.round(observedQuestions / wilsonRecall.upper))
  const maxEst = Math.round(observedQuestions / wilsonRecall.lower)

  return {
    textoApresentacao: `≥ ${observedQuestions} observadas (estimativa provável: ${minEst} a ${maxEst})`,
    limiteInferiorObservado: observedQuestions,
    estimativaIntervalo: { min: minEst, max: maxEst },
    formula: 'Estimativa = [Perguntas Observadas / Recall_max, Perguntas Observadas / Recall_min]',
    premissa: `Recall medido no Holdout 4: ${(wilsonRecall.point * 100).toFixed(1)}% [IC 95% Wilson: ${(wilsonRecall.lower * 100).toFixed(1)}% - ${(wilsonRecall.upper * 100).toFixed(1)}%]. Selo: [NÃO VALIDADO EM ASR REAL].`
  }
}
