/**
 * The Hangar's action group editor (plan 218, ADR 0174 and 0225): the stock groups a part's
 * controls belong to by their descriptors, and the custom groups 1–10 the design lists. A part's
 * switches and triggers can join a custom group; the edit goes to the symmetry group unless "Only
 * this part", as one undo step.
 */
import {
	describeModule,
	withSettings,
	type ActionGroupDefinition,
	type PartActionDescriptor,
	type VesselDesign
} from '@orbital/core';
import { commitDesign, groupOf, type Content, type EditorState } from './state';

export const CUSTOM_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export interface GroupMember {
	part: number;
	module: string;
	action: string;
}

/** A control of a part a group can hold: a switch or a trigger. */
export interface GroupAction extends Pick<PartActionDescriptor, 'id' | 'label' | 'kind' | 'group'> {
	module: string;
}

/** Part `index`'s controls a group can fire, from its descriptors with the design's settings. */
export function groupActions(
	design: Pick<VesselDesign, 'parts'>,
	content: Content,
	index: number
): GroupAction[] {
	const entry = design.parts.find((p) => p.index === index);
	const def = entry && content.parts.get(entry.part);
	if (!entry || !def) return [];
	const out: GroupAction[] = [];
	for (const [moduleId, base] of def.modules ?? []) {
		const mod = content.modules.get(moduleId);
		if (!mod?.describe) continue;
		try {
			const info = describeModule(mod, withSettings(base, entry.settings?.[moduleId]));
			for (const d of info?.actions ?? [])
				if (!d.buildOnly && (d.kind === 'toggle' || d.kind === 'trigger'))
					out.push({
						id: d.id,
						label: d.label,
						kind: d.kind,
						module: moduleId,
						...(d.group ? { group: d.group } : {})
					});
		} catch {
			// a module whose describe throws offers nothing
		}
	}
	return out;
}

/** The parts of the design in stock group `group` (by descriptor), ascending index. */
export function stockGroupParts(
	design: Pick<VesselDesign, 'parts'>,
	content: Content,
	group: string
): number[] {
	return design.parts
		.filter((p) => groupActions(design, content, p.index).some((a) => a.group === group))
		.map((p) => p.index)
		.sort((a, b) => a - b);
}

/** Stock groups with a member on the design, in their order. */
export function stockGroupsOf(
	design: Pick<VesselDesign, 'parts'>,
	content: Content,
	groups: readonly ActionGroupDefinition[]
): ActionGroupDefinition[] {
	const used = new Set(
		design.parts.flatMap((p) =>
			groupActions(design, content, p.index).flatMap((a) => a.group ?? [])
		)
	);
	return [...groups].filter((g) => used.has(g.id)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** The members of custom group `slot`. */
export const customMembers = (design: Pick<VesselDesign, 'groups'>, slot: number): GroupMember[] =>
	design.groups?.find((g) => g.slot === slot)?.members ?? [];

const same = (a: GroupMember, b: GroupMember): boolean =>
	a.part === b.part && a.module === b.module && a.action === b.action;

/**
 * Puts a part's control in custom group `slot` (or takes it out), with the same control of its
 * symmetry counterparts unless `single`. An emptied group leaves the design. One undo step.
 */
export function setGroupMember(
	state: EditorState,
	content: Content,
	slot: number,
	member: GroupMember,
	on: boolean,
	options: { single?: boolean } = {}
): EditorState {
	if (!CUSTOM_SLOTS.includes(slot as (typeof CUSTOM_SLOTS)[number]))
		throw new Error(`no custom group ${slot}`);
	const parts = options.single ? [member.part] : groupOf(state.design, member.part);
	const wanted = parts
		.map((part) => ({ ...member, part }))
		.filter((m) =>
			groupActions(state.design, content, m.part).some(
				(a) => a.module === m.module && a.id === m.action
			)
		);
	if (wanted.length === 0) throw new Error('that part has no such control');
	const old = customMembers(state.design, slot);
	const members = on
		? [...old, ...wanted.filter((m) => !old.some((o) => same(o, m)))]
		: old.filter((o) => !wanted.some((m) => same(o, m)));
	const others = (state.design.groups ?? []).filter((g) => g.slot !== slot);
	const label = state.design.groups?.find((g) => g.slot === slot)?.label ?? `Custom ${slot}`;
	const groups = [...others, ...(members.length > 0 ? [{ slot, label, members }] : [])].sort(
		(a, b) => a.slot - b.slot
	);
	const { groups: _old, ...rest } = state.design;
	return commitDesign(state, content, groups.length > 0 ? { ...rest, groups } : rest);
}
