// Service Worker — TeacherAI PWA
// Cache Strategy: Cache-First para assets estáticos, Network-First para API

const CACHE_NAME = 'teacher-ai-v2'
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
]

// Install: pré-cache dos assets essenciais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// Activate: limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch: cache-first para assets, network-first para API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Skip non-GET, cross-origin, e chamadas de API de IA
  if (event.request.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // Cache-first para assets estáticos (_next/static)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(res => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
          return res
        })
      )
    )
    return
  }

  // Network-first para páginas HTML
  event.respondWith(
    fetch(event.request)
      .then(res => {
        const clone = res.clone()
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        return res
      })
      .catch(() => caches.match(event.request))
  )
})

// Sync em background (quando reconectar)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-grades') {
    event.waitUntil(syncPendingGrades())
  }
})

async function syncPendingGrades() {
  try {
    const pending = JSON.parse(localStorage.getItem('pending_sync') || '[]')
    if (!pending.length) return
    // Em produção: POST para API de sincronização
    console.log('[SW] Sync:', pending.length, 'items pendentes')
  } catch {}
}
