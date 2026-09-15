'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { usageFromInteractions, logCost, STAGE_BY_TASK } = require('../_shared/cost');

test('usageFromInteractions reads the names the Interactions API actually uses', () => {
  assert.deepEqual(usageFromInteractions({ total_input_tokens: 1200, total_output_tokens: 340 }), {
    inputTokens: 1200,
    outputTokens: 340,
  });
  assert.deepEqual(usageFromInteractions(null), { inputTokens: 0, outputTokens: 0 });
});

test('logCost writes one entry per batch, naming the request count', async (t) => {
  let body;
  t.mock.method(global, 'fetch', async (url, options) => {
    body = JSON.parse(options.body);
    assert.match(url, /api\.notion\.com\/v1\/pages/);
    return { ok: true, status: 200 };
  });
  await logCost({
    task: 'fact-check',
    episode: 'EP12',
    token: 'secret',
    requests: 12,
    result: {
      model: 'gemini-3.6-flash',
      provider: 'gemini',
      usage: { inputTokens: 48000, outputTokens: 9600 },
    },
  });
  const props = body.properties;
  assert.equal(props['Cost Entry'].title[0].text.content, 'EP12 · fact-check · 12 requests');
  assert.equal(props.Task.rich_text[0].text.content, 'fact-check');
  assert.equal(props.Model.rich_text[0].text.content, 'gemini-3.6-flash');
  assert.equal(props['Tokens In'].number, 48000);
  assert.equal(props['Tokens Out'].number, 9600);
  assert.equal(props.Provider.select.name, 'Google');
  // No price is invented: the Interactions API reports tokens, not dollars.
  assert.equal(props['Cost USD'], undefined);
});

test('logCost keeps the mapped stage label for the router tasks', async (t) => {
  let body;
  t.mock.method(global, 'fetch', async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, status: 200 };
  });
  await logCost({
    task: 'dialogue',
    episode: 'EP1',
    token: 'secret',
    result: { model: 'm', provider: 'anthropic', usage: { inputTokens: 1, outputTokens: 2 } },
  });
  assert.equal(
    body.properties['Cost Entry'].title[0].text.content,
    'EP1 · Stage 4 - Script · dialogue'
  );
  assert.equal(body.properties.Stage.select.name, STAGE_BY_TASK.dialogue);
});

test('logCost fails loudly rather than silently losing the entry', async (t) => {
  await assert.rejects(() => logCost({ task: 'fact-check', result: {}, token: '' }), /unavailable/);
  t.mock.method(global, 'fetch', async () => ({ ok: false, status: 502 }));
  await assert.rejects(
    () => logCost({ task: 'fact-check', result: {}, token: 'secret' }),
    /Notion 502/
  );
});
