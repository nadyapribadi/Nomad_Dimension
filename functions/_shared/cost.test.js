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

test('logCost labels a pre-episode scope without claiming an episode', async (t) => {
  let body;
  t.mock.method(global, 'fetch', async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, status: 200 };
  });
  await logCost({
    task: 'fact-check',
    scope: 'Library',
    token: 'secret',
    requests: 3,
    result: {
      model: 'gemini-3.6-flash',
      provider: 'gemini',
      usage: { inputTokens: 10, outputTokens: 5 },
    },
  });
  assert.equal(
    body.properties['Cost Entry'].title[0].text.content,
    'Library · fact-check · 3 requests'
  );
  assert.equal(body.properties.Episode, undefined, 'no episode is invented');
});

test('logCost fails loudly rather than silently losing the entry', async (t) => {
  await assert.rejects(() => logCost({ task: 'fact-check', result: {}, token: '' }), /unavailable/);
  t.mock.method(global, 'fetch', async () => ({ ok: false, status: 502 }));
  await assert.rejects(
    () => logCost({ task: 'fact-check', result: {}, token: 'secret' }),
    /Notion 502/
  );
});

test('logCost carries what the run did, so the entry doubles as a run log', async (t) => {
  let body;
  t.mock.method(global, 'fetch', async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, status: 200 };
  });
  await logCost({
    task: 'fact-check',
    scope: 'Library',
    token: 'secret',
    requests: 240,
    note: '950 saved · 960 attempted · 6 failed · stopped: the provider is rate-limiting requests',
    result: { usage: { inputTokens: 1, outputTokens: 1 } },
  });
  assert.equal(
    body.properties['Cost Entry'].title[0].text.content,
    'Library · fact-check · 240 requests · 950 saved · 960 attempted · 6 failed · stopped: the provider is rate-limiting requests'
  );
});

test('logCost records the character count that speech is billed by', async (t) => {
  let body;
  t.mock.method(global, 'fetch', async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, status: 200 };
  });
  await logCost({
    task: 'tts',
    episode: 'EP7',
    token: 'secret',
    requests: 4,
    characters: 5120.6,
    result: { model: 'en-US-Neural2-D', usage: { inputTokens: 0, outputTokens: 0 } },
  });
  assert.equal(body.properties.Characters.number, 5120, 'characters are whole');
  assert.equal(body.properties['Cost Entry'].title[0].text.content, 'EP7 · tts · 4 requests');
  // No stage mapping exists for speech, so no Stage option is invented.
  assert.equal(body.properties.Stage, undefined);
  // And no price is invented either: only a rate the operator supplies sets one.
  assert.equal(body.properties['Cost USD'], undefined);
});

test('a successful write says so once, and reports nothing dropped', async (t) => {
  let calls = 0;
  t.mock.method(global, 'fetch', async () => {
    calls++;
    return { ok: true, status: 200 };
  });
  const out = await logCost({
    task: 'tts',
    token: 'secret',
    requests: 1,
    characters: 100,
    result: { usage: { inputTokens: 0, outputTokens: 0 } },
  });
  assert.deepEqual(out, { charactersDropped: false });
  assert.equal(calls, 1, 'one row, never a second attempt after a success');
});

test('a missing Characters column costs the count, never the whole entry', async (t) => {
  const seen = [];
  t.mock.method(global, 'fetch', async (_url, options) => {
    const props = JSON.parse(options.body).properties;
    seen.push(props);
    return props.Characters
      ? {
          ok: false,
          status: 400,
          text: async () =>
            '{"message":"body failed validation: property Characters does not exist"}',
        }
      : { ok: true, status: 200 };
  });
  const dropped = await logCost({
    task: 'tts',
    token: 'secret',
    requests: 1,
    characters: 900,
    result: { usage: { inputTokens: 0, outputTokens: 0 } },
  });
  assert.equal(seen.length, 2, 'the row is retried without the unknown property');
  assert.equal(seen[0].Characters.number, 900);
  assert.equal(seen[1].Characters, undefined);
  assert.deepEqual(
    dropped,
    { charactersDropped: true },
    'and the caller is told the count was lost'
  );
});
