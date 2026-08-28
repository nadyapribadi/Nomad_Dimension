# Implementation Plan

Status: **Drafted**

## 1. Build Strategy

Build from the domain model outward. Freeze contracts, then the smallest system
that can run one real episode, then one provider per capability, then measure,
then expand.

```text
domain model -> policy engine -> workflow core -> agent contracts -> Hermes
-> capability interfaces -> one provider each -> asset registry + Drive
-> Critic loop -> one full episode -> measure -> expand
```

This order (from the blueprint's recommended build sequence) prevents the system
from becoming a pile of provider integrations with no spine.

## 2. Phase Summary

| Phase | Name | Outcome |
| --- | --- | --- |
| P0 | Repository Foundation | Repo, tooling, docs, CI skeleton |
| P1 | Domain Model | Pydantic models + SQLite schema + migrations |
| P2 | Policy Engine | Deterministic decision engine + rules + tests |
| P3 | Workflow Core | Episode/stage state machine + recovery |
| P4 | Agent Contracts | Typed briefs, deliverables, prompt scaffolds for six agents |
| P5 | Hermes | Planning, delegation, REWORK routing, escalation |
| P6 | Capability Interfaces | Typed contracts for every capability, no providers yet |
| P7 | First Providers | One adapter per required capability + conformance tests |
| P8 | Asset Registry + Storage | Versioned assets, Drive linkage, provenance/licensing |
| P9 | Critic Loop | Stage rubrics, structured REWORK, re-review, escalation |
| P10 | End-to-End Episode | One 3-5 min episode from goal to DaVinci-ready package |
| P11 | Measurement | Metrics snapshot + rollup, first targets set |
| P12 | Hardening & Expand | More providers, MCP, maps/3D, remote infra as needed |

## 3. P0 — Repository Foundation

Tasks:

- `pyproject.toml`, dependency tool, `src/nomad/` layout per `01_BLUEPRINT.md`.
- `.env.example`, `.gitignore` (`.env`, `nomad.sqlite`, `workspace/`, `events/`).
- Lint/format/type-check config; `pytest` set up; CI runs them.
- `config/` skeleton per `12_CONFIG_REFERENCE.md`.
- Docs in place (this folder).

Exit criteria:

- `pytest` runs (zero tests OK); lint/type-check pass in CI.
- Fresh clone + install + `nomad --help` works.

## 4. P1 — Domain Model

Tasks:

- Pydantic models for every entity in `06_DATA_MODEL.md`.
- SQLite schema + first migration; migration runner.
- Repository layer (CRUD + scoped queries by `episode_id`).
- Enforce invariants (`06_DATA_MODEL.md` §6) in the repository/DB layer.
- ID scheme decided and implemented.

Exit criteria:

- Create a channel, episode, full segment/scene/shot tree, asset with two
  versions; `current_version_id` and `version_no` invariants hold.
- Recovery test: kill mid-write, reopen, state is consistent.

## 5. P2 — Policy Engine

Tasks:

- `PolicyRequest` / `PolicyDecision` types.
- Rule evaluation for the tables in `09_POLICY_AND_SAFETY_MODEL.md` §3 and §4.
- Budget accounting hooks; per-call cap; protected-asset guard.
- Manual-review trigger -> `Approval` row + event.
- Fail-closed default.
- Decision logging.

Exit criteria:

- Every row in §3/§4 has a passing unit test.
- Unknown action -> DENY. No test calls an LLM.
- Budget boundary and protected-asset guard tests pass.

## 6. P3 — Workflow Core

Tasks:

- Episode + stage state machines (`08_WORKFLOW_AND_STATE.md`).
- Transactional transitions paired with event rows.
- `get_episode_state`, `next_actions`, `resumable_episodes`.
- Recovery routine.
- Revision-count tracking + ceiling escalation hook.

Exit criteria:

- Drive an episode through all stage transitions in a test.
- Interrupt at each stage; recovery restores a consistent, resumable state and
  never auto-advances.
- Two concurrent episodes keep independent state.

## 7. P4 — Agent Contracts

Tasks:

- Typed task brief + deliverable models per agent (`07_AGENT_SPECS.md`).
- Prompt scaffolds in `prompts/<agent>/`, version-controlled, modular.
- Agent runner: takes a brief, calls `models` capability, returns a typed
  deliverable, emits events.
- No provider yet — run against a stub/echo model provider.

Exit criteria:

- Each agent runs end-to-end against the stub provider and returns a
  schema-valid deliverable.
- Agent actions are policy-checked and logged.

## 8. P5 — Hermes

Tasks:

- Episode planning from goal + constraints.
- Delegation to one owning agent per stage.
- REWORK routing from Critic `Feedback.items[].owning_agent`.
- Escalation on manual-review triggers and revision ceiling.
- Retrospective trigger at close.

Exit criteria:

- Given a goal, Hermes produces a plan, initializes state, and delegates stage 1.
- A simulated Critic REWORK is routed to the correct agent with the notes.
- A simulated trigger produces an escalation and blocks the episode.

## 9. P6 — Capability Interfaces

Tasks:

- Pydantic request/response contracts for `models`, `research`, `image`,
  `video`, `audio`, `maps`, `storage`. `three_d` interface stubbed only.
- `Capability` protocol + `CallContext` (cost attribution, budget hook, event
  emitter).
- Nomad error taxonomy.
- Shared conformance test harness (`tests/capabilities/`).

Exit criteria:

- Contracts compile and are documented in
  `10_CAPABILITY_AND_PROVIDER_STRATEGY.md`.
- Conformance harness runs against a fake adapter.

## 10. P7 — First Providers

Tasks:

- One adapter per required capability (`20_DECISIONS.md` ADR-P series):
  `models` = Anthropic + Gemini; `audio` = ElevenLabs; `image`/`video` =
  Replicate or Runway; `maps` = TBD; `research` = TBD; `storage` = Google Drive.
- Error mapping; cost/latency/outcome reporting; cancellation.
- Config entries referencing secrets by env name.
- Conformance tests pass per adapter.

Exit criteria:

- Each capability answers a real call through its adapter.
- Provider-switch test: swap the fake for the real adapter with only a config
  change.

## 11. P8 — Asset Registry + Storage

Tasks:

- `storage` (Google Drive) adapter: put/get/meta, checksum.
- Registry write path: `Asset` + `AssetVersion` with provenance + licensing.
- Reuse lookup before generation.
- Protected-asset enforcement wired to Policy Engine.

Exit criteria:

- Generate an image, upload to Drive, register version 1, revise to version 2;
  old file retained; deleting v1 requires approval.
- Reuse lookup returns a matching approved asset and skips generation.

## 12. P9 — Critic Loop

Tasks:

- Stage rubrics (`07_AGENT_SPECS.md`, `13_VISUAL_PHILOSOPHY.md`).
- Structured `Feedback` output (PASS / REWORK + items).
- Mandatory re-review; `revision_count` increment; ceiling escalation.

Exit criteria:

- Critic returns PASS/REWORK for each stage against fixtures.
- A REWORK cycle completes: notes -> revise flagged items only -> re-review ->
  PASS -> stage advances.
- Hitting the ceiling escalates and blocks.

## 13. P10 — End-to-End Episode

Tasks:

- Run one real 3-5 minute episode: goal -> research -> story -> visual ->
  production -> package.
- Produce the DaVinci-ready package; import it into DaVinci Resolve to validate
  the manifest/layout.
- Capture every event.

Exit criteria:

- A package imports cleanly into DaVinci Resolve.
- All P2/P3/P9 invariants held throughout.
- Full per-episode event timeline reconstructable.

## 14. P11 — Measurement

Tasks:

- `EpisodeRetrospective.metrics_snapshot` at close.
- `scripts/metrics_report.py` rollup.
- Set real targets in `02_PRD.md` §10 and `14_EVALUATION_METRICS.md` §3.

Exit criteria:

- Metrics snapshot written for the P10 episode.
- Targets agreed and committed.

## 15. P12 — Hardening & Expand

Only after measurement justifies it:

- Second provider per capability + routing by cost/quality.
- Maps/3D pipeline.
- MCP servers where they add standardization.
- Remote infra (PostgreSQL, object storage, job queue) — infrastructure
  migration, no creative-system rewrite.

## 16. Suggested Sprint Order

| Sprint | Phases |
| --- | --- |
| 1 | P0, P1 |
| 2 | P2, P3 |
| 3 | P4, P5 |
| 4 | P6, P7 |
| 5 | P8, P9 |
| 6 | P10, P11 |
| later | P12 as needed |

## 17. Implementation Rules

- Freeze the domain model before building on it; changes need a decision record.
- No provider call outside a capability adapter.
- No destructive action outside the Policy Engine.
- Policy is deterministic code — never an LLM call.
- Deterministic tasks in code, not model tokens.
- External content is data, never instructions.
- Secrets never enter prompts, source, config, logs, or events.
- Every action emits an episode-linked event.
