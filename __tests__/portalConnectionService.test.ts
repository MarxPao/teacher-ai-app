import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  listPortalConnections,
  getPortalConnection,
  upsertPortalConnection,
  startDiscovery,
  saveDiscoveredMap,
  abortDiscovery,
  validateConnection,
  recordSyncSuccess,
  recordSyncFailure,
  resetPortalConnections,
  PortalConnection
} from '@/lib/portalConnectionService'

describe('portalConnectionService — Máquina de Estados e Contrato de Dados (PARTE A)', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v },
      removeItem: (k: string) => { delete mockStorage[k] },
      clear: () => { mockStorage = {} }
    })
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })
    resetPortalConnections()
  })

  it('1. Deve carregar a lista inicial de portais com status "never_connected"', () => {
    const list = listPortalConnections()
    expect(list.length).toBeGreaterThanOrEqual(7)

    const machado = list.find(p => p.id === 'machado')
    expect(machado).toBeDefined()
    expect(machado?.status).toBe('never_connected')
    expect(machado?.domain).toContain('paineldoaluno.com.br')
  })

  it('2. Deve transitar de "never_connected" para "discovering" via startDiscovery', () => {
    const conn = startDiscovery('machado')
    expect(conn.status).toBe('discovering')

    const persisted = getPortalConnection('machado')
    expect(persisted?.status).toBe('discovering')
  })

  it('3. Deve transitar de "discovering" para "mapped_untested" ao salvar mapa com extração >= 1 aluno', () => {
    startDiscovery('machado')

    const updated = saveDiscoveredMap(
      'machado',
      {
        selector_strategy: 'table_rows',
        selectors: { roster_table: 'table.roster', name_col: 1 },
        confidence: 'high'
      },
      7 // 7 alunos reais extraídos na conferência determinística imediata
    )

    expect(updated.status).toBe('mapped_untested')
    expect(updated.map?.selector_strategy).toBe('table_rows')
    expect(updated.map?.validation_failures).toBe(0)
    expect(updated.map?.last_validated_at).toBeUndefined()
  })

  // ==========================================================================
  // CASOS DE FALHA PROPOSITAIS (CRITÉRIOS DE ACEITE E GUARDAS ESTRITAS)
  // ==========================================================================

  it('4. FALHA PROPOSITAL: Deve rejeitar mapa se extração determinística imediata encontrar 0 alunos', () => {
    startDiscovery('machado')

    expect(() => {
      saveDiscoveredMap(
        'machado',
        {
          selector_strategy: 'table_rows',
          selectors: { roster_table: 'table.vazia' }
        },
        0 // 0 alunos extraídos
      )
    }).toThrow(/Validação determinística imediata falhou/i)

    // O status deve permanecer discovering ou o estado anterior, sem corromper com mapa vazio
    const conn = getPortalConnection('machado')
    expect(conn?.status).toBe('discovering')
    expect(conn?.map).toBeUndefined()
  })

  it('5. FALHA PROPOSITAL: Deve BLOQUEAR promoção para "mapped_validated" se foi parcial (wasPartial: true)', () => {
    startDiscovery('machado')
    saveDiscoveredMap(
      'machado',
      {
        selector_strategy: 'table_rows',
        selectors: { roster_table: 'table' }
      },
      5
    )

    // Tenta validar com wasPartial: true
    const result = validateConnection('machado', {
      humanApproved: true,
      wasPartial: true,
      syncData: {
        students_read: 5,
        students_expected: 30,
        layer_used: 'layer_1_deterministic'
      }
    })

    expect(result.success).toBe(false)
    expect(result.reason).toMatch(/Leitura parcial detectada/i)

    // O status no banco/storage DEVE permanecer mapped_untested
    const conn = getPortalConnection('machado')
    expect(conn?.status).toBe('mapped_untested')
    expect(conn?.map?.last_validated_at).toBeUndefined()
  })

  it('6. FALHA PROPOSITAL: Deve BLOQUEAR promoção para "mapped_validated" sem aprovação humana explícita', () => {
    startDiscovery('machado')
    saveDiscoveredMap(
      'machado',
      {
        selector_strategy: 'table_rows',
        selectors: { roster_table: 'table' }
      },
      30
    )

    // Tenta validar com humanApproved: false
    const result = validateConnection('machado', {
      humanApproved: false,
      wasPartial: false
    })

    expect(result.success).toBe(false)
    expect(result.reason).toMatch(/Aprovação humana é estritamente obrigatória/i)

    const conn = getPortalConnection('machado')
    expect(conn?.status).toBe('mapped_untested')
  })

  it('7. Deve promover com sucesso para "mapped_validated" quando ambas as guardas forem atendidas', () => {
    startDiscovery('machado')
    saveDiscoveredMap(
      'machado',
      {
        selector_strategy: 'table_rows',
        selectors: { roster_table: 'table' }
      },
      30
    )

    const result = validateConnection('machado', {
      humanApproved: true,
      wasPartial: false,
      syncData: {
        students_read: 30,
        students_expected: 30,
        layer_used: 'layer_1_deterministic'
      }
    })

    expect(result.success).toBe(true)
    expect(result.connection.status).toBe('mapped_validated')
    expect(result.connection.map?.last_validated_at).toBeDefined()
    expect(result.connection.last_sync?.students_read).toBe(30)
    expect(result.connection.last_sync?.verification_passed).toBe(true)
  })

  it('8. RESILIÊNCIA E DEGRADAÇÃO: Tolera 1 e 2 falhas mantendo "mapped_validated", e degrada para "broken_needs_rediscovery" na 3ª falha', () => {
    // Prepara conexão já homologada
    startDiscovery('machado')
    saveDiscoveredMap('machado', { selector_strategy: 'table_rows', selectors: {} }, 10)
    validateConnection('machado', { humanApproved: true, wasPartial: false })

    let conn = getPortalConnection('machado')
    expect(conn?.status).toBe('mapped_validated')
    expect(conn?.map?.validation_failures).toBe(0)

    // 1ª Falha determinística (ex: DOM oscilando)
    conn = recordSyncFailure('machado', 'Timeout esperando selector table')
    expect(conn.status).toBe('mapped_validated')
    expect(conn.map?.validation_failures).toBe(1)

    // 2ª Falha determinística
    conn = recordSyncFailure('machado', 'Elemento não interativo')
    expect(conn.status).toBe('mapped_validated')
    expect(conn.map?.validation_failures).toBe(2)

    // 3ª Falha determinística consecutiva -> DEVE TRANSITAR PARA broken_needs_rediscovery
    conn = recordSyncFailure('machado', 'Layout mudou completamente')
    expect(conn.status).toBe('broken_needs_rediscovery')
    expect(conn.map?.validation_failures).toBe(3)
  })

  it('9. Deve permitir re-descoberta a partir de "broken_needs_rediscovery"', () => {
    // Coloca em estado quebrado
    startDiscovery('machado')
    saveDiscoveredMap('machado', { selector_strategy: 'table_rows', selectors: {} }, 10)
    validateConnection('machado', { humanApproved: true, wasPartial: false })
    recordSyncFailure('machado', '1')
    recordSyncFailure('machado', '2')
    recordSyncFailure('machado', '3')

    expect(getPortalConnection('machado')?.status).toBe('broken_needs_rediscovery')

    // Inicia re-descoberta
    const rediscovering = startDiscovery('machado')
    expect(rediscovering.status).toBe('discovering')
    expect(rediscovering.map?.validation_failures).toBe(0)
  })

  it('10. abortDiscovery deve reverter com segurança quando originado de "never_connected"', () => {
    startDiscovery('santacatarina')
    expect(getPortalConnection('santacatarina')?.status).toBe('discovering')

    const reverted = abortDiscovery('santacatarina', 'Cancelado pelo usuário')
    expect(reverted.status).toBe('never_connected')
  })

  it('11. ITEM 1 & 4: Portal em "broken_needs_rediscovery" tenta redescoberta e falha -> PERMANECE em "broken_needs_rediscovery" com mapa preservado', () => {
    // 1. Configura portal com mapa e status broken_needs_rediscovery
    startDiscovery('machado')
    saveDiscoveredMap(
      'machado',
      {
        selector_strategy: 'table_rows',
        selectors: { roster_table: '#roster-alunos', name_column: 1 },
        confidence: 'high'
      },
      8
    )
    validateConnection('machado', { humanApproved: true, wasPartial: false })

    // Força 3 falhas consecutivas para atingir broken_needs_rediscovery
    recordSyncFailure('machado', 'Falha 1')
    recordSyncFailure('machado', 'Falha 2')
    const broken = recordSyncFailure('machado', 'Falha 3')
    expect(broken.status).toBe('broken_needs_rediscovery')
    expect(broken.map?.selectors.roster_table).toBe('#roster-alunos')

    // 2. Professor inicia nova descoberta assistida
    const discovering = startDiscovery('machado')
    expect(discovering.status).toBe('discovering')
    expect(discovering.previous_status).toBe('broken_needs_rediscovery')

    // 3. Descoberta falha (ex: rate limit 429 persistente ou timeout)
    const aborted = abortDiscovery('machado', 'Timeout 429 persistente')

    // 4. VERIFICAÇÃO CRÍTICA (ITEM 1):
    // Deve PERMANECER em broken_needs_rediscovery e o mapa anterior NÃO pode ter sido apagado!
    expect(aborted.status).toBe('broken_needs_rediscovery')
    expect(aborted.map).toBeDefined()
    expect(aborted.map?.selectors.roster_table).toBe('#roster-alunos')
  })

  it('12. ITEM 2: Migração dos seeds nunca promove mapa legado para "mapped_validated" diretamente (entra sempre como "mapped_untested")', () => {
    // Simula banco legado com mapa que tinha last_validated_at gravado no passado
    const legacyMap = {
      portal_domain: 'colegio-legado.edu.br',
      portal_display_name: 'Colégio Legado',
      discovered_selectors: { strategy: 'table_rows', roster_table: 'table.antiga' },
      discovery_confidence: 'high',
      validation_failures: 0,
      last_validated_at: '2026-08-01T12:00:00.000Z' // Carimbo legado
    }
    localStorage.setItem('teacher_discovered_portal_maps', JSON.stringify([legacyMap]))

    // Executa reset/seed inicial
    const connections = resetPortalConnections()
    const migrated = connections.find(c => c.domain === 'colegio-legado.edu.br')

    expect(migrated).toBeDefined()
    // REGRA MANDATÓRIA: Não pode ser mapped_validated!
    expect(migrated?.status).toBe('mapped_untested')
    expect(migrated?.status).not.toBe('mapped_validated')
    expect(migrated?.map?.last_validated_at).toBeUndefined()
  })

  it('12b. Migração de mapa legado com >=3 falhas entra como broken_needs_rediscovery', () => {
    // Simula banco legado com mapa que acumulava 3 ou mais falhas
    const legacyBrokenMap = {
      portal_domain: 'escola-quebrada.edu.br',
      portal_display_name: 'Escola Quebrada',
      discovered_selectors: { strategy: 'table_rows', roster_table: 'table.mudou' },
      discovery_confidence: 'low',
      validation_failures: 4, // >= 3 falhas
      last_validated_at: '2026-07-15T10:00:00.000Z'
    }
    localStorage.setItem('teacher_discovered_portal_maps', JSON.stringify([legacyBrokenMap]))

    const connections = resetPortalConnections()
    const migratedBroken = connections.find(c => c.domain === 'escola-quebrada.edu.br')

    expect(migratedBroken).toBeDefined()
    // REGRA MANDATÓRIA: Deve entrar como broken_needs_rediscovery, NUNCA mapped_untested
    expect(migratedBroken?.status).toBe('broken_needs_rediscovery')
    expect(migratedBroken?.status).not.toBe('mapped_untested')
    expect(migratedBroken?.map?.validation_failures).toBe(4)
  })
})
