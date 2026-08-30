# Research pipeline — Step 1 rebuild (design, not yet built)

Status: **designed, not implemented.** This is the target for restructuring the
current Stage 1 (YouTube Browser) + Stage 2 tabs (Queue / Prep / Places) into a
single **Research** step whose only job is to fill Notion with reusable,
one-fact-per-column material. Building an episode from that material is Step 2
(Episode Builder) — designed separately, later.

Supersedes the ad-hoc "prep breakdown lives in memory → Assemble reads memory"
flow. See `AS_BUILT.md` → "Direction & evolution plan".

---

## Principle

**Sources → one extraction → typed material → Notion stores.**
Every column holds exactly one value that its name describes. No catch-all
"Notes" / "Detail" fields. Kinds with a genuinely different atomic shape get
their own small DB rather than a wide sparse one.

Ingestion is **source-agnostic**: one "Add source" takes `{ platform, url,
pasted_text }`. YouTube auto-fetches a transcript; everything else is pasted.
Adding a real TikTok/IG fetcher later is optional — paste already covers it.

---

## Pipeline flow

Two entry points; two human review gates; Verify is optional and selective.

```
ENTRY A — a source                     ENTRY B — a question
  YouTube URL → auto transcript          "onsen towns in Tohoku"
  TikTok/IG/blog/PDF → paste text        "why is Iwate depopulating"
        │                                       │
   normalise (MT/any language → clean English)  │
        │                                       │
   EXTRACT — 2 passes                           │
     1. places · food · transport · quotes · angles     (strong from a transcript)
     2. research · prices · data · glossary             (weak from a transcript)
     every item tagged: source_url=<video>, source_name=<creator>,
       as_of_date=<publish date>, confidence=low, needs_verification=true
        │                                       │
   ▼ REVIEW #1 (operator) — tick keep/skip, dedup vs existing DB rows
        │                                       │
   WEB VERIFY & ENRICH  ◄───────────────────────┘
     • confirm / correct / dispute each low-confidence claim
     • add facts · data · glossary the vlogger never mentioned
     • every surviving item gets a real source_url + raised confidence
        │
   ▼ REVIEW #2 (operator) — tick keep/skip
        │
   PUSH → Places · Food · Transport · Research · Prices · Data · Glossary
          (quotes → Source row; angles → Plan / Ideas)
```

- Stop after Review #1 for a quick pass — Verify runs only on ticked items.
- Entry B (no video) enters straight at Verify & Enrich.

### Why two extract passes

The 30s Netlify function ceiling. Two small calls finish in ~8s each; one call
with a 9-array schema + a 12k-char transcript is the exact shape that times out
and truncates mid-JSON. A thin pass is fixed by tightening *that pass's* prompt,
never by merging (a bigger schema makes the model shallower per type). Single-pass
is only an ops fallback (fewer calls, two→one failure point), never a quality move.

### Why a transcript is weak evidence

A vlogger asserting "this onsen is 1,000 years old" is not a verified fact.
Transcript extraction records what is *said*, all `confidence=low`,
`source_url=<the video>`. The Web Verify pass is what turns a claim into a
sourced fact — or a `dispute` row, or a correction.

---

## Sources

| Source | Text via | Effort |
| --- | --- | --- |
| YouTube | auto transcript (`functions/yt-transcript.js`) | built |
| Web / blog / Reddit / Wikipedia / official / news | Gemini Google-Search grounding | new |
| Japanese web (Tabelog, Jalan, 4travel, gov) | same, ask for JP sources + translate | new |
| Google Maps | `functions/maps-proxy.js` (rating / summary / price / coords) | built |
| TikTok / Instagram | **no API** — paste caption/transcript, or a paid scraper later | paste-only |
| PDF / arbitrary text | paste | trivial |

**Web search is not universal.** Gemini has native grounding; OpenAI and
Anthropic have their own (different shapes); **DeepSeek has none**. Pin the
research/verify task to **Gemini grounding** (free, key already set). All other
tasks stay switchable via the Notion routing block.

---

## Notion stores (one fact per column)

### Sources DB — rename of "Source Videos"
`Title · Platform · URL · Creator · Published Date · Retrieved Date · Raw Text ·
Extraction JSON · Status`

### Places DB — exists
Already one-fact-per-column after the 2026-08 pass: `Name · Type · Prefecture ·
Price Range · Price Note · Halal · Country · B-Roll Description · Food · Google
Maps URL · Address · Coordinates · Website · Rating · Review Count · Summary ·
Source Video · Used In Episodes · Date Added · Last Verified`.

### Research DB — new — the "sourced sentence" kinds
`Statement · Kind · Source URL · Source Name · Confidence · As-of Date ·
Retrieved Date · Prefecture · Place (relation) · Topic · Used In Episode (relation)`
Kinds: `fact · connection · dispute · misconception · sentiment · etiquette ·
access · timing`. One statement per row. A new kind = one new dropdown option,
no migration.

### Prices DB — new
`Item · Amount · Currency · Place (relation) · Source URL · As-of Date`

### Data DB — new — numbers need value/unit/year apart
`Metric · Value · Unit · Year · Place or Region · Source URL`

### Glossary DB — new — Japanese terms
`Term · Reading (kana) · Romaji · English · Usage Note`

### Food DB — new — a dish is a reusable entity, distinct from a restaurant
`Dish · Japanese Name · Romaji · Category` (Noodle / Rice / Seafood / Sweet /
Street / Drink / Other) `· Region of Origin · Halal · Taste / Description ·
Where Tried (relation) · Source URL · Used In Episode`
No price column — a price is a Prices DB row (`Item = dish`), shown via rollup.

### Transport DB — new — hard facts only
`Route or Segment · Mode` (Drive / Ferry / Train / Ropeway / Walk) `· From · To ·
Distance km · Duration · Fare or Toll · Scenic` (checkbox) `· Source URL ·
Used In Episode`
Soft stuff (road conditions, "closed Dec–Apr", gravel) → Research DB `access` /
`timing` rows linked to the route.

### Plan / Ideas — `angles` land here (existing Plan step + gap analysis).

---

## Extraction JSON — same shape every source

Atomic arrays; empty `[]` where the source is silent (same rule as today's
breakdown). Every key is single-purpose.

```jsonc
{
  "places":    [{ "name", "name_local", "romaji", "type", "prefecture_guess",
                  "area_guess", "what_happens_here", "price_if_spoken" }],
  "food":      [{ "dish", "japanese_name", "romaji", "category", "region",
                  "halal", "description", "where" }],
  "transport": [{ "route", "mode", "from", "to", "distance_km", "duration",
                  "fare", "scenic" }],
  "research":  [{ "statement", "kind", "source_url", "source_name",
                  "confidence", "as_of_date", "prefecture", "topic",
                  "needs_verification" }],
  "prices":    [{ "item", "amount", "currency", "place", "source_url",
                  "as_of_date" }],
  "data":      [{ "metric", "value", "unit", "year", "place_or_region",
                  "source_url" }],
  "glossary":  [{ "term", "reading", "romaji", "english" }],
  "quotes":    [{ "text", "speaker", "source_url" }],
  "angles":    [{ "idea", "why_it_could_work" }]
}
```

Pass 1 fills `places / food / transport / quotes / angles`; pass 2 fills
`research / prices / data / glossary`. Verify is the same extractor with a
web-search tool and the prior claim as context.

---

## Build phases

| # | Delivers | Key work |
| --- | --- | --- |
| R1 | nav re-parent: **Step 1 = Research** with tabs YouTube · Prep · Places · Web (stub); **Step 2 = Episode Builder** with Pick (stub) · Assemble. Prep works on any Source Video, not "the ones I picked". | move `#ep-tab-queue/prep/places` under Step 1; breakdown already persists to Notion |
| R2 | the Notion stores exist; `saveConfirmedPlaces`-style push paths per DB | create Research / Prices / Data / Glossary / Food / Transport DBs; rename Source Videos → Sources + `Platform` |
| R3 | 2-pass extract on the new schema (replaces the current single breakdown) | pass-1 / pass-2 prompts; per-type review + dedup + push |
| R4 | **Web** tab: entry-B question + Verify & Enrich pass | `functions/web-research.js` (Gemini grounding); Review #2 UI |
| R5 | Step 2 **Pick**: query the DBs, filter by prefecture / region / type / "unused", tick → Assemble | `loadPickPool()`; Assemble consumes the pool instead of in-memory breakdowns |

Each phase ships something; the app stays live. Decide at each gate.
