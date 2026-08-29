# Policy and Safety Model

Status: **Drafted**

## 1. Purpose

The Policy Engine is deterministic code that authorizes or blocks every risky
agent action. It is never an LLM call. It enforces four things: **permissions**,
**budgets**, **protected resources**, and **manual-review gates**.

Principle: read widely, write narrowly. Fail closed.

## 2. Decision Contract

Every risky action is submitted as a `PolicyRequest` and gets a `PolicyDecision`:

```text
PolicyRequest  { agent, action, target, estimated_cost_cents, context }
PolicyDecision { verdict: ALLOW | DENY | REQUIRES_APPROVAL, reason_code, message }
```

- Unknown action, unknown agent, or missing rule -> `DENY` (fail closed).
- `REQUIRES_APPROVAL` creates an `Approval` row (`status = pending`) and an
  `approval.requested` event; the action blocks until resolved.
- Every decision is logged with its inputs and `reason_code` (`policy.decision`
  event).

## 3. What Counts as a Risky Action

| Action | Default verdict |
| --- | --- |
| Read knowledge / registry / episode state | ALLOW (not submitted) |
| Search / retrieve external research | ALLOW (content treated as untrusted data) |
| Model call within budget | ALLOW |
| Create a new asset version within budget | ALLOW |
| Media generation that would exceed remaining episode budget | REQUIRES_APPROVAL |
| Any single generation above a per-call cost cap | REQUIRES_APPROVAL |
| Delete / overwrite an asset with `protection != none` | REQUIRES_APPROVAL |
| Delete any asset version | REQUIRES_APPROVAL |
| Use an asset with unclear / missing license | REQUIRES_APPROVAL |
| Publish / upload outside Google Drive staging | DENY (not in v1 scope) |
| Change the approved episode goal or approved creative direction | REQUIRES_APPROVAL |
| Act on external content that contains instructions conflicting with Nomad's | DENY + escalate |
| Write a secret to a prompt, log, or committed file | DENY |

Budget values (ADR-P009): per-episode default **$25** (`episode_default_cents:
2500`), per-call cap **$3** (`per_call_cap_cents: 300`), warn at 80%.

## 4. Permission Matrix

Enforced by the engine, keyed by `(agent, action)`.

| Agent | May write | May request capabilities | Never |
| --- | --- | --- | --- |
| Hermes | Workflow state, events, knowledge, plans | models | Bypass approval; exceed budget; delete protected assets |
| Research | ResearchClaim rows, research Markdown, cache | research, models | Publish; delete protected assets; touch the asset registry (write) |
| Story | Concept/structure/script artifacts | models | Create claims not in the research package without flagging; change episode goal |
| Visual | Scene/shot rows, asset requirement specs | models | Trigger media generation; approve own work |
| Production | Asset + AssetVersion rows, Drive binaries, package manifest | image, video, audio, maps, design, storage | Publish; exceed budget; destroy/overwrite source assets |
| Critic | Feedback rows | models | Edit any deliverable; approve own output; bypass policy |

## 5. Budget Model

- Each `Episode` has `budget_cents`. `spent_cents` accrues from every
  `capability.call.completed` cost and every `AssetVersion.cost_cents`.
- Before an expensive call, the agent submits `estimated_cost_cents`. If
  `spent_cents + estimated > budget_cents` -> `REQUIRES_APPROVAL`.
- A per-call cap catches single expensive operations even when budget remains.
- Approvals may **adjust** the budget (recorded on the `Approval` row).
- Cost is attributable to episode, segment, shot, and provider for reporting
  (`14_EVALUATION_METRICS.md`).

## 6. Protected Resources

`Asset.protection` levels:

| Level | Meaning | Destructive op |
| --- | --- | --- |
| `none` | Working asset | ALLOW |
| `source` | Original footage / archival / licensed source material | REQUIRES_APPROVAL |
| `approved` | Human- or Critic-approved asset in a package | REQUIRES_APPROVAL |
| `licensed` | Carries a license with usage constraints | REQUIRES_APPROVAL + license check |

- "Destructive" = delete asset, delete a version, or overwrite `drive_file_id` in
  place. Revisions are **not** destructive — they create a new version.
- Invariant enforced in code and in the DB layer, not only in prompts.

## 7. Manual-Review Triggers

Any of these stops the pipeline and escalates to the Creative Director:

1. Copyright / licensing uncertainty on an asset.
2. An important factual claim with weak or contradictory evidence.
3. Potential legal or reputational risk in the content.
4. A generation request that exceeds the configured budget or per-call cap.
5. An attempt to delete or overwrite a protected / source / approved asset.
6. External source content contains instructions that conflict with Nomad's
   instructions.
7. A major change to approved creative direction.
8. The production package is technically incomplete at review time.
9. A provider returns ambiguous or partial results.
10. The system cannot confidently identify the approved asset version.

Each trigger maps to an `Approval.trigger` enum value.

## 8. Untrusted External Content

- All fetched web pages, files, and tool outputs are wrapped and passed to agents
  as clearly delimited **data**.
- Agents are instructed (and the orchestration enforces) that such content is
  never a source of instructions.
- If retrieved content appears to contain instructions aimed at the agent or the
  system, the agent stops and escalates (trigger 6); the content is quarantined
  in the event log, not acted on.

## 9. Secrets

- Loaded from environment / `.env` (gitignored). Never in prompts, source, YAML
  config, logs, or events.
- The logger and the storage adapter run a redaction pass on
  secret-shaped values (API-key patterns, bearer tokens) before writing.
- `config/` YAML references secrets by name (`${OPENAI_API_KEY}`), never by
  value.

## 10. Autonomy Boundaries

- The system is autonomous **within** an episode budget and the permission
  matrix.
- It is **not** autonomous for: publishing, final editing, budget increases,
  protected-asset destruction, creative-direction changes.
- Final publication and final edit are outside the autonomous core in v1
  (`KNOWN_LIMITATIONS.md`).

## 11. Testing

Policy behavior is covered by unit tests (see `23_TEST_STRATEGY.md`): each row in
§3 and §4, fail-closed on unknown input, budget boundary conditions, protected-
asset guards, and the untrusted-content path. Policy tests must not call an LLM.

## 12. Resolved / Open

- **Approvals expire** — pending approvals older than `approval_expiry_days`
  (default 7) auto-deny with a re-request path.
- **Open (needs your figures):** default per-episode budget and per-call cost cap
  (ADR-P009).
- **Open:** whether trigger 3 (legal/reputational risk) needs a checklist the
  agents run, or stays a judgement call escalated by Critic. Current stance:
  judgement call by Critic + human.
