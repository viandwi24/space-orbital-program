# 132 — HUD: funds read-out and the recovery dialog

**Plan:** [plans/132-hud-recovery-and-funds.md](../plans/132-hud-recovery-and-funds.md) · **Session:** Agent 1 (Lead), 2026-10-18 · **ADRs:** [0113](../decisions/0113-economy-core-ledger-costs-charges-recovery.md) · **Research:** none

**Status when written: criteria met.**

## What was done

| Where | What |
|---|---|
| `apps/web/src/lib/flight-loop.ts` | `FlightHud.funds` (null with the economy off) and `FlightHud.recovery` (the focused vessel's quote); `Flight.recover()` sends `recover-vessel`; after it the flight is not "lost" and the save carries no focused vessel |
| `apps/web/src/lib/hud` | `FundsCapsule.svelte`, `RecoverDialog.svelte`, `recovery-model.ts` (value, distance, factor, credit as text) |
| `apps/web/src/routes/flight` | the capsule and the Recover button beside the world capsule; confirming autosaves and opens the Hangar |
| tests | vitest `hud/recovery.test.ts` (3); Chromium `e2e/recovery.e2e.ts` |

## What surprised me

- **The next flight pays the price again.** A launch resumes the world's newest save (plan 108) and charges the vessel's cost, which is its value at the pad, so the e2e checks `before + credit - credit / 0.98` rather than "funds went up".
- The Hangar keeps the design after a recovery, so the second launch skips "Load the two-stage example".
