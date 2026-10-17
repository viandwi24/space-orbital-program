/**
 * The smoke puff's noise as a texture (plan 056, ADR 0088). The puff shader of plan 020 evaluated
 * four value-noise lookups (sixteen hashes) per pixel per sprite, and the burning pad lays a few hundred
 * large sprites over the screen: it was 7.5 ms of `high`'s 21 ms and 4.9 of `medium`'s 16.5 (journal 056).
 * The same noise is baked once into a tiling RGBA8 texture instead: the shader reads two texels.
 *
 * `valueNoise` is the shader's `vnoise` (quintic fade of four lattice hashes) with the lattice wrapped every
 * `SMOKE_NOISE_CELLS` cells so the texture tiles. The channels are the field at the point and at the two
 * offsets the shader used for the bump of the surface normal (`+ 3.1` and `+ 9.7` on both axes).
 */

/** Texels per side of the texture; 16 per lattice cell, which a bilinear read turns back into the quintic fade within 0.01. */
export const SMOKE_NOISE_SIZE = 256;
/** Lattice cells per side before the texture repeats (a puff covers about 10 at its finest octave). */
export const SMOKE_NOISE_CELLS = 16;
/** Offsets of the second and third channel, in cells, on both axes. */
export const SMOKE_NOISE_OFFSETS = [0, 3.1, 9.7] as const;

const fract = (x: number): number => x - Math.floor(x);

/** The shader's `hash21` of an integer lattice point, wrapped to the texture's period. */
export function latticeHash(ix: number, iy: number): number {
	const n = SMOKE_NOISE_CELLS;
	let px = fract((((ix % n) + n) % n) * 123.34);
	let py = fract((((iy % n) + n) % n) * 456.21);
	const d = px * (px + 45.32) + py * (py + 45.32);
	px += d;
	py += d;
	return fract(px * py);
}

const fade = (f: number): number => f * f * f * (f * (f * 6 - 15) + 10);

/** Tiling value noise in 0 to 1 at a point measured in lattice cells. */
export function valueNoise(x: number, y: number): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const fx = fade(x - ix);
	const fy = fade(y - iy);
	const a = latticeHash(ix, iy) * (1 - fx) + latticeHash(ix + 1, iy) * fx;
	const b = latticeHash(ix, iy + 1) * (1 - fx) + latticeHash(ix + 1, iy + 1) * fx;
	return a * (1 - fy) + b * fy;
}

/** The RGBA8 texels (alpha 255): channel c at texel (i, j) is `valueNoise` at the texel centre's cell position plus offset c, so a bilinear read at uv is the field at uv * `SMOKE_NOISE_CELLS`. */
export function bakeSmokeNoise(size: number = SMOKE_NOISE_SIZE): Uint8Array {
	const out = new Uint8Array(size * size * 4);
	const scale = SMOKE_NOISE_CELLS / size;
	for (let j = 0; j < size; j++) {
		for (let i = 0; i < size; i++) {
			const o = (j * size + i) * 4;
			for (let c = 0; c < 3; c++) {
				const off = SMOKE_NOISE_OFFSETS[c]!;
				out[o + c] = Math.round(valueNoise((i + 0.5) * scale + off, (j + 0.5) * scale + off) * 255);
			}
			out[o + 3] = 255;
		}
	}
	return out;
}
