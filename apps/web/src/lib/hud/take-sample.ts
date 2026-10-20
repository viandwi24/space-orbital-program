/**
 * The sample a suit on EVA can take now (plan 260): the nearest part, within reach, of another
 * vessel that holds one (an experiment with a sample). Part positions are relative to their vessel's
 * root in inertial axes, like the vessel's own position.
 */
import { EVA_TAKE_RANGE, type EntityId, type Snapshot } from '@orbital/core';

export interface TakeOffer {
	vessel: EntityId;
	part: EntityId;
	/** The part's definition id, for a label. */
	definition: string;
	distance: number;
}

export function takeableSample(
	snapshot: Pick<Snapshot, 'vessels'>,
	suit: EntityId | number
): TakeOffer | null {
	const me = snapshot.vessels.find((v) => v.id === suit);
	if (!me) return null;
	let best: TakeOffer | null = null;
	for (const v of snapshot.vessels) {
		if (v.id === me.id || v.soi !== me.soi) continue;
		for (const p of v.parts) {
			const held = (p.modules['stock.experiment'] as { holdsSample?: boolean } | undefined)
				?.holdsSample;
			if (!held) continue;
			const d = Math.hypot(
				v.position.x + p.position.x - me.position.x,
				v.position.y + p.position.y - me.position.y,
				v.position.z + p.position.z - me.position.z
			);
			if (d <= EVA_TAKE_RANGE && (best === null || d < best.distance))
				best = { vessel: v.id, part: p.id, definition: p.definition, distance: d };
		}
	}
	return best;
}
