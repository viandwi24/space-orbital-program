/** RCS authority for the stability assist (plan 211, ADR 0217): a probe without a wheel holds prograde on RCS. */
import { describe, expect, test } from 'bun:test';
import { partId, type VesselDesign } from '@orbital/core';
import {
	launchInOrbit,
	modeDirection,
	newSasSim,
	pointingError,
	quatAbout,
	vesselOf,
	withDisturber
} from './helpers/sas.ts';

const DEG = 180 / Math.PI;

/** A probe core on a monoprop tank with four RCS blocks around the tank, no reaction wheel. */
function rcsProbe(): VesselDesign {
	const blocks = [0, 1, 2, 3].map((k) => ({
		index: 2 + k,
		part: partId('stock.rcs-block'),
		parent: {
			index: 1,
			parentNode: 'surface',
			node: 'radial',
			radial: { angle: (k * Math.PI) / 2, y: 0 }
		}
	}));
	return {
		formatVersion: 3,
		name: 'RCS probe',
		parts: [
			{ index: 0, part: partId('stock.probe-core'), parent: null },
			{
				index: 1,
				part: partId('stock.monoprop-tank'),
				parent: { index: 0, parentNode: 'bottom', node: 'top' }
			},
			...blocks
		],
		stages: []
	} as VesselDesign;
}

/** Worst pointing error at prograde over 20..30 s, deg. */
async function holdProgradeWith(rcs: boolean): Promise<number> {
	const sim = await newSasSim();
	// 30 degrees off prograde: only RCS can turn a probe without a wheel back
	const id = launchInOrbit(
		sim,
		withDisturber(rcsProbe()),
		quatAbout({ x: 1, y: 0, z: 0 }, Math.PI / 6)
	);
	// a 1 N·m disturbance keeps the probe in flight (an idle vessel goes on rails, where SAS is exact)
	const disturber = vesselOf(sim, id).parts.find((p) => p.definition === 'test.disturber')!;
	sim.dispatch({
		type: 'action',
		vessel: id,
		part: disturber.id,
		module: 'test.disturbance',
		action: 'set',
		args: [1, 0, 0]
	});
	if (rcs) expect(sim.dispatch({ type: 'set-rcs', vessel: id, on: true }).ok).toBe(true);
	expect(sim.dispatch({ type: 'sas', vessel: id, mode: 'prograde', reference: 'orbit' }).ok).toBe(
		true
	);
	let late = 0;
	for (let i = 0; i < 30 * 50; i++) {
		sim.step(0.02);
		if (sim.time > 20) {
			const v = vesselOf(sim, id);
			late = Math.max(
				late,
				pointingError(v.orientation, modeDirection('prograde', v.position, v.velocity)) * DEG
			);
		}
	}
	sim.dispose();
	return late;
}

describe('RCS for SAS (plan 211)', () => {
	test('a probe with RCS on and no wheel holds prograde within 2 degrees after 20 s; off, it does not', async () => {
		const on = await holdProgradeWith(true);
		const off = await holdProgradeWith(false);
		console.log(`rcs sas: on ${on.toFixed(2)} deg, off ${off.toFixed(2)} deg`);
		expect(on).toBeLessThan(2);
		expect(off).toBeGreaterThan(2);
	}, 120_000);

	test('translating forward on RCS pushes the probe along its nose', async () => {
		const sim = await newSasSim();
		const id = launchInOrbit(sim, rcsProbe());
		expect(sim.dispatch({ type: 'set-rcs', vessel: id, on: true }).ok).toBe(true);
		const before = vesselOf(sim, id);
		const nose = rotate(before.orientation, { x: 0, y: 1, z: 0 });
		expect(
			sim.dispatch({
				type: 'attitude',
				vessel: id,
				pitch: 0,
				yaw: 0,
				roll: 0,
				translate: { x: 0, y: 1, z: 0 }
			}).ok
		).toBe(true);
		for (let i = 0; i < 25; i++) sim.step(0.02);
		const after = vesselOf(sim, id);
		const dv = {
			x: after.velocity.x - before.velocity.x,
			y: after.velocity.y - before.velocity.y,
			z: after.velocity.z - before.velocity.z
		};
		const along = dv.x * nose.x + dv.y * nose.y + dv.z * nose.z;
		console.log(`rcs forward: ${along.toFixed(4)} m/s along the nose in 0.5 s`);
		expect(along).toBeGreaterThan(0.05);
		sim.dispose();
	}, 60_000);
});

/** `v` rotated by the unit quaternion `q`. */
function rotate(
	q: { x: number; y: number; z: number; w: number },
	v: { x: number; y: number; z: number }
) {
	const tx = 2 * (q.y * v.z - q.z * v.y);
	const ty = 2 * (q.z * v.x - q.x * v.z);
	const tz = 2 * (q.x * v.y - q.y * v.x);
	return {
		x: v.x + q.w * tx + (q.y * tz - q.z * ty),
		y: v.y + q.w * ty + (q.z * tx - q.x * tz),
		z: v.z + q.w * tz + (q.x * ty - q.y * tx)
	};
}
