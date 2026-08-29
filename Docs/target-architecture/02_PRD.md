# Product Requirements Document

Status: **Drafted**

## 1. Overview

Nomad Dimension is a local-first multi-agent production system that gives one
person — the Creative Director — a coordinated pipeline for taking a YouTube
episode from idea to a DaVinci-ready production package.

It is not a chatbot and not a single-shot generator. It behaves like a small
production company: a manager (Hermes) plans and delegates, specialists do the
work, an independent Critic challenges every stage, deterministic policy guards
cost and irreversible actions, and the human approves creative direction and
holds final authority.

## 2. Problem Statement

Solo channel production fails or stalls because:

- Coordination and state tracking (which episode/segment/shot/asset is where,
  and what is next) is manual and error-prone.
- First-pass AI output is accepted because there is no time or structure to
  challenge it, so quality drifts.
- Tools are wired directly to one vendor, so a price change or outage breaks the
  pipeline.
- Cost is invisible until the bill arrives.
- Knowledge and lessons live in the person's head, not in a reusable store.
- Long multi-step work is not recoverable after an interruption.

## 3. Product Thesis

A solo creator ships more, and at a more consistent quality bar, when the system
behaves like a production company with roles and gates rather than a single
assistant: planned, delegated, independently critiqued, policy-gated, recoverable,
and provider-agnostic.

## 4. Channel and Users

### Channel context

Documentary-style channel across **history / explainer**, **commentary /
culture**, and **travel / place / geography**. This sets three requirements the
system must meet from v1:

- Strict factual standards — claim-to-source linkage, confidence ratings,
  Critic research review (`09_POLICY_AND_SAFETY_MODEL.md` triggers 2 and 3).
- Maps / geographic visualization as a first-class capability, not a v2 add-on.
- Deliberate mixed media — archival, on-location, maps, typography, diagrams,
  reconstruction, animation — with AI generation used only where it adds
  narrative value (`13_VISUAL_PHILOSOPHY.md`).

### Primary persona: Creative Director (the operator)

- Runs one YouTube channel, mostly alone.
- Works on one local machine; cares about owning state, knowledge, and cost.
- Wants to set an episode goal and creative constraints, then review at gates
  rather than micromanage every step.
- Uses DaVinci Resolve for the final edit and will not give that up.

### Secondary persona: Maintainer (usually the same person)

- Wants clean Python modules, a frozen domain model, testable policy and
  workflow, and provider adapters that can be swapped.
- Needs the decision log and agent specs to make changes safely.

### Future persona: Collaborator

- A second person who might run Research or Story tasks, or review packages.
- Needs the domain model, agent specs, and glossary to onboard.

## 5. Product Goals

- Make episode coordination and state explicit and recoverable.
- Enforce generate -> critique -> revise at every stage.
- Keep every expensive, irreversible, or high-risk action policy-gated and, where
  required, human-approved.
- Support multiple providers per capability behind one interface.
- Track cost per episode, segment, shot, and provider.
- Capture lessons learned back into channel knowledge.
- Produce a clean DaVinci-ready package, not a finished video.

## 6. Experience Principles

- The Creative Director sets goals and constraints; the system proposes plans.
- Review happens at defined gates, with a clear PASS / REWORK decision.
- Every REWORK request is structured: what failed, why, and which agent owns the
  fix.
- Cost and budget status are visible before expensive operations run.
- Nothing protected (source, approved, or licensed assets) is deleted or
  overwritten without explicit approval.
- The human always sees the approved package before it reaches DaVinci.

## 7. Primary User Journeys

### Journey A: Episode from idea to package

1. Creative Director defines an episode goal and constraints (length, angle,
   budget, must-include or must-avoid).
2. Hermes creates a plan and initializes Workflow Core state.
3. Policy Engine checks constraints, budget, and required approvals.
4. Research gathers evidence; Critic reviews it; weak research returns to
   Research.
5. Story produces concept, structure, script, and pacing; Critic reviews; weak
   story returns to Story.
6. Visual produces scene/shot/asset requirements; Critic reviews.
7. Production acquires or generates assets, versions them, and organizes the
   package; Critic reviews completeness and licensing.
8. Creative Director reviews the approved package and creative direction.
9. The package is exported in a DaVinci-ready layout.
10. Lessons learned are written back to channel knowledge.

### Journey B: Mid-pipeline REWORK

1. Critic returns REWORK on the story (e.g. weak hook, pacing sag in segment 2).
2. Hermes routes the request to Story with the specific notes.
3. Story revises only what was flagged.
4. Critic re-evaluates; on PASS the pipeline continues from where it was.
5. Workflow Core records the revision cycle count.

### Journey C: Budget or licensing stop

1. Production requests a video generation that would exceed the episode budget,
   or an asset with unclear licensing.
2. Policy Engine blocks the action and raises a manual-review request.
3. Creative Director approves, denies, or adjusts the budget/asset.
4. The decision and its rationale are logged against the episode.

### Journey D: Provider swap

1. An image provider becomes too expensive.
2. Maintainer implements a new adapter behind the existing image capability
   interface and points config at it.
3. No change is made to Hermes, agents, workflow, or content data.
4. The next episode uses the new provider; cost metrics show the difference.

## 8. MVP Scope

### Included

- SQLite domain model: Channel -> Episode -> Segment -> Scene -> Shot -> Asset
  -> Version -> Feedback, with stable IDs.
- Hermes: plan an episode, initialize state, delegate to agents, route REWORK,
  escalate.
- Policy Engine: per-agent permissions, per-episode budget check, approval gates,
  protected-asset guard, untrusted-data rule.
- Workflow Core: stage state machine, revision cycle tracking, recovery after
  interruption.
- The four specialist agents with defined inputs/outputs.
- Critic with a structured REWORK request format, applied at every stage.
- One provider connected per capability: models, research, image, video, audio,
  maps, storage. (3D optional in MVP; basic maps/geographic visualization is
  in scope.)
- Asset registry linking assets to Google Drive with version, source/provider,
  and licensing metadata.
- Cost tracking per episode and per provider.
- DaVinci-ready package export.

### Excluded (see `KNOWN_LIMITATIONS.md`)

- Direct YouTube publishing.
- Autonomous final editing.
- Multiple providers per capability.
- Deep 3D pipeline (terrain/building reconstruction) — basic maps only in v1.
- Remote/multi-machine execution.
- Multi-user features.
- Vector database / semantic memory.

## 9. Product Requirements

| ID | Requirement |
| --- | --- |
| PRD-001 | The system must run entirely on one local machine using SQLite, the local filesystem, and Google Drive for heavy assets. |
| PRD-002 | The content domain model must be Channel -> Episode -> Segment -> Scene -> Shot -> Asset -> Version -> Feedback, with stable IDs for major entities. |
| PRD-003 | Hermes must produce an episode plan, initialize workflow state, delegate to agents, and escalate to the human on defined triggers. |
| PRD-004 | Every production stage (research, story, visual, production) must pass through Critic before the next stage begins. |
| PRD-005 | Critic must emit a structured REWORK request identifying the failure, the reason, and the owning agent. |
| PRD-006 | The Policy Engine must enforce per-agent permissions, per-episode budget limits, and approval gates deterministically (not via an LLM). |
| PRD-007 | Protected, source, and approved assets must not be deletable or overwritable without explicit human approval. |
| PRD-008 | Asset versions must never be silently overwritten; each revision creates a new version linked to its feedback. |
| PRD-009 | Workflow state must be recoverable after an interruption, resuming from the last completed step. |
| PRD-010 | Each capability (models, research, image, video, audio, maps, storage) must be defined as an interface, with providers implemented as replaceable adapters. |
| PRD-011 | Swapping a provider must require only a new adapter and a config change — no change to Hermes, agents, workflow, or content data. |
| PRD-012 | External web pages, files, and tool outputs must be treated as untrusted data, never as instructions. |
| PRD-013 | Secrets and API keys must be kept out of prompts, source code, and committed configuration. |
| PRD-014 | The system must track cost per episode, segment, shot, and provider. |
| PRD-015 | Manual review must be triggered on copyright/licensing uncertainty, weak evidence for important claims, budget overruns, protected-asset changes, conflicting external instructions, and major creative-direction changes. |
| PRD-016 | The final output must be a DaVinci-ready production package; the system must not perform the final edit or publish. |
| PRD-017 | Lessons learned must be captured into channel knowledge (Markdown) at episode close. |
| PRD-018 | The same model must support multiple episodes in production concurrently without state confusion. |

## 10. Performance and Cost Targets

> **DECISION NEEDED:** confirm target numbers. Draft values below are placeholders
> pending the first end-to-end episode measurement.

| Metric | Target (draft) |
| --- | --- |
| Cost per completed 3-5 min episode | Under [X] USD |
| Cost per finished minute | Under [X] USD |
| Average revision cycles per stage | <= 2 |
| Interrupted workflows successfully resumed | 100% |
| Unsupported factual-claim rate in accepted script | 0 important claims |
| Required assets correctly available and linked at package close | 100% |
| Manual coordination time per episode vs. baseline | Reduced by [X]% |

## 11. Product Metrics

See `14_EVALUATION_METRICS.md` for definitions and measurement method. Headline
metrics: research accuracy, unsupported-claim rate, Critic pass rate, story/visual
human rating, production completeness, rework efficiency, cost per episode, tokens
per accepted deliverable, provider quality/cost comparison, policy-violation
count, recovery success rate.

## 12. Release Criteria

### v1 (local pipeline)

- Domain model implemented; stable IDs; versioned assets.
- Hermes plans and delegates; Workflow Core tracks and recovers.
- Policy Engine enforces permissions, budget, approvals, protected assets.
- Critic loop works at every stage with structured REWORK.
- One provider per required capability.
- Asset registry with Drive linkage and licensing metadata.
- One full 3-5 minute episode produced end to end.
- Cost and rework metrics captured.

### v2 (choice and breadth)

- Multiple providers per capability with routing by cost/quality.
- Maps/3D pipeline usable for spatial episodes.
- MCP servers added where they add standardization.
- Provider quality/cost comparison reporting.

### v3 (scale)

- Optional remote infrastructure: PostgreSQL, object storage, job workers.
- Concurrent episode throughput improvements.
- No creative-system rewrite required to get here.

## 13. Dependencies

- Python (stable), Pydantic, optional FastAPI.
- SQLite.
- Git / GitHub.
- Google Drive API (storage capability).
- One LLM provider SDK/HTTP client.
- One provider each for research, image, video, audio.
- DaVinci Resolve (external, human-operated).

## 14. Open Product Questions

- Cost ceiling per finished *minute* (per-*episode* is set: $25, ADR-P009).
- Exact model ids per tier and the specific Replicate video model (chosen at P7).

Providers are otherwise decided (`20_DECISIONS.md`): Anthropic + Gemini,
Tavily, Replicate, ElevenLabs, Google Maps Static, Google Drive. Interface is
CLI-only in v1 (ADR-P007).
