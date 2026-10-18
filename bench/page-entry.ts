// bench/page-entry.ts
// Injetado em cada página do portal sintético: expõe o DomDriver real e um sinal de "página quieta".
import { DomDriver } from '../lib/runner-dom/driver'
import { installClosedShadowRootHook } from '../lib/runner-dom/selectors'

installClosedShadowRootHook()

let pending = 0
let lastMutation = Date.now()

const origFetch = window.fetch.bind(window)
window.fetch = (...args: Parameters<typeof fetch>) => {
  pending++
  return origFetch(...args).finally(() => {
    pending--
    lastMutation = Date.now()
  })
}

function startObserver() {
  new MutationObserver(() => {
    lastMutation = Date.now()
  }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true })
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver)
else startObserver()

let driver: DomDriver | null = null

;(window as any).__bench = {
  quiet(ms = 300): boolean {
    return document.readyState === 'complete' && pending === 0 && Date.now() - lastMutation >= ms
  },
  async call(method: string, args: any[]) {
    try {
      if (!driver) driver = new DomDriver(document, [location.hostname])
      const fn = (driver as any)[method]
      if (typeof fn !== 'function') return { ok: false, error: `Driver sem método ${method}` }
      const value = await fn.apply(driver, args)
      return { ok: true, value: value === undefined ? null : JSON.parse(JSON.stringify(value)) }
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e), code: e?.code }
    }
  },
}
