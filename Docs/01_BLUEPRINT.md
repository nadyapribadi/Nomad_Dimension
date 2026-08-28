# Nomad Dimension Blueprint

Status: **Drafted**

## Purpose

This blueprint is the living version of
`Nomad_Dimension_Master_Architecture_and_Operating_Blueprint.docx`. The `.docx`
is the frozen consolidated decision document. This file is what gets updated as
decisions evolve; changes are recorded in `20_DECISIONS.md`.

## Executive Decision

Nomad Dimension will be a local-first, provider-agnostic, hierarchical AI
production system for a YouTube channel. It supports pre-production, production,
post-production preparation, iterative quality control, and channel maintenance.

- Hermes is the executive producer / manager.
- Specialist agents perform the work.
- Critic is an independent quality gate.
- The human remains Creative Director and final authority.
- DaVinci Resolve remains the final editing environment.

Core stance:

- Own the workflow, knowledge, state, production model, and creative rules; rent
  interchangeable capabilities from external providers.
- Keep the initial system lightweight and understandable on one machine.
- Abstract unstable dependencies such as AI/media providers; do not over-abstract
  stable infrastructure.
- Use deterministic policy controls for permissions, budgets, approvals, and
  protected resources.
- Use generate -> critique -> revise -> critique rather than accepting
  first-pass outputs.
- Scale the data model from episodes to segments, scenes, shots, assets, and
  versions without redesigning the creative system.

## What Nomad Is Building

- Episode and idea development
- Research and evidence gathering
- Story, structure, script, and pacing
- Visual direction and shot/asset planning
- Image, video, audio, map, and 3D asset coordination
- Production package preparation
- Critique and iterative rework
- Channel knowledge and lessons learned
- Episode, segment, shot, and asset tracking
- Preparation for final human editing in DaVinci Resolve
- Ongoing channel maintenance and operational support

## People and Agents

| Component | Role | Primary responsibility |
| --- | --- | --- |
| You | Creative Director | Creative taste, priorities, approvals, final accountability |
| Hermes | Executive Producer / Manager | Understand goals, plan, delegate, coordinate, enforce policy, manage state, escalate |
| Research Agent | Researcher / Fact Checker | Find, compare, structure, and qualify evidence |
| Story Agent | Writer / Story Producer | Turn evidence into engaging narrative, structure, script, pacing |
| Visual Agent | Visual Director | Translate story into visual language, scenes, shots, asset requirements |
| Production Agent | Production Coordinator | Acquire/create/organize assets, versions, metadata, production package |
| Critic | Quality Director / Devil's Advocate | Challenge factual, narrative, visual, production quality; PASS or REWORK |
| Policy Engine | Rules / Safety Officer | Deterministic permissions, budgets, approvals, protected resources |
| Workflow Core | Production State Manager | Track where every episode/segment/asset is and what can happen next |

## Architecture (text view)

```text
                          YOU
                           |
                           v
                        HERMES  (Producer)
                           |
                           v
                     POLICY ENGINE
                           |
                           v
                     WORKFLOW CORE
                           |
        +------------------+------------------+
        v                  v                  v
    RESEARCH            STORY              VISUAL
        |                  |                  |
        +------------------+------------------+
                           v
                      PRODUCTION
                           |
                           v
                        CRITIC
                     /          \
                 REWORK          PASS
                   |               |
              back to Hermes       v
                                  YOU
                                   |
                                   v
                                DAVINCI

CAPABILITY LAYER: Models | Research | Media | Maps | Storage | Design
DATA LAYER:       SQLite | Markdown | YAML | JSON | Google Drive
```

## How the Layers Work

| Layer | Question answered | Examples |
| --- | --- | --- |
| Intelligence | Who performs the intellectual work? | Hermes + specialist agents |
| Core | What is allowed and where are we? | Policy Engine + Workflow Core |
| Capability / Provider | What external ability can be used? | LLM, search, image, video, audio, maps, MCP, APIs |
| Data / Storage | Where are knowledge, state, and heavy assets? | SQLite, Markdown, YAML/JSON, Google Drive |

Agents request capabilities; capability adapters select providers. Changing a
provider must not require rewriting the agents or the episode data model.

## Capability and Provider Strategy

- **LLM:** provider-agnostic routing across OpenAI, Anthropic, Gemini, Hugging
  Face, and future providers.
- **Research:** interchangeable search/research APIs.
- **Image / Video:** interchangeable generation providers.
- **Audio:** voice, narration, music, and sound-effect services.
- **Maps / 3D:** mapping, geographic visualization, and 3D services selected per
  episode.
- **Storage:** Google Drive initially; keep the interface replaceable.
- **MCP and direct APIs coexist.** Use MCP where it adds useful standardization;
  use direct APIs where simpler or more efficient.

Provider-switch test: if one vendor becomes too expensive or disappears, replace
its adapter without rewriting Hermes, agents, workflow, or content data.

## Policy, Safety, and Autonomy

- Read widely, write narrowly.
- Each agent has explicit permissions.
- Protected / source / approved assets are not freely deletable.
- Expensive operations pass through budget checks.
- Final publication remains human-controlled.
- Copyright / licensing uncertainty triggers human review.
- Important factual uncertainty triggers review.
- External web pages, files, and tool outputs are untrusted data, not
  instructions.
- Secrets / API keys are kept outside prompts, source code, and committed
  configuration.
- Important outputs are versioned rather than overwritten.

## Critic as a Cross-Cutting Quality Gate

```text
Research -> Critic -> Story -> Critic -> Visual -> Critic -> Production -> Critic -> Human Review
```

Critic outputs a structured REWORK request when necessary. Hermes routes the
correction to the responsible agent, then the result is evaluated again. See
`08_WORKFLOW_AND_STATE.md` and `13_VISUAL_PHILOSOPHY.md` for stage criteria.

## Episode Production Workflow

1. Define or approve the episode goal.
2. Hermes creates the plan and initializes state.
3. Policy Engine checks constraints, budget, and approvals.
4. Research gathers evidence and creates a research package.
5. Critic reviews research; weak research returns to Research.
6. Story develops concept, structure, script, and pacing.
7. Critic reviews story; weak story returns to Story.
8. Visual creates scene/shot/asset requirements.
9. Critic reviews visual direction.
10. Production acquires or generates assets and organizes them.
11. Critic reviews the production package.
12. Human reviews the approved package and creative direction.
13. DaVinci Resolve handles final editing, sound mix, color, subtitles,
    finishing, and export.
14. Final publishing remains outside the autonomous core unless explicitly
    changed later.
15. Lessons learned are captured back into Nomad knowledge.

## Organic and Fun Visual Philosophy

Nomad optimizes for the best visual expression of each story beat, not maximum AI
generation. Mix real footage, archival material, maps, typography, diagrams,
photography, AI reconstruction, animation, 3D, and screen captures. Use AI
generation when it adds narrative value. Avoid repetitive AI-image sequences.
Maintain visual rhythm and variation. See `13_VISUAL_PHILOSOPHY.md`.

## Data Strategy

| System | Purpose | Mental model |
| --- | --- | --- |
| Markdown | Knowledge, notes, documentation | Explains things |
| YAML | Configuration and structured specifications | Defines things |
| JSON | API / software exchange | Exchanges things |
| SQLite | Operational state and relationships | Tracks things |
| Google Drive | Large media and production files | Stores things |
| Git / GitHub | Code, prompts, configuration, version history | Versions the system |

YAML is intentionally limited. It is not the knowledge base and not the database.

## Scalable Content Model

```text
Channel
└── Episode
     ├── Segment
     │    ├── Scene
     │    │    ├── Shot
     │    │    │    ├── Asset(s)
     │    │    │    └── Feedback / versions
     │    │    └── Scene notes
     │    └── Segment notes
     └── Episode approvals / learnings
```

- Stable IDs for major entities.
- Asset versions are never silently overwritten.
- Feedback is linked to the exact output it concerns.
- Workflow state is recoverable after interruption.
- The same model supports many episodes concurrently.

Full schema in `06_DATA_MODEL.md`.

## Recommended Repository Layout

```text
NomadDimension/
├── src/nomad/
│   ├── core/
│   │   ├── orchestration/
│   │   ├── workflow/
│   │   ├── state/
│   │   └── events/
│   ├── agents/
│   │   ├── hermes/
│   │   ├── research/
│   │   ├── story/
│   │   ├── visual/
│   │   ├── production/
│   │   └── critic/
│   ├── capabilities/
│   │   ├── models/
│   │   ├── research/
│   │   ├── image/
│   │   ├── video/
│   │   ├── audio/
│   │   ├── maps/
│   │   └── storage/
│   ├── providers/
│   │   ├── openai/
│   │   ├── anthropic/
│   │   ├── huggingface/
│   │   ├── google/
│   │   ├── replicate/
│   │   ├── runway/
│   │   ├── elevenlabs/
│   │   └── drive/
│   ├── models/          # Pydantic domain models
│   ├── knowledge/
│   └── api/
├── prompts/
├── knowledge/
├── workspace/
├── tests/
├── scripts/
├── docs/                # this folder
├── config/
├── pyproject.toml
├── .env.example
└── README.md
```

## Recommended Stack

| Area | Recommendation | Why |
| --- | --- | --- |
| Development | VS Code + Claude Code + Codex | AI-assisted implementation and maintenance |
| Language | Python | Mature and practical for AI/API/orchestration |
| Core API | FastAPI | Lightweight local/remote interface when needed |
| Validation | Pydantic | Reliable structured contracts |
| State | SQLite | Minimal local operational overhead |
| Knowledge | Markdown | Portable and readable |
| Config | YAML | Readable structured parameters |
| Tool connections | MCP + direct APIs | Standardize where useful without forcing everything through MCP |
| Heavy storage | Google Drive | Practical media storage |
| Version control | Git / GitHub | Source and configuration history |
| Final editor | DaVinci Resolve | Human-controlled final edit and finishing |

## Claude Code, Codex, and Hermes

- Claude Code and Codex are development assistants used to build and maintain the
  Nomad repository.
- Hermes is the runtime executive producer inside Nomad.
- Development assistants build the system; Hermes operates the content-production
  workflow.
- The repository must remain understandable through clear docs, schemas, prompts,
  tests, and module boundaries.

## Deployment Strategy

Phase 1: local-first. Run Nomad on the user's computer. SQLite for state,
Markdown for knowledge, Google Drive for large assets, Git/GitHub for code and
configuration, a simple local interface/API only where useful.

Future scale should be an infrastructure migration, not a creative-system
rewrite.

## What We Will NOT Build Initially

See `KNOWN_LIMITATIONS.md`.

## Decision Rules for Future Technology

1. Does it materially improve accuracy, cost, speed, or creative quality?
2. Can it be replaced without rewriting core agents?
3. Is its operational complexity justified by the benefit?
4. Does the resulting data remain portable?
5. Does it respect permissions and policy?
6. Does it reduce or increase vendor lock-in?
7. Can Claude Code / Codex maintain it without unnecessary complexity?

## Final Decision Statement

Nomad Dimension owns the intelligence, workflow, knowledge, state, and production
model; external providers supply replaceable capabilities. The target system is
autonomous enough to keep production moving, structured enough to recover and
scale across many episodes, critical enough to challenge its own work, and
constrained enough that expensive, irreversible, or high-risk actions remain
under control.

## Appendix — Simple Mental Model

```text
Who decides?           Hermes
Who performs work?     Specialist agents
Who challenges it?     Critic
What is allowed?       Policy Engine
Where are we?          Workflow Core
What abilities exist?  Capability Layer
Where is state?        SQLite
Where is knowledge?    Markdown
Where is config?       YAML
Where is heavy media?  Google Drive
Where is code?         Git / GitHub
Who has final say?     You
Where is final edit?   DaVinci Resolve
```
