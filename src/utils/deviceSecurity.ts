/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const AUTHORIZED_EMAIL_KEY = 'taj_pos_authorized_email';
const AUTHORIZED_DEVICES_MAP_KEY = 'taj_pos_authorized_devices';
const OFFLINE_AUTH_LOGS_KEY = 'taj_pos_offline_auth_logs';

export function getStoredAuthorizedEmail(): string | null {
  try {
    return localStorage.getItem(AUTHORIZED_EMAIL_KEY);
  } catch {
    return null;
  }
}

export async function authorizeDeviceForEmail(
  email: string,
  method: 'google_oauth' | 'password_auth' | 'otp_verified' = 'password_auth'
): Promise<void> {
  try {
    const clean = email.trim().toLowerCase();
    if (!clean) return;
    localStorage.setItem(AUTHORIZED_EMAIL_KEY, clean);
    const mapRaw = localStorage.getItem(AUTHORIZED_DEVICES_MAP_KEY);
    const map = mapRaw ? JSON.parse(mapRaw) : {};
    map[clean] = {
      email: clean,
      method,
      authorizedAt: new Date().toISOString()
    };
    localStorage.setItem(AUTHORIZED_DEVICES_MAP_KEY, JSON.stringify(map));
  } catch {}
}

export async function isDeviceAuthorizedForEmail(
  email: string
): Promise<{ isAuthorized: boolean; reason?: string }> {
  try {
    const clean = email.trim().toLowerCase();
    const mapRaw = localStorage.getItem(AUTHORIZED_DEVICES_MAP_KEY);
    if (!mapRaw) {
      return {
        isAuthorized: false,
        reason: 'براہِ کرم دکان کا پاس ورڈ درج کریں یا اوپر Google سے لاگ ان کریں۔'
      };
    }
    const map = JSON.parse(mapRaw);
    const isAuthorized = Boolean(map[clean]);
    return {
      isAuthorized,
      reason: isAuthorized ? undefined : 'براہِ کرم دکان کا پاس ورڈ درج کریں یا اوپر Google سے لاگ ان کریں۔'
    };
  } catch {
    return {
      isAuthorized: false,
      reason: 'براہِ کرم دکان کا پاس ورڈ درج کریں یا اوپر Google سے لاگ ان کریں۔'
    };
  }
}

export function revokeDevice(email?: string): void {
  try {
    if (!email) {
      localStorage.removeItem(AUTHORIZED_EMAIL_KEY);
      localStorage.removeItem(AUTHORIZED_DEVICES_MAP_KEY);
      return;
    }
    const clean = email.trim().toLowerCase();
    const mapRaw = localStorage.getItem(AUTHORIZED_DEVICES_MAP_KEY);
    if (mapRaw) {
      const map = JSON.parse(mapRaw);
      delete map[clean];
      localStorage.setItem(AUTHORIZED_DEVICES_MAP_KEY, JSON.stringify(map));
    }
  } catch {}
}

export function recordOfflineAuthAttempt(identifier: string, success: boolean): void {
  try {
    const raw = localStorage.getItem(OFFLINE_AUTH_LOGS_KEY);
    const logs = raw ? JSON.parse(raw) : [];
    logs.push({
      identifier,
      success,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem(OFFLINE_AUTH_LOGS_KEY, JSON.stringify(logs.slice(-50)));
  } catch {}
}

export async function syncOfflineAuthLogs(_shopId: string): Promise<void> {
  try {
    localStorage.removeItem(OFFLINE_AUTH_LOGS_KEY);
  } catch {}
}
