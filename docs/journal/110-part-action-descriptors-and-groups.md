# 110 — Part action descriptors and action groups

**Plan:** plans/110-part-action-descriptors-and-groups.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-17), three-agent team mode · **ADRs:** [0174](../decisions/0174-part-action-descriptors-calls-compact-snapshot-and-custom-groups.md) (new), [0102](../decisions/0102-vessel-panel-part-actions-dock-panels-and-the-mission-center.md) · **Research:** none

**Status when written: criteria met here, handed over as `ready/110`.**

## What was done

| Where | What |
| --- | --- |
| `packages/core/src/action-groups.ts` (new) | `PartActionDescriptor`, `ActionGroupDefinition`, `groupState`, `actionArgumentProblem`, `DesignActionGroup`, `customGroupId`; schemas in `schemas.ts` (`ModuleInfo.actions`, `partActionDescriptorSchema`, `actionGroupDefinitionSchema`) |
| `packages/core` | registry `actionGroups` (kind `action-group`), `ctx.actionGroups`, command `action-group`, `VesselSnapshot.actions`, design `groups` and their validation; `API_VERSION` 0.1.34 (084 took 0.1.33) |
| `packages/sim/src/actions.ts` (new) | `partActions`, `actionsSnapshot`, `applyActionGroup`; wired into `commands.ts`, `snapshot.ts`, `vessel.ts` (custom groups on the vessel) |
| `mods/stock` | descriptors for engine, reaction wheel, landing legs and decoupler; actions `setActive` and `setDeployed`; nine groups |
| `apps/web/src/lib` | `customGroup1..10` (Numpad 1–9, 0) with a help row; the flight key switch sends `action-group custom.<n>` |
| tests | `packages/sim/test/part-actions.test.ts` (5), `packages/core/test/design.test.ts` (2 new), `apps/web/src/lib/keybindings.test.ts` (1 new) |
| docs | ADR 0174, `plugin-system.md`, `simulation.md`, guide "Part actions" |

## Decisions

- **Compact snapshot** (ADR 0174 point 3): 4 618 bytes for a 100-part vessel (99 descriptors), against an estimated 20 kB for full descriptors.
- **Custom group keys** on the number pad. The digit row belongs to the SAS modes, and the binding table's own tests require a default key and a help row for every action.
- The descriptors reuse `describe`, so tools (`describeModule`) and the sim see the same list.

## What surprised me

- `schemas.ts` and `action-groups.ts` imported each other and failed at runtime ("Cannot access 'definitionIdSchema' before initialization"), even though `tsc` was happy. The schemas now live in `schemas.ts`, and `action-groups.ts` imports nothing from it.
- In `defineModule`, a `describe` that reads `state` written before `state` broke the inference of the state type (landing leg). Writing `state` first fixes it.

## Follow-ups

- Plan 111 builds the vessel panel from `describeModule` plus `VesselSnapshot.actions`, and asks for descriptors of vessels on rails.
- Stock has no modules yet for batteries, solar, lights, antennas, science, docking or parachutes; the groups exist for mods and later plans (190 adds a solar panel).

## Verification output

See the `ready/110` tag message.
