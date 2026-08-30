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

  // Free path 1: watch-page scrape (often IP-blocked on serverless).
  try {
    const s = await scrapeTranscript(videoId, lang);
    if (s && s.text) return respond(200, { ...s, videoId, source: 'scrape' });
  } catch (e) {
    console.warn('watch-page scrape failed:', e.message);
  }

  // Paid fallback: youtube-transcript.io (may return a machine-translated track).
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
      'No transcript found. The video may have no captions, or all fetch paths are blocked and no TRANSCRIPT_API_KEY is set.',
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

// Priority: explicit lang → English → a non-machine-translated track → first.
// Many videos ship dozens of translated caption files with no "original"
// marker and no Japanese; English is the safest pick, and the outline step
// translates anything else. YouTube marks auto-translations with &tlang=.
function pickCaptionTrack(tracks, lang) {
  const notTlang = (t) => !/[?&]tlang=/.test(t.baseUrl || '');
  if (lang) {
    const m = tracks.find((t) => (t.languageCode || '').startsWith(lang));
    if (m) return m;
  }
  const en =
    tracks.find((t) => /^en/.test(t.languageCode || '') && notTlang(t)) ||
    tracks.find((t) => /^en/.test(t.languageCode || ''));
  if (en) return en;
  return tracks.find(notTlang) || tracks[0];
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

// youtube-transcript.io returns [{ text: "<flat>", tracks: [{ language, transcript: [{start,dur,text}] }] }].
function digTranscriptText(data) {
  const rec = Array.isArray(data) ? data[0] : data && (data[0] || data);
  if (!rec) return '';

  // Preferred: the per-segment track (cleanest, language-tagged).
  const track = Array.isArray(rec.tracks)
    ? rec.tracks.find((t) => Array.isArray(t.transcript) && t.transcript.length)
    : null;
  if (track) {
    const t = track.transcript
      .map((s) => (s && (s.text || s.utf8 || s.snippet)) || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (t) return t;
  }

  // Fallbacks: a flat string, or a bare segment array.
  if (typeof rec.text === 'string' && rec.text.trim()) return rec.text.trim();
  if (typeof rec.transcript === 'string' && rec.transcript.trim()) return rec.transcript.trim();
  if (Array.isArray(rec.transcript)) {
    return rec.transcript
      .map((s) => (typeof s === 'string' ? s : (s && (s.text || s.utf8)) || ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
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
