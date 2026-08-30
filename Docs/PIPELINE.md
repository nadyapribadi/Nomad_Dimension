# Pipeline redesign — Step 1 Research + Step 2 Episode Builder

Status: **built** (R1–R4, E1–E3 landed 2026-08-31; verify-mode Web, refresh-stale
and angle-first-from-Plan still deferred). Restructured Stage 1 (YouTube Browser)
+ Stage 2 (Queue / Prep / Places / Assemble) into two clean steps:

- **Step 1 — Research**: fill Notion with reusable, one-fact-per-column material.
- **Step 2 — Episode Builder**: query that material, assign it into typed
  sections, commit an episode plan.

Script Builder (Stage 4), Audio (5), Handoff (6) are unchanged downstream — they
just receive a richer per-section brief. See `AS_BUILT.md` → "Direction &
evolution plan".

---

# STEP 1 — RESEARCH

## Principle

**Sources → one extraction → typed material → Notion stores.**
Every column holds exactly one value that its name describes. No catch-all
"Notes" / "Detail" fields. Kinds with a genuinely different atomic shape get
their own small DB rather than a wide sparse one.

Ingestion is **source-agnostic**: one "Add source" takes `{ platform, url,
pasted_text }`. YouTube auto-fetches a transcript; everything else is pasted.
A real TikTok/IG fetcher later is optional — paste already covers it.

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
     1. places · activities · food · transport · quotes · angles   (strong from a transcript)
     2. research · prices · data · glossary                        (weak from a transcript)
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
   PUSH → Places · Activities · Food · Transport · Research · Prices · Data · Glossary
          (quotes → Source row; angles → Plan / Ideas)
```

- Stop after Review #1 for a quick pass — Verify runs only on ticked items.
- Entry B (no video) enters straight at Verify & Enrich.

### Why two extract passes

The 30s Netlify function ceiling. Two small calls finish in ~8s each; one call
with a 10-array schema + a 12k-char transcript is the exact shape that times out
and truncates mid-JSON. A thin pass is fixed by tightening *that pass's* prompt,
never by merging (a bigger schema makes the model shallower per type). Single-pass
is only an ops fallback (fewer calls, two→one failure point), never a quality move.

### Why a transcript is weak evidence

A vlogger asserting "this onsen is 1,000 years old" is not a verified fact.
Transcript extraction records what is *said*, all `confidence=low`,
`source_url=<the video>`. The Web Verify pass turns a claim into a sourced fact —
or a `dispute` row, or a correction.

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

## Notion stores (one fact per column)

### Sources DB — rename of "Source Videos"
`Title · Platform · URL · Creator · Published Date · Retrieved Date · Raw Text ·
Extraction JSON · Status`

### Places DB — exists
Already one-fact-per-column after the 2026-08 pass: `Name · Type · Prefecture ·
Price Range · Price Note · Halal · Country · B-Roll Description · Food · Google
Maps URL · Address · Coordinates · Website · Rating · Review Count · Summary ·
Source Video · Used In Episodes · Date Added · Last Verified`.

### Activities DB — new — things you *do*, distinct from places you *are*
`Activity · Type` (Hike / Water / Scenic Drive / Festival / Food Experience /
Craft / Stargazing / Other) `· Place (relation) · Season · Difficulty · Duration ·
Cost · Source URL · Used In Episode`

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

## Extraction JSON — same shape every source

Atomic arrays; empty `[]` where the source is silent. Every key single-purpose.

```jsonc
{
  "places":     [{ "name", "name_local", "romaji", "type", "prefecture_guess",
                   "area_guess", "what_happens_here", "price_if_spoken" }],
  "activities":  [{ "activity", "type", "place", "season", "difficulty",
                   "duration", "cost" }],
  "food":       [{ "dish", "japanese_name", "romaji", "category", "region",
                   "halal", "description", "where" }],
  "transport":  [{ "route", "mode", "from", "to", "distance_km", "duration",
                   "fare", "scenic" }],
  "research":   [{ "statement", "kind", "source_url", "source_name",
                   "confidence", "as_of_date", "prefecture", "topic",
                   "needs_verification" }],
  "prices":     [{ "item", "amount", "currency", "place", "source_url",
                   "as_of_date" }],
  "data":       [{ "metric", "value", "unit", "year", "place_or_region",
                   "source_url" }],
  "glossary":   [{ "term", "reading", "romaji", "english" }],
  "quotes":     [{ "text", "speaker", "source_url" }],
  "angles":     [{ "idea", "why_it_could_work" }]
}
```

Pass 1 fills `places / activities / food / transport / quotes / angles`;
pass 2 fills `research / prices / data / glossary`. Verify is the same extractor
with a web-search tool and the prior claim as context.

## Build phases

| # | Delivers | Key work |
| --- | --- | --- |
| R1 | **✅ 2026-08-31** — `#stage-1` is now **Research** with tabs YouTube · Prep · Places · Web(stub); `#stage-2` **Episode Builder** trimmed to the single **Assemble** tab. Prep = "1 · Pick source videos" (`loadSourceQueue`) + "2 · Break down each" in one tab. `switchTab` rewritten to scope per active panel. | done |
| R2 | Notion stores exist | **✅ 2026-08-31** — Activities / Research / Prices / Data / Glossary / Food / Transport DBs created, ids in `DB_IDS`; Source Videos got a `Platform` col (title not yet renamed). **Each new DB must be connected to the NomadDimension integration.** Per-DB push paths still to write. |
| R3 | 2-pass extract → the stores | **✅ 2026-08-31** — EXTRACT_SHAPE_1/_2 (gemini-flash×2), `RESEARCH_STORES` + generic `poolFor`/`renderReviewInto`/`pushStore` in Prep's "3 · Review & push" card. Places decoupled: own `PLACES_SHAPE` pass in the Places tab. |
| R4 | Web research tab | **✅ 2026-08-31** — `functions/web-research.js` (Gemini `google_search` grounding), `/api/web-research`. Web tab: question+focus → `runWebResearch` → `S.webExtract` → same review engine (`src='web'`) → push, with source links. |

---

# STEP 2 — EPISODE BUILDER

**Job: plan the episode.** Output = an ordered list of **typed sections**, each
with material assigned, committed as (a) an Episodes row + plan in the page body
and (b) seeded Script Builder sections. Script Builder (Stage 4) then writes
dialogue into those sections — unchanged, just a richer brief.

## Section vocabulary stays in Settings

`section_types` · `episode_templates` (A / B) · `tone_styles` · `voice_configs`
remain in the Settings **Lookup Tables** JSON block — a controlled vocabulary the
operator rarely edits. Episode Builder and Script Builder both **read**
`S.lookups.sections`. Nothing moves out of Settings.

## Screens

**A · Identity** — series · number · title · central question · tone · notes.
Each with a `✨` that reads the assigned material.

**B · Sections** — the core view. Start **blank** or **from a template**
(Template A → Intro · Food Stop · Place/Attraction · Cultural Note · Outro).
An ordered list of sections, each: `Section Type` (dropdown from
`S.lookups.sections`) · assigned material · ↑↓.

**C · Material browsers** — one filterable/sortable list per store; drop items
into a section. `✨ auto-distribute` sends picked material to the section whose
type matches (a Food row → the Food Stop section; a place → a Place section).
`✨ suggest order` sequences the sections (hook → build → payoff → wind-down).

| Category | Store | Sort | Filter |
| --- | --- | --- | --- |
| Places | Places DB | A–Z · rating · date · prefecture | prefecture · type · price band · halal · used/unused · search |
| Activities | Activities DB | A–Z · season · cost | type · prefecture · season · difficulty · used · search |
| Food | Food DB | A–Z · category | category · region · halal · used · search |
| Knowledge | Research DB | A–Z · confidence · date | kind · topic · prefecture · min-confidence · used · search |
| Transport | Transport DB | A–Z · distance | mode · scenic · used · search |
| Prices / Data / Glossary | resp. DBs | A–Z | prefecture / topic · used |

Running tally: *"episode = 1 Intro · 3 Place · 2 Food Stop · 1 Cultural Note ·
1 Outro — 6 places · 3 activities · 4 food · 9 facts."*

**D · Commit** — Episodes row + plan to page body; seed Script Builder sections
(`Section Type` · `Section Order` · `Section Brief` = the assigned material with
source URLs); stamp `Used In Episode` on every assigned row.

## The flexible bit — one filter engine, config per category

```
CATEGORIES = {
  places:    { db:'places',     sort:['name','rating','date','prefecture'],
               filter:['prefecture','type','priceBand','halal','used','search'] },
  activities:{ db:'activities',  sort:['name','season','cost'],
               filter:['type','prefecture','season','difficulty','used','search'] },
  food:      { db:'food',        sort:['dish','category'],
               filter:['category','region','halal','used','search'] },
  knowledge: { db:'research',    sort:['statement','confidence','date'],
               filter:['kind','topic','prefecture','minConfidence','used','search'] },
  transport: { db:'transport',   sort:['route','distance'],
               filter:['mode','scenic','used','search'] },
}
```

One `renderCategory(key)` + one `applyFilters(rows, key, state)`.
**Add a category later = one config entry, no new UI code.**

## Working state (in memory until Commit)

```
S.ep = {
  identity:  { series, number, title, question, tone, notes },
  sections:  [ { id, type, order,
                 material: { places[], activities[], food[], research[],
                             transport[], prices[], data[], glossary[] } } ],
  filters:   { <category>: { sort, ...filterState } },
}
```

## Build phases

| # | Delivers |
| --- | --- |
| E1 | **✅ 2026-08-31** — Assemble replaced: Identity form + typed **Sections** (blank / Template A / B, ↑↓, type dropdown from `S.lookups.sections`) + **Material** browser (`EP_MAT` per-category Notion query: Places/Activities/Food/Knowledge/Transport, search + prefecture + unused filters, assign-to-section dropdown). `createEpisode` → Episode row + running-order brief in the page body + one seeded Script section per typed section + `Used In Episode` stamped on assigned rows. |
| E2 | **✅** — `✨ Order` (`suggestSectionOrder`) + `✨ Distribute` (`autoDistribute`, deterministic: category → first matching section type). |
| E3 | **✅ (partial)** — `✨ Gap check` (`epGapCheck`) against the central question. Refresh-stale + angle-first-from-Plan deferred. |

Each phase ships something; the app stays live. Decide at each gate.
