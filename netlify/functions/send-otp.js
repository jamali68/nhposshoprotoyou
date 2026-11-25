// Netlify Serverless Function: send-otp (v18.0.0 Hardened 15-Layer Shield)
// Server-generates a cryptographically random 6-digit OTP, enforces anti-AI PoW,
// strict per-IP + per-email rate limiting, disposable email blocking, and returns a
// signed single-use HMAC OTP challenge token.

import crypto from 'crypto';
import {
  getClientIp,
  buildSecurityHeaders,
  isBlockedBotUserAgent,
  checkIpBurstLimit,
  verifyAntiBotShield,
  parseAndSanitizeBody,
  isDisposableOrFakeEmail,
  checkRateLimit,
  recordFailedAttempt,
  applyFailureJitter,
  createOtpChallenge
} from './core/authCore.js';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,12}$/;

export async function handler(event) {
  const headers = buildSecurityHeaders(event, 'POST, OPTIONS');

  // CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed. Use POST.' })
    };
  }

  const clientIp = getClientIp(event);

  // Layer 12A: Block automated scanners/scripts
  if (isBlockedBotUserAgent(event)) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ success: false, error: 'Automated request blocked by Security Shield.' })
    };
  }

  // Layer 11A: Strict OTP Flood Protection (max 10 OTP sends / hour per IP)
  const ipBurst = checkIpBurstLimit(`otp:${clientIp}`, 10, 60 * 60 * 1000);
  if (!ipBurst.allowed) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ success: false, error: ipBurst.error })
    };
  }

  // Layer 13: Payload Firewall
  const parsedBody = parseAndSanitizeBody(event, 4096);
  if (!parsedBody.ok) {
    return {
      statusCode: parsedBody.statusCode,
      headers,
      body: JSON.stringify({ success: false, error: parsedBody.error })
    };
  }

  // Layer 12B: Anti-AI Proof-of-Work & Nonce Replay Verification
  const shieldCheck = verifyAntiBotShield(event, 'send-otp');
  if (!shieldCheck.valid) {
    await applyFailureJitter();
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ success: false, error: shieldCheck.error })
    };
  }

  try {
    const body = parsedBody.payload;
    const email = String(body.email || '').trim().toLowerCase();

    if (!email || !EMAIL_REGEX.test(email) || isDisposableOrFakeEmail(email)) {
      await applyFailureJitter();
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'A real, non-disposable email address is required.'
        })
      };
    }

    // Per-email OTP spam prevention (max 3 OTPs per 15 minutes per email)
    const emailRateKey = `otp_send:${email}`;
    const emailRateCheck = checkRateLimit(emailRateKey, 3, 15 * 60 * 1000);
    if (!emailRateCheck.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ success: false, error: emailRateCheck.error })
      };
    }

    const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
    if (!resendApiKey) {
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Email delivery service (RESEND_API_KEY) is not configured on the server.'
        })
      };
    }

    // Always generate OTP cryptographically on the server (never trust client-supplied OTP)
    const otp = crypto.randomInt(100000, 1000000).toString();
    const challengeToken = createOtpChallenge(email, otp);

    // Record OTP dispatch toward per-email rate cap
    recordFailedAttempt(emailRateKey, 3, 15 * 60 * 1000, 15 * 60 * 1000);

    // Never log the raw 6-digit OTP code in server logs
    console.info(`[NH POS Shop] Dispatching verification email to: ${email}`);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'NH POS Shop <onboarding@resend.dev>',
        to: [email],
        subject: `این ایچ پی او ایس (NH POS Shop) - آپ کا تصدیقی کوڈ ہے: ${otp}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h2 style="color: #1e293b; margin: 0; font-size: 22px;">👑 NH POS Shop</h2>
              <p style="color: #64748b; font-size: 13px; margin-top: 4px;">Multi-Store Cloud Retail SaaS</p>
            </div>
            <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; text-align: center; border: 1px dashed #cbd5e1;">
              <p style="color: #475569; font-size: 14px; margin-bottom: 12px; font-weight: bold;">آپ کا 6 ہندسوں کا تصدیقی کوڈ (OTP) یہ ہے:</p>
              <div style="font-size: 32px; font-weight: 900; letter-spacing: 6px; color: #0284c7; background: #ffffff; padding: 12px 20px; border-radius: 8px; display: inline-block; border: 1px solid #e0f2fe;">
                ${otp}
              </div>
              <p style="color: #94a3b8; font-size: 11px; margin-top: 12px;">یہ کوڈ 10 منٹ تک کارآمد ہے۔ برائے مہربانی اسے کسی کے ساتھ شیئر نہ کریں۔</p>
            </div>
            <div style="margin-top: 20px; text-align: center; color: #64748b; font-size: 12px; line-height: 1.6;">
              <p>یہ کوڈ NH POS Shop میں درج کر کے اپنی تصدیق مکمل کریں۔</p>
              <p style="font-size: 10px; color: #94a3b8; margin-top: 15px;">Powered by Wasi Developer • NH POS Shop System</p>
            </div>
          </div>
        `
      })
    });

    const resData = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[NH POS Shop] Resend API delivery failed with status:', res.status);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          success: false,
          error: resData?.message || 'Failed to deliver OTP email. Please try again.'
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `OTP dispatched to ${email}`,
        email,
        challengeToken
      })
    };
  } catch (err) {
    console.error('send-otp function error:', err?.message || err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Failed to dispatch verification email' })
    };
  }
}
