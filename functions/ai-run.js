'use strict';

// HTTP entry point for the model router. The browser POSTs a task + messages;
// this calls callModel() (functions/_shared/models.js), fire-and-forget logs the
// cost to the Production Costs DB, and returns the normalized result.
// Phase 2 of the evolution plan — see Docs/AS_BUILT.md.

const { callModel, DEFAULT_ROUTING } = require('./_shared/models');

const APP_SETTINGS_PAGE_ID = '33c9ba2b-3900-8132-b172-f136389ac2e2';

const STAGE_BY_TASK = {
  angle: 'Stage 1 - YouTube',
  theme: 'Stage 2 - Episode Builder',
  gap: 'Stage 2 - Episode Builder',
  translate: 'Stage 3 - Transcript',
  outline: 'Stage 3 - Transcript',
  places: 'Stage 3B - Places',
  dialogue: 'Stage 4 - Script',
  critic: 'Stage 4 - Script',
  thumbnail: 'Stage 6 - Handoff',
  metadata: 'Stage 6 - Handoff',
  handoff: 'Stage 6 - Handoff',
};

const PROVIDER_SELECT = { anthropic: 'Anthropic', gemini: 'Google', openai: 'OpenAI' };

const STATUS_BY_CODE = {
  invalid_request: 400,
  rate_limited: 429,
  content_filtered: 422,
  provider_error: 502,
  network: 502,
};

const COSTS_DB_ID = '6c2855fd-38c8-4e81-8f4d-4c4070b3b82d';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respond(200, '');
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return respond(400, { error: 'Invalid JSON' });
  }

  const { task, provider, model, system, messages, maxTokens, temperature, episode } = payload;

  // Resolve provider+model: explicit override > Notion "Active Routing" > DEFAULT_ROUTING.
  let p = provider;
  let m = model;
  let fallback = null;
  if ((!p || !m) && task) {
    const routing = await getRouting().catch(() => null);
    const r = (routing && routing[task]) || DEFAULT_ROUTING[task] || {};
    p = p || r.provider;
    m = m || r.model;
    fallback = r.fallback || null;
  }

  let result;
  try {
    result = await callModel({
      task,
      provider: p,
      model: m,
      fallback,
      system,
      messages,
      maxTokens,
      temperature,
    });
  } catch (err) {
    return respond(STATUS_BY_CODE[err.code] || 500, {
      error: err.message,
      code: err.code || 'unknown',
    });
  }

  logCost({ result, task, episode, token: process.env.NOTION_TOKEN }).catch((e) =>
    console.warn('cost log failed:', e && e.message)
  );

  return respond(200, {
    text: result.text,
    provider: result.provider,
    model: result.model,
    usage: result.usage,
    costUsd: result.costUsd,
  });
};

// Reads task -> { provider, model } from the JSON code block under the
// "🔀 Active Routing" heading on the Notion App Settings page. Cached ~60s so
// the operator can change a model with no deploy. Any failure -> null (caller
// falls back to DEFAULT_ROUTING in _shared/models.js).
let _routingCache = { at: 0, value: null };
async function getRouting() {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  if (Date.now() - _routingCache.at < 60_000) return _routingCache.value;

  // Page through all children — the App Settings page is long enough that one
  // page_size=100 request would miss the routing block near the bottom.
  let value = null;
  let cursor = null;
  do {
    const qs = `page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
    const res = await fetch(
      `https://api.notion.com/v1/blocks/${APP_SETTINGS_PAGE_ID}/children?${qs}`,
      { headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28' } }
    );
    if (!res.ok) throw new Error(`Notion ${res.status}`);
    const data = await res.json();
    for (const block of data.results || []) {
      if (block.type !== 'code') continue;
      const text = (block.code.rich_text || []).map((r) => r.plain_text).join('');
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && parsed.dialogue && parsed.dialogue.provider) {
          value = parsed;
        }
      } catch {
        /* not the routing block */
      }
    }
    cursor = !value && data.has_more ? data.next_cursor : null;
  } while (cursor);

  _routingCache = { at: Date.now(), value };
  return value;
}

// Fire-and-forget. Never blocks or fails the response.
async function logCost({ result, task, episode, token }) {
  if (!token) return; // no server-side Notion token available
  const stage = STAGE_BY_TASK[task];
  const label = `${episode || 'EP?'} · ${stage || task} · ${task}`;
  const props = {
    'Cost Entry': { title: [{ text: { content: label.slice(0, 200) } }] },
    Task: { rich_text: [{ text: { content: task || '' } }] },
    Model: { rich_text: [{ text: { content: result.model || '' } }] },
    'Tokens In': { number: result.usage.inputTokens || 0 },
    'Tokens Out': { number: result.usage.outputTokens || 0 },
    Date: { date: { start: new Date().toISOString() } },
  };
  if (episode) props.Episode = { rich_text: [{ text: { content: String(episode) } }] };
  if (typeof result.costUsd === 'number') props['Cost USD'] = { number: result.costUsd };
  if (PROVIDER_SELECT[result.provider]) {
    props.Provider = { select: { name: PROVIDER_SELECT[result.provider] } };
  }
  if (stage) props.Stage = { select: { name: stage } };

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parent: { database_id: COSTS_DB_ID }, properties: props }),
  });
  if (!res.ok) throw new Error(`Notion ${res.status}`);
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Content-Type': 'application/json',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

module.exports.STAGE_BY_TASK = STAGE_BY_TASK;
module.exports.PROVIDER_SELECT = PROVIDER_SELECT;
module.exports.STATUS_BY_CODE = STATUS_BY_CODE;
