/** Plan 234 / ADR 0227: the deep-space dish is a station of tiers 4–6, above the tracking dish. */
import { describe, expect, test } from 'bun:test';
import { legacyWorldInfo, type EntityId, type Vec3 } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { openTree } from './helpers/tech.ts';
import { rapier, stack } from './helpers/vessels.ts';

const make = () =>
	createSim({
		plugins: [Stock, openTree],
		backendFactory: rapier(16),
		world: { ...legacyWorldInfo(1), id: 'dsn' }
	});

/** A probe core `d` m straight above the Legacy site's station. */
function above(sim: Sim, d: number): EntityId {
	const snap = sim.snapshot();
	const station = snap.network!.stations.find((s) => s.id === 'site:legacy')!;
	const home = snap.bodies.find((b) => String(b.id) === station.body)!.position;
	const rel: Vec3 = {
		x: station.position.x - home.x,
		y: station.position.y - home.y,
		z: station.position.z - home.z
	};
	const r = Math.hypot(rel.x, rel.y, rel.z);
	const k = (r + d) / r;
	const res = sim.dispatch({
		type: 'load-vessel',
		design: stack('Probe', ['stock.probe-core'], []),
		placement: {
			kind: 'state',
			body: station.body,
			position: { x: rel.x * k, y: rel.y * k, z: rel.z * k },
			velocity: { x: 0, y: 0, z: 0 }
		} as never
	});
	if (!res.ok) throw new Error(res.reason);
	return res.vessel!;
}

async function linkAtMoonDistance(kind: string) {
	const sim = await make();
	const placed = sim.dispatch({
		type: 'place-building',
		site: 'legacy',
		kind,
		cell: { i: 20, j: 20 },
		rotation: 0,
		id: 'dish'
	});
	if (!placed.ok) throw new Error(placed.reason);
	const id = above(sim, 1.2e7); // the stock moon's distance
	sim.step(0.1);
	const snap = sim.snapshot();
	const link = snap.network!.vessels.find((v) => v.vessel === id)!;
	const station = snap.network!.stations.find((s) => s.id === 'site:legacy')!;
	sim.dispose();
	return { link, station };
}

describe('deep-space dish', () => {
	test('a vessel at the moon links through it at a higher rate than through the tracking dish', async () => {
		const small = await linkAtMoonDistance('stock.tracking-dish');
		const big = await linkAtMoonDistance('stock.deep-space-dish');
		expect(small.link.to).toBe('site:legacy');
		expect(big.link.to).toBe('site:legacy');
		expect(big.link.margin!).toBeGreaterThan(small.link.margin!);
		// 64 m against 9 m: 20 log10(64 / 9) ≈ 17 dB more
		expect(big.link.margin! - small.link.margin!).toBeCloseTo(20 * Math.log10(64 / 9), 1);
		expect(big.link.rate!).toBeGreaterThan(small.link.rate!);
		expect(big.station.range).toBeGreaterThan(small.station.range);
	});
});
