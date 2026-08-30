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
- **Channel DNA is now a machine-read Notion block + Stage 0 form.** Restructured
  from 9 flat prose fields to a 6-group tree (Identity / Voice / Storytelling /
  Editorial / Visual / Production, ~30 fields), stored as the **"📺 Channel DNA"**
  JSON block. `parseAndApplySettings` reads it into `S.dna`; the DNA card renders
  grouped textareas from `DNA_SCHEMA`; _Save Channel DNA to Notion_ `PATCH`es the
  block (previously "saved locally" and never persisted). `buildDNASystem()`
  serialises the tree, dropping blank fields and empty groups.
- `getPageBlocks` (app) and `getRouting` (`ai-run.js`) now page through
  `next_cursor` — the App Settings page can grow past 100 blocks without hiding
  the DNA / routing blocks.
- **Channel DNA panel is now tabbed** (Identity / Voice / Storytelling /
  Editorial / Visual / Production) — one group on screen at a time instead of
  ~30 stacked fields. Tab switches preserve unsaved edits.
- **Fix:** `saveDNA` / `saveRouting` now chunk the JSON into ≤2000-char
  `rich_text` items — Notion rejected the single-item PATCH once the DNA block
  grew past 2000 chars ("body.code.rich_text[0].text.content.length ≤ 2000").
- **Build credits:** `netlify.toml` `build.ignore` skips the production deploy
  when a commit only touches `Docs/`, `*.md`, `*.test.js`, or `.github/`.
- **More providers.** `models.js` gains a table-driven `openaiCompatibleAdapter`
  (`OPENAI_COMPAT`) — one adapter for **OpenAI / DeepSeek / Qwen / Mistral / xAI /
  OpenRouter / Groq** (each keyed by its own `<PROVIDER>_API_KEY` env var).
  Reasoning models (`o3`, `*-reasoner`) get `max_completion_tokens` and no
  temperature. The Stage 0 routing panel is a **dropdown** per task, grouped by
  provider, built from the `MODEL_CATALOG` lookup table in `index.html` (edit the
  table to add/retire models). A saved value not in the catalog is kept as its
  own option. `.env.example` lists the optional keys. 24 tests.
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
