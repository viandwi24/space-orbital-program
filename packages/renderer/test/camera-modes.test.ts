/** Plan 226 / ADR 0226: the flight camera's reference frame per mode. */
import { describe, expect, test } from 'bun:test';
import {
	CAMERA_MODES,
	cameraPose,
	modeFrame,
	nextCameraMode,
	reframe,
	resolveMode,
	rotate,
	type CameraSubject
} from '../src/camera-modes.ts';

const R = 700_000;
/** In a 100 km orbit, inclined 30° (normal tipped off +Y) so no frame is trivially the identity. */
const i = Math.PI / 6;
const subject: CameraSubject = {
	position: { x: R, y: 0, z: 0 },
	velocity: { x: 0, y: 2_300 * Math.sin(i), z: -2_300 * Math.cos(i) },
	orientation: { x: 0, y: 0, z: 0, w: 1 },
	altitude: 100_000,
	atmosphereTop: 70_000
};
const angle = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
	Math.acos(
		Math.min(
			1,
			(a.x * b.x + a.y * b.y + a.z * b.z) / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z))
		)
	);
const rig = { yaw: 0.6, pitch: 0.35, distance: 50 };

describe('camera modes', () => {
	test('in Orbital the up vector is the orbit normal', () => {
		const up = cameraPose(rig, modeFrame('orbital', subject)).up;
		const p = subject.position;
		const v = subject.velocity;
		const n = { x: p.y * v.z - p.z * v.y, y: p.z * v.x - p.x * v.z, z: p.x * v.y - p.y * v.x };
		expect(angle(up, n)).toBeLessThan(1e-9);
		// Free keeps the old rule: away from the body
		expect(angle(cameraPose(rig, modeFrame('free', subject)).up, p)).toBeLessThan(1e-9);
	});

	test('switching Free to Orbital keeps the view direction within 0.5 degrees', () => {
		for (const r of [
			rig,
			{ yaw: -2, pitch: -0.8, distance: 300 },
			{ yaw: 3, pitch: 1.2, distance: 9 }
		]) {
			const from = modeFrame('free', subject);
			const to = modeFrame('orbital', subject);
			const before = cameraPose(r, from).offset;
			const moved = reframe(r, from, to);
			const after = cameraPose(moved, to).offset;
			expect(angle(before, after)).toBeLessThan((0.5 * Math.PI) / 180);
			expect(moved.distance).toBe(r.distance);
		}
	});

	test('Locked follows a 90 degree roll of the vessel', () => {
		const s = Math.SQRT1_2;
		const rolled = { ...subject, orientation: { x: 0, y: s, z: 0, w: s } }; // 90° about the vessel's long axis (+Y)
		const pitched = { ...subject, orientation: { x: s, y: 0, z: 0, w: s } }; // nose over by 90°
		const base = cameraPose(rig, modeFrame('locked', subject)).offset;
		const roll = cameraPose(rig, modeFrame('locked', rolled)).offset;
		expect(angle(base, roll)).toBeCloseTo(angle(rotate(rolled.orientation, base), base), 9);
		expect(Math.abs(angle(base, roll) - 0)).toBeGreaterThan(0.1);
		// the up vector is the vessel's axis
		const up = cameraPose(rig, modeFrame('locked', pitched)).up;
		expect(angle(up, rotate(pitched.orientation, { x: 0, y: 1, z: 0 }))).toBeLessThan(1e-9);
	});

	test('Auto is Free in the air and Orbital above it; V cycles in order', () => {
		expect(resolveMode('auto', { ...subject, altitude: 10_000 })).toBe('free');
		expect(resolveMode('auto', subject)).toBe('orbital');
		expect(resolveMode('auto', { ...subject, atmosphereTop: undefined, altitude: 20_000 })).toBe(
			'free'
		);
		expect(CAMERA_MODES).toEqual(['auto', 'free', 'orbital', 'locked']);
		expect(['free', 'orbital', 'locked'].map((m) => nextCameraMode(m as 'free'))).toEqual([
			'orbital',
			'locked',
			'auto'
		]);
	});
});
