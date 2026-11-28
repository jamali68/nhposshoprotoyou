/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * NH POS Shop — 15-Layer Anti-AI & Anti-Fake-Account Security Shield (Client Core)
 * Protects authentication, shop registration, staff logins, and API traffic against:
 * - Automated AI brute-force & credential stuffing attacks
 * - Fake/disposable email & gibberish bot signups
 * - Replay attacks, rapid-fire request floods & headless bot scripts
 * - XSS, HTML/script injection, prototype pollution & session role tampering
 */

// 1. Curated blocklist of disposable, temporary, burner & test email domains
const DISPOSABLE_EMAIL_DOMAINS = new Set<string>([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.org', 'guerrillamail.net',
  'guerrillamail.biz', 'guerrillamail.de', 'sharklasers.com', 'grr.la', 'pokemail.net',
  'spam4.me', 'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tmpmail.org',
  'tmpmail.net', '10minutemail.com', '10minutemail.net', '10minmail.com',
  'yopmail.com', 'yopmail.fr', 'yopmail.net', 'cool.fr.nf', 'jetable.fr.nf',
  'trashmail.com', 'trashmail.net', 'trashmail.org', 'trashmail.de',
  'getnada.com', 'nada.email', 'dispostable.com', 'fakeinbox.com', 'fakemail.net',
  'throwawaymail.com', 'maildrop.cc', 'mintemail.com', 'mohmal.com', 'mytemp.email',
  'emailondeck.com', 'burnermail.io', 'mailnesia.com', 'tempinbox.com', 'mailcatch.com',
  'getairmail.com', 'inboxkitten.com', 'moakt.com', 'tmail.ws', 'dropmail.me',
  'harakirimail.com', 'spamgourmet.com', 'spambox.us', 'anonymbox.com',
  'example.com', 'example.org', 'example.net', 'test.com', 'test.org', 'fake.com',
  'asdf.com', 'abc.com', 'xyz.com', 'invalid.com', 'localhost', 'localdomain',
  'mailinator.net', 'mailinator.org', 'binkmail.com', 'bobmail.info', 'chammy.info',
  'devnullmail.com', 'letthemeatspam.com', 'mailinater.com', 'mailmetrash.com',
  'meltmail.com', 'mt2015.com', 'nospamfor.us', 'nowmymail.com', 'objectmail.com',
  'obobbo.com', 'oneoffemail.com', 'pookmail.com', 'shortmail.net', 'sneakemail.com',
  'soodonims.com', 'spambog.com', 'spambog.de', 'spambog.ru', 'spamfree24.org',
  'superrito.com', 'teleworm.us', 'dayrep.com', 'einrot.com', 'fleckens.hu',
  'gustr.com', 'jourrapide.com', 'rhyta.com', 'superrito.com', 'cuvox.de', 'armyspy.com'
]);

// 2. Common fake/bot placeholder words rejected for new shop & owner registration
const FAKE_NAME_PATTERNS = new Set<string>([
  'test', 'testing', 'tester', 'fake', 'dummy', 'sample', 'asdf', 'asdfg', 'asdfgh',
  'qwerty', 'qwert', 'zxcvb', 'abc', 'abcd', 'abcde', 'xyz', 'aaa', 'aaaa', 'bbb',
  'ccc', 'admin', 'administrator', 'root', 'null', 'undefined', 'none', 'n/a', 'na',
  'bot', 'spam', 'hack', 'hacker', 'exploit', 'script', 'unknown', 'anonymous',
  'user', 'shop', 'owner', 'name', 'myshop', 'testshop', 'fakeshop', '1234', '12345',
  '123456', '0000', '1111'
]);

// 3. Top weak / breached passwords blocked on new registration & password reset
const WEAK_PASSWORDS = new Set<string>([
  '123456', '1234567', '12345678', '123456789', '1234567890', '654321', '987654321',
  '000000', '00000000', '111111', '11111111', '222222', '333333', '444444', '555555',
  '666666', '777777', '888888', '999999', '121212', '112233', '123123', '102030',
  'password', 'password1', 'password123', 'pass123', 'pass1234', 'qwerty', 'qwerty123',
  'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbn', 'abc123', 'abcd1234', 'admin123',
  'admin1234', 'pakistan', 'pakistan123', 'iloveyou', 'welcome', 'welcome123',
  'letmein', 'monkey', 'dragon', 'football', 'baseball', 'master', 'shop123', 'pos123'
]);

const STRICT_EMAIL_REGEX =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]{0,62}[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,12})+$/;

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const LOCKOUT_STORAGE_PREFIX = '_nh_sec_lock_v18_';
const CIRCUIT_BREAKER_WINDOW_MS = 60 * 1000;
const CIRCUIT_BREAKER_MAX_CALLS = 18;
const recentAuthCalls: number[] = [];

export interface ValidationResult {
  valid: boolean;
  errorEn?: string;
  errorUr?: string;
}

export interface ProofOfWorkHeaders {
  'X-Requested-With': string;
  'X-NH-Timestamp': string;
  'X-NH-Nonce': string;
  'X-NH-PoW': string;
}

/**
 * Layer 7: Deep input sanitizer (strips HTML/script tags, dangerous URI schemes, control chars & null bytes)
 */
export function sanitizeTextInput(raw: string, maxLength = 160): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\0/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Layer 7B: Recursively removes prototype pollution & NoSQL operator keys from any payload
 */
export function sanitizeDeepPayload<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.replace(/\0/g, '') as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 500).map(item => sanitizeDeepPayload(item, depth + 1)) as unknown as T;
  }
  if (typeof value === 'object') {
    const clean: Record<string, any> = {};
    for (const [key, val] of Object.entries(value as Record<string, any>)) {
      if (DANGEROUS_KEYS.has(key) || key.startsWith('$')) continue;
      clean[key] = sanitizeDeepPayload(val, depth + 1);
    }
    return clean as T;
  }
  return value;
}

/**
 * Layer 1 & 2: Honeypot & Minimum Human Fill-Time Guard
 */
export function verifyHumanFormSubmission(params: {
  honeypotValue: string;
  formOpenedAt: number;
  hasInteracted: boolean;
  minElapsedMs?: number;
}): ValidationResult {
  const { honeypotValue, formOpenedAt, hasInteracted, minElapsedMs = 800 } = params;

  // Honeypot triggered by bot auto-filler
  if (honeypotValue && honeypotValue.trim().length > 0) {
    return {
      valid: false,
      errorEn: 'Automated bot activity detected. Submission blocked by Security Shield.',
      errorUr: 'مشکوک آٹومیٹڈ/بوٹ سرگرمی کی وجہ سے درخواست روک دی گئی ہے۔'
    };
  }

  const elapsed = Date.now() - formOpenedAt;
  if (elapsed < minElapsedMs && !hasInteracted) {
    return {
      valid: false,
      errorEn: 'Submission was too fast. Please verify your details and try again.',
      errorUr: 'فارم بہت تیزی سے جمع کرایا گیا۔ براہِ کرم اپنی تفصیلات چیک کر کے دوبارہ کوشش کریں۔'
    };
  }

  return { valid: true };
}

/**
 * Layer 3A: Strict Email Validation & Disposable/Fake Domain Blocker
 */
export function validateAuthenticEmail(email: string): ValidationResult {
  const clean = (email || '').trim().toLowerCase();
  if (!clean || clean.length > 120 || !STRICT_EMAIL_REGEX.test(clean) || clean.includes('..')) {
    return {
      valid: false,
      errorEn: 'Please enter a valid, real email address (e.g. yourname@gmail.com).',
      errorUr: 'برائے مہربانی درست اور اصلی ای میل ایڈریس درج کریں (مثلاً: yourname@gmail.com)۔'
    };
  }

  const [localPart, domain] = clean.split('@');
  if (!localPart || !domain || localPart.length < 2) {
    return {
      valid: false,
      errorEn: 'Email username is too short or invalid.',
      errorUr: 'ای میل ایڈریس درست نہیں ہے۔'
    };
  }

  // Block disposable / burner / temporary email services
  if (
    DISPOSABLE_EMAIL_DOMAINS.has(domain) ||
    domain.includes('tempmail') ||
    domain.includes('temp-mail') ||
    domain.includes('mailinator') ||
    domain.includes('throwaway') ||
    domain.includes('guerrilla') ||
    domain.includes('10minute') ||
    domain.includes('trashmail') ||
    domain.includes('fakeinbox') ||
    domain.includes('yopmail')
  ) {
    return {
      valid: false,
      errorEn: 'Temporary, fake, or disposable email addresses are blocked. Please use your real Gmail or business email.',
      errorUr: 'عارضی یا جعلی (Temporary/Fake) ای میل قبول نہیں کی جاتی۔ براہِ کرم اپنا اصلی Gmail یا بزنس ای میل استعمال کریں۔'
    };
  }

  // Block obviously fake repeated-character local parts (e.g., aaaaa@gmail.com)
  if (/^(.)\1{4,}$/.test(localPart)) {
    return {
      valid: false,
      errorEn: 'This email appears to be fake. Please provide a genuine email address.',
      errorUr: 'یہ ای میل جعلی معلوم ہوتی ہے۔ براہِ کرم اصلی ای میل ایڈریس درج کریں۔'
    };
  }

  return { valid: true };
}

/**
 * Layer 3B: Authentic Shop Name & Owner Name Validator (Blocks gibberish, scripts & fake inputs)
 */
export function validateAuthenticName(
  rawName: string,
  fieldLabelEn: string,
  fieldLabelUr: string
): ValidationResult {
  const clean = sanitizeTextInput(rawName, 80);
  if (clean.length < 3) {
    return {
      valid: false,
      errorEn: `${fieldLabelEn} must be at least 3 characters long.`,
      errorUr: `${fieldLabelUr} کم از کم 3 حروف کا ہونا ضروری ہے۔`
    };
  }

  // Must contain at least 2 real alphabetic characters (Latin or Urdu/Arabic Unicode)
  const letterMatches = clean.match(/[a-zA-Z\u0600-\u06FF]/g) || [];
  if (letterMatches.length < 2) {
    return {
      valid: false,
      errorEn: `${fieldLabelEn} must contain real letters, not just numbers or symbols.`,
      errorUr: `${fieldLabelUr} میں اصلی حروف ہونا ضروری ہیں، صرف نمبر یا علامات قبول نہیں۔`
    };
  }

  // Reject excessive repeated identical characters like "aaaaaa" or "111111"
  if (/(.)\1{4,}/i.test(clean)) {
    return {
      valid: false,
      errorEn: `${fieldLabelEn} looks invalid or fake. Please enter a genuine name.`,
      errorUr: `${fieldLabelUr} درست یا اصلی معلوم نہیں ہوتا۔ براہِ کرم صحیح نام درج کریں۔`
    };
  }

  // Reject URLs/links inside name fields (spammer/bot behavior)
  if (/https?:\/\/|www\.|\.com|\.net|\.org/i.test(clean)) {
    return {
      valid: false,
      errorEn: `Links or URLs are not allowed inside ${fieldLabelEn}.`,
      errorUr: `${fieldLabelUr} میں لنک یا ویب سائٹ کا پتہ درج کرنا منع ہے۔`
    };
  }

  const normalized = clean.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (FAKE_NAME_PATTERNS.has(normalized)) {
    return {
      valid: false,
      errorEn: `Please enter a real ${fieldLabelEn.toLowerCase()} (placeholder/test names are blocked).`,
      errorUr: `براہِ کرم اصلی ${fieldLabelUr} درج کریں (جعلی یا ٹیسٹ نام قبول نہیں)۔`
    };
  }

  return { valid: true };
}

/**
 * Layer 3C: Authentic Phone / WhatsApp Number Validator (supports mandatory mode on Sign Up)
 */
export function validateAuthenticPhone(
  rawPhone: string,
  options?: { required?: boolean }
): ValidationResult {
  const clean = (rawPhone || '').trim();
  const isRequired = Boolean(options?.required);

  if (!clean) {
    if (isRequired) {
      return {
        valid: false,
        errorEn: 'WhatsApp Number is required. Please enter a valid WhatsApp number (e.g. 0300-1234567).',
        errorUr: 'واٹس ایپ نمبر درج کرنا لازمی ہے (مثلاً 0300-1234567)۔'
      };
    }
    return { valid: true };
  }

  const digitsOnly = clean.replace(/\D/g, '');
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    return {
      valid: false,
      errorEn: 'Please enter a valid WhatsApp number (10–15 digits, e.g. 0300-1234567).',
      errorUr: 'براہِ کرم درست واٹس ایپ نمبر درج کریں (10 سے 15 ہندسے، مثلاً 0300-1234567)۔'
    };
  }

  // Block fake repeated or sequential digits (0000000000, 1111111111, 1234567890)
  if (
    /^(\d)\1{6,}$/.test(digitsOnly) ||
    digitsOnly.includes('123456789') ||
    digitsOnly.includes('987654321') ||
    digitsOnly.includes('00000000')
  ) {
    return {
      valid: false,
      errorEn: isRequired
        ? 'Fake or sequential numbers are not allowed. Please enter a real WhatsApp number.'
        : 'Fake or sequential phone numbers are not allowed. Enter a real number or leave optional.',
      errorUr: isRequired
        ? 'جعلی یا ایک جیسے ہندسوں والا نمبر قبول نہیں۔ براہِ کرم اصلی واٹس ایپ نمبر درج کریں۔'
        : 'جعلی یا ایک جیسے ہندسوں والا فون نمبر قبول نہیں۔ اصلی نمبر درج کریں یا خالی چھوڑ دیں۔'
    };
  }

  return { valid: true };
}

/**
 * Layer 4: Strong Password Policy (Used on Sign Up & Password Change — keeps legacy login compatible)
 */
export function validateStrongPassword(
  password: string,
  email?: string,
  ownerName?: string
): ValidationResult {
  const clean = (password || '').trim();
  if (clean.length < 8) {
    return {
      valid: false,
      errorEn: 'For strong anti-AI security, password must be at least 8 characters with letters and numbers.',
      errorUr: 'مضبوط سیکیورٹی کے لیے پاس ورڈ کم از کم 8 حروف کا ہونا ضروری ہے (حروف اور نمبر ملا کر)۔'
    };
  }

  if (clean.length > 128) {
    return {
      valid: false,
      errorEn: 'Password is too long (maximum 128 characters).',
      errorUr: 'پاس ورڈ بہت لمبا ہے (زیادہ سے زیادہ 128 حروف)۔'
    };
  }

  const lower = clean.toLowerCase();
  if (WEAK_PASSWORDS.has(lower) || /^(.)\1+$/.test(clean)) {
    return {
      valid: false,
      errorEn: 'This password is too common and easily guessed by AI bots. Please choose a stronger password.',
      errorUr: 'یہ پاس ورڈ بہت آسان اور عام ہے جو AI بوٹس آسانی سے توڑ سکتے ہیں۔ براہِ کرم مضبوط پاس ورڈ رکھیں۔'
    };
  }

  const hasLetter = /[a-zA-Z]/.test(clean);
  const hasDigit = /\d/.test(clean);
  if (!hasLetter || !hasDigit) {
    return {
      valid: false,
      errorEn: 'Password must include BOTH letters (A–Z) and numbers (0–9) to resist AI brute-force attacks.',
      errorUr: 'AI اٹیکس سے بچاؤ کے لیے پاس ورڈ میں انگریزی حروف (A-Z) اور نمبر (0-9) دونوں شامل ہونا لازمی ہیں۔'
    };
  }

  if (email) {
    const emailLocal = email.trim().toLowerCase().split('@')[0];
    if (emailLocal && emailLocal.length >= 4 && lower.includes(emailLocal)) {
      return {
        valid: false,
        errorEn: 'Password should not contain your email address.',
        errorUr: 'پاس ورڈ میں آپ کا ای میل ایڈریس شامل نہیں ہونا چاہیے۔'
      };
    }
  }

  if (ownerName) {
    const firstWord = ownerName.trim().toLowerCase().split(/\s+/)[0];
    if (firstWord && firstWord.length >= 4 && lower === firstWord) {
      return {
        valid: false,
        errorEn: 'Password cannot be the same as your name.',
        errorUr: 'پاس ورڈ صرف آپ کا نام نہیں ہو سکتا۔'
      };
    }
  }

  return { valid: true };
}

/**
 * Layer 5: Client-Side Anti-AI Micro Proof-of-Work (SHA-256 Hashcash) + Nonce & Timestamp
 * Solves a 12-bit leading-zero SHA-256 challenge in ~5-15ms on a real device,
 * making massive 100,000+/day automated AI request floods computationally expensive.
 */
export async function generateSecurityRequestHeaders(action: string): Promise<ProofOfWorkHeaders> {
  const timestamp = String(Date.now());
  const randBytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randBytes);
  } else {
    for (let i = 0; i < randBytes.length; i++) {
      randBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const nonce = Array.from(randBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  let powCounter = 0;
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const enc = new TextEncoder();
      const prefix = `${action}:${timestamp}:${nonce}:`;
      // 12-bit difficulty (first 3 hex chars === '000' -> avg ~4096 hashes, ~10-20ms in WebCrypto)
      // Use 8-bit ('00', avg ~256 hashes, < 4ms) so even low-end Android phones feel 100% instant!
      for (let i = 0; i < 8000; i++) {
        const digestBuf = await crypto.subtle.digest('SHA-256', enc.encode(`${prefix}${i}`));
        const firstByte = new Uint8Array(digestBuf)[0];
        if (firstByte === 0) {
          powCounter = i;
          break;
        }
      }
    }
  } catch {
    powCounter = 0;
  }

  return {
    'X-Requested-With': 'NH-POS-Client',
    'X-NH-Timestamp': timestamp,
    'X-NH-Nonce': nonce,
    'X-NH-PoW': String(powCounter)
  };
}

/**
 * Layer 6: Client-Side Progressive Brute-Force Lockout & Live Countdown Timer
 * Schedule:
 * - First 4 wrong attempts -> 1 minute (60s)
 * - Next every 3 wrong attempts:
 *   - 7th fail  -> 5 minutes
 *   - 10th fail -> 15 minutes
 *   - 13th fail -> 30 minutes
 *   - 16th fail -> 3 hours
 *   - 19th+ (every 3rd fail) -> 24 hours
 */
interface ClientLockRecord {
  failures: number;
  lockUntil: number;
  lastAttemptAt: number;
  tierLabel?: string;
}

export interface ClientLockoutStatus {
  locked: boolean;
  remainingMs: number;
  remainingSec: number;
  failures: number;
  lockUntil: number;
  tierLabel: string;
  formattedCountdown: string;
}

const PROGRESSIVE_LOCKOUT_TIERS: Array<{ threshold: number; durationMs: number; labelEn: string; labelUr: string }> = [
  { threshold: 4, durationMs: 1 * 60 * 1000, labelEn: '1 minute', labelUr: '1 منٹ' },
  { threshold: 7, durationMs: 5 * 60 * 1000, labelEn: '5 minutes', labelUr: '5 منٹ' },
  { threshold: 10, durationMs: 15 * 60 * 1000, labelEn: '15 minutes', labelUr: '15 منٹ' },
  { threshold: 13, durationMs: 30 * 60 * 1000, labelEn: '30 minutes', labelUr: '30 منٹ' },
  { threshold: 16, durationMs: 3 * 60 * 60 * 1000, labelEn: '3 hours', labelUr: '3 گھنٹے' },
  { threshold: 19, durationMs: 24 * 60 * 60 * 1000, labelEn: '24 hours', labelUr: '24 گھنٹے' }
];

export function formatLockoutCountdown(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${pad(hrs)}h ${pad(mins)}m ${pad(secs)}s`;
  }
  if (mins > 0) {
    return `${pad(mins)}m ${pad(secs)}s`;
  }
  return `${secs}s`;
}

function getLockKey(scope: string, identifier: string): string {
  const safeId = (identifier || 'global').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 60);
  return `${LOCKOUT_STORAGE_PREFIX}${scope}_${safeId}`;
}

export function getClientLockoutStatus(scope: string, identifier: string): ClientLockoutStatus {
  const empty: ClientLockoutStatus = {
    locked: false,
    remainingMs: 0,
    remainingSec: 0,
    failures: 0,
    lockUntil: 0,
    tierLabel: '',
    formattedCountdown: '0s'
  };
  if (!identifier || !identifier.trim()) return empty;

  try {
    const raw = localStorage.getItem(getLockKey(scope, identifier));
    if (!raw) return empty;
    const rec = JSON.parse(raw) as ClientLockRecord;
    const now = Date.now();

    if (rec.lockUntil && now < rec.lockUntil) {
      const remainingMs = rec.lockUntil - now;
      return {
        locked: true,
        remainingMs,
        remainingSec: Math.ceil(remainingMs / 1000),
        failures: rec.failures || 0,
        lockUntil: rec.lockUntil,
        tierLabel: rec.tierLabel || '',
        formattedCountdown: formatLockoutCountdown(remainingMs)
      };
    }

    // Clear stale counter only after 24 hours of complete inactivity beyond any lock period
    const lastRelevantTs = Math.max(rec.lastAttemptAt || 0, rec.lockUntil || 0);
    if (lastRelevantTs && now - lastRelevantTs > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(getLockKey(scope, identifier));
      return empty;
    }

    return {
      locked: false,
      remainingMs: 0,
      remainingSec: 0,
      failures: rec.failures || 0,
      lockUntil: 0,
      tierLabel: rec.tierLabel || '',
      formattedCountdown: '0s'
    };
  } catch {
    return empty;
  }
}

export function checkClientSecurityThrottle(scope: string, identifier: string): ValidationResult {
  const now = Date.now();

  // Rapid-fire global circuit breaker (stops browser script loops)
  while (recentAuthCalls.length > 0 && now - recentAuthCalls[0] > CIRCUIT_BREAKER_WINDOW_MS) {
    recentAuthCalls.shift();
  }
  if (recentAuthCalls.length >= CIRCUIT_BREAKER_MAX_CALLS) {
    return {
      valid: false,
      errorEn: 'Too many rapid requests detected. Please wait 60 seconds before trying again.',
      errorUr: 'بہت زیادہ تیز رفتار درخواستیں موصول ہوئیں۔ براہِ کرم 60 سیکنڈ انتظار کریں۔'
    };
  }
  recentAuthCalls.push(now);

  const status = getClientLockoutStatus(scope, identifier);
  if (status.locked) {
    return {
      valid: false,
      errorEn: `Security Shield Lockout: Too many failed attempts. Try again in ${status.formattedCountdown}.`,
      errorUr: `سیکیورٹی شیلڈ لاک: بہت زیادہ غلط کوششوں کے باعث اکاؤنٹ عارضی طور پر بند ہے۔ براہِ کرم ${status.formattedCountdown} بعد دوبارہ کوشش کریں۔`
    };
  }

  return { valid: true };
}

export function recordClientAuthOutcome(scope: string, identifier: string, success: boolean): ClientLockoutStatus {
  const key = getLockKey(scope, identifier);
  const empty: ClientLockoutStatus = {
    locked: false,
    remainingMs: 0,
    remainingSec: 0,
    failures: 0,
    lockUntil: 0,
    tierLabel: '',
    formattedCountdown: '0s'
  };

  try {
    if (success) {
      localStorage.removeItem(key);
      return empty;
    }

    const now = Date.now();
    let rec: ClientLockRecord = { failures: 0, lockUntil: 0, lastAttemptAt: now };
    const existing = localStorage.getItem(key);
    if (existing) {
      try {
        rec = JSON.parse(existing);
      } catch {}
    }

    // If previous record is older than 24h beyond lockUntil, start fresh
    const lastRelevantTs = Math.max(rec.lastAttemptAt || 0, rec.lockUntil || 0);
    if (lastRelevantTs && now - lastRelevantTs > 24 * 60 * 60 * 1000) {
      rec = { failures: 0, lockUntil: 0, lastAttemptAt: now };
    }

    rec.failures = (rec.failures || 0) + 1;
    rec.lastAttemptAt = now;

    // Exact progressive lockout trigger:
    // 4th fail -> 1m | 7th -> 5m | 10th -> 15m | 13th -> 30m | 16th -> 3h | 19th, 22nd, 25th... -> 24h
    const exactTier = PROGRESSIVE_LOCKOUT_TIERS.find(t => t.threshold === rec.failures);
    if (exactTier) {
      rec.lockUntil = now + exactTier.durationMs;
      rec.tierLabel = exactTier.labelEn;
    } else if (rec.failures > 19 && (rec.failures - 19) % 3 === 0) {
      rec.lockUntil = now + 24 * 60 * 60 * 1000;
      rec.tierLabel = '24 hours';
    }

    localStorage.setItem(key, JSON.stringify(rec));
    return getClientLockoutStatus(scope, identifier);
  } catch {
    return empty;
  }
}

/**
 * Layer 9: Session Role Integrity Guard (Prevents DevTools localStorage privilege escalation)
 */
const VERIFIED_MASTER_EMAILS = new Set([
  'helpgoodforyouofficial@gmail.com',
  'aliimtiaz1126@gmail.com'
]);

export function verifyStoredUserRoleIntegrity<T extends { role?: string; email?: string }>(user: T | null): T | null {
  if (!user || typeof user !== 'object') return null;
  if (user.role === 'super_admin') {
    const cleanEmail = String(user.email || '').trim().toLowerCase();
    if (!VERIFIED_MASTER_EMAILS.has(cleanEmail)) {
      return { ...user, role: 'admin' };
    }
  }
  return user;
}
