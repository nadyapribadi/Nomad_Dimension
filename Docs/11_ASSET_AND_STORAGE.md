# Asset and Storage

Status: **Scaffold**

## 1. Split of Responsibility

- **Google Drive** holds heavy binaries (images, video, audio, maps, 3D renders,
  edit packages).
- **SQLite** holds the pointers and metadata: IDs, relationships, versions,
  status, source/provider, generation params, and licensing.
- Access is always through the `storage` capability. No component depends on
  Drive-specific behavior (`10_CAPABILITY_AND_PROVIDER_STRATEGY.md`).

## 2. Asset Classes

| Class | Examples | System role |
| --- | --- | --- |
| `image` | Photography, archival stills, AI stills | Visual storytelling |
| `video` | Real footage, AI clips, animation | Motion storytelling |
| `audio` | Narration, music, ambience, SFX | Voice, emotion, continuity |
| `map` | Routes, geographic overlays, satellite/context views | Spatial explanation |
| `three_d` | Terrain, buildings, reconstructions | Spatial / structural explanation |
| `design` | Titles, lower thirds, diagrams, thumbnails | Brand and information design |
| `edit_package` | DaVinci project / media organization | Final human editing |

## 3. Drive Folder Layout

<!-- DECISION NEEDED: confirm structure and naming -->

```text
NomadDimension/
  <channel>/
    episodes/
      <episode-id>--<slug>/
        images/
        video/
        audio/
        maps/
        three_d/
        design/
        package/            # the DaVinci-ready export
        _sources/           # protected source / archival / licensed originals
```

Each uploaded file's Drive `file_id` and `checksum` are stored on the
`AssetVersion` row.

## 4. Versioning Rules

- A revision creates a new `AssetVersion` (`version_no += 1`) with its own Drive
  file. The prior version's file is retained.
- `Asset.current_version_id` points at the active version.
- No in-place overwrite of a Drive file that backs an existing version.
- Deleting a version requires an approval (`09_POLICY_AND_SAFETY_MODEL.md` §6).

## 5. Provenance and Licensing Metadata

Stored on `AssetVersion` (`06_DATA_MODEL.md`):

- `source_provider` — adapter name, `manual`, or `archival:<source>`
- `generation_params` — prompt, model, seed, settings; or acquisition details
- `license` — `{type, holder, url, expiry, usage_constraints}`
- `checksum`, `cost_cents`, `created_by`

Rules:

- No asset enters an `approved` package with `license` empty or `type = unknown`
  — that triggers manual review (trigger 1).
- Licensed assets with an `expiry` are surfaced in the package manifest.

## 6. Reuse Before Regeneration

Before generating, Production queries the registry for an `approved` asset whose
`asset_class` + `role` + requirement spec match. On a match, it links the
existing asset instead of spending a generation. Reuse rate is a tracked metric.

## 7. DaVinci-Ready Package

<!-- DECISION NEEDED: exact package layout DaVinci import expects; confirm with a real import test -->

The `package/` folder contains:

- `manifest.json` — ordered list of segments -> scenes -> shots, each with its
  asset file references, durations, and script spans
- media subfolders mirroring §3, containing only the **current approved**
  versions
- `script.md` — final script with timecodes / shot markers
- `narration/` — VO audio aligned to shots
- `notes.md` — pacing notes, music intent, anything the editor needs
- `licensing.csv` — every asset in the package with its license summary and any
  expiry

The package is staged locally under `workspace/<episode-id>/package/` then synced
to Drive on `episode.package.exported`.

## 8. Integrity

- `checksum` verified on upload and before package export.
- Orphaned assets (no shot, no episode-level role, no approved status) are
  reported, not auto-deleted.
<!-- TODO: checksum algorithm (sha256), orphan report tooling -->

## 9. Open Questions

- Drive folder naming and depth.
- Whether `_sources` originals are copied into Nomad's Drive tree or referenced
  in place.
- Package manifest schema — needs validation against an actual DaVinci Resolve
  import workflow.
- Retention: do old non-current versions ever get archived/pruned, and by what
  rule.
