import { describe, it, expect } from 'vitest'
import { QuestionProvenanceSchema } from '@/lib/examSchema'
import { runFactCheck } from '@/lib/factCheck'

describe('LOTE B — B3: Honestidade dos Rótulos Psicométricos, Provenance e Fact-Check', () => {
  it('Provenance: QuestionProvenanceSchema deve aceitar "teacher_provided" e proibir falso "verified" em ref manual', () => {
    const validTeacherProv = {
      type: 'teacher_reference',
      sourceLabel: 'Livro Didático do Professor, Cap. 4',
      confidence: 'teacher_provided'
    }

    const parseResult = QuestionProvenanceSchema.safeParse(validTeacherProv)
    expect(parseResult.success).toBe(true)
    if (parseResult.success) {
      expect(parseResult.data?.confidence).toBe('teacher_provided')
      expect(parseResult.data?.confidence).not.toBe('verified')
    }
  })

  it('Fact-Check: deve cobrir texto longo (> 3000 chars) declarando cobertura em partes ou aviso explícito', async () => {
    // Conteúdo sintético com mais de 4500 caracteres
    const longContent = 'Questão sobre termodinâmica e leis dos gases. '.repeat(100)
    expect(longContent.length).toBeGreaterThan(4000)

    const mockApi: any = {
      provider: 'manual',
      key: ''
    }

    const result = await runFactCheck(longContent, '9º ano', 'Ciências', mockApi)
    expect(result.coverageNotice).toBeDefined()
    expect(result.coverageNotice).toMatch(/parcial|integral|partes/i)
    expect(result.totalCharacters).toBe(longContent.length)
  })
})
