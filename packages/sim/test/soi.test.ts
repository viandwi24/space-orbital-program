/**
 * Plan 044 / ADR 0051: spheres of influence. A vessel crosses from the home planet into the moon's
 * sphere and out again, on rails and in flight; the state is continuous, the frame is re-based,
 * time warp stops for a controlled vessel and not for debris.
 */
import { describe, expect, test } from 'bun:test';
import {
	createMoonTerrainField,
	GRAVITATIONAL_CONSTANT,
	MOON_SHAPE,
	type EntityId,
	type Snapshot,
	type Vec3
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import {
	add,
	length,
	predictPatchedConics,
	propagate,
	soiRadius,
	sub,
	toStateVector,
	type StateVector
} from '@orbital/kepler';
import { createSim, type Sim } from '../src/index.ts';
import { homeFrame, moonState, systemOf, transferState, type System } from './helpers/moon.ts';
import { newSim, probe, rapier, stack, twoStage } from './helpers/vessels.ts';

/** Transfer that misses the moon's centre by about 800 km: a flyby with a periapsis near 500 km. */
const FLYBY = 800_000;

const tank = () => stack('Tank', ['stock.tank-small'], []);

interface Crossing {
	t: number;
	from: string;
	to: string;
}

/** Centre-of-mass state of a vessel in the frame of the planet, from its snapshot orbit. */
function inertial(s: System, snap: Snapshot, id: EntityId): StateVector {
	const v = snap.vessels.find((x) => x.id === id)!;
	const body = v.soi === s.home.id ? s.homeMu : s.moonMu;
	const rel = propagate(v.orbit!, body, snap.t);
	return v.soi === s.home.id ? rel : homeFrame(s, rel, snap.t);
}

async function transferProbe(design = probe(), shift = FLYBY) {
	const sim = await newSim();
	const s = systemOf(sim);
	const st = transferState(s, 680_000, shift);
	const placed = sim.dispatch({
		type: 'load-vessel',
		design,
		placement: { kind: 'state', position: st.r, velocity: st.v }
	});
	if (!placed.ok) throw new Error(placed.reason);
	const crossings: Crossing[] = [];
	sim.events.on('vessel:soi-changed', (e) => {
		if (e.vessel === placed.vessel) crossings.push({ t: sim.time, from: e.from, to: e.to });
	});
	return { sim, s, id: placed.vessel!, crossings };
}

/** Run at 1000x until `done`, re-arming the warp each time a crossing drops it to 1. */
function warpUntil(sim: Sim, done: () => boolean, limit = 100_000): void {
	for (let i = 0; i < 20_000 && !done() && sim.time < limit; i++) {
		if (sim.warp === 1) sim.dispatch({ type: 'warp', factor: 1000 });
		sim.step(0.01);
	}
}

describe('on rails', () => {
	test('a transfer orbit enters the moon sphere and leaves it again, each with a continuous state', async () => {
		const first = await transferProbe();
		warpUntil(first.sim, () => first.crossings.length >= 2);
		expect(first.crossings.map((c) => `${c.from}>${c.to}`)).toEqual([
			'stock.home>stock.cinder',
			'stock.cinder>stock.home'
		]);
		const times = first.crossings.map((c) => c.t);
		first.sim.dispose();

		// Same run again, but fine steps around each crossing: compare the old conic with the new one.
		for (const [index, at] of times.entries()) {
			const r = await transferProbe();
			warpUntil(r.sim, () => r.sim.time > at - 40 || r.crossings.length > index);
			r.sim.dispatch({ type: 'warp', factor: 1 });
			let before = r.sim.snapshot();
			let guard = 0;
			// After the first crossing the second one is 10 000 s away: the loop above stopped before it.
			while (r.crossings.length === index && guard++ < 4_000) {
				before = r.sim.snapshot();
				r.sim.step(0.02);
			}
			expect(r.crossings.length).toBe(index + 1);
			const after = r.sim.snapshot();
			// The old conic evaluated at the new time against the new one: only the change of the
			// pulling body over one 0.02 s step is left (acceleration jump 0.014 m/s^2).
			const body = (soi: string) => (soi === r.s.home.id ? r.s.homeMu : r.s.moonMu);
			const old = before.vessels[0]!;
			const oldAtNow = (() => {
				const rel = propagate(old.orbit!, body(old.soi), after.t);
				return old.soi === r.s.home.id ? rel : homeFrame(r.s, rel, after.t);
			})();
			const now = inertial(r.s, after, r.id);
			expect(length(sub(now.r, oldAtNow.r))).toBeLessThan(1e-3);
			expect(length(sub(now.v, oldAtNow.v))).toBeLessThan(1e-3);
			expect(String(before.vessels[0]!.soi)).not.toBe(after.vessels[0]!.soi);
			r.sim.dispose();
		}
	}, 60_000);

	test('the switch happens on the boundary: within 1 km of the sphere radius, on the near side', async () => {
		const r = await transferProbe();
		const seen: number[] = [];
		r.sim.events.on('vessel:soi-changed', () => {
			const snap = r.sim.snapshot();
			const v = snap.vessels[0]!;
			seen.push(
				v.soi === r.s.home.id
					? length(sub(inertial(r.s, snap, r.id).r, moonState(r.s, snap.t).r))
					: length(v.orbit ? propagate(v.orbit, r.s.moonMu, snap.t).r : v.position)
			);
		});
		warpUntil(r.sim, () => seen.length >= 2);
		// Both crossings are at the moon-relative distance r_SOI, found by bisection inside the step.
		// Sampled one step later (up to 10 s at ~450 m/s), so within 5 km.
		for (const d of seen) expect(Math.abs(d - r.s.soi)).toBeLessThan(5_000);
		r.sim.dispose();
	}, 60_000);

	test('a vessel nowhere near the moon never changes sphere', async () => {
		const sim = await newSim();
		const events: unknown[] = [];
		sim.events.on('vessel:soi-changed', (e) => events.push(e));
		const placed = sim.dispatch({
			type: 'load-vessel',
			design: probe(),
			placement: {
				kind: 'state',
				position: { x: 700_000, y: 0, z: 0 },
				velocity: { x: 0, y: 0, z: -2_250 }
			}
		});
		if (!placed.ok) throw new Error(placed.reason);
		sim.dispatch({ type: 'warp', factor: 1000 });
		for (let i = 0; i < 300; i++) sim.step(0.1); // 30 000 s, eight orbits
		expect(events).toEqual([]);
		expect(String(sim.snapshot().vessels[0]!.soi)).toBe('stock.home');
		sim.dispose();
	});

	test('time warp returns to 1 for a controlled vessel and the rest of the step is dropped', async () => {
		const r = await transferProbe();
		r.sim.dispatch({ type: 'warp', factor: 1000 });
		let guard = 0;
		while (r.crossings.length === 0 && guard++ < 5_000) r.sim.step(0.01);
		expect(r.crossings).toHaveLength(1);
		expect(r.sim.warp).toBe(1);
		// The step that crossed carried at most 10 s of sim time past the crossing (one rails chunk),
		// and nothing of the remaining accumulator is played afterwards.
		expect(r.sim.time - r.crossings[0]!.t).toBeLessThanOrEqual(10 + 1e-9);
		const t = r.sim.time;
		r.sim.step(0);
		expect(r.sim.time).toBe(t);
		r.sim.dispose();
	}, 30_000);

	test('debris changes sphere without stopping the warp', async () => {
		const r = await transferProbe(tank());
		r.sim.dispatch({ type: 'warp', factor: 1000 });
		let guard = 0;
		while (r.crossings.length === 0 && guard++ < 5_000) r.sim.step(0.01);
		expect(r.crossings).toHaveLength(1);
		expect(r.sim.warp).toBe(1000);
		r.sim.dispose();
	}, 30_000);

	test('a vessel starting inside the moon sphere is put there at once', async () => {
		const sim = await newSim();
		const s = systemOf(sim);
		const m = moonState(s, 0);
		const rel = { x: 600_000, y: 0, z: 0 };
		const vRel = { x: 0, y: 0, z: -800 };
		const placed = sim.dispatch({
			type: 'load-vessel',
			design: probe(),
			placement: {
				kind: 'state',
				position: add(m.r, add(rel, { x: 1e6, y: 0, z: 0 })),
				velocity: add(m.v, vRel)
			}
		});
		if (!placed.ok) throw new Error(placed.reason);
		sim.step(0.02);
		expect(String(sim.snapshot().vessels[0]!.soi)).toBe('stock.cinder');
		sim.dispose();
	});
});

describe('in flight', () => {
	/** A controlled vessel in flight, `gap` m outside (positive) or inside (negative) the moon sphere. */
	async function flyAcross(gap: number, speed: number) {
		const sim = await newSim({ maxFlightFrames: 2 });
		const s = systemOf(sim);
		const m = moonState(s, 0);
		// On the moon's far side from the planet, so nothing else is near; radial motion.
		const dir: Vec3 = { x: 1, y: 0, z: 0 };
		const rel = { x: dir.x * (s.soi + gap), y: 0, z: 0 };
		const sign = gap > 0 ? -1 : 1; // entering: towards the moon; leaving: away from it
		const inside = gap < 0;
		const placed = sim.dispatch({
			type: 'load-vessel',
			design: twoStage(),
			placement: inside
				? {
						kind: 'state',
						body: s.moon.id as never,
						position: rel,
						velocity: { x: sign * speed, y: 0, z: 0 }
					}
				: {
						kind: 'state',
						position: add(m.r, rel),
						velocity: add(m.v, { x: sign * speed, y: 0, z: 0 })
					}
		});
		if (!placed.ok) throw new Error(placed.reason);
		// Torque input keeps the vessel in flight (a force or torque resets the rails timer).
		expect(
			sim.dispatch({ type: 'attitude', vessel: placed.vessel!, pitch: 0.02, yaw: 0, roll: 0 }).ok
		).toBe(true);
		expect(sim.snapshot().vessels[0]!.mode).toBe('flight');
		return { sim, s, id: placed.vessel! };
	}

	for (const [name, gap, speed] of [
		['entering', 6_000, 800],
		['leaving', -6_000, 800]
	] as const) {
		test(`${name} the sphere: the frame is re-based and the inertial state continues`, async () => {
			const { sim, s, id } = await flyAcross(gap, speed);
			const crossings: Crossing[] = [];
			sim.events.on('vessel:soi-changed', (e) =>
				crossings.push({ t: sim.time, from: e.from, to: e.to })
			);
			const sample = () => {
				const snap = sim.snapshot();
				const v = snap.vessels.find((x) => x.id === id)!;
				const body = snap.bodies.find((b) => b.id === v.soi)!;
				const moonV = v.soi === s.moon.id ? moonState(s, snap.t).v : { x: 0, y: 0, z: 0 };
				return {
					soi: v.soi,
					mode: v.mode,
					r: add(v.position, body.position),
					v: add(v.velocity, moonV),
					t: snap.t
				};
			};
			let prev = sample();
			let worstR = 0;
			let worstV = 0;
			for (let i = 0; i < 1_000 && crossings.length === 0; i++) {
				sim.step(0.02);
				const cur = sample();
				const dt = cur.t - prev.t;
				worstR = Math.max(
					worstR,
					length(sub(cur.r, add(prev.r, { x: prev.v.x * dt, y: prev.v.y * dt, z: prev.v.z * dt })))
				);
				worstV = Math.max(worstV, length(sub(cur.v, prev.v)));
				prev = cur;
			}
			expect(crossings).toHaveLength(1);
			expect(crossings[0]!.to).toBe(gap > 0 ? s.moon.id : s.home.id);
			expect(String(prev.soi)).toBe(crossings[0]!.to);
			expect(prev.mode).toBe('flight');
			// A wrong frame change would jump by 1e7 m; step to step only gravity and spin remain.
			expect(worstR).toBeLessThan(1e-3);
			expect(worstV).toBeLessThan(1e-3);
			// Gravity of the new body from the next step on: the moon pulls ~0.011 m/s^2, the planet
			// ~0.025 m/s^2 out here; a vessel in the moon sphere moving inward gains speed relative to it.
			if (gap > 0) {
				const rel = (x: typeof prev) => sub(x.v, moonState(s, x.t).v);
				const v0 = length(rel(prev));
				for (let i = 0; i < 500; i++) sim.step(0.02);
				expect(length(rel(sample()))).toBeGreaterThan(v0 + 0.05);
			}
			sim.dispose();
		}, 30_000);
	}

	test('the whole frame crosses together: a decoupled stage follows its parent', async () => {
		const { sim, id } = await flyAcross(6_000, 800);
		const sois = () => sim.snapshot().vessels.map((v) => v.soi);
		sim.dispatch({ type: 'stage', vessel: id });
		sim.dispatch({ type: 'stage', vessel: id }); // fires the decoupler: two vessels in one frame
		for (let i = 0; i < 100; i++) sim.step(0.02);
		expect(sim.snapshot().vessels.length).toBeGreaterThanOrEqual(2);
		for (let i = 0; i < 400; i++) sim.step(0.02);
		expect(new Set(sois()).size).toBe(1);
		sim.dispose();
	}, 30_000);
});

describe('the moon as a place', () => {
	test('the moon follows its Kepler orbit in the snapshot and a lander stands on its surface', async () => {
		const sim = await newSim();
		const s = systemOf(sim);
		const snap0 = sim.snapshot();
		expect(snap0.bodies.map((b) => String(b.id))).toEqual(['stock.home', 'stock.cinder']);
		const m = snap0.bodies[1]!;
		const expected = toStateVector(s.orbit, s.homeMu, 0).r;
		expect(length(sub(m.position, expected))).toBeLessThan(1e-6);
		const placed = sim.dispatch({
			type: 'load-vessel',
			design: twoStage(),
			placement: { kind: 'surface', body: 'stock.cinder' as never, latitude: 0.1, longitude: 0.5 }
		});
		if (!placed.ok) throw new Error(placed.reason);
		for (let i = 0; i < 500; i++) sim.step(0.02);
		const v = sim.snapshot().vessels[0]!;
		expect(String(v.soi)).toBe('stock.cinder');
		expect(length(v.position)).toBeGreaterThan(s.moon.radius);
		expect(length(v.position)).toBeLessThan(s.moon.radius + 15);
		// It is at rest on the ground, then on surface rails in the moon's body-fixed frame.
		for (let i = 0; i < 500; i++) sim.step(0.02);
		const rested = sim.snapshot().vessels[0]!;
		expect(rested.mode).toBe('on-rails');
		expect(rested.surface).toBe(true);
		sim.dispose();
	}, 30_000);

	test("with a terrain function the lander stands on the moon's cratered ground, on the plain at the landing site", async () => {
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: rapier(16),
			seed: 1,
			terrain: (body) => (body.parent ? createMoonTerrainField({ radius: body.radius }) : undefined)
		});
		const s = systemOf(sim);
		const placed = sim.dispatch({
			type: 'load-vessel',
			design: twoStage(),
			placement: { kind: 'surface', body: s.moon.id as never }
		});
		if (!placed.ok) throw new Error(placed.reason);
		for (let i = 0; i < 700; i++) sim.step(0.02);
		const v = sim.snapshot().vessels[0]!;
		expect(v.terrainHeight).toBeCloseTo(MOON_SHAPE.base, 6);
		const altitude = length(v.position) - s.moon.radius;
		expect(altitude).toBeGreaterThan(MOON_SHAPE.base);
		expect(altitude).toBeLessThan(MOON_SHAPE.base + 15);
		expect(v.mode).toBe('on-rails');
		expect(v.surface).toBe(true);
		sim.dispose();
	}, 30_000);

	test('add helper sanity: homeFrame adds the moon state', async () => {
		const sim = await newSim();
		const s = systemOf(sim);
		const f = homeFrame(s, { r: { x: 1, y: 2, z: 3 }, v: { x: 0, y: 0, z: 0 } }, 100);
		expect(length(sub(f.r, add({ x: 1, y: 2, z: 3 }, moonState(s, 100).r)))).toBe(0);
		sim.dispose();
	});
});

describe('the prediction agrees with the sim', () => {
	test('predicted patched conics reproduce the crossings and the periapsis the sim then flies', async () => {
		const r = await transferProbe();
		const s = r.s;
		const bodies = r.sim.registries.bodies.list().map((b) => ({
			id: b.id,
			mu: GRAVITATIONAL_CONSTANT * b.mass,
			soi: b.parent
				? soiRadius(b.orbit!.a, b.mass, r.sim.registries.bodies.get(b.parent)!.mass)
				: Infinity,
			radius: b.radius,
			...(b.parent ? { parent: b.parent, orbit: b.orbit! } : {})
		}));
		const snap = r.sim.snapshot();
		const v = snap.vessels[0]!;
		const path = predictPatchedConics(
			bodies,
			{ body: s.home.id, r: v.position, v: v.velocity, t: snap.t },
			60_000
		);
		expect(path.map((p) => p.body)).toEqual([s.home.id, s.moon.id, s.home.id]);
		expect(path[0]!.end).toBe('transition');
		expect(path[2]!.end).toBe('horizon');
		warpUntil(r.sim, () => r.crossings.length >= 2);
		const [enter, leave] = r.crossings;
		// The sim switches at the end of a rails chunk of at most 10 s, bisected; the prediction is the
		// same rule, so the times agree to well under a chunk.
		expect(Math.abs(path[0]!.t1 - enter!.t)).toBeLessThan(10.5);
		expect(Math.abs(path[1]!.t1 - leave!.t)).toBeLessThan(10.5);
		// The moon segment's periapsis is the periapsis of the orbit the sim has around the moon.
		const expected = path[1]!.elements!;
		const rPredicted = expected.a * (1 - expected.e);
		const moonSim = await transferProbe();
		warpUntil(moonSim.sim, () => moonSim.crossings.length >= 1);
		const o = moonSim.sim.snapshot().vessels[0]!.orbit!;
		expect(Math.abs(o.a * (1 - o.e) - rPredicted)).toBeLessThan(2_000);
		// The segment's body offset is the moon's position when the vessel got there.
		expect(length(sub(path[1]!.bodyOffset, moonState(s, path[1]!.t0).r))).toBeLessThan(1e-6);
		r.sim.dispose();
		moonSim.sim.dispose();
	}, 60_000);
});
