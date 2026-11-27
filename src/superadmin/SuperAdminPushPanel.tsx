/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Super Admin ONLY Advanced Geo Audience, Rich Push Notifications & Private Popup Ads Studio
 * - Strictly accessible ONLY inside SuperAdminView (blocked for regular Store Admins & Staff)
 * - Module 1: Geo Audience Explorer (Province -> District -> City tracking, breakdowns & 1-click targeting)
 * - Module 2: Rich Push Notification Studio (Alfa text + MyZong BigPicture banner style, pin-point geo targeting)
 * - Module 3: Private Popup Ads & Seasonal Event Campaign Studio (Eid, Milad, 14 August, Ramazan, Private Ads)
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Bell,
  Send,
  Image as ImageIcon,
  Upload,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Users,
  Building2,
  RefreshCw,
  X,
  MapPin,
  Megaphone,
  Target,
  Eye,
  Play,
  Pause,
  ExternalLink,
  Search,
  Globe2,
  CalendarClock
} from 'lucide-react';
import { TenantShopInfo } from './types';
import {
  PAKISTAN_PROVINCES,
  getDistrictsForProvince,
  formatShopLocationLine
} from '../data/pakistanLocations';
import {
  RichPushNotification,
  PopupAdCampaign,
  PushTargetRole,
  TargetScopeType,
  PopupCampaignType,
  PopupThemePreset,
  PopupShowFrequency,
  GeoTargetCriteria,
  EVENT_CAMPAIGN_PRESETS,
  CampaignTemplatePreset,
  compressNotificationBannerFile,
  sanitizeNotificationImageUrl,
  sanitizeCampaignCtaUrl,
  matchesGeoTargetForShop,
  describeGeoTarget,
  isActivePopupCampaign,
  sendSuperAdminPushBroadcast,
  fetchSuperAdminPushHistory,
  deleteSuperAdminPushHistoryItem,
  launchSuperAdminPopupAd,
  fetchSuperAdminPopupAds,
  toggleSuperAdminPopupAdActive,
  deleteSuperAdminPopupAd,
  triggerNativeOsRichNotification,
  getOsNotificationPermission,
  requestOsNotificationPermission
} from '../utils/pushNotifications';

interface SuperAdminPushPanelProps {
  shops: TenantShopInfo[];
  senderEmail: string;
  senderName: string;
  isFirebaseMasterVerified: boolean;
  isVerifyingCloudAuth: boolean;
  onVerifyMasterGoogleCloudAuth: () => void;
}

type StudioSubTab = 'geo' | 'push' | 'popup';

const THEME_PREVIEW_STYLES: Record<
  PopupThemePreset,
  { label: string; headerBg: string; btnBg: string; dot: string }
> = {
  emerald: {
    label: 'Emerald',
    headerBg: 'from-emerald-600 via-teal-600 to-emerald-700',
    btnBg: 'bg-emerald-600',
    dot: 'bg-emerald-500'
  },
  gold: {
    label: 'Eid Gold',
    headerBg: 'from-amber-500 via-yellow-600 to-amber-700',
    btnBg: 'bg-amber-600',
    dot: 'bg-amber-500'
  },
  pakistan: {
    label: '14 Aug Green',
    headerBg: 'from-green-700 via-emerald-700 to-green-900',
    btnBg: 'bg-green-700',
    dot: 'bg-green-700'
  },
  indigo: {
    label: 'Royal Indigo',
    headerBg: 'from-indigo-600 via-blue-600 to-violet-700',
    btnBg: 'bg-indigo-600',
    dot: 'bg-indigo-600'
  },
  rose: {
    label: 'Promo Rose',
    headerBg: 'from-rose-600 via-pink-600 to-orange-600',
    btnBg: 'bg-rose-600',
    dot: 'bg-rose-600'
  }
};

export const SuperAdminPushPanel: React.FC<SuperAdminPushPanelProps> = ({
  shops,
  senderEmail,
  senderName,
  isFirebaseMasterVerified,
  isVerifyingCloudAuth,
  onVerifyMasterGoogleCloudAuth
}) => {
  const [subTab, setSubTab] = useState<StudioSubTab>('geo');

  // Shared Feedback Banner
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // =========================================================================
  // MODULE 1: GEO AUDIENCE EXPLORER STATE
  // =========================================================================
  const [geoFilterProvince, setGeoFilterProvince] = useState<string>('ALL'); // 'ALL' | 'UNMAPPED' | Province Name
  const [geoFilterDistrict, setGeoFilterDistrict] = useState<string>('ALL');
  const [geoFilterCity, setGeoFilterCity] = useState<string>('');
  const [geoSearchQuery, setGeoSearchQuery] = useState<string>('');

  // =========================================================================
  // SHARED PIN-POINT TARGETING STATE (Used by Push & Popup Studios)
  // =========================================================================
  const [targetType, setTargetType] = useState<TargetScopeType>('ALL_SHOPS');
  const [targetProvince, setTargetProvince] = useState<string>('');
  const [targetDistrict, setTargetDistrict] = useState<string>('');
  const [targetCity, setTargetCity] = useState<string>('');
  const [targetShopId, setTargetShopId] = useState<string>('ALL_SHOPS');
  const [targetRole, setTargetRole] = useState<PushTargetRole>('all');
  const [showMatchedPreview, setShowMatchedPreview] = useState<boolean>(false);

  // =========================================================================
  // MODULE 2: RICH PUSH NOTIFICATIONS STATE
  // =========================================================================
  const [pushTitle, setPushTitle] = useState<string>('');
  const [pushBody, setPushBody] = useState<string>('');
  const [pushImageUrl, setPushImageUrl] = useState<string>('');
  const [pushEventTag, setPushEventTag] = useState<string>('');
  const [isCompressingPushImg, setIsCompressingPushImg] = useState<boolean>(false);
  const [isSendingPush, setIsSendingPush] = useState<boolean>(false);
  const [pushHistory, setPushHistory] = useState<RichPushNotification[]>([]);
  const [isLoadingPushHistory, setIsLoadingPushHistory] = useState<boolean>(true);
  const [deletingPushId, setDeletingPushId] = useState<string | null>(null);
  const pushFileInputRef = useRef<HTMLInputElement | null>(null);

  // =========================================================================
  // MODULE 3: PRIVATE POPUP ADS / EVENT CAMPAIGNS STATE
  // =========================================================================
  const [popupCampaignType, setPopupCampaignType] = useState<PopupCampaignType>('event_greeting');
  const [popupTheme, setPopupTheme] = useState<PopupThemePreset>('gold');
  const [popupBadge, setPopupBadge] = useState<string>('🌙 Special Announcement');
  const [popupTitle, setPopupTitle] = useState<string>('');
  const [popupBody, setPopupBody] = useState<string>('');
  const [popupImageUrl, setPopupImageUrl] = useState<string>('');
  const [popupCtaLabel, setPopupCtaLabel] = useState<string>('');
  const [popupCtaUrl, setPopupCtaUrl] = useState<string>('');
  const [popupFrequency, setPopupFrequency] = useState<PopupShowFrequency>('once');
  const [popupDurationHours, setPopupDurationHours] = useState<number>(72);
  const [isCompressingPopupImg, setIsCompressingPopupImg] = useState<boolean>(false);
  const [isLaunchingPopup, setIsLaunchingPopup] = useState<boolean>(false);
  const [activePopup, setActivePopup] = useState<PopupAdCampaign | null>(null);
  const [popupHistory, setPopupHistory] = useState<PopupAdCampaign[]>([]);
  const [isLoadingPopups, setIsLoadingPopups] = useState<boolean>(true);
  const [busyPopupId, setBusyPopupId] = useState<string | null>(null);
  const popupFileInputRef = useRef<HTMLInputElement | null>(null);

  // Load both cloud histories on mount
  const loadCloudData = async () => {
    setIsLoadingPushHistory(true);
    setIsLoadingPopups(true);
    try {
      const [pushes, popupData] = await Promise.all([
        fetchSuperAdminPushHistory(),
        fetchSuperAdminPopupAds()
      ]);
      setPushHistory(pushes);
      setActivePopup(popupData.activeCampaign);
      setPopupHistory(popupData.history);
    } finally {
      setIsLoadingPushHistory(false);
      setIsLoadingPopups(false);
    }
  };

  useEffect(() => {
    loadCloudData();
  }, []);

  // =========================================================================
  // GEO ANALYTICS & BREAKDOWN COMPUTATIONS
  // =========================================================================
  const geoStats = useMemo(() => {
    const provinceCounts: Record<string, number> = {};
    const districtCounts: Record<string, { count: number; province: string }> = {};
    const citySet = new Set<string>();
    let mappedCount = 0;
    let unmappedCount = 0;

    shops.forEach(s => {
      const prov = String(s.province || '').trim();
      const dist = String(s.district || '').trim();
      const city = String(s.city || '').trim();
      if (prov || dist) {
        mappedCount += 1;
      } else {
        unmappedCount += 1;
      }
      if (prov) {
        provinceCounts[prov] = (provinceCounts[prov] || 0) + 1;
      }
      if (dist) {
        const key = `${prov}__${dist}`;
        if (!districtCounts[key]) {
          districtCounts[key] = { count: 0, province: prov };
        }
        districtCounts[key].count += 1;
      }
      if (city) {
        citySet.add(city);
      }
    });

    const uniqueCities = Array.from(citySet).sort((a, b) => a.localeCompare(b));
    return {
      totalShops: shops.length,
      mappedCount,
      unmappedCount,
      activeProvincesCount: Object.keys(provinceCounts).length,
      activeDistrictsCount: Object.keys(districtCounts).length,
      uniqueCities,
      provinceCounts
    };
  }, [shops]);

  // District counts within the currently selected province filter in Geo Explorer
  const explorerDistrictBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    shops.forEach(s => {
      const prov = String(s.province || '').trim();
      const dist = String(s.district || '').trim();
      if (!dist) return;
      if (geoFilterProvince !== 'ALL' && geoFilterProvince !== 'UNMAPPED') {
        if (prov.toLowerCase() !== geoFilterProvince.toLowerCase()) return;
      }
      if (geoFilterProvince === 'UNMAPPED') return;
      map.set(dist, (map.get(dist) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [shops, geoFilterProvince]);

  // Filtered shops in Geo Audience Explorer
  const explorerFilteredShops = useMemo(() => {
    return shops.filter(s => {
      const prov = String(s.province || '').trim();
      const dist = String(s.district || '').trim();
      const city = String(s.city || '').trim();
      const addr = String(s.address || '').trim();

      if (geoFilterProvince === 'UNMAPPED') {
        if (prov || dist) return false;
      } else if (geoFilterProvince !== 'ALL') {
        if (prov.toLowerCase() !== geoFilterProvince.toLowerCase()) return false;
      }

      if (geoFilterDistrict !== 'ALL') {
        if (dist.toLowerCase() !== geoFilterDistrict.toLowerCase()) return false;
      }

      if (geoFilterCity.trim()) {
        const c = geoFilterCity.trim().toLowerCase();
        if (!city.toLowerCase().includes(c) && !addr.toLowerCase().includes(c)) return false;
      }

      if (geoSearchQuery.trim()) {
        const q = geoSearchQuery.trim().toLowerCase();
        const hit =
          s.shop_name.toLowerCase().includes(q) ||
          s.owner_name.toLowerCase().includes(q) ||
          s.owner_email.toLowerCase().includes(q) ||
          (s.phone || '').toLowerCase().includes(q) ||
          prov.toLowerCase().includes(q) ||
          dist.toLowerCase().includes(q) ||
          city.toLowerCase().includes(q);
        if (!hit) return false;
      }

      return true;
    });
  }, [shops, geoFilterProvince, geoFilterDistrict, geoFilterCity, geoSearchQuery]);

  // Live Target Criteria Object & Live Matching Reach Preview (for Push + Popup composers)
  const currentTargetCriteria: GeoTargetCriteria = useMemo(() => {
    const selectedShopObj = shops.find(s => s.id === targetShopId);
    return {
      targetType,
      targetProvince: targetType === 'GEO' ? targetProvince : '',
      targetDistrict: targetType === 'GEO' ? targetDistrict : '',
      targetCity: targetType === 'GEO' ? targetCity : '',
      targetShopId: targetType === 'SPECIFIC_SHOP' ? targetShopId : 'ALL_SHOPS',
      targetShopName:
        targetType === 'SPECIFIC_SHOP'
          ? selectedShopObj?.shop_name || targetShopId
          : 'All Shops',
      targetRole
    };
  }, [targetType, targetProvince, targetDistrict, targetCity, targetShopId, targetRole, shops]);

  const matchedTargetShops = useMemo(() => {
    return shops.filter(s =>
      matchesGeoTargetForShop(currentTargetCriteria, {
        id: s.id,
        province: s.province,
        district: s.district,
        city: s.city,
        address: s.address
      })
    );
  }, [shops, currentTargetCriteria]);

  const targetDistrictOptions = useMemo(() => {
    if (!targetProvince) {
      // Gather all districts that actually exist across registered shops when no province is picked
      const set = new Set<string>();
      shops.forEach(s => {
        if (s.district?.trim()) set.add(s.district.trim());
      });
      return Array.from(set).sort((a, b) => a.localeCompare(b));
    }
    return getDistrictsForProvince(targetProvince);
  }, [targetProvince, shops]);

  // Jump from Geo Explorer directly into Push or Popup studio with filters pre-loaded!
  const handleJumpToCampaignWithGeoFilter = (destTab: 'push' | 'popup') => {
    setFeedback(null);
    if (
      geoFilterProvince !== 'ALL' &&
      geoFilterProvince !== 'UNMAPPED'
    ) {
      setTargetType('GEO');
      setTargetProvince(geoFilterProvince);
      setTargetDistrict(geoFilterDistrict !== 'ALL' ? geoFilterDistrict : '');
      setTargetCity(geoFilterCity.trim());
    } else if (geoFilterDistrict !== 'ALL' || geoFilterCity.trim()) {
      setTargetType('GEO');
      setTargetProvince('');
      setTargetDistrict(geoFilterDistrict !== 'ALL' ? geoFilterDistrict : '');
      setTargetCity(geoFilterCity.trim());
    } else {
      setTargetType('ALL_SHOPS');
      setTargetProvince('');
      setTargetDistrict('');
      setTargetCity('');
    }
    setTargetShopId('ALL_SHOPS');
    setSubTab(destTab);
  };

  const handleJumpToSingleShop = (shop: TenantShopInfo, destTab: 'push' | 'popup') => {
    setFeedback(null);
    setTargetType('SPECIFIC_SHOP');
    setTargetShopId(shop.id);
    setTargetProvince('');
    setTargetDistrict('');
    setTargetCity('');
    setSubTab(destTab);
  };

  // Apply 1-click seasonal event preset
  const applyPresetToPush = (preset: CampaignTemplatePreset) => {
    setPushTitle(preset.title);
    setPushBody(preset.body);
    setPushEventTag(preset.label);
    setFeedback(null);
  };

  const applyPresetToPopup = (preset: CampaignTemplatePreset) => {
    setPopupCampaignType(preset.campaignType);
    setPopupTheme(preset.theme);
    setPopupBadge(preset.badgeText);
    setPopupTitle(preset.title);
    setPopupBody(preset.body);
    setFeedback(null);
  };

  // =========================================================================
  // PUSH NOTIFICATION HANDLERS
  // =========================================================================
  const handleUploadPushBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeedback(null);
    setIsCompressingPushImg(true);
    try {
      const dataUrl = await compressNotificationBannerFile(file);
      setPushImageUrl(dataUrl);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to process image.' });
    } finally {
      setIsCompressingPushImg(false);
      if (pushFileInputRef.current) pushFileInputRef.current.value = '';
    }
  };

  const handleTestPushOnDevice = async () => {
    setFeedback(null);
    const cleanTitle = pushTitle.trim() || '🚀 NH POS Shop Live Update';
    const cleanBody =
      pushBody.trim() ||
      'Sample preview notification — bilkul isi tarha targeted ilaqay ke shops ke phone par show hogi!';

    let perm = getOsNotificationPermission();
    if (perm === 'default') {
      perm = await requestOsNotificationPermission();
    }
    if (perm !== 'granted') {
      setFeedback({
        type: 'error',
        text:
          perm === 'unsupported'
            ? 'This browser does not support OS push notifications (in-app alert banner will still appear).'
            : 'Notification permission blocked in browser settings. Please allow notifications to preview OS banner.'
      });
      return;
    }

    const ok = await triggerNativeOsRichNotification({
      id: `test_${Date.now()}`,
      title: cleanTitle,
      body: cleanBody,
      imageUrl: sanitizeNotificationImageUrl(pushImageUrl) || undefined,
      ...currentTargetCriteria,
      createdAt: Date.now(),
      createdByEmail: senderEmail,
      createdByName: senderName
    });

    setFeedback(
      ok
        ? { type: 'success', text: '✓ Test rich notification sent to your device notification bar!' }
        : { type: 'error', text: 'Could not trigger OS notification on this browser.' }
    );
  };

  const handleSendPushBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!isFirebaseMasterVerified) {
      setFeedback({
        type: 'error',
        text: 'Please click "Verify Master Gmail" first so Firebase authorizes sending Push Notifications.'
      });
      return;
    }
    if (!pushTitle.trim() || !pushBody.trim()) {
      setFeedback({ type: 'error', text: 'Please enter both Notification Title and Message text.' });
      return;
    }
    if (targetType === 'SPECIFIC_SHOP' && (!targetShopId || targetShopId === 'ALL_SHOPS')) {
      setFeedback({ type: 'error', text: 'Please select a specific shop first.' });
      return;
    }

    setIsSendingPush(true);
    try {
      const res = await sendSuperAdminPushBroadcast({
        title: pushTitle.trim(),
        body: pushBody.trim(),
        imageUrl: pushImageUrl.trim() || undefined,
        eventTag: pushEventTag.trim() || undefined,
        targetType,
        targetProvince: targetType === 'GEO' ? targetProvince : '',
        targetDistrict: targetType === 'GEO' ? targetDistrict : '',
        targetCity: targetType === 'GEO' ? targetCity.trim() : '',
        targetShopId: targetType === 'SPECIFIC_SHOP' ? targetShopId : 'ALL_SHOPS',
        targetShopName: currentTargetCriteria.targetShopName,
        targetRole,
        senderEmail,
        senderName
      });

      if (!res.success || !res.notification) {
        setFeedback({ type: 'error', text: res.error || 'Failed to publish push notification.' });
        return;
      }

      setPushHistory(prev => [res.notification!, ...prev.filter(p => p.id !== res.notification!.id)].slice(0, 20));
      setPushTitle('');
      setPushBody('');
      setPushImageUrl('');
      setPushEventTag('');
      setFeedback({
        type: 'success',
        text: `🚀 Push notification LIVE for ${matchedTargetShops.length} targeted shop(s) (${describeGeoTarget(currentTargetCriteria)})!`
      });
    } finally {
      setIsSendingPush(false);
    }
  };

  const handleDeletePushItem = async (id: string) => {
    if (!isFirebaseMasterVerified) {
      setFeedback({ type: 'error', text: 'Verify Master Gmail first to delete broadcast history.' });
      return;
    }
    setDeletingPushId(id);
    try {
      const res = await deleteSuperAdminPushHistoryItem(id, senderEmail);
      if (res.success && res.history) {
        setPushHistory(res.history);
      } else if (res.error) {
        setFeedback({ type: 'error', text: res.error });
      }
    } finally {
      setDeletingPushId(null);
    }
  };

  // =========================================================================
  // PRIVATE POPUP AD / EVENT CAMPAIGN HANDLERS
  // =========================================================================
  const handleUploadPopupBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeedback(null);
    setIsCompressingPopupImg(true);
    try {
      const dataUrl = await compressNotificationBannerFile(file);
      setPopupImageUrl(dataUrl);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to process popup banner image.' });
    } finally {
      setIsCompressingPopupImg(false);
      if (popupFileInputRef.current) popupFileInputRef.current.value = '';
    }
  };

  const handleTestLivePopupModal = () => {
    const previewCampaign: PopupAdCampaign = {
      id: `preview_${Date.now()}`,
      active: true,
      campaignType: popupCampaignType,
      theme: popupTheme,
      badgeText: popupBadge.trim() || '✨ NH POS Special',
      title: popupTitle.trim() || '🌙 Eid Mubarak from NH POS Shop!',
      body:
        popupBody.trim() ||
        'Yeh live preview hai! Bilkul isi tarha targeted Province / District / City ke tamam shops par yeh popup modal show hoga.',
      imageUrl: sanitizeNotificationImageUrl(popupImageUrl) || undefined,
      ctaLabel: popupCtaLabel.trim() || undefined,
      ctaUrl: sanitizeCampaignCtaUrl(popupCtaUrl) || undefined,
      showFrequency: popupFrequency,
      expiresAt: popupDurationHours > 0 ? Date.now() + popupDurationHours * 3600 * 1000 : null,
      ...currentTargetCriteria,
      createdAt: Date.now(),
      createdByEmail: senderEmail,
      createdByName: senderName
    };
    window.dispatchEvent(new CustomEvent('nh_preview_popup_ad', { detail: previewCampaign }));
  };

  const handleLaunchPopupCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!isFirebaseMasterVerified) {
      setFeedback({
        type: 'error',
        text: 'Please click "Verify Master Gmail" first so Firebase authorizes launching Private Popup Ads.'
      });
      return;
    }
    if (!popupTitle.trim() || !popupBody.trim()) {
      setFeedback({ type: 'error', text: 'Please enter both Popup Headline and Message text.' });
      return;
    }
    if (popupCtaUrl.trim() && !sanitizeCampaignCtaUrl(popupCtaUrl.trim())) {
      setFeedback({
        type: 'error',
        text: 'Action button link must start with https:// (for example https://wa.me/923001234567).'
      });
      return;
    }
    if (targetType === 'SPECIFIC_SHOP' && (!targetShopId || targetShopId === 'ALL_SHOPS')) {
      setFeedback({ type: 'error', text: 'Please select a specific shop first.' });
      return;
    }

    setIsLaunchingPopup(true);
    try {
      const res = await launchSuperAdminPopupAd({
        campaignType: popupCampaignType,
        theme: popupTheme,
        badgeText: popupBadge.trim(),
        title: popupTitle.trim(),
        body: popupBody.trim(),
        imageUrl: popupImageUrl.trim() || undefined,
        ctaLabel: popupCtaLabel.trim() || undefined,
        ctaUrl: popupCtaUrl.trim() || undefined,
        showFrequency: popupFrequency,
        durationHours: popupDurationHours,
        targetType,
        targetProvince: targetType === 'GEO' ? targetProvince : '',
        targetDistrict: targetType === 'GEO' ? targetDistrict : '',
        targetCity: targetType === 'GEO' ? targetCity.trim() : '',
        targetShopId: targetType === 'SPECIFIC_SHOP' ? targetShopId : 'ALL_SHOPS',
        targetShopName: currentTargetCriteria.targetShopName,
        targetRole,
        senderEmail,
        senderName
      });

      if (!res.success || !res.campaign) {
        setFeedback({ type: 'error', text: res.error || 'Failed to launch popup campaign.' });
        return;
      }

      setActivePopup(res.campaign);
      setPopupHistory(prev =>
        [res.campaign!, ...prev.map(c => ({ ...c, active: false }))].slice(0, 20)
      );
      setFeedback({
        type: 'success',
        text: `🎉 Private Popup Ad is NOW LIVE for ${matchedTargetShops.length} targeted shop(s) (${describeGeoTarget(currentTargetCriteria)})!`
      });
    } finally {
      setIsLaunchingPopup(false);
    }
  };

  const handleTogglePopupActive = async (campaign: PopupAdCampaign, nextActive: boolean) => {
    if (!isFirebaseMasterVerified) {
      setFeedback({ type: 'error', text: 'Verify Master Gmail first to pause or activate popup ads.' });
      return;
    }
    setBusyPopupId(campaign.id);
    try {
      const res = await toggleSuperAdminPopupAdActive(campaign.id, nextActive, senderEmail);
      if (res.success) {
        setActivePopup(res.activeCampaign || null);
        if (res.history) setPopupHistory(res.history);
        setFeedback({
          type: 'success',
          text: nextActive
            ? `▶️ Popup "${campaign.title}" is now LIVE again.`
            : `⏸️ Popup "${campaign.title}" has been paused across all shops.`
        });
      } else if (res.error) {
        setFeedback({ type: 'error', text: res.error });
      }
    } finally {
      setBusyPopupId(null);
    }
  };

  const handleDeletePopupItem = async (id: string) => {
    if (!isFirebaseMasterVerified) {
      setFeedback({ type: 'error', text: 'Verify Master Gmail first to delete popup campaigns.' });
      return;
    }
    setBusyPopupId(id);
    try {
      const res = await deleteSuperAdminPopupAd(id, senderEmail);
      if (res.success) {
        setActivePopup(res.activeCampaign || null);
        if (res.history) setPopupHistory(res.history);
      } else if (res.error) {
        setFeedback({ type: 'error', text: res.error });
      }
    } finally {
      setBusyPopupId(null);
    }
  };

  const safePushPreviewImg = sanitizeNotificationImageUrl(pushImageUrl);
  const safePopupPreviewImg = sanitizeNotificationImageUrl(popupImageUrl);
  const liveActivePopupExists = isActivePopupCampaign(activePopup);

  // =========================================================================
  // REUSABLE PIN-POINT GEO TARGETING BOX (Shared cleanly by Push & Popup Tabs)
  // =========================================================================
  const renderGeoTargetSelector = () => (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-indigo-600" />
          <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
            Pin-Point Audience Targeting (کِن یوزرز کو بھیجنا ہے)
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowMatchedPreview(v => !v)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-100 hover:bg-indigo-200 text-indigo-800 text-[11px] font-black transition-colors cursor-pointer"
        >
          <span>🎯 Reach: {matchedTargetShops.length} / {shops.length} Shops</span>
          {showMatchedPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Scope Mode Switcher */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => {
            setTargetType('ALL_SHOPS');
            setTargetShopId('ALL_SHOPS');
          }}
          className={`py-2 px-2.5 rounded-xl text-[11px] font-black border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            targetType === 'ALL_SHOPS'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
              : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
          }`}
        >
          <Globe2 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">All Shops</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setTargetType('GEO');
            setTargetShopId('ALL_SHOPS');
          }}
          className={`py-2 px-2.5 rounded-xl text-[11px] font-black border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            targetType === 'GEO'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
              : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300'
          }`}
        >
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Province / District / City</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setTargetType('SPECIFIC_SHOP');
            if (targetShopId === 'ALL_SHOPS' && shops.length > 0) {
              setTargetShopId(shops[0].id);
            }
          }}
          className={`py-2 px-2.5 rounded-xl text-[11px] font-black border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            targetType === 'SPECIFIC_SHOP'
              ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
              : 'bg-white text-slate-700 border-slate-200 hover:border-amber-300'
          }`}
        >
          <Building2 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Specific Shop</span>
        </button>
      </div>

      {/* GEO Pin-Point Cascading Pickers */}
      {targetType === 'GEO' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <div>
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
              Province (صوبہ)
            </label>
            <select
              value={targetProvince}
              onChange={e => {
                setTargetProvince(e.target.value);
                setTargetDistrict('');
              }}
              className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All Provinces (پورا پاکستان)</option>
              {PAKISTAN_PROVINCES.map(p => (
                <option key={p.name} value={p.name}>
                  {p.name} ({geoStats.provinceCounts[p.name] || 0})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
              District (ضلع)
            </label>
            <select
              value={targetDistrict}
              onChange={e => setTargetDistrict(e.target.value)}
              className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All Districts</option>
              {targetDistrictOptions.map(d => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
              City / Town (شہر — Optional)
            </label>
            <input
              type="text"
              list="nh-registered-cities-list"
              value={targetCity}
              onChange={e => setTargetCity(e.target.value)}
              placeholder="e.g. Rahim Yar Khan, Saddar"
              className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <datalist id="nh-registered-cities-list">
              {geoStats.uniqueCities.map(c => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>
      )}

      {/* Specific Shop Selector */}
      {targetType === 'SPECIFIC_SHOP' && (
        <div className="pt-1">
          <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
            Select Specific Shop
          </label>
          <select
            value={targetShopId}
            onChange={e => setTargetShopId(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
          >
            {shops.map(s => {
              const loc = formatShopLocationLine(s);
              return (
                <option key={s.id} value={s.id}>
                  🏪 {s.shop_name} — {s.owner_name}
                  {loc ? ` (${loc})` : ''}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {/* Target User Role Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/80">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
          <Users className="w-3.5 h-3.5 text-slate-500" />
          <span>Target Role:</span>
        </div>
        <div className="flex items-center gap-1.5">
          {([
            { id: 'all', label: 'All Users' },
            { id: 'admin', label: 'Owners / Admins' },
            { id: 'staff', label: 'Staff Only' }
          ] as { id: PushTargetRole; label: string }[]).map(roleOpt => (
            <button
              key={roleOpt.id}
              type="button"
              onClick={() => setTargetRole(roleOpt.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                targetRole === roleOpt.id
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {roleOpt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Expandable Matched Shops Preview List */}
      {showMatchedPreview && (
        <div className="bg-white border border-indigo-200 rounded-xl p-2.5 max-h-36 overflow-y-auto space-y-1">
          {matchedTargetShops.length === 0 ? (
            <p className="text-[11px] text-rose-600 font-semibold text-center py-2">
              No registered shops currently match this area filter. (Future shops in this area will still match if Popup stays active.)
            </p>
          ) : (
            matchedTargetShops.map(s => (
              <div
                key={s.id}
                className="flex items-center justify-between text-[11px] py-1 px-2 rounded-lg bg-slate-50"
              >
                <span className="font-bold text-slate-800 truncate">{s.shop_name}</span>
                <span className="text-[10px] text-slate-500 font-medium shrink-0 ml-2">
                  📍 {formatShopLocationLine(s) || 'Location not set'}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Top Studio Header & Sub-Tab Navigation */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-4 sm:p-5 text-white shadow-lg border border-indigo-500/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-black uppercase tracking-wider mb-1.5">
              <Sparkles className="w-3 h-3" />
              <span>Super Admin Exclusive Module</span>
            </div>
            <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-amber-400 shrink-0" />
              <span>Geo Audience, Push Notifications &amp; Private Popup Ads</span>
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Province, District aur City wise shops track karein — aur Eid, 14 August ya Private Ads pin-point area par bhejein.
            </p>
          </div>

          <button
            type="button"
            onClick={loadCloudData}
            className="self-start sm:self-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white border border-white/15 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPushHistory || isLoadingPopups ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* 3 Clean Studio Mode Tabs */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <button
            type="button"
            onClick={() => {
              setSubTab('geo');
              setFeedback(null);
            }}
            className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
              subTab === 'geo'
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                : 'bg-white/10 text-slate-200 hover:bg-white/15'
            }`}
          >
            <MapPin className="w-4 h-4 shrink-0" />
            <span className="truncate">Geo Audience ({shops.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubTab('push');
              setFeedback(null);
            }}
            className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
              subTab === 'push'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                : 'bg-white/10 text-slate-200 hover:bg-white/15'
            }`}
          >
            <Bell className="w-4 h-4 shrink-0" />
            <span className="truncate">Rich Push Alerts</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubTab('popup');
              setFeedback(null);
            }}
            className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer relative ${
              subTab === 'popup'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                : 'bg-white/10 text-slate-200 hover:bg-white/15'
            }`}
          >
            <ImageIcon className="w-4 h-4 shrink-0" />
            <span className="truncate">Private Popup Ads</span>
            {liveActivePopupExists && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" title="Live Popup Active" />
            )}
          </button>
        </div>
      </div>

      {/* Master Firebase Verification Gate */}
      {!isFirebaseMasterVerified && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-black text-amber-950">
                Cloud Broadcast Authorization Required
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Push Notifications ya Private Popup Ads live bhejne ke liye apna Master Super Admin Gmail verify karein.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isVerifyingCloudAuth}
            onClick={onVerifyMasterGoogleCloudAuth}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl shadow-sm shrink-0 cursor-pointer disabled:opacity-60"
          >
            {isVerifyingCloudAuth ? 'Verifying...' : 'Verify Master Gmail'}
          </button>
        </div>
      )}

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`rounded-2xl p-3.5 border flex items-center justify-between gap-3 text-xs font-bold ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 1: GEO AUDIENCE EXPLORER (Province -> District -> City)       */}
      {/* ===================================================================== */}
      {subTab === 'geo' && (
        <div className="space-y-4">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Shops</span>
              <span className="text-xl font-black text-slate-900">{geoStats.totalShops}</span>
              <span className="text-[10px] text-emerald-600 font-bold block mt-0.5">
                {geoStats.mappedCount} Geo-Mapped · {geoStats.unmappedCount} Legacy
              </span>
            </div>
            <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Provinces Covered</span>
              <span className="text-xl font-black text-indigo-700">{geoStats.activeProvincesCount}</span>
              <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">of 7 Regions</span>
            </div>
            <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Districts Covered</span>
              <span className="text-xl font-black text-emerald-700">{geoStats.activeDistrictsCount}</span>
              <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">Active Districts</span>
            </div>
            <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Cities / Towns</span>
              <span className="text-xl font-black text-amber-600">{geoStats.uniqueCities.length}</span>
              <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">Tracked Cities</span>
            </div>
          </div>

          {/* Province Breakdown Selector Cards */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-emerald-600" />
                <span>1. Select Province (صوبہ وار دکانیں)</span>
              </h3>
              {(geoFilterProvince !== 'ALL' || geoFilterDistrict !== 'ALL' || geoFilterCity || geoSearchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setGeoFilterProvince('ALL');
                    setGeoFilterDistrict('ALL');
                    setGeoFilterCity('');
                    setGeoSearchQuery('');
                  }}
                  className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                >
                  Clear All Filters
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              <button
                type="button"
                onClick={() => {
                  setGeoFilterProvince('ALL');
                  setGeoFilterDistrict('ALL');
                }}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  geoFilterProvince === 'ALL'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black">All Pakistan</span>
                  <span className={`text-xs font-black px-1.5 py-0.5 rounded-md ${geoFilterProvince === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-800'}`}>
                    {geoStats.totalShops}
                  </span>
                </div>
                <span className={`text-[10px] block mt-0.5 ${geoFilterProvince === 'ALL' ? 'text-slate-300' : 'text-slate-400'}`}>
                  تمام صوبے
                </span>
              </button>

              {PAKISTAN_PROVINCES.map(p => {
                const count = geoStats.provinceCounts[p.name] || 0;
                const active = geoFilterProvince === p.name;
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => {
                      setGeoFilterProvince(p.name);
                      setGeoFilterDistrict('ALL');
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      active
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                        : count > 0
                        ? 'bg-emerald-50/50 text-slate-800 border-emerald-200 hover:border-emerald-400'
                        : 'bg-slate-50/60 text-slate-500 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-black truncate">{p.name}</span>
                      <span
                        className={`text-xs font-black px-1.5 py-0.5 rounded-md shrink-0 ${
                          active
                            ? 'bg-white/20 text-white'
                            : count > 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-500'
                        }`}
                      >
                        {count}
                      </span>
                    </div>
                    <span className={`text-[10px] block mt-0.5 ${active ? 'text-emerald-100' : 'text-slate-400'}`}>
                      {p.urduName}
                    </span>
                  </button>
                );
              })}

              {geoStats.unmappedCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setGeoFilterProvince('UNMAPPED');
                    setGeoFilterDistrict('ALL');
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    geoFilterProvince === 'UNMAPPED'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-sm'
                      : 'bg-amber-50/70 text-amber-900 border-amber-200 hover:border-amber-400'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-black truncate">Unmapped</span>
                    <span className={`text-xs font-black px-1.5 py-0.5 rounded-md ${geoFilterProvince === 'UNMAPPED' ? 'bg-white/20 text-white' : 'bg-amber-200 text-amber-900'}`}>
                      {geoStats.unmappedCount}
                    </span>
                  </div>
                  <span className={`text-[10px] block mt-0.5 ${geoFilterProvince === 'UNMAPPED' ? 'text-amber-100' : 'text-amber-700'}`}>
                    Old signups (no area)
                  </span>
                </button>
              )}
            </div>

            {/* District Breakdown Chips + City Filter */}
            <div className="pt-2 border-t border-slate-100 space-y-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-black text-slate-600 mr-1">2. District:</span>
                <button
                  type="button"
                  onClick={() => setGeoFilterDistrict('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                    geoFilterDistrict === 'ALL'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  All Districts
                </button>
                {explorerDistrictBreakdown.length === 0 ? (
                  <span className="text-[11px] text-slate-400 italic">
                    No districts recorded in this filter yet.
                  </span>
                ) : (
                  explorerDistrictBreakdown.map(([distName, cnt]) => (
                    <button
                      key={distName}
                      type="button"
                      onClick={() => setGeoFilterDistrict(distName)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                        geoFilterDistrict === distName
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      {distName} <span className="opacity-75">({cnt})</span>
                    </button>
                  ))
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    list="nh-explorer-cities"
                    value={geoFilterCity}
                    onChange={e => setGeoFilterCity(e.target.value)}
                    placeholder="Filter by City / Town (optional)..."
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <datalist id="nh-explorer-cities">
                    {geoStats.uniqueCities.map(c => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={geoSearchQuery}
                    onChange={e => setGeoSearchQuery(e.target.value)}
                    placeholder="Search shop name, owner, phone, email..."
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 1-Click Campaign Launch Action Bar for Filtered Area */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-indigo-950">
                Showing {explorerFilteredShops.length} of {shops.length} Registered Shop(s)
              </p>
              <p className="text-[11px] text-indigo-700 font-medium">
                {geoFilterProvince === 'UNMAPPED'
                  ? 'Viewing legacy shops without location info'
                  : `Selected Area: ${[
                      geoFilterCity.trim(),
                      geoFilterDistrict !== 'ALL' ? geoFilterDistrict : '',
                      geoFilterProvince !== 'ALL' ? geoFilterProvince : 'All Pakistan'
                    ]
                      .filter(Boolean)
                      .join(', ')}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleJumpToCampaignWithGeoFilter('push')}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>Send Push to Area ({explorerFilteredShops.length})</span>
              </button>
              <button
                type="button"
                onClick={() => handleJumpToCampaignWithGeoFilter('popup')}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Launch Popup Ad ({explorerFilteredShops.length})</span>
              </button>
            </div>
          </div>

          {/* Filtered Shops Directory Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500">
                    <th className="py-2.5 px-4">Shop &amp; Owner</th>
                    <th className="py-2.5 px-4">Province / District / City</th>
                    <th className="py-2.5 px-4 text-right">Quick Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {explorerFilteredShops.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-slate-400 font-semibold">
                        No shops match this Province / District / City filter.
                      </td>
                    </tr>
                  ) : (
                    explorerFilteredShops.map(shop => {
                      const locLine = formatShopLocationLine(shop);
                      return (
                        <tr key={shop.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{shop.shop_name}</div>
                            <div className="text-[11px] text-slate-500">
                              {shop.owner_name} {shop.phone ? `· 📞 ${shop.phone}` : ''}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {locLine ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span>{locLine}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-semibold">
                                Not updated yet
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleJumpToSingleShop(shop, 'push')}
                                className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold cursor-pointer"
                              >
                                🔔 Push
                              </button>
                              <button
                                type="button"
                                onClick={() => handleJumpToSingleShop(shop, 'popup')}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold cursor-pointer"
                              >
                                🖼️ Popup
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 2: GEO-TARGETED RICH PUSH NOTIFICATION STUDIO                 */}
      {/* ===================================================================== */}
      {subTab === 'push' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Composer */}
          <form
            onSubmit={handleSendPushBroadcast}
            className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4"
          >
            {/* 1-Click Event Templates */}
            <div>
              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1.5">
                ⚡ 1-Click Event Quick Templates
              </span>
              <div className="flex flex-wrap gap-1.5">
                {EVENT_CAMPAIGN_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPresetToPush(preset)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 text-[11px] font-bold text-slate-700 transition-colors cursor-pointer"
                  >
                    {preset.emoji} {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pin-Point Geo Selector */}
            {renderGeoTargetSelector()}

            {/* Title & Message */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Notification Headline *
                </label>
                <input
                  type="text"
                  maxLength={110}
                  value={pushTitle}
                  onChange={e => setPushTitle(e.target.value)}
                  placeholder="e.g. 🌙 Eid Mubarak from NH POS Shop!"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Notification Message *
                </label>
                <textarea
                  rows={3}
                  maxLength={650}
                  value={pushBody}
                  onChange={e => setPushBody(e.target.value)}
                  placeholder="Write your clear announcement or festival wish in English / Roman Urdu / Urdu..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                  required
                />
              </div>

              {/* Optional BigPicture Banner */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-amber-600" />
                    <span>Banner Picture (Optional — MyZong BigPicture Style)</span>
                  </label>
                  {pushImageUrl && (
                    <button
                      type="button"
                      onClick={() => setPushImageUrl('')}
                      className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                    >
                      Remove Photo
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    ref={pushFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleUploadPushBanner}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isCompressingPushImg}
                    onClick={() => pushFileInputRef.current?.click()}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-60"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isCompressingPushImg ? 'Compressing...' : 'Upload Picture'}</span>
                  </button>
                  <input
                    type="url"
                    value={pushImageUrl.startsWith('data:') ? '' : pushImageUrl}
                    onChange={e => setPushImageUrl(e.target.value)}
                    placeholder="Or paste https:// banner image URL..."
                    className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleTestPushOnDevice}
                className="sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Bell className="w-4 h-4 text-amber-600" />
                <span>Test on My Device</span>
              </button>

              <button
                type="submit"
                disabled={isSendingPush || !isFirebaseMasterVerified}
                className="flex-1 py-2.5 px-5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>
                  {isSendingPush
                    ? 'Sending Broadcast...'
                    : `Send Push to ${matchedTargetShops.length} Shop(s)`}
                </span>
              </button>
            </div>
          </form>

          {/* Right Column: Live Android Notification Preview + Sent History */}
          <div className="lg:col-span-5 space-y-4">
            {/* Live Android Dark Notification Shade Preview */}
            <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800 shadow-md">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Live Android Phone Preview
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                  {safePushPreviewImg ? 'MyZong BigPicture' : 'Alfa Clean Style'}
                </span>
              </div>

              <div className="bg-[#1f2023] border border-white/10 rounded-[22px] p-3.5 text-white shadow-xl">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0">
                      <img src="icon-192.png" alt="NH POS" className="w-4 h-4 object-contain" />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-300 truncate">
                      NH POS Shop · now
                    </span>
                  </div>
                  <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                    <ChevronUp className="w-3 h-3 text-slate-300" />
                  </div>
                </div>
                <p className="text-[13px] font-extrabold text-white leading-snug">
                  {pushTitle.trim() || '🚀 Your Headline Appears Here'}
                </p>
                <p className="text-[12px] text-slate-300 leading-relaxed mt-1 whitespace-pre-line">
                  {pushBody.trim() ||
                    'Type your message on the left to preview how it appears on targeted users’ phones.'}
                </p>
                {safePushPreviewImg && (
                  <div className="mt-2.5 rounded-xl overflow-hidden border border-white/10 bg-black/40">
                    <img
                      src={safePushPreviewImg}
                      alt="Banner Preview"
                      className="w-full max-h-40 object-cover"
                    />
                  </div>
                )}
              </div>
              <p className="text-[10px] text-slate-400 mt-2.5 text-center">
                Target: <strong className="text-amber-300">{describeGeoTarget(currentTargetCriteria)}</strong> · Role:{' '}
                <strong className="text-slate-200 uppercase">{targetRole}</strong>
              </p>
            </div>

            {/* Sent Push History */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-800 uppercase">
                  Recent Push Broadcasts ({pushHistory.length})
                </h3>
              </div>

              {isLoadingPushHistory ? (
                <p className="text-xs text-slate-400 text-center py-6">Loading history...</p>
              ) : pushHistory.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  No push notifications sent yet.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {pushHistory.map(item => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-black text-slate-900 leading-snug">{item.title}</p>
                        <button
                          type="button"
                          disabled={deletingPushId === item.id}
                          onClick={() => handleDeletePushItem(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer shrink-0"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-600 line-clamp-2">{item.body}</p>
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt="Sent banner"
                          className="w-full h-20 object-cover rounded-lg border border-slate-200"
                        />
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-1 pt-1 text-[10px] font-bold text-slate-500">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {describeGeoTarget(item)}
                        </span>
                        <span>{new Date(item.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 3: PRIVATE POPUP ADS & SEASONAL EVENT CAMPAIGNS STUDIO        */}
      {/* ===================================================================== */}
      {subTab === 'popup' && (
        <div className="space-y-4">
          {/* Currently Live Popup Kill-Switch Bar */}
          {liveActivePopupExists && activePopup && (
            <div className="bg-emerald-950 text-white rounded-2xl p-4 border border-emerald-500/40 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse mt-1 shrink-0" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      LIVE POPUP AD ACTIVE
                    </span>
                    <span className="text-[11px] font-bold text-emerald-200">
                      {describeGeoTarget(activePopup)}
                    </span>
                  </div>
                  <p className="text-sm font-black mt-1">{activePopup.title}</p>
                  <p className="text-[11px] text-emerald-200/80 line-clamp-1">{activePopup.body}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    window.dispatchEvent(new CustomEvent('nh_preview_popup_ad', { detail: activePopup }))
                  }
                  className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View</span>
                </button>
                <button
                  type="button"
                  disabled={busyPopupId === activePopup.id}
                  onClick={() => handleTogglePopupActive(activePopup, false)}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Turn Off Popup</span>
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Popup Campaign Composer */}
            <form
              onSubmit={handleLaunchPopupCampaign}
              className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4"
            >
              {/* 1-Click Seasonal Event / Private Ad Presets */}
              <div>
                <span className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1.5">
                  🎉 1-Click Festival &amp; Private Ad Templates
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {EVENT_CAMPAIGN_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPresetToPopup(preset)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-[11px] font-bold text-slate-700 transition-colors cursor-pointer"
                    >
                      {preset.emoji} {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pin-Point Geo Selector */}
              {renderGeoTargetSelector()}

              {/* Campaign Type & Theme Picker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Campaign Category
                  </label>
                  <select
                    value={popupCampaignType}
                    onChange={e => setPopupCampaignType(e.target.value as PopupCampaignType)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="event_greeting">🎉 Event Greeting (Eid / 14 Aug / Milad)</option>
                    <option value="private_ad">🔥 Private Popup Ad / Sponsor Offer</option>
                    <option value="announcement">📢 Platform Announcement</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Visual Theme Color
                  </label>
                  <div className="flex items-center gap-1.5 pt-0.5">
                    {(Object.keys(THEME_PREVIEW_STYLES) as PopupThemePreset[]).map(tKey => {
                      const st = THEME_PREVIEW_STYLES[tKey];
                      return (
                        <button
                          key={tKey}
                          type="button"
                          onClick={() => setPopupTheme(tKey)}
                          className={`flex-1 py-1.5 px-2 rounded-xl border text-[10px] font-black flex items-center justify-center gap-1 cursor-pointer transition-all ${
                            popupTheme === tKey
                              ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                              : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <span className={`w-2.5 h-2.5 rounded-full ${st.dot}`} />
                          <span className="hidden sm:inline truncate">{st.label.split(' ')[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Badge, Headline, Body */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Top Ribbon Badge (Optional)
                    </label>
                    <input
                      type="text"
                      maxLength={48}
                      value={popupBadge}
                      onChange={e => setPopupBadge(e.target.value)}
                      placeholder="e.g. 🌙 Eid Mubarak Special"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Popup Headline *
                    </label>
                    <input
                      type="text"
                      maxLength={120}
                      value={popupTitle}
                      onChange={e => setPopupTitle(e.target.value)}
                      placeholder="e.g. Special Offer for Multan Shops!"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-900 outline-none focus:ring-2 focus:ring-rose-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Popup Message / Offer Details *
                  </label>
                  <textarea
                    rows={3}
                    maxLength={750}
                    value={popupBody}
                    onChange={e => setPopupBody(e.target.value)}
                    placeholder="Write your event greeting or private ad details..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-rose-500 resize-none"
                    required
                  />
                </div>

                {/* Banner Poster Upload / URL */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-rose-600" />
                      <span>Ad / Event Poster Picture (Optional)</span>
                    </label>
                    {popupImageUrl && (
                      <button
                        type="button"
                        onClick={() => setPopupImageUrl('')}
                        className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                      >
                        Remove Poster
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      ref={popupFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleUploadPopupBanner}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={isCompressingPopupImg}
                      onClick={() => popupFileInputRef.current?.click()}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-60"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isCompressingPopupImg ? 'Compressing...' : 'Upload Poster'}</span>
                    </button>
                    <input
                      type="url"
                      value={popupImageUrl.startsWith('data:') ? '' : popupImageUrl}
                      onChange={e => setPopupImageUrl(e.target.value)}
                      placeholder="Or paste https:// poster image URL..."
                      className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>

                {/* Optional CTA Button + Frequency & Auto-Expiry */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Action Button Text (Optional)
                    </label>
                    <input
                      type="text"
                      maxLength={40}
                      value={popupCtaLabel}
                      onChange={e => setPopupCtaLabel(e.target.value)}
                      placeholder="e.g. Order on WhatsApp"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Action Link (Optional — https:// only)
                    </label>
                    <input
                      type="url"
                      value={popupCtaUrl}
                      onChange={e => setPopupCtaUrl(e.target.value)}
                      placeholder="https://wa.me/923..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Show Frequency
                    </label>
                    <select
                      value={popupFrequency}
                      onChange={e => setPopupFrequency(e.target.value as PopupShowFrequency)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-rose-500"
                    >
                      <option value="once">Once per User (Non-Intrusive)</option>
                      <option value="daily">Once Daily (While Active)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                      <CalendarClock className="w-3.5 h-3.5 text-slate-500" />
                      <span>Auto-Expiry Duration</span>
                    </label>
                    <select
                      value={popupDurationHours}
                      onChange={e => setPopupDurationHours(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-rose-500"
                    >
                      <option value={24}>24 Hours (1 Day)</option>
                      <option value={72}>3 Days (Eid / Weekend)</option>
                      <option value={168}>7 Days (1 Week)</option>
                      <option value={720}>30 Days (1 Month)</option>
                      <option value={0}>No Expiry (Manual Turn-Off)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleTestLivePopupModal}
                  className="sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-4 h-4 text-rose-600" />
                  <span>Test Live Popup Now</span>
                </button>

                <button
                  type="submit"
                  disabled={isLaunchingPopup || !isFirebaseMasterVerified}
                  className="flex-1 py-2.5 px-5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Megaphone className="w-4 h-4" />
                  <span>
                    {isLaunchingPopup
                      ? 'Launching Popup Ad...'
                      : `Launch Live Popup to ${matchedTargetShops.length} Shop(s)`}
                  </span>
                </button>
              </div>
            </form>

            {/* Right Column: Live Visual Popup Preview + Campaigns History */}
            <div className="lg:col-span-5 space-y-4">
              {/* Live Mini Visual Modal Preview */}
              <div className="bg-slate-900/95 rounded-2xl p-4 border border-slate-800 shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Live Popup Modal Preview
                  </span>
                  <span className="text-[10px] font-bold text-emerald-300">
                    {describeGeoTarget(currentTargetCriteria)}
                  </span>
                </div>

                <div className="bg-white rounded-2xl overflow-hidden shadow-2xl border border-white/15">
                  <div
                    className={`bg-gradient-to-r ${THEME_PREVIEW_STYLES[popupTheme].headerBg} px-4 py-3 text-white`}
                  >
                    <span className="inline-block px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-black uppercase">
                      {popupBadge.trim() || '✨ NH POS Special'}
                    </span>
                    <h4 className="text-sm font-black mt-1.5 leading-snug">
                      {popupTitle.trim() || 'Your Popup Ad / Event Headline'}
                    </h4>
                  </div>

                  {safePopupPreviewImg && (
                    <div className="bg-slate-100">
                      <img
                        src={safePopupPreviewImg}
                        alt="Popup preview"
                        className="w-full max-h-40 object-cover"
                      />
                    </div>
                  )}

                  <div className="p-4 space-y-3">
                    <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                      {popupBody.trim() ||
                        'Write your seasonal wish or private ad details to see the exact popup users will receive.'}
                    </p>
                    <div className="flex items-center gap-2">
                      {popupCtaLabel.trim() && sanitizeCampaignCtaUrl(popupCtaUrl) && (
                        <span
                          className={`flex-1 py-2 px-3 rounded-xl text-white text-center text-xs font-black inline-flex items-center justify-center gap-1 ${THEME_PREVIEW_STYLES[popupTheme].btnBg}`}
                        >
                          <span>{popupCtaLabel.trim()}</span>
                          <ExternalLink className="w-3 h-3" />
                        </span>
                      )}
                      <span className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold text-center flex-1">
                        Close
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Popup Campaigns History */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
                <h3 className="text-xs font-black text-slate-800 uppercase">
                  Popup Ad Campaigns ({popupHistory.length})
                </h3>

                {isLoadingPopups ? (
                  <p className="text-xs text-slate-400 text-center py-6">Loading campaigns...</p>
                ) : popupHistory.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">
                    No private popup ads launched yet.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                    {popupHistory.map(camp => {
                      const isLiveNow = isActivePopupCampaign(camp) && activePopup?.id === camp.id;
                      return (
                        <div
                          key={camp.id}
                          className={`p-3 rounded-xl border space-y-2 ${
                            isLiveNow
                              ? 'bg-emerald-50/70 border-emerald-300'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span
                                  className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                                    isLiveNow
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-slate-200 text-slate-600'
                                  }`}
                                >
                                  {isLiveNow ? 'LIVE' : 'PAUSED'}
                                </span>
                                <span className="text-[10px] font-bold text-indigo-700 truncate">
                                  {describeGeoTarget(camp)}
                                </span>
                              </div>
                              <p className="text-xs font-black text-slate-900 truncate">{camp.title}</p>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={busyPopupId === camp.id}
                                onClick={() => handleTogglePopupActive(camp, !isLiveNow)}
                                className={`p-1.5 rounded-lg border text-[10px] font-bold cursor-pointer ${
                                  isLiveNow
                                    ? 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200'
                                    : 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200'
                                }`}
                                title={isLiveNow ? 'Pause Popup' : 'Make Live'}
                              >
                                {isLiveNow ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                type="button"
                                disabled={busyPopupId === camp.id}
                                onClick={() => handleDeletePopupItem(camp.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                title="Delete Campaign"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-600 line-clamp-2">{camp.body}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
