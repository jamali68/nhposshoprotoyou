/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Independent Core Authentication, OTP, & 15-Layer Anti-AI Security Engine (Provider-Agnostic)
 * 100% Decoupled Business Logic — Compatible with Netlify Serverless Functions & Firebase Cloud Functions.
 * All secrets, cryptographic salts, rate limiters, PoW verifiers, and master tokens stay strictly on the server.
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

// Bounded in-memory stores (prevents memory exhaustion DoS from distributed AI attacks)
const MAX_STORE_SIZE = 5000;
const rateLimitStore = new Map();
const ipBurstStore = new Map();
const usedNoncesStore = new Map();
const consumedOtpDigests = new Map();

// Known automated attack tools / scraper User-Agents
const BLOCKED_UA_REGEX =
  /(sqlmap|nikto|hydra|nmap|masscan|zgrab|gobuster|dirbuster|wfuzz|ffuf|burpsuite|acunetix|nessus|openvas|scrapy|python-requests|python-urllib|go-http-client|libwww-perl|curl\/|wget\/|httpx|nuclei|jaeles)/i;

// Server-side disposable/fake email domains blocklist
const SERVER_DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.org', 'sharklasers.com',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tmpmail.org', '10minutemail.com',
  'yopmail.com', 'yopmail.fr', 'trashmail.com', 'getnada.com', 'dispostable.com',
  'fakeinbox.com', 'throwawaymail.com', 'maildrop.cc', 'mohmal.com', 'emailondeck.com',
  'burnermail.io', 'mailnesia.com', 'tempinbox.com', 'inboxkitten.com', 'dropmail.me',
  'example.com', 'example.org', 'example.net', 'test.com', 'fake.com', 'asdf.com'
]);

const DANGEROUS_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function pruneMapIfOversized(map, now = Date.now()) {
  if (map.size < MAX_STORE_SIZE) return;
  for (const [k, v] of map.entries()) {
    const exp = typeof v === 'number' ? v : (v?.expiresAt || v?.lockUntil || 0);
    if (exp && now > exp) {
      map.delete(k);
    }
    if (map.size < Math.floor(MAX_STORE_SIZE * 0.7)) break;
  }
  // Evict oldest keys if still above cap
  if (map.size >= MAX_STORE_SIZE) {
    const excess = map.size - Math.floor(MAX_STORE_SIZE * 0.75);
    let removed = 0;
    for (const k of map.keys()) {
      map.delete(k);
      removed += 1;
      if (removed >= excess) break;
    }
  }
}

/**
 * Extract normalized client IP from Netlify/Proxy headers.
 */
export function getClientIp(event) {
  const raw =
    event?.headers?.['x-nf-client-connection-ip'] ||
    event?.headers?.['client-ip'] ||
    event?.headers?.['x-forwarded-for'] ||
    'unknown_ip';
  return String(raw).split(',')[0].trim().slice(0, 64);
}

/**
 * Layer 10: Strict Security Response Headers + Dynamic Origin CORS (Zero wildcard '*')
 */
export function buildSecurityHeaders(event, allowedMethods = 'GET, POST, OPTIONS') {
  const origin = (event?.headers?.origin || event?.headers?.Origin || '').trim();
  const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  let allowOrigin = '';
  if (origin) {
    if (configuredOrigins.length > 0) {
      if (configuredOrigins.includes(origin)) {
        allowOrigin = origin;
      }
    } else if (/^https?:\/\/[a-zA-Z0-9.-]+(?::\d+)?$/i.test(origin)) {
      allowOrigin = origin;
    }
  }

  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...(allowOrigin ? { 'Access-Control-Allow-Origin': allowOrigin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Requested-With, X-NH-Timestamp, X-NH-Nonce, X-NH-PoW',
    'Access-Control-Allow-Methods': allowedMethods,
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  };
}

/**
 * Layer 12A: Block known automated scanner / headless brute-force User-Agents
 */
export function isBlockedBotUserAgent(event) {
  const ua = String(event?.headers?.['user-agent'] || event?.headers?.['User-Agent'] || '').trim();
  if (!ua) return true;
  return BLOCKED_UA_REGEX.test(ua);
}

/**
 * Layer 11A: Global Per-IP Flood & Burst Rate Limiter (Stops high-volume AI attack waves)
 * Allows max 30 POST requests per 60 seconds per IP; repeated abuse escalates to 15-min IP ban.
 */
export function checkIpBurstLimit(ip, maxPerMinute = 30, windowMs = 60 * 1000) {
  const now = Date.now();
  pruneMapIfOversized(ipBurstStore, now);
  const key = `burst:${ip}`;
  let rec = ipBurstStore.get(key);

  if (rec) {
    if (rec.banUntil && now < rec.banUntil) {
      const waitSec = Math.ceil((rec.banUntil - now) / 1000);
      return {
        allowed: false,
        error: `IP عارضی طور پر بلاک ہے (مشکوک AI/بوٹ ٹریفک)۔ ${waitSec} سیکنڈ بعد کوشش کریں۔ (Rate limit active: ${waitSec}s)`
      };
    }
    if (now - rec.windowStart > windowMs) {
      rec = { count: 0, windowStart: now, violations: rec.violations || 0, banUntil: 0, expiresAt: now + 30 * 60 * 1000 };
    }
  } else {
    rec = { count: 0, windowStart: now, violations: 0, banUntil: 0, expiresAt: now + 30 * 60 * 1000 };
  }

  rec.count += 1;
  rec.expiresAt = now + 30 * 60 * 1000;

  if (rec.count > maxPerMinute) {
    rec.violations += 1;
    // Exponential IP ban: 2m -> 15m -> 60m
    const banDuration =
      rec.violations >= 3 ? 60 * 60 * 1000 : rec.violations === 2 ? 15 * 60 * 1000 : 2 * 60 * 1000;
    rec.banUntil = now + banDuration;
    rec.expiresAt = rec.banUntil + 60 * 1000;
    ipBurstStore.set(key, rec);
    return {
      allowed: false,
      error: `بہت زیادہ درخواستیں! IP کو عارضی طور پر بند کر دیا گیا ہے۔ (Too many requests from this IP)`
    };
  }

  ipBurstStore.set(key, rec);
  return { allowed: true };
}

/**
 * Layer 12B: Server-Side Anti-AI Proof-of-Work, Nonce Anti-Replay & Custom Header Gate
 * Verifies:
 * 1. X-Requested-With: NH-POS-Client (CSRF & blind-bot blocker)
 * 2. X-NH-Timestamp within +/- 120s window (blocks delayed replay attacks)
 * 3. X-NH-Nonce unseen within window (blocks duplicate replay attacks)
 * 4. SHA-256(`${action}:${timestamp}:${nonce}:${pow}`) starts with '00' (Anti-AI compute shield)
 */
export function verifyAntiBotShield(event, action) {
  const headers = event?.headers || {};
  const getHeader = (name) => {
    const target = name.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === target) return String(v || '').trim();
    }
    return '';
  };

  const reqWith = getHeader('x-requested-with');
  const timestampStr = getHeader('x-nh-timestamp');
  const nonce = getHeader('x-nh-nonce');
  const pow = getHeader('x-nh-pow');

  if (reqWith !== 'NH-POS-Client') {
    return {
      valid: false,
      error: 'Security verification failed: unauthorized client header.'
    };
  }

  const ts = Number(timestampStr);
  const now = Date.now();
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 120 * 1000) {
    return {
      valid: false,
      error: 'Security challenge expired. Please check device clock and try again.'
    };
  }

  if (!nonce || !/^[a-f0-9]{16,64}$/i.test(nonce)) {
    return {
      valid: false,
      error: 'Invalid security nonce.'
    };
  }

  pruneMapIfOversized(usedNoncesStore, now);
  if (usedNoncesStore.has(nonce)) {
    return {
      valid: false,
      error: 'Replay attack blocked: security nonce already consumed.'
    };
  }

  if (!/^\d{1,6}$/.test(pow)) {
    return {
      valid: false,
      error: 'Invalid anti-bot proof-of-work token.'
    };
  }

  const digest = crypto
    .createHash('sha256')
    .update(`${action}:${timestampStr}:${nonce}:${pow}`)
    .digest();

  if (digest[0] !== 0) {
    return {
      valid: false,
      error: 'Anti-AI security proof verification failed.'
    };
  }

  // Consume nonce for 3 minutes to block replays
  usedNoncesStore.set(nonce, now + 3 * 60 * 1000);
  return { valid: true };
}

/**
 * Layer 13: Request Body Firewall (Size Limit, Strict JSON Parse, Prototype Pollution & NoSQL Operator Blocker)
 */
function sanitizeIncomingObject(value, depth = 0) {
  if (depth > 6) {
    throw new Error('Payload nesting limit exceeded');
  }
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.replace(/\0/g, '').slice(0, 4096);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) throw new Error('Payload array size limit exceeded');
    return value.map(item => sanitizeIncomingObject(item, depth + 1));
  }
  if (typeof value === 'object') {
    const clean = Object.create(null);
    const entries = Object.entries(value);
    if (entries.length > 50) throw new Error('Too many fields in request payload');
    for (const [key, val] of entries) {
      if (DANGEROUS_OBJECT_KEYS.has(key) || key.startsWith('$')) {
        throw new Error('Forbidden payload key detected');
      }
      clean[key] = sanitizeIncomingObject(val, depth + 1);
    }
    return clean;
  }
  return undefined;
}

export function parseAndSanitizeBody(event, maxBytes = 16384) {
  const rawBody = event?.body || '';
  if (typeof rawBody !== 'string') {
    return { ok: false, statusCode: 400, error: 'Invalid request body' };
  }
  if (Buffer.byteLength(rawBody, 'utf8') > maxBytes) {
    return { ok: false, statusCode: 413, error: 'Payload too large (blocked by firewall)' };
  }

  let parsed;
  try {
    parsed = JSON.parse(rawBody || '{}');
  } catch {
    return { ok: false, statusCode: 400, error: 'Malformed JSON body' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, statusCode: 400, error: 'Request payload must be a JSON object' };
  }

  try {
    const sanitized = sanitizeIncomingObject(parsed);
    // Honeypot field check on server side too
    if (
      (typeof sanitized.website_url === 'string' && sanitized.website_url.trim() !== '') ||
      (typeof sanitized.company_fax === 'string' && sanitized.company_fax.trim() !== '')
    ) {
      return { ok: false, statusCode: 403, error: 'Automated bot submission rejected.' };
    }
    return { ok: true, payload: sanitized };
  } catch (err) {
    return { ok: false, statusCode: 400, error: err?.message || 'Blocked unsafe payload' };
  }
}

/**
 * Server-side disposable/fake email check
 */
export function isDisposableOrFakeEmail(email) {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean || clean.length > 120 || !clean.includes('@')) return true;
  const [local, domain] = clean.split('@');
  if (!local || !domain || local.length < 2 || clean.includes('..')) return true;
  if (
    SERVER_DISPOSABLE_DOMAINS.has(domain) ||
    domain.includes('tempmail') ||
    domain.includes('mailinator') ||
    domain.includes('yopmail') ||
    domain.includes('guerrilla') ||
    domain.includes('10minute') ||
    domain.includes('trashmail')
  ) {
    return true;
  }
  if (/^(.)\1{4,}$/.test(local)) return true;
  return false;
}

/**
 * Artificial timing-attack & rapid brute-force jitter on failed auth (150ms–350ms)
 */
export async function applyFailureJitter() {
  const delayMs = 150 + crypto.randomInt(0, 200);
  await new Promise(resolve => setTimeout(resolve, delayMs));
}

/**
 * Constant-time string comparison using SHA-256 digests so lengths never leak.
 */
function timingSafeStringEqual(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a)).digest();
  const hashB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Layer 11B: Exponential Account/IP Brute-Force Rate Limiter
 * 5 fails -> 15m lock, 10 fails -> 1h lock, 15+ fails -> 24h lock.
 */
export function checkRateLimit(identifier, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  pruneMapIfOversized(rateLimitStore, now);
  const record = rateLimitStore.get(identifier);

  if (record) {
    if (record.lockUntil && now < record.lockUntil) {
      const waitSeconds = Math.ceil((record.lockUntil - now) / 1000);
      return {
        allowed: false,
        error: `بہت زیادہ غلط کوششیں! براہ کرم ${waitSeconds} سیکنڈ بعد دوبارہ کوشش کریں۔ (Too many attempts. Try again in ${waitSeconds}s)`
      };
    }
    if (now - record.firstAttempt > windowMs && (!record.lockUntil || now >= record.lockUntil)) {
      rateLimitStore.delete(identifier);
    }
  }

  return { allowed: true };
}

export function recordFailedAttempt(
  identifier,
  maxAttempts = 5,
  _windowMs = 15 * 60 * 1000,
  baseLockoutMs = 15 * 60 * 1000
) {
  const now = Date.now();
  pruneMapIfOversized(rateLimitStore, now);
  const record = rateLimitStore.get(identifier) || {
    attempts: 0,
    totalFailures: 0,
    firstAttempt: now,
    lockUntil: 0,
    expiresAt: now + 24 * 60 * 60 * 1000
  };

  record.attempts += 1;
  record.totalFailures = (record.totalFailures || 0) + 1;

  if (record.attempts >= maxAttempts) {
    let lockDuration = baseLockoutMs;
    if (record.totalFailures >= 15) {
      lockDuration = 24 * 60 * 60 * 1000; // 24-hour ban
    } else if (record.totalFailures >= 10) {
      lockDuration = 60 * 60 * 1000; // 1-hour ban
    }
    record.lockUntil = now + lockDuration;
    record.attempts = 0; // Reset burst counter for next tier after lock expires
  }
  record.expiresAt = Math.max(now + 24 * 60 * 60 * 1000, record.lockUntil + 60 * 1000);
  rateLimitStore.set(identifier, record);
}

export function clearRateLimit(identifier) {
  rateLimitStore.delete(identifier);
}

/**
 * Layer 14A: Upgraded PBKDF2-SHA256 Password Hashing (120,000 OWASP iterations for new hashes)
 * Tagged as `v2$120000$<hex>` while keeping 100% seamless verification for legacy 12,000-iteration hashes.
 */
export function hashPassword(password, existingSalt = null) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const iterations = 120000;
  const derivedKey = crypto.pbkdf2Sync(password.trim(), salt, iterations, 32, 'sha256');
  return {
    hash: `v2$${iterations}$${derivedKey.toString('hex')}`,
    salt
  };
}

/**
 * Verifies a plaintext password against a stored hash and salt (supports v2 120k, v1 12k, and legacy '123456').
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
    let iterations = 12000;
    let targetHex = storedHash;

    if (typeof storedHash === 'string' && storedHash.startsWith('v2$')) {
      const segments = storedHash.split('$');
      if (segments.length === 3) {
        const parsedIter = parseInt(segments[1], 10);
        if (Number.isFinite(parsedIter) && parsedIter >= 10000 && parsedIter <= 600000) {
          iterations = parsedIter;
          targetHex = segments[2];
        }
      }
    }

    const derived = crypto.pbkdf2Sync(cleanPass, salt, iterations, 32, 'sha256').toString('hex');
    const hashBuffer = Buffer.from(targetHex, 'hex');
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
  if (!newSecretKey || typeof newSecretKey !== 'string' || newSecretKey.trim().length < 8) {
    return { valid: false, error: 'Secret key must be at least 8 characters' };
  }
  runtimeMasterSecret = newSecretKey.trim();
  return { valid: true };
}

/**
 * Creates a stateless HMAC-signed OTP Challenge Token (Valid for 10 minutes).
 * Includes a random jti nonce so every OTP challenge is uniquely bound and single-use.
 */
export function createOtpChallenge(email, otpCode, expiresInMs = 10 * 60 * 1000) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanOtp = String(otpCode || '').trim();
  const exp = Date.now() + expiresInMs;
  const jti = crypto.randomBytes(12).toString('hex');

  const otpDigest = crypto
    .createHmac('sha256', getTokenSecret())
    .update(`${cleanEmail}:${cleanOtp}:${exp}:${jti}`)
    .digest('hex');

  const payload = {
    email: cleanEmail,
    exp,
    jti,
    digest: otpDigest
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Layer 14B: Single-Use OTP Challenge Verification (Blocks replay attacks after first use)
 */
export function verifyOtpChallenge(email, enteredOtp, challengeToken) {
  if (!email || !enteredOtp || !challengeToken) {
    return { valid: false, error: 'ای میل اور 6 ہندسوں کا OTP کوڈ لازمی ہے۔' };
  }

  try {
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanOtp = String(enteredOtp).trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      return { valid: false, error: 'درج کردہ OTP کوڈ 6 ہندسوں کا ہونا لازمی ہے۔' };
    }

    const decoded = JSON.parse(Buffer.from(challengeToken, 'base64url').toString('utf8'));
    if (!decoded || decoded.email !== cleanEmail || !decoded.digest) {
      return { valid: false, error: 'ای میل میچ نہیں کر سکی۔ دوبارہ کوشش کریں۔' };
    }

    const now = Date.now();
    const exp = Number(decoded.exp || 0);
    if (now > exp) {
      return { valid: false, error: 'یہ OTP کوڈ ایکسپائر ہو چکا ہے۔ نیا کوڈ منگوائیں۔ (OTP Expired)' };
    }

    pruneMapIfOversized(consumedOtpDigests, now);
    if (consumedOtpDigests.has(decoded.digest)) {
      return { valid: false, error: 'یہ OTP کوڈ پہلے ہی استعمال ہو چکا ہے۔ نیا کوڈ منگوائیں۔ (OTP already used)' };
    }

    const message = decoded.jti
      ? `${cleanEmail}:${cleanOtp}:${exp}:${decoded.jti}`
      : `${cleanEmail}:${cleanOtp}:${exp}`;

    const expectedDigest = crypto
      .createHmac('sha256', getTokenSecret())
      .update(message)
      .digest('hex');

    const a = Buffer.from(expectedDigest, 'hex');
    const b = Buffer.from(String(decoded.digest), 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false, error: 'درج کردہ OTP کوڈ غلط ہے۔ برائے مہربانی درست کوڈ درج کریں۔' };
    }

    // Mark OTP digest as permanently consumed until expiry
    consumedOtpDigests.set(decoded.digest, exp + 60 * 1000);

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
 * Creates a signed session / device token (JWT-compatible HMAC SHA-256 with unique jti).
 */
export function createSessionToken(payload, expiresInMs = 30 * 24 * 60 * 60 * 1000) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Date.now();
  const exp = now + expiresInMs;
  const jti = crypto.randomBytes(12).toString('hex');
  const claims = { ...payload, jti, exp, iat: now };

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
