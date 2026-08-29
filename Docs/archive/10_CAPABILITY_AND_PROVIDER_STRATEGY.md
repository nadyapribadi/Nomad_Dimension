# Capability and Provider Strategy

Status: **Scaffold**

## 1. Principle

Agents request **capabilities**. Adapters select **providers**. A capability is a
typed interface; a provider adapter is one implementation of it. Swapping a
provider = new adapter + config change, nothing above the capability line.

**Provider-switch test:** if a vendor becomes too expensive or disappears, its
adapter can be replaced without editing Hermes, agents, workflow, or content
data. Every capability must pass this test.

## 2. Capabilities

| Capability | Purpose | v1 first provider (see `20_DECISIONS.md`) | In v1? |
| --- | --- | --- | --- |
| `models` | LLM reasoning, synthesis, review | Anthropic (strong tier), Google Gemini (economical / fallback) — ADR-P001 | yes |
| `research` | Search / retrieval / structured research | Tavily (fallback: Brave Search API) — ADR-P002 | yes |
| `image` | Still image generation | Replicate (Flux) — ADR-P003b | yes |
| `video` | Video clip generation | Replicate (low-cost model: Kling std / Wan / LTX) — ADR-P003b | yes |
| `audio` | Narration / TTS, music, SFX | ElevenLabs — ADR-P003 | yes |
| `maps` | Geographic visualization, routes, satellite/context | Google Maps Static API — ADR-P011 | yes (channel needs it) |
| `three_d` | Terrain, buildings, reconstructions | — | v2 (stub interface in P6) |
| `design` | Titles, lower thirds, diagrams, thumbnails | code-generated (SVG/templating) before a provider | yes (minimal) |
| `storage` | Heavy binary storage | Google Drive | yes |

## 3. Common Adapter Contract

Every adapter, regardless of capability:

- accepts the capability's Pydantic request model, returns its response model
- **validates the provider's response against the response model before
  returning it** — a provider is untrusted third-party data; a malformed or
  unexpected shape becomes a `CapabilityError`, never silent bad data passed to
  an agent
- maps provider errors to the Nomad error taxonomy — `CapabilityError` with
  `code in (transient, rate_limited, invalid_request, content_rejected,
  provider_down, unknown)`. This is the **only** error type an agent ever sees;
  raw provider exceptions do not escape the adapter
- reports `{provider, cost_cents, latency_ms, outcome}` for every call
- supports cancellation where the provider allows it
- never reads secrets from anywhere but the injected config
- is selected by `config/*.yaml` (see `12_CONFIG_REFERENCE.md`)

### Contract stability

Request models, response models, the `CapabilityError` taxonomy, and event names
become de facto contracts the moment the pipeline runs (Hyrum's Law). Rules:

- evolve request/response models by **adding optional fields only** — never
  change a field's type or meaning, never remove one
- error `code` values are append-only
- a breaking change needs an ADR (`20_DECISIONS.md`)
- keep provider-specific quirks *inside* the adapter; do not let them become
  observable in the capability's response shape

```text
class Capability[Req, Res](Protocol):
    name: str
    async def invoke(self, req: Req, *, ctx: CallContext) -> Res: ...

# CallContext carries episode_id / segment_id / shot_id for cost attribution,
# budget check hooks, and the event emitter.
```

## 4. Per-Capability Interface Sketches

<!-- TODO: promote each to a full request/response contract before implementation -->

### models

```text
ModelRequest  { task: enum(plan|synthesize|write|review|classify), messages, tools?, max_output, temperature? }
ModelResponse { text | structured, usage, finish_reason }
```

Routing: strong model for `plan|write|review`; economical model for
`classify|short synthesize` (see `15_EFFICIENCY_AND_COST.md`).

### research

```text
ResearchRequest  { query, depth, recency?, domain_filters? }
ResearchResponse { results: [{title, url, snippet, published_at?, source_type}] }
```

Content is untrusted data (`09_POLICY_AND_SAFETY_MODEL.md` §8).

### image / video

```text
MediaRequest  { prompt, medium, aspect_ratio, duration_sec?, reference_assets?, seed? }
MediaResponse { binary_ref, generation_params, cost_cents }
```

Binary is handed to `storage` for Drive upload; metadata to the asset registry.

### audio

```text
AudioRequest  { kind: enum(narration|music|sfx), text?, voice?, style?, duration_sec? }
AudioResponse { binary_ref, params, cost_cents }
```

### maps / three_d

```text
MapRequest { view: enum(route|overlay|satellite|context), bbox|points, style }
```

### storage

```text
StoragePut { binary, name, folder_path, mime }         -> { file_id, checksum }
StorageGet { file_id }                                  -> { binary }
StorageMeta{ file_id }                                  -> { name, size, checksum, ... }
```

Google Drive is one adapter. No caller depends on Drive semantics.

## 5. MCP vs Direct APIs

- MCP and direct APIs coexist. Use MCP where it adds real standardization across
  several tools; use a direct API where it is simpler or more efficient.
- An MCP server is just another provider adapter behind a capability interface —
  it does not get to bypass the capability line or the Policy Engine.
- No requirement that every integration go through one MCP provider.

## 6. Adding a Provider

1. Implement the adapter against the capability interface.
2. Add conformance tests (§7).
3. Add a `config/providers/<name>.yaml` entry; reference secrets by env name.
4. Point the capability's `active_provider` (or routing rule) at it.
5. No change to agents, Hermes, workflow, or the data model.

## 7. Conformance Tests

Each adapter must pass a shared suite per capability:

- honors the request/response contract (types, required fields)
- maps at least the taxonomy errors it can produce
- reports cost, latency, provider, outcome
- respects cancellation
- rejects/redacts secret material in inputs it echoes back
<!-- TODO: build the shared conformance harness in tests/capabilities/ -->

## 8. Resolved / Open

- **First providers — decided** (`20_DECISIONS.md`): models = Anthropic + Gemini;
  research = Tavily; image/video = Replicate; audio = ElevenLabs; maps = Google
  Maps Static; storage = Google Drive. `maps` is in v1, `three_d` is v2.
- **Cost normalization — decided:** store `cost_cents` normalized at call time;
  keep the raw provider figure in `generation_params`.
- **Model routing — decided:** per-task provider/model map (`config/models.yaml`).
- **Open:** exact model ids per tier and the specific Replicate video model —
  chosen at P7 against current availability and price.
