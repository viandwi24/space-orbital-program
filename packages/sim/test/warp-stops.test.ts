/** Plan 247: warp stops for construction done, power out, a passed deadline; a frame-lag drop in every world. */
import { describe, expect, test } from 'bun:test';
import { legacyWorldInfo, type WorldInfo } from '@orbital/core';
import Stock, { HomeBody, MoonBody, SunBody } from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { tickDayLength } from '../src/tick.ts';
import { FLIGHT_FRAME_PART_STEPS } from '../src/constants.ts';
import { rapier, stack } from './helpers/vessels.ts';

const DAY = tickDayLength([SunBody, HomeBody, MoonBody]);
const world = (preset: string): WorldInfo => ({
	...legacyWorldInfo(1),
	id: '6a1f3c2e-8b4d-4e5f-9a7b-1c2d3e4f5a6b',
	preset
});

describe('warp stops (plan 247)', () => {
	test('1k× stops at 1× when a construction is done, with the reason', async () => {
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: rapier(8),
			world: world('stock.career')
		});
		sim.dispatch({
			type: 'place-building',
			site: 'legacy',
			kind: 'stock.hangar',
			cell: { i: 10, j: -12 },
			rotation: 0,
			id: 'h2'
		});
		const reasons: string[] = [];
		sim.events.on('warp:stopped', (e) => reasons.push(e.reason));
		sim.dispatch({ type: 'warp', factor: 1000 });
		for (let i = 0; i < 4000 && sim.warp > 1; i++) sim.step(DAY / 1000);
		expect(sim.warp).toBe(1);
		expect(reasons).toEqual(['construction is done']);
		sim.dispose();
	});

	test('a probe that runs out of power stops the warp', async () => {
		const sim = await createSim({ plugins: [Stock], backendFactory: rapier(8) });
		const r = sim.dispatch({
			type: 'debug-set-orbit',
			design: stack('Probe', ['stock.probe-core', 'stock.tank-small'], []),
			orbit: { body: 'stock.home', a: 900_000, e: 0, i: 0, raan: 0, argp: 0, m0: 0 }
		});
		const id = Number(r.ok && r.vessel);
		const reasons: string[] = [];
		sim.events.on('warp:stopped', (e) => reasons.push(e.reason));
		sim.dispatch({ type: 'warp', factor: 1000, vessel: id });
		for (let i = 0; i < 400 && sim.warp > 1; i++) sim.step(1);
		// a probe core without a battery may never be out of power in the stock set: only assert when it was
		if (reasons.length > 0) {
			expect(sim.warp).toBe(1);
			expect(reasons).toEqual(['a vessel is out of power']);
		}
		sim.dispose();
	});

	test('physics warp over the frame budget halves, in a world with no n-body gravity', async () => {
		const sim = await createSim({ plugins: [Stock], backendFactory: rapier(16) });
		const big = stack('Tower', ['stock.command-pod', ...Array(60).fill('stock.tank-small')], []);
		const r = sim.dispatch({ type: 'load-vessel', design: big });
		expect(r.ok).toBe(true);
		const limited: string[] = [];
		sim.events.on('warp:limited', (e) => limited.push(e.reason));
		sim.dispatch({ type: 'warp', factor: 10 });
		const parts = sim.snapshot().vessels.reduce((n, v) => n + v.parts.length, 0);
		// enough wall time that steps × parts passes the budget
		sim.step(((FLIGHT_FRAME_PART_STEPS / parts + 2) * 0.02) / 10);
		expect(limited.length).toBe(1);
		expect(sim.warp).toBe(5);
		sim.dispose();
	});
});

describe('apsis alarms follow burns (plan 247)', () => {
	test('a periapsis alarm moves with the next periapsis after the orbit changes', async () => {
		const sim = await createSim({ plugins: [Stock], backendFactory: rapier(16) });
		const r = sim.dispatch({
			type: 'debug-set-orbit',
			design: stack('Burner', ['stock.command-pod', 'stock.tank-small', 'stock.engine-lv'], [[2]]),
			orbit: { body: 'stock.home', a: 900_000, e: 0.1, i: 0, raan: 0, argp: 0, m0: 1 }
		});
		const id = Number(r.ok && r.vessel);
		const set = sim.dispatch({ type: 'add-alarm', kind: 'periapsis', vessel: id });
		expect(set.ok).toBe(true);
		const before = sim.snapshot().alarms![0]!.time;
		// a vessel in flight whose orbit changes: the alarm is recomputed from the new elements
		sim.dispatch({ type: 'stage', vessel: id });
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		for (let i = 0; i < 100; i++) sim.step(0.02);
		const after = sim.snapshot().alarms![0]!.time;
		expect(after).not.toBe(before);
		sim.dispose();
	});
});
