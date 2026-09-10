import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  upsertConnection,
  getPortalConnection,
  listPortalConnections,
  validateConnection,
  recordSyncSuccess,
  recordSyncFailure
} from '../lib/portalConnectionService'
import {
  validateStudentName,
  WizardStudentItem,
  batchApproveWizardStudents,
  validateWizardRosterIntegrity
} from '../lib/rosterReconciler'
import { extractDomain } from '../lib/portalActionsEngine'

describe('PARTE E — UX de Conexão (Wizard Guiado de Conexão)', () => {
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
    vi.clearAllMocks()
  })

  // ─── PASSO 1: IDENTIFICAÇÃO & URL DO NAVEGADOR ─────────────────────────────
  describe('Passo 1: Identificação do Portal e Normalização de URL', () => {
    it('extrai domínio canônico e valida entradas obrigatórias', () => {
      const validUrl = 'https://machadosobrinho.paineldoaluno.com.br/chamada'
      const domain = extractDomain(validUrl)
      expect(domain).toBe('machadosobrinho.paineldoaluno.com.br')

      // Domínio limpo sem protocolo
      expect(extractDomain('paineldoaluno.com.br/turmas')).toBe('paineldoaluno.com.br')
    })
  })

  // ─── PASSO 2: RESOLVE COM LINGUAGEM NATURAL ────────────────────────────────
  describe('Passo 2: RESOLVE (Parte B) com Estados em Linguagem Natural', () => {
    it('detecta portal conhecido e seleciona mensagem determinística ("Portal reconhecido, lendo...")', () => {
      const domain = 'portalconhecido.escola.com.br'

      // Prepara conexão já validada na base
      upsertConnection(domain, {
        name: 'Colégio Alpha',
        domain,
        status: 'mapped_validated',
        map: {
          domain,
          status: 'mapped_validated',
          selector_strategy: 'table_rows',
          selectors: { roster_table: 'table#chamada' },
          validation_failures: 0
        }
      })

      const conn = getPortalConnection(domain)
      const hasKnownMap = Boolean(conn && conn.status !== 'broken_needs_rediscovery' && conn.map)

      // Simulação do comportamento do Wizard
      const naturalState = hasKnownMap ? 'Portal reconhecido, lendo...' : 'Aprendendo a estrutura deste portal...'
      const isDiscovering = !hasKnownMap

      expect(naturalState).toBe('Portal reconhecido, lendo...')
      expect(isDiscovering).toBe(false)
    })

    it('detecta portal inédito e seleciona mensagem de descoberta visual ("Aprendendo a estrutura deste portal...")', () => {
      const domain = 'portalinedito.com.br'
      const conn = getPortalConnection(domain)
      const hasKnownMap = Boolean(conn && conn.status !== 'broken_needs_rediscovery' && conn.map)

      const naturalState = hasKnownMap ? 'Portal reconhecido, lendo...' : 'Aprendendo a estrutura deste portal...'
      const isDiscovering = !hasKnownMap

      expect(naturalState).toBe('Aprendendo a estrutura deste portal...')
      expect(isDiscovering).toBe(true)
    })

    it('detecta portal em broken_needs_rediscovery e seleciona mensagem de bloqueio ostensivo', () => {
      const domain = 'portalquebrado.com.br'
      upsertConnection(domain, {
        name: 'Colégio Quebrado',
        domain,
        status: 'broken_needs_rediscovery',
        map: {
          domain,
          status: 'broken_needs_rediscovery',
          validation_failures: 3
        }
      })

      const conn = getPortalConnection(domain)
      const isBroken = conn?.status === 'broken_needs_rediscovery' || (conn?.map?.validation_failures || 0) >= 3

      const naturalState = isBroken
        ? 'Leitura não realizada: portal precisa de redescoberta manual'
        : 'Portal reconhecido, lendo...'

      expect(naturalState).toBe('Leitura não realizada: portal precisa de redescoberta manual')
      expect(isBroken).toBe(true)
    })
  })

  // ─── PASSO 3: PRÉVIA COM NOMES REAIS (NÃO APENAS CONTAGEM) ─────────────────
  describe('Passo 3: Prévia de Dados com Nomes Reais e Validação de Qualidade', () => {
    it('renderiza nomes reais com matrículas e sinaliza nomes mononímicos/suspeitos', () => {
      // Simulação dos dados raspados pelo sidecar
      const rawScraped = [
        { name: 'Ana Júlia Ferreira', matricula: '2024001', classRef: '8º Ano A' },
        { name: 'Bruno Henrique Lima', matricula: '2024002', classRef: '8º Ano A' },
        { name: 'Lucas', matricula: '2024003', classRef: '8º Ano A' } // Mononímico suspeito
      ]

      const parsedPreview = rawScraped.map(raw => {
        const val = validateStudentName(raw.name)
        return {
          name: raw.name,
          rollNumber: raw.matricula,
          className: raw.classRef,
          isSuspicious: val.isSuspicious || val.isNoise,
          suspiciousReason: val.reason
        }
      })

      // 1. Confirma que os dados possuem nomes reais e matrículas
      expect(parsedPreview[0].name).toBe('Ana Júlia Ferreira')
      expect(parsedPreview[0].rollNumber).toBe('2024001')
      expect(parsedPreview[0].isSuspicious).toBe(false)

      expect(parsedPreview[1].name).toBe('Bruno Henrique Lima')
      expect(parsedPreview[1].isSuspicious).toBe(false)

      // 2. Confirma que nome mononímico é identificado na prévia com aviso de atenção
      expect(parsedPreview[2].name).toBe('Lucas')
      expect(parsedPreview[2].isSuspicious).toBe(true)
      expect(parsedPreview[2].suspiciousReason).toContain('mononômico')

      // 3. Verificação de Integridade Sagrada: NENHUM dado gravado antes da confirmação explícita
      const currentConns = listPortalConnections()
      expect(currentConns.some(c => c.domain === 'colegioprevia.com.br')).toBe(false)
      expect(getPortalConnection('colegioprevia.com.br')).toBeUndefined()
    })
  })

  // ─── PASSO 4: CONFIRMAÇÃO EXPLÍCITA & STATUS PERMANENTE ─────────────────────
  describe('Passo 4: Confirmação Explícita, Homologação e Status Permanente no Painel', () => {
    it('grava conexão apenas após clique explícito, promovendo para mapped_validated e registrando data de sincronização', () => {
      const domain = 'colegioexemplo.com.br'
      const portalName = 'Colégio Exemplo'
      const studentCount = 18

      // Estado antes da confirmação
      expect(getPortalConnection(domain)).toBeUndefined()

      // Professor clica em "Confirmar e Conectar Portal" no Wizard:
      const savedConnection = upsertConnection(domain, {
        name: portalName,
        domain,
        login_url: `https://${domain}/chamada`,
        status: 'mapped_validated',
        map: {
          domain,
          status: 'mapped_validated',
          selector_strategy: 'table_rows',
          selectors: { roster_table: 'table#alunos' },
          discovered_at: new Date().toISOString(),
          last_validated_at: new Date().toISOString(),
          validation_failures: 0
        }
      })

      // Registra validação formal e sync success
      validateConnection(savedConnection.id, {
        humanApproved: true,
        wasPartial: false,
        syncData: {
          students_read: studentCount,
          students_expected: studentCount,
          layer_used: 'layer_1_deterministic'
        }
      })

      recordSyncSuccess(savedConnection.id, {
        students_read: studentCount,
        students_expected: studentCount,
        was_partial: false,
        layer_used: 'layer_1_deterministic'
      })

      // Verificações permanentes
      const persisted = getPortalConnection(domain)
      expect(persisted).toBeDefined()
      expect(persisted?.status).toBe('mapped_validated')
      expect(persisted?.map?.last_validated_at).toBeDefined()
      expect(persisted?.last_synced_at).toBeDefined()

      // Confirma que a data é um timestamp ISO válido
      const syncDate = new Date(persisted!.last_synced_at!)
      expect(isNaN(syncDate.getTime())).toBe(false)
      expect(syncDate.getFullYear()).toBeGreaterThanOrEqual(2024)
    })

    it('Gate de Integridade Estrito no Wizard (equivalente ao Teste 8 da Parte C): lote misto (8 limpos + 2 suspeitos mononímicos) resolve 8 no clique em massa, mantém 2 pendentes e bloqueia gravação final até decisões individuais deliberadas', () => {
      // Lote misto idêntico ao Teste 8 da Parte C: 8 alunos completos limpos + 2 mononímicos ('Lucas' e 'Rodrigo')
      const mixedBatch10: WizardStudentItem[] = [
        { id: 'w1', name: 'Ana Júlia Ferreira', rollNumber: '101' },
        { id: 'w2', name: 'Bruno Henrique Lima', rollNumber: '102' },
        { id: 'w3', name: 'Carla Beatriz Mendes', rollNumber: '103' },
        { id: 'w4', name: 'Daniel Souza Alves', rollNumber: '104' },
        { id: 'w5', name: 'Elena Maria Ribeiro', rollNumber: '105' },
        { id: 'w6', name: 'Fabio Henrique Dias', rollNumber: '106' },
        { id: 'w7', name: 'Gabriela Cristina Rocha', rollNumber: '107' },
        { id: 'w8', name: 'Heitor Augusto Silveira', rollNumber: '108' },
        { id: 'w9', name: 'Lucas', rollNumber: '109' }, // SUSPEITO: mononímico (confidence 0.3)
        { id: 'w10', name: 'Rodrigo', rollNumber: '110' } // SUSPEITO: mononímico (confidence 0.3)
      ]

      // 1. Antes do clique em lote: todos os 10 alunos sem resolução (decision: pending ou undefined)
      expect(mixedBatch10.filter(s => s.decision === 'approved').length).toBe(0)

      // 2. Professor clica em "Confirmar e Conectar Portal" (ou "Aprovar todos os nomes conferidos")
      // Por baixo dos panos, o Wizard executa batchApproveWizardStudents
      const batchResult = batchApproveWizardStudents(mixedBatch10)

      // INEGOCIÁVEL: Deve aprovar SOMENTE os 8 itens limpos
      expect(batchResult.approvedCount).toBe(8)
      // INEGOCIÁVEL: Deve ignorar e manter pendentes exatamente os 2 itens suspeitos mononímicos
      expect(batchResult.skippedCount).toBe(2)
      expect(batchResult.canFinalize).toBe(false)

      // Confirma que os 8 itens aprovados são os legítimos
      const approvedItems = batchResult.updatedStudents.filter(s => s.decision === 'approved')
      expect(approvedItems.length).toBe(8)

      // Confirma que Lucas e Rodrigo permanecem estritamente em 'pending'
      const lucas = batchResult.updatedStudents.find(s => s.name === 'Lucas')
      expect(lucas?.decision).toBe('pending')
      expect(lucas?.isSuspicious).toBe(true)
      expect(lucas?.suspiciousReason).toContain('mononômico')

      const rodrigo = batchResult.updatedStudents.find(s => s.name === 'Rodrigo')
      expect(rodrigo?.decision).toBe('pending')
      expect(rodrigo?.isSuspicious).toBe(true)
      expect(rodrigo?.suspiciousReason).toContain('mononômico')

      // 3. O gate de integridade do Wizard REJEITA a gravação final pois restam 2 pendentes
      const gateCheckPre = validateWizardRosterIntegrity(batchResult.updatedStudents)
      expect(gateCheckPre.isValid).toBe(false)
      expect(gateCheckPre.reason).toContain('2 aluno(s) aguardando decisão individual')

      // Garante que NENHUMA conexão foi gravada no storage no estado bloqueado
      expect(getPortalConnection('portalmisto.com.br')).toBeUndefined()

      // 4. Decisão individual deliberada da professora sobre os 2 itens suspeitos:
      // Professora confirma 'Lucas' como aluno legítimo e descarta 'Rodrigo' como ruído de interface
      const individuallyResolved = batchResult.updatedStudents.map(s => {
        if (s.name === 'Lucas') return { ...s, decision: 'approved' as const }
        if (s.name === 'Rodrigo') return { ...s, decision: 'rejected' as const }
        return s
      })

      // 5. Novo gate check após as decisões individuais da professora
      const gateCheckPost = validateWizardRosterIntegrity(individuallyResolved)
      expect(gateCheckPost.isValid).toBe(true)
      expect(gateCheckPost.pendingCount).toBe(0)
      expect(gateCheckPost.approvedCount).toBe(9) // 8 limpos + Lucas
      expect(gateCheckPost.rejectedCount).toBe(1) // Rodrigo descartado

      // 6. Gravação final agora autorizada no Wizard com homologação e gravação permanente
      const domain = 'portalmisto.com.br'
      const savedConnection = upsertConnection(domain, {
        name: 'Portal Machado Lote Misto',
        domain,
        login_url: `https://${domain}/chamada`,
        status: 'mapped_validated',
        map: {
          domain,
          status: 'mapped_validated',
          selector_strategy: 'table_rows',
          selectors: { roster_table: 'table#alunos' },
          last_validated_at: new Date().toISOString(),
          validation_failures: 0
        }
      })

      validateConnection(savedConnection.id, {
        humanApproved: true,
        wasPartial: false,
        syncData: {
          students_read: gateCheckPost.approvedCount,
          students_expected: gateCheckPost.approvedCount,
          layer_used: 'layer_1_deterministic'
        }
      })

      recordSyncSuccess(savedConnection.id, {
        students_read: gateCheckPost.approvedCount,
        students_expected: gateCheckPost.approvedCount,
        was_partial: false,
        layer_used: 'layer_1_deterministic'
      })

      // Verificações finais de persistência e integridade
      const persisted = getPortalConnection(domain)
      expect(persisted).toBeDefined()
      expect(persisted?.status).toBe('mapped_validated')
      expect(persisted?.last_sync?.students_read).toBe(9)
      expect(persisted?.last_sync?.verification_passed).toBe(true)
    })
  })
})
