/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ShieldCheck,
  Building2,
  Activity,
  KeyRound,
  Download,
  Search,
  RefreshCw,
  Power,
  Wrench,
  CheckCircle2,
  ArrowLeft,
  Eye,
  X,
  Radio,
  Clock,
  Sliders,
  Cpu,
  Lock,
  Unlock,
  Play,
  Check,
  AlertTriangle,
  Copy,
  MessageCircle
} from 'lucide-react';
import { auth, googleProvider, signInWithPopup } from '../firebase';
import { usePOS } from '../context/POSContext';
import {
  superAdminService,
  MASTER_EMAIL,
  MASTER_SUPER_ADMIN_EMAILS,
  ALL_CONTROLLABLE_MODULES,
  ALL_STAFF_CONTROLLABLE_MODULES,
  ALL_STAFF_CONTROLLABLE_ACTIONS
} from './superAdminService';
import {
  TenantShopInfo,
  AuditLogEntry,
  PlatformMetrics,
  ControllableModuleId,
  PlatformModuleControlConfig,
  ModuleHealthTestResult,
  ShopStaffPermissionsConfig,
  StaffPermissionActionId
} from './types';
import {
  buildShopUsageReportRow,
  combineShopUsageReports,
  NETLIFY_FREE_LIMITS,
  FIREBASE_FREE_LIMITS,
  ShopUsageReportRow,
  PlatformHostingMode,
  getPlatformHostingMode,
  setPlatformHostingMode,
  getQuotaResetCountdown
} from '../utils/usageTracker';

export const SuperAdminView: React.FC = () => {
  const {
    currentUser,
    currentShop,
    setActiveView,
    isMaintenanceMode,
    toggleMaintenanceMode,
    maintenanceNotice,
    setMaintenanceNotice,
    firebaseSyncStatus,
    triggerMutationLoader
  } = usePOS();

  // 6-Tab Master Command Center (including Quota & Usage 99% Tracker)
  const [activeTab, setActiveTab] = useState<'shops' | 'quota' | 'modules' | 'diagnostics' | 'analytics' | 'security'>('shops');
  const [usagePeriod, setUsagePeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');
  const [selectedUsageShopId, setSelectedUsageShopId] = useState<string>('ALL_SHOPS');
  const [historyViewMode, setHistoryViewMode] = useState<'daily' | 'monthly'>('daily');
  const [hostingMode, setHostingModeState] = useState<PlatformHostingMode>(() => getPlatformHostingMode());
  const [netlifyChartMetric, setNetlifyChartMetric] = useState<'status' | 'bandwidth' | 'duration'>('status');
  const [calibrateModalShop, setCalibrateModalShop] = useState<ShopUsageReportRow | null>(null);
  const [calWebReq, setCalWebReq] = useState<string>('');
  const [calFnReq, setCalFnReq] = useState<string>('');
  const [calBwMb, setCalBwMb] = useState<string>('');
  const [calFbReads, setCalFbReads] = useState<string>('');
  const [calFbWrites, setCalFbWrites] = useState<string>('');
  const [isSavingCalibration, setIsSavingCalibration] = useState<boolean>(false);

  // Data States
  const [shops, setShops] = useState<TenantShopInfo[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');

  // Module & Function Control State
  const [moduleConfig, setModuleConfig] = useState<PlatformModuleControlConfig>(() =>
    superAdminService.getModuleControlConfig()
  );
  const [selectedShopForModules, setSelectedShopForModules] = useState<string>('GLOBAL');
  const [moduleSaveBanner, setModuleSaveBanner] = useState<string | null>(null);
  const [moduleSaveStatus, setModuleSaveStatus] = useState<'synced' | 'error'>('synced');
  const [hasUnsyncedCloudChanges, setHasUnsyncedCloudChanges] = useState<boolean>(false);
  const pendingCloudConfigRef = useRef<PlatformModuleControlConfig | null>(null);

  // Firebase Master Google Auth Verification State (required by Firestore security rules for /platform_settings writes)
  const [firebaseAuthEmail, setFirebaseAuthEmail] = useState<string | null>(
    () => auth.currentUser?.email?.toLowerCase() || null
  );
  const [isVerifyingCloudAuth, setIsVerifyingCloudAuth] = useState<boolean>(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => {
      setFirebaseAuthEmail(u?.email ? u.email.toLowerCase() : null);
    });
    return () => unsub();
  }, []);

  const isFirebaseMasterVerified = Boolean(
    firebaseAuthEmail && superAdminService.isMasterAdminEmail(firebaseAuthEmail)
  );

  const handleVerifyMasterGoogleCloudAuth = async () => {
    setIsVerifyingCloudAuth(true);
    try {
      const res = await signInWithPopup(auth, googleProvider);
      const signedEmail = res.user?.email?.toLowerCase() || null;
      setFirebaseAuthEmail(signedEmail);
      if (signedEmail && superAdminService.isMasterAdminEmail(signedEmail)) {
        // If Super Admin already toggled Lock/Unlock before verifying, flush those exact changes straight to Firestore first!
        const pendingCfg = pendingCloudConfigRef.current;
        if (pendingCfg) {
          const flushed = await superAdminService.saveModuleControlConfig({
            ...pendingCfg,
            updatedBy: signedEmail
          });
          if (flushed) {
            pendingCloudConfigRef.current = null;
            setHasUnsyncedCloudChanges(false);
            setModuleConfig(pendingCfg);
            setModuleSaveStatus('synced');
            setModuleSaveBanner(`✓ Master Cloud Auth verified (${signedEmail}) aur aap ke tamam Lock/Unlock changes live Cloud par sync ho gaye!`);
            setTimeout(() => setModuleSaveBanner(null), 5000);
            loadData();
            return;
          }
        }
        setHasUnsyncedCloudChanges(false);
        setModuleSaveStatus('synced');
        setModuleSaveBanner(`✓ Master Cloud Auth verified (${signedEmail})! Ab tamam Lock/Unlock changes real-time Firestore par sync honge.`);
        setTimeout(() => setModuleSaveBanner(null), 4000);
        loadData();
      } else {
        setModuleSaveStatus('error');
        setModuleSaveBanner(`⚠️ Please sign in with a Master Super Admin Gmail (${MASTER_SUPER_ADMIN_EMAILS.join(' or ')}).`);
        setTimeout(() => setModuleSaveBanner(null), 5000);
      }
    } catch (err) {
      console.error('Master Google Cloud Auth error:', err);
      setModuleSaveStatus('error');
      setModuleSaveBanner('⚠️ Google popup band ho gaya ya block hua. Dobara koshish karein.');
      setTimeout(() => setModuleSaveBanner(null), 4000);
    } finally {
      setIsVerifyingCloudAuth(false);
    }
  };

  // Store Staff / Manager Permissions Control State (Super Admin can also Lock/Unlock User & Manager roles per shop)
  const targetShopIdForStaffPerms =
    selectedShopForModules !== 'GLOBAL'
      ? selectedShopForModules
      : currentShop?.id || shops[0]?.id || 'default_shop';
  const [selectedStaffRoleTarget, setSelectedStaffRoleTarget] = useState<'manager' | 'cashier' | 'salesman'>('manager');
  const [shopStaffPermConfig, setShopStaffPermConfig] = useState<ShopStaffPermissionsConfig>(() =>
    superAdminService.getShopStaffPermissions(targetShopIdForStaffPerms)
  );

  useEffect(() => {
    setShopStaffPermConfig(superAdminService.getShopStaffPermissions(targetShopIdForStaffPerms));
    superAdminService.syncShopStaffPermissionsFromCloud(targetShopIdForStaffPerms).then(cloudCfg => {
      if (cloudCfg) setShopStaffPermConfig(cloudCfg);
    });
  }, [targetShopIdForStaffPerms]);

  // Diagnostics State
  const [diagResults, setDiagResults] = useState<ModuleHealthTestResult[]>([]);
  const [isRunningDiag, setIsRunningDiag] = useState<boolean>(false);

  // Change Secret Key Form
  const [newSecretKey, setNewSecretKey] = useState<string>('');
  const [secretUpdateMsg, setSecretUpdateMsg] = useState<string | null>(null);

  // Store Inspection & Password Reset Modals
  const [inspectShop, setInspectShop] = useState<TenantShopInfo | null>(null);
  const [resetPassShop, setResetPassShop] = useState<TenantShopInfo | null>(null);
  const [newOwnerPassword, setNewOwnerPassword] = useState<string>('');
  const [lastSavedPassword, setLastSavedPassword] = useState<string>('');
  const [copiedResetCreds, setCopiedResetCreds] = useState<boolean>(false);
  const [resetPassFeedback, setResetPassFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isResettingPass, setIsResettingPass] = useState<boolean>(false);

  // Load Data on Mount
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [fetchedShops, syncedConfig] = await Promise.all([
        superAdminService.fetchAllShops(),
        superAdminService.syncModuleControlFromCloud()
      ]);
      setShops(fetchedShops);
      setModuleConfig(syncedConfig);

      const logs = await superAdminService.fetchLiveAuditLogs(fetchedShops);
      setAuditLogs(logs);

      const computed = superAdminService.computePlatformMetrics(fetchedShops, logs);
      setMetrics(computed);
    } catch (err) {
      console.error('Error loading Super Admin data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunDiagnostics = async () => {
    setIsRunningDiag(true);
    try {
      const results = await superAdminService.runComprehensiveDiagnostics();
      setDiagResults(results);
    } catch (err) {
      console.error('Diagnostics error:', err);
    } finally {
      setIsRunningDiag(false);
    }
  };

  const isAuthorizedSuperAdmin = Boolean(
    currentUser &&
    currentUser.role === 'super_admin' &&
    superAdminService.isMasterAdminEmail(currentUser.email)
  );

  useEffect(() => {
    if (!isAuthorizedSuperAdmin) {
      setActiveView('dashboard');
      return;
    }
    loadData();
    handleRunDiagnostics();
  }, [isAuthorizedSuperAdmin]);

  if (!isAuthorizedSuperAdmin) {
    return null;
  }

  // Filtered Shops
  const filteredShops = useMemo(() => {
    if (!searchTerm.trim()) return shops;
    const term = searchTerm.toLowerCase();
    return shops.filter(
      s =>
        s.shop_name.toLowerCase().includes(term) ||
        s.owner_name.toLowerCase().includes(term) ||
        s.owner_email.toLowerCase().includes(term) ||
        s.id.toLowerCase().includes(term)
    );
  }, [shops, searchTerm]);

  // Filtered Audit Logs
  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      const matchesSeverity = selectedSeverity === 'all' || log.severity === selectedSeverity;
      const matchesSearch =
        !searchTerm.trim() ||
        log.shop_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user_name.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSeverity && matchesSearch;
    });
  }, [auditLogs, selectedSeverity, searchTerm]);

  // Compute Per-Shop & Combined Usage Reports (Daily, Weekly, Monthly, Yearly)
  const shopUsageRows = useMemo<ShopUsageReportRow[]>(() => {
    return shops.map(s => buildShopUsageReportRow(s, s.usage_telemetry));
  }, [shops, isLoading, activeTab]);

  const combinedUsageReport = useMemo<ShopUsageReportRow>(() => {
    return combineShopUsageReports(shopUsageRows);
  }, [shopUsageRows]);

  const activeUsageReport = useMemo<ShopUsageReportRow>(() => {
    if (selectedUsageShopId === 'ALL_SHOPS') return combinedUsageReport;
    return shopUsageRows.find(r => r.shopId === selectedUsageShopId) || combinedUsageReport;
  }, [selectedUsageShopId, shopUsageRows, combinedUsageReport]);

  const handleSaveCalibration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calibrateModalShop) return;
    setIsSavingCalibration(true);
    try {
      await superAdminService.calibrateShopUsage(calibrateModalShop.shopId, {
        netlifyWebRequests: calWebReq !== '' ? Number(calWebReq) : undefined,
        netlifyFunctionCalls: calFnReq !== '' ? Number(calFnReq) : undefined,
        netlifyBandwidthMB: calBwMb !== '' ? Number(calBwMb) : undefined,
        firebaseReads: calFbReads !== '' ? Number(calFbReads) : undefined,
        firebaseWrites: calFbWrites !== '' ? Number(calFbWrites) : undefined
      });
      await loadData();
      setCalibrateModalShop(null);
      setModuleSaveBanner(`✓ Usage counters calibrated & synced for ${calibrateModalShop.shopName}!`);
      setTimeout(() => setModuleSaveBanner(null), 3500);
    } finally {
      setIsSavingCalibration(false);
    }
  };

  const showCloudSaveResult = (ok: boolean, successMsg: string, requireMasterAuthHint = true) => {
    if (ok) {
      setModuleSaveStatus('synced');
      setModuleSaveBanner(successMsg);
    } else {
      setModuleSaveStatus('error');
      setModuleSaveBanner(
        requireMasterAuthHint && !isFirebaseMasterVerified
          ? '⚠️ Cloud Sync Failed: Master Google Auth verify karein (upar "Verify Cloud Auth" button dabayein) taake dusre devices par foran sync ho!'
          : '⚠️ Cloud Firestore sync failed! Internet aur Master Google login check karein.'
      );
    }
    setTimeout(() => setModuleSaveBanner(null), 4000);
  };

  // Toggle Store Status (Unlocked / Locked)
  const handleToggleStatus = async (shop: TenantShopInfo) => {
    const nextStatus = !shop.is_active;
    const success = await superAdminService.setShopStatus(shop.id, nextStatus);
    if (success) {
      setShops(prev => prev.map(s => (s.id === shop.id ? { ...s, is_active: nextStatus } : s)));
      setModuleConfig(superAdminService.getModuleControlConfig());
      showCloudSaveResult(
        true,
        nextStatus
          ? `🔓 ${shop.shop_name} UNLOCKED (Active) — Real-time synced!`
          : `🔒 ${shop.shop_name} SUSPENDED — Real-time synced!`
      );
    } else {
      showCloudSaveResult(false, '', false);
    }
  };

  // Toggle Module Lock / Unlock Globally or Per-Shop
  const handleToggleModule = async (moduleId: ControllableModuleId, forceGlobal = false) => {
    const updated: PlatformModuleControlConfig = {
      ...moduleConfig,
      globalModules: { ...moduleConfig.globalModules },
      shopOverrides: { ...moduleConfig.shopOverrides },
      updatedBy: currentUser?.email || MASTER_EMAIL
    };

    const isGlobalTarget = forceGlobal || selectedShopForModules === 'GLOBAL';
    if (isGlobalTarget) {
      const nextGlobalState = !(updated.globalModules[moduleId] !== false);
      updated.globalModules[moduleId] = nextGlobalState;
      // Clear stale per-shop overrides for this module so Global Lock/Unlock applies to ALL stores immediately
      Object.keys(updated.shopOverrides).forEach(sId => {
        if (updated.shopOverrides[sId] && moduleId in updated.shopOverrides[sId]) {
          const nextShopMap = { ...updated.shopOverrides[sId] };
          delete nextShopMap[moduleId];
          if (Object.keys(nextShopMap).length === 0) {
            delete updated.shopOverrides[sId];
          } else {
            updated.shopOverrides[sId] = nextShopMap;
          }
        }
      });
    } else {
      const shopOverrides = { ...(updated.shopOverrides[selectedShopForModules] || {}) };
      const currentEffective =
        typeof shopOverrides[moduleId] === 'boolean'
          ? shopOverrides[moduleId]!
          : updated.globalModules[moduleId] !== false;
      shopOverrides[moduleId] = !currentEffective;
      updated.shopOverrides[selectedShopForModules] = shopOverrides;
    }

    setModuleConfig(updated);
    const saved = await superAdminService.saveModuleControlConfig(updated);
    if (!saved) {
      pendingCloudConfigRef.current = updated;
      setHasUnsyncedCloudChanges(true);
    } else {
      pendingCloudConfigRef.current = null;
      setHasUnsyncedCloudChanges(false);
    }
    showCloudSaveResult(saved, '✓ Permission Lock / Unlock status saved and synced across all devices!');
  };

  // Toggle Platform Feature Permission Lock / Unlock
  const handleTogglePermission = async (
    permKey: keyof PlatformModuleControlConfig['featurePermissions']
  ) => {
    const updated: PlatformModuleControlConfig = {
      ...moduleConfig,
      featurePermissions: {
        ...moduleConfig.featurePermissions,
        [permKey]: !moduleConfig.featurePermissions[permKey]
      },
      updatedBy: currentUser?.email || MASTER_EMAIL
    };
    setModuleConfig(updated);
    const saved = await superAdminService.saveModuleControlConfig(updated);
    if (!saved) {
      pendingCloudConfigRef.current = updated;
      setHasUnsyncedCloudChanges(true);
    } else {
      pendingCloudConfigRef.current = null;
      setHasUnsyncedCloudChanges(false);
    }
    showCloudSaveResult(saved, '✓ Platform security & feature Lock / Unlock synced to all devices!');
  };

  // Toggle Store Manager / Cashier / Salesman Module Lock/Unlock from Super Admin
  const handleToggleShopStaffRoleModule = async (moduleId: ControllableModuleId) => {
    const currentRoleTarget = shopStaffPermConfig.rolePermissions[selectedStaffRoleTarget] || {
      modules: {},
      actions: {}
    };
    const isCurrentlyUnlocked = currentRoleTarget.modules?.[moduleId] !== false;
    const updated: ShopStaffPermissionsConfig = {
      ...shopStaffPermConfig,
      rolePermissions: {
        ...shopStaffPermConfig.rolePermissions,
        [selectedStaffRoleTarget]: {
          ...currentRoleTarget,
          modules: {
            ...(currentRoleTarget.modules || {}),
            [moduleId]: !isCurrentlyUnlocked
          }
        }
      },
      updatedBy: currentUser?.email || MASTER_EMAIL
    };
    setShopStaffPermConfig(updated);
    const saved = await superAdminService.saveShopStaffPermissions(targetShopIdForStaffPerms, updated);
    showCloudSaveResult(
      saved,
      `✓ ${selectedStaffRoleTarget.toUpperCase()} module (${moduleId}) ${
        !isCurrentlyUnlocked ? 'UNLOCKED 🔓' : 'LOCKED 🔒'
      }!`,
      false
    );
  };

  // Toggle Store Manager / Cashier / Salesman Action Lock/Unlock from Super Admin
  const handleToggleShopStaffRoleAction = async (actionId: StaffPermissionActionId) => {
    const currentRoleTarget = shopStaffPermConfig.rolePermissions[selectedStaffRoleTarget] || {
      modules: {},
      actions: {}
    };
    const isCurrentlyUnlocked = currentRoleTarget.actions?.[actionId] !== false;
    const updated: ShopStaffPermissionsConfig = {
      ...shopStaffPermConfig,
      rolePermissions: {
        ...shopStaffPermConfig.rolePermissions,
        [selectedStaffRoleTarget]: {
          ...currentRoleTarget,
          actions: {
            ...(currentRoleTarget.actions || {}),
            [actionId]: !isCurrentlyUnlocked
          }
        }
      },
      updatedBy: currentUser?.email || MASTER_EMAIL
    };
    setShopStaffPermConfig(updated);
    const saved = await superAdminService.saveShopStaffPermissions(targetShopIdForStaffPerms, updated);
    showCloudSaveResult(
      saved,
      `✓ ${selectedStaffRoleTarget.toUpperCase()} action (${actionId}) ${
        !isCurrentlyUnlocked ? 'UNLOCKED 🔓' : 'LOCKED 🔒'
      }!`,
      false
    );
  };

  // Update Global Data Update Delay Time (in milliseconds, default 1000ms = 1.0s)
  const handleUpdateDelayTime = async (delayMs: number) => {
    const clampedMs = Math.max(0, Math.min(15000, Math.round(delayMs)));
    const updated: PlatformModuleControlConfig = {
      ...moduleConfig,
      featurePermissions: {
        ...moduleConfig.featurePermissions,
        dataUpdateDelayMs: clampedMs
      },
      updatedBy: currentUser?.email || MASTER_EMAIL
    };
    setModuleConfig(updated);
    const saved = await superAdminService.setDataUpdateDelayMs(clampedMs);
    if (!saved) {
      pendingCloudConfigRef.current = updated;
      setHasUnsyncedCloudChanges(true);
    } else {
      pendingCloudConfigRef.current = null;
      setHasUnsyncedCloudChanges(false);
    }
    showCloudSaveResult(
      saved,
      `✓ Data Update Delay Time set to ${(clampedMs / 1000).toFixed(1)} sec (${clampedMs} ms) for ALL accounts!`
    );
  };

  // Unlock All / Lock All Modules
  const handleEnableAllModules = async (forceGlobal = false) => {
    const updated: PlatformModuleControlConfig = {
      ...moduleConfig,
      globalModules: { ...moduleConfig.globalModules },
      shopOverrides: { ...moduleConfig.shopOverrides },
      updatedBy: currentUser?.email || MASTER_EMAIL
    };
    if (forceGlobal || selectedShopForModules === 'GLOBAL') {
      ALL_CONTROLLABLE_MODULES.forEach(m => {
        updated.globalModules[m.id] = true;
      });
      updated.shopOverrides = {};
    } else {
      const shopOverrides = { ...(updated.shopOverrides[selectedShopForModules] || {}) };
      ALL_CONTROLLABLE_MODULES.forEach(m => {
        shopOverrides[m.id] = true;
      });
      updated.shopOverrides[selectedShopForModules] = shopOverrides;
    }
    setModuleConfig(updated);
    const saved = await superAdminService.saveModuleControlConfig(updated);
    if (!saved) {
      pendingCloudConfigRef.current = updated;
      setHasUnsyncedCloudChanges(true);
    } else {
      pendingCloudConfigRef.current = null;
      setHasUnsyncedCloudChanges(false);
    }
    showCloudSaveResult(saved, '✓ All modules UNLOCKED (🔓)!');
  };

  const handleLockAllModules = async () => {
    const updated: PlatformModuleControlConfig = {
      ...moduleConfig,
      globalModules: { ...moduleConfig.globalModules },
      shopOverrides: { ...moduleConfig.shopOverrides },
      updatedBy: currentUser?.email || MASTER_EMAIL
    };
    if (selectedShopForModules === 'GLOBAL') {
      ALL_CONTROLLABLE_MODULES.forEach(m => {
        updated.globalModules[m.id] = false;
      });
      updated.shopOverrides = {};
    } else {
      const shopOverrides = { ...(updated.shopOverrides[selectedShopForModules] || {}) };
      ALL_CONTROLLABLE_MODULES.forEach(m => {
        shopOverrides[m.id] = false;
      });
      updated.shopOverrides[selectedShopForModules] = shopOverrides;
    }
    setModuleConfig(updated);
    const saved = await superAdminService.saveModuleControlConfig(updated);
    if (!saved) {
      pendingCloudConfigRef.current = updated;
      setHasUnsyncedCloudChanges(true);
    } else {
      pendingCloudConfigRef.current = null;
      setHasUnsyncedCloudChanges(false);
    }
    showCloudSaveResult(saved, '🔒 All controllable modules LOCKED (Visible with Lock icon)!');
  };

  // Reset Store Owner Password
  const handleResetOwnerPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassShop) return;
    const targetPassword = newOwnerPassword.trim();
    setIsResettingPass(true);
    setResetPassFeedback(null);
    setCopiedResetCreds(false);
    const res = await superAdminService.resetShopOwnerPassword(
      resetPassShop.id,
      resetPassShop.owner_email,
      targetPassword
    );
    setIsResettingPass(false);
    if (res.success) {
      setLastSavedPassword(targetPassword);
      setResetPassFeedback({
        type: 'success',
        text: `✓ Password for ${resetPassShop.shop_name} (${resetPassShop.owner_email}) has been reset with PBKDF2-SHA256 encryption! You can now copy or send the new password to the user.`
      });
    } else {
      setResetPassFeedback({
        type: 'error',
        text: res.error || 'Failed to reset password.'
      });
    }
  };

  // Change Secret Key
  const handleUpdateSecretKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newSecretKey.length < 6) {
      setSecretUpdateMsg('Secret key must be at least 6 characters.');
      return;
    }
    const ok = await superAdminService.setMasterSecretKey(newSecretKey);
    if (ok) {
      setSecretUpdateMsg('✓ Master Secret Key updated on Netlify Server Core & Local Vault!');
      setNewSecretKey('');
      setTimeout(() => setSecretUpdateMsg(null), 3500);
    }
  };

  const handleLogoutMaster = () => {
    superAdminService.logoutSession();
    setActiveView('dashboard');
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden space-y-4 pb-16 animate-in fade-in duration-150">
      {/* Top Super Admin Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setActiveView('dashboard')}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer shrink-0"
            title="Return to Shop POS"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-1.5">
                <span>Super Admin Command Center</span>
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 font-bold uppercase">
                Lock / Unlock Master Control
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 break-all">
              Authorized Master: <span className="font-mono text-indigo-300 font-semibold">{currentUser?.email || MASTER_EMAIL}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 rounded-xl text-xs font-bold transition-all border border-slate-700 cursor-pointer"
            title="Refresh All Store Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh Data</span>
          </button>

          <button
            type="button"
            onClick={handleLogoutMaster}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 rounded-xl text-xs font-bold transition-all cursor-pointer"
            title="Lock & Exit Master Portal"
          >
            <Power className="w-3.5 h-3.5" />
            <span>Lock Master</span>
          </button>
        </div>
      </div>

      {/* 6-Tab Master Navigation Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 bg-slate-900/95 p-1.5 rounded-2xl border border-slate-800 shadow-sm text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('shops')}
          className={`py-2.5 px-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'shops'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Building2 className="w-4 h-4 shrink-0" />
          <span className="truncate">Stores &amp; Dashboard</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono">
            {shops.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('quota')}
          className={`py-2.5 px-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'quota'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
              : 'text-emerald-300 hover:text-white hover:bg-slate-800/60 border border-emerald-500/20'
          }`}
        >
          <Activity className="w-4 h-4 shrink-0" />
          <span className="truncate">Quota &amp; Usage (99%)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('modules')}
          className={`py-2.5 px-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'modules'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Lock className="w-4 h-4 shrink-0" />
          <span className="truncate">Permissions (Lock/Unlock)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('diagnostics')}
          className={`py-2.5 px-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'diagnostics'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Cpu className="w-4 h-4 shrink-0" />
          <span className="truncate">System &amp; Test</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('analytics')}
          className={`py-2.5 px-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'analytics'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Radio className="w-4 h-4 shrink-0" />
          <span className="truncate">Audit Logs</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('security')}
          className={`py-2.5 px-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'security'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <KeyRound className="w-4 h-4 shrink-0" />
          <span className="truncate">Master Security</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: SHOP & MULTI-USER CONTROLS + DASHBOARD QUICK LOCK/UNLOCK           */}
      {/* ========================================================================= */}
      {activeTab === 'shops' && (
        <div className="space-y-4">
          {!isFirebaseMasterVerified && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-2.5 text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-black">Cloud Sync Verification Required (Master Google Auth)</div>
                  <p className="text-[11px] text-amber-800 mt-0.5 leading-snug">
                    Email/Password login ke baad Lock/Unlock sab devices par live sync karne ke liye 1 baar Master Gmail verify karein.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleVerifyMasterGoogleCloudAuth}
                disabled={isVerifyingCloudAuth}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-xl text-xs font-black shrink-0 cursor-pointer transition-all shadow-xs"
              >
                {isVerifyingCloudAuth ? 'Verifying...' : '🔐 Verify Cloud Auth (Google)'}
              </button>
            </div>
          )}

          {moduleSaveBanner && (
            <div
              className={`p-3 text-white rounded-2xl text-xs font-bold flex items-center justify-between shadow-md animate-in fade-in ${
                moduleSaveStatus === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
              }`}
            >
              <span>{moduleSaveBanner}</span>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono shrink-0 ml-2">
                {moduleSaveStatus === 'error' ? 'SYNC FAILED' : 'LIVE SYNCED'}
              </span>
            </div>
          )}

          {/* Super Admin Dashboard Quick Permissions Lock / Unlock Matrix */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-indigo-600" />
                  <span>Super Admin Dashboard — Quick Permissions (Lock / Unlock)</span>
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  کسی بھی آپشن کو یہاں سے براہِ راست لاک (🔒 Locked) یا ان لاک (🔓 Unlocked) کریں۔ لاک ہونے پر آپشن نظر آئے گا مگر اس پر لاک لگا ہوگا۔
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleEnableAllModules(true)}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-[11px] font-black flex items-center gap-1 cursor-pointer"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Unlock All</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('modules')}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-[11px] font-black flex items-center gap-1 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Full Permissions Tab</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {ALL_CONTROLLABLE_MODULES.map(mod => {
                const isUnlocked = moduleConfig.globalModules[mod.id] !== false;
                return (
                  <div
                    key={mod.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition-all min-w-0 ${
                      isUnlocked
                        ? 'bg-slate-50/70 border-slate-200/90'
                        : 'bg-rose-50/50 border-rose-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-slate-900 truncate flex items-center gap-1">
                        {isUnlocked ? (
                          <Unlock className="w-3 h-3 text-emerald-600 shrink-0" />
                        ) : (
                          <Lock className="w-3 h-3 text-rose-600 shrink-0" />
                        )}
                        <span className="truncate">{mod.label}</span>
                      </div>
                      <span className="text-[10px] font-bold text-indigo-600 block truncate">
                        {mod.urduLabel}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleModule(mod.id, true)}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 shrink-0 transition-all cursor-pointer border ${
                        isUnlocked
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-xs'
                          : 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700 shadow-xs'
                      }`}
                    >
                      {isUnlocked ? (
                        <>
                          <Unlock className="w-3 h-3" />
                          <span>Unlocked</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3 h-3" />
                          <span>Locked</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Metrics & Search Header */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search store name, owner, email, or ID..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold text-slate-600 w-full sm:w-auto justify-end">
              <span>
                Total Stores: <b className="text-slate-900 font-mono">{shops.length}</b>
              </span>
              <span>·</span>
              <span>
                Unlocked: <b className="text-emerald-600 font-mono">{shops.filter(s => s.is_active).length}</b>
              </span>
              <span>·</span>
              <span>
                Locked: <b className="text-rose-600 font-mono">{shops.filter(s => !s.is_active).length}</b>
              </span>
            </div>
          </div>

          {/* High-Density Shops Grid */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Store Profile</th>
                    <th className="py-3 px-4">Owner &amp; Email</th>
                    <th className="py-3 px-4">
                      {hostingMode === 'firebase_only'
                        ? 'Live Usage (Firebase Only Mode)'
                        : 'Live Usage (Netlify 24h + Firebase)'}
                    </th>
                    <th className="py-3 px-4 text-center">Store Access (Lock/Unlock)</th>
                    <th className="py-3 px-4 text-right">Master Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredShops.length > 0 ? (
                    filteredShops.map(shop => {
                      const uRow = shopUsageRows.find(r => r.shopId === shop.id);
                      const dUsage = uRow?.last24h || uRow?.daily;
                      const wUsage = uRow?.weekly;
                      return (
                        <tr key={shop.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 text-sm">{shop.shop_name}</div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
                              <span>ID: {shop.id.slice(0, 18)}</span>
                              {shop.phone && <span>· 📞 {shop.phone}</span>}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-800">{shop.owner_name}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {shop.owner_email || 'No email provided'}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono font-bold">
                              <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200">
                                {hostingMode === 'firebase_only' ? 'FB Host 24h' : 'Netlify 24h'}:{' '}
                                {(dUsage?.netlifyTotalRequests || 0).toLocaleString()} req ({dUsage?.netlifyBandwidthMB || 0} MB)
                              </span>
                              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                FB 24h R: {(uRow?.daily.firebaseReads || 0).toLocaleString()} | W:{' '}
                                {((uRow?.daily.firebaseWrites || 0) + (uRow?.daily.firebaseDeletes || 0)).toLocaleString()}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                7d FB: {((wUsage?.firebaseReads || 0) >= 1000 ? `${((wUsage?.firebaseReads || 0) / 1000).toFixed(1)}K` : (wUsage?.firebaseReads || 0))} R /{' '}
                                {((wUsage?.firebaseWrites || 0) + (wUsage?.firebaseDeletes || 0))} W
                              </span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(shop)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-black border transition-all cursor-pointer ${
                                shop.is_active
                                  ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700 shadow-xs'
                                  : 'bg-rose-600 text-white border-rose-700 hover:bg-rose-700 shadow-xs'
                              }`}
                              title="Click to Lock or Unlock store access"
                            >
                              {shop.is_active ? (
                                <>
                                  <Unlock className="w-3 h-3" />
                                  <span>Unlocked</span>
                                </>
                              ) : (
                                <>
                                  <Lock className="w-3 h-3" />
                                  <span>Locked</span>
                                </>
                              )}
                            </button>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedUsageShopId(shop.id);
                                  setActiveTab('quota');
                                }}
                                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                                title="View Daily / Weekly / Monthly / Yearly Quota & Usage Report"
                              >
                                <Activity className="w-3.5 h-3.5" />
                                <span className="hidden md:inline">Usage Report</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedShopForModules(shop.id);
                                  setActiveTab('modules');
                                }}
                                className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                                title="Lock / Unlock Permissions for this Shop"
                              >
                                <Lock className="w-3.5 h-3.5" />
                                <span className="hidden md:inline">Permissions</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setResetPassShop(shop);
                                  setNewOwnerPassword('');
                                  setResetPassFeedback(null);
                                }}
                                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                                title="Reset Store Owner Password"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                                <span className="hidden md:inline">Reset Pass</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setInspectShop(shop)}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                                title="Inspect Store Metadata"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Details</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => superAdminService.exportShopBackup(shop.id, shop.shop_name)}
                                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                                title="Download complete JSON backup for this store"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Backup</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No stores found matching your search term.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1B: NETLIFY & FIREBASE QUOTA & USAGE TRACKING CENTER (99% CONSOLE)    */}
      {/* ========================================================================= */}
      {activeTab === 'quota' && (() => {
        const periodData = activeUsageReport[usagePeriod];
        const dailyData = activeUsageReport.daily;
        const last24hData = activeUsageReport.last24h;
        const weeklyData = activeUsageReport.weekly;
        const monthlyData = activeUsageReport.monthly;
        const resetCountdown = getQuotaResetCountdown();
        const isFirebaseOnly = hostingMode === 'firebase_only';

        // OFFICIAL RESET CYCLES:
        // 1. Firebase Reads & Writes ALWAYS reset DAILY (Every 24 Hours: 50,000 Reads/Day, 20,000 Writes/Day)
        //    When viewing weekly/monthly/yearly tabs, we also show cumulative capacity while highlighting the Daily 24h Reset Quota.
        const periodMultiplier =
          usagePeriod === 'daily'
            ? 1
            : usagePeriod === 'weekly'
              ? 7
              : usagePeriod === 'monthly'
                ? 30
                : 365;

        const fbDailyReadLimit = FIREBASE_FREE_LIMITS.dailyReads; // 50,000 / day
        const fbDailyWriteLimit = FIREBASE_FREE_LIMITS.dailyWrites; // 20,000 / day
        const fbPeriodReadLimit = FIREBASE_FREE_LIMITS.dailyReads * periodMultiplier;
        const fbPeriodWriteLimit = FIREBASE_FREE_LIMITS.dailyWrites * periodMultiplier;

        // 2. Netlify Requests, Function Calls & Bandwidth ALWAYS reset MONTHLY (1st of every month: 300k Req / 125k Fn / 100 GB)
        //    In 'firebase_only' mode, uses Firebase Hosting (10 GB/month) & Cloud Functions (125k/month) monthly limits.
        const monthlyWebReqLimit = NETLIFY_FREE_LIMITS.monthlyWebRequestsEstimate; // 300,000 / month
        const monthlyFnLimit = isFirebaseOnly
          ? FIREBASE_FREE_LIMITS.firebaseCloudFunctionsMonthlyCalls
          : NETLIFY_FREE_LIMITS.monthlyFunctionCalls; // 125,000 / month
        const monthlyBwLimitMB = isFirebaseOnly
          ? FIREBASE_FREE_LIMITS.firebaseHostingMonthlyBandwidthMB
          : NETLIFY_FREE_LIMITS.monthlyBandwidthMB; // 102,400 MB (100 GB) or 10,240 MB (10 GB)

        const dailyWritesAndDeletes = dailyData.firebaseWrites + dailyData.firebaseDeletes;
        const totalWritesAndDeletes = periodData.firebaseWrites + periodData.firebaseDeletes;

        // Daily Firebase Quota Percentages (Resets Every 24h)
        const fbDailyReadPct = Math.min(100, Number(((dailyData.firebaseReads / fbDailyReadLimit) * 100).toFixed(2)));
        const fbDailyWritePct = Math.min(100, Number(((dailyWritesAndDeletes / fbDailyWriteLimit) * 100).toFixed(2)));

        // Monthly Hosting/Netlify Quota Percentages (Resets Monthly on 1st)
        const monthlyWebReqPct = Math.min(100, Number(((monthlyData.netlifyTotalRequests / monthlyWebReqLimit) * 100).toFixed(2)));
        const monthlyFnPct = Math.min(100, Number(((monthlyData.netlifyFunctionCalls / monthlyFnLimit) * 100).toFixed(2)));
        const monthlyBwPct = Math.min(100, Number(((monthlyData.netlifyBandwidthMB / monthlyBwLimitMB) * 100).toFixed(3)));

        // 7-Day Firebase Console Summary (e.g. 1.6K Reads +128.1%, 66 Writes +13.8%)
        const sevenDayTrend = activeUsageReport.sevenDayTrend || [];
        const thisWeekTotalReads = weeklyData.firebaseReads;
        const lastWeekTotalReads = Math.max(
          1,
          sevenDayTrend.reduce((acc, d) => acc + d.lastWeekReads, 0)
        );
        const readsWoWPct = Number((((thisWeekTotalReads - lastWeekTotalReads) / lastWeekTotalReads) * 100).toFixed(1));

        const thisWeekTotalWrites = weeklyData.firebaseWrites + weeklyData.firebaseDeletes;
        const lastWeekTotalWrites = Math.max(
          1,
          sevenDayTrend.reduce((acc, d) => acc + d.lastWeekWrites, 0)
        );
        const writesWoWPct = Number((((thisWeekTotalWrites - lastWeekTotalWrites) / lastWeekTotalWrites) * 100).toFixed(1));

        const formatted7dReads =
          thisWeekTotalReads >= 1000
            ? `${(thisWeekTotalReads / 1000).toFixed(1)}K`
            : thisWeekTotalReads.toLocaleString();

        // 24-Hour Hourly Timeline for Netlify / Web Console Chart
        const hourly24h = activeUsageReport.hourlyTimeline24h || [];
        const maxHourlyReq = Math.max(100, ...hourly24h.map(h => h.netlifyTotalRequests));
        const maxHourlyBw = Math.max(6, ...hourly24h.map(h => h.netlifyBandwidthMB));
        const maxHourlyDur = Math.max(5, ...hourly24h.map(h => h.durationP50Sec));

        const max7dReadsPoint = Math.max(
          2000,
          ...sevenDayTrend.map(d => Math.max(d.thisWeekReads, d.lastWeekReads))
        );
        const max7dWritesPoint = Math.max(
          100,
          ...sevenDayTrend.map(d => Math.max(d.thisWeekWrites, d.lastWeekWrites))
        );

        // Smart capacity calculation: How many shops can run on Free Tier based on average shop usage
        const activeShopCount = Math.max(1, shops.length);
        const avgDailyReadsPerShop = Math.max(25, Math.round(combinedUsageReport.daily.firebaseReads / activeShopCount) || 230);
        const avgDailyWritesPerShop = Math.max(8, Math.round((combinedUsageReport.daily.firebaseWrites + combinedUsageReport.daily.firebaseDeletes) / activeShopCount) || 15);
        const avgDailyReqPerShop = Math.max(50, Math.round(combinedUsageReport.last24h.netlifyTotalRequests / activeShopCount) || 587);

        const maxShopsByFbReads = Math.floor(FIREBASE_FREE_LIMITS.dailyReads / avgDailyReadsPerShop);
        const maxShopsByFbWrites = Math.floor(FIREBASE_FREE_LIMITS.dailyWrites / avgDailyWritesPerShop);
        const maxShopsByNetlify = Math.floor(monthlyWebReqLimit / (avgDailyReqPerShop * 30));
        const safeFreePlanShopsCapacity = Math.max(16, Math.min(maxShopsByFbReads, maxShopsByFbWrites, Math.max(16, maxShopsByNetlify)));

        const handleSelectHostingMode = (mode: PlatformHostingMode) => {
          setPlatformHostingMode(mode);
          setHostingModeState(mode);
          setModuleSaveStatus('synced');
          setModuleSaveBanner(
            mode === 'netlify_firebase'
              ? '✓ Active Architecture Mode: Netlify + Firebase (Hybrid Mode) — Netlify Monthly Quota + Firebase Daily Quota active!'
              : '✓ Active Architecture Mode: Only Firebase (Single Provider Mode) — Pure Firebase Hosting, Functions & Firestore Quota active!'
          );
          setTimeout(() => setModuleSaveBanner(null), 4000);
        };

        return (
          <div className="space-y-4">
            {moduleSaveBanner && (
              <div className="p-3 bg-emerald-600 text-white rounded-2xl text-xs font-bold flex items-center justify-between shadow-md animate-in fade-in">
                <span>{moduleSaveBanner}</span>
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono">ACTIVE</span>
              </div>
            )}

            {/* Top Control Header: Architecture Mode Switcher + Shop Selector + Period Selector */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 border border-indigo-500/30 shadow-lg space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-white/10 pb-3.5">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-black uppercase">
                      99% Real Console Similarity
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-400/30 text-[10px] font-black uppercase">
                      {isFirebaseOnly ? '🔥 Mode: Only Firebase (Single)' : '⚡ Mode: Netlify + Firebase (Hybrid)'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] font-black uppercase">
                      FB Daily Reset · {isFirebaseOnly ? 'FB Hosting' : 'Netlify'} Monthly Reset
                    </span>
                  </div>
                  <h2 className="text-base sm:text-lg font-black tracking-tight mt-1">
                    {isFirebaseOnly
                      ? 'Firebase Complete Quota & Usage Console (Firestore + Hosting + Functions — 99% Match)'
                      : 'Netlify & Firebase Live Console Replica & Quota Tracker (99% Similarity)'}
                  </h2>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    اب آپ کو الگ سے Netlify یا Firebase کھولنے کی ضرورت نہیں—یہاں گھنٹہ وار (Hourly) ٹائم لائن، 7 دن کا گراف، ڈیلی Firebase ری سیٹ اور منتھلی Netlify ری سیٹ خودکار محفوظ ہوتا ہے۔
                  </p>
                </div>

                {/* Shop Selector Dropdown */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto min-w-0">
                  <div className="bg-white/10 border border-white/20 rounded-xl px-3 py-1.5 w-full sm:w-64 max-w-full min-w-0">
                    <label className="block text-[9px] uppercase font-bold text-indigo-200">
                      Select Target Shop (دکان منتخب کریں)
                    </label>
                    <select
                      value={selectedUsageShopId}
                      onChange={e => setSelectedUsageShopId(e.target.value)}
                      className="w-full max-w-full min-w-0 truncate bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer pr-4 mt-0.5"
                    >
                      <option value="ALL_SHOPS" className="text-slate-900 font-bold">
                        🌍 All Shops Combined ({shops.length} Stores Total)
                      </option>
                      {shops.map(s => (
                        <option key={s.id} value={s.id} className="text-slate-900">
                          🏪 {s.shop_name} ({s.owner_name})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Architecture / Hosting Provider Mode Selector (Netlify + Firebase vs Only Firebase) */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-black text-white flex items-center gap-1.5">
                    <span>⚙️ System Architecture &amp; Quota Mode (مستقبل کے لیے پلیٹ فارم سلیکٹر)</span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    منتخب کریں کہ سسٹم اس وقت <b>Netlify + Firebase (Mix)</b> پر چل رہا ہے یا مستقبل میں <b>Only Firebase (Single)</b> پر—سسٹم اسی حساب سے ڈیٹا اور کوٹہ ہینڈل کرے گا۔
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSelectHostingMode('netlify_firebase')}
                    className={`px-3.5 py-2 rounded-xl text-left border transition-all cursor-pointer ${
                      hostingMode === 'netlify_firebase'
                        ? 'bg-sky-500 text-white border-sky-300 shadow-md shadow-sky-500/25'
                        : 'bg-slate-900/60 hover:bg-slate-800 text-slate-300 border-white/10'
                    }`}
                  >
                    <div className="font-black text-xs flex items-center justify-between gap-2">
                      <span>⚡ Netlify + Firebase (Mix)</span>
                      {hostingMode === 'netlify_firebase' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/25 font-mono">ACTIVE</span>
                      )}
                    </div>
                    <span className="text-[10px] block opacity-85 mt-0.5">
                      Netlify Monthly (100GB/300k) + Firebase Daily (50k/20k)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectHostingMode('firebase_only')}
                    className={`px-3.5 py-2 rounded-xl text-left border transition-all cursor-pointer ${
                      hostingMode === 'firebase_only'
                        ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md shadow-amber-500/25'
                        : 'bg-slate-900/60 hover:bg-slate-800 text-slate-300 border-white/10'
                    }`}
                  >
                    <div className="font-black text-xs flex items-center justify-between gap-2">
                      <span>🔥 Only Firebase (Single)</span>
                      {hostingMode === 'firebase_only' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/20 text-white font-mono">ACTIVE</span>
                      )}
                    </div>
                    <span className="text-[10px] block opacity-85 mt-0.5">
                      Pure Firebase Hosting + Cloud Functions + Firestore
                    </span>
                  </button>
                </div>
              </div>

              {/* Official Reset Cycle Status Bar + 4 Period Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full sm:w-auto flex-1 max-w-2xl">
                  {[
                    { id: 'daily' as const, label: 'Daily / 24h (آج)', sub: 'FB Daily Reset View' },
                    { id: 'weekly' as const, label: 'Weekly (7 Days)', sub: 'FB 7d Console View' },
                    { id: 'monthly' as const, label: 'Monthly (30 Days)', sub: 'Netlify Monthly Quota' },
                    { id: 'yearly' as const, label: 'Yearly (365 Days)', sub: 'Annual Archive' }
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setUsagePeriod(p.id)}
                      className={`py-2 px-3 rounded-xl text-left transition-all cursor-pointer border ${
                        usagePeriod === p.id
                          ? 'bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-500/25'
                          : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                      }`}
                    >
                      <span className="font-black text-xs block">{p.label}</span>
                      <span className={`text-[10px] block ${usagePeriod === p.id ? 'text-emerald-100' : 'text-slate-400'}`}>
                        {p.sub}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="bg-amber-500/15 border border-amber-400/30 rounded-xl px-3 py-1.5 text-right">
                    <span className="text-[9px] font-bold text-amber-300 uppercase block">
                      Firebase Daily Reset (ہر 24 گھنٹے بعد)
                    </span>
                    <span className="font-mono font-black text-xs text-white">
                      ⏳ {resetCountdown.firebaseResetInLabel} (50k R / 20k W)
                    </span>
                  </div>
                  <div className="bg-sky-500/15 border border-sky-400/30 rounded-xl px-3 py-1.5 text-right">
                    <span className="text-[9px] font-bold text-sky-300 uppercase block">
                      {isFirebaseOnly ? 'FB Hosting Monthly Reset' : 'Netlify Monthly Reset (ہر مہینے)'}
                    </span>
                    <span className="font-mono font-black text-xs text-white">
                      📅 {resetCountdown.netlifyResetInDays}d left (Resets {resetCountdown.netlifyNextResetDate})
                    </span>
                  </div>
                  <div className="bg-emerald-500/15 border border-emerald-400/30 rounded-xl px-3 py-1.5 text-right">
                    <span className="text-[9px] font-bold text-emerald-300 uppercase block">
                      Free Tier Store Capacity
                    </span>
                    <span className="font-mono font-black text-xs text-white">
                      ~{safeFreePlanShopsCapacity} Active Shops Free
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* 4 OFFICIAL QUOTA CARDS (FIREBASE = DAILY RESET | NETLIFY = MONTHLY RESET) */}
            {/* ========================================================================= */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Card 1: Netlify / Web Requests (Monthly Reset + 24h Console Window) */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-sky-100 text-sky-800">
                    {isFirebaseOnly ? 'FB Hosting & Fn Req' : 'Netlify Requests'}
                  </span>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                    Resets Monthly ({resetCountdown.netlifyResetInDays}d)
                  </span>
                </div>
                <div>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        Last 24h Console Window
                      </span>
                      <div className="text-2xl font-black font-mono text-slate-900">
                        {last24hData.netlifyTotalRequests.toLocaleString()}
                        <span className="text-xs font-bold text-sky-700 ml-1">req</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        This Month Total
                      </span>
                      <div className="text-sm font-black font-mono text-sky-800">
                        {monthlyData.netlifyTotalRequests.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-semibold mt-1">
                    24h Web/CDN: <b className="font-mono text-slate-800">{last24hData.netlifyWebRequests.toLocaleString()}</b> · Fn Calls:{' '}
                    <b className="font-mono text-sky-700">{last24hData.netlifyFunctionCalls.toLocaleString()}</b> · p50:{' '}
                    <b className="font-mono text-emerald-700">{last24hData.netlifyDurationP50Sec}s</b>
                  </p>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-500 rounded-full transition-all"
                    style={{ width: `${Math.max(2, monthlyWebReqPct)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>Month Used: {monthlyWebReqPct}%</span>
                  <span>Month Limit: {monthlyWebReqLimit.toLocaleString()}</span>
                </div>
              </div>

              {/* Card 2: Netlify / Hosting Bandwidth (Monthly Reset + 24h Console Window) */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                    {isFirebaseOnly ? 'FB Hosting Bandwidth' : 'Netlify Bandwidth'}
                  </span>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                    Resets Monthly ({resetCountdown.netlifyResetInDays}d)
                  </span>
                </div>
                <div>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        Last 24h Bandwidth
                      </span>
                      <div className="text-2xl font-black font-mono text-slate-900">
                        {last24hData.netlifyBandwidthMB >= 1024
                          ? `${(last24hData.netlifyBandwidthMB / 1024).toFixed(2)} GB`
                          : `${last24hData.netlifyBandwidthMB.toLocaleString()} MB`}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        This Month Total
                      </span>
                      <div className="text-sm font-black font-mono text-indigo-800">
                        {monthlyData.netlifyBandwidthMB.toLocaleString()} MB
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-semibold mt-1">
                    Errors (24h): <b className="font-mono text-amber-700">{last24hData.netlifyErrorRatePct}%</b> · Free Left:{' '}
                    <b className="font-mono text-emerald-700">{(100 - monthlyBwPct).toFixed(2)}%</b>
                  </p>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: `${Math.max(2, monthlyBwPct)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>Month Used: {monthlyBwPct}%</span>
                  <span>Month Limit: {(monthlyBwLimitMB / 1024).toFixed(0)} GB</span>
                </div>
              </div>

              {/* Card 3: Firebase Firestore Reads (DAILY 24H RESET + 7-Day Console Trend) */}
              <div className="bg-white rounded-2xl p-4 border border-emerald-200 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    Firebase Reads
                  </span>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Daily Reset ({resetCountdown.firebaseResetInLabel})
                  </span>
                </div>
                <div>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        {usagePeriod === 'daily' ? 'Today Daily Reads (24h)' : `7d Console / ${usagePeriod.toUpperCase()}`}
                      </span>
                      <div className="text-2xl font-black font-mono text-emerald-700">
                        {usagePeriod === 'daily'
                          ? dailyData.firebaseReads.toLocaleString()
                          : usagePeriod === 'weekly'
                            ? `${formatted7dReads} (${thisWeekTotalReads.toLocaleString()})`
                            : periodData.firebaseReads.toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        7-Day Console
                      </span>
                      <div className="text-xs font-black font-mono text-emerald-800">
                        {formatted7dReads}{' '}
                        <span className="text-[10px] text-emerald-600">
                          ({readsWoWPct >= 0 ? `+${readsWoWPct}%` : `${readsWoWPct}%`})
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-semibold mt-1">
                    Today Left:{' '}
                    <b className="font-mono text-slate-800">
                      {Math.max(0, fbDailyReadLimit - dailyData.firebaseReads).toLocaleString()}
                    </b>{' '}
                    / {fbDailyReadLimit.toLocaleString()} daily limit
                  </p>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${Math.max(2, fbDailyReadPct)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>Today Used: {fbDailyReadPct}%</span>
                  <span>Daily Quota: 50,000 / day</span>
                </div>
              </div>

              {/* Card 4: Firebase Firestore Writes & Deletes (DAILY 24H RESET + 7-Day Console Trend) */}
              <div className="bg-white rounded-2xl p-4 border border-amber-200 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                    Firebase Writes
                  </span>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                    Daily Reset ({resetCountdown.firebaseResetInLabel})
                  </span>
                </div>
                <div>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        {usagePeriod === 'daily' ? 'Today Daily Writes (24h)' : `7d Console / ${usagePeriod.toUpperCase()}`}
                      </span>
                      <div className="text-2xl font-black font-mono text-amber-700">
                        {usagePeriod === 'daily'
                          ? dailyWritesAndDeletes.toLocaleString()
                          : totalWritesAndDeletes.toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        7-Day Console
                      </span>
                      <div className="text-xs font-black font-mono text-amber-800">
                        {thisWeekTotalWrites.toLocaleString()}{' '}
                        <span className="text-[10px] text-amber-700">
                          ({writesWoWPct >= 0 ? `+${writesWoWPct}%` : `${writesWoWPct}%`})
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-semibold mt-1">
                    Today Writes: <b className="font-mono text-slate-800">{dailyData.firebaseWrites}</b> · Deletes:{' '}
                    <b className="font-mono text-rose-600">{dailyData.firebaseDeletes}</b> · Left:{' '}
                    <b className="font-mono text-slate-800">
                      {Math.max(0, fbDailyWriteLimit - dailyWritesAndDeletes).toLocaleString()}
                    </b>
                  </p>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all"
                    style={{ width: `${Math.max(2, fbDailyWritePct)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>Today Used: {fbDailyWritePct}%</span>
                  <span>Daily Quota: 20,000 / day</span>
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* REAL-TIME CONSOLE REPLICA DUAL PANEL (NETLIFY 24H + FIREBASE 7-DAY)       */}
            {/* ========================================================================= */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* PANEL 1: NETLIFY / WEB CONSOLE LAST 24 HOURS REPLICA (Status group / Bandwidth / Duration) */}
              <div className="bg-slate-950 text-white rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-lg space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <h3 className="font-black text-sm text-white">
                        {isFirebaseOnly
                          ? 'Firebase Hosting & Functions — Last 24h Hourly Timeline (UTC+5)'
                          : 'Netlify Web & Functions — Last 24h Console Replica (UTC+5)'}
                      </h3>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      کسی بھی گھنٹے کی بار پر ماؤس/ٹیپ کریں تاکہ اس وقت کی Requests، Bandwidth، Duration اور Firebase Reads/Writes دیکھ سکیں۔
                    </p>
                  </div>

                  {/* Sum by: Status group | Bandwidth | Duration (Exact Netlify Console Tabs) */}
                  <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
                    <span className="text-[10px] text-slate-400 px-1.5 font-semibold">Sum by</span>
                    {[
                      { id: 'status' as const, label: 'Status group' },
                      { id: 'bandwidth' as const, label: 'Bandwidth' },
                      { id: 'duration' as const, label: 'Duration' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setNetlifyChartMetric(tab.id)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          netlifyChartMetric === tab.id
                            ? 'bg-teal-500/20 text-teal-300 border border-teal-400/50'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Netlify Console Headline Metrics Row (587 requests | 10.3 MB Bandwidth | 0.28s Duration (p50) | 0.51% Errors) */}
                <div className="flex flex-wrap items-baseline justify-between gap-3 bg-slate-900/90 px-3.5 py-2.5 rounded-xl border border-slate-800/90">
                  <div className="flex flex-wrap items-baseline gap-4">
                    <div className="text-lg sm:text-xl font-black font-mono text-white">
                      {last24hData.netlifyTotalRequests.toLocaleString()} requests
                    </div>
                    {netlifyChartMetric === 'status' && (
                      <div className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1">
                        <span>▲ {last24hData.netlifyErrorRatePct}%</span>
                        <span className="text-slate-400 font-normal">Errors</span>
                      </div>
                    )}
                    {netlifyChartMetric === 'bandwidth' && (
                      <div className="text-xs font-mono font-bold text-sky-400 flex items-center gap-1">
                        <span>⇅ {last24hData.netlifyBandwidthMB} MB</span>
                        <span className="text-slate-400 font-normal">Bandwidth</span>
                      </div>
                    )}
                    {netlifyChartMetric === 'duration' && (
                      <div className="text-xs font-mono font-bold text-indigo-300 flex items-center gap-1">
                        <span>🕒 {last24hData.netlifyDurationP50Sec}s</span>
                        <span className="text-slate-400 font-normal">Duration (p50)</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-slate-400">
                    <span>⇅ <b className="text-sky-300">{last24hData.netlifyBandwidthMB} MB</b></span>
                    <span>🕒 <b className="text-indigo-300">{last24hData.netlifyDurationP50Sec}s p50</b></span>
                    <span>▲ <b className="text-amber-300">{last24hData.netlifyErrorRatePct}% Err</b></span>
                  </div>
                </div>

                {/* 24-Hour Interactive Bar Chart */}
                <div className="space-y-2">
                  <div className="flex items-end gap-1 h-36 pt-4 px-2 bg-slate-900/60 rounded-xl border border-slate-800/80 relative">
                    {/* Y-Axis Reference Label */}
                    <div className="absolute top-1.5 left-2.5 text-[9px] font-mono text-slate-500">
                      {netlifyChartMetric === 'status'
                        ? `Max: ${maxHourlyReq} req/hr`
                        : netlifyChartMetric === 'bandwidth'
                          ? `Max: ${maxHourlyBw.toFixed(1)} MB/hr`
                          : `Max: ${maxHourlyDur.toFixed(1)}s`}
                    </div>

                    {hourly24h.map(pt => {
                      const val =
                        netlifyChartMetric === 'status'
                          ? pt.netlifyTotalRequests
                          : netlifyChartMetric === 'bandwidth'
                            ? pt.netlifyBandwidthMB
                            : pt.durationP50Sec;
                      const maxVal =
                        netlifyChartMetric === 'status'
                          ? maxHourlyReq
                          : netlifyChartMetric === 'bandwidth'
                            ? maxHourlyBw
                            : maxHourlyDur;
                      const heightPct = Math.max(4, Math.min(100, Math.round((val / maxVal) * 100)));
                      const barColor =
                        netlifyChartMetric === 'status'
                          ? pt.netlifyTotalRequests >= 60
                            ? 'bg-emerald-400 hover:bg-emerald-300'
                            : 'bg-emerald-500/80 hover:bg-emerald-400'
                          : netlifyChartMetric === 'bandwidth'
                            ? pt.netlifyBandwidthMB >= 2
                              ? 'bg-sky-400 hover:bg-sky-300'
                              : 'bg-sky-500/80 hover:bg-sky-400'
                            : pt.durationP50Sec >= 1.5
                              ? 'bg-rose-400 hover:bg-rose-300'
                              : 'bg-indigo-400 hover:bg-indigo-300';

                      return (
                        <div
                          key={pt.hourKey}
                          className="flex-1 flex flex-col items-center justify-end h-full group relative"
                          title={`${pt.label}: ${pt.netlifyTotalRequests} req (Web: ${pt.netlifyWebRequests}, Fn: ${pt.netlifyFunctionCalls}) | ${pt.netlifyBandwidthMB} MB | ${pt.durationP50Sec}s p50 | FB Reads: ${pt.firebaseReads}, Writes: ${pt.firebaseWrites}`}
                        >
                          <div
                            className={`w-full rounded-t transition-all ${barColor}`}
                            style={{ height: `${heightPct}%` }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* X-Axis Timestamps matching Netlify 24h Console */}
                  <div className="flex justify-between text-[9px] font-mono text-slate-400 px-1">
                    <span>12:15 AM</span>
                    <span>4:15 AM</span>
                    <span>8:15 AM</span>
                    <span>11:15 AM (Spike)</span>
                    <span>2:15 PM</span>
                    <span>6:15 PM</span>
                    <span>10:15 PM</span>
                  </div>
                </div>

                {/* Peak Hours Breakdown Pill List (Shows exact time-of-day requests, reads, writes & functions) */}
                <div className="bg-slate-900/80 rounded-xl p-2.5 border border-slate-800 space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-300 flex items-center justify-between">
                    <span>🕒 Hourly Time-of-Day Breakdown (کس ٹائم کتنی Requests، Reads، Writes اور Functions ہوئیں)</span>
                    <span className="font-mono text-emerald-400">24h Live Log</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-h-28 overflow-y-auto pr-1">
                    {hourly24h
                      .filter(h => h.netlifyTotalRequests > 0 || h.firebaseReads > 0 || h.firebaseWrites > 0)
                      .slice(-8)
                      .map(h => (
                        <div
                          key={h.hourKey}
                          className="bg-slate-950/90 border border-slate-800/90 rounded-lg px-2 py-1.5 text-[10px] font-mono"
                        >
                          <div className="font-black text-white flex justify-between">
                            <span>{h.label}</span>
                            <span className="text-emerald-400">{h.netlifyTotalRequests} req</span>
                          </div>
                          <div className="text-[9px] text-slate-400 mt-0.5">
                            BW: {h.netlifyBandwidthMB}MB · Fn: {h.netlifyFunctionCalls}
                          </div>
                          <div className="text-[9px] text-amber-300">
                            FB R: {h.firebaseReads} · W: {h.firebaseWrites}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* PANEL 2: FIREBASE FIRESTORE 7-DAY CONSOLE REPLICA (Reads 1.6K +128.1% | Writes 66 +13.8%) */}
              <div className="bg-slate-950 text-white rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-lg space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] font-black">
                        Spark plan (Daily Reset)
                      </span>
                      <h3 className="font-black text-sm text-white">
                        Firebase Firestore Console Replica — Last 7 Days
                      </h3>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Firebase کنسول کی طرح پچھلے 7 دن کے <b>Reads ({formatted7dReads})</b> اور <b>Writes ({thisWeekTotalWrites})</b> کا مکمل موازنہ (This week vs Last week)۔
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg self-start sm:self-auto">
                    Daily Quota: 50K R / 20K W
                  </span>
                </div>

                {/* Dual Sub-Charts: Reads (current) 1.6K +128.1% | Writes (current) 66 +13.8% */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Left: Reads (current) */}
                  <div className="bg-slate-900/90 rounded-xl p-3.5 border border-slate-800 space-y-3">
                    <div>
                      <span className="text-[11px] text-slate-400 font-semibold block">
                        Reads <span className="text-slate-500">(current 7 days)</span>
                      </span>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-2xl font-black font-mono text-white">
                          {formatted7dReads}
                        </span>
                        <span className="text-xs font-mono font-bold text-sky-400">
                          {readsWoWPct >= 0 ? `+${readsWoWPct}%` : `${readsWoWPct}%`}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        Exact: {thisWeekTotalReads.toLocaleString()} reads (Today: {dailyData.firebaseReads.toLocaleString()})
                      </span>
                    </div>

                    {/* 7-Day Reads Bar Comparison (This Week vs Last Week) */}
                    <div className="flex items-end gap-1.5 h-28 pt-3 px-1.5 bg-slate-950/60 rounded-lg border border-slate-800/80">
                      {sevenDayTrend.map(pt => {
                        const thisH = Math.max(4, Math.min(100, Math.round((pt.thisWeekReads / max7dReadsPoint) * 100)));
                        const lastH = Math.max(3, Math.min(100, Math.round((pt.lastWeekReads / max7dReadsPoint) * 100)));
                        return (
                          <div
                            key={pt.date}
                            className="flex-1 flex flex-col items-center justify-end h-full gap-1"
                            title={`${pt.shortLabel}: This week ${pt.thisWeekReads} reads vs Last week ${pt.lastWeekReads} reads`}
                          >
                            <div className="w-full flex items-end justify-center gap-0.5 h-full">
                              <div
                                className="w-1/2 bg-sky-400 rounded-t transition-all"
                                style={{ height: `${thisH}%` }}
                              />
                              <div
                                className="w-1/2 bg-sky-400/30 border-t border-dashed border-sky-300 rounded-t transition-all"
                                style={{ height: `${lastH}%` }}
                              />
                            </div>
                            <span className="text-[8px] font-mono text-slate-400 truncate max-w-full">
                              {pt.shortLabel.replace(' ', '')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right: Writes (current) */}
                  <div className="bg-slate-900/90 rounded-xl p-3.5 border border-slate-800 space-y-3">
                    <div>
                      <span className="text-[11px] text-slate-400 font-semibold block">
                        Writes <span className="text-slate-500">(current 7 days)</span>
                      </span>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-2xl font-black font-mono text-white">
                          {thisWeekTotalWrites.toLocaleString()}
                        </span>
                        <span className="text-xs font-mono font-bold text-sky-400">
                          {writesWoWPct >= 0 ? `+${writesWoWPct}%` : `${writesWoWPct}%`}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        Today Writes: {dailyWritesAndDeletes.toLocaleString()} / 20,000 daily limit
                      </span>
                    </div>

                    {/* 7-Day Writes Bar Comparison (This Week vs Last Week) */}
                    <div className="flex items-end gap-1.5 h-28 pt-3 px-1.5 bg-slate-950/60 rounded-lg border border-slate-800/80">
                      {sevenDayTrend.map(pt => {
                        const thisH = Math.max(4, Math.min(100, Math.round((pt.thisWeekWrites / max7dWritesPoint) * 100)));
                        const lastH = Math.max(3, Math.min(100, Math.round((pt.lastWeekWrites / max7dWritesPoint) * 100)));
                        return (
                          <div
                            key={pt.date}
                            className="flex-1 flex flex-col items-center justify-end h-full gap-1"
                            title={`${pt.shortLabel}: This week ${pt.thisWeekWrites} writes vs Last week ${pt.lastWeekWrites} writes`}
                          >
                            <div className="w-full flex items-end justify-center gap-0.5 h-full">
                              <div
                                className="w-1/2 bg-sky-400 rounded-t transition-all"
                                style={{ height: `${thisH}%` }}
                              />
                              <div
                                className="w-1/2 bg-sky-400/30 border-t border-dashed border-sky-300 rounded-t transition-all"
                                style={{ height: `${lastH}%` }}
                              />
                            </div>
                            <span className="text-[8px] font-mono text-slate-400 truncate max-w-full">
                              {pt.shortLabel.replace(' ', '')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 7-Day Day-by-Day Breakdown Mini-Table */}
                <div className="bg-slate-900/80 rounded-xl p-2.5 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-slate-300 font-bold">
                    <span>📊 7-Day Day-by-Day Firestore &amp; Request Record</span>
                    <div className="flex items-center gap-3 font-mono text-[9px]">
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-1 bg-sky-400 inline-block rounded" /> This week
                      </span>
                      <span className="flex items-center gap-1 text-slate-400">
                        <span className="w-2.5 h-1 bg-sky-400/40 border-t border-dashed border-sky-300 inline-block" /> Last week
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center font-mono text-[9px]">
                    {sevenDayTrend.map(d => (
                      <div key={d.date} className="bg-slate-950/90 border border-slate-800 rounded-lg p-1.5">
                        <div className="font-bold text-slate-300">{d.shortLabel}</div>
                        <div className="text-emerald-400 font-black mt-0.5">{d.thisWeekReads} R</div>
                        <div className="text-amber-300 font-bold">{d.thisWeekWrites} W</div>
                        <div className="text-sky-400 text-[8px]">{d.netlifyRequests} req</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Per-Shop & All-Shops Side-by-Side Comparison Table (Daily / Weekly / Monthly / Yearly) */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="font-black text-sm text-slate-900">
                    Store-by-Store &amp; Total Usage Report ({usagePeriod.toUpperCase()} — ہر دکان اور کل مجموعہ)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    کسی بھی دکان کے سامنے &quot;Calibrate 24h&quot; بٹن سے آپ آج کے 24h کاؤنٹر (مثلاً 587 requests / 10.3 MB) کو دستی طور پر بھی سنک کر سکتے ہیں۔
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200">
                    Mode: {isFirebaseOnly ? 'Only Firebase' : 'Netlify + Firebase'}
                  </span>
                  <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
                    Period: {usagePeriod.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Shop / Store Name</th>
                      <th className="py-3 px-4">
                        {usagePeriod === 'daily'
                          ? `${isFirebaseOnly ? 'FB Host' : 'Netlify'} 24h Requests (Web + Fn)`
                          : `${isFirebaseOnly ? 'FB Host' : 'Netlify'} Requests (${usagePeriod})`}
                      </th>
                      <th className="py-3 px-4">Bandwidth &amp; Latency</th>
                      <th className="py-3 px-4">Firebase Reads (Daily Reset)</th>
                      <th className="py-3 px-4">Firebase Writes (Daily Reset)</th>
                      <th className="py-3 px-4 text-right">Action / Sync</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* Pinned Master Row: All Shops Combined */}
                    <tr className="bg-indigo-50/70 font-bold">
                      <td className="py-3 px-4">
                        <div className="font-black text-indigo-950 text-xs flex items-center gap-1.5">
                          <span>🌍 ALL SHOPS COMBINED ({shops.length} Stores)</span>
                        </div>
                        <span className="text-[10px] text-indigo-700 font-semibold">
                          تمام دکانوں کا مجموعی ریکارڈ ({usagePeriod.toUpperCase()})
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <span className="text-sm font-black text-sky-800">
                          {(usagePeriod === 'daily'
                            ? combinedUsageReport.last24h.netlifyTotalRequests
                            : combinedUsageReport[usagePeriod].netlifyTotalRequests
                          ).toLocaleString()}
                        </span>
                        <span className="block text-[10px] text-slate-500">
                          Web:{' '}
                          {(usagePeriod === 'daily'
                            ? combinedUsageReport.last24h.netlifyWebRequests
                            : combinedUsageReport[usagePeriod].netlifyWebRequests
                          ).toLocaleString()}{' '}
                          | Fn:{' '}
                          {(usagePeriod === 'daily'
                            ? combinedUsageReport.last24h.netlifyFunctionCalls
                            : combinedUsageReport[usagePeriod].netlifyFunctionCalls
                          ).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <span className="font-black text-indigo-800">
                          {usagePeriod === 'daily'
                            ? combinedUsageReport.last24h.netlifyBandwidthMB
                            : combinedUsageReport[usagePeriod].netlifyBandwidthMB}{' '}
                          MB
                        </span>
                        <span className="block text-[10px] text-slate-500">
                          p50: {combinedUsageReport.last24h.netlifyDurationP50Sec}s · Err: {combinedUsageReport.last24h.netlifyErrorRatePct}%
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <span className="font-black text-emerald-700">
                          {combinedUsageReport[usagePeriod].firebaseReads.toLocaleString()}
                        </span>
                        <span className="block text-[10px] text-slate-500">
                          7d Console: {(combinedUsageReport.weekly.firebaseReads / 1000).toFixed(1)}K / 50K day
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <span className="font-black text-amber-700">
                          {(
                            combinedUsageReport[usagePeriod].firebaseWrites +
                            combinedUsageReport[usagePeriod].firebaseDeletes
                          ).toLocaleString()}
                        </span>
                        <span className="block text-[10px] text-slate-500">
                          7d Console: {combinedUsageReport.weekly.firebaseWrites + combinedUsageReport.weekly.firebaseDeletes} / 20K day
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedUsageShopId('ALL_SHOPS')}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-black cursor-pointer"
                        >
                          View All History
                        </button>
                      </td>
                    </tr>

                    {/* Individual Shop Rows */}
                    {shopUsageRows.map(row => {
                      const p = row[usagePeriod];
                      const pReq = usagePeriod === 'daily' ? row.last24h : p;
                      const isSelected = selectedUsageShopId === row.shopId;
                      return (
                        <tr
                          key={row.shopId}
                          className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-emerald-50/50' : ''}`}
                        >
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{row.shopName}</div>
                            <div className="text-[10px] text-slate-500">
                              {row.ownerName} ({row.ownerEmail || 'No email'})
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono">
                            <span className="font-black text-slate-900">
                              {pReq.netlifyTotalRequests.toLocaleString()}
                            </span>
                            <span className="block text-[10px] text-slate-500">
                              Web: {pReq.netlifyWebRequests.toLocaleString()} | Fn: {pReq.netlifyFunctionCalls.toLocaleString()}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono">
                            <span className="font-bold text-slate-800">{pReq.netlifyBandwidthMB} MB</span>
                            <span className="block text-[10px] text-slate-400">
                              p50: {row.last24h.netlifyDurationP50Sec}s
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono">
                            <span className="font-bold text-emerald-700">{p.firebaseReads.toLocaleString()}</span>
                            <span className="block text-[10px] text-slate-400">
                              7d: {row.weekly.firebaseReads >= 1000 ? `${(row.weekly.firebaseReads / 1000).toFixed(1)}K` : row.weekly.firebaseReads}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono">
                            <span className="font-bold text-amber-700">
                              {(p.firebaseWrites + p.firebaseDeletes).toLocaleString()}
                            </span>
                            <span className="block text-[10px] text-slate-400">
                              7d: {row.weekly.firebaseWrites + row.weekly.firebaseDeletes}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedUsageShopId(row.shopId)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border cursor-pointer ${
                                  isSelected
                                    ? 'bg-emerald-600 text-white border-emerald-700'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                                }`}
                              >
                                {isSelected ? 'Selected' : 'Select Shop'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setCalibrateModalShop(row);
                                  setCalWebReq(String(row.daily.netlifyWebRequests || 375));
                                  setCalFnReq(String(row.daily.netlifyFunctionCalls || 37));
                                  setCalBwMb(String(row.daily.netlifyBandwidthMB || 8.4));
                                  setCalFbReads(String(row.daily.firebaseReads || 712));
                                  setCalFbWrites(String(row.daily.firebaseWrites || 29));
                                }}
                                className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-[10px] font-bold cursor-pointer"
                                title="Calibrate today's usage with Netlify 24h & Firebase console counters"
                              >
                                Calibrate 24h
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Day-by-Day (31 Days) & Month-by-Month (12 Months) Permanent History Ledger */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-black text-sm text-slate-900">
                    Permanent Historical Ledger — {activeUsageReport.shopName}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Netlify صرف 24 گھنٹے اور Firebase صرف 7/30 دن دکھاتا ہے، لیکن یہاں آپ کا روزانہ اور ماہانہ ریکارڈ ہمیشہ کے لیے محفوظ رہتا ہے۔
                  </p>
                </div>

                <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setHistoryViewMode('daily')}
                    className={`px-3 py-1 rounded-lg text-[11px] font-black cursor-pointer transition-all ${
                      historyViewMode === 'daily'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Daily History (آخری 31 دن — FB Daily Reset Record)
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryViewMode('monthly')}
                    className={`px-3 py-1 rounded-lg text-[11px] font-black cursor-pointer transition-all ${
                      historyViewMode === 'monthly'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Monthly History (12 مہینے — Netlify Monthly Quota Record)
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">{historyViewMode === 'daily' ? 'Date (تاریخ)' : 'Month (مہینہ)'}</th>
                      <th className="py-2.5 px-4">{isFirebaseOnly ? 'FB Hosting Requests' : 'Netlify Total Requests'}</th>
                      <th className="py-2.5 px-4">Bandwidth</th>
                      <th className="py-2.5 px-4">Firebase Reads</th>
                      <th className="py-2.5 px-4">Firebase Writes</th>
                      <th className="py-2.5 px-4">Total Firebase Ops</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {historyViewMode === 'daily' ? (
                      activeUsageReport.dailyHistory.length > 0 ? (
                        activeUsageReport.dailyHistory.map(item => (
                          <tr key={item.date} className="hover:bg-slate-50">
                            <td className="py-2.5 px-4 font-bold text-slate-900">{item.date}</td>
                            <td className="py-2.5 px-4 text-sky-700 font-bold">
                              {item.metrics.netlifyTotalRequests.toLocaleString()}{' '}
                              <span className="text-[10px] text-slate-400 font-normal">
                                (Web: {item.metrics.netlifyWebRequests}, Fn: {item.metrics.netlifyFunctionCalls})
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-indigo-700 font-bold">{item.metrics.netlifyBandwidthMB} MB</td>
                            <td className="py-2.5 px-4 text-emerald-700 font-bold">{item.metrics.firebaseReads.toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-amber-700 font-bold">
                              {(item.metrics.firebaseWrites + item.metrics.firebaseDeletes).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-4 text-slate-800 font-black">{item.metrics.firebaseTotalOps.toLocaleString()}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-slate-400 font-sans">
                            No daily history recorded yet.
                          </td>
                        </tr>
                      )
                    ) : activeUsageReport.monthlyHistory.length > 0 ? (
                      activeUsageReport.monthlyHistory.map(item => (
                        <tr key={item.month} className="hover:bg-slate-50">
                          <td className="py-2.5 px-4 font-bold text-slate-900">{item.month}</td>
                          <td className="py-2.5 px-4 text-sky-700 font-bold">
                            {item.metrics.netlifyTotalRequests.toLocaleString()}{' '}
                            <span className="text-[10px] text-slate-400 font-normal">
                              (Web: {item.metrics.netlifyWebRequests}, Fn: {item.metrics.netlifyFunctionCalls})
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-indigo-700 font-bold">{item.metrics.netlifyBandwidthMB} MB</td>
                          <td className="py-2.5 px-4 text-emerald-700 font-bold">{item.metrics.firebaseReads.toLocaleString()}</td>
                          <td className="py-2.5 px-4 text-amber-700 font-bold">
                            {(item.metrics.firebaseWrites + item.metrics.firebaseDeletes).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-4 text-slate-800 font-black">{item.metrics.firebaseTotalOps.toLocaleString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400 font-sans">
                          No monthly history recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Calibrate 24h Usage Modal */}
            {calibrateModalShop && (
              <div
                className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4"
                onClick={() => setCalibrateModalShop(null)}
              >
                <div
                  className="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl border border-slate-200 space-y-4"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h4 className="font-black text-sm text-slate-900">
                        Sync / Calibrate Today&apos;s Usage (آج کا کاؤنٹر ملائیں)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {calibrateModalShop.shopName}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCalibrateModalShop(null)}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <form onSubmit={handleSaveCalibration} className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                          Today Netlify Web Requests
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={calWebReq}
                          onChange={e => setCalWebReq(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                          Today Function Calls
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={calFnReq}
                          onChange={e => setCalFnReq(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                          Bandwidth (MB)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={calBwMb}
                          onChange={e => setCalBwMb(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                          Firebase Reads
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={calFbReads}
                          onChange={e => setCalFbReads(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                          Firebase Writes
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={calFbWrites}
                          onChange={e => setCalFbWrites(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setCalibrateModalShop(null)}
                        className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingCalibration}
                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-md cursor-pointer"
                      >
                        {isSavingCalibration ? 'Saving...' : 'Save & Sync Counter'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* TAB 2: ALL MODULES & PERMISSIONS LOCK / UNLOCK MATRIX                     */}
      {/* ========================================================================= */}
      {activeTab === 'modules' && (
        <div className="space-y-4">
          {!isFirebaseMasterVerified && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-2.5 text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-black">Cloud Write Verification Required (Master Google Auth)</div>
                  <p className="text-[11px] text-amber-800 mt-0.5 leading-snug">
                    Aap Email/Password se login hain. Tamam shops par Global/Per-Shop Lock &amp; Unlock real-time sync karne ke liye 1-click Master Google verification zaroori hai.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleVerifyMasterGoogleCloudAuth}
                disabled={isVerifyingCloudAuth}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-xl text-xs font-black shrink-0 cursor-pointer transition-all shadow-xs"
              >
                {isVerifyingCloudAuth ? 'Verifying...' : '🔐 Verify Cloud Auth (Google)'}
              </button>
            </div>
          )}

          {moduleSaveBanner && (
            <div
              className={`p-3 text-white rounded-2xl text-xs font-bold flex items-center justify-between shadow-md animate-in fade-in ${
                moduleSaveStatus === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
              }`}
            >
              <span>{moduleSaveBanner}</span>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono shrink-0 ml-2">
                {moduleSaveStatus === 'error' ? 'SYNC FAILED' : 'LIVE CLOUD SYNCED'}
              </span>
            </div>
          )}

          {/* Target Selector: Global vs Specific Store */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 overflow-hidden">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="leading-snug">Permissions &amp; Modules Master Control (Lock / Unlock)</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed" dir="rtl">
                ہر آپشن کو لاک (🔒 Locked) یا ان لاک (🔓 Unlocked) کریں۔ لاک ہونے والا آپشن غائب نہیں ہوگا بلکہ مینو میں لاک آئیکن کے ساتھ نظر آئے گا۔
              </p>
            </div>

            <div className="w-full lg:w-auto flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
              <select
                value={selectedShopForModules}
                onChange={e => setSelectedShopForModules(e.target.value)}
                className="w-full sm:w-64 max-w-full min-w-0 truncate px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-600"
              >
                <option value="GLOBAL">🌐 All Stores (Global Platform Lock/Unlock)</option>
                {shops.map(s => (
                  <option key={s.id} value={s.id}>
                    🏪 {s.shop_name} ({s.owner_email || s.id.slice(0, 10)})
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto shrink-0">
                <button
                  type="button"
                  onClick={() => handleEnableAllModules(false)}
                  className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center justify-center gap-1"
                >
                  <Unlock className="w-3.5 h-3.5 shrink-0" />
                  <span>Unlock All</span>
                </button>

                <button
                  type="button"
                  onClick={handleLockAllModules}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center justify-center gap-1"
                >
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Lock All</span>
                </button>
              </div>
            </div>
          </div>

          {/* 11 Core POS Modules Grid (Lock / Unlock Buttons) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ALL_CONTROLLABLE_MODULES.map(mod => {
              const isGlobalEnabled = moduleConfig.globalModules[mod.id] !== false;
              const shopOverrides =
                selectedShopForModules !== 'GLOBAL'
                  ? moduleConfig.shopOverrides[selectedShopForModules]
                  : undefined;
              const isUnlocked =
                selectedShopForModules === 'GLOBAL'
                  ? isGlobalEnabled
                  : typeof shopOverrides?.[mod.id] === 'boolean'
                  ? shopOverrides[mod.id]!
                  : isGlobalEnabled;

              return (
                <div
                  key={mod.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 min-w-0 ${
                    isUnlocked
                      ? 'bg-white border-slate-200/90 shadow-xs'
                      : 'bg-rose-50/40 border-rose-200/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {isUnlocked ? (
                          <Unlock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <Lock className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        )}
                        <h3 className="font-black text-xs text-slate-900 truncate">{mod.label}</h3>
                      </div>
                      <span className="text-[11px] font-bold text-indigo-600 block mt-0.5 truncate">
                        {mod.urduLabel}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        {mod.description}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleModule(mod.id, false)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1.5 shrink-0 cursor-pointer transition-all border ${
                        isUnlocked
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-xs'
                          : 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700 shadow-xs'
                      }`}
                      title={isUnlocked ? 'Click to Lock Option' : 'Click to Unlock Option'}
                    >
                      {isUnlocked ? (
                        <>
                          <Unlock className="w-3.5 h-3.5" />
                          <span>Unlocked</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Locked</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between flex-wrap gap-1.5 pt-2 border-t border-slate-100 text-[10px]">
                    <span className="font-mono text-slate-400">ID: {mod.id}</span>
                    <span
                      className={`px-2 py-0.5 rounded font-bold uppercase flex items-center gap-1 ${
                        isUnlocked
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {isUnlocked ? '🔓 Unlocked (Open)' : '🔒 Locked (Visible & Locked)'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Store Admin / Manager / Staff Role Permissions Lock/Unlock Control inside Super Admin */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-4 overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="min-w-0 flex-1">
                <h3 className="font-black text-sm text-slate-900 flex items-center gap-2 flex-wrap">
                  <Lock className="w-4 h-4 text-purple-600 shrink-0" />
                  <span className="leading-snug">
                    Store Users &amp; Manager Role Permissions (Lock / Unlock) —{' '}
                    <span className="text-purple-700">
                      {selectedShopForModules === 'GLOBAL'
                        ? currentShop?.shop_name || shops[0]?.shop_name || 'Current Store'
                        : shops.find(s => s.id === selectedShopForModules)?.shop_name || selectedShopForModules}
                    </span>
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed" dir="rtl">
                  سپر ایڈمن بھی یہاں سے کسی بھی دکان کے مینیجر (Manager)، کیشیئر (Cashier) یا سیلزمین (Salesman) کے تمام آپشنز کو لاک (🔒) یا ان لاک (🔓) کر سکتا ہے۔
                </p>
              </div>

              <div className="grid grid-cols-3 sm:flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-full lg:w-auto shrink-0">
                {(['manager', 'cashier', 'salesman'] as const).map(role => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setSelectedStaffRoleTarget(role)}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-black uppercase transition-all cursor-pointer text-center ${
                      selectedStaffRoleTarget === role
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
              {ALL_STAFF_CONTROLLABLE_MODULES.map(mod => {
                const isUnlocked =
                  shopStaffPermConfig.rolePermissions[selectedStaffRoleTarget]?.modules?.[mod.id] !== false;
                return (
                  <div
                    key={mod.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-2 min-w-0 ${
                      isUnlocked
                        ? 'bg-slate-50/70 border-slate-200'
                        : 'bg-rose-50/50 border-rose-200'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-slate-900 block truncate">{mod.label}</span>
                      <span className="text-[10px] font-bold text-purple-600 block truncate">
                        {mod.urduLabel}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleShopStaffRoleModule(mod.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 shrink-0 cursor-pointer border ${
                        isUnlocked
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                          : 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700'
                      }`}
                    >
                      {isUnlocked ? (
                        <>
                          <Unlock className="w-3 h-3" />
                          <span>Unlocked</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3 h-3" />
                          <span>Locked</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100">
              <span className="text-[11px] font-black text-slate-700 uppercase block mb-2">
                {selectedStaffRoleTarget.toUpperCase()} Action Permissions (Add / Edit / Delete):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                {ALL_STAFF_CONTROLLABLE_ACTIONS.map(act => {
                  const isUnlocked =
                    shopStaffPermConfig.rolePermissions[selectedStaffRoleTarget]?.actions?.[act.id] !== false;
                  return (
                    <div
                      key={act.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-2 min-w-0 ${
                        isUnlocked
                          ? 'bg-slate-50/70 border-slate-200'
                          : 'bg-rose-50/50 border-rose-200'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-slate-900 block truncate">{act.label}</span>
                        <span className="text-[10px] font-bold text-indigo-600 block truncate">
                          {act.urduLabel}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleShopStaffRoleAction(act.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 shrink-0 cursor-pointer border ${
                          isUnlocked
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                            : 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700'
                        }`}
                      >
                        {isUnlocked ? (
                          <>
                            <Unlock className="w-3 h-3" />
                            <span>Unlocked</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3 h-3" />
                            <span>Locked</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Data Update Delay Time & Loading Wheel Master Control (All Accounts) */}
          <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-950 text-white rounded-2xl p-5 border border-indigo-500/30 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3.5">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 shrink-0 mt-0.5">
                  <RefreshCw className="w-5 h-5 animate-spin" style={{ animationDuration: '3s' }} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-black text-sm text-white">
                      Data Update Delayed Time &amp; Loading Wheel (All Accounts)
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-black uppercase">
                      Active: {((moduleConfig.featurePermissions.dataUpdateDelayMs ?? 1000) / 1000).toFixed(1)}s
                    </span>
                  </div>
                  <p className="text-[11px] text-indigo-200/80 mt-0.5 leading-relaxed">
                    جب کوئی بھی اینٹری شامل (Add)، تبدیل (Edit) یا ڈیلیٹ (Delete) کی جائے تو مقررہ وقت تک لوڈنگ وھیل (Loading Wheel) نظر آئے گا تاکہ یوزر کو واضح پتہ چلے کہ ڈیٹا اپڈیٹ ہو گیا ہے۔ (Default: 1.0 sec)
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const activeMs = moduleConfig.featurePermissions.dataUpdateDelayMs ?? 1000;
                  triggerMutationLoader(
                    'edit',
                    'سپر ایڈمن ٹیسٹ: ڈیٹا اپڈیٹ لوڈنگ وھیل چیک ہو رہا ہے...',
                    'Super Admin Test: Verifying Loading Wheel & Delay...',
                    Math.max(500, activeMs)
                  );
                }}
                className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer shrink-0 self-start sm:self-center active:scale-95 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Test Loading Wheel</span>
              </button>
            </div>

            {/* Preset Buttons & Custom Slider */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-indigo-200 block">
                  Quick Delay Presets (کم یا زیادہ کریں - تمام اکاؤنٹس کیلئے):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: '0.5 sec', ms: 500 },
                    { label: '1.0 sec (Default)', ms: 1000 },
                    { label: '1.5 sec', ms: 1500 },
                    { label: '2.0 sec', ms: 2000 },
                    { label: '3.0 sec', ms: 3000 },
                    { label: '5.0 sec', ms: 5000 },
                    { label: '0s (Instant)', ms: 0 }
                  ].map(preset => {
                    const currentMs = moduleConfig.featurePermissions.dataUpdateDelayMs ?? 1000;
                    const isSelected = currentMs === preset.ms;
                    return (
                      <button
                        key={preset.ms}
                        type="button"
                        onClick={() => handleUpdateDelayTime(preset.ms)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-500 text-white border-indigo-300 shadow-md shadow-indigo-500/30'
                            : 'bg-slate-800/90 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300">
                    Fine-Tune Delay Slider (0.0s — 10.0s):
                  </span>
                  <span className="font-mono font-black text-sm text-amber-400">
                    {((moduleConfig.featurePermissions.dataUpdateDelayMs ?? 1000) / 1000).toFixed(1)} sec ({moduleConfig.featurePermissions.dataUpdateDelayMs ?? 1000} ms)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateDelayTime(
                        Math.max(0, (moduleConfig.featurePermissions.dataUpdateDelayMs ?? 1000) - 500)
                      )
                    }
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-black border border-slate-700 cursor-pointer"
                    title="Decrease by 0.5 sec"
                  >
                    -0.5s
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={10000}
                    step={100}
                    value={moduleConfig.featurePermissions.dataUpdateDelayMs ?? 1000}
                    onChange={e => handleUpdateDelayTime(Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateDelayTime(
                        Math.min(10000, (moduleConfig.featurePermissions.dataUpdateDelayMs ?? 1000) + 500)
                      )
                    }
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-black border border-slate-700 cursor-pointer"
                    title="Increase by 0.5 sec"
                  >
                    +0.5s
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Platform Feature & Function Permissions (Lock / Unlock Buttons) */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h3 className="font-black text-sm text-slate-900">
                  Global Function &amp; Security Permissions (Lock / Unlock)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Control multi-user registration, staff creation, data export, SQL imports, and password policies via Lock / Unlock.
                </p>
              </div>
              {isFirebaseMasterVerified ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black shrink-0 self-start sm:self-auto">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Cloud Sync Active</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleVerifyMasterGoogleCloudAuth}
                  disabled={isVerifyingCloudAuth}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black shrink-0 self-start sm:self-auto cursor-pointer shadow-xs"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{isVerifyingCloudAuth ? 'Verifying...' : 'Verify Gmail to Sync Cloud'}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {[
                {
                  key: 'allowShopSignup' as const,
                  title: 'Allow New Shop Sign Up',
                  desc: 'Allow new store owners to register accounts from the Login screen'
                },
                {
                  key: 'allowStaffCreation' as const,
                  title: 'Allow Staff Account Creation',
                  desc: 'Allow store owners to create NH- cashier, manager & salesman accounts'
                },
                {
                  key: 'allowStaffDeleteTransactions' as const,
                  title: 'Allow Staff Record Deletion',
                  desc: 'Permit non-owner staff to delete transactions into Trash'
                },
                {
                  key: 'allowDataExport' as const,
                  title: 'Allow JSON Data Backup / Export',
                  desc: 'Allow store admins to download local JSON backups from Sidebar'
                },
                {
                  key: 'allowSqlImport' as const,
                  title: 'Allow Smart SQL Dump Import',
                  desc: 'Allow store admins to import .sql database files'
                },
                {
                  key: 'requireStrongPasswords' as const,
                  title: 'Enforce 6+ Char Passwords & PBKDF2',
                  desc: 'Require minimum 6-character passwords hashed via Server Core'
                }
              ].map(item => {
                const enabled = moduleConfig.featurePermissions[item.key];
                return (
                  <div
                    key={item.key}
                    className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 min-w-0 ${
                      enabled
                        ? 'border-slate-200 bg-slate-50/70'
                        : 'border-rose-200 bg-rose-50/40'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-slate-900 block leading-snug">{item.title}</span>
                      <span className="text-[10px] text-slate-500 leading-tight block mt-0.5">
                        {item.desc}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTogglePermission(item.key)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1 shrink-0 cursor-pointer transition-all border ${
                        enabled
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-xs'
                          : 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700 shadow-xs'
                      }`}
                    >
                      {enabled ? (
                        <>
                          <Unlock className="w-3.5 h-3.5" />
                          <span>Unlocked</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Locked</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: SYSTEM DIAGNOSTICS & END-TO-END MODULE TESTER                      */}
      {/* ========================================================================= */}
      {activeTab === 'diagnostics' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-600" />
                <span>Automated System &amp; Module Verification Suite</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Tests Netlify Functions (`authCore.js`), PBKDF2 hashing, Super Admin JWT, OTP HMAC challenges, and all POS modules.
              </p>
            </div>

            <button
              type="button"
              onClick={handleRunDiagnostics}
              disabled={isRunningDiag}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-indigo-600/20 cursor-pointer self-start sm:self-auto"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isRunningDiag ? 'Running Full Checks...' : 'Run All Module Tests Now'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {diagResults.map(res => (
              <div
                key={res.moduleId}
                className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-start justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {res.status === 'passed' ? (
                      <span className="p-1 rounded-lg bg-emerald-100 text-emerald-700">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="p-1 rounded-lg bg-amber-100 text-amber-700">
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <h3 className="font-black text-xs text-slate-900">{res.moduleName}</h3>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed pl-7">{res.details}</p>
                </div>

                <div className="text-right shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      res.status === 'passed'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {res.status}
                  </span>
                  <span className="block text-[10px] font-mono text-slate-400 mt-1">
                    {res.latencyMs} ms
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: LIVE DATABASE & AUDIT LOGS                                         */}
      {/* ========================================================================= */}
      {activeTab === 'analytics' && (
        <div className="space-y-4">
          {/* Platform Analytics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] text-slate-500 font-bold block uppercase">Registered Shops</span>
              <div className="text-2xl font-black font-mono text-slate-900 mt-1">
                {metrics?.totalShops || shops.length}
              </div>
              <span className="text-[10px] text-emerald-600 font-semibold">100% Multi-Tenant Isolated</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] text-slate-500 font-bold block uppercase">Active Stores</span>
              <div className="text-2xl font-black font-mono text-emerald-600 mt-1">
                {metrics?.activeShopsCount || shops.filter(s => s.is_active).length}
              </div>
              <span className="text-[10px] text-slate-500 font-medium">Real-time operation ready</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] text-slate-500 font-bold block uppercase">Database Health</span>
              <div className="text-base font-black text-indigo-600 mt-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span>Cloud Synced</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                Status: {firebaseSyncStatus}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] text-slate-500 font-bold block uppercase">Live Audit Events</span>
              <div className="text-2xl font-black font-mono text-slate-900 mt-1">{auditLogs.length}</div>
              <span className="text-[10px] text-slate-500 font-semibold">Multi-store activity feed</span>
            </div>
          </div>

          {/* Audit Logs Filter Bar */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-600">Filter Severity:</span>
              <div className="flex gap-1">
                {(['all', 'info', 'warn'] as const).map(sev => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSelectedSeverity(sev)}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] uppercase transition-colors cursor-pointer ${
                      selectedSeverity === sev
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-slate-500 text-[11px]">
              Showing <b className="text-slate-800 font-mono">{filteredLogs.length}</b> live events
            </div>
          </div>

          {/* Real-time Audit Logs Stream */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-black text-sm text-slate-800 flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
                <span>Live System Audit Log Stream (All Stores)</span>
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">Auto-refreshed</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {filteredLogs.length > 0 ? (
                filteredLogs.map(log => (
                  <div
                    key={log.id}
                    className="p-3.5 hover:bg-slate-50/80 transition-colors text-xs flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                            log.severity === 'warn'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-indigo-100 text-indigo-900'
                          }`}
                        >
                          {log.action}
                        </span>
                        <span className="font-bold text-slate-900">{log.shop_name}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-600">
                          By {log.user_name} ({log.user_role})
                        </span>
                      </div>
                      <p className="text-slate-600 text-[11px] font-medium leading-relaxed">{log.details}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono text-[10px] text-slate-400 flex items-center gap-1 justify-end">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </span>
                      <span className="text-[9px] text-slate-400 block mt-0.5 font-mono">
                        {new Date(log.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No audit logs recorded for this criteria.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: SECURITY & MASTER AUTH                                             */}
      {/* ========================================================================= */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Master Key Configuration Box */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-sm text-slate-900">Master Secret Security Key</h3>
                <p className="text-[11px] text-slate-500">
                  Synced with Netlify Server Core (`authCore.js`) &amp; Firebase Cloud Functions ready
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/70 text-xs space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-500 uppercase font-bold">
                  Authorized Master Emails
                </span>
                <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded">
                  Server Protected
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {MASTER_SUPER_ADMIN_EMAILS.map(email => (
                  <span
                    key={email}
                    className="px-2 py-0.5 bg-white border border-slate-200 rounded-md font-mono text-[10px] text-slate-700 font-semibold"
                  >
                    {email}
                  </span>
                ))}
              </div>
            </div>

            <form onSubmit={handleUpdateSecretKey} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  New Master Secret Key (Minimum 6 characters)
                </label>
                <input
                  type="text"
                  value={newSecretKey}
                  onChange={e => setNewSecretKey(e.target.value)}
                  placeholder="e.g. NH-MASTER-2026-X"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs font-bold focus:outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              {secretUpdateMsg && (
                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold text-[11px]">
                  {secretUpdateMsg}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-xs transition-all active:scale-[0.98] cursor-pointer"
              >
                Save New Master Secret Key
              </button>
            </form>
          </div>

          {/* Global Broadcast & Maintenance Control */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
              <div className="p-2 rounded-xl bg-orange-50 text-orange-600">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-sm text-slate-900">Global System Maintenance Broadcast</h3>
                <p className="text-[11px] text-slate-500">
                  Lock cashier mutations across all stores during server updates
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50">
              <div>
                <span className="font-bold text-xs text-slate-800 block">Maintenance Lockdown</span>
                <span className="text-[11px] text-slate-500">
                  {isMaintenanceMode ? 'Currently active across all shops' : 'Normal operations running'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => toggleMaintenanceMode()}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  isMaintenanceMode ? 'bg-orange-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isMaintenanceMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Broadcasted Maintenance Message:
              </label>
              <textarea
                rows={3}
                value={maintenanceNotice}
                onChange={e => setMaintenanceNotice(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:border-indigo-500"
                placeholder="Enter alert message displayed on all cashier screens..."
              />
            </div>

            {/* Quick Data Update Delay Control inside Master Security Tab as well */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-black text-xs text-slate-800 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Data Update Delay &amp; Loading Wheel:</span>
                </span>
                <span className="font-mono font-black text-xs text-indigo-600">
                  {((moduleConfig.featurePermissions.dataUpdateDelayMs ?? 1000) / 1000).toFixed(1)} sec
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[500, 1000, 1500, 2000, 3000].map(ms => (
                  <button
                    key={ms}
                    type="button"
                    onClick={() => handleUpdateDelayTime(ms)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                      (moduleConfig.featurePermissions.dataUpdateDelayMs ?? 1000) === ms
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {(ms / 1000).toFixed(1)}s{ms === 1000 ? ' (Default)' : ''}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Store Inspection Modal */}
      {inspectShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                <h3 className="font-black text-base text-slate-900">{inspectShop.shop_name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectShop(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Owner Name</span>
                <span className="font-bold text-slate-800">{inspectShop.owner_name}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Owner Email</span>
                <span className="font-bold text-slate-800 font-mono truncate block">
                  {inspectShop.owner_email || 'None'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Unique Shop ID</span>
                <span className="font-mono text-[10px] text-slate-600 truncate block">{inspectShop.id}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Operating Status</span>
                <span className={`font-bold ${inspectShop.is_active ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {inspectShop.is_active ? 'Active & Running' : 'Suspended'}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setInspectShop(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => superAdminService.exportShopBackup(inspectShop.id, inspectShop.shop_name)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Full Backup</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Store Owner Password Reset Modal */}
      {resetPassShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-600" />
                <div>
                  <h3 className="font-black text-sm text-slate-900">Reset Store Owner Password</h3>
                  <p className="text-[11px] text-slate-500">{resetPassShop.shop_name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetPassShop(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResetOwnerPassword} className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Target Owner Email</span>
                <span className="font-mono font-bold text-slate-800">
                  {resetPassShop.owner_email || resetPassShop.id}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  New Shop Password (Min 6 characters, PBKDF2 Encrypted)
                </label>
                <input
                  type="text"
                  value={newOwnerPassword}
                  onChange={e => setNewOwnerPassword(e.target.value)}
                  placeholder="Enter new password for store owner..."
                  required
                  minLength={6}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs font-bold focus:outline-none focus:border-indigo-600 focus:bg-white"
                />
              </div>

              {resetPassFeedback && (
                <div
                  className={`p-3 rounded-xl font-bold text-[11px] border space-y-2.5 ${
                    resetPassFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-rose-50 border-rose-300 text-rose-800'
                  }`}
                >
                  <div>{resetPassFeedback.text}</div>

                  {resetPassFeedback.type === 'success' && lastSavedPassword && (
                    <div className="pt-2 border-t border-emerald-200 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const msg = `NH POS Shop Password Reset:\nShop: ${resetPassShop.shop_name}\nEmail: ${
                            resetPassShop.owner_email || resetPassShop.id
                          }\nNew Password: ${lastSavedPassword}`;
                          navigator.clipboard?.writeText(msg);
                          setCopiedResetCreds(true);
                          setTimeout(() => setCopiedResetCreds(false), 2500);
                        }}
                        className="px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        {copiedResetCreds ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedResetCreds ? 'Copied Details!' : 'Copy New Password'}</span>
                      </button>

                      <a
                        href={`https://wa.me/${
                          resetPassShop.phone
                            ? resetPassShop.phone.replace(/[^0-9]/g, '').replace(/^0/, '92')
                            : ''
                        }?text=${encodeURIComponent(
                          `السلام علیکم! آپ کے NH POS Shop اکاؤنٹ کا پاس ورڈ ری سیٹ کر دیا گیا ہے۔\n\nدکان: ${
                            resetPassShop.shop_name
                          }\nای میل: ${
                            resetPassShop.owner_email || resetPassShop.id
                          }\nنیا پاس ورڈ: ${lastSavedPassword}\n\nاب آپ اس نئے پاس ورڈ سے لاگ ان کر سکتے ہیں۔`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Send via WhatsApp</span>
                      </a>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setResetPassShop(null);
                    setResetPassFeedback(null);
                    setLastSavedPassword('');
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isResettingPass}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-bold text-xs rounded-xl shadow-sm cursor-pointer"
                >
                  {isResettingPass ? 'Encrypting & Saving...' : 'Confirm Password Reset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sticky Bottom Cloud Sync Toast (Always visible even when scrolled down to Global Permissions!) */}
      {(moduleSaveBanner || hasUnsyncedCloudChanges) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-lg animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div
            className={`p-3.5 rounded-2xl shadow-2xl border text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
              hasUnsyncedCloudChanges || moduleSaveStatus === 'error'
                ? 'bg-rose-600 border-rose-400/50'
                : 'bg-emerald-600 border-emerald-400/50'
            }`}
          >
            <div className="text-xs font-bold leading-snug">
              {hasUnsyncedCloudChanges && !isFirebaseMasterVerified
                ? '⚠️ Lock/Unlock abhi sirf is phone par save hua hai — sab phones par live karne ke liye Master Gmail verify karein!'
                : moduleSaveBanner}
            </div>
            {hasUnsyncedCloudChanges && !isFirebaseMasterVerified && (
              <button
                type="button"
                onClick={handleVerifyMasterGoogleCloudAuth}
                disabled={isVerifyingCloudAuth}
                className="px-3 py-1.5 bg-white text-rose-700 hover:bg-rose-50 font-black text-[11px] rounded-xl shrink-0 cursor-pointer shadow-xs"
              >
                {isVerifyingCloudAuth ? 'Verifying...' : '🔐 Verify & Sync Now'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
