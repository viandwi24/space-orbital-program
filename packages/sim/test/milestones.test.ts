/** Milestones in the sim (plan 102, ADR 0147): first orbit once, resume, return, reputation. */
import { describe, expect, test } from 'bun:test';
import type { EntityId } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { createAscent, defaultAscent } from './helpers/ascent.ts';
import { orbitState } from './helpers/measure.ts';
import { probe, rapier, twoStage } from './helpers/vessels.ts';

const R = 600_000;
const ATMOSPHERE = 70_000;

const newSim = (resume?: unknown) =>
	createSim({
		plugins: [Stock],
		backendFactory: rapier(),
		seed: 1,
		...(resume ? { resume } : {})
	});

const reached = (sim: Sim) => {
	const list: Array<{ id: string; time: number; crewed: boolean }> = [];
	sim.events.on('milestone:reached', (e) =>
		list.push({ id: e.id, time: e.time, crewed: e.crewed })
	);
	return list;
};

const load = (sim: Sim, placement?: unknown): EntityId => {
	const r = sim.dispatch({
		type: 'load-vessel',
		design: probe(),
		...(placement ? { placement } : {})
	} as never);
	if (!r.ok) throw new Error(r.reason);
	return r.vessel!;
};

describe('milestones', () => {
	test('the headless ascent records the first orbit of home once, at the step the periapsis clears the atmosphere', async () => {
		const sim = await newSim();
		const loaded = sim.dispatch({ type: 'load-vessel', design: twoStage() });
		if (!loaded.ok) throw new Error(loaded.reason);
		const id = loaded.vessel!;
		const list = reached(sim);
		const ascent = createAscent(sim, id, { ...defaultAscent, apoapsis: 95_000, periapsis: 85_000 });
		let firstClear: number | undefined;
		while (sim.time < 1_500 && ascent.phase !== 'done') {
			sim.step(0.02);
			ascent.update();
			const v = sim.snapshot().vessels.find((x) => x.id === id);
			const o = v?.orbit;
			if (
				firstClear === undefined &&
				o &&
				!v!.surface &&
				o.e < 1 &&
				o.a * (1 - o.e) > R + ATMOSPHERE
			)
				firstClear = sim.time;
		}
		for (let i = 0; i < 200; i++) sim.step(0.02);
		const orbit = list.filter((m) => m.id === 'orbit:stock.home');
		console.log(
			`launch at ${list[0]?.time.toFixed(2)} s; first orbit at ${orbit[0]?.time.toFixed(2)} s`
		);
		expect(list[0]!.id).toBe('launch');
		expect(orbit).toHaveLength(1);
		expect(orbit[0]!.time).toBe(firstClear!);
		expect(list.filter((m) => m.id === 'launch')).toHaveLength(1);
		expect(sim.snapshot().milestones!.map((r) => r.id)).toEqual(list.map((m) => m.id));
	});

	test('a save and resume keeps the record and does not record it again', async () => {
		const sim = await newSim();
		load(sim, { kind: 'state', ...orbitState(sim, 100_000) });
		for (let i = 0; i < 10; i++) sim.step(0.02);
		// a pilot takes the empty pod's seat at launch (plan 200, ADR 0216): the crewed firsts too
		expect(sim.snapshot().milestones!.map((r) => r.id)).toEqual([
			'launch',
			'crewed-launch',
			'orbit:stock.home',
			'crewed-orbit:stock.home'
		]);
		const saved = JSON.parse(JSON.stringify(sim.save()));
		expect(saved.milestones.records).toHaveLength(4);
		const resumed = await newSim(saved);
		const list = reached(resumed);
		for (let i = 0; i < 50; i++) resumed.step(0.02);
		expect(list).toEqual([]);
		expect(resumed.snapshot().milestones).toEqual(sim.snapshot().milestones);
		const fresh = await newSim();
		expect('milestones' in fresh.save()).toBe(false); // nothing happened: no field
	});

	test('a recovered vessel that orbited home records the return home', async () => {
		const sim = await newSim();
		const id = load(sim);
		for (let i = 0; i < 100; i++) sim.step(0.02);
		const saved = JSON.parse(JSON.stringify(sim.save()));
		// The pad vessel has been nowhere; give it an orbit of home in its visits.
		saved.milestones = { records: [], visits: { [String(id)]: ['orbit:stock.home'] } };
		delete saved.checksum;
		const { simSaveChecksum } = await import('@orbital/core');
		saved.checksum = simSaveChecksum(saved);
		const resumed = await newSim(saved);
		const list = reached(resumed);
		for (let i = 0; i < 100; i++) resumed.step(0.02);
		const r = resumed.dispatch({ type: 'recover-vessel', vessel: id });
		expect(r.ok).toBe(true);
		expect(list.map((m) => m.id)).toEqual(['return:stock.home', 'crewed-return:stock.home']);
		expect(resumed.save().milestones?.visits).toEqual({});
	});

	test('with the economy on, a first pays reputation once, with cause milestone', async () => {
		const sim = await newSim();
		expect(sim.dispatch({ type: 'set-rule', rule: 'stock.economy', value: true }).ok).toBe(true);
		load(sim, { kind: 'state', ...orbitState(sim, 100_000) });
		for (let i = 0; i < 50; i++) sim.step(0.02);
		load(sim, { kind: 'state', ...orbitState(sim, 120_000) });
		for (let i = 0; i < 50; i++) sim.step(0.02);
		const entries = sim.save().economy!.entries.filter((e) => e.cause === 'milestone');
		expect(entries.map((e) => [e.ref, e.currency, e.amount])).toEqual([
			['launch', 'reputation', 5],
			['orbit:stock.home', 'reputation', 10]
		]);
	});
});
