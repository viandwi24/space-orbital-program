/**
 * A flat side outline of a design (plan 346, ADR 0295 point 5): the picture for a design that has
 * no saved 3D thumbnail, drawn without WebGL. Each part is its shape (a cylinder or a box) placed
 * by the resolved layout and seen from the side (X right, Y up). Pure: the design and the part
 * lookup in, polygons and an SVG string out.
 */
import type { PartLookup, Quat, VesselDesign } from '@orbital/core';
import { layoutOf } from '../editor/state';

type P2 = readonly [number, number];

export interface ProfileShape {
	/** The outline's corners, metres, Y up. */
	points: readonly P2[];
	/** Engines and thrusters are drawn warmer; everything else in the line colour. */
	role: 'engine' | 'command' | 'body';
}

export interface DesignProfile {
	shapes: readonly ProfileShape[];
	/** The bounds of every shape, metres. */
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

const rotate = (q: Quat, v: readonly [number, number, number]): [number, number, number] => {
	// v' = v + 2w(u×v) + 2u×(u×v)
	const [x, y, z] = v;
	const tx = 2 * (q.y * z - q.z * y);
	const ty = 2 * (q.z * x - q.x * z);
	const tz = 2 * (q.x * y - q.y * x);
	return [
		x + q.w * tx + (q.y * tz - q.z * ty),
		y + q.w * ty + (q.z * tx - q.x * tz),
		z + q.w * tz + (q.x * ty - q.y * tx)
	];
};

/** The outline of every part, or null when the design does not resolve or has no shapes. */
export function designProfile(design: VesselDesign, parts: PartLookup): DesignProfile | null {
	const layout = layoutOf(design, parts);
	if (!layout) return null;
	const shapes: ProfileShape[] = [];
	for (const p of design.parts) {
		const at = layout.get(p.index);
		const def = parts.get(p.part);
		const shape = def?.shape;
		if (!at || !def || !shape) continue;
		const c: P2 = [at.position.x, at.position.y];
		const q = at.rotation;
		const role: ProfileShape['role'] =
			(def.crewCapacity ?? 0) > 0
				? 'command'
				: (def.modules ?? []).some(([id]) => /engine|thruster/i.test(id))
					? 'engine'
					: 'body';
		if (shape.kind === 'cylinder') {
			// the side silhouette of a cylinder: its axis, as long as it is, and as wide as its diameter
			const a = rotate(q, [0, 1, 0]);
			const len = Math.hypot(a[0], a[1]);
			const r = shape.radius;
			const h = (shape.height / 2) * len;
			const ax: P2 = len > 1e-3 ? [a[0] / len, a[1] / len] : [0, 1];
			const half = len > 1e-3 ? h : r;
			const px: P2 = [-ax[1] * r, ax[0] * r];
			shapes.push({
				role,
				points: [
					[c[0] - ax[0] * half - px[0], c[1] - ax[1] * half - px[1]],
					[c[0] - ax[0] * half + px[0], c[1] - ax[1] * half + px[1]],
					[c[0] + ax[0] * half + px[0], c[1] + ax[1] * half + px[1]],
					[c[0] + ax[0] * half - px[0], c[1] + ax[1] * half - px[1]]
				]
			});
		} else {
			// a box: the side bounds of its turned corners
			const [sx, sy, sz] = shape.size.map((s) => s / 2) as [number, number, number];
			let ex = 0;
			let ey = 0;
			for (const [v, e] of [
				[[1, 0, 0], sx],
				[[0, 1, 0], sy],
				[[0, 0, 1], sz]
			] as const) {
				const w = rotate(q, v);
				ex += Math.abs(w[0]) * e;
				ey += Math.abs(w[1]) * e;
			}
			shapes.push({
				role,
				points: [
					[c[0] - ex, c[1] - ey],
					[c[0] + ex, c[1] - ey],
					[c[0] + ex, c[1] + ey],
					[c[0] - ex, c[1] + ey]
				]
			});
		}
	}
	if (shapes.length === 0) return null;
	const xs = shapes.flatMap((s) => s.points.map((p) => p[0]));
	const ys = shapes.flatMap((s) => s.points.map((p) => p[1]));
	return {
		shapes,
		minX: Math.min(...xs),
		maxX: Math.max(...xs),
		minY: Math.min(...ys),
		maxY: Math.max(...ys)
	};
}

/**
 * The outline as an SVG fitted into `width` × `height` with a margin, Y up, centred, the bottom
 * on the ground line. Line colour comes from `currentColor`, engines from `--profile-engine`.
 */
export function profileSvg(profile: DesignProfile, width: number, height: number, pad = 8): string {
	const w = Math.max(profile.maxX - profile.minX, 1e-3);
	const h = Math.max(profile.maxY - profile.minY, 1e-3);
	const s = Math.min((width - 2 * pad) / w, (height - 2 * pad) / h);
	const ox = width / 2 - ((profile.minX + profile.maxX) / 2) * s;
	const oy = height - pad + profile.minY * s;
	const fmt = (n: number): string => (Math.round(n * 10) / 10).toString();
	const polys = profile.shapes
		.map(
			(sh) =>
				`<polygon class="${sh.role}" points="${sh.points.map(([x, y]) => `${fmt(ox + x * s)},${fmt(oy - y * s)}`).join(' ')}"/>`
		)
		.join('');
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" aria-hidden="true">${polys}</svg>`;
}
