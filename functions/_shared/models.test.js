'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { callModel, cost } = require('./models');

function mockFetch(responder) {
  const fn = async (url, opts) => {
    fn.calls.push({ url, opts, body: opts && opts.body ? JSON.parse(opts.body) : null });
    return responder(fn.calls.length);
  };
  fn.calls = [];
  return fn;
}
const ok = (json) => ({ ok: true, status: 200, json: async () => json });
const httpErr = (status, json) => ({ ok: false, status, json: async () => json });
const env = { ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o' };

test('anthropic: shapes the request and normalizes the response', async () => {
  const fetch = mockFetch(() =>
    ok({
      content: [{ type: 'text', text: 'hello' }],
      usage: { input_tokens: 10, output_tokens: 20 },
    })
  );
  const r = await callModel(
    { task: 'dialogue', system: 'sys', messages: [{ role: 'user', content: 'hi' }] },
    { fetch, env }
  );
  assert.equal(r.text, 'hello');
  assert.equal(r.provider, 'anthropic');
  assert.equal(r.model, 'claude-sonnet-4-6');
  assert.deepEqual(r.usage, { inputTokens: 10, outputTokens: 20 });
  assert.ok(r.costUsd > 0);

  const sent = fetch.calls[0];
  assert.match(sent.url, /api\.anthropic\.com/);
  assert.equal(sent.opts.headers['x-api-key'], 'a');
  assert.equal(sent.opts.headers['anthropic-workspace-id'], undefined);
  assert.equal(sent.body.system, 'sys');
  assert.equal(sent.body.messages[0].content, 'hi');
});

test('anthropic: sends anthropic-workspace-id when ANTHROPIC_WORKSPACE_ID is set', async () => {
  const fetch = mockFetch(() => ok({ content: [{ type: 'text', text: 'x' }], usage: {} }));
  await callModel(
    { task: 'dialogue', messages: [{ role: 'user', content: 'hi' }] },
    { fetch, env: { ...env, ANTHROPIC_WORKSPACE_ID: 'wrkspc_123' } }
  );
  assert.equal(fetch.calls[0].opts.headers['anthropic-workspace-id'], 'wrkspc_123');
});

test('gemini: maps roles, system instruction, and usage', async () => {
  const fetch = mockFetch(() =>
    ok({
      candidates: [{ content: { parts: [{ text: 'bonjour' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 7 },
    })
  );
  const r = await callModel(
    {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      system: 's',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'yo' },
      ],
    },
    { fetch, env }
  );
  assert.equal(r.text, 'bonjour');
  assert.equal(r.provider, 'gemini');
  assert.deepEqual(r.usage, { inputTokens: 5, outputTokens: 7 });

  const b = fetch.calls[0].body;
  assert.match(fetch.calls[0].url, /generativelanguage\.googleapis\.com/);
  assert.equal(b.contents[1].role, 'model');
  assert.equal(b.systemInstruction.parts[0].text, 's');
});

test('openai: prepends system message, maps usage, reads choices[0]', async () => {
  const fetch = mockFetch(() =>
    ok({
      choices: [{ message: { content: 'hi there' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 4 },
    })
  );
  const r = await callModel(
    {
      provider: 'openai',
      model: 'gpt-4o-mini',
      system: 'be terse',
      messages: [{ role: 'user', content: 'hi' }],
    },
    { fetch, env }
  );
  assert.equal(r.text, 'hi there');
  assert.equal(r.provider, 'openai');
  assert.deepEqual(r.usage, { inputTokens: 3, outputTokens: 4 });
  const b = fetch.calls[0].body;
  assert.match(fetch.calls[0].url, /api\.openai\.com/);
  assert.equal(b.messages[0].role, 'system');
  assert.equal(b.messages[0].content, 'be terse');
  assert.equal(b.messages[1].content, 'hi');
  assert.equal(fetch.calls[0].opts.headers.Authorization, 'Bearer o');
});

test('openai: content_filter finish_reason -> content_filtered', async () => {
  const fetch = mockFetch(() =>
    ok({ choices: [{ finish_reason: 'content_filter', message: {} }] })
  );
  await assert.rejects(
    callModel(
      { provider: 'openai', model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'x' }] },
      { fetch, env }
    ),
    (e) => e.code === 'content_filtered'
  );
});

test('429 -> rate_limited, retried once, then succeeds', async () => {
  const fetch = mockFetch((n) =>
    n === 1
      ? httpErr(429, { error: { message: 'slow down' } })
      : ok({ content: [{ type: 'text', text: 'ok' }], usage: {} })
  );
  const r = await callModel(
    { task: 'gap', messages: [{ role: 'user', content: 'x' }] },
    { fetch, env }
  );
  assert.equal(r.text, 'ok');
  assert.equal(fetch.calls.length, 2);
});

test('400 -> invalid_request, not retried', async () => {
  const fetch = mockFetch(() => httpErr(400, { error: { message: 'bad' } }));
  await assert.rejects(
    callModel({ task: 'gap', messages: [{ role: 'user', content: 'x' }] }, { fetch, env }),
    (e) => e.code === 'invalid_request'
  );
  assert.equal(fetch.calls.length, 1);
});

test('500 -> provider_error, retried once (no fallback configured)', async () => {
  const fetch = mockFetch(() => httpErr(500, {}));
  await assert.rejects(
    callModel(
      {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'x' }],
      },
      { fetch, env }
    ),
    (e) => e.code === 'provider_error'
  );
  assert.equal(fetch.calls.length, 2);
});

test('gemini SAFETY finishReason -> content_filtered', async () => {
  const fetch = mockFetch(() =>
    ok({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] })
  );
  await assert.rejects(
    callModel(
      { provider: 'gemini', model: 'gemini-2.0-flash', messages: [{ role: 'user', content: 'x' }] },
      { fetch, env }
    ),
    (e) => e.code === 'content_filtered'
  );
});

test('deepseek: routed through the OpenAI-compatible adapter (base url + key env)', async () => {
  const fetch = mockFetch(() =>
    ok({
      choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    })
  );
  const r = await callModel(
    { provider: 'deepseek', model: 'deepseek-chat', messages: [{ role: 'user', content: 'x' }] },
    { fetch, env: { DEEPSEEK_API_KEY: 'dk' } }
  );
  assert.equal(r.provider, 'deepseek');
  assert.equal(r.text, 'hi');
  assert.match(fetch.calls[0].url, /api\.deepseek\.com\/v1\/chat\/completions/);
  assert.equal(fetch.calls[0].opts.headers.Authorization, 'Bearer dk');
});

test('reasoning model: max_completion_tokens instead of max_tokens, no temperature', async () => {
  const fetch = mockFetch(() =>
    ok({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: {} })
  );
  await callModel(
    {
      provider: 'openai',
      model: 'o3',
      maxTokens: 100,
      temperature: 0.7,
      messages: [{ role: 'user', content: 'x' }],
    },
    { fetch, env: { OPENAI_API_KEY: 'o' } }
  );
  const b = fetch.calls[0].body;
  assert.equal(b.max_completion_tokens, 100);
  assert.equal(b.max_tokens, undefined);
  assert.equal(b.temperature, undefined);
});

test('missing provider key -> invalid_request naming the env var', async () => {
  await assert.rejects(
    callModel(
      { provider: 'qwen', model: 'qwen-max', messages: [{ role: 'user', content: 'x' }] },
      { fetch: mockFetch(() => ok({})), env: {} }
    ),
    (e) => e.code === 'invalid_request' && /DASHSCOPE_API_KEY/.test(e.message)
  );
});

test('task fallback: provider_error on the primary fails over to the fallback provider', async () => {
  // DEFAULT_ROUTING.angle = anthropic primary, gemini fallback.
  const fetch = mockFetch((n) =>
    n <= 2
      ? httpErr(500, {})
      : ok({
          candidates: [{ content: { parts: [{ text: 'fb' }] }, finishReason: 'STOP' }],
          usageMetadata: {},
        })
  );
  const r = await callModel(
    { task: 'angle', messages: [{ role: 'user', content: 'x' }] },
    { fetch, env }
  );
  assert.equal(r.text, 'fb');
  assert.equal(r.provider, 'gemini');
  assert.equal(fetch.calls.length, 3); // primary + 1 retry, then fallback
  assert.match(fetch.calls[2].url, /generativelanguage/);
});

test('task fallback: invalid_request on the primary is NOT failed over', async () => {
  const fetch = mockFetch(() => httpErr(400, { error: { message: 'bad model' } }));
  await assert.rejects(
    callModel({ task: 'gap', messages: [{ role: 'user', content: 'x' }] }, { fetch, env }),
    (e) => e.code === 'invalid_request'
  );
  assert.equal(fetch.calls.length, 1);
});

test('explicit req.fallback is honored on failover', async () => {
  const fetch = mockFetch((n) =>
    n <= 2
      ? httpErr(503, {})
      : ok({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: {} })
  );
  const r = await callModel(
    {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      fallback: { provider: 'openai', model: 'gpt-4o' },
      messages: [{ role: 'user', content: 'x' }],
    },
    { fetch, env }
  );
  assert.equal(r.provider, 'openai');
  assert.equal(fetch.calls.length, 3);
});

test('unknown task -> invalid_request', async () => {
  await assert.rejects(
    callModel(
      { task: 'nope', messages: [{ role: 'user', content: 'x' }] },
      { fetch: mockFetch(() => ok({})), env }
    ),
    (e) => e.code === 'invalid_request'
  );
});

test('missing key -> invalid_request', async () => {
  await assert.rejects(
    callModel(
      { task: 'gap', messages: [{ role: 'user', content: 'x' }] },
      { fetch: mockFetch(() => ok({})), env: {} }
    ),
    (e) => e.code === 'invalid_request'
  );
});

test('cost math', () => {
  assert.equal(cost('claude-sonnet-4-6', { inputTokens: 1_000_000, outputTokens: 0 }), 3);
  assert.equal(cost('gemini-2.0-flash', { inputTokens: 0, outputTokens: 1_000_000 }), 0.4);
  assert.equal(cost('unknown-model', { inputTokens: 1, outputTokens: 1 }), null);
});
