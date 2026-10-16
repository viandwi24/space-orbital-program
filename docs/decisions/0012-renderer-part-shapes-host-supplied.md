# 0012 — The renderer gets part shapes from the host, not from definitions

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/008-renderer-floating-origin.md

## Context

The renderer draws placeholder meshes (box/cylinder) per part, so it needs part dimensions. `PartDefinition` in `@orbital/core` has no size field today (`id`, `title`, `mass`, `mesh?`, `attach?`, `modules?`, `stagingIcon?`), plan 005 may extend definitions concurrently, and the renderer may import only `core` and `three` (boundaries.md); it must not read the registry or `sim`.

## Decision

`@orbital/renderer` defines its own small input type, `PartShape` (`{ kind: 'box'; size } | { kind: 'cylinder'; radius; height }`), and takes `partShapes: ReadonlyMap<string, PartShape>` keyed by part definition id (the value of `PartSnapshot.definition`). Body radii come as `Pick<BodyDefinition, 'id' | 'radius'>[]`, which exists in core. The host (`apps/web`, plan 009) builds both from the loaded registries. Unknown part ids render as a 1 m box so a missing shape never breaks a frame.

## Alternatives considered

- **Add `shape`/`size` to `PartDefinition` in core now** — plan 005/006 own that schema and run concurrently; changing it from the renderer plan would collide. The host mapping can be replaced by a definition field later without touching renderer internals.
- **Derive size from `mass`/`mesh`** — guessing. Rejected.

## Consequences

- Plan 006/009 must provide the shapes (stock parts need dimensions somewhere; a `shape` field on the part definition is the likely home, via a new ADR when plan 005/006 add it).
- When real art arrives, `PartShape` gains a `{ kind: 'mesh', url }` variant (GLTF) without breaking callers.
