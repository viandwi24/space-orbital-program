/**
 * Plan 391 (ADR 0337), C2: a vessel on rails near the pilot is woken, so the pilot cannot fly
 * through it. A portless target idles into rails; the chaser closes on it at 1 m/s.
 */
import { expect, test } from 'bun:test';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { orbitState } from './helpers/measure.ts';
import { awake, wakeVessel } from './helpers/awake.ts';
import { rapier, stack } from './helpers/vessels.ts';

test('an idle portless vessel on rails is woken by a craft closing on it, and is not flown through', async () => {
	const sim = await createSim({ plugins: [Stock, awake], backendFactory: rapier(), seed: 3 });
	try {
		const start = orbitState(sim, 100_000);
		const target = sim.dispatch({
			type: 'load-vessel',
			design: stack('Target', ['stock.tank-medium', 'stock.tank-medium'], []),
			placement: { kind: 'state', ...start, orientation: { x: 0, y: 0, z: 0, w: 1 } }
		});
		if (!target.ok) throw new Error(target.reason);
		for (let i = 0; i < 150; i++) sim.step(0.02); // idle for 3 s: on rails
		const idle = sim.snapshot().vessels.find((v) => v.id === target.vessel)!;
		expect(idle.mode).toBe('on-rails');
		const s = { position: idle.position, velocity: idle.velocity };
		const along = (() => {
			const n = Math.hypot(s.velocity.x, s.velocity.y, s.velocity.z);
			return { x: s.velocity.x / n, y: s.velocity.y / n, z: s.velocity.z / n };
		})();
		const chaser = sim.dispatch({
			type: 'load-vessel',
			design: stack('Chaser', ['stock.command-pod', 'stock.tank-small', 'fix.awake'], []),
			placement: {
				kind: 'state',
				position: {
					x: s.position.x - 30 * along.x,
					y: s.position.y - 30 * along.y,
					z: s.position.z - 30 * along.z
				},
				velocity: {
					x: s.velocity.x + along.x,
					y: s.velocity.y + along.y,
					z: s.velocity.z + along.z
				},
				orientation: { x: 0, y: 0, z: 0, w: 1 }
			}
		});
		if (!chaser.ok) throw new Error(chaser.reason);
		wakeVessel(sim, chaser.vessel!);
		sim.step(0.02);
		for (let i = 0; i < 40 * 50; i++) sim.step(0.02);
		const vs = sim.snapshot().vessels;
		const t = vs.find((v) => v.id === target.vessel)!;
		const c = vs.find((v) => v.id === chaser.vessel)!;
		expect(t.mode).toBe('flight');
		const ahead =
			(c.position.x - t.position.x) * along.x +
			(c.position.y - t.position.y) * along.y +
			(c.position.z - t.position.z) * along.z;
		// 30 m behind, closing at 1 m/s for 40 s: through it the chaser would be 10 m ahead
		expect(ahead).toBeLessThan(0);
	} finally {
		sim.dispose();
	}
}, 60_000);
