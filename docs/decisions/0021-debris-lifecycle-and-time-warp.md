# 0021 — Debris lifecycle: ballistic debris on rails, removed at re-entry or at rest

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/013-debris-lifecycle.md

## Context

Time warp needs every vessel on rails (ADR 0017). Flight vessels go on rails only in a stable orbit (periapsis above the atmosphere), so a stage discarded during ascent stays in flight on a suborbital path until it hits the ground. Reproduced headlessly with the scripted two-stage ascent: staged at 61 s, orbit at 213.6 s, debris on the ground at 380.3 s (plan 012 destroys it there), `warp` refused from 214 s to 380 s naming the debris. Debris that survives a soft landing would lie on its ground tile and block warp forever. Rails have no drag: a vessel on a ballistic conic would fall through the atmosphere without noticing it.

## Decision

Uncontrolled debris is dropped from the simulation when it cannot matter any more, and propagated analytically while it can still only fall. Three rules, all decided from state and `t` (no clock, no PRNG), all skipping any vessel with a `controlSource` part:

1. **Ballistic debris goes on rails.** A flight vessel without a control source, idle for 2 s (`RAILS_IDLE_TIME`), not landed, more than `GROUND_TILE_EXIT` (400 m) above the surface, not in a stable orbit, and either climbing (radial speed > 0) or at or above the atmosphere top, goes on rails (`vessel:mode-changed` reason `ballistic debris`). A descending vessel below the atmosphere top stays in flight and takes ground impact damage as in plan 012. Stable-orbit debris keeps plan 007's rule.
2. **Re-entry removes it.** An on-rails vessel without a control source and not in a stable orbit is destroyed (`vessel:destroyed`, reason `debris re-entered the atmosphere`) when it descends (radial speed < 0) below the atmosphere top or reaches the surface. It is checked at the end of every step (flight step or rails chunk of at most 10 s), so the event may come up to one chunk after the crossing. Radial states and near-parabolic orbits work through the existing state-vector rails.
3. **Debris at rest is removed.** A flight vessel without a control source, in contact with its ground tile, idle for `DEBRIS_REST_TIME` (10 s) and moving less than `DEBRIS_REST_SPEED` (0.1 m/s) relative to the rotating ground, is destroyed (reason `debris at rest on the surface`).

Controlled vessels (any module with `controlSource`) are never put on rails by rule 1, never removed by rules 2 and 3, and a controlled vessel standing on the ground still blocks warp (needs surface-fixed rails: draft plan 016).

## Alternatives considered

- **Despawn after a timeout or distance from the focus** — arbitrary numbers, removes debris that is still visibly falling or orbiting, and does not explain what happens to debris in the physics frame.
- **Allow warp with uncontrolled flight vessels far away** — warp would run fixed 50 Hz flight steps (or leave the vessel frozen), so the cost of warp would be the cost of flight; the "every vessel on rails" invariant of ADR 0017 would be gone.
- **Run the atmospheric descent on rails with drag** — needs integration on rails, which is exactly what rails avoid; rails with no drag overstate how long debris lives, so removal at the atmosphere top is the cheap, defensible cut.
- **Remove only at ground impact** — keeps a descending stage on rails through the whole atmosphere with no drag (unphysical) and leaves orbits with periapsis in the atmosphere (never reaching the ground) on rails forever.
- **Put landed vessels on surface-fixed rails** — right for controlled vessels, a new rails kind that touches the snapshot, wake-up and every consumer; out of scope (draft plan 016). Debris does not need to be preserved.

## Consequences

- A player can warp right after reaching orbit; the discarded stage falls back and disappears (on rails, at the atmosphere top) without ground impact events. Debris descending below the atmosphere top in flight still crashes with `part:damaged` as before.
- Grazing debris that neither climbs nor reaches the atmosphere top (a circular path inside the atmosphere) stays in flight until drag brings it down; known limitation.
- Plan 014 (re-entry heating) will want debris to burn rather than vanish; the removal point (atmosphere top) is one function (`reapDebris` in `modes.ts`).
- Uncontrolled vessels the player loads on purpose (a bare tank on the pad) are removed after 10 s at rest: acceptable until a mod needs persistent uncontrolled vessels (then a per-vessel flag, new ADR).
- API: no protocol change; `vessel:destroyed` reasons are new strings. `simulation.md` and the glossary are updated.
