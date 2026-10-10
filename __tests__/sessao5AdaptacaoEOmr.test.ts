import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  buildAdaptationInput,
  buildAdaptiveBlueprintSection,
  buildAdaptivePromptEntry,
  assembleBlueprintPromptWithAdaptation,
  getPastClassAdaptationFromStorage,
  RawExamRecordInput,
  AdaptationThresholds,
  AdaptationInputResult
} from '@/lib/classSkillAdaptationEngine'
import {
  recordOmrItemResponsesToQuestionBank,
  syncOmrLayoutWithItemIds,
  OmrItemResponsesBatchInput
} from '@/lib/omrItemPsychometricsBridge'

let localStorageStore: Record<string, string> = {}

beforeEach(() => {
  localStorageStore = {}
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => localStorageStore[key] ?? null,
    setItem: (key: string, val: string) => { localStorageStore[key] = String(val) },
    removeItem: (key: string) => { delete localStorageStore[key] },
    clear: () => { localStorageStore = {} }
  })
})

/**
 * SESSÃO 5 — ADAPTAÇÃO POR TURMA E OMR ATÉ O ITEM
 *
 * T1: Função pura buildAdaptationInput(...) com k mínimo = 5, cortes configuráveis
 *     (padrão 60% e 75%), supressão de grupos < k e Zero PII (varredura de JSON).
 * T2: Integração ao blueprint (opt-in) com pré-visualização explicativa e teste de mutação.
 * T3: OMR até o item com persistência de itemIds e gravação no QuestionBank via
 *     psychometricsEngine, mantendo rótulo 'estimativa a priori' quando N < 10.
 */

describe('SESSÃO 5 — T1: Função Pura buildAdaptationInput (k-anonimato e Zero PII)', () => {
  it('T1.1 Suprime turmas com menos de k alunos (k=5 padrão; turma de 3 alunos é suprimida)', () => {
    const rawRecords: RawExamRecordInput[] = [
      { studentId: 'student_001', classId: 'turma_pequena', score: 7.0, skillCodes: ['EF07CI07'] },
      { studentId: 'student_002', classId: 'turma_pequena', score: 5.0, skillCodes: ['EF07CI07'] },
      { studentId: 'student_003', classId: 'turma_pequena', score: 6.0, skillCodes: ['EF07CI07'] },
    ]

    const result = buildAdaptationInput(rawRecords, 'turma_pequena')

    // Deve ser estritamente suprimido por não atingir k=5
    expect(result.isSuppressed).toBe(true)
    expect(result.suppressionReason).toMatch(/k-anonimato|amostra insuficiente/i)
    expect(result.totalEvaluatedStudents).toBe(0)
    expect(result.criticalSkillGaps).toHaveLength(0)
    expect(result.solidSkills).toHaveLength(0)
    expect(result.suggestedRemediationFocus).toHaveLength(0)
  })

  it('T1.2 Agrega turma com k >= 5 alunos, calculando cortes configuráveis (60% padrão defasagem, 75% domínio)', () => {
    // 6 alunos distintos
    const rawRecords: RawExamRecordInput[] = [
      // Habilidade A (EF07CI07): notas baixas -> média 4.0 (40% domínio -> defasagem < 60%)
      { studentId: 'stu_1', classId: 'turma_regular', score: 4.0, maxScore: 10, skillCodes: ['EF07CI07'] },
      { studentId: 'stu_2', classId: 'turma_regular', score: 3.5, maxScore: 10, skillCodes: ['EF07CI07'] },
      { studentId: 'stu_3', classId: 'turma_regular', score: 4.5, maxScore: 10, skillCodes: ['EF07CI07'] },
      { studentId: 'stu_4', classId: 'turma_regular', score: 4.0, maxScore: 10, skillCodes: ['EF07CI07'] },
      { studentId: 'stu_5', classId: 'turma_regular', score: 3.0, maxScore: 10, skillCodes: ['EF07CI07'] },
      { studentId: 'stu_6', classId: 'turma_regular', score: 5.0, maxScore: 10, skillCodes: ['EF07CI07'] },

      // Habilidade B (EF07CI08): notas altas -> média 8.5 (85% domínio -> consolidado >= 75%)
      { studentId: 'stu_1', classId: 'turma_regular', score: 9.0, maxScore: 10, skillCodes: ['EF07CI08'] },
      { studentId: 'stu_2', classId: 'turma_regular', score: 8.0, maxScore: 10, skillCodes: ['EF07CI08'] },
      { studentId: 'stu_3', classId: 'turma_regular', score: 8.5, maxScore: 10, skillCodes: ['EF07CI08'] },
      { studentId: 'stu_4', classId: 'turma_regular', score: 8.0, maxScore: 10, skillCodes: ['EF07CI08'] },
      { studentId: 'stu_5', classId: 'turma_regular', score: 9.0, maxScore: 10, skillCodes: ['EF07CI08'] },
      { studentId: 'stu_6', classId: 'turma_regular', score: 8.5, maxScore: 10, skillCodes: ['EF07CI08'] },
    ]

    const result = buildAdaptationInput(rawRecords, 'turma_regular')

    expect(result.isSuppressed).toBe(false)
    expect(result.totalEvaluatedStudents).toBe(6)

    // Confere lacunas críticas (< 60%)
    expect(result.criticalSkillGaps).toHaveLength(1)
    expect(result.criticalSkillGaps[0].skillCode).toBe('EF07CI07')
    expect(result.criticalSkillGaps[0].masteryRate).toBeLessThan(0.60)
    expect(result.suggestedRemediationFocus).toContain('EF07CI07')

    // Confere habilidades sólidas (>= 75%)
    expect(result.solidSkills).toHaveLength(1)
    expect(result.solidSkills[0].skillCode).toBe('EF07CI08')
    expect(result.solidSkills[0].masteryRate).toBeGreaterThanOrEqual(0.75)
  })

  it('T1.3 Suporta cortes e limiar k configuráveis pelo usuário', () => {
    const rawRecords: RawExamRecordInput[] = [
      { studentId: 'stu_1', classId: 'turma_custom', score: 5.5, maxScore: 10, skillCodes: ['SKILL_X'] },
      { studentId: 'stu_2', classId: 'turma_custom', score: 5.5, maxScore: 10, skillCodes: ['SKILL_X'] },
      { studentId: 'stu_3', classId: 'turma_custom', score: 5.5, maxScore: 10, skillCodes: ['SKILL_X'] },
      { studentId: 'stu_4', classId: 'turma_custom', score: 5.5, maxScore: 10, skillCodes: ['SKILL_X'] },
    ]

    // Com k=5 (padrão), 4 alunos seriam suprimidos:
    const defaultRes = buildAdaptationInput(rawRecords, 'turma_custom')
    expect(defaultRes.isSuppressed).toBe(true)

    // Com k=4 customizado e corte de remediação a 50%, média 55% não é lacuna:
    const customRes = buildAdaptationInput(rawRecords, 'turma_custom', {
      minGroupSizeK: 4,
      remediationCutoff: 0.50,
      solidCutoff: 0.80
    })
    expect(customRes.isSuppressed).toBe(false)
    expect(customRes.totalEvaluatedStudents).toBe(4)
    expect(customRes.criticalSkillGaps).toHaveLength(0) // 55% >= 50%
  })

  it('T1.4 Zero PII: varre o JSON de saída e garante ausência total de IDs e nomes de entrada', () => {
    const sensitiveStudentIds = [
      'aluno_cpf_11122233344_joao_silva',
      'aluno_matricula_987654_maria_santos',
      'aluno_sigiloso_ana_clara_oliveira',
      'aluno_id_pedro_henrique_albuquerque',
      'aluno_identificador_lucas_gabriel'
    ]

    const rawRecords: RawExamRecordInput[] = sensitiveStudentIds.map(id => ({
      studentId: id,
      classId: 'turma_segura',
      score: 4.0,
      maxScore: 10,
      skillCodes: ['BNCC_EF09MA01']
    }))

    const result = buildAdaptationInput(rawRecords, 'turma_segura')
    const jsonOutput = JSON.stringify(result)

    // O JSON serializado NUNCA deve conter nenhum dos IDs ou fragmentos de nomes sensíveis
    for (const sensitiveId of sensitiveStudentIds) {
      expect(jsonOutput).not.toContain(sensitiveId)
      const nameParts = sensitiveId.split('_')
      for (const part of nameParts) {
        if (part.length > 3) {
          expect(jsonOutput).not.toContain(part)
        }
      }
    }
  })
})

describe('SESSÃO 5 — T2: Ligação ao Blueprint de TestAndWorksheets (Opt-in e Pré-Visualização)', () => {
  it('T2.1 Quando opt-in é false ou grupo suprimido, não gera modificações no blueprint', () => {
    const adaptationData = buildAdaptationInput([
      { studentId: 's1', classId: 't1', score: 3, skillCodes: ['EF01'] },
      { studentId: 's2', classId: 't1', score: 3, skillCodes: ['EF01'] },
      { studentId: 's3', classId: 't1', score: 3, skillCodes: ['EF01'] },
      { studentId: 's4', classId: 't1', score: 3, skillCodes: ['EF01'] },
      { studentId: 's5', classId: 't1', score: 3, skillCodes: ['EF01'] },
    ], 't1')

    const baseBlueprint = {
      title: 'Avaliação de Ciências',
      totalQuestions: 10,
      topics: ['Ecologia']
    }

    // Opt-in desligado
    const resOptOut = buildAdaptiveBlueprintSection(baseBlueprint, adaptationData, false)
    expect(resOptOut.hasAdaptations).toBe(false)
    expect(resOptOut.promptSection).toBe('')
    expect(resOptOut.allocatedSkills).toHaveLength(0)

    // Grupo suprimido mesmo com opt-in ligado
    const suppressedData = buildAdaptationInput([], 't_vazia')
    const resSuppressed = buildAdaptiveBlueprintSection(baseBlueprint, suppressedData, true)
    expect(resSuppressed.hasAdaptations).toBe(false)
    expect(resSuppressed.promptSection).toBe('')
  })

  it('T2.2 Quando opt-in é true, aloca itens adicionais e gera pré-visualização explicando o motivo', () => {
    const rawRecords: RawExamRecordInput[] = [
      { studentId: 's1', classId: 't1', score: 3, skillCodes: ['EF07CI07'] },
      { studentId: 's2', classId: 't1', score: 4, skillCodes: ['EF07CI07'] },
      { studentId: 's3', classId: 't1', score: 4, skillCodes: ['EF07CI07'] },
      { studentId: 's4', classId: 't1', score: 5, skillCodes: ['EF07CI07'] },
      { studentId: 's5', classId: 't1', score: 3, skillCodes: ['EF07CI07'] },
    ]
    const adaptationData = buildAdaptationInput(rawRecords, 't1')

    const baseBlueprint = {
      title: 'Avaliação Trimestral',
      totalQuestions: 10,
      topics: ['Ecossistemas']
    }

    const res = buildAdaptiveBlueprintSection(baseBlueprint, adaptationData, true)

    expect(res.hasAdaptations).toBe(true)
    expect(res.allocatedSkills).toHaveLength(1)
    expect(res.allocatedSkills[0].skillCode).toBe('EF07CI07')
    expect(res.allocatedSkills[0].extraItems).toBeGreaterThan(0)
    // A pré-visualização deve explicar explicitamente a taxa de domínio observada
    expect(res.previewText).toContain('EF07CI07')
    expect(res.previewText).toMatch(/domínio|defasagem|reforço/i)
    expect(res.allocatedSkills[0].reason).toMatch(/abaixo do corte|defasagem/i)
    // O texto do prompt deve instruir o gerador a reforçar a habilidade
    expect(res.promptSection).toContain('DIRETRIZ DE REFORÇO ADAPTATIVO')
    expect(res.promptSection).toContain('EF07CI07')
  })

  it('T2.3 Montagem da entrada do prompt com blueprint adaptativo (e prova de mutação caso a chamada seja omitida)', () => {
    const baseBlueprintPrompt = '=== MATRIZ DE ESPECIFICAÇÃO DA PROVA ===\n• Questão 1: [Tópico: Ecologia]'
    const baseBlueprint = { title: 'Avaliação Trimestral', totalQuestions: 10 }
    const adaptationData = buildAdaptationInput([
      { studentId: 's1', classId: 't1', score: 3, skillCodes: ['EF07CI07'] },
      { studentId: 's2', classId: 't1', score: 4, skillCodes: ['EF07CI07'] },
      { studentId: 's3', classId: 't1', score: 4, skillCodes: ['EF07CI07'] },
      { studentId: 's4', classId: 't1', score: 5, skillCodes: ['EF07CI07'] },
      { studentId: 's5', classId: 't1', score: 3, skillCodes: ['EF07CI07'] },
    ], 't1')

    // Execução legítima com chamada ativa
    const activeResult = buildAdaptivePromptEntry(baseBlueprintPrompt, baseBlueprint, adaptationData, true)
    expect(activeResult.fullBlueprintPrompt).toContain('=== MATRIZ DE ESPECIFICAÇÃO DA PROVA ===')
    expect(activeResult.fullBlueprintPrompt).toContain('DIRETRIZ DE REFORÇO ADAPTATIVO')
    expect(activeResult.fullBlueprintPrompt).toContain('EF07CI07')
    expect(activeResult.adaptiveOutput.hasAdaptations).toBe(true)

    // Mutação Simulada: remover a chamada adaptativa (passando isOptIn=false ou omitindo a diretriz)
    const mutatedOmitResult = buildAdaptivePromptEntry(baseBlueprintPrompt, baseBlueprint, adaptationData, false)
    // Sem a chamada ativa, a diretriz é omitida e o prompt permanece o blueprint original
    expect(mutatedOmitResult.fullBlueprintPrompt).not.toContain('DIRETRIZ DE REFORÇO ADAPTATIVO')
    expect(mutatedOmitResult.fullBlueprintPrompt).toBe(baseBlueprintPrompt)
    expect(mutatedOmitResult.adaptiveOutput.hasAdaptations).toBe(false)
  })

  it('T2.4 getPastClassAdaptationFromStorage recupera notas da turma com k-anonimato direto do storage', () => {
    // Configura localStorage mock com 6 alunos e defasagem em EF09MA01
    const mockStorageRecords = [
      { studentId: 'a1', classId: '9A', score: 3, skillCodes: ['EF09MA01'] },
      { studentId: 'a2', classId: '9A', score: 4, skillCodes: ['EF09MA01'] },
      { studentId: 'a3', classId: '9A', score: 4, skillCodes: ['EF09MA01'] },
      { studentId: 'a4', classId: '9A', score: 5, skillCodes: ['EF09MA01'] },
      { studentId: 'a5', classId: '9A', score: 3, skillCodes: ['EF09MA01'] },
      { studentId: 'a6', classId: '9A', score: 4, skillCodes: ['EF09MA01'] },
    ]
    localStorage.setItem('teacher_gradebook_v2', JSON.stringify(mockStorageRecords))

    const result = getPastClassAdaptationFromStorage('9A')
    expect(result).not.toBeNull()
    expect(result?.isSuppressed).toBe(false)
    expect(result?.totalEvaluatedStudents).toBe(6)
    expect(result?.suggestedRemediationFocus).toContain('EF09MA01')

    // Turma com menos de k=5 alunos deve vir suprimida
    const smallClassRecords = [
      { studentId: 'a1', classId: '9B', score: 3, skillCodes: ['EF09MA01'] },
      { studentId: 'a2', classId: '9B', score: 4, skillCodes: ['EF09MA01'] },
    ]
    localStorage.setItem('teacher_gradebook_v2', JSON.stringify(smallClassRecords))
    const smallResult = getPastClassAdaptationFromStorage('9B')
    expect(smallResult?.isSuppressed).toBe(true)
  })
})

describe('SESSÃO 5 — T3: OMR até o Item e Integração com QuestionBank via PsychometricsEngine', () => {
  it('T3.1 syncOmrLayoutWithItemIds preserva lista ordenada de itemIds no layout de prova', () => {
    const parsedQuestionsMock = [
      { id: 'item_ciencias_101', answerKey: 'A', stem: 'Questão 1' },
      { id: 'item_ciencias_102', answerKey: 'C', stem: 'Questão 2' },
      { id: 'item_ciencias_103', answerKey: 'D', stem: 'Questão 3' },
    ]

    const layout = syncOmrLayoutWithItemIds({
      examTitle: 'Simulado de Ciências',
      questions: parsedQuestionsMock as any
    })

    expect(layout.totalQuestions).toBe(3)
    expect(layout.answerKeyString).toBe('1:A;2:C;3:D')
    expect(layout.itemIds).toEqual(['item_ciencias_101', 'item_ciencias_102', 'item_ciencias_103'])
  })

  it('T3.2 Itens com menos de 10 respostas de alunos continuam rotulados como "estimativa a priori"', () => {
    const input: OmrItemResponsesBatchInput = {
      itemIds: ['item_novo_01'],
      studentResponses: [
        { studentId: 'aluno_1', answers: { '1': 'A' } },
        { studentId: 'aluno_2', answers: { '1': 'B' } },
        { studentId: 'aluno_3', answers: { '1': 'A' } },
        { studentId: 'aluno_4', answers: { '1': 'A' } }, // 4 respostas (3 acertos, 1 erro)
      ],
      answerKey: { '1': 'A' },
      existingBankItems: [
        {
          id: 'item_novo_01',
          statement: 'Enunciado do item novo',
          difficulty: 'medium',
          calibrationStatus: 'seed_a_priori',
          calibrationLabel: 'estimativa a priori',
          empiricalResponsesCount: 0
        } as any
      ]
    }

    const updatedBank = recordOmrItemResponsesToQuestionBank(input)

    expect(updatedBank).toHaveLength(1)
    const item = updatedBank[0]
    expect(item.empiricalResponsesCount).toBe(4)
    // N < 10: continua com status e rótulo "estimativa a priori"
    expect(item.calibrationStatus).toBe('seed_a_priori')
    expect(item.calibrationLabel).toMatch(/estimativa a priori/i)
  })

  it('T3.3 Quando o item atinge N >= 10 respostas, calibra empiricamente via psychometricsEngine', () => {
    // 12 alunos respondendo ao item_maturidade
    const studentResponses = Array.from({ length: 12 }, (_, i) => ({
      studentId: `student_${i + 1}`,
      answers: { '1': i < 9 ? 'C' : 'A' } // 9 acertos em 12 (p-value = 0.75)
    }))

    const input: OmrItemResponsesBatchInput = {
      itemIds: ['item_maturidade'],
      studentResponses,
      answerKey: { '1': 'C' },
      existingBankItems: [
        {
          id: 'item_maturidade',
          statement: 'Enunciado de matemática',
          difficulty: 'hard',
          calibrationStatus: 'seed_a_priori',
          calibrationLabel: 'estimativa a priori',
          empiricalResponsesCount: 0
        } as any
      ]
    }

    const updatedBank = recordOmrItemResponsesToQuestionBank(input)

    expect(updatedBank).toHaveLength(1)
    const item = updatedBank[0]
    expect(item.empiricalResponsesCount).toBe(12)
    // N >= 10: promovido para calibração empírica real
    expect(item.calibrationStatus).toBe('empirical_calibrated')
    expect(item.calibrationLabel).toMatch(/calibrado empiricamente/i)
    expect(item.empiricalDifficulty).toBeDefined()
    expect(typeof item.empiricalPValue).toBe('number')
  })
})
