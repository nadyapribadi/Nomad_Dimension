'use strict';

// Web research for Step 1 (Research → Web tab). Gemini + Google Search
// grounding. Two modes:
//   POST { query, focus? }
//     -> { extract: {...}, sources: [{title,url}], model }   (open question)
//   POST { mode:'verify', store, items:[{name, detail}] }
//     -> { verified: [{name, verdict, confidence, source_url, as_of_date,
//                      corrected_value, note}], sources, model }
// Needs GEMINI_API_KEY. 502 on provider/network failure, 504 on our own
// 23s bail (before Netlify's 26s hard kill).

const MODEL = 'gemini-3.6-flash';

const SHAPE = `{
  "places":   [{ "name","name_local","romaji","type","prefecture_guess","area_guess","what_happens_here" }],
  "research": [{ "statement","kind":"fact|connection|dispute|misconception|sentiment|etiquette|access|timing","source_url","source_name","confidence":"medium","as_of_date":"YYYY-MM-DD or \\"\\"","prefecture","topic" }],
  "prices":   [{ "item","amount":0,"currency":"JPY|USD|Other","place","source_url","as_of_date" }],
  "data":     [{ "metric","value":0,"unit","year":0,"place_or_region","source_url" }],
  "glossary": [{ "term","reading","romaji","english" }]
}`;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respond(200, '');
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return respond(500, { error: 'GEMINI_API_KEY not set' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON' });
  }

  const prompt = body.mode === 'verify' ? buildVerifyPrompt(body) : buildAskPrompt(body);
  if (prompt.error) return respond(400, { error: prompt.error });

  const call = await runGemini(key, prompt.text);
  if (call.error) return respond(call.status, { error: call.error });

  const parsed = parseJsonLoose(call.text);
  if (!parsed) {
    return respond(502, { error: 'model reply was not valid JSON', raw: call.text.slice(0, 400) });
  }

  if (body.mode === 'verify') {
    return respond(200, {
      verified: Array.isArray(parsed.verified) ? parsed.verified : [],
      sources: call.sources,
      model: MODEL,
    });
  }
  return respond(200, { extract: parsed, sources: call.sources, model: MODEL });
};

function buildAskPrompt(body) {
  const query = String(body.query || '').trim();
  if (!query) return { error: 'Missing query' };
  const focus = String(body.focus || '').trim();
  return {
    text: `Research this for a Japan travel documentary: "${query}".
${focus ? `Focus: ${focus}\n` : ''}Use web search. Prefer primary sources, official
sites, reputable local sources, academic work. For every claim record its
source_url. Set confidence "high" only when multiple reputable sources agree,
else "medium". Give Japanese terms worth explaining on screen in "glossary".
Numbers go in "data" with unit + year. Prices go in "prices" with as_of_date.
Return ONLY this JSON shape, no markdown:
${SHAPE}`,
  };
}

function buildVerifyPrompt(body) {
  const store = String(body.store || 'claims').trim();
  const items = Array.isArray(body.items) ? body.items.slice(0, 40) : [];
  if (!items.length) return { error: 'Missing items' };
  const list = items
    .map(
      (it, i) =>
        `${i + 1}. ${String(it.name || '').trim()}${it.detail ? ` — ${String(it.detail).slice(0, 300)}` : ''}`
    )
    .join('\n');
  return {
    text: `These ${items.length} "${store}" entries were pulled from Japan travel
vlogs and are UNVERIFIED. For each, use web search to check it against
reputable sources (official sites, tourism boards, news, academic).

For each entry return:
- name: copy the entry name back EXACTLY so it can be matched
- verdict: "confirmed" | "corrected" | "unsupported"
- confidence: "high" (multiple reputable sources agree) | "medium" | "low"
- source_url: the best single URL backing your verdict ("" if none)
- as_of_date: "YYYY-MM-DD" the source reflects, or ""
- corrected_value: the corrected fact if verdict is "corrected", else ""
- note: one short sentence of context

Entries:
${list}

Return ONLY this JSON, no markdown:
{ "verified": [{ "name","verdict","confidence","source_url","as_of_date","corrected_value","note" }] }`,
  };
}

async function runGemini(key, prompt) {
  // Grounded generation is slow; bail at 23s so we return clean JSON before
  // Netlify's 26s hard kill turns it into an opaque 504 HTML page.
  const ac = new AbortController();
  const killer = setTimeout(() => ac.abort(), 23000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { maxOutputTokens: 2500, temperature: 0.2 },
        }),
        signal: ac.signal,
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { status: 502, error: (data.error && data.error.message) || `HTTP ${res.status}` };
    }
    const cand = (data.candidates || [])[0] || {};
    const text = ((cand.content && cand.content.parts) || []).map((p) => p.text || '').join('');
    const chunks = (cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [];
    const sources = chunks
      .map((c) => c.web && { title: c.web.title || c.web.uri, url: c.web.uri })
      .filter(Boolean);
    return { text, sources };
  } catch (e) {
    if (e.name === 'AbortError') {
      return {
        status: 504,
        error: 'Search took too long. Narrow the question, or verify fewer rows.',
      };
    }
    return { status: 502, error: e.message };
  } finally {
    clearTimeout(killer);
  }
}

// Same tolerant JSON extraction as the browser's parseJsonLoose.
function parseJsonLoose(raw) {
  const s = String(raw || '')
    .replace(/```json|```/g, '')
    .trim();
  try {
    return JSON.parse(s);
  } catch {
    /* dig */
  }
  const first = Math.min(
    ...['{', '['].map((c) => {
      const i = s.indexOf(c);
      return i < 0 ? Infinity : i;
    })
  );
  const last = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (first !== Infinity && last > first) {
    const slice = s.slice(first, last + 1);
    try {
      return JSON.parse(slice);
    } catch {
      /* repair */
    }
    try {
      return JSON.parse(slice.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      /* give up */
    }
  }
  return null;
}

function respond(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Content-Type': 'application/json',
    },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  };
}

module.exports._internal = { parseJsonLoose, buildVerifyPrompt, buildAskPrompt };
