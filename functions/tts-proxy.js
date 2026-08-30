// netlify/functions/tts-proxy.js
// Proxies Google Cloud Text-to-Speech API requests.
// Key: process.env.GOOGLE_TTS_API_KEY (required). Browser sends no keys.
// Browser sends: { text, voice, audioConfig }

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

  const reqBody = {
    input: { text },
    voice: voice || { languageCode: 'en-US', name: 'en-US-Neural2-D' },
    audioConfig: audioConfig || { audioEncoding: 'MP3' },
  };

  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });
    const data = await res.json();
    return respond(res.status, data);
  } catch (err) {
    return respond(500, { error: err.message });
  }
};

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
