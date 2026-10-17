# 034 — VAB extras: part placement and a trip planner

**Plan:** plans/034-vab-extras-mod-categories-trip-planner.md · **Session(s):** planner session (Claude, 2026-10-17) · **Date:** 2026-10-17 · **ADRs:** [0082](../decisions/0082-part-catalogue-placement.md), [0083](../decisions/0083-the-trip-planner-delta-v-map.md) · **Research:** [delta-v-map.md](../research/delta-v-map.md)

## What was done

Step 0 narrowed the draft honestly: plan 023 had already delivered lift descriptors (the stability read-out counts any module with `lift`) and module-level categories, so what remained was a part-level placement, the missing mod test, and the whole trip planner.

| Where | What |
|---|---|
| `packages/core` | `PartDefinition.catalog { category?, order? }`, API 0.1.22 (additive), `test/catalog.test.ts` |
| `apps/web/src/lib/editor/categories.ts`, `vab/Catalogue.svelte` | the part's own category wins; `sortParts` orders by `catalog.order`, ties in registration order |
| `apps/web/src/lib/editor/trip.ts` | `destinationsOf(bodies)`: low orbit, escape and per moon transfer/orbit/landing/return; vis-viva/Hohmann, hyperbolic capture and ejection, a point-mass ascent integration for climbs and landings; `planTrip` lays the legs over the stages |
| `apps/web/src/lib/editor/trip-view.ts` | the states of the strip (empty, no propulsion, short, covered) and one row per leg |
| `apps/web/src/lib/vab/StatsStrip.svelte`, `controller.svelte.ts`, `routes/vab/+page.svelte` | destination select, meter, note, collapsible legs list naming the stage that covers each leg; "Load the moon shot" example (`examples.ts`, the vessel of `moon-mission.test.ts`) |
| deleted | `tripDeltaV`, `TRIP_TARGETS`, `LOSS_ALLOWANCE`, `ascentDeltaV` |
| tests | `trip.test.ts` (20), `trip-view.test.ts` (6), `vab/StatsStrip.test.ts` (6, `svelte/server` render), mod cases in `mod-awareness.test.ts`, `examples.test.ts`, `e2e/trip.e2e.ts` |

## The numbers

Stock map (reference rocket 1.5 g, 80 km and 48 km orbits):

| Destination | Total m/s | Legs |
|---|---|---|
| Low orbit (80 km) | 3 343 | launch 3 343 (journals 006 and 044: about 3 400) |
| Escape | 4 287 | + 944 |
| Cinder transfer | 4 198 | + 855 (journal 044: 858) |
| Cinder orbit (48 km) | 4 492 | + 295 capture |
| Cinder landing | 5 137 | + 645 |
| Cinder and back | 6 079 | + 645 lift-off + 297 ejection |

The moon shot (journal 044) is covered to the landing with 1 174 m/s to spare, to the return with 232; the two-stage example reaches low orbit and falls 929 m/s short of the landing. Screenshots: `assets/034-trip-moon-landing.jpg`, `034-trip-short.jpg`, `034-trip-empty.jpg`.

## What surprised me

- **The first ascent came out at 2 900 to 3 200 m/s, too good.** The initial turn followed the *inertial* velocity, which at the equator already has 174 m/s of rotation, so the thrust leaned over at once; it must follow the velocity relative to the ground. After that, a reference acceleration of 1.5 g gave 3 343.
- **The moon landing is not 493 m/s (the circular speed).** Climbing from the surface to a 48 km orbit on a 190 km body costs about 600 m/s by energy alone (`sqrt(2 mu (1/R - 1/2r))`); the integration gives 645. Journal 044's "560 for a perfect suicide burn" started from a 10 km periapsis, not from an orbit.
- **An acceleration of 1.5 home gravities everywhere** is what keeps the moon's losses small (about 9 g there); using 1.5 times each body's own gravity gave 700 to 800 m/s and was wrong for a stage that is the same rocket.
- **The capture figure is 295, not the "about 150" of journal 044:** that was a capture into a 1 200 km ellipse; into a 48 km circle it costs more. The test checks the 150 against the ellipse.

## Decisions (ADRs)

0082 (part placement: only the nine existing ids, stock unchanged), 0083 (the delta-v map).

## Open questions / follow-ups

- Plan 069 (draft): categories of a mod's own with a label and an icon.
- Not done: a per-design ascent (own TWR and drag), inclined or elliptic moon orbits, moons of moons; the map is a guide (the strip says so).
- `API_VERSION` is now 0.1.22. ADR 0081 (plan 040, same day) says it bumps 0.1.20 to 0.1.21, which plan 038 had already done: whichever session lands second should treat its additions as 0.1.22 additive or bump to 0.1.23.

## Verification output

```
bun test packages/core                      181 pass (catalog.test.ts 4)
apps/web vitest --run                       78 files, 688 pass
bun run test                                1218 pass, 1 fail: mods/stock boot.test.ts, which does not list plan 040's uncommitted stock.engine-cluster (not mine)
bun run typecheck                           0 errors (svelte-check 1511 files)
bun run build                               ok
bun run docs:check                          only the index rows of ADRs 0077 to 0081 (plan 040's) missing
playwright e2e/trip.e2e.ts --project=chromium   1 passed (26.8 s, production headers)
```

Manual: built site on port 5232, moon shot loaded, "Cinder landing" and "Cinder and back" picked, the legs list opened, a new vessel and the two-stage example (short); the legs list opens upward over the 3D view without covering the panels at 1440x900. The server and the tab were closed afterwards.
