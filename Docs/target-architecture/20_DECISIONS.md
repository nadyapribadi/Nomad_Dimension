# Decision Log

Status: **Drafted**

Lightweight ADRs. Full ADR files are unnecessary for a solo project until a
decision is genuinely contested. A new decision record is required when a change:

- alters the domain model after it is frozen
- changes the capability interface contracts
- adds a new risky action or changes approval semantics
- changes the storage format
- adds a hard dependency or a new external provider category
- moves core logic (Hermes, Policy, Workflow) into an adapter

## Accepted Decisions

### ADR-001 — Local-first, single machine (Phase 1)

Accepted. All state, knowledge, workflow, and policy run on one machine using
SQLite, the local filesystem, Git, and Google Drive for heavy binaries. Future
scale is an infrastructure migration, not a rewrite.
Reason: understandable, owned, cheap; matches a solo operator. Consequence:
portability constraints in `04_TRD.md` (no SQLite-only or Drive-only
assumptions).

### ADR-002 — Own the workflow, rent the capabilities

Accepted. Nomad owns the intelligence, workflow, knowledge, state, production
model, and creative rules. External providers supply replaceable capabilities
behind typed interfaces.
Reason: vendors are unstable; the creative system must outlive any of them.
Consequence: the capability line is a hard boundary; provider-switch test in
`16_IMPLEMENTATION_PLAN.md` P7.

### ADR-003 — Deterministic Policy Engine

Accepted. Permissions, budgets, protected-resource rules, and approval gates are
deterministic code, never an LLM call.
Reason: safety and cost controls must be predictable and testable.
Consequence: policy tests never call a model; fail-closed default.

### ADR-004 — Generate → critique → revise at every stage

Accepted. Critic is an independent gate after research, story, visual, and
production. It returns PASS or a structured REWORK; it never edits.
Reason: first-pass output drift is the main quality risk.
Consequence: mandatory re-review; revision ceiling escalates to the human.

### ADR-005 — Frozen scalable content model

Accepted. Channel → Episode → Segment → Scene → Shot → Asset → Version →
Feedback, with stable IDs, versioned assets, and anchored feedback
(`06_DATA_MODEL.md`).
Reason: the creative system must not need redesign as scope grows.
Consequence: model changes after P1 need an ADR.

### ADR-006 — Python + Pydantic; SQLite / Markdown / YAML / JSON

Accepted. Python for implementation, Pydantic for all contracts. SQLite tracks,
Markdown explains, YAML defines, JSON exchanges, Google Drive stores, Git
versions.
Reason: mature, practical, AI-assistant-friendly, low operational overhead.
Consequence: YAML is never a database or knowledge base.

### ADR-007 — DaVinci Resolve stays the human final editor

Accepted. Nomad produces a DaVinci-ready package; it does not perform the final
edit and does not publish in v1.
Reason: keep the highest-taste, highest-risk step with the human.
Consequence: package manifest must validate against a real DaVinci import.

### ADR-008 — MCP and direct APIs coexist

Accepted. Use MCP where it standardizes across several tools; use direct APIs
where simpler. An MCP server is a provider adapter behind a capability interface
and does not bypass the capability line or Policy Engine.
Reason: avoid a mandatory single integration mechanism.

### ADR-009 — Versioning over overwrite

Accepted. Important outputs (assets, scripts, plans) are versioned. In-place
overwrite of a file backing an existing version is forbidden; deletion needs
approval.
Reason: recoverability, provenance, safe rework.

### ADR-010 — External content is untrusted data

Accepted. Retrieved pages, files, and tool outputs are passed to agents as
delimited data, never as instructions. Conflicting instructions trigger
escalation and quarantine.
Reason: prompt-injection defense.

### ADR-011 — Single consolidated engineering standards doc

Accepted. Instead of the template's 22-file `standards/` folder, Nomad uses one
`24_ENGINEERING_STANDARDS.md` with sections.
Reason: solo project; a large standards corpus would be maintained and unread.
Consequence: revisit only if the project goes multi-contributor / public.

### ADR-012 — BRD folded into the Charter and PRD

Accepted. No separate Business Requirements Document. The "why build this" and
make-vs-buy rationale live in `00_PROJECT_CHARTER.md`; product outcomes live in
`02_PRD.md`.
Reason: single-user project; a standalone BRD adds no value.

### ADR-013 — The pipeline is a workflow, not an autonomous agent system

Accepted. The episode stage sequence (research → story → visual → production,
each Critic-gated) is deterministic code in Workflow Core. Agents are bounded
task executors with step budgets and typed I/O. Hermes has narrow model-driven
latitude: plan within a stage, retry-or-escalate, write the plan artifact — it
does not invent stages, reorder the pipeline, or spawn agents.
Reason (Anthropic, *Building Effective Agents*): predictable cost, debuggable
failures, testable transitions. Reserve open-ended agent loops for steps where a
single structured call plus tools demonstrably fails (Research search,
Production retry).
Consequence: `07_AGENT_SPECS.md` §A–B; per-agent step budgets are set in
ADR-P013 (draft values, revisit after P10).

### ADR-014 — No agent framework; provider SDKs directly behind the `models` capability

Accepted. Nomad calls the Anthropic and Gemini SDKs (and other providers)
directly inside capability adapters. No LangChain / LlamaIndex / agent-framework
orchestration layer.
Reason: frameworks obscure the actual prompts and responses and add abstraction
that is hard to debug; the blueprint's anti-over-abstraction stance; the
orchestration Nomad needs (fixed workflow + bounded executors) is a few hundred
lines, not a framework.
Consequence: the `models` capability interface and the agent runner are
hand-written; MCP is still allowed as a provider adapter where it standardizes a
real integration (ADR-008).

### ADR-015 — Misuse-resistant model types

Accepted. Use branded/distinct ID types (`EpisodeId`, `SegmentId`, `ShotId`,
`AssetId`, `AssetVersionId`, ...) so one cannot be passed where another is
expected. Model decision/verdict/status values as discriminated unions
(`PolicyDecision` = ALLOW | DENY | REQUIRES_APPROVAL; `Feedback.decision` =
PASS | REWORK; stage status) so consumers handle every case.
Reason (`api-and-interface-design`): make the wrong call impossible to express;
exhaustive handling at compile/validation time.
Consequence: applies to `06_DATA_MODEL.md` models and the capability contracts.

## Pending Decisions

### ADR-P001 — First `models` provider — DECIDED

Decision: **Anthropic** for the strong tier (plan / write / Critic review),
**Google Gemini** for the mid / economical tier (synthesize, classify) and as
fallback. Gemini also fits the Google ecosystem (Drive). The `models` interface
stays provider-agnostic; both are adapters and either can be swapped.
Exact model ids set at P7 against current availability.

### ADR-P002 — First `research` provider — PENDING

Options: a search/research API with structured results and recency filtering.
Recommendation: pick one at P7; output is untrusted data regardless
(`09_POLICY_AND_SAFETY_MODEL.md` §8). Given the high research bar, prefer one
that returns source type and publish date.

### ADR-P003 — First media providers — DECIDED (audio), PENDING (image/video)

Decision: `audio` = **ElevenLabs** (narration/TTS; music/SFX provider TBD).
`image` / `video` = **Replicate and/or Runway** — pick one of the two at P7 to
start; add the other when v1 metrics justify. `design` (titles, lower thirds,
diagrams) starts as **code-generated SVG/templates**, no provider, until a real
need appears.

### ADR-P004 — Maps in v1; deep 3D deferred — DECIDED

Decision: **basic maps / geographic visualization is in v1** — the channel's
travel/place/geography material depends on spatial explanation. `three_d`
(terrain/building reconstruction) is **v2**; its capability interface is stubbed
in P6.

### ADR-P011 — Maps provider — PENDING

Options: Mapbox / MapTiler / Google Maps Static API / other.
Recommendation: choose one at P7 that supports static-image export of styled
maps, routes, and satellite/context views. Google Maps Static fits the existing
Google account; Mapbox/MapTiler give more styling control.

### ADR-P005 — ID scheme — DECIDED

Decision: **ULID** (26-char, lexicographically sortable, no coordination,
URL-safe). Distinct branded types per entity (ADR-015).

### ADR-P006 — Events storage — DECIDED

Decision: **SQLite `events` table** (queryable, joins to episodes). A JSONL
export helper is a later convenience, not the store.

### ADR-P007 — Local interface — DECIDED

Decision: **CLI only for v1.** No FastAPI until a second surface (web review UI,
remote trigger) actually needs it. Console entrypoint: `nomad`.

### ADR-P008 — Migration tooling — DECIDED

Decision: **Hand-rolled forward-only runner** — a `migrations/NNNN_name.sql` +
`schema_version` table. Schema is small. Revisit Alembic only if migrations get
complex.

### ADR-P010 — Revision ceiling — DECIDED

Decision: **3** REWORK cycles per stage, then Critic escalates and the episode
is `blocked`. Tunable in `config/policy.yaml`; revisit after real rework data.

### ADR-P012 — Toolchain — DECIDED

Decision: **Python 3.12**; **uv** for dependencies/venv; **ruff** (lint and
format) plus **mypy** (type check); **pytest**. Pre-commit hook runs ruff and
mypy only. Commit messages: plain imperative. CI: GitHub Actions.

### ADR-P013 — Step budgets (agent runner) — DECIDED (draft values)

Decision: enforce these per-agent ceilings in the agent runner; a hit returns a
typed partial result, not an error.

| Agent | Model calls | Other |
| --- | --- | --- |
| Hermes | 2 | — |
| Research | 2 synthesis | ≤ 8 `research` search calls |
| Story | 3 | — |
| Visual | 2 per segment | — |
| Production | 1 per asset | ≤ 3 provider retries per asset |
| Critic | 1 | — |

Revisit after P10 measurement.

### ADR-P002 — First `research` provider — DECIDED

Decision: **Tavily** to start. Agent-shaped structured results with publish
dates, minimal integration code, free tier covers early episodes (~<$0.10/episode
after). Results are untrusted data regardless (`09` §8); synthesis is done by
the Research/Story agents so claims trace to sources — which is why an
answer-in-a-box API (Perplexity) was rejected. Fallback if index coverage or
cost bites: **Brave Search API** (config swap).

### ADR-P003b — First `image` / `video` provider — DECIDED

Decision: **Replicate** for both `image` and `video`. No subscription, pay per
run, and one adapter covers dozens of models selectable by config string —
literally the lowest-commitment way to A/B cheap vs. good. Start: Flux-schnell /
Flux-dev for stills; a low-cost video model (Kling standard / Wan / LTX) for
clips. Measure cost and quality on episode 1, then decide whether Runway's motion
quality justifies its price and subscription. `design` stays code-generated SVG.

### ADR-P011 — Maps provider — DECIDED

Decision: **Google Maps Static API**. Reuses the existing Google account and
billing (Drive), the recurring Maps Platform monthly credit makes it effectively
free at this volume (~10–50 maps/month), satellite/context views included.
Tradeoff: weaker custom styling and stricter caching/ToS rules. If a distinctive
branded map style is wanted later: **MapTiler** (cheaper) or **Mapbox** (best
styling) — the `maps` adapter is kept thin so this is a config swap.

### ADR-P009 — Budget numbers — DECIDED

Decision: **$25 default per episode** (`episode_default_cents: 2500`),
**$3 per-call cap** (`per_call_cap_cents: 300`), warn at 80% ($20). Rationale:
the operator's stated ceiling is $20–30; the per-call cap catches a single
runaway image/video generation before it spends the budget. Tune both after the
first measured episode. At this budget the binding constraint is AI-video
seconds — see `15_EFFICIENCY_AND_COST.md` §1.

> Provider pricing figures behind P002/P003b/P011 are ballpark (knowledge cutoff
> Jan 2026); verify current rates before committing spend. The choices are
> structural (no lock-in / existing account), so they stand regardless of price
> drift.

## Still Need Your Call

Nothing blocking. Remaining items are set-after-measurement:

- Exact model ids for the `models` tiers and the Replicate video model (pick at
  P7 against current availability).
- Metric targets in `02_PRD.md` §10 / `14_EVALUATION_METRICS.md` §3 (after the
  first end-to-end episode).
- Drive folder layout and the DaVinci package manifest schema (confirm against a
  real Resolve import at P10).
