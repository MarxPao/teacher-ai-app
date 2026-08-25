/**
 * Motor de Diagnóstico Pedagógico e Alertas Automáticos (#47, #48).
 * Analisa notas, erros frequentes e histórico para alertar o professor.
 */

export interface PedagogicalAlert {
  id: string
  type: 'warning' | 'info' | 'success' | 'danger'
  title: string
  description: string
  recommendation: string
  actionLabel?: string
  targetModule?: string
  studentId?: string
  studentName?: string
  className?: string
  date: string
}

export interface ErrorPattern {
  topic: string
  errorRate: number
  affectedStudentsCount: number
  totalStudentsCount: number
  exampleError?: string
  suggestedAction: string
}

/**
 * Analisa uma lista de notas e retornos para gerar alertas contextuais.
 */
export function generatePedagogicalInsights(
  students: Array<{ id: string; name: string; className?: string; avgGrade?: number; lastGrade?: number }>,
  recentGrades: Array<{ studentId: string; grade: number; date: string; title: string }> = []
): PedagogicalAlert[] {
  const alerts: PedagogicalAlert[] = []
  const today = new Date().toISOString().split('T')[0]

  // 1. Detecção de Alunos com Queda de Desempenho ou Nota Crítica (< 6.0)
  students.forEach((student) => {
    const grade = student.lastGrade ?? student.avgGrade
    if (grade !== undefined && grade < 6.0) {
      alerts.push({
        id: `alert_grade_${student.id}`,
        type: 'danger',
        title: `Atenção Pedagógica: ${student.name}`,
        description: `Nota recente de ${grade.toFixed(1)}/10 na turma ${student.className || 'Geral'}.`,
        recommendation: `Sugerido enviar mensagem de apoio aos pais ou aplicar lista de reforço adaptada.`,
        actionLabel: '💬 Comunicar Pais',
        targetModule: 'communications',
        studentId: student.id,
        studentName: student.name,
        date: today,
      })
    }
  })

  // 2. Alerta de Avaliações Recentes Sem Feedback aos Pais
  if (recentGrades.length > 0) {
    const ungradedCount = recentGrades.filter((g) => g.grade !== undefined).length
    if (ungradedCount > 3) {
      alerts.push({
        id: `alert_feedback_pending`,
        type: 'warning',
        title: 'Lembrete de Devolutiva aos Pais',
        description: `${ungradedCount} novas notas foram lançadas recentemente.`,
        recommendation: 'Envie um comunicado breve de fechamento de ciclo via WhatsApp/Email.',
        actionLabel: '📢 Enviar Comunicado',
        targetModule: 'communications',
        date: today,
      })
    }
  }

  // 3. Reconhecimento de Destaque / Evolução Positiva
  const topStudents = students.filter((s) => (s.lastGrade ?? s.avgGrade ?? 0) >= 9.0)
  if (topStudents.length > 0) {
    const names = topStudents.slice(0, 2).map((s) => s.name).join(', ')
    alerts.push({
      id: `alert_praise`,
      type: 'success',
      title: 'Destaques Acadêmicos da Semana',
      description: `${names} atingiram notas de excelência (≥ 9.0).`,
      recommendation: 'Que tal gerar um elogio ou certificado no Portfólio?',
      actionLabel: '🏆 Abrir Portfólio',
      targetModule: 'portfolio',
      date: today,
    })
  }

  return alerts
}

/**
 * Analisa padrões de erro em lote a partir de critérios do OmniCorretor.
 */
export function detectClassErrorPatterns(
  evaluations: Array<{ studentName: string; errors?: Array<{ type: string; description: string }> }>
): ErrorPattern[] {
  const errorCounts: Record<string, { count: number; students: Set<string>; example?: string }> = {}
  const total = evaluations.length || 1

  evaluations.forEach((ev) => {
    ev.errors?.forEach((err) => {
      const key = err.description || err.type
      if (!errorCounts[key]) {
        errorCounts[key] = { count: 0, students: new Set(), example: err.description }
      }
      errorCounts[key].count++
      errorCounts[key].students.add(ev.studentName)
    })
  })

  return Object.entries(errorCounts)
    .map(([topic, data]) => {
      const affected = data.students.size
      const errorRate = Math.round((affected / total) * 100)
      return {
        topic,
        errorRate,
        affectedStudentsCount: affected,
        totalStudentsCount: total,
        exampleError: data.example,
        suggestedAction: `Elaborar 1 aula de reforço focada em "${topic}"`,
      }
    })
    .filter((p) => p.errorRate >= 25)
    .sort((a, b) => b.errorRate - a.errorRate)
}
