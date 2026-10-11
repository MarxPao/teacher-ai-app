// lib/recorder-dom/settle.ts
// Observador de estabilização do DOM com MutationObserver e debounce

export interface SettleResult {
  settled: boolean
  mutationCount: number
  elapsedMs: number
}

export function waitForSettled(
  doc: Document,
  debounceMs: number = 250,
  maxTimeoutMs: number = 2000
): Promise<SettleResult> {
  return new Promise((resolve) => {
    let timer: any = null
    let mutationCount = 0
    const start = Date.now()

    if (typeof MutationObserver === 'undefined' || !doc.body) {
      resolve({ settled: true, mutationCount: 0, elapsedMs: 0 })
      return
    }

    const observer = new MutationObserver((mutations) => {
      mutationCount += mutations.length
      if (timer) clearTimeout(timer)
      timer = setTimeout(finish, debounceMs)
    })

    function finish() {
      if (timer) clearTimeout(timer)
      observer.disconnect()
      resolve({
        settled: true,
        mutationCount,
        elapsedMs: Date.now() - start,
      })
    }

    observer.observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })

    // Timeout de segurança
    setTimeout(finish, maxTimeoutMs)
    timer = setTimeout(finish, debounceMs)
  })
}
