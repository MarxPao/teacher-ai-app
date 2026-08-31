import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  modelSupportsVision,
  getTeacherVisionModelStatus,
  extractDomain,
  saveDiscoveredPortalMap,
  saveLocalDiscoveredPortalMap,
  getAllDiscoveredPortalMaps,
  DiscoveredPortalMap,
  getPortalProfiles,
  upsertPortalProfile
} from '../lib/portalActionsEngine'
import { reconcileRosterBatch } from '../lib/rosterReconciler'
import { createBrowserTask } from '../lib/browserAutomationClient'

describe('ConnectedPortalsPanel & In-App Portal Flow Suite', () => {
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

  // 1. Suporte a Visão Computacional (Capability Routing)
  describe('1. Verificação de Visão Computacional (BYOK)', () => {
    it('reconhece modelos multimodais com suporte a visão (OpenAI, Gemini, Anthropic)', () => {
      expect(modelSupportsVision('openai', 'gpt-4o')).toBe(true)
      expect(modelSupportsVision('openai', 'gpt-4o-mini')).toBe(true)
      expect(modelSupportsVision('anthropic', 'claude-3-5-sonnet')).toBe(true)
      expect(modelSupportsVision('gemini', 'gemini-2.0-flash')).toBe(true)
      expect(modelSupportsVision('gemini', 'gemini-1.5-pro')).toBe(true)
    })

    it('rejeita modelos ou provedores text-only sem visão', () => {
      expect(modelSupportsVision('groq', 'llama-3.3-70b')).toBe(false)
      expect(modelSupportsVision('mistral', 'mistral-large')).toBe(false)
      expect(modelSupportsVision('', '')).toBe(false)
    })

    it('getTeacherVisionModelStatus identifica quando o professor usa modelo text-only', () => {
      // Simula configuração no localStorage com Groq (text-only)
      const textOnlyApis = [
        { id: 'groq', name: 'Groq', apiKey: 'gsk_123', model: 'llama-3.3-70b-versatile' }
      ]
      localStorage.setItem('teacher_apis', JSON.stringify(textOnlyApis))

      const status = getTeacherVisionModelStatus()
      expect(status.hasVisionSupport).toBe(false)
      expect(status.reason).toContain('apenas em modo texto')
    })

    it('getTeacherVisionModelStatus aprova quando há modelo OpenAI/Gemini com chave', () => {
      const visionApis = [
        { id: 'openai', name: 'OpenAI', apiKey: 'sk-123', model: 'gpt-4o' }
      ]
      localStorage.setItem('teacher_apis', JSON.stringify(visionApis))

      const status = getTeacherVisionModelStatus()
      expect(status.hasVisionSupport).toBe(true)
      expect(status.activeProvider).toBe('OpenAI')
    })
  })

  // 2. Extração de Domínio
  describe('2. Extração e Normalização de Domínio', () => {
    it('extrai domínio limpo de URLs complexas', () => {
      expect(extractDomain('https://machadosobrinho.paineldoaluno.com.br/professor_painel')).toBe('machadosobrinho.paineldoaluno.com.br')
      expect(extractDomain('http://portal.positivo.com.br/alunos?turma=9A')).toBe('portal.positivo.com.br')
      expect(extractDomain('paineldoaluno.com.br')).toBe('paineldoaluno.com.br')
      expect(extractDomain('')).toBe('')
    })
  })

  // 3. Status de Cards do Painel de Portais
  describe('3. Cálculo de Status dos Cards (Pronto / Revisar / Configurar / Conectar)', () => {
    it('marca portal como Pronto quando possui mapa ativo sem falhas', async () => {
      saveLocalDiscoveredPortalMap({
        portal_domain: 'paineldoaluno.com.br',
        portal_display_name: 'Machado Sobrinho',
        discovered_selectors: {
          roster_table: 'table#alunos',
          name_column: 1,
          id_column: 0
        },
        discovery_confidence: 'high'
      })

      const maps = await getAllDiscoveredPortalMaps(null)
      const map = maps.find(m => m.portal_domain === 'paineldoaluno.com.br')
      expect(map).toBeDefined()
      expect(map?.validation_failures).toBe(0)
    })

    it('marca portal como Revisar se validation_failures for maior que 0', async () => {
      const mapWithFailure: DiscoveredPortalMap = {
        id: 'map_fail_1',
        portal_domain: 'colegio.edu.br',
        portal_display_name: 'Colégio Teste',
        discovered_selectors: { roster_table: 'table', name_column: 1, id_column: 0 },
        discovery_confidence: 'medium',
        validation_failures: 1,
        last_validated_at: new Date().toISOString()
      }
      localStorage.setItem('teacher_discovered_portal_maps', JSON.stringify([mapWithFailure]))

      const maps = await getAllDiscoveredPortalMaps(null)
      const found = maps.find(m => m.portal_domain === 'colegio.edu.br')
      expect(found?.validation_failures).toBe(1)
    })
  })

  // 4. Fluxo In-App Conectar Portal
  describe('4. Fluxo In-App "Conectar Portal" (100% sem terminal)', () => {
    it('cria tarefa read_roster, executa reconciliação e salva mapa em modo Pronto', async () => {
      // 1. Professor cadastra portal na interface
      const newPortal = {
        id: 'portal_santacatarina',
        name: 'Santa Catarina',
        shortName: 'Santa Catarina',
        url: 'https://santacatarina.escola.com.br/chamada',
        matchUrl: 'santacatarina.escola.com.br',
        icon: 'ti-school',
        color: '#8b5e3c',
        bg: '#faf6f0',
        border: '#8b5e3c',
        description: 'Portal conectado via Browser Harness',
        category: 'Diário & Notas',
        isCustom: true
      }
      upsertPortalProfile(newPortal)

      const profiles = getPortalProfiles()
      expect(profiles.some(p => p.id === 'portal_santacatarina')).toBe(true)

      // 2. Cria tarefa browser_automation_task
      const task = await createBrowserTask({
        portal: 'santacatarina.escola.com.br',
        actionType: 'read_roster',
        payload: {
          classRef: 'all',
          read_only: true
        }
      })
      expect(task).toBeDefined()
      expect(task?.action_type).toBe('read_roster')

      // 3. Simula dados lidos e reconciliação
      const scraped = [
        { name: 'Ana Júlia Ferreira', rollNumber: '01', portal_native_id: 'MAT_001', status: 'active', classRef: '7º Ano A' },
        { name: 'Bruno Henrique Lima', rollNumber: '02', portal_native_id: 'MAT_002', status: 'active', classRef: '7º Ano A' }
      ]
      const localStudents: any[] = []
      const recResult = reconcileRosterBatch(scraped, localStudents, { portalName: 'Santa Catarina' })

      expect(recResult.totalPortalCount).toBe(2)
      expect(recResult.newImportedCount).toBe(2)

      // 4. Salva o mapa descoberto (memorização da Camada 2)
      const mapId = saveLocalDiscoveredPortalMap({
        portal_domain: 'santacatarina.escola.com.br',
        portal_display_name: 'Santa Catarina',
        discovered_selectors: {
          roster_table: 'table#lista-chamada',
          name_column: 1,
          id_column: 0
        },
        discovery_confidence: 'high'
      })

      expect(mapId).toBeDefined()

      // 5. Verifica que o portal agora está com mapa salvo
      const maps = await getAllDiscoveredPortalMaps(null)
      const savedMap = maps.find(m => m.portal_domain === 'santacatarina.escola.com.br')
      expect(savedMap).toBeDefined()
      expect(savedMap?.discovery_confidence).toBe('high')
    })
  })
})
