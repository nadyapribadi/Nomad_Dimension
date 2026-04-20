// netlify/functions/youtube-proxy.js
// Proxies YouTube Data API v3 requests.
// Browser sends: { path, params, apiKey }
// path example: "search" | "videos" | "channels" | "captions"

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  let payload;
  try { payload = JSON.parse(event.body); } catch {
    return respond(400, { error: 'Invalid JSON' });
  }

  const { path, params = {}, apiKey } = payload;
  if (!path)   return respond(400, { error: 'Missing path' });
  if (!apiKey) return respond(400, { error: 'Missing apiKey' });

  const qs = new URLSearchParams({ ...params, key: apiKey }).toString();
  const url = `https://www.googleapis.com/youtube/v3/${path}?${qs}`;

  try {
    const res = await fetch(url);
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
