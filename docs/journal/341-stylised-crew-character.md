# 341 — Stylised crew character

**Plan:** [plans/341-stylised-crew-character.md](../plans/341-stylised-crew-character.md) · **Session:** crew character session (Claude) · **Date:** 2026-10-22 · **ADR:** 0291

## What was done

- **`packages/renderer/src/crew/`**: `outfits.ts` (12 outfits of the owner's sheet as data, 5 skins, 3 hair styles, 5 hair colours, 8 expressions, `appearanceOf(id)` by an FNV hash, `CREW_HEIGHT` = 1.7 m), `character.ts` (the figure from three geometry: a super-ellipsoid head with exact normals, eyes, highlights, brows, cheeks and a mouth per expression placed on the head surface, a hair shell cut at a hairline plus fringe and crown tufts, headwear, eyewear, torso by lathe, harness, belt, coat, shirt, packs, arms, gloves, legs, boots, hand props), `poses.ts` (walk by distance walked, idle, wave, work; pure), `person.ts` (one `SkinnedMesh` per person: rigid one-bone weights, vertex colours, one shared `MeshStandardMaterial`; and `addCharacterToPart` for the EVA part's slots), `walkers.ts` (the Hangar's path logic, moved here), `portrait.ts` (2D canvas, cached data URLs), `lineup.ts` (the dev viewer).
- **EVA suit** (`parts/generators/eva.ts`): the character in the EVA outfit; the open helmet is the moving piece (hidden with the helmet off). New material slots `skin`, `hair`, `eye`, `blush`.
- **Hangar**: ten people (engineers, scientists, mechanics, researchers), five walking, five standing at work, idle or waving; one skinned mesh each instead of seven instanced box meshes.
- **Space Center / launch site**: six staff (engineer, scientist, flight control, doctor, field worker) on the pad road, the west road and near the pad's edge, animated by `LaunchSite.animate`.
- **Portraits**: Astronaut Complex rows, profile and applicants; Hangar crew seats. Flight suit while aboard, the profession's outfit at the Space Center; sad when lost or missing; sleepy is in the model for long warps.
- **`/dev/crew`**: every outfit and expression in 3D with poses, views and skins, beside a 1.25 m × 1 m drum and a 1.7 m pole, and every portrait.

## What surprised me

- **The scale tension the owner named is partly physics.** At 1.7 m the figure is taller than the stock command pod (1.25 m wide, 1 m tall), which is a KSP-sized pod. The physics suit is 1.8 m, ladders 2 m, so the figure matches the sim; making people smaller (KSP's kerbals are about 1 m) would be one constant plus the suit's box, ladder and hatch sizes. Left for the owner.
- The heavy-job lock `/tmp/orbital-heavy.lock` had become a file held by `lockf` from another session, so `mkdir` on it can never succeed; this session used `lockf -k` on the same path.
- The part glass slot is nearly black: a helmet visor of it hides the face, so the EVA helmet is an open shell with a rim, as on the sheet.

## Open questions

- Per-member faces on EVA need a per-vessel palette for the suit part.
- Nobody is drawn inside pod windows; there is no interior rendering.

## Verification output

See the plan's acceptance criteria and the commit messages.
