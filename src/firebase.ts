import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  setLogLevel,
  doc,
  collection,
  query,
  where,
  getDoc as rawGetDoc,
  getDocs as rawGetDocs,
  setDoc as rawSetDoc,
  updateDoc as rawUpdateDoc,
  deleteDoc as rawDeleteDoc,
  onSnapshot as rawOnSnapshot
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  initAutomaticUsageMonitor,
  trackFirebaseRead,
  trackFirebaseWrite,
  trackFirebaseDelete
} from './utils/usageTracker';

// Silence internal offline retry messages to prevent false alarm connection errors in sandboxes
setLogLevel('silent');

// Start automatic browser-level Netlify Web/CDN request & bandwidth monitor
if (typeof window !== 'undefined') {
  initAutomaticUsageMonitor();
}

const app = initializeApp(firebaseConfig);

const isBrowser = typeof window !== 'undefined';
const hasIndexedDB = isBrowser && typeof window.indexedDB !== 'undefined';

export const db = initializeFirestore(
  app,
  {
    ignoreUndefinedProperties: true,
    ...(isBrowser ? { experimentalAutoDetectLongPolling: true } : {}),
    ...(hasIndexedDB
      ? {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
          })
        }
      : {})
  },
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : undefined
);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Tracked Firestore wrappers (99% accurate Server-Only Read / Write / Delete accounting — excludes 0-cost local cache hits)
export const getDoc = (async (ref: any) => {
  const snap = await rawGetDoc(ref);
  if (!snap?.metadata?.fromCache) {
    trackFirebaseRead(1);
  }
  return snap;
}) as typeof rawGetDoc;

export const getDocs = (async (q: any) => {
  const snap = await rawGetDocs(q);
  // Firestore bills 1 read per returned document (min 1 if 0 docs) ONLY when served from server, not local cache
  if (!snap?.metadata?.fromCache) {
    trackFirebaseRead(Math.max(1, snap?.size || 1));
  }
  return snap;
}) as typeof rawGetDocs;

export const setDoc = (async (ref: any, data: any, options?: any) => {
  trackFirebaseWrite(1);
  return options !== undefined ? rawSetDoc(ref, data, options) : rawSetDoc(ref, data);
}) as typeof rawSetDoc;

export const updateDoc = (async (ref: any, data: any, ...rest: any[]) => {
  trackFirebaseWrite(1);
  return (rawUpdateDoc as any)(ref, data, ...rest);
}) as typeof rawUpdateDoc;

export const deleteDoc = (async (ref: any) => {
  trackFirebaseDelete(1);
  return rawDeleteDoc(ref);
}) as typeof rawDeleteDoc;

export const onSnapshot: typeof rawOnSnapshot = ((ref: any, ...args: any[]) => {
  if (typeof args[0] === 'function') {
    const originalNext = args[0];
    args[0] = (snap: any) => {
      // Skip local IndexedDB cache emissions (0 Firebase billing); count only real server updates!
      if (!snap?.metadata?.fromCache) {
        const count =
          typeof snap?.docChanges === 'function'
            ? Math.max(1, snap.docChanges().length)
            : 1;
        trackFirebaseRead(count);
      }
      return originalNext(snap);
    };
  }
  return (rawOnSnapshot as any)(ref, ...args);
}) as typeof rawOnSnapshot;

export {
  doc,
  collection,
  query,
  where,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  GoogleAuthProvider
};


