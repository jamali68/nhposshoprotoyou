/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
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

  // 5-Tab Master Command Center
  const [activeTab, setActiveTab] = useState<'shops' | 'modules' | 'diagnostics' | 'analytics' | 'security'>('shops');

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

  // Toggle Store Status (Unlocked / Locked)
  const handleToggleStatus = async (shop: TenantShopInfo) => {
    const nextStatus = !shop.is_active;
    const success = await superAdminService.setShopStatus(shop.id, nextStatus);
    if (success) {
      setShops(prev => prev.map(s => (s.id === shop.id ? { ...s, is_active: nextStatus } : s)));
      setModuleConfig(superAdminService.getModuleControlConfig());
    }
  };

  // Toggle Module Lock / Unlock Globally or Per-Shop
  const handleToggleModule = async (moduleId: ControllableModuleId) => {
    const updated: PlatformModuleControlConfig = {
      ...moduleConfig,
      globalModules: { ...moduleConfig.globalModules },
      shopOverrides: { ...moduleConfig.shopOverrides },
      updatedBy: currentUser?.email || MASTER_EMAIL
    };

    if (selectedShopForModules === 'GLOBAL') {
      updated.globalModules[moduleId] = !(updated.globalModules[moduleId] !== false);
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
    await superAdminService.saveModuleControlConfig(updated);
    setModuleSaveBanner('✓ Permission Lock / Unlock status saved and synced across all devices!');
    setTimeout(() => setModuleSaveBanner(null), 3000);
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
    await superAdminService.saveModuleControlConfig(updated);
    setModuleSaveBanner('✓ Platform security & feature Lock / Unlock updated!');
    setTimeout(() => setModuleSaveBanner(null), 3000);
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
    await superAdminService.saveShopStaffPermissions(targetShopIdForStaffPerms, updated);
    setModuleSaveBanner(
      `✓ ${selectedStaffRoleTarget.toUpperCase()} module (${moduleId}) ${
        !isCurrentlyUnlocked ? 'UNLOCKED 🔓' : 'LOCKED 🔒'
      }!`
    );
    setTimeout(() => setModuleSaveBanner(null), 3000);
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
    await superAdminService.saveShopStaffPermissions(targetShopIdForStaffPerms, updated);
    setModuleSaveBanner(
      `✓ ${selectedStaffRoleTarget.toUpperCase()} action (${actionId}) ${
        !isCurrentlyUnlocked ? 'UNLOCKED 🔓' : 'LOCKED 🔒'
      }!`
    );
    setTimeout(() => setModuleSaveBanner(null), 3000);
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
    await superAdminService.setDataUpdateDelayMs(clampedMs);
    setModuleSaveBanner(
      `✓ Data Update Delay Time set to ${(clampedMs / 1000).toFixed(1)} sec (${clampedMs} ms) for ALL accounts!`
    );
    setTimeout(() => setModuleSaveBanner(null), 3000);
  };

  // Unlock All / Lock All Modules
  const handleEnableAllModules = async () => {
    const updated: PlatformModuleControlConfig = {
      ...moduleConfig,
      globalModules: { ...moduleConfig.globalModules },
      shopOverrides: { ...moduleConfig.shopOverrides },
      updatedBy: currentUser?.email || MASTER_EMAIL
    };
    ALL_CONTROLLABLE_MODULES.forEach(m => {
      updated.globalModules[m.id] = true;
    });
    if (selectedShopForModules !== 'GLOBAL') {
      delete updated.shopOverrides[selectedShopForModules];
    }
    setModuleConfig(updated);
    await superAdminService.saveModuleControlConfig(updated);
    setModuleSaveBanner('✓ All modules UNLOCKED (🔓)!');
    setTimeout(() => setModuleSaveBanner(null), 3000);
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
    } else {
      const shopOverrides = { ...(updated.shopOverrides[selectedShopForModules] || {}) };
      ALL_CONTROLLABLE_MODULES.forEach(m => {
        shopOverrides[m.id] = false;
      });
      updated.shopOverrides[selectedShopForModules] = shopOverrides;
    }
    setModuleConfig(updated);
    await superAdminService.saveModuleControlConfig(updated);
    setModuleSaveBanner('🔒 All controllable modules LOCKED (Visible with Lock icon)!');
    setTimeout(() => setModuleSaveBanner(null), 3000);
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
    <div className="space-y-4 pb-12 animate-in fade-in duration-150">
      {/* Top Super Admin Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveView('dashboard')}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer"
            title="Return to Shop POS"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-1.5">
                <span>Super Admin Command Center</span>
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 font-bold uppercase">
                Lock / Unlock Master Control
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
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

      {/* 5-Tab Master Navigation Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 bg-slate-900/95 p-1.5 rounded-2xl border border-slate-800 shadow-sm text-xs font-bold">
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
          <Activity className="w-4 h-4 shrink-0" />
          <span className="truncate">Audit Logs</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('security')}
          className={`col-span-2 sm:col-span-1 py-2.5 px-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
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
          {moduleSaveBanner && (
            <div className="p-3 bg-emerald-600 text-white rounded-2xl text-xs font-bold flex items-center justify-between shadow-md animate-in fade-in">
              <span>{moduleSaveBanner}</span>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono">LIVE SYNCED</span>
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
                  onClick={handleEnableAllModules}
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

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {ALL_CONTROLLABLE_MODULES.map(mod => {
                const isUnlocked = moduleConfig.globalModules[mod.id] !== false;
                return (
                  <div
                    key={mod.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition-all ${
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
                      onClick={() => handleToggleModule(mod.id)}
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
                    <th className="py-3 px-4">Created Date</th>
                    <th className="py-3 px-4 text-center">Store Access (Lock/Unlock)</th>
                    <th className="py-3 px-4 text-right">Master Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredShops.length > 0 ? (
                    filteredShops.map(shop => (
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

                        <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                          {shop.created_at ? new Date(shop.created_at).toLocaleDateString() : 'Active'}
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
                    ))
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
      {/* TAB 2: ALL MODULES & PERMISSIONS LOCK / UNLOCK MATRIX                     */}
      {/* ========================================================================= */}
      {activeTab === 'modules' && (
        <div className="space-y-4">
          {moduleSaveBanner && (
            <div className="p-3 bg-emerald-600 text-white rounded-2xl text-xs font-bold flex items-center justify-between shadow-md animate-in fade-in">
              <span>{moduleSaveBanner}</span>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono">LIVE SYNCED</span>
            </div>
          )}

          {/* Target Selector: Global vs Specific Store */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-indigo-600" />
                <span>Permissions &amp; Modules Master Control (Lock / Unlock)</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                ہر آپشن کو لاک (🔒 Locked) یا ان لاک (🔓 Unlocked) کریں۔ لاک ہونے والا آپشن غائب نہیں ہوگا بلکہ مینو میں لاک آئیکن کے ساتھ نظر آئے گا۔
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedShopForModules}
                onChange={e => setSelectedShopForModules(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-600"
              >
                <option value="GLOBAL">🌐 All Stores (Global Platform Lock/Unlock)</option>
                {shops.map(s => (
                  <option key={s.id} value={s.id}>
                    🏪 {s.shop_name} ({s.owner_email || s.id.slice(0, 10)})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleEnableAllModules}
                className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center gap-1"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Unlock All</span>
              </button>

              <button
                type="button"
                onClick={handleLockAllModules}
                className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center gap-1"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Lock All</span>
              </button>
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
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                    isUnlocked
                      ? 'bg-white border-slate-200/90 shadow-xs'
                      : 'bg-rose-50/40 border-rose-200/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        {isUnlocked ? (
                          <Unlock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <Lock className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        )}
                        <h3 className="font-black text-xs text-slate-900">{mod.label}</h3>
                      </div>
                      <span className="text-[11px] font-bold text-indigo-600 block mt-0.5">
                        {mod.urduLabel}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        {mod.description}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleModule(mod.id)}
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

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px]">
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
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-purple-600" />
                  <span>
                    Store Users &amp; Manager Role Permissions (Lock / Unlock) —{' '}
                    {selectedShopForModules === 'GLOBAL'
                      ? currentShop?.shop_name || 'Current Store'
                      : shops.find(s => s.id === selectedShopForModules)?.shop_name || selectedShopForModules}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  سپر ایڈمن بھی یہاں سے کسی بھی دکان کے مینیجر (Manager)، کیشیئر (Cashier) یا سیلزمین (Salesman) کے تمام آپشنز کو لاک (🔒) یا ان لاک (🔓) کر سکتا ہے۔
                </p>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                {(['manager', 'cashier', 'salesman'] as const).map(role => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setSelectedStaffRoleTarget(role)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
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
                    className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                      isUnlocked
                        ? 'bg-slate-50/70 border-slate-200'
                        : 'bg-rose-50/50 border-rose-200'
                    }`}
                  >
                    <div>
                      <span className="font-bold text-slate-900 block">{mod.label}</span>
                      <span className="text-[10px] font-bold text-purple-600 block">
                        {mod.urduLabel}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleShopStaffRoleModule(mod.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 cursor-pointer border ${
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
                      className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                        isUnlocked
                          ? 'bg-slate-50/70 border-slate-200'
                          : 'bg-rose-50/50 border-rose-200'
                      }`}
                    >
                      <div>
                        <span className="font-bold text-slate-900 block">{act.label}</span>
                        <span className="text-[10px] font-bold text-indigo-600 block">
                          {act.urduLabel}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleShopStaffRoleAction(act.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 cursor-pointer border ${
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
            <div className="border-b border-slate-100 pb-3">
              <h3 className="font-black text-sm text-slate-900">
                Global Function &amp; Security Permissions (Lock / Unlock)
              </h3>
              <p className="text-[11px] text-slate-500">
                Control multi-user registration, staff creation, data export, SQL imports, and password policies via Lock / Unlock.
              </p>
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
                    className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                      enabled
                        ? 'border-slate-200 bg-slate-50/70'
                        : 'border-rose-200 bg-rose-50/40'
                    }`}
                  >
                    <div>
                      <span className="font-bold text-slate-900 block">{item.title}</span>
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
    </div>
  );
};
