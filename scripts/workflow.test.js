'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\ninit\(\);\s*$/, '\n');
function setup() {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        id,
        value: '',
        checked: false,
        style: {},
        dataset: {},
        options: [],
        textContent: '',
        innerHTML: '',
        disabled: false,
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {},
        querySelectorAll() {
          return [];
        },
        appendChild() {},
        replaceChildren() {
          this.innerHTML = '';
        },
        focus() {},
      });
    return elements.get(id);
  };
  const context = vm.createContext({
    console,
    Blob,
    TextEncoder,
    Uint8Array,
    DataView,
    URL,
    AbortController,
    setTimeout: () => 0,
    clearTimeout() {},
    confirm: () => true,
    document: {
      getElementById: element,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => element(`new-${elements.size}`),
    },
    navigator: {},
    location: {},
    Audio: class {},
    atob,
    btoa,
  });
  vm.runInContext(source, context);
  const run = (code) => vm.runInContext(code, context);
  // Confirmation dialogs are accepted in tests, exactly like `confirm`.
  run('confirmIdeaChange=async()=>true');
  run(
    `localArtifact = async (key,value) => { if (value !== undefined) localStore.set(key,value); return localStore.get(key); };`
  );
  context.localStore = new Map();
  const S = run('S');
  const db = run('DB_IDS');
  let serial = 0,
    failSection = false;
  const pages = new Map(),
    calls = [];
  const text = (p) =>
    (p?.title || p?.rich_text || []).map((x) => x.plain_text ?? x.text?.content ?? '').join('');
  context.notionAPI = async (endpoint, method = 'GET', body) => {
    calls.push({ endpoint, method, body });
    if (endpoint === 'pages' && method === 'POST') {
      if (body.parent.database_id === db.scripts && failSection) {
        failSection = false;
        throw new Error('simulated section write failure');
      }
      for (const prop of Object.values(body.properties))
        for (const rt of prop.rich_text || prop.title || [])
          assert.ok(rt.text.content.length <= 2000);
      const id = String(++serial).padStart(32, '0');
      const page = {
        id,
        url: `https://notion.so/${id}`,
        parent: body.parent,
        properties: body.properties,
        children: body.children || [],
      };
      pages.set(id, page);
      return page;
    }
    const query = endpoint.match(/^databases\/([^/]+)\/query$/);
    if (query) {
      let results = [...pages.values()].filter((p) => p.parent.database_id === query[1]);
      if (body?.filter)
        results = results.filter(
          (p) =>
            text(p.properties[body.filter.property]) ===
            (body.filter.title || body.filter.rich_text).equals
        );
      return { results, has_more: false };
    }
    const pageId = endpoint.match(/^pages\/([^/]+)$/)?.[1];
    if (pageId) {
      const page = pages.get(pageId);
      if (!page) throw new Error('missing page');
      if (method === 'PATCH') Object.assign(page.properties, body.properties);
      return page;
    }
    const blockId = endpoint.match(/^blocks\/([^/]+)\/children/)?.[1];
    if (blockId) {
      if (method === 'PATCH') {
        pages.get(blockId).children.push(...body.children);
        return {};
      }
      return { results: pages.get(blockId)?.children || [], has_more: false };
    }
    if (endpoint.startsWith('blocks/')) return {};
    throw new Error(`unhandled ${method} ${endpoint}`);
  };
  run('writeAppState = async () => {}; restoringDraft = true;');
  for (const [id, value] of Object.entries({
    'ep-series': 'Japan Unfiltered',
    'ep-number': '1',
    'ep-title-custom': 'A quiet morning',
    'ep-concept': 'How does this town wake up?',
    'ep-country': 'Japan',
    'ep-tone': 'Reflective',
  }))
    element(id).value = value;
  S.lookups.sections = ['Intro', 'Food Stop', 'Outro'];
  S.lookups.tones = ['Reflective'];
  return {
    context,
    run,
    S,
    db,
    element,
    pages,
    calls,
    failNextSection() {
      failSection = true;
    },
  };
}
test('Episode Builder uses its own renderer and preserves material evidence in saved section briefs', async () => {
  const h = setup();
  h.run("epTemplate('blank')");
  assert.match(h.element('ep-sections').innerHTML, /Section title/);
  assert.equal(h.element('sections-area').innerHTML, '');
  const sec = h.S.ep.sections[0];
  h.S.ep.assign['research:source'] = sec.id;
  h.S.ep._items['research:source'] = {
    _cat: 'research',
    _name: 'Morning market',
    detail: 'Opens 06:00',
    url: 'https://example.org',
    verdict: 'confirmed',
  };
  // No relation writes in this isolated case; the source is a real stored record.
  const source = await h.context.notionAPI('pages', 'POST', {
    parent: { database_id: h.db.research },
    properties: { Statement: { title: [{ text: { content: 'Morning market' } }] } },
  });
  h.S.ep._items['research:source'].id = source.id;
  await h.run('createEpisode()');
  assert.equal(h.S.ep.complete, true);
  const rows = [...h.pages.values()].filter((p) => p.parent.database_id === h.db.scripts);
  assert.equal(rows.length, 2);
  assert.match(rows[0].properties['Section Brief'].rich_text[0].text.content, /Opens 06:00/);
  assert.match(
    rows[0].properties['Section Brief'].rich_text[0].text.content,
    /https:\/\/example.org/
  );
});
test('failed section creation remains incomplete; retry reuses the episode and creates no duplicate sections', async () => {
  const h = setup();
  h.run("epTemplate('blank')");
  h.failNextSection();
  await h.run('createEpisode()');
  assert.equal(h.S.ep.complete, undefined);
  assert.match(h.element('ep-create-result').textContent, /Not complete/);
  await h.run('createEpisode()');
  assert.equal(h.S.ep.complete, true);
  assert.equal(
    [...h.pages.values()].filter((p) => p.parent.database_id === h.db.episodes).length,
    1
  );
  assert.equal(
    [...h.pages.values()].filter((p) => p.parent.database_id === h.db.scripts).length,
    2
  );
  await h.run('createEpisode()');
  assert.equal(
    [...h.pages.values()].filter((p) => p.parent.database_id === h.db.scripts).length,
    2
  );
});
test('reloading script joins all rich-text chunks and restores persisted tone/voice', async () => {
  const h = setup();
  h.S.activeEpisode = 'EP';
  await h.context.notionAPI('pages', 'POST', {
    parent: { database_id: h.db.scripts },
    properties: {
      Episode: { rich_text: [{ text: { content: 'EP' } }] },
      'Dialogue Content': {
        rich_text: [{ text: { content: 'KAI: first\n' } }, { text: { content: 'MIA: second' } }],
      },
      Notes: {
        rich_text: [
          {
            text: {
              content: 'Nomad settings: {"tone":"Quiet","voiceConfig":"Mia solo"}\nOperator note',
            },
          },
        ],
      },
      'Estimated Duration': { rich_text: [{ text: { content: '1:30' } }] },
    },
  });
  await h.run('loadSections()');
  assert.equal(h.S.sections[0].dialogue, 'KAI: first\nMIA: second');
  assert.equal(h.S.sections[0].duration, 1.5);
  assert.equal(h.S.sections[0].voiceConfig, 'Mia solo');
});
test('failed approval cannot leave a section locked or display success', async () => {
  const h = setup();
  h.S.sections = [{ id: 'sec', dialogue: 'KAI: hello', brief: 'brief', locked: false }];
  h.element('sec-edit-0').value = 'KAI: hello';
  h.element('sec-brief-0').value = 'brief';
  h.context.notionAPI = async () => {
    throw new Error('offline');
  };
  await h.run('lockSection(0)');
  assert.equal(h.S.sections[0].locked, false);
});
test('dialogue validation rejects an unlabelled model reply instead of assigning it to Kai', () => {
  const h = setup();
  assert.throws(() => h.run("validateDialogue('Here is your script')"), /KAI/);
  assert.equal(h.run("validateDialogue('**KAI:** hello\\nMIA: hi').length"), 2);
});
test('audio identity changes with text, version, episode, and voice settings', () => {
  const h = setup();
  h.S.activeEpisode = 'EP';
  h.element('kai-voice').value = 'voice';
  h.element('kai-speed').value = '1';
  const key = () => h.run("audioSpec({id:'sec',version:1},{speaker:'KAI',text:'hello'},0).key");
  const original = key();
  assert.notEqual(
    original,
    h.run("audioSpec({id:'sec',version:1},{speaker:'KAI',text:'changed'},0).key")
  );
  h.S.activeEpisode = 'EP2';
  assert.notEqual(original, key());
});
test('handoff saving creates a complete body and reuses it when retried', async () => {
  const h = setup();
  const ep = await h.context.notionAPI('pages', 'POST', {
    parent: { database_id: h.db.episodes },
    properties: { 'Episode Title': { title: [{ text: { content: 'EP' } }] } },
  });
  h.S.activeEpisode = 'EP';
  h.S.activeEpisodeId = ep.id;
  h.S.handoffDoc = {
    overview: 'a'.repeat(5000),
    places: 'Place evidence',
    sections: 'Full script',
    canva: 'Slides',
    thumbnail: 'Image',
    capcut: 'Guide',
    youtube_title_1: 'A',
    youtube_title_2: 'B',
    youtube_description: 'Description',
    youtube_tags: ['Japan'],
  };
  await h.run('saveHandoffToNotion()');
  const children = [...h.pages.values()].filter((p) => p.parent.page_id === ep.id);
  assert.equal(children.length, 1);
  assert.ok(children[0].children.length > 10);
  assert.equal(
    children[0].children
      .filter((b) => b.type === 'paragraph')
      .map((b) => b.paragraph.rich_text[0].text.content)
      .join('')
      .includes('a'.repeat(5000)),
    true
  );
  await h.run('saveHandoffToNotion()');
  assert.equal([...h.pages.values()].filter((p) => p.parent.page_id === ep.id).length, 1);
});
test('transcript chunking covers the complete source without gaps or silent tail loss', () => {
  const h = setup();
  h.context.transcript = 'first\n' + 'x'.repeat(27000) + '\nlast';
  assert.equal(h.run("transcriptChunks(transcript).join('')"), h.context.transcript);
  assert.ok(h.run('transcriptChunks(transcript).every(x=>x.length<=9001)'));
});
test('script rendering treats remote markup as text', () => {
  const h = setup();
  h.S.sections = [
    {
      id: 'sec',
      title: '<img src=x onerror=alert(1)>',
      type: 'Intro',
      brief: '</textarea><img src=x>',
      dialogue: 'KAI: <script>bad</script>',
      voiceConfig: 'Both',
      duration: 2,
    },
  ];
  h.run('renderSections()');
  const out = h.element('sections-area').innerHTML;
  assert.ok(!out.includes('<img'));
  assert.ok(out.includes('&lt;img'));
});
test('ZIP export has valid CRC, directory offsets, and reconstructs its files', async () => {
  const h = setup();
  const blob = h.run(
    "zipBytes([{name:'01.mp3',data:new TextEncoder().encode('audio')},{name:'script.txt',data:new TextEncoder().encode('KAI: hello')}])"
  );
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  assert.equal(bytes.readUInt32LE(bytes.length - 22), 0x06054b50);
  assert.equal(bytes.readUInt16LE(bytes.length - 12), 2);
  const central = bytes.readUInt32LE(bytes.length - 6);
  assert.equal(bytes.readUInt32LE(central), 0x02014b50);
  assert.equal(bytes.subarray(36, 41).toString(), 'audio');
});

test('partly saved episode freezes its section plan until the retry completes', async () => {
  const h = setup();
  h.run("epTemplate('blank')");
  h.failNextSection();
  await h.run('createEpisode()');
  const before = JSON.stringify(h.S.ep.sections);
  h.run(
    "addSection(); removeSection(S.ep.sections[0].id); editEpSection(S.ep.sections[0].id, 'brief', 'changed'); epTemplate('A');"
  );
  assert.equal(JSON.stringify(h.S.ep.sections), before);
  await h.run('createEpisode()');
  assert.equal(h.S.ep.complete, true);
});

test('generated dialogue remains recoverable when Notion saving fails', async () => {
  const h = setup();
  h.S.sections = [
    {
      id: 'section',
      title: 'Intro',
      brief: 'Evidence',
      dialogue: '',
      version: 0,
      duration: 1,
      tone: 'Quiet',
      voiceConfig: 'Both alternating',
      locked: false,
    },
  ];
  h.context.aiRun = async () => ({ text: 'KAI: A new morning.\nMIA: Let us look around.' });
  h.context.notionAPI = async () => {
    throw new Error('offline');
  };
  await h.run('generateDialogue(0)');
  assert.equal(h.S.sections[0].dialogue, '');
  assert.match(h.element('sec-edit-0').value, /A new morning/);
  assert.match(h.context.localStore.get('script-draft:section').dialogue, /A new morning/);
});

test('editing a section preserves its draft when another section triggers a render', async () => {
  const h = setup();
  h.S.sections = [
    {
      id: 'section',
      title: 'Intro',
      brief: 'Evidence',
      dialogue: 'KAI: Saved',
      version: 1,
      duration: 1,
      tone: 'Quiet',
      voiceConfig: 'Both alternating',
      locked: false,
    },
  ];
  h.run("editScriptDraft(0, 'dialogue', 'KAI: Unsaved change'); renderSections();");
  assert.match(h.element('sections-area').innerHTML, /KAI: Unsaved change/);
  assert.equal(h.S.sections[0].dialogue, 'KAI: Saved');
  await Promise.resolve();
  assert.equal(h.context.localStore.get('script-draft:section').dialogue, 'KAI: Unsaved change');
});

test('handoff identity changes when a saved section changes', () => {
  const h = setup();
  h.S.sections = [
    {
      id: 'sec',
      title: 'Intro',
      brief: 'Evidence',
      dialogue: 'KAI: Hello',
      version: 1,
      locked: true,
    },
  ];
  const before = h.run('handoffIdentity()');
  h.S.sections[0].dialogue = 'KAI: Changed';
  assert.notEqual(h.run('handoffIdentity()'), before);
});

test('ZIP uses the standard CRC32 polynomial', async () => {
  const h = setup();
  const blob = h.run("zipBytes([{name:'test.txt',data:new TextEncoder().encode('123456789')}])");
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.readUInt32LE(14), 0xcbf43926);
  const central = bytes.readUInt32LE(bytes.length - 6);
  assert.equal(bytes.readUInt32LE(central + 16), 0xcbf43926);
  assert.equal(bytes.readUInt32LE(central + 42), 0);
});

test('Maps enrichment needs explicit identity acceptance before changing precise location fields', async () => {
  const h = setup();
  h.S.extractedPlaces = [
    { name: 'Morning market', prefecture: 'Unknown', address: 'Original', google_maps_url: '' },
  ];
  h.context._afetch = async () => ({
    ok: true,
    json: async () => ({
      found: true,
      name: 'Candidate market',
      address: 'Candidate address',
      mapsUri: 'https://maps.google.com/?q=test',
      lat: 35,
      lng: 139,
    }),
  });
  h.context.renderPlacesReview = () => {};
  await h.run('enrichPlacesFromMaps()');
  assert.equal(h.S.extractedPlaces[0].address, 'Original');
  assert.equal(h.S.extractedPlaces[0].lat, undefined);
  h.run('acceptMapsMatch(0)');
  assert.equal(h.S.extractedPlaces[0].address, 'Candidate address');
  assert.equal(h.S.extractedPlaces[0].lat, 35);
});

test('audio retry generates only missing lines and restores the complete ordered export', async () => {
  const h = setup();
  h.S.activeEpisode = 'EP';
  h.S.sections = [
    { id: 'sec', title: 'Intro', dialogue: 'KAI: First\nMIA: Second', version: 1, locked: true },
  ];
  for (const host of ['kai', 'mia']) {
    h.element(`${host}-voice`).value = host;
    h.element(`${host}-speed`).value = '1';
  }
  h.context.openArtifactDB = async () => ({});
  let calls = 0;
  h.context.ttsAPI = async () => {
    calls++;
    if (calls === 2) throw new Error('temporary failure');
    return btoa('sample audio');
  };
  await h.run('renderAllAudio()');
  assert.match(h.element('audio-save-status').textContent, /1 failed/);
  await h.run('renderAllAudio()');
  assert.equal(calls, 3);
  assert.match(h.element('audio-save-status').textContent, /1 reused · 0 failed/);
  const files = await h.run('currentAudio()');
  assert.deepEqual(
    Array.from(files, (f) => f.filename),
    ['01-001-KAI.mp3', '01-002-MIA.mp3']
  );
});

test('a saved section plan can change before dialogue exists and survives reload', async () => {
  const h = setup();
  h.run("epTemplate('blank')");
  await h.run('createEpisode();');
  await h.run('loadSections();');
  h.run(
    "editPlanDraft(0, 'title', 'A question worth asking'); editPlanDraft(0, 'duration', '1.5'); editScriptDraft(0, 'brief', 'Source: https://example.org/report');"
  );
  await h.run('saveSectionPlan(0)');
  await h.run('loadSections()');
  assert.equal(h.S.sections[0].title, 'A question worth asking');
  assert.equal(h.S.sections[0].duration, 1.5);
  assert.equal(h.S.sections[0].dialogue, '');
  assert.match(h.S.sections[0].brief, /example.org/);
});

test('chat import requires a reviewed unchanged result and never writes approved content', async () => {
  const h = setup();
  h.S.sections = [
    {
      id: 'chat-section',
      title: 'Opening',
      dialogue: '',
      brief: 'Evidence',
      version: 0,
      locked: false,
      duration: 1,
    },
  ];
  h.run('openChatTask(0)');
  h.element('assist-result').value = 'KAI: A reviewed observation.';
  await h.run('applyChatImport()');
  assert.equal(h.S.sections[0].draftDialogue, undefined);
  h.run('previewChatImport()');
  await h.run('applyChatImport()');
  assert.equal(h.S.sections[0].draftDialogue, 'KAI: A reviewed observation.');
  assert.equal(h.S.sections[0].dialogue, '');
  assert.equal(h.S.sections[0].locked, false);
  assert.equal(h.calls.length, 0);
});

test('chat handoff refuses stale context even when returned dialogue is valid', () => {
  const h = setup();
  h.S.sections = [
    {
      id: 'chat-section',
      title: 'Opening',
      dialogue: '',
      brief: 'Evidence',
      version: 0,
      locked: false,
      duration: 1,
    },
  ];
  h.run('openChatTask(0)');
  h.element('assist-result').value = 'KAI: A valid line.';
  h.S.sections[0].draftBrief = 'Different source material';
  h.run('previewChatImport()');
  assert.match(h.element('assist-status').textContent, /section changed/);
  assert.equal(h.S.assist.reviewed, null);
});

test('saving dialogue detects a newer server version and preserves the local draft', async () => {
  const h = setup();
  h.run("epTemplate('blank')");
  await h.run('createEpisode()');
  await h.run('loadSections()');
  h.run("editScriptDraft(0, 'dialogue', 'KAI: My local draft.');");
  const sec = h.S.sections[0];
  h.pages.get(sec.id).properties['Dialogue Content'] = {
    rich_text: [{ text: { content: 'MIA: A newer saved version.' } }],
  };
  await assert.rejects(
    h.run("persistDialogue(S.sections[0], 'KAI: My local draft.', S.sections[0].brief)"),
    /another session/
  );
  assert.equal(h.S.sections[0].draftDialogue, 'KAI: My local draft.');
  assert.equal(
    h.pages.get(sec.id).properties['Dialogue Content'].rich_text[0].text.content,
    'MIA: A newer saved version.'
  );
});

test('episode snapshots distinguish local drafts and exclude credentials', () => {
  const h = setup();
  h.S.activeEpisode = 'Test episode';
  h.S.keys = { private: 'must-not-export' };
  h.S.sections = [
    {
      id: 'section',
      title: 'Opening',
      dialogue: 'KAI: Saved.',
      draftDialogue: 'MIA: Local edit.',
      brief: 'Source notes',
      version: 2,
      locked: false,
      duration: 1,
    },
  ];
  const data = h.run('episodeSnapshot()');
  assert.equal(data.status, 'draft');
  assert.equal(data.sections[0].dialogue, 'MIA: Local edit.');
  assert.equal(data.sections[0].saved.dialogue, 'KAI: Saved.');
  assert.equal(data.audioIncluded, false);
  assert.doesNotMatch(JSON.stringify(data), /must-not-export/);
});

test('late section loads cannot overwrite a different episode or newer local section edits', async () => {
  for (const switchEpisode of [true, false]) {
    const h = setup();
    h.S.activeEpisode = 'First';
    h.S.activeEpisodeId = 'first';
    h.S.sections = [{ id: 'local', dialogue: 'Draft' }];
    let release;
    h.context.notionQueryAll = () => new Promise((r) => (release = r));
    const load = h.run('loadSections()');
    if (switchEpisode) {
      h.S.activeEpisode = 'Second';
      h.S.activeEpisodeId = 'second';
      h.S.sections = [{ id: 'second', dialogue: 'Second draft' }];
    } else h.S.sections[0].draftDialogue = 'Newer local edits';
    release([
      {
        id: 'old',
        properties: { 'Section Title': { title: [{ text: { content: 'Old response' } }] } },
      },
    ]);
    await load;
    assert.equal(h.S.sections[0].id, switchEpisode ? 'second' : 'local');
    if (!switchEpisode) assert.equal(h.S.sections[0].draftDialogue, 'Newer local edits');
  }
});

test('late plan suggestions preserve a concept edited while the AI request was running', async () => {
  const h = setup();
  h.S.ep = { sections: [], assign: { selected: 'section' } };
  let release;
  h.context.aiRun = () => new Promise((r) => (release = r));
  const task = h.run("draftAngle(document.getElementById('draft-angle'))");
  h.element('ep-concept').value = 'My newer question';
  release({ text: JSON.stringify({ concept: 'Old generated question', hook: 'Old hook' }) });
  await task;
  assert.equal(h.element('ep-concept').value, 'My newer question');
  assert.notEqual(h.element('ep-hook').value, 'Old hook');
  assert.equal(h.element('draft-angle').disabled, false);
});

test('audio rendering captures voices and speed for the whole submitted batch', async () => {
  const h = setup();
  h.S.activeEpisode = 'Episode';
  h.S.sections = [
    { id: 'sec', title: 'Intro', dialogue: 'KAI: First\nMIA: Second', version: 1, locked: true },
  ];
  for (const host of ['kai', 'mia']) {
    h.element(`${host}-voice`).value = `${host}-original`;
    h.element(`${host}-speed`).value = '1';
  }
  h.context.openArtifactDB = async () => ({});
  let release, entered;
  const gate = new Promise((r) => (release = r)),
    waiting = new Promise((r) => (entered = r));
  const requests = [];
  h.context.ttsAPI = async (text, voice, speed) => {
    requests.push({ text, voice, speed });
    if (requests.length === 1) {
      entered();
      await gate;
    }
    return btoa('fake audio');
  };
  const render = h.run('renderAllAudio()');
  await waiting;
  h.element('mia-voice').value = 'new-voice';
  h.element('mia-speed').value = '1.5';
  release();
  await render;
  assert.equal(requests[1].voice, 'mia-original');
  assert.equal(requests[1].speed, 1);
  await assert.rejects(h.run('currentAudio()'), /current script and voice settings/);
  assert.equal(h.run('renderingAudio'), false);
});

test('Places cannot replace or edit the submitted review while its save is running', async () => {
  const h = setup();
  h.run("S.extractedPlaces=[{name:'Submitted place',from:[]}];_savingPlaces=true");
  h.run("setPlaceField(0,'name','Later edit')");
  await h.run('extractPlaces()');
  h.run('matchCurrentPlace()');
  assert.equal(h.S.extractedPlaces[0].name, 'Submitted place');
  assert.equal(h.calls.length, 0);
  h.run('_savingPlaces=false');
  h.run("setPlaceField(0,'name','After save')");
  assert.equal(h.S.extractedPlaces[0].name, 'After save');
});

test('audio export keeps its original episode, script and voices across delayed file reads', async () => {
  const h = setup();
  h.S.activeEpisode = 'Original episode';
  h.S.activeEpisodeId = 'original-id';
  h.S.sections = [{ id: 'sec', title: 'Intro', dialogue: 'KAI: First\nMIA: Second', version: 1 }];
  for (const host of ['kai', 'mia']) {
    h.element(`${host}-voice`).value = `${host}-original`;
    h.element(`${host}-speed`).value = '1';
  }
  let release;
  const requests = [];
  h.context.localArtifact = async (key) => {
    requests.push(key);
    if (requests.length === 1) await new Promise((r) => (release = r));
    return btoa('fake audio');
  };
  let entries, filename;
  h.context.zipBytes = (value) => {
    entries = value;
    return new Blob();
  };
  h.context.downloadBlob = (_blob, name) => {
    filename = name;
  };
  const exporting = h.run('exportAudio()');
  h.S.activeEpisode = 'Different episode';
  h.S.activeEpisodeId = 'different-id';
  h.S.sections[0].dialogue = 'KAI: Different script';
  h.S.sections = [];
  h.element('mia-voice').value = 'new-voice';
  h.element('mia-speed').value = '1.5';
  release();
  await exporting;
  assert.equal(requests.length, 2);
  assert.match(requests[1], /original-id.*Second.*mia-original/);
  const decode = (name) => new TextDecoder().decode(entries.find((e) => e.name === name).data);
  const manifest = JSON.parse(decode('manifest.json'));
  assert.equal(manifest.episode, 'Original episode');
  assert.equal(manifest.files[1].speed, 1);
  assert.equal(decode('script.txt'), 'Intro\nKAI: First\nMIA: Second');
  assert.equal(filename, 'nomad-original-audio.zip');
});
