/**
 * Plan 391 (ADR 0337), C3: two vessels in separate physics frames that come together end up in
 * one frame, so they collide (in two Rapier worlds they would fly through each other).
 */
import { expect, test } from 'bun:test';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { awake, wakeVessel } from './helpers/awake.ts';
import { rapier, stack } from './helpers/vessels.ts';

test('two vessels 2.6 km apart closing at 50 m/s meet in one frame and do not pass through each other', async () => {
	const sim = await createSim({ plugins: [Stock, awake], backendFactory: rapier(), seed: 3 });
	try {
		// far from any planet gravity is a rounding error: the approach is a straight line
		const s = { position: { x: 0, y: 4e8, z: 0 }, velocity: { x: 0, y: 0, z: 0 } };
		const along = { x: 1, y: 0, z: 0 };
		const load = (name: string, parts: string[], ahead: number, speed: number) => {
			const r = sim.dispatch({
				type: 'load-vessel',
				design: stack(name, [...parts, 'fix.awake'], []),
				placement: {
					kind: 'state',
					body: 'stock.home',
					position: {
						x: s.position.x + ahead * along.x,
						y: s.position.y + ahead * along.y,
						z: s.position.z + ahead * along.z
					},
					velocity: {
						x: s.velocity.x + speed * along.x,
						y: s.velocity.y + speed * along.y,
						z: s.velocity.z + speed * along.z
					},
					orientation: { x: 0, y: 0, z: 0, w: 1 }
				}
			});
			if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
			wakeVessel(sim, r.vessel);
			return r.vessel;
		};
		const a = load('A', ['stock.command-pod', 'stock.tank-medium'], 0, 0);
		const b = load('B', ['stock.command-pod', 'stock.tank-medium'], 2_600, -50);
		const gap = () => {
			const vs = sim.snapshot().vessels;
			const pa = vs.find((v) => v.id === a)!.position;
			const pb = vs.find((v) => v.id === b)!.position;
			return (pb.x - pa.x) * along.x + (pb.y - pa.y) * along.y + (pb.z - pa.z) * along.z;
		};
		expect(gap()).toBeGreaterThan(2_500);
		for (let i = 0; i < 70 * 50; i++) sim.step(0.02);
		// 70 s: through each other B would be 500 m behind A; a collision leaves it ahead
		expect(gap()).toBeGreaterThan(0);
	} finally {
		sim.dispose();
	}
}, 120_000);
