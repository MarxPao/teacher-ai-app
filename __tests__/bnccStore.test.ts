import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getBnccCatalog,
  getBnccForGrade,
  saveBnccCatalog,
  subscribeBncc,
  invalidateBnccCache,
  getBnccStoreVersion
} from '@/lib/bnccStore'
import { BnccSkill } from '@/lib/bnccData'

describe('BNCC Store — Fonte Única Reativa', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    invalidateBnccCache()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('1. getBnccCatalog() retorna o catálogo oficial completo de 106 habilidades (88 EF + 18 EM) por padrão', () => {
    const catalog = getBnccCatalog()
    expect(catalog.length).toBe(106)
    expect(catalog[0].code).toBe('EF06LI01')
  })

  it('2. getBnccCatalog utiliza cache em memória (mesma referência) até ser invalidado', () => {
    const firstCall = getBnccCatalog()
    const secondCall = getBnccCatalog()
    expect(firstCall).toBe(secondCall)

    invalidateBnccCache()
    const thirdCall = getBnccCatalog()
    // Re-instanciado do localStorage
    expect(thirdCall).not.toBe(firstCall)
    expect(thirdCall.length).toBe(106)
  })

  it('3. getBnccForGrade() filtra corretamente cada ano escolar', () => {
    const skills6 = getBnccForGrade('6º Fund.')
    const skills7 = getBnccForGrade('7º Fund.')
    const skills8 = getBnccForGrade('8º Fund.')
    const skills9 = getBnccForGrade('9º Fund.')

    expect(skills6.length).toBe(26)
    expect(skills7.length).toBe(23)
    expect(skills8.length).toBe(20)
    expect(skills9.length).toBe(19)

    // Todas as habilidades do 6º começam com EF06LI
    expect(skills6.every(s => s.code.startsWith('EF06LI'))).toBe(true)
  })

  it('4. getBnccCatalog("portuguese") retorna matriz de Língua Portuguesa', () => {
    const lpCatalog = getBnccCatalog('portuguese')
    expect(lpCatalog.length).toBeGreaterThan(0)
    expect(lpCatalog.every(s => s.code.includes('LP'))).toBe(true)
  })

  it('5. saveBnccCatalog() persiste dados, atualiza cache e notifica subscribers', () => {
    let subscriberNotified = false
    const unsubscribe = subscribeBncc(() => {
      subscriberNotified = true
    })

    const initialVersion = getBnccStoreVersion()
    const customSkills: BnccSkill[] = [
      {
        id: 'CUSTOM01',
        code: 'CUSTOM01',
        gradeYear: '6º Fund.',
        subject: 'EF_LI',
        axis: 'Oralidade',
        description: 'Habilidade personalizada de teste',
        unit: 'Unidade Teste'
      }
    ]

    saveBnccCatalog(customSkills)

    expect(subscriberNotified).toBe(true)
    expect(getBnccStoreVersion()).toBeGreaterThan(initialVersion)

    const updated = getBnccCatalog()
    expect(updated.length).toBe(1)
    expect(updated[0].code).toBe('CUSTOM01')

    unsubscribe()
  })
})
