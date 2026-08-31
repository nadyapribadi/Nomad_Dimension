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

test('buildVerifyPrompt: numbers entries, caps at 40, echoes store', () => {
  assert.equal(buildVerifyPrompt({ items: [] }).error, 'Missing items');
  const items = Array.from({ length: 50 }, (_, i) => ({ name: `claim ${i}`, detail: 'd' }));
  const t = buildVerifyPrompt({ store: 'prices', items }).text;
  assert.match(t, /40 "prices" entries/);
  assert.match(t, /^40\. claim 39 — d$/m);
  assert.equal(/^41\./m.test(t), false);
});
