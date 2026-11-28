/**
 * Service Worker for NH POS Shop PWA
 * Version: v18.2.2
 * Smart Background Pre-Download, Non-Disruptive Updates & True Background Cloud Sync (GitHub Pages + Netlify)
 */
const SW_VERSION = 'v18.2.2';
const BUILD_ID = '/* __BUILD_ID__ */';
const SMART_CACHE_PREFIX = 'nh-pos-smart-';
const CACHE_NAME =
  SMART_CACHE_PREFIX +
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
  /* __BUILD_ASSETS__ */
];

const PRECACHE_ASSETS = Array.from(new Set([...CORE_ASSETS, ...INJECTED_ASSETS]));

// 1. ATOMIC INSTALL: Never activate or replace old cache unless critical HTML/JS/CSS bundles are 100% downloaded
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // Check BEFORE opening CACHE_NAME whether the device already runs the smart updater (v18.0.6+)
      // Devices stuck on legacy v18.0.1 ('nh-pos-v18.0.1-...') cannot send SKIP_WAITING, so we auto-upgrade them once.
      const existingCacheKeysBeforeInstall = await caches.keys();
      const hasSmartCache = existingCacheKeysBeforeInstall.some((k) =>
        k.startsWith(SMART_CACHE_PREFIX)
      );

      const cache = await caches.open(CACHE_NAME);

      const isCriticalAsset = (asset) =>
        asset === './' ||
        asset === 'index.html' ||
        asset.endsWith('.js') ||
        asset.endsWith('.css');

      const criticalAssets = PRECACHE_ASSETS.filter(isCriticalAsset);
      const optionalAssets = PRECACHE_ASSETS.filter((a) => !isCriticalAsset(a));

      // Critical assets must succeed so we never activate an incomplete cache on slow/flaky mobile networks.
      // For HTML entry files ('./', 'index.html'), append a versioned cache-buster query on the network request
      // so GitHub Pages' 10-minute CDN cache (max-age=600) is bypassed immediately, while storing under the clean key!
      const cacheBuster = encodeURIComponent(SW_VERSION + '_' + BUILD_ID);
      let precachedHitCount = 0;
      let precachedTotalBytes = 0;

      await Promise.all(
        criticalAssets.map(async (asset) => {
          const isHtmlEntry = asset === './' || asset === 'index.html';
          const fetchUrl = isHtmlEntry ? `index.html?_v=${cacheBuster}` : asset;
          const req = new Request(fetchUrl, { cache: 'reload' });
          const resp = await fetch(req);
          if (!resp || resp.status !== 200) {
            throw new Error('[SW] Failed to precache critical asset: ' + asset);
          }
          precachedHitCount += 1;
          const cl = Number(resp.headers.get('content-length')) || 0;
          precachedTotalBytes += cl > 0 ? cl : isHtmlEntry ? 4800 : 165000;
          await cache.put(asset, resp);
        })
      );

      // Optional assets (icons, manifest, 404) are best-effort
      await Promise.all(
        optionalAssets.map((asset) =>
          fetch(asset)
            .then(async (resp) => {
              if (resp && resp.status === 200) {
                precachedHitCount += 1;
                const cl = Number(resp.headers.get('content-length')) || 0;
                precachedTotalBytes += cl > 0 ? cl : 18500;
                await cache.put(asset, resp);
              }
            })
            .catch((err) => {
              console.warn('[SW] Optional precache skipped for:', asset, err && err.message);
            })
        )
      );

      // Smart Non-Disruptive Activation:
      // - If upgrading from a legacy pre-smart cache (e.g. stuck v18.0.1) OR no app window is open:
      //   activate immediately so trapped legacy phones escape cleanly into the smart updater.
      // - If device already has smart updater (v18.0.6+) AND user has the app open:
      //   stay silently in 'waiting' state (zero disruption) and notify tabs to apply on page switch/refresh/reopen.
      const existingClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of existingClients) {
        try {
          client.postMessage({
            type: 'SW_NETLIFY_NETWORK_HIT',
            requests: precachedHitCount + 1, // +1 for sw.js script download itself
            bytes: precachedTotalBytes + 26500
          });
        } catch {}
      }
      if (!hasSmartCache || existingClients.length === 0) {
        await self.skipWaiting();
      } else {
        for (const client of existingClients) {
          try {
            client.postMessage({ type: 'SW_UPDATE_READY', version: SW_VERSION, cacheName: CACHE_NAME });
          } catch {}
        }
      }
    })()
  );
});

// 2. ACTIVATE: Purge older caches only after new cache is verified, claim clients, and notify tabs
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      let deletedOldCache = false;
      let upgradedFromLegacy = false;
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            deletedOldCache = true;
            if (!key.startsWith(SMART_CACHE_PREFIX)) {
              upgradedFromLegacy = true;
            }
            console.log('[SW] Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
      if (deletedOldCache) {
        const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of windowClients) {
          try {
            if (upgradedFromLegacy) {
              // Legacy v18.0.1 index.html listens for 'SW_UPDATED' to reload once out of stale cache
              client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
            } else {
              client.postMessage({ type: 'SW_ACTIVATED', version: SW_VERSION, cacheName: CACHE_NAME });
            }
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
    url.pathname.includes('hot-update') ||
    url.pathname.endsWith('/sw.js') ||
    url.pathname === '/sw.js' ||
    url.pathname.endsWith('/version.json') ||
    url.pathname === '/version.json'
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

  function notifyClientNetworkHit(requestsCount, resp, fallbackBytes) {
    try {
      const cl = resp && resp.headers ? Number(resp.headers.get('content-length')) || 0 : 0;
      const bytes = cl > 0 ? cl : fallbackBytes;
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clients) => {
          for (const client of clients) {
            try {
              client.postMessage({
                type: 'SW_NETLIFY_NETWORK_HIT',
                requests: requestsCount,
                bytes
              });
            } catch {}
          }
        })
        .catch(() => {});
    } catch {}
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
        //    Update checks are managed by pwaUpdater.ts on a 15-30m smart throttle (0 wasted Netlify requests).
        const verifiedCached = await getVerifiedCachedHtml();
        if (verifiedCached) {
          return verifiedCached;
        }

        // 2. First-time visit (no verified cache yet): fetch from network and cache
        try {
          const networkResp = await fetch(req);
          if (networkResp && networkResp.status === 200) {
            notifyClientNetworkHit(1, networkResp, 4800);
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
            notifyClientNetworkHit(1, networkResp, 145000);
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

  // C. Images, Fonts, Manifest: Pure Cache-First (0 background Netlify fetches for already-cached static icons/manifest)
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(req)
        .then((networkResp) => {
          if (networkResp && (networkResp.status === 200 || networkResp.type === 'opaque')) {
            notifyClientNetworkHit(1, networkResp, 16500);
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

// 4. Live version & on-demand safe activation messaging
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: SW_VERSION, cacheName: CACHE_NAME });
    return;
  }
  if (event.data && event.data.type === 'CHECK_BG_SYNC') {
    event.waitUntil(runAllBackgroundSyncs('message'));
  }
});

// =============================================================================
// 5. TRUE BACKGROUND CLOUD SYNC ENGINE (v18.1.2)
//    Uploads pending entries directly to Firestore when mobile connects to
//    WiFi or SIM data, or when the 30-minute timer expires — even if app is closed!
// =============================================================================
const BG_SYNC_DB_NAME = 'nh_pos_bg_sync_db';
const BG_SYNC_DB_VERSION = 1;
const BG_SYNC_STORE_NAME = 'sync_state';
const BG_SYNC_ONE_SHOT_TAG = 'nh-pos-sync-pending';
const BG_SYNC_PERIODIC_TAG = 'nh-pos-periodic-sync';
const BG_AUTO_SYNC_DURATION_MS = 30 * 60 * 1000;

function openBgSyncDbSw() {
  return new Promise((resolve) => {
    try {
      const req = self.indexedDB.open(BG_SYNC_DB_NAME, BG_SYNC_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(BG_SYNC_STORE_NAME)) {
          db.createObjectStore(BG_SYNC_STORE_NAME, { keyPath: 'shopId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function getAllBgRecordsSw(db) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(BG_SYNC_STORE_NAME, 'readonly');
      const store = tx.objectStore(BG_SYNC_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function getBgRecordSw(db, shopId) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(BG_SYNC_STORE_NAME, 'readonly');
      const store = tx.objectStore(BG_SYNC_STORE_NAME);
      const req = store.get(shopId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function putBgRecordSw(db, record) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(BG_SYNC_STORE_NAME, 'readwrite');
      const store = tx.objectStore(BG_SYNC_STORE_NAME);
      store.put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function cleanValueForFirestoreRest(val) {
  if (val === undefined || typeof val === 'function' || typeof val === 'symbol') {
    return undefined;
  }
  if (val === null) return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  if (typeof val === 'boolean' || typeof val === 'string') {
    return val;
  }
  if (Array.isArray(val)) {
    const out = [];
    for (let i = 0; i < val.length; i++) {
      const cleaned = cleanValueForFirestoreRest(val[i]);
      if (cleaned !== undefined) out.push(cleaned);
    }
    return out;
  }
  if (typeof val === 'object') {
    const out = {};
    const keys = Object.keys(val);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const cleaned = cleanValueForFirestoreRest(val[k]);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  return String(val);
}

function toFirestoreRestValue(val) {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val) && Number.isSafeInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: Number.isFinite(val) ? val : 0 };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((item) => toFirestoreRestValue(item))
      }
    };
  }
  if (typeof val === 'object') {
    return {
      mapValue: {
        fields: toFirestoreRestFields(val)
      }
    };
  }
  return { stringValue: String(val) };
}

function toFirestoreRestFields(obj) {
  const fields = {};
  const keys = Object.keys(obj || {});
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (obj[k] !== undefined) {
      fields[k] = toFirestoreRestValue(obj[k]);
    }
  }
  return fields;
}

function formatFirestoreFieldPath(key) {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return key;
  }
  return '`' + String(key).replace(/`/g, '\\`') + '`';
}

function buildFirestoreDocUrl(record, docPath) {
  const dbId = record.databaseId || '(default)';
  return (
    'https://firestore.googleapis.com/v1/projects/' +
    encodeURIComponent(record.projectId) +
    '/databases/' +
    dbId +
    '/documents/' +
    docPath
  );
}

async function patchFirestoreDocSw(record, collectionName, docId, rawData) {
  const cleanData = cleanValueForFirestoreRest(
    Object.assign({}, rawData, { shop_id: record.shopId })
  );
  if (!cleanData || typeof cleanData !== 'object') {
    return { ok: true, transient: false };
  }

  const fieldKeys = Object.keys(cleanData);
  if (fieldKeys.length === 0) {
    return { ok: true, transient: false };
  }

  const docPath =
    'shops/' +
    encodeURIComponent(record.shopId) +
    '/' +
    encodeURIComponent(collectionName) +
    '/' +
    encodeURIComponent(docId);

  const maskParams = fieldKeys
    .map((k) => 'updateMask.fieldPaths=' + encodeURIComponent(formatFirestoreFieldPath(k)))
    .join('&');

  const url =
    buildFirestoreDocUrl(record, docPath) +
    '?' +
    maskParams +
    '&key=' +
    encodeURIComponent(record.apiKey);

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 10000) : null;
  try {
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: toFirestoreRestFields(cleanData) }),
      ...(controller ? { signal: controller.signal } : {})
    });
    if (timer) clearTimeout(timer);
    if (resp.ok) {
      return { ok: true, transient: false };
    }
    const isTransient = resp.status >= 500 || resp.status === 429 || resp.status === 408;
    return { ok: false, transient: isTransient, status: resp.status };
  } catch {
    if (timer) clearTimeout(timer);
    return { ok: false, transient: true };
  }
}

async function deleteFirestoreDocSw(record, collectionName, docId) {
  const docPath =
    'shops/' +
    encodeURIComponent(record.shopId) +
    '/' +
    encodeURIComponent(collectionName) +
    '/' +
    encodeURIComponent(docId);

  const url =
    buildFirestoreDocUrl(record, docPath) +
    '?key=' +
    encodeURIComponent(record.apiKey);

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 10000) : null;
  try {
    const resp = await fetch(url, {
      method: 'DELETE',
      ...(controller ? { signal: controller.signal } : {})
    });
    if (timer) clearTimeout(timer);
    if (resp.ok || resp.status === 404) {
      return { ok: true, transient: false };
    }
    const isTransient = resp.status >= 500 || resp.status === 429 || resp.status === 408;
    return { ok: false, transient: isTransient, status: resp.status };
  } catch {
    if (timer) clearTimeout(timer);
    return { ok: false, transient: true };
  }
}

async function broadcastShopSyncPulseSw(record, touchedCollections, pulseTs) {
  const docPath = 'shops/' + encodeURIComponent(record.shopId);
  const colFields = {};
  const maskParts = [
    'updateMask.fieldPaths=last_data_sync_at',
    'updateMask.fieldPaths=last_data_sync_by'
  ];

  touchedCollections.forEach((col) => {
    if (col && /^[A-Za-z0-9_]+$/.test(col)) {
      colFields[col] = { integerValue: String(pulseTs) };
      maskParts.push('updateMask.fieldPaths=' + encodeURIComponent('collection_sync_at.' + col));
    }
  });

  const fields = {
    last_data_sync_at: { integerValue: String(pulseTs) },
    last_data_sync_by: { stringValue: record.syncBy || 'user' }
  };
  if (Object.keys(colFields).length > 0) {
    fields.collection_sync_at = { mapValue: { fields: colFields } };
  }

  const url =
    buildFirestoreDocUrl(record, docPath) +
    '?' +
    maskParts.join('&') +
    '&key=' +
    encodeURIComponent(record.apiKey);

  try {
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
  } catch {
    // Pulse broadcast is best-effort; data documents are already safely stored in Firestore
  }
}

async function flushShopRecordInBackground(db, record, reason) {
  if (
    !record ||
    !record.shopId ||
    !record.projectId ||
    !record.apiKey ||
    !Array.isArray(record.queue) ||
    record.queue.length === 0
  ) {
    return { transientFailure: false };
  }

  let windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  let hasVisibleWindow = windowClients.some((c) => c.visibilityState === 'visible');
  let hasAnyWindow = windowClients.length > 0;

  const nowMs = Date.now();
  const isTimerExpired = nowMs >= Number(record.nextSyncAt || 0);
  const isWaitingForOnline = Boolean(record.waitingForOnline);

  // If user currently has the app visibly open on screen, delegate to foreground POSContext to avoid duplicate writes
  if (hasVisibleWindow) {
    if (isWaitingForOnline || isTimerExpired) {
      for (const client of windowClients) {
        try {
          client.postMessage({
            type: 'SW_TRIGGER_FOREGROUND_SYNC',
            shopId: record.shopId,
            reason
          });
        } catch {}
      }
    }
    return { transientFailure: false };
  }

  // If app is minimized (hidden tab still alive) and neither offline-recovered nor 30m expired:
  // Wait for 30m timer or app close unless periodic sync says timer expired.
  if (hasAnyWindow && !isWaitingForOnline && !isTimerExpired) {
    return { transientFailure: false };
  }

  // If app appears completely closed (0 windows) with unexpired timer & not offline-recovered,
  // wait 1.5s briefly so normal page reloads don't trigger a premature flush.
  if (!hasAnyWindow && !isWaitingForOnline && !isTimerExpired) {
    await new Promise((r) => setTimeout(r, 1500));
    windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    hasVisibleWindow = windowClients.some((c) => c.visibilityState === 'visible');
    hasAnyWindow = windowClients.length > 0;
    if (hasAnyWindow) {
      return { transientFailure: false };
    }
  }

  // Upload all pending entries directly to Firestore REST API
  const flushedIds = [];
  const flushedAtMap = {};
  const touchedCollections = new Set();
  let writesCount = 0;
  let deletesCount = 0;
  let transientFailure = false;

  for (let i = 0; i < record.queue.length; i++) {
    const item = record.queue[i];
    if (!item || !item.id || !item.collection || !item.docId) continue;

    let res = { ok: false, transient: false };
    if (item.type === 'save' && item.data) {
      res = await patchFirestoreDocSw(record, item.collection, item.docId, item.data);
      if (res.ok) writesCount += 1;
    } else if (item.type === 'delete') {
      res = await deleteFirestoreDocSw(record, item.collection, item.docId);
      if (res.ok) deletesCount += 1;
    } else {
      res = { ok: true, transient: false };
    }

    if (res.ok) {
      flushedIds.push(item.id);
      flushedAtMap[item.id] = Number(item.timestamp || Date.now());
      touchedCollections.add(item.collection);
    } else if (res.transient) {
      transientFailure = true;
    }
  }

  if (flushedIds.length > 0) {
    const pulseTs = Date.now();
    await broadcastShopSyncPulseSw(record, touchedCollections, pulseTs);

    // Re-read latest IDB record so we never drop an item added concurrently
    const latestRecord = (await getBgRecordSw(db, record.shopId)) || record;
    const mergedFlushedAtMap = Object.assign(
      {},
      latestRecord.flushedAtMap || {},
      flushedAtMap
    );
    const mergedFlushedIdsSet = new Set(
      (Array.isArray(latestRecord.flushedIds) ? latestRecord.flushedIds : []).concat(flushedIds)
    );

    const remainingQueue = (Array.isArray(latestRecord.queue) ? latestRecord.queue : []).filter(
      (qItem) => {
        if (!qItem || !qItem.id) return false;
        const flushedTs = mergedFlushedAtMap[qItem.id];
        if (flushedTs && Number(qItem.timestamp || 0) <= flushedTs) {
          return false;
        }
        return true;
      }
    );

    const intervalMins = Math.max(
      1,
      Math.min(360, Math.round(Number(latestRecord.autoSyncIntervalMinutes || record.autoSyncIntervalMinutes || 30)))
    );
    const nextSyncAt =
      remainingQueue.length > 0 && transientFailure
        ? pulseTs + 30 * 1000
        : pulseTs + intervalMins * 60 * 1000;
    const updatedRecord = Object.assign({}, latestRecord, {
      queue: remainingQueue,
      flushedIds: Array.from(mergedFlushedIdsSet),
      flushedAtMap: mergedFlushedAtMap,
      waitingForOnline: remainingQueue.length > 0 && transientFailure,
      lastBgSyncAt: pulseTs,
      nextSyncAt,
      updatedAt: pulseTs
    });

    await putBgRecordSw(db, updatedRecord);

    // Notify any open (hidden or newly opened) app windows to reconcile localStorage immediately
    const latestClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of latestClients) {
      try {
          client.postMessage({
            type: 'BG_SYNC_COMPLETED',
            shopId: record.shopId,
            flushedIds,
            flushedCount: flushedIds.length,
            writesCount,
            deletesCount,
            syncedAt: pulseTs,
            nextSyncAt
          });
      } catch {}
    }
  }

  return { transientFailure };
}

async function runAllBackgroundSyncs(reason) {
  const db = await openBgSyncDbSw();
  if (!db) return;

  let anyTransientFailure = false;
  try {
    const records = await getAllBgRecordsSw(db);
    for (let i = 0; i < records.length; i++) {
      const result = await flushShopRecordInBackground(db, records[i], reason);
      if (result && result.transientFailure) {
        anyTransientFailure = true;
      }
    }
  } finally {
    try {
      db.close();
    } catch {}
  }

  // Throwing on transient network error tells Android Chrome to automatically retry Background Sync
  if (anyTransientFailure && reason === 'sync') {
    throw new Error('[SW] Transient network failure during background sync — scheduling retry');
  }
}

// One-Shot OS Background Sync: fires immediately when WiFi or SIM data connects (even if app is closed)
self.addEventListener('sync', (event) => {
  if (event.tag === BG_SYNC_ONE_SHOT_TAG) {
    event.waitUntil(runAllBackgroundSyncs('sync'));
  }
});

// Periodic Background Sync: wakes SW in background on installed Android PWAs to enforce 30m deadline
self.addEventListener('periodicsync', (event) => {
  if (event.tag === BG_SYNC_PERIODIC_TAG) {
    event.waitUntil(runAllBackgroundSyncs('periodic'));
  }
});

// =============================================================================
// 6. RICH PUSH NOTIFICATION CLICK & PUSH EVENT HANDLERS (v18.1.9)
// =============================================================================
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'NH POS Shop';
  const options = {
    body: payload.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: payload.tag || 'nh-pos-push',
    renotify: true,
    data: { url: payload.url || './' }
  };
  if (payload.image && typeof payload.image === 'string' && payload.image.startsWith('https://')) {
    options.image = payload.image;
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification && event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
