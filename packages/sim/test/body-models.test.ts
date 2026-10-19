/** Body path models in the sim (plan 123, ADR 0183): stateInParent, SOI entry, cost. */
import { describe, expect, test } from 'bun:test';
import { GRAVITATIONAL_CONSTANT, type Plugin } from '@orbital/core';
import {
	bodyPathState,
	propagateUniversal,
	type BodyPath,
	type OrbitalElements,
	type Vec3
} from '@orbital/kepler';
import Stock, { HOME_MU } from '@orbital/mod-stock';
import { defineBody, definePlugin } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { rapier, stack } from './helpers/vessels.ts';

const A = 6_000_000;
const MOON_MU = 5.776e10;
const N = Math.sqrt(HOME_MU / (A * A * A));
/** A moon whose real mean motion is 5 % above its conic's: the fixed conic would put it elsewhere. */
const drifterOrbit = {
	a: A,
	e: 0,
	i: 0,
	raan: 0,
	argp: 0,
	m0: 0,
	epoch: 0,
	model: 'kepler-rates' as const,
	rates: { meanMotion: 1.05 * N }
};

const drifter = (model: 'kepler' | 'kepler-rates'): Plugin =>
	definePlugin({
		meta: { id: 'fix', version: '1.0.0', api: '^0.1' },
		depends: ['stock'],
		setup(ctx) {
			ctx.bodies.register(
				defineBody({
					id: 'fix.drifter',
					mass: MOON_MU / GRAVITATIONAL_CONSTANT,
					radius: 100_000,
					rotationPeriod: 50_000,
					parent: 'stock.home',
					orbit: model === 'kepler' ? { ...drifterOrbit, model: 'kepler' } : drifterOrbit
				})
			);
		}
	});

const make = (model: 'kepler' | 'kepler-rates' = 'kepler-rates') =>
	createSim({ plugins: [Stock, drifter(model)], backendFactory: rapier(16), seed: 1 });

/** A body's position relative to the home body (the Sun is the root since plan 122). */
const bodyPos = (sim: Sim, id: string): Vec3 => {
	const bodies = sim.snapshot().bodies;
	const at = (x: string) => bodies.find((b) => String(b.id) === x)!.position;
	const p = at(id);
	const home = at('stock.home');
	return { x: p.x - home.x, y: p.y - home.y, z: p.z - home.z };
};

describe('stateInParent follows the model (ADR 0183 points 2 and 6)', () => {
	test('the drifter is where its rates put it, not where its conic would', async () => {
		const sim = await make();
		sim.dispatch({ type: 'warp', factor: 1_000 });
		for (let i = 0; i < 50; i++) sim.step(0.02);
		const t = sim.snapshot().t;
		expect(t).toBeGreaterThan(500);
		const path: BodyPath = {
			model: 'kepler-rates',
			elements: drifterOrbit as OrbitalElements,
			rates: drifterOrbit.rates
		};
		const expected = bodyPathState(path, HOME_MU, t).r;
		const got = bodyPos(sim, 'fix.drifter');
		expect(Math.hypot(got.x - expected.x, got.y - expected.y, got.z - expected.z)).toBeLessThan(1);
		const conic = bodyPathState(
			{ model: 'kepler', elements: drifterOrbit as OrbitalElements },
			HOME_MU,
			t
		).r;
		expect(Math.hypot(got.x - conic.x, got.y - conic.y, got.z - conic.z)).toBeGreaterThan(10_000);
		// the stock moon is still a fixed conic
		const moon = sim.registries.bodies.get('stock.cinder')!;
		expect(moon.orbit!.model).toBeUndefined();
		sim.dispose();
	});
});

describe('SOI entry into a kepler-rates moon (ADR 0183 point 6)', () => {
	test('is found within the bisection tolerance of the geometric crossing', async () => {
		const sim = await make();
		const soi = A * (MOON_MU / HOME_MU) ** 0.4;
		// retrograde on the moon's circle, 2.2 spheres ahead of it: they close at about 2 v
		const theta = (2.2 * soi) / A;
		const v = Math.sqrt(HOME_MU / A);
		const position = { x: A * Math.cos(theta), y: 0, z: -A * Math.sin(theta) };
		const velocity = { x: v * Math.sin(theta), y: 0, z: v * Math.cos(theta) };
		const r = sim.dispatch({
			type: 'load-vessel',
			design: stack('Tank', ['stock.tank-small'], []),
			placement: { kind: 'state', body: 'stock.home', position, velocity }
		});
		expect(r.ok).toBe(true);
		const id = r.ok ? r.vessel! : (0 as never);
		const changes: string[] = [];
		sim.events.on('vessel:soi-changed', (e) => changes.push(e.to));
		sim.dispatch({ type: 'warp', factor: 1_000 });
		for (let i = 0; i < 200 && changes.length === 0; i++) sim.step(0.02);
		expect(changes).toEqual(['fix.drifter']);
		// The sim's crossing: its moon-relative conic, propagated back to the sphere's edge.
		const snap = sim.snapshot();
		const now = snap.vessels.find((x) => x.id === id)!;
		expect(String(now.soi)).toBe('fix.drifter');
		const back = (t: number) =>
			Math.hypot(
				...Object.values(propagateUniversal(now.position, now.velocity, MOON_MU, t - snap.t).r)
			) - soi;
		let lo = snap.t - 100;
		let hi = snap.t;
		expect(back(lo)).toBeGreaterThan(0);
		for (let k = 0; k < 60; k++) {
			const mid = (lo + hi) / 2;
			if (back(mid) > 0) lo = mid;
			else hi = mid;
		}
		const crossing = hi;

		// The geometric crossing, from the closed forms alone.
		const path: BodyPath = {
			model: 'kepler-rates',
			elements: drifterOrbit as OrbitalElements,
			rates: drifterOrbit.rates
		};
		const gap = (t: number, model: BodyPath) => {
			const vessel = propagateUniversal(position, velocity, HOME_MU, t).r;
			const moon = bodyPathState(model, HOME_MU, t).r;
			return Math.hypot(vessel.x - moon.x, vessel.y - moon.y, vessel.z - moon.z) - soi;
		};
		const bisect = (model: BodyPath) => {
			let lo = 0;
			let hi = 4_000;
			for (let k = 0; k < 60; k++) {
				const mid = (lo + hi) / 2;
				if (gap(mid, model) > 0) lo = mid;
				else hi = mid;
			}
			return hi;
		};
		const rated = bisect(path);
		const fixed = bisect({ model: 'kepler', elements: drifterOrbit as OrbitalElements });
		expect(Math.abs(crossing - rated)).toBeLessThan(0.01);
		// the model matters: the fixed conic would enter seconds apart
		expect(Math.abs(fixed - rated)).toBeGreaterThan(1);
		sim.dispose();
	});
});

describe('benchmark', () => {
	test('ten moving bodies add under 0.05 ms per step', async () => {
		const many = (model: 'kepler' | 'kepler-rates'): Plugin =>
			definePlugin({
				meta: { id: 'many', version: '1.0.0', api: '^0.1' },
				depends: ['stock'],
				setup(ctx) {
					for (let k = 0; k < 10; k++) {
						ctx.bodies.register(
							defineBody({
								id: `many.m${k}`,
								mass: 1e18,
								radius: 10_000,
								rotationPeriod: 50_000,
								parent: 'stock.home',
								orbit: {
									...drifterOrbit,
									a: 3_000_000 + 300_000 * k,
									m0: k,
									model,
									rates: { meanMotion: N, raan: 1e-6 }
								}
							})
						);
					}
				}
			});
		const time = async (model: 'kepler' | 'kepler-rates') => {
			const sim = await createSim({
				plugins: [Stock, many(model)],
				backendFactory: rapier(16),
				seed: 1
			});
			sim.dispatch({
				type: 'load-vessel',
				design: stack('Tank', ['stock.tank-small'], []),
				placement: {
					kind: 'state',
					body: 'stock.home',
					position: { x: 2_000_000, y: 0, z: 0 },
					velocity: { x: 0, y: 0, z: -1_330 }
				}
			});
			for (let i = 0; i < 100; i++) sim.step(0.02);
			const t0 = performance.now();
			for (let i = 0; i < 2_000; i++) sim.step(0.02);
			const ms = (performance.now() - t0) / 2_000;
			sim.dispose();
			return ms;
		};
		const added: number[] = [];
		for (let k = 0; k < 3; k++) added.push((await time('kepler-rates')) - (await time('kepler')));
		const median = added.sort((a, b) => a - b)[1]!;
		console.log(
			`body models: ${(median * 1000).toFixed(1)} µs per step for ten kepler-rates bodies`
		);
		// a timing budget measured on the M5: CI runners only log the number
		if (!process.env.CI) expect(median).toBeLessThan(0.05);
	}, 120_000);
});
