'use strict';

// Unit tests for the PURE helpers inside index.html. index.html has no build
// step and no DOM test harness, so we extract the named helper definitions from
// the source and eval them in a bare sandbox. This is the same "deterministic
// check against the one big file" pattern as scripts/check-html-syntax.mjs.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Pull one top-level definition (`function NAME(` or `const NAME =`) out of the
// source. String- and comment-aware. For `function`, returns from the keyword
// to the matching `}` of the body. For `const`, to the terminating `;`.
function extract(name) {
  const re = new RegExp(`(?:^|\\n)((?:async\\s+)?function\\s+${name}\\b|const\\s+${name}\\s*=)`);
  const m = SRC.match(re);
  if (!m) throw new Error(`helper not found in index.html: ${name}`);
  const from = SRC.indexOf(m[1], m.index);
  const isFn = m[1].includes('function');

  let str = null,
    line = false,
    blk = false,
    prevSig = '';
  // returns how many chars to skip (>=1) when i is inside a string/comment/regex
  // or such a token starts here; 0 when SRC[i] is ordinary code to inspect.
  const step = (i) => {
    const c = SRC[i],
      n = SRC[i + 1];
    if (line) {
      if (c === '\n') line = false;
      return 1;
    }
    if (blk) {
      if (c === '*' && n === '/') {
        blk = false;
        return 2;
      }
      return 1;
    }
    if (str) {
      if (c === '\\') return 2;
      if (c === str) str = null;
      return 1;
    }
    if (c === '/' && n === '/') {
      line = true;
      return 2;
    }
    if (c === '/' && n === '*') {
      blk = true;
      return 2;
    }
    if (c === '"' || c === "'" || c === '`') {
      str = c;
      prevSig = c;
      return 1;
    }
    if (c === '/' && (prevSig === '' || '([{,;:=!&|?+-*/%^~<>'.includes(prevSig))) {
      // regex literal — scan to the closing unescaped '/', respecting [ ] classes
      let j = i + 1,
        inClass = false;
      for (; j < SRC.length; j++) {
        const d = SRC[j];
        if (d === '\\') {
          j++;
          continue;
        }
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) break;
        else if (d === '\n') break;
      }
      while (/[a-z]/i.test(SRC[j + 1] || '')) j++; // flags
      prevSig = '/';
      return j - i + 1;
    }
    if (!/\s/.test(c)) prevSig = c;
    return 0;
  };

  if (!isFn) {
    let depth = 0;
    for (let i = from; i < SRC.length; i++) {
      const s = step(i);
      if (s) {
        i += s - 1;
        continue;
      }
      const c = SRC[i];
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) depth--;
      else if (c === ';' && depth === 0) return SRC.slice(from, i + 1);
    }
    throw new Error(`could not delimit const: ${name}`);
  }

  // function: paren-match the parameter list first (defaults like `= {}` contain
  // braces), then brace-match the body from the next `{`.
  let i = from;
  while (i < SRC.length && SRC[i] !== '(') {
    const s = step(i);
    i += s ? s : 1;
  }
  let pd = 0;
  for (; i < SRC.length; i++) {
    const s = step(i);
    if (s) {
      i += s - 1;
      continue;
    }
    const c = SRC[i];
    if (c === '(') pd++;
    else if (c === ')') {
      pd--;
      if (pd === 0) {
        i++;
        break;
      }
    }
  }
  while (i < SRC.length && SRC[i] !== '{') {
    const s = step(i);
    i += s ? s : 1;
  }
  let depth = 0;
  for (; i < SRC.length; i++) {
    const s = step(i);
    if (s) {
      i += s - 1;
      continue;
    }
    const c = SRC[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return SRC.slice(from, i + 1);
    }
  }
  throw new Error(`could not delimit function: ${name}`);
}

// Build a sandbox with the helpers we want to exercise.
const bootstrap = [
  extract('_JUNK_WORDS'),
  extract('_ntCache'),
  extract('_normTokens'),
  extract('_sim'),
  extract('_thinName'),
  extract('_clusterRows'),
  extract('_cheapHash'),
  extract('_esc'),
  extract('_propText'),
  extract('_readProp'),
  extract('parseJsonLoose'),
  extract('_afetch'),
  extract('nextTableSort'),
  extract('compareCellValues'),
  extract('cellNumber'),
  extract('codeBlockRichText'),
  extract('mapPool'),
].join('\n');

const H = {};
new Function(
  'exports',
  `${bootstrap}\n Object.assign(exports, { _normTokens, _sim, _thinName, _clusterRows, _cheapHash, _esc, _propText, _readProp, parseJsonLoose, _afetch, nextTableSort, compareCellValues, cellNumber, codeBlockRichText, mapPool });`
)(H);

// ── _cheapHash ────────────────────────────────────────────────────────────────
test('_cheapHash is stable for the same input', () => {
  assert.equal(H._cheapHash('the quick brown fox'), H._cheapHash('the quick brown fox'));
});
test('_cheapHash changes when the transcript changes by one char', () => {
  assert.notEqual(H._cheapHash('transcript body v1'), H._cheapHash('transcript body v2'));
});
test('_cheapHash returns an unsigned decimal string', () => {
  assert.match(H._cheapHash('anything'), /^\d+$/);
});

// ── _esc (XSS guard on review/tidy tables) ───────────────────────────────────
// ── codeBlockRichText (every rich_text write goes through this) ─────────────
// Notion accepts 2000 characters per rich-text object, so a long value is
// chunked. A chunker that drops a character at a seam truncates text silently —
// and nothing else in the app would notice.
test('codeBlockRichText keeps every character of a long value', () => {
  const long = 'x'.repeat(4501);
  const chunks = H.codeBlockRichText(long);
  assert.equal(chunks.length, 3);
  assert.equal(chunks.map((c) => c.text.content).join(''), long, 'nothing is lost at the seams');
  assert.ok(
    chunks.every((c) => c.text.content.length <= 2000),
    'and no chunk exceeds what Notion accepts'
  );
});

test('codeBlockRichText handles the empty and exact-boundary cases', () => {
  assert.deepEqual(H.codeBlockRichText(''), [{ type: 'text', text: { content: '' } }]);
  assert.equal(H.codeBlockRichText('y'.repeat(2000)).length, 1, 'exactly 2000 is still one chunk');
  assert.equal(H.codeBlockRichText('y'.repeat(2001)).length, 2);
});

test('codeBlockRichText keeps multi-byte text intact across a boundary', () => {
  const japanese = '東京'.repeat(700);
  const chunks = H.codeBlockRichText(japanese);
  assert.equal(chunks.map((c) => c.text.content).join(''), japanese);
});

// ── mapPool (the concurrency every paid run depends on) ─────────────────────
test('mapPool runs at most `limit` at a time and keeps the input order', async () => {
  let inFlight = 0;
  let peak = 0;
  const out = await H.mapPool([1, 2, 3, 4, 5], 2, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setImmediate(r));
    inFlight--;
    return n * 2;
  });
  assert.equal(peak, 2, 'never more than the ceiling the provider is given');
  assert.deepEqual(out, [2, 4, 6, 8, 10], 'results line up with their inputs');
});

test('mapPool captures a failure instead of rejecting the whole batch', async () => {
  const out = await H.mapPool([1, 2], 2, async (n) => {
    if (n === 2) throw new Error('boom');
    return n;
  });
  assert.equal(out[0], 1, 'the other item still comes back');
  assert.match(String(out[1]._err), /boom/);
});

test('mapPool with nothing to do resolves to nothing', async () => {
  assert.deepEqual(await H.mapPool([], 3, async () => 1), []);
});

// ── Sorting the big tables ───────────────────────────────────────────────────
test('a column sorts ascending first, then flips, and a new column starts over', () => {
  assert.deepEqual(H.nextTableSort(null, 'Claim'), { label: 'Claim', desc: false });
  assert.deepEqual(H.nextTableSort({ label: 'Claim', desc: false }, 'Claim'), {
    label: 'Claim',
    desc: true,
  });
  assert.deepEqual(H.nextTableSort({ label: 'Claim', desc: true }, 'Claim'), {
    label: 'Claim',
    desc: false,
  });
  assert.deepEqual(H.nextTableSort({ label: 'Claim', desc: true }, 'Table'), {
    label: 'Table',
    desc: false,
  });
});

test('numbers sort as numbers, including inside a price', () => {
  assert.ok(H.compareCellValues('9', '10') < 0);
  assert.ok(H.compareCellValues('10', '9') > 0);
  assert.ok(
    H.compareCellValues('¥300', '¥1,200') < 0,
    'both numeric collation and a leading-number parse get this backwards'
  );
  assert.equal(H.compareCellValues('10', '10'), 0);
});

test('a date is left to read chronologically as text', () => {
  assert.equal(H.cellNumber('2026-09-18'), null, 'an ISO date is not treated as a number');
  assert.ok(H.compareCellValues('2026-01-05', '2026-09-18') < 0);
  assert.ok(H.compareCellValues('2025-12-31', '2026-01-01') < 0);
});

test('everything else sorts as text and never throws on a blank cell', () => {
  assert.deepEqual(['row b', 'row a', 'row c'].sort(H.compareCellValues), [
    'row a',
    'row b',
    'row c',
  ]);
  assert.ok(H.compareCellValues('', '3') !== 0, 'a blank cell still has an order');
  assert.ok(H.compareCellValues(undefined, '3') !== 0);
  assert.notEqual(H.compareCellValues('Check failed', 'Not checked'), 0);
});

test('_esc neutralises the HTML metacharacters', () => {
  assert.equal(
    H._esc('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
  );
});
test('_esc passes null/undefined through as empty string', () => {
  assert.equal(H._esc(null), '');
  assert.equal(H._esc(undefined), '');
});

// ── _normTokens / _sim (Tidy clustering) ─────────────────────────────────────
test('_normTokens drops stop-words and short tokens', () => {
  assert.deepEqual(H._normTokens('The vlogger camped by a lake'), ['camped', 'lake']);
});
test('_sim scores near-duplicate activity names above the 0.5 cluster threshold', () => {
  assert.ok(H._sim('Cooking dinner in the camper', 'Cooking dinner in the minivan') >= 0.5);
});
test('_sim scores unrelated rows at 0', () => {
  assert.equal(H._sim('Bathing in an outdoor hot spring', 'Ferry ride to Aomori'), 0);
});
test('_sim of an empty-after-normalisation string is 0, never NaN', () => {
  assert.equal(H._sim('the a an', 'camping'), 0);
});

// ── _thinName (Tidy junk flag) ──────────────────────────────────────────────
test('_thinName flags one-word rows', () => {
  assert.equal(H._thinName('Golf'), true);
});
test('_thinName flags filler phrasing', () => {
  assert.equal(H._thinName('The vlogger successfully cooked food while camping'), true);
  assert.equal(H._thinName('It is claimed that many people visit Iwate'), true);
});
test('_thinName leaves a real, specific row alone', () => {
  assert.equal(H._thinName('Visiting Gembikei and trying Kakko Dango'), false);
});

// ── _clusterRows (Tidy grouping) ────────────────────────────────────────────
test('_clusterRows groups the three camp-cooking rows and keeps the most detailed', () => {
  const rows = [
    { id: 'a', name: 'Cooking dinner in the camper', fields: '' },
    {
      id: 'b',
      name: 'Cooking dinner in the minivan',
      fields: 'Category: Food Experience · Difficulty: Easy',
    },
    { id: 'c', name: 'Fishing with Ama divers', fields: '' },
  ];
  const clusters = H._clusterRows(rows);
  const multi = clusters.find((cl) => cl.rows.length > 1);
  assert.ok(multi, 'a multi-row cluster exists');
  assert.deepEqual(multi.rows.map((r) => r.id).sort(), ['a', 'b']);
  assert.equal(multi.keepId, 'b', 'keeps the row with the longest fields blob');
});
test('_clusterRows leaves genuinely distinct rows as singletons', () => {
  const rows = [
    { id: 'a', name: 'Stargazing at Rikubetsu', fields: '' },
    { id: 'b', name: 'Golf at Hachiman-Tai', fields: '' },
  ];
  assert.equal(
    H._clusterRows(rows).every((cl) => cl.rows.length === 1),
    true
  );
});

// ── _readProp (Notion query-response flattener) ─────────────────────────────
test('_readProp flattens each Notion property shape it supports', () => {
  assert.equal(H._readProp({ type: 'title', title: [{ plain_text: 'Engawa' }] }), 'Engawa');
  assert.equal(
    H._readProp({ type: 'rich_text', rich_text: [{ plain_text: 'a porch' }] }),
    'a porch'
  );
  assert.equal(H._readProp({ type: 'select', select: { name: 'Onsen' } }), 'Onsen');
  assert.equal(
    H._readProp({ type: 'multi_select', multi_select: [{ name: 'a' }, { name: 'b' }] }),
    'a, b'
  );
  assert.equal(H._readProp({ type: 'number', number: 300 }), '300');
  assert.equal(H._readProp({ type: 'number', number: 0 }), '0');
  assert.equal(H._readProp({ type: 'checkbox', checkbox: true }), 'yes');
  assert.equal(H._readProp({ type: 'date', date: { start: '2026-09-01' } }), '2026-09-01');
  assert.equal(H._readProp({ type: 'url', url: 'https://x' }), 'https://x');
});
test('_readProp returns empty string for null / unknown types', () => {
  assert.equal(H._readProp(null), '');
  assert.equal(H._readProp({ type: 'people', people: [] }), '');
});

// ── _propText (Notion write-payload flattener, review table) ────────────────
test('_propText flattens a write-shape property payload', () => {
  assert.equal(H._propText({ title: [{ text: { content: 'Yakitori' } }] }), 'Yakitori');
  assert.equal(
    H._propText({ rich_text: [{ text: { content: 'grilled skewers' } }] }),
    'grilled skewers'
  );
  assert.equal(H._propText({ select: { name: 'Street' } }), 'Street');
  assert.equal(H._propText({ number: 500 }), '500');
  assert.equal(H._propText({ checkbox: true }), '✓');
  assert.equal(H._propText({ date: { start: '2026-09-01' } }), '2026-09-01');
  assert.equal(H._propText(undefined), '');
});

// ── parseJsonLoose (extraction / verify replies) ───────────────────────────
test('parseJsonLoose reads clean JSON', () => {
  assert.deepEqual(H.parseJsonLoose('{"a":1}'), { a: 1 });
});
test('parseJsonLoose digs JSON out of fences + preamble', () => {
  assert.deepEqual(H.parseJsonLoose('Sure!\n```json\n{"verified":[{"name":"x"}]}\n```'), {
    verified: [{ name: 'x' }],
  });
});
test('parseJsonLoose repairs a trailing comma', () => {
  assert.deepEqual(H.parseJsonLoose('{"a":[1,2,],}'), { a: [1, 2] });
});
test('parseJsonLoose throws (does not hang) on junk', () => {
  assert.throws(() => H.parseJsonLoose('no json here at all'));
});

// ── _afetch (the hung-request fix) ────────────────────────────────────────────
test('_afetch rejects with a timeout error when the connection hangs (the freeze-bug guard)', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = (_url, { signal }) =>
    new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
        once: true,
      });
    });
  try {
    await assert.rejects(
      () => H._afetch('https://example.test/', {}, 10),
      /timed out after 0\.01s/
    );
  } finally {
    globalThis.fetch = previous;
  }
});
