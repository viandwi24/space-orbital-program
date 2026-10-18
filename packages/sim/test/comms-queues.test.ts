/** Comms tier 4 (plan 119, ADR 0189): queues, priorities, windows, delivery, custody, format 8. */
import { describe, expect, test } from 'bun:test';
import {
	GRAVITATIONAL_CONSTANT,
	SIM_SAVE_VERSION,
	legacyWorldInfo,
	readSimSave,
	type EntityId,
	type NewDataItem,
	type Plugin
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { defineAntenna, defineExperiment, defineModule, definePlugin, z } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import fixtureV7 from './fixtures/save-v7.json';
import { openTree } from './helpers/tech.ts';
import { rapier, stack } from './helpers/vessels.ts';

const shape = { kind: 'cylinder' as const, radius: 0.625, height: 0.2 };
const attach = {
	top: { pos: [0, 0.1, 0] as [number, number, number], dir: [0, 1, 0] as [number, number, number] },
	bottom: {
		pos: [0, -0.1, 0] as [number, number, number],
		dir: [0, -1, 0] as [number, number, number]
	}
};

/**
 * A 10 Mbit experiment, an S-band antenna so weak that 2 km from the station its margin is about
 * 5 dB (1 kbit/s: 10 log10(1e-6 W) − 50 dBi + 115 dB of the rest), and a recorder of any item.
 */
const fixture: Plugin = definePlugin({
	meta: { id: 'fix', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		ctx.experiments.register(
			defineExperiment({
				id: 'fix.big',
				label: 'Big',
				kind: 'data',
				situations: ['stock.landed'],
				baseValue: 10,
				repeatFactor: 0.5,
				duration: 0,
				bits: 1e7,
				transmitFactor: 1
			})
		);
		ctx.antennas.register(
			defineAntenna({
				id: 'fix.weak',
				label: 'Weak',
				kind: 'omni',
				range: 5e5,
				power: 1e-6,
				band: 'stock.s',
				gain: -50
			})
		);
		ctx.modules.register(
			defineModule({
				id: 'fix.recorder',
				config: z.object({}).optional(),
				actions: { store: (c, args) => c.vessel.data.store(args as NewDataItem) ?? null }
			})
		);
		const part = (id: string, modules: Array<[string, unknown]>) =>
			ctx.parts.register({ id, title: id, mass: 10, shape, attach, modules });
		part('fix.big', [['stock.experiment', { experiment: 'fix.big' }]]);
		part('fix.weak-radio', [['stock.antenna', { antenna: 'fix.weak' }]]);
		part('fix.recorder', [['fix.recorder', undefined]]);
	}
});

const world = () => ({
	...legacyWorldInfo(1),
	id: '6f1c2a90-3b4d-4e5f-8a7b-1c2d3e4f5a6c',
	preset: 'stock.career'
});
const make = (resume?: unknown) =>
	createSim({
		plugins: [Stock, fixture, openTree],
		backendFactory: rapier(16),
		world: world(),
		...(resume ? { resume } : {})
	});

function landed(sim: Sim, parts: string[]): EntityId {
	const home = sim.registries.bodies.get('stock.home')!;
	const r = sim.dispatch({
		type: 'load-vessel',
		design: stack('Lab', parts, []),
		placement: { kind: 'surface', latitude: 0, longitude: 2_000 / home.radius }
	});
	if (!r.ok) throw new Error(r.reason);
	for (let i = 0; i < 300; i++) sim.step(0.02);
	return r.vessel!;
}

const vessel = (sim: Sim, id: EntityId) => sim.snapshot().vessels.find((v) => v.id === id)!;
const partOf = (sim: Sim, id: EntityId, definition: string) =>
	vessel(sim, id).parts.find((p) => p.definition === definition)!.id;
const itemsOn = (sim: Sim, id: EntityId) =>
	(
		vessel(sim, id).parts.find((p) => p.definition === 'stock.data-drive')!.modules[
			'stock.data-storage'
		] as { items: Array<{ id: string; bits: number; kind: string; subject?: string }> }
	).items;
const queue = (sim: Sim, id: EntityId) =>
	sim.snapshot().network!.queues?.find((q) => q.vessel === id);

const radio = (sim: Sim, id: EntityId, on: boolean) =>
	expect(
		sim.dispatch({
			type: 'action',
			vessel: id,
			part: partOf(sim, id, 'fix.weak-radio'),
			module: 'stock.antenna',
			action: 'setEnabled',
			args: [on]
		} as never).ok
	).toBe(true);

/** Steps `seconds` of sim time in 1 s steps (the network cadence). */
function run(sim: Sim, seconds: number): void {
	const end = sim.time + seconds;
	while (sim.time < end - 1e-9) sim.step(Math.min(1, end - sim.time));
}

describe('transmission queues', () => {
	test('10 Mbit at 1 kbit/s: 10 000 s of contact in two windows, then science on arrival', async () => {
		const sim = await make();
		const id = landed(sim, ['stock.command-pod', 'fix.big', 'fix.weak-radio', 'stock.data-drive']);
		expect(sim.snapshot().network!.vessels.find((v) => v.vessel === id)!.rate).toBe(1e3);
		expect(
			sim.dispatch({
				type: 'action',
				vessel: id,
				part: partOf(sim, id, 'fix.big'),
				module: 'stock.experiment',
				action: 'run'
			}).ok
		).toBe(true);
		sim.step(0.02);
		const [item] = itemsOn(sim, id);
		expect(item!.bits).toBe(1e7);
		const delivered: Array<{ time: number }> = [];
		const credited: unknown[] = [];
		sim.events.on('comms:data-delivered', (e) => delivered.push(e));
		sim.events.on('science:credited', (e) => credited.push(e));
		const t0 = sim.time;
		expect(sim.dispatch({ type: 'transmit-data', vessel: id, item: item!.id })).toEqual({
			ok: true
		});
		expect(itemsOn(sim, id)).toEqual([]); // the radio has it now
		// first window: 6 000 s of contact
		run(sim, 6_000);
		const half = queue(sim, id)!.items[0]!;
		expect(half.sent).toBeGreaterThan(5.9e6);
		expect(half.sent).toBeLessThan(6.1e6);
		expect(half.eta).toBeCloseTo(sim.time + (1e7 - half.sent) / 1e3, 0);
		// a gap of 3 000 s without a link: nothing moves, and the next contact is unknown
		radio(sim, id, false);
		run(sim, 3_000);
		const paused = queue(sim, id)!;
		expect(paused.items[0]!.sent).toBeCloseTo(half.sent, -3);
		expect(paused.nextContact).toBeNull();
		expect(delivered).toEqual([]);
		// second window: the rest arrives about 10 000 s of contact after the start
		radio(sim, id, true);
		run(sim, 4_100);
		expect(delivered).toHaveLength(1);
		const contact = delivered[0]!.time - t0 - 3_000;
		expect(Math.abs(contact - 10_000)).toBeLessThan(20);
		expect(credited).toEqual([expect.objectContaining({ how: 'transmitted', value: 10 })]);
		expect(queue(sim, id)).toBeUndefined();
		sim.dispose();
	});

	test('a command item preempts queued bulk data; cancel puts an item back', async () => {
		const sim = await make();
		const id = landed(sim, [
			'stock.command-pod',
			'fix.recorder',
			'fix.weak-radio',
			'stock.data-drive'
		]);
		const store = (kind: string, bits: number) =>
			sim.dispatch({
				type: 'action',
				vessel: id,
				part: partOf(sim, id, 'fix.recorder'),
				module: 'fix.recorder',
				action: 'store',
				args: [{ kind, bits, value: 0, time: sim.time }]
			} as never);
		store('stock.bulk', 5e6);
		const bulk = itemsOn(sim, id)[0]!.id;
		sim.dispatch({ type: 'transmit-data', vessel: id, item: bulk });
		run(sim, 100);
		const before = queue(sim, id)!.items[0]!.sent;
		expect(before).toBeGreaterThan(0);
		store('stock.command', 2e4);
		const command = itemsOn(sim, id)[0]!.id;
		sim.dispatch({ type: 'transmit-data', vessel: id, item: command });
		const order = queue(sim, id)!.items.map((i) => i.kind);
		expect(order).toEqual(['stock.command', 'stock.bulk']);
		const delivered: string[] = [];
		sim.events.on('comms:data-delivered', (e) => delivered.push(e.kind));
		run(sim, 25);
		expect(delivered).toEqual(['stock.command']);
		// the bulk item waited: it kept its sent bits and moved nothing more while the command went
		expect(queue(sim, id)!.items[0]!.sent).toBeCloseTo(before + 5 * 1e3, -3);
		// cancel: back into storage with its id; the sent bits are lost
		expect(sim.dispatch({ type: 'transmission-cancel', vessel: id, item: bulk })).toEqual({
			ok: true
		});
		expect(itemsOn(sim, id).map((i) => i.id)).toEqual([bulk]);
		expect(queue(sim, id)).toBeUndefined();
		sim.dispose();
	});

	test('without an antenna nothing is sent; with comms off it is credited at once', async () => {
		const sim = await make();
		const id = landed(sim, ['stock.command-pod', 'fix.big', 'stock.data-drive']);
		sim.dispatch({
			type: 'action',
			vessel: id,
			part: partOf(sim, id, 'fix.big'),
			module: 'stock.experiment',
			action: 'run'
		});
		sim.step(0.02);
		const item = itemsOn(sim, id)[0]!.id;
		const r = sim.dispatch({ type: 'transmit-data', vessel: id, item });
		expect((r as { reason: string }).reason).toMatch(/no antenna/);
		sim.dispatch({ type: 'set-rule', rule: 'stock.comms', value: false });
		const credited: unknown[] = [];
		sim.events.on('science:credited', (e) => credited.push(e));
		expect(sim.dispatch({ type: 'transmit-data', vessel: id, item }).ok).toBe(true);
		expect(credited).toHaveLength(1);
		sim.dispose();
	});

	test('the queue is saved and goes on after a resume', async () => {
		const sim = await make();
		const id = landed(sim, [
			'stock.command-pod',
			'fix.recorder',
			'fix.weak-radio',
			'stock.data-drive'
		]);
		sim.dispatch({
			type: 'action',
			vessel: id,
			part: partOf(sim, id, 'fix.recorder'),
			module: 'fix.recorder',
			action: 'store',
			args: [{ kind: 'stock.bulk', bits: 1e5, value: 0, time: sim.time }]
		} as never);
		sim.dispatch({ type: 'transmit-data', vessel: id, item: itemsOn(sim, id)[0]!.id });
		run(sim, 40);
		const resumed = await make(sim.save());
		expect(resumed.save().comms.transmissions).toEqual(sim.save().comms.transmissions);
		const delivered: number[] = [];
		resumed.events.on('comms:data-delivered', (e) => delivered.push(e.time));
		run(resumed, 80);
		expect(delivered).toHaveLength(1);
		sim.dispose();
		resumed.dispose();
	});
});

describe('store-and-forward', () => {
	test('a rover beyond the horizon hands its data to a passing relay, which delivers it later', async () => {
		const sim = await make();
		// the rover is a probe without signal: let it still record and queue
		sim.dispatch({ type: 'set-rule', rule: 'stock.control-without-signal', value: 'full' });
		const home = sim.registries.bodies.get('stock.home')!;
		// a quarter of the way round from the pad: no direct contact in a day
		const lon = Math.PI / 2;
		const rover = sim.dispatch({
			type: 'load-vessel',
			design: stack('Rover', ['stock.probe-core', 'fix.recorder', 'stock.data-drive'], []),
			placement: { kind: 'surface', latitude: 0, longitude: lon }
		});
		if (!rover.ok) throw new Error(rover.reason);
		const r = home.radius + 300_000;
		const v = Math.sqrt((GRAVITATIONAL_CONSTANT * home.mass) / r);
		const relay = sim.dispatch({
			type: 'load-vessel',
			design: stack('Relay', ['stock.probe-core', 'stock.data-drive'], []),
			placement: {
				kind: 'state',
				position: { x: r * Math.cos(lon), y: 0, z: -r * Math.sin(lon) },
				// westward, towards the pad
				velocity: { x: v * Math.sin(lon), y: 0, z: v * Math.cos(lon) }
			}
		});
		if (!relay.ok) throw new Error(relay.reason);
		for (let i = 0; i < 300; i++) sim.step(0.02);
		const id = rover.vessel!;
		expect(sim.snapshot().network!.vessels.find((x) => x.vessel === id)!.to).toBeNull();
		sim.dispatch({
			type: 'action',
			vessel: id,
			part: partOf(sim, id, 'fix.recorder'),
			module: 'fix.recorder',
			action: 'store',
			args: [{ kind: 'stock.bulk', bits: 1e5, value: 0, time: sim.time }]
		} as never);
		expect(
			sim.dispatch({ type: 'transmit-data', vessel: id, item: itemsOn(sim, id)[0]!.id }).ok
		).toBe(true);
		const delivered: Array<{ vessel: EntityId }> = [];
		sim.events.on('comms:data-delivered', (e) => delivered.push(e));
		run(sim, 10);
		// the relay holds it now, for the rover
		const held = queue(sim, relay.vessel!)!;
		expect(held.custody).toBe(`vessel:${relay.vessel}`);
		expect(held.items[0]!.origin).toBe(id);
		expect(queue(sim, id)).toBeUndefined();
		// within an orbit the relay passes over the station and delivers it
		for (let i = 0; i < 3_000 && delivered.length === 0; i++) sim.step(1);
		expect(delivered).toEqual([expect.objectContaining({ vessel: id })]);
		sim.dispose();
	});
});

describe('save format 8', () => {
	test('a frozen format-7 save migrates with empty queues', async () => {
		const read = readSimSave(fixtureV7);
		expect(read.formatVersion).toBe(SIM_SAVE_VERSION);
		expect(read.comms.transmissions).toEqual([]);
		const sim = await createSim({
			plugins: [Stock, openTree],
			backendFactory: rapier(16),
			resume: fixtureV7
		});
		expect(sim.save().comms.transmissions).toEqual([]);
		sim.dispose();
	});
});
