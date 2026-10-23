/** Tank transfers (plan 213): a job on the vessel at a rate, stops, refusals, save and resume. */
import { describe, expect, test } from 'bun:test';
import type { EntityId } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { rapier, stack } from './helpers/vessels.ts';

const LF = 'stock.liquid-fuel';

async function twoTanks(): Promise<{ sim: Sim; id: EntityId; a: EntityId; b: EntityId }> {
	const sim = await createSim({ plugins: [Stock], backendFactory: rapier(), seed: 1 });
	const r = sim.dispatch({
		type: 'load-vessel',
		design: stack('Tanks', ['stock.probe-core', 'stock.tank-small', 'stock.tank-small'], [])
	});
	if (!r.ok) throw new Error(r.reason);
	const id = r.vessel!;
	const tanks = sim
		.snapshot()
		.vessels.find((v) => v.id === id)!
		.parts.filter((p) => p.definition === 'stock.tank-small');
	const [a, b] = [tanks[0]!.id, tanks[1]!.id];
	// B has room for 100 u
	const w = sim.dispatch({
		type: 'action',
		vessel: id,
		part: b,
		module: 'stock.resource-container',
		action: 'withdraw',
		args: [LF, 100]
	});
	if (!w.ok) throw new Error(w.reason);
	return { sim, id, a, b };
}

const lf = (sim: Sim, id: EntityId, part: EntityId): number =>
	sim
		.snapshot()
		.vessels.find((v) => v.id === id)!
		.parts.find((p) => p.id === part)!
		.resources!.find((r) => r.resource === LF)!.amount;
const steps = (sim: Sim, n: number) => {
	for (let i = 0; i < n; i++) sim.step(0.02);
};

describe('transfer (plan 213)', () => {
	test('100 u of liquid fuel moves from A to B at 20 u/s in 5 s; the full target ends it', async () => {
		const { sim, id, a, b } = await twoTanks();
		expect(
			sim.dispatch({ type: 'transfer', vessel: id, resource: LF, from: [a], to: [b] })
		).toEqual({ ok: true });
		expect(sim.snapshot().vessels[0]!.transfers).toEqual([
			{ resource: LF, from: [a], to: [b], rate: 20 }
		]);
		let t = 0;
		while (sim.snapshot().vessels[0]!.transfers && t < 10) {
			sim.step(0.02);
			t += 0.02;
		}
		expect(Math.abs(t - 5)).toBeLessThanOrEqual(0.02 + 1e-9);
		expect(lf(sim, id, a)).toBeCloseTo(300, 6);
		expect(lf(sim, id, b)).toBeCloseTo(400, 6);
		sim.dispose();
	}, 30_000);

	test('stop halts it', async () => {
		const { sim, id, a, b } = await twoTanks();
		sim.dispatch({ type: 'transfer', vessel: id, resource: LF, from: [a], to: [b] });
		steps(sim, 100);
		expect(sim.dispatch({ type: 'transfer', vessel: id, resource: LF, stop: true })).toEqual({
			ok: true
		});
		const moved = 400 - lf(sim, id, a);
		steps(sim, 50);
		expect(400 - lf(sim, id, a)).toBe(moved);
		expect(moved).toBeCloseTo(40, 6);
		sim.dispose();
	}, 30_000);

	test('solid fuel, a full target, a locked source and another vessel are refused', async () => {
		const { sim, id, a, b } = await twoTanks();
		expect(
			sim.dispatch({
				type: 'transfer',
				vessel: id,
				resource: 'stock.solid-fuel',
				from: [a],
				to: [b]
			})
		).toEqual({ ok: false, reason: 'Solid fuel cannot be transferred' });
		expect(
			sim.dispatch({ type: 'transfer', vessel: id, resource: LF, from: [b], to: [a] })
		).toMatchObject({ ok: false, reason: 'the target is full or locked' });
		sim.dispatch({ type: 'set-flow-lock', vessel: id, part: a, resource: LF, locked: true });
		expect(
			sim.dispatch({ type: 'transfer', vessel: id, resource: LF, from: [a], to: [b] })
		).toMatchObject({ ok: false, reason: 'the source is empty or locked' });
		expect(
			sim.dispatch({ type: 'transfer', vessel: id, resource: LF, from: [a], to: [a] })
		).toMatchObject({ ok: false });
		sim.dispose();
	}, 30_000);

	test('a save mid-transfer resumes it', async () => {
		const { sim, id, a, b } = await twoTanks();
		sim.dispatch({ type: 'transfer', vessel: id, resource: LF, from: [a], to: [b] });
		steps(sim, 100);
		const text = JSON.stringify(sim.save());
		const resumed = await createSim({
			plugins: [Stock],
			backendFactory: rapier(),
			resume: JSON.parse(text)
		});
		steps(sim, 100);
		steps(resumed, 100);
		expect(lf(resumed, id, b)).toBeCloseTo(lf(sim, id, b), 9);
		expect(lf(resumed, id, b)).toBeCloseTo(380, 6);
		// the stores and their rates resume exactly (the pad contact itself is not byte-exact)
		const rows = (x: Sim) => x.snapshot().vessels[0]!.parts.map((p) => p.resources);
		expect(rows(resumed)).toEqual(rows(sim));
		expect(resumed.snapshot().vessels[0]!.transfers).toEqual(sim.snapshot().vessels[0]!.transfers);
		sim.dispose();
		resumed.dispose();
	}, 30_000);

	test('a transfer moves mass and centre of mass but not the vessel (plan 390): its velocity follows a vessel that did not pump', async () => {
		const velocityAfter = async (pump: boolean) => {
			const sim = await createSim({ plugins: [Stock], backendFactory: rapier(), seed: 1 });
			const r = sim.dispatch({
				type: 'load-vessel',
				design: stack('Tanks', ['stock.probe-core', 'stock.tank-small', 'stock.tank-small'], []),
				placement: {
					kind: 'state',
					body: 'stock.home',
					position: { x: 0, y: 4e8, z: 0 },
					velocity: { x: 0, y: 0, z: 0 }
				}
			} as never);
			if (!r.ok) throw new Error(r.reason);
			const id = r.vessel!;
			const tanks = sim
				.snapshot()
				.vessels.find((v) => v.id === id)!
				.parts.filter((p) => p.definition === 'stock.tank-small');
			sim.dispatch({
				type: 'action',
				vessel: id,
				part: tanks[1]!.id,
				module: 'stock.resource-container',
				action: 'withdraw',
				args: [LF, 100]
			});
			if (pump)
				sim.dispatch({
					type: 'transfer',
					vessel: id,
					resource: LF,
					from: [tanks[0]!.id],
					to: [tanks[1]!.id]
				});
			steps(sim, 300);
			const v = sim.snapshot().vessels.find((x) => x.id === id)!.velocity;
			sim.dispose();
			return v;
		};
		const pumped = await velocityAfter(true);
		const still = await velocityAfter(false);
		expect(Math.hypot(pumped.x - still.x, pumped.y - still.y, pumped.z - still.z)).toBeLessThan(
			1e-4
		);
	});
});
