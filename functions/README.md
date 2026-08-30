# Netlify Functions — Provider Proxies

These four functions are the app's **provider boundary**. Each is a stateless
CORS proxy: the browser sends the payload, the function forwards it to the
upstream API and returns the JSON response unchanged.

**Keys are Netlify environment variables — the browser sends none.** Each
function reads its key/token from `process.env` and returns `500` if it is not
configured.

| Function             | Env var (required)                                                                 |
| -------------------- | ---------------------------------------------------------------------------------- |
| `anthropic-proxy.js` | `ANTHROPIC_API_KEY`                                                                |
| `tts-proxy.js`       | `GOOGLE_TTS_API_KEY`                                                               |
| `youtube-proxy.js`   | `YOUTUBE_API_KEY`                                                                  |
| `notion-proxy.js`    | `NOTION_TOKEN`                                                                     |
| `ai-run.js`          | `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `NOTION_TOKEN` (cost log) |
| `yt-transcript.js`   | none required; `TRANSCRIPT_API_KEY` optional (youtube-transcript.io fallback)      |
| `maps-proxy.js`      | `GOOGLE_MAPS_API_KEY` optional — no key → `{ found:false, reason:'no_key' }`       |

Set these in the Netlify dashboard (Site settings → Environment variables) and,
for local `netlify dev`, in a gitignored `.env` (see `.env.example`).

`_shared/` (underscore prefix — not deployed as a function) holds the
provider-agnostic model router `models.js` (`callModel()`), used from Phase 2
onward via an `ai-run.js` endpoint. See `Docs/AS_BUILT.md` → "Direction &
evolution plan". Adapters currently: Anthropic (`ANTHROPIC_API_KEY`), Gemini
(`GEMINI_API_KEY`).

All functions: `POST` only (plus `OPTIONS` preflight),
`Access-Control-Allow-Origin: *`, JSON in / JSON out, upstream errors returned
with their status code.

## `notion-proxy.js`

Forwards to `https://api.notion.com/v1/{endpoint}`.

```jsonc
// request body
{
  "endpoint": "databases/<id>/query",   // path after /v1/
  "method": "GET" | "POST" | "PATCH",   // default "GET"
  "body": { /* Notion API body, sent only when method != GET */ },
  "token": "ntn_…"                       // Notion integration token
}
```

Adds `Notion-Version: 2022-06-28`. Returns the raw Notion response + status.

## `anthropic-proxy.js`

Forwards to `https://api.anthropic.com/v1/messages`.

```jsonc
{
  "model": "claude-haiku-4-5-20251001", // default if omitted
  "max_tokens": 1000, // default
  "system": "…", // optional
  "messages": [{ "role": "user", "content": "…" }],
  "apiKey": "sk-ant-…",
}
```

Adds `anthropic-version: 2023-06-01`. Returns the raw Messages API response.

## `tts-proxy.js`

Forwards to `https://texttospeech.googleapis.com/v1/text:synthesize`.

```jsonc
{
  "text": "…",
  "voice": { "languageCode": "en-US", "name": "en-US-Neural2-D" }, // default = Kai
  "audioConfig": { "audioEncoding": "MP3" }, // default
  "apiKey": "<google-api-key>",
}
```

Kai = `en-US-Neural2-D`, Mia = `en-US-Neural2-F`. Returns
`{ audioContent: <base64> }`.

## `youtube-proxy.js`

Forwards to `https://www.googleapis.com/youtube/v3/{path}`.

```jsonc
{
  "path": "search" | "videos" | "channels" | "captions",
  "params": { "part": "snippet", "q": "…", "maxResults": 25 },
  "apiKey": "<google-api-key>"
}
```

`key` is appended to the query string. Returns the raw YouTube Data API response.

## `yt-transcript.js`

`POST { "url": "<youtube url or 11-char id>", "lang": "ja" }` (`lang` optional).

Tries the free path first — fetch the watch page, pull the caption track from
`ytInitialPlayerResponse`, fetch it as `json3`, flatten to text. If that yields
nothing and `TRANSCRIPT_API_KEY` (a youtube-transcript.io token) is set, falls
back to `POST https://www.youtube-transcript.io/api/transcripts`.

```jsonc
// 200
{ "text": "…", "videoId": "…", "lang": "ja", "source": "scrape" | "youtube-transcript.io" }
// 404 { "error": "No transcript found…", "code": "not_found" }
```

No env var is required (free path only); `TRANSCRIPT_API_KEY` just enables the
fallback.

## `maps-proxy.js`

`POST { "query": "<place name> <area> Japan" }` → Google **Places API (New)**
Text Search (`places:searchText`, `maxResultCount: 1`, `regionCode: JP`).

```jsonc
// 200 — match
{ "found": true, "name": "…", "prefecture": "Shizuoka", "area": "Fujinomiya",
  "address": "…", "lat": 35.4, "lng": 138.6, "mapsUri": "https://maps.google.com/…",
  "primaryType": "campground", "priceLabel": "¥¥", "priceRange": "¥¥" }
// 200 — no key / no result
{ "found": false, "reason": "no_key" }   // or just { "found": false }
```

`prefecture` = the `administrative_area_level_1` component, trimmed of a trailing
"Prefecture". Used by Stage 2 → Places to override the AI's prefecture guess.

## Contract stability

The browser (`index.html`) depends on these shapes. Change them additively only;
a breaking change means updating `index.html` in the same commit.

## Known gaps

- No schema validation on upstream responses — treated as trusted.
- No rate-limit handling or retry.
- Errors bubble up as `{ error: <message> }` with the upstream status.
