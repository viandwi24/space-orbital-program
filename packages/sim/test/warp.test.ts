import { describe, expect, test } from 'bun:test';
import {
	fromStateVector,
	length,
	propagate,
	propagateUniversal,
	sub,
	toStateVector
} from '@orbital/kepler';
import { centreOfMass, homeMu, orbitState } from './helpers/measure.ts';
import { newSim, probe, twoStage } from './helpers/vessels.ts';

const relErr = (
	a: { x: number; y: number; z: number },
	b: { x: number; y: number; z: number }
): number => length(sub(a, b)) / length(b);

async function inOrbit(speedFactor = 1) {
	const sim = await newSim();
	const { position, velocity } = orbitState(sim, 100_000, speedFactor);
	const r = sim.dispatch({
		type: 'load-vessel',
		design: probe(),
		placement: { kind: 'state', position, velocity }
	});
	if (!r.ok) throw new Error(r.reason);
	return { sim, id: r.vessel!, position, velocity };
}

describe('time warp', () => {
	test('physics warp runs with a vessel in flight (plan 206, ADR 0202 point 2)', async () => {
		const sim = await newSim();
		const r = sim.dispatch({ type: 'load-vessel', design: twoStage() });
		expect(r.ok).toBe(true);
		expect(sim.snapshot().vessels[0]!.mode).toBe('flight');
		expect(sim.dispatch({ type: 'warp', factor: 10 })).toEqual({ ok: true, granted: 10 });
		expect(sim.warp).toBe(10);
		sim.step(1);
		expect(sim.time).toBeCloseTo(10, 6); // 500 fixed steps, physics all the way
		expect(sim.dispatch({ type: 'warp', factor: 1 }).ok).toBe(true);
	});

	test('accepted when every vessel is on rails; position after 10 000 s matches kepler.propagate within 1e-6', async () => {
		const { sim, position, velocity } = await inOrbit(1.05);
		const mu = homeMu(sim);
		const v0 = sim.snapshot().vessels[0]!;
		expect(v0.mode).toBe('on-rails');
		const el0 = fromStateVector(position, velocity, mu, 0);
		expect(v0.orbit!.a).toBeCloseTo(el0.a, 3);

		expect(sim.dispatch({ type: 'warp', factor: 100 }).ok).toBe(true);
		sim.step(100); // 100 s of host time x 100 = 10 000 s
		expect(sim.time).toBeCloseTo(10_000, 6);
		const v1 = sim.snapshot().vessels[0]!;
		expect(v1.mode).toBe('on-rails');
		const expected = propagate(el0, mu, sim.time).r;
		expect(relErr(centreOfMass(sim, v1), expected)).toBeLessThan(1e-6);
		// And the velocity of the same state.
		expect(relErr(v1.velocity, propagate(el0, mu, sim.time).v)).toBeLessThan(1e-6);
	});

	test('a long warp (1e6 s, ~170 orbits) stays within 1e-6 of kepler.propagate: epoch/m0 are re-based', async () => {
		const { sim, position, velocity } = await inOrbit(1.02);
		const mu = homeMu(sim);
		const el0 = fromStateVector(position, velocity, mu, 0);
		// the stock world's top is 10k× (plan 206): 100 s of host time
		expect(sim.dispatch({ type: 'warp', factor: 100_000 })).toMatchObject({
			ok: true,
			granted: 10_000
		});
		sim.step(100);
		expect(sim.time).toBeCloseTo(1_000_000, 3);
		const v = sim.snapshot().vessels[0]!;
		expect(relErr(centreOfMass(sim, v), propagate(el0, mu, sim.time).r)).toBeLessThan(1e-6);
		expect(Math.abs(v.orbit!.epoch - sim.time)).toBeLessThan(2 * 3_000 * 2); // re-based: epoch is recent
	});

	test('throttle during rails warp drops to physics warp in the same call and wakes the vessel (plan 206)', async () => {
		const { sim, id } = await inOrbit();
		expect(sim.dispatch({ type: 'warp', factor: 50 })).toEqual({ ok: true, granted: 50 });
		const modes: string[] = [];
		sim.events.on('vessel:mode-changed', (e) => modes.push(`${e.mode}:${e.reason}`));
		expect(sim.dispatch({ type: 'throttle', vessel: id, value: 1 }).ok).toBe(true);
		expect(sim.warp).toBe(10);
		expect(sim.snapshot().vessels[0]!.mode).toBe('flight');
		expect(modes).toEqual(['flight:throttle']);
		// with the engine running, rails warp is clamped to 10× with the reason
		expect(sim.dispatch({ type: 'warp', factor: 50 })).toEqual({
			ok: true,
			granted: 10,
			limit: 'Max 10× — engine running'
		});
	});

	test('a vessel left idle in a stable orbit goes back on rails after two seconds, on the same orbit', async () => {
		const { sim, id } = await inOrbit(1.03);
		const mu = homeMu(sim);
		const before = sim.snapshot().vessels[0]!.orbit!;
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 }); // wakes it (the probe has no engine)
		expect(sim.snapshot().vessels[0]!.mode).toBe('flight');
		for (let i = 0; i < 90; i++) sim.step(0.02); // 1.8 s
		expect(sim.snapshot().vessels[0]!.mode).toBe('flight');
		for (let i = 0; i < 20; i++) sim.step(0.02);
		const v = sim.snapshot().vessels[0]!;
		expect(v.mode).toBe('on-rails');
		// Same orbit as before the round trip (Rapier is float32, so not bit-exact).
		const a = toStateVector(before, mu, sim.time);
		const b = toStateVector(v.orbit!, mu, sim.time);
		expect(relErr(a.r, b.r)).toBeLessThan(1e-5);
		expect(Math.abs(v.orbit!.a - before.a) / before.a).toBeLessThan(1e-4);
		expect(sim.dispatch({ type: 'warp', factor: 10 }).ok).toBe(true);
	});

	test('a near-parabolic orbit keeps its state vector and is propagated with propagateUniversal', async () => {
		const { sim, id, position, velocity } = await inOrbit(Math.SQRT2); // exactly escape speed: e = 1
		const mu = homeMu(sim);
		expect(() => fromStateVector(position, velocity, mu, 0)).toThrow(); // the case kepler refuses
		const v0 = sim.snapshot().vessels[0]!;
		expect(v0.mode).toBe('on-rails');
		expect(v0.orbit).toBeUndefined();
		const stored = sim.world.serialize().components['sim.vessel']![String(id)] as {
			rails: { kind: string };
		};
		expect(stored.rails.kind).toBe('state');

		sim.dispatch({ type: 'warp', factor: 100 });
		sim.step(50); // 5 000 s
		const v1 = sim.snapshot().vessels[0]!;
		const expected = propagateUniversal(position, velocity, mu, sim.time);
		expect(relErr(centreOfMass(sim, v1), expected.r)).toBeLessThan(1e-6);
		expect(v1.orbit).toBeUndefined();
	});
});
