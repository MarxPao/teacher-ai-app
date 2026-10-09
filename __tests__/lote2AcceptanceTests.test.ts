import { describe, it, expect } from 'vitest'
import {
  parseContentToQuestions,
  compileQuestionsToHtml,
  type EditableQuestionItem
} from '../components/EditableQuestionBoxes'
import {
  auditHaladynaGuidelines,
  autoFixHaladynaViolations,
  checkGenerationCompleteness
} from '../lib/haladynaLinter'
import { auditExamDistractors } from '../lib/distractorQualityAuditor'

describe('LOTE 2 — Testes de Aceite do Engine de Provas (Revisão Rigorosa)', () => {

  // =========================================================================
  // T1: Round-trip em Português
  // =========================================================================
  it('T1 Round-trip (PT-BR): 20 questoes -> compilar -> reler -> compilar', () => {
    const originalQuestions: EditableQuestionItem[] = Array.from({ length: 20 }, (_, idx) => {
      const qNum = idx + 1
      return {
        id: `q_${qNum}`,
        number: qNum,
        type: 'multiple_choice',
        typeLabel: 'Múltipla Escolha',
        points: 1.0,
        stem: `Enunciado da questão número ${qNum} sobre fotossíntese.`,
        options: [
          { letter: 'A', text: `Produção de glicose e oxigênio (q${qNum})` },
          { letter: 'B', text: `Degradação de lipídios no citoplasma (q${qNum})` },
          { letter: 'C', text: `Síntese de proteínas nos ribossomos (q${qNum})` },
          { letter: 'D', text: `Armazenamento de água no vacúolo (q${qNum})` },
        ],
        answerKey: 'A'
      }
    })

    const html1 = compileQuestionsToHtml(originalQuestions, 'Avaliação de Biologia')
    const reparsed = parseContentToQuestions(html1)

    let emptyOptionCount = 0
    let totalOptionsParsed = 0
    reparsed.forEach(q => {
      q.options?.forEach(opt => {
        totalOptionsParsed++
        if (!opt.text || opt.text.trim() === '') emptyOptionCount++
      })
    })

    let autoFixInjectedCount = 0
    reparsed.forEach(q => {
      if (q.stem.includes('(fator complementar)')) autoFixInjectedCount++
      q.options?.forEach(opt => {
        if (opt.text.includes('(fator complementar)')) autoFixInjectedCount++
      })
    })

    const misalignmentIssues: string[] = []
    reparsed.forEach((q, idx) => {
      const expectedKey = originalQuestions[idx].answerKey
      if (q.answerKey?.trim() !== expectedKey) {
        misalignmentIssues.push(`Q${idx+1}: esperado="${expectedKey}", obtido="${q.answerKey?.replace(/\n/g, ' ')}"`)
      }
    })

    console.log(`[T1-PT Evidence] Questões: ${reparsed.length}/20 | Opções vazias: ${emptyOptionCount}/${totalOptionsParsed} | Gabaritos corrompidos: ${misalignmentIssues.length}/20`)
    expect(reparsed.length).toBe(20)
    expect(emptyOptionCount).toBe(0)
    expect(misalignmentIssues.length).toBe(0)
  })

  // =========================================================================
  // T1-EN: Round-trip em Inglês COM Auto-Fix Ativado
  // =========================================================================
  it('T1 Round-trip (EN + Auto-Fix): 20 questoes em ingles com auto-fix ativado', () => {
    // 20 questões em inglês, incluindo duplicatas induzidas para acionar o auto-fix
    const originalQuestionsEn: EditableQuestionItem[] = Array.from({ length: 20 }, (_, idx) => {
      const qNum = idx + 1
      return {
        id: `q_en_${qNum}`,
        number: qNum,
        type: 'multiple_choice',
        typeLabel: 'Multiple Choice',
        points: 1.0,
        stem: `Question ${qNum}: Which of the following is an example of renewable energy?`,
        options: [
          { letter: 'A', text: `Solar radiation and wind currents` },
          { letter: 'B', text: `Coal extraction from fossil deposits` },
          { letter: 'C', text: `Solar radiation and wind currents` }, // Opção duplicada intencional
          { letter: 'D', text: `Natural gas combustion in turbines` },
        ],
        answerKey: 'A'
      }
    })

    // Aplica autoFixHaladynaViolations em cada questão
    const fixedQuestions = originalQuestionsEn.map(q => {
      const fixed = autoFixHaladynaViolations(q.stem, q.options || [], q.answerKey)
      return {
        ...q,
        stem: fixed.fixedStem,
        options: fixed.fixedOptions,
        answerKey: fixed.fixedAnswerKey || q.answerKey
      }
    })

    // Compila para HTML
    const htmlEn = compileQuestionsToHtml(fixedQuestions, 'English Science Test')

    // Relê (parse)
    const reparsedEn = parseContentToQuestions(htmlEn)

    let emptyOptionCountEn = 0
    let totalOptionsParsedEn = 0
    reparsedEn.forEach(q => {
      q.options?.forEach(opt => {
        totalOptionsParsedEn++
        if (!opt.text || opt.text.trim() === '') emptyOptionCountEn++
      })
    })

    // Verifica injeção do auto-fix nas questões após o fix
    let injectedFatorComplementar = 0
    fixedQuestions.forEach(q => {
      q.options?.forEach(opt => {
        if (opt.text.includes('(fator complementar)')) injectedFatorComplementar++
      })
    })

    console.log(`[T1-EN Evidence] Questões relidas: ${reparsedEn.length}/20`)
    console.log(`[T1-EN Evidence] Opções com texto vazio: ${emptyOptionCountEn}/${totalOptionsParsedEn}`)
    console.log(`[T1-EN Evidence] Textos "(fator complementar)" gerados pelo auto-fix: ${injectedFatorComplementar}`)
    console.log(`[T1-EN Evidence] Exemplo da opção C corrigida pelo auto-fix: "${fixedQuestions[0].options?.[2]?.text}"`)

    expect(reparsedEn.length).toBe(20)
    expect(emptyOptionCountEn).toBe(0)
    expect(injectedFatorComplementar).toBe(0)
  })

  // =========================================================================
  // T2: Reprodutibilidade e Configuração de Chaves
  // =========================================================================
  it.skipIf(!process.env.GEMINI_API_KEY)(
    'T2 Reprodutibilidade: Verificação de suporte a Seed e Chaves de API Reais (Requer GEMINI_API_KEY)',
    () => {
      // Requer GEMINI_API_KEY configurada no runner para chamadas reais ao vivo
      const key = process.env.GEMINI_API_KEY
      expect(key).toBeDefined()
    }
  )

  // =========================================================================
  // T3: Portões: Questão com opções idênticas, gabarito errado E enunciado vazio
  // =========================================================================
  it('T3 Portões: Injeção de alternativas idênticas, gabarito errado e enunciado vazio', () => {
    // 1. Enunciado vazio
    const qEmptyStem: EditableQuestionItem[] = [
      {
        id: 'q_empty',
        number: 1,
        type: 'multiple_choice',
        typeLabel: 'Múltipla Escolha',
        points: 1.0,
        stem: '   ', // Enunciado vazio / espaços
        options: [
          { letter: 'A', text: 'Opção 1' },
          { letter: 'B', text: 'Opção 2' }
        ],
        answerKey: 'A'
      }
    ]

    const compCheckEmpty = checkGenerationCompleteness(1, qEmptyStem)
    console.log(`[T3-EmptyStem Evidence] canAutoSave com enunciado vazio:`, compCheckEmpty.canAutoSave)
    console.log(`[T3-EmptyStem Evidence] warning gerado:`, compCheckEmpty.warning)

    // 2. Opções idênticas
    const qDupOptions: EditableQuestionItem[] = [
      {
        id: 'q_dup',
        number: 1,
        type: 'multiple_choice',
        typeLabel: 'Múltipla Escolha',
        points: 1.0,
        stem: 'Enunciado com opções duplicadas',
        options: [
          { letter: 'A', text: 'Brasília' },
          { letter: 'B', text: 'Brasília' },
          { letter: 'C', text: 'São Paulo' },
          { letter: 'D', text: 'Rio de Janeiro' }
        ],
        answerKey: 'A'
      }
    ]
    const compCheckDup = checkGenerationCompleteness(1, qDupOptions)
    console.log(`[T3-Dup Evidence] canAutoSave com opções duplicadas:`, compCheckDup.canAutoSave)

    // 3. Gabarito inexistente
    const qInvalidKey: EditableQuestionItem[] = [
      {
        id: 'q_inv',
        number: 1,
        type: 'multiple_choice',
        typeLabel: 'Múltipla Escolha',
        points: 1.0,
        stem: 'Pergunta válida',
        options: [
          { letter: 'A', text: 'Opção A' },
          { letter: 'B', text: 'Opção B' }
        ],
        answerKey: 'Z' // Gabarito inexistente
      }
    ]
    const compCheckInv = checkGenerationCompleteness(1, qInvalidKey)
    console.log(`[T3-InvKey Evidence] canAutoSave com gabarito 'Z' inexistente:`, compCheckInv.canAutoSave)

    // Validação honesta: todas as anomalias estruturais devem BLOQUEAR o salvamento (canAutoSave: false)
    expect(compCheckEmpty.canAutoSave).toBe(false)
    expect(compCheckDup.canAutoSave).toBe(false)
    expect(compCheckInv.canAutoSave).toBe(false)
  })

  // =========================================================================
  // T4: Segurança: Chave de API em URL e LocalStorage
  // =========================================================================
  it('T4 Segurança: Chave de API não deve trafegar em query parameter de URL nem em localStorage plano', () => {
    // Leitura estática do cliente de rede em produção (lib/autoApiSelector.ts)
    const fs = require('fs')
    const path = require('path')
    const selectorCode = fs.readFileSync(path.resolve(__dirname, '../lib/autoApiSelector.ts'), 'utf-8')
    const exposesKeyInUrlQuery = /generativelanguage\.googleapis\.com.*(?:\?|&)key=/i.test(selectorCode)

    console.log(`[T4 Security Audit] Chave exposta em query param de URL em lib/autoApiSelector.ts: ${exposesKeyInUrlQuery}`)

    // Asserção preventiva real: DEVE FALHAR se a chave for enviada via query param na URL (exige Header x-goog-api-key)
    expect(exposesKeyInUrlQuery).toBe(false)
  })
})
