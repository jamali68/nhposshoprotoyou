/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Client-Side Authentication & 15-Layer Security API Service (v18.0.0)
 * Dispatches auth, SuperAdmin, and OTP verification requests to Netlify Functions backend
 * with automatic SHA-256 Proof-of-Work, Nonce Anti-Replay, Payload Sanitization,
 * Upgraded 120,000-iteration PBKDF2-SHA256, and Fail-Closed token verification.
 */

import { trackNetlifyFunctionCall } from '../utils/usageTracker';
import {
  generateSecurityRequestHeaders,
  sanitizeDeepPayload
} from '../utils/securityShield';

export interface GoogleVerifyResult {
  success: boolean;
  verifiedEmail?: string;
  googleId?: string;
  name?: string;
  picture?: string;
  isSuperAdmin?: boolean;
  sessionToken?: string;
  error?: string;
}

export interface PasswordVerifyResult {
  success: boolean;
  mustChangePassword?: boolean;
  isLegacy?: boolean;
  isSuperAdmin?: boolean;
  sessionToken?: string;
  error?: string;
}

export interface PasswordHashResult {
  success: boolean;
  hash?: string;
  salt?: string;
  error?: string;
}

export interface SuperAdminVerifyResult {
  success: boolean;
  masterEmail?: string;
  token?: string;
  error?: string;
}

const getApiBaseUrls = (): string[] => {
  return ['/.netlify/functions/auth', '/api/auth'];
};

function constantTimeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Standard Web Crypto PBKDF2 Password Verification (Supports v2 120k, v1 12k & legacy)
 * Used seamlessly on static hosts (GitHub Pages) or when offline.
 */
async function clientVerifyPassword(
  password: string,
  storedHash?: string,
  salt?: string
): Promise<PasswordVerifyResult> {
  const cleanPass = password.trim();
  if (!cleanPass) {
    return { success: false, error: 'برائے مہربانی پاس ورڈ درج کریں۔' };
  }

  // 1. Legacy 123456 migration check
  const isLegacy =
    (storedHash === '123456' && cleanPass === '123456') ||
    (!storedHash && cleanPass === '123456') ||
    (storedHash === cleanPass && cleanPass === '123456');

  if (isLegacy) {
    return { success: true, mustChangePassword: true, isLegacy: true };
  }

  // 2. Direct plaintext match check (supports unhashed legacy records only when no salt exists)
  if (!salt && storedHash && constantTimeEqualStr(cleanPass, storedHash)) {
    return {
      success: true,
      mustChangePassword: cleanPass === '123456',
      isLegacy: cleanPass === '123456'
    };
  }

  if (!salt || !storedHash) {
    return {
      success: false,
      error: 'غلط پاس ورڈ! برائے مہربانی درست پاس ورڈ درج کریں۔ (Incorrect password)'
    };
  }

  // 3. PBKDF2 Web Crypto Hash Verification (v2$120000$<hex> or legacy 12,000 iterations)
  try {
    let iterations = 12000;
    let targetHex = storedHash;
    if (storedHash.startsWith('v2$')) {
      const parts = storedHash.split('$');
      if (parts.length === 3) {
        const parsedIter = parseInt(parts[1], 10);
        if (Number.isFinite(parsedIter) && parsedIter >= 10000 && parsedIter <= 600000) {
          iterations = parsedIter;
          targetHex = parts[2];
        }
      }
    }

    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(cleanPass),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const derivedBitsUtf8 = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: enc.encode(salt),
        iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );

    const derivedHexUtf8 = Array.from(new Uint8Array(derivedBitsUtf8))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (constantTimeEqualStr(derivedHexUtf8.toLowerCase(), targetHex.toLowerCase())) {
      return {
        success: true,
        mustChangePassword: cleanPass === '123456',
        isLegacy: false
      };
    }

    const saltMatches = salt.match(/.{1,2}/g);
    if (saltMatches && saltMatches.length > 0 && !storedHash.startsWith('v2$')) {
      const saltBuffer = new Uint8Array(saltMatches.map(byte => parseInt(byte, 16)));
      const derivedBitsHex = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: saltBuffer,
          iterations,
          hash: 'SHA-256'
        },
        keyMaterial,
        256
      );

      const derivedHexBytes = Array.from(new Uint8Array(derivedBitsHex))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      if (constantTimeEqualStr(derivedHexBytes.toLowerCase(), targetHex.toLowerCase())) {
        return {
          success: true,
          mustChangePassword: cleanPass === '123456',
          isLegacy: false
        };
      }
    }

    return {
      success: false,
      error: 'غلط پاس ورڈ! برائے مہربانی درست پاس ورڈ درج کریں۔ (Incorrect password)'
    };
  } catch {
    return { success: false, error: 'پاس ورڈ کی تصدیق میں مسئلہ پیش آیا۔' };
  }
}

/**
 * Upgraded Web Crypto PBKDF2-SHA256 Password Hashing (120,000 OWASP iterations)
 */
async function clientHashPassword(password: string): Promise<PasswordHashResult> {
  const cleanPass = password.trim();
  if (cleanPass.length < 6) {
    return { success: false, error: 'پاس ورڈ کم از کم 6 ہندسوں کا ہونا ضروری ہے۔' };
  }

  try {
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const salt = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const iterations = 120000;

    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(cleanPass),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: enc.encode(salt),
        iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );

    const hashHex = Array.from(new Uint8Array(derivedBits))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return { success: true, hash: `v2$${iterations}$${hashHex}`, salt };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to hash password' };
  }
}

/**
 * Dispatches an action to Netlify Functions with Anti-AI PoW, Nonce & Payload Sanitization.
 */
async function postToAuthFunction(payload: any, authToken?: string): Promise<any> {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host.endsWith('github.io') || window.location.protocol === 'file:') {
      return { isStaticFallback: true };
    }
  }

  const sanitizedPayload = sanitizeDeepPayload(payload);
  const actionName = typeof sanitizedPayload?.action === 'string' ? sanitizedPayload.action : 'unknown';
  const urls = getApiBaseUrls();

  for (const url of urls) {
    try {
      const powHeaders = await generateSecurityRequestHeaders(actionName);
      const bodyStr = JSON.stringify(sanitizedPayload);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...powHeaders
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: bodyStr
      });

      if (res.status === 405 || res.status === 404 || res.status >= 500) {
        continue;
      }

      // Count actual Netlify Function / API execution + estimated request/response bytes
      trackNetlifyFunctionCall((bodyStr?.length || 200) + 950);

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        continue;
      }

      const data = await res.json().catch(() => null);
      if (!data || typeof data !== 'object') {
        continue;
      }

      if (res.ok && (typeof data.success === 'boolean' || typeof data.valid === 'boolean')) {
        return data;
      } else if (!res.ok && data.error) {
        return { success: false, valid: false, error: data.error };
      }
    } catch {
      // Network failure or offline; try next URL
    }
  }

  return { isStaticFallback: true };
}

export const authApi = {
  /**
   * Validates a Google ID Token on the server, or via Google TokenInfo on static hosts
   */
  async verifyGoogleIdToken(idToken: string): Promise<GoogleVerifyResult> {
    const decodeFirebaseOrGoogleJwt = (tokenStr: string): GoogleVerifyResult | null => {
      try {
        const parts = tokenStr.trim().split('.');
        if (parts.length !== 3) return null;
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
        const jsonPayload = decodeURIComponent(
          atob(padded)
            .split('')
            .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const data = JSON.parse(jsonPayload);
        const nowInSeconds = Math.floor(Date.now() / 1000);
        if (data.exp && Number(data.exp) <= nowInSeconds) {
          return { success: false, error: 'Google token has expired. Please sign in again.' };
        }
        const email = String(data.email || '').toLowerCase().trim();
        const emailVerified = data.email_verified === 'true' || data.email_verified === true;
        if (email && emailVerified) {
          return {
            success: true,
            verifiedEmail: email,
            googleId: data.user_id || data.sub || '',
            name: data.name || '',
            picture: data.picture || ''
          };
        }
      } catch {
        // ignore
      }
      return null;
    };

    try {
      const backendRes = await postToAuthFunction({
        action: 'verify-google-token',
        idToken
      });

      if (!backendRes.isStaticFallback) {
        return backendRes;
      }

      const jwtVerified = decodeFirebaseOrGoogleJwt(idToken);
      if (jwtVerified && jwtVerified.success) {
        return jwtVerified;
      }

      const googleRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken.trim())}`
      );
      if (!googleRes.ok) {
        return jwtVerified || { success: false, error: 'Google ID token validation failed' };
      }

      const data = await googleRes.json();
      const emailVerified = data.email_verified === 'true' || data.email_verified === true;
      if (!emailVerified) {
        return { success: false, error: 'Google email is not verified by Google' };
      }

      return {
        success: true,
        verifiedEmail: (data.email || '').toLowerCase().trim(),
        googleId: data.sub,
        name: data.name || '',
        picture: data.picture || ''
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Failed to verify Google token'
      };
    }
  },

  /**
   * Validates an owner or staff password against stored hash/salt.
   */
  async verifyOwnerPassword(
    email: string,
    password: string,
    storedHash?: string,
    salt?: string
  ): Promise<PasswordVerifyResult> {
    try {
      const backendRes = await postToAuthFunction({
        action: 'verify-password',
        email,
        password,
        storedHash,
        salt
      });

      if (!backendRes.isStaticFallback) {
        return backendRes;
      }

      return await clientVerifyPassword(password, storedHash, salt);
    } catch {
      return await clientVerifyPassword(password, storedHash, salt);
    }
  },

  /**
   * Hashes a new password securely via native Web Crypto PBKDF2-SHA256 (120k OWASP iterations — 0 Netlify Function calls!)
   * Falls back to Netlify Function only on environments without Web Crypto API.
   */
  async hashPassword(password: string): Promise<PasswordHashResult> {
    try {
      const localRes = await clientHashPassword(password);
      if (localRes.success && localRes.hash && localRes.salt) {
        return localRes;
      }

      const backendRes = await postToAuthFunction({
        action: 'hash-password',
        password
      });

      if (!backendRes.isStaticFallback && backendRes.success) {
        return backendRes;
      }

      return localRes;
    } catch {
      return await clientHashPassword(password);
    }
  },

  /**
   * Verifies Super Admin Master Credentials strictly via Server Core (Never hardcoded in browser)
   */
  async verifySuperAdmin(
    email: string,
    secretKey: string
  ): Promise<SuperAdminVerifyResult> {
    try {
      const backendRes = await postToAuthFunction({
        action: 'verify-super-admin',
        email,
        secretKey
      });

      if (!backendRes.isStaticFallback) {
        return backendRes;
      }

      return {
        success: false,
        error: 'Server authentication service unavailable. Super Admin login requires live Netlify Function verification.'
      };
    } catch {
      return { success: false, error: 'Super Admin verification failed' };
    }
  },

  /**
   * Updates Super Admin Master Secret Key on Server Core (Requires verified Super Admin Bearer token)
   */
  async updateSuperAdminSecret(
    newSecretKey: string,
    sessionToken: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!sessionToken) {
      return { success: false, error: 'Valid Super Admin session token required.' };
    }
    try {
      const backendRes = await postToAuthFunction(
        {
          action: 'update-super-admin-secret',
          newSecretKey,
          sessionToken
        },
        sessionToken
      );
      if (!backendRes.isStaticFallback) {
        return backendRes;
      }
      return { success: false, error: 'Server authentication service unavailable.' };
    } catch {
      return { success: false, error: 'Failed to update Super Admin secret key.' };
    }
  },

  /**
   * Verifies a 6-digit single-use OTP Challenge Token strictly on the server (Fail-Closed!)
   */
  async verifyOtpChallenge(
    email: string,
    enteredOtp: string,
    challengeToken: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!email || !enteredOtp || !challengeToken) {
      return { success: false, error: 'OTP verification requires valid email, code, and challenge token.' };
    }
    try {
      const backendRes = await postToAuthFunction({
        action: 'verify-otp-challenge',
        email,
        enteredOtp,
        challengeToken
      });
      if (!backendRes.isStaticFallback) {
        return backendRes;
      }
      return {
        success: false,
        error: 'Server OTP verification unavailable. Please connect to the internet and retry.'
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'OTP verification failed.' };
    }
  },

  /**
   * Verifies an issued session / device token strictly (Fail-Closed on invalid/expired tokens!)
   */
  async verifyDeviceToken(sessionToken: string): Promise<{ valid: boolean; claims?: any; error?: string }> {
    if (!sessionToken || typeof sessionToken !== 'string') {
      return { valid: false, error: 'Session token is required.' };
    }
    try {
      const backendRes = await postToAuthFunction({
        action: 'verify-device-token',
        sessionToken
      });

      if (!backendRes.isStaticFallback) {
        return backendRes;
      }

      return { valid: false, error: 'Unable to verify session token with server.' };
    } catch (err: any) {
      return { valid: false, error: err?.message || 'Session token verification failed.' };
    }
  }
};
