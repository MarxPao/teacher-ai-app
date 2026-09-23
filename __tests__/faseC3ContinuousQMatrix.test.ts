import { describe, it, expect } from 'vitest'
import {
  computeContinuousIdealEta,
  calculateDINAProbability,
  evaluateQMatrixEmpiricalFit,
  DINA_THEORETICAL_PRIORS,
  type QMatrixItemEntry
} from '../lib/qMatrixEngine'

describe('Onda C — Fase C3: Q-Matrix Refinada (Pesos Contínuos [0, 1] & Validação Empírica Q-Fit)', () => {

  it('1. calcula resposta ideal contínua (eta_ij) com pesos contínuos ponderando saliência do atributo', () => {
    // Item com peso principal (1.0) e peso secundário (0.3)
    const attributeWeights = {
      'ATTR_MATH_FRACTION_OPS': 1.0,
      'ATTR_PT_SYNTACTIC_REGENCY': 0.3
    }

    // Aluno 1: Domínio total de frações (1.0) e parcial de regência (0.50)
    // eta = 1.0^1.0 * 0.50^0.30 = 1.0 * 0.8123 = 0.8123
    const student1 = {
      'ATTR_MATH_FRACTION_OPS': 1.0,
      'ATTR_PT_SYNTACTIC_REGENCY': 0.50
    }
    const eta1 = computeContinuousIdealEta(student1, attributeWeights)
    expect(eta1).toBeCloseTo(0.8123, 3)

    // Aluno 2: Sem domínio do atributo primário obrigatório (0.0)
    // eta = 0.0^1.0 * ... = 0.0
    const student2 = {
      'ATTR_MATH_FRACTION_OPS': 0.0,
      'ATTR_PT_SYNTACTIC_REGENCY': 1.0
    }
    const eta2 = computeContinuousIdealEta(student2, attributeWeights)
    expect(eta2).toBe(0.0)

    // Aluno 3: Domínio total de ambos (1.0)
    const student3 = {
      'ATTR_MATH_FRACTION_OPS': 1.0,
      'ATTR_PT_SYNTACTIC_REGENCY': 1.0
    }
    const eta3 = computeContinuousIdealEta(student3, attributeWeights)
    expect(eta3).toBe(1.0)
  })

  it('2. interpola suavemente a probabilidade DINA para valores contínuos de eta in [0, 1]', () => {
    const s = 0.10
    const g = 0.20
    // IDI = 0.90 - 0.20 = 0.70

    // Extremos canônicos
    expect(calculateDINAProbability(0.0, s, g)).toBeCloseTo(0.20, 2)
    expect(calculateDINAProbability(1.0, s, g)).toBeCloseTo(0.90, 2)

    // Ponto intermediário: eta = 0.50 -> 0.20 + 0.50 * 0.70 = 0.55
    const probMid = calculateDINAProbability(0.50, s, g)
    expect(probMid).toBeCloseTo(0.55, 2)

    // Ponto eta = 0.80 -> 0.20 + 0.80 * 0.70 = 0.76
    const probHigh = calculateDINAProbability(0.80, s, g)
    expect(probHigh).toBeCloseTo(0.76, 2)
  })

  it('3. avalia o ajuste empírico da Q-Matrix (Q-Fit >= 70%) para item bem especificado', () => {
    const attributeWeights = {
      'ATTR_MATH_FRACTION_OPS': 1.0,
      'ATTR_MATH_COMMON_DENOMINATOR': 0.8
    }

    // Cria 30 alunos cujas respostas são altamente coerentes com os atributos
    const studentResponses = Array.from({ length: 30 }, (_, i) => {
      const hasFractions = i < 24 ? 1.0 : 0.0
      const hasDenom = i < 18 ? 1.0 : 0.0
      // Quem tem ambos acerta quase sempre; quem não tem erra quase sempre
      const isCorrect = (hasFractions === 1.0 && hasDenom === 1.0)
        ? (i % 10 !== 0) // ~90% de acerto
        : (i % 5 === 0)   // ~20% de acerto casual

      return {
        studentId: `aluno_${i + 1}`,
        isCorrect,
        studentAttributes: {
          'ATTR_MATH_FRACTION_OPS': hasFractions,
          'ATTR_MATH_COMMON_DENOMINATOR': hasDenom
        }
      }
    })

    const evaluation = evaluateQMatrixEmpiricalFit({
      itemId: 'q_fracoes_bem_especificada',
      attributeWeights,
      studentResponses,
      minSamples: 10
    })

    expect(evaluation.sampleCount).toBe(30)
    expect(evaluation.fitIndex).toBeGreaterThanOrEqual(0.70)
    expect(evaluation.status).toBe('ajustado')
    expect(evaluation.suggestedAction).toContain('alta aderência empírica')
  })

  it('4. detecta má-especificação da Q-Matrix (Q-Fit < 70%) e recomenda calibrar pesos', () => {
    // Especificação diz que exige fração, mas os dados observados são aleatórios ou invertidos
    const attributeWeights = {
      'ATTR_MATH_FRACTION_OPS': 1.0
    }

    // 25 alunos com respostas completamente discrepantes
    const studentResponses = Array.from({ length: 25 }, (_, i) => ({
      studentId: `aluno_${i + 1}`,
      // Aluno sem o atributo acerta; aluno com o atributo erra
      isCorrect: i >= 15,
      studentAttributes: {
        'ATTR_MATH_FRACTION_OPS': i < 15 ? 1.0 : 0.0
      }
    }))

    const evaluation = evaluateQMatrixEmpiricalFit({
      itemId: 'q_mal_especificada',
      attributeWeights,
      studentResponses,
      minSamples: 10
    })

    expect(evaluation.sampleCount).toBe(25)
    expect(evaluation.fitIndex).toBeLessThan(0.70)
    expect(evaluation.status).toBe('revisar_especificacao')
    expect(evaluation.suggestedAction).toContain('Discrepância detectada')
    expect(evaluation.suggestedAction).toContain('Recomenda-se calibrar os pesos contínuos')
  })

  it('5. aplica gating de suficiência amostral (N < 10) para validação empírica Q-Fit', () => {
    // Apenas 6 respostas
    const studentResponses = Array.from({ length: 6 }, (_, i) => ({
      studentId: `aluno_${i + 1}`,
      isCorrect: i % 2 === 0,
      studentAttributes: { 'ATTR_MATH_FRACTION_OPS': 1.0 }
    }))

    const evaluation = evaluateQMatrixEmpiricalFit({
      itemId: 'q_poucas_respostas',
      attributeWeights: { 'ATTR_MATH_FRACTION_OPS': 1.0 },
      studentResponses,
      minSamples: 10
    })

    expect(evaluation.sampleCount).toBe(6)
    expect(evaluation.status).toBe('insuficiente')
    expect(evaluation.suggestedAction).toContain('Amostra insuficiente para validação empírica da Q-Matrix (N = 6 / 10)')
  })
})
