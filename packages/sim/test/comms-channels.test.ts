/** Comms tier 5 (plan 120, ADR 0191): channels, interference, licences, encryption. */
import { describe, expect, test } from 'bun:test';
import {
	INTERFERENCE_DB,
	type EntityId,
	type NewDataItem,
	type Plugin,
	type Snapshot,
	type Vec3
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { defineModule, definePlugin, z } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
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
const recorder: Plugin = definePlugin({
	meta: { id: 'fix', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		ctx.modules.register(
			defineModule({
				id: 'fix.recorder',
				config: z.object({}).optional(),
				actions: { store: (c, args) => c.vessel.data.store(args as NewDataItem) ?? null }
			})
		);
		ctx.parts.register({
			id: 'fix.recorder',
			title: 'Recorder',
			mass: 10,
			shape,
			attach,
			modules: [['fix.recorder', undefined]]
		});
	}
});

const make = () => createSim({ plugins: [Stock, openTree, recorder], backendFactory: rapier(16) });

/** A probe core (whip: S band) `d` m above the first station, `side` m off to one side. */
function above(sim: Sim, d: number, side = 0, parts = ['stock.probe-core']): EntityId {
	const snap = sim.snapshot();
	const station = snap.network!.stations[0]!;
	const home = snap.bodies.find((b) => String(b.id) === station.body)!.position;
	const rel: Vec3 = {
		x: station.position.x - home.x,
		y: station.position.y - home.y,
		z: station.position.z - home.z
	};
	const r = Math.hypot(rel.x, rel.y, rel.z);
	const k = (r + d) / r;
	const r0 = sim.dispatch({
		type: 'load-vessel',
		design: stack('Probe', parts, []),
		placement: {
			kind: 'state',
			body: station.body,
			position: { x: rel.x * k, y: rel.y * k + side, z: rel.z * k },
			velocity: { x: 0, y: 0, z: 0 }
		} as never
	});
	if (!r0.ok) throw new Error(r0.reason);
	return r0.vessel!;
}

const link = (snap: Snapshot, id: EntityId) => snap.network!.vessels.find((v) => v.vessel === id)!;
const antennaPart = (sim: Sim, id: EntityId) =>
	sim
		.snapshot()
		.vessels.find((v) => v.id === id)!
		.parts.find((p) => p.definition === 'stock.probe-core')!.id;
const act = (sim: Sim, id: EntityId, action: string, value: unknown) =>
	sim.dispatch({
		type: 'action',
		vessel: id,
		part: antennaPart(sim, id),
		module: 'stock.antenna',
		action,
		args: [value]
	} as never);

describe('channels', () => {
	test('two links on one channel lose 3 dB each; another channel restores the margin', async () => {
		const alone = await make();
		const solo = above(alone, 2e6);
		const clear = link(alone.snapshot(), solo).margin!;
		alone.dispose();

		const sim = await make();
		const a = above(sim, 2e6);
		const b = above(sim, 2e6, 50_000);
		sim.step(0.02);
		const shared = link(sim.snapshot(), a);
		expect(shared.channel).toBe(0);
		expect(shared.interference).toBe(INTERFERENCE_DB);
		expect(clear - shared.margin!).toBeCloseTo(INTERFERENCE_DB, 6);
		expect(act(sim, b, 'setChannel', 1).ok).toBe(true);
		sim.step(0.02);
		const apart = link(sim.snapshot(), a);
		expect(apart.interference).toBe(0);
		expect(apart.margin!).toBeCloseTo(clear, 6);
		expect(link(sim.snapshot(), b).channel).toBe(1);
		// with the rule off nobody interferes
		expect(act(sim, b, 'setChannel', 0).ok).toBe(true);
		sim.dispatch({ type: 'set-rule', rule: 'stock.comms-interference', value: false });
		sim.step(0.02);
		expect(link(sim.snapshot(), a).interference).toBe(0);
		sim.dispose();
	});

	test('data on an unlicensed channel is refused with the reason; a licence lets it go', async () => {
		const sim = await make();
		const id = above(sim, 2e6, 0, ['stock.probe-core', 'fix.recorder', 'stock.data-drive']);
		sim.step(0.02);
		const store = () =>
			sim.dispatch({
				type: 'action',
				vessel: id,
				part: sim
					.snapshot()
					.vessels.find((v) => v.id === id)!
					.parts.find((p) => p.definition === 'fix.recorder')!.id,
				module: 'fix.recorder',
				action: 'store',
				args: [{ kind: 'stock.bulk', bits: 1e4, value: 0, time: sim.time }]
			} as never);
		store();
		const item = () =>
			(
				sim
					.snapshot()
					.vessels.find((v) => v.id === id)!
					.parts.find((p) => p.definition === 'stock.data-drive')!.modules[
					'stock.data-storage'
				] as { items: Array<{ id: string }> }
			).items[0]!.id;
		expect(act(sim, id, 'setChannel', 2).ok).toBe(true);
		sim.step(0.02);
		const refused = sim.dispatch({ type: 'transmit-data', vessel: id, item: item() });
		expect(refused.ok).toBe(false);
		expect((refused as { reason: string }).reason).toBe(
			'no licence for S band channel 2: buy one first'
		);
		const funds = sim.snapshot().economy?.funds;
		expect(sim.dispatch({ type: 'licence-buy', band: 'stock.s', channel: 2 }).ok).toBe(true);
		if (sim.snapshot().economy?.enabled) expect(sim.snapshot().economy!.funds).toBe(funds! - 5_000);
		expect(sim.snapshot().network!.licences).toEqual([{ band: 'stock.s', channel: 2 }]);
		expect(sim.dispatch({ type: 'transmit-data', vessel: id, item: item() }).ok).toBe(true);
		expect(sim.dispatch({ type: 'licence-buy', band: 'stock.s', channel: 2 }).ok).toBe(false);
		expect(sim.dispatch({ type: 'licence-buy', band: 'stock.s', channel: 9 }).ok).toBe(false);
		// the licence is saved
		const resumed = await createSim({
			plugins: [Stock, openTree, recorder],
			backendFactory: rapier(16),
			resume: sim.save()
		});
		expect(resumed.save().comms.licences).toEqual([{ band: 'stock.s', channel: 2 }]);
		sim.dispose();
		resumed.dispose();
	});

	test('an encrypted link sends at 0.8 times the rate', async () => {
		const sim = await make();
		const id = above(sim, 2e6);
		sim.step(0.02);
		const plain = link(sim.snapshot(), id).rate!;
		expect(act(sim, id, 'setEncrypted', true).ok).toBe(true);
		sim.step(0.02);
		const sealed = link(sim.snapshot(), id);
		expect(sealed.encrypted).toBe(true);
		expect(sealed.rate).toBeCloseTo(plain * 0.8, 6);
		sim.dispose();
	});
});
