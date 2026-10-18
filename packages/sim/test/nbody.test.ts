/** Plan 125 / ADR 0122: n-body worlds in the sim: numeric rails, resume, the warp cap, prediction. */
import { describe, expect, test } from 'bun:test';
import { legacyWorldInfo, type EntityId, type WorldInfo } from '@orbital/core';
import { createTrajectoryProvider } from '@orbital/kepler';
import Stock from '@orbital/mod-stock';
import { buildBodies } from '../src/bodies.ts';
import { createSim, type Sim } from '../src/index.ts';
import { patchedBodiesOf } from '../src/maneuver.ts';
import { NBODY_MAX_WARP } from '../src/nbody.ts';
import { rapier, stack } from './helpers/vessels.ts';

const world: WorldInfo = { ...legacyWorldInfo(3), id: 'nbody-test', gravityModel: 'n-body' };
const make = () => createSim({ plugins: [Stock], backendFactory: rapier(8), world });
const R = 600_000;

/** A small tank on a circular orbit 100 km up, on numeric rails. */
function orbiter(sim: Sim, altitude = 100_000, phase = 0): EntityId {
	const mu = 6.6743e-11 * sim.registries.bodies.get('stock.home')!.mass;
	const r = R + altitude;
	const v = Math.sqrt(mu / r);
	const res = sim.dispatch({
		type: 'load-vessel',
		design: stack('Tank', ['stock.tank-small'], []),
		placement: {
			kind: 'state',
			body: 'stock.home',
			position: { x: r * Math.cos(phase), y: 0, z: -r * Math.sin(phase) },
			velocity: { x: -v * Math.sin(phase), y: 0, z: -v * Math.cos(phase) }
		}
	});
	if (!res.ok) throw new Error(res.reason);
	return res.vessel!;
}

function warpTo(sim: Sim, time: number, factor = 1e4): void {
	expect(sim.dispatch({ type: 'warp-to', time, factor }).ok).toBe(true);
	for (let g = 0; g < 1e6 && (sim.time < time - 1e-6 || sim.warp !== 1); g++) sim.step(0.5);
}

const stateOf = (sim: Sim, id: EntityId) => sim.snapshot().vessels.find((v) => v.id === id)!;

describe('n-body worlds (ADR 0122)', () => {
	test('a vessel on numeric rails resumes to the bit on the same platform', async () => {
		const sim = await make();
		const id = orbiter(sim);
		warpTo(sim, 3_000);
		const save = sim.save();
		const again = await createSim({
			plugins: [Stock],
			backendFactory: rapier(8),
			resume: JSON.parse(JSON.stringify(save))
		});
		warpTo(sim, 9_000);
		warpTo(again, 9_000);
		expect(JSON.stringify(stateOf(again, id).position)).toBe(
			JSON.stringify(stateOf(sim, id).position)
		);
		expect(JSON.stringify(again.save().world)).toBe(JSON.stringify(sim.save().world));
		sim.dispose();
		again.dispose();
	});

	test('warp above the cap is refused with the reason', async () => {
		const sim = await make();
		orbiter(sim);
		const r = sim.dispatch({ type: 'warp', factor: NBODY_MAX_WARP * 10 });
		expect(r.ok ? '' : r.reason).toBe(`n-body integration limits warp to ${NBODY_MAX_WARP}x`);
		expect(sim.dispatch({ type: 'warp', factor: NBODY_MAX_WARP }).ok).toBe(true);
		sim.dispose();
	});

	test('the path the provider predicts is what the sim flies, within 1 m after one day', async () => {
		const sim = await make();
		const id = orbiter(sim, 250_000);
		const start = stateOf(sim, id);
		const bodies = buildBodies(sim.registries.bodies.list(), sim.home, undefined, sim.worldInfo);
		const provider = createTrajectoryProvider('n-body', patchedBodiesOf(bodies));
		const day = 21_650.8;
		const predicted = provider.stateAt(
			{ body: start.soi, r: start.position, v: start.velocity, t: sim.time },
			sim.time + day
		)!;
		warpTo(sim, sim.time + day);
		const flown = stateOf(sim, id);
		expect(flown.soi as string).toBe(predicted.body);
		const d = Math.hypot(
			flown.position.x - predicted.r.x,
			flown.position.y - predicted.r.y,
			flown.position.z - predicted.r.z
		);
		expect(d).toBeLessThan(1);
		sim.dispose();
	});

	test('20 vessels on rails at the cap: the budget holds the warp so the integrator stays within its frame budget', async () => {
		const nb = await import('../src/nbody.ts');
		const sim = await make();
		for (let k = 0; k < 20; k++) orbiter(sim, 80_000 + k * 20_000, k * 0.3);
		const limited: number[] = [];
		sim.events.on('warp:limited', (e) => limited.push(e.factor));
		expect(sim.dispatch({ type: 'warp', factor: NBODY_MAX_WARP }).ok).toBe(true);
		for (let f = 0; f < 30; f++) sim.step(1 / 60); // the budget settles
		const frames = 60;
		const e0 = nb.totalEvaluations;
		const t0 = performance.now();
		for (let f = 0; f < frames; f++) sim.step(1 / 60);
		const perFrame = (performance.now() - t0) / frames;
		const evaluations = (nb.totalEvaluations - e0) / frames;
		console.log(
			`n-body: 20 vessels held at ${sim.warp}x: ${evaluations.toFixed(0)} evaluations, ${perFrame.toFixed(3)} ms per frame`
		);
		expect(limited.length).toBeGreaterThan(0);
		expect(sim.warp).toBeLessThan(NBODY_MAX_WARP);
		expect(evaluations).toBeLessThanOrEqual(nb.NBODY_FRAME_EVALUATIONS);
		sim.dispose();
	});
});
