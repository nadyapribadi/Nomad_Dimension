# Nomad Dimension

**Odyssey of Discovery** — an AI-powered documentary production pipeline for YouTube.

Nomad Dimension is a local-first, provider-agnostic, hierarchical AI production system that supports pre-production, production, and post-production workflows for a documentary-style YouTube channel covering history, culture, travel, and geography.

## Architecture

The system follows a **6-stage pipeline**:

| Stage | Name | Description |
|-------|------|-------------|
| 0 | Settings | Notion connection, API keys, model config, Channel DNA |
| 1 | YouTube Browser | Browse source channels, discover inspiration videos |
| 2 | Episode Builder | Theme generation, episode creation, content calendar, gap analysis |
| 3 | Transcript | SRT upload, language detection, outline extraction, places review |
| 4 | Script Builder | Kai & Mia dialogue generation, section-by-section scripting |
| 5 | Audio TTS | Neural voice synthesis (Kai & Mia), full episode playback |
| 6 | Production Handoff | CapCut guide, Canva brief, thumbnail brief, YouTube metadata |

**Characters:** Kai (host, 55%) and Mia (co-host, 45%) — dual-presenter documentary format.

## Repository Structure

```
Nomad_Dimension/
├── index.html              # Single-page pipeline app (Netlify-deployed)
├── netlify.toml            # Netlify configuration
├── functions/              # Netlify serverless functions
│   ├── anthropic-proxy.js  # Claude API proxy
│   ├── notion-proxy.js     # Notion API proxy
│   ├── tts-proxy.js        # Text-to-speech proxy
│   └── youtube-proxy.js    # YouTube Data API proxy
└── Docs/                   # Architecture & planning documents
    ├── 00_PROJECT_CHARTER.md
    ├── 01_BLUEPRINT.md
    ├── 02_PRD.md
    ├── 05_ARCHITECTURE.md
    ├── 06_DATA_MODEL.md
    ├── 07_AGENT_SPECS.md
    ├── 16_IMPLEMENTATION_PLAN.md
    └── ... (29 documents total)
```

## Documentation

The `Docs/` folder contains the full architecture and planning documentation. Read in order:

1. **[Project Charter](Docs/00_PROJECT_CHARTER.md)** — Mission, principles, goals, success criteria
2. **[Blueprint](Docs/01_BLUEPRINT.md)** — Living executive decisions, layer model, guardrails
3. **[PRD](Docs/02_PRD.md)** — Personas, journeys, MVP scope, product requirements
4. **[Architecture](Docs/05_ARCHITECTURE.md)** — System structure, layers, flows, boundaries
5. **[Data Model](Docs/06_DATA_MODEL.md)** — Content hierarchy, SQLite schema, versioning
6. **[Agent Specs](Docs/07_AGENT_SPECS.md)** — The six agent job descriptions
7. **[Implementation Plan](Docs/16_IMPLEMENTATION_PLAN.md)** — Phased build plan with exit criteria

The frozen source of record is `Nomad_Dimension_Master_Architecture_and_Operating_Blueprint.docx`. When Markdown docs disagree with the `.docx`, the Markdown wins.

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS (single-page app)
- **Backend:** Netlify Functions (serverless)
- **Database:** Notion (cross-device state storage)
- **AI:** Anthropic Claude (Sonnet for extraction, Haiku for speed tasks)
- **TTS:** Google Cloud Neural Voices (en-US-Neural2-D for Kai, en-US-Neural2-F for Mia)
- **Video:** YouTube Data API v3

## Deployment

This app is deployed on Netlify. Push to `main` to deploy.

```bash
# Local development
npx netlify-cli dev
```

## License

Private — All rights reserved.
