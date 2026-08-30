'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJsonLoose } = require('../web-research')._internal;

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
