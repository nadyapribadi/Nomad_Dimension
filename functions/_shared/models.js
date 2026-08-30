'use strict';

// Provider-agnostic LLM router. Every model call in Nomad should go through
// callModel(). Phase 1 of the evolution plan — see Docs/AS_BUILT.md.
// The `_shared` dir (underscore prefix) is not deployed by Netlify as a function.
//
// Phase 2 replaces DEFAULT_ROUTING with a read of the Notion "Model
// Configuration" table and adds functions/ai-run.js as the HTTP entry point.

// task -> { provider, model, fallback?: { provider, model } }. Overridable per call.
// These are the OFFLINE defaults — a single provider is the safest degraded mode
// when the Notion "Active Routing" block is unreachable. The live multi-provider
// spread lives in that Notion block; ai-run.js passes its `fallback` through.
// `fallback` is tried once if the primary exhausts its retries with a
// rate_limited / provider_error / network / content_filtered error.
const HAIKU = { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' };
const SONNET = { provider: 'anthropic', model: 'claude-sonnet-5' };
const FLASH = { provider: 'gemini', model: 'gemini-3.6-flash' };
const GPT_MINI = { provider: 'openai', model: 'gpt-4o-mini' };
const GPT = { provider: 'openai', model: 'gpt-4o' };
const DEFAULT_ROUTING = {
  angle: { ...HAIKU, fallback: FLASH },
  translate: { ...FLASH, fallback: HAIKU },
  outline: { ...HAIKU, fallback: GPT_MINI },
  places: { ...FLASH, fallback: SONNET }, // fast structured extraction; Sonnet if it stumbles
  theme: { ...SONNET, fallback: GPT },
  dialogue: { ...SONNET, fallback: GPT },
  thumbnail: { ...HAIKU, fallback: GPT_MINI },
  metadata: { ...HAIKU, fallback: GPT_MINI },
  handoff: { ...HAIKU, fallback: GPT_MINI },
  gap: { ...HAIKU, fallback: SONNET },
  // Critic runs on a different family from the writer by default.
  critic: { ...FLASH, fallback: SONNET },
};

// USD per 1,000,000 tokens. VERIFY against current provider pricing — these are
// placeholders and should be tuned once real Costs DB data exists.
const PRICING = {
  'claude-haiku-4-5-20251001': { in: 1.0, out: 5.0 },
  'claude-sonnet-5': { in: 3.0, out: 15.0 },
  'claude-sonnet-4-6': { in: 3.0, out: 15.0 }, // legacy id, kept so old routing blocks still cost-log
  'claude-opus-5': { in: 15.0, out: 75.0 },
  'claude-fable-5': { in: 1.0, out: 5.0 },
  'gemini-3.6-flash': { in: 0.1, out: 0.4 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'gpt-4o': { in: 2.5, out: 10.0 },
  'deepseek-chat': { in: 0.27, out: 1.1 },
  'deepseek-v4-flash': { in: 0.27, out: 1.1 },
  'deepseek-v4-pro': { in: 0.55, out: 2.19 },
  'deepseek-reasoner': { in: 0.55, out: 2.19 },
  // Anything not listed here logs costUsd: null — the call still works.
};

// Retried once against the SAME model.
const RETRYABLE = new Set(['rate_limited', 'network', 'provider_error']);
// After retries are exhausted, these trigger one failover to the task's `fallback`.
const FAILOVER = new Set(['rate_limited', 'network', 'provider_error', 'content_filtered']);

/**
 * callModel(req, deps?)
 *   req.task?       key into DEFAULT_ROUTING
 *   req.provider?   'anthropic' | 'gemini' | any key of OPENAI_COMPAT
 *                   ('openai' | 'deepseek' | 'qwen' | 'mistral' | 'xai' |
 *                    'openrouter' | 'groq')            (overrides task routing)
 *   req.model?      model id                  (overrides task routing)
 *   req.fallback?   { provider, model } tried once if the primary fails over
 *   req.system?     system prompt string
 *   req.messages    [{ role: 'user'|'assistant', content: string }]  (required)
 *   req.maxTokens?  default 2000
 *   req.temperature?
 *   deps.fetch?     injectable for tests; defaults to global fetch
 *   deps.env?       injectable for tests; defaults to process.env
 *
 * returns { text, provider, model, usage:{inputTokens,outputTokens}, costUsd, raw }
 * throws  { code, message, status? } from the taxonomy:
 *   invalid_request | rate_limited | content_filtered | provider_error | network
 */
async function callModel(req, deps = {}) {
  const fetchImpl = deps.fetch || globalThis.fetch;
  const env = deps.env || process.env;

  const routed = req.task ? DEFAULT_ROUTING[req.task] : null;
  const provider = req.provider || (routed && routed.provider);
  const model = req.model || (routed && routed.model);
  if (!provider || !model) {
    throw taxonomyError('invalid_request', `no provider/model for task "${req.task}"`);
  }
  if (!Array.isArray(req.messages) || req.messages.length === 0) {
    throw taxonomyError('invalid_request', 'messages is required');
  }

  // One provider attempt = adapter call + up to one same-model retry.
  const runAttempts = async (prov, mdl) => {
    const adapter = ADAPTERS[prov];
    if (!adapter) throw taxonomyError('invalid_request', `unknown provider "${prov}"`);
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await adapter({ ...req, model: mdl }, { fetch: fetchImpl, env });
        return { ...res, costUsd: cost(mdl, res.usage) };
      } catch (err) {
        lastErr = err;
        if (!RETRYABLE.has(err.code) || attempt === 1) throw err;
        await sleep(500 * (attempt + 1));
      }
    }
    throw lastErr;
  };

  try {
    return await runAttempts(provider, model);
  } catch (err) {
    const fb = req.fallback || (routed && routed.fallback);
    if (fb && fb.provider && fb.model && FAILOVER.has(err.code)) {
      return runAttempts(fb.provider, fb.model);
    }
    throw err;
  }
}

function cost(model, usage) {
  const p = PRICING[model];
  if (!p || !usage) return null;
  const i = ((usage.inputTokens || 0) / 1e6) * p.in;
  const o = ((usage.outputTokens || 0) / 1e6) * p.out;
  return Math.round((i + o) * 1e6) / 1e6;
}

async function anthropicAdapter(req, { fetch, env }) {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) throw taxonomyError('invalid_request', 'ANTHROPIC_API_KEY not set');

  const body = {
    model: req.model,
    max_tokens: req.maxTokens || 2000,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (req.system) body.system = req.system;
  if (typeof req.temperature === 'number') body.temperature = req.temperature;

  const headers = {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  };
  // Identity-linked / workspace-scoped keys require this header.
  if (env.ANTHROPIC_WORKSPACE_ID) headers['anthropic-workspace-id'] = env.ANTHROPIC_WORKSPACE_ID;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }).catch((e) => {
    throw taxonomyError('network', e.message);
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw mapHttp(res.status, data && data.error && data.error.message);

  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const u = data.usage || {};
  return {
    text,
    provider: 'anthropic',
    model: req.model,
    usage: { inputTokens: u.input_tokens || 0, outputTokens: u.output_tokens || 0 },
    raw: data,
  };
}

async function geminiAdapter(req, { fetch, env }) {
  const key = env.GEMINI_API_KEY;
  if (!key) throw taxonomyError('invalid_request', 'GEMINI_API_KEY not set');

  const body = {
    contents: req.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    generationConfig: {},
  };
  if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
  if (req.maxTokens) body.generationConfig.maxOutputTokens = req.maxTokens;
  if (typeof req.temperature === 'number') body.generationConfig.temperature = req.temperature;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).catch((e) => {
    throw taxonomyError('network', e.message);
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw mapHttp(res.status, data && data.error && data.error.message);

  const cand = (data.candidates || [])[0];
  if (cand && cand.finishReason === 'SAFETY') {
    throw taxonomyError('content_filtered', 'Gemini blocked the response (safety)');
  }
  const text =
    (cand && cand.content && (cand.content.parts || []).map((p) => p.text || '').join('')) || '';
  const um = data.usageMetadata || {};
  return {
    text,
    provider: 'gemini',
    model: req.model,
    usage: {
      inputTokens: um.promptTokenCount || 0,
      outputTokens: um.candidatesTokenCount || 0,
    },
    raw: data,
  };
}

// Providers that speak the OpenAI Chat Completions wire format. One adapter,
// table-driven: add a row + set its key env var to enable another provider.
// `model` ids are passed straight through (e.g. "deepseek-reasoner",
// "qwen-max", "openrouter" takes "vendor/model"). Verify ids against the
// provider's own docs — they change often.
const OPENAI_COMPAT = {
  openai: { base: 'https://api.openai.com/v1', keyEnv: 'OPENAI_API_KEY' },
  deepseek: { base: 'https://api.deepseek.com/v1', keyEnv: 'DEEPSEEK_API_KEY' },
  qwen: {
    base: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    keyEnv: 'DASHSCOPE_API_KEY',
  },
  mistral: { base: 'https://api.mistral.ai/v1', keyEnv: 'MISTRAL_API_KEY' },
  xai: { base: 'https://api.x.ai/v1', keyEnv: 'XAI_API_KEY' },
  openrouter: { base: 'https://openrouter.ai/api/v1', keyEnv: 'OPENROUTER_API_KEY' },
  groq: { base: 'https://api.groq.com/openai/v1', keyEnv: 'GROQ_API_KEY' },
};

async function openaiCompatibleAdapter(provider, req, { fetch, env }) {
  const cfg = OPENAI_COMPAT[provider];
  const key = env[cfg.keyEnv];
  if (!key) throw taxonomyError('invalid_request', `${cfg.keyEnv} not set`);

  const messages = req.system
    ? [{ role: 'system', content: req.system }, ...req.messages]
    : req.messages;
  const body = { model: req.model, messages };
  // ponytail: OpenAI o-series and *-reasoner models reject max_tokens and
  // temperature; they want max_completion_tokens and no temperature.
  const reasoning = /(^|\/)o\d/.test(req.model) || /reason/i.test(req.model);
  if (req.maxTokens) body[reasoning ? 'max_completion_tokens' : 'max_tokens'] = req.maxTokens;
  if (!reasoning && typeof req.temperature === 'number') body.temperature = req.temperature;

  const res = await fetch(`${cfg.base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).catch((e) => {
    throw taxonomyError('network', e.message);
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw mapHttp(res.status, data && data.error && data.error.message);

  const choice = (data.choices || [])[0];
  if (choice && choice.finish_reason === 'content_filter') {
    throw taxonomyError('content_filtered', `${provider} blocked the response (content filter)`);
  }
  const u = data.usage || {};
  return {
    text: (choice && choice.message && choice.message.content) || '',
    provider,
    model: req.model,
    usage: { inputTokens: u.prompt_tokens || 0, outputTokens: u.completion_tokens || 0 },
    raw: data,
  };
}

const ADAPTERS = { anthropic: anthropicAdapter, gemini: geminiAdapter };
for (const name of Object.keys(OPENAI_COMPAT)) {
  ADAPTERS[name] = (req, deps) => openaiCompatibleAdapter(name, req, deps);
}

function taxonomyError(code, message, status) {
  const e = new Error(message || code);
  e.code = code;
  if (status) e.status = status;
  return e;
}

function mapHttp(status, message) {
  if (status === 429) return taxonomyError('rate_limited', message || 'rate limited', 429);
  if (status === 401 || status === 403) {
    return taxonomyError('invalid_request', message || 'auth failed', status);
  }
  if (status === 400 || status === 404 || status === 422) {
    return taxonomyError('invalid_request', message || 'invalid request', status);
  }
  if (status >= 500) return taxonomyError('provider_error', message || 'provider error', status);
  return taxonomyError('provider_error', message || `http ${status}`, status);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { callModel, cost, DEFAULT_ROUTING, PRICING };
