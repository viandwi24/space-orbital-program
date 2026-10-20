/** Lights (plan 242, ADR 0239): the U group switches the lamps and they draw charge. */
import { describe, expect, test } from 'bun:test';
import { partId, type VesselDesign } from '@orbital/core';
import { newSim } from './helpers/vessels.ts';

// 0 probe core, 1 battery under it, 2 a spotlight on the probe's side, 3 a floodlight on the battery
const design = (): VesselDesign =>
	({
		formatVersion: 3,
		name: 'Lit probe',
		parts: [
			{ index: 0, part: partId('stock.probe-core'), parent: null },
			{
				index: 1,
				part: partId('stock.battery-small'),
				parent: { index: 0, parentNode: 'bottom', node: 'top' }
			},
			{
				index: 2,
				part: partId('stock.light-spot'),
				parent: { index: 0, parentNode: 'surface', node: 'radial', radial: { angle: 0, y: 0 } }
			},
			{
				index: 3,
				part: partId('stock.light-flood'),
				parent: { index: 1, parentNode: 'surface', node: 'radial', radial: { angle: 2, y: 0 } }
			}
		],
		stages: []
	}) as VesselDesign;

describe('lights in flight', () => {
	test('the Lights group turns both lamps on, they draw charge, and off again', async () => {
		const sim = await newSim();
		const r = sim.dispatch({ type: 'load-vessel', design: design() });
		if (!r.ok) throw new Error(r.reason);
		const id = r.vessel!;
		const snap = () => sim.snapshot().vessels.find((v) => v.id === id)!;
		const lamps = () => snap().parts.filter((p) => p.modules['stock.light']);
		const charge = () =>
			snap()
				.parts.flatMap((p) => p.resources ?? [])
				.filter((s) => s.resource === 'stock.electric-charge')
				.reduce((a, s) => a + s.amount, 0);
		expect(lamps()).toHaveLength(2);
		expect(snap().actions!.groups.find((g) => g.id === 'stock.lights')).toMatchObject({
			state: 'off',
			parts: 2
		});
		const before = charge();
		expect(sim.dispatch({ type: 'action-group', vessel: id, group: 'stock.lights' }).ok).toBe(true);
		expect(lamps().every((p) => (p.modules['stock.light'] as { on: boolean }).on)).toBe(true);
		sim.step(1);
		sim.step(1);
		expect(charge()).toBeLessThan(before);
		expect(sim.dispatch({ type: 'action-group', vessel: id, group: 'stock.lights' }).ok).toBe(true);
		expect(lamps().every((p) => !(p.modules['stock.light'] as { on: boolean }).on)).toBe(true);
		sim.dispose();
	}, 60_000);
});
