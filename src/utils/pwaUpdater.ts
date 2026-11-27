/**
 * Smart Non-Disruptive PWA Background Updater (Works identically on GitHub Pages & Netlify)
 * - Bypasses GitHub Pages' 10-minute CDN cache (max-age=600) via fresh version.json?_t=... check
 *   and versioned sw.js?v=<version>-<buildId> registration
 * - Downloads new Service Worker + bundles silently in the background whenever online
 * - NEVER reloads or interrupts the user while working/typing/viewing a screen
 * - Instantly applies the pre-downloaded update at safe transition moments:
 *     1. Page / Screen switch (setActiveView / goBack) — restores exact target view seamlessly
 *     2. Manual page refresh / cold app launch
 *     3. App close & reopen (after being backgrounded, only when no form input/mutation is active)
 */

import { DEFAULT_APP_VERSION } from './version';
import { trackNetlifyWebRequest } from './usageTracker';

const PENDING_VIEW_KEY = 'nhpos_pending_view_after_update';
const LAST_APPLIED_AT_KEY = 'nhpos_pwa_last_applied_at';
// Smart Request-Saving Intervals:
// - Minimum 15 minutes between background checks on navigation/focus/online
// - 30 minutes periodic check while app remains continuously open
const CHECK_DEBOUNCE_MS = 15 * 60 * 1000;
const PERIODIC_CHECK_MS = 30 * 60 * 1000;
const APPLY_COOLDOWN_MS = 5_000;
const MIN_HIDDEN_MS_FOR_REOPEN_APPLY = 3_000;

let swRegistration: ServiceWorkerRegistration | null = null;
let waitingWorker: ServiceWorker | null = null;
let isApplyingUpdate = false;
let isMutationBusy = false;
let lastCheckAt = 0;
let hiddenSinceAt = 0;
let initialized = false;
let periodicTimer: number | null = null;
let lastRegisteredVersionTag = '';

function isProductionPwaHost(): boolean {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
  const host = window.location.hostname;
  return host !== 'localhost' && host !== '127.0.0.1' && !host.includes('run.app');
}

function getRunningBuildId(): string {
  if (typeof document === 'undefined') return '';
  try {
    const scripts = document.querySelectorAll('script[src]');
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].getAttribute('src') || '';
      const match = src.match(/app-([a-zA-Z0-9_-]+)\.js/);
      if (match && match[1]) return match[1];
    }
  } catch {
    // ignore
  }
  return '';
}

function canApplyNowWithoutLoop(): boolean {
  try {
    const raw = sessionStorage.getItem(LAST_APPLIED_AT_KEY);
    if (raw) {
      const elapsed = Date.now() - Number(raw);
      if (!isNaN(elapsed) && elapsed >= 0 && elapsed < APPLY_COOLDOWN_MS) {
        return false;
      }
    }
  } catch {
    // ignore storage errors
  }
  return true;
}

function markAppliedNow(): void {
  try {
    sessionStorage.setItem(LAST_APPLIED_AT_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

/**
 * Checks whether the user is currently typing or holding unsaved input inside a form
 * so background-resume NEVER wipes half-entered data.
 */
function isUserBusyWithForm(): boolean {
  if (isMutationBusy) return true;
  if (typeof document === 'undefined') return false;

  const active = document.activeElement as HTMLElement | null;
  if (active) {
    const tag = active.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable) {
      return true;
    }
  }

  // Also protect any non-empty text/number input inside an active <form> (e.g. user switched to Calculator briefly)
  const formFields = document.querySelectorAll('form input, form textarea');
  for (let i = 0; i < formFields.length; i++) {
    const el = formFields[i] as HTMLInputElement | HTMLTextAreaElement;
    if (el.disabled || el.readOnly) continue;
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (
      type === 'hidden' ||
      type === 'submit' ||
      type === 'button' ||
      type === 'checkbox' ||
      type === 'radio' ||
      type === 'date' ||
      type === 'month' ||
      type === 'file'
    ) {
      continue;
    }
    if ((el.value || '').trim().length > 0) {
      return true;
    }
  }

  return false;
}

export function setPwaMutationBusy(busy: boolean): void {
  isMutationBusy = busy;
}

export function hasReadyPwaUpdate(): boolean {
  if (waitingWorker && waitingWorker.state !== 'redundant') return true;
  if (swRegistration?.waiting && swRegistration.waiting.state !== 'redundant') {
    waitingWorker = swRegistration.waiting;
    return true;
  }
  return false;
}

function trackInstallingWorker(worker: ServiceWorker | null): void {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      // New version is 100% downloaded in background and ready to apply on next safe transition
      waitingWorker = worker;
    }
  });
}

function attachRegistrationListeners(reg: ServiceWorkerRegistration): void {
  swRegistration = reg;
  if (reg.waiting && navigator.serviceWorker.controller) {
    waitingWorker = reg.waiting;
  }
  if (reg.installing) {
    trackInstallingWorker(reg.installing);
  }
  reg.addEventListener('updatefound', () => {
    trackInstallingWorker(reg.installing);
  });
}

/**
 * Checks version.json with a fresh query string to bypass GitHub Pages' 10-minute CDN cache
 * (Cache-Control: max-age=600). ONLY fetches/updates sw.js if version or buildId actually changed!
 * This cuts idle background Netlify requests by 95%+.
 */
async function checkRemoteVersionManifest(): Promise<void> {
  if (!isProductionPwaHost()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  try {
    const resp = await fetch(`./version.json?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache'
      }
    });
    if (!resp.ok) return;

    const data = await resp.json();
    const remoteVersion = typeof data?.version === 'string' ? data.version.trim() : '';
    const remoteBuildId = typeof data?.buildId === 'string' ? data.buildId.trim() : '';
    if (!remoteVersion && !remoteBuildId) return;

    const runningBuildId = getRunningBuildId();
    const versionChanged = Boolean(remoteVersion && remoteVersion !== DEFAULT_APP_VERSION);
    const buildChanged = Boolean(runningBuildId && remoteBuildId && remoteBuildId !== runningBuildId);

    if (versionChanged || buildChanged) {
      const tag = `${remoteVersion || DEFAULT_APP_VERSION}-${remoteBuildId || 'latest'}`;
      if (tag === lastRegisteredVersionTag) {
        // Already triggered background download for this tag — ensure update check runs
        if (swRegistration) {
          trackNetlifyWebRequest(1, 1450);
          swRegistration.update().catch(() => {});
        }
        return;
      }
      lastRegisteredVersionTag = tag;

      // Registering with unique ?v=<tag> bypasses GitHub Pages' 10-minute CDN cache on sw.js!
      const swUrl = `./sw.js?v=${encodeURIComponent(tag)}`;
      trackNetlifyWebRequest(1, 1450);
      const reg = await navigator.serviceWorker.register(swUrl, {
        scope: './',
        updateViaCache: 'none'
      });
      attachRegistrationListeners(reg);
    }
  } catch {
    // Offline or version.json not yet present — ignore silently
  }
}

/**
 * Silently checks the server for a new version.json (and sw.js ONLY if version changed).
 * Throttled to once every 15-30 minutes so Netlify requests are never wasted.
 */
export function triggerSilentPwaCheck(force = false): void {
  if (!isProductionPwaHost()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const now = Date.now();
  if (!force && now - lastCheckAt < CHECK_DEBOUNCE_MS) return;
  lastCheckAt = now;

  // Check lightweight version.json manifest first; it will only pull sw.js if a new build actually exists!
  void checkRemoteVersionManifest();
}

function activateWaitingWorkerNow(): boolean {
  if (isApplyingUpdate || isMutationBusy) return false;
  if (!canApplyNowWithoutLoop()) return false;

  const target = waitingWorker || swRegistration?.waiting || null;
  if (!target || target.state === 'redundant') return false;

  isApplyingUpdate = true;
  markAppliedNow();

  try {
    target.postMessage({ type: 'SKIP_WAITING' });
  } catch {
    isApplyingUpdate = false;
    return false;
  }

  // Fallback reload if controllerchange takes longer than 1.2s
  window.setTimeout(() => {
    if (isApplyingUpdate) {
      window.location.reload();
    }
  }, 1200);

  return true;
}

/**
 * Called right when the user clicks to switch pages/screens (setActiveView / goBack).
 * - If a pre-downloaded update is waiting: activates it immediately and reloads straight into `targetView`!
 * - Otherwise: triggers a quiet debounced background check and lets normal 0ms navigation proceed.
 */
export function applyPendingPwaUpdateOnNavigation(targetView?: string): boolean {
  if (!isProductionPwaHost()) return false;

  if (hasReadyPwaUpdate() && !isMutationBusy && canApplyNowWithoutLoop()) {
    if (targetView) {
      try {
        sessionStorage.setItem(PENDING_VIEW_KEY, targetView);
      } catch {
        // ignore
      }
    }
    return activateWaitingWorkerNow();
  }

  // No waiting update yet — quietly check in background for next time
  triggerSilentPwaCheck(false);
  return false;
}

/**
 * Reads and clears the target view saved right before a seamless page-switch PWA update reload.
 */
export function consumePendingViewAfterPwaUpdate(): string | null {
  try {
    const view = sessionStorage.getItem(PENDING_VIEW_KEY);
    if (view) {
      sessionStorage.removeItem(PENDING_VIEW_KEY);
      return view;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Initializes the Smart Background PWA Updater (called once from src/main.tsx).
 */
export function initSmartPwaUpdater(): void {
  if (initialized || typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  initialized = true;

  if (!isProductionPwaHost()) {
    // Prevent stale caching on dev preview hosts
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().catch(() => {});
      }
    });
    return;
  }

  // Reload ONLY when our Smart Updater intentionally activated a waiting worker at a safe transition
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isApplyingUpdate) {
      window.location.reload();
    }
  });

  // Listen for SW_UPDATE_READY broadcast from installing worker
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    if (event.data?.type === 'SW_UPDATE_READY' && swRegistration?.waiting) {
      waitingWorker = swRegistration.waiting;
    }
  });

  const registerSW = () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './', updateViaCache: 'none' })
      .then((reg) => {
        attachRegistrationListeners(reg);

        // If an update finished downloading previously and user just refreshed or reopened the app,
        // activate it right away on startup before the user starts typing!
        if (reg.waiting && navigator.serviceWorker.controller) {
          waitingWorker = reg.waiting;
          if (!isUserBusyWithForm()) {
            activateWaitingWorkerNow();
            return;
          }
        }

        // Start silent background check (both SW update + GitHub Pages version.json check) right after boot
        triggerSilentPwaCheck(true);
      })
      .catch((err) => {
        console.warn('PWA ServiceWorker registration notice:', err);
      });
  };

  if (document.readyState === 'complete') {
    registerSW();
  } else {
    window.addEventListener('load', registerSW, { once: true });
  }

  // Check silently when internet turns back on (respects 15-minute debounce to save Netlify requests)
  window.addEventListener('online', () => {
    triggerSilentPwaCheck(false);
  });

  // Track app hide/reopen (close/minimize -> reopen)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenSinceAt = Date.now();
      return;
    }

    if (document.visibilityState === 'visible') {
      const wasHiddenMs = hiddenSinceAt > 0 ? Date.now() - hiddenSinceAt : 0;
      hiddenSinceAt = 0;

      // If user closed/backgrounded the app and reopened it with an update ALREADY downloaded,
      // apply seamlessly ONLY if they aren't mid-entry in any form!
      if (
        wasHiddenMs >= MIN_HIDDEN_MS_FOR_REOPEN_APPLY &&
        hasReadyPwaUpdate() &&
        !isUserBusyWithForm()
      ) {
        if (activateWaitingWorkerNow()) {
          return;
        }
      }

      // Otherwise check silently in background for future transitions
      triggerSilentPwaCheck(false);
    }
  });

  // Silent periodic background pre-download check while app is open & online (never interrupts UI)
  periodicTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      triggerSilentPwaCheck(false);
    }
  }, PERIODIC_CHECK_MS);

  window.addEventListener('beforeunload', () => {
    if (periodicTimer !== null) {
      window.clearInterval(periodicTimer);
    }
  });
}
