---
id: 033
title: "Part follow-ups 2: asset provider, smoke, debris, plasma, device tuning, aero and radial extras"
status: done
owner: "control session (Claude, 2026-10-17)"
depends: [026, 029]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 033 — Part follow-ups 2

## Goal

Normal rockets fly with stock parts and the parts and effects reach the bar of `product/visual-direction.md`: engines gimbal (a finned 25 t rocket with ONE reaction wheel pitches over and reaches orbit), fins damp, a control surface part exists, smoke is lit and drifts, the plume lights the ground, debris breaks into pieces of the real part, the plasma changes colour with speed, and a glTF asset can replace any procedural part. Pushed with reasons: see "Pushed out".

## Context

- Read: `docs/journal/026-part-visual-follow-ups.md` (self-review, "Not done"), journal 029 (instancing and the stability read-out landed there), ADRs 0015, 0018, 0023, 0025, 0028, 0033, 0034, 0035; new: [0045](../decisions/0045-engine-gimbal-and-control-mixing.md), [0046](../decisions/0046-fin-damping.md), [0047](../decisions/0047-asset-provider-and-effect-techniques.md); research `docs/research/gimbal-damping-and-effects.md`, `fin-aerodynamics.md`.
- Concurrency: plan 032 owns `packages/scripting`, the web script files, `telemetry.ts`, `routes/flight`, `routes/+layout`; plan 039 cuts the frame budget, so this plan adds no cost to the pad scene (frame table in the journal).

## Scope

**In:**
1. Engine gimbal and the attitude mixer (ADR 0045); API 0.1.10 (`centreOfMass`, `torqueDemand`, `PartVisual.articulation`).
2. Fin damping (ADR 0046).
3. Control surface: module and stock part, generator with a moving flap.
4. Gimbal shown on the engine bell (articulated geometry and plume).
5. Asset provider `GltfPartProvider` with procedural fallback (ADR 0047).
6. Smoke and dust: lit, wind drift, terrain-dependent colour, water spray, plume ground light.
7. Debris shards from the real part geometry.
8. Plasma ionisation colours with speed.
9. Documentation: guide, simulation.md, journal with screenshots, self-review.

**Pushed out** (draft 040 for effects/assets, draft 041 for aero and structure; each with its reason):
- KTX2 textures and a bundle/loading budget: no textured asset exists to size a budget against; the loader accepts decoders when one does (040).
- Persistent wreckage on the ground and tumbling booster stubs: needs ADR 0021's debris lifecycle changed in the sim (040).
- Plasma bow-shock shape from the silhouette and the comms blackout hook: the shape needs part-silhouette projection each frame (cost) and the hook needs a communications system that does not exist (040).
- Multi-nozzle engines and mach-diamond polish: art/geometry work with nothing to gate on until the asset path has real models (040).
- Engine trail that persists in the air column: a volumetric/ribbon system, with the same budget issue as clouds (040).
- Struts and fuel lines (crossfeed), tilted parts, non-cylindrical radial parents, wing lift for planes: each changes the design format or the Δv model and needs its own ADR (041).
- M1/M2 and integrated Intel frame times: no such hardware here; only the M5 table is produced (038 holds the device item).

## Steps

1. Refine (this document, research, ADRs 0045-0047).
2. core + sdk: `VesselApi.centreOfMass/torqueDemand`, `PartVisual.articulation`, API 0.1.10; sim: capabilities.
3. stock: engine gimbal, fin/control-surface damping, `stock.control-surface`.
4. sim tests (gimbal hand calculation, mixer, damping, control surface, ascent with one wheel, determinism).
5. renderer: articulated parts (engine bell, flap), control-surface generator, VAB catalogue entry.
6. renderer effects: lit smoke, wind, ground colour, plume ground light, shard debris, plasma colour; asset provider; unit tests.
7. Browser run and screenshots; frame times; docs; journal; self-review.

## Acceptance criteria

Commands run from the repo root.

- [x] Gimbal torque: `bun test packages/sim/test/gimbal.test.ts` - a vessel in vacuum with `range` 3 degrees at full pitch demand has angular acceleration within 2 % of `T sin(3 deg) * arm / I` from hand numbers; yaw likewise; no demand or an engine without `gimbal` produces no side force (exactly 0); rate-limited slew reaches the target in `range / rate` s.
- [x] Mixer: unit tests (`mods/stock/test/steering.test.ts`) for the sign flips (engine below and above the centre of mass), authority scaling under 1 m, demand fraction = deflection fraction, same for the control surface.
- [x] Ascent: `bun test packages/sim/test/booster-ascent.test.ts` - the 23-part finned Saturn with ONE reaction wheel (`saturn(1)`) flies the scripted ascent (plan 007 `createAscent`, 026 options) to a periapsis above 70 km with eccentricity below 0.1 (76.4 km, e 0.0854). The "does not without gimbal" half was wrong as written (the headless loop reaches orbit without it too); replaced by the authority test in `gimbal.test.ts` (peak swing in 3 s at 8 km, 400 m/s: one wheel 2.2 degrees, gimbal 13.0). See the Log and journal 033.
- [x] Fin damping: `fins.test.ts` - the peak angle of attack one period after the first peak is at most 0.6 of it with the stock damping and at least 0.9 with `damping: 0`; `damping: 0` equals the plan-026 force to 1e-9.
- [x] Control surface: the hand-number moment (25 degrees, 1 km/s, 0.09 kg/m3, within 5 %) and the sign flip are in `mods/stock/test/steering.test.ts`; `packages/sim/test/control-surface.test.ts` shows the surfaces turning the rocket the right way for pitch, yaw and roll in flight.
- [x] Determinism: two identical flights with gimbal and with control surfaces give byte-identical snapshots (`gimbal.test.ts`, `control-surface.test.ts`).
- [x] Existing: `bun test` all green (scenario-orbit, booster-ascent, fins, terrain, landing, radial, determinism, delta-v).
- [x] Renderer maths: new unit tests for `dustColour`, `windAt`, `plumeGroundLight`, `ionisationColour`, `shardsFromGeometry` (shard count, area weighting, colours from the part), the articulation mapping (gimbal angles to rotation, hinge), and `GltfPartProvider` (parses a small embedded glTF, falls back when the URL fails, bounds and nodes reported).
- [x] `[manual]` screenshots in `docs/journal/assets/033-*.png`: liftoff smoke at the pad, gimbal visible on an engine bell, staging with shard debris, re-entry plasma, the control-surface part in the VAB.
- [x] `[manual]` frame times (`high`, pad, 1920x1080) in the journal: the effects group shown or hidden, idle and burning, differs by under 0.5 ms; the absolute 24 ms is the slow hidden-pane state, so the comparison with plan 031's 16.0 ms is not possible (stated in the journal).
- [x] Written self-review against `visual-direction.md` in the journal, honest about what is still short.
- [x] `bun test` (1 011 pass), `bun run typecheck`, `bun run build`, apps/web vitest (342), prettier on touched files pass; `bun run docs:check` reports only plans 035 and 036 missing from the board, which belong to plan 032's session.

## Docs checklist

- [x] STATUS, journal, ADRs 0045-0047 and index, `architecture/simulation.md`, `guides/writing-a-mod.md`, `docs/research/gimbal-damping-and-effects.md`, `docs/research/three.md` (GLTFLoader), drafts 040 and 041 with board rows, glossary (gimbal).

## Log


- 2026-10-17 — Created as draft by the radial session (pushed out of plan 026).
- 2026-10-17 — Items 6 (stability read-out) and the instancing half of item 7 moved to plan 029 (vab-2 session); M1/M2 measurements stay here.
- 2026-10-17 — Refined draft → ready at the human's request (session: control session).
- 2026-10-17 — Status ready → in-progress (control session).
- 2026-10-17 — Deviation: the headless ascent with one wheel also reaches orbit without gimbal, so the criterion's second half could not be met as written (it is false, not failed); replaced by the authority test (journal 033). The mixer's authority rule and the damping default (60 instead of the ADR's first 20) were tuned against the tests; ADR 0046 gives the default as 60.
- 2026-10-17 — Done. Drafts 040 and 041 created for the pushed-out items. See journal 033.
