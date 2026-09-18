'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJsonLoose, buildVerifyPrompt, buildAskPrompt } = require('../web-research')._internal;

test('parseJsonLoose: clean JSON', () => {
  assert.deepEqual(parseJsonLoose('{"a":1}'), { a: 1 });
});

test('parseJsonLoose: fenced + preamble', () => {
  const r = parseJsonLoose('Here you go:\n```json\n{"research":[{"statement":"x"}]}\n```');
  assert.equal(r.research[0].statement, 'x');
});

test('parseJsonLoose: trailing comma repair', () => {
  assert.deepEqual(parseJsonLoose('{"a":[1,2,],}'), { a: [1, 2] });
});

test('parseJsonLoose: unparseable -> null', () => {
  assert.equal(parseJsonLoose('no json here'), null);
});

test('buildAskPrompt: missing query -> error', () => {
  assert.equal(buildAskPrompt({}).error, 'Missing query');
  assert.match(buildAskPrompt({ query: 'Lake Tanuki' }).text, /Lake Tanuki/);
});

test('buildVerifyPrompt: validates the bounded request and provides valid JSON', () => {
  assert.equal(buildVerifyPrompt({ items: [] }).error, 'Missing items');
  assert.match(
    buildVerifyPrompt({ items: Array.from({ length: 5 }, () => ({ name: 'Claim' })) }).error,
    /at most 4/
  );
  assert.ok(buildVerifyPrompt({ items: [null] }).error);
  const prompt = buildVerifyPrompt({
    store: 'research',
    items: [{ name: 'A claim', detail: 'Context' }],
  }).text;
  assert.match(prompt, /1 "research" entries/);
  assert.match(prompt, /1\. claim: A claim/);
  assert.match(prompt, /\n {3}detail: Context/);
  assert.match(prompt, /Never include the list number/);
  // The claim and its context must not share a line: gluing them together made
  // the model echo "number. claim — detail" back as the name.
  assert.doesNotMatch(prompt, /A claim — Context/);
  assert.deepEqual(
    JSON.parse(prompt.split('Return ONLY this JSON, no markdown:\n')[1]),
    require('../web-research')._internal.VERIFY_EXAMPLE
  );
  assert.ok(JSON.parse(require('../web-research')._internal.SHAPE).research);
});

const { runGemini, VERIFY_SCHEMA } = require('../web-research')._internal;

test('a detail clipped mid-emoji cannot reach the provider as half a character', () => {
  // The character that broke a live run: the 300-character cut landed between
  // the two halves of a flag, and Google rejected the whole request with
  // "Invalid JSON payload" — one claim, whole batch refused.
  const detail = 'x'.repeat(299) + '\u{1F1EF}\u{1F1F5}' + 'tail';
  const prompt = buildVerifyPrompt({ store: 'food', items: [{ name: 'A claim', detail }] }).text;
  assert.doesNotMatch(prompt, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  const clipped = prompt.split('\n   detail: ')[1].split('\n')[0];
  assert.ok(clipped.length <= 300);
  assert.equal(clipped, 'x'.repeat(299));
});

test('the request body sent to Gemini carries no lone surrogate', async (t) => {
  let raw;
  t.mock.method(global, 'fetch', async (_u, options) => {
    raw = options.body;
    return {
      ok: true,
      json: async () => ({
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"verified":[]}' }] }],
      }),
    };
  });
  // A lone half can arrive from a caller that clipped somewhere else.
  await runGemini('fake-key', `TOKYO ${'\u{1F1EF}\u{1F1F5}'.slice(0, 1)}`, true);
  assert.equal(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(raw), false);
  assert.equal(JSON.parse(raw).input, 'TOKYO \uFFFD');
});

test('a rate-limited provider is reported as throttled, not as a claim failure', async (t) => {
  t.mock.method(global, 'fetch', async () => ({
    ok: false,
    status: 429,
    json: async () => ({ error: { message: 'Resource has been exhausted' } }),
  }));
  const result = await runGemini('fake-key', 'Prompt', true);
  assert.equal(result.status, 502);
  assert.equal(result.code, 'provider_throttled');
  assert.match(result.error, /exhausted/);
});

test('grounded verification uses the Interactions API with search and a response schema', async (t) => {
  let url,
    body,
    calls = 0;
  t.mock.method(global, 'fetch', async (u, options) => {
    calls++;
    url = u;
    body = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        status: 'completed',
        steps: [
          { type: 'google_search_call', arguments: { queries: ['q1'] } },
          { type: 'google_search_result', result: [], is_error: false },
          { type: 'thought' },
          { type: 'model_output', content: [{ type: 'text', text: '{"verified":[]}' }] },
        ],
        usage: {
          total_output_tokens: 120,
          grounding_tool_count: [{ type: 'google_search', count: 1 }],
        },
      }),
    };
  });
  const result = await runGemini('fake-key', 'Prompt', true);
  assert.equal(calls, 1);
  assert.match(url, /\/v1beta\/interactions/);
  assert.equal(body.model, require('../web-research')._internal.MODEL);
  assert.equal(body.input, 'Prompt');
  assert.deepEqual(body.tools, [{ type: 'google_search' }]);
  assert.deepEqual(body.response_format, VERIFY_SCHEMA);
  assert.equal(result.text.trim(), '{"verified":[]}');
  assert.equal(result.grounded, true);
});

test('blocked and answer-less replies fail specifically without attempting another paid call', async (t) => {
  for (const [payload, code] of [
    [{ status: 'failed' }, 'generation_stopped'],
    [{ status: 'completed', steps: [{ type: 'thought' }] }, 'empty_model_reply'],
  ]) {
    let calls = 0;
    t.mock.method(global, 'fetch', async () => {
      calls++;
      return { ok: true, json: async () => payload };
    });
    const result = await runGemini('fake', 'Prompt', true);
    assert.equal(result.code, code);
    assert.equal(calls, 1);
    t.mock.restoreAll();
  }
});

test('runGemini reports usage instead of guessing truncation from the token count', async (t) => {
  t.mock.method(global, 'fetch', async () => ({
    ok: true,
    json: async () => ({
      status: 'completed',
      steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"verified":[]}' }] }],
      usage: { total_output_tokens: 4096 },
    }),
  }));
  const result = await runGemini('fake', 'Prompt', true);
  assert.equal(result.error, undefined);
  assert.equal(result.text, '{"verified":[]}');
  assert.equal(result.usage.total_output_tokens, 4096);
});

test('balanced JSON recovery ignores braces in quoted notes and trailing surrounding prose', () => {
  const data = { verified: [{ note: 'Quoted "brace }" and comma ,] stay literal.' }] };
  assert.deepEqual(
    parseJsonLoose('```JSON\n' + JSON.stringify(data) + '\n```\nMore text {invalid}'),
    data
  );
  assert.deepEqual(parseJsonLoose('{"note":"Keep ,] and ,} inside text",}'), {
    note: 'Keep ,] and ,} inside text',
  });
  assert.equal(parseJsonLoose('{"verified":[{"note":"A complete inner object"}'), null);
});

test('HTTP handler rejects malformed shapes and oversize batches without claiming success', async (t) => {
  const { handler } = require('../web-research'),
    { makeSession, COOKIE } = require('./auth');
  const oldPassword = process.env.APP_PASSWORD,
    oldKey = process.env.GEMINI_API_KEY;
  process.env.APP_PASSWORD = 'fixture-password-long-enough';
  process.env.GEMINI_API_KEY = 'fixture-key';
  t.after(() => {
    if (oldPassword === undefined) delete process.env.APP_PASSWORD;
    else process.env.APP_PASSWORD = oldPassword;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  });
  const invoke = (items) =>
    handler({
      httpMethod: 'POST',
      headers: { cookie: COOKIE + '=' + makeSession(process.env.APP_PASSWORD) },
      body: JSON.stringify({ mode: 'verify', items }),
    });
  let calls = 0;
  t.mock.method(global, 'fetch', async () => {
    calls++;
    return {
      ok: true,
      json: async () => ({
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"wrong":[]}' }] }],
      }),
    };
  });
  const oversized = await invoke(Array.from({ length: 5 }, () => ({ name: 'A claim' })));
  assert.equal(oversized.statusCode, 400);
  assert.equal(calls, 0);
  const missing = await invoke([{ name: 'A claim' }]);
  assert.equal(missing.statusCode, 502);
  assert.equal(JSON.parse(missing.body).code, 'invalid_model_shape');
  assert.equal(calls, 1);
});

function withVerifyHandler(t) {
  const { handler } = require('../web-research'),
    { makeSession, COOKIE } = require('./auth');
  const oldPassword = process.env.APP_PASSWORD,
    oldKey = process.env.GEMINI_API_KEY;
  process.env.APP_PASSWORD = 'fixture-password-long-enough';
  process.env.GEMINI_API_KEY = 'fixture-key';
  t.after(() => {
    if (oldPassword === undefined) delete process.env.APP_PASSWORD;
    else process.env.APP_PASSWORD = oldPassword;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  });
  return (items) =>
    handler({
      httpMethod: 'POST',
      headers: { cookie: COOKIE + '=' + makeSession(process.env.APP_PASSWORD) },
      body: JSON.stringify({ mode: 'verify', items }),
    });
}

test('truncation needs agreement: unparseable output at the cap, not a valid reply at the cap', async (t) => {
  const invoke = withVerifyHandler(t);
  const items = [{ name: 'A claim' }];
  const reply = (text, usage) => {
    t.mock.restoreAll();
    t.mock.method(global, 'fetch', async () => ({
      ok: true,
      json: async () => ({
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text }] }],
        ...(usage ? { usage } : {}),
      }),
    }));
    return invoke(items);
  };

  // Cut off mid-JSON and the provider says it hit the ceiling -> truncation.
  const cut = await reply('{"verified":[{"name":"A cl', { total_output_tokens: 4096 });
  assert.equal(cut.statusCode, 502);
  assert.equal(JSON.parse(cut.body).code, 'output_truncated');

  // Unparseable with no cap evidence -> malformed, a different problem.
  const malformed = await reply('the model rambled with no JSON', null);
  assert.equal(malformed.statusCode, 502);
  assert.equal(JSON.parse(malformed.body).code, 'invalid_model_json');

  // Complete JSON that merely reached the ceiling is a real answer.
  const complete = await reply(
    '{"verified":[{"name":"A claim","verdict":"unsupported","confidence":"low","source_url":"","as_of_date":"","corrected_value":"","note":"n"}]}',
    { total_output_tokens: 4096 }
  );
  assert.equal(complete.statusCode, 200);
  assert.equal(JSON.parse(complete.body).verified[0].name, 'A claim');
  // The browser cannot sum what it is never told: usage rides back with the
  // findings so one cost entry can be logged for the whole run.
  assert.deepEqual(JSON.parse(complete.body).usage, {
    inputTokens: 0,
    outputTokens: 4096,
  });
  // Priced from the shared table, so the Costs row can carry dollars instead of
  // making every reader redo the arithmetic.
  assert.equal(JSON.parse(complete.body).costUsd, 0.001638);
});

const { enforceGrounding } = require('../web-research')._internal;

test('enforceGrounding: ungrounded confirmation is downgraded, grounded evidence is kept', () => {
  const confirmed = {
    name: 'A claim',
    verdict: 'confirmed',
    confidence: 'high',
    source_url: 'https://example.org/evidence',
    as_of_date: '2026-09-01',
    corrected_value: '',
    note: 'Model says so.',
  };
  assert.deepEqual(enforceGrounding([confirmed], true), [confirmed]);

  const downgraded = enforceGrounding([confirmed], false)[0];
  assert.equal(downgraded.verdict, 'unsupported');
  assert.equal(downgraded.source_url, '');
  assert.equal(downgraded.confidence, 'low');
  assert.match(downgraded.note, /No grounded source/);
  assert.equal(downgraded.reason, 'not_grounded');

  const noUrl = enforceGrounding([{ ...confirmed, source_url: 'not a url' }], true)[0];
  assert.equal(noUrl.verdict, 'unsupported');

  const unsupported = { ...confirmed, verdict: 'unsupported', source_url: '' };
  assert.deepEqual(enforceGrounding([unsupported], false), [unsupported]);
});

test('HTTP handler downgrades a confirmed verdict that has no search grounding', async (t) => {
  const { handler } = require('../web-research'),
    { makeSession, COOKIE } = require('./auth');
  const oldPassword = process.env.APP_PASSWORD,
    oldKey = process.env.GEMINI_API_KEY;
  process.env.APP_PASSWORD = 'fixture-password-long-enough';
  process.env.GEMINI_API_KEY = 'fixture-key';
  t.after(() => {
    if (oldPassword === undefined) delete process.env.APP_PASSWORD;
    else process.env.APP_PASSWORD = oldPassword;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  });
  t.mock.method(global, 'fetch', async () => ({
    ok: true,
    json: async () => ({
      status: 'completed',
      steps: [
        {
          type: 'model_output',
          content: [
            {
              type: 'text',
              text: '{"verified":[{"name":"A claim","verdict":"confirmed","confidence":"high","source_url":"https://invented.example/page","as_of_date":"","corrected_value":"","note":"From memory."}]}',
            },
          ],
        },
      ],
    }),
  }));
  const res = await handler({
    httpMethod: 'POST',
    headers: { cookie: COOKIE + '=' + makeSession(process.env.APP_PASSWORD) },
    body: JSON.stringify({ mode: 'verify', items: [{ name: 'A claim' }] }),
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.verified[0].verdict, 'unsupported');
  assert.equal(body.verified[0].source_url, '');
});
