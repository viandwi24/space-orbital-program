/** Objectives in the sim (plan 098, ADR 0175): ascent, sequences, resume, rewards, deadlines. */
import { describe, expect, test } from 'bun:test';
import type { EntityId, Plugin } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { defineContract, defineMission, definePlugin } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { createAscent, defaultAscent } from './helpers/ascent.ts';
import { orbitState } from './helpers/measure.ts';
import { probe, rapier, twoStage } from './helpers/vessels.ts';

const R = 600_000;

const contracts: Plugin = definePlugin({
	meta: { id: 'fix', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		ctx.contracts.register(
			defineContract({
				id: 'fix.orbit',
				title: 'Orbit',
				objectives: { objective: 'stock.reach-orbit', params: { minPeriapsis: 80_000 } },
				reward: [{ currency: 'funds', amount: 1_000 }]
			})
		);
		ctx.contracts.register(
			defineContract({
				id: 'fix.orbit-then-home',
				title: 'Orbit, then come home',
				objectives: {
					sequence: [
						{ objective: 'stock.reach-orbit', params: { minPeriapsis: 80_000 } },
						{ objective: 'stock.return-home' }
					]
				}
			})
		);
		ctx.contracts.register(
			defineContract({
				id: 'fix.moon-soon',
				title: 'The moon in ten seconds',
				objectives: { objective: 'stock.enter-soi', params: { body: 'stock.cinder' } },
				deadline: 10,
				penalty: [{ currency: 'reputation', amount: -5 }]
			})
		);
		ctx.missions.register(
			defineMission({
				id: 'fix.after-orbit',
				title: 'After the first orbit',
				objectives: { objective: 'stock.reach-altitude', params: { min: 1 } },
				prerequisites: ['fix.orbit']
			})
		);
	}
});

const newSim = (resume?: unknown) =>
	createSim({
		plugins: [Stock, contracts],
		backendFactory: rapier(),
		seed: 1,
		...(resume ? { resume } : {})
	});

const events = (sim: Sim) => {
	const done: Array<{ id: string; source: string; time: number }> = [];
	const failed: Array<{ id: string; source: string; time: number; reason: string }> = [];
	sim.events.on('objective:completed', (e) =>
		done.push({ id: e.id, source: e.source.id, time: e.time })
	);
	sim.events.on('objective:failed', (e) =>
		failed.push({ id: e.id, source: e.source.id, time: e.time, reason: e.reason })
	);
	return { done, failed };
};

const placeOrbit = (sim: Sim, alt = 100_000): EntityId => {
	const r = sim.dispatch({
		type: 'load-vessel',
		design: probe(),
		placement: { kind: 'state', ...orbitState(sim, alt) }
	});
	if (!r.ok) throw new Error(r.reason);
	return r.vessel!;
};
const placePad = (sim: Sim): EntityId => {
	const r = sim.dispatch({ type: 'load-vessel', design: probe() });
	if (!r.ok) throw new Error(r.reason);
	return r.vessel!;
};

describe('objectives', () => {
	test('reach orbit with periapsis over 80 km completes on the step the ascent orbit gets there', async () => {
		const sim = await newSim();
		const loaded = sim.dispatch({ type: 'load-vessel', design: twoStage() });
		if (!loaded.ok) throw new Error(loaded.reason);
		const id = loaded.vessel!;
		expect(
			sim.dispatch({
				type: 'objective-start',
				source: { kind: 'contract', id: 'fix.orbit' },
				vessel: id
			}).ok
		).toBe(true);
		const { done } = events(sim);
		const ascent = createAscent(sim, id, { ...defaultAscent, apoapsis: 95_000, periapsis: 85_000 });
		let firstOver: number | undefined;
		while (sim.time < 1_500 && done.length === 0) {
			sim.step(0.02);
			ascent.update();
			const v = sim.snapshot().vessels.find((x) => x.id === id);
			const o = v?.orbit;
			if (firstOver === undefined && o && !v!.surface && o.a * (1 - o.e) - R > 80_000)
				firstOver = sim.time;
		}
		console.log(
			`periapsis over 80 km at ${firstOver?.toFixed(2)} s; objective done at ${done[0]?.time.toFixed(2)} s`
		);
		expect(firstOver).toBeDefined();
		expect(done).toHaveLength(1);
		expect(done[0]!.time).toBe(firstOver!);
		const snap = sim.snapshot().objectives!;
		expect(snap[0]).toMatchObject({
			source: { kind: 'contract', id: 'fix.orbit' },
			status: 'done',
			progress: 1
		});
	});

	test('a sequence (orbit, then home) does not complete when home comes first; in order it does', async () => {
		const first = await newSim();
		const { done: early } = events(first);
		placePad(first);
		expect(
			first.dispatch({
				type: 'objective-start',
				source: { kind: 'contract', id: 'fix.orbit-then-home' }
			}).ok
		).toBe(true);
		for (let i = 0; i < 100; i++) first.step(0.02);
		expect(early).toEqual([]);
		const leaves = first.snapshot().objectives![0]!.leaves;
		expect(leaves.map((l) => [l.path, l.status])).toEqual([
			['0.0', 'active'],
			['0.1', 'active']
		]);

		const second = await newSim();
		const { done } = events(second);
		expect(
			second.dispatch({
				type: 'objective-start',
				source: { kind: 'contract', id: 'fix.orbit-then-home' }
			}).ok
		).toBe(true);
		placeOrbit(second);
		second.step(0.02);
		expect(second.snapshot().objectives![0]!.leaves[0]!.status).toBe('done');
		expect(done).toEqual([]);
		placePad(second);
		for (let i = 0; i < 100 && done.length === 0; i++) second.step(0.02);
		expect(done.map((d) => d.source)).toEqual(['fix.orbit-then-home']);
	});

	test('a save with an active objective resumes and completes at the same time as the uninterrupted run', async () => {
		const run = async (resumeAt?: number) => {
			let sim = await newSim();
			sim.dispatch({
				type: 'objective-start',
				source: { kind: 'contract', id: 'fix.orbit-then-home' }
			});
			placeOrbit(sim);
			for (let i = 0; i < 10; i++) sim.step(0.02);
			if (resumeAt !== undefined) {
				const saved = JSON.parse(JSON.stringify(sim.save()));
				expect(saved.objectives.active).toHaveLength(1);
				sim = await newSim(saved);
			}
			const { done } = events(sim);
			placePad(sim);
			for (let i = 0; i < 100 && done.length === 0; i++) sim.step(0.02);
			return { done, snapshot: JSON.stringify(sim.snapshot().objectives) };
		};
		const straight = await run();
		const resumed = await run(0);
		expect(resumed.done).toEqual(straight.done);
		expect(resumed.snapshot).toBe(straight.snapshot);
		const fresh = await newSim();
		expect('objectives' in fresh.save()).toBe(false); // nothing started: no field
	});

	test('rewards on completion and penalties on a passed deadline go to the ledger when the economy is on', async () => {
		const sim = await newSim();
		expect(sim.dispatch({ type: 'set-rule', rule: 'stock.economy', value: true }).ok).toBe(true);
		const { done, failed } = events(sim);
		sim.dispatch({ type: 'objective-start', source: { kind: 'contract', id: 'fix.orbit' } });
		sim.dispatch({ type: 'objective-start', source: { kind: 'contract', id: 'fix.moon-soon' } });
		placeOrbit(sim);
		for (let i = 0; i < 600; i++) sim.step(0.02); // 12 s
		expect(done.map((d) => d.source)).toEqual(['fix.orbit']);
		expect(failed.map((f) => [f.source, f.reason])).toEqual([['fix.moon-soon', 'deadline passed']]);
		const entries = sim.save().economy!.entries.filter((e) => e.cause.startsWith('fix.'));
		expect(entries.map((e) => [e.cause, e.currency, e.amount])).toEqual([
			['fix.orbit', 'funds', 1_000],
			['fix.moon-soon', 'reputation', -5]
		]);
	});

	test('prerequisites, unknown sources and a second start of an active contract are refused', async () => {
		const sim = await newSim();
		const mission = { kind: 'mission' as const, id: 'fix.after-orbit' };
		expect(sim.dispatch({ type: 'objective-start', source: mission })).toEqual({
			ok: false,
			reason: expect.stringContaining('"fix.orbit" completed first')
		});
		expect(
			sim.dispatch({ type: 'objective-start', source: { kind: 'contract', id: 'nope.x' } }).ok
		).toBe(false);
		sim.dispatch({ type: 'objective-start', source: { kind: 'contract', id: 'fix.orbit' } });
		expect(
			sim.dispatch({ type: 'objective-start', source: { kind: 'contract', id: 'fix.orbit' } }).ok
		).toBe(false);
		placeOrbit(sim);
		sim.step(0.02);
		expect(sim.dispatch({ type: 'objective-start', source: mission }).ok).toBe(true);
	});
});
