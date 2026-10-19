/**
 * The Hangar's power budget (plan 218 on plan 208's `powerBudget`): what each kind of part makes and
 * draws by day and by night, the totals, and how long the batteries last at night.
 */
import { powerBudget, type PowerBudget, type PowerLookup, type VesselDesign } from '@orbital/core';

export interface PowerRow {
	part: string;
	title: string;
	count: number;
	/** Net EC/s of all of them, in full sun and at night. */
	day: number;
	night: number;
	/** EC they store. */
	capacity: number;
}

export interface PowerView {
	rows: PowerRow[];
	total: PowerBudget;
}

/** The budget of the design, or null when no part makes, draws or stores power. */
export function powerView(
	design: Pick<VesselDesign, 'parts'>,
	lookup: PowerLookup
): PowerView | null {
	const counts = new Map<string, number>();
	for (const p of design.parts) counts.set(p.part, (counts.get(p.part) ?? 0) + 1);
	const rows: PowerRow[] = [];
	for (const [part, count] of counts) {
		const one = powerBudget([part], lookup);
		if (one.day === 0 && one.night === 0 && one.capacity === 0) continue;
		rows.push({
			part,
			title: lookup.parts.get(part)?.title ?? part,
			count,
			day: one.day * count,
			night: one.night * count,
			capacity: one.capacity * count
		});
	}
	if (rows.length === 0) return null;
	rows.sort((a, b) => b.day - a.day || a.title.localeCompare(b.title));
	return {
		rows,
		total: powerBudget(
			design.parts.map((p) => p.part),
			lookup
		)
	};
}
