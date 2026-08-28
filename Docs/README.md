# Nomad Dimension Documentation

This folder is the planning and execution source of truth for Nomad Dimension:
a local-first, provider-agnostic, hierarchical AI production system for a YouTube
channel.

The frozen source of record is
`Nomad_Dimension_Master_Architecture_and_Operating_Blueprint.docx`.
`01_BLUEPRINT.md` is the living version derived from it. When the two disagree,
the Markdown docs win and the `.docx` is treated as history.

## Recommended reading order

1. `00_PROJECT_CHARTER.md`
2. `01_BLUEPRINT.md`
3. `02_PRD.md`
4. `03_FRD.md`
5. `04_TRD.md`
6. `05_ARCHITECTURE.md`
7. `06_DATA_MODEL.md`
8. `07_AGENT_SPECS.md`
9. `08_WORKFLOW_AND_STATE.md`
10. `09_POLICY_AND_SAFETY_MODEL.md`
11. `16_IMPLEMENTATION_PLAN.md`
12. `17_MASTER_CHECKLIST.md`
13. `20_DECISIONS.md`

## Full index

| # | File | Purpose |
| --- | --- | --- |
| 00 | `00_PROJECT_CHARTER.md` | Mission, principles, goals/non-goals, why build this, success criteria |
| 01 | `01_BLUEPRINT.md` | Living executive decision, layer model, own-vs-rent, guardrails |
| 02 | `02_PRD.md` | Personas, journeys, MVP scope, product requirements, metrics, release criteria |
| 03 | `03_FRD.md` | Functional requirements per subsystem |
| 04 | `04_TRD.md` | Non-functional and engineering requirements |
| 05 | `05_ARCHITECTURE.md` | System structure, layers, flows, boundaries |
| 06 | `06_DATA_MODEL.md` | Content hierarchy, IDs, SQLite schema, versioning |
| 07 | `07_AGENT_SPECS.md` | The six agent job descriptions |
| 08 | `08_WORKFLOW_AND_STATE.md` | Workflow Core state machine and Critic loop |
| 09 | `09_POLICY_AND_SAFETY_MODEL.md` | Permissions, budgets, protected assets, review triggers |
| 10 | `10_CAPABILITY_AND_PROVIDER_STRATEGY.md` | Capability interfaces and provider adapters |
| 11 | `11_ASSET_AND_STORAGE.md` | Asset classes, Drive layout, licensing metadata, DaVinci handoff |
| 12 | `12_CONFIG_REFERENCE.md` | YAML configuration schema |
| 13 | `13_VISUAL_PHILOSOPHY.md` | Organic visual rules and Critic visual criteria |
| 14 | `14_EVALUATION_METRICS.md` | Metrics and how they are measured |
| 15 | `15_EFFICIENCY_AND_COST.md` | Model routing, reuse, caching, cost tracking |
| 16 | `16_IMPLEMENTATION_PLAN.md` | Phased build plan with exit criteria |
| 17 | `17_MASTER_CHECKLIST.md` | Flat execution checklist |
| 18 | `18_ROADMAP.md` | Release path v1 -> v2 -> v3 |
| 19 | `19_RISK_REGISTER.md` | Risk tracking |
| 20 | `20_DECISIONS.md` | Architecture decisions and open questions |
| 21 | `21_GLOSSARY.md` | Shared vocabulary |
| 22 | `22_DEVELOPER_SETUP.md` | Local environment, repo layout, running an episode |
| 23 | `23_TEST_STRATEGY.md` | Test levels and gates |
| 24 | `24_ENGINEERING_STANDARDS.md` | Code, architecture, testing, security, observability, release |
| — | `KNOWN_LIMITATIONS.md` | What v1 deliberately does not do |
| — | `REQUIREMENTS_TRACEABILITY.md` | PRD -> FRD -> component -> test mapping |

## Document status

Docs are marked at the top as **Drafted** (content complete, ready for review) or
**Scaffold** (structure and decision points captured, prose to be filled). Every
unresolved choice is written inline as:

> **DECISION NEEDED:** short description of the choice and its options.
