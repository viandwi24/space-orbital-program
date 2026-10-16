/** Test measurements on snapshots (what a host can compute from the protocol plus the registries). */
import { GRAVITATIONAL_CONSTANT, type Vec3, type VesselSnapshot } from '@orbital/core';
import { add, length, scale } from '@orbital/kepler';
import type { Sim } from '../../src/index.ts';

export const RADIUS = 600_000;

export function homeMu(sim: Sim): number {
	return GRAVITATIONAL_CONSTANT * sim.registries.bodies.get('stock.home')!.mass;
}

/** Mass of each part: dry mass plus the contents of its containers. */
export function partMasses(sim: Sim, v: VesselSnapshot): number[] {
	return v.parts.map((p) => {
		let m = sim.registries.parts.get(p.definition)!.mass;
		const c = p.modules['stock.resource-container'] as
			{ amounts: Record<string, number> } | undefined;
		for (const [r, a] of Object.entries(c?.amounts ?? {})) {
			m += a * (sim.registries.resources.get(r)?.density ?? 0);
		}
		return m;
	});
}

export const vesselMass = (sim: Sim, v: VesselSnapshot): number =>
	partMasses(sim, v).reduce((a, b) => a + b, 0);

/** Centre-of-mass position in BCI. */
export function centreOfMass(sim: Sim, v: VesselSnapshot): Vec3 {
	const masses = partMasses(sim, v);
	const total = masses.reduce((a, b) => a + b, 0);
	let c: Vec3 = { x: 0, y: 0, z: 0 };
	v.parts.forEach((p, i) => (c = add(c, scale(add(v.position, p.position), masses[i]! / total))));
	return c;
}

export const altitude = (p: Vec3): number => length(p) - RADIUS;

/** A circular (or scaled-speed) equatorial prograde state at `alt` metres: position (r,0,0), velocity along -Z. */
export function orbitState(
	sim: Sim,
	alt: number,
	speedFactor = 1
): { position: Vec3; velocity: Vec3 } {
	const r = RADIUS + alt;
	return {
		position: { x: r, y: 0, z: 0 },
		velocity: { x: 0, y: 0, z: -Math.sqrt(homeMu(sim) / r) * speedFactor }
	};
}
