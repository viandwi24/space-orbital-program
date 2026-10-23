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
