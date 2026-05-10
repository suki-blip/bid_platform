// easyfundraisings / BidMaster service worker.
//
// Strategy:
//   • Static assets (/_next/static, icons, manifest) → cache-first (immutable, hash-keyed by Next)
//   • Navigations (HTML) → network-first with offline fallback (so users see fresh content)
//   • API calls (/api/*) → network only (never cached, sensitive data)
//
// On version bump, increment CACHE_VERSION below — old caches are deleted on activate.

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const PAGE_CACHE = `pages-${CACHE_VERSION}`;

// Pre-cache the critical shell on install
const PRECACHE_URLS = [
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  // Activate this SW immediately, replacing the old one.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Take control of open tabs.
      await self.clients.claim();
      // Delete caches from older versions.
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => !n.endsWith(CACHE_VERSION))
          .map((n) => caches.delete(n)),
      );
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return;

  // API routes — never cache, never intercept (let the browser go straight to the network).
  if (url.pathname.startsWith('/api/')) return;

  // Static immutable assets — cache-first.
  const isStatic =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icon-') ||
    url.pathname === '/apple-touch-icon.png' ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname.startsWith('/favicon');

  if (isStatic) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Navigations (HTML pages) — network-first, fall back to cached version when offline.
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(request, PAGE_CACHE));
    return;
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    // Last-chance fallback for an icon request, etc.
    return new Response('', { status: 504 });
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    // Only cache successful HTML responses.
    if (res.ok && res.headers.get('content-type')?.includes('text/html')) {
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Last-resort offline shell — just an apology in plain text.
    return new Response(
      `<!doctype html><html><head><meta charset="utf-8"><title>Offline</title></head>
       <body style="font-family:system-ui;padding:40px;text-align:center;background:#fbf7ec;color:#0a1019">
         <h1 style="font-size:22px;margin-bottom:8px">You're offline</h1>
         <p style="opacity:.7">Reconnect to load this page.</p>
       </body></html>`,
      { status: 503, headers: { 'content-type': 'text/html' } },
    );
  }
}
