'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const PASSWORD = 'test-only-password-not-for-deployment';
process.env.APP_PASSWORD = PASSWORD;
process.env.NOTION_TOKEN = 'test-token';

const { makeSession } = require('../_shared/auth');

function request(body, { auth = true } = {}) {
  return {
    httpMethod: 'POST',
    headers: {
      cookie: auth ? `nomad_session=${makeSession(PASSWORD)}` : '',
      'sec-fetch-site': 'same-origin',
    },
    rawUrl: 'http://localhost:8888/.netlify/functions/cost-log',
    body: JSON.stringify(body),
  };
}

const good = {
  task: 'fact-check',
  requests: 12,
  model: 'gemini-3.6-flash',
  usage: { inputTokens: 48000, outputTokens: 9600 },
};

test('cost-log records one entry for the whole run', async (t) => {
  let body;
  t.mock.method(global, 'fetch', async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, status: 200 };
  });
  const { handler } = require('../cost-log');
  const res = await handler(request(good));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { logged: true });
  const props = body.properties;
  assert.match(props['Cost Entry'].title[0].text.content, /fact-check · 12 requests/);
  assert.equal(props['Tokens In'].number, 48000);
  assert.equal(props.Provider.select.name, 'Google');
});

test('cost-log refuses bad input and unauthenticated calls', async (t) => {
  const calls = [];
  t.mock.method(global, 'fetch', async () => {
    calls.push(1);
    return { ok: true, status: 200 };
  });
  const { handler } = require('../cost-log');
  assert.equal((await handler(request(good, { auth: false }))).statusCode, 401);
  assert.equal((await handler(request({ ...good, task: 'guess' }))).statusCode, 400);
  assert.equal((await handler(request({ ...good, requests: 0 }))).statusCode, 400);
  assert.equal((await handler(request({ ...good, costUsd: 'lots' }))).statusCode, 400);
  assert.equal(
    (await handler(request({ ...good, usage: { inputTokens: -1, outputTokens: 0 } }))).statusCode,
    400
  );
  assert.equal(calls.length, 0, 'nothing is written when the request is refused');
});

test('cost-log carries the run scope and the computed price into the row', async (t) => {
  let body;
  t.mock.method(global, 'fetch', async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, status: 200 };
  });
  const { handler } = require('../cost-log');
  const res = await handler(request({ ...good, scope: 'Library', costUsd: 0.0123 }));
  assert.equal(res.statusCode, 200);
  assert.equal(
    body.properties['Cost Entry'].title[0].text.content,
    'Library · fact-check · 12 requests'
  );
  assert.equal(body.properties['Cost USD'].number, 0.0123);
  assert.equal(body.properties.Episode, undefined, 'no episode is invented');
});

test('cost-log reports a failed Notion write instead of pretending it landed', async (t) => {
  t.mock.method(global, 'fetch', async () => ({ ok: false, status: 502 }));
  const { handler } = require('../cost-log');
  const res = await handler(request(good));
  assert.equal(res.statusCode, 502);
  assert.equal(JSON.parse(res.body).logged, false);
  assert.match(JSON.parse(res.body).error, /Notion 502/);
});
