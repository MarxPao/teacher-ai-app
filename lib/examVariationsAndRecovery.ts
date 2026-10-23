/**
 * lib/examVariationsAndRecovery.ts
 *
 * Implementa:
 * - R1: Gerador de Prova de Recuperação Paralela / 2ª Chamada Equivalente + Worksheet de Revisão Dirigida
 * - R2: Gerador de Pacote de Aplicação Instantâneo:
 *       • Versão A (Original) + Gabarito A
 *       • Versão B (Anti-Cola: questões e alternativas embaralhadas) + Gabarito B recalculado
 *       • Versão Adaptada NEE / PEI (Comandos em etapas, palavras-chave em destaque,
 *         redução de 4–5 para 3 alternativas A/B/C com gabarito próprio e tipografia acessível)
 */

import { EditableQuestionItem, QuestionOption, compileQuestionsToHtml } from '@/components/EditableQuestionBoxes'
import { buildStandaloneAnswerKeyHtml } from '@/lib/exportUtils'

export interface ExamVersionBundle {
  versionCode: 'A' | 'B' | 'NEE_PEI'
  versionLabel: string
  label: string
  summaryNote: string
  subtitle: string
  title: string
  instructions: string
  questions: EditableQuestionItem[]
  htmlContent: string
  examHtml: string
  answerKeyHtml: string
  answerKeyStandaloneHtml?: string
}

export interface ExamApplicationPackage {
  versionA: ExamVersionBundle
  versionB: ExamVersionBundle
  versionAdapted: ExamVersionBundle
  versionAdaptedNee: ExamVersionBundle
}

export interface RecoveryAndReviewPackage {
  variantType: 'recuperacao_paralela' | 'segunda_chamada'
  recoveryType: 'recuperacao' | 'segunda_chamada' | 'recuperacao_paralela'
  title: string
  bnccSkillsCovered: string[]
  recoveryExam: {
    title: string
    instructions: string
    questions: EditableQuestionItem[]
    htmlContent: string
    examHtml: string
    answerKeyStandaloneHtml: string
    answerKeyHtml: string
  }
  reviewWorksheet: {
    title: string
    instructions: string
    questions: EditableQuestionItem[]
    htmlContent: string
    examHtml: string
    answerKeyStandaloneHtml: string
    answerKeyHtml: string
  }
  // Compatibilidade com propriedades legadas
  recoveryQuestions: EditableQuestionItem[]
  recoveryExamHtml: string
  recoveryAnswerKeyHtml: string
  reviewWorksheetTitle: string
  reviewWorksheetHtml: string
}

export type RecoveryAndReviewBundle = RecoveryAndReviewPackage

const LETTERS = ['A', 'B', 'C', 'D', 'E']

/**
 * Embaralhamento determinístico (Fisher-Yates com semente numérica) para garantir reprodutibilidade
 */
function seededShuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items]
  let s = seed || 1337
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296
    const j = Math.floor((s / 4294967296) * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

/**
 * Embaralha as alternativas de uma questão de múltipla escolha e recalcula `correctOptionId` para a nova letra (A, B, C, D).
 */
export function shuffleQuestionOptions(
  question: EditableQuestionItem,
  seed: number
): EditableQuestionItem {
  if (!Array.isArray(question.options) || question.options.length < 2) {
    return { ...question }
  }

  const originalCorrectId = String((question as any).correctOptionId || question.answerKey || 'A').trim().toUpperCase()
  const options = question.options || []
  const indexedOptions = options.map((opt, idx) => ({
    ...opt,
    letter: opt.letter || LETTERS[idx] || 'A',
    text: opt.text || '',
    wasCorrect:
      String((opt as any).id || opt.letter || LETTERS[idx] || '').trim().toUpperCase() === originalCorrectId ||
      (idx === 0 && !options.some(o => String((o as any).id || o.letter).toUpperCase() === originalCorrectId))
  }))

  // Garante que a ordem realmente mude quando há pelo menos 2 opções
  let shuffled = seededShuffle(indexedOptions, seed)
  if (
    shuffled.length > 1 &&
    shuffled.every((opt, idx) => opt.text === indexedOptions[idx].text)
  ) {
    shuffled = [...indexedOptions.slice(1), indexedOptions[0]]
  }

  let newCorrectLetter = 'A'
  const remappedOptions: QuestionOption[] = shuffled.map((opt, idx) => {
    const letter = LETTERS[idx] || String(idx + 1)
    if (opt.wasCorrect) {
      newCorrectLetter = letter
    }
    return {
      letter,
      text: opt.text
    }
  })

  return {
    ...question,
    options: remappedOptions,
    answerKey: newCorrectLetter,
    ...({ correctOptionId: newCorrectLetter } as any)
  }
}

/**
 * Destaca verbos de comando e termos-chave no enunciado para apoiar leitura de estudantes com TDAH, TEA e Dislexia.
 */
export function highlightStemKeywordsForNee(stem: string): string {
  if (!stem) return ''
  const keywords = [
    'assinale',
    'marque',
    'identifique',
    'escolha',
    'complete',
    'leia',
    'observe',
    'correta',
    'correto',
    'incorreta',
    'exceto',
    'não',
    'not',
    'correct',
    'choose',
    'read',
    'complete'
  ]
  let result = stem
  keywords.forEach(kw => {
    const regex = new RegExp(`\\b(${kw})\\b`, 'gi')
    result = result.replace(regex, '<strong>$1</strong>')
  })
  return result
}

/**
 * Adapta uma questão para o perfil NEE / PEI (TEA, TDAH, Dislexia):
 * 1. Divide visualmente o comando em etapas curtas e destaca palavras-chave;
 * 2. Reduz o número de alternativas de 4 ou 5 para 3 opções (A, B, C), removendo distratores excedentes
 *    e preservando obrigatoriamente a alternativa correta com recálculo de `correctOptionId`.
 */
export function adaptQuestionForNeePei(question: EditableQuestionItem): EditableQuestionItem {
  const highlightedStem = highlightStemKeywordsForNee(question.stem || '')

  if (!Array.isArray(question.options) || question.options.length <= 3) {
    return {
      ...question,
      stem: highlightedStem
    }
  }

  const originalCorrectId = String((question as any).correctOptionId || question.answerKey || 'A').trim().toUpperCase()
  const options = question.options || []
  const tagged = options.map((opt, idx) => ({
    ...opt,
    letter: opt.letter || LETTERS[idx] || 'A',
    text: opt.text || '',
    isCorrect: String((opt as any).id || opt.letter || LETTERS[idx]).trim().toUpperCase() === originalCorrectId
  }))

  const correctOpt = tagged.find(o => o.isCorrect) || tagged[0]
  const distractors = tagged.filter(o => o !== correctOpt).slice(0, 2) // Mantém apenas 2 distratores (total = 3 opções)

  // Mantém a ordem relativa original entre as 3 opções selecionadas
  const keptSet = new Set([correctOpt, ...distractors])
  const reducedRaw = tagged.filter(o => keptSet.has(o))

  let newCorrectLetter = 'A'
  const reducedOptions: QuestionOption[] = reducedRaw.map((opt, idx) => {
    const letter = LETTERS[idx] || 'A'
    if (opt === correctOpt) {
      newCorrectLetter = letter
    }
    return {
      letter,
      text: opt.text
    }
  })

  return {
    ...question,
    stem: highlightedStem,
    options: reducedOptions,
    answerKey: newCorrectLetter,
    ...({ correctOptionId: newCorrectLetter } as any)
  }
}

/**
 * R2 — Gera o Pacote Completo de Aplicação:
 * - Versão A (Original)
 * - Versão B (Embaralhada Anti-Cola: ordem de questões e ordem de alternativas embaralhadas + Gabarito B recalculado)
 * - Versão Adaptada NEE / PEI (3 alternativas, comandos destacados, tipografia ampliada + Gabarito NEE recalculado)
 */
export function generateExamApplicationPackage(params: {
  questions: EditableQuestionItem[]
  title?: string
  baseTitle?: string
  topic?: string
  grade?: string
  seed?: number
  studentPdiName?: string
}): ExamApplicationPackage {
  const baseQuestions = Array.isArray(params.questions) ? params.questions : []
  const seed = params.seed ?? 20261017
  const baseTitle = params.baseTitle || params.title || 'Avaliação Oficial'

  // 1. VERSÃO A (Original)
  const questionsA: EditableQuestionItem[] = baseQuestions.map((q, idx) => ({
    ...q,
    number: idx + 1
  }))
  const rawHtmlA = compileQuestionsToHtml(questionsA)
  const cleanExamHtmlA = rawHtmlA.replace(
    /<div\s+class="exam-answer-key"[^>]*>[\s\S]*?<\/div>/gi,
    ''
  )
  const answerKeyHtmlA = buildStandaloneAnswerKeyHtml({
    questions: questionsA,
    title: `${baseTitle} — VERSÃO A`
  })

  // 2. VERSÃO B (Embaralhada Anti-Cola)
  const shuffledOrder =
    baseQuestions.length > 1
      ? seededShuffle(baseQuestions, seed)
      : [...baseQuestions]
  // Garante que a primeira questão mude se houver 2+ questões
  if (
    shuffledOrder.length > 1 &&
    shuffledOrder[0]?.id === baseQuestions[0]?.id
  ) {
    const first = shuffledOrder.shift()!
    shuffledOrder.push(first)
  }

  const questionsB: EditableQuestionItem[] = shuffledOrder.map((q, idx) => {
    const withShuffledOpts = shuffleQuestionOptions(q, seed + (idx + 1) * 97)
    return {
      ...withShuffledOpts,
      number: idx + 1
    }
  })
  const rawHtmlB = compileQuestionsToHtml(questionsB)
  const cleanExamHtmlB = rawHtmlB.replace(
    /<div\s+class="exam-answer-key"[^>]*>[\s\S]*?<\/div>/gi,
    ''
  )
  const answerKeyHtmlB = buildStandaloneAnswerKeyHtml({
    questions: questionsB,
    title: `${baseTitle} — VERSÃO B (ANTI-COLA)`
  })

  // 3. VERSÃO ADAPTADA NEE / PEI (3 alternativas, apoio visual de leitura e comandos destacados)
  const questionsNee: EditableQuestionItem[] = baseQuestions.map((q, idx) => {
    const adapted = adaptQuestionForNeePei(q)
    return {
      ...adapted,
      number: idx + 1
    }
  })
  const rawHtmlNee = compileQuestionsToHtml(questionsNee)
  const studentNotice = params.studentPdiName ? ` de ${params.studentPdiName}` : ''
  const cleanExamHtmlNee = `
    <div style="border: 1.5px solid #2c1a0e; background: #fdf8f2; padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; font-size: 11.5pt; line-height: 1.55;">
      <strong>📌 ROTEIRO DE APOIO AO ESTUDANTE (PDI / PEI${studentNotice}):</strong>
      <ol style="margin: 6px 0 0 18px; padding: 0;">
        <li>Leia uma questão por vez, observando as <strong>palavras em destaque</strong>.</li>
        <li>Cada questão objetiva possui apenas <strong>3 opções (A, B ou C)</strong> para reduzir distrações.</li>
        <li>Você pode solicitar leitura mediada ou esclarecimento de vocabulário ao(à) professor(a).</li>
      </ol>
    </div>
    <div style="font-size: 12.5pt; line-height: 1.65;">
      ${rawHtmlNee.replace(/<div\s+class="exam-answer-key"[^>]*>[\s\S]*?<\/div>/gi, '')}
    </div>
  `
  const answerKeyHtmlNee = buildStandaloneAnswerKeyHtml({
    questions: questionsNee,
    title: `${baseTitle} — VERSÃO ADAPTADA (PDI / PEI)`
  })

  const versionA: ExamVersionBundle = {
    versionCode: 'A',
    versionLabel: 'Versão A (Padrão)',
    label: 'Versão A (Padrão)',
    summaryNote: 'Ordem original de questões e alternativas',
    subtitle: 'Ordem original de questões e alternativas',
    title: `${baseTitle} — VERSÃO A`,
    instructions: 'Leia atentamente as questões e marque a alternativa correta.',
    questions: questionsA,
    htmlContent: cleanExamHtmlA,
    examHtml: cleanExamHtmlA,
    answerKeyHtml: answerKeyHtmlA,
    answerKeyStandaloneHtml: answerKeyHtmlA
  }

  const versionB: ExamVersionBundle = {
    versionCode: 'B',
    versionLabel: 'Versão B (Anti-Cola Embaralhada)',
    label: 'Versão B (Anti-Cola)',
    summaryNote: 'Questões e alternativas embaralhadas com gabarito próprio recalculado',
    subtitle: 'Questões e alternativas embaralhadas com gabarito próprio recalculado',
    title: `${baseTitle} — VERSÃO B (ANTI-COLA)`,
    instructions: 'Caderno B com alternativas embaralhadas para aplicação segura.',
    questions: questionsB,
    htmlContent: cleanExamHtmlB,
    examHtml: cleanExamHtmlB,
    answerKeyHtml: answerKeyHtmlB,
    answerKeyStandaloneHtml: answerKeyHtmlB
  }

  const versionAdaptedNee: ExamVersionBundle = {
    versionCode: 'NEE_PEI',
    versionLabel: 'Versão Adaptada (NEE / PEI)',
    label: 'Versão Adaptada (PDI / PEI)',
    summaryNote: 'Redução para 3 alternativas (A, B, C), palavras-chave em destaque e espaçamento ampliado',
    subtitle: 'Redução para 3 alternativas (A, B, C), palavras-chave em destaque e espaçamento ampliado',
    title: `${baseTitle} — VERSÃO ADAPTADA (PDI / PEI)`,
    instructions: params.studentPdiName
      ? `Avaliação Adaptada com recursos de acessibilidade e 3 alternativas para ${params.studentPdiName}.`
      : 'Avaliação Adaptada com recursos de acessibilidade e 3 alternativas.',
    questions: questionsNee,
    htmlContent: cleanExamHtmlNee,
    examHtml: cleanExamHtmlNee,
    answerKeyHtml: answerKeyHtmlNee,
    answerKeyStandaloneHtml: answerKeyHtmlNee
  }

  return {
    versionA,
    versionB,
    versionAdapted: versionAdaptedNee,
    versionAdaptedNee
  }
}

/**
 * R1 — Gera a Prova de Recuperação Paralela / 2ª Chamada Equivalente + Worksheet de Revisão Pré-Recuperação
 * preservando a matriz de habilidades BNCC e os pontos de cada item.
 */
export function generateRecoveryExamAndReviewWorksheet(params: {
  questions?: EditableQuestionItem[]
  originalQuestions?: EditableQuestionItem[]
  title?: string
  baseTitle?: string
  topic?: string
  grade?: string
  level?: string
  subjectName?: string
  variantType?: 'recuperacao_paralela' | 'segunda_chamada'
  recoveryType?: 'recuperacao' | 'segunda_chamada' | 'recuperacao_paralela'
}): RecoveryAndReviewPackage {
  const rawType = params.recoveryType || params.variantType || 'recuperacao_paralela'
  const variantType = rawType === 'recuperacao' ? 'recuperacao_paralela' : rawType
  const labelPrefix =
    variantType === 'recuperacao_paralela'
      ? 'RECUPERAÇÃO PARALELA'
      : 'AVALIAÇÃO DE 2ª CHAMADA'

  const baseQuestions = Array.isArray(params.questions)
    ? params.questions
    : Array.isArray(params.originalQuestions)
    ? params.originalQuestions
    : []

  const baseTitle = params.baseTitle || params.title || 'Língua Inglesa'

  // Constrói questões equivalentes cobrindo exatamente a mesma matriz BNCC, mas com alternativas reordenadas
  // e contextualização de revisão/2ª chamada (editável pelo professor nos boxes)
  const recoveryQuestions: EditableQuestionItem[] = baseQuestions.map((q, idx) => {
    const shuffled = shuffleQuestionOptions(q, 9001 + idx * 53)
    const bnccSkill = (q as any).bnccSkill || (q.cognitiveAttributes && q.cognitiveAttributes[0]) || ''
    const bnccTag = bnccSkill ? `[${bnccSkill}] ` : ''
    const stemHasContext = shuffled.stem.includes('(') || shuffled.stem.length > 40
    const adaptedStem = stemHasContext
      ? `${shuffled.stem}`
      : `${bnccTag}${shuffled.stem}`

    return {
      ...shuffled,
      id: `rec_${q.id || idx}_${Date.now()}`,
      number: idx + 1,
      stem: adaptedStem
    }
  })

  const rawRecoveryHtml = compileQuestionsToHtml(recoveryQuestions)
  const recoveryExamHtml = rawRecoveryHtml.replace(
    /<div\s+class="exam-answer-key"[^>]*>[\s\S]*?<\/div>/gi,
    ''
  )

  const recoveryTitle = `${labelPrefix} — ${baseTitle}`
  const recoveryAnswerKeyHtml = buildStandaloneAnswerKeyHtml({
    questions: recoveryQuestions,
    title: recoveryTitle
  })

  // Extrai habilidades BNCC e tópicos cobrados para a Worksheet de Revisão Dirigida
  const uniqueSkills = Array.from(
    new Set(
      baseQuestions
        .map(q => (q as any).bnccSkill || (q as any).pedagogicalObjective || (q.cognitiveAttributes && q.cognitiveAttributes[0]) || '')
        .filter(Boolean)
    )
  )

  const reviewItemsHtml = baseQuestions
    .map((q, idx) => {
      const skillLabel = (q as any).bnccSkill || (q.cognitiveAttributes && q.cognitiveAttributes[0]) || `Tópico ${idx + 1} (${params.topic || 'Conteúdo Essencial'})`
      const objective =
        (q as any).pedagogicalObjective ||
        'Revisar a estrutura linguística e o vocabulário em contexto.'
      return `
        <div class="exam-question-item" style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px dashed #cbd5e1; page-break-inside: avoid;">
          <div style="font-weight: bold; font-size: 11pt; color: #2c1a0e; margin-bottom: 4px;">
            Roteiro de Estudo ${idx + 1} &mdash; Foco: ${skillLabel}
          </div>
          <p style="margin: 4px 0; font-size: 10pt; color: #334155;">
            <strong>O que revisar:</strong> ${objective}
          </p>
          <p style="margin: 6px 0; font-size: 10.5pt;">
            <strong>Exercício Guiado ${idx + 1}:</strong> A partir do tema <em>"${params.topic || 'Unidade Trabalhada'}"</em>,
            explique com suas palavras ou escreva um exemplo prático aplicando a regra exigida na questão:
            <br/><em>"${(q.stem || '').slice(0, 160)}${(q.stem || '').length > 160 ? '...' : ''}"</em>
          </p>
          <div style="background: #fdf8f2; border-left: 3px solid #8b5e3c; padding: 6px 10px; margin-top: 6px; font-size: 9.5pt; color: #5c3a21;">
            💡 <strong>Dica de Resolução:</strong> ${q.explanation || 'Sublinhe termos cognatos e identifique a regra trabalhada no enunciado.'}
          </div>
          <div style="margin-top: 8px; border-bottom: 1px solid #94a3b8; height: 22px;"></div>
        </div>
      `
    })
    .join('\n')

  const reviewWorksheetTitle = `WORKSHEET DE REVISÃO DIRIGIDA (PRÉ-${labelPrefix}) — ${params.topic || baseTitle}`
  const reviewWorksheetHtml = `
    <div class="generated-exam-document">
      <h2>1. MAPA DE ESTUDO DIRIGIDO PARA A ${labelPrefix}</h2>
      <p>
        Esta folha de atividades foi elaborada para apoiar sua preparação antes da <strong>${labelPrefix}</strong>
        de <strong>${params.subjectName || 'Língua Inglesa'}</strong> (${params.grade || 'Ensino Fundamental'}).
        Resolva cada etapa consultando seu caderno e o livro didático.
      </p>

      ${
        uniqueSkills.length > 0
          ? `
        <table class="content-table">
          <thead>
            <tr>
              <th style="width: 70%;">Habilidade BNCC / Objetivo Cobrado na Avaliação</th>
              <th style="width: 30%; text-align: center;">Autoavaliação do Aluno</th>
            </tr>
          </thead>
          <tbody>
            ${uniqueSkills
              .map(
                sk => `
              <tr>
                <td><strong>${sk}</strong></td>
                <td style="text-align: center;">( &nbsp; ) Já domino &nbsp;&nbsp; ( &nbsp; ) Preciso de ajuda</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `
          : ''
      }

      <h2>2. EXERCÍCIOS GUIADOS DE FIXAÇÃO E REFORÇO</h2>
      ${reviewItemsHtml || '<p>Revise os conceitos principais trabalhados em aula.</p>'}
    </div>
  `

  const reviewAnswerKeyHtml = buildStandaloneAnswerKeyHtml({
    questions: baseQuestions,
    title: `PADRÃO DE RESPOSTAS COMENTADO — ${reviewWorksheetTitle}`
  })

  return {
    variantType,
    recoveryType: params.recoveryType || (variantType === 'recuperacao_paralela' ? 'recuperacao' : 'segunda_chamada'),
    title: recoveryTitle,
    bnccSkillsCovered: uniqueSkills,
    recoveryExam: {
      title: recoveryTitle,
      instructions: `DOCUMENTO EXCLUSIVO DE ${labelPrefix} — Responda com clareza mantendo o padrão de rigor pedagógico.`,
      questions: recoveryQuestions,
      htmlContent: recoveryExamHtml,
      examHtml: recoveryExamHtml,
      answerKeyStandaloneHtml: recoveryAnswerKeyHtml,
      answerKeyHtml: recoveryAnswerKeyHtml
    },
    reviewWorksheet: {
      title: reviewWorksheetTitle,
      instructions: `ESTUDO DIRIGIDO PRÉ-${labelPrefix} — Resolva os exercícios guiados para consolidação de aprendizagem.`,
      questions: baseQuestions,
      htmlContent: reviewWorksheetHtml,
      examHtml: reviewWorksheetHtml,
      answerKeyStandaloneHtml: reviewAnswerKeyHtml,
      answerKeyHtml: reviewAnswerKeyHtml
    },
    recoveryQuestions,
    recoveryExamHtml,
    recoveryAnswerKeyHtml,
    reviewWorksheetTitle,
    reviewWorksheetHtml
  }
}
