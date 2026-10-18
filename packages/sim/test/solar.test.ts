/** Plan 190: the stock solar panel charges the same in flight and on rails (`background`, ADR 0171). */
import { describe, expect, test } from 'bun:test';
import type { EntityId, Plugin } from '@orbital/core';
import Stock, { ElectricCharge, HomeBody, MoonBody, SunBody } from '@orbital/mod-stock';
import { defineModule, definePlugin } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { tickDayLength } from '../src/tick.ts';
import { orbitState } from './helpers/measure.ts';
import { rapier, stack } from './helpers/vessels.ts';

const DAY = tickDayLength([SunBody, HomeBody, MoonBody]);

const batteryPart = (id: string, modules: Array<[string, unknown]>) => ({
	id,
	title: 'Battery',
	mass: 20,
	shape: { kind: 'cylinder' as const, radius: 0.625, height: 0.2 },
	attach: {
		top: {
			pos: [0, 0.1, 0] as [number, number, number],
			dir: [0, 1, 0] as [number, number, number]
		},
		bottom: {
			pos: [0, -0.1, 0] as [number, number, number],
			dir: [0, -1, 0] as [number, number, number]
		}
	},
	modules: [
		[
			'stock.resource-container',
			{ contents: { [ElectricCharge.id]: { capacity: 1e6, amount: 0 } } }
		],
		...modules
	] as Array<[string, unknown]>
});

/**
 * An empty battery big enough for a day of charge; `fix.battery-awake` also turns the vessel by a
 * negligible torque so it stays in flight (an idle vessel in a stable orbit goes on rails).
 */
const battery: Plugin = definePlugin({
	meta: { id: 'fix', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		ctx.modules.register(
			defineModule({
				id: 'fix.awake',
				update(c) {
					c.vessel.applyTorque({ x: 1e-9, y: 0, z: 0 });
				}
			})
		);
		ctx.parts.register(batteryPart('fix.battery', []));
		ctx.parts.register(batteryPart('fix.battery-awake', [['fix.awake', undefined]]));
	}
});

async function probe(warp: number): Promise<{ sim: Sim; id: EntityId; start: number }> {
	const sim = await createSim({ plugins: [Stock, battery], backendFactory: rapier(), seed: 7 });
	const r = sim.dispatch({
		type: 'load-vessel',
		design: stack(
			'Solar probe',
			['stock.probe-core', 'stock.solar-panel', warp > 1 ? 'fix.battery' : 'fix.battery-awake'],
			[]
		),
		placement: { kind: 'state', ...orbitState(sim, 100_000) }
	});
	if (!r.ok) throw new Error(r.reason);
	const id = r.vessel!;
	const panel = sim.snapshot().vessels[0]!.parts.find((p) => p.definition === 'stock.solar-panel')!;
	const deployed = sim.dispatch({
		type: 'action',
		vessel: id,
		part: panel.id,
		module: 'stock.solar-panel',
		action: 'setDeployed',
		args: [true]
	});
	expect(deployed.ok ? '' : deployed.reason).toBe('');
	if (warp > 1) {
		// idle in a stable orbit, it goes on rails after RAILS_IDLE_TIME
		for (let g = 0; g < 600 && sim.snapshot().vessels[0]!.mode === 'flight'; g++) sim.step(1 / 60);
		const w = sim.dispatch({ type: 'warp', factor: warp });
		expect(w.ok ? '' : w.reason).toBe('');
		sim.step(0);
	}
	return { sim, id, start: sim.time };
}

const chargeOf = (sim: Sim): number => {
	let sum = 0;
	for (const part of sim.snapshot().vessels[0]!.parts) {
		const c = part.modules['stock.resource-container'] as
			{ amounts?: Record<string, number> } | undefined;
		sum += c?.amounts?.[ElectricCharge.id] ?? 0;
	}
	return sum;
};

describe('the stock solar panel (plan 190)', () => {
	test('over one game day a vessel on rails and one in flight charge the same within 1 %', async () => {
		const rails = await probe(1e4);
		expect(rails.sim.snapshot().vessels[0]!.mode).toBe('on-rails');
		const flight = await probe(1);
		expect(flight.sim.snapshot().vessels[0]!.mode).toBe('flight');
		const base = { rails: chargeOf(rails.sim), flight: chargeOf(flight.sim) };

		for (let g = 0; g < 1e6 && rails.sim.time < rails.start + DAY; g++)
			rails.sim.step(Math.min(1, (rails.start + DAY - rails.sim.time) / 1e4));
		rails.sim.save(); // brings `background` up to now
		const t0 = performance.now();
		for (let g = 0; g < 1e7 && flight.sim.time < flight.start + DAY; g++) flight.sim.step(1);
		console.log(`solar: a day in flight took ${((performance.now() - t0) / 1000).toFixed(1)} s`);
		expect(flight.sim.snapshot().vessels[0]!.mode).toBe('flight');

		const onRails = chargeOf(rails.sim) - base.rails;
		const inFlight = chargeOf(flight.sim) - base.flight;
		console.log(`solar: rails ${onRails.toFixed(1)} EC, flight ${inFlight.toFixed(1)} EC`);
		expect(onRails).toBeGreaterThan(0.5 * DAY * 0.99);
		expect(Math.abs(onRails - inFlight) / onRails).toBeLessThan(0.01);
		rails.sim.dispose();
		flight.sim.dispose();
	}, 600_000);
});
