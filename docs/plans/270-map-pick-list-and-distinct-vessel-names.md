---
id: 270
title: "Map pick list for stacked vessels, and distinct vessel names"
status: done
owner: "map pick list / vessel names session"
depends: [258]
phase: 8
created: 2026-10-21
updated: 2026-10-21
---

# 270 — Map pick list for stacked vessels, and distinct vessel names

**Size:** M

## Goal

Two owner requests from 2026-10-21 (screenshot: a map card reading "Moon shot (debris) (debris) (debris)"):

1. Zoomed out, several vessels and pieces of debris sit on one point of the map and the wanted one is hard to click. A click where several vessel icons overlap opens a small list of every vessel there (like an MMORPG loot list); picking an entry opens that vessel's card.
2. Vessel names repeat. Make them distinct and readable without the player's help.

## Context

- Map click today: `apps/web/src/lib/flight-loop.ts` asks `target-view.ts` `pick` (one key, `map-pick.ts` `pickTarget`), sets the target and calls `onMapPick`; the flight page opens `MapCardView` (`lib/hud/map-card.ts`, plan 250). `target-view.ts` `MapTargetFrame.others` already carries every other vessel's screen point each frame.
- Mission Center: `mission-center/model.ts` `clusterLabels` groups three or more close vessels under one "N vessels" label whose click selects the first member; a canvas click goes through `pickTarget` over the labels.
- Vessel icons by type: `packages/renderer/src/map-style.ts` `iconPath` (plan 258, 24 × 24 stroked paths).
- Names: the launch takes the design's name (`packages/sim/src/commands.ts` `loadVessel`); a split names the new side `"<name> (debris)"` (`vessel.ts` `splitAt`), as does queued debris (`debris.ts`); an undock gives both sides their names back and strips one `" (debris)"` (`docking.ts` `restoreUndocked`); `rename-vessel` (`fleet.ts`, plan 223). Names are saved as part of the vessel component of the world.
- Other sessions are open on `flight-loop.ts`, the renderer and the sim's launch room (`commands.ts`, `modes.ts`): this plan does not touch `flight-loop.ts` or the renderer, and its edit to `commands.ts` is one line after `spawnVessel`.

## Scope

**In:**
- A pure naming rule in `@orbital/core` (`vessel-names.ts`): unique name with a number, one debris suffix, a split-off controllable piece numbered, a tidy for legacy names. ADR 0252.
- The sim uses it at launch, split, queued debris, undock, and tidies legacy names when a save is loaded.
- A pure stack hit test and entry builder (`apps/web/src/lib/hud/map-stack.ts`) and a `MapPickList.svelte` list (icon, name, role or type, altitude), used by the flight map and the Mission Center (canvas click and cluster label).

**Out:** changing the click path in `flight-loop.ts` (the page reads the frame it already gets), new icons, renaming EVA kerbals.

## Steps

1. ADR 0252 for the naming rule.
2. `core/vessel-names.ts` with tests; wire the sim; sim tests for launch twice, debris, a split of debris, undock and a legacy save.
3. `map-stack.ts` with tests; `MapPickList.svelte`; flight page and Mission Center.
4. Fix the e2e text that expected "(debris)"; docs, STATUS, journal.

## Acceptance criteria

- [x] `uniqueVesselName`, `debrisName`, `splitName`, `tidyLegacyNames` are tested in `packages/core/test/vessel-names.test.ts`.
- [x] Two launches of "Moon shot" make "Moon shot" and "Moon shot 2"; staging gives "Moon shot debris", "Moon shot debris 2"; a split of debris never adds a second "debris" (`packages/sim/test/vessel-names.test.ts`).
- [x] A save whose vessel is named "X (debris) (debris)" loads as "X debris".
- [x] The stack hit test and the entry builder are tested (`apps/web/src/lib/hud/map-stack.test.ts`).
- [x] The pick list opens in the flight map and the Mission Center when the click lands on two or more vessels; a single vessel keeps the card; the list takes the keyboard (arrows, Enter, Escape). Wired and type-checked; not tried in a browser on a real stack (journal, Open).
- [x] `bun run test`, `bun run typecheck`, `bun run lint` and the web vitest run with `CI=true` pass, except for two failures that are not this plan's (see Log).

## Docs checklist

- [x] STATUS row.
- [x] Journal.
- [x] ADR 0252.

## Log

- 2026-10-21 — Created from the owner's request (relayed by the plan 261 session).
- 2026-10-21 — Done. ADR 0252. `bun run typecheck`: 0 errors (svelte-check 2069 files, 0 problems). `bun run test`: 2079 pass, 4 fail. All 4 were tests that launch the same design twice and expected the second vessel to keep the name "Probe"; they now expect "Probe 2" (`sim/test/target.test.ts`, `scripting/test/target.test.ts`). Those two files: 21 pass. `CI=true vitest run` in `apps/web`: 1341 pass, 2 fail. Both are in `sim-host-script-worker.test.ts` (a worker-thread timeout); journal 268 reports the same two failing on its own. `map-stack.test.ts`, `target-model.test.ts` and `mission-center`: 26 pass. `bun run lint`: fails only on `.claude/launch.json`, which another session edited; this plan's files pass Prettier.
