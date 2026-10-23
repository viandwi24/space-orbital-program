/** Plan 396: the site's fixed structure is one render bundle, re-recorded only when what is drawn changes. */
import { describe, expect, test } from 'bun:test';
import { Mesh, Object3D } from 'three';
import { LaunchSite, type StaticBundle } from '../src/site-meshes.ts';

const fake = (): StaticBundle => Object.assign(new Object3D(), { needsUpdate: false });
const meshesIn = (o: Object3D): Mesh[] => o.children.filter((c): c is Mesh => c instanceof Mesh);

describe('the static site bundle', () => {
	test('takes the structure meshes off the root and records once', () => {
		const site = new LaunchSite(600_000, { latitude: 0, longitude: 0 }, 0, 0);
		const before = meshesIn(site.root).length;
		expect(before).toBeGreaterThan(3);
		const bundle = fake();
		site.bundleStatic(bundle);
		expect(meshesIn(bundle).length).toBeGreaterThan(3);
		expect(bundle.parent).toBe(site.root);
		expect(site.bundleRebuilds).toBe(1);
		expect(bundle.needsUpdate).toBe(true);
		// asking again changes nothing
		site.bundleStatic(fake());
		expect(site.bundleRebuilds).toBe(1);
		site.dispose();
	});

	test('is re-recorded only when the structures appear or vanish with distance', () => {
		const site = new LaunchSite(600_000, { latitude: 0, longitude: 0 }, 0, 0);
		const bundle = fake();
		site.bundleStatic(bundle);
		bundle.needsUpdate = false;
		for (const d of [50, 60, 80, 100]) site.setDetail(d);
		expect(site.bundleRebuilds).toBe(1);
		site.setDetail(1_000_000); // far: the structures are not drawn
		expect(site.bundleRebuilds).toBe(2);
		expect(bundle.needsUpdate).toBe(true);
		site.setDetail(2_000_000);
		expect(site.bundleRebuilds).toBe(2);
		site.setDetail(50);
		expect(site.bundleRebuilds).toBe(3);
		site.dispose();
	});

	test('without a bundle nothing changes', () => {
		const site = new LaunchSite(600_000, { latitude: 0, longitude: 0 }, 0, 0);
		site.setDetail(1_000_000);
		site.setDetail(50);
		expect(site.bundleRebuilds).toBe(0);
		site.dispose();
	});
});
