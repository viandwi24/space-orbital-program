/** Test helpers for the moon (plan 044): its data, its state over time, a transfer orbit to it. */
import { GRAVITATIONAL_CONSTANT, type BodyDefinition, type Vec3 } from '@orbital/core';
import {
	add,
	length,
	propagate,
	soiRadius,
	sub,
	toStateVector,
	type OrbitalElements,
	type StateVector
} from '@orbital/kepler';
import type { Sim } from '../../src/index.ts';

export interface System {
	home: BodyDefinition;
	moon: BodyDefinition;
	homeMu: number;
	moonMu: number;
	/** Laplace radius of the moon's sphere of influence, m. */
	soi: number;
	orbit: OrbitalElements;
}

export function systemOf(sim: Sim): System {
	const bodies = sim.registries.bodies.list();
	const home = bodies.find((b) => b.id === sim.home)!;
	const moon = bodies.find((b) => b.parent === home.id)!;
	const orbit = moon.orbit!;
	return {
		home,
		moon,
		homeMu: GRAVITATIONAL_CONSTANT * home.mass,
		moonMu: GRAVITATIONAL_CONSTANT * moon.mass,
		soi: soiRadius(orbit.a, moon.mass, home.mass),
		orbit
	};
}

/** The moon's state relative to the home planet at time `t`. */
export const moonState = (s: System, t: number): StateVector => propagate(s.orbit, s.homeMu, t);

/** Position of a vessel that is in the moon's sphere, relative to the home planet. */
export const homeFrame = (s: System, rel: StateVector, t: number): StateVector => {
	const m = moonState(s, t);
	return { r: add(rel.r, m.r), v: add(rel.v, m.v) };
};

/**
 * A Hohmann-like transfer orbit that starts at periapsis `r1` (m from the planet centre) at
 * `t = 0` and reaches its apoapsis at radius `moon orbit + shift` half a transfer later, timed so
 * the moon is `aim` radians ahead of that point (along its orbit). The moon passes the slower
 * vessel along the track, so `shift` is the miss distance across it (the impact parameter, about
 * +-500 km gives a periapsis near 250 km from the moon's centre) and `aim` only moves the time.
 */
export function transferState(s: System, r1: number, shift: number, aim = 0): StateVector {
	const rm = s.orbit.a + shift;
	const a = (r1 + rm) / 2;
	const flight = Math.PI * Math.sqrt((a * a * a) / s.homeMu);
	const n = Math.sqrt(s.homeMu / (s.orbit.a * s.orbit.a * s.orbit.a));
	const moonAngle = s.orbit.m0 + n * flight + aim;
	const periapsisAngle = moonAngle - Math.PI;
	return toStateVector(
		{ a, e: (rm - r1) / (rm + r1), i: 0, raan: 0, argp: periapsisAngle, m0: 0, epoch: 0 },
		s.homeMu,
		0
	);
}

export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));
