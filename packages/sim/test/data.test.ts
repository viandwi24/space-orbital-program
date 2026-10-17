/** Data items on vessels (plan 083, ADR 0172): capacity, drop, move, delete, staging, resume. */
import { describe, expect, test } from 'bun:test';
import { type EntityId, type NewDataItem, type Plugin } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { defineModule, definePlugin, z } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { orbitState } from './helpers/measure.ts';
import { rapier, stack } from './helpers/vessels.ts';

/** A small drive (1 000 bits) and a part whose action stores an item through `ctx.vessel.data`. */
const fixture: Plugin = definePlugin({
	meta: { id: 'fix', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		ctx.modules.register(
			defineModule({
				id: 'fix.recorder',
				config: z.object({}).optional(),
				actions: {
					store: (c, args) => c.vessel.data.store(args as NewDataItem) ?? null
				}
			})
		);
		const shape = { kind: 'cylinder' as const, radius: 0.625, height: 0.2 };
		const attach = {
			top: {
				pos: [0, 0.1, 0] as [number, number, number],
				dir: [0, 1, 0] as [number, number, number]
			},
			bottom: {
				pos: [0, -0.1, 0] as [number, number, number],
				dir: [0, -1, 0] as [number, number, number]
			}
		};
		ctx.parts.register({
			id: 'fix.recorder',
			title: 'Recorder',
			mass: 10,
			shape,
			attach,
			modules: [['fix.recorder', undefined]]
		});
		ctx.parts.register({
			id: 'fix.drive',
			title: 'Small drive',
			mass: 10,
			shape,
			attach,
			modules: [['stock.data-storage', { capacity: 1_000 }]]
		});
	}
});

// Top to bottom: pod, recorder, drive A, decoupler, drive B. Stage 0 fires the decoupler.
const design = () =>
	stack(
		'Data probe',
		['stock.command-pod', 'fix.recorder', 'fix.drive', 'stock.decoupler', 'fix.drive'],
		[[3]]
	);

const newSim = (resume?: unknown) =>
	createSim({
		plugins: [Stock, fixture],
		backendFactory: rapier(),
		seed: 3,
		...(resume ? { resume } : {})
	});

async function loaded(s?: Sim) {
	const sim = s ?? (await newSim());
	const r = sim.dispatch({
		type: 'load-vessel',
		design: design(),
		placement: { kind: 'state', ...orbitState(sim, 100_000) }
	});
	if (!r.ok) throw new Error(r.reason);
	const vessel = r.vessel!;
	const parts = sim.snapshot().vessels.find((v) => v.id === vessel)!.parts;
	const recorder = parts.find((p) => p.definition === 'fix.recorder')!.id;
	const [driveA, driveB] = parts.filter((p) => p.definition === 'fix.drive').map((p) => p.id);
	return { sim, vessel, recorder, driveA: driveA!, driveB: driveB! };
}

const item = (bits: number, subject: string): NewDataItem => ({
	kind: 'stock.science',
	bits,
	value: 5,
	time: 0,
	subject
});

function store(sim: Sim, vessel: EntityId, recorder: EntityId, it: NewDataItem) {
	const r = sim.dispatch({
		type: 'action',
		vessel,
		part: recorder,
		module: 'fix.recorder',
		action: 'store',
		args: it
	});
	if (!r.ok) throw new Error(r.reason);
}

const itemsOn = (sim: Sim, part: EntityId) => {
	for (const v of sim.snapshot().vessels) {
		const p = v.parts.find((x) => x.id === part);
		if (p)
			return (
				p.modules['stock.data-storage'] as {
					items: Array<{ id: string; bits: number; subject?: string }>;
				}
			).items;
	}
	throw new Error(`part ${part} not found`);
};

describe('data items', () => {
	test('beyond capacity the newest item is dropped with data:dropped; older items stay', async () => {
		const { sim, vessel, recorder, driveA, driveB } = await loaded();
		const stored: string[] = [];
		const dropped: Array<{ bits: number; reason: string; subject?: string }> = [];
		sim.events.on('data:stored', (e) => stored.push(e.item));
		sim.events.on('data:dropped', (e) =>
			dropped.push({
				bits: e.bits,
				reason: e.reason,
				...(e.item.subject ? { subject: e.item.subject } : {})
			})
		);
		store(sim, vessel, recorder, item(600, 'a')); // drive A
		store(sim, vessel, recorder, item(600, 'b')); // no room on A: drive B
		store(sim, vessel, recorder, item(300, 'c')); // A has 400 left
		store(sim, vessel, recorder, item(500, 'd')); // A 100 left, B 400 left: dropped
		expect(stored).toHaveLength(3);
		expect(dropped).toEqual([{ bits: 500, reason: 'full', subject: 'd' }]);
		expect(itemsOn(sim, driveA).map((i) => i.subject)).toEqual(['a', 'c']);
		expect(itemsOn(sim, driveB).map((i) => i.subject)).toEqual(['b']);
		const snap = sim.snapshot().vessels.find((v) => v.id === vessel)!;
		expect(snap.data).toEqual({ used: 1500, capacity: 2000, items: 3 });
	});

	test('move keeps total bits; refusals for no room and unknown items; delete', async () => {
		const { sim, vessel, recorder, driveA, driveB } = await loaded();
		store(sim, vessel, recorder, item(600, 'a'));
		store(sim, vessel, recorder, item(300, 'b'));
		const [a, b] = itemsOn(sim, driveA);
		expect(sim.dispatch({ type: 'move-data', vessel, item: a!.id, to: driveB }).ok).toBe(true);
		expect(itemsOn(sim, driveB).map((i) => i.id)).toEqual([a!.id]); // the id travels with it
		expect(sim.snapshot().vessels.find((v) => v.id === vessel)!.data!.used).toBe(900);
		store(sim, vessel, recorder, item(700, 'c')); // A: b 300 + c 700 = full
		const full = sim.dispatch({ type: 'move-data', vessel, item: a!.id, to: driveA });
		expect(full).toEqual({ ok: false, reason: expect.stringContaining('no room') });
		expect(sim.dispatch({ type: 'move-data', vessel, item: 'nope', to: driveB }).ok).toBe(false);
		expect(sim.dispatch({ type: 'move-data', vessel, item: b!.id, to: recorder }).ok).toBe(false);
		expect(sim.dispatch({ type: 'delete-data', vessel, item: b!.id }).ok).toBe(true);
		expect(sim.dispatch({ type: 'delete-data', vessel, item: b!.id }).ok).toBe(false);
		expect(sim.snapshot().vessels.find((v) => v.id === vessel)!.data!.used).toBe(1300);
	});

	test('after staging the items stay with the part that held them', async () => {
		const { sim, vessel, recorder, driveA, driveB } = await loaded();
		store(sim, vessel, recorder, item(900, 'upper'));
		store(sim, vessel, recorder, item(900, 'lower'));
		expect(sim.dispatch({ type: 'stage', vessel }).ok).toBe(true);
		for (let i = 0; i < 10; i++) sim.step(0.02);
		const vessels = sim.snapshot().vessels;
		expect(vessels).toHaveLength(2);
		const owner = (part: EntityId) => vessels.find((v) => v.parts.some((p) => p.id === part))!.id;
		expect(owner(driveA)).toBe(vessel);
		expect(owner(driveB)).not.toBe(vessel);
		expect(itemsOn(sim, driveA).map((i) => i.subject)).toEqual(['upper']);
		expect(itemsOn(sim, driveB).map((i) => i.subject)).toEqual(['lower']);
		expect(vessels.find((v) => v.id === vessel)!.data).toEqual({
			used: 900,
			capacity: 1000,
			items: 1
		});
	});

	test('a resume with stored items is byte-exact', async () => {
		const run = await loaded();
		store(run.sim, run.vessel, run.recorder, item(600, 'a'));
		store(run.sim, run.vessel, run.recorder, item(600, 'b'));
		for (let i = 0; i < 50; i++) run.sim.step(0.02);
		const saved = JSON.parse(JSON.stringify(run.sim.save()));
		const again = await newSim(saved);
		for (let i = 0; i < 500; i++) {
			run.sim.step(0.02);
			again.step(0.02);
		}
		const strip = (s: ReturnType<Sim['save']>) => {
			const { checksum: _c, ...rest } = s;
			return JSON.stringify(rest);
		};
		expect(strip(again.save())).toBe(strip(run.sim.save()));
		expect(JSON.stringify(again.snapshot())).toBe(JSON.stringify(run.sim.snapshot()));
		expect(itemsOn(again, run.driveB).map((i) => i.subject)).toEqual(['b']);
	});

	test('storing an unknown kind or a bad size is an error in the module', async () => {
		const { sim, vessel, recorder } = await loaded();
		const bad = sim.dispatch({
			type: 'action',
			vessel,
			part: recorder,
			module: 'fix.recorder',
			action: 'store',
			args: { ...item(10, 'x'), kind: 'nope' }
		});
		expect(bad.ok).toBe(false);
		const zero = sim.dispatch({
			type: 'action',
			vessel,
			part: recorder,
			module: 'fix.recorder',
			action: 'store',
			args: item(0, 'x')
		});
		expect(zero.ok).toBe(false);
	});
});
