'use strict';

// The one place that writes an AI cost into the Production Costs DB, so every
// provider path records spend the same way. Callers await it but must never let
// it fail their own response — the run matters more than its receipt.

const COSTS_DB_ID = '36962616-b115-4398-850d-40582b092973';

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

const PROVIDER_SELECT = {
  anthropic: 'Anthropic',
  gemini: 'Google',
  openai: 'OpenAI',
  deepseek: 'Other',
  qwen: 'Other',
  mistral: 'Other',
  xai: 'Other',
  openrouter: 'Other',
  groq: 'Other',
};

// The Interactions API reports usage under its own names.
function usageFromInteractions(usage) {
  const u = usage || {};
  return {
    inputTokens: Number(u.total_input_tokens) || 0,
    outputTokens: Number(u.total_output_tokens) || 0,
  };
}

// `requests` is optional: a batch of provider calls reported as one entry says
// how many it took, so a run's cost stays readable instead of being a row per
// call. `characters` is the billed unit for text-to-speech, which has no tokens.
async function logCost({ result, task, episode, token, requests, scope, characters, note }) {
  if (!token) throw new Error('Cost logging unavailable');
  const stage = STAGE_BY_TASK[task];
  const usage = (result && result.usage) || {};
  const label = [
    episode || (scope ? null : 'EP?'),
    scope || null,
    stage || null,
    task || null,
    requests ? `${requests} requests` : null,
    note || null,
  ]
    .filter(Boolean)
    .join(' · ');
  const props = {
    'Cost Entry': { title: [{ text: { content: label.slice(0, 200) } }] },
    Task: { rich_text: [{ text: { content: task || '' } }] },
    Model: { rich_text: [{ text: { content: (result && result.model) || '' } }] },
    'Tokens In': { number: usage.inputTokens || 0 },
    'Tokens Out': { number: usage.outputTokens || 0 },
    Date: { date: { start: new Date().toISOString() } },
  };
  if (episode) props.Episode = { rich_text: [{ text: { content: String(episode) } }] };
  if (result && typeof result.costUsd === 'number') props['Cost USD'] = { number: result.costUsd };
  if (result && PROVIDER_SELECT[result.provider]) {
    props.Provider = { select: { name: PROVIDER_SELECT[result.provider] } };
  }
  if (stage) props.Stage = { select: { name: stage } };

  const send = (properties) =>
    fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      signal: AbortSignal.timeout(2500),
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parent: { database_id: COSTS_DB_ID }, properties }),
    });

  const countCharacters =
    typeof characters === 'number' && Number.isFinite(characters) && characters >= 0;
  let res = await send(
    countCharacters ? { ...props, Characters: { number: Math.floor(characters) } } : props
  );
  let charactersDropped = false;
  if (!res.ok && countCharacters) {
    // The Characters column may not exist yet, or may not be a number. A row
    // without the character count still tells the truth, and a mis-typed column
    // must never cost the whole entry — but the caller is told, so nobody
    // assumes the count was recorded when it was not.
    const detail = typeof res.text === 'function' ? await res.text().catch(() => '') : '';
    if (/Characters/i.test(detail)) {
      res = await send(props);
      charactersDropped = res.ok;
    }
  }
  if (!res.ok) throw new Error(`Notion ${res.status}`);
  return { charactersDropped };
}

module.exports = { COSTS_DB_ID, STAGE_BY_TASK, PROVIDER_SELECT, usageFromInteractions, logCost };
