/**
 * SportsIQ Service Worker — Offline App Shell
 *
 * Caching strategies:
 *  - _next/static/**  : Cache-First (hashed filenames, safe forever)
 *  - /icons/**, /manifest.json, /favicon.svg : Cache-First (static assets)
 *  - Page navigations : Network-First with offline fallback
 *  - /api/**          : Network-Only (never cache auth/data calls)
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `siq-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `siq-static-${CACHE_VERSION}`;

// App-shell pages to pre-cache at install
const SHELL_URLS = [
  '/',
  '/home',
  '/capture',
  '/plans',
  '/roster',
  '/sessions',
  '/settings',
  '/assistant',
  '/offline',
];

// Static assets to pre-cache at install
const STATIC_URLS = [
  '/manifest.json',
  '/favicon.svg',
  '/logo.svg',
];

// ─── Install ────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then((cache) =>
        cache.addAll(SHELL_URLS).catch(() => {
          // Individual shell URLs may 401-redirect; ignore failures
        })
      ),
      caches.open(STATIC_CACHE).then((cache) =>
        cache.addAll(STATIC_URLS).catch(() => {})
      ),
    ]).then(() => self.skipWaiting())
  );
});

// ─── Activate ────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch ───────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Never intercept API, auth, or Next.js internals
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/_next/data/') ||
    url.pathname.startsWith('/__nextjs')
  ) {
    return;
  }

  // _next/static — Cache-First (hashed, can be cached indefinitely)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Static public assets — Cache-First
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/favicon.svg' ||
    url.pathname === '/logo.svg' ||
    /\.(png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Page navigations — Network-First with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }
});

// ─── Strategies ──────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Try cache first, then offline page
    const cached = await caches.match(request);
    if (cached) return cached;

    // Try to serve the closest shell page
    const url = new URL(request.url);
    const shellPage = getBestShellPage(url.pathname);
    const shellCached = await caches.match(shellPage);
    if (shellCached) return shellCached;

    // Last resort: offline page
    const offlineCached = await caches.match('/offline');
    if (offlineCached) return offlineCached;

    return new Response(OFFLINE_HTML, {
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

function getBestShellPage(pathname) {
  // Map deep paths to their shell parent
  const shells = ['/home', '/capture', '/plans', '/roster', '/sessions', '/settings', '/assistant'];
  for (const shell of shells) {
    if (pathname.startsWith(shell)) return shell;
  }
  return '/home';
}

// ─── Background Sync ─────────────────────────────────────────────────────────
//
// When the device regains connectivity the browser fires a 'sync' event.
// We post a message to all open clients so the in-page sync engine can flush
// the IndexedDB observation queue back to the server without a full page reload.

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-observations') {
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: 'SYNC_OBSERVATIONS' });
  }
}

// ─── Inline offline page (fallback when /offline isn't cached) ────────────────

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SportsIQ — Offline</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, sans-serif;
      background: #09090b;
      color: #f4f4f5;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100dvh;
      padding: 2rem;
      text-align: center;
    }
    .icon { font-size: 3rem; margin-bottom: 1.5rem; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.75rem; }
    p { color: #a1a1aa; font-size: 0.95rem; line-height: 1.6; max-width: 28ch; margin-bottom: 2rem; }
    a {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: #f97316;
      color: #fff;
      font-weight: 600;
      font-size: 0.9rem;
      padding: 0.75rem 1.5rem;
      border-radius: 0.75rem;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="icon">📵</div>
  <h1>You're offline</h1>
  <p>Check your connection — your data will sync as soon as you're back online.</p>
  <a href="/home">Try again</a>
</body>
</html>`;
