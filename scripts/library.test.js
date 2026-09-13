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

test('fact-check generation makes a review proposal without writing original material', async () => {
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
  assert.equal(t.calls.filter((c) => c.method === 'PATCH').length, 0);
  assert.ok(S.vlib[0]._proposal);
  t.c.key = item.material.id;
  await t.run("saveVerdictProposal(key,document.getElementById('save'))");
  assert.equal(t.calls.filter((c) => c.method === 'PATCH').length, 1);
  assert.equal(S.vlib[0]._proposal, null);
});

test('depleted credits stop later fact-check groups and preserve completed suggestions and pending rows', async () => {
  const t = setup(),
    S = t.run('S');
  S.vlib = Array.from({ length: 12 }, (_, i) => ({
    id: `row-${i}`,
    name: `Claim ${i}`,
    store: 'research',
    fields: 'Context',
  }));
  S._vlibSkip = new Set();
  let calls = 0;
  t.c._verifyBatch = async (store, items) => {
    calls++;
    if (calls === 2) throw new Error('Your prepayment credits are depleted.');
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
  assert.equal(calls, 2);
  assert.equal(S.vlib.filter((r) => r._proposal).length, 4);
  assert.equal(S.vlib.filter((r) => !S._vlibSkip.has(r.id)).length, 8);
  assert.equal(t.calls.filter((c) => c.method === 'PATCH').length, 0);
  assert.match(t.element('verify-save-status').textContent, /Checks stopped/);
  assert.match(t.element('verify-save-status').textContent, /8 rows remain selected/);
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
  await t.run("pushStore('glossary',null,'web')");
  assert.equal(t.calls.length, 0);
  t.run(
    "REVIEW.edits[candidate._key]={meaning:'Reviewed meaning'};REVIEW.decisions[candidate._key]='accepted'"
  );
  await t.run("pushStore('glossary',null,'web')");
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
  await t.run("pushStore('glossary',null,'web')");
  assert.equal(t.pages.size, 1);
  assert.equal(t.run("poolFor('glossary','web').length"), 1);
  await t.run("pushStore('glossary',null,'web')");
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
  await t.run("pushStore('glossary',null,'web')");
  assert.equal(t.pages.size, 1);
  assert.equal(
    [...t.local.entries()].some(([k, v]) => k.startsWith('material-create-v2:') && !!v),
    true
  );
  t.c.before = null;
  await t.run("pushStore('glossary',null,'web')");
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
  await t.run("pushStore('glossary',null,'web')");
  assert.equal(t.pages.size, 1);
  await t.run("pushStore('glossary',null,'web')");
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

test('configuration failures stop fact-check groups and retain unfinished selections', async () => {
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
  assert.equal(calls, 1);
  assert.equal(S._vlibSkip.size, 0);
  assert.match(t.element('verify-save-status').textContent, /Configuration missing/);
  assert.match(t.element('verify-save-status').textContent, /9 rows remain selected/);
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
  await t.run("pushStore('glossary',null,'web')");
  assert.ok([...t.local.entries()].some(([k, v]) => k.startsWith('material-create-v2:') && v));
  await t.run("pushStore('glossary',null,'web')");
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
