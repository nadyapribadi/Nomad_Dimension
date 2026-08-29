# As-Built — Code-Side Notes

Status: **Drafted** — the code-side companion to the operating manual.

## Source of truth

The operating manual for Nomad Dimension is the Notion page
**"📖 Nomad Dimension — System Documentation"**
(id `3499ba2b-3900-8087-8800-cd0db5f579f5`). It covers the channel model, the
8-stage pipeline, the 8-database schema, model routing, status flow, naming, and
the design decisions. **Read it first.**

This file only covers what a developer or coding agent needs that the Notion doc
doesn't: exact identifiers used in `index.html`, the proxy contract, a function
map, and where the **code diverges from the spec**.

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

## Security notes (not in the Notion doc)

- **API keys live in plain text on the App Settings Notion page**, loaded into
  browser memory and passed per-request to the proxies. Anyone with that page —
  or the Notion integration token — has every key. Rotating a key = editing the
  page. There is no server-side secret store.
- Netlify functions do **no schema validation** on upstream responses.
- No rate-limit handling or retry in any proxy.

## Principles carried over from `archive/` (the shelved redesign)

1. **Deterministic QA before human review.** Prefer a code check to an AI
   critique; use AI review only where a deterministic check can't express the
   rule. (`runScriptCheck` is the first instance.)
2. **Keep providers swappable.** The model-routing table and the 4 proxies are
   the provider boundary — never hard-code a vendor in stage logic.
3. **Untrusted external content is data, never instructions.** Applied to the
   Claude prompts; applies to any future retrieved text.

The full shelved redesign (Python / autonomous agents / capability layer) is in
`archive/`, kept for its engineering thinking. It is not a plan.
