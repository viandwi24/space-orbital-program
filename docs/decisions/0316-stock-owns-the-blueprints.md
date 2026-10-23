# 0316 — Stock owns the blueprints: designs baked from the Hangar's builders

**Status:** accepted (owner's request, 2026-10-23)
**Date:** 2026-10-23
**Plan:** plans/375-developer-tools.md (follow-up)
**Amends:** ADR 0263 (the Library's cards), ADR 0255 (famous missions); applies ADR 0311

## Context

The owner said on 2026-10-23: "saya mau blueprint yang sekarang ini kan dimiliki oleh mod stock".

Core has had a `blueprints` registry since plan 285, but no plugin registered into it. The game's twelve blueprints were built in the web app:
- the five learn examples (`editor/examples.ts`, `design.ts`);
- the seven famous missions (`editor/missions.ts`).

Their builders run through the Hangar editor's own operations (`attachNew`, `radialTarget`, `autoStages`), which is how they stay valid by construction. Those operations live in `apps/web`, and a mod imports only the SDK.

## Decision

1. **Stock registers every blueprint**, as data: `mods/stock/src/blueprints.generated.ts` holds each design.
   - Ids are `stock.<name>` (`stock.two-stage`, `stock.kronos-selene`).
   - `BlueprintDefinition.collection` (`learn` or `missions`, absent for "Mod") says where the Library files a card.
   - `goal` gains `deep-space`.
   - API 0.1.112.
2. **The builders stay the source.**
   - The web app's builders are an authoring tool. `apps/web/src/lib/editor/blueprint-sources.ts` lists them with their card fields.
   - `apps/web/scripts/bake-stock-blueprints.ts` writes the generated file.
   - A test builds every source against stock's content and checks it equals the registered design, so the data cannot drift from what the editor builds.
   - To change a blueprint, change its builder and run the bake.
3. **Everything reads the registry by id.** This covers the Library and the start modal, `__orbitalVab.loadTwoStage`/`loadBooster`/`loadMoonShot`/`loadMission`, lessons, tests and the developer tools.
   - Old ids still resolve (`resolveBlueprintId`): `kronos-selene` becomes `stock.kronos-selene`, and `learn.two-stage` becomes `stock.two-stage`.
   - Saved designs and libraries hold designs, not blueprint ids, so they are unaffected.
4. A mod can register blueprints in either collection, or patch nothing: blueprints are not a patch target. To change one, a mod registers its own.

## Consequences

- The Blueprints developer tab shows every blueprint `by stock`. The Mods page counts them under stock.
- A builder change needs the bake. The equality test says so when it is forgotten.
- The web app no longer offers a blueprint that no plugin registers.
