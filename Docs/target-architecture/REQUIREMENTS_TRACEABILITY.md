# Requirements Traceability

Status: **Scaffold**

Maps product requirements (`02_PRD.md`) to functional requirements (`03_FRD.md`),
the component that implements them, and the test that covers them. Fill the
Component and Test columns as implementation lands.

| PRD | Requirement (short) | FRD | Component | Test | Status |
| --- | --- | --- | --- | --- | --- |
| PRD-001 | Runs on one local machine (SQLite + FS + Drive) | TRD-001, TRD-014 | core/*, capabilities/storage | tests/integration/test_local_run | planned |
| PRD-002 | Frozen content model with stable IDs | FRD (data), TRD-020 | models/*, repository | tests/models/test_invariants | planned |
| PRD-003 | Hermes plans, delegates, escalates | FRD-HRM-001..007 | agents/hermes | tests/integration/test_hermes | planned |
| PRD-004 | Every stage passes Critic before the next | FRD-CRT-001, FRD-WFC-001 | core/workflow, agents/critic | tests/workflow/test_stage_gate | planned |
| PRD-005 | Structured REWORK request | FRD-CRT-003 | agents/critic | tests/critic/test_rework_shape | planned |
| PRD-006 | Deterministic Policy Engine (permissions, budget, gates) | FRD-POL-001..005 | core/policy | tests/policy/* | planned |
| PRD-007 | Protected/source/approved assets not deletable without approval | FRD-POL-001, FRD-AST-003 | core/policy, repository | tests/policy/test_protected_assets | planned |
| PRD-008 | Asset versions never silently overwritten | FRD-AST-002 | models/asset, repository | tests/models/test_versioning | planned |
| PRD-009 | Workflow recoverable after interruption | FRD-WFC-003 | core/workflow | tests/workflow/test_recovery | planned |
| PRD-010 | Capabilities are interfaces; providers are adapters | FRD-CAP-001..002 | capabilities/*, providers/* | tests/capabilities/test_contract | planned |
| PRD-011 | Provider swap = adapter + config only | FRD-CAP-002 | providers/*, config | tests/capabilities/test_switch | planned |
| PRD-012 | External content is untrusted data | FRD-POL-003 | core/policy, agents/* | tests/policy/test_untrusted_content | planned |
| PRD-013 | Secrets out of prompts/source/config/logs | TRD-050, TRD-053 | core/logging, capabilities/* | tests/security/test_redaction | planned |
| PRD-014 | Cost tracked per episode/segment/shot/provider | FRD-CAP-003, TRD-030..031 | capabilities/CallContext, events | tests/cost/test_attribution | planned |
| PRD-015 | Manual-review triggers escalate | FRD-POL-003, FRD-HRM-005 | core/policy, agents/hermes | tests/policy/test_triggers | planned |
| PRD-016 | Output is a DaVinci-ready package; no edit/publish | FRD-PRD-004 | agents/production, asset/package | tests/e2e/test_package_import (manual) | planned |
| PRD-017 | Lessons learned captured at close | FRD-KNW-002 | core/workflow, knowledge | tests/workflow/test_retrospective | planned |
| PRD-018 | Concurrent episodes without state confusion | FRD-WFC-001 | core/workflow, repository | tests/workflow/test_concurrent_episodes | planned |

<!-- TODO: keep this table current; add rows as FRD IDs are finalized in 03_FRD.md -->
