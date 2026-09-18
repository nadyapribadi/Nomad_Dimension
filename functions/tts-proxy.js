// netlify/functions/tts-proxy.js
// Proxies Google Cloud Text-to-Speech API requests.
// Key: process.env.GOOGLE_TTS_API_KEY (required). Browser sends no keys.
// Browser sends: { text, voice, audioConfig }

// The four voices the app offers, and nothing else: an unlisted name is a way to
// ask for a pricier voice tier, and the language is fixed because the script is
// English. Adding a voice to Stage 5 means adding it here.
const VOICES = new Set([
  'en-US-Neural2-D',
  'en-US-Neural2-J',
  'en-US-Neural2-F',
  'en-US-Neural2-H',
]);
const SPEED_MIN = 0.5;
const SPEED_MAX = 2;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return respond(400, { error: 'Invalid JSON' });
  }

  const { text, voice, audioConfig } = payload;
  const key = process.env.GOOGLE_TTS_API_KEY;
  if (!key) return respond(500, { error: 'GOOGLE_TTS_API_KEY not configured' });
  if (!text) return respond(400, { error: 'Missing text' });
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 4500)
    return respond(400, { error: 'Split this dialogue line: it exceeds the TTS input limit' });

  const voiceName = voice?.name || 'en-US-Neural2-D';
  if (!VOICES.has(voiceName))
    return respond(400, { error: `Unsupported voice: use one of ${[...VOICES].join(', ')}` });
  const rate = audioConfig?.speakingRate;
  if (rate !== undefined && !(Number(rate) >= SPEED_MIN && Number(rate) <= SPEED_MAX))
    return respond(400, { error: `Speaking rate must be between ${SPEED_MIN} and ${SPEED_MAX}` });

  const reqBody = {
    input: { text },
    voice: { languageCode: 'en-US', name: voiceName },
    audioConfig: {
      audioEncoding: 'MP3',
      ...(rate === undefined ? {} : { speakingRate: Number(rate) }),
    },
  };

  // The key travels in a header, not the URL. A URL ends up in request logs and
  // error traces, and this proxy hands the provider's reason back to the browser.
  const url = 'https://texttospeech.googleapis.com/v1/text:synthesize';

  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(25000),
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify(reqBody),
    });
    const data = await res.json().catch(() => ({}));
    // Relay the reason, never the raw body: an upstream error that echoes the
    // request would otherwise carry a credential to the browser.
    const message = redact(data?.error?.message) || `Text-to-speech failed (HTTP ${res.status})`;
    return respond(res.status, {
      error: {
        code: data?.error?.code ?? res.status,
        ...(data?.error?.status ? { status: data.error.status } : {}),
        message,
      },
    });
  } catch (err) {
    return respond(500, {
      error: { message: redact(err.message) || 'Text-to-speech unavailable' },
    });
  }
};

// Belt and braces: strip anything credential-shaped from a message before it
// leaves the server.
function redact(text) {
  return String(text || '')
    .replace(/\b(?:key|api[_-]?key)=[^\s&"'<>]+/gi, 'key=***')
    .replace(/\bAIza[0-9A-Za-z_-]{10,}/g, '***');
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}
function respond(statusCode, body) {
  return { statusCode, headers: corsHeaders(), body: JSON.stringify(body) };
}

// All provider calls require a signed, same-origin operator session.
exports.handler = require('./_shared/auth').withAuth(exports.handler);
exports._internal = { redact };
