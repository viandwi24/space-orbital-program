/** Plan 091 / ADR 0117: buildings from a list, and picking and projecting in the site view. */
import { describe, expect, test } from 'bun:test';
import type { BodyId, Snapshot } from '@orbital/core';
import { SceneModel } from '../src/scene.ts';
import { buildSiteList, footprintCentre } from '../src/site-list.ts';

const R = 600_000;
const BODY = 'home' as BodyId;
const snapshot = (): Snapshot => ({
	t: 0,
	vessels: [],
	bodies: [{ id: BODY, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }]
});

describe('the building list', () => {
	test('a footprint centre is in site metres (x east, z south) and turns with the rotation', () => {
		expect(footprintCentre({ size: { w: 3, d: 3 }, cell: { i: -1, j: -1 }, rotation: 0 })).toEqual({
			x: 0,
			z: -0,
			w: 3,
			d: 3
		});
		const hangar = footprintCentre({ size: { w: 8, d: 5 }, cell: { i: -10, j: 12 }, rotation: 90 });
		expect(hangar).toEqual({ x: -80, z: -155, w: 5, d: 8 });
	});

	test('every generator gives geometry, and road cells are drawn', () => {
		const kinds = [
			'launch-pad',
			'hangar',
			'control',
			'office',
			'runway',
			'dish',
			'tanks',
			'unknown'
		];
		for (const generator of kinds) {
			const parts = buildSiteList(
				[{ id: generator, generator, size: { w: 4, d: 4 }, cell: { i: 0, j: 0 }, rotation: 0 }],
				[]
			);
			const total = Object.values(parts).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
			expect({ generator, total: total > 0 }).toEqual({ generator, total: true });
		}
		expect(buildSiteList([], [{ i: 1, j: 2 }]).painted).toHaveLength(1);
	});
});

describe('the site view', () => {
	const model = (): SceneModel => {
		const m = new SceneModel({
			bodies: [{ id: BODY, radius: R }],
			partShapes: new Map(),
			siteBuildings: true
		});
		m.resize(1200, 800);
		m.setSiteView(true);
		m.sync(snapshot());
		m.sync(snapshot());
		return m;
	};

	test('a site point projected and picked back lands where it was (within 1 cm)', () => {
		const m = model();
		for (const p of [
			{ east: 0, north: 0 },
			{ east: 120, north: -60 },
			{ east: -80, north: 150 }
		]) {
			const s = m.projectSite(p);
			expect(s).not.toBeNull();
			const back = m.pickSite(s!.x, s!.y)!;
			expect(Math.abs(back.east - p.east)).toBeLessThan(0.01);
			expect(Math.abs(back.north - p.north)).toBeLessThan(0.01);
		}
	});

	test('the camera looks at the site centre from above the ground', () => {
		const m = model();
		const centre = m.projectSite({ east: 0, north: 0 })!;
		expect(centre.x).toBeCloseTo(600, 0); // straight ahead
		expect(centre.y).toBeGreaterThan(0); // on screen (the rig aims a little above its target)
		expect(centre.y).toBeLessThan(800);
		expect(m.pickSite(600, 0)).not.toBeNull(); // the top edge still sees ground (pitch 0.45 rad)
	});
});
