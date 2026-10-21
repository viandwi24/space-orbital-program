# 0274 — Pad occupancy is a snapshot field, the host asks before a launch, and Clear debris is one command

**Status:** accepted
**Date:** 2026-10-22
**Plan:** plans/318-terminate-recover-and-occupied-pad.md

## Context

Debris and old vessels pile up on the pad: a launch then spawns into them. The owner had no way to clear them other than finding each one in the Mission Center. KSP asks "Launch site is occupied by X" with Recover, Terminate or Cancel before it launches. The sim already has `terminate-vessel` and `recover-vessel` (plans 095 and 223). What is missing is knowing what is on a pad, and a way to remove many debris vessels at once.

## Decision

1. **`VesselSnapshot.atSite: { site, east, north }`** (API 0.1.102). It gives where the vessel stands, in metres east and north of the site centre, the same plane as `SitePad` and a launch's `placement.at`. It is set while the centre of mass is within the site's `flatRadius` and less than `PAD_CLEAR_HEIGHT` (100 m) above the ground. A launch spot is occupied by every vessel within `PAD_CLEAR_RADIUS` (40 m) of it. That covers a rocket standing on the pad, wreckage around it, and a vessel hovering just over it. It does not cover the Space Center grounds 200 m away. The sim reports the position, not a pad index, because the Launch screen places a vessel at a facility's spot (`placement.at`), not at a `site.pads` entry.
2. **The host asks; `load-vessel` does not refuse.** Flight reads `atSite` from the latest snapshot before it sends `load-vessel` at a site. If the pad has occupants, it shows the dialog: Recover (when every occupant can be recovered), Terminate, or Cancel. Scripts, scenarios and tests that load two vessels at one site keep working.
3. **`clear-debris { site? }`** terminates every debris vessel of the player (`isDebris`: uncontrolled, not kept, typed as debris or untyped). With `site`, it only terminates debris on that site's body within the site's `flatRadius` of its centre. Destroy reason `terminated`.
4. **Terminate asks first only when crew are aboard.** The crew follow `stock.crew-death`. Debris goes without a question, so a bulk Terminate of debris is one click.

## Alternatives considered

- **`load-vessel` refuses onto an occupied pad** — scripts and scenarios load into a crowd on purpose. A refusal carries no list to offer Recover for, so the host would need the occupancy anyway.
- **The host works out occupancy from positions** — it needs the body's rotation, the pads' latitude and longitude, and the terrain height, all of which the sim already has. Every host would repeat that work.
- **Clear debris as many `terminate-vessel` commands** — works, but it is 250 commands at the cap, and the "near a site" test would also move to the host.

## Consequences

- The check costs one pass over the body's sites per vessel per snapshot, only for vessels on a body that has sites.
- A vessel on surface rails, or at rest, still counts as on the pad: a rocket left standing there blocks the next launch until it is recovered or terminated, as in KSP.
- Test `packages/sim/test/fleet-clear.test.ts`.
