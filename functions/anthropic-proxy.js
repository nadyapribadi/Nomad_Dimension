// netlify/functions/anthropic-proxy.js
// Proxies Anthropic API /v1/messages requests.
// Key resolution: process.env.ANTHROPIC_API_KEY, else payload.apiKey (legacy).
// Browser sends: { model, max_tokens, system, messages, apiKey? }

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

  const { model, max_tokens = 1000, system, messages, apiKey } = payload;
  const key = process.env.ANTHROPIC_API_KEY || apiKey;
  if (!messages || !key) return respond(400, { error: 'Missing messages or API key' });

  const reqBody = { model: model || 'claude-haiku-4-5-20251001', max_tokens, messages };
  if (system) reqBody.system = system;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
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
