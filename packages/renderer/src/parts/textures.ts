/**
 * Procedural surface detail for the part materials (plan 020). Everything is computed from a
 * seeded integer hash into plain byte arrays (`DataTexture`), so it is deterministic, needs no
 * canvas, and runs in Bun tests. All fields tile: the revolve uv is a whole number of tiles
 * around the part.
 */
import {
	DataTexture,
	LinearMipmapLinearFilter,
	LinearFilter,
	NoColorSpace,
	RGBAFormat,
	RepeatWrapping,
	SRGBColorSpace,
	UnsignedByteType
} from 'three';
import { hash3 } from '../noise.ts';

/** Value noise on a lattice of `period` cells that wraps, so the result tiles at u, v in [0, 1). */
export function tileNoise(u: number, v: number, period: number, seed: number): number {
	const x = u * period;
	const y = v * period;
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const fx = x - x0;
	const fy = y - y0;
	const sx = fx * fx * (3 - 2 * fx);
	const sy = fy * fy * (3 - 2 * fy);
	const w = (n: number): number => ((n % period) + period) % period;
	const c = (dx: number, dy: number): number => hash3(w(x0 + dx), w(y0 + dy), 0, seed);
	const a = c(0, 0) + (c(1, 0) - c(0, 0)) * sx;
	const b = c(0, 1) + (c(1, 1) - c(0, 1)) * sx;
	return a + (b - a) * sy;
}

const smooth = (e0: number, e1: number, x: number): number => {
	const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
	return t * t * (3 - 2 * t);
};

/** Distance to the nearest multiple of `1 / n` along one axis, in tile units. */
const lineDist = (t: number, n: number): number => {
	const f = (t * n) % 1;
	return Math.min(f, 1 - f) / n;
};

/** Height field of a painted hull: two by two panels per tile, seams, rivets, micro relief. */
export function hullHeight(u: number, v: number): number {
	const seam = Math.min(lineDist(u, 2), lineDist(v, 2));
	const groove = 1 - smooth(0.004, 0.011, seam);
	// Rivets: every 1/16 tile along the seams, inset by 0.03.
	let rivet = 0;
	for (const line of [0, 0.5]) {
		for (const [along, across] of [
			[u, v],
			[v, u]
		] as const) {
			const d = Math.abs(((across - line + 0.5) % 1) - 0.5);
			if (d > 0.04) continue;
			const k = (along * 16) % 1;
			const dk = Math.min(k, 1 - k) / 16;
			rivet = Math.max(rivet, 1 - smooth(0.0035, 0.0065, Math.hypot(dk, d - 0.03)));
		}
	}
	const micro = tileNoise(u, v, 48, 3) * 0.5 + tileNoise(u, v, 12, 4) * 0.5;
	return -groove * 0.9 + rivet * 0.7 + micro * 0.12;
}

/** Crumpled foil: ridged noise at two scales. */
export function foilHeight(u: number, v: number): number {
	const ridge = (n: number): number => 1 - Math.abs(n * 2 - 1);
	return ridge(tileNoise(u, v, 10, 11)) * 0.7 + ridge(tileNoise(u, v, 24, 12)) * 0.45;
}

/** Heat shield tiles: 10 by 10 per tile, rounded bevel at the joints. */
export function tileHeight(u: number, v: number): number {
	const d = Math.min(lineDist(u, 10), lineDist(v, 10));
	return smooth(0.0, 0.012, d) * 0.8 + tileNoise(u, v, 40, 21) * 0.1;
}

/** Brightness (0..1) of a painted hull: vertical streaks and darker seams. */
export function hullWeather(u: number, v: number): number {
	const streak = tileNoise(u, v, 24, 31) * 0.6 + tileNoise(u, v * 0.125, 6, 32) * 0.4;
	const seam = Math.min(lineDist(u, 2), lineDist(v, 2));
	const grime = 1 - smooth(0.0, 0.03, seam);
	return 0.86 + streak * 0.14 - grime * 0.08;
}

/** Brightness of the heat shield tiles: each tile its own shade, charred joints. */
export function tileWeather(u: number, v: number): number {
	const tu = Math.floor(u * 10);
	const tv = Math.floor(v * 10);
	const shade = 0.82 + hash3(tu, tv, 0, 41) * 0.18;
	const joint = 1 - smooth(0.0, 0.01, Math.min(lineDist(u, 10), lineDist(v, 10)));
	return shade - joint * 0.35;
}

type Field = (u: number, v: number) => number;

/** Tangent-space normal map from a height field (central differences, wrapping). */
export function normalMapData(size: number, field: Field, strength: number): Uint8Array {
	const h = new Float32Array(size * size);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) h[y * size + x] = field(x / size, y / size);
	}
	const out = new Uint8Array(size * size * 4);
	const at = (x: number, y: number): number => h[((y + size) % size) * size + ((x + size) % size)]!;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * strength * (size / 128);
			const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5 * strength * (size / 128);
			const l = Math.hypot(dx, dy, 1);
			const i = (y * size + x) * 4;
			out[i] = Math.round((-dx / l) * 127.5 + 127.5);
			out[i + 1] = Math.round((-dy / l) * 127.5 + 127.5);
			out[i + 2] = Math.round((1 / l) * 127.5 + 127.5);
			out[i + 3] = 255;
		}
	}
	return out;
}

/** Greyscale colour map (sRGB bytes) from a brightness field. */
export function greyMapData(size: number, field: Field): Uint8Array {
	const out = new Uint8Array(size * size * 4);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const v = Math.round(Math.min(1, Math.max(0, field(x / size, y / size))) * 255);
			const i = (y * size + x) * 4;
			out[i] = v;
			out[i + 1] = v;
			out[i + 2] = v;
			out[i + 3] = 255;
		}
	}
	return out;
}

function texture(data: Uint8Array, size: number, colour: boolean): DataTexture {
	const t = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
	t.wrapS = RepeatWrapping;
	t.wrapT = RepeatWrapping;
	t.magFilter = LinearFilter;
	t.minFilter = LinearMipmapLinearFilter;
	t.generateMipmaps = true;
	t.anisotropy = 4;
	t.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
	t.needsUpdate = true;
	return t;
}

export interface PartTextures {
	hullNormal: DataTexture;
	hullWeather: DataTexture;
	foilNormal: DataTexture;
	tileNormal: DataTexture;
	tileMap: DataTexture;
	dispose(): void;
}

export function createPartTextures(size: number): PartTextures {
	const t = {
		hullNormal: texture(normalMapData(size, hullHeight, 1.4), size, false),
		hullWeather: texture(greyMapData(size, hullWeather), size, true),
		foilNormal: texture(normalMapData(size, foilHeight, 2.2), size, false),
		tileNormal: texture(normalMapData(size, tileHeight, 1.6), size, false),
		tileMap: texture(greyMapData(size, tileWeather), size, true)
	};
	return {
		...t,
		dispose() {
			for (const tex of Object.values(t)) tex.dispose();
		}
	};
}
