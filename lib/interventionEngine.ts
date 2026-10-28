/**
 * lib/interventionEngine.ts — Intervenções Automáticas (Gap 8 · Onda 2)
 *
 * Agrupa alunos por bandas de desempenho e gera sugestões de intervenção
 * pedagógica específicas para cada grupo.
 *
 * Integração:
 *  - Lê métricas de "teacher_student_metrics" (localStorage)
 *  - Usa catEngine.getCatState() para theta de habilidade
 *  - Gera InterventionPlan[] consumível pelos componentes Students.tsx e Dashboard.tsx
 */

import { getCatState } from './catEngine'

/* ─── Types ────────────────────────────────────────────────────────────────── */
export type PerfBand = 'critical' | 'developing' | 'proficient' | 'advanced'

export interface StudentBandInfo {
  studentId:   string
  name:        string
  band:        PerfBand
  score:       number      // 0–10, pedagógico composto
  theta:       number      // estimativa IRT
  weakMetrics: string[]    // métricas abaixo da média da turma
}

export interface InterventionSuggestion {
  type:        'small_group' | 'one_on_one' | 'enrichment' | 'peer_tutoring' | 'reassessment'
  title:       string
  description: string
  urgency:     'high' | 'medium' | 'low'
  targets:     string[]    // studentIds
  metrics:     string[]    // métricas-alvo
  activities:  string[]    // sugestões de atividade
}

export interface InterventionPlan {
  generatedAt: string
  classId?:    string
  bands: {
    critical:   StudentBandInfo[]
    developing: StudentBandInfo[]
    proficient: StudentBandInfo[]
    advanced:   StudentBandInfo[]
  }
  suggestions: InterventionSuggestion[]
  classAvgScore: number
  classTheta:    number
}

/* ─── Band thresholds ────────────────────────────────────────────────────────── */
//  score 0–10 (pedagógico composto, ex: de computeScore() em Students.tsx)
const BAND_THRESHOLDS: Record<PerfBand, [number, number]> = {
  critical:   [0,    5.0],
  developing: [5.0,  6.5],
  proficient: [6.5,  8.0],
  advanced:   [8.0, 10.0],
}

function classifyBand(score: number): PerfBand {
  if (score < BAND_THRESHOLDS.developing[0]) return 'critical'
  if (score < BAND_THRESHOLDS.proficient[0]) return 'developing'
  if (score < BAND_THRESHOLDS.advanced[0])   return 'proficient'
  return 'advanced'
}

/* ─── Métricas localizadas ───────────────────────────────────────────────────── */
const METRIC_LABELS: Record<string, string> = {
  academic:    'Desempenho Acadêmico',
  progression: 'Progressão',
  regularity:  'Regularidade',
  engagement:  'Engajamento',
  oral:        'Compreensão Oral',
  writing:     'Produção Escrita',
  vocabulary:  'Vocabulário',
  grammar:     'Gramática',
  autonomy:    'Autonomia',
  behavior:    'Comportamento',
}

/* ─── Geração de sugestões ───────────────────────────────────────────────────── */
function buildSuggestions(
  bands: InterventionPlan['bands'],
  classAvg: number
): InterventionSuggestion[] {
  const suggestions: InterventionSuggestion[] = []

  // Critical → one-on-one + reassessment
  if (bands.critical.length > 0) {
    const metrics = Array.from(new Set(bands.critical.flatMap(s => s.weakMetrics))).slice(0, 3)
    suggestions.push({
      type: 'one_on_one',
      title: 'Atendimento Individual — Alunos em Situação Crítica',
      description: `${bands.critical.length} aluno(s) com desempenho abaixo de 5.0. Recomenda-se atendimento individualizado prioritário antes da próxima avaliação.`,
      urgency: 'high',
      targets:  bands.critical.map(s => s.studentId),
      metrics,
      activities: [
        'Diagnóstico de lacunas por competência (oral e escrito)',
        'Retomada de conteúdos com suporte visual e scaffolding',
        'Avaliação formativa semanal com feedback imediato',
        'Comunicação com responsáveis sobre progresso',
      ],
    })
    suggestions.push({
      type: 'reassessment',
      title: 'Reavaliação Adaptada — Alunos Críticos',
      description: 'Aplicar avaliação de reposição com dificuldade calibrada ao nível atual do aluno para verificar recuperação real.',
      urgency: 'high',
      targets:  bands.critical.map(s => s.studentId),
      metrics,
      activities: [
        'Questões de nível A1/A2 para diagnóstico de base',
        'Avaliação oral complementar à escrita',
        'Rota de recuperação progressiva em 4 semanas',
      ],
    })
  }

  // Developing → small group
  if (bands.developing.length > 0) {
    const metrics = Array.from(new Set(bands.developing.flatMap(s => s.weakMetrics))).slice(0, 3)
    suggestions.push({
      type: 'small_group',
      title: 'Reforço em Pequenos Grupos — Em Desenvolvimento',
      description: `${bands.developing.length} aluno(s) entre 5.0 e 6.5. Agrupamento estratégico com foco nas métricas mais frágeis.`,
      urgency: 'medium',
      targets:  bands.developing.map(s => s.studentId),
      metrics,
      activities: [
        'Atividades colaborativas com papéis definidos',
        'Exercícios de repetição espaçada (vocabulário/gramática)',
        'Role-play e produção oral em duplas',
        'Correção entre pares com rubrica simplificada',
      ],
    })
  }

  // Advanced → enrichment
  if (bands.advanced.length > 0) {
    suggestions.push({
      type: 'enrichment',
      title: 'Enriquecimento — Alunos Avançados',
      description: `${bands.advanced.length} aluno(s) acima de 8.0. Oferecer desafios além do currículo regular para manter engajamento.`,
      urgency: 'low',
      targets:  bands.advanced.map(s => s.studentId),
      metrics:  ['autonomy', 'writing', 'oral'],
      activities: [
        'Leitura extensiva autônoma (extensive reading)',
        'Produção de podcasts ou vlogs em inglês',
        'Participação em concursos de redação',
        'Tutoria de pares (peer tutoring) com alunos em desenvolvimento',
      ],
    })
  }

  // Cross-band: peer tutoring (advanced + developing)
  if (bands.advanced.length > 0 && bands.developing.length > 0) {
    suggestions.push({
      type: 'peer_tutoring',
      title: 'Tutoria entre Pares',
      description: 'Parear alunos avançados com alunos em desenvolvimento para reforço mútuo e desenvolvimento de autonomia.',
      urgency: 'low',
      targets:  [...bands.advanced.map(s => s.studentId), ...bands.developing.map(s => s.studentId)],
      metrics:  ['engagement', 'autonomy'],
      activities: [
        'Sessões de 20 min de tutoria estruturada por semana',
        'Protocolo de tutoria com checklist de competências',
        'Reflexão semanal do tutor em diário de aprendizagem',
      ],
    })
  }

  return suggestions
}

/* ─── API Principal ──────────────────────────────────────────────────────────── */

/**
 * Agrupa alunos por banda e gera plano de intervenção.
 *
 * @param students      - array de alunos com id, name, scores (Record<string, number>)
 * @param classId       - id da turma (opcional, para filtro)
 * @returns InterventionPlan com bandas, sugestões e médias
 */
export function generateInterventionPlan(
  students: Array<{ id: string; name: string; scores: Record<string, number>; compositeScore: number }>,
  classId?: string
): InterventionPlan {
  if (!students.length) {
    return {
      generatedAt: new Date().toISOString(), classId,
      bands: { critical: [], developing: [], proficient: [], advanced: [] },
      suggestions: [], classAvgScore: 0, classTheta: 0,
    }
  }

  // Médias por métrica para identificar pontos fracos relativos
  const metricKeys  = Object.keys(students[0].scores)
  const metricAvgs: Record<string, number> = {}
  metricKeys.forEach(k => {
    const vals = students.map(s => s.scores[k] || 0)
    metricAvgs[k] = vals.reduce((a, b) => a + b, 0) / vals.length
  })

  const classAvgScore = students.reduce((a, s) => a + s.compositeScore, 0) / students.length

  const bandInfos: StudentBandInfo[] = students.map(s => {
    const cat  = getCatState(s.id)
    const band = classifyBand(s.compositeScore)
    // métricas abaixo da média da turma (e abaixo de 6.5 absolutamente)
    const weakMetrics = metricKeys.filter(k => {
      const v = s.scores[k] || 0
      return v < metricAvgs[k] - 0.5 && v < 6.5
    })
    return {
      studentId:   s.id,
      name:        s.name,
      band,
      score:       s.compositeScore,
      theta:       cat.theta,
      weakMetrics: weakMetrics.map(k => METRIC_LABELS[k] || k),
    }
  })

  const bands: InterventionPlan['bands'] = {
    critical:   bandInfos.filter(s => s.band === 'critical'),
    developing: bandInfos.filter(s => s.band === 'developing'),
    proficient: bandInfos.filter(s => s.band === 'proficient'),
    advanced:   bandInfos.filter(s => s.band === 'advanced'),
  }

  const classTheta = bandInfos.reduce((a, s) => a + s.theta, 0) / bandInfos.length

  return {
    generatedAt: new Date().toISOString(),
    classId,
    bands,
    suggestions: buildSuggestions(bands, classAvgScore),
    classAvgScore,
    classTheta,
  }
}

/**
 * Resumo textual do plano para uso em prompts LLM ou comunicação com pais.
 */
export function summarizePlan(plan: InterventionPlan): string {
  const { bands, classAvgScore, suggestions } = plan
  const total = Object.values(bands).flatMap(b => b).length
  const lines = [
    `Turma: ${total} alunos | Score médio: ${classAvgScore.toFixed(1)}/10`,
    `• ${bands.critical.length} críticos (<5.0)`,
    `• ${bands.developing.length} em desenvolvimento (5.0–6.5)`,
    `• ${bands.proficient.length} proficientes (6.5–8.0)`,
    `• ${bands.advanced.length} avançados (>8.0)`,
    '',
    `${suggestions.length} intervenção(ões) sugerida(s):`,
    ...suggestions.map(s => `  [${s.urgency.toUpperCase()}] ${s.title}`),
  ]
  return lines.join('\n')
}
