# 0174 — Part action descriptors: how they call actions, the compact snapshot, and custom groups

**Status:** accepted
**Date:** 2026-10-17
**Plan:** 110
**Builds on:** ADR 0102 points 1 and 2 (descriptors, groups, `action-group`, custom groups), 0033 (module descriptors from `describe(config, state)`), 0061 (binding table), 0016 (design format).

## Context

ADR 0102 fixes what a descriptor shows and that groups apply in one tick. Four things are still open. How does a descriptor reach the module's code? What goes in the snapshot, given 10 Hz and a budget of 8 kB for a 100-part vessel? How are custom groups stored in a design? And how do keys reach them, given that the binding table (ADR 0061) is a fixed list of actions?

## Decision

1. **Descriptors are part of `describe`.** `ModuleInfo.actions` is a list of `{ id, label, kind, value?, min?, max?, step?, unit?, options?, enabled, reason?, group?, icon? }`. `id` names an entry of the module's `actions`. A `toggle` calls it with a boolean, a `value` with a number in `min..max`, a `mode` with one of `options[].value`, and a `trigger` with no argument. The sim validates the argument against the descriptor before the call. `enabled: false` (with a `reason`) refuses the call.
2. **Groups** are a registry (`defineActionGroup({ id, label, icon?, order? })`, kind `action-group`). A descriptor joins a group by naming its id. `action-group { vessel, group, value? }` calls the action of every descriptor of that group on every part of the vessel, in part order, inside one dispatch, so in the same tick. Descriptors that are disabled are skipped. The command is refused when no descriptor matches. The group state is `groupState(values)`: `on` when every toggle is true, `off` when every one is false, `mixed` otherwise, and `none` when the group has no toggle.
3. **Compact snapshot.** `VesselSnapshot.actions` carries only what changes: `groups: [{ id, state, parts }]` and `states: [[part, module, action, value, enabled]]` (tuples, so 100 parts fit in 8 kB). It is set only for vessels in flight that have descriptors. Labels, kinds, ranges, options, groups and icons come from `describeModule(module, config, view)` on the host, which already has the registries, the part configs and the module views (ADR 0033). Descriptors of vessels on rails are left to plan 111, on request.
4. **Custom groups** are an optional design field `groups: [{ slot, label, members: [{ part, module, action }] }]`. `slot` is 1 to 10, `part` a design index, and the field is allowed in every `formatVersion` because it is additive. `load-vessel` maps members to part entities on the vessel state. `action-group custom.<slot>` calls each member's action through its descriptor (the group's `value` is applied to toggles). A member whose part is no longer on the vessel (staged away) is skipped.
5. **Keys.** The binding table gets ten fixed flight actions `customGroup1` to `customGroup10` under "Action groups", with no default keys (digits 2 to 0 are free, but a default would surprise players who bound them). The flight key switch sends `action-group custom.<n>` for the focused vessel.

## Alternatives considered

- **Full descriptors in every snapshot** — rejected: about 110 bytes per descriptor, so a 100-part vessel with two actions per part is 20 kB at 10 Hz.
- **Custom groups bound by name** in the binding table — rejected: the table is a fixed list with clash checks (ADR 0061). Ten slots keep it fixed, and they are what KSP players know.
- **A separate "action descriptor" hook** next to `describe` — rejected: `describe` already receives config and state, and tools already call it.

## Consequences

- **Mod API:** `ModuleInfo.actions`, `defineActionGroup`, `ctx.actionGroups`, `PartActionDescriptor`, `groupState`; additive, `API_VERSION` patch bump.
- **Protocol:** `action-group` command, `VesselSnapshot.actions`; **design format:** optional `groups`; **load report:** `registered['action-group']`.
- Stock gains `setActive` on the engine and `setDeployed` on the landing leg. Their existing actions are unchanged.
