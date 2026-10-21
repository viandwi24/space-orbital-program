/**
 * A delayed command that wakes a vessel inside a rails chunk (plan 310 follow-up, ADR 0188): the
 * vessel must take that step in physics, not be left one step behind (45 m at orbital speed).
 */
import { describe, expect, test } from 'bun:test';
import { GRAVITATIONAL_CONSTANT, legacyWorldInfo, type EntityId, type Vec3 } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { openTree } from './helpers/tech.ts';
import { rapier, stack } from './helpers/vessels.ts';

const world = () => {
	const base = legacyWorldInfo(9);
	return {
		...base,
		id: 'delay-wake',
		preset: 'stock.career',
		rules: { ...base.rules, 'stock.signal-delay': 'enforced' }
	};
};
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

/** Two probes in one circular orbit 100 km above the first ground station, `gap` m apart along it. */
function pair(sim: Sim): { a: EntityId; b: EntityId } {
	const snap = sim.snapshot();
	const station = snap.network!.stations[0]!;
	const homeId = station.body;
	const home = snap.bodies.find((b) => String(b.id) === homeId)!.position;
	const body = sim.registries.bodies.get(homeId)!;
	const up = sub(station.position, home);
	const k = 1 / len(up);
	const r = body.radius + 100_000;
	const pos = { x: up.x * k * r, y: up.y * k * r, z: up.z * k * r };
	// along the orbit: +Y (the spin axis) cross up
	const along = { x: up.z * k, y: 0, z: -up.x * k };
	const a1 = 1 / len(along);
	const dir = { x: along.x * a1, y: 0, z: along.z * a1 };
	const v = Math.sqrt((GRAVITATIONAL_CONSTANT * body.mass) / r);
	const place = (name: string, s: number): EntityId => {
		const res = sim.dispatch({
			type: 'load-vessel',
			design: stack(name, ['stock.probe-core', 'stock.reaction-wheel', 'stock.tank-small'], []),
			placement: {
				kind: 'state',
				position: { x: pos.x + dir.x * s, y: pos.y, z: pos.z + dir.z * s },
				velocity: { x: dir.x * v, y: dir.y * v, z: dir.z * v }
			}
		});
		if (!res.ok) throw new Error(res.reason);
		return res.vessel!;
	};
	return { a: place('A', 0), b: place('B', 100) };
}

describe('a delayed command that wakes a vessel (plan 310 follow-up)', () => {
	test('the woken vessel does not jump against its neighbour', async () => {
		const sim = await createSim({
			plugins: [Stock, openTree],
			backendFactory: rapier(16),
			world: world()
		});
		const { a, b } = pair(sim);
		const rel = (): Vec3 => {
			const s = sim.snapshot().vessels;
			return sub(s.find((v) => v.id === b)!.position, s.find((v) => v.id === a)!.position);
		};
		const mode = () => sim.snapshot().vessels.find((v) => v.id === a)!.mode;
		for (let i = 0; i < 10; i++) sim.step(0.02);
		expect(mode()).toBe('on-rails');
		const r = sim.dispatch({ type: 'attitude', vessel: a, pitch: 0.2, yaw: 0, roll: 0 });
		expect(r).toMatchObject({ ok: true });
		expect((r as { queued?: number }).queued).toBeGreaterThan(sim.time);
		let last = rel();
		let worst = 0;
		let woke = false;
		for (let i = 0; i < 50; i++) {
			sim.step(0.02);
			const now = rel();
			worst = Math.max(worst, len(sub(now, last)));
			last = now;
			if (mode() === 'flight') woke = true;
		}
		console.log(`delayed wake: worst step change of the gap ${worst.toFixed(3)} m`);
		expect(woke).toBe(true);
		expect(worst).toBeLessThan(0.5);
		sim.dispose();
	}, 60_000);
});
