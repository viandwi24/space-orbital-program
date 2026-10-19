/**
 * Fairings (plan 219, ADR 0224): a closed shell over a probe cuts the stack's drag at Mach 0.8 by
 * at least 30 %; thrown off, the drag is the bare stack's again. (In `packages/sim` rather than
 * `mods/stock`: the drag needs the sim.)
 */
import { describe, expect, test } from 'bun:test';
import type { Quat, VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { fairingStack, shellMass } from './helpers/fairing.ts';
import { homeMu, RADIUS, vesselMass } from './helpers/measure.ts';
import { rapier } from './helpers/vessels.ts';

/** +Y (the stack's nose) turned onto +X (radial out at the placement). */
const NOSE_OUT: Quat = { x: 0, y: 0, z: -Math.SQRT1_2, w: Math.SQRT1_2 };

/** Drag force on the stack, N: climbing at Mach 0.8 at 2 km, one step, gravity taken out. */
async function drag(design: VesselDesign, extraMass: number, stage = false): Promise<number> {
	const sim = await createSim({ plugins: [Stock], backendFactory: rapier(), seed: 1 });
	const r = RADIUS + 2_000;
	const speed = 0.8 * 332;
	const loaded = sim.dispatch({
		type: 'load-vessel',
		design,
		placement: {
			kind: 'state',
			position: { x: r, y: 0, z: 0 },
			velocity: { x: speed, y: 0, z: 0 },
			orientation: NOSE_OUT
		}
	});
	if (!loaded.ok) throw new Error(loaded.reason);
	const id = loaded.vessel!;
	if (stage) {
		expect(sim.dispatch({ type: 'stage', vessel: id }).ok).toBe(true);
		sim.step(0.02); // the panels leave
	}
	const before = sim.snapshot().vessels.find((v) => v.id === id)!;
	const dt = 0.02;
	sim.step(dt);
	const after = sim.snapshot().vessels.find((v) => v.id === id)!;
	const g = -homeMu(sim) / (before.position.x * before.position.x);
	const ax = (after.velocity.x - before.velocity.x) / dt - g;
	const mass = vesselMass(sim, after) + extraMass;
	sim.dispose();
	return -ax * mass;
}

describe('fairings (plan 219)', () => {
	test('a closed 1.25 m fairing over a probe cuts the drag at Mach 0.8 by at least 30 %; jettisoned, it is the bare stack again', async () => {
		const bare = await drag(fairingStack([]), 0);
		const faired = await drag(fairingStack(), shellMass());
		const thrown = await drag(fairingStack(), 0, true);
		console.log(
			`fairing drag: bare ${bare.toFixed(1)} N, faired ${faired.toFixed(1)} N, jettisoned ${thrown.toFixed(1)} N`
		);
		expect(bare).toBeGreaterThan(0);
		expect(faired).toBeLessThan(0.7 * bare);
		expect(Math.abs(thrown - bare) / bare).toBeLessThan(0.05);
	}, 60_000);
});
