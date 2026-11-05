/**
 * Service Worker for NH POS Shop PWA
 * Version: v17.5.1
 * Comprehensive Offline & GitHub Pages Support
 */
const SW_VERSION = 'v17.5.1';
const CACHE_NAME = 'nh-pos-' + SW_VERSION;

// Core static assets to precache immediately on install
const CORE_ASSETS = [
  './',
  'index.html',
  '404.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'icon.png',
  'icon1.png',
  'apple-touch-icon.png',
  'icon.svg'
];

const INJECTED_ASSETS = [
  /* __BUILD_ASSETS__ */
];

const PRECACHE_ASSETS = Array.from(new Set([...CORE_ASSETS, ...INJECTED_ASSETS]));

// 1. FAIL-SAFE INSTALL:
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        PRECACHE_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn('[SW] Precache skipped for:', asset, err && err.message);
          })
        )
      );
    })
  );
});

// 2. ACTIVATE: Purge older caches, claim clients immediately, and refresh stuck tabs
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      let deletedOldCache = false;
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            deletedOldCache = true;
            console.log('[SW] Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
      if (deletedOldCache) {
        const windowClients = await self.clients.matchAll({ type: 'window' });
        for (const client of windowClients) {
          try {
            client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION });
          } catch {}
        }
      }
    })()
  );
});

// 3. FETCH: Network-First for HTML/JS/CSS so GitHub Pages updates never get stuck, with full Offline Fallback
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Exclude Firebase, Google APIs, and external backend endpoints from SW interception
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('identitytoolkit') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('firestore')
  ) {
    return;
  }

  // Exclude dev environments and Vite modules
  if (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname.includes('run.app') ||
    url.pathname.startsWith('/@') ||
    url.pathname.includes('/node_modules/') ||
    url.pathname.includes('/src/') ||
    url.pathname.includes('hot-update')
  ) {
    return;
  }

  // A. Navigation Requests (HTML Pages / SPAs / Offline Launch / Subpath)
  const isNavigation =
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    (req.headers.get('accept') && req.headers.get('accept').includes('text/html'));

  if (isNavigation) {
    event.respondWith(
      fetch(req)
        .then((networkResp) => {
          if (networkResp && networkResp.status === 200) {
            const clone = networkResp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            return networkResp;
          }
          return fallbackToCachedHtml();
        })
        .catch(() => fallbackToCachedHtml())
    );
    return;
  }

  async function fallbackToCachedHtml() {
    const cache = await caches.open(CACHE_NAME);
    const candidates = [req, './', 'index.html', './index.html', '404.html', './404.html'];
    for (const candidate of candidates) {
      const match = await cache.match(candidate, { ignoreSearch: true });
      if (match) return match;
    }
    const keys = await cache.keys();
    for (const k of keys) {
      if (k.url.endsWith('/') || k.url.endsWith('index.html') || k.url.endsWith('404.html')) {
        const match = await cache.match(k);
        if (match) return match;
      }
    }
    return new Response(
      '<!doctype html><html lang="ur"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NH POS - Offline</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#FAF8EC;color:#1e5631;text-align:center;padding:50px 20px;}h1{margin-bottom:8px;font-size:24px;}p{color:#64748b;font-size:14px;margin-bottom:20px;}</style></head><body><h1>NH POS Shop</h1><p>Offline Mode: App is ready. Reopen or reconnect to sync with cloud.</p><button onclick="window.location.reload()" style="background:#1e5631;color:#fff;border:none;padding:12px 24px;border-radius:12px;font-weight:bold;cursor:pointer;">Try Again</button></body></html>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  // B. JS & CSS Bundles: Network-First with Cache Fallback so new deployments load immediately
  const isCodeBundle =
    req.destination === 'script' ||
    req.destination === 'style' ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css');

  if (isCodeBundle) {
    event.respondWith(
      fetch(req)
        .then((networkResp) => {
          if (networkResp && networkResp.status === 200) {
            const clone = networkResp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkResp;
        })
        .catch(async () => {
          const cached = await caches.match(req, { ignoreSearch: true });
          if (cached) return cached;
          return new Response('', { status: 503, statusText: 'Offline Asset Unavailable' });
        })
    );
    return;
  }

  // C. Images, Fonts, Manifest: Cache-First with Background Update
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) {
        fetch(req)
          .then((networkResp) => {
            if (networkResp && (networkResp.status === 200 || networkResp.type === 'opaque')) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, networkResp));
            }
          })
          .catch(() => {});
        return cached;
      }

      return fetch(req)
        .then((networkResp) => {
          if (networkResp && (networkResp.status === 200 || networkResp.type === 'opaque')) {
            const clone = networkResp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkResp;
        })
        .catch(async () => {
          const fallback = await caches.match(req, { ignoreSearch: true });
          if (fallback) return fallback;
          return new Response('', { status: 503, statusText: 'Offline' });
        });
    })
  );
});

// 4. Live version messaging
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: SW_VERSION, cacheName: CACHE_NAME });
  }
});
