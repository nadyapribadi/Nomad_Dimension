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
  assert.match(prompt, /1\. A claim — Context/);
  assert.deepEqual(
    JSON.parse(prompt.split('Return ONLY this JSON, no markdown:\n')[1]),
    require('../web-research')._internal.VERIFY_EXAMPLE
  );
  assert.ok(JSON.parse(require('../web-research')._internal.SHAPE).research);
});

const { runGemini } = require('../web-research')._internal;

test('grounded verification avoids request settings that suppress search retrieval', async (t) => {
  let body,
    calls = 0;
  t.mock.method(global, 'fetch', async (_url, options) => {
    calls++;
    body = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                { thought: true, text: 'Internal thoughts, not JSON' },
                { text: '{"verified":[]}' },
                { text: ' ' },
              ],
            },
            groundingMetadata: {
              groundingChunks: [{ web: { uri: 'https://example.org', title: 'Evidence' } }],
            },
          },
        ],
      }),
    };
  });
  const result = await runGemini('fake-key', 'Prompt');
  assert.equal(calls, 1);
  assert.deepEqual(body.tools, [{ google_search: {} }]);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  // Structured-output schemas make generateContent skip the search tool, and
  // minimal thinking suppresses tool calls as well; LOW keeps retrieval working
  // within the search deadline.
  assert.equal(body.generationConfig.responseJsonSchema, undefined);
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'LOW');
  assert.equal(result.text.trim(), '{"verified":[]}');
  assert.equal(result.sources.length, 1);
});

test('truncated, blocked and thought-only replies fail specifically without attempting another paid call', async (t) => {
  for (const [candidate, code] of [
    [
      { finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"verified":[]}' }] } },
      'output_truncated',
    ],
    [{ finishReason: 'SAFETY' }, 'generation_stopped'],
    [
      { finishReason: 'STOP', content: { parts: [{ thought: true, text: 'Working…' }] } },
      'empty_model_reply',
    ],
  ]) {
    let calls = 0;
    t.mock.method(global, 'fetch', async () => {
      calls++;
      return { ok: true, json: async () => ({ candidates: [candidate] }) };
    });
    const result = await runGemini('fake', 'Prompt');
    assert.equal(result.code, code);
    assert.equal(calls, 1);
    t.mock.restoreAll();
  }
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
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"wrong":[]}' }] } }],
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
  const chunks = [{ title: 'Evidence', url: 'https://example.org/evidence' }];
  assert.deepEqual(enforceGrounding([confirmed], chunks), [confirmed]);

  const downgraded = enforceGrounding([confirmed], [])[0];
  assert.equal(downgraded.verdict, 'unsupported');
  assert.equal(downgraded.source_url, '');
  assert.equal(downgraded.confidence, 'low');
  assert.match(downgraded.note, /No grounded source/);

  const noUrl = enforceGrounding([{ ...confirmed, source_url: 'not a url' }], chunks)[0];
  assert.equal(noUrl.verdict, 'unsupported');

  const unsupported = { ...confirmed, verdict: 'unsupported', source_url: '' };
  assert.deepEqual(enforceGrounding([unsupported], []), [unsupported]);
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
      candidates: [
        {
          finishReason: 'STOP',
          content: {
            parts: [
              {
                text: '{"verified":[{"name":"A claim","verdict":"confirmed","confidence":"high","source_url":"https://invented.example/page","as_of_date":"","corrected_value":"","note":"From memory."}]}',
              },
            ],
          },
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
