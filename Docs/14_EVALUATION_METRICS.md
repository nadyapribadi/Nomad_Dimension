# Evaluation Metrics

Status: **Drafted** (targets pending first end-to-end episode)

## 1. Purpose

Measure whether Nomad is producing consistent quality at controlled cost with
less manual effort. Metrics are computed from event data and the domain model,
per episode, and rolled up across episodes.

## 2. Metric Set

| Dimension | Metric | How it is measured |
| --- | --- | --- |
| Research accuracy | % of sampled claims correctly supported by authoritative sources | Sample N `ResearchClaim` rows per episode; human or Critic re-checks each against its sources |
| Unsupported claims | Unsupported factual-claim rate in the accepted script | Count script statements with no `ResearchClaim.id` link, or linked to `confidence in (low, contested)` and `important = true` |
| Story quality | Critic pass rate + human rating (hook, pacing, clarity, narrative logic) | `critic.pass` on first submission / total story submissions; human 1-5 rating at review |
| Visual quality | Human / Critic score for relevance, variety, organic feel | Critic visual rubric pass rate (`13_VISUAL_PHILOSOPHY.md`); human 1-5 at package review |
| Production completeness | % required assets correctly available and linked at package close | Approved shots with a linked approved `AssetVersion` / total shots |
| Rework efficiency | Average revision cycles per stage | Mean `StageState.revision_count` across the four stages |
| Cost efficiency | USD per completed episode; USD per finished minute | `Episode.spent_cents` / 100; divided by `target_length_sec / 60` |
| Token efficiency | Tokens per accepted deliverable | Sum of model-call tokens for a stage / 1 (accepted deliverable) |
| Provider efficiency | Quality/cost comparison by provider | Per provider: mean `cost_cents`, mean latency, Critic/human acceptance of its outputs |
| Safety | Policy violations, unauthorized actions, protected-asset incidents | Count of `policy.decision = DENY` caused by an agent attempting a blocked action; count of protected-asset approval triggers |
| Recovery | % of interrupted workflows successfully resumed | Episodes with a recovery event that reached `closed` / episodes that were interrupted |
| Coordination effort | Manual coordination time per episode | Human-logged, compared to a pre-Nomad baseline |

## 3. Targets

> **DECISION NEEDED:** set targets after the first full episode. Draft placeholders:

| Metric | Draft target |
| --- | --- |
| Research accuracy | >= 95% of sampled claims |
| Unsupported important claims | 0 |
| Story Critic first-pass rate | >= 50% |
| Rework cycles per stage | <= 2 |
| Production completeness | 100% at package close |
| Cost per finished minute | <= [X] USD |
| Recovery success | 100% |

## 4. Reporting

- Per-episode metrics snapshot is written into `EpisodeRetrospective.metrics_snapshot`
  at `episode.closed`.
- A rollup script aggregates across episodes for trend view.
<!-- TODO: scripts/metrics_report.py -->

## 5. Sampling for Accuracy Checks

- N claims sampled per episode for the research-accuracy metric.
  <!-- DECISION NEEDED: N (draft: 10 or all if fewer) -->
- Sampling is random over `important = true` claims first, then the rest.
- Re-check is done by the human or by a fresh Critic pass with source access.

## 6. Open Questions

- Cost ceiling per finished minute.
- Sample size N.
- Whether token efficiency is tracked per stage or per deliverable type.
- Baseline capture method for coordination effort (needs a few manual episodes
  logged for comparison, or a one-time estimate).
