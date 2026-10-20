# 262 — Throttle climbs back to 100 % by itself in the Landing lesson

**Plan:** [plans/262-lesson-throttle-runaway.md](../plans/262-lesson-throttle-climbs.md) · **Session:** Worker C, 2026-10-21 · **Item 23** of the [owner manual test](../reviews/2026-10-20-owner-manual-test.md)

## What I checked

- **Plan 257's resend** (`throttle-retry.ts`, `sentThrottle`): it only sends the page's own `throttle` again, after the warp changed; it cannot raise it. Not the cause.
- **The lesson** (`lessons.ts`, `lesson-gate`): setup is one `setLocation`; no step sets a throttle; the gate only filters keys. Not the cause.
- **The governor, the warp stops, X:** none touches the throttle. In the dev build the Landing lesson behaves: `Z` gives 100 %, `X` cuts to 0 and it stays there.
- **What the gauge shows:** the engines' real throttle (`vesselThrottle`, "scripts and the autopilot included"), not only the key state. So a gauge that climbs again after X is a key held, a script, or the autopilot raising it.

## What I found and fixed (each with a unit test)

| Defect | Why it matches the report | Fix |
|---|---|---|
| **A modifier stuck in the held set.** The flight keeps held keys from key-down and key-up; a modifier whose key-up never came (focus lost under Ctrl or Alt, a system shortcut) stayed held. A stuck Shift is Throttle up: it climbs from 0 to 100 % by itself, and X only cuts for one frame. The lesson asks for `Alt+3`, so the Option key goes down in this very step | the owner's picture: a rise again and again after X | `dropStaleModifiers` (`held-modifiers.ts`): every key and pointer event says which modifiers are down; the ones it says are up leave the held set. Tests in `held-modifiers.test.ts` |
| **X did not outrank a held throttle key** | "even after X" | cutting the throttle also drops the keys held for Throttle up and down |
| **A closed script sandbox was handed to the next world.** `end()` closed it but kept it, so the next world's `scriptSandbox()` returned the closed one with its old state | a script of an earlier world is the other thing that would raise the throttle after X; a new world must start clean | `end()` forgets the sandbox. Test: `world-session.test.ts` (fails without the fix) |

## Not confirmed

I could not reproduce the climb in the dev build, so the first row is the likeliest reading, not a proven one. If it still happens: Debug → Info shows the held keys and the script status; note whether a script is running (Script panel) and whether Shift or Ctrl was down.
