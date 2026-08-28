# Glossary

Status: **Drafted**

**Approval** — A record that a manual-review trigger fired and the Creative
Director's decision (approve / deny / adjust) with rationale. Blocks the
triggering action until resolved.

**Asset** — A piece of media serving a shot or the episode: image, video, audio,
map, 3D render, design element, or edit package. Has a class, a protection level,
and one or more versions.

**AssetVersion** — One immutable revision of an asset. Backed by a single Google
Drive file. Carries provenance (source/provider, generation params) and licensing
metadata. Never overwritten in place.

**Budget** — Per-episode cost ceiling (`Episode.budget_cents`). Enforced by the
Policy Engine before expensive capability calls, alongside a per-call cap.

**Capability** — A typed interface for an external ability (`models`, `research`,
`image`, `video`, `audio`, `maps`, `three_d`, `storage`). Agents request
capabilities, not providers.

**Capability adapter / Provider adapter** — One implementation of a capability
interface for one provider. Selectable by config. Swappable without changing
agents, Hermes, workflow, or the content model.

**Channel** — The top of the content hierarchy. Holds brand notes and episodes.

**Creative Director** — The human. Sets episode goals and constraints, approves
at gates, holds final authority, does the final edit in DaVinci Resolve.

**Critic** — The independent quality agent. Reviews every stage deliverable and
returns PASS or a structured REWORK. Never edits, never approves its own output.

**DaVinci-ready package** — The final Nomad output: an ordered manifest plus the
current approved media, script with markers, narration, notes, and a licensing
list, laid out for import into DaVinci Resolve.

**Episode** — A single video project. Has a goal, constraints, budget, a
segment/scene/shot tree, stage states, approvals, events, and a retrospective.

**Event** — An append-only structured record of something that happened
(delegation, policy decision, capability call, state transition, etc.), linked to
an episode. The per-episode timeline is reconstructable from events.

**Feedback** — A record attached to a specific deliverable or asset version:
author (Critic or human), decision, and itemized notes with severity and owning
agent.

**Hermes** — The executive producer / manager agent. Plans, delegates to one
owning agent per stage, routes REWORK, enforces policy via the Policy Engine,
manages Workflow Core state, escalates.

**Knowledge** — Channel knowledge and lessons learned, stored as Markdown under
`knowledge/`. Explains things; is not config or the database.

**Manual-review trigger** — A defined condition (licensing uncertainty, weak
evidence for an important claim, budget overrun, protected-asset change,
conflicting external instructions, major creative-direction change, incomplete
package, ambiguous provider result, unidentifiable approved version, legal/
reputational risk) that stops the pipeline and escalates to the human.

**MCP** — Model Context Protocol. One way to connect tools. In Nomad, an MCP
server is just another provider adapter behind a capability interface; it does
not bypass the capability line or the Policy Engine.

**Nomad Dimension** — This system: a local-first, provider-agnostic, hierarchical
AI production system for a YouTube channel.

**Policy Engine** — Deterministic code (never an LLM) that authorizes or blocks
risky agent actions: permissions, budgets, protected resources, approval gates.
Fails closed.

**Production Agent** — The specialist that acquires or generates assets, versions
them with provenance and licensing, and assembles the DaVinci-ready package.

**Protection level** — On an asset: `none`, `source`, `approved`, or `licensed`.
Anything above `none` needs an approval for destructive operations.

**Provider** — An external vendor/service (OpenAI, Anthropic, Replicate, Runway,
ElevenLabs, Google Drive, ...). Reached only through a capability adapter.

**Provider-switch test** — The check that a vendor can be replaced by swapping
its adapter and config, with no change to Hermes, agents, workflow, or content
data.

**Research Agent** — The specialist that finds, compares, structures, and
qualifies evidence into research claims with sources and confidence ratings.

**ResearchClaim** — A single factual statement with its sources, confidence
rating, and an "important" flag. Script statements link to these.

**REWORK** — A Critic decision that a stage deliverable is not acceptable, with
itemized reasons, severities, and the owning agent. Routed by Hermes.

**Revision ceiling** — The number of REWORK cycles on one stage (draft: 3) after
which Critic escalates to the human and the episode is blocked.

**Scene** — A unit within a segment; contains shots.

**Segment** — A major division of an episode; contains scenes.

**Shot** — The smallest planned visual unit; has an intended medium, a rationale,
a duration estimate, and asset requirements.

**Stage** — One of `research`, `story`, `visual`, `production`. Each has a
`StageState` with status, owner, and revision count.

**Story Agent** — The specialist that turns an approved research package into
concept, structure, script, and pacing, linking every factual statement to a
research claim.

**Visual Agent** — The specialist that turns an approved script into scenes,
shots, and per-shot asset requirements, choosing the medium for each beat.

**Workflow Core** — The per-episode state machine. Owns "where are we" and "what
can happen next", transactional transitions, and recovery. Holds no creative
opinion.

**Workspace** — Local staging directory (`workspace/<episode-id>/`) for
in-progress artifacts before they are committed to SQLite or synced to Drive.
