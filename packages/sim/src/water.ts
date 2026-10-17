/**
 * Water (plan 067, ADR 0182): where it is under a vessel, buoyancy and water drag on sliced part
 * volumes, which parts entered the water this step, and the impact of that entry.
 */
import {
	WATER_DENSITY,
	WATER_IMPACT_FACTOR,
	type EntityId,
	type PartShape,
	type Quat,
	type Vec3
} from '@orbital/core';
import { add, cross, dot, length, normalize, scale, sub } from '@orbital/kepler';
import { spinAt, type BodyRuntime } from './bodies.ts';
import { DEFAULT_IMPACT_TOLERANCE } from './constants.ts';
import { partDefOf, partOf, vesselOf, type SimCore } from './core.ts';
import { qMul, qRotate } from './math.ts';
import { isTurned, partRotation } from './parts.ts';
import type { FlightBody, FlightFrame } from './state.ts';
import { toBodyFixed } from './terrain.ts';

/** Slices per part (ADR 0182 point 3). */
export const WATER_SLICES = 6;
/** Only a vessel this close to the water plane is checked, m. */
export const WATER_REACH = 200;
/** Linear and quadratic water drag coefficients, 1/s and 1/m (ADR 0182 point 4). */
const DRAG_LINEAR = 0.8;
const DRAG_QUADRATIC = 0.5;

/** True when the ground under the BCI point `r` of `body` is water. */
export function waterUnder(core: SimCore, body: BodyRuntime, r: Vec3): boolean {
	const terrain = body.terrain;
	if (!terrain?.waterAt) return false;
	return terrain.waterAt(normalize(toBodyFixed(core, body, r)));
}

/** Volume, length along the axis and cross-section width of a part shape. */
function shapeOf(shape: PartShape | undefined): { volume: number; height: number; width: number } {
	if (!shape) return { volume: 0, height: 0, width: 0 };
	if (shape.kind === 'cylinder') {
		return {
			volume: Math.PI * shape.radius * shape.radius * shape.height,
			height: shape.height,
			width: 2 * shape.radius
		};
	}
	const [x, y, z] = shape.size;
	return { volume: x * y * z, height: y, width: Math.max(x, z) };
}

export interface WaterStep {
	/** Some slice of the vessel is wet. */
	wet: boolean;
	/** Parts that entered the water this step, with their judged speed. */
	impacts: Array<{ vessel: EntityId; part: EntityId; speed: number }>;
}

/**
 * Buoyancy and water drag on one flight vessel this step (ADR 0182 points 3 to 6). `wasWet` holds
 * the parts that were wet the step before and is updated.
 */
export function stepWater(
	core: SimCore,
	frame: FlightFrame,
	planet: BodyRuntime,
	vesselId: EntityId,
	flight: FlightBody,
	motion: { origin: Vec3; rotation: Quat; linear: Vec3; angular: Vec3; centre: Vec3 },
	wasWet: Set<EntityId>
): WaterStep {
	const result: WaterStep = { wet: false, impacts: [] };
	const centre = add(frame.origin, motion.centre);
	if (length(centre) - planet.def.radius > WATER_REACH || !waterUnder(core, planet, centre)) {
		wasWet.clear();
		return result;
	}
	const vessel = vesselOf(core, vesselId);
	const rootDesign = partOf(core, vessel.root).designPos;
	const omega = spinAt(planet, core.t);
	const R = planet.def.radius;
	const wetNow = new Set<EntityId>();
	for (const partId of vessel.parts) {
		const part = partOf(core, partId);
		const def = partDefOf(core, part);
		const { volume, height, width } = shapeOf(def.shape);
		if (volume <= 0) continue;
		const local = add(motion.origin, qRotate(motion.rotation, sub(part.designPos, rootDesign)));
		const turned = isTurned(part) ? qMul(motion.rotation, partRotation(part)) : motion.rotation;
		const axis = qRotate(turned, { x: 0, y: 1, z: 0 });
		const up = normalize(add(frame.origin, local));
		const ay = dot(axis, up);
		const extent =
			Math.abs(ay) * (height / WATER_SLICES) + Math.sqrt(Math.max(0, 1 - ay * ay)) * width;
		const slice = volume / WATER_SLICES;
		let partWet = false;
		let entry = 0;
		for (let k = 0; k < WATER_SLICES; k++) {
			const y = ((k + 0.5) / WATER_SLICES - 0.5) * height;
			const p = add(local, scale(axis, y));
			const world = add(frame.origin, p);
			const depth = R - length(world);
			const f = Math.min(1, Math.max(0, 0.5 + depth / extent));
			if (f <= 0) continue;
			partWet = true;
			const n = normalize(world);
			const g = planet.mu / dot(world, world);
			const v = sub(
				add(add(frame.velocity, motion.linear), cross(motion.angular, sub(p, motion.centre))),
				cross(omega, world)
			);
			const speed = length(v);
			const drag = scale(v, -f * WATER_DENSITY * slice * (DRAG_LINEAR + DRAG_QUADRATIC * speed));
			const lift = scale(n, WATER_DENSITY * g * slice * f);
			frame.backend.applyForce(flight.handle, add(lift, drag), p);
			entry = Math.max(entry, -dot(v, n));
		}
		if (!partWet) continue;
		result.wet = true;
		wetNow.add(partId);
		if (!wasWet.has(partId)) {
			const speed = entry * WATER_IMPACT_FACTOR;
			const tolerance = def.impactTolerance ?? DEFAULT_IMPACT_TOLERANCE;
			if (speed > tolerance) result.impacts.push({ vessel: vesselId, part: partId, speed });
		}
	}
	wasWet.clear();
	for (const id of wetNow) wasWet.add(id);
	return result;
}
