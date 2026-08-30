// netlify/functions/anthropic-proxy.js
// Proxies Anthropic API /v1/messages requests.
// Key: process.env.ANTHROPIC_API_KEY (required). Browser sends no keys.
// NOTE: superseded by functions/ai-run.js + _shared/models.js once every stage
// is migrated (evolution plan Phase 2). Delete this file then.
// Browser sends: { model, max_tokens, system, messages }

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

  const { model, max_tokens = 1000, system, messages } = payload;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return respond(500, { error: 'ANTHROPIC_API_KEY not configured' });
  if (!messages) return respond(400, { error: 'Missing messages' });

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
