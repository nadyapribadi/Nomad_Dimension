# As-Built System (v0)

Status: **Drafted** — describes what exists in the repo today, as of this pass.

This document is the source of truth for the *current* system.
`target-architecture/` describes an aspirational design; where it disagrees with
this file, this file wins for "what is". See §9 for the relationship.

## 1. What It Is

A single-page web app that walks one operator through producing a documentary
YouTube episode, stage by stage, with Claude assisting at each step and **Notion**
as the cross-device state store. Deployed on Netlify; push to `main` deploys.

- **Format:** dual-host ("Kai" = host ~55%, "Mia" = co-host ~45").
- **Channel focus:** history / culture / travel / geography.
- **Handoff target:** CapCut (edit) + Canva (thumbnail) + YouTube metadata — not
  DaVinci.

## 2. Stack

| Part | Implementation |
| --- | --- |
| Frontend | One file: `index.html` (~3,200 lines), inline `<style>` + `<script>`, vanilla JS, no framework, no build step |
| Backend | 4 Netlify Functions in `functions/` — thin CORS proxies |
| State / DB | Notion (6 databases + 1 settings page) |
| LLM | Anthropic Claude via `anthropic-proxy.js` (default `claude-haiku-4-5-20251001`) |
| TTS | Google Cloud Text-to-Speech via `tts-proxy.js` (`en-US-Neural2-D` Kai, `en-US-Neural2-F` Mia) |
| Video data | YouTube Data API v3 via `youtube-proxy.js` |
| Hosting | Netlify (`netlify.toml`: `publish = "."`, `functions = "functions"`) |
| Secrets | Stored in the Notion **App Settings** page, loaded into memory at runtime, passed per-request to the proxies. Notion integration token kept in `sessionStorage` only. |

## 3. Netlify Functions (the provider boundary)

Each is a stateless proxy: browser sends the payload incl. the API key, function
forwards to the upstream API, returns the JSON. CORS `*`. See
`functions/README.md` for the request/response contract.

| Function | Upstream | Browser payload |
| --- | --- | --- |
| `notion-proxy.js` | `api.notion.com/v1/{endpoint}` | `{ endpoint, method, body, token }` |
| `anthropic-proxy.js` | `api.anthropic.com/v1/messages` | `{ model, max_tokens, system, messages, apiKey }` |
| `tts-proxy.js` | `texttospeech.googleapis.com/v1/text:synthesize` | `{ text, voice, audioConfig, apiKey }` |
| `youtube-proxy.js` | `googleapis.com/youtube/v3/{path}` | `{ path, params, apiKey }` |

## 4. Notion Data Model

Hard-coded IDs in `index.html` (`DB_IDS` + `APP_SETTINGS_PAGE_ID`):

| Key | Notion DB | Role |
| --- | --- | --- |
| App Settings page | `33c9ba2b-3900-8132-b172-f136389ac2e2` | API keys, model config, Channel DNA, lookup tables, app state (current stage) |
| `sourceChannels` | `ad90cd8a-…` | YouTube channels to browse for inspiration |
| `sourceVideos` | `29429e5b-…` | Discovered/queued inspiration videos |
| `episodes` | `b298e52a-…` | Episode records (number, title, concept, hook, status) |
| `scripts` | `be955033-…` | Script sections + Kai/Mia dialogue per episode |
| `places` | `9b03bb34-…` | Places extracted from transcripts, confirmed + route-ordered |
| `costs` | `6c2855fd-…` | Cost tracking — **declared but not yet written to** |

"Channel DNA" and lookup tables (sections, tones, voices) live as key/value
blocks on the App Settings page, parsed by `parseAndApplySettings()`.

## 5. Stages (as implemented)

| # | Stage | Key functions | Notes |
| --- | --- | --- | --- |
| 0 | Settings | `connectNotion`, `loadSettingsFromNotion`, `parseAndApplySettings`, `renderSettingsUI`, `runHealthCheck`, `resumeSession` | `saveModels` / `saveLookups` are **local-only** ("Notion write coming soon") |
| 1 | YouTube Browser | `fetchYouTube`, `renderYTVideos`, `openReviewModal`, `pushToNotion` | Browse source channels, select inspiration videos, push to Source Videos |
| 2 | Episode Builder | `loadSourceQueue`, `generateThemes`, `selectTheme`, `suggestEpisodeTitles`, `createEpisode`, `loadCalendar`, `runGapAnalysis` | Tabs: Queue / Theme / Create / Calendar / Gap |
| 3A | Transcript | `loadTranscriptVideos`, `runPass1`, `saveOutlineToNotion` | Paste SRT or let Claude build an outline from metadata |
| 3B | Places Review | `extractPlaces`, `renderPlacesReview`, `confirmPlace`, `renderRouteOrder`, `movePlaceUp/Down`, `saveConfirmedPlaces` | Extract + confirm + order places |
| 4 | Script Builder | `loadSections`, `renderSectionCard`, `generateDialogue`, `lockSection`, `saveSection`, `applyTemplate` | Section-by-section Kai/Mia dialogue via Claude |
| 5 | Audio TTS | `renderAllAudio`, `playSegment`, `playFullEpisode`, `exportAudio` | Google Neural TTS per line, full playback, export |
| 6 | Handoff | `generateHandoff`, `renderHandoffDoc`, `saveHandoffToNotion`, `regenerateHandoff` | CapCut guide + Canva brief + thumbnail brief + YouTube metadata |

`buildDNASystem()` composes the Channel DNA into the system prompt used for
Claude calls.

## 6. Runtime State (`S` object)

In-memory only (not persisted except via explicit Notion writes): `notionToken`,
`keys`, `models`, `dna`, `lookups`, `channels`, `ytVideos`/`ytSelected`,
`epQueue`/`epSelected`, `chosenTheme`, `activeEpisode`, `sections`,
`audioBuffers`, `extractedPlaces`/`confirmedPlaces`, `handoffDoc`.

App state (current stage) is mirrored to Notion via `writeAppState()`.

## 7. Known Gaps in v0

- `saveModels()` and `saveLookups()` don't persist to Notion.
- The `costs` database is declared but nothing writes cost rows.
- No `package.json`, ESLint, Prettier, tests, or CI (added by revised P0).
- All CSS + JS inline in `index.html` — not independently lintable/reviewable.
- No error surface beyond `toast()`; proxy errors bubble up as raw messages.
- Notion DB IDs and the settings page ID are hard-coded in the HTML.
- No schema validation on Notion responses (treated as trusted).
- Transcript / web text is passed into Claude prompts without explicit
  data/instruction delimiting — a prompt-injection surface.

### Security note: where the API keys live

All provider keys (Anthropic, Google, YouTube) are stored as plain text on the
Notion **App Settings** page and loaded into browser memory at runtime. Anyone
with access to that Notion page — or to the Notion integration token — has every
key. There is no server-side secret store; the Netlify functions only forward
whatever key the browser sends. Rotating a key means editing the Notion page.
Treat the App Settings page as a credentials file.

## 8. What Is NOT Here

No Python, no SQLite, no local-first runtime, no Hermes orchestrator, no
autonomous agents, no independent Critic loop, no image/video/maps generation, no
Replicate/Tavily/ElevenLabs, no DaVinci handoff. Those live in
`target-architecture/` — see §9.

## 9. Relationship to `target-architecture/`

`Docs/target-architecture/` (files `00`–`24`, plus `KNOWN_LIMITATIONS.md`,
`REQUIREMENTS_TRACEABILITY.md`, and the blueprint `.docx`) is an aspirational
design: Python, local-first, SQLite, six autonomous agents, an independent
Critic, DaVinci handoff. It was written from the `.docx` before this app's shape
was settled.

Decisions:

1. **The shipped JS/Netlify/Notion app is the product.** No Python rebuild.
2. **`target-architecture/` is reference for a possible future version**, not a
   plan. It is not maintained against the current code.
3. **Whether that direction (agent orchestration + Critic) is ever pursued is an
   open question for the operator.** Until answered, it stays parked.

Ideas from it worth pulling into the current app, in rough priority:

- Wire the `costs` Notion DB (cost per episode). *(target: `15_EFFICIENCY_AND_COST.md`)*
- Persist `saveModels` / `saveLookups` to Notion.
- A lightweight per-stage QA prompt — a "mini-Critic" for script and place lists.
- Keep external text (transcripts, web content) clearly delimited when passed to
  Claude, never as instructions. *(target: `09_POLICY_AND_SAFETY_MODEL.md` §8)*
- Note the secret-handling risk: API keys live on a Notion page; anyone with
  that page has them. *(target: `19_RISK_REGISTER.md`)*
