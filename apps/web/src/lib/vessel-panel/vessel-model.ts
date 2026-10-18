/**
 * The vessel panel's model (plan 111, ADR 0153): the vessel's groups with their state, and each
 * part's controls generated from its module descriptors, in a stable order. Pure.
 */
import {
	actionArgumentProblem,
	describeModule,
	type ActionGroupDefinition,
	type Command,
	type EntityId,
	type ModuleDefinition,
	type PartActionDescriptor,
	type PartDefinition,
	type VesselSnapshot
} from '@orbital/core';
import { categoryOf, type Category } from '../editor/categories';

export interface PanelContent {
	parts: { get(id: string): PartDefinition | undefined };
	modules: { get(id: string): ModuleDefinition | undefined };
	groups: readonly ActionGroupDefinition[];
}

export interface GroupRow {
	id: string;
	label: string;
	state: 'on' | 'off' | 'mixed' | 'none';
	parts: number;
}

export interface ControlRow extends PartActionDescriptor {
	module: string;
}

export interface PartRow {
	entity: EntityId;
	title: string;
	category: string;
	controls: ControlRow[];
}

export interface VesselView {
	groups: GroupRow[];
	parts: PartRow[];
}

/** Groups with members on this vessel, then parts with controls (ADR 0153 points 1 and 2). */
export function vesselView(
	vessel: VesselSnapshot,
	content: PanelContent,
	categories: readonly Pick<Category, 'id'>[] = []
): VesselView {
	const labels = new Map(content.groups.map((g) => [g.id, g.label]));
	const groups = (vessel.actions?.groups ?? [])
		.filter((g) => g.state !== 'none')
		.map((g) => ({
			id: g.id,
			label: labels.get(g.id) ?? (g.id.startsWith('custom.') ? `Group ${g.id.slice(7)}` : g.id),
			state: g.state,
			parts: g.parts
		}));
	const order = new Map(categories.map((c, i) => [c.id, i]));
	const parts: PartRow[] = [];
	for (const p of vessel.parts) {
		const def = content.parts.get(p.definition);
		if (!def) continue;
		const controls: ControlRow[] = [];
		for (const [moduleId, raw] of def.modules ?? []) {
			const mod = content.modules.get(moduleId);
			if (!mod?.describe) continue;
			try {
				for (const d of describeModule(mod, raw, p.modules[moduleId])?.actions ?? [])
					controls.push({ ...d, module: moduleId });
			} catch {
				// a module whose describe throws shows no controls; the rest go on (ADR 0153 point 1)
			}
		}
		if (controls.length === 0) continue;
		parts.push({
			entity: p.id,
			title: def.title,
			category: categoryOf(def, content.modules, categories),
			controls
		});
	}
	parts.sort(
		(a, b) =>
			(order.get(a.category) ?? 1e9) - (order.get(b.category) ?? 1e9) ||
			Number(a.entity) - Number(b.entity)
	);
	return { groups, parts };
}

/** The command a group switch sends (ADR 0153 point 3): on → off, off → on, mixed → off. */
export const groupCommand = (vessel: EntityId, g: Pick<GroupRow, 'id' | 'state'>): Command => ({
	type: 'action-group',
	vessel,
	group: g.id,
	value: g.state === 'off'
});

/** The command a part control sends with `value`, or the reason it cannot be sent. */
export function controlCommand(
	vessel: EntityId,
	part: EntityId,
	c: ControlRow,
	value?: boolean | number | string
): { command: Command } | { reason: string } {
	const problem = actionArgumentProblem(c, value);
	if (problem) return { reason: problem };
	return {
		command: {
			type: 'action',
			vessel,
			part,
			module: c.module,
			action: c.id,
			...(c.kind === 'trigger' ? {} : { args: value })
		}
	};
}

/** The vessel's transmitters for the Comms tab (plan 115): parts with an antenna module and its controls. */
export function transmitters(view: VesselView, content: Pick<PanelContent, 'modules'>): PartRow[] {
	return view.parts.flatMap((p) => {
		const controls = p.controls.filter((c) => content.modules.get(c.module)?.antenna !== undefined);
		return controls.length > 0 ? [{ ...p, controls }] : [];
	});
}
