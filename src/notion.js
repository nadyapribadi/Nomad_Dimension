// Nomad Dimension — the Notion seam.
//
// Every read and write that leaves the browser goes through here: the fetch
// wrappers, the Notion API calls, the property readers, the payload builders and
// the browser-local artifact store. Loaded as a classic script before the inline
// script, so the names stay global.

async function _afetch(url, opts = {}, ms = 45000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ac.signal });
    if (res.status === 401) document.getElementById('signin-overlay')?.classList.add('open');
    return res;
  } catch (e) {
    if (e.name === 'AbortError')
      throw new Error(
        `${url.split('/').pop()} timed out after ${ms / 1000}s — try a smaller input`
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function _postJSON(url, body, ms = 30000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const raw = await res.text();
    let d;
    try {
      d = JSON.parse(raw);
    } catch {
      throw new Error(
        [502, 504].includes(res.status)
          ? 'The service timed out. Your selection is retained; retry fewer rows or use your own research.'
          : `The service returned an unreadable response (HTTP ${res.status}).`
      );
    }
    if (res.status === 401) document.getElementById('signin-overlay')?.classList.add('open');
    if (!res.ok)
      throw Object.assign(
        new Error(d.error?.message || d.error || `${url.split('/').pop()} ${res.status}`),
        { status: res.status, code: d.code }
      );
    return d;
  } catch (e) {
    if (e.name === 'AbortError')
      throw new Error(`timed out after ${ms / 1000}s — try fewer rows / a narrower query`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function notionAPI(endpoint, method = 'GET', body = null) {
  for (let attempt = 0; ; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30000); // never hang a caller's lock
    let res;
    try {
      res = await fetch('/.netlify/functions/notion-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, method, body }),
        signal: ac.signal,
      });
    } catch (e) {
      if (e.name === 'AbortError') throw new Error(`Notion request timed out (${endpoint})`);
      throw e;
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401) document.getElementById('signin-overlay').classList.add('open');
    if (res.ok) return res.json();
    // Respect the server's backoff; never replay an uncertain create on a 5xx.
    if (res.status === 429 && attempt < 2) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await new Promise((r) =>
        setTimeout(
          r,
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * (attempt + 1)
        )
      );
      continue;
    }
    const err = await res.json().catch(() => ({}));
    const failure = new Error(err.message || err.error || `Notion API error ${res.status}`);
    failure.status = res.status;
    throw failure;
  }
}

async function notionQueryAll(dbId, body = {}) {
  const out = [];
  let cursor;
  do {
    const b = { page_size: 100, ...body };
    if (cursor) b.start_cursor = cursor;
    const r = await notionAPI(`databases/${dbId}/query`, 'POST', b);
    out.push(...(r.results || []));
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return out;
}

async function getPageBlocks(pageId) {
  // Follow pagination — the App Settings page is long and one page_size=100
  // request would truncate it (missing the DNA / routing blocks near the bottom).
  const blocks = [];
  let cursor = null;
  do {
    const qs = `page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
    const data = await notionAPI(`blocks/${pageId}/children?${qs}`);
    blocks.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  const expanded = [];
  for (const block of blocks) {
    expanded.push(block);
    if (block.type === 'table') {
      // Follow every page: a settings table longer than one page used to lose its
      // tail silently, the same way a fixed page_size did for the video picker.
      let cursor = null;
      do {
        const qs = `page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
        const tableData = await notionAPI(`blocks/${block.id}/children?${qs}`);
        expanded.push(...(tableData.results || []));
        cursor = tableData.has_more ? tableData.next_cursor : null;
      } while (cursor);
    }
  }
  return expanded;
}

function richText(prop) {
  return (prop?.rich_text || prop?.title || [])
    .map((x) => x.plain_text ?? x.text?.content ?? '')
    .join('');
}

function _readProp(p) {
  if (!p) return '';
  switch (p.type) {
    case 'title':
    case 'rich_text':
      return (p[p.type] || []).map((t) => t.plain_text || '').join('');
    case 'select':
      return p.select?.name || '';
    case 'status':
      return p.status?.name || '';
    case 'multi_select':
      return (p.multi_select || []).map((s) => s.name).join(', ');
    case 'number':
      return p.number == null ? '' : String(p.number);
    case 'url':
      return p.url || '';
    case 'date':
      return p.date?.start || '';
    case 'checkbox':
      return p.checkbox ? 'yes' : '';
    default:
      return '';
  }
}

function _propText(v) {
  if (v == null || typeof v !== 'object') return '';
  if (v.title) return v.title.map((t) => t.text?.content || '').join('');
  if (v.rich_text) return v.rich_text.map((t) => t.text?.content || t.plain_text || '').join('');
  if (v.select) return v.select.name || '';
  if (v.multi_select) return v.multi_select.map((s) => s.name).join(', ');
  if (typeof v.number === 'number') return String(v.number);
  if (typeof v.checkbox === 'boolean') return v.checkbox ? '✓' : '';
  if (v.date) return v.date.start || '';
  if (v.url) return v.url || '';
  if (v.relation) return v.relation.length ? `↗ ${v.relation.length}` : '';
  return '';
}

const _txt = (s) => ({ rich_text: [{ text: { content: clipText(s, 1900) } }] });

const _rel = (id) => (id ? { relation: [{ id }] } : undefined);

const safeURL = (value) => {
  try {
    const u = new URL(value);
    return ['https:', 'http:'].includes(u.protocol) ? u.href : '#';
  } catch {
    return '#';
  }
};

function libRT(text) {
  const chunks = [];
  let chunk = '';
  for (const char of String(text)) {
    if ((chunk + char).length > 1800) {
      chunks.push({ type: 'text', text: { content: chunk } });
      chunk = '';
    }
    chunk += char;
  }
  if (chunk) chunks.push({ type: 'text', text: { content: chunk } });
  return chunks;
}

const _h2 = (s) => ({ object: 'block', type: 'heading_2', heading_2: { rich_text: _rt(s) } });

function textBlocks(text) {
  const blocks = [];
  for (let i = 0; i < text.length; i += 1800) blocks.push(_p(text.slice(i, i + 1800)));
  return blocks;
}

async function appendBlocks(pageId, blocks) {
  for (let i = 0; i < blocks.length; i += 100)
    await notionAPI(`blocks/${pageId}/children`, 'PATCH', { children: blocks.slice(i, i + 100) });
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function openArtifactDB() {
  if (!artifactDB)
    artifactDB = new Promise((resolve, reject) => {
      const req = indexedDB.open('nomad-workbench', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('artifacts');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  return artifactDB;
}

async function localArtifact(key, value) {
  const db = await openArtifactDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('artifacts', value === undefined ? 'readonly' : 'readwrite');
    const store = tx.objectStore('artifacts');
    const req = value === undefined ? store.get(key) : store.put(value, key);
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Local save aborted'));
  });
}

let artifactDB;

const _rt = (s) => [{ type: 'text', text: { content: clipText(s, 1900) } }];

const _p = (s) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: _rt(s) } });

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    _afetch,
    _h2,
    _p,
    _postJSON,
    _propText,
    _readProp,
    _rel,
    _rt,
    _txt,
    appendBlocks,
    artifactDB,
    downloadBlob,
    getPageBlocks,
    libRT,
    localArtifact,
    notionAPI,
    notionQueryAll,
    openArtifactDB,
    richText,
    safeURL,
    textBlocks,
  };
}
