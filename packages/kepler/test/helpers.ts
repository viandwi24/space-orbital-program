import type { OrbitalElements, Vec3 } from '../src/index.ts';
import { length, sub } from '../src/index.ts';

/** Earth's gravitational parameter, m³/s² (the value the plan's acceptance criteria use). */
export const MU_EARTH = 3.986e14;

/** Seeded PRNG (mulberry32): tests must be reproducible, never Math.random(). */
export function createRng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export const uniform = (rng: () => number, lo: number, hi: number) => lo + (hi - lo) * rng();

/** Random bound orbit: a log-uniform in [6.6e6, 4.2e8] m, e ∈ [0, 0.95], i ∈ [0, π]. */
export function randomBoundOrbit(rng: () => number, epoch = 0): OrbitalElements {
	return {
		a: Math.exp(uniform(rng, Math.log(6.6e6), Math.log(4.2e8))),
		e: uniform(rng, 0, 0.95),
		i: uniform(rng, 0, Math.PI),
		raan: uniform(rng, 0, 2 * Math.PI),
		argp: uniform(rng, 0, 2 * Math.PI),
		m0: uniform(rng, 0, 2 * Math.PI),
		epoch
	};
}

/** |a − b| / |b| */
export const relErr = (a: Vec3, b: Vec3) => length(sub(a, b)) / length(b);
