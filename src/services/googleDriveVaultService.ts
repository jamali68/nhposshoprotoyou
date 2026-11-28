/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 15GB Google Drive Receipt & Bill Screenshot Vault Service
 * - Uses official Google Workspace Drive API v3 (`https://www.googleapis.com/auth/drive.file`)
 * - Uses a dedicated secondary Firebase Auth instance (`drive-vault-oauth`) so ANY POS user
 *   (Store Admin, Manager, Cashier, Salesman) can click "Sign in with Google" and select their
 *   own personal Gmail account (`prompt: 'select_account'`) without disrupting their active POS session.
 * - Caches the OAuth access token strictly in memory (never in localStorage or sessionStorage)
 *   and clears it on sign-out via `onAuthStateChanged`.
 * - Syncs receipt metadata & compressed preview across the shop (`shops/{shopId}/auth_audit_logs`)
 *   so the Store Admin can view all staff members' uploaded receipt screenshots in List View or
 *   adjustable mobile Grid Views (1x, 2x, 3x).
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  db,
  doc,
  collection,
  getDocs,
  setDoc,
  deleteDoc
} from '../firebase';

export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

export type ReceiptCategory =
  | 'sending'
  | 'receiving'
  | 'bill_payment'
  | 'easyload'
  | 'other';

export interface DriveStorageQuotaInfo {
  limitBytes: number;
  usageBytes: number;
  usageInDriveBytes: number;
  usageInDriveTrashBytes: number;
  connectedEmail: string;
  displayName: string;
  photoUrl?: string;
  updatedAt: string;
}

export interface ConnectedStaffDriveAccount {
  userKey: string; // e.g. "NH-sharafat" or "admin"
  userName: string;
  userRole: string;
  driveEmail: string;
  driveDisplayName?: string;
  drivePhotoUrl?: string;
  limitBytes?: number;
  usageBytes?: number;
  totalUploadsCount?: number;
  lastConnectedAt: string;
}

export interface DriveReceiptRecord {
  id: string;
  recordType: 'drive_receipt_vault';
  shopId: string;
  driveFileId: string;
  driveFolderId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  title: string;
  category: ReceiptCategory;
  amount: number;
  transactionDate: string; // YYYY-MM-DD
  referenceNote?: string;
  uploadedByUsername: string;
  uploadedByName: string;
  uploadedByRole: string;
  uploaderDriveEmail: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  previewDataUrl?: string; // High-clarity compressed WebP/JPEG thumbnail so Admin & team can preview immediately
  createdAt: string;
}

// Dedicated secondary Firebase App instance for Google Drive OAuth so staff logins (NH-...) are never overwritten
const DRIVE_AUTH_APP_NAME = 'drive-vault-oauth';
const driveFirebaseApp =
  getApps().some(a => a.name === DRIVE_AUTH_APP_NAME)
    ? getApp(DRIVE_AUTH_APP_NAME)
    : initializeApp(firebaseConfig, DRIVE_AUTH_APP_NAME);

const driveAuth = getAuth(driveFirebaseApp);

const driveProvider = new GoogleAuthProvider();
SCOPES.forEach(scope => driveProvider.addScope(scope));
driveProvider.setCustomParameters({ prompt: 'select_account' });

// In-memory access token cache (NEVER persisted to localStorage or sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedDriveUserEmail: string | null = null;
let cachedFolderIdByEmail: Record<string, string> = {};

const LOCAL_RECEIPTS_KEY_PREFIX = 'taj_pos_drive_vault_receipts_';
const LOCAL_ACCOUNTS_KEY_PREFIX = 'taj_pos_drive_vault_accounts_';

/**
 * Initialize auth state listener for Google Drive Vault.
 * Clears the in-memory cached access token when the user signs out.
 */
export const initDriveVaultAuth = (
  onAuthSuccess?: (user: FirebaseUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(driveAuth, async (user: FirebaseUser | null) => {
    if (user) {
      if (cachedAccessToken) {
        cachedDriveUserEmail = user.email || cachedDriveUserEmail;
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      cachedDriveUserEmail = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Opens the Google account chooser popup so the user (Admin or Staff) can pick their own Gmail
 * and grant permission for their 15GB Google Drive (`drive.file`).
 */
export const signInWithGoogleForDriveVault = async (): Promise<{
  user: FirebaseUser;
  accessToken: string;
  email: string;
} | null> => {
  try {
    isSigningIn = true;
    driveProvider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(driveAuth, driveProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('گوگل ڈرائیو ایکسیس ٹوکن حاصل نہیں ہو سکا۔ دوبارہ کوشش کریں۔ (Failed to get Google Drive access token)');
    }

    cachedAccessToken = credential.accessToken;
    cachedDriveUserEmail = (result.user.email || '').toLowerCase().trim();
    return {
      user: result.user,
      accessToken: cachedAccessToken,
      email: cachedDriveUserEmail
    };
  } catch (error: any) {
    console.error('Google Drive sign-in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getDriveAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getConnectedDriveEmailInMemory = (): string | null => {
  return cachedDriveUserEmail;
};

export const signOutFromDriveVault = async (): Promise<void> => {
  try {
    await driveAuth.signOut();
  } finally {
    cachedAccessToken = null;
    cachedDriveUserEmail = null;
  }
};

/**
 * Fetches live 15GB Google Drive Storage Quota & User Profile from Google Drive API v3
 */
export async function fetchDriveStorageQuota(
  accessToken?: string | null
): Promise<DriveStorageQuotaInfo | null> {
  const token = accessToken || cachedAccessToken;
  if (!token) return null;

  try {
    const res = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=storageQuota,user',
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    if (res.status === 401 || res.status === 403) {
      cachedAccessToken = null;
      return null;
    }
    if (!res.ok) return null;

    const data = await res.json();
    const q = data.storageQuota || {};
    const u = data.user || {};
    const limitBytes = Number(q.limit) || 15 * 1024 * 1024 * 1024; // Default 15 GB
    const usageBytes = Number(q.usage) || 0;
    const usageInDriveBytes = Number(q.usageInDrive) || 0;
    const usageInDriveTrashBytes = Number(q.usageInDriveTrash) || 0;

    return {
      limitBytes,
      usageBytes,
      usageInDriveBytes,
      usageInDriveTrashBytes,
      connectedEmail: (u.emailAddress || cachedDriveUserEmail || '').toLowerCase().trim(),
      displayName: u.displayName || 'Google Drive User',
      photoUrl: u.photoLink || undefined,
      updatedAt: new Date().toISOString()
    };
  } catch (err) {
    console.warn('fetchDriveStorageQuota notice:', err);
    return null;
  }
}

/**
 * Finds or creates the dedicated "NH POS Receipt Vault" folder in the user's Google Drive
 */
export async function ensureDriveVaultFolder(
  shopName: string,
  accessToken?: string | null
): Promise<string> {
  const token = accessToken || cachedAccessToken;
  if (!token) {
    throw new Error('Google Drive session expired. Please Sign in with Google again.');
  }

  const cacheKey = `${cachedDriveUserEmail || 'default'}_${shopName}`;
  if (cachedFolderIdByEmail[cacheKey]) {
    return cachedFolderIdByEmail[cacheKey];
  }

  const folderName = `NH POS Receipt Vault - ${shopName || 'Shop'}`.replace(/['"\\]/g, '').slice(0, 80);

  // 1. Search if folder already exists in user's Drive (created by this app)
  try {
    const q = encodeURIComponent(
      `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`
    );
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=5`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (Array.isArray(searchData.files) && searchData.files.length > 0 && searchData.files[0].id) {
        cachedFolderIdByEmail[cacheKey] = searchData.files[0].id;
        return searchData.files[0].id;
      }
    }
  } catch (err) {
    console.warn('Drive folder search notice:', err);
  }

  // 2. Create folder if not found
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'NH POS Shop Payment, Sending, Receiving & Bill Receipt Screenshots Vault'
    })
  });

  if (!createRes.ok) {
    throw new Error('Failed to create NH POS Receipt Vault folder in Google Drive.');
  }

  const folderData = await createRes.json();
  if (folderData?.id) {
    cachedFolderIdByEmail[cacheKey] = folderData.id;
    return folderData.id;
  }

  throw new Error('Google Drive folder ID missing.');
}

/**
 * Compresses an image file in the browser into:
 * 1) `uploadBlob`: Clean optimized JPEG/WebP (max 1600px, ~120-280 KB) for fast upload to the user's 15GB Google Drive
 *    (so 15GB can hold 60,000+ receipt screenshots!)
 * 2) `previewDataUrl`: Lightweight sharp thumbnail (max 680px, ~28-45 KB) stored in the shop's receipt metadata
 *    so Store Admin & Staff can view all screenshots immediately in List/Grid views across devices!
 */
export async function prepareReceiptImageForVault(file: File): Promise<{
  uploadBlob: Blob;
  previewDataUrl: string;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تصویر پڑھنے میں مسئلہ پیش آیا۔'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('منتخب کردہ فائل درست تصویر نہیں ہے۔'));
      img.onload = () => {
        try {
          // 1. Full readable image for Google Drive (max 1600px)
          const maxFullDim = 1600;
          let fullW = img.width;
          let fullH = img.height;
          if (fullW > maxFullDim || fullH > maxFullDim) {
            if (fullW > fullH) {
              fullH = Math.round((fullH * maxFullDim) / fullW);
              fullW = maxFullDim;
            } else {
              fullW = Math.round((fullW * maxFullDim) / fullH);
              fullH = maxFullDim;
            }
          }

          const fullCanvas = document.createElement('canvas');
          fullCanvas.width = fullW;
          fullCanvas.height = fullH;
          const fullCtx = fullCanvas.getContext('2d');
          if (fullCtx) {
            fullCtx.fillStyle = '#FFFFFF';
            fullCtx.fillRect(0, 0, fullW, fullH);
            fullCtx.drawImage(img, 0, 0, fullW, fullH);
          }

          // 2. Preview thumbnail for instant cross-device Admin/Staff Grid & List view (max 640px)
          const maxPrevDim = 640;
          let prevW = img.width;
          let prevH = img.height;
          if (prevW > maxPrevDim || prevH > maxPrevDim) {
            if (prevW > prevH) {
              prevH = Math.round((prevH * maxPrevDim) / prevW);
              prevW = maxPrevDim;
            } else {
              prevW = Math.round((prevW * maxPrevDim) / prevH);
              prevH = maxPrevDim;
            }
          }

          const prevCanvas = document.createElement('canvas');
          prevCanvas.width = prevW;
          prevCanvas.height = prevH;
          const prevCtx = prevCanvas.getContext('2d');
          if (prevCtx) {
            prevCtx.fillStyle = '#FFFFFF';
            prevCtx.fillRect(0, 0, prevW, prevH);
            prevCtx.drawImage(img, 0, 0, prevW, prevH);
          }

          let previewDataUrl = prevCanvas.toDataURL('image/webp', 0.68);
          if (!previewDataUrl.startsWith('data:image/webp') || previewDataUrl.length > 75000) {
            previewDataUrl = prevCanvas.toDataURL('image/jpeg', 0.62);
          }
          if (previewDataUrl.length > 85000) {
            previewDataUrl = prevCanvas.toDataURL('image/jpeg', 0.48);
          }

          fullCanvas.toBlob(
            blob => {
              resolve({
                uploadBlob: blob || file,
                previewDataUrl,
                width: fullW,
                height: fullH
              });
            },
            'image/jpeg',
            0.84
          );
        } catch (err) {
          reject(err);
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a receipt screenshot directly to the signed-in user's 15GB Google Drive
 * AND indexes the receipt metadata in Firestore (`shops/{shopId}/auth_audit_logs/drv_${id}`)
 * so the Store Admin can view every staff member's uploaded receipts!
 */
export async function uploadReceiptToGoogleDrive(params: {
  shopId: string;
  shopName: string;
  file: File;
  title: string;
  category: ReceiptCategory;
  amount: number;
  transactionDate: string;
  referenceNote?: string;
  uploadedByUsername: string;
  uploadedByName: string;
  uploadedByRole: string;
  uploaderDriveEmail: string;
  accessToken?: string | null;
}): Promise<DriveReceiptRecord> {
  const token = params.accessToken || cachedAccessToken;
  if (!token) {
    throw new Error('براہ کرم پہلے اپنے گوگل اکاؤنٹ کے ساتھ سائن ان کریں۔ (Please Sign in with Google first)');
  }

  // 1. Prepare optimized image & cross-device preview
  const { uploadBlob, previewDataUrl } = await prepareReceiptImageForVault(params.file);

  // 2. Ensure dedicated Drive folder exists
  const folderId = await ensureDriveVaultFolder(params.shopName, token);

  // 3. Build clean descriptive filename in Google Drive
  const safeTitle = (params.title || 'Receipt').replace(/[^a-zA-Z0-9_\-\u0600-\u06FF ]/g, '').trim() || 'Receipt';
  const cleanFileName = `${params.transactionDate}_${params.category.toUpperCase()}_${safeTitle}_Rs${params.amount || 0}_${params.uploadedByUsername}.jpg`;

  const metadata = {
    name: cleanFileName,
    mimeType: 'image/jpeg',
    parents: [folderId],
    description: JSON.stringify({
      shopId: params.shopId,
      title: params.title,
      category: params.category,
      amount: params.amount,
      transactionDate: params.transactionDate,
      referenceNote: params.referenceNote || '',
      uploadedByUsername: params.uploadedByUsername,
      uploadedByName: params.uploadedByName,
      uploadedByRole: params.uploadedByRole,
      uploaderDriveEmail: params.uploaderDriveEmail
    })
  };

  // 4. Multipart Upload to Google Drive v3 API
  const boundary = 'nhpos_drive_vault_boundary_' + Date.now().toString(36);
  const metaPart =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    'Content-Type: image/jpeg\r\n\r\n';
  const closePart = `\r\n--${boundary}--`;

  const multipartBody = new Blob([metaPart, uploadBlob, closePart], {
    type: `multipart/related; boundary=${boundary}`
  });

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime,webViewLink,webContentLink,thumbnailLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartBody
    }
  );

  if (uploadRes.status === 401 || uploadRes.status === 403) {
    cachedAccessToken = null;
    throw new Error('گوگل ڈرائیو سیشن ختم ہو چکا ہے۔ براہ کرم دوبارہ "Sign in with Google" پر کلک کریں۔');
  }

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => '');
    throw new Error(`گوگل ڈرائیو اپلوڈ میں مسئلہ پیش آیا: ${errText || uploadRes.statusText}`);
  }

  const driveFile = await uploadRes.json();
  const driveFileId = String(driveFile.id || '');

  // 5. Make the uploaded receipt viewable via link so Store Admin can also open the original Drive link
  if (driveFileId) {
    fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    }).catch(() => {});
  }

  const receiptId = `drv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const record: DriveReceiptRecord = {
    id: receiptId,
    recordType: 'drive_receipt_vault',
    shopId: params.shopId,
    driveFileId,
    driveFolderId: folderId,
    fileName: cleanFileName,
    mimeType: 'image/jpeg',
    sizeBytes: Number(driveFile.size) || uploadBlob.size || params.file.size,
    title: params.title.trim() || 'Receipt Screenshot',
    category: params.category,
    amount: Number(params.amount) || 0,
    transactionDate: params.transactionDate,
    referenceNote: params.referenceNote?.trim() || '',
    uploadedByUsername: params.uploadedByUsername,
    uploadedByName: params.uploadedByName,
    uploadedByRole: params.uploadedByRole,
    uploaderDriveEmail: params.uploaderDriveEmail.toLowerCase().trim(),
    webViewLink: driveFile.webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`,
    webContentLink: driveFile.webContentLink || `https://drive.google.com/uc?export=view&id=${driveFileId}`,
    thumbnailLink: driveFile.thumbnailLink || `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w1000`,
    previewDataUrl,
    createdAt: driveFile.createdTime || new Date().toISOString()
  };

  // 6. Save locally & sync to Firestore so Store Admin and all authorized shop devices can inspect it
  saveLocalReceiptRecord(params.shopId, record);

  try {
    await setDoc(
      doc(db, 'shops', params.shopId, 'auth_audit_logs', receiptId),
      record,
      { merge: true }
    );
  } catch (err) {
    console.warn('Firestore receipt metadata sync note:', err);
  }

  return record;
}

/**
 * Deletes a receipt screenshot from the user's Google Drive AND from the shop's shared vault index.
 * Must only be called AFTER explicit user confirmation in the UI!
 */
export async function deleteReceiptFromDriveAndVault(params: {
  shopId: string;
  receipt: DriveReceiptRecord;
  accessToken?: string | null;
}): Promise<{ deletedFromDrive: boolean; deletedFromVault: boolean }> {
  const token = params.accessToken || cachedAccessToken;
  let deletedFromDrive = false;

  // 1. Delete from Google Drive if token is active and driveFileId exists
  if (token && params.receipt.driveFileId) {
    try {
      const delRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(params.receipt.driveFileId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      if (delRes.ok || delRes.status === 204 || delRes.status === 404) {
        deletedFromDrive = true;
      }
    } catch (err) {
      console.warn('Google Drive file delete notice:', err);
    }
  }

  // 2. Remove from local cache
  removeLocalReceiptRecord(params.shopId, params.receipt.id);

  // 3. Remove from Firestore shared vault collection
  let deletedFromVault = false;
  try {
    await deleteDoc(doc(db, 'shops', params.shopId, 'auth_audit_logs', params.receipt.id));
    deletedFromVault = true;
  } catch (err) {
    console.warn('Firestore receipt delete notice:', err);
  }

  return { deletedFromDrive, deletedFromVault };
}

/**
 * Load cached receipts from localStorage for 0ms instant rendering
 */
export function loadLocalShopReceipts(shopId: string): DriveReceiptRecord[] {
  if (!shopId) return [];
  try {
    const raw = localStorage.getItem(`${LOCAL_RECEIPTS_KEY_PREFIX}${shopId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      }
    }
  } catch {}
  return [];
}

export function saveLocalReceiptRecord(shopId: string, record: DriveReceiptRecord): DriveReceiptRecord[] {
  const existing = loadLocalShopReceipts(shopId).filter(r => r.id !== record.id);
  const next = [record, ...existing].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  try {
    localStorage.setItem(`${LOCAL_RECEIPTS_KEY_PREFIX}${shopId}`, JSON.stringify(next));
  } catch {}
  return next;
}

export function removeLocalReceiptRecord(shopId: string, receiptId: string): DriveReceiptRecord[] {
  const next = loadLocalShopReceipts(shopId).filter(r => r.id !== receiptId);
  try {
    localStorage.setItem(`${LOCAL_RECEIPTS_KEY_PREFIX}${shopId}`, JSON.stringify(next));
  } catch {}
  return next;
}

/**
 * Fetches all shared receipt records for the shop from Firestore (`shops/{shopId}/auth_audit_logs`)
 * so the Store Admin can see all staff members' uploaded receipt screenshots across devices!
 */
export async function syncShopReceiptsFromCloud(shopId: string): Promise<DriveReceiptRecord[]> {
  const local = loadLocalShopReceipts(shopId);
  if (!shopId || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return local;
  }

  try {
    const snap = await getDocs(collection(db, 'shops', shopId, 'auth_audit_logs'));
    const mergedMap = new Map<string, DriveReceiptRecord>();
    local.forEach(item => {
      if (item && item.id) mergedMap.set(item.id, item);
    });

    snap.forEach(d => {
      const data = d.data() as any;
      if (data && (data.recordType === 'drive_receipt_vault' || String(d.id).startsWith('drv_'))) {
        mergedMap.set(d.id, {
          ...data,
          id: d.id,
          recordType: 'drive_receipt_vault'
        } as DriveReceiptRecord);
      }
    });

    const merged = Array.from(mergedMap.values()).sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
    try {
      localStorage.setItem(`${LOCAL_RECEIPTS_KEY_PREFIX}${shopId}`, JSON.stringify(merged));
    } catch {}
    return merged;
  } catch (err) {
    console.warn('syncShopReceiptsFromCloud notice:', err);
    return local;
  }
}

/**
 * Persists & loads which Gmail account each user/staff member connected to their Google Drive Vault
 */
export function loadConnectedStaffDriveAccounts(shopId: string): ConnectedStaffDriveAccount[] {
  if (!shopId) return [];
  try {
    const raw = localStorage.getItem(`${LOCAL_ACCOUNTS_KEY_PREFIX}${shopId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export async function registerConnectedStaffDriveAccount(
  shopId: string,
  account: ConnectedStaffDriveAccount
): Promise<ConnectedStaffDriveAccount[]> {
  if (!shopId) return [];
  const current = loadConnectedStaffDriveAccounts(shopId).filter(
    a => a.userKey.toLowerCase() !== account.userKey.toLowerCase()
  );
  const next = [account, ...current];
  try {
    localStorage.setItem(`${LOCAL_ACCOUNTS_KEY_PREFIX}${shopId}`, JSON.stringify(next));
  } catch {}

  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const docId = `drv_acc_${account.userKey.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`;
      await setDoc(
        doc(db, 'shops', shopId, 'auth_audit_logs', docId),
        {
          ...account,
          recordType: 'drive_connected_account'
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('registerConnectedStaffDriveAccount cloud note:', err);
    }
  }
  return next;
}

export async function syncConnectedStaffDriveAccountsFromCloud(
  shopId: string
): Promise<ConnectedStaffDriveAccount[]> {
  const local = loadConnectedStaffDriveAccounts(shopId);
  if (!shopId || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return local;
  }

  try {
    const snap = await getDocs(collection(db, 'shops', shopId, 'auth_audit_logs'));
    const map = new Map<string, ConnectedStaffDriveAccount>();
    local.forEach(a => {
      if (a && a.userKey) map.set(a.userKey.toLowerCase(), a);
    });

    snap.forEach(d => {
      const data = d.data() as any;
      if (data && (data.recordType === 'drive_connected_account' || String(d.id).startsWith('drv_acc_'))) {
        if (data.userKey && data.driveEmail) {
          map.set(String(data.userKey).toLowerCase(), {
            userKey: data.userKey,
            userName: data.userName || data.userKey,
            userRole: data.userRole || 'staff',
            driveEmail: data.driveEmail,
            driveDisplayName: data.driveDisplayName,
            drivePhotoUrl: data.drivePhotoUrl,
            limitBytes: data.limitBytes,
            usageBytes: data.usageBytes,
            lastConnectedAt: data.lastConnectedAt || new Date().toISOString()
          });
        }
      }
    });

    const merged = Array.from(map.values());
    try {
      localStorage.setItem(`${LOCAL_ACCOUNTS_KEY_PREFIX}${shopId}`, JSON.stringify(merged));
    } catch {}
    return merged;
  } catch {
    return local;
  }
}
