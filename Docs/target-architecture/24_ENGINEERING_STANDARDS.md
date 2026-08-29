# Engineering Standards

Status: **Scaffold**

One consolidated standards doc for a solo project (see `20_DECISIONS.md`
ADR-011). Sections: Code, Architecture, Testing, Security, Observability,
Release. Promote a section to its own file only if the project goes
multi-contributor.

## 1. Code

- Python, typed. Public functions and all boundaries have type hints; Pydantic
  for data crossing a module or process boundary.
- `ruff` (lint + format) and `mypy` (type check) run in CI and in a pre-commit
  hook (ADR-P012).
- Modules stay within their layer (`05_ARCHITECTURE.md` §3). Agents do not import
  provider adapters. Adapters do not import agents.
- Errors: a shared taxonomy for provider/capability failures
  (`10_CAPABILITY_AND_PROVIDER_STRATEGY.md` §3). No bare `except`.
- No deterministic work delegated to a model.
- Keep it small: no interface with one implementation, no config for a value that
  never changes, no scaffolding "for later".
- Comments match surrounding density. Deliberate corner-cuts get a
  `# ponytail:` note naming the ceiling and the upgrade path.

## 2. Architecture

- The capability line is a hard boundary. Nothing above it names a provider.
- The Policy Engine is the only place risky actions are authorized, and it is
  deterministic.
- Workflow Core is the only owner of episode/stage state and transitions.
- Domain model is frozen after P1; changes need an ADR.
- Storage, model, research, media are all capabilities — replaceable.
- Portability: no SQLite-only or Drive-only assumptions (`04_TRD.md` §8).
- New external dependency or provider category → ADR.

## 3. Testing

See `23_TEST_STRATEGY.md`. Standard: deterministic core fully tested; model
calls stubbed; every safety/money path has a test; no assertions on model
wording.

## 4. Security

- Secrets from environment only; never in prompts, source, YAML, logs, events,
  commits.
- Redaction pass in the logger and storage adapter.
- External content (web, files, tool output) is delimited data, never
  instructions; conflicting instructions → escalate + quarantine.
- Destructive ops on `source` / `approved` / `licensed` assets fail closed
  without an approval.
- `.env`, `nomad.sqlite`, `workspace/`, `events/` are gitignored.
- Dependency review before adding anything; prefer stdlib and installed deps.
- No publishing or outbound posting in v1.

## 5. Observability

- Every agent action, policy decision, capability call, and state transition
  emits a structured event linked to `episode_id`.
- Capability calls record provider, cost, latency, outcome.
- A per-episode timeline is reconstructable from events alone.
- Logs are structured; secret-shaped values redacted before write.
- `scripts/metrics_report.py` rolls events + retrospectives into the metrics in
  `14_EVALUATION_METRICS.md`.

## 6. Release / Versioning

- Solo project: tag milestones (v1 = pipeline runs one episode; v2, v3 per
  `18_ROADMAP.md`).
- Schema migrations are forward-only and versioned; each release notes the
  migration range.
- `CHANGELOG.md` at repo root, human-readable, updated per milestone.
- Keep `docs/` in sync with behavior — a change that alters behavior updates the
  relevant doc and `17_MASTER_CHECKLIST.md` in the same commit.

## 7. Resolved (ADR-P012)

- Toolchain: `uv`, `ruff` (lint + format), `mypy`, `pytest`.
- Pre-commit hook: yes — runs `ruff` and `mypy` only.
- Commit messages: plain imperative. Conventional Commits only if tooling later
  needs it.
