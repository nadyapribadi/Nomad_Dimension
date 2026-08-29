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
    anthropic.yaml        # models (strong tier)
    gemini.yaml           # models (economical / fallback)
    tavily.yaml           # research
    replicate.yaml        # image + video
    elevenlabs.yaml       # audio
    google-maps.yaml      # maps (static API)
    drive.yaml            # storage
```

## 3. `nomad.yaml` (sketch)

```yaml
paths:
  workspace: ./workspace
  knowledge: ./knowledge
  sqlite: ./nomad.sqlite      # events live in an `events` table here (ADR-P006)

defaults:
  channel_id: null            # set on first run
  target_length_sec: 240

features:
  maps_enabled: true          # channel needs geographic visualization in v1
  three_d_enabled: false      # v2
  local_api: false            # CLI-only in v1 (ADR-P007)
```

## 4. `budgets.yaml` (sketch)

```yaml
episode_default_cents: 2500   # $25 default per episode (ADR-P009)
per_call_cap_cents: 300       # $3 — single generation above this needs approval (ADR-P009)
alert_at_fraction: 0.8        # warn at $20
```

## 5. `policy.yaml` (sketch)

```yaml
revision_ceiling: 3           # ADR-P010
approval_expiry_days: 7        # pending approvals older than this auto-deny with a re-request path
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
TAVILY_API_KEY=
REPLICATE_API_TOKEN=
ELEVENLABS_API_KEY=
GOOGLE_MAPS_API_KEY=
GOOGLE_DRIVE_CREDENTIALS_JSON=      # path to service-account JSON
# BRAVE_API_KEY=                     # if falling back from Tavily
```

## 9. Open Questions

- Whether `models.yaml` routing is per-task (as drafted) or per-agent. Current
  stance: per-task.
- Config precedence: env var override of YAML values — supported or not.
  Current stance: only secrets come from env; other values are YAML-only.
