# Changelog

Human-readable, updated per milestone. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## Unreleased

### Added — Step 1 / Step 2 restructure (`Docs/PIPELINE.md`)

- **R1** — `#stage-1` → **Research** (tabs YouTube · Prep · Places · Web);
  `#stage-2` **Episode Builder** = one Assemble tab. Prep works on any Source
  Video. `switchTab` rescoped per active panel.
- **R2** — 7 new Notion DBs (Activities · Research · Prices · Data · Glossary ·
  Food · Transport) + `Platform` col on Source Videos.
- **R3** — 2-pass transcript extraction (`EXTRACT_SHAPE_1/_2`, gemini-flash),
  generic `RESEARCH_STORES` review-and-push in Prep. Places decoupled into its
  own per-transcript pass.
- **R4** — `functions/web-research.js` (Gemini Google-Search grounding) + the
  **Web** tab; results flow through the same review engine.
- **E1** — Assemble rebuilt: typed **Sections** (blank / Template A·B) +
  per-category **Material** browser (Notion query + search/prefecture/unused
  filters + assign-to-section). `createEpisode` seeds one Script section per
  typed section and stamps `Used In Episode`.
- **E2/E3** — `✨ Order` (`suggestSectionOrder`), `✨ Distribute`
  (`autoDistribute`), `✨ Gap check` (`epGapCheck`).

Deferred: Sources DB rename, relations (cross-refs are text), Web verify-mode,
refresh-stale, angle-first-from-Plan, TikTok/IG fetchers.

### Added

- **Stage 2 rebuilt around a structured breakdown.** Prep's "Run outline" is
  now **"Run breakdown"** — one AI pass per source video extracts a defined
  JSON object (`summary` · `places[]` · `route[]` · `beats[]` · `food[]` ·
  `tips[]` · `quotes[]`), only fields a transcript actually contains, stored as
  JSON in the Source Videos `Content Outline` field (schema = `BREAKDOWN_SHAPE`
  in `index.html`, no Notion schema change).
- **Places tab** reads `breakdown.places` directly (deterministic, no AI call,
  was re-parsing a lossy prose outline). Per-row Prefecture `<select>` (47 + Unknown)
  and, for food types, Halal `<select>` — the fields transcripts can't give.
  Prefecture starts as the breakdown's AI guess ("check it"); if
  `GOOGLE_MAPS_API_KEY` is set, **`functions/maps-proxy.js`** (Google Places API
  (New) Text Search) overrides it with the real `administrative_area_level_1`
  plus lat/lng, address, website, rating, editorial summary, Maps URL and price
  tier ("✓ Google Maps"). Those land in dedicated **Places DB columns**
  (Address / Coordinates / Website / Rating / Source Video), not crammed into
  Notes.
- **Route Order removed from Places.** Sequencing a "route" out of places from
  unrelated source trips made no sense. Places just confirms + pushes now; the
  running order is set in Assemble's Include list — default = on-camera order
  (`breakdown.route`), with a ✨ "Suggest order" button for narrative flow.
- **Places DB: one column per fact, Notes left blank.** Added Price Note / Food /
  Summary / Review Count columns (+ the earlier Address / Coordinates / Website /
  Rating / Source Video). `saveConfirmedPlaces` no longer concatenates anything
  into Notes.
- **Assemble Include list grouped by source video** + a `FROM:` toggle row to
  include/exclude a whole breakdown from the episode; per-group "include all /
  clear all". `S.includeSourceOff`.
- **Assemble tab** merges the old Theme + Create tabs into one author-driven
  form: you write title/angle/hook/tone/notes, AI only behind two ✨ buttons.
  An **Include checklist** (places + beats + food from the breakdowns, tick +
  reorder) drives both the episode brief (written into the Episode page body)
  and seeded Script Builder sections (Intro · items · Outro).
- **Plan** — new nav item 1 (before YouTube Browser): the Content Calendar and
  "What should I make next?" gap analysis, moved out of the Episode Builder tab
  bar. Nav renumbered (7 items); `showStage(7)` → `#stage-7`.

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
- **Notion property-name fixes** (audit against live schemas). Several reads
  used `.Name` where the real title is `Video Title` / `Episode Title` /
  `Section Title` — `loadSections`, `loadCalendar`, `loadTranscriptVideos`,
  `saveHandoffToNotion`, `runGapAnalysis` were pulling blanks or failing.
  `lockSection` wrote a nonexistent `Locked` checkbox → now `Script Status =
✅ Approved`. `addSection` / `applyTemplate` now set `Episode` + `Section
Order` so sections belong to the active episode (and `loadSections` filters
  by it). `pushToNotion` writes `YouTube URL` (not the MCP-rendered
  `userDefined:` name), adds Content Type / Region / Views / Duration /
  Published Date, and toasts an **error** with the first failure when a push
  is partial (was always "success"). Long fields (`Content Outline`,
  `Dialogue Content`, cached `Transcript`) chunk to ≤2000-char `rich_text`
  instead of truncating at 2000.
- **Transcript write-through.** Selecting a promoted source video in Stage 3A
  auto-fills its YouTube URL and pre-loads any saved `Transcript`; a fetch
  writes the transcript back to that row, so it's fetched once.
- `ai-run.js` `PROVIDER_SELECT`: DeepSeek/Qwen/Mistral/xAI/OpenRouter/Groq →
  `Other` so the cost log's Provider column is set for them.
- **Auto-transcript** (`functions/yt-transcript.js`). Stage 3A gets a "Fetch
  transcript" button — paste a YouTube URL, it fills the transcript box. Free
  watch-page caption scrape first (no key, no quota); falls back to
  youtube-transcript.io when `TRANSCRIPT_API_KEY` is set. Pure-fn helpers
  (id parse, player-response extraction, json3 → text) unit-tested. 30 tests.
- **Stage 1 filtering + Notion source channels.**
  - Source channels are now a machine-read **"📺 Source Channels"** JSON block
    (`{ channels: [...] }`); parsed into `S.channels`, _Save to Notion_ button
    `PATCH`es it. Was a hardcoded array.
  - Fetch controls: **Sort** (`date` / `viewCount` / `rating` → YouTube API
    `order`) + **from / to date** (`publishedAfter` / `publishedBefore`).
  - Post-fetch filter bar (instant, no API calls): keyword over
    title/description/tags/channel, min views, min/max duration, per-channel,
    sort by views / newest / oldest / longest. Cards also show publish date.
- **Lookup Tables** (Section Types / Tone Styles / Voice Configs) are now a
  machine-read **"📋 Lookup Tables"** JSON block (`section_types` /
  `tone_styles` / `voice_configs`). `saveLookups` `PATCH`es it — previously it
  only updated memory ("Notion write coming soon"). Old bullet-list parsing
  removed.
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

- **Model catalog refresh.** `MODEL_CATALOG` (Stage 0 dropdowns): Anthropic
  `claude-sonnet-4-6` → `claude-sonnet-5`, added `claude-fable-5`; DeepSeek
  added `deepseek-v4-flash` / `deepseek-v4-pro` (V3 is retired; `deepseek-chat`
  kept as the alias); added `xai|grok-4`. Routing defaults (`DEFAULT_ROUTING_UI`
  in `index.html`, `DEFAULT_ROUTING` + `SONNET` in `models.js`) and `PRICING`
  repointed `claude-sonnet-4-6` → `claude-sonnet-5`; the old id stays in
  `PRICING` so pre-existing Notion routing blocks still cost-log.
- **`saveConfirmedPlaces` no longer duplicates.** Re-entry guard + button
  disable while saving; re-queries the Places DB and skips any confirmed place
  whose name already exists (catches double-clicks and re-runs); marks saved
  rows so a second push is a no-op. Toast now reports skipped count.
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
