# 249 — EVA: helmet on and off, a personal parachute

**Plan:** [plans/249-eva-helmet-chute.md](../plans/249-eva-helmet-chute.md) · **Session:** Worker B (M5), 2026-10-20 · **ADRs:** [0237](../decisions/0237-eva-helmet-and-personal-parachute.md), 0209, 0203

## What was done

| Where | What |
|---|---|
| `packages/core` | `atmosphere.breathable` in the body schema; `Ambient.breathable`; API 0.1.92 |
| `packages/sim` | `ambientAt` passes the flag |
| `mods/stock` | Home is breathable; `ModuleHelmet` (`stock.helmet`) and `helmetMayComeOff`; the suit gets the helmet and a `stock.parachute` of suit scale (`PERSONAL_CHUTE`, 55 m²) |
| `packages/renderer` | the suit's helmet is the moving piece (hidden while off); the parachute generator's canopy is shared (`canopyDynamic`) and drives a 4 m dome over the suit |
| `apps/web` | EVA keys O (helmet) and U (chute) in both profiles, help rows, `SuitStatus.helmet` and `chute`, crew panel line and buttons, toasts for a refused helmet and a spent chute |

## What surprised me

- Nothing in the sim knew whether air could be breathed: the plan said "breathable air", so the body gets a flag.
- The existing parachute module needed no change: a suit is a part, and the module's tearing, "when safe" and cut apply as they are.
- A suit stepping out at 3 km falls with its empty pod; the damage event must be filtered to the suit in tests.

## Decisions made (link ADRs)

- [ADR 0237](../decisions/0237-eva-helmet-and-personal-parachute.md): U for the chute, P stays pause.

## Open questions / follow-ups

- No e2e (paused by the owner, 2026-10-20): the keys, the crew panel buttons and the look of the helmet and canopy are not seen in a browser run.
- The helmet does not change oxygen use; fall damage and suit lights stay out (P1).
- The Sol mod's atmospheres are not marked breathable.

## Verification output

```
bun run check:affected (no e2e: paused by the owner; under /tmp/orbital-heavy.lock)
  ✓ prettier · ✓ docs:check · ✓ typecheck · ✓ bun test (10 workspaces) · ✓ web vitest (844 tests)
  check-affected: all passed in 254.4 s
sim eva-helmet-chute 5 · renderer suit-helmet-chute 2 · web eva-model, keybindings, script-api-members
```
CI: see the completion commit.
