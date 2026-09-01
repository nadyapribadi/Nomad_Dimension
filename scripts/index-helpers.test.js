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
].join('\n');

const H = {};
new Function(
  'exports',
  `${bootstrap}\n Object.assign(exports, { _normTokens, _sim, _thinName, _clusterRows, _cheapHash, _esc, _propText, _readProp, parseJsonLoose, _afetch });`
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
  // 10.255.255.1 is non-routable — the socket hangs, so our AbortController must
  // fire and the caller must get an Error, never an unsettled promise.
  await assert.rejects(() => H._afetch('http://10.255.255.1/', {}, 250), /timed out after 0\.25s/);
});
