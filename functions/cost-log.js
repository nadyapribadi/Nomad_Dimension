'use strict';

// Records what a fact-check run cost, once per run.
//
// The browser aggregates the provider usage it saw across every request and
// posts it here. Two reasons it is not done inside web-research: a run is one
// row in the Costs DB rather than 250, and the verify function's 24.5s deadline
// never has to absorb a Notion write.

const { withAuth } = require('./_shared/auth');
const { logCost } = require('./_shared/cost');

// `tts` is billed per character rather than per token, so it reports characters
// and needs no token counts.
const TASKS = new Set(['fact-check', 'tts']);

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
  const characters =
    payload.characters === undefined || payload.characters === null
      ? undefined
      : num(payload.characters);
  if (characters === null)
    return json(400, { error: 'characters must be a non-negative whole number' });
  if (task === 'tts' && !characters)
    return json(400, { error: 'tts entries must report characters' });
  const usage = payload.usage || {};
  const inputTokens =
    task === 'tts' && usage.inputTokens === undefined ? 0 : num(usage.inputTokens);
  const outputTokens =
    task === 'tts' && usage.outputTokens === undefined ? 0 : num(usage.outputTokens);
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
  // What the run did, kept short: the entry label is the only free-text field, so
  // it carries the outcome rather than asking for another column.
  const note =
    typeof payload.note === 'string' && payload.note.trim()
      ? payload.note.trim().slice(0, 160)
      : undefined;
  const token = process.env.NOTION_TOKEN;
  if (!token) return json(503, { logged: false, error: 'NOTION_TOKEN not set' });
  try {
    const { charactersDropped } = await logCost({
      task,
      episode: payload.episode || '',
      token,
      requests,
      scope,
      characters,
      note,
      result: {
        model: String(payload.model || ''),
        provider: 'gemini',
        usage: { inputTokens, outputTokens },
        ...(costUsd === undefined ? {} : { costUsd }),
      },
    });
    // A column that exists but is not a number silently loses the count, so say
    // so on the way back rather than letting it pass as recorded.
    if (charactersDropped) return json(200, { logged: true, charactersStored: false });
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
