# Netlify Functions — Provider Proxies

These four functions are the app's **provider boundary**. Each is a stateless
CORS proxy: the browser sends the payload, the function forwards it to the
upstream API and returns the JSON response unchanged.

**Key resolution:** each function uses its Netlify environment variable first,
falling back to the key in the request body (legacy path, being removed):

| Function             | Env var              |
| -------------------- | -------------------- |
| `anthropic-proxy.js` | `ANTHROPIC_API_KEY`  |
| `tts-proxy.js`       | `GOOGLE_TTS_API_KEY` |
| `youtube-proxy.js`   | `YOUTUBE_API_KEY`    |
| `notion-proxy.js`    | `NOTION_TOKEN`       |

Set these in the Netlify dashboard (Site settings → Environment variables) and,
for local `netlify dev`, in a gitignored `.env` (see `.env.example`). Once set,
the browser no longer needs to send keys.

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

## Contract stability

The browser (`index.html`) depends on these shapes. Change them additively only;
a breaking change means updating `index.html` in the same commit.

## Known gaps

- No schema validation on upstream responses — treated as trusted.
- No rate-limit handling or retry.
- Errors bubble up as `{ error: <message> }` with the upstream status.
