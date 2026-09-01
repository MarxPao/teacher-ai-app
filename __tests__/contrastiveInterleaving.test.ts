import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  createBalancedBlueprint,
  generateBlueprintPromptSection,
  checkTopicsAreContrastPairs
} from '../lib/testBlueprintEngine'
import { getSubjectProfile } from '../lib/subjectProfile'
import '../lib/subjects/english'
import '../lib/subjects/portuguese'

describe('Item D — Intercalação Contrastante Forçada no Blueprint (Interleaving Effect)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockStorage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('1. Detecta pares de contraste clássicos em Inglês e Português', () => {
    expect(checkTopicsAreContrastPairs('Present Perfect', 'Simple Past')).toBe(true)
    expect(checkTopicsAreContrastPairs('Past Simple', 'Present Perfect')).toBe(true)
    expect(checkTopicsAreContrastPairs('First Conditional', 'Second Conditional')).toBe(true)
    expect(checkTopicsAreContrastPairs('Crase Obrigatória', 'Crase Proibida')).toBe(true)
    expect(checkTopicsAreContrastPairs('Uso do Mas', 'Uso do Mais')).toBe(true)
    expect(checkTopicsAreContrastPairs('Regência de Assistir', 'Regência de Chegar')).toBe(true)

    // Tópicos não contrastantes
    expect(checkTopicsAreContrastPairs('Reading Comprehension', 'Family Vocabulary')).toBe(false)
  })

  it('2. Intercala obrigatoriamente itens quando o professor seleciona tópicos com relação de contraste', () => {
    const blueprint = createBalancedBlueprint({
      title: 'Simulado de Tempos Verbais',
      subject: 'Língua Inglesa',
      totalQuestions: 6,
      topics: ['Present Perfect', 'Simple Past'],
      includeSpacedRetrieval: false
    })

    expect(blueprint.hasInterleaving).toBe(true)
    expect(blueprint.contrastPairsCount).toBe(1)
    expect(blueprint.items.length).toBe(6)

    // Sequência deve ser estritamente alternada
    expect(blueprint.items[0].topic).toBe('Present Perfect')
    expect(blueprint.items[1].topic).toBe('Simple Past')
    expect(blueprint.items[2].topic).toBe('Present Perfect')
    expect(blueprint.items[3].topic).toBe('Simple Past')
    expect(blueprint.items[4].topic).toBe('Present Perfect')
    expect(blueprint.items[5].topic).toBe('Simple Past')

    // Itens devem conter tag de par contrastante
    expect(blueprint.items[0].isContrastPair).toBe(true)
    expect(blueprint.items[0].contrastPartnerTopic).toBe('Simple Past')

    // Prompt deve conter a instrução de intercalação
    const promptSection = generateBlueprintPromptSection(blueprint)
    expect(promptSection).toContain('INTERCALAÇÃO CONTRASTANTE')
    expect(promptSection).toContain('PAR CONTRASTANTE')
  })

  it('3. Mantém comportamento padrão quando os tópicos selecionados não possuem relação de contraste', () => {
    const blueprint = createBalancedBlueprint({
      title: 'Leitura e Vocabulário',
      subject: 'Língua Inglesa',
      totalQuestions: 4,
      topics: ['Reading Comprehension', 'Sports Vocabulary'],
      includeSpacedRetrieval: false
    })

    expect(blueprint.hasInterleaving).toBe(false)
    expect(blueprint.contrastPairsCount).toBe(0)
    expect(blueprint.items.every(i => !i.isContrastPair)).toBe(true)

    const promptSection = generateBlueprintPromptSection(blueprint)
    expect(promptSection).not.toContain('INTERCALAÇÃO CONTRASTANTE')
  })
})
