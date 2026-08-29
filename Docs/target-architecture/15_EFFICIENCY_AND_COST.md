# Efficiency and Cost

Status: **Scaffold**

## 0. Where the Money Goes

At the v1 budget of **$25/episode** (ADR-P009), cost is dominated by
**AI video generation**, then image, then audio (ElevenLabs), then LLM calls;
research (Tavily) and maps (Google Maps Static) are rounding error.

Consequence: the mixed-media philosophy (`13_VISUAL_PHILOSOPHY.md`) is also the
budget strategy. Keeping AI-video seconds low — favouring archival, on-location
footage, maps, stills, typography, and diagrams — is what keeps an episode under
$25. The per-call cap ($3) exists to stop one runaway video/image generation
from consuming the episode.

## 1. Strategy

1. **Route by complexity.** Strong models for high-value reasoning (plan, write,
   Critic review); economical models for repetitive work (classify, short
   extraction). Config in `config/models.yaml`.
2. **Reuse before regenerate.** Check the asset registry for an approved asset
   matching the requirement before generating a new one
   (`11_ASSET_AND_STORAGE.md` §6).
3. **Cache reusable results.** Research queries and deterministic transforms are
   cached where safe.
   <!-- TODO: cache key = hash(normalized request); TTL; store location -->
4. **Gate expensive media.** No image/video/audio generation before the visual
   plan for that shot is approved (Policy Engine per-call check).
5. **Critic early.** Run Critic at each stage so a weak research package never
   causes an expensive Production redo.
6. **Deterministic code for deterministic tasks.** ID generation, formatting,
   manifest assembly, schema validation, cost math — never model calls.
7. **Track cost everywhere.** Per episode, segment, shot, and provider
   (`14_EVALUATION_METRICS.md`).
8. **Version-controlled modular prompts.** Prompts in `prompts/`, small and
   composable, so token cost per stage is visible and tunable.

## 2. Cost Attribution

Every `capability.call.completed` event carries `{provider, cost_cents,
latency_ms, episode_id, segment_id?, shot_id?}`. `AssetVersion.cost_cents` stores
the attributable production cost of that version. `Episode.spent_cents` is the
sum; it drives the budget check.

## 3. Model Routing

| Task | Model tier | Notes |
| --- | --- | --- |
| plan | strong | Hermes episode planning |
| write | strong | Story script |
| review | strong | Critic |
| synthesize | mid | Research synthesis |
| classify / extract | economical | tagging, short structured pulls |

<!-- DECISION NEEDED: concrete model per tier per provider -->

## 4. Caching

<!-- TODO -->
- What is cached: research query results, source fetches, deterministic
  transforms.
- What is never cached: anything with a licensing or freshness requirement,
  creative generations.
- Invalidation: TTL + manual clear per episode.

## 5. Anti-Goals

- No premature optimization of stable infrastructure.
- No caching layer before there is a measured repeat-cost problem.
- No provider added "for cost" without a quality/cost comparison
  (`14_EVALUATION_METRICS.md`).

## 6. Open Questions

- Exact model per tier, and the specific Replicate video model (chosen at P7).
- Cache implementation (sqlite table vs. files) and TTLs.
- Whether to hard-stop or soft-warn at `alert_at_fraction` of budget. Current
  stance: soft-warn at 0.8; the per-call cap and budget check are the hard
  stops.
