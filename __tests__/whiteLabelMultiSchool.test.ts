import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  extractDomain,
  extractRootDomain,
  getDiscoveredPortalMap,
  saveLocalDiscoveredPortalMap
} from '../lib/portalActionsEngine'

describe('Herança de Domínio Raiz para Portais White-Label Multi-Escolas', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} }
    })
    vi.clearAllMocks()
  })

  it('deve extrair domínios e domínios raiz corretamente tratando ccTLDs de 2 partes (.com.br, .edu.br, .org.br)', () => {
    expect(extractDomain('https://machadosobrinho.paineldoaluno.com.br/professor_notas')).toBe('machadosobrinho.paineldoaluno.com.br')
    expect(extractRootDomain('machadosobrinho.paineldoaluno.com.br')).toBe('paineldoaluno.com.br')
    expect(extractRootDomain('colegio-alpha.paineldoaluno.com.br')).toBe('paineldoaluno.com.br')
    expect(extractRootDomain('colegio-beta.paineldoaluno.com.br')).toBe('paineldoaluno.com.br')
    expect(extractRootDomain('portaleducacao.redesantacatarina.org.br')).toBe('redesantacatarina.org.br')
    expect(extractRootDomain('campus.escola.edu.br')).toBe('escola.edu.br')
    expect(extractRootDomain('app.plurall.net')).toBe('plurall.net')
    expect(extractRootDomain('cambridgeone.org')).toBe('cambridgeone.org')
  })

  it('deve reaproveitar mapa descoberto do domínio raiz (Camada 1) quando uma nova escola white-label for consultada', async () => {
    // 1. Salva um mapa descoberto sob o domínio raiz do produto
    saveLocalDiscoveredPortalMap({
      portal_domain: 'paineldoaluno.com.br',
      portal_display_name: 'Painel do Aluno White-Label Engine',
      discovered_selectors: {
        roster_table: 'table#alunos-grid',
        name_column: 1,
        id_column: 0,
        header_rows: 1
      },
      discovery_confidence: 'high'
    })

    // 2. Consulta uma nova escola que nunca fez discovery (ex: colegio-novo.paineldoaluno.com.br)
    const mapForNewSchool = await getDiscoveredPortalMap('colegio-novo.paineldoaluno.com.br')
    expect(mapForNewSchool).not.toBeNull()
    expect(mapForNewSchool?.portal_domain).toBe('paineldoaluno.com.br')
    expect(mapForNewSchool?.discovered_selectors?.roster_table).toBe('table#alunos-grid')
    expect(mapForNewSchool?.discovery_confidence).toBe('high')
  })

  it('deve priorizar mapa de subdomínio específico se houver, antes de recorrer ao domínio raiz', async () => {
    // Mapa genérico para a rede
    saveLocalDiscoveredPortalMap({
      portal_domain: 'paineldoaluno.com.br',
      portal_display_name: 'Genérico',
      discovered_selectors: { roster_table: 'table.generic-roster' },
      discovery_confidence: 'medium'
    })

    // Mapa customizado específico para o Machado Sobrinho
    saveLocalDiscoveredPortalMap({
      portal_domain: 'machadosobrinho.paineldoaluno.com.br',
      portal_display_name: 'Machado Customizado',
      discovered_selectors: { roster_table: 'table#machado-custom-table' },
      discovery_confidence: 'high'
    })

    const mapMachado = await getDiscoveredPortalMap('machadosobrinho.paineldoaluno.com.br')
    expect(mapMachado?.portal_domain).toBe('machadosobrinho.paineldoaluno.com.br')
    expect(mapMachado?.discovered_selectors?.roster_table).toBe('table#machado-custom-table')

    const mapOutraEscola = await getDiscoveredPortalMap('colegiopositivo.paineldoaluno.com.br')
    expect(mapOutraEscola?.portal_domain).toBe('paineldoaluno.com.br')
    expect(mapOutraEscola?.discovered_selectors?.roster_table).toBe('table.generic-roster')
  })
})
