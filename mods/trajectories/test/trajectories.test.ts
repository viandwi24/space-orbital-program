/** Plan 347, ADR 0296: the Trajectories mod predicts where a coasting vessel comes down. */
import { describe, expect, test } from 'bun:test';
import { conicImpact, type Quat, type Vec3 } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '@orbital/sim';
import { orbitState } from '../../../packages/sim/test/helpers/measure.ts';
import { probe, rapier } from '../../../packages/sim/test/helpers/vessels.ts';
import Trajectories, { CLEAR_TARGET, PATH, predict, rotate, SET_TARGET, surfaceDistance, Target } from '../src/index.ts';

const R = 600_000;
const MU = 3.5316e12;
const conj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

describe('predict (pure)', () => {
	test('without air or spin it comes down where the conic does', () => {
		const r = { x: R + 50_000, y: 0, z: 0 };
		const v = { x: 0, y: 300, z: -1_500 };
		const p = predict({
			r, v, mu: MU, radius: R, soi: 8e7, omega: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 },
			atmosphereHeight: 0, air: () => ({ density: 0 }), machFactor: () => 1, ground: () => 0, mass: 1_000, dragArea: 1
		});
		const conic = conicImpact(MU, r, v, R)!;
		expect(p.end).toBe('ground');
		expect(p.impact!.time).toBeCloseTo(conic.time, -1); // within 5 s
		expect(surfaceDistance(p.impact!.position, conic.position, R)).toBeLessThan(500);
		expect(p.path.length).toBeGreaterThan(10);
	});

	test('drag brings it down shorter; an orbit runs out of time', () => {
		const base = {
			r: { x: R + 30_000, y: 0, z: 0 }, v: { x: 0, y: 0, z: -1_200 }, mu: MU, radius: R, soi: 8e7,
			omega: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, atmosphereHeight: 70_000,
			air: (h: number) => ({ density: 1.225 * Math.exp(-h / 5_000), speedOfSound: 300 }),
			machFactor: () => 1, ground: () => 0, mass: 1_000, dragArea: 1
		};
		const vac = predict({ ...base, dragArea: 0 });
		const air = predict(base);
		const here: Vec3 = base.r;
		expect(surfaceDistance(here, air.impact!.position, R)).toBeLessThan(surfaceDistance(here, vac.impact!.position, R));
		expect(air.impact!.speed).toBeLessThan(vac.impact!.speed / 3);
		const orbit = predict({ ...base, r: { x: R + 200_000, y: 0, z: 0 }, v: { x: 0, y: 0, z: -Math.sqrt(MU / (R + 200_000)) }, maxTime: 600 });
		expect(orbit.impact).toBeNull();
	});
});

const make = () => createSim({ plugins: [Stock, Trajectories], backendFactory: rapier(16), seed: 4 });
function drop(sim: Sim, alt: number, speedFactor: number): number {
	const r = sim.dispatch({
		type: 'load-vessel',
		design: probe(),
		placement: { kind: 'state', ...orbitState(sim, alt, speedFactor), orientation: { x: 0, y: 0, z: 0, w: 1 } }
	});
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return Number(r.vessel);
}

describe('Trajectories in a sim', () => {
	test('a probe dropped from 30 km lands near the predicted cross-hair; the target and its error', async () => {
		const sim = await make();
		const id = drop(sim, 30_000, 0.5);
		// a controlled descent: SAS holds retrograde, so the drag area settles (a tumbling probe's
		// swings with its attitude; the prediction then converges only as it falls)
		sim.dispatch({ type: 'sas', vessel: id as never, mode: 'retrograde' });
		for (let i = 0; i < 10 * 50; i++) sim.step(0.02);
		const s0 = sim.snapshot();
		const layer = s0.overlays?.[PATH.id];
		expect(layer).toBeDefined();
		const cross = layer!.shapes.find((s) => s.kind === 'marker' && s.style === 'cross');
		if (!cross || cross.kind !== 'marker') throw new Error('no impact cross-hair');
		expect(cross.frame).toBe('body-fixed');
		expect(cross.vessel).toBe(id);
		const predictedTime = layer!.meta![`time:${id}`] as number;
		const flight = layer!.meta![`distance:${id}`] as number;
		expect(predictedTime).toBeGreaterThan(30);

		// set the landing target at the impact: the overlay draws it, about 0 m off
		expect(sim.dispatch({ type: 'mod-key', key: SET_TARGET.id, vessel: id })).toMatchObject({ ok: true });
		for (let i = 0; i < 15; i++) sim.step(0.02);
		expect(sim.snapshot().stores?.[Target.id]).toMatchObject({ body: 'stock.home' });
		const withTarget = sim.snapshot().overlays![PATH.id]!;
		expect(withTarget.shapes.some((s) => s.kind === 'marker' && s.style === 'target')).toBe(true);
		expect(withTarget.meta![`error:${id}`] as number).toBeLessThan(0.02 * flight + 50);

		// fly it down and note where it ends, in the body's axes
		let last: Vec3 | null = null;
		let t = 0;
		for (let i = 0; i < 400 * 50; i++) {
			sim.step(0.02);
			if (i % 10 !== 0) continue;
			const snap = sim.snapshot();
			const v = snap.vessels.find((x) => Number(x.id) === id);
			if (!v) break;
			const home = snap.bodies.find((b) => b.id === 'stock.home')!;
			last = rotate(conj(home.rotation), v.position);
			t = snap.t;
			if (v.situation === 'landed' || v.situation === 'splashed') break;
		}
		expect(last).not.toBeNull();
		const miss = surfaceDistance(last!, cross.position, R);
		console.log(`trajectories: predicted ${predictedTime} s over ${flight} m; flew ${Math.round(t - s0.t)} s; missed by ${Math.round(miss)} m`);
		expect(miss).toBeLessThan(0.02 * flight + 100);
		expect(Math.abs(t - s0.t - predictedTime)).toBeLessThan(0.05 * predictedTime + 2);

		sim.dispatch({ type: 'mod-key', key: CLEAR_TARGET.id, vessel: id });
		expect(sim.snapshot().stores?.[Target.id]).toBeNull();
		sim.dispose();
	}, 120_000);
});
