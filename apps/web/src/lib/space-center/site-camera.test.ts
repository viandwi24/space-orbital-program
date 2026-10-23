/** Plan 387 (ADR 0326): the Space Center camera's fit-all, best angle and occlusion fallback. */
import { LEGACY_SITE, loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import {
	bestView,
	blocks,
	fitAll,
	frameBoxes,
	shortestTurn,
	siteBoxes,
	siteFront,
	toCamera,
	type SiteBox,
	type ViewportSpec
} from './site-camera';

const vp: ViewportSpec = {
	width: 1600,
	height: 900,
	fovY: (50 * Math.PI) / 180,
	insets: { top: 80, right: 24, bottom: 120, left: 24 }
};
const box = (east: number, north: number, w = 20, d = 20, h = 10): SiteBox => ({
	east,
	north,
	w,
	d,
	h
});
const DEG = Math.PI / 180;

/** Every corner of `boxes` projects inside the free viewport from `v`. */
function allInside(v: ReturnType<typeof frameBoxes>, boxes: SiteBox[], vpx = vp): boolean {
	const c = toCamera(v.azimuth, v.elevation);
	const cam = {
		e: v.focus.east + c.e * v.distance,
		n: v.focus.north + c.n * v.distance,
		u: v.focus.up + c.u * v.distance
	};
	const f = { e: -c.e, n: -c.n, u: -c.u };
	const r = { e: f.n, n: -f.e, u: 0 };
	const rl = Math.hypot(r.e, r.n);
	const right = { e: r.e / rl, n: r.n / rl, u: 0 };
	const up = { e: right.n * f.u - 0, n: -right.e * f.u, u: right.e * f.n - right.n * f.e };
	const ty = Math.tan(vpx.fovY / 2);
	const tx = ty * (vpx.width / vpx.height);
	const fx = (vpx.width - vpx.insets.left - vpx.insets.right) / vpx.width;
	const fy = (vpx.height - vpx.insets.top - vpx.insets.bottom) / vpx.height;
	for (const b of boxes)
		for (const e of [-b.w / 2, b.w / 2])
			for (const n of [-b.d / 2, b.d / 2])
				for (const u of [0, b.h]) {
					const p = { e: b.east + e - cam.e, n: b.north + n - cam.n, u: u - cam.u };
					const z = p.e * f.e + p.n * f.n + p.u * f.u;
					const x = (p.e * right.e + p.n * right.n) / z;
					const y = (p.e * up.e + p.n * up.n + p.u * up.u) / z;
					if (z <= 0 || Math.abs(x) > tx * fx * 1.001 || Math.abs(y) > ty * fy * 1.001)
						return false;
				}
	return true;
}

describe('fitAll', () => {
	const boxes = [box(0, 0), box(200, 50, 40, 60, 30), box(-120, -80), box(60, 300, 20, 20, 30)];
	it('holds every box in the free viewport, at 40° from the site front', () => {
		const v = fitAll(boxes, [Math.PI], vp);
		expect(v.elevation).toBeCloseTo(40 * DEG);
		expect(v.azimuth).toBeCloseTo(Math.PI);
		expect(allInside(v, boxes)).toBe(true);
	});
	it('a narrower window or a larger inset moves the camera back', () => {
		const wide = fitAll(boxes, [], vp);
		const narrow = fitAll(boxes, [], { ...vp, width: 700 });
		const strip = fitAll(boxes, [], { ...vp, insets: { ...vp.insets, bottom: 360 } });
		expect(narrow.distance).toBeGreaterThan(wide.distance);
		expect(strip.distance).toBeGreaterThan(wide.distance);
		expect(allInside(strip, boxes, { ...vp, insets: { ...vp.insets, bottom: 360 } })).toBe(true);
	});
	it('a site of one small building still shows its ground', () => {
		const one = fitAll([box(0, 0, 20, 20, 12)], [], vp);
		const wide = frameBoxes([box(0, 0, 180, 180, 0)], vp, Math.PI, one.elevation, 0.92);
		expect(one.distance).toBeGreaterThanOrEqual(wide.distance - 1);
	});
	it('the site front is the side most entrances face', () => {
		expect(siteFront([0, 0, Math.PI / 2])).toBeCloseTo(Math.atan2(1, 2));
		expect(siteFront([])).toBeCloseTo(Math.PI);
	});
});

describe('bestView', () => {
	it('looks from the entrance side, above the ground, filling about half the view', () => {
		const target = box(0, 0, 40, 40, 30);
		const v = bestView(target, Math.PI / 2, [], vp);
		expect(v.azimuth).toBeCloseTo(Math.PI / 2);
		expect(v.elevation).toBeGreaterThan(0);
		expect(allInside(v, [target])).toBe(true);
		// 55 % of the free view, not edge to edge
		const edge = frameBoxes([target], vp, v.azimuth, v.elevation, 0.92).distance;
		expect(v.distance).toBeGreaterThan(edge);
		expect(v.distance).toBeLessThan(edge * 2.5);
	});
	it('walks round a building in the way', () => {
		const target = box(0, 0, 20, 20, 10);
		// a tall block between the building and the camera on its east side
		const wall = box(26, 0, 12, 60, 80);
		const straight = bestView(target, Math.PI / 2, [], vp);
		const sc = toCamera(straight.azimuth, straight.elevation);
		expect(
			blocks(
				{
					e: sc.e * straight.distance,
					n: sc.n * straight.distance,
					u: straight.focus.up + sc.u * straight.distance
				},
				{ e: 0, n: 0, u: 5 },
				wall
			)
		).toBe(true);
		const v = bestView(target, Math.PI / 2, [wall], vp);
		expect(Math.abs(shortestTurn(v.azimuth, Math.PI / 2))).toBeGreaterThan(10 * DEG);
		const c = toCamera(v.azimuth, v.elevation);
		const cam = { e: c.e * v.distance, n: c.n * v.distance, u: v.focus.up + c.u * v.distance };
		expect(blocks(cam, { e: 0, n: 0, u: 5 }, wall)).toBe(false);
	});
	it('without an entrance it looks from the south', () => {
		expect(bestView(box(0, 0), null, [], vp).azimuth).toBeCloseTo(Math.PI);
	});
});

describe('the helpers', () => {
	it('blocks: a segment through a box, and one passing over it', () => {
		const b = box(0, 0, 10, 10, 10);
		expect(blocks({ e: -20, n: 0, u: 5 }, { e: 20, n: 0, u: 5 }, b)).toBe(true);
		expect(blocks({ e: -20, n: 0, u: 15 }, { e: 20, n: 0, u: 15 }, b)).toBe(false);
	});
	it('shortestTurn takes the short way round', () => {
		expect(shortestTurn(0.1, 2 * Math.PI - 0.1)).toBeCloseTo(-0.2);
		expect(shortestTurn(3, -3)).toBeCloseTo(2 * Math.PI - 6);
	});
	it('siteBoxes: the stock site, every building with its entrance facing', () => {
		const { registries } = loadPlugins([Stock]);
		const { buildings } = siteBoxes(LEGACY_SITE, registries.buildings);
		expect(buildings.length).toBe(LEGACY_SITE.buildings?.length);
		for (const b of buildings) {
			expect(b.box.w).toBeGreaterThan(0);
			expect(b.box.h).toBeGreaterThan(0);
		}
		expect(buildings.some((b) => b.facing !== null)).toBe(true);
	});
});
