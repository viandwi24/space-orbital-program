/** Every home site's buildings at their own place (plan 384, ADR 0321). */
import { describe, expect, test } from 'bun:test';
import { Mesh, Vector3 } from 'three';
import { LaunchSite, SiteBuildings } from '../src/site-meshes.ts';
import type { SiteBuildingView } from '../src/site-list.ts';
import { siteAxes } from '../src/sun.ts';

const R = 600_000;
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
const HANGAR: SiteBuildingView = {
	id: 'h',
	kind: 'stock.hangar',
	generator: 'hangar',
	level: 0,
	state: 'active',
	cell: { i: 0, j: 0 },
	rotation: 0,
	size: { w: 3, d: 3 }
} as unknown as SiteBuildingView;

const materialsOf = (o: { root: { traverse: (f: (x: unknown) => void) => void } }) => {
	const out = new Set<unknown>();
	o.root.traverse((x) => {
		if (x instanceof Mesh) out.add(x.material);
	});
	return out;
};

describe('a branch site', () => {
	test("shares the HQ's material instances: showing it builds no new program", () => {
		const hq = new LaunchSite(R, { latitude: 0, longitude: 0 }, 0, 0, true);
		hq.setBuildings([HANGAR], []);
		const branch = new SiteBuildings(hq.sharedMaterials, R, { latitude: 0.4, longitude: 1.1 });
		branch.setBuildings([HANGAR], []);
		const theirs = materialsOf(hq);
		const mine = materialsOf(branch);
		expect(mine.size).toBeGreaterThan(0);
		for (const m of mine) expect(theirs.has(m)).toBe(true);
		branch.dispose();
		hq.dispose();
	});

	test('stands at its own latitude and longitude, up along its radial', () => {
		const at = { latitude: 0.4, longitude: 1.1 };
		const hq = new LaunchSite(R, { latitude: 0, longitude: 0 }, 0, 0, true);
		const branch = new SiteBuildings(hq.sharedMaterials, R, at);
		branch.place({ x: 0, y: 0, z: 0 }, IDENTITY);
		const up = siteAxes(at.latitude, at.longitude).up;
		const p = branch.root.position;
		expect(p.x).toBeCloseTo(up.x * R, 3);
		expect(p.y).toBeCloseTo(up.y * R, 3);
		expect(p.z).toBeCloseTo(up.z * R, 3);
		// a point 100 m north of the branch is 100 m from its centre, on its ground plane
		const north = branch.siteToWorld({ east: 0, north: 100 });
		expect(north.distanceTo(new Vector3(p.x, p.y, p.z))).toBeCloseTo(100, 6);
		// and a ray down onto it picks it back in the branch's own metres
		const from = branch.siteToWorld({ east: 30, north: -20, up: 50 });
		const hit = branch.pickPlane(from, new Vector3(-up.x, -up.y, -up.z));
		expect(hit!.east).toBeCloseTo(30, 6);
		expect(hit!.north).toBeCloseTo(-20, 6);
		hq.dispose();
	});
});

describe('a base on another body (plan 386)', () => {
	const MOON_R = 190_000;
	test('stands on the Moon at its place and height, carried with the Moon', () => {
		const hq = new LaunchSite(R, { latitude: 0, longitude: 0 }, 0, 0, true);
		hq.setBuildings([HANGAR], []);
		const at = { latitude: 0.2, longitude: -0.6 };
		const flat = 42; // the height of the flat zone over the reference sphere
		const base = new SiteBuildings(hq.sharedMaterials, MOON_R + flat, at);
		base.setBuildings([HANGAR], []);
		const moon = { x: 3.8e8, y: -1e6, z: 2e5 };
		// the Moon turned a quarter about +Y: the base turns with it
		const s = Math.SQRT1_2;
		const turn = { x: 0, y: s, z: 0, w: s };
		base.place(moon, turn);
		const up = siteAxes(at.latitude, at.longitude).up;
		const turned = new Vector3(up.x, up.y, up.z).applyQuaternion({ ...turn } as never);
		const p = base.root.position;
		expect(p.x - moon.x).toBeCloseTo(turned.x * (MOON_R + flat), 2);
		expect(p.y - moon.y).toBeCloseTo(turned.y * (MOON_R + flat), 2);
		expect(p.z - moon.z).toBeCloseTo(turned.z * (MOON_R + flat), 2);
		expect(Math.hypot(p.x - moon.x, p.y - moon.y, p.z - moon.z)).toBeCloseTo(MOON_R + flat, 2);
		// it draws with the HQ's materials: showing it compiles nothing
		const theirs = materialsOf(hq);
		for (const m of materialsOf(base)) expect(theirs.has(m)).toBe(true);
		base.dispose();
		hq.dispose();
	});
});
