import { describe, it, expect } from 'vitest'
import { calculateGradeDispersion } from '../lib/classUtils'

describe('Cálculo de Dispersão Estatística de Notas da Turma (Modo B)', () => {
  it('calcula media, variancia e desvio padrao com precisao para conjunto de notas', () => {
    const result = calculateGradeDispersion([6, 8, 7, 7])
    expect(result.mean).toBe(7.0)
    expect(result.variance).toBeCloseTo(0.5, 2)
    expect(result.stdDev).toBeCloseTo(0.707, 2)
    expect(result.isHomogeneous).toBe(true)
  })

  it('classifica como nao homogenea quando o desvio padrao e elevado (>= 2.0)', () => {
    const result = calculateGradeDispersion([2, 10, 3, 9])
    expect(result.mean).toBe(6.0)
    expect(result.stdDev).toBeGreaterThanOrEqual(2.0)
    expect(result.isHomogeneous).toBe(false)
  })

  it('lida graciosamente com lista vazia ou notas invalidas', () => {
    const resultEmpty = calculateGradeDispersion([])
    expect(resultEmpty.mean).toBe(0)
    expect(resultEmpty.stdDev).toBe(0)
    expect(resultEmpty.isHomogeneous).toBe(true)

    const resultNaN = calculateGradeDispersion([NaN, -1, 15] as any)
    expect(resultNaN.mean).toBe(0)
    expect(resultNaN.stdDev).toBe(0)
  })
})
