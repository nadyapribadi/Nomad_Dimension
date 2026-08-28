# Nomad Dimension Project Charter

Status: **Drafted**

## Document Control

- Project: Nomad Dimension
- Repository name: NomadDimension
- Status: Planning baseline
- Version: 0.1.0-planning
- Primary target: single local machine (the Creative Director's computer)
- Primary user: one person, acting as Creative Director
- Final editing environment: DaVinci Resolve (human-controlled, outside the autonomous core)

## Executive Summary

Nomad Dimension is a local-first, provider-agnostic, hierarchical AI production
system for a YouTube channel. It supports pre-production, production,
post-production preparation, iterative quality control, and channel maintenance.

Hermes is the executive producer and manager. Specialist agents (Research, Story,
Visual, Production) perform the work. Critic is an independent quality gate. The
human remains Creative Director and final authority. DaVinci Resolve remains the
final editing environment.

The system owns the workflow, knowledge, state, production model, and creative
rules. It rents interchangeable capabilities (LLMs, research, media generation,
maps, storage) from external providers.

## Channel Context

The channel produces documentary-style episodes spanning **history / explainer**,
**commentary / culture**, and **travel / place / geography**. Consequences for
the system:

- **High research bar.** Citations matter; important claims need authoritative
  support. Research triggers and the Critic research rubric stay strict.
- **Maps and geographic visualization are in v1**, not deferred — spatial
  explanation is core to the travel/place material.
- **Mixed media is essential.** Archival footage, on-location footage, maps,
  typography, diagrams, photography, AI reconstruction, and animation all carry
  beats. AI generation is one tool among many.
- **All four drivers matter** — coordination overhead, quality consistency, cost
  control, and throughput. The system is not optimized for one at the expense of
  the others.

## Provider Direction

Provider-agnostic by design. Seeded first picks (all replaceable behind
capability adapters):

- `models`: Anthropic (strong tier — plan / write / review), Google Gemini
  (alternate / economical tier, Google ecosystem fit with Drive).
- `audio`: ElevenLabs.
- `image` / `video`: Replicate and/or Runway.
- `research`: to be chosen (structured results + recency filtering).
- `storage`: Google Drive.

No single mandatory vendor; any of the above can be swapped without touching
Hermes, agents, workflow, or content data.

## Mission

Produce channel episodes to a consistent quality bar with far less manual
coordination, while keeping every expensive, irreversible, or high-risk action
under human control and keeping all knowledge and state on one machine the
Creative Director owns.

## Product Statement

```text
One manager: Hermes.
A few specialist agents.
One independent Critic.
Deterministic policy for permissions, budgets, and approvals.
Generate -> critique -> revise, not first-pass acceptance.
Local state. Portable knowledge. Replaceable providers.
Human has final say. DaVinci does the final edit.
```

## Why Build This

- **Own the workflow, rent the capabilities.** Vendors change prices, quality,
  and availability. The creative system, data model, and production knowledge
  must not be coupled to any one of them.
- **Coordination is the real cost.** The bottleneck in solo channel production is
  tracking where every episode, segment, shot, and asset is and what happens
  next — not any single generation step.
- **Quality needs an adversary.** A dedicated Critic that can return REWORK
  catches weak research, weak narrative, and synthetic-feeling visuals before
  they reach the edit.
- **Keep it understandable.** One machine, Python, SQLite, Markdown, YAML, Git,
  Google Drive. No enterprise infrastructure until measured need forces it.

## Guiding Principles

1. Local-first for state, knowledge, and logs.
2. Provider-agnostic from the first capability abstraction.
3. Abstract unstable dependencies (AI/media providers); do not over-abstract
   stable infrastructure (SQLite, filesystem, Git).
4. Deterministic policy controls for permissions, budgets, approvals, and
   protected resources.
5. Generate -> critique -> revise -> critique, rather than accepting first-pass
   outputs.
6. The content data model scales from episodes to segments, scenes, shots,
   assets, and versions without a creative-system rewrite.
7. External web pages, files, and tool outputs are untrusted data, never
   instructions.
8. Important outputs are versioned, not overwritten.
9. Final publication and final editing stay human-controlled.
10. Deterministic code for deterministic tasks; do not spend LLM tokens on them.

## Goals

- Define product, functional, and technical requirements for the system.
- Freeze the content domain model: Channel -> Episode -> Segment -> Scene ->
  Shot -> Asset -> Version -> Feedback.
- Define all six agent job descriptions: permissions, inputs, outputs, tools,
  metrics, guardrails.
- Define Hermes decision and escalation logic.
- Define Policy Engine rules and approval gates.
- Define Workflow Core state transitions and recovery.
- Define capability interfaces before any provider implementation.
- Build the smallest local system: Python + SQLite + Markdown/YAML + Git.
- Run one complete 3-5 minute episode end to end, then measure.

## Non-Goals (v1)

- No automatic direct publishing to YouTube.
- No autonomous final editor replacing DaVinci Resolve.
- No large agent swarm.
- No mandatory single AI vendor.
- No mandatory single MCP provider for every integration.
- No enterprise infrastructure (queues, workers, orchestration clusters).
- No vector database adopted for its own sake.
- No abstraction factories for stable infrastructure components.
- No requirement that every asset be AI-generated.
- No multi-user / collaboration features.

## Stakeholders

| Stakeholder | Need |
| --- | --- |
| Creative Director (primary user) | Consistent-quality episodes with less manual coordination; final control over cost, creative direction, and publication |
| Maintainer (same person, later possibly others) | Clean Python modules, testable boundaries, low dependency risk, docs that explain the system |
| Future collaborator | Clear domain model, agent specs, and decision log to onboard against |
| Providers | Replaceable behind capability adapters; no lock-in |

## Success Criteria

### Planning success

- Charter, PRD, FRD, TRD, architecture, data model, agent specs, workflow,
  policy model, implementation plan, checklist, risks, and decisions exist.
- Every open choice is captured as a decision record or a `DECISION NEEDED`
  callout.
- The repository can be initialized and worked on without a cleanup pass.

### MVP success

- Domain model implemented in SQLite with stable IDs and versioned assets.
- Hermes can plan an episode, initialize state, and delegate to agents.
- Policy Engine enforces permissions, a per-episode budget, and approval gates.
- Workflow Core tracks stage state and is recoverable after interruption.
- One provider is connected for each necessary capability.
- Critic can return a structured REWORK request and Hermes routes it.
- Asset registry links assets to Google Drive with version and licensing
  metadata.
- One complete 3-5 minute episode runs end to end into a DaVinci-ready package.

### Product success

- Quality, cost, and rework metrics are captured per episode.
- A provider for any capability can be swapped by replacing its adapter, with no
  change to Hermes, agents, workflow, or content data.
- Multiple episodes can be in production concurrently without state confusion.
- Lessons learned flow back into channel knowledge.

## Core Decisions

| Area | Decision |
| --- | --- |
| Deployment | Local-first, single machine (Phase 1) |
| Language | Python |
| Core API (if needed) | FastAPI |
| Validation / contracts | Pydantic |
| Operational state | SQLite |
| Knowledge | Markdown |
| Configuration | YAML |
| Structured exchange | JSON |
| Heavy media | Google Drive (interface replaceable) |
| Code / prompts / config history | Git / GitHub |
| Final editor | DaVinci Resolve (human-controlled) |
| Manager | Hermes |
| Specialists | Research, Story, Visual, Production |
| Quality gate | Critic (independent; PASS or REWORK) |
| Tool connections | MCP and direct APIs coexist |
| Publishing | Outside the autonomous core in v1 |

## Delivery Philosophy

Freeze the domain model and the contracts first. Build the smallest local system
that can run one real episode. Connect one provider per capability before adding
alternatives. Measure quality, cost, and rework. Only then expand providers, MCP
servers, mapping/3D, or remote infrastructure.

Future scale is an infrastructure migration, not a creative-system rewrite:
SQLite can later move to PostgreSQL, Drive to object storage, long-running jobs
to workers/queues — without touching agents or the content model.

## Documentation Map

See `README.md` for the full index. Key entries:

- `02_PRD.md`: what the system must do and for whom.
- `03_FRD.md`: detailed functional requirements.
- `04_TRD.md`: non-functional and engineering requirements.
- `05_ARCHITECTURE.md`: system structure and flows.
- `06_DATA_MODEL.md`: the content hierarchy and schema.
- `07_AGENT_SPECS.md`: the six agents.
- `08_WORKFLOW_AND_STATE.md`: stage state machine and Critic loop.
- `09_POLICY_AND_SAFETY_MODEL.md`: permissions, budgets, review triggers.
- `16_IMPLEMENTATION_PLAN.md`: phased build.
- `20_DECISIONS.md`: decision records and open questions.
