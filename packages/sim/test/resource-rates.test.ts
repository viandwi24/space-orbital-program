/** Resource rates (plan 213): measured net flow per part, smoothed over about a second. */
import { describe, expect, test } from 'bun:test';
import type { Plugin } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { defineModule, definePlugin } from '@orbital/sdk';
import { createSim } from '../src/index.ts';
import { rapier, stack } from './helpers/vessels.ts';

const EC = 'stock.electric-charge';

/** `fix.drain`: 1 EC/s, and a negligible torque that keeps the vessel in flight. */
const drain: Plugin = definePlugin({
	meta: { id: 'fix', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		ctx.modules.register(
			defineModule({
				id: 'fix.drain',
				update(c, dt) {
					c.vessel.resources.withdraw(EC, dt);
					c.vessel.applyTorque({ x: 1e-9, y: 0, z: 0 });
				},
				actions: { wake: () => {} }
			})
		);
		ctx.parts.register({
			id: 'fix.drain',
			title: 'Drain',
			mass: 1,
			shape: { kind: 'cylinder', radius: 0.3, height: 0.1 },
			attach: {
				top: { pos: [0, 0.05, 0], dir: [0, 1, 0] },
				bottom: { pos: [0, -0.05, 0], dir: [0, -1, 0] }
			},
			modules: [['fix.drain', undefined]]
		});
	}
});

describe('resource rates (plan 213)', () => {
	test('a battery drained at 1 EC/s reports rate -1 and its time to empty', async () => {
		const sim = await createSim({ plugins: [Stock, drain], backendFactory: rapier(), seed: 1 });
		const r = sim.dispatch({
			type: 'load-vessel',
			design: stack('Drained', ['stock.battery-medium', 'fix.drain'], [])
		});
		if (!r.ok) throw new Error(r.reason);
		const id = r.vessel!;
		const part = sim.snapshot().vessels[0]!.parts.find((p) => p.definition === 'fix.drain')!;
		sim.dispatch({
			type: 'action',
			vessel: id,
			part: part.id,
			module: 'fix.drain',
			action: 'wake'
		});
		for (let i = 0; i < 5 * 50; i++) sim.step(0.02);
		const v = sim.snapshot().vessels[0]!;
		expect(v.mode).toBe('flight');
		const row = v.parts
			.find((p) => p.definition === 'stock.battery-medium')!
			.resources!.find((x) => x.resource === EC)!;
		expect(Math.abs(row.rate + 1)).toBeLessThan(0.05);
		expect(Math.abs(row.timeToEmpty! - row.amount / 1) / (row.amount / 1)).toBeLessThan(
			0.02 + 0.05
		);
		const total = v.resources!.find((x) => x.resource === EC)!;
		expect(total.amount).toBeCloseTo(row.amount, 9);
		expect(total.capacity).toBe(400);
		expect(Math.abs(total.rate + 1)).toBeLessThan(0.05);
		sim.dispose();
	}, 30_000);
});
