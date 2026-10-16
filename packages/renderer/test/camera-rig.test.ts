import { describe, expect, test } from 'bun:test';
import { FLIGHT_RIG_LIMITS, applyRigInput, rigOffset } from '../src/camera-rig.ts';

describe('camera rig', () => {
	const start = { yaw: 0, pitch: 0, distance: 100 };

	test('offset has length = distance and points along +Z at yaw 0, pitch 0', () => {
		expect(rigOffset(start)).toEqual({ x: 0, y: 0, z: 100 });
		const o = rigOffset({ yaw: 1, pitch: 0.4, distance: 50 });
		expect(Math.hypot(o.x, o.y, o.z)).toBeCloseTo(50, 12);
	});

	test('pitch and distance are clamped; input is not mutated', () => {
		const frozen = Object.freeze({ ...start });
		const up = applyRigInput(frozen, FLIGHT_RIG_LIMITS, { dPitch: 10, zoomFactor: 1e9 });
		expect(up.pitch).toBeLessThan(Math.PI / 2);
		expect(up.distance).toBe(FLIGHT_RIG_LIMITS.maxDistance);
		const down = applyRigInput(frozen, FLIGHT_RIG_LIMITS, { dPitch: -10, zoomFactor: 1e-9 });
		expect(down.pitch).toBeGreaterThan(-Math.PI / 2);
		expect(down.distance).toBe(FLIGHT_RIG_LIMITS.minDistance);
		expect(frozen).toEqual(start);
	});
});
