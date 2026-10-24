# 414 — The pad at 120 Hz (in progress)

**Plan:** [plans/414-pad-at-120hz.md](../plans/414-pad-at-120hz.md) · **Session:** Worker B, 2026-10-24 · **ADRs:** 0372 · **Note:** [refs/graphics-v2/07-look-costs.md](../../refs/graphics-v2/07-look-costs.md)

## What was done

| Where | What |
|---|---|
| `renderer/site-lod.ts`, `site-vegetation.ts`, `site-meshes.ts`, `site.ts` | trees, bushes and tufts with a coarse geometry beyond 90, 45 and 28 m; `LodInstances` re-sorts them when the camera has moved 8 m |
| `renderer/renderer*.ts`, `scene.ts`, `environment.ts` | `setLookOff` for site, vessels, vegetation, trees, tufts, shadows, floods, structures, people, steam |
| `apps/web/scripts/measure-looks.ts` | headed (it was headless: 60 Hz), the planet mod only when asked for, a fresh page for each look |
| `apps/web/scripts/profile-frame.ts` | starts the booster from the Hangar |

## Findings

- A headless Chromium is paced at 60 Hz: every number of journal 413 and of `07-look-costs.md` had a floor of 16.7 ms. Headed, the orbit reads 8.3 ms (120 Hz) with every look on.
- The pad is 18 to 20 ms headed. Without the launch site 11.9; with the vegetation off 18.6; so the site costs 6 to 7 ms and the vegetation under 1 of them.
- The site's parts add up to about 3 ms: the four floodlights (point lights at intensity 0 by day, kept so no shader recompiles at dusk) 1.5 ms, the vegetation 0.8, the people 0.4, the structures 0.2 (a bundle: their toggle rebuilds it). About 3.5 ms of the site is not any part measured.
- The levels of detail cut the vegetation's triangles to about a third and moved the pad's frame by less than the noise.

## Not done

- The pad's mean frame is 18 ms against the 8.3 ms goal; frames over 8.4 ms are not near 5 %.
- What is in the site's other 3.5 ms, and the 3.6 ms the pad costs over the orbit with no site (the vessel, the ground near it, the planet pass).
- The floodlights' 1.5 ms, `perf:gate`, the M2 and Windows (`[manual]`).

## Update (the site's parts, the floodlights)

- One at a time the site's bushes, rocks, trees, tufts and structures are each under 0.3 ms at the pad; the whole site is 6 ms (21.8 to 15.8). The cost is not in any mesh.
- The floodlights: hiding the four idle point lights by day saves 1.5 ms, but their lit-material variants were not built by the load warm-up (the probe saw 48 pipelines built at dusk), so the change was dropped; why the warm-up's draws with the lights in asked for nothing new is not known (parts' warm scene and the view frames both tried). The seven visible point lights in the scene by day (four floods and three others) are the open candidate.
- `perf:gate --quick` was run while a build ran; its numbers are discarded.
- Plan 415 (Worker A) takes the pad's breakdown from here.

## Update (lights)

- Cause of the site's remaining cost: the scene held 11 lights by day (the site's four floods, three plume cluster lights, four vessel lamps); each is in every lit material's light loop at any intensity. None casts a shadow. Hiding lights by day compiled 48 pipelines at dusk (journal above), so the answer was fewer lights, always present, and glow for the floods (ADR 0373).
- Interleaved A/B on the M5 (headed, the pad, 15 s each after a 20 s settle, main and the change alternating, four pairs; the flag held throughout): mean frame 23.9, 17.6, 17.9, 19.4 ms (main) against 18.5, 16.2, 16.5, 16.0 (the change): 19.7 against 16.8 ms, frames over 16.7 ms 62 % against 44 %. A first build with a brighter glow read 24.3 against 16.6 ms in the same kind of run.
- The dusk probe (`probe-dusk.ts`, the sun from 35 degrees to -14): 0 pipelines built on the change and on main.
- Screens: `414-pad-day.jpg`, `414-pad-night.jpg` (the change) against `414base-pad-day.jpg`, `414base-pad-night.jpg` (main). At night the tower and the buildings are no longer warm-lit; the pad and the grass have the glow's pool. The look at night is for the owner to judge.
- The pad is still 16 to 18 ms headed, over the goal of 8.3 ms; the rest is plan 415's.

## Update (light sets per material)

- The site, its vegetation, its people and the ground rocks see only the sun and the sky (`material.lightsNode`, ADR 0374); only vessels see the four pooled lamps. Interleaved A/B on the M5, headed, four pairs: 21.2 ms (main) against 19.5 ms mean at the pad; the dusk probe still builds 0 pipelines. Day shot with the sun's shadow: `414ls-pad-day.jpg`.
- The pad is still 15 to 24 ms in a noisy machine; the goal of 8.3 ms is plan 415's.
