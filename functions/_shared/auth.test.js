'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSession, authenticated, withAuth } = require('./auth');
const secret = 'a-long-test-password-never-deployed';
test('sessions reject missing, forged, expired and rotated credentials', () => {
  const now = Date.now();
  const token = makeSession(secret, now);
  const event = { headers: { cookie: `nomad_session=${token}` } };
  assert.equal(authenticated(event, secret, now), true);
  assert.equal(authenticated(event, secret + 'new', now), false);
  assert.equal(authenticated(event, secret, now + 9 * 3600000), false);
  assert.equal(
    authenticated({ headers: { cookie: `nomad_session=${token}x` } }, secret, now),
    false
  );
});
test('every provider entry point rejects anonymous requests before accessing an upstream', async () => {
  process.env.APP_PASSWORD = secret;
  for (const name of [
    'ai-run',
    'notion-proxy',
    'tts-proxy',
    'youtube-proxy',
    'maps-proxy',
    'web-research',
    'yt-transcript',
  ]) {
    const res = await require(`../${name}`).handler({ httpMethod: 'POST', body: '{}' });
    assert.equal(res.statusCode, 401, name);
  }
});
test('guard fails closed when unconfigured and rejects cross-site authenticated calls', async () => {
  const handler = withAuth(async () => ({ statusCode: 200, body: '{}', headers: {} }));
  delete process.env.APP_PASSWORD;
  assert.equal((await handler({ httpMethod: 'POST', body: '{}' })).statusCode, 503);
  process.env.APP_PASSWORD = secret;
  const event = {
    httpMethod: 'POST',
    body: '{}',
    rawUrl: 'https://nomad.test/api',
    headers: { origin: 'https://evil.test', cookie: `nomad_session=${makeSession(secret)}` },
  };
  assert.equal((await handler(event)).statusCode, 403);
  event.headers.origin = 'https://nomad.test';
  assert.equal((await handler(event)).statusCode, 200);
});
test('login creates an HttpOnly cookie; logout expires it', async () => {
  process.env.APP_PASSWORD = secret;
  const { handler } = require('../session');
  const event = {
    httpMethod: 'POST',
    rawUrl: 'https://nomad.test/api',
    headers: { origin: 'https://nomad.test' },
    body: JSON.stringify({ password: secret }),
  };
  const res = await handler(event);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Set-Cookie'], /HttpOnly; SameSite=Strict/);
  assert.match(res.headers['Set-Cookie'], /Secure/);
  event.body = JSON.stringify({ action: 'logout' });
  assert.match((await handler(event)).headers['Set-Cookie'], /Max-Age=0/);
});
