# Known Limitations

Status: **Drafted**

## What Nomad Will NOT Build Initially

From the blueprint, carried forward as explicit non-scope:

- **No automatic direct publishing to YouTube.** Publication stays fully manual
  and human-controlled.
- **No autonomous final editor replacing DaVinci Resolve.** Nomad produces a
  DaVinci-ready package; the human does the edit, sound mix, color, subtitles,
  finishing, and export.
- **No large agent swarm.** Six agents, one manager, one Critic. Recursive
  agent fan-out is not a feature.
- **No mandatory single AI vendor.** Every capability is provider-agnostic.
- **No mandatory single MCP provider for every integration.** MCP and direct
  APIs coexist.
- **No complex enterprise infrastructure.** No queues, workers, orchestration
  clusters, or hosted backend in v1.
- **No vector database adopted for its own sake.** Only if a measured retrieval
  need justifies it, via the decision rules.
- **No abstraction factories for stable infrastructure.** SQLite, the
  filesystem, and Git are not wrapped in swappable interfaces.
- **No requirement that every asset be AI-generated.** Mixed media is the goal.
- **No multi-user / collaboration features.** Single operator.

## v1 Scope Cuts (may come in v2/v3 — see `18_ROADMAP.md`)

- Only one provider per capability (except `models`, which seeds Anthropic +
  Gemini); no cost/quality routing yet.
- Basic maps only — styled static maps, routes, satellite/context views. No
  animated map sequences, no deep 3D terrain/building reconstruction (v2).
- No hosted API or review UI; CLI + Google Drive only.
- No PostgreSQL, object storage, or job queue — local SQLite + Drive + in-process
  work.
- No semantic/embedding memory; knowledge is plain Markdown.
- Episode concurrency is supported by the data model but not performance-tuned.

## Accepted Constraints

- Model output is non-deterministic; correctness guarantees live in the
  deterministic Policy Engine, Workflow Core, and domain invariants, not in
  agent output.
- Provider cost and availability are outside Nomad's control; the mitigation is
  replaceability, not prevention.
- The DaVinci package layout depends on a real import test to be trustworthy
  (`19_RISK_REGISTER.md` R-15).
- Solo maintainer: the docs in this folder are the continuity plan.
