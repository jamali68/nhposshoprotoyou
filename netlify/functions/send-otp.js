// Netlify Serverless Function: send-otp
// Generates or dispatches a 6-digit verification OTP to the customer's Gmail inbox
// Also returns a signed HMAC OTP challenge token for tamper-proof verification.

import crypto from 'crypto';
import { createOtpChallenge } from './core/authCore.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  return {
    'Content-Type': 'application/json',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

export async function handler(event) {
  const headers = buildHeaders(event);

  // CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed. Use POST.' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const email = (body.email || '').trim().toLowerCase();
    const providedOtp = typeof body.otp === 'string' && /^\d{6}$/.test(body.otp.trim()) ? body.otp.trim() : null;
    const otp = providedOtp || crypto.randomInt(100000, 1000000).toString();

    if (!email || !EMAIL_REGEX.test(email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'A valid email address is required' })
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

    const challengeToken = createOtpChallenge(email, otp);

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
