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

test('routing read failures never fall through to a paid default model', async () => {
  const oldToken = process.env.NOTION_TOKEN,
    oldFetch = global.fetch;
  try {
    process.env.NOTION_TOKEN = 'fixture';
    let requests = [];
    global.fetch = async (url) => {
      requests.push(url);
      return { ok: false, status: 503 };
    };
    const response = await handler(
      post({ task: 'angle', messages: [{ role: 'user', content: 'An angle' }] })
    );
    assert.equal(response.statusCode, 503);
    assert.equal(JSON.parse(response.body).code, 'routing_unavailable');
    assert.ok(requests.every((url) => url.startsWith('https://api.notion.com/')));
    delete process.env.NOTION_TOKEN;
    requests = [];
    assert.equal(
      (await handler(post({ task: 'angle', messages: [{ role: 'user', content: 'An angle' }] })))
        .statusCode,
      503
    );
    assert.equal(requests.length, 0);
    process.env.NOTION_TOKEN = 'fixture';
    global.fetch = async (url) => {
      requests.push(url);
      return { ok: true, json: async () => ({ results: [], has_more: false }) };
    };
    assert.equal(
      (await handler(post({ task: 'angle', messages: [{ role: 'user', content: 'An angle' }] })))
        .statusCode,
      503
    );
    assert.ok(requests.every((url) => url.startsWith('https://api.notion.com/')));
  } finally {
    global.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.NOTION_TOKEN;
    else process.env.NOTION_TOKEN = oldToken;
  }
});

test('valid saved routing still calls the selected provider and model', async () => {
  const oldToken = process.env.NOTION_TOKEN,
    oldKey = process.env.OPENAI_API_KEY,
    oldFetch = global.fetch;
  const requests = [];
  try {
    process.env.NOTION_TOKEN = 'fixture';
    process.env.OPENAI_API_KEY = 'fixture';
    global.fetch = async (url, options) => {
      requests.push({ url, body: options.body && JSON.parse(options.body) });
      if (url.includes('/blocks/'))
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                type: 'code',
                code: {
                  rich_text: [
                    {
                      plain_text: JSON.stringify({
                        angle: { provider: 'openai', model: 'chosen-model' },
                        dialogue: { provider: 'openai', model: 'chosen-dialogue' },
                      }),
                    },
                  ],
                },
              },
            ],
            has_more: false,
          }),
        };
      if (url.startsWith('https://api.openai.com/'))
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Selected provider output' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1, completion_tokens: 2 },
          }),
        };
      if (url === 'https://api.notion.com/v1/pages') return { ok: true };
      throw new Error('Unexpected request');
    };
    const response = await handler(
      post({
        task: 'angle',
        messages: [{ role: 'user', content: 'An angle' }],
        singleAttempt: true,
        maxTokens: 100,
      })
    );
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(JSON.parse(response.body).model, 'chosen-model');
    assert.equal(requests.filter((r) => r.url.startsWith('https://api.openai.com/')).length, 1);
    assert.equal(
      requests.find((r) => r.url.startsWith('https://api.openai.com/')).body.model,
      'chosen-model'
    );
  } finally {
    global.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.NOTION_TOKEN;
    else process.env.NOTION_TOKEN = oldToken;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});
