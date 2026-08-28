# Configuration Reference

Status: **Scaffold**

## 1. Rules

- Configuration is YAML under `config/`. It **defines** things (parameters,
  provider selection, budgets, gates). It is not the knowledge base and not the
  database.
- Secrets are referenced by environment variable name (`${OPENAI_API_KEY}`),
  never by value. `.env` holds the values and is gitignored.
- Config is validated on load against a Pydantic settings model; an invalid
  config fails startup with a clear message.

## 2. Files

```text
config/
  nomad.yaml              # top-level: paths, defaults, feature flags
  budgets.yaml            # per-episode default budget, per-call cap
  policy.yaml             # approval gates, protection rules, revision ceiling
  models.yaml             # model routing (task -> provider/model)
  providers/
    openai.yaml
    anthropic.yaml
    drive.yaml
    <capability>-<provider>.yaml
```

## 3. `nomad.yaml` (sketch)

```yaml
paths:
  workspace: ./workspace
  knowledge: ./knowledge
  sqlite: ./nomad.sqlite
  events: ./events            # or "sqlite" to use a table

defaults:
  channel_id: null            # set on first run
  target_length_sec: 240

features:
  maps_enabled: true          # channel needs geographic visualization in v1
  three_d_enabled: false      # v2
  local_api: false            # DECISION NEEDED: FastAPI in v1? (recommend CLI-only)
```

## 4. `budgets.yaml` (sketch)

```yaml
episode_default_cents: 0      # DECISION NEEDED
per_call_cap_cents: 0         # DECISION NEEDED
alert_at_fraction: 0.8
```

## 5. `policy.yaml` (sketch)

```yaml
revision_ceiling: 3           # DECISION NEEDED (matches 08_WORKFLOW_AND_STATE.md)
approval_expiry_days: 7       # DECISION NEEDED
protected_levels_requiring_approval: [source, approved, licensed]
require_license_for_package: true
deny_publish: true
```

## 6. `models.yaml` (sketch)

```yaml
routing:
  plan:        { provider: anthropic, model: <strong> }   # DECISION NEEDED: exact model id
  write:       { provider: anthropic, model: <strong> }
  review:      { provider: anthropic, model: <strong> }   # Critic
  synthesize:  { provider: gemini,    model: <mid> }
  classify:    { provider: gemini,    model: <economical> }
fallback:
  provider: gemini
  model: <economical>
```

Model ids are left as placeholders — set them against current model availability
when P7 starts.

## 7. `providers/<name>.yaml` (sketch)

```yaml
capability: image
adapter: nomad.providers.replicate.ImageAdapter
api_key_env: REPLICATE_API_TOKEN
base_url: https://api.replicate.com/v1
defaults:
  aspect_ratio: "16:9"
timeouts:
  connect_sec: 10
  read_sec: 120
```

## 8. Environment (`.env.example`)

```text
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
GOOGLE_DRIVE_CREDENTIALS_JSON=
ELEVENLABS_API_KEY=
REPLICATE_API_TOKEN=
RUNWAY_API_KEY=
MAPS_API_KEY=
RESEARCH_API_KEY=
# ... one per configured provider
```

## 9. Open Questions

- Budget and cap values.
- Events store: files vs. SQLite table (`04_TRD.md` TRD-061).
- Whether `models.yaml` routing is per-task (above) or per-agent.
- Config precedence: env var override of YAML values — supported or not.
