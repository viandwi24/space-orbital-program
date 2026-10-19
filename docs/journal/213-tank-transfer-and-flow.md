# 213 — Tank transfer, flow locks, rates

**Plan:** [plans/213-tank-transfer-and-flow.md](../plans/213-tank-transfer-and-flow.md) · **Session:** Worker A, 2026-10-19 · **ADRs:** [0220](../decisions/0220-flow-locks-transfers-measured-rates.md) · **Research:** 03 §2.6, 05 §3.3–3.4, 15a §5

## What was done

| Where | What |
|---|---|
| `packages/core` | store hooks `capacity`, `locked`, `setLocked`; `ResourceDefinition.transferRate`; commands `transfer`, `set-flow-lock`; `ResourceSnapshot` on parts and vessels; `VesselSnapshot.transfers`; API 0.1.80 |
| `packages/sim` | flow searches skip locked stores; `transfer.ts` (jobs, refusals, measured rates, snapshot rows); keyed action ids `name:key` |
| `mods/stock` | container lock state, `setLock:<resource>` toggles, Transfer out / in triggers; charge transfers at 50 EC/s |
| web | debug API `send`; the HUD's resource totals come from the snapshot with rates |
| tests | `transfer.test.ts`, `flow-lock.test.ts`, `resource-rates.test.ts`, `e2e/tank-transfer.e2e.ts` |

## What surprised me

- **A descriptor id names one action,** so one lock per resource needed the `name:key` convention (ADR 0220 point 4) rather than an action per resource id.
- **Measuring rates beats modelling them:** every draw (engines, RCS, life support, transfers, producers) shows without each one reporting.
- **Measuring every vessel's stores every step was too slow:** CI's career-bot tests went from under 45 s to 76 s. Only vessels in flight or with a transfer are measured now (about 10 s each locally), and each part once every 0.1 s instead of twice per step; a 100-part determinism test that sat near bun's 5 s default got an explicit timeout.
- **A resumed pad vessel is not byte-exact** (ground contact), so the resume test compares the stores, rates and jobs, not the whole snapshot.

## Decisions made (link ADRs)

- ADR 0220; the rest in the plan's Log.

## Open questions / follow-ups

- A vessel of many tanks adds four action states per container to the actions snapshot; plan 214 may want to send the per-resource controls on request.
- Plan 214: the transfer picker, the Resources tab, and a `ship.transfer` for scripts with it.

## Verification output

```
check:affected --build --e2e e2e/tank-transfer.e2e.ts: all passed in 401.3 s
  bun test (10 workspaces) 1763 pass, 0 fail; typecheck 11 workspaces + web clean
  e2e tank-transfer.e2e.ts (chromium): 1 passed
web vitest (CI=true, full): 1128 pass
transfer.test 4 pass (100 u at 20 u/s in 5 s ± one step), flow-lock.test 2 pass, resource-rates.test 1 pass
100-part vessel actions snapshot: 7640 bytes (budget 8192)
```
