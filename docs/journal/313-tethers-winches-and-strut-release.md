# 313 — Tethers, winches and strut release

**Plan:** [plans/313-tethers-winches-and-strut-release.md](../plans/313-tethers-winches-and-strut-release.md) · **ADR:** [0272](../decisions/0272-tethers-and-winches-rope-joint-between-vessels.md) (accepted, amended) · **Session:** part visuals session (Claude), 2026-10-22

## What was done

The owner asked about KSP's cables and struts (2026-10-21); the research and ADR 0272 followed. On 2026-10-22 the owner said to go ahead.

- **The rope is the sim's** (`packages/sim/src/tethers.ts`), not a Rapier joint: Rapier 0.12's rope joint has a fixed length and reports no force.
  - Before each physics step, for each rope: when its anchors are farther apart than its length and still separating, equal and opposite pulls at the anchors stop the separation over the step, plus a correction for the overshoot (up to 3 m/s).
  - That pull, smoothed over 0.1 s, is the tension. Above the rope's strength the rope snaps (`tether:snapped`).
- **Hooks (core):**
  - `tether(config, state)` returns `{ anchor, maxLength, length, strength, connect }`; the sim writes back `connected`, `length`, `tension` and `snapped`.
  - `socket(config)` returns `{ anchor }`.
  - The `releaseLink()` capability lets a strut let go of its far end.
  - `PartState.tether = { peer }` is saved with the world; `PartSnapshot.tether` carries what the renderer needs.
- **Attaching.** "Connect" arms a winch. It ties on to the nearest socket of another vessel within its reach, preferring the vessel's target, at the distance it finds: no jerk.
  - An armed winch wakes the socket vessels near it into flight (`wakeTetherNeighbours`).
  - Tied vessels stay in flight.
- **Stock:**
  - `stock.winch` ("Reel", radial): 40 m of rope that holds 60 kN, reeled in, held or out at 1 m/s, drawing 2 EC/s. A snapped rope stops the drum.
  - `stock.tether-socket` ("Eyelet", radial).
  - `stock.strut` on the strut: Release, and a "Release on stage" build setting.
- **Renderer.** Winch and socket models. The rope is a dark tube from the winch's anchor to the socket, sagging toward the body by its slack and straight while taut (`effects/tethers.ts`).

## Verification

`packages/sim/test/tethers.test.ts`, 5 tests:

- **Tying on and reeling in orbit:** tying on does not change the relative velocity. Reeling in closes the two vessels from 13.0 m to 1.8 m, with momentum kept to 0.0002 % against an untied control pair.
- **Snapping:** a 40 N rope snaps; the drum stops; armed again, it ties on again; Release lets go.
- **Saving:** a save and resume keep the rope and its length.
- **The crane:** four wide tanks on the ground, with a winch near the top, reel a 1 t crew cabin up 11.9 m on a 10.7 kN pull.
- **The strut:** Release cuts its link; the part stays.

## Not done (later plans)

The harpoon, a crew member carrying the hook end on EVA, fuel hoses, and the rope in the map view.
