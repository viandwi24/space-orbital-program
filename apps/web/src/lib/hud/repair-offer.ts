/**
 * The repair a suit on EVA can make now (player-journey audit Q1, closing J6): the nearest failed,
 * field-repairable part of another vessel within `REPAIR_RANGE`, when an engineer is in the suit.
 * The sim checks the same and the speed; this only offers the button. Part positions are relative
 * to their vessel's root in inertial axes, like the vessel's own position.
 */
import { REPAIR_RANGE, type EntityId, type Snapshot } from '@orbital/core';

export interface RepairOffer {
	vessel: EntityId;
	part: EntityId;
	/** The part's definition id, for a label. */
	definition: string;
	/** What failed (the failure mode's label). */
	failure: string;
}

export function repairOffer(
	snapshot: Pick<Snapshot, 'vessels' | 'crew' | 'reliability'>,
	suit: EntityId | number,
	repairable: (mode: string) => boolean
): RepairOffer | null {
	const failed = snapshot.reliability?.failed ?? [];
	if (failed.length === 0) return null;
	const engineer = (snapshot.crew ?? []).some(
		(m) => m.profession === 'engineer' && m.vessel !== undefined && Number(m.vessel) === Number(suit)
	);
	if (!engineer) return null;
	const me = snapshot.vessels.find((v) => Number(v.id) === Number(suit));
	if (!me) return null;
	let best: (RepairOffer & { distance: number }) | null = null;
	for (const f of failed) {
		if (f.vessel === Number(suit) || !repairable(f.mode)) continue;
		const v = snapshot.vessels.find((x) => Number(x.id) === f.vessel);
		const p = v?.parts.find((x) => Number(x.id) === f.part);
		if (!v || !p || v.soi !== me.soi) continue;
		const d = Math.hypot(
			v.position.x + p.position.x - me.position.x,
			v.position.y + p.position.y - me.position.y,
			v.position.z + p.position.z - me.position.z
		);
		if (d <= REPAIR_RANGE && (best === null || d < best.distance))
			best = { vessel: v.id, part: p.id, definition: p.definition, failure: f.label, distance: d };
	}
	if (!best) return null;
	const { distance: _d, ...offer } = best;
	return offer;
}
