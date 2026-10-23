# 0313 — The crew content API: outfits, looks, expressions, animations and portraits from plugins

**Status:** accepted (owner's request, 2026-10-23)
**Date:** 2026-10-23
**Plan:** plans/375-developer-tools.md
**Amends:** ADR 0291 points 2 and 5 (the crew data moves from the renderer to stock), ADR 0076 (mod asset kinds)

## Context

The owner said on 2026-10-23: "crew juga gitu ada kemungkinan ntar mods bisa nambah crew atau mengganti animasi atau texture".

ADR 0291 put the crew character's data in `packages/renderer/src/crew/outfits.ts` and its poses in `poses.ts`:
- 12 outfits;
- 5 skins, 5 hair colours, 3 hair styles;
- 8 expressions;
- 4 actions.

A mod could not add or change any of it.

## Decision

1. **Five registries in core** (`packages/core/src/crew-look.ts`), registered through `ctx.crewOutfits`, `ctx.crewLooks`, `ctx.crewExpressions`, `ctx.crewAnimations` and `ctx.crewPortraits`, with `defineCrewOutfit` and the other helpers in the SDK:
   - **`CrewOutfitDefinition`**:
     - the fields of ADR 0291's outfit: `body` (suit, coat, shirt); colours `suit`, `trim`, `accent`, `legs`, `boots`, `gloves`; `headwear` and its colour; `eyewear`; `prop`; `pack`; `harness`; optional `stethoscope` and `tie`;
     - `uses`: where the game may dress people in it (`pod`, `eva`, `hangar`, `space-center`, `lineup`), so a mod outfit with `hangar` appears among the Hangar's walkers;
     - `professions`: which crew professions wear it at the Space Center.
     The shapes (headwear, props, bodies) are the renderer's procedural pieces; a mod picks among them and colours them.
   - **`CrewLookDefinition`**:
     - `kind`: `skin`, `hair-colour`, `eye-colour` or `hair-style` (a style names one of the renderer's hair shapes: `tousled`, `swept`, `short`);
     - a `colour` (sRGB hex);
     - a `weight`: how often a crew id's hash picks it.
     A crew member's look is drawn from every registered look of each kind, weighted, from the hash of their id. Ids keep their look while the registered set stays the same.
   - **`CrewExpressionDefinition`** is data the 3D face and the portrait painter both read:
     - `eyes`: per side `open`, `big`, `wide`, `closed-up` (a smiling ∩) or `closed-down` (sleep ∪);
     - `brows`: per-side tilt, height offset and a raise for one side;
     - `mouth`: `smile`, `grin`, `o`, `small-o`, `tilt` or `frown`.
     Stock's eight expressions are these combinations.
   - **`CrewAnimationDefinition`**:
     - a `role`: `idle`, `walk`, `wave`, `work` or `eva`;
     - either `keys` (times in seconds, each with a partial pose of the eleven pose channels of ADR 0291's `PersonPose`) with `duration` and `loop`, or `pose(t, { walked, seed })`, a pure function returning a partial pose.
     The game uses one animation per role: the one registered last in boot order, so a mod's `walk` replaces stock's. The developer Crew tab lists every animation and marks the one in use. `eva` shows in the line-up only, because the EVA figure in flight is a rigid part (ADR 0291 point 4).
   - **`CrewPortraitDefinition`**:
     - an `image` asset path in the mod's package;
     - a match: `outfit` (every portrait in that outfit) or `crew` (one crew member's id).
     A matching portrait replaces the painted one, with the most specific match winning and then the latest registration. Painted portraits stay the default.
2. **Patches.** `crewOutfit` is a patch target (ADR 0170), so a mod can recolour a stock outfit without replacing it.
3. **Stock registers its own crew** through these registries, with the data of ADR 0291 moved to `mods/stock/src/crew-look.ts`. The renderer keeps the geometry, the shading and the painter. It reads a `CrewContent` table (`packages/renderer/src/crew/content.ts`, no three):
   - the web app fills the table once per page from the loaded registries and the mods' image assets (`setCrewContent`);
   - before that, a neutral grey suit stands in, so nothing throws.
4. **Image assets in mod packages** (package format 3, ADR 0076 extended):
   - an asset may be `image/png` or `image/webp` (`.png`, `.webp` paths);
   - at most 512 KB each, inside the package's existing totals;
   - checked by its magic bytes.
   Format 1 and 2 packages still load. A portrait whose image the package lacks rejects the mod at install time, as a missing `.glb` does.
5. **The API version goes to 0.1.110** for the new context keys and the patch target.

## Consequences

- A mod adds an outfit to the Hangar crew, a skin colour to the roster, a face to portraits or a new walk cycle without touching the game.
- Expressions are limited to the face pieces the renderer can draw. New shapes are a renderer change.
- Textures on the 3D figure stay out: the figure is vertex-coloured, one material for everyone (ADR 0291 point 4). Image assets reach portraits only.
- The renderer's crew tests now boot stock to get content (stock is a dev dependency of the renderer already).
