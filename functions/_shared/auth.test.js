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
    'library-config',
    'service-status',
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
test('service configuration reveals presence only, makes no upstream call and requires POST', async () => {
  process.env.APP_PASSWORD = secret;
  const saved = process.env.GEMINI_API_KEY;
  const savedDashscope = process.env.DASHSCOPE_API_KEY;
  const originalFetch = global.fetch;
  try {
    global.fetch = () => {
      throw new Error('No upstream call permitted');
    };
    process.env.GEMINI_API_KEY = 'test-secret-must-not-appear';
    process.env.DASHSCOPE_API_KEY = 'test-qwen-secret';
    const { handler } = require('../service-status');
    const event = {
      httpMethod: 'POST',
      headers: { cookie: `nomad_session=${makeSession(secret)}` },
    };
    const res = await handler(event);
    const data = JSON.parse(res.body);
    assert.equal(res.statusCode, 200);
    assert.equal(data.configured.gemini, true);
    assert.equal(data.configured.qwen, true);
    assert.equal(res.body.includes('test-qwen-secret'), false);
    assert.equal(data.checked, 'presence-only');
    assert.equal(data.factCheck.model, require('../web-research')._internal.MODEL);
    assert.equal(res.body.includes('test-secret'), false);
    assert.ok(Object.values(data.configured).every((value) => typeof value === 'boolean'));
    assert.equal(res.headers['Cache-Control'], 'no-store');
    delete process.env.GEMINI_API_KEY;
    assert.equal(JSON.parse((await handler(event)).body).configured.gemini, false);
    assert.equal((await handler({ ...event, httpMethod: 'GET' })).statusCode, 405);
  } finally {
    global.fetch = originalFetch;
    if (savedDashscope === undefined) delete process.env.DASHSCOPE_API_KEY;
    else process.env.DASHSCOPE_API_KEY = savedDashscope;
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
  }
});
test('idea configuration exposes only database IDs and fails closed when missing', async () => {
  process.env.APP_PASSWORD = secret;
  const event = {
    httpMethod: 'POST',
    body: '{}',
    headers: { cookie: `nomad_session=${makeSession(secret)}` },
  };
  const oldCollections = process.env.NOTION_COLLECTIONS_DATABASE_ID;
  const oldPlacements = process.env.NOTION_PLACEMENTS_DATABASE_ID;
  try {
    delete process.env.NOTION_COLLECTIONS_DATABASE_ID;
    delete process.env.NOTION_PLACEMENTS_DATABASE_ID;
    const { handler } = require('../library-config');
    assert.equal((await handler(event)).statusCode, 503);
    process.env.NOTION_COLLECTIONS_DATABASE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    process.env.NOTION_PLACEMENTS_DATABASE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const response = await handler(event);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(Object.keys(JSON.parse(response.body)).sort(), ['collections', 'placements']);
    assert.equal(response.headers['Cache-Control'], 'no-store');
  } finally {
    if (oldCollections === undefined) delete process.env.NOTION_COLLECTIONS_DATABASE_ID;
    else process.env.NOTION_COLLECTIONS_DATABASE_ID = oldCollections;
    if (oldPlacements === undefined) delete process.env.NOTION_PLACEMENTS_DATABASE_ID;
    else process.env.NOTION_PLACEMENTS_DATABASE_ID = oldPlacements;
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

test('every protected endpoint reports missing deployment authentication without upstream calls', async () => {
  const oldPassword = process.env.APP_PASSWORD,
    oldFetch = global.fetch;
  try {
    delete process.env.APP_PASSWORD;
    global.fetch = () => {
      throw new Error('No upstream call permitted');
    };
    for (const name of [
      'ai-run',
      'notion-proxy',
      'library-config',
      'service-status',
      'tts-proxy',
      'youtube-proxy',
      'maps-proxy',
      'web-research',
      'yt-transcript',
    ]) {
      const response = await require(`../${name}`).handler({ httpMethod: 'POST', body: '{}' });
      assert.equal(response.statusCode, 503, name);
      assert.match(JSON.parse(response.body).error, /APP_PASSWORD/, name);
      assert.equal(JSON.parse(response.body).code, 'auth_not_configured', name);
    }
  } finally {
    global.fetch = oldFetch;
    if (oldPassword === undefined) delete process.env.APP_PASSWORD;
    else process.env.APP_PASSWORD = oldPassword;
  }
});
