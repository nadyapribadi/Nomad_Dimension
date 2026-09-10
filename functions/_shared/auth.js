'use strict';

const { createHmac, timingSafeEqual, randomBytes } = require('node:crypto');
const COOKIE = 'nomad_session';
const TTL = 8 * 60 * 60;

function reply(statusCode, error) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ error }),
  };
}
function sameOrigin(event) {
  const headers = event.headers || {};
  if (headers['sec-fetch-site'] === 'cross-site') return false;
  if (!headers.origin) return true;
  try {
    const expected = new URL(event.rawUrl || process.env.URL).origin;
    return headers.origin === expected;
  } catch {
    return false;
  }
}
function signature(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}
function equal(a, b) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function makeSession(secret, now = Date.now()) {
  const data = `${Math.floor(now / 1000) + TTL}.${randomBytes(16).toString('hex')}`;
  return `${data}.${signature(data, secret)}`;
}
function authenticated(event, secret = process.env.APP_PASSWORD, now = Date.now()) {
  if (!secret || secret.length < 16) return false;
  const cookie = (event.headers?.cookie || '')
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${COOKIE}=`));
  const parts = (cookie?.slice(COOKIE.length + 1) || '').split('.');
  if (parts.length !== 3 || !/^\d+$/.test(parts[0])) return false;
  const exp = Number(parts[0]),
    current = Math.floor(now / 1000);
  return (
    exp > current &&
    exp <= current + TTL &&
    equal(signature(parts.slice(0, 2).join('.'), secret), parts[2])
  );
}
function withAuth(handler) {
  return async (event) => {
    if (event.httpMethod === 'OPTIONS')
      return { statusCode: 200, headers: { 'Cache-Control': 'no-store' }, body: '' };
    if (event.httpMethod !== 'POST') return reply(405, 'Method not allowed');
    if (!sameOrigin(event)) return reply(403, 'Cross-site request rejected');
    if (!process.env.APP_PASSWORD || process.env.APP_PASSWORD.length < 16)
      return reply(
        503,
        'Set APP_PASSWORD (at least 16 characters) in the server environment to enable sign-in'
      );
    if (!authenticated(event)) return reply(401, 'Sign in to continue');
    if ((event.body || '').length > 1_000_000) return reply(413, 'Request too large');
    try {
      const payload = JSON.parse(event.body || '{}');
      if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        return reply(400, 'Expected a JSON object');
    } catch {
      return reply(400, 'Invalid JSON');
    }
    const result = await handler(event);
    result.headers = { ...result.headers, 'Cache-Control': 'no-store' };
    delete result.headers['Access-Control-Allow-Origin'];
    return result;
  };
}
module.exports = { COOKIE, TTL, reply, equal, sameOrigin, makeSession, authenticated, withAuth };
