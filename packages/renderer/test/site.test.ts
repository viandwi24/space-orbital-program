import { describe, expect, test } from 'bun:test';
import {
	BUILDINGS,
	PAD_RADIUS,
	ROADS,
	TREE_INNER,
	TREE_OUTER,
	distanceToSegment,
	TUFT_RADIUS,
	isBuilt,
	isPaved,
	layoutTufts,
	layoutVegetation,
	SITE_DETAIL_RANGE,
	TUFT_CELLS,
	siteDetail,
	tuftCell
} from '../src/site.ts';
import { fitShadow } from '../src/shadow-fit.ts';
import { bodyRotationAt, siteAxes } from '../src/sun.ts';
import { DEG, add, dot, length, normalize, rotate, scale, sub, vec } from '../src/vec.ts';

describe('launch site layout', () => {
	test('is deterministic and respects the tree budget', () => {
		const a = layoutVegetation(300, 7);
		expect(layoutVegetation(300, 7)).toEqual(a);
		expect(a.trees.length).toBe(300);
		expect(layoutVegetation(100, 7).trees.length).toBe(100);
	});
	test('trees and rocks keep clear of the pad, buildings and roads; trees stay in the annulus', () => {
		const { trees, rocks } = layoutVegetation(900, 7);
		for (const t of trees) {
			const r = Math.hypot(t.x, t.z);
			expect(r).toBeGreaterThanOrEqual(TREE_INNER);
			expect(r).toBeLessThanOrEqual(TREE_OUTER);
			expect(isBuilt(t.x, t.z, 5)).toBe(false);
		}
		for (const r of rocks) expect(isBuilt(r.x, r.z, 2)).toBe(false);
		for (const b of BUILDINGS) {
			expect(
				trees.some((t) => Math.abs(t.x - b.x) < b.w / 2 && Math.abs(t.z - b.z) < b.d / 2)
			).toBe(false);
		}
		for (const road of ROADS) {
			const near = trees.filter(
				(t) => distanceToSegment(t.x, t.z, road.ax, road.az, road.bx, road.bz) < road.width / 2
			);
			expect(near.length).toBe(0);
		}
	});
	test('grass tufts: deterministic, within budget and radius, never on pavement or under buildings', () => {
		const a = layoutTufts(5000, 11);
		expect(layoutTufts(5000, 11)).toEqual(a);
		expect(a.length).toBeGreaterThan(2500);
		expect(a.length).toBeLessThanOrEqual(5000);
		expect(layoutTufts(0)).toEqual([]);
		for (const t of a) {
			expect(Math.hypot(t.x, t.z)).toBeLessThanOrEqual(TUFT_RADIUS);
			expect(isPaved(t.x, t.z, 0)).toBe(false);
			expect(t.tint).toBeGreaterThanOrEqual(0);
			expect(t.tint).toBeLessThan(1);
		}
		// thinner toward the rim than near the pad (per unit area)
		const near = a.filter((t) => Math.hypot(t.x, t.z) < 25).length / (Math.PI * 25 * 25);
		const far =
			a.filter((t) => Math.hypot(t.x, t.z) > 55).length /
			(Math.PI * (TUFT_RADIUS * TUFT_RADIUS - 55 * 55));
		expect(near).toBeGreaterThan(far);
	});
	test('isPaved covers the pad, roads, buildings and the tower footing but not open lawn', () => {
		expect(isPaved(0, 0, 0)).toBe(true);
		expect(isPaved(0, -40, 0)).toBe(true); // the road north of the pad
		expect(isPaved(BUILDINGS[0]!.x, BUILDINGS[0]!.z, 0)).toBe(true);
		expect(isPaved(7.5, 0, 0)).toBe(true); // tower
		expect(isPaved(30, 30, 0)).toBe(false);
	});
	test('shrubs stand beside buildings and roads, not on them', () => {
		const { bushes } = layoutVegetation(100, 7);
		expect(bushes.length).toBeGreaterThan(60);
		for (const b of bushes) expect(isPaved(b.x, b.z, 0.5)).toBe(false);
		expect(layoutVegetation(100, 7).bushes).toEqual(bushes);
	});
	test('nothing is built inside the pad and the pad is clear of roads except their start', () => {
		for (const b of BUILDINGS)
			expect(Math.hypot(b.x, b.z)).toBeGreaterThan(PAD_RADIUS + b.w / 2 - 20);
		expect(isBuilt(0, 0, 0)).toBe(true);
	});
	test('the site frame co-rotates with the body: angle after dt equals omega * dt', () => {
		const omega = (2 * Math.PI) / 21_600;
		const axes = siteAxes(0, 0);
		const R = 600_000;
		const at = (t: number) => rotate(bodyRotationAt(omega, t), scale(axes.up, R));
		const p0 = at(0);
		const p1 = at(137.5);
		const angle = Math.acos(dot(normalize(p0), normalize(p1)));
		expect(angle).toBeCloseTo(omega * 137.5, 9);
		// the world velocity of the site is omega x r, eastward (-Z at t = 0), as the sim reports
		const v = scale(sub(at(0.001), p0), 1000);
		expect(length(v)).toBeCloseTo(omega * R, 1);
		expect(v.z).toBeLessThan(0);
	});
});

describe('site detail by distance (plan 039)', () => {
	test('everything is drawn at the pad, nothing beyond the last range', () => {
		expect(siteDetail(30)).toEqual({ tufts: true, rocks: true, trees: true, structures: true });
		expect(siteDetail(SITE_DETAIL_RANGE.structures + 1)).toEqual({
			tufts: false,
			rocks: false,
			trees: false,
			structures: false
		});
	});
	test('small things go first, in the order of their size', () => {
		const d = (m: number) => siteDetail(m);
		expect(d(SITE_DETAIL_RANGE.tufts + 1).tufts).toBe(false);
		expect(d(SITE_DETAIL_RANGE.tufts + 1).rocks).toBe(true);
		expect(d(SITE_DETAIL_RANGE.rocks + 1).rocks).toBe(false);
		expect(d(SITE_DETAIL_RANGE.rocks + 1).trees).toBe(true);
		expect(d(SITE_DETAIL_RANGE.trees + 1).trees).toBe(false);
		expect(d(SITE_DETAIL_RANGE.trees + 1).structures).toBe(true);
	});
	test('a tuft is a fraction of a pixel where it is cut: 0.5 m at the range is under 1 mrad', () => {
		expect(0.5 / SITE_DETAIL_RANGE.tufts).toBeLessThan(0.001);
	});
	test('every tuft falls in exactly one cell of the grid', () => {
		const tufts = layoutTufts(2000);
		const counts = new Array<number>(TUFT_CELLS * TUFT_CELLS).fill(0);
		for (const t of tufts) {
			const c = tuftCell(t.x, t.z);
			expect(c).toBeGreaterThanOrEqual(0);
			expect(c).toBeLessThan(counts.length);
			counts[c]!++;
		}
		expect(counts.reduce((a, b) => a + b, 0)).toBe(tufts.length);
		expect(counts.filter((n) => n > 0).length).toBeGreaterThan(TUFT_CELLS * 2);
	});
});

describe('shadow fit', () => {
	const centre = vec(12.34, 5.6, -7.8);
	for (const elev of [5, 20, 45, 89]) {
		test(`contains the caster sphere and snaps to texels at sun elevation ${elev}`, () => {
			const sun = normalize(vec(Math.cos(elev * DEG), Math.sin(elev * DEG), 0.2));
			const r = 40;
			const size = 2048;
			const f = fitShadow(sun, centre, r, size, 30);
			// every point of the caster sphere has light-space xy within the box
			for (const d of [
				vec(1, 0, 0),
				vec(-1, 0, 0),
				vec(0, 1, 0),
				vec(0, -1, 0),
				vec(0, 0, 1),
				vec(0, 0, -1)
			]) {
				const p = add(centre, scale(d, r));
				const rel = sub(p, f.target);
				expect(Math.abs(dot(rel, f.right))).toBeLessThanOrEqual(
					f.halfExtent + (2 * r) / size + 1e-9
				);
				expect(Math.abs(dot(rel, f.up))).toBeLessThanOrEqual(f.halfExtent + (2 * r) / size + 1e-9);
			}
			const texel = (2 * r) / size;
			const cr = dot(f.target, f.right) / texel;
			expect(Math.abs(cr - Math.round(cr))).toBeLessThan(1e-6);
			// moving the centre by less than half a texel does not move the target
			const f2 = fitShadow(sun, add(centre, scale(f.right, texel * 0.2)), r, size, 30);
			expect(length(sub(f2.target, f.target))).toBeLessThan(1e-9);
			expect(f.far).toBeGreaterThan(f.near);
			expect(length(sub(f.position, f.target))).toBeGreaterThan(r);
		});
	}
});
