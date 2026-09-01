const CACHE_NAME = 'neptera-shell-v2';
const MANAGED_CACHE_PREFIXES = ['neptera-shell-', 'stock-on-shell-'];
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

async function putSuccessfulResponse(request, response) {
  if (!response.ok || response.status !== 200) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

async function networkFirst(request, fallbackRequest = request) {
  try {
    const response = await fetch(request);
    try {
      await putSuccessfulResponse(fallbackRequest, response);
    } catch {
      // A resposta da rede continua válida mesmo se o dispositivo não puder atualizar o cache.
    }
    return response;
  } catch {
    return (await caches.match(fallbackRequest)) || Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  try {
    await putSuccessfulResponse(request, response);
  } catch {
    // Cache é melhoria progressiva; nunca bloqueia uma resposta de rede válida.
  }
  return response;
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && MANAGED_CACHE_PREFIXES.some(prefix => key.startsWith(prefix)))
          .map(key => caches.delete(key))
      )),
      self.clients.claim(),
    ])
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, '/'));
    return;
  }

  const needsFreshIdentity = url.pathname === '/manifest.webmanifest'
    || url.pathname.startsWith('/brand/neptera/')
    || url.pathname.startsWith('/downloads/');

  event.respondWith(needsFreshIdentity ? networkFirst(event.request) : cacheFirst(event.request));
});
