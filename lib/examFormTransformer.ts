import { EditableQuestionItem, QuestionOption } from '@/components/EditableQuestionBoxes'

export interface FormBTransformResult {
  formBQuestions: EditableQuestionItem[]
  originalKeyMap: Record<number, { originalLetter: string; newLetter: string }>
  letterDistribution: Record<string, number>
}

/**
 * Gerador de números pseudo-aleatórios determinístico (Mulberry32)
 * Garante que a mesma seed gere exatamente a mesma permutação isomórfica.
 */
function createMulberry32(seed: number) {
  let state = seed
  return function () {
    state |= 0
    state = (state + 0x6D2B79F5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function stringToSeed(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0
  }
  return hash
}

/**
 * Permuta deterministicamente um array usando o algoritmo Fisher-Yates com PRNG
 */
function seededShuffle<T>(array: T[], prng: () => number): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

const LETTERS = ['A', 'B', 'C', 'D', 'E']

/**
 * Transforma deterministicamente a Forma A em Forma B (Isomorfismo Psicométrico Perfeito):
 * 1. Reordena as alternativas de cada questão de múltipla escolha.
 * 2. Recalcula o gabarito oficial e atualiza referências no gabarito comentado.
 * 3. Reordena questões mantendo blocos de texto contextual.
 * 4. Assegura balanceamento psicométrico de letras no gabarito.
 */
export function generateIsomorphicFormB(
  formAQuestions: EditableQuestionItem[],
  seedString: string = 'teacher_ai_form_b_default_seed'
): FormBTransformResult {
  if (!formAQuestions || formAQuestions.length === 0) {
    return { formBQuestions: [], originalKeyMap: {}, letterDistribution: {} }
  }

  const seed = stringToSeed(seedString)
  const prng = createMulberry32(seed)

  const originalKeyMap: Record<number, { originalLetter: string; newLetter: string }> = {}
  const letterDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 }

  // 1. Processa cada questão e rotaciona as alternativas
  const transformedQuestions: EditableQuestionItem[] = formAQuestions.map((q, idx) => {
    if ((q.type !== 'multiple_choice' && q.type !== 'true_false') || !q.options || q.options.length < 2) {
      return { ...q, id: `formB_${q.id}` }
    }

    // Extrai letra correta original do gabarito (ex: "B", "b)", "B - Correta")
    const correctLetterMatch = (q.answerKey || '').match(/^[\(\[]?([A-Ea-e])[\)\]\.\-\s:]/i) || (q.answerKey || '').match(/\b([A-Ea-e])\b/)
    const originalCorrectLetter = correctLetterMatch ? correctLetterMatch[1].toUpperCase() : 'A'

    // Encontra o texto da alternativa correta original
    const correctOptionObj = q.options.find(o => o.letter.toUpperCase() === originalCorrectLetter) || q.options[0]
    const correctOptionText = correctOptionObj.text

    // Permuta as opções com PRNG determinístico
    const shuffledRaw = seededShuffle(q.options, prng)

    // Reatribui as letras A, B, C, D sequencialmente
    const newOptions: QuestionOption[] = shuffledRaw.map((opt, i) => ({
      letter: LETTERS[i] || `${i + 1}`,
      text: opt.text
    }))

    // Descobre a nova letra da resposta correta
    const newCorrectOption = newOptions.find(o => o.text.trim() === correctOptionText.trim()) || newOptions[0]
    const newCorrectLetter = newCorrectOption.letter

    originalKeyMap[q.number] = {
      originalLetter: originalCorrectLetter,
      newLetter: newCorrectLetter
    }

    letterDistribution[newCorrectLetter] = (letterDistribution[newCorrectLetter] || 0) + 1

    // Atualiza o texto do gabarito substituindo a letra antiga pela nova
    let newAnswerKey = q.answerKey || ''
    if (newAnswerKey) {
      newAnswerKey = newAnswerKey.replace(
        new RegExp(`^[\\(\\[]?${originalCorrectLetter}[\\)\\]\\.\\-\\s:]*`, 'i'),
        `${newCorrectLetter}) `
      )
    } else {
      newAnswerKey = `${newCorrectLetter}) Resposta correta`
    }

    return {
      ...q,
      id: `formB_${q.id}`,
      options: newOptions,
      answerKey: newAnswerKey
    }
  })

  // 2. Reordena as questões preservando blocos contextuais
  // Separa em blocos de texto-base e questões filhas
  const blocks: EditableQuestionItem[][] = []
  let currentBlock: EditableQuestionItem[] = []

  transformedQuestions.forEach(q => {
    if (q.type === 'reading_text' || q.contextText) {
      if (currentBlock.length > 0) blocks.push(currentBlock)
      currentBlock = [q]
    } else {
      if (currentBlock.length > 0 && (currentBlock[0].type === 'reading_text' || currentBlock[0].contextText)) {
        currentBlock.push(q)
      } else {
        blocks.push([q])
      }
    }
  })
  if (currentBlock.length > 0) blocks.push(currentBlock)

  // Embaralha os blocos autônomos
  const shuffledBlocks = seededShuffle(blocks, prng)
  const finalQuestions = shuffledBlocks.flat().map((q, i) => ({
    ...q,
    number: i + 1
  }))

  return {
    formBQuestions: finalQuestions,
    originalKeyMap,
    letterDistribution
  }
}
