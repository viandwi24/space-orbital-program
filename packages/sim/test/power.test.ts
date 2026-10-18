/**
 * Power rules in the sim (plan 208, ADR 0214): sending data costs electric charge by the antenna's
 * power and takes the link's time, a radio pauses at zero charge, and a probe that runs out of
 * charge is uncontrolled ("no power") and says so once.
 */
import { describe, expect, test } from 'bun:test';
import { legacyWorldInfo, type EntityId, type Plugin } from '@orbital/core';
import Stock, { ElectricCharge } from '@orbital/mod-stock';
import { defineAntenna, defineExperiment, defineModule, definePlugin } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { TRANSMIT_EC_PER_MBIT_PER_W } from '../src/transmission.ts';
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
const MBIT = 1024 * 1024;

/**
 * A 10 Mbit experiment and two radios at 1 kbit/s 2 km from the station (the same radiated power
 * as comms-queues' weak antenna): `fix.radio` at 1 W, `fix.hungry` at 100 W, which spends 20 EC
 * per Mbit. `fix.awake` keeps a vessel in flight.
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
		const antenna = (id: string, power: number) =>
			ctx.antennas.register(
				defineAntenna({
					id,
					label: id,
					kind: 'omni',
					range: 5e5,
					power,
					band: 'stock.s',
					gain: -110 - 10 * Math.log10(power)
				})
			);
		antenna('fix.radio', 1);
		antenna('fix.hungry', 100);
		ctx.modules.register(
			defineModule({
				id: 'fix.awake',
				update(c) {
					c.vessel.applyTorque({ x: 1e-9, y: 0, z: 0 });
				}
			})
		);
		const part = (id: string, modules: Array<[string, unknown]>) =>
			ctx.parts.register({ id, title: id, mass: 10, shape, attach, modules });
		part('fix.big', [['stock.experiment', { experiment: 'fix.big' }]]);
		part('fix.radio', [['stock.antenna', { antenna: 'fix.radio' }]]);
		part('fix.hungry', [['stock.antenna', { antenna: 'fix.hungry' }]]);
		part('fix.awake', [['fix.awake', undefined]]);
	}
});

const make = () =>
	createSim({
		plugins: [Stock, fixture, openTree],
		backendFactory: rapier(16),
		world: {
			...legacyWorldInfo(1),
			id: '7e2d3b41-4c5e-4f60-9b8c-2d3e4f5a6b7c',
			preset: 'stock.career'
		}
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
const partId = (sim: Sim, id: EntityId, definition: string) =>
	vessel(sim, id).parts.find((p) => p.definition === definition)!.id;
const charge = (sim: Sim, id: EntityId): number =>
	vessel(sim, id).parts.reduce((sum, p) => {
		const c = p.modules['stock.resource-container'] as
			{ amounts?: Record<string, number> } | undefined;
		return sum + (c?.amounts?.[ElectricCharge.id] ?? 0);
	}, 0);
const queue = (sim: Sim, id: EntityId) =>
	sim.snapshot().network!.queues?.find((q) => q.vessel === id);

function run(sim: Sim, seconds: number): void {
	const end = sim.time + seconds;
	while (sim.time < end - 1e-9) sim.step(Math.min(1, end - sim.time));
}

/** Runs the big experiment and queues its item; returns the time it was queued. */
function sendBig(sim: Sim, id: EntityId): number {
	expect(
		sim.dispatch({
			type: 'action',
			vessel: id,
			part: partId(sim, id, 'fix.big'),
			module: 'stock.experiment',
			action: 'run'
		}).ok
	).toBe(true);
	sim.step(0.02);
	const drive = vessel(sim, id).parts.find((p) => p.definition === 'stock.data-drive')!;
	const [item] = (drive.modules['stock.data-storage'] as { items: Array<{ id: string }> }).items;
	expect(sim.dispatch({ type: 'transmit-data', vessel: id, item: item!.id })).toEqual({ ok: true });
	return sim.time;
}

describe('power for radios and probes (plan 208)', () => {
	test("10 Mbit cost the antenna's EC per Mbit and take the link's time", async () => {
		const sim = await make();
		const id = landed(sim, ['stock.command-pod', 'fix.big', 'fix.radio', 'stock.data-drive']);
		expect(sim.snapshot().network!.vessels.find((v) => v.vessel === id)!.rate).toBe(1e3);
		const delivered: Array<{ time: number }> = [];
		sim.events.on('comms:data-delivered', (e) => delivered.push(e));
		const before = charge(sim, id);
		const t0 = sendBig(sim, id);
		run(sim, 10_100);
		expect(delivered).toHaveLength(1);
		expect(Math.abs(delivered[0]!.time - t0 - 10_000)).toBeLessThan(5);
		const cost = (1e7 / MBIT) * 1 * TRANSMIT_EC_PER_MBIT_PER_W;
		expect(before - charge(sim, id)).toBeCloseTo(cost, 6);
		sim.dispose();
	});

	test('at zero EC the queue pauses where the charge ran out', async () => {
		const sim = await make();
		const id = landed(sim, ['stock.command-pod', 'fix.big', 'fix.hungry', 'stock.data-drive']);
		sendBig(sim, id);
		run(sim, 4_000);
		// the pod's 50 EC pay for 2.5 Mbit at 20 EC per Mbit
		const sent = queue(sim, id)!.items[0]!.sent;
		expect(sent).toBeCloseTo(2.5 * MBIT, -2);
		expect(charge(sim, id)).toBeLessThan(1e-9);
		run(sim, 2_000);
		expect(queue(sim, id)!.items[0]!.sent).toBe(sent);
		sim.dispose();
	});

	test('a probe-only vessel at zero EC refuses throttle with the "no power" reason, and says so once', async () => {
		const sim = await make();
		const depleted: Array<{ vessel: EntityId }> = [];
		sim.events.on('vessel:power-depleted', (e) => depleted.push(e));
		const id = landed(sim, ['stock.probe-core', 'fix.awake']);
		expect(vessel(sim, id).uncontrolled).toBeUndefined();
		expect(sim.dispatch({ type: 'throttle', vessel: id, value: 0.5 }).ok).toBe(true);
		// 20 EC at 0.025 EC/s: 800 s
		run(sim, 850);
		expect(vessel(sim, id).mode).toBe('flight');
		expect(charge(sim, id)).toBeLessThan(1e-9);
		expect(vessel(sim, id).uncontrolled).toBe('no-power');
		const r = sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		expect(r.ok ? '' : r.reason).toContain('no power');
		run(sim, 50);
		expect(depleted).toEqual([expect.objectContaining({ vessel: id })]);
		// out of power is not debris: the probe stays, landed and at rest
		run(sim, 60);
		expect(sim.snapshot().vessels.some((v) => v.id === id)).toBe(true);
		sim.dispose();
	});
});
