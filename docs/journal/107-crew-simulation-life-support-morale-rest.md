# 107 — Crew simulation: life support, morale, rest, g-load

**Plan:** plans/107-crew-simulation-life-support-morale-rest.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-18), three-agent team mode · **ADRs:** [0181](../decisions/0181-crew-life-support-morale-fatigue-exposure.md) (new), [0100](../decisions/0100-crew-a-full-simulation-every-aspect-a-world-rule.md), [0109](../decisions/0109-control-needs-a-command-source-like-ksp-career-crew-preset-and-10px-text.md), [0176](../decisions/0176-crew-roster-places-xp-seats-death-salaries.md) · **Research:** none

**Status when written: criteria met here, handed over as `ready/107`.**

## What was done

| Where | What |
| --- | --- |
| `packages/core/src/life-support.ts` (new) | modes, rules, consumables, rates, grace, morale and fatigue closed forms, performance, g-load and dose constants |
| `packages/core` | member condition fields (optional in `SimSave.crew`); module hook `scrubber`; events `crew:shortage`, `crew:resupplied`, `crew:g-loc`; `VesselSnapshot.lifeSupport` and crew condition; `API_VERSION` 0.1.46 (104 took 0.1.45) |
| `packages/sim/src/life.ts` (new) | exact piecewise-linear life support, shortages, grace and death, morale, fatigue, dose, g-load, snapshots |
| `packages/sim` | `loseMember` (the death rule for one member), the flight condition ends at recovery and loss, `boardedAt` at seating; the pass after each step and rails chunk |
| `mods/stock` | resources supplies, oxygen, water, food; module `stock.scrubber`; parts life-support pack and CO2 scrubber |
| `apps/web` | `crew-card.ts` and the crew card (`CrewPanel.svelte`): condition, causes and time left, when crew is aboard |
| tests | `packages/sim/test/life-support.test.ts` (5), `apps/web/src/lib/crew-card.test.ts` (2); stock boot list |
| docs | ADR 0181, `simulation.md`, `plugin-system.md`, guide "Life support" |

## Decisions and deviations

- **Exact integration, not per-step.** A run-out under warp 1e5 is dated by `amount / rate` within the chunk, so the event time matches the prediction exactly.
- **CO2 is a scrubbing check, not a stored gas** (ADR 0181, alternatives). Containers cannot say how much room they have left.
- **The stock pod is unchanged.** The launch flow seats nobody until 108, so no flight in play changes. Every existing crew test runs in the Legacy world (Sandbox: everything off).
- **Morale and fatigue only scale the reported quality factors** (ADR 0098). Nothing reads the factors yet beyond the snapshot.
- **The crew card fills the placeholder only with crew aboard.** The roster and seating stay 108's.
- **Not checked in a browser here** (no WebGL 2 in the pane); the card is tested by server rendering.

## Follow-ups

- 108: seating crew at launch, so these rules apply in play (and the pod should carry supplies then). 111: the vessel panel. 109: EVA. Radiation limits and illness.

## Verification output

```text
bun test packages/sim/test/life-support.test.ts   5 pass
vitest src/lib/crew-card.test.ts                  2 pass
bun run docs:check                                exit 0
bun run test                                      1529 pass, 0 fail (306 s)
bun run typecheck                                 exit 0 (71 s; svelte-check 0 errors)
bun run build                                     exit 0 (6 s)
bun run --filter @orbital/web test                933 passed, 1 skipped; 3 env-only import suites (no Node here)
```
