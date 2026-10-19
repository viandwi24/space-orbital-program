/** Plan 236 / ADR 0229: branch space centers on the home planet, their HQ and their ground station. */
import { describe, expect, test } from 'bun:test';
import {
	GRAVITATIONAL_CONSTANT,
	legacyWorldInfo,
	type EntityId,
	type Snapshot,
	type Vec3,
	type WorldInfo
} from '@orbital/core';
import Stock, { HomeBody, MoonBody, SunBody } from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { tickDayLength } from '../src/tick.ts';
import { rapier, stack } from './helpers/vessels.ts';
import { openTree } from './helpers/tech.ts';

const world = (preset: string): WorldInfo => ({
	...legacyWorldInfo(1),
	id: '3b2c1d0e-9f8a-4b7c-8d6e-5f4a3b2c1d0e',
	preset
});
const make = (preset?: string) =>
	createSim({
		plugins: [Stock, openTree],
		backendFactory: rapier(16),
		...(preset ? { world: world(preset) } : {})
	});
const DAY = tickDayLength([SunBody, HomeBody, MoonBody]);
function days(sim: Sim, n: number): void {
	sim.dispatch({ type: 'warp', factor: 1e4 });
	const at = sim.snapshot().t;
	const target = (Math.floor(at / DAY) + n) * DAY + 1;
	sim.step((target - at) / 1e4);
	sim.dispatch({ type: 'warp', factor: 1 });
}

const found = (sim: Sim, id: string, latitude: number, longitude: number) =>
	sim.dispatch({ type: 'found-branch', id, name: `Branch ${id}`, latitude, longitude });
const place = (sim: Sim, site: string, kind: string, cell: { i: number; j: number }, id: string) =>
	sim.dispatch({ type: 'place-building', site, kind, cell, rotation: 0, id });
const site = (sim: Sim, id: string) => sim.worldInfo.sites.find((s) => s.id === id)!;
const link = (snap: Snapshot, id: EntityId) => snap.network!.vessels.find((v) => v.vessel === id)!;

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const unit = (a: Vec3): Vec3 => {
	const l = Math.hypot(a.x, a.y, a.z);
	return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/** A probe on a low circular orbit right over the point opposite the Legacy site. */
function overTheFarSide(sim: Sim): EntityId {
	const snap = sim.snapshot();
	const home = snap.bodies.find((b) => String(b.id) === 'stock.home')!.position;
	const station = snap.network!.stations.find((s) => s.id === 'site:legacy')!.position;
	const u = unit(sub(station, home));
	const def = sim.registries.bodies.get('stock.home')!;
	const r = def.radius + 150_000;
	const speed = Math.sqrt((GRAVITATIONAL_CONSTANT * def.mass) / r);
	const r2 = sim.dispatch({
		type: 'load-vessel',
		design: stack('Probe', ['stock.probe-core'], []),
		placement: {
			kind: 'state',
			body: 'stock.home',
			position: { x: -u.x * r, y: -u.y * r, z: -u.z * r },
			// north-south, so the orbit stays over the far side's meridian for the test's few seconds
			velocity: { x: 0, y: speed, z: 0 }
		} as never
	});
	if (!r2.ok) throw new Error(r2.reason);
	return r2.vessel!;
}

describe('branch space centers (plan 236, ADR 0229)', () => {
	test('a branch on the far side keeps a probe linked once it has a dish, where the HQ cannot see it', async () => {
		const sim = await make();
		const probe = overTheFarSide(sim);
		for (let i = 0; i < 60; i++) sim.step(0.02);
		expect(link(sim.snapshot(), probe).to).toBeNull();
		// the antipode of the Legacy site (0, 0); sandbox: no cost, built at once
		expect(found(sim, 'far', 0, Math.PI)).toEqual({ ok: true });
		expect(site(sim, 'far')).toMatchObject({ kind: 'branch', body: 'stock.home' });
		expect(site(sim, 'far').buildings!.map((b) => [b.kind, b.state])).toEqual([
			['stock.branch-hq', 'active']
		]);
		// no comms building yet: the branch is no ground station
		for (let i = 0; i < 60; i++) sim.step(0.02);
		expect(sim.snapshot().network!.stations.map((s) => s.id)).not.toContain('site:far');
		expect(link(sim.snapshot(), probe).to).toBeNull();
		expect(place(sim, 'far', 'stock.tracking-dish', { i: 6, j: -4 }, 'far-dish').ok).toBe(true);
		for (let i = 0; i < 60; i++) sim.step(0.02);
		expect(sim.snapshot().network!.stations.map((s) => s.id)).toContain('site:far');
		expect(link(sim.snapshot(), probe).to).toBe('site:far');
		sim.dispose();
	}, 120_000);

	test('founding is charged, the HQ completes after its build days, and the branch builds nothing before', async () => {
		const sim = await make('stock.career');
		expect(sim.dispatch({ type: 'debug-mode', on: true }).ok).toBe(true);
		const hq = sim.registries.buildings.get('stock.branch-hq')!.levels[0]!;
		const poor = sim.snapshot().economy!.funds;
		expect(poor).toBeLessThan(hq.cost);
		expect(found(sim, 'east', 0.3, 1.2)).toEqual({
			ok: false,
			reason: expect.stringContaining('Not enough funds')
		});
		expect(sim.snapshot().sites!.some((s) => s.id === 'east')).toBe(false);
		expect(sim.dispatch({ type: 'debug-grant', funds: 1_000_000 }).ok).toBe(true);
		const before = sim.snapshot().economy!.funds;
		expect(found(sim, 'east', 0.3, 1.2)).toEqual({ ok: true });
		expect(sim.snapshot().economy!.funds).toBe(before - hq.cost);
		const building = () =>
			sim
				.snapshot()
				.sites!.find((s) => s.id === 'east')!
				.buildings.find((b) => b.kind === 'stock.branch-hq')!;
		expect(building().state).toBe('building');
		// nothing else is built until the HQ is done; the HQ itself is never placed by hand
		const pad = place(sim, 'east', 'stock.launchpad-s', { i: 0, j: -6 }, 'east-pad');
		expect(pad).toEqual({
			ok: false,
			reason: expect.stringContaining('The branch HQ is still under construction')
		});
		expect(place(sim, 'legacy', 'stock.branch-hq', { i: 30, j: 30 }, 'hq2')).toEqual({
			ok: false,
			reason: expect.stringContaining('comes with a new branch')
		});
		days(sim, hq.buildDays - 1);
		expect(building().state).toBe('building');
		days(sim, 1);
		expect(building().state).toBe('active');
		expect(place(sim, 'east', 'stock.launchpad-s', { i: 0, j: -6 }, 'east-pad').ok).toBe(true);
		sim.dispose();
	}, 120_000);

	test('the instant-construction cheat finishes a branch HQ in progress', async () => {
		const sim = await make('stock.career');
		sim.dispatch({ type: 'debug-mode', on: true });
		sim.dispatch({ type: 'debug-grant', funds: 1_000_000 });
		expect(found(sim, 'west', -0.2, -1.4).ok).toBe(true);
		const hq = () =>
			sim
				.snapshot()
				.sites!.find((s) => s.id === 'west')!
				.buildings.find((b) => b.kind === 'stock.branch-hq')!;
		expect(hq().state).toBe('building');
		expect(sim.dispatch({ type: 'debug-cheat', cheat: 'instant-construction', on: true }).ok).toBe(
			true
		);
		expect(hq().state).toBe('active');
		sim.dispose();
	});

	test('a branch is refused off the home planet rules: too close, or a taken id', async () => {
		const sim = await make();
		expect(found(sim, 'near', 0, 0.02)).toEqual({
			ok: false,
			reason: expect.stringContaining('too close')
		});
		expect(found(sim, 'b1', 0.6, 0).ok).toBe(true);
		expect(found(sim, 'b1', -0.6, 0)).toEqual({
			ok: false,
			reason: expect.stringContaining('taken')
		});
		sim.dispose();
	});
});
