import { describe, it, expect } from 'vitest'
import {
  autoFixHaladynaViolations,
  auditHaladynaGuidelines
} from '@/lib/haladynaLinter'

describe('LOTE B — B1: Correções Determinísticas Estritas em haladynaLinter sem Injeção nem Mutilação', () => {
  it('não deve truncar nem mutilar o texto de opções prolixas (LENGTH_CLUEING), preservando o texto e retendo a violação para o portão', () => {
    const stem = 'Qual é a principal função dos ribossomos nas células eucarióticas?'
    const verboseOption = 'Realizar a síntese proteica celular. Essa função ocorre através da tradução do RNA mensageiro em cadeias polipeptídicas no citoplasma celular.'
    const options = [
      { letter: 'A', text: 'Produzir energia celular.' },
      { letter: 'B', text: 'Armazenar lipídios.' },
      { letter: 'C', text: verboseOption },
      { letter: 'D', text: 'Degradar toxinas.' }
    ]

    const initialAudit = auditHaladynaGuidelines(stem, options)
    expect(initialAudit.violations.some(v => v.ruleId === 'LENGTH_CLUEING')).toBe(true)

    const fixed = autoFixHaladynaViolations(stem, options, 'C')

    // Garantia B1: O texto original NÃO pode ter sido truncado ou mutilado na primeira frase
    expect(fixed.fixedOptions[2].text).toBe(verboseOption)
    // Violação que requer reformulação de conteúdo deve ser retida honestamente para regeneração
    expect(fixed.remainingViolations.some(v => v.ruleId === 'LENGTH_CLUEING')).toBe(true)
  })

  it('deve realizar estritamente correções determinísticas: negação em MAIÚSCULAS, anti-cueing e normalização de espaços', () => {
    const stem = 'Assinale a alternativa que não é um exemplo de fonte de energia renovável, exceto se indicado:'
    const options = [
      { letter: 'A', text: 'Energia    solar   fotovoltaica' },
      { letter: 'B', text: 'Energia eólica' },
      { letter: 'C', text: 'Carvão mineral' },
      { letter: 'D', text: 'Biomassa' }
    ]

    const fixed = autoFixHaladynaViolations(stem, options, 'C')

    // Negações em maiúsculas
    expect(fixed.fixedStem).toContain('NÃO')
    expect(fixed.fixedStem).toContain('EXCETO')
    // Normalização determinística de múltiplos espaços
    expect(fixed.fixedOptions[0].text).toBe('Energia solar fotovoltaica')
    expect(fixed.wasModified).toBe(true)
  })

  it('não deve injetar texto sintético nem modificadores inventados em alternativas duplicadas ou todas as anteriores', () => {
    const stem = 'Qual é a velocidade da luz no vácuo?'
    const options = [
      { letter: 'A', text: '300.000 km/s' },
      { letter: 'B', text: '150.000 km/s' },
      { letter: 'C', text: '300.000 km/s' },
      { letter: 'D', text: 'Todas as anteriores' }
    ]

    const fixed = autoFixHaladynaViolations(stem, options, 'A')

    // Nenhuma string inventada
    expect(fixed.fixedOptions[2].text).toBe('300.000 km/s')
    expect(fixed.fixedOptions[3].text).toBe('Todas as anteriores')
    // Ambas as violações críticas permanecem no relatório para bloqueio pelo portão
    expect(fixed.remainingViolations.some(v => v.ruleId === 'REDUNDANT_DISTRACTOR')).toBe(true)
    expect(fixed.remainingViolations.some(v => v.ruleId === 'ALL_NONE_ABOVE')).toBe(true)
  })
})
