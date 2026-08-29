# Technical Requirements Document

Status: **Scaffold**

Non-functional and engineering requirements. IDs are `TRD-NNN`.

## 1. Platform and Runtime

- TRD-001 — The system shall run on a single local machine (Linux or macOS)
  without external infrastructure beyond Google Drive and provider APIs.
- TRD-002 — Python 3.12 shall be the implementation language (ADR-P012).
- TRD-003 — Dependencies and the virtualenv shall be managed with `uv`
  (ADR-P012).
- TRD-004 — The system shall run offline for all non-provider operations
  (state, knowledge, workflow, policy).

## 2. Data and Persistence

- TRD-010 — Operational state and relationships shall be stored in SQLite.
- TRD-011 — Schema migrations shall be versioned and forward-only, run by a
  hand-rolled runner (`migrations/NNNN_name.sql` + a `schema_version` table)
  (ADR-P008).
- TRD-012 — State writes that span multiple rows shall be transactional.
- TRD-013 — Knowledge shall be Markdown; configuration shall be YAML; structured
  exchange shall be JSON. YAML shall not be used as a database or knowledge base.
- TRD-014 — Heavy binary assets shall live in Google Drive; SQLite shall store
  only IDs, relationships, versions, status, source/provider, and licensing
  metadata.
- TRD-015 — The storage capability shall be an interface; Google Drive is one
  adapter and shall be replaceable without touching the domain model.

## 3. Contracts and Validation

- TRD-020 — All domain entities and all capability request/response types shall
  be Pydantic models.
- TRD-021 — Capability interfaces shall be defined before any provider adapter is
  implemented.
- TRD-022 — Provider adapters shall map provider-specific errors to a shared
  Nomad error taxonomy.

## 4. Performance and Cost

- TRD-030 — The system shall record cost, latency, provider, and outcome for
  every capability call.
- TRD-031 — Cost shall be attributable to episode, segment, shot, and provider.
- TRD-032 — Expensive media generation shall not run before the relevant plan
  (visual plan for media) is approved.
- TRD-033 — Deterministic tasks shall be implemented in code, not delegated to an
  LLM.
- TRD-034 — Reusable research and results shall be cached where safe.
  <!-- TODO: cache key strategy, TTL, invalidation -->
- TRD-035 — Task routing shall send high-value reasoning to strong models and
  repetitive work to economical models.

## 5. Reliability and Recovery

- TRD-040 — Any workflow interruption shall leave a consistent state that can be
  resumed from the last completed step.
- TRD-041 — A crash during a capability call shall not corrupt state or lose an
  already-produced asset.
- TRD-042 — Recovery behavior shall be covered by tests (partial writes, crash
  mid-stage, provider timeout).

## 6. Security

- TRD-050 — Secrets and API keys shall be loaded from environment / `.env`
  (gitignored) and never written to prompts, source, logs, or committed config.
- TRD-051 — External content (web pages, files, tool outputs) shall be passed to
  agents as data, clearly delimited, never as instructions.
- TRD-052 — Destructive operations on protected / source / approved assets shall
  fail closed without explicit approval.
- TRD-053 — Logs shall redact secret-shaped values before being written.
- TRD-054 — See `24_ENGINEERING_STANDARDS.md` (Security section) and
  `09_POLICY_AND_SAFETY_MODEL.md`.

## 7. Observability

- TRD-060 — Every agent action, policy decision, capability call, and state
  transition shall emit a structured event linked to the episode.
- TRD-061 — Events shall be persisted append-only in a SQLite `events` table
  (ADR-P006). A JSONL export helper may be added later as a convenience.
- TRD-062 — A per-episode timeline shall be reconstructable from events.

## 8. Portability and Migration

- TRD-070 — No component shall assume SQLite-specific behavior that blocks a
  future move to PostgreSQL.
- TRD-071 — No component shall assume Google Drive semantics that block a future
  move to object storage.
- TRD-072 — Long-running work shall be structured so it can later move to a job
  queue without changing agent code.

## 9. Build, Test, CI

- TRD-080 — `pytest` shall be the test framework; see `23_TEST_STRATEGY.md`.
- TRD-081 — `ruff` (lint + format) and `mypy` (type check) shall run in CI and
  in a pre-commit hook (ADR-P012).
- TRD-082 — Provider adapters shall have conformance tests against the capability
  interface.
