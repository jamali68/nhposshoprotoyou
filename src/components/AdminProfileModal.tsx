/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Store,
  User as UserIcon,
  Calendar,
  Phone,
  MapPin,
  Mail,
  ShieldCheck,
  Sparkles,
  Check,
  X,
  AlertCircle,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Package,
  Tag,
  Clock,
  RefreshCw
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import { TajLogo } from './TajLogo';
import { PAKISTAN_PROVINCES, getDistrictsForProvince } from '../data/pakistanLocations';
import {
  superAdminService,
  ALL_CONTROLLABLE_MODULES,
  DEFAULT_PACKAGE_POLICIES
} from '../superadmin/superAdminService';
import { ShopPackageType } from '../superadmin/types';

interface AdminProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminProfileModal: React.FC<AdminProfileModalProps> = ({ isOpen, onClose }) => {
  const { currentShop, currentUser, updateShopProfile } = usePOS();

  const [shopName, setShopName] = useState<string>('');
  const [ownerName, setOwnerName] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [phone, setPhone] = useState<string>('');
  const [province, setProvince] = useState<string>('');
  const [district, setDistrict] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [offlinePasswordAlert, setOfflinePasswordAlert] = useState<boolean>(false);
  const [inspectedPackageTier, setInspectedPackageTier] = useState<ShopPackageType | null>(null);
  const [permFilterMode, setPermFilterMode] = useState<'all' | 'unlocked' | 'locked'>('all');
  const [, setLiveConfigTick] = useState<number>(0);

  const wasOpenRef = useRef<boolean>(false);
  const hasEditedPasswordRef = useRef<boolean>(false);
  const initialPasswordRef = useRef<string>('');

  // Real-time 1-3s listener for Super Admin package price, special offer & permission updates
  useEffect(() => {
    const handleLivePolicyUpdate = () => setLiveConfigTick(t => t + 1);
    window.addEventListener('taj_module_control_updated', handleLivePolicyUpdate);
    window.addEventListener('taj_shop_bypass_updated', handleLivePolicyUpdate);
    return () => {
      window.removeEventListener('taj_module_control_updated', handleLivePolicyUpdate);
      window.removeEventListener('taj_shop_bypass_updated', handleLivePolicyUpdate);
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setOfflinePasswordAlert(false);
    };
    const handleOffline = () => {
      setIsOnline(false);
      if (initialPasswordRef.current) {
        setPassword(initialPasswordRef.current);
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Format permanent system registration date (uneditable)
  const registrationDateFormatted = (() => {
    const raw = currentShop?.created_at;
    if (raw) {
      try {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          });
        }
        return String(raw).slice(0, 10);
      } catch {
        return String(raw).slice(0, 10);
      }
    }
    return new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  })();

  // Sync state ONLY ONCE when modal transitions from closed to open (prevents background sync from resetting password while typing)
  useEffect(() => {
    if (isOpen && !wasOpenRef.current && currentShop) {
      wasOpenRef.current = true;
      hasEditedPasswordRef.current = false;
      const initPass = currentShop.password || '123456';
      initialPasswordRef.current = initPass;
      setShopName(currentShop.shop_name || '');
      setOwnerName(currentShop.owner_name || currentUser?.name || '');
      setPassword(initPass);
      setPhone(currentShop.phone || '');
      setProvince(currentShop.province || '');
      setDistrict(currentShop.district || '');
      setCity(currentShop.city || '');
      setAddress(currentShop.address || '');
      setSuccessMessage('');
      setError('');
      setOfflinePasswordAlert(false);
      setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    } else if (!isOpen) {
      wasOpenRef.current = false;
      hasEditedPasswordRef.current = false;
      setOfflinePasswordAlert(false);
    }
  }, [isOpen, currentShop, currentUser]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const currentlyOnline = typeof navigator !== 'undefined' ? navigator.onLine : isOnline;

    if (!shopName.trim()) {
      setError('دکان کا نام درج کرنا لازمی ہے۔ (Shop name is required)');
      return;
    }
    if (!ownerName.trim()) {
      setError('مالک کا نام درج کرنا لازمی ہے۔ (Owner name is required)');
      return;
    }
    if (currentlyOnline && password.trim().length < 6) {
      setError('پاس ورڈ کم از کم 6 ہندسوں کا ہونا ضروری ہے۔ (Password must be at least 6 characters)');
      return;
    }

    setIsSaving(true);
    try {
      await updateShopProfile({
        shop_name: shopName.trim(),
        owner_name: ownerName.trim(),
        ...(currentlyOnline ? { password: password.trim() || '123456' } : {}),
        phone: phone.trim(),
        province: province.trim(),
        district: district.trim(),
        city: city.trim(),
        address: address.trim()
      });

      setSuccessMessage(
        currentlyOnline
          ? '✓ دکان کا نام، مالک کا نام اور پاس ورڈ کامیابی سے محفوظ ہو گیا!'
          : '✓ تفصیلات لوکل ڈیٹا بیس میں محفوظ ہو گئیں! انٹرنیٹ ملتے ہی خودکار لائیو اپڈیٹ ہو جائیں گی۔'
      );
      setTimeout(() => {
        setIsSaving(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      setIsSaving(false);
      setError(err?.message || 'تفصیلات محفوظ کرنے میں مسئلہ پیش آیا۔ دوبارہ کوشش کریں۔');
    }
  };

  const isSuperAdmin = currentUser?.role === 'super_admin' || currentUser?.email === 'aliimtiaz1126@gmail.com';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-lg w-full shadow-2xl border border-slate-200 text-slate-800 relative my-auto">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
          title="بند کریں (Close)"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top Header (English Heading) */}
        <div className="flex items-center gap-3 pb-4 pr-8 border-b border-slate-100">
          <TajLogo size="sm" showSubtitle={false} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                Admin Profile &amp; Store Settings
              </h3>
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                  isSuperAdmin
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                }`}
              >
                {isSuperAdmin ? '👑 Super Admin' : '👤 Admin'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Manage your Shop Name, Owner Profile, Active Package &amp; Permissions
            </p>
          </div>
        </div>

        {/* Success Alert */}
        {successMessage && (
          <div className="mt-4 p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold text-left flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mt-4 p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold text-left flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs text-left">
          {/* Registered Email (Protected Google Account) */}
          <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-2xl space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="text-[10px] text-blue-900 font-bold">
                  رجسٹرڈ گوگل اکاؤنٹ (Primary Email)
                </span>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full shrink-0">
                <ShieldCheck className="w-3 h-3" />
                <span>تصدیق شدہ (Verified)</span>
              </span>
            </div>
            <div className="pl-5.5 font-mono font-bold text-blue-950 text-xs sm:text-sm break-all">
              {currentUser?.email || currentShop?.owner_email || 'aliimtiaz1126@gmail.com'}
            </div>
          </div>

          {/* Shop Name Input */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
              دکان کا نام (Shop Name) *
            </label>
            <div className="relative">
              <Store className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                required
                value={shopName}
                onChange={e => setShopName(e.target.value)}
                placeholder="مثلاً: Taj karnaya and Mobile Shop"
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white text-sm transition-all"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              * رسیدوں، بلوں اور پی او ایس ہیڈر پر یہی نام پرنٹ اور ظاہر ہوگا۔
            </p>
          </div>

          {/* Owner Name Input */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
              مالک کا نام (Owner / Admin Name) *
            </label>
            <div className="relative">
              <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                required
                value={ownerName}
                onChange={e => setOwnerName(e.target.value)}
                placeholder="مثلاً: Ali Imtiaz"
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white text-sm transition-all"
              />
            </div>
          </div>

          {/* Owner Login Password */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={`text-[11px] font-bold uppercase ${isOnline ? 'text-slate-700' : 'text-slate-600'}`}>
                مالک کا لاگ ان پاس ورڈ (Login Password)
              </label>
              <span className="text-[10px] text-slate-400 font-medium">
                کم از کم 6 ہندسے
              </span>
            </div>
            <div
              className="relative"
              onClick={() => {
                if (!isOnline) {
                  setOfflinePasswordAlert(true);
                }
              }}
            >
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                readOnly={!isOnline}
                onClick={() => {
                  if (!isOnline) {
                    setOfflinePasswordAlert(true);
                  }
                }}
                onFocus={e => {
                  if (!isOnline) {
                    setOfflinePasswordAlert(true);
                    e.currentTarget.blur();
                    return;
                  }
                  if (!hasEditedPasswordRef.current) {
                    e.currentTarget.select();
                  }
                }}
                onChange={e => {
                  if (!isOnline) {
                    setOfflinePasswordAlert(true);
                    return;
                  }
                  const val = e.target.value;
                  const initPass = initialPasswordRef.current;
                  if (
                    !hasEditedPasswordRef.current &&
                    initPass &&
                    val.length > initPass.length &&
                    val.startsWith(initPass)
                  ) {
                    // User tapped at the end of old password and started typing new password -> start fresh with newly typed char!
                    hasEditedPasswordRef.current = true;
                    setPassword(val.slice(initPass.length));
                    return;
                  }
                  hasEditedPasswordRef.current = true;
                  setPassword(val);
                }}
                placeholder="نیا پاس ورڈ درج کریں"
                className={
                  isOnline
                    ? 'w-full pl-10 pr-20 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white text-sm transition-all font-mono'
                    : 'w-full pl-10 pr-12 py-2.5 bg-slate-100/80 border border-slate-200 text-slate-500 rounded-xl font-mono text-sm select-none cursor-default focus:outline-none'
                }
              />
              {isOnline && password.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    hasEditedPasswordRef.current = true;
                    setPassword('');
                  }}
                  className="absolute right-10 top-2.5 text-[10px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-lg cursor-pointer transition-colors"
                  title="پاس ورڈ صاف کریں (Clear)"
                >
                  صاف
                </button>
              )}
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  if (!isOnline) {
                    setOfflinePasswordAlert(true);
                    return;
                  }
                  setShowPassword(!showPassword);
                }}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {!isOnline && offlinePasswordAlert && (
              <p className="text-xs font-black text-rose-600 mt-1.5 flex items-center gap-1 animate-in fade-in">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>You are offline</span>
              </p>
            )}
            <p className="text-[10px] text-slate-500 mt-1">
              * آپ اپنی مرضی کا نیا پاس ورڈ بھی رکھ سکتے ہیں۔ بیک اپ لاگ ان میں یہی پاس ورڈ استعمال ہوگا۔
            </p>
          </div>

          {/* Account Registration Date (Permanent System Date - Uneditable, Dim, No Lock Icon) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-600 uppercase">
                اکاؤنٹ رجسٹریشن تاریخ (Registration Date)
              </label>
              <span className="text-[10px] text-slate-400 font-medium bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                مستقل سسٹم تاریخ (Permanent)
              </span>
            </div>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <div className="w-full pl-10 pr-3.5 py-2.5 bg-slate-100/80 border border-slate-200 text-slate-500 rounded-xl font-mono text-sm select-none cursor-default">
                {registrationDateFormatted}
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              * یہ تاریخ اکاؤنٹ رجسٹریشن کے وقت سسٹم میں محفوظ ہوئی تھی اور ہمیشہ کے لیے غیر تبدیل شدہ (Permanent) رہے گی۔
            </p>
          </div>

          {/* Location: Province, District & City */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                صوبہ (Province)
              </label>
              <select
                value={province}
                onChange={e => {
                  setProvince(e.target.value);
                  setDistrict('');
                }}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white text-xs cursor-pointer"
              >
                <option value="">-- Select Province --</option>
                {PAKISTAN_PROVINCES.map(p => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                ضلع (District)
              </label>
              <select
                disabled={!province}
                value={district}
                onChange={e => setDistrict(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white text-xs cursor-pointer disabled:opacity-60"
              >
                <option value="">-- Select District --</option>
                {getDistrictsForProvince(province).map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                شہر (City - Optional)
              </label>
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="مثلاً: صادق آباد"
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white text-xs"
              />
            </div>
          </div>

          {/* Phone Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                رابطہ / واٹس ایپ نمبر
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="مثلاً: 03001234567"
                  className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white text-xs transition-all font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                دکان کا پتہ / بازار
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="مثلاً: مین بازار، صادق آباد"
                  className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white text-xs transition-all"
                />
              </div>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* ACTIVE PACKAGE, LIVE PRICING (WITH SPECIAL OFFER SALE CROSS-OUT)      */}
          {/* & INTERACTIVE PACKAGE COMPARISON + UNLOCKED / LOCKED LIST VIEW        */}
          {/* ===================================================================== */}
          {(() => {
            const effectiveShopId = currentShop?.id || currentUser?.shopId;
            const moduleCfg = superAdminService.getModuleControlConfig();
            const activePolicy = superAdminService.getShopEffectiveSyncPolicy(effectiveShopId);
            const bypassStatus = superAdminService.getShopDailyBypassStatus(effectiveShopId);

            // Which package tier is currently selected for inspection in the details list box below
            const selectedTier: ShopPackageType = inspectedPackageTier || activePolicy.packageType;
            const isViewingActiveTier = selectedTier === activePolicy.packageType;
            const selectedTierDef =
              moduleCfg.packageDefaults?.[selectedTier] || DEFAULT_PACKAGE_POLICIES[selectedTier];

            const selectedFallbackPkr =
              selectedTier === 'pro' ? 1000 : selectedTier === 'basic' ? 500 : 0;
            const selectedOrigPkr = isViewingActiveTier
              ? activePolicy.originalPricePkr
              : typeof selectedTierDef.originalPricePkr === 'number'
              ? selectedTierDef.originalPricePkr
              : selectedFallbackPkr;
            const selectedOfferActive = isViewingActiveTier
              ? activePolicy.isSpecialOfferActive
              : Boolean(selectedTierDef.isSpecialOfferActive);
            const selectedOfferPkr = isViewingActiveTier
              ? activePolicy.specialOfferPricePkr
              : typeof selectedTierDef.specialOfferPricePkr === 'number'
              ? selectedTierDef.specialOfferPricePkr
              : selectedOrigPkr;
            const selectedOfferLabel =
              (isViewingActiveTier
                ? activePolicy.specialOfferLabel
                : selectedTierDef.specialOfferLabel) || 'Special Offer';
            const selectedHasDiscount =
              selectedOfferActive && selectedOrigPkr > 0 && selectedOfferPkr < selectedOrigPkr;
            const selectedDiscountPct = selectedHasDiscount
              ? Math.max(
                  1,
                  Math.min(
                    99,
                    Math.round(((selectedOrigPkr - selectedOfferPkr) / selectedOrigPkr) * 100)
                  )
                )
              : 0;
            const selectedSyncMinutes = isViewingActiveTier
              ? activePolicy.autoSyncIntervalMinutes
              : selectedTierDef.autoSyncIntervalMinutes;
            const selectedBypassLimit = isViewingActiveTier
              ? activePolicy.dailyManualBypassLimit
              : selectedTierDef.dailyManualBypassLimit;

            // Build complete 14-item permissions breakdown for the selected/clicked package tier
            const permissionRows = superAdminService.getPackagePermissionsBreakdown(
              selectedTier,
              effectiveShopId,
              isViewingActiveTier
            );

            const unlockedCount = permissionRows.filter(p => p.unlocked).length;
            const lockedCount = permissionRows.length - unlockedCount;

            const filteredPermissionRows = permissionRows.filter(p => {
              if (permFilterMode === 'unlocked') return p.unlocked;
              if (permFilterMode === 'locked') return !p.unlocked;
              return true;
            });

            const hasActiveDiscount =
              activePolicy.isSpecialOfferActive &&
              activePolicy.originalPricePkr > 0 &&
              activePolicy.specialOfferPricePkr < activePolicy.originalPricePkr;

            return (
              <div className="pt-2 space-y-3">
                <div className="rounded-2xl border border-indigo-200/90 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-4 shadow-md space-y-3">
                  {/* Active Package Header & Live Price Badge */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-white/10 pb-3">
                    <div className="flex items-start gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-200">
                            Active Package:
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              activePolicy.packageType === 'pro'
                                ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950'
                                : activePolicy.packageType === 'basic'
                                ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950'
                                : 'bg-emerald-500 text-slate-950'
                            }`}
                          >
                            {activePolicy.packageLabel}
                          </span>
                        </div>
                        <p className="text-[11px] font-bold text-amber-300 mt-0.5">
                          {activePolicy.packageUrduLabel}
                        </p>
                      </div>
                    </div>

                    {/* Active Package Price with Crossed-Out Original Price on Special Offer */}
                    <div className="bg-slate-950/75 border border-white/15 rounded-xl px-3 py-2 text-right self-start sm:self-center">
                      {hasActiveDiscount ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="px-1.5 py-0.2 rounded bg-gradient-to-r from-rose-500 to-amber-500 text-slate-950 font-black text-[9px] uppercase">
                              🔥 {activePolicy.discountPercent}% OFF · {activePolicy.specialOfferLabel}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-end gap-2">
                            <span className="text-xs font-mono font-bold text-rose-400 line-through decoration-rose-500 decoration-2">
                              PKR {activePolicy.originalPricePkr.toLocaleString()}
                            </span>
                            <span className="text-sm sm:text-base font-mono font-black text-emerald-400">
                              PKR {activePolicy.specialOfferPricePkr.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span className="text-[9px] text-slate-400 uppercase font-bold block">
                            Active Package Price
                          </span>
                          <span className="text-sm sm:text-base font-mono font-black text-emerald-300">
                            {activePolicy.originalPricePkr === 0
                              ? 'PKR 0 (Free)'
                              : `PKR ${activePolicy.originalPricePkr.toLocaleString()}`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Active Package Sync Timer & Shared Daily Bypass Limits */}
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="bg-white/5 border border-white/10 rounded-xl px-2.5 py-2 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-cyan-300 shrink-0" />
                      <div>
                        <span className="text-slate-400 block">Auto Sync Timer:</span>
                        <span className="font-mono font-black text-white">
                          Every {activePolicy.autoSyncIntervalMinutes} min (Unlimited)
                        </span>
                      </div>
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-xl px-2.5 py-2 flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-amber-300 shrink-0" />
                      <div>
                        <span className="text-slate-400 block">Shared Daily Bypass:</span>
                        <span className="font-mono font-black text-amber-300">
                          {bypassStatus.remainingCount}/{bypassStatus.dailyLimit} Remaining
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* All 3 Packages Interactive Selector Cards (Click any package to inspect its features below) */}
                  <div className="space-y-2 pt-1">
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[10px]">
                      <span className="font-black uppercase tracking-wider text-indigo-200 flex items-center gap-1">
                        <Tag className="w-3 h-3 text-amber-300" />
                        <span>Click Any Package Below to Compare Features &amp; Price</span>
                      </span>
                      <span className="text-[9px] text-emerald-300 font-bold">
                        ● Live Cloud Synced
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {(['free', 'basic', 'pro'] as ShopPackageType[]).map(tier => {
                        const tierDef =
                          moduleCfg.packageDefaults?.[tier] || DEFAULT_PACKAGE_POLICIES[tier];
                        const isCurrentTier = activePolicy.packageType === tier;
                        const isInspected = selectedTier === tier;
                        const fallbackPkr = tier === 'pro' ? 1000 : tier === 'basic' ? 500 : 0;
                        const origPkr =
                          isCurrentTier
                            ? activePolicy.originalPricePkr
                            : typeof tierDef.originalPricePkr === 'number'
                            ? tierDef.originalPricePkr
                            : fallbackPkr;
                        const offerActive = isCurrentTier
                          ? activePolicy.isSpecialOfferActive
                          : Boolean(tierDef.isSpecialOfferActive);
                        const offerPkr =
                          isCurrentTier
                            ? activePolicy.specialOfferPricePkr
                            : typeof tierDef.specialOfferPricePkr === 'number'
                            ? tierDef.specialOfferPricePkr
                            : origPkr;
                        const offerLabel =
                          (isCurrentTier
                            ? activePolicy.specialOfferLabel
                            : tierDef.specialOfferLabel) || 'Special Offer';
                        const isDiscounted = offerActive && origPkr > 0 && offerPkr < origPkr;
                        const discPct = isDiscounted
                          ? Math.max(1, Math.min(99, Math.round(((origPkr - offerPkr) / origPkr) * 100)))
                          : 0;

                        const tierPerms = superAdminService.getPackagePermissionsBreakdown(
                          tier,
                          effectiveShopId,
                          isCurrentTier
                        );
                        const tierUnlockedCount = tierPerms.filter(p => p.unlocked).length;
                        const tierLockedCount = tierPerms.length - tierUnlockedCount;

                        return (
                          <button
                            key={tier}
                            type="button"
                            onClick={() => setInspectedPackageTier(tier)}
                            className={`rounded-xl p-2.5 border text-left flex flex-col justify-between gap-1.5 relative transition-all cursor-pointer active:scale-95 ${
                              isInspected
                                ? tier === 'pro'
                                  ? 'bg-gradient-to-br from-amber-500/30 to-orange-600/20 border-amber-400 ring-2 ring-amber-400/50 shadow-md'
                                  : tier === 'basic'
                                  ? 'bg-gradient-to-br from-cyan-500/30 to-blue-600/20 border-cyan-400 ring-2 ring-cyan-400/50 shadow-md'
                                  : 'bg-emerald-500/25 border-emerald-400 ring-2 ring-emerald-400/50 shadow-md'
                                : 'bg-slate-950/60 border-white/10 hover:border-white/30'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 w-full">
                              <span className="text-[10px] font-black uppercase text-white">
                                {tier}
                              </span>
                              {isCurrentTier ? (
                                <span className="px-1.5 py-0.2 rounded-full bg-emerald-400 text-slate-950 font-black text-[8px] uppercase">
                                  Active
                                </span>
                              ) : isInspected ? (
                                <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 font-black text-[8px] uppercase">
                                  Viewing
                                </span>
                              ) : (
                                <span className="text-[8px] text-slate-400 font-bold">
                                  Tap Info
                                </span>
                              )}
                            </div>

                            {isDiscounted ? (
                              <div className="space-y-0.5">
                                <span className="inline-block px-1.5 py-0.2 rounded bg-rose-500 text-white font-black text-[8px] uppercase">
                                  {discPct}% OFF · {offerLabel}
                                </span>
                                <div className="text-[10px] font-mono font-bold text-rose-400 line-through decoration-rose-500 decoration-2 leading-tight">
                                  PKR {origPkr.toLocaleString()}
                                </div>
                                <div className="text-xs font-mono font-black text-emerald-300 leading-tight">
                                  PKR {offerPkr.toLocaleString()}
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs font-mono font-black text-white">
                                {origPkr === 0 ? 'PKR 0' : `PKR ${origPkr.toLocaleString()}`}
                              </div>
                            )}

                            <div className="text-[9px] text-slate-300 font-mono pt-1 border-t border-white/10 space-y-0.5 w-full">
                              <div>
                                {tierDef.autoSyncIntervalMinutes}m · {tierDef.dailyManualBypassLimit} Bypass
                              </div>
                              <div className="flex items-center justify-between text-[8.5px] font-bold">
                                <span className="text-emerald-300">🔓 {tierUnlockedCount}</span>
                                <span className={tierLockedCount > 0 ? 'text-rose-400' : 'text-slate-400'}>
                                  🔒 {tierLockedCount}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <p className="text-[10px] text-indigo-200 text-center font-medium pt-0.5">
                      👆 اوپر کسی بھی پیکج (<strong>FREE</strong>، <strong>BASIC</strong> یا <strong>PRO</strong>) پر کلک کریں تاکہ نیچے لسٹ میں اس کے تمام فیچرز دیکھ سکیں۔
                    </p>
                  </div>
                </div>

                {/* Selected Package Permissions & Features Comparison List View Box */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-3.5 sm:p-4 space-y-3 shadow-xs">
                  {/* Box Header: Showing Which Package Is Being Inspected */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-200 pb-3">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight">
                          {selectedTierDef.label} — Features &amp; Permissions List
                        </h4>
                        {isViewingActiveTier ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-black uppercase">
                            ✓ Your Active Package
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[9px] font-black uppercase">
                            👁️ Comparing Paid Package
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-600 font-medium">
                        {isViewingActiveTier
                          ? 'آپ کے موجودہ ایکٹو پیکج پر کون سے فیچرز ان لاک (🔓 Unlocked) اور کون سے لاک (🔒 Locked) ہیں:'
                          : `${selectedTierDef.label} (${
                              selectedHasDiscount
                                ? `Special Offer PKR ${selectedOfferPkr.toLocaleString()}`
                                : `PKR ${selectedOrigPkr.toLocaleString()}`
                            }) میں ملنے والے تمام ان لاک اور لاک فیچرز کی تفصیل:`}
                      </p>
                    </div>

                    {!isViewingActiveTier && (
                      <button
                        type="button"
                        onClick={() => setInspectedPackageTier(activePolicy.packageType)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-[10px] font-black cursor-pointer self-start sm:self-center shrink-0"
                      >
                        ← Back to Active ({activePolicy.packageType.toUpperCase()})
                      </button>
                    )}
                  </div>

                  {/* Selected Package Quick Specs Strip (Price, Auto-Sync Timer, Daily Bypass Counts) */}
                  <div className="grid grid-cols-3 gap-2 bg-white p-2.5 rounded-xl border border-slate-200 text-center">
                    <div className="border-r border-slate-100 pr-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase block">
                        Package Price
                      </span>
                      {selectedHasDiscount ? (
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] font-mono font-bold text-rose-500 line-through">
                            PKR {selectedOrigPkr.toLocaleString()}
                          </span>
                          <span className="text-xs font-mono font-black text-emerald-700">
                            PKR {selectedOfferPkr.toLocaleString()} ({selectedDiscountPct}% OFF)
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs font-mono font-black text-slate-900">
                          {selectedOrigPkr === 0
                            ? 'PKR 0 (Free)'
                            : `PKR ${selectedOrigPkr.toLocaleString()}`}
                        </span>
                      )}
                    </div>

                    <div className="border-r border-slate-100 px-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase block">
                        Auto Sync Timer
                      </span>
                      <span className="text-xs font-mono font-black text-indigo-700">
                        Every {selectedSyncMinutes} Min
                      </span>
                    </div>

                    <div className="pl-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase block">
                        Shared Bypass / Day
                      </span>
                      <span className="text-xs font-mono font-black text-amber-700">
                        {selectedBypassLimit} Counts / Day
                      </span>
                    </div>
                  </div>

                  {/* Filter Tabs: All (14) | Unlocked | Locked */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPermFilterMode('all')}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black border transition-all cursor-pointer ${
                          permFilterMode === 'all'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        All ({permissionRows.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPermFilterMode('unlocked')}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black border transition-all cursor-pointer ${
                          permFilterMode === 'unlocked'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                        }`}
                      >
                        🔓 {unlockedCount} Unlocked
                      </button>
                      <button
                        type="button"
                        onClick={() => setPermFilterMode('locked')}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black border transition-all cursor-pointer ${
                          permFilterMode === 'locked'
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                        }`}
                      >
                        🔒 {lockedCount} Locked
                      </button>
                    </div>

                    <span className="text-[10px] font-bold text-slate-500">
                      Showing {filteredPermissionRows.length} items in List View
                    </span>
                  </div>

                  {/* Full List View of All Unlocked & Locked Permissions for the Selected Package */}
                  <div className="space-y-1.5">
                    {filteredPermissionRows.length === 0 ? (
                      <div className="py-6 text-center bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-500">
                        {permFilterMode === 'locked'
                          ? `🎉 ${selectedTierDef.label} میں کوئی بھی فیچر لاک (Locked) نہیں ہے — تمام 14 فیچرز ان لاک ہیں!`
                          : 'کوئی پرمیشن موجود نہیں۔'}
                      </div>
                    ) : (
                      filteredPermissionRows.map((perm, idx) => {
                        const paidTiersThatUnlock = perm.unlocksInTiers.filter(t => t !== 'free');
                        const upgradeHint =
                          !perm.unlocked && paidTiersThatUnlock.length > 0
                            ? `Unlocks in ${paidTiersThatUnlock.map(t => t.toUpperCase()).join(' & ')}`
                            : null;

                        return (
                          <div
                            key={perm.id}
                            className={`px-3 py-2.5 rounded-xl border flex items-center justify-between gap-2.5 transition-all ${
                              perm.unlocked
                                ? 'bg-white border-emerald-200/90 text-slate-800'
                                : 'bg-rose-50/80 border-rose-200 text-slate-700'
                            }`}
                          >
                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                              <span
                                className={`w-5 h-5 rounded-lg text-[10px] font-mono font-black flex items-center justify-center shrink-0 mt-0.5 ${
                                  perm.unlocked
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {idx + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-black text-slate-900 text-xs">
                                    {perm.label}
                                  </span>
                                  <span className="text-[10.5px] font-bold text-slate-500">
                                    ({perm.urduLabel})
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                                  {perm.description}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-1 shrink-0">
                              {perm.unlocked ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-black">
                                  <Unlock className="w-3 h-3" />
                                  <span>Unlocked</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-black">
                                  <Lock className="w-3 h-3" />
                                  <span>Locked</span>
                                </span>
                              )}

                              {upgradeHint && (
                                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-black">
                                  ✨ {upgradeHint}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
            >
              منسوخ کریں (Cancel)
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="py-2.5 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black rounded-xl text-xs shadow-md shadow-blue-600/30 flex items-center gap-2 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-yellow-300" />
              <span>{isSaving ? 'محفوظ ہو رہا ہے...' : 'تبدیلیاں محفوظ کریں (Save Changes)'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
