'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { handler, STAGE_BY_TASK, PROVIDER_SELECT, STATUS_BY_CODE } = require('../ai-run');

const { makeSession } = require('./auth');
process.env.APP_PASSWORD = 'test-only-password-not-for-deployment';
const headers = () => ({ cookie: `nomad_session=${makeSession(process.env.APP_PASSWORD)}` });
const post = (body) => ({ httpMethod: 'POST', headers: headers(), body: JSON.stringify(body) });

test('maps: every task has a Stage; providers map to Notion select names', () => {
  for (const stage of Object.values(STAGE_BY_TASK)) assert.match(stage, /^Stage /);
  assert.equal(PROVIDER_SELECT.anthropic, 'Anthropic');
  assert.equal(PROVIDER_SELECT.gemini, 'Google');
  assert.equal(STATUS_BY_CODE.rate_limited, 429);
  assert.equal(STATUS_BY_CODE.content_filtered, 422);
});

test('OPTIONS preflight -> 200', async () => {
  const r = await handler({ httpMethod: 'OPTIONS' });
  assert.equal(r.statusCode, 200);
});

test('non-POST -> 405', async () => {
  const r = await handler({ httpMethod: 'GET' });
  assert.equal(r.statusCode, 405);
});

test('bad JSON -> 400', async () => {
  const r = await handler({ httpMethod: 'POST', headers: headers(), body: '{' });
  assert.equal(r.statusCode, 400);
});

test('missing messages -> 400 (invalid_request from callModel)', async () => {
  const r = await handler(post({ task: 'dialogue' }));
  assert.equal(r.statusCode, 400);
  assert.equal(JSON.parse(r.body).code, 'invalid_request');
});

test('unknown task -> 400', async () => {
  const r = await handler(post({ task: 'nope', messages: [{ role: 'user', content: 'x' }] }));
  assert.equal(r.statusCode, 400);
});
