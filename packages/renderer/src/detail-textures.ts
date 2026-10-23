/**
 * Ground detail textures (plan 364, ADR 0306 point 5): four tiling grey detail maps in the channels of
 * one small RGBA8 image (R rock, G grass, B sand, A snow), generated once from periodic value noise.
 * The planet pass reads them triplanar near the ground, at a level from the pixel's footprint, and
 * multiplies the albedo by `2 × value` (each channel averages 0.5, so the mip tail is neutral). One
 * image for both renderers; deterministic.
 */

/** Texels along an edge. */
export const DETAIL_SIZE = 256;
/** Metres one tile spans per material (each divides 1,024 m, the noise anchor's cell). */
export const DETAIL_TILE = { rock: 4, grass: 2, sand: 2, snow: 4 } as const;
/** How strongly each map changes the albedo (1 = as generated). */
export const DETAIL_CONTRAST = { rock: 0.9, grass: 0.45, sand: 0.5, snow: 0.3 } as const;
/**
 * Mip levels over which a tile's detail fades to neutral (plan 388): past about level 5 a tile is
 * a few texels whose average is not neutral, and it repeats every tile as a square grid.
 */
export const DETAIL_LOD_FADE = [3.5, 5.5] as const;

const hash = (x: number, y: number, salt: number): number => {
	let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(salt, 2147483647);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967295;
};

/** Value noise on a lattice of `period` cells that wraps (tiles) at the image's edge. */
function periodicNoise(u: number, v: number, period: number, salt: number): number {
	const x = u * period;
	const y = v * period;
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	let fx = x - x0;
	let fy = y - y0;
	fx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
	fy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
	const w = (i: number) => ((i % period) + period) % period;
	const a = hash(w(x0), w(y0), salt);
	const b = hash(w(x0 + 1), w(y0), salt);
	const c = hash(w(x0), w(y0 + 1), salt);
	const d = hash(w(x0 + 1), w(y0 + 1), salt);
	return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function fbm(u: number, v: number, base: number, octaves: number, salt: number): number {
	let s = 0;
	let a = 0.5;
	let n = 0;
	for (let i = 0; i < octaves; i++) {
		s += a * periodicNoise(u, v, base << i, salt + i * 17);
		n += a;
		a *= 0.5;
	}
	return s / n;
}

/** The four maps at uv in [0, 1)², each about 0.5 on average. */
export function detailTexel(u: number, v: number): [number, number, number, number] {
	// rock: layered strata bent by noise, cracks along ridges, lichen-free grain
	const warp = fbm(u, v, 4, 3, 1) - 0.5;
	const strata = 0.5 + 0.5 * Math.sin((v + warp * 0.35) * Math.PI * 2 * 6);
	const ridge = 1 - Math.abs(2 * fbm(u, v, 8, 4, 7) - 1);
	const crack = Math.pow(Math.max(0, ridge - 0.82) / 0.18, 2);
	const grain = fbm(u, v, 32, 3, 13);
	const rock = 0.5 + 0.22 * (strata - 0.5) + 0.3 * (fbm(u, v, 4, 5, 3) - 0.5) + 0.2 * (grain - 0.5) - 0.35 * crack;
	// grass: clumps and blades seen from above, darker gaps
	const clump = fbm(u, v, 8, 3, 21);
	const blade = periodicNoise(u, v, 128, 29);
	const grass = 0.5 + 0.35 * (clump - 0.5) + 0.25 * (blade - 0.5);
	// sand: wind ripples bent by noise, and grain
	const rip = Math.sin((u * 14 + (fbm(u, v, 4, 2, 31) - 0.5) * 3) * Math.PI * 2);
	const sand = 0.5 + 0.12 * rip + 0.18 * (fbm(u, v, 64, 2, 37) - 0.5) + 0.15 * (fbm(u, v, 4, 3, 41) - 0.5);
	// snow: soft drifts, very low contrast
	const snow = 0.5 + 0.3 * (fbm(u, v, 4, 4, 51) - 0.5) + 0.08 * (fbm(u, v, 32, 2, 53) - 0.5);
	return [rock, grass, sand, snow];
}

let cached: Uint8Array | null = null;

/** The RGBA8 image (`DETAIL_SIZE`², row-major), each channel recentred on 0.5; memoised. */
export function detailImage(): Uint8Array {
	if (cached) return cached;
	const n = DETAIL_SIZE;
	const raw = new Float32Array(n * n * 4);
	const mean = [0, 0, 0, 0];
	for (let j = 0; j < n; j++)
		for (let i = 0; i < n; i++) {
			const t = detailTexel((i + 0.5) / n, (j + 0.5) / n);
			for (let c = 0; c < 4; c++) {
				raw[(j * n + i) * 4 + c] = t[c]!;
				mean[c]! += t[c]! / (n * n);
			}
		}
	const out = new Uint8Array(n * n * 4);
	for (let k = 0; k < n * n * 4; k++) {
		const c = k & 3;
		out[k] = Math.round(Math.min(1, Math.max(0, raw[k]! - mean[c]! + 0.5)) * 255);
	}
	cached = out;
	return out;
}
