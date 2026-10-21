# 307 — Rover: wheels, drive mode, blueprint

**Plan:** [plans/307-rover-wheels-and-drive-mode.md](../plans/307-rover-wheels-and-drive-mode.md) · **Session:** part visuals session (Claude), 2026-10-21

## What was done

- **Sim:** a wheel throttle (`wheel-throttle`, -1..1) that the motors follow instead of the vessel throttle while it is set, and backwards when negative. A top speed per wheel fades the motor to nothing.
- **Parts:**
  - rover wheels "Pebble" S, "Trekker" M (fixed and steering each) and "Hauler" L (steering), with their motors on from the start;
  - the "Deck" chassis: a 600 EC battery, nose along +Y, and a `deck` node on its top face that a cab is turned onto (plan 308).

  The `rover-wheel` model has an arm, a coil-over strut, a hub drum and a treaded tyre.
- **Flight drive mode:** it turns on by itself within 20 m of the ground when a wheel motor is on, and Alt+G switches it. W/S drive, A/D steer (the yaw axis, as wheels already used), and pitch is held at 0. A green **Drive** chip says so.
- **Blueprint:** Trailblazer Rover is a two-seat cab on the deck, four driven wheels with the front pair steering, a solar panel and a whip. It launches lying level (`aircraft`). Its goal is `surface`, so the mission test skips liftoff for it.

## What surprised me

- The first wheel forces (7 kN each) were rocket numbers: the rover reached 21 m/s² and crashed in two seconds. Top speed and forces on a ton's scale (1.2 kN for the M wheel, 12 m/s) give about 10 m/s.
- A headless "it moved" check passes for anything on a turning planet. The test measures against the ground point turned by the planet's day, with an upper bound so a wrong sign cannot pass.

## Verification output

```
bun test packages/sim/test/rover.test.ts: 1 pass (forward > 3 m in 6 s, then back)
apps/web vitest mission-flights, missions, drive-mode, keybindings, hud: pass
bun test mods/stock: 162 pass
```
