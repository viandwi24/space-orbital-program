/**
 * Surface of revolution with hard edges where the profile says so. three's `LatheGeometry`
 * averages the normals of neighbouring profile segments, so every corner of a tank collar would
 * come out rounded; here a corner is a corner unless the point is marked `smooth`.
 *
 * The profile is walked from the bottom of the part to the top, outer surface first, so the
 * outward normal of a segment (dr, dy) is (dy, -dr): a wall going up faces out, a top cap walked
 * toward the axis faces up, a bottom cap walked away from the axis faces down. Walking an inner
 * surface the other way round flips the normal to face the axis.
 */
import { BufferGeometry, Float32BufferAttribute } from 'three';

export interface ProfilePoint {
	/** Distance from the axis, m (>= 0). */
	r: number;
	y: number;
	/** Blend the normal with the neighbouring segment(s) at this point. Default false (hard edge). */
	smooth?: boolean;
}

export interface RevolveOptions {
	/** Radial segments around the full circle (>= 3). */
	segments: number;
	/** Edge length of one texture tile, m (uv = metres / tile). Default 1. */
	tile?: number;
	/** Start angle and sweep, radians. Default a full turn. */
	phiStart?: number;
	phiLength?: number;
}

const EPS = 1e-9;

/** Indexed geometry with `position`, `normal` and `uv`. */
export function revolve(profile: readonly ProfilePoint[], options: RevolveOptions): BufferGeometry {
	const segments = Math.max(3, Math.floor(options.segments));
	const tile = options.tile ?? 1;
	const phiStart = options.phiStart ?? 0;
	const phiLength = options.phiLength ?? Math.PI * 2;
	const rMax = Math.max(...profile.map((p) => p.r), 1e-3);
	// A whole number of tiles around so the texture closes at the seam.
	const tilesAround = Math.max(1, Math.round((phiLength * rMax) / tile));

	// Segment normals (2D, in the r-y plane), skipping zero-length segments.
	interface Seg {
		a: ProfilePoint;
		b: ProfilePoint;
		n: [number, number];
		v0: number;
		v1: number;
	}
	const segs: Seg[] = [];
	let arc = 0;
	for (let i = 0; i + 1 < profile.length; i++) {
		const a = profile[i]!;
		const b = profile[i + 1]!;
		const dr = b.r - a.r;
		const dy = b.y - a.y;
		const len = Math.hypot(dr, dy);
		if (len < EPS) continue;
		segs.push({ a, b, n: [dy / len, -dr / len], v0: arc / tile, v1: (arc + len) / tile });
		arc += len;
	}

	const blend = (n: [number, number], other: [number, number] | undefined, smooth: boolean) => {
		if (!smooth || !other) return n;
		const x = n[0] + other[0];
		const y = n[1] + other[1];
		const l = Math.hypot(x, y);
		return l < EPS ? n : ([x / l, y / l] as [number, number]);
	};

	const positions: number[] = [];
	const normals: number[] = [];
	const uvs: number[] = [];
	const indices: number[] = [];
	const ring = segments + 1;

	segs.forEach((seg, si) => {
		const prev = segs[si - 1];
		const next = segs[si + 1];
		const nA = blend(seg.n, prev?.n, seg.a.smooth === true);
		const nB = blend(seg.n, next?.n, seg.b.smooth === true);
		const base = positions.length / 3;
		for (const [p, n, v] of [
			[seg.a, nA, seg.v0],
			[seg.b, nB, seg.v1]
		] as const) {
			for (let j = 0; j <= segments; j++) {
				const t = j / segments;
				const phi = phiStart + phiLength * t;
				const s = Math.sin(phi);
				const c = Math.cos(phi);
				positions.push(p.r * s, p.y, p.r * c);
				normals.push(n[0] * s, n[1], n[0] * c);
				uvs.push(t * tilesAround, v);
			}
		}
		// Winding: counter-clockwise seen from outside along the normal.
		for (let j = 0; j < segments; j++) {
			const a0 = base + j;
			const a1 = base + j + 1;
			const b0 = base + ring + j;
			const b1 = base + ring + j + 1;
			indices.push(a0, a1, b0, a1, b1, b0);
		}
	});

	const g = new BufferGeometry();
	g.setAttribute('position', new Float32BufferAttribute(positions, 3));
	g.setAttribute('normal', new Float32BufferAttribute(normals, 3));
	g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
	g.setIndex(indices);
	return g;
}

/** Profile of a straight cylinder wall with flat caps (bottom cap, wall, top cap). */
export function cylinderProfile(r: number, y0: number, y1: number): ProfilePoint[] {
	return [
		{ r: 0, y: y0 },
		{ r, y: y0 },
		{ r, y: y1 },
		{ r: 0, y: y1 }
	];
}

/**
 * Whether a profile follows the winding rule above: an outer surface walks from the bottom to the
 * top (`up`), an inner one from the top down (`down`). A profile whose first and last points are
 * at one height is `level` (a flat ring). The seam test applies it to every generator (plan 207).
 */
export function profileDirection(profile: readonly ProfilePoint[]): 'up' | 'down' | 'level' {
	const first = profile[0];
	const last = profile[profile.length - 1];
	if (!first || !last) return 'level';
	const dy = last.y - first.y;
	return dy > EPS ? 'up' : dy < -EPS ? 'down' : 'level';
}
