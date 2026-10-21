/**
 * Plan 266 (ADR 0250): a launch while every physics frame is held by vessels far away puts them on
 * rails, as a wake does (plan 257), instead of refusing the launch.
 */
import { describe, expect, test } from 'bun:test';
import type { EntityId, VesselPlacement } from '@orbital/core';
import type { Sim } from '../src/index.ts';
import { newSim, probe, stack, twoStage } from './helpers/vessels.ts';

const orbit = { body: 'stock.home', a: 700_000, e: 0, i: 0, raan: 0, argp: 0, m0: 0 };
/** 30 km up on the far side of the planet from the pad, climbing slowly: in the air, not in orbit. */
const inTheAir: VesselPlacement = {
	kind: 'state',
	position: { x: -630_000, y: 0, z: 0 },
	velocity: { x: -50, y: 0, z: 0 }
};
const tank = () => stack('Tank', ['stock.tank-small'], []);

const load = (sim: Sim, design = probe(), placement?: VesselPlacement) => {
	const r = sim.dispatch({ type: 'load-vessel', design, ...(placement ? { placement } : {}) });
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return r.vessel;
};
const modeOf = (sim: Sim, id: EntityId) => sim.snapshot().vessels.find((v) => v.id === id)?.mode;

describe('a launch makes room (plan 266)', () => {
	test('a vessel flying in orbit far away goes on rails for the new launch', async () => {
		const sim = await newSim({ maxFlightFrames: 1 });
		const a = load(sim, twoStage());
		expect(sim.dispatch({ type: 'debug-set-orbit', vessel: a, orbit }).ok).toBe(true);
		expect(sim.dispatch({ type: 'throttle', vessel: a, value: 1 }).ok).toBe(true); // wakes it
		sim.step(0.02);
		sim.dispatch({ type: 'throttle', vessel: a, value: 0 });
		expect(modeOf(sim, a)).toBe('flight');
		const b = sim.dispatch({ type: 'load-vessel', design: probe() });
		expect(b).toMatchObject({ ok: true });
		expect(modeOf(sim, a)).toBe('on-rails'); // still in the world
		sim.step(0.02);
		if (b.ok) expect(modeOf(sim, b.vessel!)).toBe('flight');
		expect(modeOf(sim, a)).toBe('on-rails');
		sim.dispose();
	});

	test('uncontrolled debris in the air far away goes on rails for the new launch', async () => {
		const sim = await newSim({ maxFlightFrames: 1 });
		const debris = load(sim, tank(), inTheAir);
		expect(modeOf(sim, debris)).toBe('flight');
		expect(sim.dispatch({ type: 'load-vessel', design: probe() }).ok).toBe(true);
		expect(modeOf(sim, debris)).toBe('on-rails');
		sim.dispose();
	});

	test('a controlled vessel in the air far away keeps its frame; the refusal says what to do', async () => {
		const sim = await newSim({ maxFlightFrames: 1 });
		const flying = load(sim, probe(), inTheAir);
		const r = sim.dispatch({ type: 'load-vessel', design: probe() });
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.reason).toContain('in the air');
			expect(r.reason).toContain('Mission Center');
		}
		expect(modeOf(sim, flying)).toBe('flight');
		expect(sim.snapshot().vessels).toHaveLength(1);
		sim.dispose();
	});
});
