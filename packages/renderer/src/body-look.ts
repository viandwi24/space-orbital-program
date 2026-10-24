/**
 * A body's look from its `appearance` (plan 381, ADR 0318): small colour maps baked on the CPU, so
 * every body is drawn by materials the renderer already has. Pure: data in, bytes out.
 *
 * - `surfaceMap`: an equirectangular sRGB map (longitude across, +Y north up) of the palette in its
 *   pattern; the moon pass multiplies its regolith shade by it, the far sphere and a giant show it.
 * - `cloudMap`: the same for a cloud deck, alpha the cover.
 * - `ringStrip`: the rings' colour and opacity from the inner to the outer edge.
 * - `skyOptics`: Rayleigh weights and a Mie share for the body's air from `sky` and `haze`.
 */
import type { BodyAppearance } from '@orbital/core';

export type { BodyAppearance };

/** Size of a surface or cloud map, texels (2:1, longitude across). */
export const LOOK_MAP = { width: 512, height: 256 } as const;
/** The small map a body starts with, before it comes near (ADR 0318 point 6). */
export const LOOK_MAP_SMALL = { width: 128, height: 64 } as const;
/** Texels of the ring strip, inner edge first. */
export const RING_TEXELS = 256;
/**
 * The moon pass multiplies the map by this albedo scale: a palette is how the body looks lit, and
 * the regolith's shading was tuned for Cinder's albedo 0.135 (`airless-light.ts`).
 */
export const LOOK_ALBEDO = 0.42;

/** `#rrggbb` as sRGB bytes. */
export function hexBytes(hex: string): [number, number, number] {
	const n = Number.parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** sRGB byte to linear. */
const toLinear = (b: number): number => {
	const c = b / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** `#rrggbb` as linear RGB. */
export function hexLinear(hex: string): [number, number, number] {
	const [r, g, b] = hexBytes(hex);
	return [toLinear(r), toLinear(g), toLinear(b)];
}

/** A seed from a body id (FNV-1a), so a body's map is the same everywhere. */
export function lookSeed(id: string): number {
	let a = 2166136261;
	for (let i = 0; i < id.length; i++) {
		a ^= id.charCodeAt(i);
		a = Math.imul(a, 16777619) >>> 0;
	}
	return a;
}

/** Integer lattice hash in [0, 1). */
function hash3(x: number, y: number, z: number, seed: number): number {
	let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ seed;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1) on a 3D lattice. */
function noise3(x: number, y: number, z: number, seed: number): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const iz = Math.floor(z);
	const fx = x - ix;
	const fy = y - iy;
	const fz = z - iz;
	const sx = fx * fx * (3 - 2 * fx);
	const sy = fy * fy * (3 - 2 * fy);
	const sz = fz * fz * (3 - 2 * fz);
	const c = (dx: number, dy: number, dz: number): number => hash3(ix + dx, iy + dy, iz + dz, seed);
	const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
	return lerp(
		lerp(lerp(c(0, 0, 0), c(1, 0, 0), sx), lerp(c(0, 1, 0), c(1, 1, 0), sx), sy),
		lerp(lerp(c(0, 0, 1), c(1, 0, 1), sx), lerp(c(0, 1, 1), c(1, 1, 1), sx), sy),
		sz
	);
}

/** Fractal noise in about [0, 1): `octaves` of `noise3` from frequency `f`. */
function fbm(x: number, y: number, z: number, f: number, octaves: number, seed: number): number {
	let sum = 0;
	let amp = 0.5;
	let norm = 0;
	for (let o = 0; o < octaves; o++) {
		sum += amp * noise3(x * f, y * f, z * f, seed + o * 7919);
		norm += amp;
		amp *= 0.5;
		f *= 2.03;
	}
	return sum / norm;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number): number => {
	const t = clamp01((x - a) / (b - a));
	return t * t * (3 - 2 * t);
};
type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [
	a[0] + (b[0] - a[0]) * t,
	a[1] + (b[1] - a[1]) * t,
	a[2] + (b[2] - a[2]) * t
];

/** The direction of a texel's centre: longitude 0 on +X, east toward -Z (core's map convention). */
export function texelDir(i: number, j: number, w: number, h: number): RGB {
	const lon = ((i + 0.5) / w - 0.5) * 2 * Math.PI;
	const lat = ((j + 0.5) / h - 0.5) * Math.PI;
	return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)];
}

/** The colour of one direction in a pattern, sRGB bytes as floats. */
export function patternColour(look: BodyAppearance, d: RGB, seed: number): RGB {
	const p = look.palette.map(hexBytes) as RGB[];
	const c0 = p[0]!;
	const c1 = p[1] ?? c0;
	const c2 = p[2] ?? c0;
	const c3 = p[3] ?? c2;
	const [x, y, z] = d;
	const broad = fbm(x, y, z, 2.2, 5, seed);
	const detail = fbm(x, y, z, 9, 3, seed + 101);
	const mottle = (): RGB => {
		const t = smooth(0.35, 0.68, broad);
		const base = mix(c1, c0, t);
		return mix(base, c2, smooth(0.62, 0.8, detail) * 0.6);
	};
	switch (look.pattern ?? 'mottled') {
		case 'polar-caps': {
			const lat = Math.asin(y);
			const edge = 1.18 + (fbm(x, y, z, 6, 3, seed + 7) - 0.5) * 0.25;
			const cap = smooth(edge - 0.05, edge + 0.05, Math.abs(lat));
			return mix(mottle(), [241, 239, 234], cap);
		}
		case 'lineae': {
			const ice = mix(c0, c2, smooth(0.3, 0.75, broad) * 0.7);
			// ridged noise: thin dark lines where the noise crosses its middle
			const n1 = fbm(x, y, z, 3.1, 3, seed + 31);
			const n2 = fbm(x, y, z, 5.3, 3, seed + 57);
			const crack = Math.max(
				1 - smooth(0, 0.012, Math.abs(n1 - 0.5)),
				0.7 * (1 - smooth(0, 0.008, Math.abs(n2 - 0.5)))
			);
			const chaos = smooth(0.66, 0.74, fbm(x, y, z, 4, 2, seed + 77)) * 0.5;
			return mix(ice, c1, Math.min(1, crack * 0.85 + chaos));
		}
		case 'volcanic': {
			const plains = mix(c0, c3, smooth(0.4, 0.7, broad) * 0.6);
			// vents: dark spots with bright rims where a coarse noise peaks
			const v = fbm(x, y, z, 7, 2, seed + 13);
			const vent = smooth(0.7, 0.76, v);
			const rim = smooth(0.62, 0.69, v) * (1 - vent);
			return mix(mix(plains, c2, rim * 0.8), c1, vent);
		}
		case 'bands': {
			// latitude bands of uneven widths with a turbulent edge, and a few pale storms
			const swirl = (fbm(x * 0.8, y * 4, z * 0.8, 3, 5, seed + 19) - 0.5) * 0.22;
			const lat = Math.asin(y) + swirl;
			const warp = (fbm(0.3, lat * 2.2, 0.7, 1, 3, seed + 29) - 0.5) * 1.6;
			const t = clamp01(Math.sin(lat * 7.3 + warp) * 0.5 + 0.5 + (detail - 0.5) * 0.35);
			const s = t * (p.length - 1);
			const k = Math.min(p.length - 2, Math.floor(s));
			const band = p.length > 1 ? mix(p[k]!, p[k + 1]!, smooth(0.2, 0.8, s - k)) : c0;
			// the belts and zones differ in shade too, so neighbouring bands of one colour still read
			const shade = 0.9 + 0.2 * fbm(0.1, lat * 5, 0.4, 1, 2, seed + 31);
			const storm = smooth(0.8, 0.86, fbm(x * 2, y * 5, z * 2, 2.5, 2, seed + 23));
			const lit: RGB = [band[0] * shade, band[1] * shade, band[2] * shade];
			return mix(lit, p.length > 2 ? p[2]! : [240, 236, 226], storm * 0.8);
		}
		default:
			return mottle();
	}
}

/**
 * Rows `j0` to `j1` (exclusive) of a surface map into `out` (RGBA sRGB bytes, rows from the south
 * pole up): a caller spreads a big map over several frames.
 */
export function surfaceRows(
	look: BodyAppearance,
	seed: number,
	size: { width: number; height: number },
	out: Uint8Array,
	j0: number,
	j1: number
): void {
	const { width: w, height: h } = size;
	for (let j = j0; j < Math.min(j1, h); j++) {
		for (let i = 0; i < w; i++) {
			const c = patternColour(look, texelDir(i, j, w, h), seed);
			const o = (j * w + i) * 4;
			out[o] = Math.round(c[0]);
			out[o + 1] = Math.round(c[1]);
			out[o + 2] = Math.round(c[2]);
			out[o + 3] = 255;
		}
	}
}

/** The whole surface map at `size` (default `LOOK_MAP`). */
export function surfaceMap(
	look: BodyAppearance,
	seed: number,
	size: { width: number; height: number } = LOOK_MAP
): Uint8Array {
	const out = new Uint8Array(size.width * size.height * 4);
	surfaceRows(look, seed, size, out, 0, size.height);
	return out;
}

/** A cloud deck's map: its colour with streaky cover in the alpha, rows from the south pole up. */
export function cloudMap(
	clouds: NonNullable<BodyAppearance['clouds']>,
	seed: number,
	size: { width: number; height: number } = { width: 256, height: 128 }
): Uint8Array {
	const { width: w, height: h } = size;
	const [r, g, b] = hexBytes(clouds.color);
	const opacity = clouds.opacity ?? 0.9;
	const out = new Uint8Array(w * h * 4);
	for (let j = 0; j < h; j++) {
		for (let i = 0; i < w; i++) {
			const [x, y, z] = texelDir(i, j, w, h);
			// stretched along the latitude: streaks that wind round the body
			const n = fbm(x * 0.7, y * 3.5, z * 0.7, 3, 5, seed + 3);
			const shade = 0.88 + 0.24 * (n - 0.5);
			const o = (j * w + i) * 4;
			out[o] = Math.round(Math.min(255, r * shade));
			out[o + 1] = Math.round(Math.min(255, g * shade));
			out[o + 2] = Math.round(Math.min(255, b * shade));
			out[o + 3] = Math.round(255 * clamp01(opacity * (0.85 + 0.3 * (n - 0.5))));
		}
	}
	return out;
}

/** The rings from the inner edge out: RGBA sRGB bytes with gaps and ringlets in the alpha. */
export function ringStrip(rings: NonNullable<BodyAppearance['rings']>, seed: number): Uint8Array {
	const [r, g, b] = hexBytes(rings.color);
	const opacity = rings.opacity ?? 0.7;
	const out = new Uint8Array(RING_TEXELS * 4);
	for (let i = 0; i < RING_TEXELS; i++) {
		const t = (i + 0.5) / RING_TEXELS;
		const ringlets = 0.55 + 0.45 * noise3(t * 90, 0.5, 0.5, seed);
		const lanes = 0.6 + 0.4 * noise3(t * 12, 3.5, 0.5, seed + 1);
		// a wide dark gap at 62 % of the span, and soft edges
		const gap = 1 - 0.92 * (1 - smooth(0.0, 0.03, Math.abs(t - 0.62)));
		const edge = smooth(0, 0.04, t) * (1 - smooth(0.93, 1, t));
		const a = clamp01(opacity * ringlets * lanes * gap * edge * 1.35);
		const tone = 0.8 + 0.3 * lanes;
		const o = i * 4;
		out[o] = Math.round(Math.min(255, r * tone));
		out[o + 1] = Math.round(Math.min(255, g * tone));
		out[o + 2] = Math.round(Math.min(255, b * tone));
		out[o + 3] = Math.round(255 * a);
	}
	return out;
}

/** Earth's Rayleigh shares (680, 550, 440 nm), normalised to their mean: the home sky. */
const EARTH_RAYLEIGH: RGB = [8.3 / 24.97, 19.3 / 24.97, 47.3 / 24.97];

/**
 * How the body's air scatters (ADR 0318 point 5): per-channel factors on the Rayleigh extinction
 * and a factor on the Mie extinction. No `sky`: Earth's shares, a factor 1 on each (the look of
 * before). With `sky`, the shares follow that colour (linear, normalised to its mean), so the light
 * scattered from a high sun has its hue. `haze` adds Mie, up to 6 times.
 */
export function skyOptics(look: BodyAppearance | undefined): { rayleigh: RGB; mie: number } {
	const mie = 1 + 5 * (look?.haze ?? 0);
	if (!look?.sky) return { rayleigh: [1, 1, 1], mie };
	const c = hexLinear(look.sky);
	const mean = (c[0] + c[1] + c[2]) / 3 || 1;
	return {
		rayleigh: [
			c[0] / mean / EARTH_RAYLEIGH[0],
			c[1] / mean / EARTH_RAYLEIGH[1],
			c[2] / mean / EARTH_RAYLEIGH[2]
		],
		mie
	};
}
