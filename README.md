# Nomad Dimension

An editorial workspace for one operator producing documentary-style YouTube
episodes: collect research material, plan an episode, write a two-host script,
render narration, and hand the episode off to editing. Notion is the
cross-device state store; every AI, speech, and data provider call goes through
an authenticated server endpoint, so the browser never holds a provider key.

The channel format is a dual-presenter documentary — **Kai** (host) and **Mia**
(co-host) — covering history, culture, travel, and geography.

[![CI](https://github.com/nadyapribadi/Nomad_Dimension/actions/workflows/ci.yml/badge.svg)](https://github.com/nadyapribadi/Nomad_Dimension/actions/workflows/ci.yml)

## What it is

One operator runs the whole production loop from a single buildless web app. The
app is the cockpit; Notion is the database. Material is collected once, as typed
rows (places, activities, food, transport, quotes, angles, research, prices,
data, glossary), and every later stage reads from those stores instead of
re-extracting the same transcript.

**Scope, honestly:** this is a personal production tool, not a product. It is
wired to one Notion workspace — database ids are declared in the client
(`src/notion.js`) and `functions/_shared/cost.js` — there are no user accounts,
and sign-in is a single shared operator password. Treat it as a working
reference for the architecture, not a turnkey install. The Notion schemas and
the identifiers the code expects are documented in
[`Docs/AS_BUILT.md`](Docs/AS_BUILT.md).

## The pipeline

Top-level destinations: **Library** (research), **Ideas**, **Episodes**, and
**Settings**.

| Destination     | What it does                                                                                                                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library         | Add a source (a YouTube URL auto-fetches its transcript; anything else is pasted), extract it into typed material, review and deduplicate, and ask a research question. Includes optional fact-checking against web grounding, with results saved back to Notion. |
| Ideas           | Material-first idea notes: a working idea, the question it answers, and its stage.                                                                                                                                                                                |
| Episodes        | The episode calendar and the entry point into an episode workspace.                                                                                                                                                                                               |
| Episode Builder | Assemble reviewed material into typed sections and commit an episode plan.                                                                                                                                                                                        |
| Script Builder  | Section-by-section dialogue for Kai and Mia.                                                                                                                                                                                                                      |
| Audio TTS       | Neural voice synthesis per host, then full-episode playback.                                                                                                                                                                                                      |
| Handoff         | Cut guide, design brief, thumbnail brief, and YouTube metadata.                                                                                                                                                                                                   |
| Settings        | Connection status, provider routing, voice, location matching, and the channel's editorial DNA.                                                                                                                                                                   |

An open episode carries four views, **Plan**, **Write**, **Produce**, and
**Export**, over the same data.

## Architecture

- **The frontend is buildless.** `index.html` holds the markup, an inline
  `<style>`, the shared data, the listeners, and the `init()` call. Everything
  else is `src/*.js`, loaded as classic scripts before the inline script. No
  framework, no bundler, no build step, no runtime dependency.
- **All provider access is server-side.** Netlify Functions in `functions/` proxy
  Anthropic, OpenAI-compatible providers, Gemini, Google TTS, YouTube, Google
  Places, and Notion. Every one of them requires an HMAC-signed eight-hour
  session cookie and rejects cross-site requests; keys live only in server
  environment variables. Contract: [`functions/README.md`](functions/README.md).
- **State lives in Notion.** The app reads the App Settings page on load and
  writes results back. Browser-local drafts and rendered audio are convenience
  caches, not the record.
- **Deploys are curated.** `scripts/build-deploy.mjs` stages a whitelist of
  publishable files into `_deploy/`, so docs, tests, agent config, and generated
  indexes cannot ship.

### Repository layout

```
Nomad_Dimension/
├── index.html              # shell + shared data + listeners (buildless)
├── src/
│   ├── core.js             # pure helpers: text, similarity, sorting, identity
│   ├── notion.js           # the Notion API seam and browser-local artifact store
│   ├── library.js          # sources, material, fact review, duplicates, places, ideas
│   ├── stages.js           # transcript, script, audio, handoff, export
│   └── app.js              # navigation, dialogs, settings, table engine, run state
├── functions/              # protected Netlify endpoints + _shared adapters/auth
├── scripts/                # deploy staging, inline lint, HTML syntax check, tests
├── netlify.toml            # publish, redirect, and header policy
├── SECURITY.md             # reporting and testing rules
└── LICENSE
```

`Docs/` and `CHANGELOG.md` are the operator's working notes. They stay out of
this repository on purpose — they name raw Notion identifiers, draft URLs, and
provider costs — so the published surface is the code and the files listed
above.

## Local development

Node 22 (`.nvmrc`).

| Command                 | What it does                                                             |
| ----------------------- | ------------------------------------------------------------------------ |
| `npm install`           | Installs tooling and wires the pre-commit hook.                          |
| `npm run dev`           | `netlify dev` — local server plus functions (needs a gitignored `.env`). |
| `npm run check`         | eslint, prettier check, `index.html` script syntax, and `node --test`.   |
| `npm run format`        | Applies prettier.                                                        |
| `npm run graph:refresh` | Refreshes the local GitNexus and Graphify code indexes.                  |

There is no build step, so editing `src/*.js` and reloading is the whole loop.

## Environment variables

Copy [`.env.example`](.env.example) to `.env` for local `netlify dev`; in
production the same names are set in the Netlify dashboard. `.env` is
gitignored, and no key belongs in the repository, a commit, or a log.

| Variable                                                                                                        | Purpose                                                                                            |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `APP_PASSWORD`                                                                                                  | **Required.** Operator sign-in, at least 16 characters. Rotating it invalidates existing sessions. |
| `NOTION_TOKEN`                                                                                                  | **Required.** Notion integration token.                                                            |
| `NOTION_COLLECTIONS_DATABASE_ID`, `NOTION_PLACEMENTS_DATABASE_ID`                                               | **Required.** Material stores.                                                                     |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`                                                         | Model routes.                                                                                      |
| `GOOGLE_TTS_API_KEY`                                                                                            | Speech synthesis.                                                                                  |
| `YOUTUBE_API_KEY`                                                                                               | Source-channel browsing.                                                                           |
| `GOOGLE_MAPS_API_KEY`                                                                                           | Optional. Places enrichment: prefecture, coordinates, address.                                     |
| `TRANSCRIPT_API_KEY`                                                                                            | Optional fallback when the free caption scrape is blocked.                                         |
| `DEEPSEEK_API_KEY`, `DASHSCOPE_API_KEY`, `MISTRAL_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY` | Optional extra providers. Set only the ones you route to.                                          |

Missing or unreadable provider routing fails closed rather than silently falling
back to server defaults.

## Testing and CI

`npm run check` is the gate, and CI runs it on every push and pull request
(`.github/workflows/ci.yml`). Tests are `node --test` over `functions/**` and
`scripts/**`; the write paths that could lose operator work are pinned first.
The pre-commit hook also refreshes both code graphs, best-effort — an offline
graph refresh warns instead of blocking the commit.

## Deployment

Hosted on Netlify with **auto-builds stopped**: pushing to `main` does not
deploy. Staging and promotion are deliberate, separate steps
(`npm run deploy:preview`, then `netlify deploy --prod`), because the credit
plan charges per production deploy.

## Documentation

- [`functions/README.md`](functions/README.md) — the endpoint contract: what each
  function accepts, which environment variables it needs, and what it will not
  do.
- [`CLAUDE.md`](CLAUDE.md) — the working rules for coding agents in this repo;
  [`AGENTS.md`](AGENTS.md) points every agent at it.
- [`SECURITY.md`](SECURITY.md) — how to report a vulnerability, and the rules for
  testing without spending the operator's provider budget.

The implementation notes the code comments refer to (`Docs/AS_BUILT.md`,
`Docs/PIPELINE.md`, `Docs/REVAMP_PLAN.md`, `Docs/FIRST_EPISODE_TEST.md`, and the
shelved redesign under `Docs/archive/`) are deliberately not published.

## Security posture

No provider key, Notion token, or password is stored in this repository or
shipped to the browser. All provider endpoints are POST-only, same-origin,
size-limited, and require the signed session cookie; the Notion proxy restricts
API operations and path shapes, and the integration's own permissions remain the
data scope. Treat transcript, web, and Notion text passed to a model as data,
not instructions.

Known limits: sign-in throttling is best-effort per warm instance rather than a
shared rate limiter, and cost coverage is not a complete billing ledger. See
`functions/README.md`, and [`SECURITY.md`](SECURITY.md) for how to report a
problem.

## License

[MIT](LICENSE). Use it, copy it, change it, ship it; keep the copyright notice
and the warranty disclaimer.
