---
id: 410
title: "Pay only for what the view needs: each look gated by relevance and distance, cheap baked stand-ins far away, slow updates for slow things"
status: done
owner: "Worker A"
depends: []
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 410 — Pay only for what the view needs

**Size:** L

## Goal

The game is playable on every device tier, and it keeps the new looks. Each look costs GPU and CPU time only when the current view can show it. Far away, a cheap baked stand-in replaces it. Owner, 2026-10-24: "the extra graphics must not make it lag; use what big games use; the sea's detail only matters near the sea, from space a blue colour is enough."

## Context

- **What the owner sees:** since today's graphics work the game is less playable than before. It stalls up to 700 ms on the M2 or Windows (`refs/graphics-v2/reference/owner-spikes/`), and the stutter is periodic. The M5 holds 119 fps in orbit.
- **What plans 408 and 409 fix:** the stalls (warming, governor reallocation, GC). Those plans do not decide what each look is allowed to cost.
- **The looks added today run at the same tier wherever the camera is:**
  - clouds v2 (397);
  - ocean v2 with the FFT, the reflection and the detail normals (401);
  - rocks (402);
  - re-entry and aero (399);
  - plumes (400);
  - orbital bakes (403);
  - GPU terrain (398, in progress).
- **How AAA engines handle this** (see `refs/graphics-v2/01`, `02`): relevance and LOD gating per subsystem, impostors and baked stand-ins far away, update rates by importance (far or slow things update less often), time-sliced bakes, per-subsystem budgets, and all shader variants compiled during the loading screen, never in play.

## Scope

**In:**

1. **A relevance model.** One function per look returns 0 (off), 1 (cheap) or 2 (full) from these inputs:
   - camera altitude above the surface;
   - distance to the feature;
   - the screen share of the feature;
   - the body's atmosphere;
   - the vessel state (heating, thrust, landed).

   The renderer applies the result only through uniforms and draw/skip choices, never through new pipelines.
2. **Rules for each look** (starting values, tuned by measurement):
   - **Ocean.** Full FFT, reflection and detail normals only when the camera is below about 3 km and the sea covers enough of the screen. Analytic waves below about 30 km. Above that, the sea is the baked colour with a sun glint only.
   - **Clouds.** The volumetric march only inside or near the cloud layer (below about 15 km, or within 5 km of a cloud deck). Above that, the 2D cloud layer and the baked orbital cloud cube from plan 403. The weather map updates every few seconds, time-sliced, never in one frame.
   - **Rocks and scatter.** Only below about 150 m above ground. Cells are built in time slices with a per-frame budget, and none are built above the gate.
   - **GPU terrain (398).** Only below about 20 km. Above that, the existing baked path.
   - **Re-entry and aero.** Only while heating or the Mach number crosses its threshold. Otherwise the shell is not drawn.
   - **Plumes.** Full template only for engines on screen and near the camera. Far engines use a sprite stand-in.
   - **IBL and PMREM, shadows.**
     - Recapture IBL on a slow schedule, spread over frames.
     - Shadows: a static site map cached, if plan 369 found it worthwhile; otherwise a lower update rate when nothing moves.
3. **Precompile.** Every pipeline any relevance level can reach is compiled during the loading screen, within a budget, so a level change during play costs nothing (ADR 0310). The background warming loop is gone or bounded by plan 408.
4. **A per-subsystem budget in Debug.** Debug shows the ms each look costs this frame and its relevance level, so the owner can see what is paying.

**Out:**
- New looks.

## Touches

- `packages/renderer/src` (a `relevance.ts`, the ocean, clouds, rocks, terrain, plumes, re-entry, environment, governor, Debug);
- `apps/web/src/lib/debug/*`.

## Steps

1. **Measure.** Use the 251/392 ablation tool under `/tmp/orbital-measuring`, on WebGPU and WebGL. Run each scene (pad, 3 km, 12 km, sea level, orbit, Space Center, Hangar) with each new look on and off. Record the cost table in the journal: this shows exactly what today's looks added.
2. **Write the ADR:** the relevance rules, the levels, and the "no pipeline changes in play" rule.
3. **Implement** the relevance model and the per-look gates, with unit tests that check the level for each scene's camera state.
4. **Measure again.** The goal: every scene is at or below its pre-today cost when the look is irrelevant, and adds at most its budget when relevant.

## Acceptance criteria

- [ ] The cost table from before and after is in the journal (M5, plus `[manual]` M2 and Windows numbers from the owner's script).
- [ ] **In orbit:** the ocean, the volumetric clouds, the rocks and the terrain cost about 0 ms (only the baked stand-ins draw).
- [ ] **No pipeline compiles in play:** a counter in Debug stays at 0 after the loading screen, and a test asserts it.
- [ ] **Frame pacing** (M5 at 120 Hz, M2 and Windows at 60):
  - the p95 frame interval is no worse than the 392 baseline in any scene;
  - there are no long frames (over 2× the interval) in 2 minutes.
- [ ] Affected unit tests and the typecheck pass. E2E is paused by the owner.

## Docs checklist

- [ ] STATUS row.
- [ ] Journal with the cost tables.
- [ ] ADR.
- [ ] `refs/graphics-v2/README.md` gets a "relevance rules" section.

## Log

- 2026-10-24 — Created by the coordinator after the owner reported that today's graphics work made the game less playable. Runs right after plan 408 on Worker A. Looks plans still open (398, 403, 405, 406) continue in parallel with their own relevance gates; 410 moves them onto the shared model.
- 2026-10-24 — Worker A: done, with open items. ADR 0369: the relevance model, three run-time gates (sea, clouds, terrain march), the measuring switches, the texture-limit fix for pipelines over 16 samplers. Cost table: orbit and the Space Center cost nothing measurable; near the ground clouds 2-4 ms, terrain march ~2.5 ms. Compiles in play: 0. Open: M2/Windows numbers, the plume, rocks and plasma gates.
