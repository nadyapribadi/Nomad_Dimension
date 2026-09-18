'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const html = fs.readFileSync('index.html', 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\ninit\(\);\s*$/, '\n');

function setup() {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        value: '',
        checked: false,
        hidden: false,
        style: {},
        dataset: {},
        options: [],
        innerHTML: '',
        textContent: '',
        disabled: false,
        classList: { add() {}, remove() {}, toggle() {} },
        querySelectorAll: () => [],
        querySelector: () => element('child'),
        addEventListener() {},
        replaceChildren() {
          this.innerHTML = '';
        },
        appendChild() {},
        focus() {},
        closest: () => null,
      });
    return elements.get(id);
  };
  const c = vm.createContext({
    console,
    Blob,
    TextEncoder,
    Uint8Array,
    DataView,
    URL,
    AbortController,
    crypto: webcrypto,
    setTimeout: () => 0,
    clearTimeout() {},
    confirm: () => true,
    document: {
      getElementById: element,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => element('new'),
    },
    navigator: {},
    location: {},
    Audio: class {},
    atob,
    btoa,
  });
  vm.runInContext(source, c);
  // Timers are inert in tests: pacing and back-off are exercised through their
  // seams instead, so no test waits on the clock.
  vm.runInContext(
    '_minIntervalMs=0;_throttleWait=async()=>{};_notionWriteIntervalMs=0;_notionWriteWait=async()=>{}',
    c
  );
  const run = (code) => vm.runInContext(code, c),
    LIB = run('LIB'),
    db = run('DB_IDS');
  const cfg = {
    collections: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    placements: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  };
  const pages = new Map(),
    local = new Map(),
    calls = [];
  let serial = 100,
    tick = 0;
  const text = (p) =>
    (p?.rich_text || p?.title || []).map((t) => t.text?.content ?? t.plain_text).join('');
  const stamp = () => `2026-09-12T10:00:${String(++tick).padStart(2, '0')}.000Z`;
  const normalize = (props) =>
    Object.fromEntries(
      Object.entries(props).map(([name, p]) => [name, { ...p, type: p.type || Object.keys(p)[0] }])
    );
  c.localArtifact = async (key, value) => {
    if (value !== undefined) local.set(key, structuredClone(value));
    return structuredClone(local.get(key));
  };
  c.libraryConfig = async () => cfg;
  c.notionAPI = async (endpoint, method = 'GET', body) => {
    const call = { endpoint, method, body };
    calls.push(call);
    if (c.before) await c.before(call);
    let result;
    if (endpoint === 'pages' && method === 'POST') {
      const id = `00000000-0000-0000-0000-${String(++serial).padStart(12, '0')}`;
      result = {
        id,
        parent: body.parent,
        properties: normalize(body.properties),
        last_edited_time: stamp(),
        children: body.children || [],
      };
      pages.set(id, result);
    } else if (/^databases\/.+\/query$/.test(endpoint)) {
      const id = endpoint.split('/')[1];
      let rows = [...pages.values()].filter((p) => p.parent.database_id === id && !p.archived);
      if (body?.filter) {
        const f = body.filter;
        rows = rows.filter((p) =>
          f.relation
            ? p.properties[f.property]?.relation?.some((r) => r.id === f.relation.contains)
            : text(p.properties[f.property]) === (f.rich_text || f.title).equals
        );
      }
      result = { results: rows, has_more: false };
    } else if (/^pages\//.test(endpoint)) {
      result = pages.get(endpoint.split('/')[1]);
      if (!result) {
        const e = new Error('Missing page');
        e.status = 404;
        throw e;
      }
      if (method === 'PATCH') {
        result.properties = { ...result.properties, ...normalize(body.properties) };
        result.last_edited_time = stamp();
      }
    } else if (/^blocks\//.test(endpoint))
      result = { results: pages.get(endpoint.split('/')[1])?.children || [], has_more: false };
    else throw new Error(`Unhandled ${endpoint}`);
    if (c.after) await c.after(call, result);
    return structuredClone(result);
  };
  LIB.idea = run('blankLibraryIdea()');
  LIB.idea.name = 'A question about ordinary life';
  const add = (cat = 'activities', name = 'Cooking in a van') => {
    const id = webcrypto.randomUUID();
    const page = {
      id,
      parent: { database_id: db[cat] },
      last_edited_time: stamp(),
      properties: normalize({
        [run(`EP_MAT.${cat}.title`)]: { title: [{ text: { content: name } }] },
        'Source URL': { url: 'https://youtube.com/watch?v=example' },
      }),
    };
    pages.set(id, page);
    c.row = page;
    c.cat = cat;
    const material = run('libMaterial(row,cat)');
    const item = {
      placementId: webcrypto.randomUUID(),
      snapshotRevision: webcrypto.randomUUID(),
      material,
      purpose: 'Show a daily ritual',
      pageId: null,
      lastEdited: null,
    };
    LIB.idea.items.push(item);
    LIB.idea.dirty = true;
    return item;
  };
  return { c, run, LIB, pages, local, calls, add, cfg, element, text };
}

test('idea roundtrip preserves cross-table evidence, purpose, order and soft removal', async () => {
  const t = setup();
  t.add();
  t.add('prices', 'A shower costs 300 yen');
  t.add('food', 'Birthday cake');
  await t.run('saveLibraryIdea()');
  assert.equal(t.LIB.idea.revision, 1);
  assert.equal(t.LIB.idea.pending, null);
  assert.equal(t.LIB.idea.items.length, 3);
  const first = t.LIB.idea.items[0].placementId;
  t.run('moveIdeaMaterial(0,1)');
  t.run("changeIdeaPurpose(1,'Open with the practical constraint')");
  t.run('removeIdeaMaterial(2)');
  await t.run('saveLibraryIdea()');
  assert.equal(t.LIB.idea.revision, 2);
  assert.equal(t.LIB.idea.items[1].placementId, first);
  assert.equal(t.LIB.idea.items[1].purpose, 'Open with the practical constraint');
  const removed = [...t.pages.values()].filter(
    (p) => p.properties.State?.select?.name === 'Removed'
  );
  assert.equal(removed.length, 1);
  const restored = await t.run('readLibraryIdea(LIB.idea.id)');
  assert.equal(restored.items.length, 2);
  assert.equal(restored.items[1].material.name, 'Cooking in a van');
  assert.equal(
    [...t.pages.values()].filter((p) => p.parent.database_id === t.run('DB_IDS.activities')).length,
    1
  );
});

test('creation response lost after commit is reconciled without a duplicate', async () => {
  const t = setup();
  t.add();
  let once = true;
  t.c.after = async (call) => {
    if (once && call.method === 'POST' && call.body?.parent?.database_id === t.cfg.placements) {
      once = false;
      throw new Error('Network lost after commit');
    }
  };
  await t.run('saveLibraryIdea()');
  assert.ok(t.LIB.idea.pending);
  assert.equal(t.LIB.idea.revision, 0);
  const count = () =>
    [...t.pages.values()].filter((p) => p.parent.database_id === t.cfg.placements).length;
  assert.equal(count(), 1);
  await t.run('saveLibraryIdea()');
  assert.equal(count(), 1);
  assert.equal(t.LIB.idea.revision, 1);
  assert.equal(t.LIB.idea.pending, null);
});

test('unknown create without a visible record is never blindly replayed', async () => {
  const t = setup();
  t.add();
  let attempts = 0;
  t.c.before = async (call) => {
    if (call.method === 'POST' && call.body?.parent?.database_id === t.cfg.placements) {
      attempts++;
      throw new Error('Unknown network outcome');
    }
  };
  await t.run('saveLibraryIdea()');
  await t.run('saveLibraryIdea()');
  assert.equal(attempts, 1);
  assert.ok(t.LIB.idea.pending);
  assert.match(t.element('idea-save-status').textContent, /Completion unknown/);
});

test('known rejected create retries remaining material and survives a local reload', async () => {
  const t = setup();
  t.add();
  t.add('food', 'Cake');
  let once = true;
  t.c.before = async (call) => {
    if (once && call.body?.properties?.Category?.select?.name === 'Food') {
      once = false;
      const e = new Error('Temporary permission denial');
      e.status = 403;
      throw e;
    }
  };
  await t.run('saveLibraryIdea()');
  assert.ok(t.LIB.idea.pending);
  t.LIB.idea = structuredClone(t.local.get('material-workspace-v1').idea);
  await t.run('saveLibraryIdea()');
  assert.equal(t.LIB.idea.items.length, 2);
  assert.equal(t.LIB.idea.revision, 1);
  assert.equal(
    [...t.pages.values()].filter((p) => p.parent.database_id === t.cfg.placements).length,
    2
  );
});

test('lost final commit response verifies the whole save before acknowledging completion', async () => {
  const t = setup();
  t.add();
  let once = true;
  t.c.after = async (call) => {
    if (once && call.method === 'PATCH' && call.body?.properties?.Revision?.number === 1) {
      once = false;
      throw new Error('Lost final response');
    }
  };
  await t.run('saveLibraryIdea()');
  assert.ok(t.LIB.idea.pending);
  await t.run('saveLibraryIdea()');
  assert.equal(t.LIB.idea.pending, null);
  assert.equal(t.LIB.idea.revision, 1);
});

test('concurrent metadata and material edits are rejected before overwriting', async () => {
  const t = setup();
  t.add();
  await t.run('saveLibraryIdea()');
  t.LIB.idea.notes = 'My local changes';
  t.LIB.idea.dirty = true;
  const placement = t.pages.get(t.LIB.idea.items[0].pageId);
  placement.last_edited_time = 'external';
  placement.properties.Purpose = {
    rich_text: [{ text: { content: 'Edited directly in Notion' } }],
  };
  const before = t.calls.length;
  await t.run('saveLibraryIdea()');
  assert.ok(t.LIB.idea.pending);
  assert.match(t.element('idea-save-status').textContent, /Conflict/);
  assert.equal(t.calls.slice(before).filter((c) => c.method === 'PATCH').length, 0);
  assert.equal(t.text(placement.properties.Purpose), 'Edited directly in Notion');
});

test('deleted sources block new placements but saved snapshots reopen after source loss', async () => {
  const t = setup(),
    item = t.add();
  await t.run('saveLibraryIdea()');
  t.pages.delete(item.material.id);
  const reopened = await t.run('readLibraryIdea(LIB.idea.id)');
  assert.equal(reopened.items[0].material.name, 'Cooking in a van');
  t.LIB.idea = t.run('blankLibraryIdea()');
  t.LIB.idea.name = 'Another idea';
  t.LIB.idea.items = [{ ...item, placementId: webcrypto.randomUUID(), pageId: null }];
  await t.run('saveLibraryIdea()');
  assert.match(t.element('idea-save-status').textContent, /Missing page/);
});

test('selection is independent of filters and unknown numeric fields stay visible', () => {
  const t = setup();
  const a = t.add('prices', 'Known price'),
    b = t.add('prices', 'Unknown price');
  a.material.properties.Amount = { type: 'number', number: 300 };
  b.material.properties.Amount = { type: 'number', number: null };
  t.LIB.rows.prices = [a.material, b.material];
  t.LIB.selected[a.material.key] = a.material;
  t.LIB.filters = { category: 'prices', field: 'Amount', min: '400', max: '' };
  const filtered = t.run('filteredLibraryRows()');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].name, 'Unknown price');
  assert.equal(Object.keys(t.LIB.selected).length, 1);
  t.LIB.filters = { category: 'all', 'selected-only': true };
  assert.equal(t.run('filteredLibraryRows().length'), 1);
});

test('oversize evidence and duplicate placement identities fail before remote writes', async () => {
  const t = setup(),
    item = t.add();
  item.material.properties.huge = {
    type: 'rich_text',
    rich_text: [{ text: { content: 'x'.repeat(66000) } }],
  };
  await t.run('saveLibraryIdea()');
  assert.equal(t.calls.length, 0);
  assert.match(t.element('idea-save-status').textContent, /64 KiB/);
  delete item.material.properties.huge;
  t.LIB.idea.items.push(structuredClone(item));
  await t.run('saveLibraryIdea()');
  assert.equal(t.calls.length, 0);
  assert.match(t.element('idea-save-status').textContent, /Duplicate/);
});

test('read fails safely on corrupt snapshot rather than replacing a draft', async () => {
  const t = setup();
  t.add();
  await t.run('saveLibraryIdea()');
  const row = t.pages.get(t.LIB.idea.items[0].pageId);
  row.children = [];
  await assert.rejects(t.run('readLibraryIdea(LIB.idea.id)'), /snapshot is missing/);
  assert.equal(t.LIB.idea.items[0].material.name, 'Cooking in a van');
});

test('lost collection creation response resumes by the pending operation identity', async () => {
  const t = setup();
  t.add();
  let once = true;
  t.c.after = async (call) => {
    if (once && call.method === 'POST' && call.body?.parent?.database_id === t.cfg.collections) {
      once = false;
      throw new Error('Collection created but response lost');
    }
  };
  await t.run('saveLibraryIdea()');
  assert.equal(t.LIB.idea.id, null);
  assert.ok(t.LIB.idea.pending);
  await t.run('saveLibraryIdea()');
  assert.equal(t.LIB.idea.revision, 1);
  assert.equal(
    [...t.pages.values()].filter((p) => p.parent.database_id === t.cfg.collections).length,
    1
  );
});

test('pending saves remain visibly incomplete when reopened from another browser', async () => {
  const t = setup();
  t.add();
  t.c.before = async (call) => {
    if (call.body?.parent?.database_id === t.cfg.placements) {
      const e = new Error('Rejected');
      e.status = 403;
      throw e;
    }
  };
  await t.run('saveLibraryIdea()');
  const saved = await t.run('readLibraryIdea(LIB.idea.id)');
  assert.equal(saved.incomplete, true);
  assert.equal(saved.items.length, 0);
  t.LIB.idea = saved;
  t.run('renderLibraryIdea()');
  assert.equal(t.element('idea-save').disabled, true);
  assert.match(t.element('idea-recovery').innerHTML, /unfinished|earlier save|recovered/);
});

test('map coordinates reject guesses and out-of-range values; projection handles poles', () => {
  const { run } = setup();
  assert.equal(run("libCoordinates('Tokyo')"), null);
  assert.equal(run("libCoordinates('91, 138')"), null);
  assert.equal(run("libCoordinates('35, 181')"), null);
  assert.equal(run("libCoordinates('35, 138 extra')"), null);
  assert.equal(run("libCoordinates('35.210629499999996,138.2282452').lng"), 138.2282452);
  assert.equal(run("libCoordinates('0, 0').lat"), 0);
  assert.equal(run('libProject({lat:0,lng:0}).x'), 0.5);
  assert.equal(run('libProject({lat:0,lng:0}).y'), 0.5);
  assert.equal(run('Number.isFinite(libProject({lat:90,lng:180}).y)'), true);
});

test('dirty idea switching waits for an explicit decision and Escape-style close retains the draft', async () => {
  const { run, LIB } = setup();
  LIB.idea.dirty = true;
  LIB.idea.name = 'Keep this idea';
  LIB.ready = Promise.resolve();
  const cancelled = run('newLibraryIdea()');
  await new Promise(setImmediate);
  assert.equal(LIB.idea.name, 'Keep this idea');
  run("closeModal('idea-confirm-modal')");
  await cancelled;
  assert.equal(LIB.idea.name, 'Keep this idea');
  const accepted = run('newLibraryIdea()');
  await new Promise(setImmediate);
  run('finishIdeaConfirmation(true)');
  await accepted;
  assert.equal(LIB.idea.name, '');
});

test('map fitting keeps date-line neighbors together instead of spanning the world', () => {
  const { run, LIB, element, c } = setup();
  c.libraryMapPoints = () => [
    { x: 179 / 360 + 0.5, y: 0.5 },
    { x: -179 / 360 + 0.5, y: 0.5 },
  ];
  element('library-map-canvas').clientWidth = 900;
  element('library-map-canvas').clientHeight = 400;
  run('fitLibraryMap()');
  assert.ok(LIB.map.x < 0.01 || LIB.map.x > 0.99);
  assert.ok(LIB.map.z >= 8);
});

test('search reveals hidden-field matches and escapes highlighted content', () => {
  const t = setup(),
    item = t.add('research', 'A quiet town');
  item.material.properties.Detail = {
    type: 'rich_text',
    rich_text: [{ text: { content: 'A <script>market</script> opens early.' } }],
  };
  t.LIB.rows.research = [item.material];
  t.LIB.filters = { search: 'market' };
  assert.equal(t.run('filteredLibraryRows().length'), 1);
  assert.match(t.run('libMatchExcerpt(LIB.rows.research[0])'), /Detail/);
  assert.match(t.run('libMatchExcerpt(LIB.rows.research[0])'), /<mark>market<\/mark>/);
  assert.doesNotMatch(t.run('libMatchExcerpt(LIB.rows.research[0])'), /<script>/);
});

test('column filters and numeric ranges narrow rows without losing saved selection', () => {
  const t = setup(),
    a = t.add('prices', 'Admission'),
    b = t.add('prices', 'Tea');
  a.material.properties.Amount = { type: 'number', number: 500 };
  b.material.properties.Amount = { type: 'number', number: 100 };
  t.LIB.rows.prices = [a.material, b.material];
  t.LIB.selected[a.material.key] = a.material;
  t.LIB.filters = { category: 'prices', ranges: { Amount: { max: '200' } } };
  assert.equal(t.run('filteredLibraryRows()[0].name'), 'Tea');
  assert.equal(Object.keys(t.LIB.selected).length, 1);
  t.LIB.filters = { category: 'prices', columns: { Item: 'admission' } };
  assert.equal(t.run('filteredLibraryRows()[0].name'), 'Admission');
});

test('analysis resumes completed parts after timeout and after restoring checkpoints', async () => {
  const t = setup();
  let calls = 0,
    fail = true;
  t.c.runExtractChunk = async (text) => {
    calls++;
    if (fail && calls === 2) throw new Error('504');
    return { summary: text.slice(0, 1), research: [{ statement: text.slice(0, 1) }] };
  };
  t.c.transcript = 'A'.repeat(4000) + 'B'.repeat(4000) + 'C'.repeat(100);
  await assert.rejects(
    t.run("runExtractCall(transcript,'schema','guard',{key:'source:p1'})"),
    /504/
  );
  assert.equal(calls, 2);
  fail = false;
  const result = await t.run("runExtractCall(transcript,'schema','guard',{key:'source:p1'})");
  assert.equal(calls, 4);
  assert.equal(result.research.length, 3);
  await t.run("runExtractCall(transcript,'schema','guard',{key:'source:p1'})");
  assert.equal(calls, 4);
});

test('saving a completed analysis retries Notion without another model call', async () => {
  const t = setup(),
    item = t.add('activities', 'Source fixture'),
    S = t.run('S');
  const v = {
    id: item.material.id,
    title: 'Source',
    transcript: 'Transcript '.repeat(20),
    _breakdownUnsaved: true,
  };
  S.epQueue = [v];
  S.epSelected = new Set([0]);
  v.breakdown = t.run("composeBreakdown(S.epQueue[0],{summary:'Saved work'},{research:[]})");
  let aiCalls = 0;
  t.c.runExtractCall = async () => {
    aiCalls++;
    throw new Error('Should not call AI');
  };
  t.c.renderPrepList = () => {};
  t.c.renderExtractReview = () => {};
  await t.run('prepRunBreakdown(0)');
  assert.equal(aiCalls, 0);
  assert.equal(v._breakdownUnsaved, false);
  assert.ok(t.calls.some((c) => c.method === 'PATCH'));
});

test('fact-check saves a labelled AI finding automatically while leaving original claims intact', async () => {
  const t = setup(),
    item = t.add('research', 'A claim'),
    S = t.run('S');
  S.vlib = [
    {
      id: item.material.id,
      name: 'A claim',
      store: 'research',
      fields: 'Context',
      lastEdited: item.material.lastEdited,
    },
  ];
  S._vlibSkip = new Set();
  t.c._verifyBatch = async () => ({
    verified: [
      {
        name: 'A claim',
        verdict: 'confirmed',
        source_url: 'https://example.org/evidence',
        note: 'Read this source.',
      },
    ],
  });
  t.c.confirmIdeaChange = async () => true;
  await t.run('runLibVerify()');
  assert.equal(t.calls.filter((c) => c.method === 'PATCH').length, 1);
  assert.equal(S.vlib[0]._aiPending, null);
  t.c.fact = S.vlib[0];
  const record = t.run('checkRecord(fact)');
  assert.equal(record.ai.verdict, 'confirmed');
  assert.equal(record.review, undefined);
  assert.equal(t.text(t.pages.get(item.material.id).properties.Statement), 'A claim');
  assert.match(t.element('vlib-results').innerHTML, /Supported/);
  assert.match(t.element('vlib-results').innerHTML, /Read this source/);
  assert.match(t.element('vlib-results').innerHTML, /Not reviewed · optional/);
});

test('one failed batch is split into smaller batches so only the claim that keeps failing stops and later groups still run', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 6 }, (_, i) => ({
    id: t.add('research', `Claim ${i}`).material.id,
    name: `Claim ${i}`,
    store: 'research',
    fields: 'Context',
  }));
  S._vlibSkip = new Set();
  const batches = [];
  t.c._verifyBatch = async (_store, items) => {
    batches.push(items.map((item) => item.name).join(' + '));
    if (items.some((item) => item.name === 'Claim 2')) {
      throw new Error('Your prepayment credits are depleted.');
    }
    return {
      verified: items.map((item) => ({
        name: item.name,
        verdict: 'unsupported',
        note: 'Needs investigation',
      })),
    };
  };
  t.c.confirmIdeaChange = async () => true;
  await t.run('runLibVerify()');
  // Batches run in parallel now, so the order of one batch's split retries
  // relative to another batch is not fixed. The set of requests is.
  assert.deepEqual(
    [...batches].sort(),
    [
      'Claim 0 + Claim 1 + Claim 2 + Claim 3',
      'Claim 0 + Claim 1',
      'Claim 2 + Claim 3',
      'Claim 2',
      'Claim 3',
      'Claim 4 + Claim 5',
    ].sort()
  );
  assert.equal(S.vlib.filter((r) => r._newStatus).length, 5);
  assert.deepEqual(
    S.vlib.filter((r) => r._retry).map((r) => r.name),
    ['Claim 2'],
    'only the claim that failed on its own is marked unfinished'
  );
  assert.match(S.vlib[2]._checkError, /prepayment credits are depleted/);
  assert.equal(t.calls.filter((c) => c.method === 'PATCH').length, 5);
  const status = t.element('verify-save-status').textContent;
  assert.match(status, /Checked 6 · saved 5 · 1 couldn't be checked/);
  assert.doesNotMatch(status, /not started/, 'zeroes are not reported');
  assert.match(status, /1 claims are still ticked/);
  assert.doesNotMatch(status, /Stopped:/);
});

test('reviewed checks reject newer source versions and retain the proposal', async () => {
  const t = setup(),
    item = t.add('research', 'A claim'),
    S = t.run('S');
  S.vlib = [
    {
      id: item.material.id,
      name: 'A claim',
      store: 'research',
      lastEdited: 'old',
      _proposal: { verdict: 'confirmed', source_url: 'https://example.org', note: 'Evidence' },
    },
  ];
  t.c.key = item.material.id;
  await t.run("saveVerdictProposal(key,document.getElementById('save'))");
  assert.equal(t.calls.filter((c) => c.method === 'PATCH').length, 0);
  assert.ok(S.vlib[0]._proposal);
  assert.match(t.element('verify-save-status').textContent, /changed/);
});

test('pasted transcripts reject oversized input without truncation or writes', async () => {
  const t = setup(),
    S = t.run('S');
  S.epQueue = [{ id: 'source', transcript: 'Original transcript' }];
  t.element('prep-paste-box-0').value = 'a'.repeat(190001);
  await t.run('prepUsePasted(0)');
  assert.equal(S.epQueue[0].transcript, 'Original transcript');
  assert.equal(t.calls.length, 0);
});

test('shared column filters support exact categories, multi-select, numeric and date ranges', () => {
  const t = setup();
  assert.equal(t.run("tableValueMatches('Tokyo','tok','text')"), true);
  assert.equal(t.run("tableValueMatches('Tokyo','tok','select')"), false);
  assert.equal(t.run("tableValueMatches(['Food','Culture'],'Culture','multi_select')"), true);
  assert.equal(t.run("tableValueMatches('30',{min:'20',max:'40'},'number')"), true);
  assert.equal(t.run("tableValueMatches('3',{min:'20'},'number')"), false);
  assert.equal(t.run("tableValueMatches('Unknown',{min:'20'},'number')"), true);
  assert.equal(
    t.run("tableValueMatches('2026-09-12',{min:'2026-09-01',max:'2026-09-30'},'date')"),
    true
  );
  assert.equal(t.run("tableValueMatches('2025-09-12',{min:'2026-09-01'},'date')"), false);
});

test('a manual review cannot save a default or absent judgement', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = [
    {
      id: 'source',
      name: 'A claim',
      store: 'research',
      _proposal: { verdict: '', source_url: '', note: '' },
    },
  ];
  await t.run("saveVerdictProposal('source',document.getElementById('save'))");
  assert.equal(t.calls.length, 0);
  assert.match(t.element('fact-review-error').textContent, /Choose a judgement/);
  assert.ok(S.vlib[0]._proposal);
});

test('renaming a new place retains its selection and cannot rename an existing original', () => {
  const t = setup(),
    S = t.run('S');
  S.extractedPlaces = [{ name: 'Old name' }, { name: 'Existing', is_existing: true }];
  S.placeSkip = new Set(['old name']);
  t.run("editPlaceName(0,'New name');editPlaceName(1,'Changed')");
  assert.equal(S.extractedPlaces[0].name, 'New name');
  assert.ok(S.placeSkip.has('new name'));
  assert.equal(S.placeSkip.has('old name'), false);
  assert.equal(S.extractedPlaces[1].name, 'Existing');
});

test('duplicate review starts with no archive selection and blocks stale originals', async () => {
  const t = setup(),
    item = t.add('research', 'A short claim'),
    S = t.run('S');
  S.vlib = [
    {
      id: item.material.id,
      store: 'research',
      name: 'A short claim',
      fields: 'Evidence',
      lastEdited: item.material.lastEdited,
    },
  ];
  t.run('tidyVlib()');
  assert.equal(S._vlibArch.size, 0);
  S._vlibArch.add(item.material.id);
  S._vlibConfirm = true;
  t.pages.get(item.material.id).last_edited_time = '2099-01-01T00:00:00.000Z';
  await t.run("archiveVlib(document.getElementById('archive'))");
  assert.equal(t.calls.filter((c) => c.method === 'PATCH').length, 0);
  assert.equal(S.vlib.length, 1);
});

test('Places extraction uses the Places route with one model attempt', async () => {
  const t = setup(),
    S = t.run('S');
  S.routing = {
    places: { provider: 'deepseek', model: 'configured-places-model' },
    outline: { provider: 'openai', model: 'different-outline-model' },
  };
  let captured;
  t.c.aiRun = async (task, request) => {
    captured = { task, request };
    return { text: '{"places":[]}' };
  };
  await t.run(
    "runExtractCall('A transcript about a place','shape','guard',{key:'places-test',task:'places'})"
  );
  assert.equal(captured.task, 'places');
  assert.equal(captured.request.model, undefined);
  assert.equal(captured.request.provider, undefined);
  assert.equal(captured.request.singleAttempt, true);
});

test('routing without a loaded saved block never pretends to persist or changes active choices', async () => {
  const t = setup(),
    S = t.run('S');
  S.routing = { dialogue: { provider: 'example', model: 'saved-model' } };
  S.routingBlockId = null;
  await t.run('saveRouting()');
  assert.equal(t.calls.length, 0);
  assert.equal(S.routing.dialogue.model, 'saved-model');
  assert.match(t.element('routing-save-status').textContent, /have not been saved/);
});

// Stage 3 and Plan read every page. A fixed page_size made the video picker and
// the gap analysis look complete while quietly hiding rows past the first page.
test('promoted source videos are read past the first page', async () => {
  const t = setup(),
    S = t.run('S');
  const pageOf = (titles, more) => ({
    results: titles.map((title) => ({
      id: `v-${title}`,
      properties: { 'Video Title': { title: [{ plain_text: title }] } },
    })),
    has_more: more,
    next_cursor: more ? 'cursor-2' : null,
  });
  let calls = 0;
  t.c.notionAPI = async (endpoint) => {
    if (!/^databases\/.+\/query$/.test(endpoint)) throw new Error(`Unhandled ${endpoint}`);
    calls++;
    return calls === 1 ? pageOf(['First page video'], true) : pageOf(['Second page video'], false);
  };
  await t.run('loadTranscriptVideos()');
  assert.equal(calls, 2, 'the read follows the cursor instead of stopping at page one');
  assert.deepEqual(JSON.parse(JSON.stringify(Object.keys(S.transcriptVideos))), [
    'v-First page video',
    'v-Second page video',
  ]);
});

test('the gap analysis sees episodes beyond the first page', async () => {
  const t = setup();
  const episodeDb = `databases/${t.run('DB_IDS.episodes')}/query`;
  let episodeCalls = 0;
  let prompt = '';
  t.c.notionAPI = async (endpoint) => {
    if (endpoint === episodeDb) {
      episodeCalls++;
      return episodeCalls === 1
        ? {
            results: [
              { properties: { 'Episode Title': { title: [{ plain_text: 'Episode one' }] } } },
            ],
            has_more: true,
            next_cursor: 'cursor-2',
          }
        : {
            results: [
              { properties: { 'Episode Title': { title: [{ plain_text: 'Episode fifty-one' }] } } },
            ],
            has_more: false,
          };
    }
    if (/^databases\/.+\/query$/.test(endpoint))
      return {
        results: [{ properties: { Name: { title: [{ plain_text: 'Somewhere' }] } } }],
        has_more: false,
      };
    throw new Error(`Unhandled ${endpoint}`);
  };
  t.c.buildDNASystem = () => 'dna';
  t.c.aiRun = async (_task, req) => {
    prompt = req.messages[0].content;
    return { text: 'ok' };
  };
  await t.run('runGapAnalysis()');
  assert.equal(episodeCalls, 2, 'episodes are read past the first page');
  assert.ok(prompt.includes('Episode fifty-one'), 'the analysis is given the later page');
  assert.ok(prompt.includes('(2)'), 'and it knows how many episodes it saw');
});

test('the script check no longer prints a tick it could never earn', async () => {
  const t = setup(),
    S = t.run('S');
  S.dna = {};
  S.confirmedPlaces = [];
  S.sections = [
    { id: 's1', title: 'Intro', type: 'Intro', duration: 2, dialogue: 'KAI: One\nMIA: Two' },
  ];
  t.run('runScriptCheck()');
  const html = t.element('script-check-results').innerHTML;
  assert.doesNotMatch(html, /reused from a past episode/, 'the dead check is gone');
  assert.doesNotMatch(
    html,
    /No confirmed places flagged/,
    'and it can no longer report a pass nothing verified'
  );
  assert.match(html, /checks passed|checks need a look/, 'the remaining checks still report');
});

test('a failed transcript save can be recovered for review without replacing saved text or fetching', async () => {
  const t = setup(),
    S = t.run('S');
  const draft = 'A locally retained transcript with enough text for review.';
  S.epQueue = [{ id: 'source', transcript: 'Original transcript' }];
  t.c.renderPrepList = () => {};
  t.c.notionAPI = async () => {
    throw new Error('Network unavailable');
  };
  t.element('prep-paste-box-0').value = draft;
  await t.run('prepUsePasted(0)');
  assert.equal(await t.c.localArtifact('transcript-draft:source'), draft);
  S.epQueue[0] = {
    id: 'source',
    transcript: 'Newer saved transcript',
    _transcriptDraft: await t.c.localArtifact('transcript-draft:source'),
  };
  t.element('prep-paste-box-0').value = '';
  t.run('recoverTranscriptDraft(0)');
  assert.equal(t.element('prep-paste-box-0').value, draft);
  assert.equal(S.epQueue[0].transcript, 'Newer saved transcript');
  assert.match(t.element('prep-status-0').textContent, /review/);
});

test('updating an existing place preserves saved fields when extraction has no accepted location', async () => {
  const t = setup(),
    item = t.add('places', 'A lake'),
    S = t.run('S'),
    page = t.pages.get(item.material.id);
  page.properties.Address = {
    type: 'rich_text',
    rich_text: [{ text: { content: 'Verified address' } }],
  };
  page.properties.Coordinates = { type: 'rich_text', rich_text: [{ text: { content: '35,138' } }] };
  page.properties.Type = { type: 'select', select: { name: 'Lake' } };
  S.extractedPlaces = [
    {
      name: 'A lake',
      type: 'Other',
      prefecture: 'Unknown',
      is_existing: true,
      existing_id: page.id,
      existingLastEdited: page.last_edited_time,
      fromIds: [],
      from: [],
    },
  ];
  S.placeSkip = new Set();
  await t.run('saveConfirmedPlaces()');
  const patch = t.calls.find((c) => c.method === 'PATCH');
  assert.ok(patch);
  assert.equal(patch.body.properties.Address, undefined);
  assert.equal(patch.body.properties.Coordinates, undefined);
  assert.equal(patch.body.properties.Type, undefined);
  assert.equal(patch.body.properties['Last Verified'], undefined);
  assert.equal(t.text(page.properties.Address), 'Verified address');
});

test('manual fact checks require evidence before confirming and cause no AI calls', async () => {
  const t = setup(),
    item = t.add('research', 'Claim'),
    S = t.run('S');
  S.vlib = [
    {
      id: item.material.id,
      name: 'Claim',
      store: 'research',
      lastEdited: item.material.lastEdited,
    },
  ];
  t.c.key = item.material.id;
  await t.run('startManualVerdict(key)');
  t.run("editVerdictProposal(key,'verdict','confirmed')");
  await t.run("saveVerdictProposal(key,document.getElementById('save'))");
  assert.equal(t.calls.length, 0);
  assert.match(t.element('verify-save-status').textContent, /source URL/);
});

test('external chat import requires a reviewed unchanged source and result', async () => {
  const t = setup(),
    item = t.add(),
    S = t.run('S');
  S.epQueue = [{ id: item.material.id, transcript: 'A source transcript long enough for review.' }];
  t.run('openExtractionChat(0)');
  t.element('extract-chat-result').value = JSON.stringify({ summary: 'A summary', activities: [] });
  t.run('reviewExtractionChat()');
  S.epQueue[0].transcript = 'Changed transcript';
  await t.run('useExtractionChat()');
  assert.equal(t.calls.length, 0);
  assert.match(t.element('extract-chat-review').textContent, /changed/);
});

test('candidate identity retains same-title observations and source provenance', () => {
  const t = setup(),
    S = t.run('S');
  S.webExtract = {
    prices: [
      { item: 'Shower', amount: 300, source_url: 'https://example.com/a' },
      { item: 'Shower', amount: 500, source_url: 'https://example.com/a' },
      { item: 'Shower', amount: 300, source_url: 'https://example.com/b' },
      { item: 'Shower', amount: 300, source_url: 'https://example.com/a' },
    ],
  };
  const pool = t.run("poolFor('prices','web')");
  assert.equal(pool.length, 3);
  assert.equal(new Set(pool.map((it) => it._key)).size, 3);
});

test('story beats, advice and translated quotes become reviewable source material', () => {
  const t = setup();
  t.c.v = {
    id: 'source-1',
    title: 'A journey',
    url: 'https://example.com/video',
    transcript: 'source',
  };
  const result = t.run(
    "composeBreakdown(v,{beats:[{moment:'Unexpected fog'}],tips:['Start early'],quotes:[{text:'Space between',original_text:'間',timestamp:'02:10'}]},{research:[]})"
  );
  assert.equal(result.research.length, 3);
  assert.equal(result.research[2].original_text, '間');
  assert.equal(result.research[2].source_page_id, 'source-1');
  assert.equal(result.research[2].needs_verification, true);
});

function candidateSetup() {
  const t = setup();
  t.run('renderReviewInto=()=>{}');
  t.run(
    "S.webExtract={glossary:[{term:'Ma',meaning:'Space between',source_url:'https://example.com/source',source_excerpt:'Original passage',timestamp:'02:10'}]}"
  );
  t.c.candidate = t.run("poolFor('glossary','web')[0]");
  return t;
}

test('pending candidates never create records; accepted candidates retain receipt and original wording', async () => {
  const t = candidateSetup();
  await t.run("saveAcceptedMaterial('web',null,'glossary')");
  assert.equal(t.calls.length, 0);
  t.run(
    "REVIEW.edits[candidate._key]={meaning:'Reviewed meaning'};REVIEW.decisions[candidate._key]='accepted'"
  );
  await t.run("saveAcceptedMaterial('web',null,'glossary')");
  assert.equal(t.calls.filter((c) => c.endpoint === 'pages').length, 1);
  t.c.saved = [...t.pages.values()][0];
  const evidence = t.run('materialEvidence(saved.children)');
  assert.equal(evidence.observation.meaning, 'Reviewed meaning');
  assert.equal(t.text(t.c.saved.properties.English), 'Reviewed meaning');
  assert.equal(evidence.original.meaning, 'Space between');
  assert.equal(evidence.observation.source_url, 'https://example.com/source');
  assert.equal(evidence.observation.timestamp, '02:10');
  assert.equal(t.run("poolFor('glossary','web').length"), 0);
});

test('a lost create response is reconciled by evidence on retry without a duplicate', async () => {
  const t = candidateSetup();
  t.run("REVIEW.decisions[candidate._key]='accepted'");
  let fail = true;
  t.c.after = async (call) => {
    if (call.endpoint === 'pages' && fail) {
      fail = false;
      throw new Error('Response lost');
    }
  };
  await t.run("saveAcceptedMaterial('web',null,'glossary')");
  assert.equal(t.pages.size, 1);
  assert.equal(t.run("poolFor('glossary','web').length"), 1);
  await t.run("saveAcceptedMaterial('web',null,'glossary')");
  assert.equal(t.pages.size, 1);
  assert.equal(t.calls.filter((c) => c.endpoint === 'pages').length, 1);
  assert.equal(t.run("poolFor('glossary','web').length"), 0);
  assert.equal(t.run('S._pushErrors.glossary'), undefined);
});

test('read-back 404 after creation retains the uncertain-save marker', async () => {
  const t = candidateSetup();
  t.run("REVIEW.decisions[candidate._key]='accepted'");
  t.c.before = async (call) => {
    if (call.endpoint.startsWith('blocks/')) {
      const e = new Error('Read unavailable');
      e.status = 404;
      throw e;
    }
  };
  await t.run("saveAcceptedMaterial('web',null,'glossary')");
  assert.equal(t.pages.size, 1);
  assert.equal(
    [...t.local.entries()].some(([k, v]) => k.startsWith('material-create-v2:') && !!v),
    true
  );
  t.c.before = null;
  await t.run("saveAcceptedMaterial('web',null,'glossary')");
  assert.equal(t.calls.filter((c) => c.endpoint === 'pages').length, 1);
});

test('a rejected create can be retried and a legacy same-title record is preserved', async () => {
  const t = candidateSetup();
  const legacy = t.add('glossary', 'Ma');
  t.run("REVIEW.decisions[candidate._key]='accepted'");
  let fail = true;
  t.c.before = async (call) => {
    if (call.endpoint === 'pages' && fail) {
      fail = false;
      const e = new Error('Rejected');
      e.status = 400;
      throw e;
    }
  };
  await t.run("saveAcceptedMaterial('web',null,'glossary')");
  assert.equal(t.pages.size, 1);
  await t.run("saveAcceptedMaterial('web',null,'glossary')");
  assert.equal(t.pages.size, 2);
  assert.ok(t.pages.has(legacy.material.id));
});

test('unverified place suggestions do not invent country or verification date', () => {
  const t = setup();
  const p = t.run("RESEARCH_STORES.places.props({name:'A lake'})");
  assert.equal(p.Country, undefined);
  assert.equal(p['Last Verified'], undefined);
  assert.doesNotMatch(p['Google Maps URL'].url, /Japan/);
});

test('review decisions, edits and unfinished form drafts restore without selecting rows', async () => {
  const t = candidateSetup();
  t.run(
    "REVIEW.decisions[candidate._key]='accepted';REVIEW.edits[candidate._key]={meaning:'Edited'};REVIEW.drafts[candidate._key]={meaning:'Unfinished'}"
  );
  await t.run('persistReviews()');
  t.run('REVIEW.loaded=false;REVIEW.decisions={};REVIEW.edits={};REVIEW.drafts={}');
  await t.run('restoreReviews()');
  assert.equal(t.run('REVIEW.decisions[candidate._key]'), 'accepted');
  assert.equal(t.run('REVIEW.drafts[candidate._key].meaning'), 'Unfinished');
  assert.equal(t.run('REVIEW.selected'), undefined);
});

test('cancelling a paid fact-check scope confirmation makes no request', async () => {
  const t = setup();
  t.run("S.vlib=[{id:'claim',store:'research',name:'Claim'}];S._vlibSkip=new Set()");
  let requested = false;
  t.c._verifyBatch = async () => {
    requested = true;
  };
  t.c.confirmIdeaChange = async () => false;
  await t.run('runLibVerify()');
  assert.equal(requested, false);
  assert.equal(t.run('_libVerifying'), false);
});

test('editing one material field preserves unrelated rich text and sends only changed properties', async () => {
  const t = setup(),
    item = t.add('activities', 'A walk');
  t.LIB.rows.activities = [item.material];
  t.c.editRow = item.material;
  t.run(
    "materialEdit={row:editRow,fields:{Activity:'Morning walk','Source URL':'https://youtube.com/watch?v=example'}};renderMaterialLibrary=()=>{};openLibraryDetail=()=>{}"
  );
  await t.run("saveMaterialEdit(document.getElementById('edit-save'))");
  const patch = t.calls.find((c) => c.method === 'PATCH');
  assert.deepEqual(Object.keys(patch.body.properties), ['Activity']);
  assert.equal(t.LIB.rows.activities[0].name, 'Morning walk');
});

test('a newer original blocks material editing and leaves the recovery draft intact', async () => {
  const t = setup(),
    item = t.add('activities', 'A walk');
  t.LIB.rows.activities = [item.material];
  t.c.editRow = item.material;
  t.pages.get(item.material.id).last_edited_time = '2026-09-13T10:00:00.000Z';
  t.run("materialEdit={row:editRow,fields:{Activity:'Morning walk'}}");
  await t.c.localArtifact(`material-edit:${item.material.id}`, {
    baseEdited: item.material.lastEdited,
    fields: { Activity: 'Morning walk' },
  });
  await t.run("saveMaterialEdit(document.getElementById('edit-save'))");
  assert.equal(
    t.calls.some((c) => c.method === 'PATCH'),
    false
  );
  assert.match(t.element('material-edit-status').textContent, /Original changed/);
  assert.equal(t.local.get(`material-edit:${item.material.id}`).fields.Activity, 'Morning walk');
});

test('place review edits, selection and accepted location survive local recovery', async () => {
  const t = setup();
  t.run(
    "S.extractedPlaces=[{name:'A lake',prefecture:'Unknown',_acceptedMaps:true,lat:35,lng:138,_editedFields:new Set(['halal'])}];S.placeSkip=new Set(['a lake'])"
  );
  await t.run('retainPlacesReview()');
  t.run('S.extractedPlaces=[];S.placeSkip=new Set();renderPlacesReview=()=>{}');
  await t.run('restorePlacesReview()');
  assert.equal(t.run('S.extractedPlaces[0]._acceptedMaps'), true);
  assert.equal(t.run("S.extractedPlaces[0]._editedFields.has('halal')"), true);
  assert.equal(t.run("S.placeSkip.has('a lake')"), true);
});

test('opening location work from a URL-only material does not treat its URL as a Notion relation', () => {
  const t = setup(),
    item = t.add('places', 'A lake');
  t.LIB.rows.places = [item.material];
  t.LIB.detailKey = item.material.key;
  t.run('switchTab=()=>{};renderPlacesReview=()=>{};closeLibraryDetail=()=>{};matchCurrentPlace()');
  assert.equal(t.run('S.extractedPlaces[0].existing_id'), item.material.id);
  assert.equal(t.run('S.extractedPlaces[0].fromIds.length'), 0);
  assert.equal(t.calls.length, 0);
});

function videoReviewSetup() {
  const t = setup();
  t.run(
    "buildDNASystem=()=>'';renderYTVideos=()=>{};S.ytVideos=[{id:'abcdefghijk',url:'https://youtube.com/watch?v=abcdefghijk',title:'A quiet morning',channelName:'Test channel',description:'Morning tea',contentType:[],angle:''},{id:'lmnopqrstuv',url:'https://youtu.be/lmnopqrstuv',title:'A mountain road',channelName:'Test channel',description:'Fog on a mountain road',contentType:[],angle:''}];S.ytSelected=new Set([0,1]);S.existingVideoIds=new Set()"
  );
  return t;
}

test('angle failure stays an error, stops the batch and cannot be saved as content', async () => {
  const t = videoReviewSetup();
  let calls = 0;
  t.c.aiRun = async () => {
    calls++;
    throw new Error('Set APP_PASSWORD in the server environment');
  };
  await t.run('openReviewModal()');
  assert.equal(calls, 1);
  assert.equal(t.run('S._reviewVideos[0].angle'), '');
  assert.match(t.run('S._reviewVideos[0]._angleError'), /APP_PASSWORD/);
  assert.match(t.run('S._reviewVideos[1]._angleError'), /Not requested/);
  assert.equal(t.element('source-video-save').disabled, true);
  await t.run('pushToNotion()');
  assert.equal(
    t.calls.some((c) => c.endpoint === 'pages'),
    false
  );
});

test('angle generation validates output and uses a bounded single attempt', async () => {
  const t = videoReviewSetup();
  t.run('S.ytSelected=new Set([0])');
  let request;
  t.c.aiRun = async (task, body) => {
    request = { task, body };
    return { text: '{"summary":"No angle"}' };
  };
  await t.run('openReviewModal()');
  assert.equal(request.task, 'angle');
  assert.equal(request.body.singleAttempt, true);
  assert.equal(request.body.maxTokens, 600);
  assert.match(t.run('S._reviewVideos[0]._angleError'), /did not contain an angle/);
  assert.equal(t.run('S._reviewVideos[0].angle'), '');
});

test('successful video save immediately marks thumbnails known and retries only failed saves without AI', async () => {
  const t = videoReviewSetup();
  let aiCalls = 0;
  t.c.aiRun = async () => {
    aiCalls++;
    return { text: '{"angle":"A useful inspiration","content_type":"Road Trip","country":""}' };
  };
  await t.run('openReviewModal()');
  let reject = true;
  t.c.before = async (call) => {
    if (
      call.endpoint === 'pages' &&
      t.text(call.body.properties['Video Title']) === 'A mountain road' &&
      reject
    ) {
      reject = false;
      const e = new Error('Save rejected');
      e.status = 400;
      throw e;
    }
  };
  await t.run('pushToNotion()');
  assert.equal(t.run("S.existingVideoIds.has('abcdefghijk')"), true);
  assert.equal(t.run("S.existingVideoIds.has('lmnopqrstuv')"), false);
  assert.equal(t.run('S.ytSelected.has(0)'), false);
  assert.equal(t.run('S.ytSelected.has(1)'), true);
  assert.match(t.run('S._reviewVideos[1]._sourceSaveError'), /Save rejected/);
  await t.run('pushToNotion()');
  assert.equal(t.pages.size, 2);
  assert.equal(aiCalls, 2);
  assert.equal(t.run('S.ytSelected.size'), 0);
  assert.equal(t.run('S.existingVideoIds.size'), 2);
  assert.ok([...t.pages.values()].every((p) => !p.properties.Country));
});

test('a lost video-save response reconciles its YouTube ID before retrying creation', async () => {
  const t = videoReviewSetup();
  t.run("S._reviewVideos=S.ytVideos;S._reviewVideos.forEach(v=>v.angle='Reviewed angle')");
  let lost = true;
  t.c.after = async (call) => {
    if (call.endpoint === 'pages' && lost) {
      lost = false;
      throw new Error('Response lost');
    }
  };
  await t.run('pushToNotion()');
  assert.equal(t.pages.size, 2);
  assert.equal(t.run('S._reviewVideos[0]._sourceSaved'), undefined);
  await t.run('pushToNotion()');
  assert.equal(t.pages.size, 2);
  assert.equal(t.calls.filter((c) => c.endpoint === 'pages').length, 2);
  assert.equal(t.run('S._reviewVideos[0]._sourceSaved'), true);
});

test('known source reload errors retain previous saved markers and no save proceeds unchecked', async () => {
  const t = videoReviewSetup();
  t.run(
    "S.existingVideoIds.add('abcdefghijk');S._reviewVideos=[S.ytVideos[1]];S._reviewVideos[0].angle='Reviewed angle'"
  );
  t.c.before = async () => {
    throw new Error('Source lookup unavailable');
  };
  await t.run('loadExistingSourceVideoIds()');
  assert.equal(t.run("S.existingVideoIds.has('abcdefghijk')"), true);
  await t.run('pushToNotion()');
  assert.equal(
    t.calls.some((c) => c.endpoint === 'pages'),
    false
  );
  assert.match(t.element('source-video-review-status').textContent, /No new records/);
});

test('source ID matching handles watch, short, live and embed links without matching lookalike hosts', () => {
  const t = setup();
  for (const url of [
    'https://youtube.com/watch?v=abcdefghijk&t=5',
    'https://youtu.be/abcdefghijk',
    'https://www.youtube.com/shorts/abcdefghijk',
    'https://youtube.com/live/abcdefghijk',
    'https://youtube-nocookie.com/embed/abcdefghijk',
  ]) {
    t.c.url = url;
    assert.equal(t.run('sourceYouTubeID(url)'), 'abcdefghijk');
  }
  assert.equal(
    t.run("sourceYouTubeID('https://youtube.com.evil.example/watch?v=abcdefghijk')"),
    ''
  );
});

test('Maps distinguishes service failure from no match and retains successful candidates', async () => {
  const t = setup(),
    S = t.run('S');
  S.extractedPlaces = [
    { name: 'Market', prefecture: 'Unknown' },
    { name: 'Park', prefecture: 'Unknown' },
  ];
  let calls = 0;
  t.c._afetch = async () =>
    ++calls === 1
      ? { ok: false, status: 503, json: async () => ({ error: 'Configuration missing' }) }
      : { ok: true, json: async () => ({ found: true, name: 'Park' }) };
  await assert.rejects(
    t.run('enrichPlacesFromMaps()'),
    /1 map candidates retained; 1 lookups failed/
  );
  assert.match(S.extractedPlaces[0]._mapsError, /Configuration/);
  assert.equal(S.extractedPlaces[1].mapsCandidate.name, 'Park');
  t.c._afetch = async () => ({ ok: true, json: async () => ({ found: false }) });
  assert.equal(await t.run('enrichPlacesFromMaps()'), 0);
  assert.equal(S.extractedPlaces[0]._mapsError, undefined);
  t.c._afetch = async () => ({ ok: true, json: async () => ({ found: false, reason: 'no_key' }) });
  await assert.rejects(t.run('enrichPlacesFromMaps()'), /not configured/);
});

test('YouTube errors cannot be reported as successful empty discovery results', async () => {
  const t = setup(),
    S = t.run('S'),
    messages = [];
  S.keys.youtube = true;
  S.channels = ['Example'];
  S.ytSelected = new Set();
  t.c.document.querySelectorAll = () => [{ dataset: { ch: '0' } }];
  t.c._afetch = async () => ({
    ok: false,
    status: 403,
    json: async () => ({ error: { message: 'Quota exhausted' } }),
  });
  t.c.toast = (message, type) => messages.push({ message, type });
  await t.run('fetchYouTube()');
  assert.ok(messages.some((m) => m.type === 'error' && /Quota exhausted/.test(m.message)));
  assert.equal(
    messages.some((m) => m.type === 'success'),
    false
  );
  assert.equal(t.element('yt-fetch-btn').disabled, false);
});

test('a provider-wide failure stops the run instead of repeating it for every claim', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 9 }, (_, i) => ({
    id: `row-${i}`,
    store: 'research',
    name: `Claim ${i}`,
    fields: 'Context',
  }));
  S._vlibSkip = new Set();
  t.c.confirmIdeaChange = async () => true;
  let calls = 0;
  t.c._verifyBatch = async () => {
    calls++;
    throw Object.assign(new Error('Configuration missing'), { status: 503 });
  };
  await t.run('runLibVerify()');
  // This used to retry every claim as pairs and then singles, so the whole
  // selection was attempted. A provider-wide failure now stops the run: the
  // same global error would just repeat, and the operator learns nothing new
  // from seeing it once per claim.
  assert.ok(calls < 15, `expected an early stop, saw ${calls} requests`);
  assert.equal(S._vlibSkip.size, 0);
  assert.match(t.element('verify-save-status').textContent, /Stopped after/);
  assert.ok(
    S.vlib.some((r) => r._retry && /provider failed repeatedly/.test(r._checkError)),
    'the claims sent while the provider was failing carry the reason'
  );
  assert.ok(
    S.vlib.some((r) => !S._vlibSkip.has(r.id)),
    'claims with no finding stay ticked for another run'
  );
  assert.equal(t.run('_libVerifying'), false);
  assert.equal(t.calls.length, 0);
  assert.match(t.element('vlib-results').innerHTML, /Configuration missing/);
  const status = t.element('verify-save-status').textContent;
  assert.match(status, /saved 0/);
  assert.match(status, /Stopped: Stopped after/);
  assert.match(status, /9 claims are still ticked/);
});

test('transcript save failure retains text and retries saving without fetching again', async () => {
  const t = setup();
  t.element('yt-transcript-url').value = 'https://youtube.com/watch?v=abcdefghijk';
  t.element('transcript-video-select').value = 'source';
  let fetches = 0,
    writes = 0;
  t.c._afetch = async () => {
    fetches++;
    return { ok: true, json: async () => ({ text: 'Transcript text', source: 'fixture' }) };
  };
  t.c.notionAPI = async () => {
    if (++writes === 1) throw new Error('Notion unavailable');
    return { id: 'source' };
  };
  await t.run('fetchTranscript()');
  assert.equal(t.element('transcript-input').value, 'Transcript text');
  assert.match(t.element('transcript-save-status').textContent, /loaded, but not saved/);
  assert.equal(t.element('transcript-save-btn').disabled, false);
  await t.run('saveTranscriptToNotion()');
  assert.equal(fetches, 1);
  assert.equal(writes, 2);
  assert.match(t.element('transcript-save-status').textContent, /saved to Notion/);
});

test('a newly generated handoff clears the previous saved receipt even if local storage fails', async () => {
  const t = setup(),
    S = t.run('S');
  S.activeEpisode = 'Episode';
  S.sections = [{ id: 'section', locked: true, dialogue: 'Kai: Hello', title: 'Intro' }];
  t.element('handoff-saved-notice').style.display = '';
  t.element('handoff-saved-notice').textContent = 'Old handoff saved';
  t.c.aiRun = async () => ({
    text: JSON.stringify(
      Object.fromEntries(
        [
          'overview',
          'places',
          'sections',
          'canva',
          'thumbnail',
          'capcut',
          'youtube_title_1',
          'youtube_title_2',
          'youtube_description',
        ]
          .map((k) => [k, `New ${k}`])
          .concat([['youtube_tags', ['tag']]])
      )
    ),
  });
  t.c.localArtifact = async () => {
    throw new Error('Device storage unavailable');
  };
  await t.run('generateHandoff()');
  assert.equal(S.handoffPage, null);
  assert.equal(t.element('handoff-saved-notice').style.display, 'none');
  assert.equal(t.element('handoff-doc').style.display, '');
  assert.equal(S.handoffDoc.overview, 'New overview');
});

test('source capture retains an uncertain HTTP 408 create and blocks blind replay', async () => {
  const t = setup();
  t.element('capture-title').value = 'Video';
  t.element('capture-url').value = 'https://youtube.com/watch?v=abcdefghijk';
  let creates = 0;
  t.c.notionAPI = async (endpoint) => {
    if (endpoint.startsWith('databases/')) return { results: [], has_more: false };
    creates++;
    throw Object.assign(new Error('Request timeout'), { status: 408 });
  };
  await t.run('captureSource(document.getElementById("capture-button"))');
  assert.ok(t.local.get('capture-source:https://youtube.com/watch?v=abcdefghijk'));
  await t.run('captureSource(document.getElementById("capture-button"))');
  assert.equal(creates, 1);
});

test('shared Notion helper does not automatically replay a create after HTTP 529', async () => {
  const t = setup();
  let attempts = 0;
  t.c.fetch = async () => {
    attempts++;
    return { ok: false, status: 529, json: async () => ({ error: 'Overloaded' }) };
  };
  t.run(
    'notionAPI = ' +
      source
        .match(/async function notionAPI\([\s\S]+?(?=\n\/\/ Run `fn`)/)[0]
        .replace('async function notionAPI', 'async function')
  );
  await assert.rejects(t.run('notionAPI("pages","POST",{})'), /Overloaded/);
  assert.equal(attempts, 1);
});

test('material and Places HTTP 408 creates retain their replay protection', async () => {
  const t = candidateSetup();
  t.run("REVIEW.decisions[candidate._key]='accepted'");
  t.c.before = async (call) => {
    if (call.endpoint === 'pages')
      throw Object.assign(new Error('Request timeout'), { status: 408 });
  };
  await t.run("saveAcceptedMaterial('web',null,'glossary')");
  assert.ok([...t.local.entries()].some(([k, v]) => k.startsWith('material-create-v2:') && v));
  await t.run("saveAcceptedMaterial('web',null,'glossary')");
  assert.equal(t.calls.filter((c) => c.endpoint === 'pages').length, 1);
  const h = setup(),
    S = h.run('S');
  S.extractedPlaces = [{ name: 'Market', prefecture: 'Unknown' }];
  S.placeSkip = new Set();
  h.c.before = async (call) => {
    if (call.endpoint === 'pages')
      throw Object.assign(new Error('Request timeout'), { status: 408 });
  };
  await h.run('saveConfirmedPlaces()');
  assert.ok(h.local.get('place-create:market'));
  await h.run('saveConfirmedPlaces()');
  assert.equal(h.calls.filter((c) => c.endpoint === 'pages').length, 1);
});

test('chat import offers quote recovery without changing the quoted words or accepting truncated JSON', () => {
  const t = setup();
  t.c.paste = '{"summary":"Osaka is the "kitchen of Japan," with many foods.","food":[]}';
  const result = t.run('parseExtractionImport(paste)');
  assert.equal(result.repairs, 2);
  assert.equal(result.parsed.summary, 'Osaka is the "kitchen of Japan," with many foods.');
  t.c.paste = '{"summary":"Incomplete';
  assert.throws(() => t.run('parseExtractionImport(paste)'), /incomplete or malformed/);
});

test('chat drafts are isolated by source and importing does not jump away from the queue', async () => {
  const t = setup(),
    first = t.add(),
    second = t.add('food'),
    S = t.run('S');
  S.epQueue = [
    {
      id: first.material.id,
      title: 'Tokyo',
      transcript: 'Tokyo source',
      url: 'https://example.com/tokyo',
    },
    {
      id: second.material.id,
      title: 'Osaka',
      transcript: 'Osaka source',
      url: 'https://example.com/osaka',
    },
  ];
  S.epSelected = new Set([0, 1]);
  await t.run('openExtractionChat(0)');
  t.element('extract-chat-result').value = JSON.stringify({ summary: 'Tokyo draft' });
  t.run('retainExtractionChat()');
  await t.run('openExtractionChat(1)');
  assert.equal(t.element('extract-chat-result').value, '');
  t.element('extract-chat-result').value = JSON.stringify({ summary: 'Osaka draft' });
  t.run('retainExtractionChat();reviewExtractionChat()');
  assert.equal(t.element('extract-chat-use').disabled, true);
  t.element('extract-chat-confirm').checked = true;
  await t.run('useExtractionChat()');
  assert.equal(t.element('res-tab-prep').dataset.step, '2');
  assert.equal(S.epQueue[0].breakdown, undefined);
  assert.equal(S.epQueue[1].breakdown.summary, 'Osaka draft');
  assert.ok(
    t.calls
      .filter((c) => c.method === 'PATCH')
      .every((c) => c.endpoint === `pages/${second.material.id}`)
  );
  await t.run('openExtractionChat(0)');
  assert.match(t.element('extract-chat-result').value, /Tokyo draft/);
});

test('source-ID mismatch blocks import and a reordered queue retains the right destination', async () => {
  const t = setup(),
    item = t.add(),
    S = t.run('S');
  const v = { id: item.material.id, title: 'Osaka', transcript: 'Source transcript' };
  S.epQueue = [v];
  S.epSelected = new Set([0]);
  await t.run('openExtractionChat(0)');
  t.element('extract-chat-result').value = JSON.stringify({
    source_id: 'another-source',
    summary: 'Wrong',
  });
  t.run('reviewExtractionChat()');
  assert.match(t.element('extract-chat-review').textContent, /different source/);
  assert.equal(t.element('extract-chat-use').disabled, true);
  t.element('extract-chat-result').value = JSON.stringify({ source_id: v.id, summary: 'Correct' });
  t.run('reviewExtractionChat()');
  t.element('extract-chat-confirm').checked = true;
  S.epQueue = [{ id: 'other', title: 'Tokyo' }, v];
  S.epSelected = new Set([1]);
  await t.run('useExtractionChat()');
  assert.equal(v.breakdown.summary, 'Correct');
  assert.equal(S.epQueue[0].breakdown, undefined);
});

test('source-focused review excludes candidates from the other video and next-source returns to its workspace', () => {
  const t = setup(),
    S = t.run('S');
  S.epQueue = [
    {
      id: 'tokyo',
      title: 'Tokyo',
      transcript: 'Tokyo',
      breakdown: { food: [{ dish: 'Tokyo dish' }] },
    },
    {
      id: 'osaka',
      title: 'Osaka',
      transcript: 'Osaka',
      breakdown: { food: [{ dish: 'Osaka dish' }] },
    },
  ];
  S.epSelected = new Set([0, 1]);
  t.run('reviewSourceMaterial(0)');
  assert.equal(t.run("poolFor('food','prep').length"), 1);
  assert.equal(t.run("poolFor('food','prep')[0].dish"), 'Tokyo dish');
  t.run('movePrepSource(1)');
  assert.equal(S.prepFocusId, 'osaka');
  assert.equal(t.element('res-tab-prep').dataset.step, '2');
  assert.match(t.element('ep-prep-list').innerHTML, /Source 2 of 2/);
});

test('explicit saved-fallback retry reuses completed extraction parts', async () => {
  const t = setup();
  const routes = [];
  let calls = 0;
  t.c.transcript = 'A'.repeat(4000) + 'B'.repeat(100);
  t.c.runExtractChunk = async (text, shape, guard, task, route) => {
    routes.push(route);
    calls++;
    if (calls === 2) throw new Error('Primary failed');
    return { research: [{ statement: text[0] }] };
  };
  await assert.rejects(
    t.run("runExtractCall(transcript,'schema','guard',{key:'same-source'})"),
    /Primary failed/
  );
  const result = await t.run(
    "runExtractCall(transcript,'schema','guard',{key:'same-source',routeChoice:'fallback'})"
  );
  assert.deepEqual(routes, ['primary', 'primary', 'fallback']);
  assert.equal(result.research.length, 2);
});

test('material save receipts are separate for each reviewed source', () => {
  const t = setup();
  t.run(
    "S.reviewSourceId='tokyo';REVIEW.receipts[reviewReceiptKey('prep')]={saved:1};S.reviewSourceId='osaka'"
  );
  assert.equal(t.run("REVIEW.receipts[reviewReceiptKey('prep')]"), undefined);
  assert.equal(t.run("REVIEW.receipts['prep:tokyo'].saved"), 1);
});

function simultaneousSaveSetup() {
  const t = setup();
  t.c.enhanceTable = () => {};
  t.run(`S.epQueue=[
    {id:'source-a',title:'First video',breakdown:{food:[{dish:'First dish',source_page_id:'source-a'}],glossary:[{term:'First term',meaning:'Original meaning',source_page_id:'source-a'}]}},
    {id:'source-b',title:'Second video',breakdown:{food:[{dish:'Second dish',source_page_id:'source-b'}],glossary:[{term:'Second term',source_page_id:'source-b'}]}}
  ];S.epSelected=new Set([0,1]);S.prepFocusId='source-a';S.reviewSourceId='source-a';rebuildCombinedOutline();
  for(const key of ['food','glossary'])for(const it of poolFor(key,'prep'))REVIEW.decisions[it._key]='accepted';`);
  return t;
}

test('a second source can queue while the first saves without changing either save snapshot or receipts', async () => {
  const t = simultaneousSaveSetup();
  let release, entered;
  const gate = new Promise((r) => (release = r));
  const waiting = new Promise((r) => (entered = r));
  let blocked = false;
  t.c.before = async (call) => {
    if (call.endpoint === 'pages' && !blocked) {
      blocked = true;
      entered();
      await gate;
    }
  };
  const first = t.run("saveAcceptedMaterial('prep',document.getElementById('save-first'))");
  await waiting;
  t.run(`openSourceRecord(1);reviewSourceMaterial(1);
    for(const key of ['food','glossary'])for(const it of poolFor(key,'prep'))REVIEW.decisions[it._key]='accepted';
    renderReviewInto('extract-review','prep');`);
  const screen = t.element('extract-review').innerHTML;
  assert.match(screen, />Queue accepted \(2\)<\/button>/);
  assert.doesNotMatch(screen, /disabled[^>]*>Queue accepted/);
  const second = t.run("saveAcceptedMaterial('prep',document.getElementById('save-second'))");
  await t.run("saveAcceptedMaterial('prep',document.getElementById('duplicate'))");
  assert.equal(t.run("REVIEW.jobs['prep:source-b'].state"), 'queued');
  assert.equal(t.calls.filter((c) => c.endpoint === 'pages').length, 1);
  // Mutate navigation and the old source after submission; submitted rows stay fixed.
  t.run(`S.epQueue[0].breakdown.glossary[0].meaning='Changed after submission';
    S.reviewSourceId='source-b';S.epSelected=new Set([1]);rebuildCombinedOutline();`);
  release();
  await Promise.all([first, second]);
  assert.equal(t.pages.size, 4);
  assert.equal(t.run("REVIEW.receipts['prep:source-a'].saved"), 2);
  assert.equal(t.run("REVIEW.receipts['prep:source-b'].saved"), 2);
  assert.equal(t.run("REVIEW.jobs['prep:source-b'].state"), 'done');
  const evidence = [...t.pages.values()].map((p) => JSON.parse(t.text(p.children[0].code)));
  assert.deepEqual(
    evidence.map((e) => e.observation.source_page_id),
    ['source-a', 'source-a', 'source-b', 'source-b']
  );
  assert.equal(evidence[1].observation.meaning, 'Original meaning');
});

test('a failed source releases the queue and retry reconciles its lost response without resaving the second source', async () => {
  const t = simultaneousSaveSetup();
  let release, entered;
  const gate = new Promise((r) => (release = r));
  const waiting = new Promise((r) => (entered = r));
  let failed = false;
  t.c.after = async (call) => {
    if (call.endpoint === 'pages' && !failed) {
      failed = true;
      entered();
      await gate;
      throw new Error('Create response lost');
    }
  };
  const first = t.run("saveAcceptedMaterial('prep',null)");
  await waiting;
  t.run(
    `S.reviewSourceId='source-b';for(const key of ['food','glossary'])for(const it of poolFor(key,'prep'))REVIEW.decisions[it._key]='accepted';`
  );
  const second = t.run("saveAcceptedMaterial('prep',null)");
  release();
  await Promise.all([first, second]);
  assert.equal(t.run("REVIEW.jobs['prep:source-a'].state"), 'failed');
  assert.equal(t.run("REVIEW.jobs['prep:source-b'].state"), 'done');
  assert.equal(t.run("REVIEW.receipts['prep:source-a'].remaining"), 2);
  assert.equal(t.pages.size, 3);
  t.run("S.reviewSourceId='source-a'");
  await t.run("saveAcceptedMaterial('prep',null)");
  assert.equal(t.pages.size, 4);
  assert.equal(t.run("REVIEW.receipts['prep:source-a'].saved"), 2);
  assert.equal(t.run("REVIEW.receipts['prep:source-b'].saved"), 2);
  assert.equal(t.calls.filter((c) => c.endpoint === 'pages').length, 4);
});

test('stopping a save completes its in-flight record and retains the rest while another source proceeds', async () => {
  const t = simultaneousSaveSetup();
  let release, entered;
  const gate = new Promise((r) => (release = r));
  const waiting = new Promise((r) => (entered = r));
  let blocked = false;
  t.c.before = async (call) => {
    if (call.endpoint === 'pages' && !blocked) {
      blocked = true;
      entered();
      await gate;
    }
  };
  const first = t.run("saveAcceptedMaterial('prep',null)");
  await waiting;
  t.run(`stopMaterialSave('prep:source-a');focusPrepSource('source-b');reviewSourceMaterial(1);
    for(const key of ['food','glossary'])for(const it of poolFor(key,'prep'))REVIEW.decisions[it._key]='accepted';`);
  const second = t.run("saveAcceptedMaterial('prep',null)");
  release();
  await Promise.all([first, second]);
  assert.equal(t.pages.size, 3);
  assert.equal(t.run("REVIEW.jobs['prep:source-a'].state"), 'stopped');
  assert.equal(t.run("REVIEW.receipts['prep:source-a'].remaining"), 1);
  assert.equal(t.run("REVIEW.receipts['prep:source-b'].saved"), 2);
});

test('queued records cannot be changed by bulk decisions and cancelling them makes no writes', async () => {
  const t = simultaneousSaveSetup();
  let release, entered;
  const gate = new Promise((r) => (release = r));
  const waiting = new Promise((r) => (entered = r));
  let blocked = false;
  t.c.before = async (call) => {
    if (call.endpoint === 'pages' && !blocked) {
      blocked = true;
      entered();
      await gate;
    }
  };
  const first = t.run("saveAcceptedMaterial('prep',null)");
  await waiting;
  t.run(
    `S.reviewSourceId='source-b';REVIEW.selected=new Set();for(const key of ['food','glossary'])for(const it of poolFor(key,'prep')){REVIEW.decisions[it._key]='accepted';REVIEW.selected.add(it._key);}`
  );
  const second = t.run("saveAcceptedMaterial('prep',null)");
  await t.run("decideReview('prep','food','skipped')");
  assert.equal(t.run("REVIEW.decisions[poolFor('food','prep')[0]._key]"), 'accepted');
  t.run("stopMaterialSave('prep:source-b')");
  release();
  await Promise.all([first, second]);
  assert.equal(t.pages.size, 2);
  assert.equal(t.run("REVIEW.jobs['prep:source-b'].state"), 'stopped');
  await t.run("saveAcceptedMaterial('prep',null)");
  assert.equal(t.pages.size, 4);
});

function deferredCall(t, match) {
  let release, entered;
  const gate = new Promise((r) => (release = r)),
    waiting = new Promise((r) => (entered = r));
  t.c.before = async (call) => {
    if (match(call)) {
      entered();
      await gate;
    }
  };
  return { release, waiting };
}

test('a material save cannot close a newer editor or erase edits made while saving', async () => {
  const t = setup(),
    a = t.add('activities', 'First walk'),
    b = t.add('activities', 'Second walk');
  t.LIB.rows.activities = [a.material, b.material];
  t.c.rowA = a.material;
  t.c.rowB = b.material;
  t.run(
    "materialEdit={row:rowA,fields:{Activity:'Submitted walk'}};renderMaterialLibrary=()=>{};openLibraryDetail=()=>{};openModal('material-edit-modal')"
  );
  const d = deferredCall(t, (c) => c.method === 'PATCH');
  const save = t.run("saveMaterialEdit(document.getElementById('save-a'))");
  await d.waiting;
  t.run(
    "materialEdit={row:rowB,fields:{Activity:'New editor draft'}};openModal('material-edit-modal');document.getElementById('material-edit-status').textContent='Editing second record'"
  );
  const view = t.run("modalVersions['material-edit-modal']");
  d.release();
  await save;
  assert.equal(t.run("modalVersions['material-edit-modal']"), view);
  assert.equal(t.run('materialEdit.row.id'), b.material.id);
  assert.equal(t.element('material-edit-status').textContent, 'Editing second record');
  assert.equal(t.text(t.pages.get(a.material.id).properties.Activity), 'Submitted walk');
});

test('material edits typed during a save remain as a recoverable unsaved draft', async () => {
  const t = setup(),
    a = t.add('activities', 'Walk');
  t.LIB.rows.activities = [a.material];
  t.c.rowA = a.material;
  t.run(
    "materialEdit={row:rowA,fields:{Activity:'Submitted'}};renderMaterialLibrary=()=>{};openModal('material-edit-modal')"
  );
  const d = deferredCall(t, (c) => c.method === 'PATCH');
  const save = t.run("saveMaterialEdit(document.getElementById('save'))");
  await d.waiting;
  t.run("materialEdit.fields.Activity='Newer edit'");
  d.release();
  await save;
  assert.equal(t.text(t.pages.get(a.material.id).properties.Activity), 'Submitted');
  assert.equal(t.local.get(`material-edit:${a.material.id}`).fields.Activity, 'Newer edit');
  assert.equal(
    t.local.get(`material-edit:${a.material.id}`).baseEdited,
    t.pages.get(a.material.id).last_edited_time
  );
});

test('AI choices edited during saving remain unsaved rather than disappearing', async () => {
  const t = setup();
  let release, entered;
  const gate = new Promise((r) => (release = r)),
    waiting = new Promise((r) => (entered = r));
  t.c.notionAPI = async () => {
    entered();
    await gate;
    return {};
  };
  t.run(
    "S.routingBlockId='routing';S.routing={outline:{provider:'deepseek',model:'old'}};collectRouting=()=>choice;choice={outline:{provider:'openai',model:'submitted'}};renderRoutingTable=()=>{}"
  );
  const save = t.run('saveRouting()');
  await waiting;
  t.run("choice={outline:{provider:'another',model:'new-edit'}}");
  release();
  await save;
  assert.equal(t.run('S.routing.outline.model'), 'submitted');
  assert.equal(t.run('routingDirty'), true);
  assert.equal(t.run('choice.outline.model'), 'new-edit');
  assert.match(t.element('routing-save-status').textContent, /newer choices are still unsaved/);
});

test('adding material to an idea snapshots its destination before asynchronous reads', async () => {
  const t = setup(),
    a = t.add('activities', 'Original selection'),
    b = t.add('activities', 'Later selection');
  t.LIB.idea = t.run('blankLibraryIdea()');
  t.LIB.destinationRows = [a.material];
  t.LIB.destinationReady = true;
  t.element('destination-choice').value = 'selected-idea';
  t.element('destination-name').value = 'Original title';
  let release, entered;
  const gate = new Promise((r) => (release = r)),
    waiting = new Promise((r) => (entered = r));
  t.c.readLibraryIdea = async () => {
    entered();
    await gate;
    return t.run('blankLibraryIdea()');
  };
  t.c.saveLibraryIdea = async () => {
    t.LIB.idea.dirty = false;
  };
  const save = t.run("saveIdeaDestination(document.getElementById('destination-save'))");
  await waiting;
  assert.equal(await t.run('ideaMaySwitch()'), false);
  t.LIB.destinationRows = [b.material];
  t.element('destination-name').value = 'Later title';
  release();
  await save;
  assert.equal(t.LIB.idea.name, 'Original title');
  assert.equal(t.LIB.idea.items[0].material.id, a.material.id);
  assert.equal(t.LIB.busy, false);
  assert.equal(t.LIB.destinationSaving, false);
});

test('fact-check saves a reviewed snapshot and cannot close another claim review', async () => {
  const t = setup(),
    a = t.add('research', 'First claim');
  const p = t.pages.get(a.material.id);
  t.c.row = {
    id: p.id,
    store: 'research',
    name: 'First claim',
    lastEdited: p.last_edited_time,
    _proposal: {
      verdict: 'confirmed',
      source_url: 'https://example.com/evidence',
      note: 'Reviewed note',
    },
  };
  t.run("S.vlib=[row];renderVlibResults=()=>{};openModal('fact-review-modal')");
  const d = deferredCall(t, (c) => c.endpoint === `pages/${p.id}` && c.method === 'GET');
  const save = t.run("saveVerdictProposal(row.id,document.getElementById('save-check'))");
  await d.waiting;
  t.run("editVerdictProposal(row.id,'note','New text');openModal('fact-review-modal')");
  const view = t.run("modalVersions['fact-review-modal']");
  d.release();
  await save;
  assert.equal(t.run("modalVersions['fact-review-modal']"), view);
  assert.match(t.text(t.pages.get(p.id).properties['Verify Note']), /Reviewed note/);
  assert.doesNotMatch(t.text(t.pages.get(p.id).properties['Verify Note']), /New text/);
});

test('rapid idea opens acquire ownership after the asynchronous switch check', async () => {
  const t = setup();
  t.LIB.idea = t.run('blankLibraryIdea()');
  let release,
    entered,
    reads = 0;
  const waiting = new Promise((r) => (entered = r));
  t.c.readLibraryIdea = async (id) => {
    reads++;
    entered();
    await new Promise((r) => (release = r));
    return { ...t.run('blankLibraryIdea()'), id };
  };
  const first = t.run("openLibraryIdea('first')"),
    second = t.run("openLibraryIdea('second')");
  await waiting;
  await second;
  assert.equal(reads, 1);
  release();
  await first;
  assert.equal(t.LIB.idea.id, 'first');
  assert.equal(t.LIB.busy, false);
});

test('channel style rejects overlapping saves and releases its lock after failure', async () => {
  const t = setup();
  t.run("S.dnaBlockId='style';S.dna={};captureDNAVisible=()=>{}");
  let release,
    entered,
    calls = 0;
  const waiting = new Promise((r) => (entered = r));
  t.c.notionAPI = async () => {
    calls++;
    entered();
    await new Promise((r) => (release = r));
    throw new Error('Simulated outage');
  };
  const first = t.run('saveDNA()');
  await waiting;
  await t.run('saveDNA()');
  assert.equal(calls, 1);
  release();
  await first;
  assert.equal(t.run('dnaSaving'), false);
});

test('settings loaded before a save cannot overwrite the subsequently saved choices', async () => {
  const t = setup();
  let release;
  t.c.getPageBlocks = () => new Promise((r) => (release = r));
  let applied = false;
  t.c.parseAndApplySettings = () => {
    applied = true;
  };
  const load = t.run('loadSettingsFromNotion()');
  t.run('settingsReadVersion++');
  release([]);
  assert.equal(await load, false);
  assert.equal(applied, false);
});

test('discarding a fact-check suggestion cannot close a newer review during local persistence', async () => {
  const t = setup();
  t.run(
    "S.vlib=[{id:'claim',_proposal:{note:'Draft'}}];renderVlibResults=()=>{};openModal('fact-review-modal')"
  );
  let release;
  t.c.localArtifact = () => new Promise((r) => (release = r));
  const discard = t.run("discardVerdictProposal('claim')");
  t.run("closeModal('fact-review-modal');openModal('fact-review-modal')");
  const view = t.run("modalVersions['fact-review-modal']");
  release();
  await discard;
  assert.equal(t.run("modalVersions['fact-review-modal']"), view);
  assert.equal(t.run('S.vlib[0]._proposal'), null);
});

function factFixture() {
  const t = setup(),
    item = t.add('research', 'A claim'),
    r = {
      id: item.material.id,
      name: 'A claim',
      store: 'research',
      fields: 'Context',
      lastEdited: item.material.lastEdited,
    };
  t.c.fact = r;
  t.run('S.vlib=[fact];S._vlibSkip=new Set()');
  t.c.confirmIdeaChange = async () => true;
  t.c._verifyBatch = async () => ({
    model: 'fixture-model',
    verified: [
      {
        name: 'A claim',
        verdict: 'confirmed',
        source_url: 'https://example.org/evidence',
        note: 'Evidence supports this claim.',
      },
    ],
  });
  return { ...t, r };
}

test('automatic checks and optional human overrides remain separate through saving and reload', async () => {
  const t = factFixture();
  await t.run('runLibVerify()');
  await t.run("_writeVerdict(fact,{verdict:'unsupported',note:'My review disagrees.'})");
  t.run('S._vlibSkip.clear()');
  t.c._verifyBatch = async () => ({
    model: 'fixture-model',
    verified: [
      {
        name: 'A claim',
        verdict: 'confirmed',
        source_url: 'https://example.org/evidence',
        note: 'Fresh evidence supports it.',
      },
    ],
  });
  await t.run('runLibVerify()');
  const page = t.pages.get(t.r.id);
  t.c.reloaded = {
    note: t.text(page.properties['Verify Note']),
    status: page.properties['Verify Status'].select.name,
  };
  const record = t.run('checkRecord(reloaded)');
  assert.equal(record.ai.verdict, 'confirmed');
  assert.equal(record.ai.model, 'fixture-model');
  assert.equal(record.review.note, 'My review disagrees.');
  assert.equal(t.c.reloaded.status, 'unsupported');
  assert.equal(t.calls.filter((c) => c.method === 'PATCH').length, 3);
  assert.equal(t.pages.get(t.r.id).properties.Confidence, undefined);
});

test('a lost automatic save response is reconciled without a second PATCH and without the operator', async () => {
  const t = factFixture();
  let lost = false;
  t.c.after = async (c) => {
    if (c.method === 'PATCH' && !lost) {
      lost = true;
      throw new Error('Lost response');
    }
  };
  await t.run('runLibVerify()');
  // The write landed before the response was lost. The retry reads the row back
  // and reconciles, so the finding is saved, nothing is written twice, and the
  // operator has no repair step.
  assert.equal(t.r._aiPending, null);
  assert.equal(t.r._checkError, '');
  assert.equal(t.calls.filter((c) => c.method === 'PATCH').length, 1);
  assert.equal(t.run('checkRecord(fact).ai.verdict'), 'confirmed');
});

test('unsupported findings save without review while invalid or missing evidence never overwrites an earlier check', async () => {
  const t = factFixture();
  t.c._verifyBatch = async () => ({
    verified: [
      { name: 'A claim', verdict: 'unsupported', note: 'No evidence located.', source_url: '' },
    ],
  });
  await t.run('runLibVerify()');
  const saved = t.text(t.pages.get(t.r.id).properties['Verify Note']);
  for (const reply of [
    { verdict: 'unknown', note: 'Unclear' },
    { verdict: 'confirmed', note: 'No URL' },
    { verdict: 'corrected', source_url: 'javascript:alert(1)', note: 'Unsafe URL' },
  ]) {
    t.run('S._vlibSkip.clear()');
    t.c._verifyBatch = async () => ({ verified: [{ name: 'A claim', ...reply }] });
    await t.run('runLibVerify()');
    assert.equal(t.text(t.pages.get(t.r.id).properties['Verify Note']), saved);
    assert.equal(t.r._retry, true);
    assert.match(t.r._checkError, /Check failed/);
  }
  assert.match(t.element('vlib-results').innerHTML, /No evidence found/);
  assert.equal(t.calls.filter((c) => c.method === 'PATCH').length, 1);
});

test('unchecked selection excludes saved findings and retained save retries without another AI call', async () => {
  const t = factFixture();
  await t.run('runLibVerify()');
  t.run(
    "S.vlib.push({id:'unchecked',name:'Unchecked',store:'research'},{id:'pending',name:'Pending',store:'research',_aiPending:{verdict:'unsupported',note:'Retained'}});S._vlibSkip=new Set();selectUncheckedFacts()"
  );
  assert.equal(t.run('S._vlibSkip.has(fact.id)'), true);
  assert.equal(t.run("S._vlibSkip.has('pending')"), true);
  assert.equal(t.run("S._vlibSkip.has('unchecked')"), false);
});

test('legacy notes are retained and failed model requests do not overwrite saved findings', async () => {
  const t = factFixture(),
    page = t.pages.get(t.r.id);
  page.properties['Verify Status'] = { type: 'select', select: { name: 'confirmed' } };
  page.properties['Verify Note'] = {
    type: 'rich_text',
    rich_text: [
      { plain_text: 'Earlier evidence note', text: { content: 'Earlier evidence note' } },
    ],
  };
  await t.run('runLibVerify()');
  assert.equal(t.run('checkRecord(fact).legacy.note'), 'Earlier evidence note');
  const saved = t.text(page.properties['Verify Note']);
  t.run('S._vlibSkip.clear()');
  t.c._verifyBatch = async () => {
    throw new Error('Fixture timeout');
  };
  await t.run('runLibVerify()');
  assert.equal(t.text(page.properties['Verify Note']), saved);
  assert.match(t.element('vlib-results').innerHTML, /Fixture timeout/);
  assert.match(t.element('vlib-results').innerHTML, /Supported/);
});

test('reloading restores pending AI findings and older suggestions without requiring manual review', async () => {
  const t = factFixture();
  await t.run(
    "localArtifact('verify-proposal:'+fact.id,{name:fact.name,verdict:'unsupported',note:'Older suggestion'})"
  );
  await t.run('restoreFactDrafts(fact)');
  assert.equal(t.r._aiPending.note, 'Older suggestion');
  assert.equal(t.r._proposal, null);
  await t.run('retryFactSave(fact.id)');
  assert.equal(t.run('checkRecord(fact).ai.verdict'), 'unsupported');
  assert.equal(t.run('checkRecord(fact).review'), undefined);
});

test('duplicate model entries fail the affected claim rather than arbitrarily saving one', async () => {
  const t = factFixture();
  t.c._verifyBatch = async () => ({
    verified: [
      { name: 'A claim', verdict: 'unsupported', note: 'One' },
      { name: 'A claim', verdict: 'confirmed', source_url: 'https://example.org', note: 'Two' },
    ],
  });
  await t.run('runLibVerify()');
  assert.equal(t.calls.filter((c) => c.method === 'PATCH').length, 0);
  assert.match(t.r._checkError, /duplicated/);
});

test('same-name records with different context are re-checked one at a time so each result stays attributed', async () => {
  const t = setup(),
    S = t.run('S'),
    first = t.add('research', 'A claim'),
    second = t.add('research', 'A claim');
  t.c.fact = {
    id: first.material.id,
    name: 'A claim',
    store: 'research',
    fields: 'Context A',
    lastEdited: first.material.lastEdited,
  };
  t.c.other = {
    id: second.material.id,
    name: 'A claim',
    store: 'research',
    fields: 'Context B',
    lastEdited: second.material.lastEdited,
  };
  t.run('S.vlib=[fact,other];S._vlibSkip=new Set()');
  t.c.confirmIdeaChange = async () => true;
  const batches = [];
  t.c._verifyBatch = async (_store, items) => {
    batches.push(items.map((item) => item.detail).join(' | '));
    return {
      verified: items.map((item) => ({
        name: item.name,
        verdict: 'confirmed',
        source_url: `https://example.org/${item.detail === 'Context A' ? 'a' : 'b'}`,
        note: item.detail,
      })),
    };
  };
  await t.run('runLibVerify()');
  assert.deepEqual(batches, ['Context A | Context B', 'Context A', 'Context B']);
  assert.equal(S._vlibSkip.size, 2);
  assert.equal(
    t.text(t.pages.get(first.material.id).properties['Verify Note']).includes('Context A'),
    true
  );
  assert.equal(
    t.text(t.pages.get(second.material.id).properties['Verify Note']).includes('Context B'),
    true
  );
});

test('a batch reply that omits one claim re-checks that claim alone and keeps the rest of the reply', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 4 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
    fields: 'Context',
  }));
  S._vlibSkip = new Set();
  const batches = [];
  t.c.confirmIdeaChange = async () => true;
  t.c._writeVerdict = async () => {};
  t.c._verifyBatch = async (_store, items) => {
    batches.push(items.map((item) => item.name).join(' + '));
    const answered = items.length > 1 ? items.filter((item) => item.name !== 'Claim 2') : items;
    return {
      verified: answered.map((item) => ({
        name: item.name,
        verdict: 'unsupported',
        note: 'No evidence found.',
      })),
    };
  };
  await t.run('runLibVerify()');
  assert.deepEqual(batches, ['Claim 0 + Claim 1 + Claim 2 + Claim 3', 'Claim 2']);
  assert.equal(S._vlibSkip.size, 4);
  assert.equal(
    S.vlib.some((r) => r._retry),
    false
  );
  assert.match(t.element('verify-save-status').textContent, /Checked 4 · saved 4/);
});

test('unsaved extraction checks persist locally without creating material in Notion', async () => {
  const t = factFixture();
  delete t.r.id;
  t.r._key = 'candidate-source-A';
  await t.run('runLibVerify()');
  assert.equal(t.calls.length, 0);
  t.c.restored = { _key: 'candidate-source-A', name: 'A claim', store: 'research' };
  await t.run('restoreFactDrafts(restored)');
  assert.equal(t.run('checkRecord(restored).ai.verdict'), 'confirmed');
  assert.equal(t.run('hasCheck(restored)'), true);
});

// Contract: every claim ticked when the run starts is attempted exactly once
// during that run, unless the operator stops. These tests are the witness —
// they must fail before the cap is removed and pass after.
test('every ticked claim is attempted in one run, not only the first batch', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 60 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
  }));
  S._vlibSkip = new Set();
  const batches = [];
  let scope = '';
  t.c.confirmIdeaChange = async (_title, message) => {
    scope = message;
    return true;
  };
  t.c._writeVerdict = async () => {};
  t.c._verifyBatch = async (_store, items) => {
    batches.push(items.length);
    return {
      verified: items.map((it) => ({
        name: it.name,
        verdict: 'unsupported',
        note: 'No evidence found.',
      })),
    };
  };
  await t.run('runLibVerify()');
  assert.deepEqual(
    batches,
    Array.from({ length: 15 }, () => 4),
    'sixty ticked claims means fifteen four-claim requests, not five'
  );
  assert.equal(S._vlibSkip.size, 60, 'every ticked claim ends up checked');
  assert.match(scope, /60 claims/);
  assert.match(scope, /15 requests/);
  // Four facts, no policy: what, how many requests, how long, and the open tab.
  assert.match(scope, /roughly \d+ minutes/);
  assert.match(scope, /Keep this tab open/);
  assert.doesNotMatch(scope, /does not stop the others|nothing is sent after/);
});

test('a ticked claim hidden by the table filter is still checked', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = [
    { id: 'a', name: 'Claim A', store: 'research' },
    { id: 'b', name: 'Claim B', store: 'research' },
  ];
  S._vlibSkip = new Set();
  const asked = [];
  let scope = '';
  // The table filter shows one row; the other is still ticked.
  t.c.visibleTableKeys = () => new Set(['a']);
  t.c.confirmIdeaChange = async (_title, message) => {
    scope = message;
    return true;
  };
  t.c._writeVerdict = async () => {};
  t.c._verifyBatch = async (_store, items) => {
    asked.push(...items.map((it) => it.name));
    return {
      verified: items.map((it) => ({
        name: it.name,
        verdict: 'unsupported',
        note: 'No evidence found.',
      })),
    };
  };
  await t.run('runLibVerify()');
  assert.deepEqual(asked.sort(), ['Claim A', 'Claim B']);
  assert.match(scope, /hidden by the current filter/);
});

test('a claim whose finding is still pending save is not checked again', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = [
    {
      id: 'a',
      name: 'Claim A',
      store: 'research',
      _aiPending: { verdict: 'unsupported', note: 'Retained' },
    },
    { id: 'b', name: 'Claim B', store: 'research' },
  ];
  S._vlibSkip = new Set();
  const asked = [];
  t.c.confirmIdeaChange = async () => true;
  t.c._writeVerdict = async () => {};
  t.c._verifyBatch = async (_store, items) => {
    asked.push(...items.map((it) => it.name));
    return {
      verified: items.map((it) => ({
        name: it.name,
        verdict: 'unsupported',
        note: 'No evidence found.',
      })),
    };
  };
  await t.run('runLibVerify()');
  assert.deepEqual(asked, ['Claim B'], 'a retained finding must not be paid for twice');
});

test('a whole-library selection is attempted in one confirmed run', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 1092 }, (_, i) => ({
    id: `claim-${i}`,
    name: `Claim ${i}`,
    store: 'research',
  }));
  S._vlibSkip = new Set();
  let scope;
  const batches = [],
    writes = [];
  t.c.confirmIdeaChange = async (_title, message) => {
    scope = message;
    return true;
  };
  t.c._verifyBatch = async (_store, items) => {
    batches.push(items.length);
    return {
      verified: items.map((it) => ({
        name: it.name,
        verdict: 'unsupported',
        note: 'No evidence found.',
      })),
    };
  };
  t.c._writeVerdict = async (r) => {
    writes.push(r.id);
  };
  await t.run('runLibVerify()');
  assert.equal(batches.length, 273, '1092 claims is 273 four-claim requests');
  assert.ok(
    batches.every((n) => n === 4),
    'every request carries the provider maximum'
  );
  assert.equal(writes.length, 1092, 'nothing is left waiting for another run');
  assert.doesNotMatch(scope, /wait for another confirmed run/);
  assert.match(scope, /1092 claims/);
  assert.match(scope, /273 requests/);
  assert.match(t.element('verify-save-status').textContent, /Checked 1092 · saved 1092/);
  assert.match(t.element('verify-save-status').textContent, /Every ticked claim has a check/);
  assert.doesNotMatch(t.element('vlib-results').innerHTML, /Check next 20/);
});

test('a reply that echoes the rendered entry resolves instead of costing another request', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = [
    { id: 'a', name: 'Claim A', store: 'research', fields: 'Category: X · Source: vlog' },
    { id: 'b', name: 'Claim B', store: 'research', fields: 'Category: X · Source: vlog' },
    { id: 'c', name: 'Claim C', store: 'research', fields: 'Category: X · Source: vlog' },
    { id: 'd', name: 'Claim D', store: 'research', fields: '' },
  ];
  S._vlibSkip = new Set();
  const batches = [];
  t.c.confirmIdeaChange = async () => true;
  t.c._verifyBatch = async (_store, items) => {
    batches.push(items.length);
    return {
      verified: items.map((it, i) => ({
        // Exactly what the provider returned live: list number, claim, then the
        // detail we sent — with the dash variant it happened to choose.
        name: it.detail
          ? `${i + 1}. ${it.name} ${['\u2014', '\u2013', '-'][i % 3]} ${it.detail}`
          : `${i + 1}. ${it.name}`,
        verdict: 'confirmed',
        source_url: 'https://example.org/evidence',
        note: 'Evidence supports this claim.',
      })),
    };
  };
  const saved = [];
  t.c._writeVerdict = async (r, finding) => {
    saved.push({ id: r.id, verdict: finding && finding.verdict });
  };
  await t.run('runLibVerify()');
  assert.deepEqual(batches, [4]);
  assert.equal(S.vlib.filter((r) => r._retry).length, 0);
  assert.equal(saved.length, 4);
  assert.deepEqual(
    saved.map((s) => s.verdict),
    ['confirmed', 'confirmed', 'confirmed', 'confirmed']
  );
});

test('a reply that genuinely omits a claim still fails only that claim', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 4 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
  }));
  S._vlibSkip = new Set();
  const batches = [];
  t.c.confirmIdeaChange = async () => true;
  t.c._verifyBatch = async (_store, items) => {
    batches.push(items.length);
    return {
      verified: items.slice(0, items.length - 1).map((it) => ({
        name: it.name,
        verdict: 'unsupported',
        note: 'No evidence found.',
      })),
    };
  };
  const saved = [];
  t.c._writeVerdict = async (r, finding) => {
    saved.push({ id: r.id, verdict: finding && finding.verdict });
  };
  await t.run('runLibVerify()');
  assert.deepEqual(batches, [4, 1]);
  const failed = S.vlib.filter((r) => r._retry);
  assert.equal(failed.length, 1);
  assert.match(failed[0]._checkError, /Check failed/);
  assert.equal(saved.length, 3);
  assert.equal(saved.filter((s) => s.verdict === 'unsupported').length, 3);
});

test('a reply that renames the claim is still rejected rather than matched by accident', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 2 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
    fields: 'Category: X · Source: vlog',
  }));
  S._vlibSkip = new Set();
  const batches = [];
  t.c.confirmIdeaChange = async () => true;
  t.c._verifyBatch = async (_store, items) => {
    batches.push(items.length);
    return {
      verified: items.map(() => ({
        name: 'An entirely different statement',
        verdict: 'unsupported',
        note: 'No evidence found.',
      })),
    };
  };
  const saved = [];
  t.c._writeVerdict = async (r, finding) => {
    saved.push({ id: r.id, verdict: finding && finding.verdict });
  };
  await t.run('runLibVerify()');
  // One batch, then each claim alone: a genuine mismatch must not be accepted.
  assert.deepEqual(batches, [2, 1, 1]);
  assert.equal(S.vlib.filter((r) => r._retry).length, 2);
  assert.equal(saved.length, 0);
});

test('provider requests run in parallel up to the limit and every claim still resolves', async () => {
  const t = setup(),
    S = t.run('S'),
    limit = t.run('FACT_CONCURRENCY');
  S.vlib = Array.from({ length: 12 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
  }));
  S._vlibSkip = new Set();
  let inFlight = 0,
    maxInFlight = 0,
    batches = 0;
  t.c.confirmIdeaChange = async () => true;
  t.c._writeVerdict = async () => {};
  t.c._verifyBatch = async (_store, items) => {
    batches++;
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 2));
    inFlight--;
    return {
      verified: items.map((it) => ({
        name: it.name,
        verdict: 'unsupported',
        note: 'No evidence found.',
      })),
    };
  };
  await t.run('runLibVerify()');
  assert.equal(batches, 3);
  assert.equal(maxInFlight, limit);
  assert.equal(S.vlib.filter((r) => r._retry).length, 0);
  assert.equal(S._vlibSkip.size, 12);
});

test('a failing batch splits without ever exceeding the request ceiling', async () => {
  const t = setup(),
    S = t.run('S'),
    limit = t.run('FACT_CONCURRENCY');
  S.vlib = Array.from({ length: 8 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
  }));
  S._vlibSkip = new Set();
  let inFlight = 0,
    maxInFlight = 0;
  t.c.confirmIdeaChange = async () => true;
  t.c._writeVerdict = async () => {};
  t.c._verifyBatch = async (_store, items) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 2));
    inFlight--;
    if (items.length > 1) throw new Error('Batch too slow');
    return {
      verified: items.map((it) => ({
        name: it.name,
        verdict: 'unsupported',
        note: 'No evidence found.',
      })),
    };
  };
  await t.run('runLibVerify()');
  assert.ok(maxInFlight <= limit, `expected <= ${limit} in flight, saw ${maxInFlight}`);
  assert.equal(S.vlib.filter((r) => r._retry).length, 0);
  assert.equal(S._vlibSkip.size, 8);
});

test('findings save one at a time even while provider requests run in parallel', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 8 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
  }));
  S._vlibSkip = new Set();
  let inFlight = 0,
    maxInFlight = 0,
    saving = 0,
    maxSaving = 0;
  t.c.confirmIdeaChange = async () => true;
  t.c._verifyBatch = async (_store, items) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 3));
    inFlight--;
    return {
      verified: items.map((it) => ({
        name: it.name,
        verdict: 'unsupported',
        note: 'No evidence found.',
      })),
    };
  };
  t.c._writeVerdict = async () => {
    saving++;
    maxSaving = Math.max(maxSaving, saving);
    await new Promise((r) => setTimeout(r, 1));
    saving--;
  };
  await t.run('runLibVerify()');
  assert.equal(maxSaving, 1);
  assert.ok(maxInFlight > 1, `expected parallel provider calls, saw ${maxInFlight}`);
  assert.equal(S._vlibSkip.size, 8);
});

test('a reply that echoes the labelled entry still resolves the claim', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = [
    { id: 'a', name: 'Claim A', store: 'research', fields: 'Category: X · Source: vlog' },
    { id: 'b', name: 'Claim B', store: 'research', fields: 'Category: X · Source: vlog' },
  ];
  S._vlibSkip = new Set();
  const batches = [];
  t.c.confirmIdeaChange = async () => true;
  t.c._verifyBatch = async (_store, items) => {
    batches.push(items.length);
    return {
      verified: items.map((it, i) => ({
        // The entry as the prompt now renders it: a numbered claim line and a
        // separate labelled detail line.
        name: `${i + 1}. claim: ${it.name}\n   detail: ${it.detail}`,
        verdict: 'unsupported',
        note: 'No evidence found.',
      })),
    };
  };
  const saved = [];
  t.c._writeVerdict = async (r, finding) => {
    saved.push({ id: r.id, verdict: finding && finding.verdict });
  };
  await t.run('runLibVerify()');
  assert.deepEqual(batches, [2]);
  assert.equal(saved.length, 2);
  assert.equal(S.vlib.filter((r) => r._retry).length, 0);
});

test('the rendered Verify column shows a verdict badge, a failure, and never-checked', async () => {
  // Replaces three tests against an extracted _vlibVerifyCell helper: the app
  // renders this cell through renderVlibResults, so assert what users see.
  const t = setup(),
    S = t.run('S');
  S.vlib = [
    { id: 'a', name: 'Claim A', store: 'research', _newStatus: 'confirmed' },
    { id: 'b', name: 'Claim B', store: 'research', status: 'corrected' },
    { id: 'c', name: 'Claim C', store: 'research', status: 'unsupported' },
    { id: 'd', name: 'Claim D', store: 'research', _retry: true },
    { id: 'e', name: 'Claim E', store: 'research' },
  ];
  t.run('renderVlibResults()');
  const html = t.element('vlib-results').innerHTML;
  assert.match(html, /badge-green[^]*Supported/);
  assert.match(html, /badge-amber[^]*Contradicted/);
  assert.match(html, /No evidence found/);
  assert.match(html, /Check failed/);
  assert.match(html, /Not checked/);
});

test('a rate-limited provider stops the run instead of splitting into more requests', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 8 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
  }));
  S._vlibSkip = new Set();
  const batches = [];
  // No retries in this test: it is about what happens once waiting is over.
  t.run('THROTTLE_WAITS.length=0');
  t.c.confirmIdeaChange = async () => true;
  t.c._writeVerdict = async () => {};
  t.c._verifyBatch = async (_store, items) => {
    batches.push(items.length);
    throw Object.assign(new Error('Resource has been exhausted'), {
      status: 502,
      code: 'provider_throttled',
    });
  };
  await t.run('runLibVerify()');
  // No split halves: asking a throttled provider for more requests is the wrong
  // response, and the claims stay retryable for when the limit clears.
  assert.ok(
    batches.every((n) => n === 4),
    `expected no split requests, saw ${batches}`
  );
  assert.match(t.element('verify-save-status').textContent, /kept refusing after several minutes/);
  assert.equal(S._vlibSkip.size, 0);
  assert.ok(S.vlib.filter((r) => r._retry).length > 0);
  assert.equal(t.run('_libVerifying'), false);
});

test('request starts are paced so the provider limit is not walked into', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 12 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
  }));
  S._vlibSkip = new Set();
  t.c.confirmIdeaChange = async () => true;
  t.c._writeVerdict = async () => {};
  // The waits are recorded instead of slept through.
  t.c.__waits = [];
  t.run('_minIntervalMs=6000;_lastVerifyAt=0;_throttleWait=async(ms)=>{__waits.push(ms)}');
  t.c._verifyBatch = async (_store, items) => ({
    verified: items.map((it) => ({
      name: it.name,
      verdict: 'unsupported',
      note: 'No evidence found.',
    })),
  });
  await t.run('runLibVerify()');
  const waits = t.run('__waits');
  assert.ok(waits.length >= 2, `expected the later requests to be spaced, saw ${waits}`);
  assert.ok(
    waits.every((ms) => ms > 0 && ms <= 6000),
    `each gap stays inside the interval, saw ${waits}`
  );
});

test('a stopped run accounts for every claim it attempted', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 8 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
  }));
  S._vlibSkip = new Set();
  t.c.confirmIdeaChange = async () => true;
  t.c._writeVerdict = async () => {};
  // Every request refuses, and a non-throttle failure makes the batch split, so
  // some halves are abandoned mid-flight when the breaker stops the run.
  t.c._verifyBatch = async () => {
    throw Object.assign(new Error('The model stopped without a complete answer'), {
      status: 502,
      code: 'generation_stopped',
    });
  };
  await t.run('runLibVerify()');
  const status = t.element('verify-save-status').textContent;
  // Zeroes are omitted from the report, so a missing phrase means zero.
  const num = (re) => {
    const m = re.exec(status);
    return m ? Number(m[1]) : 0;
  };
  const checked = num(/Checked (\d+)/);
  const failed = num(/(\d+) couldn't be checked/);
  const notStarted = num(/(\d+) not started/);
  assert.equal(checked, 8);
  assert.equal(failed + notStarted, checked, `report must reconcile: ${status}`);
  assert.equal(
    S.vlib.filter((r) => !r._retry).length,
    0,
    'every claim is either finished or explicitly retryable'
  );
});

test('a rate-limited batch is waited out and then finishes the run', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 4 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
  }));
  S._vlibSkip = new Set();
  let calls = 0;
  t.c.confirmIdeaChange = async () => true;
  t.c._writeVerdict = async () => {};
  // The real wait is a timer; tests substitute it so no timer ever runs.
  t.run('_throttleWait=async()=>{}');
  t.c._verifyBatch = async (_store, items) => {
    calls++;
    if (calls === 1)
      throw Object.assign(new Error('Resource has been exhausted'), {
        status: 502,
        code: 'provider_throttled',
      });
    return {
      verified: items.map((it) => ({
        name: it.name,
        verdict: 'unsupported',
        note: 'No evidence found.',
      })),
    };
  };
  await t.run('runLibVerify()');
  assert.equal(calls, 2, 'the same batch is retried after the wait');
  assert.equal(S._vlibSkip.size, 4, 'the run completes instead of stopping');
  const status = t.element('verify-save-status').textContent;
  assert.match(status, /Checked 4 · saved 4/);
  assert.doesNotMatch(status, /Stopped:/);
});

test("giving up on rate limiting keeps the provider's own reason", async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = [{ id: 'a', name: 'Claim A', store: 'research' }];
  S._vlibSkip = new Set();
  t.c.confirmIdeaChange = async () => true;
  t.c._writeVerdict = async () => {};
  t.run('THROTTLE_WAITS.length=0');
  t.c._verifyBatch = async () => {
    throw Object.assign(new Error('Resource has been exhausted (check quota)'), {
      status: 502,
      code: 'provider_throttled',
    });
  };
  await t.run('runLibVerify()');
  assert.match(S.vlib[0]._checkError, /Resource has been exhausted \(check quota\)/);
});

test('a run records one cost entry for all of its requests', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 8 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
  }));
  S._vlibSkip = new Set();
  const posts = [];
  t.c.confirmIdeaChange = async () => true;
  t.c._writeVerdict = async () => {};
  t.c._postJSON = async (url, body) => {
    posts.push({ url, body });
    if (url.includes('cost-log')) return { logged: true };
    return {
      verified: body.items.map((it) => ({
        name: it.name,
        verdict: 'unsupported',
        note: 'No evidence found.',
      })),
      model: 'fixture-model',
      usage: { inputTokens: 100, outputTokens: 20 },
      costUsd: 0.001,
    };
  };
  await t.run('runLibVerify()');
  const verify = posts.filter((p) => p.url.includes('web-research'));
  const cost = posts.filter((p) => p.url.includes('cost-log'));
  assert.equal(verify.length, 2, 'eight claims is two requests');
  assert.equal(cost.length, 1, 'one cost entry per run, not per request');
  // The body was built inside the vm realm, so compare by value, not prototype.
  assert.deepEqual(JSON.parse(JSON.stringify(cost[0].body)), {
    task: 'fact-check',
    requests: 2,
    model: 'fixture-model',
    usage: { inputTokens: 200, outputTokens: 40 },
    scope: 'Library',
    costUsd: 0.002,
  });
});

test('a merge previews first, unions the links, then archives the duplicates', async () => {
  const t = setup(),
    S = t.run('S');
  const MARKER = '\n[Nomad check v1]\n';
  const note = `AI check: Supported${MARKER}${JSON.stringify({ version: 1, ai: { verdict: 'confirmed', source_url: 'https://x', note: 'n' } })}`;
  const pages = {
    a: {
      id: 'a',
      last_edited_time: 't1',
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Cooking in a van' }] },
        'Source Video': { type: 'relation', relation: [{ id: 'vid1' }] },
        Category: { type: 'select', select: { name: 'Food' } },
        'Verify Note': { type: 'rich_text', rich_text: [{ plain_text: note }] },
        'Verify Status': { type: 'select', select: { name: 'confirmed' } },
      },
    },
    b: {
      id: 'b',
      last_edited_time: 't2',
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Cooking in a van on the road' }] },
        'Source Video': { type: 'relation', relation: [{ id: 'vid2' }] },
        Category: { type: 'select', select: { name: 'Drink' } },
        'Verify Note': { type: 'rich_text', rich_text: [] },
        'Verify Status': { type: 'select', select: null },
      },
    },
  };
  const writes = [];
  t.c.notionAPI = async (endpoint, method = 'GET', body) => {
    const id = endpoint.split('/')[1];
    if (method === 'PATCH') {
      writes.push({ id, body });
      return { ...pages[id], last_edited_time: 't3' };
    }
    return pages[id];
  };
  S.vlib = [
    { id: 'a', name: 'Cooking in a van', store: 'activities', fields: 'Category: Food' },
    { id: 'b', name: 'Cooking in a van on the road', store: 'activities', fields: '' },
  ];
  S._dupDismissed = new Set();
  await t.run('tidyVlib()');

  // First call previews and writes nothing.
  await t.run("mergeVlib('a',['a','b'])");
  assert.equal(writes.length, 0, 'nothing is written before confirming');
  const html = t.element('vlib-results').innerHTML;
  assert.match(html, /Merge 2 rows\?/);
  assert.match(html, /Will copy: 2 links in Source Video/);
  assert.match(html, /Category/);
  assert.match(html, /not<\/strong> be merged/);

  // Second call merges: the survivor holds both links before the other is archived.
  await t.run("mergeVlib('a',['a','b'])");
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0])), {
    id: 'a',
    body: { properties: { 'Source Video': { relation: [{ id: 'vid1' }, { id: 'vid2' }] } } },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(writes[1])), {
    id: 'b',
    body: { archived: true },
  });
  assert.equal(S.vlib.length, 1, 'the merged row leaves the list');
  assert.equal(S.vlib[0].id, 'a');
});

test('merge is offered only for small groups', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 5 }, (_, i) => ({
    id: `r${i}`,
    name: `Cooking in a van ${i}`,
    store: 'activities',
    fields: '',
  }));
  S._dupDismissed = new Set();
  await t.run('tidyVlib()');
  const html = t.element('vlib-results').innerHTML;
  assert.match(html, /similar/, 'the group is still reported');
  assert.doesNotMatch(
    html,
    /Merge into the most detailed/,
    'a five-row group is archived, not merged'
  );
});

test('a merge carries a check onto a survivor that has none', async () => {
  const t = setup(),
    S = t.run('S');
  const MARKER = '\n[Nomad check v1]\n';
  const note = `AI check: Supported${MARKER}${JSON.stringify({ version: 1, ai: { verdict: 'confirmed', source_url: 'https://x', note: 'n' } })}`;
  const pages = {
    a: {
      id: 'a',
      last_edited_time: 't1',
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Claim A' }] },
        'Verify Note': { type: 'rich_text', rich_text: [] },
        'Verify Status': { type: 'select', select: null },
      },
    },
    b: {
      id: 'b',
      last_edited_time: 't2',
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Claim A duplicate' }] },
        'Verify Note': { type: 'rich_text', rich_text: [{ plain_text: note }] },
        'Verify Status': { type: 'select', select: { name: 'confirmed' } },
      },
    },
  };
  const writes = [];
  t.c.notionAPI = async (endpoint, method = 'GET', body) => {
    const id = endpoint.split('/')[1];
    if (method === 'PATCH') {
      writes.push({ id, body });
      return { ...pages[id], last_edited_time: 't3' };
    }
    return pages[id];
  };
  S.vlib = [
    { id: 'a', name: 'Claim A', store: 'research', fields: '' },
    { id: 'b', name: 'Claim A duplicate', store: 'research', fields: '' },
  ];
  S._dupDismissed = new Set();
  await t.run('tidyVlib()');
  await t.run("mergeVlib('a',['a','b'])");
  await t.run("mergeVlib('a',['a','b'])");
  const props = JSON.parse(JSON.stringify(writes[0].body.properties));
  assert.equal(props['Verify Status'].select.name, 'confirmed');
  assert.match(props['Verify Note'].rich_text[0].text.content, /Nomad check v1/);
});

// Duplicate review: the mode declares itself, groups say why they are grouped,
// and a judgement can be recorded instead of only acted on.
// A merge preview is a promise about the rows it read. A chain of look-alikes is
// not the same claim, and an edit in Notion since the preview must stop the write.
function mergeFixture(t, names, fields) {
  const pages = Object.fromEntries(
    names.map((name, i) => [
      `p${i}`,
      {
        id: `p${i}`,
        last_edited_time: `t${i + 1}`,
        properties: {
          Name: { type: 'title', title: [{ plain_text: name }] },
          'Source Video': { type: 'relation', relation: [{ id: `vid${i}` }] },
        },
      },
    ])
  );
  const writes = [];
  t.c.notionAPI = async (endpoint, method = 'GET', body) => {
    const id = endpoint.split('/')[1];
    if (method === 'PATCH') {
      writes.push({ id, body });
      return { ...pages[id], last_edited_time: 'written' };
    }
    return pages[id];
  };
  t.run(
    `S.vlib=${JSON.stringify(names.map((name, i) => ({ id: `p${i}`, name, store: 'activities', fields: fields?.[i] ?? '' })))};S._dupDismissed=new Set()`
  );
  return { pages, writes };
}

test('a merge refuses a row that changed in Notion after the preview', async () => {
  const t = setup(),
    S = t.run('S');
  const { pages, writes } = mergeFixture(
    t,
    ['Cooking in a van', 'Cooking in a van on the road'],
    ['Category: Food', '']
  );
  await t.run('tidyVlib()');
  await t.run("mergeVlib('p0',['p0','p1'])");
  // Someone edits the duplicate in Notion while the preview sits on screen.
  pages.p1.last_edited_time = 'edited-elsewhere';
  await t.run("mergeVlib('p0',['p0','p1'])");
  assert.equal(writes.length, 0, 'a preview that no longer describes the rows writes nothing');
  assert.equal(S.vlib.length, 2, 'both rows stay listed and selectable');
  assert.equal(S._vlibMergePending, null, 'the stale preview is cleared');
});

test('a merge that cannot archive a duplicate keeps it listed instead of hiding it', async () => {
  const t = setup(),
    S = t.run('S');
  const { writes } = mergeFixture(t, ['Cooking in a van', 'Cooking in a van on the road']);
  const allowed = t.c.notionAPI;
  t.c.notionAPI = async (endpoint, method = 'GET', body) => {
    if (method === 'PATCH' && endpoint === 'pages/p1')
      throw Object.assign(new Error('Notion refused the write'), { status: 500 });
    return allowed(endpoint, method, body);
  };
  const quiet = console.error;
  console.error = () => {};
  try {
    await t.run('tidyVlib()');
    await t.run("mergeVlib('p0',['p0','p1'])");
    await t.run("mergeVlib('p0',['p0','p1'])");
  } finally {
    console.error = quiet;
  }
  assert.equal(
    writes.filter((w) => w.id === 'p0').length,
    1,
    'the survivor kept its unioned links'
  );
  assert.equal(S.vlib.length, 2, '"still listed" has to mean still listed');
  assert.deepEqual(
    JSON.parse(JSON.stringify(S.vlib.map((r) => r.id))).sort(),
    ['p0', 'p1'],
    'a duplicate that is still in Notion stays in the list'
  );
});

test('a chained look-alike group is shown but never merged', async () => {
  const t = setup(),
    S = t.run('S');
  // A~B and B~C, but A and C share only "cooking van": a merge would join them.
  S.vlib = [
    { id: 'a', name: 'cooking van kitchen pot', store: 'activities', fields: 'x' },
    { id: 'b', name: 'cooking van kitchen market', store: 'activities', fields: '' },
    { id: 'c', name: 'cooking van market fish', store: 'activities', fields: '' },
  ];
  S._dupDismissed = new Set();
  await t.run('tidyVlib()');
  const html = t.element('vlib-results').innerHTML;
  assert.match(html, /3 similar/, 'the chain is still reported as a group');
  assert.doesNotMatch(
    html,
    /Merge into the most detailed/,
    'a chained group is not offered a merge'
  );
  assert.match(html, /chained look-alikes/, 'and the view says why');
  // The guard has to hold for the direct call too, not just for the button.
  await t.run("mergeVlib('a',['a','b','c'])");
  assert.equal(S._vlibMergePending, null, 'no preview is built for a chained group');
  assert.equal(
    t.calls.filter((c) => /^pages\//.test(c.endpoint)).length,
    0,
    'nothing is even read for a group that cannot be merged'
  );
});

test('archiving is paced, and a rate-limited write is retried', async () => {
  const t = setup(),
    S = t.run('S');
  t.c.__waits = [];
  t.run('_notionWriteIntervalMs=1000;_notionWriteWait=async(ms)=>{__waits.push(ms)}');
  let patches = 0;
  t.c.notionAPI = async (endpoint, method = 'GET') => {
    const id = endpoint.split('/')[1];
    if (method === 'PATCH') {
      patches++;
      if (patches === 1) throw Object.assign(new Error('rate limited'), { status: 429 });
      return { id, last_edited_time: 't1' };
    }
    return { id, last_edited_time: 't1', properties: {} };
  };
  S.vlib = ['a', 'b'].map((id) => ({
    id,
    name: `Claim ${id}`,
    store: 'research',
    fields: '',
    lastEdited: 't1',
  }));
  S._vlibArch = new Set(['a', 'b']);
  S._vlibConfirm = true;
  await t.run("archiveVlib(document.getElementById('archive'))");
  assert.equal(patches, 3, 'the refused write was retried, then the second row went through');
  assert.equal(S.vlib.length, 0, 'both rows archived');
  assert.ok(t.run('__waits').length >= 1, 'writes are spaced instead of fired together');
});

test('a persistently refused archive stops instead of failing every row', async () => {
  const t = setup(),
    S = t.run('S');
  t.run('_notionWriteIntervalMs=0;_notionWriteWait=async()=>{}');
  let patches = 0;
  t.c.notionAPI = async (endpoint, method = 'GET') => {
    const id = endpoint.split('/')[1];
    if (method === 'PATCH') {
      patches++;
      throw Object.assign(new Error('Notion is refusing writes'), { status: 500 });
    }
    return { id, last_edited_time: 't1', properties: {} };
  };
  S.vlib = Array.from({ length: 12 }, (_, i) => ({
    id: `r${i}`,
    name: `Claim ${i}`,
    store: 'research',
    fields: '',
    lastEdited: 't1',
  }));
  S._vlibArch = new Set(S.vlib.map((r) => r.id));
  S._vlibConfirm = true;
  const quiet = console.error;
  console.error = () => {};
  try {
    await t.run("archiveVlib(document.getElementById('archive'))");
  } finally {
    console.error = quiet;
  }
  assert.ok(patches <= 6, `the breaker stops early instead of hammering 12 rows, saw ${patches}`);
  assert.equal(S.vlib.length, 12, 'every row is still listed and retryable');
});

test('a paid run refuses to start while another tab holds the lease', async () => {
  const t = setup(),
    S = t.run('S');
  const store = new Map();
  t.c.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  store.set(
    'nomad-paid-run',
    JSON.stringify({ id: 'other-tab', at: Date.now(), label: 'A fact-check run' })
  );
  S.vlib = [{ id: 'row-1', name: 'Claim', store: 'research' }];
  S._vlibSkip = new Set();
  // If the lease check ever regresses, the run must fail here rather than walk
  // into the real confirmation dialog and hang the suite.
  t.c.confirmIdeaChange = async () => true;
  t.c._writeVerdict = async () => {};
  let requests = 0;
  t.c._verifyBatch = async () => {
    requests++;
    return { verified: [] };
  };
  await t.run('runLibVerify()');
  assert.equal(requests, 0, 'the second tab never spends on the same claims');
  assert.match(t.element('verify-save-status').textContent, /another tab/i);
  assert.equal(t.run('_libVerifying'), false);
});

test('an expired lease is reclaimed, held for the run, then released', async () => {
  const t = setup(),
    S = t.run('S');
  const store = new Map();
  t.c.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  store.set('nomad-paid-run', JSON.stringify({ id: 'dead-tab', at: 0, label: 'A fact-check run' }));
  S.vlib = [{ id: 'row-1', name: 'Claim', store: 'research' }];
  S._vlibSkip = new Set();
  t.c.confirmIdeaChange = async () => true;
  t.c._writeVerdict = async () => {};
  let leaseHeld = false;
  t.c._verifyBatch = async (_store, items) => {
    leaseHeld = store.has('nomad-paid-run');
    return {
      verified: items.map((it) => ({ name: it.name, verdict: 'unsupported', note: 'n' })),
    };
  };
  await t.run('runLibVerify()');
  assert.equal(leaseHeld, true, 'the run holds the lease while it spends');
  assert.equal(store.get('nomad-paid-run'), undefined, 'and releases it when the run ends');
});

test('the duplicate view names itself, explains each group, and offers bulk and dismiss', async () => {
  const t = setup(),
    S = t.run('S');
  const notes = new Map();
  t.c.localArtifact = async (key, value) => {
    if (value !== undefined) {
      notes.set(key, value);
      return value;
    }
    return notes.get(key) ?? null;
  };
  S.vlib = [
    { id: 'a', name: 'Cooking in a van kitchen', store: 'activities', fields: 'Category: Food' },
    { id: 'b', name: 'Cooking in a van on the road', store: 'activities', fields: '' },
    { id: 'c', name: 'Mount Fuji sunrise', store: 'activities', fields: 'Category: Nature' },
  ];
  await t.run('tidyVlib()');
  let html = t.element('vlib-results').innerHTML;
  assert.match(html, />Duplicates</, 'the mode says what it is');
  assert.match(html, /Back to claims/, 'and how to leave');
  assert.match(html, /shares “[^”]*cooking[^”]*”/, 'the group says why it is grouped');
  assert.match(html, /Keep the most detailed, tick the other 1/);
  assert.match(html, /Same claim\?/);

  // The bulk action picks the keeper — the row carrying more detail.
  await t.run("tickCluster('a',['a','b'])");
  assert.deepEqual([...t.run('S._vlibArch')], ['b']);

  // Dismissing the pair hides the group on this device, and undo brings it back.
  await t.run("dismissCluster(['a','b'])");
  html = t.element('vlib-results').innerHTML;
  assert.doesNotMatch(html, /shares “/, 'a dismissed group is not asked about again');
  assert.match(html, /1 groups dismissed on this device/);
  await t.run('undismissAll()');
  html = t.element('vlib-results').innerHTML;
  assert.match(html, /shares “/, 'undo restores the question');
  assert.doesNotMatch(html, /groups dismissed/);
});

test('a paid finding still reaches Notion when this browser cannot keep a copy', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = [{ id: 'a', name: 'Claim A', store: 'research' }];
  S._vlibSkip = new Set();
  let writes = 0;
  t.c.confirmIdeaChange = async () => true;
  // Local storage refuses everything, as it would when the quota is exhausted.
  t.c.localArtifact = async () => {
    throw new Error('QuotaExceededError');
  };
  t.c._writeVerdict = async () => {
    writes++;
  };
  t.c._verifyBatch = async (_store, items) => ({
    verified: items.map((it) => ({
      name: it.name,
      verdict: 'unsupported',
      note: 'No evidence found.',
    })),
  });
  await t.run('runLibVerify()');
  assert.equal(writes, 1, 'the write to Notion happens anyway');
  assert.match(t.element('verify-save-status').textContent, /Checked 1 · saved 1/);
  assert.equal(S.vlib[0]._aiPending, null);
});

test('a failed local cleanup does not report a landed save as unsaved', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = [{ id: 'a', name: 'Claim A', store: 'research' }];
  S._vlibSkip = new Set();
  t.c.confirmIdeaChange = async () => true;
  // The draft writes fine but cannot be cleared afterwards.
  t.c.localArtifact = async (_key, value) => {
    if (value === null) throw new Error('clear failed');
    return value;
  };
  t.c._writeVerdict = async () => {};
  t.c._verifyBatch = async (_store, items) => ({
    verified: items.map((it) => ({
      name: it.name,
      verdict: 'unsupported',
      note: 'No evidence found.',
    })),
  });
  await t.run('runLibVerify()');
  const row = S.vlib[0];
  assert.equal(row._aiPending, null, 'the finding is done, not pending');
  assert.equal(row._checkError, '', 'a cleanup failure is not a save failure');
  const status = t.element('verify-save-status').textContent;
  assert.match(status, /saved 1/);
  assert.doesNotMatch(status, /couldn't be saved/);
});

test('a draft for a finding that already reached Notion is not resurrected', async () => {
  const t = setup(),
    S = t.run('S');
  const MARKER = '\n[Nomad check v1]\n';
  const finding = { verdict: 'unsupported', source_url: '', note: 'No evidence found.' };
  S.vlib = [
    {
      id: 'a',
      name: 'Claim A',
      store: 'research',
      status: 'unsupported',
      note: `AI check: No evidence found.${MARKER}${JSON.stringify({ version: 1, ai: finding })}`,
    },
  ];
  // A stale draft from the moment before the save landed.
  t.c.localArtifact = async (key) => (key.startsWith('verify-ai-pending:') ? finding : null);
  await t.run('restoreFactDrafts(S.vlib[0])');
  assert.equal(
    S.vlib[0]._aiPending,
    null,
    'Notion already holds this finding, so it is not shown as unsaved'
  );
});

test('a transient save failure is retried without paying the provider again', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = [{ id: 'a', name: 'Claim A', store: 'research' }];
  S._vlibSkip = new Set();
  let checks = 0,
    writes = 0;
  t.c.confirmIdeaChange = async () => true;
  t.c._verifyBatch = async (_store, items) => {
    checks++;
    return {
      verified: items.map((it) => ({
        name: it.name,
        verdict: 'unsupported',
        note: 'No evidence found.',
      })),
    };
  };
  t.c._writeVerdict = async () => {
    writes++;
    if (writes < 3) throw new Error('fetch failed');
  };
  await t.run('runLibVerify()');
  assert.equal(checks, 1, 'the provider is asked once');
  assert.equal(writes, 3, 'the save is retried until it lands');
  assert.equal(S.vlib[0]._retry, false);
  assert.match(t.element('verify-save-status').textContent, /Checked 1 · saved 1/);
});

test('repeated save failures stop retrying instead of grinding through every claim', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 8 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
  }));
  S._vlibSkip = new Set();
  let checks = 0,
    writes = 0;
  t.c.confirmIdeaChange = async () => true;
  t.c._verifyBatch = async (_store, items) => {
    checks++;
    return {
      verified: items.map((it) => ({
        name: it.name,
        verdict: 'unsupported',
        note: 'No evidence found.',
      })),
    };
  };
  t.c._writeVerdict = async () => {
    writes++;
    throw new Error('fetch failed');
  };
  await t.run('runLibVerify()');
  assert.equal(checks, 2, 'the provider is asked once per batch');
  assert.ok(writes >= 3, `expected retries first, saw ${writes} writes`);
  assert.ok(writes < 8 * 3, `expected the breaker to stop trying, saw ${writes} writes`);
  assert.match(t.element('vlib-results').innerHTML, /Saving is paused/);
  assert.equal(S.vlib.filter((r) => r._retry).length, 0, 'a save failure is not a check failure');
});

test('list-editing tools live behind a disclosure, not in the decision row', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = [{ id: 'a', name: 'Claim A', store: 'research' }];
  S._vlibSkip = new Set();
  t.run('renderVlibResults()');
  const html = t.element('vlib-results').innerHTML;
  const open = html.indexOf('<details class="vlib-tools">');
  assert.ok(open !== -1, 'the list tools are grouped');
  const tools = html.slice(open, html.indexOf('</details>', open));
  assert.match(tools, /Tick unchecked/);
  assert.match(tools, /Tick shown/);
  assert.match(tools, /Ticking chooses what the next run checks/);
  // Deduplication belongs to the Library, where the material lives: a
  // destructive tool does not sit inside the panel that spends money.
  assert.doesNotMatch(tools, /Find duplicates/);
  // The old all-purpose advice paragraph is gone from the decision row.
  assert.doesNotMatch(html, /Suggested order/);
});

test('a large untidied selection points at the Library dedupe instead of offering it here', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 60 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
  }));
  S._vlibSkip = new Set();
  assert.match(t.run('factNextStep().hint'), /in the Library/);
});

test('the recommended action owns the only primary button, whoever it is', async () => {
  const t = setup(),
    S = t.run('S');
  // No failures: the guide recommends the standing button's own action, so it
  // reads as a sentence and the standing button stays primary.
  S.vlib = Array.from({ length: 25 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
  }));
  S._vlibSkip = new Set();
  t.run('renderVlibResults()');
  let html = t.element('vlib-results').innerHTML;
  assert.equal((html.match(/btn-primary/g) || []).length, 1, 'exactly one primary action');
  assert.match(html, /Next:<\/strong> Check 25 ticked claims/);
  assert.match(html, /Check ticked \(25\) · API/);
  assert.doesNotMatch(html, /onclick="runLibVerify\(this,'all'\)"/);

  // A failed check is a different action, so the guide owns the primary button
  // and the standing button drops to plain — still exactly one primary.
  S.vlib[0]._retry = true;
  t.run('renderVlibResults()');
  html = t.element('vlib-results').innerHTML;
  assert.equal((html.match(/btn-primary/g) || []).length, 1, 'exactly one primary action');
  assert.match(html, /onclick="runLibVerify\(this,'failed'\)"/);
  assert.match(html, /Check ticked \(25\) · API/);
});

test('a selection does not offer the same action twice', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 5 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
  }));
  S._vlibSkip = new Set();
  t.run('renderVlibResults()');
  const html = t.element('vlib-results').innerHTML;
  assert.equal((html.match(/btn-primary/g) || []).length, 1, 'exactly one primary action');
  // Below the limit the guide's action is the standing button's action, so the
  // guide reads as a sentence instead of rendering a second button for it.
  assert.match(html, /Next:<\/strong> Check 5 ticked claims/);
  assert.doesNotMatch(html, /onclick="runLibVerify\(this,'all'\)"/);
});

test('a timeout shrinks the working batch for the rest of the run', async () => {
  const t = setup(),
    S = t.run('S'),
    max = t.run('FACT_BATCH_MAX');
  S.vlib = Array.from({ length: 40 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
  }));
  S._vlibSkip = new Set();
  const sizes = [];
  let calls = 0;
  t.c.confirmIdeaChange = async () => true;
  t.c._writeVerdict = async () => {};
  t.c._verifyBatch = async (_store, items) => {
    calls++;
    sizes.push(items.length);
    if (calls <= 3) throw Object.assign(new Error('Search took too long'), { status: 504 });
    return {
      verified: items.map((it) => ({
        name: it.name,
        verdict: 'unsupported',
        note: 'No evidence found.',
      })),
    };
  };
  // mode 'all' so the run is not capped by FACT_RUN_LIMIT: this test needs
  // enough batches for a mid-run adjustment to be visible.
  await t.run("runLibVerify(null,'all')");
  assert.ok(sizes.includes(max), `expected a run that starts at the cap, saw ${sizes}`);
  assert.ok(
    sizes.some((s) => s < max),
    `expected a smaller batch after the timeout, saw ${sizes}`
  );
  assert.equal(S.vlib.filter((r) => r._retry).length, 0);
  assert.equal(S._vlibSkip.size, 40);
});

test('retrying failed checks uses single-claim requests and separates run scope from selection', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 10 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
    _retry: i < 2,
  }));
  S._vlibSkip = new Set();
  const batches = [];
  t.c.confirmIdeaChange = async () => true;
  t.c._writeVerdict = async () => {};
  t.c._verifyBatch = async (_store, items) => {
    batches.push(items.length);
    return {
      verified: items.map((it) => ({
        name: it.name,
        verdict: 'unsupported',
        note: 'No evidence.',
      })),
    };
  };
  await t.run("runLibVerify(null,'failed')");
  assert.deepEqual(batches, [1, 1]);
  assert.match(t.element('verify-save-status').textContent, /Checked 2 · saved 2/);
  assert.match(t.element('verify-save-status').textContent, /8 claims are still ticked/);
});

test('stopping fact-checks finishes only the in-flight group and retains unattempted work', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 9 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
  }));
  S._vlibSkip = new Set();
  let calls = 0;
  t.c.confirmIdeaChange = async () => true;
  t.c._writeVerdict = async () => {};
  t.c._verifyBatch = async (_store, items) => {
    calls++;
    t.run('_stopFactCheck=true');
    return {
      verified: items.map((it) => ({
        name: it.name,
        verdict: 'unsupported',
        note: 'No evidence.',
      })),
    };
  };
  await t.run('runLibVerify()');
  assert.equal(calls, 1);
  assert.equal(S._vlibSkip.size, 4);
  assert.match(t.element('verify-save-status').textContent, /5 not started/);
  assert.match(t.element('verify-save-status').textContent, /Stopped by you/);
  assert.equal(t.run('_libVerifying'), false);
});

test('malformed findings lists stop the batch cleanly without overwriting saved records', async () => {
  const t = factFixture();
  t.c._verifyBatch = async () => ({ verified: 'not an array' });
  await t.run('runLibVerify()');
  assert.match(t.r._checkError, /invalid findings list/);
  assert.equal(t.calls.length, 0);
  assert.equal(t.run('_libVerifying'), false);
});

test('toggling a checkbox re-renders without snapping the scrolled view to the top', () => {
  const t = setup();
  t.run(`
    document.body = { children: [{ children: [{ scrollTop: 140, scrollLeft: 6, children: [] }] }] };
    _preserveScroll(() => {
      document.body.children[0].children[0] = { scrollTop: 0, scrollLeft: 0, children: [] };
    });
  `);
  const restored = t.run('document.body.children[0].children[0]');
  assert.equal(restored.scrollTop, 140);
  assert.equal(restored.scrollLeft, 6);
});

test('claim toggles still flip selection when a page body exists', () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = [{ id: 'row-1', name: 'Claim', store: 'research' }];
  S._vlibSkip = new Set();
  t.run('document.body = { children: [] }');
  t.run("toggleVlib('row-1')");
  assert.equal(S._vlibSkip.has('row-1'), true);
  t.run("toggleVlib('row-1')");
  assert.equal(S._vlibSkip.has('row-1'), false);
});

test('next-step guide prioritises saves, failures, checks, selection, then review', () => {
  const t = setup(),
    S = t.run('S');
  const row = (id, extra = {}) => ({ id, name: `Claim ${id}`, store: 'research', ...extra });
  S.vlib = [row('a')];
  S._vlibSkip = new Set();
  assert.match(t.run('factNextStep().label'), /Check 1 ticked claim/);
  S.vlib = Array.from({ length: 25 }, (_, i) => row(`r${i}`));
  assert.match(t.run('factNextStep().label'), /Check 25 ticked claims/);
  S.vlib[0]._retry = true;
  assert.match(t.run('factNextStep().label'), /Retry 1 failed check/);
  S.vlib[1]._aiPending = { verdict: 'unsupported', note: 'x' };
  assert.match(t.run('factNextStep().label'), /Retry 1 interrupted save/);
  S.vlib = [row('a')];
  S._vlibSkip = new Set(['a']);
  assert.match(t.run('factNextStep().label'), /Select 1 unchecked claim/);
  S.vlib = [row('a', { status: 'confirmed' })];
  assert.match(t.run('factNextStep().label'), /Everything here is checked/);
  assert.match(t.run('factNextStep().hint'), /unticking is never needed/i);
});

test('check-all mode processes every selected claim in batches with one confirmation', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 9 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
  }));
  S._vlibSkip = new Set();
  const batches = [];
  let confirmations = 0;
  t.c.confirmIdeaChange = async () => {
    confirmations++;
    return true;
  };
  t.c._writeVerdict = async () => {};
  t.c._verifyBatch = async (_store, items) => {
    batches.push(items.length);
    return {
      verified: items.map((it) => ({
        name: it.name,
        verdict: 'unsupported',
        note: 'No evidence.',
      })),
    };
  };
  await t.run("runLibVerify(null,'all')");
  assert.equal(confirmations, 1);
  assert.deepEqual(batches, [4, 4, 1]);
  assert.equal(S._vlibSkip.size, 9);
  assert.equal(t.run('_libVerifying'), false);
});

test('the guide offers a free bulk retry for interrupted saves', async () => {
  const t = factFixture();
  t.run(
    "fact._retry=true;fact._aiPending={verdict:'unsupported',note:'Checked.',source_url:'',as_of_date:'',corrected_value:'',model:'m',checkedAt:'2026-09-13'}"
  );
  assert.match(t.run('factNextStep().label'), /Retry 1 interrupted save/);
  await t.run('retryAllFactSaves()');
  assert.equal(t.run('fact._aiPending'), null);
  assert.match(t.run('factNextStep().label'), /Everything here is checked/);
});
