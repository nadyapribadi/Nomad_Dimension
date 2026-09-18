'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { clipText, safeJSON, scrubLoneSurrogates } = require('./text');

// A stray half of a surrogate pair: what is left when something cut an emoji in
// two. JSON carries it, Google and Notion refuse it.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const FLAG = '\u{1F1EF}\u{1F1F5}'; // one flag, two code points, four UTF-16 units

test('clipText never ends on half a character', () => {
  const text = `abcd${FLAG}efgh`;
  assert.equal(clipText(text, 5), 'abcd');
  assert.equal(clipText(text, 6), text.slice(0, 6));
  assert.equal(clipText(text, 8), text.slice(0, 8));
  assert.equal(clipText(text, 100), text);
  for (const max of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const cut = clipText(text, max);
    assert.equal(LONE_SURROGATE.test(cut), false, `max=${max} left half a character behind`);
  }
});

test('clipText passes through what it does not need to cut', () => {
  assert.equal(clipText(null, 10), '');
  assert.equal(clipText(undefined, 10), '');
  assert.equal(clipText('plain', 10), 'plain');
  assert.equal(clipText('plain', 0), 'plain');
});

test('scrubLoneSurrogates keeps whole characters and repairs halves', () => {
  assert.equal(scrubLoneSurrogates(FLAG), FLAG);
  assert.equal(scrubLoneSurrogates(FLAG.slice(0, 1)), '\uFFFD');
  assert.equal(scrubLoneSurrogates(FLAG.slice(1, 2)), '\uFFFD');
  assert.equal(scrubLoneSurrogates(`a${FLAG.slice(0, 1)}b`), 'a\uFFFDb');
  assert.equal(scrubLoneSurrogates('plain'), 'plain');
});

test('safeJSON is parseable even when a value holds half a character', () => {
  const payload = {
    input: `TOKYO ${FLAG.slice(0, 1)}`,
    items: [{ name: 'claim', detail: `x${FLAG.slice(1, 2)}` }],
    count: 3,
    ok: true,
    missing: null,
  };
  const raw = safeJSON(payload);
  assert.equal(LONE_SURROGATE.test(raw), false);
  const parsed = JSON.parse(raw);
  assert.equal(parsed.input, 'TOKYO \uFFFD');
  assert.equal(parsed.items[0].detail, 'x\uFFFD');
  assert.equal(parsed.count, 3);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.missing, null);
  assert.deepEqual(JSON.parse(safeJSON({ a: [1, 'two'] })), { a: [1, 'two'] });
});
