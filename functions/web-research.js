'use strict';

// Web research for Step 1 (Research → Web tab). Gemini with Google Search
// grounding: one call, returns the same extraction shape as the transcript
// passes but with real source URLs and raised confidence.
//   POST { query, focus? }  ->  { extract: {...}, sources: [{title,url}], model }
// Needs GEMINI_API_KEY. Returns 502 on provider/network failure.

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
  const query = String(body.query || '').trim();
  if (!query) return respond(400, { error: 'Missing query' });
  const focus = String(body.focus || '').trim();

  const prompt = `Research this for a Japan travel documentary: "${query}".
${focus ? `Focus: ${focus}\n` : ''}Use web search. Prefer primary sources, official
sites, reputable local sources, academic work. For every claim record its
source_url. Set confidence "high" only when multiple reputable sources agree,
else "medium". Give Japanese terms worth explaining on screen in "glossary".
Numbers go in "data" with unit + year. Prices go in "prices" with as_of_date.
Return ONLY this JSON shape, no markdown:
${SHAPE}`;

  let data;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { maxOutputTokens: 4000, temperature: 0.2 },
        }),
      }
    );
    data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return respond(502, { error: (data.error && data.error.message) || `HTTP ${res.status}` });
    }
  } catch (e) {
    return respond(502, { error: e.message });
  }

  const cand = (data.candidates || [])[0] || {};
  const text = ((cand.content && cand.content.parts) || []).map((p) => p.text || '').join('');
  const extract = parseJsonLoose(text);
  if (!extract) {
    return respond(502, { error: 'model reply was not valid JSON', raw: text.slice(0, 400) });
  }

  const chunks = (cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [];
  const sources = chunks
    .map((c) => c.web && { title: c.web.title || c.web.uri, url: c.web.uri })
    .filter(Boolean);

  return respond(200, { extract, sources, model: MODEL });
};

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

module.exports._internal = { parseJsonLoose };
