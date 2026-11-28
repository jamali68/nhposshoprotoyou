# NH POS Shop — Development Roadmap

> **Status:** All roadmap items are **100% Completed & Verified** (`0 Pending`).

---

## Planned Features (Pending)

- _None — all requested roadmap items have been completed!_

---

## Completed & Verified Features & Fixes

### 1. Smart Dirty-State Save Button (`Unsaved Value` Green vs. `Saved Successful` Gray)
- **Status:** `Completed & Verified`
- **Screen:** Easy Load Balance Manager (`/src/views/EasyloadLedgerView.tsx` — across both **TOTAL CLOSING** and **TOTAL OPENING** tabs).
- **Implemented Behavior:**
  1. **Unsaved / Pending Changes → Green (`Unsaved Value`):** When a date has not been saved yet, or when any network balance differs from the saved record, the button displays **Green** with the text **`Unsaved Value`**.
  2. **Saved / Already Up-to-Date → Gray (`Saved Successful`):** Once the user presses Save (or opens a date whose values already match the saved record), the button immediately turns **Gray** with the text **`Saved Successful`** and disables redundant duplicate saves.
  3. **Any Value Modified → Automatically Back to Green (`Unsaved Value`):** Changing any network value (Jazz, Telenor, Zong, or Ufone) on either tab immediately switches the button back to **Green (`Unsaved Value`)**.
  4. **Reverted to Original Saved Value → Automatically Back to Gray (`Saved Successful`):** Typing back the exact same saved value immediately returns the button to **Gray (`Saved Successful`)**.

### 2. Auto-Sync Timer & Manual Bypass Sync (`Sync Now`) Reliability Audit & Fix
- **Status:** `Completed & Verified`
- **Fixes Applied:**
  - Wired `syncNowRef` into the 1-second timer and all network/visibility listeners (eliminating stale closures).
  - Added strict per-operation timeouts (7.5s SDK + automatic Direct Firestore REST API fallback with 8.5s `AbortController` timeout) and a 25-second stuck-sync watchdog + `finally` lock release so `Syncing...` can **never** get stuck.
  - Switched queue flushing to fast parallel batches (chunks of 5) and removed only entries that actually succeeded (preserving failed/new edits safely).
  - Moved full timer reset (`15m`/`30m`) and manual bypass deduction to happen **only after** sync succeeds; failed uploads automatically retry in **30 seconds** without wasting a bypass count.
  - Updated IndexedDB mirror (`bgSyncStore.ts`) and `public/sw.js` to honor the shop's live package timer (`autoSyncIntervalMinutes`) with `AbortController` timeouts.

### 3. Sticky Compact Title Bar & Back Button on Scroll (50% Shrink Frosted-Glass Effect)
- **Status:** `Completed & Verified`
- **Target Screens:**
  1. **Customer Credit Ledger** (`/src/views/CustomerBillsView.tsx`)
  2. **Wholesaler Ledger** (`/src/views/WholesalerBillsView.tsx`)
  3. **Back Cash Manager** (`/src/views/BackCashView.tsx`)
- **Implemented Behavior:**
  - Created reusable `/src/components/StickyPageHeader.tsx` that dynamically tracks the main top navbar height via `ResizeObserver` and pins the page header right underneath it (`position: sticky`).
  - At the top of the page, the full white card (`p-3.5`, `rounded-2xl`) stays identical to the original design.
  - On scroll, neither the `← Back` button nor the Page Title hides — the white bar smoothly shrinks ~50% (`py-1.5 px-2.5`) with a frosted-glass backdrop blur (`bg-white/88 backdrop-blur-md shadow-md`) and zero-jitter scroll sentinel hysteresis.

### 4. Splash Screen Logo — Instant Code-Embedded Load Priority (Zero Missing Logo / Alt-Text)
- **Status:** `Completed & Verified`
- **Implemented Behavior:**
  - Embedded the official NH POS logo (`public/icon-192.png`) directly inline as a Base64 data URI inside `/index.html` (`#pwa-splash`) AND inside `/src/assets/nhPosLogoData.ts` (used by `/src/components/TajLogo.tsx`).
  - Eliminated external network fetches for the splash and app brand logo so it paints **first** at frame 0 with 0ms delay even on slow or offline connections, followed smoothly by the text & spinner reveal.
  - Removed raw `alt="NH POS Official Logo"` rendering (using `alt=""` with accessible `role="img" aria-label="NH POS Shop"` on the wrapper) so broken image icons or clipped alt text can never appear.
