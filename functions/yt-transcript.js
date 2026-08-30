// netlify/functions/yt-transcript.js
// Fetch a YouTube transcript for Stage 3A. Free-first:
//   1. Scrape the watch page for the caption track (no key, no quota).
//   2. If that yields nothing AND TRANSCRIPT_API_KEY is set, fall back to
//      youtube-transcript.io (free tier ~25/mo).
// Browser sends { url } or { videoId } (+ optional { lang }).
// Returns { text, videoId, lang, source } or { error, code }.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0 Safari/537.36';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respond(200, '');
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON' });
  }

  const videoId = extractVideoId(body.videoId || body.url || '');
  if (!videoId)
    return respond(400, {
      error: 'Missing or unrecognised video id / url',
      code: 'invalid_request',
    });
  const lang = (body.lang || '').trim();

  try {
    const scraped = await scrapeTranscript(videoId, lang);
    if (scraped && scraped.text) return respond(200, { ...scraped, videoId, source: 'scrape' });
  } catch (e) {
    // fall through to the API fallback
    console.warn('scrape failed:', e.message);
  }

  const key = process.env.TRANSCRIPT_API_KEY;
  if (key) {
    try {
      const api = await fetchFromTranscriptIo(videoId, key);
      if (api && api.text)
        return respond(200, { ...api, videoId, source: 'youtube-transcript.io' });
    } catch (e) {
      return respond(502, { error: `Fallback API failed: ${e.message}`, code: 'provider_error' });
    }
  }

  return respond(404, {
    error:
      'No transcript found. The video may have no captions, or the scrape path is blocked and no TRANSCRIPT_API_KEY is set.',
    code: 'not_found',
  });
};

// ─── free scrape ────────────────────────────────────────────────────────────

async function scrapeTranscript(videoId, lang) {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
  });
  if (!res.ok) throw new Error(`watch page ${res.status}`);
  const html = await res.text();

  const player = extractPlayerResponse(html);
  const tracks =
    player &&
    player.captions &&
    player.captions.playerCaptionsTracklistRenderer &&
    player.captions.playerCaptionsTracklistRenderer.captionTracks;
  if (!tracks || !tracks.length) return null;

  const track = pickCaptionTrack(tracks, lang);
  if (!track || !track.baseUrl) return null;

  const capRes = await fetch(`${track.baseUrl}&fmt=json3`, {
    headers: { 'User-Agent': UA },
  });
  if (!capRes.ok) throw new Error(`caption track ${capRes.status}`);
  const json = await capRes.json().catch(() => null);
  const text = parseJson3(json);
  if (!text) return null;
  return { text, lang: track.languageCode || lang || '' };
}

// Pull the ytInitialPlayerResponse object out of the watch-page HTML.
function extractPlayerResponse(html) {
  const markers = ['ytInitialPlayerResponse = ', 'var ytInitialPlayerResponse = '];
  for (const m of markers) {
    const i = html.indexOf(m);
    if (i === -1) continue;
    const start = i + m.length;
    const obj = sliceBalancedJson(html, start);
    if (obj) {
      try {
        return JSON.parse(obj);
      } catch {
        /* try next marker */
      }
    }
  }
  return null;
}

// From `str[start]` (expected '{'), return the substring of the balanced object.
function sliceBalancedJson(str, start) {
  if (str[start] !== '{') return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < str.length; i++) {
    const c = str[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return str.slice(start, i + 1);
    }
  }
  return null;
}

// Prefer: exact lang match → manual (non-ASR) → English → first.
function pickCaptionTrack(tracks, lang) {
  const byLang = lang && tracks.find((t) => (t.languageCode || '').startsWith(lang));
  if (byLang) return byLang;
  const manual = tracks.find((t) => t.kind !== 'asr');
  if (manual) return manual;
  const en = tracks.find((t) => (t.languageCode || '').startsWith('en'));
  return en || tracks[0];
}

// json3 caption format → plain text.
function parseJson3(json) {
  if (!json || !Array.isArray(json.events)) return '';
  const out = [];
  for (const ev of json.events) {
    if (!ev.segs) continue;
    const line = ev.segs
      .map((s) => s.utf8 || '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (line) out.push(line);
  }
  return out.join('\n');
}

// ─── paid fallback ─────────────────────────────────────────────────────────

async function fetchFromTranscriptIo(videoId, key) {
  const res = await fetch('https://www.youtube-transcript.io/api/transcripts', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ids: [videoId] }),
  });
  if (res.status === 429) throw new Error('rate limited (5 req / 10s)');
  if (!res.ok) throw new Error(`http ${res.status}`);
  const data = await res.json().catch(() => null);
  const text = digTranscriptText(data);
  return text ? { text, lang: '' } : null;
}

// Response shape isn't documented — dig for the transcript defensively.
function digTranscriptText(data) {
  const rec = Array.isArray(data) ? data[0] : data && (data[0] || data);
  if (!rec) return '';
  if (typeof rec.transcript === 'string') return rec.transcript.trim();
  const segs =
    rec.transcript ||
    rec.tracks ||
    rec.segments ||
    (rec.tracks && rec.tracks[0] && rec.tracks[0].transcript) ||
    [];
  const flat = Array.isArray(segs)
    ? segs
    : Array.isArray(segs && segs[0] && segs[0].transcript)
      ? segs[0].transcript
      : [];
  const text = flat
    .map((s) => (typeof s === 'string' ? s : s.text || s.utf8 || s.snippet || ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

// ─── shared ────────────────────────────────────────────────────────────────

function extractVideoId(input) {
  const s = String(input).trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m =
    s.match(/[?&]v=([\w-]{11})/) ||
    s.match(/youtu\.be\/([\w-]{11})/) ||
    s.match(/\/(?:embed|shorts|live)\/([\w-]{11})/);
  return m ? m[1] : '';
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

module.exports._internal = {
  extractVideoId,
  extractPlayerResponse,
  sliceBalancedJson,
  pickCaptionTrack,
  parseJson3,
  digTranscriptText,
};
