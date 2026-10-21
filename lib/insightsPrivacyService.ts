/**
 * lib/insightsPrivacyService.ts — Serviços de Privacidade, Anonimização e Fallback para Insights
 * 
 * Regra LGPD Zero-PII:
 * 1. Prompts de IA recebem apenas identificadores opacos [ESTUDANTE_N] e agregados.
 * 2. Supabase nunca recebe nomes ou IDs de alunos (apenas agregados por turma/tópico).
 * 3. Reversão unmaskPii ocorre exclusivamente na camada de renderização local.
 * 4. Falhas de IA (422, timeout, etc.) são explicitamente rotuladas como [modelo padrão].
 */

import { unmaskPii } from './piiMasking'

export interface StudentSummaryItem {
  id: string
  name: string
  className?: string
  avgGrade?: number | null
}

export interface InsightsPrivacySession {
  mapping: Record<string, string>
  reverseMapping: Record<string, string>
}

export interface AiPromptResult {
  prompt: string
  session: InsightsPrivacySession
}

export function buildSafeAiPromptAndSession(
  atRisk: StudentSummaryItem[],
  topPerf: StudentSummaryItem[],
  allStudents: StudentSummaryItem[],
  avg: number | string
): AiPromptResult {
  const mapping: Record<string, string> = {}
  const reverseMapping: Record<string, string> = {}
  let counter = 1

  const getStudentToken = (name: string): string => {
    if (reverseMapping[name]) return reverseMapping[name]
    const token = `[ESTUDANTE_${counter++}]`
    mapping[token] = name
    reverseMapping[name] = token
    return token
  }

  const safeAtRisk = atRisk.map(s => {
    const token = getStudentToken(s.name)
    return `${token} (${s.className || 'Turma'}, média ${s.avgGrade !== null && s.avgGrade !== undefined ? Number(s.avgGrade).toFixed(1) : 'S/N'})`
  })

  const safeTop = topPerf.map(s => {
    const token = getStudentToken(s.name)
    return `${token} (${s.className || 'Turma'}, média ${s.avgGrade !== null && s.avgGrade !== undefined ? Number(s.avgGrade).toFixed(1) : 'S/N'})`
  })

  const safeSample = allStudents.slice(0, 10).map(s => ({
    studentToken: getStudentToken(s.name),
    grade: s.avgGrade,
    class: s.className
  }))

  const summaryContext = {
    totalStudents: allStudents.length,
    atRiskCount: atRisk.length,
    topPerformerCount: topPerf.length,
    averageGrade: avg,
    atRiskStudents: safeAtRisk,
    topStudents: safeTop,
    studentsList: safeSample
  }

  const prompt = `Você é o Motor de Prescrições Pedagógicas Especializadas do Teacher AI.
Analise este panorama real de desempenho dos alunos:
${JSON.stringify(summaryContext, null, 2)}

Elabore um PARECER PRESCRITIVO FUNDAMENTADO EM AUTORES DE PEDAGOGIA.
Estruture em:
1. 🎯 Diagnóstico dos Principais Gargalos Observados
2. 📚 Fundamentação Teórica Prescritiva
3. ⚡ Plano de Ação Prático para as Próximas 3 Aulas
4. 🛠️ Recomendações de Intervenção Diferenciada para Alunos em Atenção e em Destaque.`

  return {
    prompt,
    session: {
      mapping,
      reverseMapping
    }
  }
}

export function buildSafeSupabasePayload(input: {
  overallMastery?: number
  totalStudents?: number
  atRiskStudents?: StudentSummaryItem[]
  topStudents?: StudentSummaryItem[]
  aiReport?: string
  school?: string
  className?: string
  subject?: string
}) {
  const atRisk = input.atRiskStudents || []
  const topPerf = input.topStudents || []

  // Agrega por turma sem citar alunos
  const classBreakdown: Record<string, number> = {}
  atRisk.forEach(s => {
    const cls = s.className || 'Geral'
    classBreakdown[cls] = (classBreakdown[cls] || 0) + 1
  })

  const criticalTopics = Object.entries(classBreakdown).map(
    ([cls, count]) => `Turma ${cls}: ${count} aluno(s) em atenção`
  )

  // Sanitiza ai_report removendo nomes canário conhecidos se presentes
  let sanitizedReport = input.aiReport || ''
  const allNames = [...atRisk, ...topPerf].map(s => s.name).filter(Boolean)
  for (const name of allNames) {
    if (name.length >= 3) {
      sanitizedReport = sanitizedReport.split(name).join('[ESTUDANTE]')
    }
  }

  return {
    school: input.school || '',
    class_name: input.className || '',
    subject: input.subject || 'Geral',
    overall_mastery: input.overallMastery ?? 75,
    total_students: input.totalStudents ?? 0,
    critical_count: atRisk.length,
    top_count: topPerf.length,
    critical_topics: criticalTopics.length > 0 ? criticalTopics : ['Desempenho homogêneo'],
    ai_report: sanitizedReport
  }
}

export function handleAiResponseOrFallback(
  res: { status: number; ok: boolean; data?: any; errorBody?: any },
  context: { atRiskCount: number; topCount: number; totalCount: number; avg: string | number },
  session?: InsightsPrivacySession
): { displayedText: string; errorNotice: string | null; isFallback: boolean } {
  if (res.ok && res.data?.reply) {
    const rawReply = res.data.reply
    // Reversão unmaskPii apenas na camada de exibição
    const displayedText = session?.mapping ? unmaskPii(rawReply, session.mapping) : rawReply
    return {
      displayedText,
      errorNotice: null,
      isFallback: false
    }
  }

  // Falha de IA
  const errCode = res.errorBody?.error || (res.status === 422 ? 'LGPD_EGRESS_BLOCKED' : `HTTP_${res.status}`)
  const errReason = res.errorBody?.message || (res.status === 422 ? 'Bloqueio de segurança LGPD / egress' : 'Serviço temporariamente indisponível')
  const errorNotice = `Esta análise não foi gerada pela IA (motivo: ${errCode} — ${errReason})`

  const staticReport = `[modelo padrão — Esta análise não foi gerada pela IA]
Referência: ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} | Média Geral da Amostra: ${context.avg}/10

1. 🎯 SÍNTESE ESTATÍSTICA DO DESEMPENHO OBSERVADO
• Amostra total analisada: ${context.totalCount} alunos cadastrados.
• Alunos em atenção observada na avaliação: ${context.atRiskCount}.
• Alunos em faixa de destaque na avaliação: ${context.topCount}.

2. 📚 DIRETRIZES PEDAGÓGICAS GERAIS
• Apoio formativo com andaimes didáticos e agrupamentos produtivos.
• Equilíbrio entre apresentação do conteúdo, prática autônoma e checagem formativa.

3. ⚡ PLANO DE AÇÃO PARA AS PRÓXIMAS AULAS
• Aula 1: Revisão dos tópicos com organizadores visuais e mapas conceituais.
• Aula 2: Estações de aprendizagem e atividades em pares.
• Aula 3: Devolutiva individualizada com rubrica de autoavaliação.`

  return {
    displayedText: staticReport,
    errorNotice,
    isFallback: true
  }
}
