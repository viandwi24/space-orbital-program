/** Plan 203 / ADRs 0200 and 0213: the access rule, cheats and the set-state commands. */
import { describe, expect, test } from 'bun:test';
import {
	bodyAngularVelocity,
	legacyWorldInfo,
	type Snapshot,
	type Vec3,
	type WorldInfo
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { probe, rapier, stack, twoStage } from './helpers/vessels.ts';

const HOME_RADIUS = 600_000;

const world = (preset: string, extra: Partial<WorldInfo> = {}): WorldInfo => ({
	...legacyWorldInfo(1),
	id: '6f0c2a54-3b1d-4e8f-9a27-1c5d7e9b0a33',
	preset,
	...extra
});
const make = (preset = 'stock.sandbox', extra: Partial<WorldInfo> = {}) =>
	createSim({ plugins: [Stock], backendFactory: rapier(16), world: world(preset, extra) });

function load(sim: Sim, design = probe()): number {
	const r = sim.dispatch({ type: 'load-vessel', design });
	if (!r.ok) throw new Error(r.reason);
	return Number(r.vessel);
}

const vesselIn = (s: Snapshot, id: number) => s.vessels.find((v) => v.id === id)!;
const len = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
const cross = (a: Vec3, b: Vec3): Vec3 => ({
	x: a.y * b.z - a.z * b.y,
	y: a.z * b.x - a.x * b.z,
	z: a.x * b.y - a.y * b.x
});
const fuelOf = (s: Snapshot, vessel: number, index: number) => {
	const part = vesselIn(s, vessel).parts[index]!;
	return (part.modules['stock.resource-container'] as { amounts: Record<string, number> }).amounts[
		'stock.liquid-fuel'
	]!;
};
const circular = (altitude: number) => ({
	body: 'stock.home',
	a: HOME_RADIUS + altitude,
	e: 0,
	i: 0,
	raan: 0,
	argp: 0,
	m0: 0
});

describe('access', () => {
	test('Sandbox accepts debug commands at once', async () => {
		const sim = await make();
		expect(sim.snapshot().debug).toMatchObject({
			access: 'always',
			allowed: true,
			usedCheats: false
		});
		const r = sim.dispatch({ type: 'debug-cheat', cheat: 'infinite-fuel', on: true });
		expect(r.ok).toBe(true);
		expect(sim.snapshot().debug).toMatchObject({ usedCheats: true, cheats: ['infinite-fuel'] });
		sim.dispose();
	});

	test('Career refuses them with a reason until Debug mode is on, which marks the world', async () => {
		const sim = await make('stock.career');
		const refused = sim.dispatch({ type: 'debug-grant', funds: 1000 });
		expect(refused).toEqual({
			ok: false,
			reason: 'debug tools need Debug mode, which is off in this world'
		});
		expect(sim.snapshot().debug).toMatchObject({ access: 'opt-in', allowed: false });
		expect(sim.dispatch({ type: 'debug-mode', on: true }).ok).toBe(true);
		expect(sim.worldInfo.debug).toEqual({ mode: true, usedCheats: true, cheats: [] });
		const funds = sim.snapshot().economy!.funds;
		expect(sim.dispatch({ type: 'debug-grant', funds: 1000 }).ok).toBe(true);
		expect(sim.snapshot().economy!.funds).toBe(funds + 1000);
		// off again: the mark stays
		expect(sim.dispatch({ type: 'debug-mode', on: false }).ok).toBe(true);
		expect(sim.snapshot().debug).toMatchObject({ allowed: false, usedCheats: true });
		sim.dispose();
	});

	test('Hardcore always refuses, Debug mode included', async () => {
		const sim = await make('stock.career-hardcore');
		const reason = 'debug tools are locked in this world (stock.debug-tools)';
		expect(sim.dispatch({ type: 'debug-mode', on: true })).toEqual({ ok: false, reason });
		expect(sim.dispatch({ type: 'debug-cheat', cheat: 'no-crash-damage', on: true })).toEqual({
			ok: false,
			reason
		});
		expect(sim.snapshot().debug).toMatchObject({ access: 'locked', usedCheats: false });
		sim.dispose();
	});

	test('the debug state saves and resumes', async () => {
		const sim = await make();
		sim.dispatch({ type: 'debug-cheat', cheat: 'ignore-temperature', on: true });
		const save = sim.save();
		sim.dispose();
		expect(save.worldInfo.debug).toEqual({
			mode: false,
			usedCheats: true,
			cheats: ['ignore-temperature']
		});
		const again = await createSim({ plugins: [Stock], backendFactory: rapier(16), resume: save });
		expect(again.snapshot().debug).toMatchObject({
			cheats: ['ignore-temperature'],
			usedCheats: true
		});
		again.dispose();
	});
});

describe('set orbit', () => {
	test('Ap 100 km / Pe 100 km around the home body gives those apsides within 1 m', async () => {
		const sim = await make();
		const id = load(sim);
		expect(sim.dispatch({ type: 'debug-set-orbit', vessel: id, orbit: circular(100_000) }).ok).toBe(
			true
		);
		sim.step(0.02);
		const v = vesselIn(sim.snapshot(), id);
		expect(v.mode).toBe('on-rails');
		const o = v.orbit!;
		expect(Math.abs(o.a * (1 + o.e) - HOME_RADIUS - 100_000)).toBeLessThan(1);
		expect(Math.abs(o.a * (1 - o.e) - HOME_RADIUS - 100_000)).toBeLessThan(1);
		sim.dispose();
	});

	test('an eccentric orbit around the moon, spawned from a design', async () => {
		const sim = await make();
		const ap = 190_000 + 80_000;
		const pe = 190_000 + 20_000;
		const r = sim.dispatch({
			type: 'debug-set-orbit',
			design: probe(),
			orbit: {
				body: 'stock.cinder',
				a: (ap + pe) / 2,
				e: (ap - pe) / (ap + pe),
				i: 0.3,
				raan: 1,
				argp: 2,
				m0: 0.5
			}
		});
		expect(r.ok).toBe(true);
		const v = vesselIn(sim.snapshot(), Number(r.ok && r.vessel));
		expect(v.soi as string).toBe('stock.cinder');
		expect(v.orbit!.a * (1 + v.orbit!.e)).toBeCloseTo(ap, 3);
		expect(v.orbit!.i).toBeCloseTo(0.3, 9);
		sim.dispose();
	});

	test('refuses an orbit below the surface', async () => {
		const sim = await make();
		const id = load(sim);
		const r = sim.dispatch({ type: 'debug-set-orbit', vessel: id, orbit: circular(-1000) });
		expect(r).toEqual({ ok: false, reason: 'periapsis -1000 m is below the surface' });
		sim.dispose();
	});
});

describe('set location', () => {
	test('in the air at 5 km and 200 m/s: that altitude and surface speed after one step', async () => {
		const sim = await make();
		const id = load(sim);
		const r = sim.dispatch({
			type: 'debug-set-location',
			vessel: id,
			location: {
				kind: 'air',
				latitude: 0.1,
				longitude: 0.4,
				altitude: 5000,
				speed: 200,
				heading: 1
			}
		});
		expect(r.ok).toBe(true);
		sim.step(0.02);
		const s = sim.snapshot();
		const v = vesselIn(s, id);
		expect(v.mode).toBe('flight');
		expect(Math.abs(len(v.position) - HOME_RADIUS - 5000)).toBeLessThan(5);
		const spin = bodyAngularVelocity(sim.registries.bodies.get('stock.home')!, s.t);
		const ground = cross(spin, v.position);
		const surfaceSpeed = len({
			x: v.velocity.x - ground.x,
			y: v.velocity.y - ground.y,
			z: v.velocity.z - ground.z
		});
		expect(Math.abs(surfaceSpeed - 200)).toBeLessThan(1);
		sim.dispose();
	});

	test('landed at coordinates, from orbit', async () => {
		const sim = await make();
		const id = load(sim);
		sim.dispatch({ type: 'debug-set-orbit', vessel: id, orbit: circular(100_000) });
		const r = sim.dispatch({
			type: 'debug-set-location',
			vessel: id,
			location: { kind: 'surface', latitude: 0.2, longitude: -0.5 }
		});
		expect(r.ok).toBe(true);
		for (let i = 0; i < 50; i++) sim.step(0.02);
		const v = vesselIn(sim.snapshot(), id);
		expect(len(v.position) - HOME_RADIUS).toBeLessThan(20);
		sim.dispose();
	});
});

describe('cheats', () => {
	test('infinite fuel keeps the tank full during a burn', async () => {
		const sim = await make();
		const id = load(
			sim,
			stack('Burner', ['stock.command-pod', 'stock.tank-small', 'stock.engine-lv'], [[2]])
		);
		const full = fuelOf(sim.snapshot(), id, 1);
		sim.dispatch({ type: 'debug-cheat', cheat: 'infinite-fuel', on: true });
		sim.dispatch({ type: 'stage', vessel: id });
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		for (let i = 0; i < 100; i++) sim.step(0.02);
		expect(fuelOf(sim.snapshot(), id, 1)).toBe(full);
		// off: the burn draws again
		sim.dispatch({ type: 'debug-cheat', cheat: 'infinite-fuel', on: false });
		for (let i = 0; i < 50; i++) sim.step(0.02);
		expect(fuelOf(sim.snapshot(), id, 1)).toBeLessThan(full);
		sim.dispose();
	});

	test('set resource empties and fills a tank; temperature and the tech grant', async () => {
		const sim = await make();
		const id = load(sim, twoStage());
		const part = vesselIn(sim.snapshot(), id).parts[2]!.id;
		const full = fuelOf(sim.snapshot(), id, 2);
		expect(sim.dispatch({ type: 'debug-set-resource', vessel: id, part, fraction: 0 }).ok).toBe(
			true
		);
		expect(fuelOf(sim.snapshot(), id, 2)).toBe(0);
		sim.dispatch({
			type: 'debug-set-resource',
			vessel: id,
			resource: 'stock.liquid-fuel',
			amount: 10
		});
		expect(fuelOf(sim.snapshot(), id, 2)).toBe(10);
		sim.dispatch({ type: 'debug-set-resource', vessel: id, fraction: 1 });
		expect(fuelOf(sim.snapshot(), id, 2)).toBe(full);
		expect(
			sim.dispatch({
				type: 'debug-set-resource',
				vessel: id,
				resource: 'stock.nothing',
				fraction: 1
			})
		).toEqual({ ok: false, reason: 'no store aboard holds "stock.nothing"' });
		sim.dispatch({ type: 'debug-set-temperature', vessel: id, part, temperature: 900 });
		expect(vesselIn(sim.snapshot(), id).parts[2]!.temperature).toBe(900);
		sim.dispose();
	});

	test('the tech grant researches every node', async () => {
		const sim = await make('stock.career');
		sim.dispatch({ type: 'debug-mode', on: true });
		expect(sim.dispatch({ type: 'debug-grant', tech: true }).ok).toBe(true);
		expect(sim.snapshot().tech!.researched.length).toBe(sim.registries.techNodes.list().length);
		sim.dispose();
	});
});
