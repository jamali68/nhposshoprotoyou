/**
 * IndexedDB Bridge + PWA Background Sync Registration for NH POS Shop
 * Mirrors pendingSyncQueue & 30m timer state so public/sw.js can upload pending
 * entries directly to Firestore even when the app is closed or backgrounded.
 */

export interface BgPendingSyncItem {
  id: string;
  type: 'save' | 'delete';
  collection: string;
  docId: string;
  data?: any;
  timestamp: number;
}

export interface BgSyncShopRecord {
  shopId: string;
  projectId: string;
  databaseId: string;
  apiKey: string;
  syncBy: string;
  queue: BgPendingSyncItem[];
  flushedIds: string[];
  flushedAtMap: Record<string, number>;
  nextSyncAt: number;
  waitingForOnline: boolean;
  lastBgSyncAt: number;
  updatedAt: number;
}

export interface SwBgSyncResult {
  flushedIds: string[];
  flushedAtMap: Record<string, number>;
  lastBgSyncAt: number;
  nextSyncAt: number;
}

export const BG_SYNC_DB_NAME = 'nh_pos_bg_sync_db';
export const BG_SYNC_DB_VERSION = 1;
export const BG_SYNC_STORE_NAME = 'sync_state';
export const BG_SYNC_ONE_SHOT_TAG = 'nh-pos-sync-pending';
export const BG_SYNC_PERIODIC_TAG = 'nh-pos-periodic-sync';
export const BG_SYNC_MIN_INTERVAL_MS = 30 * 60 * 1000;

function hasIndexedDB(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openBgSyncDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDB()) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(BG_SYNC_DB_NAME, BG_SYNC_DB_VERSION);
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

function readRecord(db: IDBDatabase, shopId: string): Promise<BgSyncShopRecord | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(BG_SYNC_STORE_NAME, 'readonly');
      const store = tx.objectStore(BG_SYNC_STORE_NAME);
      const req = store.get(shopId);
      req.onsuccess = () => resolve((req.result as BgSyncShopRecord) || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function writeRecord(db: IDBDatabase, record: BgSyncShopRecord): Promise<boolean> {
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

export interface MirrorBgSyncParams {
  shopId: string;
  projectId: string;
  databaseId?: string;
  apiKey: string;
  syncBy: string;
  queue: BgPendingSyncItem[];
  nextSyncAt: number;
  waitingForOnline: boolean;
}

/**
 * Mirrors the current shop's pendingSyncQueue and timer metadata to IndexedDB
 * so the Service Worker can upload pending entries automatically in the background.
 */
export async function mirrorPendingSyncToIdb(params: MirrorBgSyncParams): Promise<void> {
  if (!params.shopId || !params.projectId || !params.apiKey) return;
  const db = await openBgSyncDb();
  if (!db) return;

  try {
    const existing = await readRecord(db, params.shopId);
    const existingFlushedIds = Array.isArray(existing?.flushedIds) ? existing.flushedIds : [];
    const existingFlushedAtMap: Record<string, number> =
      existing?.flushedAtMap && typeof existing.flushedAtMap === 'object'
        ? { ...existing.flushedAtMap }
        : {};

    // Filter out any item that SW already flushed in the background (unless modified more recently)
    const filteredQueue = (Array.isArray(params.queue) ? params.queue : []).filter((item) => {
      if (!item || !item.id) return false;
      const flushedAt = existingFlushedAtMap[item.id];
      if (flushedAt && Number(item.timestamp || 0) <= flushedAt) {
        return false;
      }
      return true;
    });

    const record: BgSyncShopRecord = {
      shopId: params.shopId,
      projectId: params.projectId,
      databaseId: params.databaseId || '(default)',
      apiKey: params.apiKey,
      syncBy: params.syncBy || 'user',
      queue: filteredQueue,
      flushedIds: existingFlushedIds,
      flushedAtMap: existingFlushedAtMap,
      nextSyncAt: Number(params.nextSyncAt) || Date.now() + BG_SYNC_MIN_INTERVAL_MS,
      waitingForOnline: Boolean(params.waitingForOnline),
      lastBgSyncAt: Number(existing?.lastBgSyncAt || 0),
      updatedAt: Date.now()
    };

    await writeRecord(db, record);
  } catch {
    // Silent fallback if storage quota or IDB unavailable
  } finally {
    try {
      db.close();
    } catch {}
  }
}

/**
 * Reads and clears any entry IDs that public/sw.js already uploaded in the background
 * while the app was closed or minimized, so POSContext can clean up localStorage cleanly.
 */
export async function consumeSwBgSyncResults(shopId: string): Promise<SwBgSyncResult | null> {
  if (!shopId) return null;
  const db = await openBgSyncDb();
  if (!db) return null;

  try {
    const existing = await readRecord(db, shopId);
    if (!existing) return null;

    const flushedIds = Array.isArray(existing.flushedIds) ? [...existing.flushedIds] : [];
    const flushedAtMap =
      existing.flushedAtMap && typeof existing.flushedAtMap === 'object'
        ? { ...existing.flushedAtMap }
        : {};
    const lastBgSyncAt = Number(existing.lastBgSyncAt || 0);
    const nextSyncAt = Number(existing.nextSyncAt || 0);

    if (flushedIds.length === 0) {
      return {
        flushedIds: [],
        flushedAtMap: {},
        lastBgSyncAt,
        nextSyncAt
      };
    }

    // Clear consumed flushedIds in IDB while keeping current queue intact
    const updatedRecord: BgSyncShopRecord = {
      ...existing,
      flushedIds: [],
      flushedAtMap: {},
      updatedAt: Date.now()
    };
    await writeRecord(db, updatedRecord);

    return {
      flushedIds,
      flushedAtMap,
      lastBgSyncAt,
      nextSyncAt
    };
  } catch {
    return null;
  } finally {
    try {
      db.close();
    } catch {}
  }
}

/**
 * Registers OS-level PWA Background Sync (one-shot on WiFi/SIM reconnect)
 * and Periodic Background Sync (30m background check on Android Chrome / Chromium PWAs).
 * Gracefully no-ops on browsers that don't support these APIs (e.g. iOS Safari).
 */
export async function registerBackgroundSync(options?: {
  registerOneShot?: boolean;
  registerPeriodic?: boolean;
}): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const { registerOneShot = true, registerPeriodic = false } = options || {};

  try {
    const reg: any = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500))
    ]);
    if (!reg) return;

    if (registerOneShot && reg.sync && typeof reg.sync.register === 'function') {
      try {
        await reg.sync.register(BG_SYNC_ONE_SHOT_TAG);
      } catch {
        // Browser may disallow sync in incognito or restricted contexts
      }
    }

    if (registerPeriodic && reg.periodicSync && typeof reg.periodicSync.register === 'function') {
      try {
        let allowed = true;
        if (navigator.permissions && typeof navigator.permissions.query === 'function') {
          try {
            const status = await (navigator.permissions as any).query({
              name: 'periodic-background-sync'
            });
            allowed = status.state === 'granted';
          } catch {
            // Some Chromium builds don't expose permission query name; attempt register directly
          }
        }
        if (allowed) {
          await reg.periodicSync.register(BG_SYNC_PERIODIC_TAG, {
            minInterval: BG_SYNC_MIN_INTERVAL_MS
          });
        }
      } catch {
        // Periodic sync is best-effort on installed PWAs
      }
    }
  } catch {
    // Ignore unsupported SW environments
  }
}
