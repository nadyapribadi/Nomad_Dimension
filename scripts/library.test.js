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
            : text(p.properties[f.property]) === f.rich_text.equals
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
