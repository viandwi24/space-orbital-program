/** Plan 026 / ADR 0035: fins give a restoring moment; a finned rocket weathercocks, an unfinned one tumbles. */
import { describe, expect, test } from 'bun:test';
import { cross, dot, normalize, sub } from '@orbital/kepler';
import type { Quat } from '@orbital/core';
import { VESSEL } from '../src/state.ts';
import { UP_Y, rotate } from './helpers/attitude.ts';
import { boosted, newSim } from './helpers/vessels.ts';

const OMEGA = (2 * Math.PI) / 21_600;

/**
 * Fly `boosted(0, fins)` through the air at `speed` m/s at `alt` metres, nose `aoa` degrees off
 * the velocity, no commands (nothing is lit, no wheel input), and return the angle of attack
 * (nose vs air-relative velocity, degrees) every 0.5 s for `seconds`.
 */
async function coast(fins: number, aoa: number, alt: number, speed: number, seconds: number) {
	const sim = await newSim();
	const a = (aoa * Math.PI) / 180;
	const heading = normalize({ x: Math.sin(a), y: 0, z: -Math.cos(a) });
	const axis = normalize(cross(UP_Y, heading));
	const half = Math.acos(dot(UP_Y, heading)) / 2;
	const orientation: Quat = {
		x: axis.x * Math.sin(half),
		y: axis.y * Math.sin(half),
		z: axis.z * Math.sin(half),
		w: Math.cos(half)
	};
	const res = sim.dispatch({
		type: 'load-vessel',
		design: boosted(0, fins),
		placement: {
			kind: 'state',
			position: { x: 600_000 + alt, y: 0, z: 0 },
			velocity: { x: 0, y: 0, z: -speed },
			orientation
		}
	});
	if (!res.ok) throw new Error(res.reason);
	const angles: number[] = [];
	for (let i = 0; i <= Math.round(seconds / 0.02); i++) {
		if (i % 25 === 0) {
			const v = sim.snapshot().vessels[0]!;
			const st = sim.world.get(res.vessel!, VESSEL)!;
			const air = sub(st.velocity, cross({ x: 0, y: OMEGA, z: 0 }, st.com));
			const nose = rotate(v.orientation, UP_Y);
			angles.push((Math.acos(Math.min(1, dot(nose, normalize(air)))) * 180) / Math.PI);
		}
		sim.step(0.02);
	}
	sim.dispose();
	return angles;
}

describe('fins (ADR 0035)', () => {
	test('four fins keep the coasting rocket within 8 degrees of prograde; without them it tumbles past 30', async () => {
		const finned = await coast(4, 4, 20_000, 1_500, 12);
		const bare = await coast(0, 4, 20_000, 1_500, 12);
		expect(Math.max(...finned)).toBeLessThan(8);
		expect(Math.max(...bare)).toBeGreaterThan(30);
		// The bare rocket's error grows monotonically at first; the finned one comes back through zero.
		expect(bare[6]!).toBeGreaterThan(bare[0]!);
		expect(Math.min(...finned.slice(2))).toBeLessThan(2);
	}, 30_000);
});
