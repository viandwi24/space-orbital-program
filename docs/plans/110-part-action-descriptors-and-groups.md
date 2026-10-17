---
id: 110
title: "Part action descriptors and action groups"
status: in-progress
owner: "Agent 3"
depends: []
phase: 7
created: 2026-10-17
updated: 2026-10-17
---

# 110 — Part action descriptors and action groups

## Goal

Modules describe their actions and state (toggle, value, trigger, mode; enabled with a reason; group; icon) through their descriptor; an `action-group` command applies an action to every part of a group in one tick; players can define custom groups saved with the design and bound to keys.

## Context

- ADRs: 0102 points 1 and 2, 0033 (descriptors), 0061 (binding table), 0174 (written in step 1: descriptor fields, how a descriptor calls an action, compact snapshot, custom groups).
- Read: `packages/core/src/module-info.ts` (`describeModule`), `moduleInfoSchema` in `packages/core/src/schemas.ts`, `ModuleDefinition.describe`/`actions` in `definitions.ts`, `mods/stock/src/modules.ts` (engine, reaction wheel, landing leg, decoupler actions), `packages/sim/src/commands.ts` (`action`), `packages/sim/src/snapshot.ts`, `vesselDesignSchema` in `packages/core/src/protocol-schemas.ts` and `validateDesign` in `design.ts`, `apps/web/src/lib/keybindings.ts` and the flight key switch in `apps/web/src/lib/flight-loop.ts`.

## Scope

**In:**
- `ModuleInfo.actions`: descriptors `{ id, label, kind: toggle | value | trigger | mode, value?, min?, max?, step?, unit?, options?, enabled, reason?, group?, icon? }`. `id` names the module action the descriptor calls: a toggle with a boolean, a value with a number, a mode with an option's value, a trigger with no argument. Stock: engine (toggle `setActive`, group `stock.engines`; new action), reaction wheel (toggle `setEnabled`), landing legs (toggle `setDeployed`, group `stock.landing-gear`; new action), decoupler (trigger `decouple`, disabled with a reason once fired). The heat shield and the aero modules have no action.
- `defineActionGroup({ id, label, icon?, order? })`, registry kind `action-group`, `ctx.actionGroups`. Stock groups (ADR 0102): engines, batteries, solar, lights, antennas, science, docking, landing gear, parachutes.
- Command `action-group { vessel, group, value? }`: calls the action of every descriptor of that group on the vessel in the same dispatch, and refuses when none matches. `group` is a registered id, or `custom.<slot>` for a custom group of the vessel. Group state `on | off | mixed` is computed from the group's toggle values (`groupState`, pure, in core).
- Design format: optional `groups: [{ slot: 1..10, label, members: [{ part: <design index>, module, action }] }]` in any `formatVersion` (additive). `validateDesign` checks the slot, the part and the module. `load-vessel` keeps them on the vessel as entity ids, and a member on a part that left the vessel is skipped. Binding table: flight actions `customGroup1`..`customGroup10` (heading "Action groups", no default keys); the flight key switch sends `action-group custom.<n>`.
- Snapshot: `VesselSnapshot.actions = { groups: [{ id, state, parts }], states: [[part, module, action, value, enabled]] }` for vessels in flight that have descriptors. The static fields come from `describeModule(module, config, view)` on the host (ADR 0033). Budget: under 8 kB of JSON for a 100-part vessel (measured).

**Out:** the vessel panel UI (111); descriptors of vessels on rails in the snapshot (on request, 111); a Lights module or other stock modules for the empty groups (later plans).

## Touches

- **Size:** S
- **Edits:** `packages/core` (`schemas.ts` `moduleInfoSchema`, `definitions.ts`, `action-groups.ts` new, `registry.ts`, `plugin.ts`, `protocol.ts`, `protocol-schemas.ts`, `design.ts`, `version.ts`, `index.ts`), `packages/sdk`, `packages/sim` (`commands.ts`, `snapshot.ts`, `state.ts`, `actions.ts` new, tests), `mods/stock` (modules, groups, tests), `apps/web/src/lib/keybindings.ts`, `apps/web/src/lib/flight-loop.ts` (the key switch), `docs/architecture/plugin-system.md`, `docs/architecture/simulation.md`, `docs/guides/writing-a-mod.md`
- **Shared contracts:** **SDK (descriptor fields, `defineActionGroup`), protocol (`action-group`, snapshot descriptors), design format (optional `groups`)**

## Design notes

Size: descriptors for a 100-part vessel stay under 8 kB in the snapshot (measured).

## Steps

1. ADR 0174; descriptor schema; stock descriptors and the two new actions.
2. Group registry, stock groups, `groupState`, `action-group`, snapshot `actions`.
3. Custom groups in designs, on vessels and in the binding table; the key switch.
4. Size measurement test.

## Acceptance criteria

- [ ] `bun test packages/sim/test/part-actions.test.ts`: `action-group stock.engines false` turns every engine off in the same dispatch (the next snapshot shows them all off); with one engine on the group state is `mixed`, all on `on`, all off `off`; an unknown group is refused.
- [ ] Same file: a custom group from the design (`custom.1`) applies its members' actions; after staging, a member on the separated part is skipped.
- [ ] `bun test packages/core/test/design.test.ts` (new cases): a design with custom groups round-trips through `vesselDesignSchema` and `validateDesign`; an old design without the field loads; a member naming a missing part or module is an error.
- [ ] Same sim test file: `JSON.stringify(snapshot.vessels[0].actions).length` for a 100-part vessel is under 8 192 bytes (test asserts the bound and prints the size).
- [ ] `bunx vitest run src/lib/keybindings.test.ts` (apps/web): `customGroup1`..`customGroup10` exist with no default keys and bind without clashes.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/110-part-action-descriptors-and-groups.md` written.
- [ ] `plugin-system.md`, `guides/writing-a-mod.md` (actions).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0102).
- 2026-10-17 — Refined and claimed by Agent 3. The snapshot carries compact action states and group states, not full descriptors: full descriptors for 100 parts do not fit in 8 kB, and the host already derives the static fields with `describeModule` (ADR 0033). Custom groups use slots 1–10 bound to fixed actions `customGroupN`, as KSP's custom groups do. `flight-loop.ts` is added to Edits for the key switch. Design choices go in ADR 0174.
- 2026-10-17 — The custom group keys default to Numpad 1–9 and 0, not "no default keys": the binding table requires a default key for every action and a help row for every action (existing tests), and the digit row is taken by the SAS modes. ADR 0174 point 5 says so.
- 2026-10-17 — Implemented as refined. Measured: snapshot actions of a 100-part vessel are 4 618 bytes. The descriptor and group zod schemas live in `schemas.ts`, which avoids an import cycle with `action-groups.ts`.
- 2026-10-17 — Rebased after the 084 merge (clean); 084 took `API_VERSION` 0.1.33, so 110 is 0.1.34.
