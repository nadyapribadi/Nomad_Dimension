# Risk Register

Status: **Drafted**

Likelihood (L) and Impact (I): Low / Med / High. Review each phase.

| ID | Risk | L | I | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- |
| R-01 | A media/LLM provider raises price sharply, degrades quality, or shuts down | High | High | Capability line + adapter pattern; provider-switch test in P7; no provider logic above the capability interface | Maintainer |
| R-02 | Episode cost overruns silently | Med | High | Per-episode budget + per-call cap in Policy Engine; cost attributed per call; `alert_at_fraction` warning | Maintainer |
| R-03 | Channel starts to feel synthetic (AI-image sameness) | Med | High | Visual philosophy rules; Critic visual rubric; medium rationale required per shot; reuse of varied media | Critic / Visual |
| R-04 | Factual error reaches a published episode | Med | High | Claim→source linkage; Research confidence rating; important+low-confidence claims flagged; Critic research rubric; manual-review trigger 2 | Research / Critic |
| R-05 | Copyright / licensing violation | Med | High | License metadata required on every version; no unlicensed asset in an approved package; manual-review trigger 1 | Production / human |
| R-06 | Prompt injection via retrieved web content | Med | Med | External content passed as delimited data, never instructions; conflicting-instruction detection → trigger 6 → quarantine | Policy Engine |
| R-07 | State corruption or lost work after a crash | Med | High | Transactional transitions + paired events; recovery routine; idempotent capability calls via request hash; recovery tests | Workflow Core |
| R-08 | Secret leakage into prompts, logs, config, or git | Low | High | Secrets from env only; redaction pass in logger + storage adapter; `.env` gitignored; config references by name | Maintainer |
| R-09 | Protected / source asset destroyed or overwritten | Low | High | `protection` levels enforced in DB layer + Policy Engine; revisions create versions, never overwrite; delete requires approval | Policy Engine |
| R-10 | Critic rubber-stamps (low value as a gate) | Med | Med | Critic independence; track Critic-PASS vs human-acceptance correlation; false-REWORK rate; tune rubric | Human |
| R-11 | Endless REWORK loop on a stage | Low | Med | `revision_ceiling` → escalate + block; human override recorded as an Approval | Workflow Core |
| R-12 | Over-engineering the system beyond a solo operator's needs | Med | Med | Ponytail discipline; `KNOWN_LIMITATIONS.md`; decision rules for future tech; no infra before measured need | Maintainer |
| R-13 | Domain model churn breaks downstream work | Med | High | Freeze after P1; changes require an ADR in `20_DECISIONS.md` | Maintainer |
| R-14 | Google Drive API limits / auth breakage | Med | Med | Storage is a capability; retry + error taxonomy; Drive replaceable with object storage | Maintainer |
| R-15 | DaVinci package layout doesn't import cleanly | Med | Med | Validate the manifest against a real DaVinci import in P10 before relying on it | Production |
| R-16 | Solo maintainer bus factor | High | Med | Docs as source of truth; decision log; glossary; agent specs written for a second person | Maintainer |
| R-17 | Model output non-determinism makes tests flaky | Med | Med | Policy/workflow/model-free logic fully deterministic and tested; model-touching paths use fixtures/stubs; conformance tests isolate providers | Maintainer |

## Review Log

<!-- Add a dated line each phase: what changed, new risks, retired risks -->
- (planning baseline) Register created from blueprint §7, §21, §22 and the
  architecture decisions.
