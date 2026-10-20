# 245 — Keys: abort, stop warp, trim and held brakes

**Plan:** [plans/245-keys-abort-stopwarp-trim.md](../plans/245-keys-abort-stopwarp-trim.md) · **Session:** Worker B (M5), 2026-10-20 · **ADRs:** [0233](../decisions/0233-abort-group-trim-axes-held-brakes.md), 0174, 0206, 0161

## What was done

| Where | What |
|---|---|
| `keybindings.ts` | no key is `pending` any more: Backspace abort, `/` stop warp, Alt+A/D/Q/E yaw and roll trim, Alt+X reset; the new action `brakesHold` (B in the KSP profile, Alt+C in Classic, whose C toggle stays); the help overlay lists them |
| `flight-loop.ts` | `abort()` cuts the throttle and fires `custom.0` with a toast that says when the group is empty; `/` sets warp 1×; the trims step 0.05 per axis; reset sends three zeros; the brakes go on at key-down and off at key-up or when the window loses focus |
| `packages/core` | `ABORT_SLOT` (0); the design's slot range 0–10; `trim` takes optional `pitch`, `yaw`, `roll`; `VesselSnapshot.trim`; API 0.1.89 |
| `packages/sim` | `trimYaw` and `trimRoll` beside the pitch trim; `effectiveControl` offsets each axis with and without SAS; the snapshot carries `trim` while any axis is set |
| Hangar | the group editor lists Abort first, then Custom 1–10; the vessel panel names `custom.0` Abort |
| HUD | a `TRIM P +0.05 Y 0.00 R 0.00` chip over the read-outs while a trim is set |
| tests | keybindings (28, incl. no action pending), sim `abort-and-trim`, core `design` (trim, slot 0 and its limit), web `groups` and `vessel-model` |

## What surprised me

- **Pitch trim had no HUD read-out.** The plan said "shown in the HUD like pitch trim"; the snapshot did not carry the trim at all. It does now, for all three axes.
- **A stock Abort group does not fit the group model.** A descriptor names one group, so default members (decouplers, armed parachutes) would have been taken out of their own groups. KSP's Abort is player-assigned anyway, so it is the design's slot 0, editable in the Hangar with no new machinery.

## Decisions made (link ADRs)

- [ADR 0233](../decisions/0233-abort-group-trim-axes-held-brakes.md).

## Open questions / follow-ups

- Abort fires the group with the group rule: switches go on unless the whole group is on. A player who wants "engines off" puts the engine switches in Abort and expects the throttle cut to have done it; a dedicated "set off" per member is a later refinement.
- No e2e (paused by the owner, 2026-10-20): the keys are covered by unit tests of the key table and the sim, not by a browser run.

## Verification output

```
bun run check:affected (no e2e: paused by the owner; under /tmp/orbital-heavy.lock)
  ✓ prettier (28 changed files) · ✓ docs:check · ✓ typecheck (11 workspaces) · ✓ typecheck (web)
  ✓ bun test (10 workspaces) · ✓ web vitest (related to the change)
  check-affected: all passed in 288.3 s
keybindings 28 · sim abort-and-trim + part-actions 9 · core design 16 · web groups and vessel panel 11
```
