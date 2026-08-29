# Archive — Shelved Redesign

**Superseded.** The source of truth is the Notion page "📖 Nomad Dimension —
System Documentation". The code-side view is [`../AS_BUILT.md`](../AS_BUILT.md).

These documents describe an **aspirational** design that was never built: Python,
local-first, SQLite, a Hermes orchestrator with five specialist agents, an
independent Critic quality gate, a provider-agnostic capability layer, and a
DaVinci Resolve handoff. They were extrapolated from the blueprint `.docx` (also
here) before the real system's shape was understood.

Kept for the engineering thinking — capability-layer design, the Critic concept,
risk register, test strategy — which may inform future work. **Not a plan, not
maintained.** Ideas worth carrying forward are listed in `../AS_BUILT.md` under
"Principles carried over".

## Contents

`00`–`24` are the numbered planning set (charter, PRD/FRD/TRD, architecture, data
model, agent specs, workflow, policy model, capability strategy, config, visual
philosophy, metrics, efficiency, implementation plan, checklist, roadmap, risks,
decisions, glossary, dev setup, test strategy, engineering standards). Plus
`KNOWN_LIMITATIONS.md`, `REQUIREMENTS_TRACEABILITY.md`, and the blueprint `.docx`.

`20_DECISIONS.md` records the provider/tooling choices made during that planning
(Anthropic+Gemini, Tavily, Replicate, ElevenLabs, Google Maps, ULID, uv, etc.) —
useful context if the direction is revived.
