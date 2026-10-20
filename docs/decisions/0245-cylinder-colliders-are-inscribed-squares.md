# 0245 — A cylinder part collides as squares inscribed in its circle

**Status:** accepted
**Date:** 2026-10-21
**Plan:** plans/264-pod-floats-above-moon-ground.md
**Builds on:** ADR 0017 (the flight model: one box per part, `(r, h/2, r)` for cylinders), ADR 0018 (one rigid body per vessel)

## Context

The owner saw a crashed pod roll along above the ground on Cinder, well above its own shadow (item 25). ADR 0017 gave a cylinder the box `(r, h/2, r)`: exact along the axis, "conservative sideways". Seen from the axis that box has corners at `r sqrt 2`, 41 % beyond the drawn rim. A pod lying on its side is a rolling disc to the eye and a rolling square to the solver: it rides on invisible corners, and each corner hit throws it up. Measured on flat Cinder (no terrain, so the ground cannot be the cause), a pod dropped at 9 m/s sideways from 3 m hopped up to 10 m for the next 40 s; the same drop with nothing but vertical speed bounced 4 m high after a 5 m/s fall although every restitution is 0. The ground itself agrees with what is drawn: the sim's tile height and the renderer's terrain call the same `@orbital/core` field.

## Decision

1. **A cylinder is `CYLINDER_SQUARES` (4) squares inscribed in its circle,** half side `r / sqrt 2`, the full height, each turned about the part's axis by an equal step of `90° / 4`. Sixteen corners lie on the rim; the union never reaches beyond it and fills at least 85 % of it between the corners. Along the axis the extent is exact, so stacking and separation (which use the bounding box, `halfExtentsOf`) do not change. A box part stays one box. `colliderBoxes(def)` returns them; `collectColliders` places each with the part's own turn.
2. **Mass, inertia and the bounding box are untouched** (solid-cylinder inertia was already used).
3. **Six squares were tried** (corners every 15°, 89 % fill) and given up: the resume check after a pad liftoff diverged 1.3e-2 m against 5e-3 m allowed, and four squares already stop the hops.

## Consequences

- A vessel has more collider shapes: each cylinder part is 4 boxes (a 100-part tower: 400, not 100). The tests that count them follow `CYLINDER_SQUARES`.
- The frozen parity flight (`sun-parity.json`) is re-frozen: the pad contact at liftoff moves the ascent by about 1e-5 of its length. The stones test no longer asks a tall rocket on the Moon for a tilt under 3° after 25 s (it topples slowly with either collider), and compares a resumed lander on a stone by height rather than by distance.
- Open: on the same flat run a pod still speeds up while it rolls (about 0.1 m/s per second); not looked at here.
