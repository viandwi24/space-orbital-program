/** Heat bars over the hottest parts in the flight view (plan 246): which parts, and where on screen. */
import type { EntityId, Snapshot, Vec3 } from '@orbital/core';
import { heatOf } from '../vessel-panel/vessel-model';

/** The most bars drawn at once. */
export const HEAT_BARS = 6;

export interface HeatMark {
	part: EntityId;
	x: number;
	y: number;
	/** Temperature over its limit, 0..1. */
	fill: number;
	/** Within a tenth of the limit: the bar turns to the danger tone. */
	critical: boolean;
}

/** The hottest parts of `vessel` that show a temperature, hottest (by fraction of the limit) first. */
export function heatMarks(
	snapshot: Snapshot,
	vessel: EntityId,
	project: (p: Vec3) => { x: number; y: number } | null
): HeatMark[] {
	const v = snapshot.vessels.find((x) => x.id === vessel);
	const body = v && snapshot.bodies.find((b) => b.id === v.soi);
	if (!v || !body) return [];
	const hot: { part: EntityId; position: Vec3; fill: number }[] = [];
	for (const p of v.parts) {
		const heat = heatOf(p);
		if (heat)
			hot.push({
				part: p.id,
				position: p.position,
				fill: Math.min(1, heat.temperature / heat.max)
			});
	}
	hot.sort((a, b) => b.fill - a.fill);
	const out: HeatMark[] = [];
	for (const h of hot) {
		if (out.length >= HEAT_BARS) break;
		const at = project({
			x: body.position.x + v.position.x + h.position.x,
			y: body.position.y + v.position.y + h.position.y,
			z: body.position.z + v.position.z + h.position.z
		});
		if (at) out.push({ part: h.part, x: at.x, y: at.y, fill: h.fill, critical: h.fill >= 0.9 });
	}
	return out;
}
