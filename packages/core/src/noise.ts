/** Seeded lattice value noise (pure, 32-bit integer hash so it is identical on every engine). */

/** Integer hash of a lattice cell to [0, 1). */
export function hash3(ix: number, iy: number, iz: number, seed: number): number {
	let h =
		Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(iz | 0, 0x9e3779b1);
	h ^= Math.imul(seed | 0, 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
	h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
	h ^= h >>> 15;
	return (h >>> 0) / 4294967296;
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Smooth value noise in [0, 1]. */
export function valueNoise3(x: number, y: number, z: number, seed: number): number {
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const z0 = Math.floor(z);
	const fx = fade(x - x0);
	const fy = fade(y - y0);
	const fz = fade(z - z0);
	const c = (dx: number, dy: number, dz: number): number => hash3(x0 + dx, y0 + dy, z0 + dz, seed);
	return mix(
		mix(mix(c(0, 0, 0), c(1, 0, 0), fx), mix(c(0, 1, 0), c(1, 1, 0), fx), fy),
		mix(mix(c(0, 0, 1), c(1, 0, 1), fx), mix(c(0, 1, 1), c(1, 1, 1), fx), fy),
		fz
	);
}

/** Fractal sum of `octaves` value-noise layers, normalised to [0, 1]. */
export function fbm3(
	x: number,
	y: number,
	z: number,
	octaves: number,
	seed: number,
	lacunarity = 2.03,
	gain = 0.5
): number {
	let sum = 0;
	let amp = 1;
	let norm = 0;
	let f = 1;
	for (let i = 0; i < octaves; i++) {
		sum += amp * valueNoise3(x * f + i * 17.3, y * f - i * 9.1, z * f + i * 5.7, seed + i * 101);
		norm += amp;
		amp *= gain;
		f *= lacunarity;
	}
	return sum / norm;
}
