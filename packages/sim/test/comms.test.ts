/** Comms tier 1 (plan 114, ADR 0179): occlusion and its timing, probe control, blackout, cost. */
import { openTree } from './helpers/tech.ts';
import { describe, expect, test } from 'bun:test';
import {
	GRAVITATIONAL_CONSTANT,
	legacyWorldInfo,
	type EntityId,
	type Plugin,
	type Snapshot,
	type Vec3,
	type WorldInfo
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { defineBody, definePlugin } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { orbitState } from './helpers/measure.ts';
import { rapier, stack } from './helpers/vessels.ts';

const world = (preset: string): WorldInfo => ({
	...legacyWorldInfo(1),
	id: '0c9d8e7f-6a5b-4c3d-9e2f-1a0b9c8d7e6f',
	preset
});
const make = (preset?: string, plugins: Plugin[] = []) =>
	createSim({
		plugins: [Stock, openTree, ...plugins],
		backendFactory: rapier(16),
		...(preset ? { world: world(preset) } : {})
	});

const v3 = {
	add: (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
	sub: (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
	scale: (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k }),
	dot: (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z,
	len: (a: Vec3): number => Math.hypot(a.x, a.y, a.z)
};
const unit = (a: Vec3): Vec3 => v3.scale(a, 1 / v3.len(a));

function load(sim: Sim, parts: string[], placement: unknown): EntityId {
	const r = sim.dispatch({
		type: 'load-vessel',
		design: stack('Probe', parts, []),
		placement: placement as never
	});
	if (!r.ok) throw new Error(r.reason);
	return r.vessel!;
}

const link = (snap: Snapshot, id: EntityId) => snap.network!.vessels.find((v) => v.vessel === id)!;

/**
 * A probe on a circular orbit 250 km from the moon's centre, in the plane of the station and the
 * moon, 60° before the far side as seen from the station, heading for it.
 */
function behindTheMoon(sim: Sim): EntityId {
	const snap = sim.snapshot();
	const moon = snap.bodies.find((b) => String(b.id) === 'stock.cinder')!.position;
	const station = snap.network!.stations[0]!.position;
	const u = unit(v3.sub(moon, station));
	const w = unit({ x: -u.z, y: 0, z: u.x });
	const def = sim.registries.bodies.get('stock.cinder')!;
	const r = 250_000;
	const speed = Math.sqrt((GRAVITATIONAL_CONSTANT * def.mass) / r);
	const phi = Math.PI / 3;
	const position = v3.add(v3.scale(u, r * Math.cos(phi)), v3.scale(w, r * Math.sin(phi)));
	const velocity = v3.add(v3.scale(u, speed * Math.sin(phi)), v3.scale(w, -speed * Math.cos(phi)));
	return load(sim, ['stock.probe-core'], {
		kind: 'state',
		body: 'stock.cinder',
		position,
		velocity
	});
}

/** Whether every station's segment to the vessel crosses a body, from the snapshot alone. */
function occluded(sim: Sim, snap: Snapshot, id: EntityId): boolean {
	const v = snap.vessels.find((x) => x.id === id)!;
	const centre = (body: string) => snap.bodies.find((b) => String(b.id) === body)!.position;
	const at = v3.add(centre(String(v.soi)), v.position);
	return snap.network!.stations.every((s) =>
		snap.bodies.some((b) => {
			const ab = v3.sub(at, s.position);
			const k = Math.min(
				1,
				Math.max(0, v3.dot(v3.sub(b.position, s.position), ab) / v3.dot(ab, ab))
			);
			const closest = v3.add(s.position, v3.scale(ab, k));
			return v3.len(v3.sub(closest, b.position)) < sim.registries.bodies.get(String(b.id))!.radius;
		})
	);
}

describe('line of sight (ADR 0179 points 3 and 4)', () => {
	test('a probe behind the moon loses the link when the geometry says, at warp 1 and 1e5', async () => {
		// warp 1: step until the snapshot geometry shows the moon in the way
		const sim = await make();
		const id = behindTheMoon(sim);
		const downs: Array<{ reason: string; time: number }> = [];
		sim.events.on('comms:link-down', (e) => downs.push(e));
		sim.step(0.02);
		expect(link(sim.snapshot(), id).to).toBe('site:legacy');
		let geometric = Number.NaN;
		for (let i = 0; i < 20_000 && Number.isNaN(geometric); i++) {
			sim.step(0.02);
			const snap = sim.snapshot();
			if (occluded(sim, snap, id)) geometric = snap.t;
		}
		expect(geometric).toBeGreaterThan(30);
		for (let i = 0; i < 60; i++) sim.step(0.02); // the next network update
		expect(downs).toHaveLength(1);
		expect(downs[0]!.reason).toBe('blocked by stock.cinder');
		expect(Math.abs(downs[0]!.time - geometric)).toBeLessThan(1);
		expect(link(sim.snapshot(), id)).toMatchObject({ to: null, reason: 'blocked by stock.cinder' });
		sim.dispose();

		// warp 1e5: one step jumps far past it; the bisection dates the change
		const fast = await make();
		const again = behindTheMoon(fast);
		const fastDowns: Array<{ time: number }> = [];
		fast.events.on('comms:link-down', (e) => fastDowns.push(e));
		fast.step(0.02);
		expect(fast.dispatch({ type: 'warp', factor: 100_000 }).ok).toBe(true);
		fast.step(0.02);
		expect(fast.snapshot().t).toBeGreaterThan(geometric + 100);
		expect(fastDowns.length).toBeGreaterThanOrEqual(1);
		expect(Math.abs(fastDowns[0]!.time - geometric)).toBeLessThan(1);
		expect(again).toBe(id);
		fast.dispose();
	}, 120_000);
});

describe('probe control (ADR 0179 point 5)', () => {
	test('without signal, "none" refuses throttle with the reason and "full" accepts it', async () => {
		const sim = await make('stock.career');
		const probe = load(sim, ['stock.probe-core'], { kind: 'surface' });
		sim.step(0.02);
		expect(sim.dispatch({ type: 'throttle', vessel: probe, value: 0.5 })).toEqual({ ok: true });
		const core = sim.snapshot().vessels.find((v) => v.id === probe)!.parts[0]!.id;
		const off = sim.dispatch({
			type: 'action',
			vessel: probe,
			part: core,
			module: 'stock.antenna',
			action: 'setEnabled',
			args: [false]
		});
		expect(off).toEqual({ ok: true });
		expect(sim.dispatch({ type: 'throttle', vessel: probe, value: 1 })).toEqual({
			ok: false,
			reason: 'no signal (antennas off): probe control is none (stock.control-without-signal)'
		});
		expect(
			sim.dispatch({ type: 'set-rule', rule: 'stock.control-without-signal', value: 'full' }).ok
		).toBe(true);
		expect(sim.dispatch({ type: 'throttle', vessel: probe, value: 1 })).toEqual({ ok: true });
		sim.dispose();
	});

	test('"partial" refuses throttle but not staging; a crewed pod is never refused', async () => {
		const sim = await make('stock.career');
		sim.dispatch({ type: 'set-rule', rule: 'stock.control-without-signal', value: 'partial' });
		const probe = load(sim, ['stock.probe-core'], { kind: 'surface', longitude: 0.01 });
		const pod = load(sim, ['stock.command-pod'], { kind: 'surface', longitude: -0.01 });
		const core = sim.snapshot().vessels.find((v) => v.id === probe)!.parts[0]!.id;
		sim.dispatch({
			type: 'action',
			vessel: probe,
			part: core,
			module: 'stock.antenna',
			action: 'setEnabled',
			args: [false]
		});
		expect(sim.dispatch({ type: 'throttle', vessel: probe, value: 1 }).ok).toBe(false);
		expect(sim.dispatch({ type: 'sas', vessel: probe, mode: 'hold' }).ok).toBe(true);
		const snap = sim.snapshot();
		expect(link(snap, pod)).toMatchObject({ to: null, reason: 'no antenna', control: 'full' });
		expect(link(snap, probe)).toMatchObject({ reason: 'antennas off', control: 'partial' });
		expect(sim.dispatch({ type: 'throttle', vessel: pod, value: 1 })).toEqual({ ok: true });
		sim.dispose();
	});
});

describe('plasma blackout (ADR 0179 point 7)', () => {
	test('during a re-entry above the badge flux the link is down', async () => {
		const sim = await make();
		const R = sim.registries.bodies.get('stock.home')!.radius;
		const id = load(sim, ['stock.probe-core'], {
			kind: 'state',
			position: { x: R + 35_000, y: 0, z: 0 },
			velocity: { x: -400, y: 0, z: -3_500 }
		});
		for (let i = 0; i < 60; i++) sim.step(0.02);
		const l = link(sim.snapshot(), id);
		expect(l.blackout).toBeGreaterThanOrEqual(0.5);
		expect(l).toMatchObject({ to: null, reason: 'plasma blackout' });
		sim.dispose();
	});
});

/** Eight more moons, so the system has ten bodies. */
const moons: Plugin = definePlugin({
	meta: { id: 'fix', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		for (let k = 0; k < 8; k++) {
			ctx.bodies.register(
				defineBody({
					id: `fix.moon-${k}`,
					mass: 1e19,
					radius: 50_000,
					rotationPeriod: 50_000,
					parent: 'stock.home',
					orbit: { a: 3_000_000 + 900_000 * k, e: 0, i: 0, raan: 0, argp: 0, m0: k, epoch: 0 }
				})
			);
		}
	}
});

describe('benchmark', () => {
	test('300 nodes and 10 bodies: under 0.5 ms per step on average', async () => {
		const STEPS = 1_000;
		const time = async (comms: boolean): Promise<number> => {
			const sim = await make(undefined, [moons]);
			expect(sim.registries.bodies.list()).toHaveLength(11); // the Sun, home, its moon and eight test moons
			sim.dispatch({ type: 'set-rule', rule: 'stock.comms', value: comms });
			for (let i = 0; i < 300; i++) {
				const s = orbitState(sim, 150_000 + 2_000 * i);
				const a = (i / 300) * 2 * Math.PI;
				const rot = (p: Vec3): Vec3 => ({
					x: p.x * Math.cos(a) + p.z * Math.sin(a),
					y: 0,
					z: -p.x * Math.sin(a) + p.z * Math.cos(a)
				});
				load(sim, ['stock.probe-core'], {
					kind: 'state',
					position: rot(s.position),
					velocity: rot(s.velocity)
				});
			}
			for (let i = 0; i < 100; i++) sim.step(0.02);
			const t0 = performance.now();
			for (let i = 0; i < STEPS; i++) sim.step(0.02);
			const ms = (performance.now() - t0) / STEPS;
			sim.dispose();
			return ms;
		};
		const added: number[] = [];
		for (let k = 0; k < 3; k++) added.push((await time(true)) - (await time(false)));
		const median = added.sort((x, y) => x - y)[1]!;
		console.log(`comms: ${(median * 1000).toFixed(0)} µs per step for 300 nodes, 10 bodies`);
		expect(median).toBeLessThan(0.5);
	}, 300_000);
});
