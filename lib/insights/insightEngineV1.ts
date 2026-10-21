/**
 * lib/insights/insightEngineV1.ts — Contrato Interno InsightV1 e Motor com Gate Amostral
 * 
 * Regras Inegociáveis de Arquitetura:
 * 1. Reside em lib/insights/ (NÃO modifica lib/contracts).
 * 2. Confiança ordinal derivada de N: 'baixa' | 'media' | 'alta' (sem score numérico ou intervalo).
 * 3. Fatos e hipóteses estritamente separados; hipóteses nunca em tom afirmativo.
 * 4. Gates amostrais mínimos (N_MIN) obrigatórios por regra. Abaixo do teto, sem rótulo de construto (ZDP etc.).
 * 5. Dado ausente != zero (ausência de avaliação não pontua como nota zero).
 */

import { isEltSubject } from '../disciplineGate'

export type ConfidenceLevel = 'baixa' | 'media' | 'alta'

export interface SignalMeasurement {
  name: string
  value: number
  n: number
  window: string
}

export interface InsightV1 {
  id: string
  signals: SignalMeasurement[]
  rule_id: string
  confidence: ConfidenceLevel
  approach_id: string | null
  applies_to: {
    disciplinas: string[]
    etapas: string[]
  }
  suggested_action: string
  caveats: string[]
  facts: string[]
  hypotheses: string[]
}

/**
 * Limiares amostrais mínimos como constantes de política a validar com especialista pedagógico.
 */
export const N_MIN_STUDENT_TRAJECTORY = 3 // VALOR DE POLÍTICA, A VALIDAR (pedagogo)
export const N_MIN_CLASS_AGGREGATE = 5 // VALOR DE POLÍTICA, A VALIDAR (pedagogo)
export const N_MIN_ITEM_DISCRIMINATION_ZDP = 8 // VALOR DE POLÍTICA, A VALIDAR (pedagogo)
export const N_ITEM_CONFIDENCE_ALTA = 15 // VALOR DE POLÍTICA, A VALIDAR (pedagogo)

export interface StudentAssessmentHistory {
  studentName: string
  grades?: Array<number | null | undefined>
  attendanceRate?: number
  hasPei?: boolean
}

export interface ExamQuestionResult {
  qId: string
  correct: boolean
}

export interface ExamResultItem {
  studentName: string
  totalScore: number
  maxScore?: number
  questionResults?: ExamQuestionResult[]
}

export interface GenerateInsightsInput {
  subject?: string
  classAverage?: number
  classSize?: number
  studentAssessments?: StudentAssessmentHistory[]
  examResults?: ExamResultItem[]
}

/**
 * Validador estrito de contrato do InsightV1.
 * Qualquer insight incompleto deve ser categoricamente descartado da interface.
 */
export function validateInsightContract(insight: Partial<InsightV1>): insight is InsightV1 {
  if (!insight) return false
  if (typeof insight.id !== 'string' || !insight.id) return false
  if (!Array.isArray(insight.signals) || insight.signals.length === 0) return false
  for (const s of insight.signals) {
    if (typeof s.name !== 'string' || typeof s.value !== 'number' || typeof s.n !== 'number' || !s.window) {
      return false
    }
  }
  if (typeof insight.rule_id !== 'string' || !insight.rule_id) return false
  if (!['baixa', 'media', 'alta'].includes(insight.confidence as string)) return false
  if (insight.approach_id !== null && typeof insight.approach_id !== 'string') return false
  if (!insight.applies_to || !Array.isArray(insight.applies_to.disciplinas) || !Array.isArray(insight.applies_to.etapas)) {
    return false
  }
  if (typeof insight.suggested_action !== 'string' || !insight.suggested_action) return false
  if (!Array.isArray(insight.caveats)) return false
  if (!Array.isArray(insight.facts) || insight.facts.length === 0) return false
  if (!Array.isArray(insight.hypotheses)) return false

  return true
}

/**
 * Motor central de geração de insights auditáveis e calibrados amostralmente.
 */
export function generateAssessmentInsightsV1(input: GenerateInsightsInput): InsightV1[] {
  const insights: InsightV1[] = []
  const subject = input.subject || 'Geral'
  const isElt = isEltSubject(subject)

  // ─── 1. ANÁLISE DE TRAJETÓRIA DO ALUNO (student_trajectory / student_downward_trend)
  if (input.studentAssessments && input.studentAssessments.length > 0) {
    input.studentAssessments.forEach((sa, idx) => {
      // Filtra estritamente dados presentes (dado ausente != zero)
      const validGrades = (sa.grades || []).filter(
        (g): g is number => g !== null && g !== undefined && !isNaN(g)
      )

      // Regra 1: Menos que N_MIN_STUDENT_TRAJECTORY (3) => Não gera insight de trajetória
      if (validGrades.length < N_MIN_STUDENT_TRAJECTORY) {
        return
      }

      // Regra 3: Queda consecutiva ao longo de 3 avaliações
      const g0 = validGrades[validGrades.length - 3]
      const g1 = validGrades[validGrades.length - 2]
      const g2 = validGrades[validGrades.length - 1]

      if (g0 > g1 && g1 > g2) {
        const dropMagnitude = Number((g0 - g2).toFixed(1))
        const insight: InsightV1 = {
          id: `ins_drop_${idx}_${Math.round(dropMagnitude * 10)}`,
          signals: [
            {
              name: 'student_trajectory',
              value: -dropMagnitude,
              n: validGrades.length,
              window: '3_ultimas_avaliacoes'
            }
          ],
          rule_id: 'student_downward_trend',
          confidence: validGrades.length >= 5 ? 'alta' : 'media',
          approach_id: isElt ? 'scaffolding_vygotsky' : null,
          applies_to: {
            disciplinas: isElt ? ['ingles'] : ['geral'],
            etapas: ['fundamental_2', 'ensino_medio']
          },
          suggested_action: 'Retomar pré-requisitos conceituais das etapas anteriores e aplicar andaimes didáticos com verificação formativa.',
          caveats: validGrades.length < 5 ? ['Amostra com 3 avaliações observadas'] : [],
          facts: [
            `Nota decresceu de ${g0.toFixed(1)} para ${g1.toFixed(1)} e ${g2.toFixed(1)} nas últimas 3 avaliações observadas (queda total de ${dropMagnitude} pontos).`
          ],
          hypotheses: [
            'O estudante pode estar enfrentando dificuldades com o encadeamento dos pré-requisitos conceituais mais recentes ou ritmo de consolidação.'
          ]
        }

        if (validateInsightContract(insight)) {
          insights.push(insight)
        }
      }

      // Regra 5: Frequência baixa (< 75%) com nota alta (> 8.0)
      if (
        sa.attendanceRate !== undefined &&
        sa.attendanceRate < 75 &&
        validGrades.length >= 2
      ) {
        const recentAvg = validGrades.reduce((a, b) => a + b, 0) / validGrades.length
        if (recentAvg >= 8.0) {
          const insight: InsightV1 = {
            id: `ins_freq_discrepancy_${idx}_${Math.round(sa.attendanceRate)}`,
            signals: [
              { name: 'attendance_rate', value: sa.attendanceRate, n: 1, window: 'bimestre' },
              { name: 'grade_average', value: Number(recentAvg.toFixed(1)), n: validGrades.length, window: 'acumulado' }
            ],
            rule_id: 'high_score_low_attendance',
            confidence: 'media',
            approach_id: null,
            applies_to: { disciplinas: ['geral'], etapas: ['fundamental_2', 'ensino_medio'] },
            suggested_action: 'Dialogar com a coordenação e estudante para mapear motivos das faltas sem interrupção do engajamento positivo.',
            caveats: ['Dados de presença baseados no registro bimestral atual'],
            facts: [
              `Frequência de ${sa.attendanceRate}% observada no período.`,
              `Média de avaliações em ${recentAvg.toFixed(1)}/10.`
            ],
            hypotheses: [
              'O estudante pode estar realizando estudos autônomos ou já dominava os conteúdos previamente; as ausências não parecem ter correlação causal imediata com defasagem de conteúdo.'
            ]
          }

          if (validateInsightContract(insight)) {
            insights.push(insight)
          }
        }
      }
    })
  }

  // ─── 2. ANÁLISE COLETIVA DA TURMA (collective_class_gap)
  if (
    input.classAverage !== undefined &&
    input.classAverage < 6.0 &&
    (input.classSize || 0) >= N_MIN_CLASS_AGGREGATE
  ) {
    const insight: InsightV1 = {
      id: `ins_class_gap_${Math.round((input.classAverage || 0) * 10)}_${input.classSize || 0}`,
      signals: [
        {
          name: 'class_average',
          value: input.classAverage,
          n: input.classSize || 0,
          window: 'avaliacao_recente'
        }
      ],
      rule_id: 'collective_class_gap',
      confidence: (input.classSize || 0) >= 15 ? 'alta' : 'media',
      approach_id: isElt ? 'guided_discovery_scrivener' : null,
      applies_to: { disciplinas: isElt ? ['ingles'] : ['geral'], etapas: ['fundamental_2'] },
      suggested_action: 'Revisão coletiva de tópicos com andaimes estruturados antes de avançar para a próxima unidade.',
      caveats: (input.classSize || 0) < 10 ? ['Amostra com menos de 10 alunos'] : [],
      facts: [
        `Média coletiva da turma em ${input.classAverage.toFixed(1)}/10 com ${input.classSize} alunos avaliados.`
      ],
      hypotheses: [
        'A lacuna observada pode refletir complexidade do instrumento ou necessidade de maior consolidação coletiva em sala de aula.'
      ]
    }

    if (validateInsightContract(insight)) {
      insights.push(insight)
    }
  }

  // ─── 3. ANÁLISE DE ITENS E DISCRIMINAÇÃO / ZDP
  if (input.examResults && input.examResults.length > 0) {
    const n = input.examResults.length

    // Gate amostral estrito: se n < 8, NÃO calcula discriminação clássica nem rotula como ZDP
    if (n < N_MIN_ITEM_DISCRIMINATION_ZDP) {
      // Emite apenas sinal de baixa confiança com ressalva obrigatória
      const insight: InsightV1 = {
        id: `ins_small_sample_${n}`,
        signals: [{ name: 'sample_size', value: n, n, window: 'prova_atual' }],
        rule_id: 'small_sample_notice',
        confidence: 'baixa',
        approach_id: null,
        applies_to: { disciplinas: ['geral'], etapas: ['geral'] },
        suggested_action: 'Aguardar aplicação em lote maior antes de inferir índices psicométricos dos itens.',
        caveats: ['amostra pequena insuficiente para cálculo psicométrico de discriminação'],
        facts: [`Avaliação aplicada com apenas ${n} alunos.`],
        hypotheses: ['Indicadores individuais não possuem significância estatística agregada.']
      }
      if (validateInsightContract(insight)) {
        insights.push(insight)
      }
    }
  }

  return insights
}
