# Changelog

Human-readable, updated per milestone. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## Unreleased

### Added

- Repo tooling: `package.json`, ESLint (flat) + Prettier, `.nvmrc`, GitHub
  Actions CI, git pre-commit hook (lint + format).
- `Docs/AS_BUILT.md` — code-side companion to the Notion System Documentation
  (identifiers, function map, code-vs-spec gaps, security notes).
- `CLAUDE.md` / `AGENTS.md` — agent rules file.
- `functions/README.md` — the proxy request/response contract.
- Stage 4 **Script Check** — deterministic QA over all sections (word count,
  Kai/Mia ratio, clichés, repeated phrasing, reused places); no API call.

### Changed

- Docs restructured: Notion "System Documentation" is the source of truth; the
  earlier Python/agent redesign moved to `Docs/archive/` (kept, not maintained).
- Netlify proxies now read keys from environment variables
  (`ANTHROPIC_API_KEY`, `GOOGLE_TTS_API_KEY`, `YOUTUBE_API_KEY`, `NOTION_TOKEN`),
  falling back to the request-body key while the env vars are configured.

### Security

- Wrapped transcript / outline / place list / brief in XML tags with a
  data-handling clause in the shared system prompt — external text is treated as
  data, not instructions.
- API keys rotated and moved toward Netlify environment variables (removing the
  plaintext keys from the Notion App Settings page).
