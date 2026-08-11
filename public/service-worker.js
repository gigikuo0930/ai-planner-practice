const CACHE_NAME = 'ai-practice-v1'
const APP_SHELL = ['./', './index.html', './manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok && new URL(event.request.url).origin === self.location.origin) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
          }
          return response
        })
        .catch(() => cached || caches.match('./index.html'))
      return cached || network
    }),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_RESOURCES' || !Array.isArray(event.data.resources)) return
  const resources = event.data.resources.filter((url) => typeof url === 'string' && url.startsWith(self.location.origin))
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(resources)))
})
