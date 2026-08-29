# Target Architecture (not built)

These documents describe an **aspirational** design for Nomad Dimension: Python,
local-first, SQLite, a Hermes orchestrator with five specialist agents, an
independent Critic quality gate, a provider-agnostic capability layer, and a
DaVinci Resolve handoff. They were written from the blueprint `.docx` (also in
this folder) before the shipped app's shape was settled.

**None of this is implemented.** The current system is a JS/Netlify/Notion wizard
app — see [`../AS_BUILT.md`](../AS_BUILT.md).

Treat this folder as:

- a record of a considered direction,
- a source of ideas to fold into the current app (`../AS_BUILT.md` §9),
- **not** a build plan, and **not** maintained against the code.

Whether the agent-orchestration direction is ever pursued is an open question for
the operator.

## Contents

`00`–`24` are the numbered planning set (charter, PRD/FRD/TRD, architecture, data
model, agent specs, workflow, policy model, capability strategy, config, visual
philosophy, metrics, efficiency, implementation plan, checklist, roadmap, risks,
decisions, glossary, dev setup, test strategy, engineering standards). Plus
`KNOWN_LIMITATIONS.md`, `REQUIREMENTS_TRACEABILITY.md`, and the blueprint `.docx`.

`20_DECISIONS.md` records the provider/tooling choices made during that planning
(Anthropic+Gemini, Tavily, Replicate, ElevenLabs, Google Maps, ULID, uv, etc.) —
useful context if the direction is revived.
