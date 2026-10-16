import { describe, expect, test } from 'bun:test';
import { Vector3 } from 'three';
import { LaunchSite } from '../src/site-meshes.ts';
import { rotate, vec } from '../src/vec.ts';

const R = 600_000;
const about = (angle: number) => ({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) });

/**
 * Plan 025: the sim now stands vessels at body-fixed coordinates, so the renderer needs no
 * inference: the site at (0, 0) sits on the body's +X axis, turned with the body.
 */
describe('launch site placement', () => {
	for (const angle of [0, 0.0011, 0.3, 2.5]) {
		test(`at body rotation ${angle} rad the pad is on the turned +X axis with local up radial`, () => {
			const site = new LaunchSite(R, { latitude: 0, longitude: 0 }, 0, 0);
			const body = vec(1000, -200, 300);
			const q = about(angle);
			site.place(body, q);
			const expected = rotate(q, vec(R, 0, 0));
			expect(site.root.position.x - body.x).toBeCloseTo(expected.x, 6);
			expect(site.root.position.y - body.y).toBeCloseTo(expected.y, 6);
			expect(site.root.position.z - body.z).toBeCloseTo(expected.z, 6);
			const up = new Vector3(0, 1, 0).applyQuaternion(site.root.quaternion);
			expect(up.x).toBeCloseTo(expected.x / R, 9);
			expect(up.z).toBeCloseTo(expected.z / R, 9);
			site.dispose();
		});
	}
	test('the scene model has no launch-site inference left (the host may still pass a site)', async () => {
		const src = await Bun.file(new URL('../src/scene.ts', import.meta.url)).text();
		expect(src).not.toContain('lockLaunchSite');
		expect(src).not.toContain('LAUNCH_SITE_MAX_ALTITUDE');
	});
});
