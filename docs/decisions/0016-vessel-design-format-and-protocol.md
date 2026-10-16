# 0016 — Vessel design format and protocol additions

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/007-sim-loop-flight-onrails.md

## Context

Plan 003 shipped a provisional `VesselDesign` (`formatVersion: 1`, flat list of parts with parent links) and left the real format to plans 006/007. Plan 007's draft text described a tree (`{ root: PartInstance }`) plus `stages: PartInstanceId[][]`. The VAB (plan 009) saves and loads this format, so it must be stable and validated. `Command` had no runtime schema ("validate at the sim boundary") and no way to place a vessel anywhere but the pad; tests and the UI need orbit placements.

## Decision

- **Flat list, not a nested tree.** `VesselDesign = { formatVersion: 1, name, parts: [{ index, part, parent: { index, parentNode, node } | null }], stages: number[][] }`. `index` is a per-design id that survives edits (removing a part does not renumber), `stages[k]` lists the indices whose `onStage` runs for the k-th `stage` command. A flat list needs no nested edits in the VAB, makes stage references trivial, and encodes exactly the same tree. This differs from the draft's nested wording; nothing had produced either shape.
- **`formatVersion` stays 1.** No code or save ever emitted the provisional shape, so the first real format is version 1 (the old doc comment said to bump on change; this ADR records why it does not). Future changes bump it and migrate in core.
- **Validation lives in core**: `vesselDesignSchema` (zod, shape) and `resolveVesselDesign(design, partLookup)` (semantics: one root, unique indices, registered parts, resolvable parents, existing nodes used once, anti-parallel node directions, connectivity, stage references) which also returns the part origins computed from node positions. The VAB and the sim call the same function. Only stack attachments (node directions opposite) are supported; relative part rotation is identity, so every part shares the vessel's axes.
- **Commands are validated by `commandSchema`** (zod, in core) in `Sim.dispatch`; failures return `{ ok: false, reason }`, never throw. `CommandResult` is `{ ok: true; vessel? } | { ok: false; reason }`.
- **`load-vessel` gains an optional `placement`**: `{ kind: 'surface', body?, latitude?, longitude? }` (default: root body, 0, 0; stands on the pad, co-rotating) or `{ kind: 'state', body?, position, velocity, orientation? }` (centre of mass state in BCI; created on rails when the orbit is stable).
- Snapshot frames are pinned in `protocol.ts`: `PartSnapshot.position` is the part origin minus the root origin in BCI axes (already rotated), `orientation` is absolute (what the renderer applies today).

## Alternatives considered

- **Nested tree** — the draft's wording; harder to edit and to reference parts from stages. Rejected.
- **Bump to `formatVersion: 2`** — only noise, since version 1 never existed outside a type.
- **Hand-written command guards in the sim** — duplicates what zod does for the rest of the repo and cannot be shared with a Worker host.
- **`sim`-local design validation** — the VAB would have to import the whole sim (kepler, physics) to validate.

## Consequences

- `docs/architecture/simulation.md` documents the format; plan 009 builds the VAB output with it and may call `resolveVesselDesign` for live validation.
- Radial attachments, part rotation and symmetry need a new format version or additive node semantics; not planned.
