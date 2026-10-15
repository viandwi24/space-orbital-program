# Versioning

- **Packages** are `0.0.0` and private until a release plan exists; the workspace is the version boundary for now.
- **Mod API** (`API_VERSION` in `@orbital/core`, re-exported by the SDK) follows semver independently of package versions. Plugins declare `meta.api: "^0.1"`; the loader refuses mismatches.
  - Breaking change to any `define*` signature, `PluginContext`, registry semantics, or snapshot/command protocol → bump minor while `0.x`, major after `1.0`. Requires an ADR.
  - Additive changes → patch while `0.x`.
- **Design/save formats** (vessel design JSON, later flight saves) carry a `formatVersion` field from their first version; migrations live in `core`.
- **Docs**: ADRs and plans are numbered, never renumbered; the number is the stable reference.
