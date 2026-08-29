# Functional Requirements Document

Status: **Scaffold**

Functional requirements per subsystem. IDs are `FRD-<area>-NNN`. Each requirement
should trace back to one or more `PRD-NNN` (see `REQUIREMENTS_TRACEABILITY.md`).

Format for each entry:

```text
FRD-XXX-001
Statement: the system shall ...
Trace: PRD-0NN
Notes / acceptance: ...
```

## 1. Hermes (Orchestration)

- FRD-HRM-001 — Hermes shall accept an episode goal + constraints and produce a
  written plan (stages, expected deliverables, budget allocation). Trace:
  PRD-003.
- FRD-HRM-002 — Hermes shall initialize Workflow Core state for a new episode.
- FRD-HRM-003 — Hermes shall delegate a stage to exactly one owning agent with a
  task brief (inputs, expected output, constraints).
- FRD-HRM-004 — Hermes shall route a Critic REWORK request to the agent named in
  the request, preserving the original context.
- FRD-HRM-005 — Hermes shall escalate to the human on any manual-review trigger
  (see `09_POLICY_AND_SAFETY_MODEL.md`).
- FRD-HRM-006 — Hermes shall not bypass a mandatory approval, exceed policy or
  budget, or delete protected resources.
- FRD-HRM-007 — Hermes shall record every delegation, result, and escalation as
  an event linked to the episode.
<!-- TODO: retry logic, parallel stage handling, deadlock/timeout handling -->

## 2. Research Agent

- FRD-RSC-001 — shall search, compare, structure, and qualify evidence into a
  research package.
- FRD-RSC-002 — shall record source, retrieval date, and a confidence/quality
  rating per claim.
- FRD-RSC-003 — shall flag important claims with weak or contradictory evidence.
- FRD-RSC-004 — shall not present unsupported claims as facts and shall not
  publish or delete protected resources.
<!-- TODO: source dedup, citation format, caching of research results -->

## 3. Story Agent

- FRD-STY-001 — shall turn an approved research package into concept, structure,
  script, and pacing notes.
- FRD-STY-002 — shall link every factual statement in the script to a research
  claim ID.
- FRD-STY-003 — shall revise only the elements named in a REWORK request.
- FRD-STY-004 — shall not introduce claims absent from the research package
  without flagging them for Research.
<!-- TODO: script format spec, segment/scene breakdown output, hook rules -->

## 4. Visual Agent

- FRD-VIS-001 — shall translate the approved script into scenes, shots, and
  per-shot asset requirements.
- FRD-VIS-002 — shall specify, per shot, the intended medium (footage, archival,
  map, diagram, photo, AI still, AI clip, animation, 3D, screen capture) and why.
- FRD-VIS-003 — shall request media capabilities, not specific providers.
- FRD-VIS-004 — shall not approve its own work or bypass Critic.
<!-- TODO: shot list schema, visual variety checks, reference-image handling -->

## 5. Production Agent

- FRD-PRD-001 — shall acquire or generate the assets named in the approved shot
  list.
- FRD-PRD-002 — shall register each asset with version, source/provider, status,
  and licensing metadata, and store the binary in Google Drive.
- FRD-PRD-003 — shall reuse an existing approved asset before generating a new
  one where the requirement matches.
- FRD-PRD-004 — shall assemble a DaVinci-ready package (structure defined in
  `11_ASSET_AND_STORAGE.md`).
- FRD-PRD-005 — shall not publish, exceed budget, or destroy source assets.
<!-- TODO: package manifest format, retry on provider failure, partial-result handling -->

## 6. Critic

- FRD-CRT-001 — shall evaluate each stage deliverable against stage-specific
  criteria (`08_WORKFLOW_AND_STATE.md`, `13_VISUAL_PHILOSOPHY.md`).
- FRD-CRT-002 — shall emit exactly one decision per review: PASS or REWORK.
- FRD-CRT-003 — a REWORK decision shall include: failing items, reason per item,
  severity, and the owning agent.
- FRD-CRT-004 — shall not approve its own output or bypass policy.
<!-- TODO: rubric per stage, pass threshold, escalation on repeated REWORK -->

## 7. Policy Engine

- FRD-POL-001 — shall evaluate every agent action request against a deterministic
  ruleset (permissions, budget, protected resources, approval gates).
- FRD-POL-002 — shall return ALLOW, DENY, or REQUIRES_APPROVAL with a reason
  code.
- FRD-POL-003 — shall create a manual-review request on any trigger in
  `09_POLICY_AND_SAFETY_MODEL.md`.
- FRD-POL-004 — shall fail closed: unknown action or missing rule -> DENY.
- FRD-POL-005 — shall log every decision with inputs and reason code.
<!-- TODO: rule file format, budget accounting model, approval expiry -->

## 8. Workflow Core

- FRD-WFC-001 — shall maintain a state machine per episode with defined stages
  and transitions.
- FRD-WFC-002 — shall record, per stage, status, revision count, and current
  owner.
- FRD-WFC-003 — shall persist state transactionally so an interruption leaves a
  consistent, resumable state.
- FRD-WFC-004 — shall expose "what can happen next" for any episode.
<!-- TODO: full transition table, concurrent-stage rules, timeout handling -->

## 9. Capability Layer

- FRD-CAP-001 — each capability shall be a typed interface (request + response
  contract) independent of any provider.
- FRD-CAP-002 — a provider adapter shall implement one capability interface and
  be selectable by configuration.
- FRD-CAP-003 — capability calls shall record provider, cost, latency, and
  outcome.
<!-- TODO: per-capability contracts in 10_CAPABILITY_AND_PROVIDER_STRATEGY.md -->

## 10. Asset Registry and Storage

- FRD-AST-001 — shall store asset metadata in SQLite and binaries in Google
  Drive, linked by Drive file ID.
- FRD-AST-002 — shall create a new version row on every asset revision.
- FRD-AST-003 — shall mark assets as protected / source / approved and block
  destructive operations on them without approval.
<!-- TODO: licensing fields, provenance manifest, orphaned-asset cleanup -->

## 11. Knowledge and Lessons Learned

- FRD-KNW-001 — shall store channel knowledge as Markdown files under
  `knowledge/`.
- FRD-KNW-002 — shall append an episode retrospective at episode close.
<!-- TODO: knowledge retrieval interface, indexing, structure conventions -->

## 12. Interfaces

- FRD-IFC-001 — shall provide a `nomad` CLI to start an episode, show status,
  list pending approvals, and resolve approvals. **CLI only in v1** (ADR-P007);
  no FastAPI until a second surface needs it.
