# 345 — Petals thrown off; no burn at separation

**Plan:** [plans/345-petals-jettison-and-kronos-staging.md](../plans/345-petals-jettison-and-kronos-staging.md) · **Session:** part visuals session (Claude), 2026-10-22

## What was done

- **The "flung payload":** the tests found no push on opening:
  - opening by action on the stack alone or the whole Kronos V: one vessel, same parts, the speed changing by gravity only;
  - staging at zero throttle: the command ship leaves at 0.49 m/s, as a decoupler pushes.

  The cause was the press that opened the petals: it also lit the service engine. Kronos V now separates and throws the petals off in one press, and lights the service engine on the next.
- **Single-use petals:**
  - `stock.bay` has `jettison`. Opening throws the four panels off at once as debris parts (`stock.petal-panel-0..3`, one quarter each), from just outside the shell, pushed straight out at 0.8 m/s.
  - Their 900 kg leaves with them, leaving the 300 kg ring.
  - The model hides its petals by `visual.deploy.gone`.
  - The cargo bay and the service bays keep doors that close again.
- **Part info:** "Panels: thrown off when opened (single use)" and a "Jettison panels" control. There is no Hangar start switch for single-use petals.

## What surprised me

- The bug was a staging choice, not physics. Separation, the petals and the engine shared one press, so with the throttle up the ship the camera follows shot away from its payload. The headless test at zero throttle made that clear, because nothing moved.
- The heavy-job lock changed under me: other sessions now use `lockf` on a file. A `mkdir` lock waits forever on a file, so I noted it in the shared notes.

## Verification output

```
apps/web vitest mission-flights.test.ts (petals): pass. Four panel vessels, lander on board, the stack's speed change < 0.05 m/s
bun test mods/stock, renderer parts and seams: 184 pass
```
