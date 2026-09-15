# Netlify Functions — Provider boundary

Provider functions, `session.js`, and `library-config.js` serve the single-operator app.
Provider keys come only from private server environment variables; the browser
sends no provider keys or Notion token.

## Sign-in

All provider endpoints, including their direct `/.netlify/functions/` URLs,
require an HMAC-signed eight-hour session cookie. `POST` to
`/.netlify/functions/session` with `{ "password": "…" }` signs in;
`{ "action": "status" }` checks authentication and `{ "action": "logout" }`
expires the cookie. Configure a unique `APP_PASSWORD` of at least 16 characters.
Missing configuration fails closed with 503; missing/invalid sessions return 401. Cookie flags are HttpOnly, SameSite=Strict, and Secure over HTTPS.
Rotating the password invalidates existing sessions. Sign-in throttling is
best-effort per warm instance, not a shared rate limiter. Browser-local drafts
and audio are retained on sign-out.

All provider handlers use `_shared/auth.js`: POST only, same-origin checks,
JSON object input, a 1 MB body limit, no wildcard CORS, and no-store responses.
OPTIONS returns no cross-origin authorization. The Notion proxy restricts API
operations and path shapes; it does not implement per-record ownership or
resource ancestry checks. The integration's permissions remain the data scope.

| Function                        | Server environment                                                     |
| ------------------------------- | ---------------------------------------------------------------------- |
| `session.js` and every provider | `APP_PASSWORD` required                                                |
| `library-config.js`             | `NOTION_COLLECTIONS_DATABASE_ID`, `NOTION_PLACEMENTS_DATABASE_ID`      |
| `notion-proxy.js`               | `NOTION_TOKEN`                                                         |
| `tts-proxy.js`                  | `GOOGLE_TTS_API_KEY`                                                   |
| `youtube-proxy.js`              | `YOUTUBE_API_KEY`                                                      |
| `ai-run.js`                     | Keys for configured routes; `NOTION_TOKEN` for routing and cost writes |
| `yt-transcript.js`              | `TRANSCRIPT_API_KEY` optional fallback                                 |
| `maps-proxy.js`                 | `GOOGLE_MAPS_API_KEY` optional                                         |
| `web-research.js`               | `GEMINI_API_KEY`                                                       |
| `cost-log.js`                   | `NOTION_TOKEN` (writes one Production Costs row per fact-check run)    |

Set these in Netlify environment variables and, for local development, a
gitignored `.env` (see `.env.example`). Model adapters, key names, and routing
are documented in [AS_BUILT.md](../Docs/AS_BUILT.md).

## `service-status.js`

Authenticated `POST {}` returns `configured` (service-to-boolean key presence),
`factCheck` (provider/model/search metadata), and `checked: "presence-only"`.
It never returns credentials/fragments, tests a provider, reads a balance, or
makes an upstream call. It reports the environment of the deployment serving the
request. A configured key does not establish valid access or available funds.

## `ai-run.js`

`POST { task, system, messages, maxTokens?, provider?, model?, episode? }`
returns normalized text, provider/model, usage, estimated cost, and
`costLogged`. Routing is read from Notion with a short cache. Missing or unreadable saved
routing returns `503 routing_unavailable` before any model call; it never silently
uses server defaults. A complete explicit provider/model override remains supported. Provider attempts share a 48-second deadline. Token output is
capped at 12,000; empty/truncated output fails visibly. A cost write is awaited
for up to 2.5 seconds; failure does not discard completed model output.
This is not a complete billing ledger: TTS, web grounding, and other provider
calls are not covered, and Episodes has no calculated total here.

## `notion-proxy.js`

Forwards to `https://api.notion.com/v1/{endpoint}`.

```jsonc
// request body
{
  "endpoint": "databases/<id>/query",   // path after /v1/
  "method": "GET" | "POST" | "PATCH",   // default "GET"
  "body": { /* Notion API body, sent only when method != GET */ },
}
```

Adds `Notion-Version: 2022-06-28`. Returns the raw Notion response + status and
forwards Retry-After when present.

`library-config.js` accepts authenticated `POST {}` and returns `{ collections,
placements }`, containing only configured database IDs. Missing/invalid IDs return
503; keys and Notion tokens are never included. The frontend verifies table access
before using these IDs.

## `tts-proxy.js`

Forwards to `https://texttospeech.googleapis.com/v1/text:synthesize`.

```jsonc
{
  "text": "…",
  "voice": { "languageCode": "en-US", "name": "en-US-Neural2-D" }, // default = Kai
  "audioConfig": { "audioEncoding": "MP3" }, // default
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
{ "text": "…", "videoId": "…", "lang": "ja", "source": "scrape" | "youtube-transcript.io",
  "segments": [{ "text": "…", "startMs": 2500, "durationMs": 1200 }] }
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
"Prefecture". Presented as a candidate in Research → Places; precise fields are applied only after the operator accepts the match.

## `web-research.js`

Gemini (`gemini-3.6-flash`) + Google Search grounding. Two modes:

```jsonc
// open question
POST { "query": "onsen etiquette for tattoos", "focus": "primary sources" }
  -> { "extract": { "places":[…], "research":[…], "prices":[…], "data":[…], "glossary":[…] },
       "sources": [{ "title": "…", "url": "…" }], "model": "gemini-3.6-flash" }

// verify collected rows (Research → Web → "Verify collected")
POST { "mode": "verify", "store": "research",
       "items": [{ "name": "…", "detail": "kind: fact · prefecture: Iwate" }] }   // ≤40
  -> { "verified": [{ "name", "verdict": "confirmed|corrected|unsupported",
                      "confidence": "low|medium|high", "source_url", "as_of_date",
                      "corrected_value", "note" }],
       "sources": […], "model": "gemini-3.6-flash" }
```

Bails at 23 s → `504 { error }`. `502` on
provider/network failure, `500` if `GEMINI_API_KEY` is unset.

## Contract stability

The browser (`index.html`) depends on these shapes. Change them additively only;
a breaking change means updating `index.html` in the same commit.

## Limits

Notion and TTS requests have 25-second deadlines; YouTube uses 20 seconds.
TTS accepts at most 4,500 UTF-8 bytes per line. Provider response validation
varies by adapter; errors are returned to the caller. LLM routing has bounded
retry/fallback. Other writes are recovered at the workflow layer where possible.
Source-caption timing is optional; missing timing is null, never invented.

`ai-run` accepts optional `singleAttempt: true` for extraction: one provider attempt,
a 20-second model budget, and no automatic retry/fallback. This does not guarantee
a live model response or erase potential costs from a timed-out request. The client
retains completed extraction parts and asks the operator to resume explicitly.

An explicit null model fallback disables provider switching. An omitted fallback
in a direct `callModel` request still uses the built-in task default. Extraction
uses `singleAttempt`, suppressing both same-model retries and provider fallback.

`ai-run` also accepts `routeChoice: "fallback"` for an explicit retry through the
existing saved task fallback. It cannot be combined with provider/model overrides.
No saved fallback means 503 before calling a provider. The extraction client keeps
singleAttempt enabled and reuses completed source checkpoints. DeepSeek V4/chat
structured extraction requests non-thinking JSON; other tasks retain their mode.
