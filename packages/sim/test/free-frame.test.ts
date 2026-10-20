/** Plan 257: a vessel the player wakes gets a physics frame; a far landed vessel on another frame goes on rails for it. */
import { describe, expect, test } from 'bun:test';
import { legacyWorldInfo, type EntityId } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { probe, rapier, twoStage } from './helpers/vessels.ts';

const make = () =>
	createSim({
		plugins: [Stock],
		backendFactory: rapier(16),
		maxFlightFrames: 1,
		world: {
			...legacyWorldInfo(1),
			id: '6f0c2a54-3b1d-4e8f-9a27-1c5d7e9b0a33',
			preset: 'stock.sandbox'
		}
	});
const orbit = { body: 'stock.home', a: 700_000, e: 0, i: 0, raan: 0, argp: 0, m0: 0 };

describe('no free physics frame', () => {
	test('a throttle on a vessel in orbit puts a far landed vessel on rails to make room', async () => {
		const sim = await make();
		const a = Number(
			(sim.dispatch({ type: 'load-vessel', design: twoStage() }) as { vessel: EntityId }).vessel
		);
		expect(sim.dispatch({ type: 'debug-set-orbit', vessel: a, orbit }).ok).toBe(true);
		// another vessel lands far from the first and holds the one frame
		const b = Number(
			(sim.dispatch({ type: 'load-vessel', design: probe() }) as { vessel: EntityId }).vessel
		);
		expect(
			sim.dispatch({
				type: 'debug-set-location',
				vessel: b as EntityId,
				location: { kind: 'surface', body: 'stock.home', latitude: 1.2, longitude: 2.5 }
			}).ok
		).toBe(true);
		sim.step(0.02);
		const mode = (id: number) => sim.snapshot().vessels.find((v) => v.id === id)!.mode;
		expect(mode(b)).toBe('flight');
		expect(mode(a)).toBe('on-rails');
		const r = sim.dispatch({ type: 'throttle', vessel: a as EntityId, value: 1 });
		expect(r).toEqual({ ok: true });
		sim.step(0.02);
		expect(mode(a)).toBe('flight');
		expect(mode(b)).toBe('on-rails');
		sim.dispose();
	});
});

describe('SAS after warp (plan 257)', () => {
	test('a pointing change at 1x on a vessel on rails turns it with torque, not in one step', async () => {
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: rapier(16),
			world: {
				...legacyWorldInfo(1),
				id: '6f0c2a54-3b1d-4e8f-9a27-1c5d7e9b0a33',
				preset: 'stock.sandbox'
			}
		});
		const id = Number(
			(sim.dispatch({ type: 'load-vessel', design: twoStage() }) as { vessel: EntityId }).vessel
		);
		expect(sim.dispatch({ type: 'debug-set-orbit', vessel: id, orbit }).ok).toBe(true);
		const nose = () => {
			const q = sim.snapshot().vessels.find((v) => v.id === id)!.orientation;
			// the part's +Y rotated by q
			return {
				x: 2 * (q.x * q.y - q.w * q.z),
				y: 1 - 2 * (q.x * q.x + q.z * q.z),
				z: 2 * (q.y * q.z + q.w * q.x)
			};
		};
		sim.dispatch({ type: 'sas', vessel: id as EntityId, mode: 'prograde' });
		for (let i = 0; i < 50; i++) sim.step(0.02);
		const before = nose();
		sim.dispatch({ type: 'sas', vessel: id as EntityId, mode: 'retrograde' });
		sim.step(0.02);
		const after = nose();
		const dot = before.x * after.x + before.y * after.y + before.z * after.z;
		// the nose must not jump 180 degrees in one 20 ms step
		expect(dot).toBeGreaterThan(0.9);
		sim.dispose();
	});
});
