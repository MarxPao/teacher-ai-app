// lib/runner-ext/ssoHandoff.ts
// Gerenciador seguro de handoff para popups e abas de autenticação/SSO (MV3)
// Garante privacidade absoluta: sem injeção de scripts, sem leitura de DOM, sem captura de tela na aba de auth.

import { RunnerError } from '../runner/types'
import type { Driver } from '../runner/types'

declare const chrome: any

export interface SSOHandoffAuditEntry {
  event: 'auth_handoff_started' | 'auth_handoff_completed'
  from: string
  to: string
  at: string
}

export interface SSOHandoffState {
  runId: string
  targetTabId: number
  authTabId?: number
  originHost: string
  authHost?: string
  status: 'in_handoff' | 'completed' | 'timeout' | 'interrupted'
  startedAt: number
}

export interface SSOHandoffConfig {
  runId: string
  targetTabId: number
  originHost: string
  allowedHosts: string[]
  timeoutMs?: number
  expectFingerprint?: any
  driver?: Driver
  validateFingerprint?: (driver: Driver, fingerprint?: any) => Promise<boolean>
  onEvent?: (event: { type: string; runId: string; data: Record<string, any> }) => void
  onAudit?: (entry: SSOHandoffAuditEntry) => Promise<void> | void
  isAborted?: () => boolean
}

export function extractDomain(urlStr: string): string {
  if (!urlStr) return ''
  try {
    const parsed = new URL(urlStr)
    return parsed.hostname.toLowerCase()
  } catch {
    // Caso receba host puro sem protocolo
    const sanitized = urlStr.replace(/^https?:\/\//i, '').split('/')[0].split('?')[0].split(':')[0]
    return sanitized.toLowerCase()
  }
}

export function isHostAllowed(host: string, allowedHosts: string[]): boolean {
  if (!host || !Array.isArray(allowedHosts) || allowedHosts.length === 0) {
    return false
  }
  const cleanHost = extractDomain(host)
  return allowedHosts.some((pattern) => {
    const cleanPattern = extractDomain(pattern)
    if (cleanPattern === cleanHost) return true
    if (cleanPattern.startsWith('*.') && cleanHost.endsWith(cleanPattern.slice(1))) return true
    return false
  })
}

export class SSOHandoffManager {
  private auditLog: SSOHandoffAuditEntry[] = []
  private authTabId?: number
  private authHost?: string
  private activeState: SSOHandoffState | null = null
  private timer: any = null
  private tabCreatedListener: ((tab: any) => void) | null = null
  private tabUpdatedListener: ((tabId: number, changeInfo: any, tab: any) => void) | null = null
  private tabRemovedListener: ((tabId: number) => void) | null = null
  private handoffResolver: ((success: boolean) => void) | null = null
  private handoffRejecter: ((err: any) => void) | null = null

  constructor(private readonly config: SSOHandoffConfig) {
    this.attachTabListeners()
  }

  private attachTabListeners(): void {
    if (typeof chrome === 'undefined' || !chrome.tabs) return

    if (chrome.tabs.onCreated?.addListener) {
      this.tabCreatedListener = (tab: any) => {
        if (tab && tab.openerTabId === this.config.targetTabId) {
          this.authTabId = tab.id
        }
      }
      chrome.tabs.onCreated.addListener(this.tabCreatedListener)
    }

    if (chrome.tabs.onUpdated?.addListener) {
      this.tabUpdatedListener = (tabId: number, changeInfo: any) => {
        if (tabId === this.authTabId && changeInfo?.url) {
          this.handleAuthNavigation(changeInfo.url).catch((err) => {
            if (this.handoffRejecter) this.handoffRejecter(err)
          })
        }
      }
      chrome.tabs.onUpdated.addListener(this.tabUpdatedListener)
    }

    if (chrome.tabs.onRemoved?.addListener) {
      this.tabRemovedListener = (tabId: number) => {
        if (tabId === this.authTabId) {
          this.handlePopupClosed().catch((err) => {
            if (this.handoffRejecter) this.handoffRejecter(err)
          })
        }
      }
      chrome.tabs.onRemoved.addListener(this.tabRemovedListener)
    }
  }

  public async checkRecycledWorker(): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage?.session?.get) {
      try {
        const stored = await chrome.storage.session.get('sso_handoff_state')
        if (stored?.sso_handoff_state?.status === 'in_handoff') {
          await chrome.storage.session.remove('sso_handoff_state')
          throw new RunnerError(
            'E_INTERRUPTED',
            'Service worker reciclado durante handoff; sem retomada automática'
          )
        }
      } catch (err) {
        if (err instanceof RunnerError) throw err
      }
    }
  }

  public async handleAuthNavigation(urlStr: string): Promise<void> {
    const domain = extractDomain(urlStr)
    if (!domain) return

    // 1. Se navegou para domínio de login: deve estar estritamente em allowed_hosts
    if (!isHostAllowed(domain, this.config.allowedHosts)) {
      await this.cleanup()
      throw new RunnerError(
        'E_HOST_NOT_ALLOWED',
        `Host de autenticação '${domain}' não permitido em allowed_hosts`
      )
    }

    // 2. Se já estiver no host de login e ainda não iniciou handoff
    if (domain !== this.config.originHost && !this.activeState) {
      await this.enterHandoff(domain)
      return
    }

    // 3. Se retornou ao host de origem permitido a partir da tela de auth
    if (domain === this.config.originHost && this.activeState?.status === 'in_handoff') {
      await this.completeHandoff()
    }
  }

  public async enterHandoff(authDomain: string): Promise<void> {
    this.authHost = authDomain
    this.activeState = {
      runId: this.config.runId,
      targetTabId: this.config.targetTabId,
      authTabId: this.authTabId,
      originHost: this.config.originHost,
      authHost: authDomain,
      status: 'in_handoff',
      startedAt: Date.now(),
    }

    // Salva estado exclusivamente em chrome.storage.session
    if (typeof chrome !== 'undefined' && chrome.storage?.session?.set) {
      await chrome.storage.session.set({ sso_handoff_state: this.activeState }).catch(() => {})
    }

    // Auditoria e eventos sem URL completa nem query string
    const entry: SSOHandoffAuditEntry = {
      event: 'auth_handoff_started',
      from: this.config.originHost,
      to: authDomain,
      at: new Date().toISOString(),
    }
    this.auditLog.push(entry)
    if (this.config.onAudit) {
      await this.config.onAudit(entry)
    }

    if (this.config.onEvent) {
      this.config.onEvent({
        type: 'auth_handoff_started',
        runId: this.config.runId,
        data: { from: this.config.originHost, to: authDomain },
      })
    }

    const timeout = this.config.timeoutMs ?? 60000
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.handleTimeout().catch(() => {})
    }, timeout)
  }

  public async waitForCompletion(): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.handoffResolver = resolve
      this.handoffRejecter = reject
    })
  }

  public async completeHandoff(): Promise<void> {
    if (!this.activeState || this.activeState.status !== 'in_handoff') return
    if (this.timer) clearTimeout(this.timer)

    // Valida o fingerprint ao retornar para o host permitido
    if (this.config.driver) {
      let matched = true
      if (this.config.validateFingerprint) {
        matched = await this.config.validateFingerprint(this.config.driver, this.config.expectFingerprint)
      } else if (this.config.driver.matchFingerprint && this.config.expectFingerprint) {
        const res = await this.config.driver.matchFingerprint(this.config.expectFingerprint)
        matched = Boolean(res.matched)
      }

      if (!matched) {
        await this.cleanup()
        const err = new RunnerError(
          'E_FINGERPRINT_MISMATCH',
          'Fingerprint da página diverge do esperado após autenticação SSO'
        )
        if (this.handoffRejecter) this.handoffRejecter(err)
        throw err
      }
    }

    this.activeState.status = 'completed'
    if (typeof chrome !== 'undefined' && chrome.storage?.session?.remove) {
      await chrome.storage.session.remove('sso_handoff_state').catch(() => {})
    }

    const entry: SSOHandoffAuditEntry = {
      event: 'auth_handoff_completed',
      from: this.authHost || 'sso',
      to: this.config.originHost,
      at: new Date().toISOString(),
    }
    this.auditLog.push(entry)
    if (this.config.onAudit) {
      await this.config.onAudit(entry)
    }

    if (this.config.onEvent) {
      this.config.onEvent({
        type: 'auth_handoff_completed',
        runId: this.config.runId,
        data: { from: this.authHost || 'sso', to: this.config.originHost },
      })
    }

    if (this.handoffResolver) {
      this.handoffResolver(true)
    }
    await this.cleanup()
  }

  public async handlePopupClosed(): Promise<void> {
    if (this.activeState?.status === 'in_handoff') {
      // Popup fechado sem retorno validado -> timeout fail-closed
      await this.handleTimeout()
    }
  }

  private async handleTimeout(): Promise<void> {
    await this.cleanup()
    const err = new RunnerError(
      'E_HANDOFF_TIMEOUT',
      'Timeout de autenticação SSO expirado sem retorno confirmado'
    )
    if (this.handoffRejecter) {
      this.handoffRejecter(err)
    }
    throw err
  }

  public getAuditLog(): SSOHandoffAuditEntry[] {
    return [...this.auditLog]
  }

  public async cleanup(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      if (this.tabCreatedListener && chrome.tabs.onCreated?.removeListener) {
        try { chrome.tabs.onCreated.removeListener(this.tabCreatedListener) } catch {}
      }
      if (this.tabUpdatedListener && chrome.tabs.onUpdated?.removeListener) {
        try { chrome.tabs.onUpdated.removeListener(this.tabUpdatedListener) } catch {}
      }
      if (this.tabRemovedListener && chrome.tabs.onRemoved?.removeListener) {
        try { chrome.tabs.onRemoved.removeListener(this.tabRemovedListener) } catch {}
      }
    }
    this.tabCreatedListener = null
    this.tabUpdatedListener = null
    this.tabRemovedListener = null
  }
}
