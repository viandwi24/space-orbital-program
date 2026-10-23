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

describe('a building under construction (plan 388)', () => {
	const top = (gs: { computeBoundingBox(): void; boundingBox: { max: { y: number } } | null }[]) =>
		Math.max(
			...gs.map((g) => {
				g.computeBoundingBox();
				return g.boundingBox?.max.y ?? 0;
			})
		);
	const office = (construction?: number) =>
		buildSiteList(
			[
				{
					id: 'b',
					generator: 'office',
					size: { w: 3, d: 2 },
					cell: { i: 0, j: 0 },
					rotation: 0,
					...(construction !== undefined ? { construction } : {})
				}
			],
			[]
		);
	test('a standing building has no planned shape and no scaffold', () => {
		const p = office();
		expect(p.planned).toHaveLength(0);
		expect(p.glass.length).toBeGreaterThan(0);
	});
	test('is its finished shape faint, a scaffold to its height, and a core rising with progress', () => {
		const standing = office();
		const height = top([...standing.structure, ...standing.painted, ...standing.siding]);
		const early = office(0.1);
		const late = office(0.8);
		// the finished shape is all in `planned`; no windows or doors of the real building yet
		expect(early.planned.length).toBeGreaterThan(0);
		expect(early.glass).toHaveLength(0);
		expect(early.door).toHaveLength(0);
		expect(top(early.planned)).toBeCloseTo(height, 1);
		// the scaffold reaches the finished height
		expect(top(early.thin)).toBeGreaterThanOrEqual(height - 0.5);
		// the core: a tenth, then eight tenths, of the height
		expect(top(early.structure)).toBeLessThan(height * 0.25);
		expect(top(late.structure)).toBeGreaterThan(height * 0.7);
	});
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

	test('the site stays put on screen while the planet turns under time warp (plan 388)', () => {
		const m = model();
		const at = (turn: number) => {
			const s = snapshot();
			s.bodies[0]!.rotation = { x: 0, y: Math.sin(turn / 2), z: 0, w: Math.cos(turn / 2) };
			m.sync(s);
			m.prepareFrame(0.016);
			return m.projectSite({ east: 120, north: 60 })!;
		};
		const before = at(0);
		for (const turn of [0.7, 2.1, 4]) {
			const now = at(turn);
			expect(Math.abs(now.x - before.x)).toBeLessThan(1);
			expect(Math.abs(now.y - before.y)).toBeLessThan(1);
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

describe('the site view on a branch (plan 384, ADR 0321)', () => {
	const BRANCH = { id: 'branch-1', latitude: 0.35, longitude: 0.9 };
	// every site's ground is flat, as the world bakes it (plan 084)
	const zone = (latitude: number, longitude: number) => ({
		latitude,
		longitude,
		flatRadius: 2_000,
		blendWidth: 4_000
	});
	const model = (): SceneModel => {
		const m = new SceneModel({
			bodies: [{ id: BODY, radius: R }],
			partShapes: new Map(),
			siteBuildings: true,
			terrain: { seed: 1, zones: [zone(0, 0), zone(BRANCH.latitude, BRANCH.longitude)] }
		});
		m.resize(1200, 800);
		m.setSiteView(true, BRANCH);
		m.sync(snapshot());
		m.sync(snapshot());
		// a frame places every site on the turning body (the primary happens to be at the origin)
		m.prepareFrame(0.016, true);
		return m;
	};

	test("the camera looks at the branch, and picks answer in the branch's own metres", () => {
		const m = model();
		const centre = m.projectSite({ east: 0, north: 0 })!;
		expect(centre.x).toBeCloseTo(600, 0);
		for (const p of [
			{ east: 0, north: 0 },
			{ east: 120, north: -60 }
		]) {
			const s = m.projectSite(p)!;
			const back = m.pickSite(s.x, s.y)!;
			expect(Math.abs(back.east - p.east)).toBeLessThan(0.01);
			expect(Math.abs(back.north - p.north)).toBeLessThan(0.01);
		}
	});

	test('the view back on the primary site looks at the primary again', () => {
		const m = model();
		m.setSiteView(true, { id: 'space-center', latitude: 0, longitude: 0 });
		m.sync(snapshot());
		m.prepareFrame(0.016, true);
		const centre = m.projectSite({ east: 0, north: 0 })!;
		expect(centre.x).toBeCloseTo(600, 0);
		// the branch is far over the horizon from here
		m.setSiteView(true);
		expect(m.pickSite(600, 400)).not.toBeNull();
	});
});
