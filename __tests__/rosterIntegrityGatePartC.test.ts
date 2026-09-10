import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  reconcileRosterBatch,
  applyReconciliationDecisions,
  validatePortalRosterIntegrity,
  batchApproveValidItems,
  LocalStudentRecord
} from '../lib/rosterReconciler'
import {
  startDiscovery,
  saveDiscoveredMap,
  validateConnection,
  recordSyncSuccess,
  recordSyncFailure,
  getPortalConnection,
  savePortalConnections,
  resetPortalConnections
} from '../lib/portalConnectionService'

describe('PARTE C — Validação de Integridade (Gate, Não Sugestão)', () => {
  let mockStorage: Record<string, string> = {}

  const localRoster: LocalStudentRecord[] = [
    {
      id: 'loc_001',
      name: 'Ana Júlia Ferreira',
      className: '8º Ano A',
      portal_native_id: '2024001',
      notes: 'NEE TDAH — Tempo adicional de prova',
      level: 'B1',
      grades: { b1: 9.0, b2: 8.5 }
    },
    {
      id: 'loc_002',
      name: 'Bruno Henrique Lima',
      className: '8º Ano A',
      portal_native_id: '2024002',
      notes: 'Liderança positiva em trabalhos em grupo',
      level: 'B2',
      grades: { b1: 8.0 }
    },
    {
      id: 'loc_003',
      name: 'Carla Beatriz Santos',
      className: '8º Ano A',
      portal_native_id: '2024003',
      notes: 'Participativa nas discussões orais',
      level: 'A2',
      grades: { b1: 7.5 }
    }
  ]

  const scrapedRoster = [
    { name: 'Ana Júlia Ferreira', matricula: '2024001', rollNumber: '1', classRef: '8º Ano A' },
    { name: 'Bruno Henrique Lima', matricula: '2024002', rollNumber: '2', classRef: '8º Ano A' },
    { name: 'Carla Beatriz Santos', matricula: '2024003', rollNumber: '3', classRef: '8º Ano A' },
    { name: 'Diego Alves Costa', matricula: '2024004', rollNumber: '4', classRef: '8º Ano A' } // Aluno novo legítimo
  ]

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

  it('1. Gate mapped_untested: FORÇA revisão manual item a item independente de confidence 1.0', () => {
    // Portal recém-descoberto (mapped_untested)
    const result = reconcileRosterBatch(scrapedRoster, localRoster, {
      portalName: 'Portal Alpha',
      portalStatus: 'mapped_untested',
      isUntestedMap: true,
      expectedCount: 4
    })

    // INEGOCIÁVEL: autoMergedCount e newImportedCount DEVEM ser ZERO
    expect(result.autoMergedCount).toBe(0)
    expect(result.newImportedCount).toBe(0)
    expect(result.isUntestedMap).toBe(true)
    expect(result.requiresManualReviewAll).toBe(true)
    expect(result.forcedReviewReason).toContain('mapped_untested')

    // Nenhum item vindo do portal pode ter resolvedAction pré-aprovada
    const autoResolvedItems = result.items.filter(
      i => i.resolvedAction !== undefined && i.status !== 'unmatched_local'
    )
    expect(autoResolvedItems.length).toBe(0)

    // Todos os 4 alunos do portal devem exigir revisão humana explícita
    const pendingReview = result.items.filter(i => !i.resolvedAction)
    expect(pendingReview.length).toBe(4)

    // A validação de integridade estrita deve REJEITAR gravação sem aprovação humana
    const gateCheck = validatePortalRosterIntegrity(result)
    expect(gateCheck.isValid).toBe(false)
    expect(gateCheck.reason).toContain('mapped_untested')
  })

  it('2. Gate mapped_validated: PERMITE auto-merge com segurança para leitura completa e confiança alta', () => {
    // Portal já homologado pela professora (mapped_validated)
    const result = reconcileRosterBatch(scrapedRoster, localRoster, {
      portalName: 'Portal Homologado',
      portalStatus: 'mapped_validated',
      isUntestedMap: false,
      expectedCount: 4
    })

    // 3 alunos locais casam perfeitamente com matrícula
    expect(result.autoMergedCount).toBe(3)
    // 1 aluno novo legítimo com nome completo é auto-criado
    expect(result.newImportedCount).toBe(1)
    expect(result.isUntestedMap).toBe(false)
    expect(result.requiresManualReviewAll).toBe(false)

    // Os 3 alunos casados possuem resolvedAction === 'merge'
    const merged = result.items.filter(i => i.resolvedAction === 'merge')
    expect(merged.length).toBe(3)

    // O aluno novo legítimo possui resolvedAction === 'create_new'
    const created = result.items.filter(i => i.resolvedAction === 'create_new')
    expect(created.length).toBe(1)

    // A validação de integridade deve aprovar
    const gateCheck = validatePortalRosterIntegrity(result, { humanApproved: true })
    expect(gateCheck.isValid).toBe(true)
  })

  it('3. Gate de Completude: bloqueia auto-merge mesmo em portal homologado se a contagem for parcial', () => {
    // 20 alunos esperados, mas apenas 2 raspados (10% do esperado)
    const partialScraped = [
      { name: 'Ana Júlia Ferreira', matricula: '2024001', rollNumber: '1', classRef: '8º Ano A' },
      { name: 'Bruno Henrique Lima', matricula: '2024002', rollNumber: '2', classRef: '8º Ano A' }
    ]

    const result = reconcileRosterBatch(partialScraped, localRoster, {
      portalName: 'Portal Homologado',
      portalStatus: 'mapped_validated',
      isUntestedMap: false,
      expectedCount: 20
    })

    expect(result.completenessCheck?.isPartial).toBe(true)
    expect(result.completenessCheck?.ratio).toBeLessThan(0.8)

    // Como é parcial, o auto-merge é sumariamente BLOQUEADO
    const autoResolved = result.items.filter(
      i => i.resolvedAction !== undefined && i.status !== 'unmatched_local'
    )
    expect(autoResolved.length).toBe(0)

    // validatePortalRosterIntegrity rejeita gravação automática de leitura parcial
    const gateCheck = validatePortalRosterIntegrity(result)
    expect(gateCheck.isValid).toBe(false)
    expect(gateCheck.reason).toContain('Leitura parcial')
  })

  it('4. Rejeição de Homologação: validateConnection PROÍBE transição para mapped_validated sob leitura parcial', () => {
    const portalId = 'portal_santacatarina'
    startDiscovery(portalId)
    saveDiscoveredMap(portalId, {
      selector_strategy: 'table_rows',
      selectors: { roster_table: '#alunos' }
    }, 4)

    const conn = getPortalConnection(portalId)
    expect(conn?.status).toBe('mapped_untested')

    // Tentativa de validar com wasPartial: true
    const invalidValidation = validateConnection(portalId, {
      humanApproved: true,
      wasPartial: true,
      syncData: {
        students_read: 2,
        students_expected: 20,
        layer_used: 'layer_1_deterministic'
      }
    })

    expect(invalidValidation.success).toBe(false)
    expect(invalidValidation.reason).toContain('Leitura parcial detectada')

    // O status do portal DEVE continuar como mapped_untested
    const afterCheck = getPortalConnection(portalId)
    expect(afterCheck?.status).toBe('mapped_untested')
  })

  it('5. Gate de Confiança por Item: nomes suspeitos mononômicos e ambíguos NUNCA entram como auto-merge', () => {
    const mixedScraped = [
      { name: 'Lucas', matricula: '999' }, // Nome mononômico suspeito (confiança 0.3)
      { name: 'Ana J. Ferreira', matricula: '998' } // Nome similar abreviado (ambíguo)
    ]

    const result = reconcileRosterBatch(mixedScraped, localRoster, {
      portalStatus: 'mapped_validated'
    })

    const suspiciousItem = result.items.find(i => i.portalStudent?.name === 'Lucas')
    expect(suspiciousItem?.confidence).toBe(0.3)
    expect(suspiciousItem?.resolvedAction).toBeUndefined() // NUNCA auto-create

    const ambiguousItem = result.items.find(i => i.portalStudent?.name === 'Ana J. Ferreira')
    expect(ambiguousItem?.status).toBe('ambiguous_match')
    expect(ambiguousItem?.resolvedAction).toBeUndefined() // NUNCA auto-merge
  })

  it('6. Preservação Sagrada de Dados Pedagógicos: mesclagem preserva notas, NEE e observações locais intactas', () => {
    // Professora aprova o vínculo da aluna Ana Júlia Ferreira
    const approvedItems = [
      {
        id: 'rec_0_loc_001',
        portalStudent: scrapedRoster[0],
        matchedLocalStudent: localRoster[0],
        status: 'auto_merged' as const,
        confidence: 1.0,
        reason: 'Aprovado manualmente pela professora',
        resolvedAction: 'merge' as const
      }
    ]

    const { updatedStudents, logSummary } = applyReconciliationDecisions(
      approvedItems,
      localRoster,
      'Portal Homologado'
    )

    const ana = updatedStudents.find(s => s.id === 'loc_001')
    expect(ana).toBeDefined()
    // Dados do portal atualizados
    expect(ana?.portal_native_id).toBe('2024001')
    expect(ana?.source_portal).toBe('Portal Homologado')
    expect(ana?.sync_status).toBe('synced')

    // Dados pedagógicos locais RIGOROSAMENTE PRESERVADOS
    expect(ana?.notes).toBe('NEE TDAH — Tempo adicional de prova')
    expect(ana?.level).toBe('B1')
    expect(ana?.grades).toEqual({ b1: 9.0, b2: 8.5 })
    expect(logSummary.merged).toBe(1)
  })

  it('7. Ciclo Completo de Vida: mapped_untested -> Revisão Humana -> mapped_validated -> Auto-merge subsequente', () => {
    const portalId = 'portal_colegio_real'

    // Passo 1: Descoberta via Camada 2
    startDiscovery(portalId)
    saveDiscoveredMap(portalId, {
      selector_strategy: 'table_rows',
      selectors: { roster_table: '#tabela-alunos' }
    }, 4)

    let conn = getPortalConnection(portalId)
    expect(conn?.status).toBe('mapped_untested')

    // Passo 2: Primeira Leitura — Gate mapped_untested bloqueia auto-merge
    const firstReading = reconcileRosterBatch(scrapedRoster, localRoster, {
      portalName: 'Colegio Real',
      portalStatus: conn?.status,
      isUntestedMap: true
    })
    expect(firstReading.autoMergedCount).toBe(0)
    expect(firstReading.items.filter(i => i.resolvedAction !== undefined).length).toBe(0)

    // Passo 3: Professora revisa e aprova no Modal
    const validIntegrityBeforeApproval = validatePortalRosterIntegrity(firstReading)
    expect(validIntegrityBeforeApproval.isValid).toBe(false)

    // Passo 4: Homologação formal via validateConnection
    const validationResult = validateConnection(portalId, {
      humanApproved: true,
      wasPartial: false,
      syncData: {
        students_read: 4,
        students_expected: 4,
        layer_used: 'layer_1_deterministic'
      }
    })
    expect(validationResult.success).toBe(true)

    conn = getPortalConnection(portalId)
    expect(conn?.status).toBe('mapped_validated')
    expect(conn?.map?.last_validated_at).toBeDefined()

    // Passo 5: Leitura Recorrente no Futuro — Auto-merge liberado com alta confiança
    const secondReading = reconcileRosterBatch(scrapedRoster, localRoster, {
      portalName: 'Colegio Real',
      portalStatus: conn?.status,
      isUntestedMap: false
    })

    expect(secondReading.autoMergedCount).toBe(3)
    expect(secondReading.newImportedCount).toBe(1)
    expect(secondReading.isUntestedMap).toBe(false)

    const validIntegrityAfterValidation = validatePortalRosterIntegrity(secondReading, { humanApproved: true })
    expect(validIntegrityAfterValidation.isValid).toBe(true)
  })

  it('8. Botão "Aprovar todos": resolve SOMENTE itens limpos (confidence >= 0.8 e sem ruído); 2 suspeitos permanecem pendentes', () => {
    const expandedLocalRoster: LocalStudentRecord[] = [
      { id: 'loc_001', name: 'Ana Júlia Ferreira', portal_native_id: '101', className: '8º Ano A' },
      { id: 'loc_002', name: 'Bruno Henrique Lima', portal_native_id: '102', className: '8º Ano A' },
      { id: 'loc_003', name: 'Carla Beatriz Santos', portal_native_id: '103', className: '8º Ano A' },
      { id: 'loc_004', name: 'Daniel Souza Alves', portal_native_id: '104', className: '8º Ano A' },
      { id: 'loc_005', name: 'Elena Maria Ribeiro', portal_native_id: '105', className: '8º Ano A' }
    ]

    // 10 alunos raspados: 8 limpos (5 matches locais + 3 novos legítimos) e 2 suspeitos/ambíguos
    const mixedBatch10 = [
      { name: 'Ana Júlia Ferreira', matricula: '101' },       // 1. Limpo (match local)
      { name: 'Bruno Henrique Lima', matricula: '102' },      // 2. Limpo (match local)
      { name: 'Carla Beatriz Santos', matricula: '103' },     // 3. Limpo (match local)
      { name: 'Daniel Souza Alves', matricula: '104' },       // 4. Limpo (match local)
      { name: 'Elena Maria Ribeiro', matricula: '105' },      // 5. Limpo (match local)
      { name: 'Fabio Henrique Dias', matricula: '106' },      // 6. Limpo (novo aluno)
      { name: 'Gabriela Cristina Rocha', matricula: '107' },  // 7. Limpo (novo aluno)
      { name: 'Heitor Augusto Silveira', matricula: '108' },  // 8. Limpo (novo aluno)
      { name: 'Lucas', matricula: '109' },                    // 9. SUSPEITO (mononímico, confiança 0.30)
      { name: 'Rodrigo', matricula: '110' }                   // 10. SUSPEITO (mononímico, confiança 0.30)
    ]

    const result = reconcileRosterBatch(mixedBatch10, expandedLocalRoster, {
      portalName: 'Portal Teste Lote',
      portalStatus: 'mapped_untested',
      isUntestedMap: true
    })

    // Antes do clique: todos os 10 itens com resolvedAction indefinida
    expect(result.items.filter(i => !i.resolvedAction).length).toBe(10)

    // Executa batchApproveValidItems (ação disparada pelo botão no modal)
    const batchResult = batchApproveValidItems(result.items)

    // INEGOCIÁVEL: Deve aprovar SOMENTE os 8 itens limpos
    expect(batchResult.approvedCount).toBe(8)
    // INEGOCIÁVEL: Deve ignorar e manter pendentes exatamente os 2 itens suspeitos/ambíguos
    expect(batchResult.skippedCount).toBe(2)

    // Confirma que os 8 itens resolvidos são os legítimos
    const resolvedItems = batchResult.updatedItems.filter(i => i.resolvedAction !== undefined)
    expect(resolvedItems.length).toBe(8)

    const mergedClean = resolvedItems.filter(i => i.resolvedAction === 'merge')
    expect(mergedClean.length).toBe(5)

    const createdClean = resolvedItems.filter(i => i.resolvedAction === 'create_new')
    expect(createdClean.length).toBe(3)

    // Confirma que os 2 suspeitos mononímicos permanecem pendentes (resolvedAction: undefined)
    const lucasItem = batchResult.updatedItems.find(i => i.portalStudent?.name === 'Lucas')
    expect(lucasItem?.resolvedAction).toBeUndefined()
    expect(lucasItem?.confidence).toBe(0.3)

    const rodrigoItem = batchResult.updatedItems.find(i => i.portalStudent?.name === 'Rodrigo')
    expect(rodrigoItem?.resolvedAction).toBeUndefined()
    expect(rodrigoItem?.confidence).toBe(0.3)

    // Gate de integridade rejeita gravação porque restam 2 pendentes
    const gateCheck = validatePortalRosterIntegrity({
      ...result,
      items: batchResult.updatedItems
    }, { isUntestedMap: true, humanApproved: true })

    expect(gateCheck.isValid).toBe(false)
    expect(gateCheck.reason).toContain('2 aluno(s) aguardando decisão individual')

    // Após decisão manual dos 2 restantes:
    const fullyResolvedItems = batchResult.updatedItems.map(i => {
      if (i.id === lucasItem?.id) return { ...i, resolvedAction: 'create_new' as const }
      if (i.id === rodrigoItem?.id) return { ...i, resolvedAction: 'create_new' as const }
      return i
    })

    const finalGateCheck = validatePortalRosterIntegrity({
      ...result,
      items: fullyResolvedItems
    }, { isUntestedMap: true, humanApproved: true })

    expect(finalGateCheck.isValid).toBe(true)
  })

  it('9. Gate broken_needs_rediscovery: bloqueia gravação e sinaliza leitura interrompida em vez de 0 alunos novos', () => {
    const result = reconcileRosterBatch(scrapedRoster, localRoster, {
      portalName: 'Portal Quebrado',
      portalStatus: 'broken_needs_rediscovery'
    })

    // INEGOCIÁVEL: sinalização explícita de mapa quebrado
    expect(result.isBrokenMap).toBe(true)
    expect(result.brokenReason).toBe('Leitura não realizada: portal precisa de redescoberta manual.')
    expect(result.autoMergedCount).toBe(0)
    expect(result.newImportedCount).toBe(0)

    // A validação de integridade REJEITA categoricamente qualquer gravação
    const gateCheck = validatePortalRosterIntegrity(result, {
      portalStatus: 'broken_needs_rediscovery',
      humanApproved: true
    })

    expect(gateCheck.isValid).toBe(false)
    expect(gateCheck.reason).toBe('Leitura não realizada: portal precisa de redescoberta manual.')
  })
})
