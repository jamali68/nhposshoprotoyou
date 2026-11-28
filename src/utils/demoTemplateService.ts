/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db, auth, doc, getDoc, setDoc } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { withTimeout, patchFirestoreDocDirect } from './bgSyncStore';
import {
  DailyTransaction,
  BackCashTransaction,
  WholesalerBill,
  CustomerBill,
  EasyloadRecord,
  BottleItem,
  StockTransaction
} from '../types/pos';
import {
  getTodayDateString,
  initialDailyTransactions,
  initialBackCashTransactions,
  initialWholesalers,
  initialCustomers,
  initialEasyloadRecords,
  initialBottleItems,
  initialStockTransactions
} from '../data/initialData';

export const DEMO_TEMPLATE_STORAGE_KEY = 'taj_pos_custom_demo_template';
export const DEMO_TEMPLATE_DOC_COLLECTION = 'platform_settings';
export const DEMO_TEMPLATE_DOC_ID = 'demo_template';
export const DEFAULT_DEMO_RESET_MINUTES = 30;
const MAX_DEMO_PAYLOAD_BYTES = 850_000;

export interface DemoTemplatePayload {
  daily: DailyTransaction[];
  backCash: BackCashTransaction[];
  wholesalers: WholesalerBill[];
  customers: CustomerBill[];
  easyload: Record<string, EasyloadRecord>;
  bottles: BottleItem[];
  stockTx: StockTransaction[];
}

export interface DemoTemplateCounts {
  daily: number;
  backCash: number;
  wholesalers: number;
  customers: number;
  easyloadDays: number;
  bottles: number;
  stockTx: number;
}

export interface CloudDemoTemplateMeta {
  hasCustomTemplate: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  baseDate: string;
  resetIntervalMinutes: number;
  autoShiftDatesToToday: boolean;
  counts: DemoTemplateCounts;
}

export interface CloudDemoTemplateResult {
  data: DemoTemplatePayload;
  meta: CloudDemoTemplateMeta;
  source: 'cloud' | 'local' | 'default';
}

export interface PublishDemoTemplateResult {
  ok: boolean;
  error?: string;
  needsGoogleAuth?: boolean;
  meta?: CloudDemoTemplateMeta;
}

export function getEmptyDemoPayload(): DemoTemplatePayload {
  return {
    daily: initialDailyTransactions,
    backCash: initialBackCashTransactions,
    wholesalers: initialWholesalers,
    customers: initialCustomers,
    easyload: initialEasyloadRecords,
    bottles: initialBottleItems,
    stockTx: initialStockTransactions
  };
}

export function computeDemoCounts(payload: DemoTemplatePayload): DemoTemplateCounts {
  return {
    daily: Array.isArray(payload.daily) ? payload.daily.length : 0,
    backCash: Array.isArray(payload.backCash) ? payload.backCash.length : 0,
    wholesalers: Array.isArray(payload.wholesalers) ? payload.wholesalers.length : 0,
    customers: Array.isArray(payload.customers) ? payload.customers.length : 0,
    easyloadDays: payload.easyload && typeof payload.easyload === 'object' ? Object.keys(payload.easyload).length : 0,
    bottles: Array.isArray(payload.bottles) ? payload.bottles.length : 0,
    stockTx: Array.isArray(payload.stockTx) ? payload.stockTx.length : 0
  };
}

export function getTotalDemoRecordCount(counts: DemoTemplateCounts): number {
  return (
    counts.daily +
    counts.backCash +
    counts.wholesalers +
    counts.customers +
    counts.easyloadDays +
    counts.bottles +
    counts.stockTx
  );
}

// =============================================================================
// Relative Date Rebasing (Keeps demo data aligned to Today on any future date!)
// =============================================================================

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseLocalDate(ymd: string): Date | null {
  if (!ISO_DATE_RE.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatLocalDate(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftDateString(dateStr: string | undefined, dayDiff: number): string | undefined {
  if (!dateStr || dayDiff === 0) return dateStr;
  const trimmed = String(dateStr).trim();
  if (ISO_DATE_RE.test(trimmed)) {
    const dt = parseLocalDate(trimmed);
    if (!dt) return dateStr;
    dt.setDate(dt.getDate() + dayDiff);
    return formatLocalDate(dt);
  }
  // ISO timestamp prefix e.g. 2026-11-28T...
  if (trimmed.length >= 10 && ISO_DATE_RE.test(trimmed.slice(0, 10))) {
    const dt = parseLocalDate(trimmed.slice(0, 10));
    if (!dt) return dateStr;
    dt.setDate(dt.getDate() + dayDiff);
    return `${formatLocalDate(dt)}${trimmed.slice(10)}`;
  }
  return dateStr;
}

export function rebaseDemoTemplateDates(
  payload: DemoTemplatePayload,
  baseDate?: string | null,
  autoShift = true
): DemoTemplatePayload {
  if (!autoShift || !baseDate || !ISO_DATE_RE.test(baseDate)) {
    return payload;
  }
  const todayStr = getTodayDateString();
  if (baseDate === todayStr) return payload;

  const baseDt = parseLocalDate(baseDate);
  const todayDt = parseLocalDate(todayStr);
  if (!baseDt || !todayDt) return payload;

  const dayDiff = Math.round((todayDt.getTime() - baseDt.getTime()) / (24 * 60 * 60 * 1000));
  if (!Number.isFinite(dayDiff) || dayDiff === 0) return payload;

  const shiftBill = <T extends Record<string, any>>(bill: T): T => {
    const next: any = { ...bill };
    if (typeof next.created_date === 'string') next.created_date = shiftDateString(next.created_date, dayDiff);
    if (typeof next.date === 'string') next.date = shiftDateString(next.date, dayDiff);
    if (typeof next.last_updated === 'string') next.last_updated = shiftDateString(next.last_updated, dayDiff);
    if (Array.isArray(next.transactions)) {
      next.transactions = next.transactions.map((t: any) => ({
        ...t,
        date: typeof t?.date === 'string' ? shiftDateString(t.date, dayDiff) : t?.date,
        transaction_date:
          typeof t?.transaction_date === 'string' ? shiftDateString(t.transaction_date, dayDiff) : t?.transaction_date
      }));
    }
    if (Array.isArray(next.history)) {
      next.history = next.history.map((h: any) => ({
        ...h,
        date: typeof h?.date === 'string' ? shiftDateString(h.date, dayDiff) : h?.date
      }));
    }
    return next as T;
  };

  const rebasedEasyload: Record<string, EasyloadRecord> = {};
  if (payload.easyload && typeof payload.easyload === 'object') {
    for (const [k, rec] of Object.entries(payload.easyload)) {
      const nextKey = shiftDateString(k, dayDiff) || k;
      rebasedEasyload[nextKey] = {
        ...rec,
        date_recorded: shiftDateString(rec?.date_recorded, dayDiff) || nextKey
      };
    }
  }

  return {
    daily: (payload.daily || []).map(tx => ({
      ...tx,
      transaction_date: shiftDateString(tx.transaction_date, dayDiff) || tx.transaction_date,
      created_at: tx.created_at ? shiftDateString(tx.created_at, dayDiff) : tx.created_at
    })),
    backCash: (payload.backCash || []).map(tx => ({
      ...tx,
      transaction_date: shiftDateString(tx.transaction_date, dayDiff) || tx.transaction_date,
      created_at: tx.created_at ? shiftDateString(tx.created_at, dayDiff) : tx.created_at
    })),
    wholesalers: (payload.wholesalers || []).map(shiftBill),
    customers: (payload.customers || []).map(shiftBill),
    easyload: rebasedEasyload,
    bottles: Array.isArray(payload.bottles) ? payload.bottles.map(b => ({ ...b })) : [],
    stockTx: (payload.stockTx || []).map(tx => ({
      ...tx,
      created_at: shiftDateString(tx.created_at, dayDiff) || tx.created_at
    }))
  };
}

// =============================================================================
// Direct Firestore REST GET Parser (Resilient fallback when SDK stalls)
// =============================================================================

function fromRestValue(val: any): any {
  if (!val || typeof val !== 'object') return null;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('stringValue' in val) return String(val.stringValue);
  if ('timestampValue' in val) return String(val.timestampValue);
  if ('arrayValue' in val) {
    const arr = val.arrayValue?.values;
    return Array.isArray(arr) ? arr.map(fromRestValue) : [];
  }
  if ('mapValue' in val) {
    const fields = val.mapValue?.fields || {};
    const out: Record<string, any> = {};
    for (const k of Object.keys(fields)) {
      out[k] = fromRestValue(fields[k]);
    }
    return out;
  }
  return null;
}

async function getDemoTemplateDocDirect(timeoutMs = 7000): Promise<Record<string, any> | null> {
  const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseConfig.projectId
  )}/databases/${dbId}/documents/${DEMO_TEMPLATE_DOC_COLLECTION}/${DEMO_TEMPLATE_DOC_ID}?key=${encodeURIComponent(
    firebaseConfig.apiKey
  )}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const json = await resp.json();
    const fields = json?.fields;
    if (!fields || typeof fields !== 'object') return null;
    const parsed: Record<string, any> = {};
    for (const k of Object.keys(fields)) {
      parsed[k] = fromRestValue(fields[k]);
    }
    return parsed;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// =============================================================================
// Parse, Local Cache, Cloud Fetch, Cloud Publish & Clear
// =============================================================================

function normalizePayload(raw: any): DemoTemplatePayload {
  return {
    daily: Array.isArray(raw?.daily) ? raw.daily : initialDailyTransactions,
    backCash: Array.isArray(raw?.backCash) ? raw.backCash : initialBackCashTransactions,
    wholesalers: Array.isArray(raw?.wholesalers) ? raw.wholesalers : initialWholesalers,
    customers: Array.isArray(raw?.customers) ? raw.customers : initialCustomers,
    easyload: raw?.easyload && typeof raw.easyload === 'object' ? raw.easyload : initialEasyloadRecords,
    bottles: Array.isArray(raw?.bottles) ? raw.bottles : initialBottleItems,
    stockTx: Array.isArray(raw?.stockTx) ? raw.stockTx : initialStockTransactions
  };
}

function parseCloudDoc(docData: Record<string, any>): { data: DemoTemplatePayload; meta: CloudDemoTemplateMeta } {
  let rawPayload: any = null;
  if (typeof docData.payloadJson === 'string' && docData.payloadJson.trim()) {
    try {
      rawPayload = JSON.parse(docData.payloadJson);
    } catch {
      rawPayload = null;
    }
  } else if (docData.daily || docData.bottles || docData.easyload) {
    rawPayload = docData;
  }

  const data = normalizePayload(rawPayload);
  const counts = computeDemoCounts(data);
  const resetMinutes = Math.max(
    1,
    Math.min(240, Math.round(Number(docData.resetIntervalMinutes) || DEFAULT_DEMO_RESET_MINUTES))
  );
  const baseDate =
    typeof docData.baseDate === 'string' && ISO_DATE_RE.test(docData.baseDate)
      ? docData.baseDate
      : getTodayDateString();
  const autoShift = docData.autoShiftDatesToToday !== false;
  const hasCustom =
    docData.hasCustomTemplate === false
      ? false
      : Boolean(docData.hasCustomTemplate || getTotalDemoRecordCount(counts) > 0);

  return {
    data,
    meta: {
      hasCustomTemplate: hasCustom,
      updatedAt: typeof docData.updatedAt === 'string' ? docData.updatedAt : null,
      updatedBy: typeof docData.updatedBy === 'string' ? docData.updatedBy : null,
      baseDate,
      resetIntervalMinutes: resetMinutes,
      autoShiftDatesToToday: autoShift,
      counts
    }
  };
}

function cacheDemoTemplateLocally(data: DemoTemplatePayload, meta: CloudDemoTemplateMeta): void {
  try {
    localStorage.setItem(
      DEMO_TEMPLATE_STORAGE_KEY,
      JSON.stringify({
        ...data,
        savedAt: meta.updatedAt || new Date().toISOString(),
        updatedAt: meta.updatedAt,
        updatedBy: meta.updatedBy,
        baseDate: meta.baseDate,
        resetIntervalMinutes: meta.resetIntervalMinutes,
        autoShiftDatesToToday: meta.autoShiftDatesToToday,
        hasCustomTemplate: meta.hasCustomTemplate
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function getLocalCachedDemoTemplate(): CloudDemoTemplateResult {
  try {
    const saved = localStorage.getItem(DEMO_TEMPLATE_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const data = normalizePayload(parsed);
      const counts = computeDemoCounts(data);
      const baseDate =
        typeof parsed?.baseDate === 'string' && ISO_DATE_RE.test(parsed.baseDate)
          ? parsed.baseDate
          : getTodayDateString();
      const autoShift = parsed?.autoShiftDatesToToday !== false;
      const resetMinutes = Math.max(
        1,
        Math.min(240, Math.round(Number(parsed?.resetIntervalMinutes) || DEFAULT_DEMO_RESET_MINUTES))
      );
      const hasCustom =
        parsed?.hasCustomTemplate === false
          ? false
          : Boolean(parsed?.hasCustomTemplate || getTotalDemoRecordCount(counts) > 0);

      return {
        data: rebaseDemoTemplateDates(data, baseDate, autoShift),
        meta: {
          hasCustomTemplate: hasCustom,
          updatedAt: parsed?.updatedAt || parsed?.savedAt || null,
          updatedBy: parsed?.updatedBy || null,
          baseDate,
          resetIntervalMinutes: resetMinutes,
          autoShiftDatesToToday: autoShift,
          counts
        },
        source: 'local'
      };
    }
  } catch {
    // fallback to default
  }

  const empty = getEmptyDemoPayload();
  return {
    data: empty,
    meta: {
      hasCustomTemplate: false,
      updatedAt: null,
      updatedBy: null,
      baseDate: getTodayDateString(),
      resetIntervalMinutes: DEFAULT_DEMO_RESET_MINUTES,
      autoShiftDatesToToday: true,
      counts: computeDemoCounts(empty)
    },
    source: 'default'
  };
}

/**
 * Fetches the global published demo template from Firestore (platform_settings/demo_template).
 * Uses Firestore SDK with 5s timeout and automatic Direct REST GET fallback so every customer
 * gets the Super Admin's published demo data reliably — even without logging in.
 */
export async function fetchCloudDemoTemplate(options?: {
  rebaseToToday?: boolean;
}): Promise<CloudDemoTemplateResult> {
  const shouldRebase = options?.rebaseToToday !== false;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return getLocalCachedDemoTemplate();
  }

  let docData: Record<string, any> | null = null;
  try {
    const snap = await withTimeout(
      getDoc(doc(db, DEMO_TEMPLATE_DOC_COLLECTION, DEMO_TEMPLATE_DOC_ID)),
      5000,
      'getDoc:demo_template'
    );
    if (snap.exists()) {
      docData = snap.data() as Record<string, any>;
    }
  } catch (sdkErr) {
    console.warn('SDK demo_template fetch timed out/failed, trying direct REST:', sdkErr);
    docData = await getDemoTemplateDocDirect(7000);
  }

  // If SDK returned empty from offline cache while online, double check direct REST once
  if (!docData) {
    docData = await getDemoTemplateDocDirect(6000);
  }

  if (docData) {
    const { data, meta } = parseCloudDoc(docData);
    cacheDemoTemplateLocally(data, meta);
    return {
      data: shouldRebase ? rebaseDemoTemplateDates(data, meta.baseDate, meta.autoShiftDatesToToday) : data,
      meta,
      source: 'cloud'
    };
  }

  return getLocalCachedDemoTemplate();
}

/**
 * Publishes Super Admin's edited demo store snapshot to Firestore (platform_settings/demo_template)
 * so EVERY customer worldwide sees this exact demo data and auto-resets back to it every 30 minutes.
 */
export async function publishCloudDemoTemplate(
  payload: DemoTemplatePayload,
  options?: {
    updatedBy?: string;
    resetIntervalMinutes?: number;
    autoShiftDatesToToday?: boolean;
    hasCustomTemplate?: boolean;
  }
): Promise<PublishDemoTemplateResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      error: 'Internet connection is offline. Please connect to the internet to publish demo data to Cloud.'
    };
  }

  const normalized = normalizePayload(payload);
  const payloadJson = JSON.stringify(normalized);
  const byteSize = new Blob([payloadJson]).size;
  if (byteSize > MAX_DEMO_PAYLOAD_BYTES) {
    return {
      ok: false,
      error: `Demo data is too large (${Math.round(byteSize / 1024)} KB). Please keep demo records under 850 KB.`
    };
  }

  const counts = computeDemoCounts(normalized);
  const nowIso = new Date().toISOString();
  const baseDate = getTodayDateString();
  const resetMinutes = Math.max(
    1,
    Math.min(240, Math.round(Number(options?.resetIntervalMinutes) || DEFAULT_DEMO_RESET_MINUTES))
  );
  const autoShift = options?.autoShiftDatesToToday !== false;
  const hasCustom =
    options?.hasCustomTemplate === false ? false : getTotalDemoRecordCount(counts) > 0;
  const updatedBy =
    options?.updatedBy ||
    auth.currentUser?.email?.toLowerCase() ||
    'Super Admin';

  const meta: CloudDemoTemplateMeta = {
    hasCustomTemplate: hasCustom,
    updatedAt: nowIso,
    updatedBy,
    baseDate,
    resetIntervalMinutes: resetMinutes,
    autoShiftDatesToToday: autoShift,
    counts
  };

  const docPayload: Record<string, any> = {
    version: 2,
    hasCustomTemplate: hasCustom,
    updatedAt: nowIso,
    updatedBy,
    baseDate,
    resetIntervalMinutes: resetMinutes,
    autoShiftDatesToToday: autoShift,
    counts,
    payloadJson
  };

  // Save locally immediately
  cacheDemoTemplateLocally(normalized, meta);

  let sdkPermissionDenied = false;
  try {
    await withTimeout(
      setDoc(doc(db, DEMO_TEMPLATE_DOC_COLLECTION, DEMO_TEMPLATE_DOC_ID), docPayload, { merge: true }),
      6000,
      'setDoc:platform_settings/demo_template'
    );
    try {
      window.dispatchEvent(new CustomEvent('taj_demo_template_updated', { detail: meta }));
    } catch {}
    return { ok: true, meta };
  } catch (sdkErr: any) {
    const msg = String(sdkErr?.code || sdkErr?.message || '').toLowerCase();
    sdkPermissionDenied = msg.includes('permission-denied') || msg.includes('insufficient permissions');

    let authToken: string | null = null;
    try {
      if (auth.currentUser) {
        authToken = await withTimeout(auth.currentUser.getIdToken(), 2500, 'demoPublishGetIdToken');
      }
    } catch {
      authToken = null;
    }

    if (!authToken) {
      return {
        ok: false,
        needsGoogleAuth: true,
        error: 'Cloud permission required: Please click "Verify Cloud Auth (Google)" with your Master Super Admin Gmail first, then publish again.'
      };
    }

    // Try Direct Firestore REST fallback (bypasses stalled mobile WebChannel)
    const restRes = await patchFirestoreDocDirect(
      {
        projectId: firebaseConfig.projectId,
        databaseId: firebaseConfig.firestoreDatabaseId || '(default)',
        apiKey: firebaseConfig.apiKey,
        authToken
      },
      `${DEMO_TEMPLATE_DOC_COLLECTION}/${DEMO_TEMPLATE_DOC_ID}`,
      docPayload,
      8000
    );

    if (restRes.ok) {
      try {
        window.dispatchEvent(new CustomEvent('taj_demo_template_updated', { detail: meta }));
      } catch {}
      return { ok: true, meta };
    }

    const isPerm = sdkPermissionDenied || restRes.status === 403 || restRes.status === 401;
    return {
      ok: false,
      needsGoogleAuth: isPerm,
      error: isPerm
        ? 'Master Google Auth required to publish Cloud Demo Data. Click "Verify Cloud Auth (Google)" and try again.'
        : restRes.error || 'Could not reach Cloud Firestore. Please check your internet and try again.'
    };
  }
}

/**
 * Super Admin: Updates only the auto-reset interval (default 30 min) without modifying existing demo records.
 */
export async function updateDemoResetIntervalCloud(
  resetIntervalMinutes: number,
  updatedBy?: string
): Promise<PublishDemoTemplateResult> {
  const existing = await fetchCloudDemoTemplate({ rebaseToToday: false });
  return publishCloudDemoTemplate(existing.data, {
    updatedBy,
    resetIntervalMinutes,
    autoShiftDatesToToday: existing.meta.autoShiftDatesToToday,
    hasCustomTemplate: existing.meta.hasCustomTemplate
  });
}

/**
 * Super Admin: Clears published Cloud Demo Data back to an empty clean template.
 */
export async function clearCloudDemoTemplate(updatedBy?: string): Promise<PublishDemoTemplateResult> {
  const empty = getEmptyDemoPayload();
  const res = await publishCloudDemoTemplate(empty, {
    updatedBy,
    resetIntervalMinutes: DEFAULT_DEMO_RESET_MINUTES,
    autoShiftDatesToToday: true,
    hasCustomTemplate: false
  });
  if (res.ok) {
    try {
      localStorage.removeItem(DEMO_TEMPLATE_STORAGE_KEY);
    } catch {}
  }
  return res;
}
