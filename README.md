# Nomad Dimension

**Odyssey of Discovery** — an AI-powered documentary production pipeline for YouTube.

Nomad Dimension is a web app that walks one operator through producing a documentary-style YouTube episode — from inspiration browsing to a production handoff — with Claude assisting at each step and Notion as the cross-device state store. The channel covers history, culture, travel, and geography.

## Architecture

The system follows a **6-stage pipeline**:

| Stage | Name               | Description                                                        |
| ----- | ------------------ | ------------------------------------------------------------------ |
| 0     | Settings           | Notion connection, API keys, model config, Channel DNA             |
| 1     | YouTube Browser    | Browse source channels, discover inspiration videos                |
| 2     | Episode Builder    | Theme generation, episode creation, content calendar, gap analysis |
| 3     | Transcript         | SRT upload, language detection, outline extraction, places review  |
| 4     | Script Builder     | Kai & Mia dialogue generation, section-by-section scripting        |
| 5     | Audio TTS          | Neural voice synthesis (Kai & Mia), full episode playback          |
| 6     | Production Handoff | CapCut guide, Canva brief, thumbnail brief, YouTube metadata       |

**Characters:** Kai (host, 55%) and Mia (co-host, 45%) — dual-presenter documentary format.

## Repository Structure

```
Nomad_Dimension/
├── index.html                # Single-page pipeline app (Netlify-deployed)
├── netlify.toml              # Netlify configuration
├── package.json              # tooling: eslint, prettier
├── eslint.config.js
├── functions/                # Netlify serverless functions (provider proxies)
│   ├── README.md             # the proxy request/response contract
│   ├── anthropic-proxy.js
│   ├── notion-proxy.js
│   ├── tts-proxy.js
│   └── youtube-proxy.js
└── Docs/
    ├── AS_BUILT.md           # ← how the current system actually works
    ├── README.md
    └── target-architecture/  # aspirational future design (not built)
```

## Documentation

- **[`Docs/AS_BUILT.md`](Docs/AS_BUILT.md)** — how the deployed system works:
  stages, Notion databases, the four proxies, known gaps. **Start here.**
- **[`functions/README.md`](functions/README.md)** — the proxy/API contract.
- **[`Docs/target-architecture/`](Docs/target-architecture/)** — a much more
  ambitious design (Python, local-first, autonomous agents, an independent
  Critic). **Not built**; kept as reference for a possible future version.

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS (single-page app)
- **Backend:** Netlify Functions (serverless)
- **Database:** Notion (cross-device state storage)
- **AI:** Anthropic Claude (Sonnet for extraction, Haiku for speed tasks)
- **TTS:** Google Cloud Neural Voices (en-US-Neural2-D for Kai, en-US-Neural2-F for Mia)
- **Video:** YouTube Data API v3

## Development

```bash
npm install        # also wires the pre-commit hook (lint + format)
npm run dev         # netlify dev — local server + functions
npm run check       # eslint + prettier --check (what CI runs)
npm run format      # apply prettier
```

Node 22 (`.nvmrc`). CI runs `npm run check` on every push and PR.

## Deployment

Deployed on Netlify; push to `main` to deploy.

## License

Private — All rights reserved.
