# Developer Setup

Status: **Scaffold**

## 1. Prerequisites

- Python [3.11+ — DECISION NEEDED]
- Git
- A Google account with Drive API access (service account or OAuth client)
- DaVinci Resolve installed (for validating package import)
- API keys for the providers you enable

## 2. Tooling

<!-- DECISION NEEDED: uv / poetry / pip-tools; ruff+mypy / pyright -->

```bash
git clone <repo>
cd NomadDimension
<install command>            # e.g. uv sync
cp .env.example .env         # fill in provider keys + Drive credentials
```

## 3. Repository Layout

See `01_BLUEPRINT.md` "Recommended Repository Layout". Key directories:

```text
src/nomad/core/          orchestration, workflow, state, events
src/nomad/agents/        hermes, research, story, visual, production, critic
src/nomad/capabilities/  typed interfaces per ability
src/nomad/providers/     provider adapters
src/nomad/models/        Pydantic domain models
src/nomad/api/           optional FastAPI (v1: likely absent)
prompts/                 versioned, modular agent prompts
knowledge/               Markdown channel knowledge + brand + retrospectives
workspace/               local per-episode staging (gitignored)
config/                  YAML config (no secrets)
tests/                   pytest
scripts/                 metrics rollup, maintenance
```

## 4. First-Run

```bash
<run> nomad db migrate            # create nomad.sqlite
<run> nomad channel init "<name>" # create the channel row
<run> nomad --help
```

## 5. Running an Episode (target UX)

```bash
nomad episode new --goal "<episode goal>" --length 240 --budget <cents>
nomad episode status <episode-id>
nomad approvals list
nomad approvals resolve <approval-id> --approve --note "<rationale>"
nomad episode export <episode-id>     # writes DaVinci-ready package
```

<!-- TODO: finalize CLI command surface (FRD-IFC-001) -->

## 6. Tests

```bash
<run> pytest                          # all
<run> pytest tests/policy             # deterministic, no network
<run> pytest tests/capabilities -m conformance
```

Model-touching tests use stubs/fixtures; policy and workflow tests are fully
deterministic (`23_TEST_STRATEGY.md`).

## 7. Secrets

- Only in `.env` (gitignored) or the shell environment.
- Config references them by name: `api_key_env: OPENAI_API_KEY`.
- Never paste a key into a prompt, a YAML file, a commit, or an issue.

## 8. AI-Assisted Development

Claude Code and Codex are used to build and maintain the repo. Hermes is the
runtime agent inside Nomad — not a dev tool. Keep module boundaries, schemas,
prompts, and tests clean enough that an assistant (or a new person) can navigate
the codebase from the docs.

## 9. Open Questions

- Python version floor.
- Dependency + lint/type toolchain.
- Drive auth method (service account vs OAuth).
- Whether there is a `nomad` console entrypoint in v1 or just `python -m nomad`.
