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
