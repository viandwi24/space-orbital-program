import { describe, expect, test } from 'bun:test';
import { MIN_ALTITUDE, planetFrame } from '../src/planet-frame.ts';
import { ORIGIN_GRID } from '../src/origin.ts';
import { bodyRotationAt } from '../src/sun.ts';
import { length, rotate, scale, vec } from '../src/vec.ts';

const R = 600_000;
const omega = (2 * Math.PI) / 21_600;

describe('planetFrame', () => {
	test('altitude is exact at planetary magnitude and the radial is a unit vector', () => {
		const body = vec(-5 * ORIGIN_GRID, 0, 0);
		const f = planetFrame({
			bodyRender: body,
			cameraRender: vec(-5 * ORIGIN_GRID + R + 2.5, 0.25, 0),
			bodyRotation: bodyRotationAt(omega, 1234),
			radius: R,
			siteLatitude: 0,
			siteLongitude: 0
		});
		expect(f.altitude).toBeCloseTo(2.5, 6);
		expect(length(f.up)).toBeCloseTo(1, 12);
	});
	test('camera-local coordinates are small (anchor on the 1024 m grid) and reconstruct the position', () => {
		const q = bodyRotationAt(omega, 777);
		const bodyRender = vec(1e4, -2e3, 5e3);
		const camBodyFixed = vec(R + 30, 410, -873);
		const cam = rotate(q, camBodyFixed);
		const f = planetFrame({
			bodyRender,
			cameraRender: vec(bodyRender.x + cam.x, bodyRender.y + cam.y, bodyRender.z + cam.z),
			bodyRotation: q,
			radius: R,
			siteLatitude: 0,
			siteLongitude: 0
		});
		expect(Math.abs(f.camLocal.x)).toBeLessThanOrEqual(ORIGIN_GRID / 2 + 1e-6);
		expect(Math.abs(f.camLocal.y)).toBeLessThanOrEqual(ORIGIN_GRID / 2 + 1e-6);
		expect(Math.abs(f.camLocal.z)).toBeLessThanOrEqual(ORIGIN_GRID / 2 + 1e-6);
		for (const k of ['x', 'y', 'z'] as const) {
			expect(Number.isInteger(f.anchorCell[k])).toBe(true);
			expect(f.anchorCell[k] * ORIGIN_GRID + f.camLocal[k]).toBeCloseTo(camBodyFixed[k], 6);
		}
		// the site at lat/lon 0 is on +X body-fixed: 30 m below and 410 m / 873 m to the side
		expect(f.camToSite.x).toBeCloseTo(30, 6);
	});
	test('a camera below the ground is lifted to the minimum altitude', () => {
		const f = planetFrame({
			bodyRender: vec(0, 0, 0),
			cameraRender: scale(vec(1, 0, 0), R - 3),
			bodyRotation: { x: 0, y: 0, z: 0, w: 1 },
			radius: R,
			siteLatitude: 0,
			siteLongitude: 0
		});
		expect(f.altitude).toBe(MIN_ALTITUDE);
	});
});
