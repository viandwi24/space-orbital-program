# 223 — Fleet management

**Plan:** [plans/223-fleet-management.md](../plans/223-fleet-management.md) · **Session:** Worker C, 2026-10-20 · **ADRs:** [0208](../decisions/0208-vessel-switching-per-vessel-designs-docking-fleet.md), [0021](../decisions/0021-debris-lifecycle-and-time-warp.md) (amended), [0113](../decisions/README.md)

## What was done

| Where | What |
|---|---|
| `packages/core` | `VESSEL_TYPES`, `VesselSnapshot.type`, `rename-vessel`, `set-vessel-type`, `terminate-vessel`, `set-debris-cap`, `DEFAULT_DEBRIS_CAP`; `recoveryFactor` with the pad (200 m, 100 %) and the Space Center area (3 km, 98 %) |
| `packages/sim` | `fleet.ts`: type guess, rename, type, terminate, the debris cap; `reapDebris` keeps debris at rest on surface rails; every home site recovers |
| web | the Mission Center's Tracking: a type filter with counts, search, order by name or distance; the card's Recover (the flight's Recover dialog), Terminate, Rename and Set type, saved at once; Settings → Time: Debris kept, sent with `set-debris-cap` |
| tests | `packages/sim/test/fleet.test.ts` (5), `debris.test.ts`, `economy.test.ts` (core and sim), `mission-center/model.test.ts` (+1), `settings.test.ts`, `e2e/fleet.e2e.ts` |

## What surprised me

- **"Reaction wheel" is a wheel** to a naive `/wheel/` test: the rover guess needs `.wheel` as a word.
- **Debris on surface rails was still reaped:** the on-rails branch treated "at the ground" as a re-entry. Surface-rails debris is skipped now.
- **The test helper's `probe()` has a command pod**, so its guessed type is ship, which is right.
- **Recovery on the pad pays 100 % now**, so the economy tests that expected 98 % at the site moved.

## Decisions made (link ADRs)

- ADR 0208 covers the feature; the defaults (types as an optional field, the guess order, the radii, the cap's scope) are in the plan's Log; ADR 0021's status line names the amendment.

## Open questions / follow-ups

- Relay filtering by comms role (the plan leaves it to the comms plans): today "Relays" lists vessels the player typed Relay.
