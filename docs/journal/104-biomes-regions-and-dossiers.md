# 104 — Regions on bodies and body dossiers

**Plan:** plans/104-biomes-regions-and-dossiers.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-18), three-agent team mode · **ADRs:** [0180](../decisions/0180-regions-on-bodies-regional-situations-and-dossiers.md) (new), [0099](../decisions/0099-science-matrix-data-samples-dossiers-and-tech-tree.md), [0178](../decisions/0178-science-situations-subjects-value-curve-states-credit.md) · **Research:** none

**Status when written: criteria met here, handed over as `ready/104`.**

## What was done

| Where | What |
| --- | --- |
| `packages/core/src/regions.ts` (new) | `regionAt` (biomes at the shader's warped coordinates, seeded cells, latitude bands), `regionsOf`, `regionMultiplier`, `cellPoints` |
| `packages/core/src/dossier.ts` (new) | `DossierEntryDefinition`, schema, facts, `dossierOf` |
| `packages/core` | body `regions` schema; situation `regional`; registry `dossierEntries`, `ctx.dossierEntries`, report kind `dossier-entry`; `parseSubjectId`; `VesselSnapshot.science.region`; `API_VERSION` 0.1.44 |
| `packages/sim/src/science.ts` | `regionUnder`; results in regional situations get the region and its multiplier; the snapshot's region |
| `mods/stock` | home biomes (desert, rock, snow ×1.5), moon cells (highlands, maria ×1.2, crater fields ×1.5), five situations regional, five dossier entries |
| `apps/web` | `BodyCard.svelte` in the Target panel when the target is a body; `targetDossier` in the HUD controller; science content in `loadContent` |
| tests | `packages/core/test/regions.test.ts` (3), `packages/sim/test/science.test.ts` (+2), `apps/web/src/lib/hud/BodyCard.test.ts` (1); stock boot list |
| docs | ADR 0180, draft 192, `simulation.md`, `plugin-system.md`, guide "Regions and dossiers" |

## Decisions and deviations

- **The home body's regions read the map where the ground shader does**: at the domain-warped latitude and longitude (ADR 0043). Without the warp, the region would be that of a point several kilometres away from the drawn one.
- **No save change.** Dossiers derive from `SimSave.science`, and older subjects stay `global`. The plan's Touches named save "dossiers"; ADR 0180 point 6 says why they are not saved.
- **The map overlay moved to draft 192.** It is shader work in the planet and moon materials, and the body card already answers "what is known here".
- **The body card's labels** are situation and experiment labels from the registries, lower-cased ("flying high or in space near").
- **Not checked in a browser here:** the browser pane on this machine has no WebGL 2, so the game does not start. The card is tested by server rendering (vitest).
- **`ship.science` for scripts has no region yet.** It is an additive field for a later plan, and the script API members test would need it listed.

## Follow-ups

- 192: the region overlay. 105: the tech tree. Resource data behind the hints entry. Regions in `ship.science`.

## Verification output

```text
VERIFY
```
