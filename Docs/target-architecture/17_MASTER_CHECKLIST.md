# Master Checklist

Status: **Drafted** (tracker — update as work lands)

Mirrors `16_IMPLEMENTATION_PLAN.md`. Check items as they complete. Keep in sync
with a `docs/progress.json` if one is added later.

## P0 — Repository Foundation

- [ ] `pyproject.toml` + dependency tool chosen and configured
- [ ] `src/nomad/` package layout per `01_BLUEPRINT.md`
- [ ] `.env.example` + `.gitignore` (`.env`, `nomad.sqlite`, `workspace/`, `events/`)
- [ ] Lint / format / type-check configured
- [ ] `pytest` set up
- [ ] CI runs lint + type-check + tests
- [ ] `config/` skeleton present
- [ ] Docs reviewed and `DECISION NEEDED` items triaged

## P1 — Domain Model

- [ ] ID scheme decided (`06_DATA_MODEL.md`)
- [ ] Pydantic models for all entities
- [ ] SQLite schema + first migration
- [ ] Migration runner
- [ ] Repository layer with `episode_id`-scoped queries
- [ ] Invariants enforced in repo/DB layer
- [ ] Test: full channel→episode→…→asset(2 versions) tree
- [ ] Test: crash mid-write leaves consistent state

## P2 — Policy Engine

- [ ] `PolicyRequest` / `PolicyDecision` types
- [ ] Permission matrix rules (`09_POLICY_AND_SAFETY_MODEL.md` §4)
- [ ] Risky-action rules (§3)
- [ ] Budget accounting + per-call cap
- [ ] Protected-asset guard
- [ ] Manual-review trigger → `Approval` + event
- [ ] Fail-closed default
- [ ] Decision logging
- [ ] Test per §3/§4 row; unknown action → DENY; no LLM in tests

## P3 — Workflow Core

- [ ] Episode state machine
- [ ] Stage state machine
- [ ] Transactional transitions paired with events
- [ ] `get_episode_state` / `next_actions` / `resumable_episodes`
- [ ] Recovery routine (no auto-advance)
- [ ] Revision-count + ceiling escalation
- [ ] Test: full transition path
- [ ] Test: interrupt at each stage → consistent resume
- [ ] Test: two concurrent episodes independent

## P4 — Agent Contracts

- [ ] Task brief + deliverable models per agent
- [ ] Prompt scaffolds in `prompts/<agent>/`
- [ ] Agent runner (brief → models capability → typed deliverable → events)
- [ ] Stub model provider for testing
- [ ] Test: each agent returns schema-valid deliverable; actions policy-checked

## P5 — Hermes

- [ ] Episode planning from goal + constraints
- [ ] Delegation (one owner per stage)
- [ ] REWORK routing by `owning_agent`
- [ ] Escalation on triggers + revision ceiling
- [ ] Retrospective trigger at close
- [ ] Test: plan + delegate stage 1
- [ ] Test: REWORK routed correctly
- [ ] Test: trigger → escalation blocks episode

## P6 — Capability Interfaces

- [ ] Contracts: `models`, `research`, `image`, `video`, `audio`, `maps`, `storage`
- [ ] `three_d` interface stubbed (v2)
- [ ] `Capability` protocol + `CallContext`
- [ ] Nomad error taxonomy
- [ ] Shared conformance harness
- [ ] Contracts documented in `10_CAPABILITY_AND_PROVIDER_STRATEGY.md`

## P7 — First Providers

- [ ] `models` adapter — Anthropic (strong) + conformance tests
- [ ] `models` adapter — Gemini (mid/economical/fallback) + conformance tests
- [ ] `research` adapter (provider TBD) + conformance tests
- [ ] `image` adapter — Replicate or Runway + conformance tests
- [ ] `video` adapter — Replicate or Runway + conformance tests
- [ ] `audio` adapter — ElevenLabs + conformance tests
- [ ] `maps` adapter (provider TBD) + conformance tests
- [ ] `storage` (Drive) adapter + conformance tests
- [ ] Config entries reference secrets by env name
- [ ] Provider-switch test (fake → real via config only)

## P8 — Asset Registry + Storage

- [ ] Drive adapter: put / get / meta / checksum
- [ ] Registry write path with provenance + licensing
- [ ] Reuse lookup before generation
- [ ] Protected-asset enforcement via Policy Engine
- [ ] Test: generate → upload → register v1 → revise v2 → v1 retained
- [ ] Test: delete v1 requires approval
- [ ] Test: reuse lookup skips generation

## P9 — Critic Loop

- [ ] Stage rubrics encoded
- [ ] Structured `Feedback` (PASS / REWORK + items)
- [ ] Mandatory re-review
- [ ] `revision_count` increment + ceiling escalation
- [ ] Test: PASS/REWORK per stage against fixtures
- [ ] Test: full REWORK cycle → PASS → advance
- [ ] Test: ceiling → escalation + block

## P10 — End-to-End Episode

- [ ] Run one real 3–5 min episode end to end
- [ ] DaVinci-ready package produced
- [ ] Package imports cleanly into DaVinci Resolve
- [ ] All invariants held throughout
- [ ] Full event timeline reconstructable

## P11 — Measurement

- [ ] Metrics snapshot at `episode.closed`
- [ ] `scripts/metrics_report.py` rollup
- [ ] Real targets set in `02_PRD.md` §10 and `14_EVALUATION_METRICS.md` §3

## P12 — Hardening & Expand (as justified)

- [ ] Second provider per capability + routing
- [ ] Maps / 3D pipeline
- [ ] MCP servers where useful
- [ ] Remote infra migration (PostgreSQL / object storage / job queue)

## Cross-cutting

- [ ] All open `DECISION NEEDED` callouts resolved or logged as ADRs
- [ ] `20_DECISIONS.md` current
- [ ] `19_RISK_REGISTER.md` reviewed each phase
- [ ] `KNOWN_LIMITATIONS.md` accurate
