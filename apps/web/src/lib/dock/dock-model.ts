/**
 * The dock's choice (plan 112, ADR 0149 point 6): which panels are on the rail and which one is open.
 * Pure; persisted in settings as `dock`.
 */
export interface DockChoice {
	/** Panel ids on the rail. */
	panels: string[];
	open: string | null;
	/** 3: the choice has the v3 Vessel group (ADR 0253 point 2); absent: an older choice to migrate. */
	v?: 3;
}

/** The vessel panel's tabs and the crew as rail entries (plan 272, ADR 0253 point 1). */
export const VESSEL_PANELS = ['host.vessel', 'host.parts', 'host.comms', 'host.crew'] as const;

export const HOST_PANELS = [
	...VESSEL_PANELS,
	'host.orbit',
	'host.resources',
	'host.target',
	'host.missions',
	'host.script'
] as const;

export const defaultDock = (): DockChoice => ({
	panels: [...HOST_PANELS],
	open: 'host.vessel',
	v: 3
});

/** A choice saved before v3 gets the Vessel group once, in front (ADR 0253 point 2). */
export function migrateDock(choice: DockChoice): DockChoice {
	if (choice.v === 3) return choice;
	const missing = VESSEL_PANELS.filter((id) => !choice.panels.includes(id));
	return { panels: [...missing, ...choice.panels], open: choice.open, v: 3 };
}

/** The rail's groups (V3 §2.3): the vessel, the flight, then plugins (the script and mod panels). */
export type RailGroup = 'vessel' | 'flight' | 'plugins';
const FLIGHT_PANELS = new Set(['host.orbit', 'host.resources', 'host.target', 'host.missions']);
export function groupOf(id: string): RailGroup {
	if ((VESSEL_PANELS as readonly string[]).includes(id)) return 'vessel';
	if (FLIGHT_PANELS.has(id)) return 'flight';
	return 'plugins';
}

/** The rail in groups, in the groups' order and the entries' order within each; empty groups left out. */
export function railGroups<T extends { id: string }>(
	rail: readonly T[]
): { group: RailGroup; entries: T[] }[] {
	const order: RailGroup[] = ['vessel', 'flight', 'plugins'];
	return order
		.map((group) => ({ group, entries: rail.filter((e) => groupOf(e.id) === group) }))
		.filter((g) => g.entries.length > 0);
}

/** The rail: the chosen ids that exist, in the available panels' order. */
export function railOf<T extends { id: string }>(available: readonly T[], choice: DockChoice): T[] {
	const on = new Set(choice.panels);
	return available.filter((p) => on.has(p.id));
}

export function addPanel(choice: DockChoice, id: string): DockChoice {
	return choice.panels.includes(id)
		? { ...choice, open: id }
		: { ...choice, panels: [...choice.panels, id], open: id };
}

export function removePanel(choice: DockChoice, id: string): DockChoice {
	return {
		...choice,
		panels: choice.panels.filter((p) => p !== id),
		open: choice.open === id ? null : choice.open
	};
}

/** Click on a rail entry: open it, or close it when it is the open one. */
export const togglePanel = (choice: DockChoice, id: string): DockChoice => ({
	...choice,
	open: choice.open === id ? null : id
});
