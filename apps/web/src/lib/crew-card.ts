/**
 * The crew card's model (plan 107, ADR 0181 point 8): who is aboard, their condition with the
 * cause of each effect, and how long each consumable lasts. Pure: built from a snapshot.
 */
import { graceSeconds, type Snapshot, type VesselSnapshot } from '@orbital/core';
import { formatDuration } from './format';
import { linkBars, type RadioBars } from './comms/suit-radio';

export interface CrewCardRow {
	member: string;
	name: string;
	/** "Morale 85 %", "Fatigue 12 %", "Dose 0.6 mSv", "Performance 92 %". */
	stats: string[];
	/** Why each effect is there, in plain words. */
	causes: string[];
}

export interface CrewCard {
	rows: CrewCardRow[];
	/** "Supplies 1d 03:00:00 left", or "Oxygen out" ... */
	supplies: string[];
	/** The vessel's link: the crew's radio inside (plan 121, ADR 0193 point 6). */
	radio: RadioBars;
}

const LABELS: Record<string, string> = {
	'stock.supplies': 'Supplies',
	'stock.oxygen': 'Oxygen',
	'stock.water': 'Water',
	'stock.food': 'Food',
	co2: 'CO2 scrubbing'
};
const label = (resource: string): string => LABELS[resource] ?? resource;
const pct = (v: number): string => `${Math.round(v * 100)} %`;

/** The card for vessel `v`, or null without crew aboard; `day` is the root body's day, s. */
export function crewCard(snap: Snapshot, v: VesselSnapshot, day: number): CrewCard | null {
	if (!v.crew || v.crew.length === 0) return null;
	const seats = v.crew.length;
	const rows = v.crew.map((c) => {
		const name = snap.crew?.find((m) => m.id === c.member)?.name ?? c.member;
		const stats: string[] = [];
		const causes: string[] = [];
		if (c.morale !== undefined) stats.push(`Morale ${pct(c.morale)}`);
		if (c.fatigue !== undefined) stats.push(`Fatigue ${pct(c.fatigue)}`);
		if (c.dose !== undefined) stats.push(`Dose ${c.dose.toFixed(2)} mSv`);
		if (c.performance !== undefined) stats.push(`Performance ${pct(c.performance)}`);
		if (c.morale !== undefined && c.morale < 0.995) {
			causes.push('Morale falls with time aboard');
			if (seats > 1) causes.push(`Crowded: ${seats} aboard`);
		}
		if (c.fatigue !== undefined && c.fatigue > 0.005) causes.push('Tired from working in flight');
		for (const s of c.shortages ?? []) {
			const left = s.since + graceSeconds(s.resource, day) - snap.t;
			causes.push(
				`Out of ${label(s.resource).toLowerCase()}: ${formatDuration(Math.max(0, left))} to live`
			);
		}
		if (c.glocUntil !== undefined && c.glocUntil > snap.t) causes.push('Blacked out by g-load');
		return { member: c.member, name, stats, causes };
	});
	const supplies = (v.lifeSupport?.consumables ?? []).map((c) =>
		c.timeLeft <= 0
			? `${label(c.resource)} out`
			: `${label(c.resource)} ${Number.isFinite(c.timeLeft) ? formatDuration(c.timeLeft) : '—'} left`
	);
	return { rows, supplies, radio: linkBars(snap, Number(v.id)) };
}
