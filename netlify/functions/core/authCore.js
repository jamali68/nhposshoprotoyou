/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Independent Core Authentication, OTP, & Super Admin Security Service (Provider-Agnostic)
 * 100% Decoupled Business Logic — Compatible with Netlify Serverless Functions & Firebase Cloud Functions.
 * All secrets, cryptographic salts, and master tokens stay strictly on the server.
 */

import crypto from 'crypto';

// Secret key for signing sessions, OTP challenges, and Super Admin tokens
// Uses Netlify / Server Environment Variables first, with secure fallback
const TOKEN_SECRET =
  process.env.AUTH_TOKEN_SECRET ||
  process.env.JWT_SECRET ||
  process.env.SUPER_ADMIN_TOKEN_SECRET ||
  'nh-pos-production-secure-token-salt-98234710';

// Master Super Admin Emails (Strictly restricted to the 2 authorized owner emails)
export const MASTER_SUPER_ADMIN_EMAILS = [
  'helpgoodforyouofficial@gmail.com',
  'aliimtiaz1126@gmail.com'
];

// Master Secret Passkey (Read from server env var SUPER_ADMIN_SECRET_KEY)
let runtimeMasterSecret = process.env.SUPER_ADMIN_SECRET_KEY || 'NH-SUPER-786';

// In-memory rate limiter for brute-force protection
// Map: key (e.g. `ip:email`) -> { attempts: number, lockUntil: number, firstAttempt: number }
const rateLimitStore = new Map();

/**
 * Check and record an authentication attempt to prevent brute-force attacks.
 * Max 5 failed attempts per 15-minute window.
 */
export function checkRateLimit(identifier, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);

  if (record) {
    if (record.lockUntil && now < record.lockUntil) {
      const waitSeconds = Math.ceil((record.lockUntil - now) / 1000);
      return {
        allowed: false,
        error: `بہت زیادہ غلط کوششیں! براہ کرم ${waitSeconds} سیکنڈ بعد دوبارہ کوشش کریں۔ (Too many attempts. Try again in ${waitSeconds}s)`
      };
    }
    if (now - record.firstAttempt > windowMs) {
      rateLimitStore.delete(identifier);
    }
  }

  return { allowed: true };
}

export function recordFailedAttempt(
  identifier,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000,
  lockoutMs = 15 * 60 * 1000
) {
  const now = Date.now();
  const record = rateLimitStore.get(identifier) || { attempts: 0, firstAttempt: now, lockUntil: 0 };

  record.attempts += 1;
  if (record.attempts >= maxAttempts) {
    record.lockUntil = now + lockoutMs;
  }
  rateLimitStore.set(identifier, record);
}

export function clearRateLimit(identifier) {
  rateLimitStore.delete(identifier);
}

/**
 * Hash a password using PBKDF2 with a cryptographically secure random salt.
 */
export function hashPassword(password, existingSalt = null) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.pbkdf2Sync(password.trim(), salt, 12000, 32, 'sha256');
  return {
    hash: derivedKey.toString('hex'),
    salt
  };
}

/**
 * Verifies a plaintext password against a stored hash and salt.
 * Also securely validates legacy migration password '123456'.
 */
export function verifyPassword(password, storedHash, salt) {
  if (!password) {
    return { valid: false, mustChangePassword: false, isLegacy: false };
  }

  const cleanPass = String(password).trim();

  // Legacy fallback check: If stored hash is '123456' or plaintext '123456' was supplied
  const isLegacyMatch =
    (storedHash === '123456' && cleanPass === '123456') ||
    (!storedHash && cleanPass === '123456');

  if (isLegacyMatch) {
    return {
      valid: true,
      mustChangePassword: true,
      isLegacy: true
    };
  }

  if (!storedHash || !salt) {
    if (storedHash && cleanPass === storedHash) {
      return { valid: true, mustChangePassword: cleanPass === '123456', isLegacy: true };
    }
    return { valid: false, mustChangePassword: false, isLegacy: false };
  }

  try {
    const derived = crypto.pbkdf2Sync(cleanPass, salt, 12000, 32, 'sha256').toString('hex');
    const hashBuffer = Buffer.from(storedHash, 'hex');
    const derivedBuffer = Buffer.from(derived, 'hex');

    if (hashBuffer.length !== derivedBuffer.length) {
      if (cleanPass === storedHash) {
        return { valid: true, mustChangePassword: cleanPass === '123456', isLegacy: true };
      }
      return { valid: false, mustChangePassword: false, isLegacy: false };
    }

    const valid = crypto.timingSafeEqual(hashBuffer, derivedBuffer);
    const mustChangePassword = cleanPass === '123456';

    return {
      valid,
      mustChangePassword,
      isLegacy: false
    };
  } catch {
    if (storedHash && cleanPass === storedHash) {
      return { valid: true, mustChangePassword: cleanPass === '123456', isLegacy: true };
    }
    return { valid: false, mustChangePassword: false, isLegacy: false };
  }
}

/**
 * Verifies Super Admin Master Credentials on the server.
 */
export function verifySuperAdminCredentials(email, secretKey, customStoredKey = null) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanKey = String(secretKey || '').trim();

  if (!MASTER_SUPER_ADMIN_EMAILS.includes(cleanEmail)) {
    return {
      valid: false,
      error: 'غیر مجاز ماسٹر ای میل! (Unauthorized Master Email address)'
    };
  }

  const effectiveMasterKey = customStoredKey || runtimeMasterSecret;
  if (!cleanKey || (cleanKey !== effectiveMasterKey && cleanKey !== runtimeMasterSecret)) {
    return {
      valid: false,
      error: 'ماسٹر سیکیورٹی کی (Master Secret Key) غلط ہے۔'
    };
  }

  const token = createSessionToken(
    {
      email: cleanEmail,
      role: 'super_admin',
      isSuperAdmin: true,
      authMethod: 'super_admin_master_key'
    },
    12 * 60 * 60 * 1000 // 12 hours master session
  );

  return {
    valid: true,
    masterEmail: cleanEmail,
    token
  };
}

/**
 * Updates runtime Super Admin Secret Key on server (if authenticated)
 */
export function updateSuperAdminSecret(newSecretKey) {
  if (!newSecretKey || typeof newSecretKey !== 'string' || newSecretKey.trim().length < 6) {
    return { valid: false, error: 'Secret key must be at least 6 characters' };
  }
  runtimeMasterSecret = newSecretKey.trim();
  return { valid: true };
}

/**
 * Creates a stateless HMAC-signed OTP Challenge Token (Valid for 10 minutes).
 * Never exposes the raw OTP in the token payload!
 */
export function createOtpChallenge(email, otpCode, expiresInMs = 10 * 60 * 1000) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanOtp = String(otpCode || '').trim();
  const exp = Date.now() + expiresInMs;

  const otpDigest = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(`${cleanEmail}:${cleanOtp}:${exp}`)
    .digest('hex');

  const payload = {
    email: cleanEmail,
    exp,
    digest: otpDigest
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Verifies a 6-digit OTP code against the stateless HMAC challenge token.
 */
export function verifyOtpChallenge(email, enteredOtp, challengeToken) {
  if (!email || !enteredOtp || !challengeToken) {
    return { valid: false, error: 'ای میل اور 6 ہندسوں کا OTP کوڈ لازمی ہے۔' };
  }

  try {
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanOtp = String(enteredOtp).trim();
    const decoded = JSON.parse(Buffer.from(challengeToken, 'base64url').toString('utf8'));

    if (!decoded || decoded.email !== cleanEmail) {
      return { valid: false, error: 'ای میل میچ نہیں کر سکی۔ دوبارہ کوشش کریں۔' };
    }

    if (Date.now() > Number(decoded.exp || 0)) {
      return { valid: false, error: 'یہ OTP کوڈ ایکسپائر ہو چکا ہے۔ نیا کوڈ منگوائیں۔ (OTP Expired)' };
    }

    const expectedDigest = crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(`${cleanEmail}:${cleanOtp}:${decoded.exp}`)
      .digest('hex');

    const a = Buffer.from(expectedDigest, 'hex');
    const b = Buffer.from(decoded.digest || '', 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false, error: 'درج کردہ OTP کوڈ غلط ہے۔ برائے مہربانی درست کوڈ درج کریں۔' };
    }

    return { valid: true, email: cleanEmail };
  } catch {
    return { valid: false, error: 'OTP کی تصدیق میں خرابی پیش آئی۔' };
  }
}

/**
 * Verifies a Google ID token against Google's official OAuth tokeninfo endpoint.
 */
export async function verifyGoogleIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    return { valid: false, error: 'Google ID Token is missing or invalid' };
  }

  try {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken.trim())}`;
    const res = await fetch(url, { method: 'GET' });

    if (!res.ok) {
      const errorText = await res.text();
      return { valid: false, error: `Google token verification failed: ${errorText}` };
    }

    const data = await res.json();

    const nowInSeconds = Math.floor(Date.now() / 1000);
    const exp = Number(data.exp || 0);
    if (exp <= nowInSeconds) {
      return { valid: false, error: 'Google token has expired. Please sign in again.' };
    }

    const emailVerified = data.email_verified === 'true' || data.email_verified === true;
    if (!emailVerified) {
      return { valid: false, error: 'Google email is not verified by Google.' };
    }

    const email = (data.email || '').toLowerCase().trim();
    if (!email) {
      return { valid: false, error: 'No email found in Google token payload.' };
    }

    return {
      valid: true,
      email,
      googleId: data.sub,
      name: data.name || '',
      picture: data.picture || '',
      emailVerified: true
    };
  } catch (err) {
    return { valid: false, error: err.message || 'Network error verifying Google ID token' };
  }
}

/**
 * Creates a signed session / device token (JWT-compatible HMAC SHA-256).
 */
export function createSessionToken(payload, expiresInMs = 30 * 24 * 60 * 60 * 1000) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Date.now() + expiresInMs;
  const claims = { ...payload, exp, iat: Date.now() };

  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Claims = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const message = `${b64Header}.${b64Claims}`;

  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(message).digest('base64url');
  return `${message}.${signature}`;
}

/**
 * Validates a signed session / device token.
 */
export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token missing' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Malformed token' };
  }

  const [b64Header, b64Claims, signature] = parts;
  const message = `${b64Header}.${b64Claims}`;
  const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(message).digest('base64url');

  if (signature !== expectedSig) {
    return { valid: false, error: 'Invalid token signature' };
  }

  try {
    const claims = JSON.parse(Buffer.from(b64Claims, 'base64url').toString('utf8'));
    if (claims.exp && Date.now() > claims.exp) {
      return { valid: false, error: 'Session token expired' };
    }
    return { valid: true, claims };
  } catch {
    return { valid: false, error: 'Failed to parse claims' };
  }
}
