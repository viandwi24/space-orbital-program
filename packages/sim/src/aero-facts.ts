/**
 * A vessel's mass and drag area for mods that predict its flight (plan 347, ADR 0296 point 6):
 * `VesselSnapshot.aero`. The drag area C_d·A is what `applyDrag` measured along the airflow, as a
 * running average over a few seconds in air (the transonic rise divided out); without a recent
 * measurement it is an estimate with the air along the vessel's axis, from the part shapes.
 * Kept on the vessel state, so it is saved (a resumed run reports the same facts).
 */
import type { EntityId } from '@orbital/core';
import { axisAreas } from './aero.ts';
import { DRAG_COEFFICIENT } from './constants.ts';
import { partDefOf, partOf, totalMass, vesselOf, type SimCore } from './core.ts';

/** How long a measurement stands in for the vessel, s of sim time. */
const MEASURED_FOR = 1;
/**
 * Time constant of the average, s: a tumbling vessel's area swings with its attitude (a probe
 * from 0.4 to 1.3 m² in a few seconds); a prediction wants the area over the flight, not now.
 */
const AVERAGE_OVER = 4;

/** `applyDrag` measured `area` (m²) for the vessel at this step: folded into a running average. */
export function noteDragArea(core: SimCore, vessel: EntityId, area: number): void {
	const v = vesselOf(core, vessel);
	const last = v.dragArea;
	if (!last || core.t - last.t > MEASURED_FOR) {
		v.dragArea = { area, t: core.t };
		return;
	}
	const k = Math.min(1, (core.t - last.t) / AVERAGE_OVER);
	v.dragArea = { area: last.area + (area - last.area) * k, t: core.t };
}

/** C_d·A along the vessel's axis, air from below (a falling stage, a capsule on its shield). */
function estimatedDragArea(core: SimCore, vesselId: EntityId): number {
	let sum = 0;
	for (const id of vesselOf(core, vesselId).parts) {
		const part = partOf(core, id);
		const def = partDefOf(core, part);
		const covered = { top: false, bottom: false };
		for (const att of part.attachments) {
			const dirY = def.attach?.[att.node]?.dir[1] ?? 0;
			if (dirY > 0.5) covered.top = true;
			else if (dirY < -0.5) covered.bottom = true;
		}
		sum += (def.dragCoefficient ?? DRAG_COEFFICIENT) * axisAreas(def.shape, -1, covered).y;
	}
	return sum;
}

export function aeroFacts(core: SimCore, vesselId: EntityId): { mass: number; dragArea: number } {
	const v = vesselOf(core, vesselId);
	const m = v.dragArea;
	const dragArea =
		m && core.t - m.t <= MEASURED_FOR && m.area > 0 ? m.area : estimatedDragArea(core, vesselId);
	return { mass: totalMass(core, v.parts), dragArea };
}
