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
	type ResourceSnapshot,
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
	/** Its switches on, of all (plan 214: "Engines 3/4"). */
	on: number;
	total: number;
}

export interface ControlRow extends PartActionDescriptor {
	module: string;
}

export interface ReadoutRow {
	id: string;
	label: string;
	value: string;
	module: string;
}

export interface PartRow {
	entity: EntityId;
	title: string;
	category: string;
	controls: ControlRow[];
	/** State the modules show as text (plan 209: a parachute's "Armed" and "Unsafe"). */
	readouts: ReadoutRow[];
	/** Its skin temperature and limit, K, while it is hot (plan 212): the panel draws a bar. */
	heat?: { temperature: number; max: number };
	/** The part can be controlled from (a command part or a docking port; plan 221). */
	controlPoint?: boolean;
	/** The vessel is controlled from this part now. */
	controlling?: boolean;
	/** The stage that fires it, 0 first (from the design record; plan 214's stage filter). */
	stage?: number;
	/** Its stores (plan 213): the Resources tab's containers. */
	resources: ResourceSnapshot[];
	/** Action groups its controls belong to, by label (plan 214's inspector). */
	groups: string[];
}

export interface VesselView {
	groups: GroupRow[];
	parts: PartRow[];
}

/** A part shows its temperature from this, K, or from half its limit (plan 212, ADR 0204 point 6). */
export const HOT_SHOWN = 400;

/** The temperature row of a part, or undefined while it is cool. */
export function heatOf(
	p: Pick<VesselSnapshot['parts'][number], 'temperature' | 'maxTemperature'>
): { temperature: number; max: number } | undefined {
	const t = p.temperature;
	const max = p.maxTemperature;
	if (t === undefined || max === undefined) return undefined;
	return t >= HOT_SHOWN || t / max >= 0.5 ? { temperature: t, max } : undefined;
}

/** Groups with members on this vessel, then parts with controls (ADR 0153 points 1 and 2). */
export function vesselView(
	vessel: VesselSnapshot,
	content: PanelContent,
	categories: readonly Pick<Category, 'id'>[] = [],
	/** The design's stages as design part indices (`stages[0]` fires first), for the stage filter. */
	stages: readonly (readonly number[])[] = [],
	/** Every part, also those with nothing to show (the inspector opens on any part; plan 214). */
	all = false
): VesselView {
	const labels = new Map(content.groups.map((g) => [g.id, g.label]));
	const labelOf = (id: string): string =>
		labels.get(id) ?? (id.startsWith('custom.') ? `Group ${id.slice(7)}` : id);
	const order = new Map(categories.map((c, i) => [c.id, i]));
	const parts: PartRow[] = [];
	for (const p of vessel.parts) {
		const def = content.parts.get(p.definition);
		if (!def) continue;
		const controls: ControlRow[] = [];
		const readouts: ReadoutRow[] = [];
		for (const [moduleId, raw] of def.modules ?? []) {
			const mod = content.modules.get(moduleId);
			if (!mod?.describe) continue;
			try {
				const info = describeModule(mod, raw, p.modules[moduleId]);
				for (const d of info?.actions ?? [])
					if (!d.buildOnly) controls.push({ ...d, module: moduleId });
				for (const r of info?.readouts ?? []) readouts.push({ ...r, module: moduleId });
			} catch {
				// a module whose describe throws shows no controls; the rest go on (ADR 0153 point 1)
			}
		}
		const point = (def.modules ?? []).some(([id]) => {
			const m = content.modules.get(id);
			return m?.controlSource === true || m?.controlPoint === true;
		});
		const heat = heatOf(p);
		const resources = p.resources ?? [];
		if (
			!all &&
			controls.length === 0 &&
			readouts.length === 0 &&
			!point &&
			!heat &&
			resources.length === 0
		)
			continue;
		const stage = p.index === undefined ? -1 : stages.findIndex((s) => s.includes(p.index!));
		const memberOf = [...new Set(controls.flatMap((c) => (c.group ? [labelOf(c.group)] : [])))];
		parts.push({
			entity: p.id,
			title: def.title,
			category: categoryOf(def, content.modules, categories),
			controls,
			readouts,
			resources,
			groups: memberOf,
			...(stage >= 0 ? { stage } : {}),
			...(heat ? { heat } : {}),
			...(point
				? {
						controlPoint: true,
						controlling: (vessel.controlPart ?? vessel.parts[0]?.id) === p.id
					}
				: {})
		});
	}
	parts.sort(
		(a, b) =>
			(order.get(a.category) ?? 1e9) - (order.get(b.category) ?? 1e9) ||
			Number(a.entity) - Number(b.entity)
	);
	// a group's count: its members' switches (toggles) on, of all (plan 214)
	const counts = new Map<string, { on: number; total: number }>();
	for (const p of parts)
		for (const c of p.controls) {
			if (!c.group || c.kind !== 'toggle') continue;
			const n = counts.get(c.group) ?? { on: 0, total: 0 };
			n.total += 1;
			if (c.value === true) n.on += 1;
			counts.set(c.group, n);
		}
	const groups = (vessel.actions?.groups ?? [])
		.filter((g) => g.state !== 'none')
		.map((g) => ({
			id: g.id,
			label: labelOf(g.id),
			state: g.state,
			parts: g.parts,
			on: counts.get(g.id)?.on ?? 0,
			total: counts.get(g.id)?.total ?? g.parts
		}));
	return { groups, parts };
}

/** A group's label with its count, "Engines 3/4" (plan 214). */
export const groupText = (g: Pick<GroupRow, 'label' | 'on' | 'total'>): string =>
	`${g.label} ${g.on}/${g.total}`;

/** The parts a search and a stage filter keep (plan 214): name or category, case-insensitive. */
export function filterParts(
	parts: readonly PartRow[],
	filter: { search?: string; stage?: number | null }
): PartRow[] {
	const q = (filter.search ?? '').trim().toLowerCase();
	return parts.filter(
		(p) =>
			(q === '' || p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)) &&
			(filter.stage === undefined || filter.stage === null || p.stage === filter.stage)
	);
}

/** The stages the parts are in, for the filter's choices. */
export const stagesOf = (parts: readonly PartRow[]): number[] =>
	[...new Set(parts.flatMap((p) => (p.stage === undefined ? [] : [p.stage])))].sort(
		(a, b) => a - b
	);

/** One resource across the vessel's containers, for the Resources tab (plan 214, on plan 213's snapshot). */
export interface ResourceGroup {
	resource: string;
	total: ResourceSnapshot | undefined;
	containers: Array<{ entity: EntityId; title: string } & ResourceSnapshot>;
}

export function resourceGroups(
	view: VesselView,
	vessel: Pick<VesselSnapshot, 'resources'>
): ResourceGroup[] {
	const out = new Map<string, ResourceGroup>();
	for (const p of view.parts)
		for (const r of p.resources) {
			const g = out.get(r.resource) ?? {
				resource: r.resource,
				total: vessel.resources?.find((t) => t.resource === r.resource),
				containers: []
			};
			g.containers.push({ entity: p.entity, title: p.title, ...r });
			out.set(r.resource, g);
		}
	return [...out.values()];
}

/** A transfer of `resource` from one container to another, or the stop of the vessel's (plan 213). */
export const transferCommand = (
	vessel: EntityId,
	resource: string,
	route: { from: EntityId; to: EntityId } | 'stop'
): Command =>
	route === 'stop'
		? { type: 'transfer', vessel, resource, stop: true }
		: { type: 'transfer', vessel, resource, from: [route.from], to: [route.to] };

export const lockCommand = (
	vessel: EntityId,
	part: EntityId,
	resource: string,
	locked: boolean
): Command => ({ type: 'set-flow-lock', vessel, part, resource, locked });

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
