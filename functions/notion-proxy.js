// netlify/functions/notion-proxy.js
// Proxies all Notion API requests from the browser, injecting the token server-side.
// Token: process.env.NOTION_TOKEN (required). Browser sends no token.
// The browser sends: { endpoint, method, body }
// The function forwards to https://api.notion.com/v1/{endpoint}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return respond(400, { error: 'Invalid JSON body' });
  }

  const { endpoint, method = 'GET', body } = payload;
  const authToken = process.env.NOTION_TOKEN;

  if (!authToken) return respond(500, { error: 'NOTION_TOKEN not configured' });
  if (!endpoint) return respond(400, { error: 'Missing endpoint' });
  // A fixed set of operations; reject URL traversal, arbitrary methods and API paths.
  const id = '[0-9a-fA-F-]{32,36}';
  const paths = {
    GET: new RegExp(
      `^(users/me|pages/${id}|databases/${id}|blocks/${id}/children(?:\\?page_size=100(?:&start_cursor=[0-9a-fA-F-]+)?)?)$`
    ),
    POST: new RegExp(`^(pages|databases/${id}/query)$`),
    PATCH: new RegExp(`^(pages/${id}|blocks/${id}(?:/children)?)$`),
  };
  if (typeof endpoint !== 'string' || !paths[method]?.test(endpoint))
    return respond(400, { error: 'Unsupported Notion operation' });

  const url = `https://api.notion.com/v1/${endpoint}`;

  const fetchOptions = {
    method,
    signal: AbortSignal.timeout(25000),
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
  };

  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, fetchOptions);
    const data = await res.json();
    const result = respond(res.status, data);
    const retryAfter = res.headers?.get('retry-after');
    if (retryAfter) result.headers['Retry-After'] = retryAfter;
    return result;
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
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(body),
  };
}

// All provider calls require a signed, same-origin operator session.
exports.handler = require('./_shared/auth').withAuth(exports.handler);
