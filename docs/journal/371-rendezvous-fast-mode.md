# 371 — Rendezvous Fast mode

**Plan:** [plans/371-rendezvous-fast-mode.md](../plans/371-rendezvous-fast-mode.md) · **Session:** rendezvous session (Claude) · **Date:** 2026-10-22

## What was done

- `fastIntercept(own, target, mu, now, floor, cap)`: departures over one orbit (8) × transfer times from a quarter to a whole orbit (16), each a damped Newton (`aimBurn`, now with a prograde first guess) to a point 150 m above the target; paths whose periapsis is under the floor are dropped; the soonest arrival whose two burns fit the cap wins.
- Fast mode: the direct intercept replaces the plane change and the Hohmann/phasing; one correction instead of two, aimed 150 m (not 300 m) above; the close phase wants twice the speed far out and brakes harder. When nothing fits the cap it says so in the log and flies the efficient plan.
- Settings `mode` (`efficient`/`fast`) and `cap` (m/s; 0 = twice the efficient estimate, never above 90 % of the delta-v left). The tab: Mode, "Before you engage" with ETA and delta-v for both modes (cached for 5 s of sim time), and the cap field.

## What surprised me

- A target ahead and higher cannot be reached sooner than the Hohmann wait without dropping under the air: catching up needs a lower orbit. Fast pays off when the efficient plan waits long, e.g. a target behind.
- Arriving at the target's height on a non-tangent path costs about as much again to match: Fast for a 30°-behind target at +50 km needs ~350 m/s, over the default 2× cap; the test sets 400 m/s.
- Newton from zero found transfers through the planet; the prograde first guess and the floor check fix that. Past one orbit it rarely converges, so the search stops at one.

## Verification output

```
efficient: holding after 19138 s, 88.2 m/s, 155 m, 0.10 m/s
fast: holding after 2022 s, 347.6 m/s, 152 m, 0.06 m/s
bun test mods/guidance: 36 pass
```
