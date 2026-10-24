/**
 * Baked 3-D value noise (plan 397, ADR 0342): four independent channels of tileable value noise in one
 * RGBA8 volume, two texels per lattice cell so a trilinear fetch is the noise to within a few percent.
 * The cloud erosion reads three octaves from it instead of hashing eight lattice corners each (the
 * hottest ALU of the cloud march). Built once at load from a seeded integer hash; the texels at a lattice
 * point are the lattice value and the texels between are the neighbours' mean (the smoothstep of value
 * noise is 0.5 at the middle of a cell), so the bake is a few additions per texel, not a shader.
 */

/** Lattice cells per side; the volume tiles every `CELLS` cells. */
export const NOISE_CELLS = 64;
/** Texels per side (two per cell). */
export const NOISE_SIZE = NOISE_CELLS * 2;

function hash(x: number, y: number, z: number, channel: number): number {
	let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1);
	h ^= Math.imul(channel + 1, 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
	h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
	h ^= h >>> 15;
	return (h >>> 0) / 0xffffffff;
}

/** The volume's texels, x fastest, four bytes (R, G, B, A) per texel; A is a fourth noise channel. */
export function bakeNoiseVolume(): Uint8Array {
	const C = NOISE_CELLS;
	const lattice = new Float32Array(C * C * C * 4);
	for (let z = 0; z < C; z++)
		for (let y = 0; y < C; y++)
			for (let x = 0; x < C; x++)
				for (let c = 0; c < 4; c++) lattice[((z * C + y) * C + x) * 4 + c] = hash(x, y, z, c);
	const out = new Uint8Array(NOISE_SIZE ** 3 * 4);
	const at = (x: number, y: number, z: number, c: number): number =>
		lattice[((((z + C) % C) * C + ((y + C) % C)) * C + ((x + C) % C)) * 4 + c]!;
	for (let tz = 0; tz < NOISE_SIZE; tz++)
		for (let ty = 0; ty < NOISE_SIZE; ty++)
			for (let tx = 0; tx < NOISE_SIZE; tx++) {
				const cx = tx >> 1;
				const cy = ty >> 1;
				const cz = tz >> 1;
				const mx = tx & 1;
				const my = ty & 1;
				const mz = tz & 1;
				const o = ((tz * NOISE_SIZE + ty) * NOISE_SIZE + tx) * 4;
				for (let c = 0; c < 4; c++) {
					let sum = 0;
					for (let k = 0; k <= mz; k++)
						for (let j = 0; j <= my; j++)
							for (let i = 0; i <= mx; i++) sum += at(cx + i, cy + j, cz + k, c);
					out[o + c] = Math.round((sum / (1 << (mx + my + mz))) * 255);
				}
			}
	return out;
}
