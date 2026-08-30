# Changelog

Human-readable, updated per milestone. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## Unreleased

### Added

- **Model router** (`functions/_shared/models.js`) — `callModel()`, a
  provider-agnostic LLM router over **Anthropic / Gemini / OpenAI** adapters:
  normalized `{ text, provider, model, usage, costUsd }`, error taxonomy, one
  retry, then **one failover** to a per-task `fallback: { provider, model }` on
  `rate_limited` / `provider_error` / `network` / `content_filtered`. 21 unit
  tests (`node --test`, mocked fetch); `npm test` in CI + pre-commit.
- **`functions/ai-run.js`** — HTTP entry point for all AI stages. Resolves
  provider+model+fallback from the Notion **"🔀 Active Routing"** JSON block
  (cached ~60s → edit with no deploy; falls back to `DEFAULT_ROUTING`), calls the
  router, and fire-and-forget logs `{ provider, model, tokens, costUsd, stage,
episode }` to the Production Costs DB.
- All 11 AI stages in `index.html` call `aiRun(task, …)` (was `claudeAPI`).
- **Stage 0 "Active Model Routing"** — per-task `provider|model` + fallback
  dropdowns; _Save Routing to Notion_ `PATCH`es the "🔀 Active Routing" code
  block (no deploy). Replaces the dead `S.models` panel / `saveModels`.
  Routing block updated to a multi-provider spread (OpenAI `gpt-4o` /
  `gpt-4o-mini`, Gemini `gemini-2.0-flash`, Claude Haiku/Sonnet) + fallbacks.
- Repo tooling: `package.json`, ESLint (flat) + Prettier, `.nvmrc`, GitHub
  Actions CI, git pre-commit hook.
- `Docs/AS_BUILT.md` — code-side companion to the Notion System Documentation,
  incl. the phased evolution plan.
- `CLAUDE.md` / `AGENTS.md` — agent rules file.
- `functions/README.md` — the proxy request/response contract.
- Stage 4 **Script Check** — deterministic QA over all sections (word count,
  Kai/Mia ratio, clichés, repeated phrasing, reused places); no API call.

### Changed

- **Keys/tokens are Netlify env vars only** — the browser sends none. Proxies
  require their env var (`500` if missing); the request-body key path is gone.
  `connectNotion()` uses the server-side `NOTION_TOKEN` (no paste), runs on load.
- Deleted `functions/anthropic-proxy.js` and the `claudeAPI` helper (superseded
  by `ai-run.js`). `netlify.toml`: dropped `/api/anthropic`, added `/api/ai-run`.
- Docs restructured: Notion "System Documentation" is the source of truth; the
  earlier Python/agent redesign moved to `Docs/archive/` (kept, not maintained).

### Security

- Wrapped transcript / outline / place list / brief in XML tags with a
  data-handling clause in the shared system prompt — external text is treated as
  data, not instructions.
- API keys rotated; secrets removed from the Notion App Settings page.
