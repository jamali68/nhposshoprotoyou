/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Independent Core Authentication, OTP, & Super Admin Security Service (Provider-Agnostic)
 * 100% Decoupled Business Logic — Compatible with Netlify Serverless Functions & Firebase Cloud Functions.
 * All secrets, cryptographic salts, and master tokens stay strictly on the server.
 */

import crypto from 'crypto';

// Secret key for signing sessions, OTP challenges, and Super Admin tokens.
// Always read from server environment variables; falls back to an ephemeral 256-bit key in memory.
const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');
function getTokenSecret() {
  return (
    process.env.AUTH_TOKEN_SECRET ||
    process.env.JWT_SECRET ||
    process.env.SUPER_ADMIN_TOKEN_SECRET ||
    EPHEMERAL_FALLBACK_SECRET
  );
}

// Master Super Admin Emails (Read from env var if configured, otherwise restricted to authorized owner emails)
const DEFAULT_MASTER_EMAILS = [
  'helpgoodforyouofficial@gmail.com',
  'aliimtiaz1126@gmail.com'
];

export const MASTER_SUPER_ADMIN_EMAILS = process.env.SUPER_ADMIN_EMAILS
  ? process.env.SUPER_ADMIN_EMAILS.split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean)
  : DEFAULT_MASTER_EMAILS;

// Master Secret Passkey — strictly read from server environment variable (never hardcoded in source)
let runtimeMasterSecret = (process.env.SUPER_ADMIN_SECRET_KEY || '').trim();

// Cached Google Firebase SecureToken public x509 certificates for RS256 signature verification
const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let cachedFirebaseCerts = null;
let cachedFirebaseCertsExpiry = 0;

// In-memory rate limiter for brute-force protection
// Map: key (e.g. `ip:email`) -> { attempts: number, lockUntil: number, firstAttempt: number }
const rateLimitStore = new Map();

/**
 * Constant-time string comparison using SHA-256 digests so lengths never leak.
 */
function timingSafeStringEqual(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a)).digest();
  const hashB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

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
    if (storedHash && timingSafeStringEqual(cleanPass, storedHash)) {
      return { valid: true, mustChangePassword: cleanPass === '123456', isLegacy: true };
    }
    return { valid: false, mustChangePassword: false, isLegacy: false };
  }

  try {
    const derived = crypto.pbkdf2Sync(cleanPass, salt, 12000, 32, 'sha256').toString('hex');
    const hashBuffer = Buffer.from(storedHash, 'hex');
    const derivedBuffer = Buffer.from(derived, 'hex');

    if (hashBuffer.length !== derivedBuffer.length) {
      if (timingSafeStringEqual(cleanPass, storedHash)) {
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
    if (storedHash && timingSafeStringEqual(cleanPass, storedHash)) {
      return { valid: true, mustChangePassword: cleanPass === '123456', isLegacy: true };
    }
    return { valid: false, mustChangePassword: false, isLegacy: false };
  }
}

/**
 * Verifies Super Admin Master Credentials strictly against server-side environment secret.
 * Never trusts client-supplied stored keys.
 */
export function verifySuperAdminCredentials(email, secretKey) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanKey = String(secretKey || '').trim();

  if (!MASTER_SUPER_ADMIN_EMAILS.includes(cleanEmail)) {
    return {
      valid: false,
      error: 'غیر مجاز ماسٹر ای میل! (Unauthorized Master Email address)'
    };
  }

  const effectiveMasterKey = (runtimeMasterSecret || process.env.SUPER_ADMIN_SECRET_KEY || '').trim();
  if (!effectiveMasterKey) {
    return {
      valid: false,
      error: 'Server par SUPER_ADMIN_SECRET_KEY configure nahi hai. Netlify Environment Variables mein key set karein.'
    };
  }

  if (!cleanKey || !timingSafeStringEqual(cleanKey, effectiveMasterKey)) {
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
 * Updates runtime Super Admin Secret Key on server (caller MUST verify Super Admin token first).
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
    .createHmac('sha256', getTokenSecret())
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
      .createHmac('sha256', getTokenSecret())
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
 * Fetches and caches Google's official public x509 certificates for Firebase Auth ID tokens.
 */
async function getFirebasePublicCerts() {
  const now = Date.now();
  if (cachedFirebaseCerts && now < cachedFirebaseCertsExpiry) {
    return cachedFirebaseCerts;
  }

  const res = await fetch(FIREBASE_CERTS_URL, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase public keys (HTTP ${res.status})`);
  }

  const certs = await res.json();
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const ttlSeconds = maxAgeMatch ? Math.max(60, parseInt(maxAgeMatch[1], 10)) : 3600;

  cachedFirebaseCerts = certs;
  cachedFirebaseCertsExpiry = now + ttlSeconds * 1000;
  return certs;
}

/**
 * Cryptographically verifies a Firebase Auth ID token (RS256) using Google's official public certs.
 */
async function verifyFirebaseAuthJwt(trimmedToken) {
  const parts = trimmedToken.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Malformed Firebase ID token' };
  }

  let header;
  let data;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    data = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return { valid: false, error: 'Invalid JWT encoding' };
  }

  if (header.alg !== 'RS256' || !header.kid) {
    return { valid: false, error: 'Unsupported token algorithm or missing key ID' };
  }

  const certs = await getFirebasePublicCerts();
  const publicCert = certs[header.kid];
  if (!publicCert) {
    return { valid: false, error: 'Unrecognized Firebase signing key ID' };
  }

  // Cryptographic RS256 signature verification
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  const signatureValid = verifier.verify(publicCert, parts[2], 'base64url');
  if (!signatureValid) {
    return { valid: false, error: 'Invalid Firebase token cryptographic signature' };
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  const exp = Number(data.exp || 0);
  const iat = Number(data.iat || 0);
  if (!exp || exp <= nowInSeconds) {
    return { valid: false, error: 'Google token has expired. Please sign in again.' };
  }
  if (iat && iat > nowInSeconds + 300) {
    return { valid: false, error: 'Token issued-at timestamp is invalid.' };
  }

  const expectedProjectId = (process.env.FIREBASE_PROJECT_ID || '').trim();
  const aud = String(data.aud || '').trim();
  const iss = String(data.iss || '').trim();
  if (!aud || iss !== `https://securetoken.google.com/${aud}`) {
    return { valid: false, error: 'Firebase token issuer/audience mismatch.' };
  }
  if (expectedProjectId && aud !== expectedProjectId) {
    return { valid: false, error: 'Firebase token project audience mismatch.' };
  }

  const sub = String(data.user_id || data.sub || '').trim();
  const email = String(data.email || '').toLowerCase().trim();
  const emailVerified = data.email_verified === 'true' || data.email_verified === true;

  if (!sub || !email) {
    return { valid: false, error: 'No verified user identity found in token.' };
  }
  if (!emailVerified) {
    return { valid: false, error: 'Google email is not verified by Google.' };
  }

  return {
    valid: true,
    email,
    googleId: sub,
    name: data.name || '',
    picture: data.picture || '',
    emailVerified: true
  };
}

/**
 * Cryptographically verifies a Google OAuth ID token or Firebase Auth Google ID token.
 * NEVER trusts unverified/unsigned JWT payloads.
 */
export async function verifyGoogleIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    return { valid: false, error: 'Google ID Token is missing or invalid' };
  }

  const trimmedToken = idToken.trim();
  const parts = trimmedToken.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Malformed Google ID token' };
  }

  try {
    // Inspect issuer ONLY to route to the right cryptographic verifier (never trust claims yet)
    let iss = '';
    try {
      const unverifiedPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      iss = String(unverifiedPayload?.iss || '');
    } catch {
      return { valid: false, error: 'Invalid token payload encoding' };
    }

    // 1. Firebase Auth ID Token -> Cryptographic RS256 verification against Google's official certs
    if (iss.startsWith('https://securetoken.google.com/')) {
      return await verifyFirebaseAuthJwt(trimmedToken);
    }

    // 2. Standard Google OAuth ID Token -> Official Google tokeninfo endpoint verification
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(trimmedToken)}`;
    const res = await fetch(url, { method: 'GET' });

    if (!res.ok) {
      return { valid: false, error: 'Google token verification failed.' };
    }

    const data = await res.json();

    const expectedClientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    if (expectedClientId && data.aud !== expectedClientId) {
      return { valid: false, error: 'Google token audience mismatch.' };
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    const exp = Number(data.exp || 0);
    if (!exp || exp <= nowInSeconds) {
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

  const signature = crypto.createHmac('sha256', getTokenSecret()).update(message).digest('base64url');
  return `${message}.${signature}`;
}

/**
 * Validates a signed session / device token using constant-time comparison.
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
  const expectedSig = crypto.createHmac('sha256', getTokenSecret()).update(message).digest('base64url');

  if (!timingSafeStringEqual(signature, expectedSig)) {
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
