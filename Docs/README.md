# Nomad Dimension Documentation

## Source of truth

The operating manual is in **Notion**: "📖 Nomad Dimension — System Documentation"
(page id `3499ba2b-3900-8087-8800-cd0db5f579f5`). It covers the channel model,
the 8-stage pipeline, the 8-database schema, model routing, status flow, naming
conventions, and the design decisions. Read it first.

## In this repo

- **[`AS_BUILT.md`](AS_BUILT.md)** — the code-side companion: identifiers used in
  `index.html`, the proxy contract, a function map, where the code diverges from
  the Notion spec, and the **forward plan** ("Direction & evolution plan").
- **[`../functions/README.md`](../functions/README.md)** — the proxy/API contract.

## `archive/`

**[`archive/`](archive/)** holds a shelved redesign (Python, local-first, SQLite,
autonomous agents, an independent Critic, a capability layer) plus the original
blueprint `.docx`. It was superseded by the Notion System Documentation as the
source of truth. Kept for its engineering thinking — **not a plan, not
maintained.**
