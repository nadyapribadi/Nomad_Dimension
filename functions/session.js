'use strict';

const {
  COOKIE,
  TTL,
  reply,
  equal,
  sameOrigin,
  makeSession,
  authenticated,
} = require('./_shared/auth');
// Additional best-effort throttling per warm instance. A long, unique password is required.
const attempts = new Map();
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, 'Method not allowed');
  if (!sameOrigin(event)) return reply(403, 'Cross-site request rejected');
  const password = process.env.APP_PASSWORD;
  if (!password || password.length < 16)
    return reply(503, 'Set APP_PASSWORD (at least 16 characters) in the server environment');
  if ((event.body || '').length > 4096) return reply(413, 'Request too large');
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return reply(400, 'Invalid JSON');
  }
  if (!body || typeof body !== 'object') return reply(400, 'Invalid request');
  const secure = (event.rawUrl || process.env.URL || '').startsWith('https:') ? '; Secure' : '';
  const response = (token, age) => ({
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure}`,
    },
    body: JSON.stringify({ authenticated: !!token }),
  });
  if (body.action === 'logout') return response('', 0);
  if (body.action === 'status')
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ authenticated: authenticated(event) }),
    };
  const ip = event.headers?.['x-nf-client-connection-ip'] || 'unknown';
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  if (attempts.size > 10000) return reply(429, 'Sign-in is busy. Try again later.');
  const attempt = attempts.get(ip) || { count: 0, until: now + 15 * 60_000 };
  if (attempt.count >= 8) return reply(429, 'Too many sign-in attempts. Try again in 15 minutes.');
  if (typeof body.password !== 'string' || !equal(body.password, password)) {
    attempt.count++;
    attempts.set(ip, attempt);
    return reply(401, 'Incorrect password');
  }
  attempts.delete(ip);
  return response(makeSession(password), TTL);
};
