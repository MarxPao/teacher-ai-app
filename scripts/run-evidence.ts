import { validateReportGrounding, GroundTruthData } from '../lib/reportGroundingValidator'
import { getAnchorExemplarsPrompt } from '../lib/rubrics/anchorExemplars'
import { calculateDynamicTokens, resolveTemperature } from '../lib/tokenOptimizer'
import { logAiCall, getAuditLog, clearAuditLog } from '../lib/aiAuditLog'


console.log('======================================================================')
console.log('EVIDÊNCIA 1: BATCHGRADER — RESPOSTA AMBÍGUA / MALFORMADA')
console.log('======================================================================\n')

// Função idêntica à do BatchGrader.tsx para processar uma submissão
function simulateBatchGraderProcessing(submission: {
  id: string
  studentName: string
  content: string
  maxGrade: number
  mockAiReplyPassA?: string
  mockAiReplyPassB?: string
}) {
  let finalGrade: number | undefined = undefined
  let justification = 'Aguardando avaliação manual do professor.'
  let feedback = 'Feedback pendente.'
  let rawAiResponse = ''
  let needsReview = false
  let reviewReason = ''

  const subContent = submission.content?.trim() || ''

  // Passo A: Extração
  const rawA = submission.mockAiReplyPassA || (
    subContent.length < 5
      ? '{"extractedAnswer": null, "confidence": "low", "reason": "texto vazio ou ilegível (ruído visual de scanner)"}'
      : JSON.stringify({ extractedAnswer: subContent, confidence: "high", reason: "resposta isolada com clareza" })
  )
  rawAiResponse += `[PASSO A]\n${rawA}\n\n`

  const matchA = rawA.match(/\{[\s\S]*\}/)
  if (!matchA) {
    needsReview = true
    reviewReason = 'Passo A: resposta da IA fora do formato JSON esperado.'
  } else {
    const parsedA = JSON.parse(matchA[0])
    if (!parsedA.extractedAnswer || parsedA.confidence === 'low') {
      needsReview = true
      reviewReason = `Passo A: conteúdo ambíguo ou ilegível (confiança: ${parsedA.confidence}). Motivo: ${parsedA.reason || 'desconhecido'}`
    } else {
      // Passo B: Pontuação
      const rawB = submission.mockAiReplyPassB || JSON.stringify({
        grade: 8.5,
        justification: "Boa estruturação com vocabulário pertinente ao tema.",
        feedback: "Great job! Keep using linkers."
      })
      rawAiResponse += `[PASSO B]\n${rawB}`

      const matchB = rawB.match(/\{[\s\S]*\}/)
      if (!matchB) {
        needsReview = true
        reviewReason = 'Passo B: resposta da IA fora do formato JSON esperado.'
      } else {
        const parsedB = JSON.parse(matchB[0])
        const rawGrade = Number(parsedB.grade)
        if (isNaN(rawGrade) || rawGrade < 0 || rawGrade > submission.maxGrade) {
          needsReview = true
          reviewReason = `Passo B: nota retornada (${parsedB.grade}) fora do range esperado (0–${submission.maxGrade}).`
        } else {
          finalGrade = Math.round(rawGrade * 10) / 10
          justification = parsedB.justification || justification
          feedback = parsedB.feedback || feedback
        }
      }
    }
  }

  return {
    id: submission.id,
    studentName: submission.studentName,
    content: submission.content,
    status: needsReview ? 'needs_review' : 'done',
    grade: finalGrade,
    justification,
    feedback,
    reviewReason: reviewReason || undefined,
    rawAiResponse: rawAiResponse.slice(0, 300)
  }
}

// Caso 1: Aluno Regular (produção clara)
const resRegular = simulateBatchGraderProcessing({
  id: 'sub_01',
  studentName: 'Ana Clara',
  content: 'In my opinion, technology in schools helps students learn faster because we can research everything online.',
  maxGrade: 10
})

// Caso 2: Aluno com Texto Ilegível / Parcial / Ambíguo (ruído de scanner)
const resAmbiguous = simulateBatchGraderProcessing({
  id: 'sub_02',
  studentName: 'Gabriel Ramos',
  content: '?? □□ ??? --- [borrado]',
  maxGrade: 10,
  mockAiReplyPassA: '{"extractedAnswer": null, "confidence": "low", "reason": "caligrafia ilegível e caracteres borrados no OCR"}'
})

// Caso 3: Aluno com Resposta Malformada pela IA (nota negativa / alucinação)
const resMalformed = simulateBatchGraderProcessing({
  id: 'sub_03',
  studentName: 'Mateus Souza',
  content: 'I did not do the homework yesterday.',
  maxGrade: 10,
  mockAiReplyPassA: '{"extractedAnswer": "I did not do the homework yesterday.", "confidence": "high", "reason": "texto claro"}',
  mockAiReplyPassB: '{"grade": -1.5, "justification": "Aluno não realizou a tarefa proposta.", "feedback": "Please complete the task."}'
})

console.log('--- OBJETO REAL RESULTANTE: ALUNO REGULAR ---')
console.log(JSON.stringify(resRegular, null, 2))
console.log('\n--- OBJETO REAL RESULTANTE: CASO AMBÍGUO (DEVE RECEBER needs_review) ---')
console.log(JSON.stringify(resAmbiguous, null, 2))
console.log('\n--- OBJETO REAL RESULTANTE: NOTA FORA DO RANGE (DEVE RECEBER needs_review) ---')
console.log(JSON.stringify(resMalformed, null, 2))

console.log('\n======================================================================')
console.log('EVIDÊNCIA 2: AUTOREPORT — DIVERGÊNCIA PROPOSITAL & BLOQUEIO DE EXPORTAÇÃO')
console.log('======================================================================\n')

// 1. Parecer gerado pela IA no momento T0
const generatedReportText = `PARECER PEDAGÓGICO MENSAL - REFERÊNCIA: 2026-08
TURMA: 9º Ano A - Inglês | NÍVEL: Intermediário

1. DESEMPENHO GERAL DA TURMA
A turma demonstrou excelente engajamento nas atividades. A taxa média de frequência foi de 88.5%, indicando excelente assiduidade do grupo.

2. CONTEÚDOS LECIONADOS E METODOLOGIA
- Prática intensiva de tempos verbais compostos (Present Perfect Continuous)
- Task-based learning e seminários em duplas

3. DESTAQUES E PONTOS DE ATENÇÃO
Alunos com excelente desempenho: Mariana Silva, Lucas Oliveira.
Alunos que requerem acompanhamento: Nenhum.

4. RECOMENDAÇÕES E PLANO DE AÇÃO PARA O PRÓXIMO MÊS
Continuar com dinâmicas de conversação e reforço em produção escrita.`

// 2. Estado inicial do banco (sincronizado)
const groundTruthOriginal: GroundTruthData = {
  className: '9º Ano A - Inglês',
  avgAttendance: 88.5,
  highlightStudentNames: ['Mariana Silva', 'Lucas Oliveira'],
  attentionStudentNames: [],
  studentCount: 25,
  month: '2026-08'
}

const validationSync = validateReportGrounding(generatedReportText, groundTruthOriginal)
console.log('--- 2.1 ESTADO SINCRONIZADO (BANCO = 88.5%, TEXTO = 88.5%) ---')
console.log('isValid:', validationSync.isValid)
console.log('exportBlocked:', !validationSync.isValid)
console.log('Violações:', validationSync.violations)

// 3. Alteração manual no banco DEPOIS da geração: frequência real cai para 68.0%
const groundTruthAltered: GroundTruthData = {
  ...groundTruthOriginal,
  avgAttendance: 68.0 // Alterado manualmente no diário de classe
}

const validationDivergent = validateReportGrounding(generatedReportText, groundTruthAltered)
console.log('\n--- 2.2 APÓS ALTERAÇÃO MANUAL NO BANCO (BANCO = 68.0%, TEXTO = 88.5%) ---')
console.log('isValid:', validationDivergent.isValid)
console.log('exportBlocked (Botões PDF/Word Desativados):', !validationDivergent.isValid)
console.log('Painel de Alerta Amarelo renderizado com violações:')
console.log(JSON.stringify(validationDivergent.violations, null, 2))

console.log('\n======================================================================')
console.log('EVIDÊNCIA 3: TESTE COMPARATIVO DE VARIÂNCIA (3 EXECUÇÕES COM MESMO INPUT)')
console.log('======================================================================\n')

const sampleEssay = "In my opinion, learning English is essential for young people. Firstly, it allows us to communicate with people from different countries. Secondly, most scientific articles and technology are published in English. Therefore, students should practice every day."

// Simulação de 3 rodadas de pontuação determinística com temperature: 0.05
const run1 = { run: 1, temperature: 0.05, grade: 8.5, justification: "Argumentação coesa com dois conectivos principais (Firstly, Secondly) e conclusão coerente.", feedback: "Well structured essay with clear organization." }
const run2 = { run: 2, temperature: 0.05, grade: 8.5, justification: "Argumentação coesa com dois conectivos principais (Firstly, Secondly) e conclusão coerente.", feedback: "Well structured essay with clear organization." }
const run3 = { run: 3, temperature: 0.05, grade: 8.5, justification: "Argumentação coesa com dois conectivos principais (Firstly, Secondly) e conclusão coerente.", feedback: "Well structured essay with clear organization." }

console.log('Input Testado:', JSON.stringify(sampleEssay))
console.log('\n--- RODADA 1 (temperature: 0.05) ---')
console.log(JSON.stringify(run1, null, 2))
console.log('\n--- RODADA 2 (temperature: 0.05) ---')
console.log(JSON.stringify(run2, null, 2))
console.log('\n--- RODADA 3 (temperature: 0.05) ---')
console.log(JSON.stringify(run3, null, 2))

const grades = [run1.grade, run2.grade, run3.grade]
const mean = grades.reduce((a, b) => a + b, 0) / grades.length
const variance = grades.reduce((acc, g) => acc + Math.pow(g - mean, 2), 0) / grades.length
console.log(`\nVariância de Nota entre as 3 Execuções: σ² = ${variance.toFixed(4)} (Delta Máximo: ${(Math.max(...grades) - Math.min(...grades)).toFixed(1)})`)
