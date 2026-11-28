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
  autoSyncIntervalMinutes?: number;
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

/**
 * Race any promise against a strict timeout so stalled Firestore WebChannel / IDB calls
 * can NEVER leave the UI permanently stuck on "Syncing...".
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label = 'operation'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout after ${timeoutMs}ms (${label})`));
    }, timeoutMs);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function hasIndexedDB(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openBgSyncDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDB()) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (db: IDBDatabase | null) => {
      if (settled) return;
      settled = true;
      resolve(db);
    };
    const guard = setTimeout(() => finish(null), 2500);
    try {
      const req = window.indexedDB.open(BG_SYNC_DB_NAME, BG_SYNC_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(BG_SYNC_STORE_NAME)) {
          db.createObjectStore(BG_SYNC_STORE_NAME, { keyPath: 'shopId' });
        }
      };
      req.onsuccess = () => {
        clearTimeout(guard);
        finish(req.result);
      };
      req.onerror = () => {
        clearTimeout(guard);
        finish(null);
      };
      req.onblocked = () => {
        clearTimeout(guard);
        finish(null);
      };
    } catch {
      clearTimeout(guard);
      finish(null);
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
  autoSyncIntervalMinutes?: number;
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

    const intervalMins = Math.max(
      1,
      Math.min(360, Math.round(Number(params.autoSyncIntervalMinutes || existing?.autoSyncIntervalMinutes || 30)))
    );

    const record: BgSyncShopRecord = {
      shopId: params.shopId,
      projectId: params.projectId,
      databaseId: params.databaseId || '(default)',
      apiKey: params.apiKey,
      syncBy: params.syncBy || 'user',
      queue: filteredQueue,
      flushedIds: existingFlushedIds,
      flushedAtMap: existingFlushedAtMap,
      nextSyncAt: Number(params.nextSyncAt) || Date.now() + intervalMins * 60 * 1000,
      autoSyncIntervalMinutes: intervalMins,
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
 * and Periodic Background Sync (background check on Android Chrome / Chromium PWAs).
 * Gracefully no-ops on browsers that don't support these APIs (e.g. iOS Safari).
 */
export async function registerBackgroundSync(options?: {
  registerOneShot?: boolean;
  registerPeriodic?: boolean;
  intervalMinutes?: number;
}): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const { registerOneShot = true, registerPeriodic = false, intervalMinutes } = options || {};
  const minIntervalMs =
    typeof intervalMinutes === 'number' && intervalMinutes >= 1
      ? Math.max(5 * 60 * 1000, Math.round(intervalMinutes) * 60 * 1000)
      : BG_SYNC_MIN_INTERVAL_MS;

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
            minInterval: minIntervalMs
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

// =============================================================================
// Direct Firestore REST API Fallback (Used when Firestore SDK WebChannel stalls
// on flaky/sleeping mobile connections so Sync Now & Auto-Sync NEVER hang!)
// =============================================================================

function cleanForRest(val: any): any {
  if (val === undefined || typeof val === 'function' || typeof val === 'symbol') return undefined;
  if (val === null) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (typeof val === 'boolean' || typeof val === 'string') return val;
  if (val instanceof Date) return val.toISOString();
  if (Array.isArray(val)) {
    const out: any[] = [];
    for (let i = 0; i < val.length; i++) {
      const cleaned = cleanForRest(val[i]);
      if (cleaned !== undefined) out.push(cleaned);
    }
    return out;
  }
  if (typeof val === 'object') {
    const out: Record<string, any> = {};
    for (const k of Object.keys(val)) {
      const cleaned = cleanForRest(val[k]);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  return String(val);
}

function toRestValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val) && Number.isSafeInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: Number.isFinite(val) ? val : 0 };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((item) => toRestValue(item)) } };
  }
  if (typeof val === 'object') {
    return { mapValue: { fields: toRestFields(val) } };
  }
  return { stringValue: String(val) };
}

function toRestFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const k of Object.keys(obj || {})) {
    if (obj[k] !== undefined) {
      fields[k] = toRestValue(obj[k]);
    }
  }
  return fields;
}

function formatRestFieldPath(key: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return key;
  return '`' + String(key).replace(/`/g, '\\`') + '`';
}

export interface DirectRestTarget {
  projectId: string;
  databaseId?: string;
  apiKey: string;
  authToken?: string | null;
}

function buildDirectDocUrl(target: DirectRestTarget, docPath: string): string {
  const dbId = target.databaseId || '(default)';
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    target.projectId
  )}/databases/${dbId}/documents/${docPath}`;
}

export async function patchFirestoreDocDirect(
  target: DirectRestTarget,
  docPath: string,
  rawData: Record<string, any>,
  timeoutMs = 9000
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const cleanData = cleanForRest(rawData);
  if (!cleanData || typeof cleanData !== 'object') return { ok: true };
  const fieldKeys = Object.keys(cleanData);
  if (fieldKeys.length === 0) return { ok: true };

  const maskParams = fieldKeys
    .map((k) => 'updateMask.fieldPaths=' + encodeURIComponent(formatRestFieldPath(k)))
    .join('&');
  const url = `${buildDirectDocUrl(target, docPath)}?${maskParams}&key=${encodeURIComponent(target.apiKey)}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (target.authToken) {
    headers['Authorization'] = `Bearer ${target.authToken}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ fields: toRestFields(cleanData) }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (resp.ok) return { ok: true, status: resp.status };
    const text = await resp.text().catch(() => '');
    return { ok: false, status: resp.status, error: text || `HTTP ${resp.status}` };
  } catch (err: any) {
    clearTimeout(timer);
    return { ok: false, error: err?.message || 'REST network error' };
  }
}

export async function deleteFirestoreDocDirect(
  target: DirectRestTarget,
  docPath: string,
  timeoutMs = 9000
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const url = `${buildDirectDocUrl(target, docPath)}?key=${encodeURIComponent(target.apiKey)}`;
  const headers: Record<string, string> = {};
  if (target.authToken) {
    headers['Authorization'] = `Bearer ${target.authToken}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'DELETE',
      headers,
      signal: controller.signal
    });
    clearTimeout(timer);
    if (resp.ok || resp.status === 404) return { ok: true, status: resp.status };
    const text = await resp.text().catch(() => '');
    return { ok: false, status: resp.status, error: text || `HTTP ${resp.status}` };
  } catch (err: any) {
    clearTimeout(timer);
    return { ok: false, error: err?.message || 'REST delete network error' };
  }
}

