/** Plan 260: a suit takes the sample a part holds, and it comes aboard when the suit boards. */
import { describe, expect, test } from 'bun:test';
import { partId, type EntityId, type VesselDesign } from '@orbital/core';
import { newSim } from './helpers/vessels.ts';

const design = (): VesselDesign => ({
	formatVersion: 3,
	name: 'Sampler',
	parts: [
		{ index: 0, part: partId('stock.command-pod'), parent: null },
		{
			index: 1,
			part: partId('stock.surface-sampler'),
			parent: { index: 0, parentNode: 'bottom', node: 'top' }
		}
	],
	stages: []
});
const run = (sim: { step(t: number): void }, s: number) => {
	for (let i = 0; i < Math.round(s / 0.02); i++) sim.step(0.02);
};

describe('crew-take (plan 260)', () => {
	test('refuses without a sample, takes a held one, then the sample boards with the suit', async () => {
		const sim = await newSim();
		expect(sim.dispatch({ type: 'crew-hire', profession: 'pilot' }).ok).toBe(true);
		const r = sim.dispatch({
			type: 'load-vessel',
			design: design(),
			placement: { kind: 'surface' },
			crew: [{ member: 'c1', part: 0 }]
		});
		if (!r.ok) throw new Error(r.reason);
		const ship = r.vessel as EntityId;
		run(sim, 3);
		const snap = () => sim.snapshot().vessels.find((v) => v.id === ship)!;
		const sampler = snap().parts.find((p) => p.definition === 'stock.surface-sampler')!;
		const eva = sim.dispatch({ type: 'crew-eva', vessel: ship, member: 'c1' });
		if (!eva.ok) throw new Error(eva.reason);
		const suit = eva.vessel as EntityId;
		run(sim, 2);
		// nothing held yet
		expect(sim.dispatch({ type: 'crew-take', suit, vessel: ship, part: sampler.id })).toMatchObject(
			{
				ok: false
			}
		);
		// run the experiment: a sample is held in the part
		sim.dispatch({
			type: 'action',
			vessel: ship,
			part: sampler.id,
			module: 'stock.experiment',
			action: 'run',
			args: []
		});
		run(sim, 10);
		const holds = () =>
			(
				snap().parts.find((p) => p.id === sampler.id)!.modules['stock.experiment'] as {
					holdsSample?: boolean;
				}
			).holdsSample;
		expect(holds()).toBe(true);
		// the suit stands beside the part: the sample moves into the suit and the part can run again
		expect(sim.dispatch({ type: 'crew-take', suit, vessel: ship, part: sampler.id })).toEqual({
			ok: true
		});
		expect(holds()).toBe(false);
		expect(sim.dispatch({ type: 'crew-take', suit, vessel: ship, part: sampler.id }).ok).toBe(
			false
		);
		// a part that holds nothing, or a suit out of reach, refuses
		expect(
			sim.dispatch({ type: 'crew-take', suit, vessel: ship, part: snap().parts[0]!.id })
		).toMatchObject({ ok: false });
		// boarding brings the sample aboard
		expect(sim.dispatch({ type: 'crew-board', suit, vessel: ship }).ok).toBe(true);
		sim.dispose();
	}, 60_000);
});
