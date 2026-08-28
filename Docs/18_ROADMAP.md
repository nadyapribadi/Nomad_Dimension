# Roadmap

Status: **Scaffold**

Three horizons. Each is reached without rewriting the creative system — later
horizons are infrastructure migrations, not redesigns.

## v1 — Local Pipeline (current target)

Goal: one person can take an episode from goal to a DaVinci-ready package with
the Critic loop enforced and cost under control, on one machine.

- Domain model, Policy Engine, Workflow Core, six agents, Critic loop.
- One provider per required capability, including `maps` (geographic
  visualization is core to this channel).
- Asset registry + Google Drive, provenance and licensing metadata.
- Cost tracking per episode / provider.
- One full 3–5 minute episode produced and measured.

Corresponds to phases P0–P11 in `16_IMPLEMENTATION_PLAN.md`.

Exit: first episode shipped through the pipeline; metrics baseline set.

## v2 — Choice and Breadth

Goal: more than one option per capability, deeper visual toolkit, better cost
control through routing.

- Second (and further) providers per capability.
- Model/media routing by cost and measured quality.
- Deep 3D pipeline (terrain / building reconstruction); richer map styling and
  animated map sequences beyond the v1 basics.
- MCP servers added where they add real standardization.
- Provider quality/cost comparison reporting.
- Knowledge base retrieval improvements if episode volume needs it.

Trigger to start: v1 metrics show a specific cost or quality ceiling that a
second provider or routing would move.

## v3 — Scale

Goal: run more episodes concurrently and/or off a single machine, without
touching agents or the content model.

- SQLite → PostgreSQL (portable queries already required by `04_TRD.md`).
- Google Drive → object storage (all access already via `storage` capability).
- Long-running steps → job queue / workers (steps already emit start/complete
  events, hold no in-memory-only state).
- Optional hosted API front end.

Trigger to start: throughput or reliability limits on the local setup that
measurement confirms.

## Explicitly Not on the Roadmap

See `KNOWN_LIMITATIONS.md`. Notably: autonomous publishing, autonomous final
editing, agent swarms, mandatory single vendor, enterprise infra for its own
sake.

## Open Questions

- Which maps/geographic provider for v1 (Mapbox / MapTiler / Google Maps
  Static / other)?
- Does v2 need a lightweight review UI, or is the CLI + Drive still enough?
- What concrete metric thresholds move an item from "later" to "now"?
