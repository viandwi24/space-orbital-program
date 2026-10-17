/**
 * The dock's choice (plan 112, ADR 0149 point 6): which panels are on the rail and which one is open.
 * Pure; persisted in settings as `dock`.
 */
export interface DockChoice {
	/** Panel ids on the rail. */
	panels: string[];
	open: string | null;
}

export const HOST_PANELS = ['host.orbit', 'host.resources', 'host.target', 'host.script'] as const;

export const defaultDock = (): DockChoice => ({ panels: [...HOST_PANELS], open: 'host.orbit' });

/** The rail: the chosen ids that exist, in the available panels' order. */
export function railOf<T extends { id: string }>(available: readonly T[], choice: DockChoice): T[] {
	const on = new Set(choice.panels);
	return available.filter((p) => on.has(p.id));
}

export function addPanel(choice: DockChoice, id: string): DockChoice {
	return choice.panels.includes(id)
		? { ...choice, open: id }
		: { panels: [...choice.panels, id], open: id };
}

export function removePanel(choice: DockChoice, id: string): DockChoice {
	return {
		panels: choice.panels.filter((p) => p !== id),
		open: choice.open === id ? null : choice.open
	};
}

/** Click on a rail entry: open it, or close it when it is the open one. */
export const togglePanel = (choice: DockChoice, id: string): DockChoice => ({
	...choice,
	open: choice.open === id ? null : id
});
