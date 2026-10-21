/**
 * The programs list (plan 311, ADR 0272 point 8): every vessel that an engaged autopilot (ADR
 * 0271) or a player script flies, from the snapshot, for the status bar. Pure.
 */
import type { Snapshot } from '@orbital/core';

export interface ProgramRow {
	vessel: number;
	vesselName: string;
	kind: 'autopilot' | 'script';
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
