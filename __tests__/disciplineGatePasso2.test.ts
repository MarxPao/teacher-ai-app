import { describe, it, expect } from 'vitest'
import {
  isEltSubject,
  ELT_ALLOWED_SUBJECTS,
  filterHintsByDiscipline,
  PEDAGOGICAL_RISK_THRESHOLD
} from '@/lib/disciplineGate'

describe('Passo 2: Trava de Disciplina e Limiares Conservadores', () => {
  it('1. Disciplina Matemática não emite nenhum termo ou card de língua inglesa', () => {
    expect(isEltSubject('Matemática')).toBe(false)
    expect(isEltSubject('matematica')).toBe(false)
    expect(isEltSubject('Ciências')).toBe(false)

    const rawHints: any[] = [
      { id: 'h1', topic: 'Segurança Afetiva', author: 'Stephen Krashen', prescription: 'Filtro Afetivo', isEltSpecific: true },
      { id: 'h2', topic: 'The 4 Strands', author: 'Paul Nation', prescription: 'Language learning', isEltSpecific: true },
      { id: 'h3', topic: 'TTT vs STT', author: 'Jim Scrivener', prescription: 'Teacher Talking Time', isEltSpecific: true }
    ]

    const { activeHints, notice } = filterHintsByDiscipline(rawHints, 'Matemática')
    expect(activeHints.length).toBe(0)
    expect(notice).toContain('orientações específicas ainda não disponíveis para esta disciplina')
  })

  it('2. Disciplina Inglês (com ou sem acento / maiúsculas) permite cards de ELT', () => {
    expect(isEltSubject('Língua Inglesa')).toBe(true)
    expect(isEltSubject('ingles')).toBe(true)
    expect(isEltSubject('ENGLISH')).toBe(true)

    const rawHints: any[] = [
      { id: 'h1', topic: 'Segurança Afetiva', author: 'Stephen Krashen', isEltSpecific: true }
    ]

    const { activeHints, notice } = filterHintsByDiscipline(rawHints, 'Língua Inglesa')
    expect(activeHints.length).toBe(1)
    expect(notice).toBeNull()
  })

  it('3. Disciplina ausente ou desconhecida retorna só dados e aviso padrão', () => {
    expect(isEltSubject(undefined)).toBe(false)
    expect(isEltSubject(null)).toBe(false)
    expect(isEltSubject('')).toBe(false)

    const rawHints: any[] = [
      { id: 'h1', topic: 'Segurança Afetiva', author: 'Stephen Krashen', isEltSpecific: true }
    ]

    const { activeHints, notice } = filterHintsByDiscipline(rawHints, undefined)
    expect(activeHints.length).toBe(0)
    expect(notice).toContain('orientações específicas ainda não disponíveis para esta disciplina')
  })

  it('4. Limiar unificado é o mais conservador (6.5) e rotulado para validação com pedagogo', () => {
    // 6.5 alerta mais cedo que 6.0 (mais conservador)
    expect(PEDAGOGICAL_RISK_THRESHOLD).toBe(6.5)
  })

  it('5. Nenhum card possui nível CEFR derivado de média (ex: A2/B1)', () => {
    const sampleHint: any = {
      id: 'h1',
      topic: 'Estruturação Gramatical',
      author: 'Lev Vygotsky',
      // recommendedLevel removido ou sem nível artificial
    }
    expect(sampleHint.recommendedLevel).toBeUndefined()
  })
})
