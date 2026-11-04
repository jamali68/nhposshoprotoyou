/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Netlify Serverless Cloud Function: auth
 * Endpoint: /.netlify/functions/auth (or /api/auth via redirect)
 * Provides backend Google ID Token verification, secure password hashing,
 * SuperAdmin Master Verification, OTP Challenge verification, device session tokens,
 * and brute-force protection.
 */

import {
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

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

export async function handler(event) {
  const method = (event.httpMethod || 'POST').toUpperCase();

  // 1. CORS Preflight
  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  // 2. Health check (GET)
  if (method === 'GET') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        status: 'ok',
        service: 'NH POS Authentication & Security Service (Serverless Node.js)',
        firebaseMigrationReady: true,
        time: new Date().toISOString()
      })
    };
  }

  if (method !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: `Method ${method} not allowed. Use POST.` })
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const { action } = payload;
    const clientIp = event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'unknown_ip';

    switch (action) {
      // ACTION: Verify Google ID Token securely on backend
      case 'verify-google-token': {
        const { idToken } = payload;
        if (!idToken) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ success: false, error: 'idToken is required' })
          };
        }

        const verifyResult = await verifyGoogleIdToken(idToken);
        if (!verifyResult.valid) {
          return {
            statusCode: 401,
            headers: CORS_HEADERS,
            body: JSON.stringify({ success: false, error: verifyResult.error })
          };
        }

        const isSuperAdmin = MASTER_SUPER_ADMIN_EMAILS.includes(verifyResult.email);
        const sessionToken = createSessionToken({
          email: verifyResult.email,
          googleId: verifyResult.googleId,
          role: isSuperAdmin ? 'super_admin' : 'admin',
          authMethod: 'google_oauth'
        });

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
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
        const rateKey = `${clientIp}:${(email || '').toLowerCase().trim()}`;

        const rateCheck = checkRateLimit(rateKey);
        if (!rateCheck.allowed) {
          return {
            statusCode: 429,
            headers: CORS_HEADERS,
            body: JSON.stringify({ success: false, error: rateCheck.error })
          };
        }

        if (!password) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ success: false, error: 'Password is required' })
          };
        }

        const verification = verifyPassword(password, storedHash, salt);
        if (!verification.valid) {
          recordFailedAttempt(rateKey);
          return {
            statusCode: 401,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              success: false,
              error: 'غلط پاس ورڈ! برائے مہربانی درست پاس ورڈ درج کریں۔ (Incorrect password)'
            })
          };
        }

        clearRateLimit(rateKey);

        const cleanEmail = (email || '').toLowerCase().trim();
        const isSuperAdmin = MASTER_SUPER_ADMIN_EMAILS.includes(cleanEmail);

        const sessionToken = createSessionToken({
          email: cleanEmail,
          role: isSuperAdmin ? 'super_admin' : 'admin',
          authMethod: 'password_auth'
        });

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            success: true,
            mustChangePassword: Boolean(verification.mustChangePassword),
            isLegacy: Boolean(verification.isLegacy),
            isSuperAdmin,
            sessionToken
          })
        };
      }

      // ACTION: Hash a new password
      case 'hash-password': {
        const { password } = payload;
        if (!password || typeof password !== 'string' || password.trim().length < 6) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              success: false,
              error: 'Password must be at least 6 characters long'
            })
          };
        }

        const { hash, salt } = hashPassword(password.trim());
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ success: true, hash, salt })
        };
      }

      // ACTION: Verify Super Admin Master Credentials on Server
      case 'verify-super-admin': {
        const { email, secretKey, customStoredKey } = payload;
        const rateKey = `superadmin:${clientIp}:${(email || '').toLowerCase().trim()}`;

        const rateCheck = checkRateLimit(rateKey, 5);
        if (!rateCheck.allowed) {
          return {
            statusCode: 429,
            headers: CORS_HEADERS,
            body: JSON.stringify({ success: false, error: rateCheck.error })
          };
        }

        const verifyRes = verifySuperAdminCredentials(email, secretKey, customStoredKey);
        if (!verifyRes.valid) {
          recordFailedAttempt(rateKey);
          return {
            statusCode: 401,
            headers: CORS_HEADERS,
            body: JSON.stringify({ success: false, error: verifyRes.error })
          };
        }

        clearRateLimit(rateKey);
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            success: true,
            masterEmail: verifyRes.masterEmail,
            token: verifyRes.token
          })
        };
      }

      // ACTION: Update Super Admin Secret Key on Server
      case 'update-super-admin-secret': {
        const { newSecretKey } = payload;
        const res = updateSuperAdminSecret(newSecretKey);
        return {
          statusCode: res.valid ? 200 : 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ success: res.valid, error: res.error })
        };
      }

      // ACTION: Create Server-Signed OTP Challenge
      case 'create-otp-challenge': {
        const { email, otp } = payload;
        if (!email || !otp) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ success: false, error: 'email and otp are required' })
          };
        }
        const challengeToken = createOtpChallenge(email, otp);
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ success: true, challengeToken })
        };
      }

      // ACTION: Verify Server-Signed OTP Challenge
      case 'verify-otp-challenge': {
        const { email, enteredOtp, challengeToken } = payload;
        const res = verifyOtpChallenge(email, enteredOtp, challengeToken);
        return {
          statusCode: res.valid ? 200 : 401,
          headers: CORS_HEADERS,
          body: JSON.stringify({ success: res.valid, error: res.error })
        };
      }

      // ACTION: Verify an existing device session token
      case 'verify-device-token': {
        const { sessionToken } = payload;
        if (!sessionToken) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ success: false, error: 'sessionToken is required' })
          };
        }

        const result = verifySessionToken(sessionToken);
        return {
          statusCode: result.valid ? 200 : 401,
          headers: CORS_HEADERS,
          body: JSON.stringify(result)
        };
      }

      default:
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ success: false, error: `Unknown action: ${action}` })
        };
    }
  } catch (err) {
    console.error('Serverless auth function error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: err.message || 'Internal authentication error' })
    };
  }
}
