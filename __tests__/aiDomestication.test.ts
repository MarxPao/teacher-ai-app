import { describe, test, expect, beforeEach } from 'vitest'
import {
  calculateDynamicTokens,
  resolveTemperature,
  TEMPERATURE_MODE_MAP,
  TemperatureMode
} from '@/lib/tokenOptimizer'

import {
  validateReportGrounding,
  GroundTruthData
} from '@/lib/reportGroundingValidator'
import {
  computeOcrConfidence
} from '@/lib/ocrCapture'
import {
  logAiCall,
  getAuditLog,
  clearAuditLog,
  getFlaggedEntries,
  summarize
} from '@/lib/aiAuditLog'

describe('DOMESTICAÇÃO DE IA — BLOCO 3: Sistema de Temperatura Explícito', () => {
  test('resolveTemperature retorna valores calibrados por modo', () => {
    expect(resolveTemperature('deterministic')).toBe(0.05)
    expect(resolveTemperature('balanced')).toBe(0.4)
    expect(resolveTemperature('creative')).toBe(0.75)
  })

  test('calculateDynamicTokens respeita temperatureMode explícito com prioridade', () => {
    const resDet = calculateDynamicTokens('Gere uma prova completa de inglês', 'deterministic')
    expect(resDet.temperature).toBe(0.05)

    const resBal = calculateDynamicTokens('Crie um plano de aula detalhado', 'balanced')
    expect(resBal.temperature).toBe(0.4)

    const resCre = calculateDynamicTokens('adicionar tarefa na agenda', 'creative')
    expect(resCre.temperature).toBe(0.75)
  })

  test('calculateDynamicTokens usa fallback de regex apenas quando modo não especificado', () => {
    const fallbackShort = calculateDynamicTokens('adicione uma nota')
    expect(fallbackShort.temperature).toBe(0.3)

    const fallbackGen = calculateDynamicTokens('monte uma prova bimestral')
    expect(fallbackGen.temperature).toBe(0.7)

    const fallbackChat = calculateDynamicTokens('qual é a melhor metodologia para ensinar past perfect?')
    expect(fallbackChat.temperature).toBe(0.6)
  })

  test('TEMPERATURE_MODE_MAP classifica corretamente todos os módulos críticos 🔴 como deterministic', () => {
    expect(TEMPERATURE_MODE_MAP['OmniGrader']).toBe('deterministic')
    expect(TEMPERATURE_MODE_MAP['BatchGrader']).toBe('deterministic')
    expect(TEMPERATURE_MODE_MAP['OcrCapture']).toBe('deterministic')
    expect(TEMPERATURE_MODE_MAP['MeetingClassRecorder']).toBe('deterministic')
    expect(TEMPERATURE_MODE_MAP['RafinhaPortalAction']).toBe('deterministic')
  })

  test('TEMPERATURE_MODE_MAP classifica módulos de parecer/diagnóstico 🟡 como balanced', () => {
    expect(TEMPERATURE_MODE_MAP['AutoReport']).toBe('balanced')
    expect(TEMPERATURE_MODE_MAP['ProgressTracker']).toBe('balanced')
    expect(TEMPERATURE_MODE_MAP['ParentCommunicator']).toBe('balanced')
  })
})

describe('DOMESTICAÇÃO DE IA — BLOCO 2: Validação Cruzada de Pareceres (Grounding)', () => {
  const groundTruth: GroundTruthData = {
    className: '9º Ano A - Inglês',
    avgAttendance: 87.5,
    highlightStudentNames: ['Mariana Silva', 'Lucas Oliveira'],
    attentionStudentNames: ['Bruno Santos'],
    studentCount: 25,
    month: '2026-08',
  }

  test('Aprova parecer perfeitamente embasado nos dados reais', () => {
    const goodReport = `
PARECER PEDAGÓGICO - TURMA: 9º Ano A - Inglês
No mês de 2026-08, a turma apresentou frequência média de 88.0% (assiduidade satisfatória).
Os alunos em destaque foram Mariana Silva e Lucas Oliveira com excelente participação.
O aluno Bruno Santos requer atenção quanto à entrega das produções textuais.
`
    const result = validateReportGrounding(goodReport, groundTruth)
    expect(result.isValid).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  test('Detecta divergência grave de frequência média e gera violação', () => {
    const hallucinatedReport = `
PARECER PEDAGÓGICO - TURMA: 9º Ano A - Inglês
A taxa média de frequência da turma foi de 62.0% neste período, indicando alta evasão.
`
    const result = validateReportGrounding(hallucinatedReport, groundTruth)
    expect(result.isValid).toBe(false)
    expect(result.violations.length).toBeGreaterThan(0)
    expect(result.violations[0].expected).toContain('87.5%')
    expect(result.violations[0].found).toContain('62.0%')
  })

  test('Detecta alucinação de alunos em destaque quando banco não tem nenhum', () => {
    const noHighlightsTruth: GroundTruthData = {
      ...groundTruth,
      highlightStudentNames: []
    }
    const fakeHighlightsReport = `
PARECER PEDAGÓGICO - TURMA: 9º Ano A - Inglês
Destaques: Carlos Andrade, Fernanda Costa demonstraram liderança.
`
    const result = validateReportGrounding(fakeHighlightsReport, noHighlightsTruth)
    expect(result.isValid).toBe(false)
    expect(result.violations.some(v => v.found.includes('Carlos Andrade'))).toBe(true)
  })

  test('Detecta menção a turma divergente do contexto selecionado', () => {
    const wrongClassReport = `
PARECER PEDAGÓGICO - Turma: 6º Ano B - Espanhol
Frequência média de 87.5%.
`
    const result = validateReportGrounding(wrongClassReport, groundTruth)
    expect(result.isValid).toBe(false)
    expect(result.violations.some(v => v.expected.includes('9º Ano A - Inglês'))).toBe(true)
  })
})

describe('DOMESTICAÇÃO DE IA — BLOCO 4: OCR Confidence Score', () => {
  test('Retorna alta confiança para texto claro e legível', () => {
    const cleanOcrText = 'Complete the sentences below using the simple past tense of the verbs in brackets.'
    const conf = computeOcrConfidence(cleanOcrText)
    expect(conf.lowConfidence).toBe(false)
    expect(conf.ratio).toBeGreaterThan(0.85)
    expect(conf.warning).toBeUndefined()
  })

  test('Retorna baixa confiança e warning para texto ruidoso com caracteres ilegíveis', () => {
    const noisyText = 'Th?? is ?? me?? ??? □□□ ??? illegible w??rd'
    const conf = computeOcrConfidence(noisyText)
    expect(conf.lowConfidence).toBe(true)
    expect(conf.ratio).toBeLessThan(0.80)
    expect(conf.warning).toBeDefined()
    expect(conf.warning).toContain('⚠️')
  })

  test('Sinaliza baixa confiança para texto vazio ou extremamente curto', () => {
    const emptyConf = computeOcrConfidence('abc')
    expect(emptyConf.lowConfidence).toBe(true)
    expect(emptyConf.ratio).toBe(0)
  })
})

describe('DOMESTICAÇÃO DE IA — BLOCO 0 & 5: Trilha de Auditoria Transversal', () => {
  beforeEach(() => {
    clearAuditLog()
  })

  test('Registra chamada de IA e recupera no log de auditoria', () => {
    const entry = logAiCall({
      module: 'OmniGrader',
      temperatureUsed: 0.05,
      promptSummary: summarize('Aluno: João Silva | Redação Cambridge'),
      rawResponseSummary: summarize('{"content":{"score":4.5}}'),
      parsedResult: JSON.stringify({ score: 4.5 }),
      flagged: false
    })

    expect(entry.id).toBeDefined()
    expect(entry.timestamp).toBeDefined()

    const logs = getAuditLog()
    expect(logs.length).toBeGreaterThanOrEqual(1)
    expect(logs[0].module).toBe('OmniGrader')
    expect(logs[0].temperatureUsed).toBe(0.05)
  })

  test('Filtra corretamente entradas sinalizadas com flag de revisão', () => {
    logAiCall({
      module: 'BatchGrader',
      temperatureUsed: 0.05,
      promptSummary: 'Aluno 1',
      rawResponseSummary: '{"grade":8.5}',
      parsedResult: '{"grade":8.5}',
      flagged: false
    })

    logAiCall({
      module: 'BatchGrader',
      temperatureUsed: 0.05,
      promptSummary: 'Aluno 2 (texto vazio)',
      rawResponseSummary: '{"extractedAnswer": null}',
      parsedResult: '{"needsReview": true}',
      flagged: true,
      flagReason: 'Passo A: conteúdo ambíguo ou ilegível'
    })

    const flagged = getFlaggedEntries()
    expect(flagged).toHaveLength(1)
    expect(flagged[0].flagReason).toContain('Passo A')
  })

  test('Limpeza de logs (purge) remove todos os registros', () => {
    logAiCall({
      module: 'AutoReport',
      temperatureUsed: 0.4,
      promptSummary: 'Turma 9A',
      rawResponseSummary: 'Parecer gerado',
      parsedResult: '{"valid": true}',
      flagged: false
    })

    clearAuditLog()
    expect(getAuditLog()).toHaveLength(0)
  })
})
