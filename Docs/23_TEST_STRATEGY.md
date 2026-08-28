# Test Strategy

Status: **Scaffold**

## 1. Principles

- **Deterministic core, isolated model calls.** Policy Engine, Workflow Core, the
  domain model, cost math, and manifest assembly are fully deterministic and
  fully tested. Anything that calls a model or a provider is tested with
  stubs/fixtures; real-provider tests are separate and opt-in.
- **Test the root, not the symptom.** Guard invariants in the layer all callers
  route through (repository, Policy Engine), not in each agent.
- **One runnable check per non-trivial unit.** Branches, loops, parsers, and
  money/safety paths leave behind the smallest test that fails if the logic
  breaks.

## 2. Levels

| Level | Scope | Network | Notes |
| --- | --- | --- | --- |
| Unit | Pydantic models, repository CRUD + invariants, Policy Engine rules, Workflow transitions, cost math, manifest builder | none | Fast, deterministic, the bulk of the suite |
| Integration | Hermes ↔ Workflow ↔ Policy ↔ agents with a stub model provider; recovery after simulated crash | none | Uses a temp SQLite file |
| Capability conformance | Each provider adapter against the shared contract suite | provider (opt-in) | `-m conformance`; skipped without keys |
| End-to-end | One full episode goal→package with real or recorded provider responses | provider or replay | Gate for P10; validates DaVinci package import manually |

## 3. What Must Have Tests

- Every row of `09_POLICY_AND_SAFETY_MODEL.md` §3 and §4.
- Fail-closed: unknown action / agent / missing rule → DENY.
- Budget boundary: at, just under, just over the ceiling and the per-call cap.
- Protected-asset guard: delete/overwrite on each protection level.
- Domain invariants `06_DATA_MODEL.md` §6 (all seven).
- Workflow: full transition path; interrupt-and-recover at each stage; no
  auto-advance on recovery; two concurrent episodes independent.
- Critic loop: PASS/REWORK per stage; full REWORK cycle; revision ceiling
  escalation.
- Idempotent capability calls: same request hash does not double-charge or
  duplicate an asset.
- Secret redaction: logger and storage adapter scrub key-shaped values.
- Untrusted-content path: retrieved content with embedded instructions →
  trigger 6, quarantined, not acted on.

## 4. Fixtures

- `tests/fixtures/episodes/` — canned goals, research packages, scripts, shot
  lists for driving stages without live models.
- `tests/fixtures/providers/` — recorded provider responses for replay.
- Stub model provider returning deterministic canned deliverables.

## 5. CI Gates

<!-- DECISION NEEDED: exact CI config -->

- Lint + format + type-check.
- Unit + integration suites (no network) must pass.
- Conformance and e2e run on demand / nightly, not on every push.

## 6. Non-Determinism Policy

- No assertion on exact model wording. Assert on structure, schema validity,
  policy outcomes, state, and events.
- Flaky model-touching test → move it behind a fixture or delete it.

## 7. Open Questions

- CI provider (GitHub Actions assumed).
- Whether e2e uses live providers or recorded responses by default.
- Coverage target, if any (recommend: cover the §3 list, don't chase a number).
