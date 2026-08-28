const CACHE_NAME = 'neptera-shell-v1';
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/brand/neptera/icons/neptera-favicon-16.png',
  '/brand/neptera/icons/neptera-favicon-32.png',
  '/brand/neptera/icons/neptera-favicon-48.png',
  '/brand/neptera/icons/neptera-apple-touch-icon-180.png',
  '/brand/neptera/icons/neptera-app-icon-192.png',
  '/brand/neptera/icons/neptera-app-icon-512.png',
  '/brand/neptera/icons/neptera-app-icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});
