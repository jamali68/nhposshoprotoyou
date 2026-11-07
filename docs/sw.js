/**
 * Service Worker for NH POS Shop PWA
 * Version: v17.6.1
 * Comprehensive Offline & GitHub Pages Support
 */
const SW_VERSION = 'v17.6.1';
const BUILD_ID = 'BtJfu5nN';
const CACHE_NAME =
  'nh-pos-' +
  SW_VERSION +
  (BUILD_ID && !BUILD_ID.includes('__BUILD_ID__') ? '-' + BUILD_ID : '');

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
    './assets/app-BtJfu5nN.js',
  './assets/apple-touch-icon.png',
  './assets/icon-192-DyOrLONy.png',
  './assets/icon-192.png',
  './assets/icon-512-BZm4iOeR.png',
  './assets/icon-512.png',
  './assets/icon.png',
  './assets/icon.svg',
  './assets/icon1.png',
  './assets/index-CaJcJEou.css',
  './assets/manifest-BbU1Ym6m.json',
  './assets/manifest.json'
];

const PRECACHE_ASSETS = Array.from(new Set([...CORE_ASSETS, ...INJECTED_ASSETS]));

// 1. ATOMIC INSTALL: Never activate or replace old cache unless critical HTML/JS/CSS bundles are 100% downloaded
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      const isCriticalAsset = (asset) =>
        asset === './' ||
        asset === 'index.html' ||
        asset.endsWith('.js') ||
        asset.endsWith('.css');

      const criticalAssets = PRECACHE_ASSETS.filter(isCriticalAsset);
      const optionalAssets = PRECACHE_ASSETS.filter((a) => !isCriticalAsset(a));

      // Critical assets must succeed so we never activate an incomplete cache on slow/flaky mobile networks
      await Promise.all(
        criticalAssets.map(async (asset) => {
          const req = new Request(asset, { cache: 'reload' });
          const resp = await fetch(req);
          if (!resp || resp.status !== 200) {
            throw new Error('[SW] Failed to precache critical asset: ' + asset);
          }
          await cache.put(asset, resp);
        })
      );

      // Optional assets (icons, manifest, 404) are best-effort
      await Promise.all(
        optionalAssets.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn('[SW] Optional precache skipped for:', asset, err && err.message);
          })
        )
      );

      // Only skipWaiting AFTER all critical bundles are safely stored in CACHE_NAME
      await self.skipWaiting();
    })()
  );
});

// 2. ACTIVATE: Purge older caches only after new cache is verified, claim clients, and notify tabs
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
            client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
          } catch {}
        }
      }
    })()
  );
});

// 3. FETCH: Instant 0ms Verified App-Shell Launch + Background Update Check
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

  // Helper: Verify that cached index.html AND its referenced JS bundle both exist in cache
  async function getVerifiedCachedHtml() {
    const cache = await caches.open(CACHE_NAME);
    const candidates = [req, './', 'index.html', './index.html', '404.html', './404.html'];
    let matchedHtml = null;

    for (const candidate of candidates) {
      const match = await cache.match(candidate, { ignoreSearch: true });
      if (match) {
        matchedHtml = match;
        break;
      }
    }

    if (!matchedHtml) {
      const keys = await cache.keys();
      for (const k of keys) {
        if (k.url.endsWith('/') || k.url.endsWith('index.html') || k.url.endsWith('404.html')) {
          const match = await cache.match(k);
          if (match) {
            matchedHtml = match;
            break;
          }
        }
      }
    }

    if (!matchedHtml) return null;

    try {
      const htmlText = await matchedHtml.clone().text();
      const scriptMatch = htmlText.match(/src=["']([^"']*assets\/[^"']+\.js)["']/i);
      if (scriptMatch && scriptMatch[1]) {
        const scriptUrl = scriptMatch[1];
        const scriptCached = await caches.match(scriptUrl, { ignoreSearch: true });
        if (!scriptCached) {
          return null;
        }
      }
    } catch {
      // If text parsing fails, still return matchedHtml
    }

    return matchedHtml;
  }

  async function fallbackToCachedHtml() {
    const verified = await getVerifiedCachedHtml();
    if (verified) return verified;

    const anyCached =
      (await caches.match(req, { ignoreSearch: true })) ||
      (await caches.match('index.html', { ignoreSearch: true })) ||
      (await caches.match('./', { ignoreSearch: true }));
    if (anyCached) return anyCached;

    return new Response(
      '<!doctype html><html lang="ur"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NH POS - Offline</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#FAF8EC;color:#1e5631;text-align:center;padding:50px 20px;}h1{margin-bottom:8px;font-size:24px;}p{color:#64748b;font-size:14px;margin-bottom:20px;}</style></head><body><h1>NH POS Shop</h1><p>Offline Mode: App is ready. Reopen or reconnect to sync with cloud.</p><button onclick="window.location.reload()" style="background:#1e5631;color:#fff;border:none;padding:12px 24px;border-radius:12px;font-weight:bold;cursor:pointer;">Try Again</button></body></html>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  // A. Navigation Requests (HTML Pages / SPAs / Offline Launch / Subpath)
  const isNavigation =
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    (req.headers.get('accept') && req.headers.get('accept').includes('text/html'));

  if (isNavigation) {
    event.respondWith(
      (async () => {
        // 1. If we already have a verified cached HTML + JS bundle, serve it in 0ms!
        //    Then check for SW updates in the background so slow mobile networks (e.g. 8 KB/s) NEVER hang on splash screen.
        const verifiedCached = await getVerifiedCachedHtml();
        if (verifiedCached) {
          // Trigger background SW update check without blocking launch
          try {
            self.registration.update().catch(() => {});
          } catch {}
          return verifiedCached;
        }

        // 2. First-time visit (no verified cache yet): fetch from network and cache
        try {
          const networkResp = await fetch(req);
          if (networkResp && networkResp.status === 200) {
            const clone = networkResp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            return networkResp;
          }
        } catch {}

        return fallbackToCachedHtml();
      })()
    );
    return;
  }

  // B. JS & CSS Bundles: Cache-First (Hashed Vite bundles are immutable, 0ms instant launch)
  const isCodeBundle =
    req.destination === 'script' ||
    req.destination === 'style' ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css');

  if (isCodeBundle) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) {
          return cached;
        }
        try {
          const networkResp = await fetch(req);
          if (networkResp && networkResp.status === 200) {
            const clone = networkResp.clone();
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, clone);
          }
          return networkResp;
        } catch {
          return new Response('', { status: 503, statusText: 'Offline Asset Unavailable' });
        }
      })()
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
