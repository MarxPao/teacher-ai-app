import { describe, it, expect } from 'vitest'
import { matchStudentByName, normalizeStudentName } from '../lib/studentMatcher'

describe('studentMatcher — Fuzzy Matching & Ambiguity Handling (0-Tester Directives)', () => {
  const testStudents = [
    { id: '1', name: 'Gabriel Silva', class_name: '9º Ano A', school_name: 'Machado Sobrinho' },
    { id: '2', name: 'Gabriela Silva', class_name: '9º Ano B', school_name: 'Machado Sobrinho' },
    { id: '3', name: 'Lucas Santos', class_name: '8º Ano A', school_name: 'Rede Santa Catarina' },
    { id: '4', name: 'Lucas Santana', class_name: '8º Ano A', school_name: 'Rede Santa Catarina' },
    { id: '5', name: 'Matheus Oliveira', class_name: '7º Ano B', school_name: 'Machado Sobrinho' },
    { id: '6', name: 'Ana Clara Lima', class_name: '6º Ano A', school_name: 'Machado Sobrinho' },
    { id: '7', name: 'Ana Luiza Lima', class_name: '6º Ano A', school_name: 'Machado Sobrinho' },
    { id: '8', name: 'João Pedro Costa', class_name: '9º Ano A', school_name: 'Machado Sobrinho' },
  ]

  it('1. Par 1 (Gabriel vs Gabriela): Pergunta de confirmação em busca ambígua "Gabri" ou "Gabriel"', () => {
    // Busca por prefixo ambíguo "Gabri"
    const resultAmbiguous = matchStudentByName('Gabri', testStudents)
    expect(resultAmbiguous.status).toBe('ambiguous')
    expect(resultAmbiguous.student).toBeNull()
    expect(resultAmbiguous.candidates.length).toBeGreaterThanOrEqual(2)
    expect(resultAmbiguous.disambiguationPrompt).toContain('Gabriel Silva')
    expect(resultAmbiguous.disambiguationPrompt).toContain('Gabriela Silva')

    // Busca exata "Gabriel Silva" resolve com certeza
    const resultExact = matchStudentByName('Gabriel Silva', testStudents)
    expect(resultExact.status).toBe('exact')
    expect(resultExact.student?.name).toBe('Gabriel Silva')
  })

  it('2. Par 2 (Lucas Santos vs Lucas Santana): Pede confirmação para o primeiro nome "Lucas"', () => {
    const result = matchStudentByName('Lucas', testStudents)
    expect(result.status).toBe('ambiguous')
    expect(result.student).toBeNull()
    expect(result.candidates.map(c => c.name)).toEqual(expect.arrayContaining(['Lucas Santos', 'Lucas Santana']))
    expect(result.disambiguationPrompt).toContain('Lucas Santos')
    expect(result.disambiguationPrompt).toContain('Lucas Santana')
  })

  it('3. Par 3 (Ana Clara vs Ana Luiza): Pede confirmação para "Ana" ou "Ana Lima"', () => {
    const resultAna = matchStudentByName('Ana Lima', testStudents)
    expect(resultAna.status).toBe('ambiguous')
    expect(resultAna.student).toBeNull()
    expect(resultAna.disambiguationPrompt).toContain('Ana Clara Lima')
    expect(resultAna.disambiguationPrompt).toContain('Ana Luiza Lima')
  })

  it('4. Variação ortográfica com acento / fonética: "Mateus" encontra "Matheus Oliveira" com alta confiança', () => {
    const result = matchStudentByName('Mateus Oliveira', testStudents)
    expect(['exact', 'confident_match']).toContain(result.status)
    expect(result.student?.name).toBe('Matheus Oliveira')
  })

  it('5. Normalização de acentos: "Joao Pedro" encontra "João Pedro Costa"', () => {
    const result = matchStudentByName('Joao Pedro Costa', testStudents)
    expect(result.status).toBe('exact')
    expect(result.student?.name).toBe('João Pedro Costa')
  })

  it('6. Nome inexistente retorna not_found com segurança', () => {
    const result = matchStudentByName('Carlos Drummond', testStudents)
    expect(result.status).toBe('not_found')
    expect(result.student).toBeNull()
  })
})
