import { describe, expect, it } from 'vitest';
import { BLACKOUT_BADGE_LEVEL, blackoutShown, vesselBlackout } from './blackout';

const HOME = {
	rotationPeriod: 21_600,
	atmosphere: { scaleHeight: 5_600, surfacePressure: 101_325, height: 70_000 }
};
const R = 600_000;
const at = (altitude: number, speed: number) => ({
	position: { x: R + altitude, y: 0, z: 0 },
	// along z, which is also the direction the ground moves, so the air speed is not reduced to 0
	velocity: { x: 0, y: 0, z: speed }
});

describe('plasma blackout read-out', () => {
	it('is none in orbit, on the pad and at a gentle sea-level climb', () => {
		const orbit = at(120_000, 2_300);
		expect(vesselBlackout(orbit.position, orbit.velocity, 120_000, HOME)).toBe(0);
		const pad = at(2, 0);
		expect(vesselBlackout(pad.position, pad.velocity, 2, HOME)).toBe(0);
		const slow = at(3_000, 250);
		expect(vesselBlackout(slow.position, slow.velocity, 3_000, HOME)).toBe(0);
	});

	it('is full in a orbital re-entry in the thick of it and shows the badge', () => {
		const entry = at(25_000, 2_300);
		const level = vesselBlackout(entry.position, entry.velocity, 25_000, HOME);
		expect(level).toBeGreaterThanOrEqual(BLACKOUT_BADGE_LEVEL);
		expect(blackoutShown(level)).toBe(true);
	});

	it('is none on a body without an atmosphere', () => {
		const v = at(1_000, 4_000);
		expect(vesselBlackout(v.position, v.velocity, 1_000, { rotationPeriod: 3_600 })).toBe(0);
	});

	it('uses the air speed: sitting on the ground that turns with the body is not a fast flight', () => {
		const omega = (2 * Math.PI) / HOME.rotationPeriod;
		const v = at(2, -omega * R); // the ground's own velocity at x = R
		expect(vesselBlackout(v.position, v.velocity, 2, HOME)).toBe(0);
	});

	it('shows the badge only at or above the level', () => {
		expect(blackoutShown(BLACKOUT_BADGE_LEVEL - 0.01)).toBe(false);
		expect(blackoutShown(BLACKOUT_BADGE_LEVEL)).toBe(true);
	});
});
