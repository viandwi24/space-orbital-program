---
id: 034
title: "VAB extras: mod-supplied categories, trip planner, mod lift modules in the stability read-out"
status: done
owner: "planner session (Claude, 2026-10-17)"
depends: [029]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 034 — VAB extras

## Goal

Two things the VAB lacks. (1) A mod can say where its part sits in the catalogue and in what order, beyond what its modules imply. (2) The trip estimate becomes a trip planner: a real delta-v map for the destinations the loaded bodies offer (low orbit, escape, and for every moon of the home planet its transfer, orbit, landing and return), computed from body data, with the legs laid over the stages of the design, sea level against vacuum.

## Context

- Read: ADRs 0029, 0033, 0041, 0042, 0052 (moon data), 0056, 0071, 0075; journals 022, 023, 029, 041, 044 (the hand Δv table to the moon: 858 transfer, about 150 capture, about 560 ideal landing).
- Code: `apps/web/src/lib/editor/{categories,stats,stability}.ts`, `lib/delta-v.ts`, `lib/vab/StatsStrip.svelte`, `lib/vab/controller.svelte.ts`, `lib/vab/Catalogue.svelte`, `packages/core/src/schemas.ts` (`moduleInfoSchema`, `partDefinitionSchema`).
- Research: `docs/research/delta-v-map.md` (method and formulas, checked 2026-10-17).

## Step 0 — what plan 023 already delivered (checked in the code, 2026-10-17)

- **Lift in the stability read-out is done.** `ModuleInfo.lift` exists (API 0.1.16) and `stability.ts` reads it for any module, not a module id. Left for this plan: a test with a mod module (not `stock.fin`) proving a mod's wing moves the centre of pressure.
- **Categories from descriptors are partly done.** `ModuleInfo.category` (a fixed list of eight) plus implied categories (engine, separator, lift, control source, store) decide the catalogue group. Left: a *part-level* placement (`category`, `order`) for a part whose modules say nothing or the wrong thing (a mod's cosmetic plate, a science bay), and a sort order inside a category (today: registration order). Mod-defined new categories (own label and icon) stay out: draft plan 069.
- **Trip estimate is the rule of thumb** (`tripDeltaV`: orbital speed + 1 300 m/s - rotation, one target). Left: everything in the goal.

## Scope

**In:**
1. `PartDefinition.catalog?: { category?: ModuleCategory | 'other'; order?: number }` (ADR 0082, API bump, additive). The part's own category wins over the module-derived one; `order` sorts within a category (ascending, default 0, ties in registration order). Stock keeps its derived grouping (it is already correct; a test pins that explicit equals derived for stock), so no stock file changes.
2. The delta-v map (ADR 0083): `lib/editor/trip.ts`, pure. Destinations generated from the loaded bodies (so mod bodies appear on their own). Leg model: vis-viva/Hohmann for transfers, hyperbolic capture/ejection, and a point-mass ascent integration (gravity, drag, rotation) for launches and, by time reversal, landings; documented constants.
3. Stage allocation: the legs of a destination laid over the stages of the design in firing order, the first stage at sea level on an atmospheric leg, vacuum otherwise; fractions of a stage; covered / short.
4. VAB UI: a destination select in the stats strip, the "of about" meter against the chosen destination, a legs list with the stages that cover each leg and a short-by note. A pure view model (`trip-view.ts`) holds the states.
5. Roadmap page: remove 034's entry (and its test line) when done.

**Out:** mod-defined categories with their own label/icon (draft 069); plane changes, inclination, elliptic moon orbits (the map says "coplanar circular"); bodies that orbit a body other than the home planet; aerobraking/landing aids; per-design ascent simulation (the map uses one reference acceleration); anything in plan 029.

## Design notes

- Reference ascent acceleration: 1.5 x the home body's surface gravity everywhere (the VAB warns below a liftoff TWR of 1.3; 1.5 is the "typical stock design" value), ballistic coefficient 15 000 kg/m^2 (stock rocket: about 25-35 t over Cd A near 2). Both are named constants. Landing is the ascent reversed (no drag below the atmosphere top is the only asymmetry; ADR 0083).
- Low-orbit altitude of a body: atmosphere height + 10 km, or 25 % of the radius when airless (80 km for the home planet, as before).
- Return ends in the home atmosphere (periapsis at half the atmosphere height): no capture burn, the heat shield does it (plan 014); an airless home would need a circularising burn.

## Steps

1. Refine (this document, research file). **Done.**
2. Core: `catalog` on the part schema, API bump, test; `categoryOf` and the catalogue sort read it; mod test.
3. `trip.ts`: body data -> destinations -> legs (maths), the ascent integration; unit tests against hand values.
4. `allocateStages` and the view model; tests.
5. VAB UI (strip, select, legs list); controller wiring; remove the old `tripDeltaV`.
6. Mod tests: a mod body (second moon with an atmosphere), a mod category/order part, a mod wing in the stability read-out.
7. Browser check with the moon lander design (`[manual]`), JPG screenshots, one VAB e2e.
8. Docs, journal, ADRs, roadmap, STATUS.

## Acceptance criteria

- [x] `bun test packages/core` : a part with `catalog: { category: 'structural', order: 5 }` parses; an unknown category and a non-finite order are rejected; the API version is bumped (additive, patch).
- [x] `vitest` `categories.test.ts`: a part-level category beats the module-derived one; `order` sorts within a category with registration order for ties; every stock part's explicit-equals-derived pin holds (stock unchanged); a mod part with no modules but `catalog.category: 'aero'` is listed under Aerodynamics.
- [x] `vitest` `trip.test.ts` (hand values, 0.5 % unless stated): Hohmann departure from 680 km to 11 800 km on the home body equals `sqrt(mu/r1)(sqrt(2 r2/(r1+r2)) - 1)` computed in the test; capture and ejection equal the vis-viva form for the stock moon and are within 10 % of journal 044 (about 150 m/s capture); escape equals `(sqrt 2 - 1) v_c`; an airless ascent with the reference acceleration costs between the circular speed and 1.6 x it; the home ascent is between 3 000 and 3 900 m/s (journal 006/044: about 3 400); a body with no atmosphere has zero drag loss and a thicker atmosphere costs more.
- [x] `vitest` `trip.test.ts`: destinations come from the bodies handed in: stock gives low orbit, escape, and for `stock.cinder` transfer, orbit, landing, return in that order with cumulative totals that strictly increase; a mod moon with an atmosphere (given as data) appears with its own four destinations; a body whose parent is not the home planet is not offered.
- [x] `vitest` `trip.test.ts` (allocation): hand cases: two stages of 3 000 and 4 000 m/s vacuum (first 2 400 at sea level) against legs of 3 400 / 900 / 700: leg 1 takes 2 400 from stage 1 at sea level and 1 000 from stage 2, leg 2 and 3 are covered from stage 2, spare 1 400; a design that is 500 m/s short reports `short` 500 on the last leg; an empty design covers nothing; sum of covered plus short equals the leg's delta-v.
- [x] `vitest` `trip-view.test.ts` and a server render of `StatsStrip.svelte`: states empty (no parts), no propulsion, short, covered, and the destination select lists the destinations; the legs list shows one row per leg.
- [x] `vitest` `stability.test.ts`: a mod module (own id, `lift` in its descriptor) moves the centre of pressure and counts as a fin.
- [x] `[manual]` In the browser the VAB with the moon lander design (`examples`) shows the trip plan for "Moon landing" with its legs and the stage that covers each; screenshots `docs/journal/assets/034-*.jpg`.
- [x] `cd apps/web && bunx playwright test e2e/editor.e2e.ts --project=chromium` passes with the planner (one engine, `workers: 1`).
- [x] `bun run test`, web `vitest --run`, `bun run typecheck`, `bun run build`, `bun run docs:check`, prettier on the files touched.

## Docs checklist

- [x] STATUS, journal 034, ADRs 0082 and 0083 (numbers as free at creation), research `delta-v-map.md`, `guides/writing-a-mod.md` (the `catalog` field), roadmap page and test, draft plan 069 and board row.

## Log

- 2026-10-17 — Created as draft by the vab-2 session (pushed out of plan 029).
- 2026-10-17 — Refined draft -> ready at the human's request (session: planner session). Plan 023 had already delivered lift descriptors and module categories; the plan is narrowed to part-level placement and order, the delta-v map and its UI, and the missing mod tests.
- 2026-10-17 — Done. Evidence: journal 034 ("Verification output"); screenshots `docs/journal/assets/034-*.jpg`. Deviations from the criteria as written: (1) the `categories.test.ts` criterion lives in `apps/web/src/lib/mod-awareness.test.ts` (where the mod catalogue cases already were), and "explicit equals derived for stock" became "no stock part carries a catalog entry and stock order is registration order" (stock was not migrated, ADR 0082). (2) The capture criterion "within 10 % of journal 044 (about 150)" was wrong as written: the 150 is a capture into a 1 200 km ellipse; the test checks 130 to 175 for that ellipse, and the map's own capture into the 48 km circle is 295 (journal 034). (3) The home ascent 3 343 m/s, moon landing 645 m/s. (4) An example "Load the moon shot" was added to the VAB (the vessel of the moon mission test) because there was no moon lander design to show. (5) The mod-wing stability test lives in `mod-awareness.test.ts`, where the mod wing already was; it now also asserts the centre of pressure moves. (6) `API_VERSION` 0.1.22; ADR 0081's text says 0.1.21, see the journal.
