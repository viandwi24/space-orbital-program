# 0309 — The landing prediction moves into the Guidance Computer; the Trajectories mod goes

**Status:** accepted (owner's request, 2026-10-22)
**Date:** 2026-10-22
**Plan:** plans/372-trajectories-into-guidance-landing.md
**Supersedes:** ADR 0296 points 7–8 and ADR 0307 (the Trajectories mod); the overlay API of ADR 0296 stays

## Context

The owner: "trajectory udah dihapus aja modnya pindah ke guidance aja sebagai mod di auto landing aja sekalian". The predicted path to the ground and its landing target are a landing tool; a second built-in mod with its own panel duplicates what the Guidance Computer's Landing tab is for, and its target did not reach the landing autopilot.

## Decision

1. `mods/trajectories` is removed (package, built-in registration, panel, settings). The overlay API (`defineOverlay`, `ctx.overlays`, renderer overlays) stays: the Guidance Computer now uses it, and is the guide's example.
2. The prediction (RK4 with drag and the turning ground, `predict.ts`) and its drawing move into `mods/guidance` as overlay `guidance.path`, stores `guidance.path-settings` (`{ show }`) and `guidance.landing-target`, and key events for the target and the setting.
3. **When it shows:** only in the air or coming back to the ground (never on the pad, the ground or a stable orbit, and only with an impact), and then while **Land** flies the vessel, or with the Landing tab's **Show predicted path** on (default on) while no other Guidance program flies it. In Flight it fades in from 1 to 2 km above the ground, as before.
4. **The landing target** is picked on the map (or set at the predicted impact) in the Landing tab. **Engage** passes it to `guidance.land` as `params.target` (`{ body, lat, lon }`): the deorbit waits until a burn now would come down at the target (a vacuum conic, the ground turning under it), and the descent leans its braking toward the target until the last hundred metres.
5. `PilotBody.rotation` (the body's axes, body-fixed to inertial) is added so an autopilot can place a surface point; the sim fills it.
6. The Landing tab shows the impact time, the distance to the impact or the target error, the speed at impact and the peak heating along the path.

## Consequences

- API 0.1.x patch: `PilotBody.rotation` added.
- Saved worlds with the old stores keep them unused; the overlay id changes, overlays are not saved.
- The landing's aim is only as good as the conic (no drag) at the deorbit: on a body with air the descent's lean takes up part of the error.
