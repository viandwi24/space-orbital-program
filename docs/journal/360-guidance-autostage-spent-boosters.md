# 360 — Guidance autostage drops spent boosters

**Plan:** [plans/360-guidance-autostage-spent-boosters.md](../plans/360-guidance-autostage-spent-boosters.md) · **Session:** rendezvous session (Claude) · **Date:** 2026-10-22

## What was done

- The sim's pilot facts gain `nextStage: { drops, ignites } | null` (`packages/sim/src/pilot-facts.ts`): the parts the next stage's separators cut away (the side without the root, unless only the other side is controlled, the same rule as `splitVessel`; separators with "fires with staging" off are skipped) and the engines it lights. `VesselPilot.nextStage` reads it; the SDK exports `PilotStage` and `PilotEngine`.
- `autoStage` (`mods/guidance/src/autopilots.ts`): an engine is spent when it reads `flameout`. With engines burning, it stages 0.5 s after a spent one appears, only when the next stage drops a spent engine and keeps every burning one. With none burning, it stages when the next stage lights an engine (or drops a spent one while an engine with propellant stays). Never when the stage drops a crewed part, never past the last stage. Without stage facts (a host that gives none) the old rule stays.

## What surprised me

- With the external tank still on, the Wayfarer cannot hold its attitude for the orbit burn (pointing error swinging 30–170°). The tank drop at main engine cut-off stays the player's; the test stages it as the plan-356 test does.

## Verification output

```
wayfarer autostage: boosters out at 59.1 s, dropped at 59.7 s
web vitest mission-flights: 8 pass
bun test mods/guidance (with autostage.test.ts) + vessel-pilot + sim autopilot: pass
```
