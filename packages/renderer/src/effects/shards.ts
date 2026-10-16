/**
 * Debris pieces cut from the real meshes of the destroyed parts (plan 033, ADR 0047): a piece is a
 * thin prism over a triangle of the part's own geometry, in the colour of the material that
 * triangle used. Pure data in, flat arrays out, so it is tested without a GPU.
 */
import type { BufferGeometry } from 'three';
import { createParticleRng } from './particles.ts';

export interface ShardSource {
	/** Nine numbers per triangle (three vertices), part frame, m. */
	readonly triangles: Float32Array;
	/** Three numbers per triangle: linear RGB of its material. */
	readonly colours: Float32Array;
	/** Running sum of triangle areas, for picking by area. */
	readonly cumulativeArea: Float64Array;
}

/**
 * Collects the triangles of a (non-indexed or indexed) geometry; `colourOf(materialIndex)` gives
 * the colour of a group's material. Without groups every triangle uses material 0.
 */
export function shardSourceFromGeometry(
	geometry: BufferGeometry,
	colourOf: (materialIndex: number) => readonly [number, number, number]
): ShardSource {
	const pos = geometry.getAttribute('position');
	const index = geometry.index;
	const count = index ? index.count : pos.count;
	const n = Math.floor(count / 3);
	const triangles = new Float32Array(n * 9);
	const colours = new Float32Array(n * 3);
	const cumulativeArea = new Float64Array(n);
	const groups =
		geometry.groups.length > 0 ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
	let total = 0;
	for (const g of groups) {
		const rgb = colourOf(g.materialIndex ?? 0);
		for (let i = g.start; i + 2 < g.start + g.count && i + 2 < count; i += 3) {
			const t = i / 3;
			for (let k = 0; k < 3; k++) {
				const v = index ? index.getX(i + k) : i + k;
				triangles[t * 9 + k * 3] = pos.getX(v);
				triangles[t * 9 + k * 3 + 1] = pos.getY(v);
				triangles[t * 9 + k * 3 + 2] = pos.getZ(v);
			}
			colours.set(rgb, t * 3);
		}
	}
	for (let t = 0; t < n; t++) {
		total += triangleArea(triangles, t);
		cumulativeArea[t] = total;
	}
	return { triangles, colours, cumulativeArea };
}

/** One source from several (a model made of several meshes). */
export function mergeShardSources(list: readonly ShardSource[]): ShardSource {
	let n = 0;
	for (const s of list) n += s.cumulativeArea.length;
	const triangles = new Float32Array(n * 9);
	const colours = new Float32Array(n * 3);
	const cumulativeArea = new Float64Array(n);
	let t = 0;
	let total = 0;
	for (const s of list) {
		triangles.set(s.triangles, t * 9);
		colours.set(s.colours, t * 3);
		for (let i = 0; i < s.cumulativeArea.length; i++) {
			const area = s.cumulativeArea[i]! - (i > 0 ? s.cumulativeArea[i - 1]! : 0);
			total += area;
			cumulativeArea[t + i] = total;
		}
		t += s.cumulativeArea.length;
	}
	return { triangles, colours, cumulativeArea };
}

export function triangleArea(triangles: Float32Array, t: number): number {
	const o = t * 9;
	const ux = triangles[o + 3]! - triangles[o]!;
	const uy = triangles[o + 4]! - triangles[o + 1]!;
	const uz = triangles[o + 5]! - triangles[o + 2]!;
	const vx = triangles[o + 6]! - triangles[o]!;
	const vy = triangles[o + 7]! - triangles[o + 1]!;
	const vz = triangles[o + 8]! - triangles[o + 2]!;
	return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

/** `count` triangle indices drawn with probability proportional to area (deterministic for a seed). */
export function pickTriangles(source: ShardSource, count: number, seed: number): number[] {
	const n = source.cumulativeArea.length;
	if (n === 0) return [];
	const total = source.cumulativeArea[n - 1]!;
	const rnd = createParticleRng(seed);
	const out: number[] = [];
	for (let i = 0; i < count; i++) {
		const target = rnd() * total;
		let lo = 0;
		let hi = n - 1;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (source.cumulativeArea[mid]! < target) lo = mid + 1;
			else hi = mid;
		}
		out.push(lo);
	}
	return out;
}

/** Vertices of one prism piece: 8 triangles. */
export const PIECE_VERTICES = 24;

/**
 * Writes the 24 vertices of the prism over triangle `t`, centred on its centroid, scaled so its
 * longest edge is `edge` metres, `thickness` metres deep, into `out` at `offset` (local axes of the
 * piece; the caller rotates and places it). Returns the triangle's colour offset for reuse.
 */
export function writePiece(
	source: ShardSource,
	t: number,
	edge: number,
	thickness: number,
	out: Float32Array,
	offset: number
): void {
	const o = t * 9;
	const p = source.triangles;
	const a = [p[o]!, p[o + 1]!, p[o + 2]!];
	const b = [p[o + 3]!, p[o + 4]!, p[o + 5]!];
	const c = [p[o + 6]!, p[o + 7]!, p[o + 8]!];
	const cx = (a[0]! + b[0]! + c[0]!) / 3;
	const cy = (a[1]! + b[1]! + c[1]!) / 3;
	const cz = (a[2]! + b[2]! + c[2]!) / 3;
	const longest = Math.max(
		Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!),
		Math.hypot(c[0]! - b[0]!, c[1]! - b[1]!, c[2]! - b[2]!),
		Math.hypot(a[0]! - c[0]!, a[1]! - c[1]!, a[2]! - c[2]!),
		1e-6
	);
	const k = edge / longest;
	// Triangle normal for the thickness direction.
	const ux = b[0]! - a[0]!;
	const uy = b[1]! - a[1]!;
	const uz = b[2]! - a[2]!;
	const vx = c[0]! - a[0]!;
	const vy = c[1]! - a[1]!;
	const vz = c[2]! - a[2]!;
	let nx = uy * vz - uz * vy;
	let ny = uz * vx - ux * vz;
	let nz = ux * vy - uy * vx;
	const nl = Math.hypot(nx, ny, nz) || 1;
	nx = (nx / nl) * thickness * 0.5;
	ny = (ny / nl) * thickness * 0.5;
	nz = (nz / nl) * thickness * 0.5;
	const top = [a, b, c].map((v) => [
		(v[0]! - cx) * k + nx,
		(v[1]! - cy) * k + ny,
		(v[2]! - cz) * k + nz
	]);
	const bottom = [a, b, c].map((v) => [
		(v[0]! - cx) * k - nx,
		(v[1]! - cy) * k - ny,
		(v[2]! - cz) * k - nz
	]);
	let w = offset;
	const put = (v: number[]): void => {
		out[w++] = v[0]!;
		out[w++] = v[1]!;
		out[w++] = v[2]!;
	};
	// Top (outward = +n), bottom (reversed), and three side quads.
	put(top[0]!);
	put(top[1]!);
	put(top[2]!);
	put(bottom[0]!);
	put(bottom[2]!);
	put(bottom[1]!);
	for (let e = 0; e < 3; e++) {
		const n1 = (e + 1) % 3;
		put(top[e]!);
		put(bottom[e]!);
		put(bottom[n1]!);
		put(top[e]!);
		put(bottom[n1]!);
		put(top[n1]!);
	}
}

/** A flat two-triangle plate used when a part model is not available. */
export function fallbackSource(colour: readonly [number, number, number]): ShardSource {
	const triangles = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1]);
	const colours = new Float32Array([...colour, ...colour]);
	const cumulativeArea = new Float64Array([0.5, 1]);
	return { triangles, colours, cumulativeArea };
}
