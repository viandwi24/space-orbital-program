# 0011 — Core depends on `@orbital/kepler` for types only

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/003-core-world-registries-events.md

## Context

`boundaries.md` lets `core` import `@orbital/kepler` types "only if needed". The sim ↔ host `Snapshot` must carry `OrbitalElements`, and the renderer/UI may import only `core` (not `kepler`), so core's protocol types need that type. `Vec3` is the same plain `{x, y, z}` shape in both packages; defining a second one invites drift.

## Decision

`@orbital/core` lists `@orbital/kepler` as a `workspace:*` dependency and imports from it with `import type` only (erased at build; core has no runtime dependency on kepler). `Vec3` is re-exported from core (`export type { Vec3 }`), `OrbitalElements` is used in `VesselSnapshot.orbit`. `Quat` and `Transform` are defined in core. `@orbital/physics` therefore gets `Vec3` from `@orbital/core`, never from kepler.

## Alternatives considered

- **Duplicate `Vec3`/`OrbitalElements` in core** — structurally identical, so no type errors would catch divergence. Rejected.
- **Move the shared types into a new package** — more packages for two type aliases. Rejected for now.

## Consequences

- Any runtime (non-type) import of kepler from core violates this ADR; `grep -rn "from '@orbital/kepler'" packages/core/src` must only show `import type` / `export type`.
