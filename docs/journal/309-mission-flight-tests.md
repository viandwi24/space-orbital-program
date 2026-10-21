# 309 — Mission flight tests

**Plan:** [plans/309-mission-flight-tests.md](../plans/309-mission-flight-tests.md) · **Session:** part visuals session (Claude), 2026-10-21

## What was done

Five headless flights in `apps/web/src/lib/editor/mission-flights.test.ts`, each built from the Hangar's blueprint code:

| Flight | What it checks |
| --- | --- |
| Trailblazer Rover | wheel throttle 1 for 8 s: 10–96 m against the turning ground, no part lost |
| Wayfarer Shuttle | stage, full throttle, SAS hold: 3.5 km straight up in 25 s, 24 of 24 parts |
| Kronos capsule (pod-3 and wide shield) | shallow entry at 60 km and 2 km/s: semi chute near 8 km, full at 1 km, down below 10 m/s |
| Selene lander (descent and ascent stages) | from 1.5 km on the moon, a proportional throttle: settles, legs out, all parts on |
| Horizon Station | a ferry's port 0.6 m above the hub's top port, closing at 0.25 m/s: the two merge |

## What surprised me

- **The shuttle as the real one is built cannot fly in our scale.** Its centre of mass sits almost on the tank's axis (x −3.1 m). The orbiter's 2.1 MN engines are 3.1 m off that axis (6.5 MN·m), and a 6° gimbal over a 3.7 m lever gives 0.8 MN·m. The real stack is 56 m tall, which is why canted SSMEs worked there. Wayfarer now has its core engines under the tank, as Energia flew Buran: an `engine-plate-8`. The boosters gimbal 6° (the real SRBs did 8°), and the big engine plates 5°. The orbiter's tail stays, unstaged.
- **pod-3's reefed canopy had ten times the drag of its full one** (`10 * chutes` where a fraction was meant). The capsule hung at 3.6 m/s from 8 km. It is now `chutes / 40`, near the stock chute's 10 of 480.
- **A straight-down drop from 30 km at 1.2 km/s tears any chute.** The test uses a shallow entry, as a capsule really flies.
- **Inertial speed lies on a turning planet.** The rover and the capsule are measured against the ground: a turned ground point, and the vertical speed.

## Verification output

```
apps/web vitest mission-flights.test.ts: 5 pass
bun test mods/stock: 162 pass (snapshot: srb-xl gimbal, plate gimbals, pod-3 semi area)
```
