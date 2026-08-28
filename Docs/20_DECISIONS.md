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
Consequence: `07_AGENT_SPECS.md` §A–B; per-agent step budgets are a
`DECISION NEEDED` to finalize before P4.

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

### ADR-P005 — ID scheme

Options: ULID / UUIDv7 / prefixed short IDs.
Recommendation: ULID (sortable, no coordination, URL-safe).

### ADR-P006 — Events storage

Options: JSONL files / SQLite events table / both.
Recommendation: SQLite events table for queryability; optional JSONL export.

### ADR-P007 — Local interface

Options: CLI only / CLI + FastAPI.
Recommendation: CLI only for v1; add FastAPI when a second surface actually
needs it.

### ADR-P008 — Migration tooling

Options: Alembic / hand-rolled forward-only runner.
Recommendation: hand-rolled runner for v1 (schema is small); Alembic if it grows.

### ADR-P009 — Budget defaults

Per-episode budget and per-call cap values — set after the first episode's
measured cost.

### ADR-P010 — Revision ceiling value

Draft: 3. Confirm after observing real rework behavior.
