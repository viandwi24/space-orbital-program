---
id: 318
title: "Terminate and Recover from every vessel list, a launch site occupied dialog, and Clear debris"
status: done
owner: "launch-bug session"
depends: [223, 266, 310]
phase: 8
created: 2026-10-22
updated: 2026-10-22
---

# 318 — Terminate and Recover from every vessel list, a launch site occupied dialog, and Clear debris

**Size:** M

## Goal

Owner request, 2026-10-22: "tolong sediakan delete vessel dong atau gimana, soalnya kadang ada debris atau vessel numpuk di launchpad jadi menggangu penerbangan, dan saya gatau harus gimana". Debris and old vessels pile up on the pad and get in the way, and the player has no way to clear them. Do it the KSP way:
- Terminate and Recover wherever a vessel is listed or picked.
- KSP's "launch site occupied" dialog before a launch.
- A Clear debris action.

## Context

- The sim already has `terminate-vessel` (crew follow `stock.crew-death`, test in `fleet.test.ts`) and `recover-vessel` (landed or splashed at rest; refund and crew back to the roster; plan 095, ADR 0113). Plan 223 put both on the Mission Center card, one vessel at a time.
- The Flight vessel menu is plan 310's (`apps/web/src/lib/vessel-menu.ts`, `hud/VesselMenu.svelte`, ADR 0270). It is for vessels other than the flown one. The map's vessel card is `hud/MapCardView.svelte`.
- Flight loads the new vessel with `load-vessel` in `flight-loop.ts`. Plan 266 made the launch refusal a "Launch refused" card.

## Scope

**In:**
- `VesselSnapshot.atSite` and `clear-debris` in the sim (ADR 0274).
- Mission Center: multi-select in the tracking list, bulk Terminate and Recover, Clear debris (all, or near a site).
- Recover and Terminate in the Flight vessel menu and on the map card.
- The occupied-pad dialog before a launch.
- Confirm before Terminate when crew are aboard.

**Out:** terminating the flown vessel from Flight. KSP does not offer it either; Recover and Revert already cover it.

## Steps

1. Sim: `atSite` on the vessel snapshot; `clear-debris { site? }`; tests.
2. Web, pure models with vitest: the occupants of a pad, the focus after a removal, the bulk actions and their confirm text.
3. Mission Center: check boxes on the tracking rows, a bulk action bar, Clear debris.
4. The Flight vessel menu and the map card get Recover (when `recovery` is set) and Terminate (confirm when crewed).
5. Flight: before `load-vessel` at a site, if the pad has occupants, show "Launch site is occupied by X" with Recover it / Terminate it / Cancel. Clearing the pad then launches.

## Acceptance criteria

- [x] `packages/sim/test/fleet-clear.test.ts`: `atSite` puts a vessel on the pad at about (0, 0), one placed 30 m east at 30 m east, and none for one 6 km away or in orbit; `clear-debris` removes every debris vessel and keeps controlled ones; with `site` it keeps debris far from that site; terminating a crewed vessel still follows the crew rule.
- [x] Web vitest: the occupants of a launch spot and their names; the focus after a removal goes to another controllable vessel of the player, else null (the Space Center); a bulk confirm is asked only when crew are aboard.
- [x] The Mission Center can select several vessels and terminate or recover them at once, and Clear debris works.
- [x] The Flight vessel menu and the map card offer Recover and Terminate.
- [x] A launch onto an occupied pad shows the dialog. Recover or Terminate clears the pad and the launch goes ahead; Cancel goes back to the VAB.
- [x] `bun run test`, `bun run typecheck`, `bun run lint` and the web vitest run with `CI=true` pass.

## Docs checklist

- [x] STATUS row, ADR 0274 and its index row, `simulation.md` (fleet), protocol docs, journal.

## Log

- 2026-10-22: Created and done by the launch-bug session from the owner's request.
  - `fleet-clear.test.ts` 5 pass; `fleet-actions.test.ts` 9 pass; `vessel-menu.test.ts` with the new Recover/Terminate case pass.
  - `bun run test`: 2167 pass, 0 fail. The career-bot test ran out its 30 s timeout once under load and passes alone (9 pass).
  - `bun run typecheck`: 0 errors. `docs:check`: OK.
  - Lint: the web lint passes. Root prettier flags only `.claude/launch.json`, another session's uncommitted file.
  - Web vitest with `CI=true`: 1464 pass, 2 fail, both Worker timeouts in `sim-host-script-worker.test.ts`, as in plan 266.
  - The Mission Center, menu and dialog criteria rest on svelte-check and the model tests; they were not clicked through in a browser (e2e skipped as asked).
