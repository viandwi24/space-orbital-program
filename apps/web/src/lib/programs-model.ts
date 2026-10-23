/**
 * The programs list (plan 320, ADR 0276 point 8): every vessel that an engaged autopilot (ADR
 * 0271) or a player script flies, from the snapshot, for the status bar. Pure.
 */
import { entityId, type Command, type Snapshot } from '@orbital/core';

export interface ProgramRow {
	vessel: number;
	vesselName: string;
	kind: 'autopilot' | 'script';
	/** The autopilot's id (`guidance.rendezvous`), or null for a script (plan 359). */
	autopilot: string | null;
	/** The autopilot's title or the script's name. */
	title: string;
	/** The autopilot's phase and status, or the script's "resumed" note. */
	detail: string;
	/** Channels the player holds against it right now (empty: the program flies). */
	manual: string[];
}

/** The snapshot's autopilot view (ADR 0271 point 5), read loosely until plan 310 lands its type. */
interface AutopilotView {
	id?: string;
	title?: string;
	phase?: string;
	status?: string;
}

const CHANNEL_WORDS: Readonly<Record<string, string>> = {
	pitch: 'pitch',
	yaw: 'yaw',
	roll: 'roll',
	translateX: 'RCS right',
	translateY: 'RCS up',
	translateZ: 'RCS forward',
	throttle: 'throttle',
	wheelThrottle: 'wheels'
};

/** Words for overridden channels: "pitch, throttle". */
export const manualText = (channels: readonly string[]): string =>
	channels.map((c) => CHANNEL_WORDS[c] ?? c).join(', ');

/** Autopilots first, then scripts; each by vessel name. */
export function programRows(snapshot: Snapshot | null): ProgramRow[] {
	if (!snapshot) return [];
	const rows: ProgramRow[] = [];
	for (const v of snapshot.vessels) {
		const vessel = Number(v.id);
		const vesselName = v.name ?? `Vessel ${vessel}`;
		const manual = v.override ?? [];
		const autopilot = (v as { autopilot?: AutopilotView | null }).autopilot;
		if (autopilot) {
			rows.push({
				vessel,
				vesselName,
				kind: 'autopilot',
				autopilot: autopilot.id ?? null,
				title: autopilot.title ?? autopilot.id ?? 'Autopilot',
				detail: [autopilot.phase, autopilot.status].filter(Boolean).join(' · '),
				manual
			});
		}
		if (v.script) {
			rows.push({
				vessel,
				vesselName,
				kind: 'script',
				autopilot: null,
				title: v.script.name,
				detail: v.script.resumed ? 'resumed from a save' : 'running',
				manual
			});
		}
	}
	const rank = (r: ProgramRow): number => (r.kind === 'autopilot' ? 0 : 1);
	return rows.sort((a, b) => rank(a) - rank(b) || a.vesselName.localeCompare(b.vesselName));
}

/** "1 program", "3 programs". */
export const programsLabel = (n: number): string => `${n} program${n === 1 ? '' : 's'}`;

// ---- the programs popover (plan 359, ADR 0302) --------------------------------------------------

/** A dock panel as the popover needs it: its id and the places it shows. */
export interface ProgramPanel {
	id: string;
	title: string;
	contexts: readonly string[];
}

/**
 * The dock panel that shows a program: the Script panel for a script; for an autopilot, the first
 * Flight panel of the mod that registered it (`guidance.rendezvous` -> `guidance.panel`, the
 * Guidance Computer, which opens the engaged program's tab by itself). Null when the mod has none.
 */
export function panelOf(row: ProgramRow, panels: readonly ProgramPanel[]): ProgramPanel | null {
	if (row.kind === 'script') return { id: 'host.script', title: 'Script', contexts: ['flight'] };
	const plugin = row.autopilot?.split('.')[0];
	if (!plugin) return null;
	return panels.find((p) => p.id.startsWith(`${plugin}.`) && p.contexts.includes('flight')) ?? null;
}

/**
 * What a row's Stop sends: an autopilot disengages alone, and a script detaches alone (plan 322:
 * the vessel's autopilot stays engaged). `program-stop` (the Delete key, Abort) ends both.
 */
export function stopCommand(row: ProgramRow): Command {
	return row.kind === 'autopilot'
		? { type: 'autopilot-disengage', vessel: entityId(row.vessel) }
		: {
				type: 'script-detach',
				vessel: entityId(row.vessel),
				reason: 'stopped from the programs list'
			};
}

export interface ProgramGroup {
	vessel: number;
	vesselName: string;
	/** The vessel flown now: its group comes first and has no Vessel button. */
	active: boolean;
	rows: (ProgramRow & { panel: ProgramPanel | null })[];
}

/** The rows by vessel, the active vessel first, then by name; each row with its panel. */
export function programGroups(
	rows: readonly ProgramRow[],
	active: number | null,
	panels: readonly ProgramPanel[]
): ProgramGroup[] {
	const groups = new Map<number, ProgramGroup>();
	for (const r of rows) {
		const g = groups.get(r.vessel) ?? {
			vessel: r.vessel,
			vesselName: r.vesselName,
			active: r.vessel === active,
			rows: []
		};
		g.rows.push({ ...r, panel: panelOf(r, panels) });
		groups.set(r.vessel, g);
	}
	return [...groups.values()].sort(
		(a, b) => Number(b.active) - Number(a.active) || a.vesselName.localeCompare(b.vesselName)
	);
}

/**
 * Where a popover action goes (ADR 0302 point 3). In Flight it acts there: switch the focus, open
 * the panel. Elsewhere it goes to Flight with the vessel as the focus, and the panel opened there.
 */
export function flightHref(panel: string | null): string {
	return panel ? `/flight?panel=${encodeURIComponent(panel)}` : '/flight';
}

/** What the programs popover's buttons do (plan 359, ADR 0302); the world layout supplies them. */
export interface ProgramActions {
	/** The dock panels a program can open. */
	panels: () => readonly ProgramPanel[];
	/** The vessel flown in Flight, or null on the other pages (there, Vessel goes to Flight). */
	active: () => number | null;
	panel: (row: ProgramGroup['rows'][number]) => void;
	vessel: (vessel: number) => void;
	stop: (row: ProgramGroup['rows'][number]) => void;
}
