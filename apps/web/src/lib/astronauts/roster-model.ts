/**
 * The Astronaut Complex's model (plan 108, ADR 0152): tabs, the profession filter, the recruit cost
 * and a member's profile, from the snapshot. Unknown figures are `null` (shown as `[—]`).
 */
import {
	PROFESSIONS,
	RECRUIT_DAYS,
	SALARY_BASE,
	type Profession,
	type Snapshot
} from '@orbital/core';

export type RosterTab = 'roster' | 'applicants' | 'lost';
export type ProfessionFilter = 'all' | Profession;
type Member = NonNullable<Snapshot['crew']>[number];

/** The members a tab shows, filtered by profession (Roster: available and assigned; Lost: lost and missing). */
export function rosterRows(
	crew: readonly Member[] | undefined,
	tab: Exclude<RosterTab, 'applicants'>,
	filter: ProfessionFilter
): Member[] {
	const want = tab === 'roster' ? ['available', 'assigned'] : ['lost', 'missing'];
	return (crew ?? []).filter(
		(m) => want.includes(m.status) && (filter === 'all' || m.profession === filter)
	);
}

/** Recruit cost in funds when the economy and salaries are on, else 0 (ADR 0176 point 8). */
export function recruitCost(
	profession: Profession,
	rules: Readonly<Record<string, boolean | number | string>> | null | undefined
): number {
	const on = rules?.['stock.economy'] === true && rules?.['stock.crew-salaries'] !== false;
	return on ? SALARY_BASE[profession] * RECRUIT_DAYS : 0;
}

/** One applicant per profession (ADR 0152 point 3), with its cost. */
export const applicants = (
	rules: Readonly<Record<string, boolean | number | string>> | null | undefined,
	filter: ProfessionFilter
): { profession: Profession; cost: number }[] =>
	PROFESSIONS.filter((p) => filter === 'all' || p === filter).map((p) => ({
		profession: p,
		cost: recruitCost(p, rules)
	}));

export interface Profile {
	name: string;
	chips: string[];
	xp: number;
	level: number;
	traits: string[];
	/** Places with XP, from the current flight. */
	places: string[];
	stats: { label: string; value: string | null }[];
}

export function profileOf(m: Member, vesselName: (id: number) => string | null): Profile {
	const where =
		m.status === 'assigned' && m.vessel !== undefined
			? `Aboard ${vesselName(Number(m.vessel)) ?? 'a vessel'}`
			: m.status === 'available'
				? 'At the Space Center'
				: m.status === 'missing'
					? 'Missing'
					: 'Lost';
	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
	return {
		name: m.name,
		chips: [cap(m.profession), where, m.status === 'assigned' ? 'IVA' : 'Ground'],
		xp: m.xp,
		level: m.level,
		traits: m.traits,
		places: m.places,
		// what the model keeps; the rest of the refs stats are honest blanks (ADR 0107)
		stats: [
			{ label: 'Level', value: String(m.level) },
			{ label: 'XP', value: m.xp.toFixed(1) },
			{ label: 'Traits', value: m.traits.length ? String(m.traits.length) : null },
			{ label: 'Missions', value: null },
			{ label: 'Radio', value: null },
			{ label: 'EVA time', value: null }
		]
	};
}
