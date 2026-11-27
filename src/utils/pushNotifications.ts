/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Super Admin ONLY Geo-Targeted Push Notifications & Private Popup Ad Campaigns Engine
 * - Supports Pin-Point Geo Targeting: All Shops | Province / District / City | Specific Shop
 * - Supports Role Filtering: All Users | Shop Owners/Admins | Staff Members
 * - Channel 1: Rich Push Notifications (Alfa text & MyZong BigPicture banner style) -> /platform_settings/push_broadcasts
 * - Channel 2: Private Popup Ads & Seasonal Event Campaigns (Eid, Milad, 14 August, Offers) -> /platform_settings/popup_ads
 * - Strictly gated to Verified Master Super Admins in both UI & Firestore Rules
 */

import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { superAdminService } from '../superadmin/superAdminService';

export type PushTargetRole = 'all' | 'admin' | 'staff';
export type TargetScopeType = 'ALL_SHOPS' | 'GEO' | 'SPECIFIC_SHOP';
export type PopupCampaignType = 'event_greeting' | 'private_ad' | 'announcement';
export type PopupThemePreset = 'emerald' | 'gold' | 'pakistan' | 'indigo' | 'rose';
export type PopupShowFrequency = 'once' | 'daily';

export interface GeoTargetCriteria {
  targetType?: TargetScopeType;
  targetProvince?: string; // '' or 'ALL' means all provinces
  targetDistrict?: string; // '' or 'ALL' means all districts
  targetCity?: string; // '' or 'ALL' means all cities (substring match on city/address)
  targetShopId: string; // 'ALL_SHOPS' or specific shop ID
  targetShopName?: string;
  targetRole: PushTargetRole;
}

export interface RichPushNotification extends GeoTargetCriteria {
  id: string;
  title: string;
  body: string;
  imageUrl?: string;
  eventTag?: string;
  createdAt: number;
  createdByEmail: string;
  createdByName: string;
}

export interface PopupAdCampaign extends GeoTargetCriteria {
  id: string;
  active: boolean;
  campaignType: PopupCampaignType;
  theme: PopupThemePreset;
  badgeText?: string;
  title: string;
  body: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  showFrequency: PopupShowFrequency;
  expiresAt?: number | null;
  createdAt: number;
  createdByEmail: string;
  createdByName: string;
}

interface PushBroadcastDoc {
  latestNotification?: RichPushNotification | null;
  history?: RichPushNotification[];
  updatedAt?: number;
}

interface PopupAdsDoc {
  activeCampaign?: PopupAdCampaign | null;
  history?: PopupAdCampaign[];
  updatedAt?: number;
}

export interface CampaignTemplatePreset {
  id: string;
  label: string;
  emoji: string;
  badgeText: string;
  theme: PopupThemePreset;
  campaignType: PopupCampaignType;
  title: string;
  body: string;
}

export const EVENT_CAMPAIGN_PRESETS: CampaignTemplatePreset[] = [
  {
    id: 'eid',
    label: 'Eid Mubarak',
    emoji: '🌙',
    badgeText: '🌙 Eid Mubarak Special',
    theme: 'gold',
    campaignType: 'event_greeting',
    title: '🌙 Eid Mubarak from NH POS Shop!',
    body: 'Aap aur aapke tamam khandaan ko dil ki gehraiyon se Eid Mubarak! Allah aapke karobar mein mazeed barkat ata farmaye.'
  },
  {
    id: 'milad',
    label: 'Eid Milad-un-Nabi',
    emoji: '🕌',
    badgeText: '🕌 12 Rabi-ul-Awwal',
    theme: 'emerald',
    campaignType: 'event_greeting',
    title: '🕌 Eid Milad-un-Nabi ﷺ Mubarak!',
    body: 'Jashn-e-Eid Milad-un-Nabi ﷺ ki pur-khuloos mubarakbad. Dua hai ke yeh babarkat din aapke liye aman, khushhali aur barkat laye.'
  },
  {
    id: '14_august',
    label: '14 August',
    emoji: '🇵🇰',
    badgeText: '🇵🇰 Jashn-e-Azadi Mubarak',
    theme: 'pakistan',
    campaignType: 'event_greeting',
    title: '🇵🇰 Happy Independence Day — 14 August!',
    body: 'Pakistan Zindabad! Tamam dukandaron aur users ko Jashn-e-Azadi Mubarak. NH POS Shop ke sath apne karobar ko digital banayein.'
  },
  {
    id: 'ramazan',
    label: 'Ramazan Kareem',
    emoji: '✨',
    badgeText: '✨ Ramazan Kareem',
    theme: 'indigo',
    campaignType: 'event_greeting',
    title: '✨ Ramazan Kareem Mubarak!',
    body: 'Maah-e-Ramazan ki aamad mubarak ho! Allah Taala aapki rozi aur karobar mein beshumar barkat ata farmaye.'
  },
  {
    id: 'private_ad',
    label: 'Private Ad / Offer',
    emoji: '🔥',
    badgeText: '🔥 Sponsored Offer',
    theme: 'rose',
    campaignType: 'private_ad',
    title: '🔥 Special Wholesale & Shop Offer!',
    body: 'Apne ilaqay ke shops ke liye khaas offer! Mazeed maloomat aur booking ke liye neeche diye gaye button par click karein.'
  }
];

const PUSH_DOC_ID = 'push_broadcasts';
const POPUP_ADS_DOC_ID = 'popup_ads';
const SEEN_PUSH_STORAGE_KEY = 'nh_pos_seen_push_ids_v1';
const SEEN_POPUP_STORAGE_KEY = 'nh_pos_seen_popup_ads_v1';
const MAX_HISTORY_ITEMS = 20;
const MAX_DATA_URL_LENGTH = 120000; // ~90 KB compressed JPEG banner
const MAX_DELIVERY_AGE_MS = 72 * 60 * 60 * 1000; // 72 hours for auto-push delivery

/**
 * Strictly validates notification/ad image URLs (blocks javascript:, http:, SVG scripts, oversized payloads).
 */
export function sanitizeNotificationImageUrl(raw?: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';

  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed.length <= MAX_DATA_URL_LENGTH ? trimmed : '';
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return '';
  }
  return '';
}

/**
 * Strictly validates Popup Ad CTA links (allows ONLY https:// URLs).
 */
export function sanitizeCampaignCtaUrl(raw?: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return '';
  }
  return '';
}

/**
 * Compresses an uploaded banner picture into a crisp, lightweight 16:9 / 2:1 JPEG data URL
 * suitable for Android BigPictureStyle push notifications and Private Popup Ad modals.
 */
export function compressNotificationBannerFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Please select a valid PNG, JPG, or WebP image file.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unable to decode selected image.'));
      img.onload = () => {
        try {
          const maxW = 640;
          const maxH = 360;
          let targetW = img.width || maxW;
          let targetH = img.height || maxH;
          const ratio = Math.min(maxW / targetW, maxH / targetH, 1);
          targetW = Math.max(1, Math.round(targetW * ratio));
          targetH = Math.max(1, Math.round(targetH * ratio));

          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context unavailable.'));
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(img, 0, 0, targetW, targetH);

          const qualities = [0.78, 0.65, 0.52, 0.4];
          for (const q of qualities) {
            const dataUrl = canvas.toDataURL('image/jpeg', q);
            if (dataUrl.length <= MAX_DATA_URL_LENGTH) {
              resolve(dataUrl);
              return;
            }
          }
          reject(new Error('Image is too large even after compression. Please pick a simpler image.'));
        } catch (err: any) {
          reject(new Error(err?.message || 'Image compression failed.'));
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export function getOsNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestOsNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function getSeenPushIds(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_PUSH_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function hasSeenPushNotification(id: string): boolean {
  if (!id) return true;
  return getSeenPushIds().includes(id);
}

export function markPushNotificationSeen(id: string): void {
  if (!id) return;
  try {
    const existing = getSeenPushIds();
    if (!existing.includes(id)) {
      const updated = [id, ...existing].slice(0, 60);
      localStorage.setItem(SEEN_PUSH_STORAGE_KEY, JSON.stringify(updated));
    }
  } catch {}
}

function getTodayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getPopupSeenKey(campaign: PopupAdCampaign): string {
  return campaign.showFrequency === 'daily'
    ? `${campaign.id}_${getTodayStamp()}`
    : campaign.id;
}

export function hasSeenPopupAd(campaign: PopupAdCampaign): boolean {
  if (!campaign || !campaign.id) return true;
  try {
    const raw = localStorage.getItem(SEEN_POPUP_STORAGE_KEY);
    if (!raw) return false;
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return false;
    return list.includes(getPopupSeenKey(campaign));
  } catch {
    return false;
  }
}

export function markPopupAdSeen(campaign: PopupAdCampaign): void {
  if (!campaign || !campaign.id) return;
  try {
    const key = getPopupSeenKey(campaign);
    const raw = localStorage.getItem(SEEN_POPUP_STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
    if (!arr.includes(key)) {
      localStorage.setItem(SEEN_POPUP_STORAGE_KEY, JSON.stringify([key, ...arr].slice(0, 80)));
    }
  } catch {}
}

/**
 * Shared Pin-Point Geo & Role Matching Engine
 * Used identically on client devices AND inside Super Admin Live Reach Preview!
 */
export function matchesGeoTargetForShop(
  criteria: GeoTargetCriteria,
  shop: {
    id?: string;
    province?: string;
    district?: string;
    city?: string;
    address?: string;
  }
): boolean {
  const scopeType: TargetScopeType =
    criteria.targetType ||
    (criteria.targetShopId && criteria.targetShopId !== 'ALL_SHOPS'
      ? 'SPECIFIC_SHOP'
      : criteria.targetProvince || criteria.targetDistrict || criteria.targetCity
      ? 'GEO'
      : 'ALL_SHOPS');

  if (scopeType === 'SPECIFIC_SHOP') {
    if (!criteria.targetShopId || criteria.targetShopId === 'ALL_SHOPS') return true;
    return Boolean(shop.id && shop.id === criteria.targetShopId);
  }

  if (scopeType === 'GEO') {
    const reqProv = String(criteria.targetProvince || '').trim().toLowerCase();
    const reqDist = String(criteria.targetDistrict || '').trim().toLowerCase();
    const reqCity = String(criteria.targetCity || '').trim().toLowerCase();

    const shopProv = String(shop.province || '').trim().toLowerCase();
    const shopDist = String(shop.district || '').trim().toLowerCase();
    const shopCity = String(shop.city || '').trim().toLowerCase();
    const shopAddr = String(shop.address || '').trim().toLowerCase();

    if (reqProv && reqProv !== 'all') {
      if (shopProv !== reqProv) return false;
    }
    if (reqDist && reqDist !== 'all') {
      if (shopDist !== reqDist) return false;
    }
    if (reqCity && reqCity !== 'all') {
      const cityMatched = shopCity.includes(reqCity) || shopAddr.includes(reqCity);
      if (!cityMatched) return false;
    }
    return true;
  }

  return true;
}

export function matchesNotificationTarget(
  criteria: GeoTargetCriteria,
  shop: {
    id?: string;
    province?: string;
    district?: string;
    city?: string;
    address?: string;
  },
  userRole?: string
): boolean {
  if (!criteria) return false;
  if (!matchesGeoTargetForShop(criteria, shop)) return false;

  const normalizedRole = String(userRole || '').toLowerCase();
  const isOwnerOrSuper = normalizedRole === 'admin' || normalizedRole === 'super_admin';
  if (criteria.targetRole === 'admin' && !isOwnerOrSuper) {
    return false;
  }
  if (criteria.targetRole === 'staff' && isOwnerOrSuper) {
    return false;
  }

  return true;
}

export function describeGeoTarget(criteria: GeoTargetCriteria): string {
  const scopeType: TargetScopeType =
    criteria.targetType ||
    (criteria.targetShopId && criteria.targetShopId !== 'ALL_SHOPS'
      ? 'SPECIFIC_SHOP'
      : criteria.targetProvince || criteria.targetDistrict || criteria.targetCity
      ? 'GEO'
      : 'ALL_SHOPS');

  if (scopeType === 'SPECIFIC_SHOP') {
    return criteria.targetShopName || criteria.targetShopId || 'Specific Shop';
  }
  if (scopeType === 'GEO') {
    const parts: string[] = [];
    if (criteria.targetCity && criteria.targetCity !== 'ALL') parts.push(criteria.targetCity);
    if (criteria.targetDistrict && criteria.targetDistrict !== 'ALL') parts.push(criteria.targetDistrict);
    if (criteria.targetProvince && criteria.targetProvince !== 'ALL') parts.push(criteria.targetProvince);
    return parts.length > 0 ? `📍 ${parts.join(', ')}` : '🌍 All Pakistan';
  }
  return '🌍 All Shops';
}

export function isFreshBroadcast(notif: RichPushNotification): boolean {
  if (!notif || !notif.createdAt) return false;
  return Date.now() - Number(notif.createdAt) <= MAX_DELIVERY_AGE_MS;
}

export function isActivePopupCampaign(campaign: PopupAdCampaign | null | undefined): boolean {
  if (!campaign || !campaign.id || !campaign.active) return false;
  if (campaign.expiresAt && Date.now() > Number(campaign.expiresAt)) return false;
  return true;
}

/**
 * Fires a native OS Rich Push Notification (Android BigPictureStyle / Windows / macOS)
 */
export async function triggerNativeOsRichNotification(notif: RichPushNotification): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }

  const safeImage = sanitizeNotificationImageUrl(notif.imageUrl);
  const options: NotificationOptions & { image?: string; renotify?: boolean; vibrate?: number[] } = {
    body: notif.body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: `nh-pos-push-${notif.id}`,
    renotify: true,
    vibrate: [140, 60, 140],
    data: {
      url: './',
      notificationId: notif.id
    }
  };
  if (safeImage) {
    options.image = safeImage;
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(notif.title, options);
        return true;
      }
    }
  } catch {
    // Fallback below
  }

  try {
    new Notification(notif.title, {
      body: notif.body,
      icon: 'icon-192.png',
      tag: `nh-pos-push-${notif.id}`
    });
    return true;
  } catch {
    return false;
  }
}

function verifySuperAdminAuthGate(senderEmail: string): { ok: boolean; cleanEmail: string; error?: string } {
  const cleanEmail = String(senderEmail || '').trim().toLowerCase();
  if (!superAdminService.isMasterAdminEmail(cleanEmail)) {
    return {
      ok: false,
      cleanEmail,
      error: 'Access Denied: Only verified Super Admin can create or send campaigns.'
    };
  }
  const fbEmail = String(auth?.currentUser?.email || '').trim().toLowerCase();
  if (!fbEmail || !superAdminService.isMasterAdminEmail(fbEmail)) {
    return {
      ok: false,
      cleanEmail,
      error: 'Please click "Verify Master Gmail" first so Firebase authorizes this broadcast.'
    };
  }
  return { ok: true, cleanEmail };
}

/**
 * Super Admin ONLY: Sends a geo-targeted Rich Push Notification via /platform_settings/push_broadcasts.
 */
export async function sendSuperAdminPushBroadcast(params: {
  title: string;
  body: string;
  imageUrl?: string;
  eventTag?: string;
  targetType: TargetScopeType;
  targetProvince?: string;
  targetDistrict?: string;
  targetCity?: string;
  targetShopId: string;
  targetShopName?: string;
  targetRole: PushTargetRole;
  senderEmail: string;
  senderName: string;
}): Promise<{ success: boolean; notification?: RichPushNotification; error?: string }> {
  const gate = verifySuperAdminAuthGate(params.senderEmail);
  if (!gate.ok) return { success: false, error: gate.error };

  const title = String(params.title || '').trim().slice(0, 110);
  const body = String(params.body || '').trim().slice(0, 650);
  if (!title || !body) {
    return { success: false, error: 'Title and message text are both required.' };
  }

  const rawImg = String(params.imageUrl || '').trim();
  const safeImageUrl = sanitizeNotificationImageUrl(rawImg);
  if (rawImg && !safeImageUrl) {
    return {
      success: false,
      error: 'Invalid image. Please upload a picture or use a valid https:// image URL.'
    };
  }

  const notification: RichPushNotification = {
    id: `push_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    body,
    ...(safeImageUrl ? { imageUrl: safeImageUrl } : {}),
    ...(params.eventTag ? { eventTag: params.eventTag.trim().slice(0, 40) } : {}),
    targetType: params.targetType || 'ALL_SHOPS',
    targetProvince: params.targetType === 'GEO' ? String(params.targetProvince || '').trim() : '',
    targetDistrict: params.targetType === 'GEO' ? String(params.targetDistrict || '').trim() : '',
    targetCity: params.targetType === 'GEO' ? String(params.targetCity || '').trim() : '',
    targetShopId: params.targetType === 'SPECIFIC_SHOP' ? params.targetShopId : 'ALL_SHOPS',
    targetShopName:
      params.targetType === 'SPECIFIC_SHOP'
        ? params.targetShopName || params.targetShopId
        : 'All Shops',
    targetRole: params.targetRole || 'all',
    createdAt: Date.now(),
    createdByEmail: gate.cleanEmail,
    createdByName: String(params.senderName || 'Super Admin').trim().slice(0, 60)
  };

  try {
    const ref = doc(db, 'platform_settings', PUSH_DOC_ID);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? (snap.data() as PushBroadcastDoc) : {};
    const prevHistory = Array.isArray(existing.history) ? existing.history : [];
    const nextHistory = [notification, ...prevHistory].slice(0, MAX_HISTORY_ITEMS);

    await setDoc(ref, {
      latestNotification: notification,
      history: nextHistory,
      updatedAt: Date.now()
    });

    return { success: true, notification };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to publish push notification to cloud.'
    };
  }
}

export async function fetchSuperAdminPushHistory(): Promise<RichPushNotification[]> {
  try {
    const ref = doc(db, 'platform_settings', PUSH_DOC_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) return [];
    const data = snap.data() as PushBroadcastDoc;
    return Array.isArray(data.history) ? data.history : [];
  } catch {
    return [];
  }
}

export async function deleteSuperAdminPushHistoryItem(
  notificationId: string,
  senderEmail: string
): Promise<{ success: boolean; history?: RichPushNotification[]; error?: string }> {
  const gate = verifySuperAdminAuthGate(senderEmail);
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const ref = doc(db, 'platform_settings', PUSH_DOC_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { success: true, history: [] };
    const data = snap.data() as PushBroadcastDoc;
    const prevHistory = Array.isArray(data.history) ? data.history : [];
    const nextHistory = prevHistory.filter(item => item && item.id !== notificationId);
    const nextLatest =
      data.latestNotification && data.latestNotification.id === notificationId
        ? nextHistory[0] || null
        : data.latestNotification || null;

    await setDoc(ref, {
      latestNotification: nextLatest,
      history: nextHistory,
      updatedAt: Date.now()
    });
    return { success: true, history: nextHistory };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete broadcast.' };
  }
}

/**
 * Super Admin ONLY: Launches a geo-targeted Private Popup Ad / Seasonal Event Modal via /platform_settings/popup_ads.
 */
export async function launchSuperAdminPopupAd(params: {
  campaignType: PopupCampaignType;
  theme: PopupThemePreset;
  badgeText?: string;
  title: string;
  body: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  showFrequency: PopupShowFrequency;
  durationHours: number; // 0 = no expiry
  targetType: TargetScopeType;
  targetProvince?: string;
  targetDistrict?: string;
  targetCity?: string;
  targetShopId: string;
  targetShopName?: string;
  targetRole: PushTargetRole;
  senderEmail: string;
  senderName: string;
}): Promise<{ success: boolean; campaign?: PopupAdCampaign; error?: string }> {
  const gate = verifySuperAdminAuthGate(params.senderEmail);
  if (!gate.ok) return { success: false, error: gate.error };

  const title = String(params.title || '').trim().slice(0, 120);
  const body = String(params.body || '').trim().slice(0, 750);
  if (!title || !body) {
    return { success: false, error: 'Popup Headline and Message are required.' };
  }

  const rawImg = String(params.imageUrl || '').trim();
  const safeImageUrl = sanitizeNotificationImageUrl(rawImg);
  if (rawImg && !safeImageUrl) {
    return {
      success: false,
      error: 'Invalid banner image. Please upload a photo or use a valid https:// image link.'
    };
  }

  const rawCtaUrl = String(params.ctaUrl || '').trim();
  const safeCtaUrl = sanitizeCampaignCtaUrl(rawCtaUrl);
  if (rawCtaUrl && !safeCtaUrl) {
    return {
      success: false,
      error: 'Action link must be a valid https:// URL (e.g. https://wa.me/923...).'
    };
  }

  const now = Date.now();
  const expiresAt =
    params.durationHours && params.durationHours > 0
      ? now + params.durationHours * 60 * 60 * 1000
      : null;

  const campaign: PopupAdCampaign = {
    id: `popup_${now}_${Math.random().toString(36).slice(2, 8)}`,
    active: true,
    campaignType: params.campaignType || 'private_ad',
    theme: params.theme || 'emerald',
    badgeText: String(params.badgeText || '').trim().slice(0, 48),
    title,
    body,
    ...(safeImageUrl ? { imageUrl: safeImageUrl } : {}),
    ...(params.ctaLabel && safeCtaUrl
      ? { ctaLabel: String(params.ctaLabel).trim().slice(0, 40), ctaUrl: safeCtaUrl }
      : {}),
    showFrequency: params.showFrequency || 'once',
    expiresAt,
    targetType: params.targetType || 'ALL_SHOPS',
    targetProvince: params.targetType === 'GEO' ? String(params.targetProvince || '').trim() : '',
    targetDistrict: params.targetType === 'GEO' ? String(params.targetDistrict || '').trim() : '',
    targetCity: params.targetType === 'GEO' ? String(params.targetCity || '').trim() : '',
    targetShopId: params.targetType === 'SPECIFIC_SHOP' ? params.targetShopId : 'ALL_SHOPS',
    targetShopName:
      params.targetType === 'SPECIFIC_SHOP'
        ? params.targetShopName || params.targetShopId
        : 'All Shops',
    targetRole: params.targetRole || 'all',
    createdAt: now,
    createdByEmail: gate.cleanEmail,
    createdByName: String(params.senderName || 'Super Admin').trim().slice(0, 60)
  };

  try {
    const ref = doc(db, 'platform_settings', POPUP_ADS_DOC_ID);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? (snap.data() as PopupAdsDoc) : {};
    const prevHistory = Array.isArray(existing.history) ? existing.history : [];
    const deactivatedPrev = prevHistory.map(item => ({ ...item, active: false }));
    const nextHistory = [campaign, ...deactivatedPrev].slice(0, MAX_HISTORY_ITEMS);

    await setDoc(ref, {
      activeCampaign: campaign,
      history: nextHistory,
      updatedAt: now
    });

    return { success: true, campaign };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to launch popup ad campaign.'
    };
  }
}

export async function fetchSuperAdminPopupAds(): Promise<{
  activeCampaign: PopupAdCampaign | null;
  history: PopupAdCampaign[];
}> {
  try {
    const ref = doc(db, 'platform_settings', POPUP_ADS_DOC_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { activeCampaign: null, history: [] };
    const data = snap.data() as PopupAdsDoc;
    return {
      activeCampaign: data.activeCampaign || null,
      history: Array.isArray(data.history) ? data.history : []
    };
  } catch {
    return { activeCampaign: null, history: [] };
  }
}

export async function toggleSuperAdminPopupAdActive(
  campaignId: string,
  active: boolean,
  senderEmail: string
): Promise<{
  success: boolean;
  activeCampaign?: PopupAdCampaign | null;
  history?: PopupAdCampaign[];
  error?: string;
}> {
  const gate = verifySuperAdminAuthGate(senderEmail);
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const ref = doc(db, 'platform_settings', POPUP_ADS_DOC_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { success: true, activeCampaign: null, history: [] };
    const data = snap.data() as PopupAdsDoc;
    const prevHistory = Array.isArray(data.history) ? data.history : [];
    let nextActive: PopupAdCampaign | null = null;
    const nextHistory = prevHistory.map(item => {
      if (item.id === campaignId) {
        const updated = { ...item, active };
        if (active) nextActive = updated;
        return updated;
      }
      return active ? { ...item, active: false } : item;
    });

    await setDoc(ref, {
      activeCampaign: nextActive,
      history: nextHistory,
      updatedAt: Date.now()
    });
    return { success: true, activeCampaign: nextActive, history: nextHistory };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update popup status.' };
  }
}

export async function deleteSuperAdminPopupAd(
  campaignId: string,
  senderEmail: string
): Promise<{
  success: boolean;
  activeCampaign?: PopupAdCampaign | null;
  history?: PopupAdCampaign[];
  error?: string;
}> {
  const gate = verifySuperAdminAuthGate(senderEmail);
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    const ref = doc(db, 'platform_settings', POPUP_ADS_DOC_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { success: true, activeCampaign: null, history: [] };
    const data = snap.data() as PopupAdsDoc;
    const prevHistory = Array.isArray(data.history) ? data.history : [];
    const nextHistory = prevHistory.filter(item => item && item.id !== campaignId);
    const nextActive =
      data.activeCampaign && data.activeCampaign.id === campaignId
        ? null
        : data.activeCampaign || null;

    await setDoc(ref, {
      activeCampaign: nextActive,
      history: nextHistory,
      updatedAt: Date.now()
    });
    return { success: true, activeCampaign: nextActive, history: nextHistory };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete popup campaign.' };
  }
}

export function subscribeToPushBroadcasts(
  onLatestBroadcast: (notif: RichPushNotification) => void
): () => void {
  try {
    const ref = doc(db, 'platform_settings', PUSH_DOC_ID);
    return onSnapshot(
      ref,
      snap => {
        if (!snap.exists()) return;
        const data = snap.data() as PushBroadcastDoc;
        if (data?.latestNotification && data.latestNotification.id) {
          onLatestBroadcast(data.latestNotification);
        }
      },
      () => {
        // Silently ignore transient offline snapshot errors
      }
    );
  } catch {
    return () => {};
  }
}

export function subscribeToActivePopupAds(
  onActiveCampaign: (campaign: PopupAdCampaign | null) => void
): () => void {
  try {
    const ref = doc(db, 'platform_settings', POPUP_ADS_DOC_ID);
    return onSnapshot(
      ref,
      snap => {
        if (!snap.exists()) {
          onActiveCampaign(null);
          return;
        }
        const data = snap.data() as PopupAdsDoc;
        const camp = data?.activeCampaign || null;
        onActiveCampaign(isActivePopupCampaign(camp) ? camp : null);
      },
      () => {
        // Silently ignore transient offline snapshot errors
      }
    );
  } catch {
    return () => {};
  }
}
