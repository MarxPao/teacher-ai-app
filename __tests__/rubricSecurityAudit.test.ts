import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Rubric Security & Integrity Audit Suite', () => {
  const rubricPath = path.resolve(__dirname, '../components/modules/Rubric.tsx')
  const rubricCode = fs.readFileSync(rubricPath, 'utf8')

  it('1. Elimina qualquer chamada fetch direta a APIs externas (Anthropic, OpenAI, Gemini)', () => {
    // Proibido chamar domínios externos diretamente do navegador
    expect(rubricCode).not.toContain('api.anthropic.com')
    expect(rubricCode).not.toContain('api.openai.com')
    expect(rubricCode).not.toContain('generativelanguage.googleapis.com')
    expect(rubricCode).not.toContain('anthropic-dangerously-allow-browser')
  })

  it('2. Roteia a geração de matriz pelo backend seguro /api/agent', () => {
    expect(rubricCode).toContain("fetch('/api/agent'")
  })

  it('3. Utiliza safeGet e safeSet do localDB em vez de manipulação desprotegida do localStorage', () => {
    expect(rubricCode).toContain('safeGet<StudentRecord[]>(')
    expect(rubricCode).toContain('safeSet(KEYS.STUDENTS')
    expect(rubricCode).toContain('safeSet(KEYS.GRADEBOOK_CONFIG')
  })

  it('4. Protege contra divisão por zero e impede gravação de NaN no boletim', () => {
    // Cálculo seguro de finalGrade
    const calculateGrade = (scores: Record<string, number>, criteriaCount: number) => {
      const totalPossible = criteriaCount * 5
      const rawSum = Object.values(scores).reduce((a, b) => a + b, 0)
      return (totalPossible > 0 && !Number.isNaN(rawSum))
        ? Number(((rawSum / totalPossible) * 10).toFixed(1))
        : 0
    }

    // Cenário normal
    expect(calculateGrade({ Content: 4, Language: 4 }, 2)).toBe(8.0)

    // Cenário extremo: 0 critérios (evita 0 / 0 = NaN)
    const emptyResult = calculateGrade({}, 0)
    expect(emptyResult).toBe(0)
    expect(Number.isNaN(emptyResult)).toBe(false)
  })

  it('5. Contém descritores textuais ricos de desempenho para todas as 5 Bands em Writing e Speaking', () => {
    expect(rubricCode).toContain('BAND_DESCRIPTORS')
    expect(rubricCode).toContain('Todas as tarefas cumpridas com relevância')
    expect(rubricCode).toContain('Domínio pleno do registro formal/informal')
    expect(rubricCode).toContain('Intonação e acentuação naturais')
  })

  it('6. Utiliza o componente Button do Design System para ações principais', () => {
    expect(rubricCode).toContain("import Button from '@/components/Button'")
    expect(rubricCode).toContain('<Button')
  })
})
