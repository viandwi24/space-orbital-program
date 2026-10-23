# 382 — Small-body terrain and body names on the map

**Plan:** [plans/382-small-body-terrain-and-map-body-labels.md](../plans/382-small-body-terrain-and-map-body-labels.md) · **Session:** small-bodies session (Claude) · **Date:** 2026-10-23 · **ADR:** 0319

## What was done

- **`terrain.small`** on a craters body (API 0.1.114). Core: `SMALL_SHAPE` and `moonHeight(n, radius, seed, small)`: no plain, crater cells as shares of the radius, two octaves of lumps, level 0.24 R, heights clamped to `[0, 0.6 R]` (the field's `maxHeight`). Mote, Flick and Vagrant set it.
- **Renderers:** GLSL reads `uSmall` (a `mix` and one `if`, so no new program); TSL builds the small graph when the pass is small (the radius and seed are already inlined there). `MoonPass.groundHeight` is core's function.
- **Sim:** only the field changes. `terrain-kind.test.ts` stands a lander on a 9 km seeded rock.
- **Map names:** `map/body-labels.ts` (pure), `BodyLabels.svelte`, `FrameData.bodyLabels`. Names are placed under the discs, biggest body first, and skipped when they would overlap. The Labels filter hides them. A station's name needs its body's disc to be 40 px or more in radius, so the Space Center is named near Home and not in the system overview.

## Surprises

- `project` reports a body's centre as hidden (it is inside its own sphere). The first version hid every label. A point just outside the sphere is used instead, and a body counts as hidden only when both of two such points are.
- Lump amplitude 0.1 R was too subtle (heights spread by about 6 percent of the radius): 0.16 R and a base of 0.24 R give a clearly irregular outline. Measured worst slope 0.46 (limit in the test: 1).

## Evidence

- Core, renderer and sim unit tests, `apps/web` vitest for labels and the station gate.
- Screenshots (`apps/web/scripts/capture-stock-system.ts`, WebGPU and WebGL): `docs/journal/assets/small-before` and `small-after` (Mote, Flick, Vagrant), `docs/journal/assets/labels-after` (system and inner overview; the system shots in `small-before` are the "before" of the map). The overview names 5 of the 15 bodies at its default zoom (Sun, Home, Ochre, Tempest, Glim) and the inner overview adds Kiln and Vesper; the rest appear on zooming.

## Open

- The overview names few bodies at its default scale; a leader line or a list is a later idea.
- GPU readback of the small field against core (as for the moon's plain) is not done; the agreement is by the shared constants test and the screenshots.
