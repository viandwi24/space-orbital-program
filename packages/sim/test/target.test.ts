/** Plan 035 / ADR 0064: targets in the sim - command, relative state, closest approach, SAS, loss, saves. */
import { describe, expect, test } from 'bun:test';
import { type EntityId, type Vec3 } from '@orbital/core';
import { length, normalize, sub } from '@orbital/kepler';
import type { Sim } from '../src/index.ts';
import { centreOfMass, orbitState } from './helpers/measure.ts';
import { pointingError } from './helpers/sas.ts';
import { moonLander, newSim, probe, stack } from './helpers/vessels.ts';

const DEG = 180 / Math.PI;
const vesselOf = (sim: Sim, id: EntityId) => sim.snapshot().vessels.find((v) => v.id === id)!;

function load(sim: Sim, alt: number, phase = 0, design = probe()): EntityId {
	const s = orbitState(sim, alt);
	// Turn the state about +Y (the orbit normal) to put the second vessel ahead on the same circle.
	const c = Math.cos(phase);
	const n = Math.sin(phase);
	const rot = (v: Vec3): Vec3 => ({ x: v.x * c + v.z * n, y: v.y, z: -v.x * n + v.z * c });
	const res = sim.dispatch({
		type: 'load-vessel',
		design,
		placement: { kind: 'state', position: rot(s.position), velocity: rot(s.velocity) }
	});
	if (!res.ok) throw new Error(res.reason);
	return res.vessel as EntityId;
}

async function twoProbes(altB = 160_000, phase = 0.4) {
	const sim = await newSim();
	const a = load(sim, 150_000);
	const b = load(sim, altB, phase);
	return { sim, a, b };
}

describe('target-set', () => {
	test('selects a body or a vessel, clears with null, and the snapshot reports it', async () => {
		const { sim, a, b } = await twoProbes();
		expect(vesselOf(sim, a).target).toBeUndefined();
		expect(
			sim.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: b } }).ok
		).toBe(true);
		let t = vesselOf(sim, a).target!;
		expect(t.kind).toBe('vessel');
		expect(t.id).toBe(b);
		expect(t.name).toBe('Probe 2'); // the second launch of the design is numbered (ADR 0252);
		expect(
			sim.dispatch({
				type: 'target-set',
				vessel: a,
				target: { kind: 'body', id: 'stock.cinder' as never }
			}).ok
		).toBe(true);
		t = vesselOf(sim, a).target!;
		expect(t.kind).toBe('body');
		expect(t.name).toBe('stock.cinder');
		expect(sim.dispatch({ type: 'target-set', vessel: a, target: null }).ok).toBe(true);
		expect(vesselOf(sim, a).target).toBeUndefined();
		sim.dispose();
	});

	test('refuses itself, an unknown vessel, an unknown body and a vessel without a command part', async () => {
		const { sim, a } = await twoProbes();
		const self = sim.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: a } });
		expect(self).toEqual({ ok: false, reason: 'a vessel cannot target itself' });
		const gone = sim.dispatch({
			type: 'target-set',
			vessel: a,
			target: { kind: 'vessel', id: 999 as EntityId }
		});
		expect(gone.ok).toBe(false);
		if (!gone.ok) expect(gone.reason).toContain('unknown vessel 999');
		const body = sim.dispatch({
			type: 'target-set',
			vessel: a,
			target: { kind: 'body', id: 'stock.nowhere' as never }
		});
		expect(body.ok).toBe(false);
		if (!body.ok) expect(body.reason).toContain('stock.home');
		const tank = sim.dispatch({
			type: 'load-vessel',
			design: stack('Tank', ['stock.tank-small'], [])
		});
		if (!tank.ok) throw new Error(tank.reason);
		const dead = sim.dispatch({
			type: 'target-set',
			vessel: tank.vessel!,
			target: { kind: 'vessel', id: a }
		});
		expect(dead.ok).toBe(false);
		const bad = sim.dispatch({ type: 'target-set', vessel: a, target: { kind: 'planet' } });
		expect(bad.ok).toBe(false);
		sim.dispose();
	});
});

describe('relative state', () => {
	test('a vessel target: position and velocity are the difference of the two centres of mass', async () => {
		const { sim, a, b } = await twoProbes();
		sim.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: b } });
		const snap = sim.snapshot();
		const t = snap.vessels.find((v) => v.id === a)!.target!;
		const ca = centreOfMass(
			sim,
			snap.vessels.find((v) => v.id === a)!
		);
		const cb = centreOfMass(
			sim,
			snap.vessels.find((v) => v.id === b)!
		);
		expect(length(sub(t.position, sub(cb, ca)))).toBeLessThan(1e-3);
		expect(t.distance).toBeCloseTo(length(sub(cb, ca)), 3);
		// the speed of one on rails against a numerical difference a second later
		const before = t.position;
		sim.step(0.5);
		const after = vesselOf(sim, a).target!.position;
		const numeric = length(sub(after, before)) / 0.5;
		expect(Math.abs(numeric - t.relativeSpeed)).toBeLessThan(0.05 * t.relativeSpeed + 0.5);
		sim.dispose();
	});

	test('a body target: the moon from a home orbit is the moon state minus the vessel', async () => {
		const sim = await newSim();
		const a = load(sim, 150_000);
		sim.dispatch({
			type: 'target-set',
			vessel: a,
			target: { kind: 'body', id: 'stock.cinder' as never }
		});
		const snap = sim.snapshot();
		const moon = snap.bodies.find((b) => b.id === 'stock.cinder')!;
		const t = snap.vessels[0]!.target!;
		const com = centreOfMass(sim, snap.vessels[0]!);
		const home = snap.bodies.find((b) => b.id === 'stock.home')!;
		expect(length(sub(t.position, sub(sub(moon.position, home.position), com)))).toBeLessThan(1e-3);
		expect(t.relativeSpeed).toBeGreaterThan(1_000); // the vessel's 2.2 km/s against the moon's motion
		sim.dispose();
	});
});

describe('closest approach', () => {
	test('vessel to vessel on rails equals the distance the sim measures when it gets there', async () => {
		const { sim, a, b } = await twoProbes(160_000, 0.4);
		sim.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: b } });
		const ap = vesselOf(sim, a).target!.approach!;
		expect(ap).not.toBeNull();
		expect(ap.time).toBeGreaterThan(sim.time);
		expect(ap.distance).toBeLessThan(vesselOf(sim, a).target!.distance);
		expect(sim.dispatch({ type: 'warp-to', time: ap.time, factor: 1_000 }).ok).toBe(true);
		for (let i = 0; i < 400 && sim.time < ap.time - 1e-9; i++) sim.step(0.1);
		expect(sim.time).toBeCloseTo(ap.time, 4);
		const there = vesselOf(sim, a).target!;
		expect(Math.abs(there.distance - ap.distance)).toBeLessThan(1);
		expect(Math.abs(there.relativeSpeed - ap.relativeSpeed)).toBeLessThan(1e-3);
		sim.dispose();
	});

	test('vessel to the moon: the reported distance is the moon distance at that time', async () => {
		const sim = await newSim();
		const a = load(sim, 150_000);
		sim.dispatch({
			type: 'target-set',
			vessel: a,
			target: { kind: 'body', id: 'stock.cinder' as never }
		});
		const ap = vesselOf(sim, a).target!.approach!;
		expect(ap).not.toBeNull();
		expect(ap.distance).toBeGreaterThan(1e6);
		sim.dispatch({ type: 'warp-to', time: ap.time, factor: 1_000 });
		for (let i = 0; i < 400 && sim.time < ap.time - 1e-9; i++) sim.step(0.1);
		expect(Math.abs(vesselOf(sim, a).target!.distance - ap.distance)).toBeLessThan(1);
		sim.dispose();
	});

	test('is null when the two do not orbit the same body, or the vessel is on the ground', async () => {
		const sim = await newSim();
		const pad = sim.dispatch({ type: 'load-vessel', design: moonLander() });
		if (!pad.ok) throw new Error(pad.reason);
		const id = pad.vessel as EntityId;
		sim.dispatch({
			type: 'target-set',
			vessel: id,
			target: { kind: 'body', id: 'stock.cinder' as never }
		});
		sim.step(0.1);
		expect(vesselOf(sim, id).target!.approach).toBeNull(); // a climb from the pad: its conic dips into the ground
		const orbiter = load(sim, 150_000);
		// a body target that is the vessel's own primary has no approach either
		sim.dispatch({
			type: 'target-set',
			vessel: orbiter,
			target: { kind: 'body', id: 'stock.home' as never }
		});
		expect(vesselOf(sim, orbiter).target!.approach).toBeNull();
		sim.dispose();
	});

	test('costs well under a millisecond per snapshot', async () => {
		const { sim, a, b } = await twoProbes();
		sim.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: b } });
		sim.snapshot();
		const t0 = performance.now();
		for (let i = 0; i < 200; i++) sim.snapshot();
		const withTarget = (performance.now() - t0) / 200;
		sim.dispatch({ type: 'target-set', vessel: a, target: null });
		const t1 = performance.now();
		for (let i = 0; i < 200; i++) sim.snapshot();
		const without = (performance.now() - t1) / 200;
		console.log(
			`snapshot with a target ${withTarget.toFixed(3)} ms, without ${without.toFixed(3)} ms`
		);
		// a timing budget measured on the M5: CI runners only log the number
		if (!process.env.CI) expect(withTarget - without).toBeLessThan(1);
		sim.dispose();
	});
});

describe('SAS target and anti-target', () => {
	test('point the nose at, and away from, the target on rails', async () => {
		const { sim, a, b } = await twoProbes(160_000, 0.4);
		sim.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: b } });
		for (const [mode, sign] of [
			['target', 1],
			['anti-target', -1]
		] as const) {
			expect(sim.dispatch({ type: 'sas', vessel: a, mode }).ok).toBe(true);
			// the turn wakes the probe and takes its own torque at 1x (plan 310)
			for (let i = 0; i < 60; i++) sim.step(1);
			const v = vesselOf(sim, a);
			const aim = normalize({
				x: v.target!.position.x * sign,
				y: v.target!.position.y * sign,
				z: v.target!.position.z * sign
			});
			expect(pointingError(v.orientation, aim) * DEG).toBeLessThan(1);
			expect(v.sas!.mode).toBe(mode);
		}
		sim.dispose();
	});

	test('in flight the nose settles within 1 degree of the target', async () => {
		const { sim, a, b } = await twoProbes(160_000, 0.4);
		sim.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: b } });
		sim.dispatch({ type: 'sas', vessel: a, mode: 'target' });
		sim.dispatch({ type: 'attitude', vessel: a, pitch: 1e-9, yaw: 0, roll: 0 });
		sim.step(0.02);
		sim.dispatch({ type: 'attitude', vessel: a, pitch: 0, yaw: 0, roll: 0 });
		expect(vesselOf(sim, a).mode).toBe('flight');
		let worst = 0;
		for (let i = 0; i < 40 * 50; i++) {
			sim.step(0.02);
			if (sim.time > 25) {
				const v = vesselOf(sim, a);
				worst = Math.max(worst, pointingError(v.orientation, normalize(v.target!.position)));
			}
		}
		console.log(`sas target in flight: worst error after 25 s ${(worst * DEG).toFixed(3)} deg`);
		expect(worst * DEG).toBeLessThan(1);
		sim.dispose();
	}, 30_000);

	test('with no target the mode settles and the command is accepted', async () => {
		const { sim, a } = await twoProbes();
		expect(sim.dispatch({ type: 'sas', vessel: a, mode: 'target' }).ok).toBe(true);
		sim.step(1);
		expect(vesselOf(sim, a).sas!.mode).toBe('target');
		sim.dispose();
	});
});

describe('a target that is gone', () => {
	test('debris re-entering is dropped as a target with an event', async () => {
		const sim = await newSim();
		const a = load(sim, 150_000);
		const lost: Array<{ vessel: number; target: number }> = [];
		sim.events.on('vessel:target-lost', (e) => lost.push(e));
		const tank = sim.dispatch({
			type: 'load-vessel',
			design: stack('Tank', ['stock.tank-small'], []),
			placement: { kind: 'state', ...orbitState(sim, 100_000, 0.5) }
		});
		if (!tank.ok) throw new Error(tank.reason);
		expect(
			sim.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: tank.vessel! } })
				.ok
		).toBe(true);
		for (let i = 0; i < 150; i++) sim.step(0.02);
		expect(sim.dispatch({ type: 'warp', factor: 50 }).ok).toBe(true);
		sim.step(20);
		expect(sim.snapshot().vessels).toHaveLength(1);
		expect(vesselOf(sim, a).target).toBeUndefined();
		expect(lost).toEqual([{ vessel: a, target: tank.vessel! }]);
		sim.dispose();
	});

	test('staging hands the target to the half that can still be flown', async () => {
		const { twoStage } = await import('./helpers/vessels.ts');
		const sim = await newSim();
		const target = load(sim, 150_000);
		const ship = sim.dispatch({ type: 'load-vessel', design: twoStage() });
		if (!ship.ok) throw new Error(ship.reason);
		const id = ship.vessel as EntityId;
		sim.dispatch({ type: 'target-set', vessel: id, target: { kind: 'vessel', id: target } });
		sim.dispatch({ type: 'stage', vessel: id });
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		sim.dispatch({ type: 'stage', vessel: id });
		for (let i = 0; i < 100; i++) sim.step(0.02);
		const holders = sim.snapshot().vessels.filter((v) => v.target !== undefined);
		expect(holders).toHaveLength(1);
		expect(holders[0]!.parts.some((p) => p.definition === 'stock.command-pod')).toBe(true);
		sim.dispose();
	});
});
