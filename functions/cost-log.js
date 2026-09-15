'use strict';

// Records what a fact-check run cost, once per run.
//
// The browser aggregates the provider usage it saw across every request and
// posts it here. Two reasons it is not done inside web-research: a run is one
// row in the Costs DB rather than 250, and the verify function's 24.5s deadline
// never has to absorb a Notion write.

const { withAuth } = require('./_shared/auth');
const { logCost } = require('./_shared/cost');

const TASKS = new Set(['fact-check']);

const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : null);

exports.handler = withAuth(async (event) => {
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }
  const task = String(payload.task || '');
  if (!TASKS.has(task)) return json(400, { error: 'Unknown task' });
  const requests = num(payload.requests);
  if (!requests) return json(400, { error: 'requests must be a positive whole number' });
  const usage = payload.usage || {};
  const inputTokens = num(usage.inputTokens);
  const outputTokens = num(usage.outputTokens);
  if (inputTokens === null || outputTokens === null)
    return json(400, { error: 'usage must be non-negative token counts' });
  const costUsd =
    payload.costUsd === undefined || payload.costUsd === null ? undefined : Number(payload.costUsd);
  if (costUsd !== undefined && (!Number.isFinite(costUsd) || costUsd < 0))
    return json(400, { error: 'costUsd must be a non-negative number' });
  const scope =
    payload.scope === undefined || payload.scope === null
      ? ''
      : String(payload.scope).slice(0, 120);
  const token = process.env.NOTION_TOKEN;
  if (!token) return json(503, { logged: false, error: 'NOTION_TOKEN not set' });
  try {
    await logCost({
      task,
      episode: payload.episode || '',
      token,
      requests,
      scope,
      result: {
        model: String(payload.model || ''),
        provider: 'gemini',
        usage: { inputTokens, outputTokens },
        ...(costUsd === undefined ? {} : { costUsd }),
      },
    });
  } catch (e) {
    return json(502, { logged: false, error: `Cost entry failed: ${e.message}` });
  }
  return json(200, { logged: true });
});

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}
