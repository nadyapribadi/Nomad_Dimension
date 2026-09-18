// Nomad Dimension — client core.
//
// Pure helpers with no DOM and no app state: tokenising and similarity, table
// sorting, the rich-text chunker every Notion write depends on, the concurrency
// pool every paid run sits behind, and the stable-JSON identity functions.
//
// Loaded as a classic script BEFORE the inline script in index.html, so the names
// stay global and every existing caller keeps working. The footer lets the tests
// `require` this file instead of extracting it out of the HTML.

const _esc = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );

const _JUNK_WORDS = new Set([
  'the',
  'a',
  'an',
  'at',
  'in',
  'on',
  'to',
  'of',
  'and',
  'or',
  'with',
  'from',
  'for',
  'is',
  'was',
  'it',
  'they',
  'their',
  'vlogger',
  'trip',
  'journey',
  'during',
  'some',
  'this',
  'that',
  'by',
  'as',
  'be',
  'been',
]);

const _ntCache = new Map();

function _normTokens(s) {
  let c = _ntCache.get(s);
  if (c) return c;
  c = String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !_JUNK_WORDS.has(w));
  if (_ntCache.size < 4000) _ntCache.set(s, c);
  return c;
}

function _sim(a, b) {
  // Jaccard on content tokens
  const A = new Set(_normTokens(a)),
    B = new Set(_normTokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function _thinName(name) {
  if (_normTokens(name).length <= 2) return true;
  return /\bsuccessfully\b|\bit is (claimed|said|mentioned)\b|\bmay have been\b|\bduring (the|their) (trip|journey)\b/i.test(
    name
  );
}

function _clusterRows(rows, thr = 0.5) {
  const clusters = [];
  for (const r of rows) {
    let hit = null;
    for (const c of clusters)
      if (c.rows.some((x) => _sim(x.name, r.name) >= thr)) {
        hit = c;
        break;
      }
    if (hit) hit.rows.push(r);
    else clusters.push({ rows: [r] });
  }
  for (const c of clusters) {
    // keep the most-detailed row
    c.keepId = c.rows
      .slice()
      .sort((a, b) => (b.fields || '').length - (a.fields || '').length)[0].id;
  }
  return clusters;
}

function _clusterMergeSafe(rows, thr = 0.5) {
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++)
      if (_sim(rows[i].name, rows[j].name) < thr) return false;
  return true;
}

function nextTableSort(current, label) {
  if (current && current.label === label) return { label, desc: !current.desc };
  return { label, desc: false };
}

function cellNumber(value) {
  const s = String(value ?? '').trim();
  if (!s || /^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const match = s.match(/-?\d[\d,._ ]*(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0].replace(/[,_ ]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function compareCellValues(a, b) {
  const sa = Array.isArray(a) ? a.join(', ') : String(a ?? '');
  const sb = Array.isArray(b) ? b.join(', ') : String(b ?? '');
  const na = cellNumber(sa),
    nb = cellNumber(sb);
  if (na !== null && nb !== null) return na - nb;
  return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
}

function codeBlockRichText(str) {
  const out = [];
  for (let i = 0; i < str.length; i += 2000) {
    out.push({ type: 'text', text: { content: str.slice(i, i + 2000) } });
  }
  return out.length ? out : [{ type: 'text', text: { content: '' } }];
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const n = i++;
        try {
          out[n] = await fn(items[n], n);
        } catch (e) {
          out[n] = { _err: e };
        }
      }
    })
  );
  return out;
}

function sortedJson(value) {
  const clean = (v) =>
    Array.isArray(v)
      ? v.map(clean)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .filter(
                (k) =>
                  !k.startsWith('_') &&
                  !['needs_verification', 'verify_note', 'confidence'].includes(k)
              )
              .map((k) => [k, clean(v[k])])
          )
        : v;
  return JSON.stringify(clean(value));
}

const MATERIAL_PROVENANCE = new Set([
  'source_page_id',
  'source_url',
  'source_title',
  'source_excerpt',
  'timestamp',
  'fromIds',
]);

function materialIdentity(it) {
  return sortedJson(it);
}

function materialClaimIdentity(it) {
  return sortedJson(
    Object.fromEntries(Object.entries(it || {}).filter(([k]) => !MATERIAL_PROVENANCE.has(k)))
  );
}

function checkLabel(v) {
  return (
    { confirmed: 'Supported', corrected: 'Contradicted', unsupported: 'No evidence found' }[v] ||
    'Not checked'
  );
}

function checkSummary(v) {
  return [
    v.corrected_value && `Correction: ${v.corrected_value}`,
    v.note,
    v.source_url,
    v.as_of_date && `As of ${v.as_of_date}`,
    v.checkedAt && `Checked ${v.checkedAt}`,
    v.model && `Model: ${v.model}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function formatISO8601Duration(d) {
  if (!d) return '';
  const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return d;
  const h = m[1] || 0,
    min = m[2] || 0,
    s = m[3] || 0;
  return h
    ? `${h}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${min}:${String(s).padStart(2, '0')}`;
}

function iso8601Minutes(d) {
  const m = (d || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return +(m[1] || 0) * 60 + +(m[2] || 0) + +(m[3] || 0) / 60;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    _esc,
    _JUNK_WORDS,
    _ntCache,
    _normTokens,
    _sim,
    _thinName,
    _clusterRows,
    _clusterMergeSafe,
    nextTableSort,
    cellNumber,
    compareCellValues,
    codeBlockRichText,
    mapPool,
    sortedJson,
    MATERIAL_PROVENANCE,
    materialIdentity,
    materialClaimIdentity,
    checkLabel,
    checkSummary,
    formatISO8601Duration,
    iso8601Minutes,
  };
}
