/**
 * Part actions and action groups in the sim (plan 110, ADRs 0102 and 0174): descriptors from each
 * module's `describe(config, state)`, the compact snapshot, and `action-group`.
 */
import { failureOf } from './reliability.ts';
import {
	actionArgumentProblem,
	customGroupId,
	groupState,
	type CommandResult,
	type EntityId,
	type ModuleContext,
	type PartActionDescriptor,
	type VesselSnapshot
} from '@orbital/core';
import { moduleDefOf, moduleState, partOf, vesselOf, type SimCore } from './core.ts';
import { makeContext } from './hooks.ts';

export interface PartAction {
	part: EntityId;
	module: string;
	d: PartActionDescriptor;
}

/** Every descriptor on the vessel, in part order, then module order, then descriptor order. */
export function partActions(core: SimCore, vesselId: EntityId): PartAction[] {
	const out: PartAction[] = [];
	for (const part of vesselOf(core, vesselId).parts) {
		for (const m of partOf(core, part).modules) {
			const def = moduleDefOf(core, m.id);
			if (!def.describe) continue;
			const actions = def.describe(
				m.config as never,
				moduleState(core, part, m.id) as never
			).actions;
			// a failed module's actions are disabled with the failure as the reason (ADR 0156 point 2)
			const failure = failureOf(core, part, m.id);
			for (const d of actions ?? []) {
				if (d.buildOnly) continue; // a Hangar-only control (plan 218)
				out.push({
					part,
					module: m.id,
					d: failure ? { ...d, enabled: false, reason: `Failed: ${failure.label}` } : d
				});
			}
		}
	}
	return out;
}

/** The members of a group on the vessel: registered by descriptor `group`, custom by its members. */
function membersOf(
	core: SimCore,
	vesselId: EntityId,
	group: string,
	all: PartAction[]
): PartAction[] | undefined {
	const vessel = vesselOf(core, vesselId);
	const custom = vessel.groups?.find((g) => customGroupId(g.slot) === group);
	if (custom) {
		return custom.members.flatMap((m) =>
			all.filter((a) => a.part === m.part && a.module === m.module && a.d.id === m.action)
		);
	}
	if (!core.registries.actionGroups.has(group)) return undefined;
	return all.filter((a) => a.d.group === group);
}

/** `VesselSnapshot.actions` (ADR 0174 point 3), or undefined when the vessel has no descriptors. */
export function actionsSnapshot(core: SimCore, vesselId: EntityId): VesselSnapshot['actions'] {
	const all = partActions(core, vesselId);
	if (all.length === 0) return undefined;
	const groups: NonNullable<VesselSnapshot['actions']>['groups'] = [];
	const registered = core.registries.actionGroups
		.list()
		.slice()
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	for (const g of registered) {
		const members = all.filter((a) => a.d.group === g.id);
		if (members.length > 0)
			groups.push({
				id: g.id,
				state: groupState(members.map((a) => a.d.value)),
				parts: members.length
			});
	}
	for (const g of vesselOf(core, vesselId).groups ?? []) {
		const id = customGroupId(g.slot);
		const members = membersOf(core, vesselId, id, all) ?? [];
		groups.push({ id, state: groupState(members.map((a) => a.d.value)), parts: members.length });
	}
	return {
		groups,
		states: all.map((a) => [a.part, a.module, a.d.id, a.d.value ?? null, a.d.enabled])
	};
}

const argsFor = (d: PartActionDescriptor, value: unknown): unknown[] =>
	d.kind === 'trigger' ? [] : [value];

/**
 * `action-group` (ADR 0174 point 2): every enabled member's action in one dispatch. Without a
 * `value`, toggles go on unless the group is already all on.
 */
export function applyActionGroup(
	core: SimCore,
	vesselId: EntityId,
	group: string,
	value: boolean | number | string | undefined
): CommandResult {
	const all = partActions(core, vesselId);
	const members = membersOf(core, vesselId, group, all);
	if (members === undefined) return { ok: false, reason: `unknown action group "${group}"` };
	const live = members.filter((a) => a.d.enabled);
	if (live.length === 0)
		return { ok: false, reason: `no part of vessel ${vesselId} acts in group "${group}"` };
	const toggleTo = value ?? groupState(members.map((a) => a.d.value)) !== 'on';
	let applied = 0;
	const failures: string[] = [];
	for (const a of live) {
		const arg = a.d.kind === 'toggle' ? (typeof value === 'boolean' ? value : toggleTo) : value;
		if (a.d.kind !== 'trigger' && actionArgumentProblem(a.d, arg)) continue; // another kind of control in the group
		const action = moduleAction(moduleDefOf(core, a.module), a.d.id);
		if (!action) {
			failures.push(`module "${a.module}" has no action "${a.d.id}"`);
			continue;
		}
		try {
			action(makeContext(core, a.part, a.module), ...argsFor(a.d, arg));
			applied++;
		} catch (e) {
			failures.push(
				`"${a.module}.${a.d.id}" failed: ${e instanceof Error ? e.message : String(e)}`
			);
		}
	}
	if (applied === 0) {
		return {
			ok: false,
			reason: failures[0] ?? `no control of group "${group}" takes the value ${String(value)}`
		};
	}
	return { ok: true };
}

/**
 * The action an id names (plan 213): `name`, or `name:key`, which calls action `name` with `key`
 * first, so one action serves a control per resource (`setLock:stock.liquid-fuel`).
 */
export function moduleAction(
	def: { actions?: Record<string, ((ctx: never, ...args: unknown[]) => unknown) | undefined> },
	id: string
): ((ctx: ModuleContext, ...args: unknown[]) => unknown) | undefined {
	const direct = def.actions?.[id];
	if (direct) return direct as (ctx: ModuleContext, ...args: unknown[]) => unknown;
	const at = id.indexOf(':');
	if (at <= 0) return undefined;
	const named = def.actions?.[id.slice(0, at)] as
		((ctx: ModuleContext, ...args: unknown[]) => unknown) | undefined;
	const key = id.slice(at + 1);
	return named ? (ctx, ...args) => named(ctx, key, ...args) : undefined;
}
