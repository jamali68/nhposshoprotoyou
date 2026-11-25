// Netlify Serverless Cloud Function (Node.js / JavaScript)
// Endpoint: /.netlify/functions/api

import {
  getClientIp,
  buildSecurityHeaders,
  isBlockedBotUserAgent,
  checkIpBurstLimit
} from './core/authCore.js';

export async function handler(event) {
  const headers = buildSecurityHeaders(event, 'GET, OPTIONS');
  const method = (event.httpMethod || 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (method !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  if (isBlockedBotUserAgent(event)) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Automated client blocked' })
    };
  }

  const burst = checkIpBurstLimit(`api:${getClientIp(event)}`, 30, 60 * 1000);
  if (!burst.allowed) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ error: burst.error })
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      status: 'ok',
      appName: 'NH POS Shop',
      version: 'v18.0.1',
      securityShield: '15-Layer Anti-AI Protection Active',
      serverlessTime: new Date().toISOString()
    })
  };
}
