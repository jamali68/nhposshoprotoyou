/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 15GB Google Drive Receipt & Bill Screenshot Vault View
 * - Official "Sign in with Google" account chooser (`prompt: 'select_account'`) so each
 *   Admin or Staff member can connect their own personal 15GB Google Drive account.
 * - Store Admin can view all staff members' connected Gmail accounts and inspect all
 *   uploaded receipt/bill screenshots across the team.
 * - Mobile-First Adjustable Views:
 *   1) Grid 2x (2 columns on mobile — default balanced view)
 *   2) Grid 1x (1 large readable card per row on mobile for checking TID/details)
 *   3) Grid 3x (3 compact thumbnails per row on mobile)
 *   4) List View (Detailed horizontal rows with thumbnail, party, amount, staff & Gmail info)
 * - Full-screen Screenshot Inspector (Lightbox) with Zoom (1x..3x), Rotate 90°, Prev/Next,
 *   Open in Google Drive, Download, and Mandatory Delete Confirmation Modal.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Cloud,
  Upload,
  Search,
  LayoutGrid,
  List as ListIcon,
  Columns2,
  Grid3X3,
  Square,
  Trash2,
  ExternalLink,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  UserCheck,
  Users,
  Calendar,
  FileImage,
  ShieldCheck,
  LogOut,
  Camera,
  Eye,
  ArrowLeft,
  HardDrive,
  Filter
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { superAdminService } from '../superadmin/superAdminService';
import {
  DriveReceiptRecord,
  ReceiptCategory,
  DriveStorageQuotaInfo,
  ConnectedStaffDriveAccount,
  initDriveVaultAuth,
  signInWithGoogleForDriveVault,
  signOutFromDriveVault,
  getDriveAccessToken,
  getConnectedDriveEmailInMemory,
  fetchDriveStorageQuota,
  uploadReceiptToGoogleDrive,
  deleteReceiptFromDriveAndVault,
  loadLocalShopReceipts,
  syncShopReceiptsFromCloud,
  loadConnectedStaffDriveAccounts,
  registerConnectedStaffDriveAccount,
  syncConnectedStaffDriveAccountsFromCloud
} from '../services/googleDriveVaultService';

type VaultViewMode = 'grid_2' | 'grid_1' | 'grid_3' | 'list';

const VIEW_MODE_STORAGE_KEY = 'taj_pos_drive_vault_view_mode';

const CATEGORY_META: Record<
  ReceiptCategory,
  { label: string; urduLabel: string; badgeClass: string; dotClass: string }
> = {
  sending: {
    label: 'Sending Payment',
    urduLabel: 'پیمنٹ بھیجی (Sending)',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500'
  },
  receiving: {
    label: 'Receiving Payment',
    urduLabel: 'پیمنٹ وصول (Receiving)',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    dotClass: 'bg-blue-500'
  },
  bill_payment: {
    label: 'Wholesaler / Bill',
    urduLabel: 'بل ادائیگی (Bill Payment)',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dotClass: 'bg-indigo-500'
  },
  easyload: {
    label: 'EasyLoad / Mobile',
    urduLabel: 'ایزی لوڈ / موبائل والٹ',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    dotClass: 'bg-amber-500'
  },
  other: {
    label: 'Other Receipt',
    urduLabel: 'دیگر رسید (Other)',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    dotClass: 'bg-slate-500'
  }
};

function formatBytesToGB(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0.00 GB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb < 0.01) {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  }
  return `${gb.toFixed(2)} GB`;
}

function formatBytesToKB(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  const kb = bytes / 1024;
  if (kb >= 1024) {
    return `${(kb / 1024).toFixed(2)} MB`;
  }
  return `${Math.round(kb)} KB`;
}

export const GoogleDriveVaultView: React.FC = () => {
  const { currentUser, currentShop, setActiveView, registerBackHandler } = usePOS();

  const shopId = currentShop?.id || currentUser?.shopId || 'default_shop';
  const shopName = currentShop?.shop_name || 'NH POS Shop';
  const currentUsername = currentUser?.username || currentUser?.email || 'admin';
  const currentDisplayName = currentUser?.name || currentUsername;
  const currentUserRole = currentUser?.role || 'admin';

  const isStoreAdmin = Boolean(
    currentUser?.role === 'admin' ||
      currentUser?.role === 'super_admin' ||
      currentUser?.isGoogleUser
  );

  // Check Super Admin package permission for 15GB Google Drive Vault
  const syncPolicy = superAdminService.getShopEffectiveSyncPolicy(shopId);
  const isVaultAllowed = currentUser?.role === 'super_admin' || syncPolicy.allowGoogleDriveVault;

  // View Mode (Persisted in localStorage so user's preferred mobile layout is remembered)
  const [viewMode, setViewMode] = useState<VaultViewMode>(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY) as VaultViewMode;
      if (saved === 'grid_1' || saved === 'grid_2' || saved === 'grid_3' || saved === 'list') {
        return saved;
      }
    } catch {}
    return 'grid_2';
  });

  const handleChangeViewMode = (mode: VaultViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {}
  };

  // Connected Google Drive OAuth State (in-memory token + live quota)
  const [accessToken, setAccessToken] = useState<string | null>(() => null);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(() =>
    getConnectedDriveEmailInMemory()
  );
  const [quotaInfo, setQuotaInfo] = useState<DriveStorageQuotaInfo | null>(null);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isRefreshingCloud, setIsRefreshingCloud] = useState(false);

  // Shop Receipts & Connected Staff Accounts
  const [receipts, setReceipts] = useState<DriveReceiptRecord[]>(() =>
    loadLocalShopReceipts(shopId)
  );
  const [staffAccounts, setStaffAccounts] = useState<ConnectedStaffDriveAccount[]>(() =>
    loadConnectedStaffDriveAccounts(shopId)
  );

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | ReceiptCategory>('all');
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>('all');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('');

  // Upload Form / Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFilePreview, setSelectedFilePreview] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState<ReceiptCategory>('sending');
  const [uploadAmount, setUploadAmount] = useState('');
  const [uploadDate, setUploadDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [uploadReferenceNote, setUploadReferenceNote] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Full-Screen Screenshot Inspector (Lightbox) State
  const [inspectedReceiptId, setInspectedReceiptId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [rotationDeg, setRotationDeg] = useState<number>(0);

  // Mandatory Delete Confirmation Modal State
  const [receiptPendingDelete, setReceiptPendingDelete] = useState<DriveReceiptRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // UI Status Banner / Feedback
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const showFeedback = (type: 'success' | 'error' | 'info', message: string) => {
    setFeedbackBanner({ type, message });
    setTimeout(() => {
      setFeedbackBanner(prev => (prev?.message === message ? null : prev));
    }, 5500);
  };

  // Register hardware back button handlers for modals
  useEffect(() => {
    if (!inspectedReceiptId) return;
    return registerBackHandler(() => {
      setInspectedReceiptId(null);
      return true;
    });
  }, [inspectedReceiptId, registerBackHandler]);

  useEffect(() => {
    if (!showUploadModal) return;
    return registerBackHandler(() => {
      if (!isUploading) setShowUploadModal(false);
      return true;
    });
  }, [showUploadModal, isUploading, registerBackHandler]);

  useEffect(() => {
    if (!receiptPendingDelete) return;
    return registerBackHandler(() => {
      if (!isDeleting) setReceiptPendingDelete(null);
      return true;
    });
  }, [receiptPendingDelete, isDeleting, registerBackHandler]);

  // Initialize Google Drive Auth listener & load initial cloud data
  useEffect(() => {
    let isMounted = true;

    const unsubscribe = initDriveVaultAuth(
      async (user, token) => {
        if (!isMounted) return;
        setAccessToken(token);
        setConnectedEmail((user.email || '').toLowerCase());
        const q = await fetchDriveStorageQuota(token);
        if (isMounted && q) {
          setQuotaInfo(q);
        }
      },
      () => {
        if (!isMounted) return;
        setAccessToken(null);
      }
    );

    // Check if an in-memory token is already active from this session
    getDriveAccessToken().then(async token => {
      if (!isMounted || !token) return;
      setAccessToken(token);
      setConnectedEmail(getConnectedDriveEmailInMemory());
      const q = await fetchDriveStorageQuota(token);
      if (isMounted && q) setQuotaInfo(q);
    });

    // Load local + cloud receipts & connected staff accounts
    handleRefreshFromCloud(true);

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [shopId]);

  const handleRefreshFromCloud = async (silent = false) => {
    if (!silent) setIsRefreshingCloud(true);
    try {
      const [cloudReceipts, cloudAccounts] = await Promise.all([
        syncShopReceiptsFromCloud(shopId),
        syncConnectedStaffDriveAccountsFromCloud(shopId)
      ]);
      setReceipts(cloudReceipts);
      setStaffAccounts(cloudAccounts);

      if (accessToken) {
        const q = await fetchDriveStorageQuota(accessToken);
        if (q) setQuotaInfo(q);
      }
      if (!silent) {
        showFeedback('success', 'گوگل ڈرائیو والٹ اور تمام اسٹاف کی تصاویر تازہ ترین ریکارڈ کے مطابق اپڈیٹ ہو گئیں۔');
      }
    } catch (err: any) {
      if (!silent) {
        showFeedback('error', err?.message || 'ریفریش کرنے میں مسئلہ پیش آیا۔');
      }
    } finally {
      if (!silent) setIsRefreshingCloud(false);
    }
  };

  /**
   * Opens Google Account Chooser so the current user (Admin or Staff) can pick their own Gmail
   */
  const handleSignInWithGoogle = async () => {
    setIsConnectingGoogle(true);
    setFeedbackBanner(null);
    try {
      const res = await signInWithGoogleForDriveVault();
      if (!res) return;

      setAccessToken(res.accessToken);
      setConnectedEmail(res.email);

      const quota = await fetchDriveStorageQuota(res.accessToken);
      if (quota) {
        setQuotaInfo(quota);
      }

      // Register this user's connected Gmail so Store Admin can see which Gmail each staff member connected
      const updatedAccounts = await registerConnectedStaffDriveAccount(shopId, {
        userKey: currentUsername,
        userName: currentDisplayName,
        userRole: currentUserRole,
        driveEmail: res.email,
        driveDisplayName: quota?.displayName || res.user.displayName || currentDisplayName,
        drivePhotoUrl: quota?.photoUrl || res.user.photoURL || undefined,
        limitBytes: quota?.limitBytes,
        usageBytes: quota?.usageBytes,
        lastConnectedAt: new Date().toISOString()
      });
      setStaffAccounts(updatedAccounts);

      showFeedback(
        'success',
        `✅ گوگل ڈرائیو (${res.email}) کامیابی سے کنیکٹ ہو گیا! اب آپ کی اپلوڈ کردہ تصاویر براہ راست اس 15GB Google Drive میں محفوظ ہوں گی۔`
      );
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('popup-closed-by-user')) {
        showFeedback('info', 'گوگل سائن ان ونڈو بند کر دی گئی۔ کنیکٹ کرنے کیلئے دوبارہ کلک کریں۔');
      } else {
        showFeedback('error', err?.message || 'گوگل ڈرائیو سے کنیکٹ کرنے میں مسئلہ پیش آیا۔');
      }
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const handleDisconnectDrive = async () => {
    await signOutFromDriveVault();
    setAccessToken(null);
    setConnectedEmail(null);
    setQuotaInfo(null);
    showFeedback('info', 'گوگل ڈرائیو سیشن ڈس کنیکٹ کر دیا گیا ہے۔ آپ کسی بھی وقت نیا Gmail منتخب کر سکتے ہیں۔');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showFeedback('error', 'براہ کرم صرف تصویر (Screenshot / Photo) منتخب کریں۔');
      return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedFilePreview(String(reader.result || ''));
    };
    reader.readAsDataURL(file);

    if (!uploadTitle.trim()) {
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
      setUploadTitle(baseName.slice(0, 45));
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      showFeedback('error', 'براہ کرم پہلے رسید یا سکرین شاٹ کی تصویر منتخب کریں۔');
      return;
    }

    let activeToken = accessToken || (await getDriveAccessToken());
    let activeDriveEmail = connectedEmail || getConnectedDriveEmailInMemory();

    // If token expired or user hasn't signed in yet, trigger Google Account Chooser automatically
    if (!activeToken) {
      try {
        setIsConnectingGoogle(true);
        const signRes = await signInWithGoogleForDriveVault();
        if (!signRes) return;
        activeToken = signRes.accessToken;
        activeDriveEmail = signRes.email;
        setAccessToken(activeToken);
        setConnectedEmail(activeDriveEmail);
      } catch (err: any) {
        showFeedback('error', 'تصویر اپلوڈ کرنے کیلئے پہلے اپنے Gmail سے سائن ان کرنا ضروری ہے۔');
        return;
      } finally {
        setIsConnectingGoogle(false);
      }
    }

    setIsUploading(true);
    try {
      const record = await uploadReceiptToGoogleDrive({
        shopId,
        shopName,
        file: selectedFile,
        title: uploadTitle.trim() || 'Payment Receipt Screenshot',
        category: uploadCategory,
        amount: Number(uploadAmount) || 0,
        transactionDate: uploadDate || new Date().toISOString().slice(0, 10),
        referenceNote: uploadReferenceNote.trim(),
        uploadedByUsername: currentUsername,
        uploadedByName: currentDisplayName,
        uploadedByRole: currentUserRole,
        uploaderDriveEmail: activeDriveEmail || 'connected-gmail',
        accessToken: activeToken
      });

      setReceipts(prev => [record, ...prev.filter(r => r.id !== record.id)]);

      // Refresh storage quota & update connected account info
      const quota = await fetchDriveStorageQuota(activeToken);
      if (quota) setQuotaInfo(quota);

      if (activeDriveEmail) {
        const updatedAccounts = await registerConnectedStaffDriveAccount(shopId, {
          userKey: currentUsername,
          userName: currentDisplayName,
          userRole: currentUserRole,
          driveEmail: activeDriveEmail,
          driveDisplayName: quota?.displayName || currentDisplayName,
          drivePhotoUrl: quota?.photoUrl,
          limitBytes: quota?.limitBytes,
          usageBytes: quota?.usageBytes,
          lastConnectedAt: new Date().toISOString()
        });
        setStaffAccounts(updatedAccounts);
      }

      // Reset form & close modal
      setSelectedFile(null);
      setSelectedFilePreview(null);
      setUploadTitle('');
      setUploadAmount('');
      setUploadReferenceNote('');
      setShowUploadModal(false);

      showFeedback(
        'success',
        `✅ سکرین شاٹ "${record.title}" کامیابی کے ساتھ آپ کے 15GB Google Drive (${record.uploaderDriveEmail}) میں محفوظ ہو گیا!`
      );
    } catch (err: any) {
      showFeedback('error', err?.message || 'گوگل ڈرائیو پر تصویر اپلوڈ کرنے میں مسئلہ پیش آیا۔');
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * Executes deletion ONLY after user confirms inside the Mandatory Delete Confirmation Modal
   */
  const handleConfirmDeleteReceipt = async () => {
    if (!receiptPendingDelete) return;
    setIsDeleting(true);
    try {
      const target = receiptPendingDelete;
      const res = await deleteReceiptFromDriveAndVault({
        shopId,
        receipt: target,
        accessToken
      });

      setReceipts(prev => prev.filter(r => r.id !== target.id));
      if (inspectedReceiptId === target.id) {
        setInspectedReceiptId(null);
      }
      setReceiptPendingDelete(null);

      showFeedback(
        'success',
        res.deletedFromDrive
          ? `🗑️ رسید "${target.title}" گوگل ڈرائیو اور سسٹم دونوں سے حذف کر دی گئی۔`
          : `🗑️ رسید "${target.title}" سسٹم والٹ لسٹ سے حذف کر دی گئی۔`
      );
    } catch (err: any) {
      showFeedback('error', err?.message || 'رسید حذف کرنے میں مسئلہ پیش آیا۔');
    } finally {
      setIsDeleting(false);
    }
  };

  // Compute unique staff/uploaders list for Admin Filter Bar
  const uploaderOptions = useMemo(() => {
    const map = new Map<
      string,
      { username: string; name: string; role: string; email: string; count: number }
    >();

    // Include connected staff accounts
    staffAccounts.forEach(acc => {
      const key = acc.userKey.toLowerCase();
      map.set(key, {
        username: acc.userKey,
        name: acc.userName || acc.userKey,
        role: acc.userRole || 'staff',
        email: acc.driveEmail,
        count: 0
      });
    });

    // Count receipts per uploader
    receipts.forEach(r => {
      const key = (r.uploadedByUsername || 'admin').toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        if (!existing.email && r.uploaderDriveEmail) {
          existing.email = r.uploaderDriveEmail;
        }
      } else {
        map.set(key, {
          username: r.uploadedByUsername || 'admin',
          name: r.uploadedByName || r.uploadedByUsername || 'Admin',
          role: r.uploadedByRole || 'staff',
          email: r.uploaderDriveEmail || '',
          count: 1
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [receipts, staffAccounts]);

  // Filtered receipts according to role, staff filter, category, date, and search query
  const filteredReceipts = useMemo(() => {
    return receipts.filter(r => {
      // Staff filter
      if (selectedStaffFilter === 'mine') {
        if ((r.uploadedByUsername || '').toLowerCase() !== currentUsername.toLowerCase()) {
          return false;
        }
      } else if (selectedStaffFilter !== 'all') {
        if ((r.uploadedByUsername || '').toLowerCase() !== selectedStaffFilter.toLowerCase()) {
          return false;
        }
      }

      // Category filter
      if (selectedCategory !== 'all' && r.category !== selectedCategory) {
        return false;
      }

      // Date filter
      if (selectedDateFilter && r.transactionDate !== selectedDateFilter) {
        return false;
      }

      // Search query (Title, TID/Reference, Staff Name, Gmail, Amount)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = (r.title || '').toLowerCase().includes(q);
        const matchRef = (r.referenceNote || '').toLowerCase().includes(q);
        const matchUser = (r.uploadedByName || '').toLowerCase().includes(q) ||
          (r.uploadedByUsername || '').toLowerCase().includes(q);
        const matchEmail = (r.uploaderDriveEmail || '').toLowerCase().includes(q);
        const matchAmount = String(r.amount || '').includes(q);
        if (!matchTitle && !matchRef && !matchUser && !matchEmail && !matchAmount) {
          return false;
        }
      }

      return true;
    });
  }, [
    receipts,
    selectedStaffFilter,
    selectedCategory,
    selectedDateFilter,
    searchQuery,
    currentUsername
  ]);

  // Currently inspected receipt in full-screen Lightbox
  const inspectedIndex = useMemo(
    () => filteredReceipts.findIndex(r => r.id === inspectedReceiptId),
    [filteredReceipts, inspectedReceiptId]
  );
  const inspectedReceipt = inspectedIndex >= 0 ? filteredReceipts[inspectedIndex] : null;

  const openInspector = (receipt: DriveReceiptRecord) => {
    setInspectedReceiptId(receipt.id);
    setZoomLevel(1);
    setRotationDeg(0);
  };

  const navigateInspector = (dir: -1 | 1) => {
    if (inspectedIndex < 0) return;
    const nextIdx = inspectedIndex + dir;
    if (nextIdx >= 0 && nextIdx < filteredReceipts.length) {
      setInspectedReceiptId(filteredReceipts[nextIdx].id);
      setZoomLevel(1);
      setRotationDeg(0);
    }
  };

  // Find current user's previously connected Gmail record (even if token needs refresh)
  const mySavedDriveAccount = useMemo(
    () =>
      staffAccounts.find(
        a => a.userKey.toLowerCase() === currentUsername.toLowerCase()
      ) || null,
    [staffAccounts, currentUsername]
  );

  // Summary Totals for Filtered Receipts
  const summaryStats = useMemo(() => {
    let totalAmount = 0;
    let sendingCount = 0;
    let receivingCount = 0;
    let billCount = 0;
    filteredReceipts.forEach(r => {
      totalAmount += Number(r.amount) || 0;
      if (r.category === 'sending') sendingCount += 1;
      else if (r.category === 'receiving') receivingCount += 1;
      else if (r.category === 'bill_payment') billCount += 1;
    });
    return {
      totalCount: filteredReceipts.length,
      totalAmount,
      sendingCount,
      receivingCount,
      billCount
    };
  }, [filteredReceipts]);

  if (!isVaultAllowed) {
    return (
      <div className="max-w-lg mx-auto my-8 bg-white rounded-3xl border border-rose-200 p-6 sm:p-8 text-center shadow-lg space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
          <Cloud className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-black text-slate-900">
          🔒 15GB Google Drive Receipt Vault Locked
        </h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          آپ کے موجودہ پیکج پر 15GB Google Drive Receipt &amp; Bill Screenshot Vault سپر ایڈمن کی جانب سے لاک ہے۔ ان لاک کروانے کیلئے اپنا پیکج اپگریڈ کریں۔
        </p>
        <button
          type="button"
          onClick={() => setActiveView('dashboard')}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer"
        >
          واپس ڈیش بورڈ پر جائیں
        </button>
      </div>
    );
  }

  const quotaPercent = quotaInfo && quotaInfo.limitBytes > 0
    ? Math.min(100, Math.max(1, Math.round((quotaInfo.usageBytes / quotaInfo.limitBytes) * 100)))
    : 0;

  // Responsive Grid CSS class based on user's chosen viewMode
  const gridContainerClass =
    viewMode === 'grid_1'
      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
      : viewMode === 'grid_3'
      ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3'
      : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3';

  return (
    <div className="space-y-4 pb-20">
      {/* Top Header & Back Button */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-5 text-white shadow-lg border border-indigo-500/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveView('dashboard')}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shrink-0">
              <Cloud className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-xl font-black tracking-tight text-white">
                  15GB Google Drive Receipt Vault
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-black uppercase">
                  15GB Free Cloud
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5">
                ہر یوزر/اسٹاف اپنی مرضی کی Gmail کنیکٹ کرے — سینڈنگ، رسیونگ اور بلز کے سکرین شاٹس محفوظ کریں اور ایڈمن تمام اسٹاف کی تصاویر چیک کرے۔
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              type="button"
              onClick={() => handleRefreshFromCloud(false)}
              disabled={isRefreshingCloud}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/15 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingCloud ? 'animate-spin' : ''}`} />
              <span>Sync Vault</span>
            </button>

            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black shadow-md shadow-emerald-600/30 transition-all cursor-pointer active:scale-95"
            >
              <Upload className="w-4 h-4" />
              <span>+ Upload Screenshot</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Notification Banner */}
      {feedbackBanner && (
        <div
          className={`rounded-2xl p-3.5 border flex items-start justify-between gap-3 animate-in fade-in ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : feedbackBanner.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-indigo-50 border-indigo-200 text-indigo-900'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs font-bold leading-relaxed">
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedbackBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Per-User Google Drive Account Connection & Live 15GB Storage Quota Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: Current Logged-In POS User & Their Connected Gmail */}
          <div className="flex items-start gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 font-black text-sm border ${
                accessToken
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              <HardDrive className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black text-slate-900">
                  POS User: {currentDisplayName} ({currentUsername})
                </span>
                <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold uppercase">
                  {currentUserRole}
                </span>
                {accessToken && connectedEmail ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Drive Live Connected
                  </span>
                ) : mySavedDriveAccount ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                    Saved Gmail: {mySavedDriveAccount.driveEmail} (Click Sign in to Upload)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                    No Gmail Connected Yet
                  </span>
                )}
              </div>

              {accessToken && connectedEmail ? (
                <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    Connected Gmail:{' '}
                    <strong className="text-emerald-700 font-black">{connectedEmail}</strong>
                  </span>
                  {quotaInfo && (
                    <span className="text-[11px] text-slate-500">
                      Used: <strong>{formatBytesToGB(quotaInfo.usageBytes)}</strong> /{' '}
                      <strong>{formatBytesToGB(quotaInfo.limitBytes)}</strong> ({quotaPercent}%)
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  اپنے ذاتی 15GB Google Drive میں بلز اور پیمنٹ کے سکرین شاٹس محفوظ کرنے کیلئے نیچے{' '}
                  <strong>Sign in with Google</strong> پر کلک کر کے اپنی مرضی کی Gmail منتخب کریں۔
                </p>
              )}

              {/* 15GB Progress Bar when connected */}
              {accessToken && quotaInfo && (
                <div className="w-full max-w-md pt-1">
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <div
                      className={`h-full transition-all duration-500 ${
                        quotaPercent > 85
                          ? 'bg-rose-500'
                          : quotaPercent > 65
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${quotaPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Official "Sign in with Google" Button or Switch/Disconnect Controls */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Official Google Branding Button */}
            <button
              type="button"
              onClick={handleSignInWithGoogle}
              disabled={isConnectingGoogle}
              className="inline-flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 shadow-sm font-bold text-xs transition-all cursor-pointer active:scale-95 disabled:opacity-60"
            >
              {/* Standard Google Multi-Color G SVG */}
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
              <span>
                {isConnectingGoogle
                  ? 'Opening Google...'
                  : accessToken
                  ? 'Switch Gmail Account'
                  : 'Sign in with Google'}
              </span>
            </button>

            {accessToken && (
              <button
                type="button"
                onClick={handleDisconnectDrive}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-colors cursor-pointer"
                title="Disconnect Current Google Drive Session"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Store Admin Team Overview: Connected Staff Gmails & Quick Staff Filter */}
      {isStoreAdmin && (
        <div className="bg-white rounded-2xl border border-indigo-200/80 p-4 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xs sm:text-sm font-black text-slate-900">
                  Store Admin Staff Inspection — اسٹاف کی کنیکٹڈ Gmail اور تصاویر چیک کریں
                </h2>
                <p className="text-[11px] text-slate-500">
                  جس اسٹاف ممبر پر کلک کریں گے اس کی اپلوڈ کردہ تمام سینڈنگ/رسیونگ اور بلز کی تصاویر فلٹر ہو جائیں گی۔
                </p>
              </div>
            </div>
            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 self-start sm:self-center">
              Total Receipts: {receipts.length}
            </span>
          </div>

          {/* Clickable Staff Filter Pills showing each Staff Member & their connected Gmail */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedStaffFilter('all')}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                selectedStaffFilter === 'all'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>All Team ({receipts.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedStaffFilter('mine')}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                selectedStaffFilter === 'mine'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>My Uploads</span>
            </button>

            {uploaderOptions.map(u => {
              const isSelected = selectedStaffFilter.toLowerCase() === u.username.toLowerCase();
              return (
                <button
                  key={u.username}
                  type="button"
                  onClick={() =>
                    setSelectedStaffFilter(isSelected ? 'all' : u.username)
                  }
                  className={`px-3 py-1.5 rounded-xl text-left border transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black">{u.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-indigo-100 text-indigo-700'
                      }`}
                    >
                      {u.count} SS
                    </span>
                  </div>
                  <div
                    className={`text-[10px] truncate max-w-[175px] ${
                      isSelected ? 'text-indigo-100' : 'text-slate-500'
                    }`}
                  >
                    {u.email ? `📧 ${u.email}` : `ID: ${u.username}`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Search, Category Filter & Mobile-Responsive View Switcher Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="پارٹی کا نام، رقم، TID، اسٹاف کا نام یا Gmail تلاش کریں..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="date"
                value={selectedDateFilter}
                onChange={e => setSelectedDateFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
              />
            </div>
            {selectedDateFilter && (
              <button
                type="button"
                onClick={() => setSelectedDateFilter('')}
                className="px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer"
              >
                Clear Date
              </button>
            )}
          </div>

          {/* Mobile-First Adjustable View Mode Switcher (List View + Grid 1x, 2x, 3x) */}
          <div className="flex items-center justify-between sm:justify-end gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <span className="text-[10px] font-black text-slate-500 px-2 hidden xl:inline">
              SCREEN VIEW:
            </span>

            {/* Grid 1x: Full-width large card on mobile */}
            <button
              type="button"
              onClick={() => handleChangeViewMode('grid_1')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                viewMode === 'grid_1'
                  ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="1 Large Card per row on mobile (Best for reading TID & text)"
            >
              <Square className="w-3.5 h-3.5" />
              <span>1x Large</span>
            </button>

            {/* Grid 2x: 2 columns on mobile (Default) */}
            <button
              type="button"
              onClick={() => handleChangeViewMode('grid_2')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                viewMode === 'grid_2'
                  ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="2 Cards per row on mobile (Standard Grid)"
            >
              <Columns2 className="w-3.5 h-3.5" />
              <span>2x Grid</span>
            </button>

            {/* Grid 3x: 3 compact thumbnails per row on mobile */}
            <button
              type="button"
              onClick={() => handleChangeViewMode('grid_3')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                viewMode === 'grid_3'
                  ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="3 Compact Cards per row on mobile"
            >
              <Grid3X3 className="w-3.5 h-3.5" />
              <span>3x Mini</span>
            </button>

            {/* List View: Detailed horizontal row list */}
            <button
              type="button"
              onClick={() => handleChangeViewMode('list')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Detailed List View"
            >
              <ListIcon className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
          </div>
        </div>

        {/* Category Filter Pills & Summary Stats */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all shrink-0 cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              All Categories ({receipts.length})
            </button>

            {(Object.keys(CATEGORY_META) as ReceiptCategory[]).map(catKey => {
              const meta = CATEGORY_META[catKey];
              const isSelected = selectedCategory === catKey;
              return (
                <button
                  key={catKey}
                  type="button"
                  onClick={() => setSelectedCategory(isSelected ? 'all' : catKey)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isSelected ? 'bg-white' : meta.dotClass
                    }`}
                  />
                  <span>{meta.urduLabel}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 text-[11px] font-bold text-slate-600">
            <span>
              Showing: <strong className="text-slate-900">{summaryStats.totalCount}</strong> SS
            </span>
            <span>
              Total Amount:{' '}
              <strong className="text-emerald-700">
                Rs. {summaryStats.totalAmount.toLocaleString()}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredReceipts.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-8 sm:p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
            <FileImage className="w-8 h-8" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-base font-black text-slate-900">
              کوئی سکرین شاٹ یا رسید موجود نہیں ہے
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              اپنے 15GB Google Drive میں سینڈنگ، رسیونگ یا بل ادائیگی کا پہلا سکرین شاٹ محفوظ کرنے کیلئے{' '}
              <strong>+ Upload Screenshot</strong> بٹن پر کلک کریں۔
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>+ Upload First Screenshot</span>
            </button>
            {!accessToken && (
              <button
                type="button"
                onClick={handleSignInWithGoogle}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-bold cursor-pointer"
              >
                <span>Sign in with Google</span>
              </button>
            )}
          </div>
        </div>
      ) : viewMode === 'list' ? (
        /* ==================== LIST VIEW (فہرست ویو) ==================== */
        <div className="space-y-2.5">
          {filteredReceipts.map(receipt => {
            const catMeta = CATEGORY_META[receipt.category] || CATEGORY_META.other;
            const imgSrc = receipt.previewDataUrl || receipt.thumbnailLink || receipt.webContentLink;
            return (
              <div
                key={receipt.id}
                className="bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 p-3 sm:p-3.5 shadow-sm transition-all flex items-center justify-between gap-3"
              >
                {/* Left: Thumbnail + Receipt Details */}
                <div
                  onClick={() => openInspector(receipt)}
                  className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer group"
                >
                  <div className="w-16 h-20 sm:w-20 sm:h-24 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 relative">
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={receipt.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <FileImage className="w-6 h-6" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <Eye className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md border font-bold ${catMeta.badgeClass}`}
                      >
                        {catMeta.urduLabel}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {receipt.transactionDate}
                      </span>
                    </div>

                    <h3 className="text-xs sm:text-sm font-black text-slate-900 truncate">
                      {receipt.title}
                    </h3>

                    {receipt.referenceNote && (
                      <p className="text-[11px] text-slate-600 truncate">
                        TID / Note: <strong className="font-bold">{receipt.referenceNote}</strong>
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                      <span>
                        Staff:{' '}
                        <strong className="text-slate-800">
                          {receipt.uploadedByName} ({receipt.uploadedByUsername})
                        </strong>
                      </span>
                      {receipt.uploaderDriveEmail && (
                        <span className="text-indigo-600 font-semibold truncate">
                          📧 {receipt.uploaderDriveEmail}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Amount + Action Buttons */}
                <div className="flex flex-col items-end justify-between gap-2 shrink-0">
                  <div className="text-right">
                    <span className="text-xs sm:text-sm font-black text-emerald-700 block">
                      Rs. {(Number(receipt.amount) || 0).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {formatBytesToKB(receipt.sizeBytes)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openInspector(receipt)}
                      className="p-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors cursor-pointer"
                      title="Inspect Full Screenshot"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>

                    {receipt.webViewLink && (
                      <a
                        href={receipt.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors"
                        title="Open in Google Drive"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => setReceiptPendingDelete(receipt)}
                      className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors cursor-pointer"
                      title="Delete Screenshot"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ==================== ADJUSTABLE GRID VIEWS (1x Large, 2x Standard, 3x Compact) ==================== */
        <div className={gridContainerClass}>
          {filteredReceipts.map(receipt => {
            const catMeta = CATEGORY_META[receipt.category] || CATEGORY_META.other;
            const imgSrc = receipt.previewDataUrl || receipt.thumbnailLink || receipt.webContentLink;
            const isCompact3x = viewMode === 'grid_3';
            const isLarge1x = viewMode === 'grid_1';

            return (
              <div
                key={receipt.id}
                className="bg-white rounded-2xl border border-slate-200 hover:border-indigo-400 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col group"
              >
                {/* Screenshot Image Preview Container */}
                <div
                  onClick={() => openInspector(receipt)}
                  className={`relative bg-slate-100 overflow-hidden cursor-pointer ${
                    isLarge1x
                      ? 'h-80 sm:h-72'
                      : isCompact3x
                      ? 'h-32 sm:h-40'
                      : 'h-48 sm:h-56'
                  }`}
                >
                  {imgSrc ? (
                    <img
                      src={imgSrc}
                      alt={receipt.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <FileImage className="w-8 h-8" />
                    </div>
                  )}

                  {/* Top Overlay Badge: Category */}
                  <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1 pointer-events-none">
                    <span
                      className={`text-[9px] sm:text-[10px] px-2 py-0.5 rounded-md border font-black shadow-sm backdrop-blur-md bg-white/90 text-slate-800`}
                    >
                      {isCompact3x ? receipt.category.toUpperCase() : catMeta.urduLabel}
                    </span>
                    {!isCompact3x && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-900/80 text-white font-bold backdrop-blur-sm">
                        {receipt.transactionDate}
                      </span>
                    )}
                  </div>

                  {/* Bottom Gradient with Amount */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/40 to-transparent p-2 sm:p-2.5 flex items-end justify-between">
                    <span className="text-white font-black text-xs sm:text-sm drop-shadow">
                      Rs. {(Number(receipt.amount) || 0).toLocaleString()}
                    </span>
                    <span className="p-1.5 rounded-lg bg-white/20 text-white backdrop-blur-sm">
                      <ZoomIn className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>

                {/* Card Details Footer */}
                <div className={`${isCompact3x ? 'p-2' : 'p-3'} flex-1 flex flex-col justify-between gap-2`}>
                  <div className="space-y-1">
                    <h3
                      onClick={() => openInspector(receipt)}
                      className={`font-black text-slate-900 truncate cursor-pointer hover:text-indigo-600 ${
                        isCompact3x ? 'text-[11px]' : 'text-xs sm:text-sm'
                      }`}
                    >
                      {receipt.title}
                    </h3>

                    {!isCompact3x && receipt.referenceNote && (
                      <p className="text-[11px] text-slate-600 truncate">
                        TID: <strong>{receipt.referenceNote}</strong>
                      </p>
                    )}

                    <div className="text-[10px] text-slate-500 space-y-0.5">
                      <div className="truncate font-bold text-slate-700">
                        👤 {receipt.uploadedByName}
                      </div>
                      {!isCompact3x && receipt.uploaderDriveEmail && (
                        <div className="truncate text-indigo-600 font-semibold">
                          📧 {receipt.uploaderDriveEmail}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Quick Actions */}
                  <div className="flex items-center justify-between gap-1 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => openInspector(receipt)}
                      className="flex-1 py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-[10px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Check SS</span>
                    </button>

                    {receipt.webViewLink && !isCompact3x && (
                      <a
                        href={receipt.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors"
                        title="Open in Google Drive"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => setReceiptPendingDelete(receipt)}
                      className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors cursor-pointer"
                      title="Delete Screenshot"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ==================== UPLOAD SCREENSHOT MODAL ==================== */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-auto animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900">
                    Upload Receipt / Bill Screenshot
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {connectedEmail
                      ? `Saving directly to: ${connectedEmail}`
                      : 'Select screenshot & connect your 15GB Google Drive'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isUploading && setShowUploadModal(false)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-3.5">
              {/* Image Picker / Camera Capture Box */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {selectedFilePreview ? (
                  <div className="relative rounded-2xl border border-slate-200 bg-slate-900 overflow-hidden h-52 flex items-center justify-center">
                    <img
                      src={selectedFilePreview}
                      alt="Preview"
                      className="max-h-full max-w-full object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute bottom-2.5 right-2.5 px-3 py-1.5 rounded-xl bg-white/90 hover:bg-white text-slate-900 text-xs font-bold shadow-md cursor-pointer"
                    >
                      Change Image
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-7 px-4 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50 text-center space-y-2 transition-colors cursor-pointer"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto shadow-md">
                      <Camera className="w-6 h-6" />
                    </div>
                    <div className="text-xs font-black text-slate-900">
                      سکرین شاٹ یا بل کی تصویر منتخب کریں (Gallery / Camera)
                    </div>
                    <div className="text-[11px] text-slate-500">
                      EasyPaisa, JazzCash, Bank Transfer, या Wholesaler Bill Screenshot
                    </div>
                  </button>
                )}
              </div>

              {/* Category Selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  کیٹیگری (Receipt Type)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(Object.keys(CATEGORY_META) as ReceiptCategory[]).map(catKey => {
                    const meta = CATEGORY_META[catKey];
                    const active = uploadCategory === catKey;
                    return (
                      <button
                        key={catKey}
                        type="button"
                        onClick={() => setUploadCategory(catKey)}
                        className={`px-2.5 py-2 rounded-xl text-[11px] font-bold border text-left transition-all cursor-pointer flex items-center gap-1.5 ${
                          active
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            active ? 'bg-white' : meta.dotClass
                          }`}
                        />
                        <span className="truncate">{meta.urduLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title / Party Name & Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    پارٹی کا نام / تفصیل (Title / Party Name) *
                  </label>
                  <input
                    type="text"
                    required
                    value={uploadTitle}
                    onChange={e => setUploadTitle(e.target.value)}
                    placeholder="مثلاً: علی ہول سیلر / JazzCash Sending"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    رقم (Amount Rs.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={uploadAmount}
                    onChange={e => setUploadAmount(e.target.value)}
                    placeholder="مثلاً: 15000"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Transaction Date & TID / Reference Note */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    تاریخ (Date)
                  </label>
                  <input
                    type="date"
                    value={uploadDate}
                    onChange={e => setUploadDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    ٹرانزیکشن آئی ڈی / نوٹ (TID / Reference)
                  </label>
                  <input
                    type="text"
                    value={uploadReferenceNote}
                    onChange={e => setUploadReferenceNote(e.target.value)}
                    placeholder="TID # یا بل نمبر (اختیاری)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Submit & Cancel */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !selectedFile}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Uploading to Google Drive...</span>
                    </>
                  ) : (
                    <>
                      <Cloud className="w-4 h-4" />
                      <span>Save to 15GB Google Drive</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== FULL-SCREEN SCREENSHOT INSPECTOR (LIGHTBOX) ==================== */}
      {inspectedReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-5 text-white animate-in fade-in">
          {/* Top Bar: Receipt Info & Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-white/10 rounded-2xl p-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-white truncate">
                  {inspectedReceipt.title}
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-black">
                  Rs. {(Number(inspectedReceipt.amount) || 0).toLocaleString()}
                </span>
                <span className="text-[11px] text-slate-300">
                  {inspectedReceipt.transactionDate}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-300 mt-0.5">
                <span>
                  Uploaded by:{' '}
                  <strong className="text-white">
                    {inspectedReceipt.uploadedByName} ({inspectedReceipt.uploadedByUsername})
                  </strong>
                </span>
                {inspectedReceipt.uploaderDriveEmail && (
                  <span className="text-emerald-300">
                    📧 {inspectedReceipt.uploaderDriveEmail}
                  </span>
                )}
                {inspectedReceipt.referenceNote && (
                  <span className="text-amber-300">
                    TID/Ref: <strong>{inspectedReceipt.referenceNote}</strong>
                  </span>
                )}
              </div>
            </div>

            {/* Zoom, Rotate, Open in Drive & Close Controls */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setZoomLevel(z => Math.max(1, Number((z - 0.5).toFixed(1))))}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(z => (z >= 3 ? 1 : Number((z + 0.5).toFixed(1))))}
                className="px-2.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-black cursor-pointer"
                title="Cycle Zoom (1x, 1.5x, 2x, 2.5x, 3x)"
              >
                {zoomLevel}x
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(z => Math.min(3, Number((z + 0.5).toFixed(1))))}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setRotationDeg(r => (r + 90) % 360)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer"
                title="Rotate 90°"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {inspectedReceipt.webViewLink && (
                <a
                  href={inspectedReceipt.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Open in Drive</span>
                </a>
              )}

              {inspectedReceipt.previewDataUrl && (
                <a
                  href={inspectedReceipt.previewDataUrl}
                  download={inspectedReceipt.fileName || 'receipt.jpg'}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                  title="Download Screenshot"
                >
                  <Download className="w-4 h-4" />
                </a>
              )}

              <button
                type="button"
                onClick={() => setReceiptPendingDelete(inspectedReceipt)}
                className="p-2 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white cursor-pointer"
                title="Delete Screenshot"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setInspectedReceiptId(null)}
                className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white cursor-pointer ml-1"
                title="Close Inspector"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Center Interactive Screenshot Canvas */}
          <div className="relative flex-1 flex items-center justify-center overflow-auto my-2 select-none">
            {inspectedIndex > 0 && (
              <button
                type="button"
                onClick={() => navigateInspector(-1)}
                className="fixed left-3 sm:left-6 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-white/15 shadow-xl cursor-pointer"
                title="Previous Screenshot"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            <div className="max-w-full max-h-full flex items-center justify-center p-4">
              <img
                src={
                  inspectedReceipt.previewDataUrl ||
                  inspectedReceipt.thumbnailLink ||
                  inspectedReceipt.webContentLink
                }
                alt={inspectedReceipt.title}
                style={{
                  transform: `scale(${zoomLevel}) rotate(${rotationDeg}deg)`,
                  transition: 'transform 0.2s ease-out'
                }}
                className="max-h-[75vh] max-w-full object-contain rounded-xl shadow-2xl"
              />
            </div>

            {inspectedIndex < filteredReceipts.length - 1 && (
              <button
                type="button"
                onClick={() => navigateInspector(1)}
                className="fixed right-3 sm:right-6 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-white/15 shadow-xl cursor-pointer"
                title="Next Screenshot"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Bottom Bar: Counter & Quick Zoom Buttons */}
          <div className="flex items-center justify-between bg-slate-900/90 border border-white/10 rounded-2xl px-4 py-2.5 text-xs">
            <span className="font-bold text-slate-300">
              Screenshot {inspectedIndex + 1} of {filteredReceipts.length}
            </span>
            <div className="flex items-center gap-1.5">
              {[1, 1.5, 2, 3].map(z => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setZoomLevel(z)}
                  className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                    zoomLevel === z
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white/10 text-slate-300 hover:bg-white/20'
                  }`}
                >
                  {z}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== MANDATORY DELETE CONFIRMATION MODAL ==================== */}
      {receiptPendingDelete && (
        <div className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-200 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Confirm Receipt Deletion
                </h3>
                <p className="text-xs text-slate-500">
                  کیا آپ واقعی اس سکرین شاٹ کو گوگل ڈرائیو والٹ سے حذف کرنا چاہتے ہیں؟
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-1 text-xs">
              <div>
                <span className="text-slate-500">Title / Party:</span>{' '}
                <strong className="text-slate-900">{receiptPendingDelete.title}</strong>
              </div>
              <div>
                <span className="text-slate-500">Amount:</span>{' '}
                <strong className="text-emerald-700">
                  Rs. {(Number(receiptPendingDelete.amount) || 0).toLocaleString()}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Date:</span>{' '}
                <strong className="text-slate-800">{receiptPendingDelete.transactionDate}</strong>
              </div>
              <div>
                <span className="text-slate-500">Uploaded By:</span>{' '}
                <strong className="text-slate-800">
                  {receiptPendingDelete.uploadedByName} ({receiptPendingDelete.uploaderDriveEmail})
                </strong>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setReceiptPendingDelete(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteReceipt}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-md cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
