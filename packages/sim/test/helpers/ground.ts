/** Test measurements relative to the rotating ground, from snapshots only. */
import type { EntityId, Vec3, VesselDesign, VesselSnapshot } from '@orbital/core';
import { dot, length, sub } from '@orbital/kepler';
import type { Sim } from '../../src/index.ts';
import { RADIUS, altitude, centreOfMass } from './measure.ts';
import { newSim } from './vessels.ts';

const OMEGA = (2 * Math.PI) / 21_600;

/** Rotate `v` by the unit quaternion `q`. */
export function rotateBy(q: VesselSnapshot['orientation'], v: Vec3): Vec3 {
	const u = { x: q.x, y: q.y, z: q.z };
	const cross = (a: Vec3, b: Vec3): Vec3 => ({
		x: a.y * b.z - a.z * b.y,
		y: a.z * b.x - a.x * b.z,
		z: a.x * b.y - a.y * b.x
	});
	const t = cross(u, v);
	const t2 = { x: 2 * t.x, y: 2 * t.y, z: 2 * t.z };
	const w = cross(u, t2);
	return { x: v.x + q.w * t2.x + w.x, y: v.y + q.w * t2.y + w.y, z: v.z + q.w * t2.z + w.z };
}

/** Velocity of the vessel's root part relative to the ground under it, m/s (BCI axes). */
export function groundRelativeVelocity(v: VesselSnapshot): Vec3 {
	const ground = { x: OMEGA * v.position.z, y: 0, z: -OMEGA * v.position.x };
	return sub(v.velocity, ground);
}

/** Angle between the vessel's +Y axis and the local vertical, degrees. */
export function tiltDegrees(v: VesselSnapshot): number {
	const nose = rotateBy(v.orientation, { x: 0, y: 1, z: 0 });
	const r = length(v.position);
	const up = { x: v.position.x / r, y: v.position.y / r, z: v.position.z / r };
	return (Math.acos(Math.min(1, Math.max(-1, dot(nose, up)))) * 180) / Math.PI;
}

/**
 * Load `design` standing nose-up on the equator at COM altitude `altitude`, moving straight down
 * at `speed` m/s relative to the ground. Returns the vessel id.
 */
export function drop(sim: Sim, design: VesselDesign, altitude: number, speed: number): EntityId {
	const placed = sim.dispatch({
		type: 'load-vessel',
		design,
		placement: {
			kind: 'state',
			position: { x: RADIUS + altitude, y: 0, z: 0 },
			velocity: { x: -speed, y: 0, z: -OMEGA * (RADIUS + altitude) },
			orientation: { x: 0, y: 0, z: -Math.SQRT1_2, w: Math.SQRT1_2 }
		}
	});
	if (!placed.ok) throw new Error(placed.reason);
	return placed.vessel!;
}

/** Altitude of the centre of mass of `design` standing on the ground (legs as designed), m. */
export async function standingComAltitude(design: VesselDesign): Promise<number> {
	const scratch = await newSim({ maxFlightFrames: 1 });
	const placed = scratch.dispatch({ type: 'load-vessel', design });
	if (!placed.ok) throw new Error(placed.reason);
	const v = scratch.snapshot().vessels[0]!;
	const alt = altitude(centreOfMass(scratch, v));
	scratch.dispose();
	return alt;
}

/**
 * Like `drop`, but the lowest point starts `clearance` m above the ground, so the speed at
 * touchdown is `speed` plus what `clearance` of free fall adds (about 0.1 m/s for 1 m at 20 m/s).
 */
export async function dropOnto(
	sim: Sim,
	design: VesselDesign,
	clearance: number,
	speed: number
): Promise<EntityId> {
	return drop(sim, design, (await standingComAltitude(design)) + clearance, speed);
}
