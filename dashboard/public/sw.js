// Viral Empire — Push Notification Service Worker
// Vite serves everything in /public at the root path, so this is available at /sw.js

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Viral Empire', message: event.data?.text() || '' }
  }

  const title = data.title || 'Viral Empire'
  const options = {
    body: data.message || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.type || 'notification',
    data: { url: '/' },
    requireInteraction: data.level === 'error',
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(self.location.origin))
        if (existing) return existing.focus()
        return self.clients.openWindow(event.notification.data?.url || '/')
      })
  )
})
