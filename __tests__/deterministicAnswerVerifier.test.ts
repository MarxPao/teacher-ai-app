import { describe, it, expect } from 'vitest'
import {
  verifySymbolicMath,
  verifyChemicalBalancing,
  verifyPunnettSquare,
  verifyCartographicScale,
  countAtomsInFormula
} from '../lib/deterministicAnswerVerifier'

describe('Pacote 7 — Verificadores Determinísticos Fail-Closed (Sem Alucinação)', () => {
  describe('1. Verificador Simbólico de Matemática & Frações', () => {
    it('comprova equivalência exata e expansão de produtos notáveis', () => {
      // (x + 2)^2 = x^2 + 4x + 4
      const exp1 = verifySymbolicMath('(x + 2)^2', 'x^2 + 4x + 4')
      expect(exp1.correct).toBe(true)
      expect(exp1.message).toContain('Equivalência algébrica')

      // (x - 3)(x + 3) = x^2 - 9
      const exp2 = verifySymbolicMath('(x - 3)(x + 3)', 'x^2 - 9')
      expect(exp2.correct).toBe(true)

      // Fatoração 2(x + 5) = 2x + 10
      const exp3 = verifySymbolicMath('2(x + 5)', '2x + 10')
      expect(exp3.correct).toBe(true)
    })

    it('rejeita com segurança erros conceituais (Sonho do Calouro MAT-MIS-03)', () => {
      // (x + 2)^2 != x^2 + 4 (falta o termo 4x)
      const err = verifySymbolicMath('(x + 2)^2', 'x^2 + 4')
      expect(err.correct).toBe(false)
      expect(err.message).toContain('não é algebricamente equivalente')
    })

    it('avalia equivalência de frações e valores decimais', () => {
      const f1 = verifySymbolicMath('5/6', '10/12')
      expect(f1.correct).toBe(true)

      const f2 = verifySymbolicMath('1/2', '0.5')
      expect(f2.correct).toBe(true)

      const f3 = verifySymbolicMath('1/2', '2/5') // 0.5 vs 0.4
      expect(f3.correct).toBe(false)
    })

    it('avalia soluções de equações de 2º grau incompletas', () => {
      const sol = verifySymbolicMath('x = 3 ou x = -3', '{-3, 3}')
      expect(sol.correct).toBe(true)
    })
  })

  describe('2. Verificador de Balanceamento Químico (Lavoisier)', () => {
    it('faz contagem correta de átomos em fórmulas químicas complexas', () => {
      expect(countAtomsInFormula('H2O')).toEqual({ H: 2, O: 1 })
      expect(countAtomsInFormula('Fe2O3')).toEqual({ Fe: 2, O: 3 })
      expect(countAtomsInFormula('CaCO3')).toEqual({ Ca: 1, C: 1, O: 3 })
    })

    it('aprova reações perfeitamente balanceadas', () => {
      // 4 Fe + 3 O2 -> 2 Fe2O3
      const r1 = verifyChemicalBalancing('4 Fe + 3 O2 -> 2 Fe2O3')
      expect(r1.correct).toBe(true)
      expect(r1.message).toContain('perfeitamente balanceada')

      // Combustão do metano: CH4 + 2 O2 -> CO2 + 2 H2O
      const r2 = verifyChemicalBalancing('CH4 + 2 O2 -> CO2 + 2 H2O')
      expect(r2.correct).toBe(true)

      // Síntese da amônia: N2 + 3 H2 -> 2 NH3
      const r3 = verifyChemicalBalancing('N2 + 3 H2 -> 2 NH3')
      expect(r3.correct).toBe(true)
    })

    it('rejeita reações desbalanceadas apontando discrepâncias exatas por elemento', () => {
      // Fe + O2 -> Fe2O3 (desbalanceada)
      const res = verifyChemicalBalancing('Fe + O2 -> Fe2O3')
      expect(res.correct).toBe(false)
      expect(res.message).toContain('Equação desbalanceada')
      expect(res.details?.discrepancies.length).toBeGreaterThan(0)
    })
  })

  describe('3. Verificador de Genética & Quadro de Punnett', () => {
    it('valida proporções de cruzamento monohíbrido clássico Aa x Aa', () => {
      // Aa x Aa -> 25% AA, 50% Aa, 25% aa
      const cross = verifyPunnettSquare('Aa', 'Aa', {
        'AA': 0.25,
        'Aa': 0.50,
        'aa': 0.25
      })
      expect(cross.correct).toBe(true)
      expect(cross.message).toContain('verificado com sucesso')
    })

    it('valida cruzamento-teste Aa x aa', () => {
      // Aa x aa -> 50% Aa, 50% aa
      const cross = verifyPunnettSquare('Aa', 'aa', {
        'Aa': 0.50,
        'aa': 0.50
      })
      expect(cross.correct).toBe(true)
    })

    it('rejeita proporções genotípicas distorcidas', () => {
      const err = verifyPunnettSquare('Aa', 'Aa', {
        'AA': 0.50,
        'Aa': 0.25,
        'aa': 0.25
      })
      expect(err.correct).toBe(false)
      expect(err.message).toContain('Inconsistência nas proporções')
    })
  })

  describe('4. Verificador de Matemática Cartográfica', () => {
    it('calcula distâncias reais exatas a partir da escala e da régua', () => {
      // 5 cm na escala 1:50.000 = 250.000 cm = 2,5 km
      const c1 = verifyCartographicScale(5, 50000, 2.5)
      expect(c1.correct).toBe(true)
      expect(c1.message).toContain('2.50 km')

      // 8 cm na escala 1:250.000 = 2.000.000 cm = 20 km
      const c2 = verifyCartographicScale(8, 250000, 20.0)
      expect(c2.correct).toBe(true)
    })

    it('rejeita cálculos com ordens de grandeza incorretas', () => {
      // Aluno informou 25 km em vez de 2,5 km (erro de conversão cm -> km)
      const res = verifyCartographicScale(5, 50000, 25)
      expect(res.correct).toBe(false)
      expect(res.message).toContain('esperado 2.50 km, informado 25.00 km')
    })
  })
})
