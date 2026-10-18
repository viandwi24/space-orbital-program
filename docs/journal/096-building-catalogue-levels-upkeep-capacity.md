# 096 — Buildings with costs, construction time, upkeep and capacity limits

**Plan:** [plans/096-building-catalogue-levels-upkeep-capacity.md](../plans/096-building-catalogue-levels-upkeep-capacity.md) · **Session:** Agent 1 (Lead, MacBook Pro M5), 2026-10-18 · **ADRs:** [0123](../decisions/0123-construction-on-the-tick-capacity-keys-upkeep.md) (new), [0097](../decisions/0097-sites-space-center-in-3d-free-grid-bases-and-range-safety.md), [0098](../decisions/0098-progression-economy-career-and-milestones.md), [0113](../decisions/0113-economy-core-ledger-costs-charges-recovery.md), [0150](../decisions/0150-launch-facilities-from-buildings-surface-placement-and-the-launch-choice.md) · **Research:** none

**Status when written: criteria met.**

## What was done

| Where | What |
|---|---|
| `core/buildings.ts` | `PlacedBuilding.state` gains `building` and `upgrading` with `readyDay`; `CAPACITY` (ten typed keys with units), `workingLevel`, `siteCapacity`, `capacityUpgrade` ("Hangar level 2: 120 parts"), `upkeepOf`; `FLIGHT_TOOLS` (crew's list, now with `delta-v`) is the one never-gated list |
| core protocol | `upgrade-building` command, `building:ready` event, `Snapshot.day`, causes `economy.construction` and `economy.upkeep`; API_VERSION 0.1.58 (0.1.53 to 0.1.57 went to 100, 124, 105, 127 and 130 while this waited) |
| `sim/buildings.ts` | `place-building` pays level 1 and builds until `readyDay`, `upgrade-building` pays the next level and keeps working at the old one, `buildingsTick` finishes work on the tick of its ready day and charges upkeep every 30th day; all free and immediate with the economy off |
| `sim/crew.ts`, `sim/comms.ts` | `crew-hire` refused at the primary site's crew capacity (with the upgrade); an upgrading dish keeps its tier |
| `mods/stock/buildings.ts` | three levels per building with cost, build days and upkeep (1 % of the level's cost per 30 days); the Hangar takes 30, 120 and 255 parts |
| web | `lib/capacity.ts` (`limitsOn`, `partsLimit`, `massUpgrade`); the Hangar's `over-capacity` no-go check; the Launch screen lists designs over the pad's limit with the upgrade and applies limits only in Career; the Space Center shows construction and upgrades with days left, an Upgrade button with cost and days, finished construction and upkeep over the funds in "Needs attention" |
| `routes/space-center` | runs the world's newest save when there is one (funds, day and crew are the world's) and writes it back as an autosave after a placement, upgrade or removal, so a launch into the world (plan 108) carries the spending and the construction |
| tests | sim `building-levels.test.ts` (6) and `building-capacity.test.ts` (5), core `capacity.test.ts`, vitest `capacity.test.ts` (4) and three more in `space-center/model.test.ts`, e2e `space-center.e2e.ts` (a Career dish under construction) |

## Stock values (ADR 0123 point 7)

| Building | Capacity per level | Cost per level (funds) | Build days |
|---|---|---|---|
| Hangar | 30 / 120 / 255 parts | 40 000 / 90 000 / 250 000 | 10 / 20 / 30 |
| Launchpad S | 18 / 30 / 45 t | 20 000 / 60 000 / 150 000 | 5 / 12 / 20 |
| Launchpad M | 60 / 100 / 150 t | 80 000 / 160 000 / 300 000 | 5 / 12 / 20 |
| Launchpad L | 180 / 300 / 500 t | 200 000 / 300 000 / 400 000 | 5 / 12 / 20 |
| Runway | 1 200 / 1 800 / 2 400 m | 60 000 / 120 000 / 200 000 | 8 / 15 / 25 |
| Mission Center | 3 / 6 / 12 contracts | 30 000 / 90 000 / 200 000 | 6 / 14 / 24 |
| Astronaut Complex | 5 / 12 / 30 crew | 30 000 / 80 000 / 180 000 | 6 / 12 / 20 |
| R&D | 1 / 2 / 3 labs | 50 000 / 120 000 / 250 000 | 8 / 16 / 28 |
| Administration | 1 / 3 / 5 strategies | 30 000 / 90 000 / 200 000 | 6 / 14 / 24 |
| Tracking dish | tier 1 / 2 / 3 | 20 000 / 60 000 / 150 000 | 2 / 6 / 12 |
| Test stand (plan 130) | grade 1 / 2 / 3 | 30 000 / 70 000 / 150 000 | 4 / 10 / 18 |
| Propellant plant | 1 / 2 / 4 recipes, 20 / 50 / 120 t storage | 80 000 / 160 000 / 320 000 | 10 / 18 / 28 |

Upkeep is 1 % of the level's cost per 30 days: the Legacy layout's four buildings cost 1 300 funds a month.

## What surprised me

- **The world's state lives in its newest save.** When 096 started, a new flight began from the world record's info, so Space Center spending was lost. Plan 108 (merged meanwhile) launches into the world's newest save; the Space Center now runs that save and writes it back after each change. A world with no save yet still starts from the record, so spending before its first flight is not carried.
- **Sandbox and the Legacy world had pad limits.** The Launch screen of 094 filtered designs by pad mass in every world; limits now apply only where the economy is on (ADR 0123 point 4).
- **`FLIGHT_TOOLS` already existed** in core's crew module (ADR 0176); one list now serves crew and buildings.
- A site with no building providing a key has no limit for it: the Legacy layout has no Astronaut Complex, so the roster is unlimited until one is built.

## How to test manually

Create a Career world, enter it: place a Tracking dish (20 000 funds), see "Under construction · ready in 2 days" in Needs attention. Select the Hangar: "Upgrade to level 2 · 90 000 funds · 20 days". In the Hangar, build more than 30 parts: the verdict is no-go and names "Hangar level 2: 120 parts".
