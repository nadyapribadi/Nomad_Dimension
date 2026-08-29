# Nomad Dimension Documentation

## Current system

**[`AS_BUILT.md`](AS_BUILT.md)** — the system that exists and is deployed: a
JS/Netlify single-page app with Notion state, an 8-stage operator-driven wizard,
Kai/Mia dual-host format, Google TTS, and a CapCut/Canva handoff. Start here.

The proxy/API contract lives in [`../functions/README.md`](../functions/README.md).

## Target architecture (not built)

**[`target-architecture/`](target-architecture/)** — an aspirational design
(Python, local-first, SQLite, six autonomous agents, an independent Critic,
DaVinci handoff) extrapolated from
`target-architecture/Nomad_Dimension_Master_Architecture_and_Operating_Blueprint.docx`.

It is **reference for a possible future version**, not a plan, and is not kept in
sync with the code. Whether that direction is ever pursued is an open question —
see `AS_BUILT.md` §9. Each file carries a one-line banner to that effect.

## Rule

When `target-architecture/` disagrees with `AS_BUILT.md`, `AS_BUILT.md` wins for
"what is".
