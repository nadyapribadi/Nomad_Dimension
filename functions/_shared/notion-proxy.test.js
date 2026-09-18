'use strict';
// notion-proxy is the highest-blast-radius file in the repo: it holds the
// workspace token and forwards whatever endpoint it is handed. Its allow-list had
// no direct test at all.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSession } = require('./auth');
const { handler } = require('../notion-proxy');

const secret = 'a-long-test-password-never-deployed';
const TOKEN = 'secret-notion-token-not-real';
const PAGE = '11111111-2222-3333-4444-555555555555';
const realFetch = global.fetch;

function event(body, { auth = true } = {}) {
  return {
    httpMethod: 'POST',
    headers: {
      cookie: auth ? `nomad_session=${makeSession(secret)}` : '',
      'sec-fetch-site': 'same-origin',
    },
    body: JSON.stringify(body),
  };
}
function useFetch(impl) {
  process.env.APP_PASSWORD = secret;
  process.env.NOTION_TOKEN = TOKEN;
  global.fetch = impl;
}
function restore() {
  global.fetch = realFetch;
  delete process.env.NOTION_TOKEN;
}

test('every endpoint the app actually calls is allowed through', async () => {
  const seen = [];
  useFetch(async (url, options) => {
    seen.push({ url, options });
    return { status: 200, json: async () => ({ ok: true }) };
  });
  try {
    const allowed = [
      ['users/me', 'GET'],
      [`pages/${PAGE}`, 'GET'],
      [`databases/${PAGE}/query`, 'POST'],
      ['pages', 'POST'],
      [`pages/${PAGE}`, 'PATCH'],
      [`blocks/${PAGE}/children?page_size=100`, 'GET'],
      [`blocks/${PAGE}/children?page_size=100&start_cursor=${PAGE}`, 'GET'],
      [`blocks/${PAGE}`, 'PATCH'],
      [`blocks/${PAGE}/children`, 'PATCH'],
    ];
    for (const [endpoint, method] of allowed) {
      const res = await handler(event({ endpoint, method, body: { page_size: 100 } }));
      assert.equal(res.statusCode, 200, `${method} ${endpoint} should be allowed`);
    }
    assert.equal(seen.length, allowed.length, 'each allowed call reached the upstream');
    assert.equal(
      seen[0].options.headers.Authorization,
      `Bearer ${TOKEN}`,
      'the token is injected server-side'
    );
    assert.equal(
      seen[0].url,
      'https://api.notion.com/v1/users/me',
      'and the URL is built from the allow-listed path only'
    );
  } finally {
    restore();
  }
});

test('traversal, unknown paths and wrong methods never reach the upstream', async () => {
  let calls = 0;
  useFetch(async () => {
    calls++;
    return { status: 200, json: async () => ({}) };
  });
  try {
    const refused = [
      ['../users/me', 'GET'],
      [`pages/${PAGE}/../../users/me`, 'GET'],
      ['users', 'GET'],
      [`databases/${PAGE}/query`, 'GET'],
      [`blocks/${PAGE}/children?page_size=1000`, 'GET'],
      [`blocks/${PAGE}/children?page_size=100&start_cursor=../x`, 'GET'],
      ['pages', 'PATCH'],
      [`users/me`, 'DELETE'],
      ['https://evil.test/v1/pages', 'POST'],
      ['', 'GET'],
    ];
    for (const [endpoint, method] of refused) {
      const res = await handler(event({ endpoint, method }));
      assert.equal(res.statusCode, 400, `${method} ${endpoint} should be refused`);
    }
    assert.equal(
      (await handler(event({ endpoint: 42, method: 'GET' }))).statusCode,
      400,
      'a non-string endpoint is refused'
    );
    assert.equal(calls, 0, 'nothing was sent upstream');
  } finally {
    restore();
  }
});

test('an anonymous caller is refused before the token is used', async () => {
  let calls = 0;
  useFetch(async () => {
    calls++;
    return { status: 200, json: async () => ({}) };
  });
  try {
    const res = await handler(event({ endpoint: 'users/me', method: 'GET' }, { auth: false }));
    assert.equal(res.statusCode, 401);
    assert.equal(calls, 0);
  } finally {
    restore();
  }
});

test('a missing workspace token is reported, not guessed at', async () => {
  let calls = 0;
  useFetch(async () => {
    calls++;
    return { status: 200, json: async () => ({}) };
  });
  delete process.env.NOTION_TOKEN;
  try {
    const res = await handler(event({ endpoint: 'users/me', method: 'GET' }));
    assert.equal(res.statusCode, 500);
    assert.match(JSON.parse(res.body).error, /NOTION_TOKEN/);
    assert.equal(calls, 0);
  } finally {
    restore();
  }
});
