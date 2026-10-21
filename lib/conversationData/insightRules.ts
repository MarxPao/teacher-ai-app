/**
 * lib/conversationData/insightRules.ts
 *
 * Banco de regras teórico-pedagógicas formais para geração de insights reflexivos.
 * Estrutura declarativa e modular separada do motor de execução.
 *
 * Diretrizes invioláveis:
 * 1. Cada regra carrega evidencia: 'verificada' | 'nao_verificada' e fonte completa.
 * 2. Citações não verificáveis recebem o selo [CITAÇÃO NÃO VERIFICADA] e permanecem descritivas.
 * 3. Limiares sem fonte verificada são marcados [DEFINIÇÃO A VALIDAR (dono)].
 * 4. Linguagem estritamente hipotética e reflexiva ("pode indicar", "vale observar").
 */

import type { SessionPedagogicalReport } from './pedagogicalMetrics'
import {
  RIGOROUS_INSIGHT_RULES,
  evaluateRigorousInsightRules,
  PROHIBITED_WORDS,
  formatQuestionCountWithUncertainty,
  type RigorousInsightRule,
  type RuleScope
} from './rigorousInsightRules'

export interface InsightRuleThresholds {
  teacherSpeechPctThreshold?: number // padrão 80.0%
  sttMinPctThreshold?: number // padrão 30.0%
  waitTimeSecThreshold?: number // padrão 3.0s
  openQuestionsRatioThreshold?: number // padrão 0.20 (20%)
  unansweredQuestionsThreshold?: number // padrão 2
  monologueDurationSecThreshold?: number // padrão 120s
}

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

export interface InsightRule {
  id: string
  titulo: string
  teoria: string
  fonte: string
  evidencia: 'verificada' | 'nao_verificada'
  limiarOrigem: string
  tipo: 'descritivo' | 'prescritivo'
  minimoAmostral: MinimoAmostral
  condicao: (report: SessionPedagogicalReport, thresholds?: InsightRuleThresholds) => boolean
  gerarInsight: (report: SessionPedagogicalReport, thresholds?: InsightRuleThresholds) => GeneratedInsight
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

/**
 * Catálogo Canônico de Regras Pedagógicas Formais.
 */
export const INSIGHT_RULES: InsightRule[] = [
  // REGRA 1: Proporção de fala e oportunidade de output discente em L2
  {
    id: 'rule_teacher_speaking_ratio',
    titulo: 'Proporção de Fala Docente e Espaço para Produção Oral Discente',
    teoria:
      'Hipótese do Output Compreensível (Swain, 1985): a aquisição de competência comunicativa em L2 requer que aprendizes tenham oportunidade ativa de produzir enunciados próprios, negociar significado e testar hipóteses gramaticais.',
    fonte:
      'Swain, M. (1985). Communicative competence: Some roles of comprehensible input and comprehensible output in its development. In S. Gass & C. Madden (Eds.), Input in Second Language Acquisition (pp. 235-253). Newbury House.',
    evidencia: 'verificada',
    limiarOrigem:
      '[DEFINIÇÃO A VALIDAR (dono)]: limiar configurável de fala docente > 80.0% do tempo total falado.',
    tipo: 'prescritivo',
    minimoAmostral: {
      minTurns: 10,
      minDurationMs: 600000 // 10 minutos
    },
    condicao: (report, thresholds) => {
      const limit = thresholds?.teacherSpeechPctThreshold ?? 80.0
      return report.speakingRatio.value.teacherPct > limit
    },
    gerarInsight: (report, thresholds) => {
      const val = report.speakingRatio.value
      return {
        ruleId: 'rule_teacher_speaking_ratio',
        tipo: 'prescritivo',
        titulo: 'Espaço para Prática Oral Discente (Output em L2)',
        observacao: `O tempo de fala docente representou ${val.teacherPct}% do tempo total falado na aula, contra ${val.studentPct}% de falas de estudantes.`,
        significadoPotencial:
          'Em aulas de língua adicional (CLT / 9º ano BNCC), um tempo de exposição docente preponderante pode indicar momentos explicativos densos, mas também pode restringir oportunidades individuais de produção em voz alta pelos alunos.',
        acaoSugerida:
          'Para ampliar o output dos alunos sem perder o fio condutor, experimente introduzir um breve "think-pair-share" (2 a 3 minutos em duplas em inglês) antes de recolher respostas em plenária.',
        fonte:
          'Swain, M. (1985). Communicative competence: Some roles of comprehensible input and comprehensible output in its development.',
        evidencia: 'verificada',
        seloEvidencia: '[FONTE CIENTÍFICA VERIFICADA]',
        limiarOrigem: '[DEFINIÇÃO A VALIDAR (dono)]',
        n: report.speakingRatio.n,
        incertezaNota: 'Cálculo aritmético determinístico a partir dos timestamps de fala da transcrição.'
      }
    }
  },

  // REGRA 2: Tempo de espera reflexivo pós-pergunta (Wait-Time I)
  {
    id: 'rule_wait_time_reflection',
    titulo: 'Tempo de Espera Pós-Pergunta Docente (Wait-Time I)',
    teoria:
      'Investigação sobre tempo de pausa docente pós-pergunta (Rowe, 1974): a elevação do tempo de silêncio para patamares superiores a 3 segundos correlacionou-se a respostas mais articuladas e aumento de iniciativas de questionamento pelos alunos.',
    fonte:
      'Rowe, M. B. (1974). Wait-time and rewards as instructional variables, their influence on language, logic, and fate control: Part one—wait-time. Journal of Research in Science Teaching, 11(2), 81-94.',
    evidencia: 'nao_verificada',
    limiarOrigem:
      'Mary Budd Rowe (1974) [CITAÇÃO NÃO VERIFICADA]: média de espera < 3.0 segundos ou menos de 50% de pausas ≥ 3.0s.',
    tipo: 'descritivo',
    minimoAmostral: {
      minTeacherQuestions: 3
    },
    condicao: (report, thresholds) => {
      const limit = thresholds?.waitTimeSecThreshold ?? 3.0
      const wt = report.waitTime.value
      if (wt.countMeasured === 0) return false
      return wt.meanSec < limit || wt.pausesAboveThreshold < wt.countMeasured / 2
    },
    gerarInsight: (report, thresholds) => {
      const wt = report.waitTime.value
      return {
        ruleId: 'rule_wait_time_reflection',
        tipo: 'descritivo',
        titulo: 'Observação do Ritmo de Espera pós-Pergunta (Wait-Time I)',
        observacao: `A média de espera registrada após perguntas do professor foi de ${wt.meanSec}s (mediana ${wt.medianSec}s). Das ${wt.countMeasured} perguntas com resposta, ${wt.pausesAboveThreshold} tiveram pausa deliberada ≥ 3.0s.`,
        significadoPotencial:
          'Pausas mais breves são usuais em checagens rápidas de rotina, mas podem demandar atenção quando a intenção pedagógica for permitir que o estudante estruture sentenças complexas em L2 antes de responder.',
        acaoSugerida: null, // Evidência não verificada => sem prescrição, apenas reflexão descritiva
        fonte:
          'Rowe, M. B. (1974). Wait-time and rewards as instructional variables, their influence on language, logic, and fate control.',
        evidencia: 'nao_verificada',
        seloEvidencia: '[CITAÇÃO NÃO VERIFICADA]',
        limiarOrigem: 'Mary Budd Rowe (1974) [CITAÇÃO NÃO VERIFICADA]',
        n: wt.countMeasured,
        incertezaNota:
          'Diferença temporal direta entre o término da fala docente e início do turno seguinte. Selo: [NÃO VALIDADO EM ASR REAL].'
      }
    }
  },

  // REGRA 3: Perguntas Abertas / Referenciais vs Fechadas
  {
    id: 'rule_open_referential_questions',
    titulo: 'Equilíbrio entre Perguntas de Conteúdo Abertas e Fechadas',
    teoria:
      'Pesquisa em sala de aula de L2 (Long & Sato, 1983): o predomínio absoluto de perguntas fechadas ("display questions") tende a restringir a negociação de significado, enquanto perguntas abertas/referenciais aproximam a comunicação do uso natural da linguagem.',
    fonte:
      'Long, M. H., & Sato, C. J. (1983). Classroom foreigner talk discourse: Forms and functions of teachers\' questions. In H. W. Seliger & M. H. Long (Eds.), Classroom-Oriented Research in Second Language Acquisition (pp. 268-285). Newbury House.',
    evidencia: 'verificada',
    limiarOrigem:
      '[DEFINIÇÃO A VALIDAR (dono)]: proporção de perguntas abertas < 25.0% das perguntas de conteúdo.',
    tipo: 'prescritivo',
    minimoAmostral: {
      minTeacherQuestions: 4
    },
    condicao: (report, thresholds) => {
      const limit = thresholds?.openQuestionsRatioThreshold ?? 0.25
      const q = report.teacherQuestions.value
      const totalContentQ = q.byFormat.aberta + q.byFormat.fechada
      if (totalContentQ === 0) return false
      return q.byFormat.aberta / totalContentQ < limit
    },
    gerarInsight: (report, thresholds) => {
      const q = report.teacherQuestions.value
      const totalContent = q.byFormat.aberta + q.byFormat.fechada
      const pct = totalContent > 0 ? Number(((q.byFormat.aberta / totalContent) * 100).toFixed(1)) : 0
      return {
        ruleId: 'rule_open_referential_questions',
        tipo: 'prescritivo',
        titulo: 'Frequência de Perguntas Abertas / Referenciais',
        observacao: `Dentre as perguntas de conteúdo identificadas, ${q.byFormat.aberta} (${pct}%) apresentaram formato aberto (ex: marcadores causais/processuais como "como" ou "por que"), enquanto ${q.byFormat.fechada} foram fechadas.`,
        significadoPotencial:
          'Perguntas fechadas são essenciais para checagem rápida de vocabulário e fatos, mas uma proporção maior de perguntas referenciais estimula argumentos estendidos em língua inglesa.',
        acaoSugerida:
          'Em trechos de leitura ou interpretação, experimente incluir 1 ou 2 perguntas de opinião pessoal (ex: "How would you handle this situation in your daily life?") que não tenham resposta única predefinida.',
        fonte:
          'Long, M. H., & Sato, C. J. (1983). Classroom foreigner talk discourse: Forms and functions of teachers\' questions.',
        evidencia: 'verificada',
        seloEvidencia: '[FONTE CIENTÍFICA VERIFICADA]',
        limiarOrigem: '[DEFINIÇÃO A VALIDAR (dono)]',
        n: totalContent,
        incertezaNota:
          'Classificação morfológica heurística sobre perguntas de conteúdo. Selo: [NÃO VALIDADO EM ASR REAL].'
      }
    }
  },

  // REGRA 4: Acolhimento e Retorno a Dúvidas Discentes
  {
    id: 'rule_unanswered_student_questions',
    titulo: 'Retorno e Acolhimento a Dúvidas Levantadas por Alunos',
    teoria:
      'Avaliação Formativa e Regulação Pedagógica (Black & Wiliam, 1998): a resposta às dúvidas dos alunos em sala constitui o mecanismo primário de diagnóstico e ajuste instrucional imediato.',
    fonte:
      'Black, P., & Wiliam, D. (1998). Assessment and classroom learning. Assessment in Education: Principles, Policy & Practice, 5(1), 7-74.',
    evidencia: 'verificada',
    limiarOrigem:
      'Black & Wiliam (1998): presença de pelo menos 1 pergunta discente sem resposta docente nos próximos 2 turnos.',
    tipo: 'prescritivo',
    minimoAmostral: {
      minStudentQuestions: 1
    },
    condicao: (report) => {
      return report.studentQuestions.value.unansweredQuestionsCount > 0
    },
    gerarInsight: (report) => {
      const sq = report.studentQuestions.value
      return {
        ruleId: 'rule_unanswered_student_questions',
        tipo: 'prescritivo',
        titulo: 'Acolhimento de Dúvidas Levantadas por Alunos',
        observacao: `Foram identificadas ${sq.unansweredQuestionsCount} dúvida(s) de alunos que não tiveram retorno docente imediato detectado nos turnos subsequentes da transcrição.`,
        significadoPotencial:
          'Pode decorrer de dinâmicas paralelas de sala, sobreposição de falas ou transição rápida para outra atividade, valendo conferir se o ponto pedagógico foi esclarecido.',
        acaoSugerida:
          'Verifique os momentos indicados nos marcadores de tempo e, se apropriado, retome o tópico como abertura rápida (*warm-up*) na aula seguinte.',
        fonte: 'Black, P., & Wiliam, D. (1998). Assessment and classroom learning.',
        evidencia: 'verificada',
        seloEvidencia: '[FONTE CIENTÍFICA VERIFICADA]',
        limiarOrigem: 'Black & Wiliam (1998)',
        n: sq.unansweredQuestionsCount,
        incertezaNota:
          'Identificado pela ausência de turno com role professor nos dois turnos seguintes à pergunta discente.',
        timestampsOrigem: sq.unansweredTurnIndices.map(idx => ({
          startMs: 0,
          endMs: 0,
          label: `Turno #${idx + 1}`
        }))
      }
    }
  },

  // REGRA 5: Monólogos Expositivos Contínuos Prolongados
  {
    id: 'rule_extended_monologue',
    titulo: 'Extensão de Monólogos Expositivos Contínuos',
    teoria:
      'Teoria da Carga Cognitiva (Sweller, 1988) e Aprendizagem Significativa (Ausubel, 1968): falas expositivas ininterruptas de longa duração em L2 tendem a saturar a memória de trabalho do aprendiz.',
    fonte:
      'Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. Cognitive Science, 12(2), 257-285.',
    evidencia: 'verificada',
    limiarOrigem:
      '[DEFINIÇÃO A VALIDAR (dono)]: turno expositivo docente ininterrupto > 120 segundos (2 minutos).',
    tipo: 'prescritivo',
    minimoAmostral: {
      minTurns: 5,
      minDurationMs: 300000 // 5 minutos
    },
    condicao: (report, thresholds) => {
      const limitSec = thresholds?.monologueDurationSecThreshold ?? 120.0
      return report.longestMonologue.value.durationSec > limitSec
    },
    gerarInsight: (report, thresholds) => {
      const mono = report.longestMonologue.value
      return {
        ruleId: 'rule_extended_monologue',
        tipo: 'prescritivo',
        titulo: 'Duração do Maior Monólogo Expositivo Docente',
        observacao: `O maior trecho ininterrupto de fala docente durou ${mono.durationSec}s (${(mono.durationSec / 60).toFixed(1)} min), ocorrido no turno #${mono.turnIndex + 1} (aproximadamente aos ${(mono.startMs / 60000).toFixed(1)} min da aula).`,
        significadoPotencial:
          'Blocos de instrução direta prolongados são necessários na introdução de tópicos complexos, mas podem diluir a atenção ativa se não forem pontuados por micro-interações.',
        acaoSugerida:
          'Após blocos explicativos de mais de 2 minutos, experimente intercalar uma "Concept Checking Question" (CCQ) rápida ou pedir que os alunos refrasem a regra com as próprias palavras.',
        fonte: 'Sweller, J. (1988). Cognitive load during problem solving: Effects on learning.',
        evidencia: 'verificada',
        seloEvidencia: '[FONTE CIENTÍFICA VERIFICADA]',
        limiarOrigem: '[DEFINIÇÃO A VALIDAR (dono)]',
        n: mono.durationSec,
        incertezaNota: 'Duração exata do maior turno docente identificado na transcrição.',
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

/**
 * Avalia todas as regras do catálogo contra um relatório de sessão.
 * Aplica escopo, mínimo amostral e devolutiva estritamente descritiva.
 */
export function evaluateInsightRules(
  report: SessionPedagogicalReport,
  thresholds?: InsightRuleThresholds,
  sessionInfo?: { discipline?: string; sessionType?: 'aula' | 'reuniao' }
): GeneratedInsight[] {
  const result = evaluateRigorousInsightRules(report, {
    thresholds,
    discipline: sessionInfo?.discipline,
    sessionType: sessionInfo?.sessionType
  })
  return result.insights
}

export {
  RIGOROUS_INSIGHT_RULES,
  evaluateRigorousInsightRules,
  PROHIBITED_WORDS,
  formatQuestionCountWithUncertainty
}
export type { RigorousInsightRule, RuleScope }
