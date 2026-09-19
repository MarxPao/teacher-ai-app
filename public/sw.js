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

// Fetch: network-first, sem interceptar _next/ ou dev assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Skip non-GET, cross-origin, APIs e chunks dinâmicos do Next.js
  if (event.request.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/_next/')) return

  // Network-first para páginas estáticas
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

// Sync em background (quando reconectar à internet)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-grades') {
    event.waitUntil(syncPendingGrades())
  }
})

async function syncPendingGrades() {
  try {
    // No ServiceWorker, localStorage não existe; usamos IndexedDB seguro se disponível
    if (!('indexedDB' in self)) return
    const dbReq = indexedDB.open('teacher_ai_resilient_db', 1)
    dbReq.onsuccess = () => {
      const db = dbReq.result
      if (db.objectStoreNames.contains('storage_guard_kv')) {
        const tx = db.transaction('storage_guard_kv', 'readonly')
        const req = tx.objectStore('storage_guard_kv').get('pending_sync')
        req.onsuccess = () => {
          if (req.result) {
            console.log('[SW] Sync pendente encontrado para transmissão offline.')
          }
        }
      }
    }
  } catch (err) {
    console.warn('[SW] Falha durante background sync:', err)
  }
}

