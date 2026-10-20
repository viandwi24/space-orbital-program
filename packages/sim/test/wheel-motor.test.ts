/** Plan 260: a wheel motor drives with the throttle, draws charge, and reverses. */
import { describe, expect, test } from 'bun:test';
import type { EntityId } from '@orbital/core';
import type { Sim } from '../src/index.ts';
import { newSim } from './helpers/vessels.ts';
import { testPlane } from './aeroplane.test.ts';

const FLAT = { maxHeight: 0, heightAt: () => 0 };
const R = 600_000;
const omega = (2 * Math.PI) / 21_600;

const vesselOf = (sim: Sim, id: EntityId) => sim.snapshot().vessels.find((v) => v.id === id)!;
/** Speed along north (+Y at the equator) relative to the turning ground, m/s. */
function north(sim: Sim, id: EntityId): number {
	const v = vesselOf(sim, id);
	return v.velocity.y;
}
const wheels = (sim: Sim, id: EntityId) =>
	vesselOf(sim, id).parts.filter(
		(p) => p.definition === 'stock.wheel' || p.definition === 'stock.wheel-steer'
	);

async function drive(options: { motor: boolean; reverse?: boolean; limit?: number }) {
	const sim = await newSim({ terrain: FLAT });
	const r = sim.dispatch({
		type: 'load-vessel',
		design: testPlane(),
		placement: { kind: 'surface' }
	});
	if (!r.ok) throw new Error(r.reason);
	const id = r.vessel as EntityId;
	for (let i = 0; i < 100; i++) sim.step(0.02); // settle on the wheels
	const before = north(sim, id);
	for (const w of wheels(sim, id)) {
		if (options.motor)
			expect(
				sim.dispatch({
					type: 'action',
					vessel: id,
					part: w.id,
					module: 'stock.wheel',
					action: 'setMotor',
					args: [true]
				}).ok
			).toBe(true);
		if (options.reverse)
			sim.dispatch({
				type: 'action',
				vessel: id,
				part: w.id,
				module: 'stock.wheel',
				action: 'setReverse',
				args: [true]
			});
		if (options.limit !== undefined)
			sim.dispatch({
				type: 'action',
				vessel: id,
				part: w.id,
				module: 'stock.wheel',
				action: 'setMotorLimit',
				args: [options.limit]
			});
	}
	sim.dispatch({ type: 'throttle', vessel: id, value: 1 }); // the engine is not staged: no thrust
	for (let i = 0; i < 400; i++) sim.step(0.02);
	const gained = north(sim, id) - before;
	sim.dispose();
	return gained;
}

describe('wheel motor (plan 260)', () => {
	test('with the motor on, the throttle drives the vehicle; off, it does not', async () => {
		const off = await drive({ motor: false });
		const on = await drive({ motor: true });
		expect(Math.abs(off)).toBeLessThan(0.2);
		expect(on).toBeGreaterThan(1);
	}, 60_000);

	test('reverse drives the other way and a lower limit drives less', async () => {
		const full = await drive({ motor: true });
		const half = await drive({ motor: true, limit: 0.5 });
		const back = await drive({ motor: true, reverse: true });
		expect(back).toBeLessThan(-1);
		expect(half).toBeGreaterThan(0.3);
		expect(half).toBeLessThan(full);
	}, 90_000);
});
void R;
void omega;
