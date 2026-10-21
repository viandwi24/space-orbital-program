# 318 — Terminate and Recover everywhere, the occupied pad, Clear debris

**Plan:** [plans/318-terminate-recover-and-occupied-pad.md](../plans/318-terminate-recover-and-occupied-pad.md) · **Session:** launch-bug session, 2026-10-22 · **ADR:** [0274](../decisions/0274-pad-occupancy-and-clear-debris.md)

## Starting point

The sim already had `terminate-vessel` (the crew follow `stock.crew-death`, tested in `fleet.test.ts`) and `recover-vessel`. Plan 223 put both on the Mission Center card, one vessel at a time, and Terminate always asked first. What the owner lacked was a way to see that the pad was occupied, and a quick way to remove many pieces at once.

## What was done

| Where | What |
|---|---|
| `packages/core` `protocol.ts`, `protocol-schemas.ts`, `version.ts` | `VesselSnapshot.atSite { site, east, north }`, `PAD_CLEAR_RADIUS` 40 m, `PAD_CLEAR_HEIGHT` 100 m, command `clear-debris { site? }`; API 0.1.102 |
| `packages/sim` `fleet.ts`, `snapshot.ts`, `commands.ts` | `siteSpotOf` (inverse of `padLatLon`), `clearDebris` |
| `apps/web/src/lib/fleet-actions.ts` | `fleetPick`, `terminateQuestion` (null without crew), `spotOccupants`, `occupiedPrompt`, `focusAfterRemoval` |
| Mission Center | check boxes on vessel rows; a bulk bar (Recover N, Terminate, Clear selection); Clear debris (all, or near a site) with a confirm; Terminate on the card asks only when crew are aboard; a removed focus moves to another vessel or none |
| Flight vessel menu (`vessel-menu.ts`, `VesselMenu.svelte`) and the map card (`MapCardView.svelte`) | Recover (when the sim quotes it) and Terminate (a second click when crewed). The autodock session, which owns the menu, was told first |
| Flight launch (`flight-loop.ts` `clearLaunchSite`, `flight/+page.svelte`) | before `load-vessel` at a site, the vessels within 40 m of the launch spot are listed in "Launch site is occupied": Recover them / Terminate them / Cancel (back to the VAB) |

## What surprised me

The first draft reported a pad index (`pad: { site, pad }`). The Launch screen does not use pad indices: it places the vessel at a facility's spot (`placement.at`, plan 236). So the sim now reports where a vessel stands, and the host compares that with whatever spot it launches at.

## Verification

See the plan's Log for the command output. Not clicked through in a browser; e2e was skipped at the request.
