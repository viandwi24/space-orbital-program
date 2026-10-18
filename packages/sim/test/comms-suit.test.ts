/** Comms tier 6 (plan 121, ADR 0193): suit radios relayed by crewed vessels, broadcasts of firsts. */
import { describe, expect, test } from 'bun:test';
import {
	BROADCAST_FACTOR,
	BROADCAST_WINDOW,
	legacyWorldInfo,
	milestoneReputation,
	type EntityId,
	type Snapshot,
	type TerrainField,
	type Vec3
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { openTree } from './helpers/tech.ts';
import { rapier, stack } from './helpers/vessels.ts';

const HOME_RADIUS = 600_000;
/** Where the lander stands on the home planet, far from the site's station. */
const LON = 1;
const WALL = { from: 100, to: 110, end: 20, height: 30 } as const;

/**
 * Flat ground but for a wall 100 to 110 m east of the lander, 30 m high, that ends 20 m north of
 * it. A suit 200 m east sees the lander past the wall's end when its line of sight clears the
 * corner: 20 m at 100 m, so at 40 m north (ADR 0193 point 3).
 */
const ridge: TerrainField = {
	maxHeight: WALL.height,
	heightAt(d: Vec3) {
		const east = (Math.atan2(-d.z, d.x) - LON) * HOME_RADIUS;
		const north = Math.asin(Math.max(-1, Math.min(1, d.y))) * HOME_RADIUS;
		return east >= WALL.from && east <= WALL.to && north <= WALL.end ? WALL.height : 0;
	}
};

const world = (id: string) => ({ ...legacyWorldInfo(5), id, preset: 'stock.career' });
const make = (terrain?: TerrainField) =>
	createSim({
		plugins: [Stock, openTree],
		backendFactory: rapier(8),
		world: world('comms-suit'),
		...(terrain ? { terrain } : {})
	});

function load(
	sim: Sim,
	parts: string[],
	east: number,
	north: number,
	body = 'stock.home',
	lon = LON
): EntityId {
	const r = sim.dispatch({
		type: 'load-vessel',
		design: stack('V', parts, []),
		placement: {
			kind: 'surface',
			body,
			latitude: north / HOME_RADIUS,
			longitude: lon + east / HOME_RADIUS
		} as never
	});
	if (!r.ok) throw new Error(r.reason);
	return r.vessel!;
}
const LANDER = ['stock.command-pod', 'stock.whip-antenna'];
const SUIT = ['stock.eva-suit'];
const settle = (sim: Sim) => {
	for (let i = 0; i < 60; i++) sim.step(0.02);
};
const link = (snap: Snapshot, id: EntityId) => snap.network!.vessels.find((v) => v.vessel === id)!;

describe('suit radios (ADR 0193 points 1 and 3)', () => {
	test('a suit 200 m behind a ridge loses the lander at the geometric line of sight', async () => {
		const at = async (north: number) => {
			const sim = await make(ridge);
			const lander = load(sim, LANDER, 0, 0);
			const suit = load(sim, SUIT, 200, north);
			settle(sim);
			const l = link(sim.snapshot(), suit);
			sim.dispose();
			return { l, lander };
		};
		for (const north of [30, 39]) {
			const { l } = await at(north);
			expect(l.to).toBeNull();
			expect(l.reason).toBe('blocked by terrain');
			expect(l.control).toBe('full'); // the suit is crewed
		}
		for (const north of [41, 50]) {
			const { l, lander } = await at(north);
			expect(l.to).toBe(`vessel:${lander}`);
			expect(l.route).toEqual([`vessel:${lander}`]);
			expect(l.rate!).toBeGreaterThan(0);
		}
	}, 60_000);

	test('a suit never links to a station or a probe, and nobody routes through it', async () => {
		const sim = await make();
		// beside the site's station, with a probe 30 m away and no crewed vessel
		const suit = load(sim, SUIT, 0, 40, 'stock.home', 0);
		const probe = load(sim, ['stock.probe-core', 'stock.whip-antenna'], 30, 40, 'stock.home', 0);
		settle(sim);
		let snap = sim.snapshot();
		expect(link(snap, suit).to).toBeNull();
		expect(link(snap, suit).reason).toBe('out of range');
		expect(link(snap, probe).route.some((h) => h === `vessel:${suit}`)).toBe(false);
		// a crewed lander 60 m away relays it
		const lander = load(sim, LANDER, -60, 40, 'stock.home', 0);
		settle(sim);
		snap = sim.snapshot();
		expect(link(snap, suit).route).toEqual([`vessel:${lander}`]);
		expect(link(snap, probe).route.some((h) => h === `vessel:${suit}`)).toBe(false);
		sim.dispose();
	}, 60_000);
});

describe('broadcasts (ADR 0193 point 5)', () => {
	/** Lands on the moon's near side (longitude π faces home) with a whip: 10 Mbit/s home. */
	async function landed(lon = Math.PI) {
		const sim = await make();
		const lander = load(sim, LANDER, 0, 0, 'stock.cinder', lon);
		// at rest for long enough to go on surface rails, so time warp may run
		for (let i = 0; i < 600; i++) sim.step(0.02);
		return { sim, lander };
	}
	const reputation = (sim: Sim) =>
		sim.save().economy!.entries.filter((e) => e.cause === 'comms.broadcast');

	test('broadcasting the first landing with the rate books half its reputation, once', async () => {
		const { sim, lander } = await landed();
		const id = 'landing:stock.cinder';
		const offer = sim.snapshot().network!.broadcasts.find((b) => b.milestone === id)!;
		expect(offer).toMatchObject({ vessel: lander, label: 'First landing at stock.cinder' });
		expect(offer.rate!).toBeGreaterThanOrEqual(offer.needs);
		const rec = sim.snapshot().milestones!.find((m) => m.id === id)!;
		const before = sim.snapshot().economy!.reputation;
		expect(sim.dispatch({ type: 'comms-broadcast', milestone: id })).toEqual({ ok: true });
		const bonus = BROADCAST_FACTOR * milestoneReputation(rec, 'stock.home');
		expect(bonus).toBeGreaterThan(0);
		expect(reputation(sim)).toEqual([expect.objectContaining({ amount: bonus, ref: id })]);
		expect(sim.snapshot().economy!.reputation - before).toBeCloseTo(bonus, 9);
		// once only, and gone from the offers
		const again = sim.dispatch({ type: 'comms-broadcast', milestone: id });
		expect(again.ok).toBe(false);
		expect(sim.snapshot().network!.broadcasts.some((b) => b.milestone === id)).toBe(false);
		// the save keeps it
		expect(sim.save().comms?.broadcasts).toContain(id);
		sim.dispose();
	}, 60_000);

	test('without a link to the ground, or after the window, it is refused with a reason', async () => {
		const far = await landed(0); // the far side: blocked by the moon
		const r = far.sim.dispatch({ type: 'comms-broadcast', milestone: 'landing:stock.cinder' });
		expect(r.ok).toBe(false);
		expect(!r.ok && r.reason).toContain('no link to the ground');
		far.sim.dispose();

		const near = await landed();
		const to = near.sim.time + BROADCAST_WINDOW + 60;
		expect(near.sim.dispatch({ type: 'warp-to', time: to, factor: 1000 })).toEqual({ ok: true });
		for (let g = 0; (near.sim.time < to - 1e-6 || near.sim.warp !== 1) && g < 1e5; g++)
			near.sim.step(1);
		const late = near.sim.dispatch({ type: 'comms-broadcast', milestone: 'landing:stock.cinder' });
		expect(late.ok).toBe(false);
		expect(!late.ok && late.reason).toContain('no longer live');
		expect(reputation(near.sim)).toEqual([]);
		near.sim.dispose();
	}, 120_000);
});
