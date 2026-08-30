# As-Built — Code-Side Notes

Status: **Drafted** — the code-side companion to the operating manual.

## Source of truth

The operating manual for Nomad Dimension is the Notion page
**"📖 Nomad Dimension — System Documentation"**
(id `3499ba2b-3900-8087-8800-cd0db5f579f5`). It covers the channel model, the
8-stage pipeline, the 8-database schema, model routing, status flow, naming, and
the design decisions. **Read it first.**

This file covers what a developer or coding agent needs that the Notion doc
doesn't: exact identifiers used in `index.html`, the proxy contract, a function
map, where the **code diverges from the spec**, and the **forward plan**
(see "Direction & evolution plan" below). Repo conventions and boundaries are in
[`../CLAUDE.md`](../CLAUDE.md).

## Repo shape

| Path | |
| --- | --- |
| `index.html` | The whole app — inline `<style>` + `<script>`, ~3,300 lines, no build step |
| `functions/*.js` | 4 Netlify proxies — see `../functions/README.md` |
| `netlify.toml` | `publish = "."`, `functions = "functions"`; push to `main` deploys |
| `package.json` etc. | ESLint + Prettier + CI + pre-commit (lint/format only) |

## Identifiers hard-coded in `index.html`

```js
APP_SETTINGS_PAGE_ID = '33c9ba2b-3900-8132-b172-f136389ac2e2'
DB_IDS = {
  sourceVideos:   '29429e5b-dd37-4ab8-93a5-b1e092df9e60',
  episodes:       'b298e52a-19e1-47b5-bfa2-d846dbc69291',
  scripts:        'be955033-cd95-4801-8e05-bcdce05cedc5',
  places:         '9b03bb34-9d44-4eba-9744-5073bc881656',
  sourceChannels: 'ad90cd8a-276c-4cf6-9414-697401380388',
  costs:          '6c2855fd-38c8-4e81-8f4d-4c4070b3b82d',
}
```

The Notion doc lists **8 databases**; the code references **6**. Not in `DB_IDS`:
the **Performance** database (`a488f781-ef28-4006-9b97-44b72d16d4ba`) — no stage
reads or writes it. (App Settings is a page, handled via `APP_SETTINGS_PAGE_ID`.)

## Function map (by stage)

| Stage | Functions |
| --- | --- |
| 0 Settings | `connectNotion` · `loadSettingsFromNotion` · `parseAndApplySettings` · `parseSettingsPage` · `getPageBlocks` · `renderSettingsUI` · `runHealthCheck` · `resumeSession` · `writeAppState` · `saveModels` · `saveLookups` · `saveDNA` |
| 1 YouTube Browser | `fetchYouTube` · `renderYTVideos` · `openReviewModal` · `pushToNotion` |
| 2 Episode Builder | `loadSourceQueue` · `generateThemes` · `selectTheme` · `suggestEpisodeTitles` · `createEpisode` · `loadCalendar` · `runGapAnalysis` |
| 3A Transcript | `loadTranscriptVideos` · `runPass1` · `saveOutlineToNotion` |
| 3B Places | `extractPlaces` · `renderPlacesReview` · `confirmPlace` · `skipPlace` · `renderRouteOrder` · `movePlaceUp/Down` · `saveConfirmedPlaces` |
| 4 Script Builder | `loadSections` · `renderSections` · `renderSectionCard` · `generateDialogue` · `lockSection` · `saveSection` · `applyTemplate` · `parseDialogue` · **`runScriptCheck`** (deterministic QA, added) |
| 5 Audio TTS | `renderAllAudio` · `playSegment` · `playFullEpisode` · `exportAudio` |
| 6 Handoff | `generateHandoff` · `renderHandoffDoc` · `saveHandoffToNotion` · `regenerateHandoff` |
| shared | `notionAPI` · `ytAPI` · `claudeAPI` · `ttsAPI` · `buildDNASystem` · `showStage` · `toast` |

Model routing keys read from settings: `S.models.{angle, pass, places, theme, dialogue, thumbnail, gap}`.

## Code vs. spec — open gaps

| Spec (Notion doc) | Code today |
| --- | --- |
| "Every API call logged to **Production Costs** DB with episode link; Total Cost USD rollup on Episodes" | `costs` ID is declared; **nothing writes cost rows**, no rollup |
| **Performance** DB — post-publish metrics at 3 checkpoints | not referenced in code |
| App Settings is the source of truth for model config / lookup tables | `saveModels()` / `saveLookups()` only update memory ("Notion write coming soon") |
| Two-pass transcript: Pass 2 uses "only the relevant **outline chunk** + place details + brief" | `generateDialogue` passes brief + route order + matched place b-roll — **not the outline chunk** |
| "Each dialogue line gets an estimated timestamp" | `generateDialogue` output is `KAI:` / `MIA:` lines only; no timestamps produced |
| Dialogue version history — "last 5 versions stored" | `Dialogue Version` number increments; prior text is overwritten, not kept |

## Applied since the reverse-engineering pass

- **Prompt-injection hardening** — transcript / outline / place list / brief are
  wrapped in XML tags in `runPass1`, `extractPlaces`, `generateDialogue`, with a
  data-handling clause in `buildDNASystem()`. External text is treated as data.
- **Script Check** (Stage 4) — `runScriptCheck()`, deterministic, no API call:
  missing dialogue, word count vs `duration*130`, Kai/Mia line ratio vs
  `S.dna.ratio`, cliché/avoided-phrase scan, repeated 8-word runs across
  sections, confirmed places flagged `already_in_episode_warning`.

## Direction & evolution plan

**Decision:** evolve this JS/Netlify/Notion app toward provider-agnostic model
routing and an independent Critic layer — the "thin brain" approach. Move the AI
logic out of `index.html` into small, tested modules behind Netlify Functions,
keeping the wizard UI. **Not** a Python multi-agent rewrite (`archive/`), **not**
cramming more logic into `index.html`.

Rationale: the working app already covers ~60% of the vision's value (owned
workflow, structured state). The gaps — agnostic routing, a quality gate, cost
visibility, testability — are reachable incrementally, days per phase, without a
rewrite. Autonomous multi-agent orchestration is deliberately out of scope: a
guided workflow with a Critic and swappable models delivers the same outcome for
one video per month.

Each phase ships something; decide at the gate before moving on.

| # | Phase | Delivers | Key work | Exit |
| --- | --- | --- | --- | --- |
| 0 | Foundations | tooling, keys→env, docs, Script Check | *(≈ done)* | proxies verified on live site; request-body key fallback removed |
| 1 | Capability layer | tested model router | `functions/lib/models.js` + `providers/{anthropic,gemini,openai}.js` + `cost.js` + `*.test.js` + `ai-run.js` endpoint | `callModel` passes tests for all three providers; error taxonomy tested |
| 2 | Migrate pipeline | **models are agnostic**; **cost visible** | route every AI stage through `ai-run.js`; prompts → `functions/lib/prompts/`; `callModel` writes Costs DB rows; delete hard-coded model IDs; model choice read from the Notion model table | every stage runs through the layer; swapping a model is a Notion edit; Costs DB fills |
| 3 | Critic layer | **independent quality gate** | `functions/lib/critic.js` — `review()` on a *different* provider than the writer — + stage rubrics + per-stage "Review" button (PASS / REWORK notes) | weak dialogue/outline reliably flagged; optional auto-revise-once |
| 4 | Light orchestration | **machine runs a stage** | `run-stage.js` background function: generate → critic → revise-once → result; UI fires and polls; progress in Notion App State | one click → critic-reviewed stage output; survives a closed tab |
| 5 | Real state + event log *(only if Phase 4's gate says "chain stages")* | recoverable multi-stage runs; per-episode timeline | Netlify Blobs (or a small hosted SQLite) + `lib/events.js` append-only log + `run-episode.js` with checkpoints | an interrupted multi-stage run resumes from the last checkpoint |
| 6 | Genuine autonomy *(probably never)* | a planner decides which stages an episode needs | — | only if the fixed pipeline proves too rigid |

Phases 1–4 ≈ 10–14 focused sessions, all JS/Netlify, app stays live throughout.
The Notion "System Roadmap" section carries the one-line summary; detail lives
here.

## Security notes (not in the Notion doc)

- **API keys** have been rotated. Each proxy reads its key from a Netlify
  environment variable (`ANTHROPIC_API_KEY`, `GOOGLE_TTS_API_KEY`,
  `YOUTUBE_API_KEY`, `NOTION_TOKEN`), falling back to a key in the request body
  only while the env vars are being configured. Follow-up: remove that fallback,
  stop `index.html` sending keys, and remove the plaintext key table from the
  Notion App Settings page.
- Netlify functions do **no schema validation** on upstream responses.
- No rate-limit handling or retry in any proxy (addressed in evolution Phase 1).

## Pointers

- Working principles (deterministic checks over AI, keep providers swappable,
  untrusted content is data) → [`../CLAUDE.md`](../CLAUDE.md).
- The shelved Python/agent redesign → `archive/` (history only, not a plan).
