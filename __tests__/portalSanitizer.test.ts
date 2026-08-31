import { describe, it, expect, beforeEach } from 'vitest'

// Mock de localStorage e window para ambiente Node/Vitest
const storageMap = new Map<string, string>()
const mockLocalStorage = {
  getItem: (key: string) => storageMap.get(key) || null,
  setItem: (key: string, value: string) => storageMap.set(key, value),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
}

// Configura globais para o teste
if (typeof global.localStorage === 'undefined') {
  Object.defineProperty(global, 'localStorage', { value: mockLocalStorage, writable: true })
}
if (typeof global.window === 'undefined') {
  Object.defineProperty(global, 'window', {
    value: {
      localStorage: mockLocalStorage,
      dispatchEvent: () => true,
      CustomEvent: class CustomEvent { constructor(public type: string, public detail?: any) {} }
    },
    writable: true
  })
}

import {
  hasActivePortalConsent,
  recordPortalConsent,
  validateCommunityPortalMap,
  validateDiscoveredPortalMapNoPII,
  logPortalActionRecord,
  getPortalActionLogs,
  purgePortalActionLogs,
  exportPortalActionLogsCSV
} from '../lib/portalSanitizer'

describe('portalSanitizer & LGPD Compliance Suite', () => {
  beforeEach(async () => {
    storageMap.clear()
  })

  it('gerencia consentimento geral de agência (1 vez por conta)', () => {
    expect(hasActivePortalConsent()).toBe(false)
    const rec = recordPortalConsent()
    expect(rec.termsVersion).toBe('v1.0_2026-08')
    expect(hasActivePortalConsent()).toBe(true)
  })

  it('valida perfis comunitários e rejeita seletores com possíveis dados pessoais (CPFs, e-mails, etc.)', () => {
    const cleanProfile = {
      id: 'custom_clean',
      name: 'Portal Limpo',
      actions: [
        {
          fields: [
            { label: 'Assunto', selectors: ['input[name="assunto"]', 'input[placeholder="Tema"]'] }
          ]
        }
      ]
    }
    const cleanResult = validateCommunityPortalMap(cleanProfile)
    expect(cleanResult.valid).toBe(true)
    expect(cleanResult.violations.length).toBe(0)

    const dirtyProfile = {
      id: 'custom_dirty',
      name: 'Portal com CPF',
      actions: [
        {
          fields: [
            { label: 'Nota', selectors: ['input[name="aluno_123.456.789-00"]'] }
          ]
        }
      ]
    }
    const dirtyResult = validateCommunityPortalMap(dirtyProfile)
    expect(dirtyResult.valid).toBe(false)
    expect(dirtyResult.violations.length).toBeGreaterThan(0)
  })

  it('registra e recupera ações na Trilha de Auditoria com exportação CSV', async () => {
    await logPortalActionRecord({
      platform: 'machado',
      platformName: 'Machado Sobrinho',
      actionType: 'diary',
      classRef: '9º Ano B',
      studentCount: 28,
      status: 'injected_visual',
      summary: 'Lançamento de Diário de Classe - Present Perfect',
      rawDetails: { topic: 'Present Perfect', notes: 'Exercícios p. 45' }
    })

    const logs = await getPortalActionLogs()
    expect(logs.length).toBe(1)
    expect(logs[0].platform).toBe('machado')
    expect(logs[0].classRef).toBe('9º Ano B')

    const csv = await exportPortalActionLogsCSV()
    expect(csv).toContain('Machado Sobrinho')
    expect(csv).toContain('9º Ano B')

    await purgePortalActionLogs()
    const purged = await getPortalActionLogs()
    expect(purged.length).toBe(0)
  })

  it('validateDiscoveredPortalMapNoPII bloqueia mapas contendo nomes de alunos, CPFs ou matrículas', () => {
    const cleanMap = {
      portal_domain: 'paineldoaluno.com.br',
      discovered_selectors: {
        roster_table: 'table.grid-alunos',
        name_column: 1,
        id_column: 0
      }
    }
    expect(validateDiscoveredPortalMapNoPII(cleanMap).valid).toBe(true)

    const dirtyMapName = {
      portal_domain: 'paineldoaluno.com.br',
      discovered_selectors: {
        roster_table: 'table tr[data-student="mariana_silva"]'
      }
    }
    const nameCheck = validateDiscoveredPortalMapNoPII(dirtyMapName)
    expect(nameCheck.valid).toBe(false)
    expect(nameCheck.violations.length).toBeGreaterThan(0)

    const dirtyMapCPF = {
      portal_domain: 'paineldoaluno.com.br',
      discovered_selectors: {
        roster_table: 'table',
        custom_query: 'input[name="123.456.789-00"]'
      }
    }
    const cpfCheck = validateDiscoveredPortalMapNoPII(dirtyMapCPF)
    expect(cpfCheck.valid).toBe(false)
  })
})
