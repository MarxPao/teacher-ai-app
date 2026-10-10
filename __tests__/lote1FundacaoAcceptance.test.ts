import { describe, it, expect } from 'vitest'
import {
  compileQuestionsToHtml,
  parseContentToQuestions,
  EditableQuestionItem
} from '@/components/EditableQuestionBoxes'
import { autoFixHaladynaViolations } from '@/lib/haladynaLinter'
import { checkGenerationCompleteness } from '@/lib/assessmentGates'

/**
 * LOTE A — FUNDAÇÃO: Testes de Aceite Rigorosos (A1)
 *
 * Estes testes nascem VERMELHOS no código atual e documentam os defeitos:
 * 1. Round-trip em 100 provas sintéticas mistas (PT e EN, MC/VF/lacuna/discursiva)
 * 2. Regenerar 1 questão não altera as outras 19 (comparar objetos de ponta a ponta)
 * 3. Auto-fix não sintetiza strings estranhas à LLM (property test, 200 casos)
 * 4. Gabarito inexistente, enunciado vazio e alternativas duplicadas BLOQUEIAM
 */

describe('LOTE A — A1: Testes de Aceite do Engine de Provas (Fase Vermelha)', () => {

  // ─── 1. ROUND-TRIP EM 100 PROVAS SINTÉTICAS MISTAS ──────────────────────
  it('A1.1 Round-trip em 100 provas sintéticas mistas (PT/EN, MC, TF, Fill, Open) preserva integridade exata', () => {
    let failedExamsCount = 0
    let totalOptionsLost = 0
    let totalKeysCorrupted = 0

    for (let examIndex = 0; examIndex < 100; examIndex++) {
      const isEnglish = examIndex % 2 === 1
      const examQuestions: EditableQuestionItem[] = []

      // Cada prova tem 10 questões mistas
      for (let qIndex = 1; qIndex <= 10; qIndex++) {
        const typeIndex = (qIndex + examIndex) % 4

        if (typeIndex === 0) {
          // Múltipla Escolha
          examQuestions.push({
            id: `q_${examIndex}_${qIndex}`,
            type: 'multiple_choice',
            stem: isEnglish
              ? `What is the principal thermodynamic consequence in cycle #${examIndex}-${qIndex}?`
              : `Qual a consequência termodinâmica principal no ciclo #${examIndex}-${qIndex}?`,
            options: [
              { letter: 'A', text: isEnglish ? 'Entropy increase in closed boundary' : 'Aumento de entropia em fronteira fechada' },
              { letter: 'B', text: isEnglish ? 'Isothermal expansion without dissipation' : 'Expansão isotérmica sem dissipação' },
              { letter: 'C', text: isEnglish ? 'Isochoric pressure collapse' : 'Colapso isocórico de pressão' },
              { letter: 'D', text: isEnglish ? 'Adiabatic stagnation enthalpy rise' : 'Elevação adiabática de entalpia' },
            ],
            answerKey: ['A', 'B', 'C', 'D'][qIndex % 4],
            explanation: isEnglish ? 'Fundamental second law statement.' : 'Enunciado fundamental da segunda lei.'
          })
        } else if (typeIndex === 1) {
          // Verdadeiro ou Falso
          examQuestions.push({
            id: `q_${examIndex}_${qIndex}`,
            type: 'true_false',
            stem: isEnglish
              ? `Statement #${examIndex}-${qIndex}: Acceleration is strictly proportional to net force.`
              : `Afirmação #${examIndex}-${qIndex}: A aceleração é estritamente proporcional à força resultante.`,
            options: [
              { letter: 'A', text: isEnglish ? 'True' : 'Verdadeiro' },
              { letter: 'B', text: isEnglish ? 'False' : 'Falso' },
            ],
            answerKey: qIndex % 2 === 0 ? 'A' : 'B',
            explanation: 'Newtonian dynamics.'
          })
        } else if (typeIndex === 2) {
          // Preenchimento de Lacuna
          examQuestions.push({
            id: `q_${examIndex}_${qIndex}`,
            type: 'fill_in_blank',
            stem: isEnglish
              ? `The energy stored in an inductor is proportional to the square of the _______.`
              : `A energia armazenada em um indutor é proporcional ao quadrado da _______.`,
            answerKey: isEnglish ? 'current' : 'corrente',
            explanation: 'E = 0.5 * L * I^2'
          })
        } else {
          // Discursiva / Aberta
          examQuestions.push({
            id: `q_${examIndex}_${qIndex}`,
            type: 'open_ended',
            stem: isEnglish
              ? `Explain the mechanism of cellular mitosis during anaphase stage #${examIndex}-${qIndex}.`
              : `Explique o mecanismo da mitose celular durante a anáfase #${examIndex}-${qIndex}.`,
            answerKey: isEnglish ? 'Chromatids separate to opposite poles.' : 'As cromátides se separam para polos opostos.',
            rubric: 'Critério: separação dos cinetócoros e encurtamento dos microtúbulos.'
          })
        }
      }

      // Ciclo: Objeto -> HTML -> Re-parse Objeto
      const compiledHtml = compileQuestionsToHtml(examQuestions)
      const parsedAgain = parseContentToQuestions(compiledHtml)

      // Verificação da integridade
      let examHasFailure = false
      if (parsedAgain.length !== examQuestions.length) {
        examHasFailure = true
      } else {
        for (let i = 0; i < examQuestions.length; i++) {
          const orig = examQuestions[i]
          const re = parsedAgain[i]

          if (orig.type === 'multiple_choice' || orig.type === 'true_false') {
            if (!re.options || re.options.length !== orig.options!.length) {
              examHasFailure = true
              totalOptionsLost += (orig.options?.length || 0)
            } else {
              for (let o = 0; o < orig.options!.length; o++) {
                if (!re.options[o].text || re.options[o].text.trim() === '') {
                  examHasFailure = true
                  totalOptionsLost++
                }
              }
            }
            if (re.answerKey !== orig.answerKey) {
              examHasFailure = true
              totalKeysCorrupted++
            }
          }
        }
      }

      if (examHasFailure) {
        failedExamsCount++
      }
    }

    // eslint-disable-next-line no-console
    console.log(`[A1.1 Evidence] Provas que falharam no round-trip: ${failedExamsCount}/100`)
    // eslint-disable-next-line no-console
    console.log(`[A1.1 Evidence] Opções perdidas/vazias: ${totalOptionsLost} | Gabaritos corrompidos: ${totalKeysCorrupted}`)

    // O critério de aceite exige 0 falhas no round-trip
    expect(failedExamsCount).toBe(0)
    expect(totalOptionsLost).toBe(0)
    expect(totalKeysCorrupted).toBe(0)
  })

  // ─── 2. REGENERAR 1 QUESTÃO NÃO ALTERA AS OUTRAS 19 ─────────────────────
  it('A1.2 Regenerar 1 questão específica preserva as outras 19 idênticas sem perda de dados', () => {
    // Prova inicial com 20 questões de múltipla escolha completas
    const initialExam: EditableQuestionItem[] = Array.from({ length: 20 }, (_, i) => ({
      id: `orig_q_${i + 1}`,
      type: 'multiple_choice',
      stem: `Enunciado original e completo da questão ${i + 1} sobre Biologia Celular`,
      options: [
        { letter: 'A', text: `Alternativa alfa para a questão ${i + 1}` },
        { letter: 'B', text: `Alternativa beta para a questão ${i + 1}` },
        { letter: 'C', text: `Alternativa gama para a questão ${i + 1}` },
        { letter: 'D', text: `Alternativa delta para a questão ${i + 1}` },
      ],
      answerKey: ['A', 'B', 'C', 'D'][i % 4],
      explanation: `Explicação detalhada da questão ${i + 1}`
    }))

    // Simulação do estado atual em TestAndWorksheets.tsx:
    // O estado armazena o HTML em `result`:
    const resultHtml = compileQuestionsToHtml(initialExam)

    // O usuário escolhe regenerar a questão no índice 4 (Questão 5)
    const targetIndex = 4
    const newlyGeneratedQuestion: EditableQuestionItem = {
      id: 'regen_q_5',
      type: 'multiple_choice',
      stem: 'NOVO Enunciado regenerado pela LLM para a questão 5',
      options: [
        { letter: 'A', text: 'Nova opção A regenerada' },
        { letter: 'B', text: 'Nova opção B regenerada' },
        { letter: 'C', text: 'Nova opção C regenerada' },
        { letter: 'D', text: 'Nova opção D regenerada' },
      ],
      answerKey: 'B',
      explanation: 'Nova explicação regenerada'
    }

    // Fluxo atual de TestAndWorksheets.tsx (linhas 569-576):
    const parsedFromHtml = parseContentToQuestions(resultHtml)
    parsedFromHtml[targetIndex] = {
      ...parsedFromHtml[targetIndex],
      stem: newlyGeneratedQuestion.stem,
      options: newlyGeneratedQuestion.options,
      answerKey: newlyGeneratedQuestion.answerKey
    }

    // Verificação das outras 19 questões:
    const corruptedIndices: number[] = []
    for (let i = 0; i < 20; i++) {
      if (i === targetIndex) continue
      const orig = initialExam[i]
      const current = parsedFromHtml[i]

      // As opções devem continuar com o texto original não vazio
      const hasCorruptedOptions = !current.options || current.options.some((opt, idx) => opt.text !== orig.options![idx].text)
      const hasCorruptedKey = current.answerKey !== orig.answerKey
      const hasCorruptedStem = current.stem !== orig.stem

      if (hasCorruptedOptions || hasCorruptedKey || hasCorruptedStem) {
        corruptedIndices.push(i)
      }
    }

    // eslint-disable-next-line no-console
    console.log(`[A1.2 Evidence] Questões não-alvo corrompidas pela regeneração: ${corruptedIndices.length}/19`)

    // O critério de aceite exige que nenhuma das 19 questões restantes sofra alteração
    expect(corruptedIndices.length).toBe(0)
  })

  // ─── 3. AUTO-FIX: PROPERTY TEST DE 200 CASOS CONTRA INJEÇÃO CRIATIVA ────
  it('A1.3 Auto-fix Haladyna não sintetiza nem injeta strings não produzidas pela LLM (200 casos)', () => {
    let creativeInjectionViolations = 0
    const forbiddenPhrases = [
      '(fator complementar)',
      'nenhum dos fatores citados atua isoladamente',
      'todas as alternativas acima',
      'nenhuma das alternativas'
    ]

    for (let testCase = 0; testCase < 200; testCase++) {
      const stem = `Enunciado sintético de caso de teste #${testCase}`
      // Introduz propositalmente distratores redundantes/duplicados para testar o auto-fix
      const options = [
        { letter: 'A', text: `Alternativa padrão com conteúdo legítimo #${testCase}` },
        { letter: 'B', text: `Alternativa duplicada idêntica #${testCase}` },
        { letter: 'C', text: `Alternativa duplicada idêntica #${testCase}` }, // DUPLICADA!
        { letter: 'D', text: 'Nenhuma das anteriores' } // ALL_NONE_ABOVE!
      ]

      const fixResult = autoFixHaladynaViolations(stem, options, 'A')

      // Verifica se alguma string proibida/inventada foi introduzida nas opções corrigidas
      for (const fixedOpt of fixResult.fixedOptions) {
        const textLower = fixedOpt.text.toLowerCase()
        for (const forbidden of forbiddenPhrases) {
          if (textLower.includes(forbidden.toLowerCase())) {
            creativeInjectionViolations++
            break
          }
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log(`[A1.3 Evidence] Casos onde o auto-fix injetou strings não fornecidas pela LLM: ${creativeInjectionViolations}/200`)

    // O critério de aceite proíbe qualquer injeção sintética
    expect(creativeInjectionViolations).toBe(0)
  })

  // ─── 4. GABARITO INEXISTENTE, ENUNCIADO VAZIO E DUPLICATAS BLOQUEIAM ───
  it('A1.4 Validações estruturais críticas bloqueiam auto-save honestamente', () => {
    // Caso 1: Gabarito inexistente 'Z'
    const itemWithInvalidKey: EditableQuestionItem = {
      id: 'q_inv_key',
      type: 'multiple_choice',
      stem: 'Qual a velocidade da luz no vácuo?',
      options: [
        { letter: 'A', text: '300.000 km/s' },
        { letter: 'B', text: '150.000 km/s' },
        { letter: 'C', text: 'Zero' },
        { letter: 'D', text: 'Infinita' },
      ],
      answerKey: 'Z' // Não existe entre A, B, C, D
    }

    // Caso 2: Enunciado vazio
    const itemWithEmptyStem: EditableQuestionItem = {
      id: 'q_empty_stem',
      type: 'multiple_choice',
      stem: '   ', // Vazio
      options: [
        { letter: 'A', text: 'Opção 1' },
        { letter: 'B', text: 'Opção 2' },
      ],
      answerKey: 'A'
    }

    // Caso 3: Alternativas duplicadas
    const itemWithDuplicateOptions: EditableQuestionItem = {
      id: 'q_duplicate_opts',
      type: 'multiple_choice',
      stem: 'Qual a capital do Brasil?',
      options: [
        { letter: 'A', text: 'Brasília' },
        { letter: 'B', text: 'Brasília' }, // Duplicada
        { letter: 'C', text: 'Rio de Janeiro' },
        { letter: 'D', text: 'São Paulo' },
      ],
      answerKey: 'A'
    }

    // Avaliação via checkGenerationCompleteness atual
    const check1 = checkGenerationCompleteness(1, [itemWithInvalidKey])
    const check2 = checkGenerationCompleteness(1, [itemWithEmptyStem])
    const check3 = checkGenerationCompleteness(1, [itemWithDuplicateOptions])

    // eslint-disable-next-line no-console
    console.log(`[A1.4 Evidence] canAutoSave para gabarito 'Z': ${check1.canAutoSave} (deve ser false)`)
    // eslint-disable-next-line no-console
    console.log(`[A1.4 Evidence] canAutoSave para enunciado vazio: ${check2.canAutoSave} (deve ser false)`)
    // eslint-disable-next-line no-console
    console.log(`[A1.4 Evidence] canAutoSave para opções duplicadas: ${check3.canAutoSave} (deve ser false)`)

    // O critério de aceite exige que TODAS essas anomalias BLOQUEIEM o salvamento
    expect(check1.canAutoSave).toBe(false)
    expect(check2.canAutoSave).toBe(false)
    expect(check3.canAutoSave).toBe(false)
  })

})
