/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Global Rich Push Notification & Private Popup Ad Receiver
 * - Evaluates pin-point geo-targeting (Province, District, City, Specific Shop, Role)
 * - Channel 1: Rich Push Notification (OS BigPictureStyle + Alfa/MyZong dark top banner)
 * - Channel 2: Private Popup Ad / Seasonal Event Modal (Eid, Milad, 14 August, Offers)
 * - Supports live local preview event ('nh_preview_popup_ad') for Super Admin testing
 */

import React, { useEffect, useState } from 'react';
import { Bell, ChevronUp, X, ExternalLink, Sparkles } from 'lucide-react';
import { usePOS } from '../context/POSContext';
import {
  RichPushNotification,
  PopupAdCampaign,
  PopupThemePreset,
  subscribeToPushBroadcasts,
  subscribeToActivePopupAds,
  matchesNotificationTarget,
  isFreshBroadcast,
  isActivePopupCampaign,
  hasSeenPushNotification,
  markPushNotificationSeen,
  hasSeenPopupAd,
  markPopupAdSeen,
  triggerNativeOsRichNotification,
  sanitizeNotificationImageUrl,
  sanitizeCampaignCtaUrl,
  getOsNotificationPermission,
  requestOsNotificationPermission
} from '../utils/pushNotifications';

const POPUP_THEME_STYLES: Record<
  PopupThemePreset,
  { headerBg: string; badgeBg: string; ctaBg: string; ring: string }
> = {
  emerald: {
    headerBg: 'from-emerald-700 via-teal-700 to-emerald-900',
    badgeBg: 'bg-emerald-400/20 text-emerald-100 border-emerald-300/40',
    ctaBg: 'from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700',
    ring: 'border-emerald-200'
  },
  gold: {
    headerBg: 'from-amber-600 via-yellow-600 to-amber-800',
    badgeBg: 'bg-amber-200/25 text-amber-50 border-amber-200/45',
    ctaBg: 'from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700',
    ring: 'border-amber-200'
  },
  pakistan: {
    headerBg: 'from-[#01411C] via-emerald-800 to-[#0a5c2b]',
    badgeBg: 'bg-white/20 text-white border-white/40',
    ctaBg: 'from-[#01411C] to-emerald-700 hover:from-emerald-900 hover:to-emerald-800',
    ring: 'border-emerald-300'
  },
  indigo: {
    headerBg: 'from-indigo-700 via-purple-700 to-slate-900',
    badgeBg: 'bg-indigo-300/20 text-indigo-100 border-indigo-300/40',
    ctaBg: 'from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700',
    ring: 'border-indigo-200'
  },
  rose: {
    headerBg: 'from-rose-600 via-pink-600 to-rose-800',
    badgeBg: 'bg-rose-200/25 text-white border-rose-200/45',
    ctaBg: 'from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700',
    ring: 'border-rose-200'
  }
};

export const PushNotificationHost: React.FC = () => {
  const { currentUser, currentShop, isDemoMode } = usePOS();
  const [activeNotif, setActiveNotif] = useState<RichPushNotification | null>(null);
  const [activePopup, setActivePopup] = useState<PopupAdCampaign | null>(null);
  const [isPreviewPopup, setIsPreviewPopup] = useState<boolean>(false);
  const [osPerm, setOsPerm] = useState<NotificationPermission | 'unsupported'>(() =>
    getOsNotificationPermission()
  );

  const userShopContext = {
    id: currentShop?.id || currentUser?.shopId || '',
    province: currentShop?.province || '',
    district: currentShop?.district || '',
    city: currentShop?.city || '',
    address: currentShop?.address || ''
  };
  const userRole = currentUser?.role || '';

  // 1. Live Super Admin Rich Push Broadcast Listener (Disabled in Demo Mode = 0 background reads)
  useEffect(() => {
    if (!currentUser || isDemoMode || currentUser.isDemo) return;

    const unsubscribe = subscribeToPushBroadcasts(notif => {
      if (!notif || !notif.id) return;
      if (!isFreshBroadcast(notif)) return;
      if (!matchesNotificationTarget(notif, userShopContext, userRole)) return;
      if (hasSeenPushNotification(notif.id)) return;

      markPushNotificationSeen(notif.id);
      setActiveNotif(notif);
      setOsPerm(getOsNotificationPermission());
      triggerNativeOsRichNotification(notif);
    });

    return () => unsubscribe();
  }, [
    currentUser,
    isDemoMode,
    userShopContext.id,
    userShopContext.province,
    userShopContext.district,
    userShopContext.city,
    userShopContext.address,
    userRole
  ]);

  // 2. Live Super Admin Private Popup Ad / Event Greeting Modal Listener (Disabled in Demo Mode = 0 background reads)
  useEffect(() => {
    if (!currentUser || isDemoMode || currentUser.isDemo) return;

    const unsubscribe = subscribeToActivePopupAds(campaign => {
      if (!campaign || !isActivePopupCampaign(campaign)) return;
      if (!matchesNotificationTarget(campaign, userShopContext, userRole)) return;
      if (hasSeenPopupAd(campaign)) return;

      markPopupAdSeen(campaign);
      setIsPreviewPopup(false);
      setActivePopup(campaign);
    });

    return () => unsubscribe();
  }, [
    currentUser,
    isDemoMode,
    userShopContext.id,
    userShopContext.province,
    userShopContext.district,
    userShopContext.city,
    userShopContext.address,
    userRole
  ]);

  // 3. Super Admin Local Test Preview Listener (fires real modal without persisting seen state)
  useEffect(() => {
    const onPreviewPopup = (ev: Event) => {
      const detail = (ev as CustomEvent<PopupAdCampaign>).detail;
      if (detail && detail.title) {
        setIsPreviewPopup(true);
        setActivePopup(detail);
      }
    };
    window.addEventListener('nh_preview_popup_ad', onPreviewPopup);
    return () => window.removeEventListener('nh_preview_popup_ad', onPreviewPopup);
  }, []);

  const handleEnableOsAlerts = async () => {
    const result = await requestOsNotificationPermission();
    setOsPerm(result);
    if (result === 'granted' && activeNotif) {
      triggerNativeOsRichNotification(activeNotif);
    }
  };

  const safeNotifBanner = activeNotif ? sanitizeNotificationImageUrl(activeNotif.imageUrl) : '';
  const safePopupBanner = activePopup ? sanitizeNotificationImageUrl(activePopup.imageUrl) : '';
  const safePopupCtaUrl = activePopup ? sanitizeCampaignCtaUrl(activePopup.ctaUrl) : '';
  const themeStyle = activePopup
    ? POPUP_THEME_STYLES[activePopup.theme] || POPUP_THEME_STYLES.emerald
    : POPUP_THEME_STYLES.emerald;

  return (
    <>
      {/* ==================================================================== */}
      {/* CHANNEL 1: ALFA / MYZONG DARK RICH PUSH NOTIFICATION CARD            */}
      {/* ==================================================================== */}
      {activeNotif && (
        <div
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[9500] w-[94%] max-w-md animate-in fade-in slide-in-from-top-3 duration-200"
          role="alert"
          aria-live="polite"
        >
          <div className="bg-[#1f2023] text-white rounded-[26px] shadow-2xl border border-white/10 p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <img
                  src="icon-192.png"
                  alt="NH POS"
                  className="w-6 h-6 rounded-full bg-[#FAF8EC] object-cover ring-1 ring-white/20 shrink-0"
                />
                <span className="text-xs font-semibold text-slate-300 truncate">
                  NH POS Shop
                </span>
                <span className="text-slate-500 text-xs">•</span>
                <span className="text-xs text-slate-400 shrink-0">now</span>
                <Bell className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              </div>

              <button
                type="button"
                onClick={() => setActiveNotif(null)}
                aria-label="Dismiss notification"
                title="Dismiss"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-200 transition-colors cursor-pointer shrink-0"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 px-0.5">
              <h4 className="text-[15px] sm:text-base font-extrabold text-white leading-snug tracking-tight break-words">
                {activeNotif.title}
              </h4>
              <p className="text-xs sm:text-[13px] text-slate-300 leading-relaxed whitespace-pre-line break-words">
                {activeNotif.body}
              </p>
            </div>

            {safeNotifBanner && (
              <div className="pt-1">
                <img
                  src={safeNotifBanner}
                  alt={activeNotif.title}
                  className="w-full max-h-48 object-cover rounded-2xl border border-white/10 shadow-md"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              {osPerm === 'default' && (
                <button
                  type="button"
                  onClick={handleEnableOsAlerts}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>Enable Phone Alerts</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveNotif(null)}
                className="px-3.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold transition-colors cursor-pointer"
              >
                OK / Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* CHANNEL 2: PRIVATE POPUP AD / SEASONAL EVENT GREETING MODAL          */}
      {/* ==================================================================== */}
      {activePopup && (
        <div
          className="fixed inset-0 z-[9600] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
        >
          <div
            className={`bg-white w-full max-w-md rounded-3xl shadow-2xl border-2 ${themeStyle.ring} overflow-hidden animate-in zoom-in-95 duration-200`}
          >
            {/* Themed Top Header */}
            <div className={`bg-gradient-to-r ${themeStyle.headerBg} text-white px-5 py-3.5 flex items-center justify-between gap-2`}>
              <div className="flex items-center gap-2 min-w-0">
                <img
                  src="icon-192.png"
                  alt="NH POS"
                  className="w-7 h-7 rounded-full bg-[#FAF8EC] object-cover ring-2 ring-white/30 shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${themeStyle.badgeBg}`}>
                      {activePopup.badgeText ||
                        (activePopup.campaignType === 'private_ad'
                          ? '🔥 Featured Offer'
                          : activePopup.campaignType === 'event_greeting'
                          ? '✨ Special Event'
                          : '📢 Announcement')}
                    </span>
                    {isPreviewPopup && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-black/35 text-amber-200 uppercase">
                        Preview
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActivePopup(null)}
                aria-label="Close popup"
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Banner Picture (if provided) */}
            {safePopupBanner && (
              <div className="bg-slate-950">
                <img
                  src={safePopupBanner}
                  alt={activePopup.title}
                  className="w-full max-h-56 object-cover"
                />
              </div>
            )}

            {/* Content Body */}
            <div className="p-5 space-y-3 text-center">
              <h3 className="text-lg sm:text-xl font-black text-slate-900 leading-snug break-words">
                {activePopup.title}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-line break-words">
                {activePopup.body}
              </p>

              {/* Action Buttons */}
              <div className="pt-2 space-y-2">
                {safePopupCtaUrl && activePopup.ctaLabel && (
                  <a
                    href={safePopupCtaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setActivePopup(null)}
                    className={`w-full py-3 px-4 bg-gradient-to-r ${themeStyle.ctaBg} text-white font-black text-xs sm:text-sm rounded-2xl shadow-md flex items-center justify-center gap-2 transition-all active:scale-98`}
                  >
                    <Sparkles className="w-4 h-4 text-amber-200 shrink-0" />
                    <span>{activePopup.ctaLabel}</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => setActivePopup(null)}
                  className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition-colors cursor-pointer"
                >
                  Close / Band Karein
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
