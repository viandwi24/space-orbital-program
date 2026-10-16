/**
 * Seeded PRNG: mulberry32 (32-bit state, public domain, passes PractRand to 4 GB; plenty for
 * gameplay randomness). Not cryptographic. Deterministic across engines because it only uses
 * 32-bit integer ops (`Math.imul`) and one IEEE division.
 */
export interface Rng {
	/** Uniform float in [0, 1). */
	next(): number;
	/** Uniform float in [min, max). */
	range(min: number, max: number): number;
	/** Uniform integer in [min, max] (both inclusive). */
	int(min: number, max: number): number;
	/** Current 32-bit state; `createRng(state)` resumes the same sequence. */
	state(): number;
}

export function createRng(seed: number): Rng {
	if (!Number.isFinite(seed)) throw new RangeError(`createRng: seed must be finite, got ${seed}`);
	let s = seed >>> 0;
	const next = (): number => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	return {
		next,
		range: (min, max) => min + next() * (max - min),
		int(min, max) {
			if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
				throw new RangeError(`rng.int: need integers min <= max, got ${min}, ${max}`);
			}
			return min + Math.floor(next() * (max - min + 1));
		},
		state: () => s
	};
}
