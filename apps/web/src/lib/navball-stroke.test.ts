import { describe, expect, it } from 'vitest';
import type { Quat, Vec3 } from '@orbital/core';
import { strokeVisible } from './hud/navball-draw';
import {
	elevationCircle,
	fillElevationCircle,
	fillMeridian,
	localHorizon,
	meridian,
	setHorizonDirection,
	horizonDirection,
	vesselAxes,
	visibleRuns
} from './navball-math';

/** A canvas that records the path it is given, as runs of points. */
function recorder() {
	const runs: [number, number][][] = [];
	let run: [number, number][] | null = null;
	return {
		runs,
		ctx: {
			beginPath() {
				run = [];
			},
			moveTo(x: number, y: number) {
				run?.push([x, y]);
			},
			lineTo(x: number, y: number) {
				run?.push([x, y]);
			},
			stroke() {
				if (run && run.length > 1) runs.push(run);
				run = null;
			}
		}
	};
}

const norm = (q: Quat): Quat => {
	const l = Math.hypot(q.x, q.y, q.z, q.w);
	return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
};

const quats: Quat[] = [
	{ x: 0, y: 0, z: 0, w: 1 },
	norm({ x: 0.3, y: -0.5, z: 0.2, w: 0.7 }),
	norm({ x: 0.9, y: 0.1, z: -0.4, w: 0.2 }),
	norm({ x: -0.2, y: 0.8, z: 0.5, w: -0.3 }),
	norm({ x: 0.5, y: 0.5, z: 0.5, w: 0.5 })
];
const positions: Vec3[] = [
	{ x: 7e5, y: 1e5, z: 2e5 },
	{ x: -3e5, y: 6e5, z: -2e5 },
	{ x: 1e3, y: 7e5, z: 1e3 }
];

describe('the navball painter without allocation (plan 418)', () => {
	it('fills the same curves as the allocating builders', () => {
		const h = localHorizon(positions[0]!);
		const out: Vec3[] = [];
		const n = fillElevationCircle(out, h, 0.4);
		const ref = elevationCircle(h, 0.4);
		expect(n).toBe(ref.length);
		for (let i = 0; i < n; i++) expect(out[i]).toEqual(ref[i]);
		const m = fillMeridian(out, h, 1.1, -1.3, 1.3);
		const refM = meridian(h, 1.1, -1.3, 1.3);
		expect(m).toBe(refM.length);
		for (let i = 0; i < m; i++) expect(out[i]).toEqual(refM[i]);
		const one: Vec3 = { x: 0, y: 0, z: 0 };
		expect(setHorizonDirection(one, h, 0.7, 0.2)).toEqual(horizonDirection(h, 0.7, 0.2));
	});

	it('reuses the objects of the list it is given', () => {
		const h = localHorizon(positions[0]!);
		const out: Vec3[] = [];
		fillElevationCircle(out, h, 0.1);
		const first = out[3];
		fillElevationCircle(out, h, 0.5);
		expect(out[3]).toBe(first);
	});

	it('strokes the pieces visibleRuns finds, cut at the rim, for any orientation', () => {
		for (const position of positions)
			for (const q of quats)
				for (const elev of [-1.2, -0.4, 0, 0.5, 1.2]) {
					const h = localHorizon(position);
					const rec = recorder();
					const out: Vec3[] = [];
					const n = fillElevationCircle(out, h, elev);
					strokeVisible(rec.ctx, out, n, vesselAxes(q), 100, 100, 50);
					const expected = visibleRuns(elevationCircle(h, elev), q).map((r) =>
						r.map((p) => [100 + p.x * 50, 100 - p.y * 50])
					);
					expect(rec.runs.length).toBe(expected.length);
					rec.runs.forEach((r, i) => {
						expect(r.length).toBe(expected[i]!.length);
						r.forEach((pt, j) => {
							expect(pt[0]).toBeCloseTo(expected[i]![j]![0]!, 9);
							expect(pt[1]).toBeCloseTo(expected[i]![j]![1]!, 9);
						});
					});
				}
	});
});
