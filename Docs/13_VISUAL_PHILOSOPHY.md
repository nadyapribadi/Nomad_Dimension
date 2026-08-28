# Visual Philosophy

Status: **Drafted**

## 1. Core Statement

Nomad optimizes for the **best visual expression of each story beat**, not for
maximum AI generation. AI generation is one tool among many, used when it adds
narrative value.

The channel spans history / explainer, commentary / culture, and travel / place.
Its natural visual base is **archival material, on-location footage, maps, and
information design** — AI reconstruction and animation fill gaps those cannot.
Maps and geographic visualization are a first-class capability (`10`), not a
decorative extra.

## 2. Principles

1. **Mix media deliberately.** Real footage, archival material, maps, typography,
   diagrams, photography, AI reconstruction, animation, 3D, and screen captures
   each have beats they serve best. A shot's medium is a decision, not a default.
2. **AI generation earns its place.** Use it when it adds narrative value —
   reconstructing something unfilmable, visualizing a concept, bridging a gap —
   not simply because it is available.
3. **Avoid the synthetic feel.** Long runs of AI-image sequences make the channel
   feel generated. Break them up; vary the medium; vary the composition.
4. **Maps and 3D are selective.** Use geographic mapping and 3D when spatial or
   structural explanation genuinely benefits. Not as decoration.
5. **Rhythm and variation.** Maintain visual rhythm across scenes and segments —
   vary shot length, medium, motion, and density so the episode breathes.

## 3. Per-Shot Requirement (Visual Agent)

For every `Shot`, the Visual Agent records:

- `intended_medium` — one of: `footage`, `archival`, `map`, `diagram`, `photo`,
  `ai_still`, `ai_clip`, `animation`, `three_d`, `screen_capture`
- `medium_rationale` — one or two sentences: why this medium serves this beat
- an asset requirement spec (subject, framing, motion, mood, references)

A shot with no rationale, or a rationale that reduces to "AI can do it", is a
Critic REWORK item.

## 4. Critic's Visual Rubric

Applied at the Visual stage and again on the Production package:

| Check | REWORK if |
| --- | --- |
| Relevance | A shot does not serve its script beat |
| Variety | More than [N] consecutive shots share one medium without reason |
| Repetition | Near-duplicate compositions / subjects recur |
| Artifacts | AI output has visible artifacts, wrong anatomy, text garble, uncanny faces |
| Pacing alignment | Shot durations fight the script's rhythm |
| Medium justification | `medium_rationale` missing or weak |
| Spatial payoff | A map/3D shot does not actually clarify space |
| Brand fit | Titles/lower-thirds/thumbnail diverge from channel brand notes |

<!-- DECISION NEEDED: N for consecutive same-medium run (draft: 3) -->

## 5. Interaction with Cost

Visual variety and cost discipline pull the same direction: reusing an approved
archival still or a diagram is cheaper **and** more organic than another AI
generation. Production checks the registry for reuse before generating
(`11_ASSET_AND_STORAGE.md` §6).

## 6. Brand Reference

Channel brand notes (voice, palette, typography, thumbnail style) live in
`knowledge/brand/` and are read by the Visual Agent and Critic.
<!-- TODO: create knowledge/brand/ structure -->

## 7. Open Questions

- The consecutive-same-medium threshold.
- Whether a fixed medium-mix target per episode (e.g. "no more than 40% AI-
  generated shots") is a hard policy rule or a Critic guideline. Recommend:
  Critic guideline first, promote to policy only if drift is measured.
