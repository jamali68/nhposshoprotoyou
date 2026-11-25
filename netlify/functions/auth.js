/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Netlify Serverless Cloud Function: auth (v18.0.0 Hardened 15-Layer Shield)
 * Endpoint: /.netlify/functions/auth (or /api/auth via redirect)
 * Enforces: Bot UA blocking, per-IP burst limiting, SHA-256 PoW + Nonce Anti-Replay,
 * Payload Firewall, Exponential Lockout, Timing Jitter, Upgraded 120k PBKDF2,
 * Single-Use OTP Verification, RS256 Google Verification & Authenticated Super Admin Controls.
 */

import {
  getClientIp,
  buildSecurityHeaders,
  isBlockedBotUserAgent,
  checkIpBurstLimit,
  verifyAntiBotShield,
  parseAndSanitizeBody,
  applyFailureJitter,
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
  hashPassword,
  verifyPassword,
  verifyGoogleIdToken,
  createSessionToken,
  verifySessionToken,
  verifySuperAdminCredentials,
  updateSuperAdminSecret,
  createOtpChallenge,
  verifyOtpChallenge,
  MASTER_SUPER_ADMIN_EMAILS
} from './core/authCore.js';

function verifySuperAdminBearer(event, payload) {
  const authHeader =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : (payload?.sessionToken || '');

  const tokenCheck = verifySessionToken(bearerToken);
  if (
    !tokenCheck.valid ||
    !tokenCheck.claims ||
    tokenCheck.claims.role !== 'super_admin' ||
    !MASTER_SUPER_ADMIN_EMAILS.includes(String(tokenCheck.claims.email || '').toLowerCase())
  ) {
    return { valid: false };
  }
  return { valid: true, claims: tokenCheck.claims };
}

export async function handler(event) {
  const HEADERS = buildSecurityHeaders(event, 'GET, POST, OPTIONS');
  const method = (event.httpMethod || 'POST').toUpperCase();

  // 1. CORS Preflight
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  // 2. Health check (GET)
  if (method === 'GET') {
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        status: 'ok',
        service: 'NH POS 15-Layer Security Shield & Auth Service',
        version: 'v18.0.0',
        time: new Date().toISOString()
      })
    };
  }

  if (method !== 'POST') {
    return {
      statusCode: 405,
      headers: HEADERS,
      body: JSON.stringify({ success: false, error: `Method ${method} not allowed. Use POST.` })
    };
  }

  const clientIp = getClientIp(event);

  // Layer 12A: Block automated vulnerability scanners & raw CLI attack bots
  if (isBlockedBotUserAgent(event)) {
    return {
      statusCode: 403,
      headers: HEADERS,
      body: JSON.stringify({ success: false, error: 'Automated client blocked by NH Security Shield.' })
    };
  }

  // Layer 11A: Global Per-IP Flood & Burst Protection
  const burstCheck = checkIpBurstLimit(clientIp, 30, 60 * 1000);
  if (!burstCheck.allowed) {
    return {
      statusCode: 429,
      headers: HEADERS,
      body: JSON.stringify({ success: false, error: burstCheck.error })
    };
  }

  // Layer 13: Payload Size, JSON, Prototype Pollution & NoSQL Operator Firewall
  const parsedBody = parseAndSanitizeBody(event, 16384);
  if (!parsedBody.ok) {
    return {
      statusCode: parsedBody.statusCode,
      headers: HEADERS,
      body: JSON.stringify({ success: false, error: parsedBody.error })
    };
  }

  try {
    const payload = parsedBody.payload;
    const action = typeof payload.action === 'string' ? payload.action.trim() : '';

    if (!action) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({ success: false, error: 'Action parameter is required.' })
      };
    }

    // Layer 12B: Anti-AI Proof-of-Work, Nonce Replay & CSRF Header Gate
    const shieldCheck = verifyAntiBotShield(event, action);
    if (!shieldCheck.valid) {
      recordFailedAttempt(`shield:${clientIp}`, 10);
      await applyFailureJitter();
      return {
        statusCode: 403,
        headers: HEADERS,
        body: JSON.stringify({ success: false, error: shieldCheck.error })
      };
    }

    switch (action) {
      // ACTION: Verify Google ID Token securely on backend
      case 'verify-google-token': {
        const rateKey = `google:${clientIp}`;
        const rateCheck = checkRateLimit(rateKey, 12, 15 * 60 * 1000);
        if (!rateCheck.allowed) {
          return {
            statusCode: 429,
            headers: HEADERS,
            body: JSON.stringify({ success: false, error: rateCheck.error })
          };
        }

        const { idToken } = payload;
        if (!idToken || typeof idToken !== 'string') {
          return {
            statusCode: 400,
            headers: HEADERS,
            body: JSON.stringify({ success: false, error: 'idToken is required' })
          };
        }

        const verifyResult = await verifyGoogleIdToken(idToken);
        if (!verifyResult.valid) {
          recordFailedAttempt(rateKey, 12);
          await applyFailureJitter();
          return {
            statusCode: 401,
            headers: HEADERS,
            body: JSON.stringify({ success: false, error: verifyResult.error })
          };
        }

        clearRateLimit(rateKey);
        const isSuperAdmin = MASTER_SUPER_ADMIN_EMAILS.includes(verifyResult.email);
        const sessionToken = createSessionToken({
          email: verifyResult.email,
          googleId: verifyResult.googleId,
          role: isSuperAdmin ? 'super_admin' : 'admin',
          authMethod: 'google_oauth'
        });

        return {
          statusCode: 200,
          headers: HEADERS,
          body: JSON.stringify({
            success: true,
            verifiedEmail: verifyResult.email,
            googleId: verifyResult.googleId,
            name: verifyResult.name,
            picture: verifyResult.picture,
            isSuperAdmin,
            sessionToken
          })
        };
      }

      // ACTION: Verify Owner or Staff Password
      case 'verify-password': {
        const { email, password, storedHash, salt } = payload;
        const cleanEmail = String(email || '').toLowerCase().trim();
        const accountRateKey = `pwd:${clientIp}:${cleanEmail}`;
        const ipRateKey = `pwd_ip:${clientIp}`;

        const ipCheck = checkRateLimit(ipRateKey, 15, 15 * 60 * 1000);
        if (!ipCheck.allowed) {
          return {
            statusCode: 429,
            headers: HEADERS,
            body: JSON.stringify({ success: false, error: ipCheck.error })
          };
        }

        const rateCheck = checkRateLimit(accountRateKey, 5, 15 * 60 * 1000);
        if (!rateCheck.allowed) {
          return {
            statusCode: 429,
            headers: HEADERS,
            body: JSON.stringify({ success: false, error: rateCheck.error })
          };
        }

        if (!password || typeof password !== 'string') {
          return {
            statusCode: 400,
            headers: HEADERS,
            body: JSON.stringify({ success: false, error: 'Password is required' })
          };
        }

        const verification = verifyPassword(password, storedHash, salt);
        if (!verification.valid) {
          recordFailedAttempt(accountRateKey, 5);
          recordFailedAttempt(ipRateKey, 15);
          await applyFailureJitter();
          return {
            statusCode: 401,
            headers: HEADERS,
            body: JSON.stringify({
              success: false,
              error: 'غلط پاس ورڈ! برائے مہربانی درست پاس ورڈ درج کریں۔ (Incorrect password)'
            })
          };
        }

        clearRateLimit(accountRateKey);

        const isSuperAdmin = MASTER_SUPER_ADMIN_EMAILS.includes(cleanEmail);
        const sessionToken = createSessionToken({
          email: cleanEmail,
          role: isSuperAdmin ? 'super_admin' : 'admin',
          authMethod: 'password_auth'
        });

        return {
          statusCode: 200,
          headers: HEADERS,
          body: JSON.stringify({
            success: true,
            mustChangePassword: Boolean(verification.mustChangePassword),
            isLegacy: Boolean(verification.isLegacy),
            isSuperAdmin,
            sessionToken
          })
        };
      }

      // ACTION: Hash a new password with 120,000-iteration PBKDF2-SHA256
      case 'hash-password': {
        const rateKey = `hash:${clientIp}`;
        const rateCheck = checkRateLimit(rateKey, 20, 15 * 60 * 1000);
        if (!rateCheck.allowed) {
          return {
            statusCode: 429,
            headers: HEADERS,
            body: JSON.stringify({ success: false, error: rateCheck.error })
          };
        }

        const { password } = payload;
        if (!password || typeof password !== 'string' || password.trim().length < 6 || password.trim().length > 128) {
          return {
            statusCode: 400,
            headers: HEADERS,
            body: JSON.stringify({
              success: false,
              error: 'Password must be between 6 and 128 characters long'
            })
          };
        }

        const { hash, salt } = hashPassword(password.trim());
        return {
          statusCode: 200,
          headers: HEADERS,
          body: JSON.stringify({ success: true, hash, salt })
        };
      }

      // ACTION: Verify Super Admin Master Credentials on Server
      case 'verify-super-admin': {
        const { email, secretKey } = payload;
        const rateKey = `superadmin:${clientIp}:${String(email || '').toLowerCase().trim()}`;
        const ipRateKey = `superadmin_ip:${clientIp}`;

        const ipCheck = checkRateLimit(ipRateKey, 8, 30 * 60 * 1000);
        if (!ipCheck.allowed) {
          return {
            statusCode: 429,
            headers: HEADERS,
            body: JSON.stringify({ success: false, error: ipCheck.error })
          };
        }

        const rateCheck = checkRateLimit(rateKey, 5, 15 * 60 * 1000);
        if (!rateCheck.allowed) {
          return {
            statusCode: 429,
            headers: HEADERS,
            body: JSON.stringify({ success: false, error: rateCheck.error })
          };
        }

        const verifyRes = verifySuperAdminCredentials(email, secretKey);
        if (!verifyRes.valid) {
          recordFailedAttempt(rateKey, 5);
          recordFailedAttempt(ipRateKey, 8);
          await applyFailureJitter();
          return {
            statusCode: 401,
            headers: HEADERS,
            body: JSON.stringify({ success: false, error: verifyRes.error })
          };
        }

        clearRateLimit(rateKey);
        clearRateLimit(ipRateKey);
        return {
          statusCode: 200,
          headers: HEADERS,
          body: JSON.stringify({
            success: true,
            masterEmail: verifyRes.masterEmail,
            token: verifyRes.token
          })
        };
      }

      // ACTION: Update Super Admin Secret Key on Server (Requires verified Super Admin Bearer token)
      case 'update-super-admin-secret': {
        const authCheck = verifySuperAdminBearer(event, payload);
        if (!authCheck.valid) {
          await applyFailureJitter();
          return {
            statusCode: 403,
            headers: HEADERS,
            body: JSON.stringify({
              success: false,
              error: 'Unauthorized: Valid Super Admin session token required.'
            })
          };
        }

        const { newSecretKey } = payload;
        const res = updateSuperAdminSecret(newSecretKey);
        return {
          statusCode: res.valid ? 200 : 400,
          headers: HEADERS,
          body: JSON.stringify({ success: res.valid, error: res.error })
        };
      }

      // ACTION: Create Server-Signed OTP Challenge (Restricted to authenticated Super Admin diagnostics;
      // normal user OTP challenges are minted exclusively inside send-otp.js)
      case 'create-otp-challenge': {
        const authCheck = verifySuperAdminBearer(event, payload);
        if (!authCheck.valid) {
          await applyFailureJitter();
          return {
            statusCode: 403,
            headers: HEADERS,
            body: JSON.stringify({
              success: false,
              error: 'Unauthorized: Direct OTP challenge minting is restricted to server dispatch.'
            })
          };
        }

        const { email, otp } = payload;
        if (!email || !otp) {
          return {
            statusCode: 400,
            headers: HEADERS,
            body: JSON.stringify({ success: false, error: 'email and otp are required' })
          };
        }
        const challengeToken = createOtpChallenge(email, otp);
        return {
          statusCode: 200,
          headers: HEADERS,
          body: JSON.stringify({ success: true, challengeToken })
        };
      }

      // ACTION: Verify Server-Signed Single-Use OTP Challenge (Brute-Force Protected)
      case 'verify-otp-challenge': {
        const { email, enteredOtp, challengeToken } = payload;
        const otpRateKey = `otp_verify:${clientIp}:${String(email || '').toLowerCase().trim()}`;
        const rateCheck = checkRateLimit(otpRateKey, 5, 15 * 60 * 1000);
        if (!rateCheck.allowed) {
          return {
            statusCode: 429,
            headers: HEADERS,
            body: JSON.stringify({ success: false, error: rateCheck.error })
          };
        }

        const res = verifyOtpChallenge(email, enteredOtp, challengeToken);
        if (!res.valid) {
          recordFailedAttempt(otpRateKey, 5);
          await applyFailureJitter();
          return {
            statusCode: 401,
            headers: HEADERS,
            body: JSON.stringify({ success: false, error: res.error })
          };
        }

        clearRateLimit(otpRateKey);
        return {
          statusCode: 200,
          headers: HEADERS,
          body: JSON.stringify({ success: true })
        };
      }

      // ACTION: Verify an existing device session token
      case 'verify-device-token': {
        const { sessionToken } = payload;
        if (!sessionToken || typeof sessionToken !== 'string') {
          return {
            statusCode: 400,
            headers: HEADERS,
            body: JSON.stringify({ success: false, valid: false, error: 'sessionToken is required' })
          };
        }

        const result = verifySessionToken(sessionToken);
        return {
          statusCode: result.valid ? 200 : 401,
          headers: HEADERS,
          body: JSON.stringify(result)
        };
      }

      default:
        return {
          statusCode: 400,
          headers: HEADERS,
          body: JSON.stringify({ success: false, error: 'Unknown authentication action.' })
        };
    }
  } catch (err) {
    console.error('Serverless auth function error:', err?.message || err);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ success: false, error: 'Internal authentication error' })
    };
  }
}
