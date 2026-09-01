'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

    if (isLocalhost) {
      // In development, aggressively unregister service workers and clear cache storage
      // to prevent stale chunk errors during HMR and git pulls
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (const registration of registrations) {
          registration.unregister()
        }
      })
      if ('caches' in window) {
        caches.keys().then(names => {
          for (const name of names) {
            caches.delete(name)
          }
        })
      }
    } else {
      // In production, register the service worker cleanly
      const onLoad = () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {})
      }
      window.addEventListener('load', onLoad)
      return () => window.removeEventListener('load', onLoad)
    }
  }, [])

  return null
}
