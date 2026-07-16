const CACHE_VERSION = 'v4';
const CACHE_NAME = `gymtracker-${CACHE_VERSION}`;
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/db.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// ─── Install: pre-cache all assets and delete stale caches immediately ─────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
    ])
  );
  self.skipWaiting();
});

// ─── Activate: remove stale caches ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Message: listen for skipWaiting command ──────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── Fetch: network-first for HTML, cache-first for other assets ──────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Network-first strategy for HTML files (e.g. navigation or index/root)
  const isHtml = event.request.mode === 'navigate' || 
                 url.pathname.endsWith('.html') || 
                 (url.origin === self.location.origin && url.pathname === '/');

  if (isHtml) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return caches.match('/index.html');
          });
        })
    );
  } else {
    // Cache-first strategy for non-HTML assets (JS, CSS, images, CDNs, fonts, etc.)
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;

        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  }
});
