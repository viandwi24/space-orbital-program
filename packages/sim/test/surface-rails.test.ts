import { describe, expect, test } from 'bun:test';
import type { Quat, Vec3, VesselSnapshot } from '@orbital/core';
import { length, sub } from '@orbital/kepler';
import { createAscent } from './helpers/ascent.ts';
import { groundRelativeVelocity, rotateBy } from './helpers/ground.ts';
import { createLanding, defaultLanding } from './helpers/landing.ts';
import { altitude, orbitState } from './helpers/measure.ts';
import { newSim, ORBIT_LANDER_ROOT_TO_FOOT, orbitLander, probe, stack, twoStage } from './helpers/vessels.ts';

/** Plan 016 / ADR 0024: controlled vessels at rest on the ground go on surface-fixed rails. */
type TestSim = Awaited<ReturnType<typeof newSim>>;

const run = (sim: TestSim, seconds: number) => {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
};
const vesselOf = (sim: TestSim) => sim.snapshot().vessels[0]!;
const conj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

async function padSim(options: { maxFlightFrames?: number } = {}) {
	const sim = await newSim(options);
	const loaded = sim.dispatch({ type: 'load-vessel', design: twoStage() });
	if (!loaded.ok) throw new Error(loaded.reason);
	return { sim, id: loaded.vessel! };
}

/** Position of the vessel's root in the body-fixed frame (undoes the body's rotation). */
const bodyFixed = (sim: TestSim, v: VesselSnapshot): Vec3 =>
	rotateBy(conj(sim.snapshot().bodies.find((b) => b.id === sim.home)!.rotation), v.position);

describe('going on surface rails', () => {
	test('a pad vessel stays in flight for 2 s at rest, then goes on surface rails; warp is accepted', async () => {
		const { sim } = await padSim();
		const modes: string[] = [];
		sim.events.on('vessel:mode-changed', (e) => modes.push(`${e.mode}:${e.reason}`));
		run(sim, 1);
		expect(vesselOf(sim).mode).toBe('flight');
		// physics warp works before it rests (plan 206); it rests at 1×
		expect(sim.dispatch({ type: 'warp', factor: 10 })).toMatchObject({ ok: true, granted: 10 });
		sim.dispatch({ type: 'warp', factor: 1 });
		run(sim, 3);
		const v = vesselOf(sim);
		expect(v.mode).toBe('on-rails');
		expect(v.surface).toBe(true);
		expect(v.orbit).toBeUndefined();
		expect(modes).toEqual(['on-rails:at rest on the ground']);
		expect(sim.dispatch({ type: 'warp', factor: 10 }).ok).toBe(true);
	});

	test('its physics frame is released: with one frame, a vessel far away can be loaded', async () => {
		const { sim } = await padSim({ maxFlightFrames: 1 });
		const far = () =>
			sim.dispatch({
				type: 'load-vessel',
				design: probe(),
				placement: { kind: 'surface', longitude: 0.05 }
			});
		expect(far().ok).toBe(false); // the frame is busy with the pad vessel
		run(sim, 4);
		expect(far().ok).toBe(true);
	});

	test('an uncontrolled vessel is never put on surface rails (it is debris, ADR 0021)', async () => {
		const sim = await newSim();
		const tank = sim.dispatch({
			type: 'load-vessel',
			design: stack('Tank', ['stock.tank-small'], [])
		});
		if (!tank.ok) throw new Error(tank.reason);
		run(sim, 5);
		expect(sim.snapshot().vessels.map((v) => v.mode)).toEqual(['flight']);
	});
});

describe('on surface rails', () => {
	test('over 1e5 s of warp the vessel turns with the planet: body-fixed position and attitude do not move', async () => {
		const { sim } = await padSim();
		run(sim, 4);
		const before = vesselOf(sim);
		const fixed0 = bodyFixed(sim, before);
		const q0 = qMulBody(sim, before);
		expect(sim.dispatch({ type: 'warp', factor: 1_000 }).ok).toBe(true);
		sim.step(100); // 1e5 s of simulated time, about 4.6 turns of the planet
		expect(sim.time).toBeGreaterThan(1e5);
		const after = vesselOf(sim);
		expect(after.mode).toBe('on-rails');
		// Inertially it moved by thousands of kilometres...
		expect(length(sub(after.position, before.position))).toBeGreaterThan(100_000);
		// ... on the planet it did not move at all.
		expect(length(sub(bodyFixed(sim, after), fixed0))).toBeLessThan(1e-6);
		const q1 = qMulBody(sim, after);
		for (const k of ['x', 'y', 'z', 'w'] as const)
			expect(Math.abs(q1[k] - q0[k])).toBeLessThan(1e-9);
		expect(length(groundRelativeVelocity(after))).toBeLessThan(1e-6);
		expect(altitude(after.position)).toBeCloseTo(altitude(before.position), 6);
		// Parts follow the root.
		for (const [i, p] of after.parts.entries()) {
			expect(length(p.position)).toBeCloseTo(length(before.parts[i]!.position), 6);
		}
	});

	test('part temperatures keep cooling on surface rails (plan 014 hook, no heat handling needed)', async () => {
		const { sim } = await padSim();
		run(sim, 4);
		expect(sim.dispatch({ type: 'warp', factor: 100 }).ok).toBe(true);
		sim.step(30);
		for (const p of vesselOf(sim).parts) expect(p.temperature).toBeCloseTo(288.15, 6);
	});
});

/** Orientation of the root relative to the body-fixed frame. */
function qMulBody(sim: TestSim, v: VesselSnapshot): Quat {
	const b = conj(sim.snapshot().bodies.find((b) => b.id === sim.home)!.rotation);
	const o = v.orientation;
	return {
		x: b.w * o.x + b.x * o.w + b.y * o.z - b.z * o.y,
		y: b.w * o.y - b.x * o.z + b.y * o.w + b.z * o.x,
		z: b.w * o.z + b.x * o.y - b.y * o.x + b.z * o.w,
		w: b.w * o.w - b.x * o.x - b.y * o.y - b.z * o.z
	};
}

describe('waking up', () => {
	test.each([
		['throttle', (id: number) => ({ type: 'throttle', vessel: id, value: 0.01 })],
		['attitude', (id: number) => ({ type: 'attitude', vessel: id, pitch: 0.01, yaw: 0, roll: 0 })],
		['stage', (id: number) => ({ type: 'stage', vessel: id })]
	] as const)('%s wakes it into flight at warp 1, with that reason', async (reason, command) => {
		const { sim, id } = await padSim();
		run(sim, 4);
		const modes: string[] = [];
		sim.events.on('vessel:mode-changed', (e) => modes.push(`${e.mode}:${e.reason}`));
		const r = sim.dispatch(command(id));
		expect(r.ok).toBe(true);
		expect(vesselOf(sim).mode).toBe('flight');
		expect(vesselOf(sim).surface).toBeUndefined();
		expect(modes).toEqual([`flight:${reason}`]);
	});

	test('an action wakes it too', async () => {
		const { sim, id } = await padSim();
		run(sim, 4);
		const wheel = vesselOf(sim).parts[1]!.id;
		const r = sim.dispatch({
			type: 'action',
			vessel: id,
			part: wheel,
			module: 'stock.reaction-wheel',
			action: 'setEnabled',
			args: [true]
		});
		expect(r.ok).toBe(true);
		expect(vesselOf(sim).mode).toBe('flight');
	});

	test('throttle during rails warp drops to physics warp and wakes the vessel (plan 206)', async () => {
		const { sim, id } = await padSim();
		run(sim, 4);
		expect(sim.dispatch({ type: 'warp', factor: 50 })).toMatchObject({ ok: true, granted: 50 });
		const r = sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		expect(r.ok).toBe(true);
		expect(sim.warp).toBe(10);
		expect(vesselOf(sim).mode).toBe('flight');
	});

	test('after a long warp it wakes without a jump or a fall: no damage, bounded motion, back on rails 2 s later', async () => {
		const { sim, id } = await padSim();
		const hurt: unknown[] = [];
		sim.events.on('part:damaged', (e) => hurt.push(e));
		run(sim, 4);
		sim.dispatch({ type: 'warp', factor: 1_000 });
		sim.step(77); // 77 000 s: not a whole number of turns
		sim.dispatch({ type: 'warp', factor: 1 });
		const railsPose = vesselOf(sim);
		const fixed0 = bodyFixed(sim, railsPose);
		// Throttle with no engine lit applies no force: the vessel just wakes up.
		expect(sim.dispatch({ type: 'throttle', vessel: id, value: 0.01 }).ok).toBe(true);
		const awake = vesselOf(sim);
		expect(awake.mode).toBe('flight');
		expect(length(sub(awake.position, railsPose.position))).toBeLessThan(1e-3); // no pop
		expect(length(sub(awake.velocity, railsPose.velocity))).toBeLessThan(1e-6);
		let worstMove = 0;
		let worstSpeed = 0;
		for (let i = 0; i < 400; i++) {
			// 8 s
			sim.step(0.02);
			if (i % 10 === 0) {
				const v = vesselOf(sim);
				worstMove = Math.max(worstMove, length(sub(bodyFixed(sim, v), fixed0)));
				worstSpeed = Math.max(worstSpeed, length(groundRelativeVelocity(v)));
			}
		}
		console.log(
			`wake: max displacement on the ground ${worstMove.toExponential(2)} m, max ground speed ${worstSpeed.toExponential(2)} m/s`
		);
		expect(worstMove).toBeLessThan(0.02);
		expect(worstSpeed).toBeLessThan(0.1);
		expect(hurt).toEqual([]);
		expect(vesselOf(sim).mode).toBe('on-rails'); // rested 2 s again
		expect(vesselOf(sim).surface).toBe(true);
	});

	test('after a warp, throttle + stage launch the scripted ascent to the plan 007 orbit', async () => {
		const { sim, id } = await padSim();
		run(sim, 4);
		sim.dispatch({ type: 'warp', factor: 1_000 });
		sim.step(25); // 25 000 s on the pad
		sim.dispatch({ type: 'warp', factor: 1 });
		const launched = sim.time;
		const ascent = createAscent(sim, id);
		while (sim.time - launched < 1_200 && ascent.phase !== 'done') {
			sim.step(0.02);
			ascent.update();
		}
		expect(ascent.phase).toBe('done');
		run(sim, 4);
		const v = vesselOf(sim);
		const orbit = v.orbit!;
		const periapsis = orbit.a * (1 - orbit.e) - 600_000;
		const apoapsis = orbit.a * (1 + orbit.e) - 600_000;
		console.log(
			`ascent after warp: apoapsis ${(apoapsis / 1000).toFixed(2)} km, periapsis ${(periapsis / 1000).toFixed(2)} km, e ${orbit.e.toFixed(4)}, ${(sim.time - launched).toFixed(1)} s after wake`
		);
		expect(periapsis).toBeGreaterThan(70_000);
		expect(orbit.e).toBeLessThan(0.1);
		expect(v.mode).toBe('on-rails');
		expect(v.surface).toBeUndefined();
		expect(v.parts).toHaveLength(4);
	});
});

describe('a lander', () => {
	test('goes on surface rails after touchdown, warps, and its legs and attitude survive', async () => {
		const sim = await newSim();
		const hurt: unknown[] = [];
		sim.events.on('part:damaged', (e) => hurt.push(e));
		const placed = sim.dispatch({
			type: 'load-vessel',
			design: orbitLander(),
			placement: { kind: 'state', ...orbitState(sim, 100_000) }
		});
		if (!placed.ok) throw new Error(placed.reason);
		const id = placed.vessel!;
		sim.dispatch({ type: 'stage', vessel: id });
		const landing = createLanding(sim, id, { ...defaultLanding, rootToFoot: ORBIT_LANDER_ROOT_TO_FOOT });
		while (sim.time < 3_000 && landing.phase !== 'done') {
			sim.step(0.02);
			landing.update();
		}
		expect(landing.phase).toBe('done');
		run(sim, 5);
		const v = vesselOf(sim);
		expect(v.mode).toBe('on-rails');
		expect(v.surface).toBe(true);
		expect(hurt).toEqual([]);
		const fixed0 = bodyFixed(sim, v);
		expect(sim.dispatch({ type: 'warp', factor: 1_000 }).ok).toBe(true);
		sim.step(50); // 50 000 s
		const after = vesselOf(sim);
		expect(after.mode).toBe('on-rails');
		expect(length(sub(bodyFixed(sim, after), fixed0))).toBeLessThan(1e-6);
		// the root stands its root-to-foot height over the ground (the orbit lander, plan 380)
		expect(altitude(after.position)).toBeGreaterThan(ORBIT_LANDER_ROOT_TO_FOOT - 0.8);
		expect(altitude(after.position)).toBeLessThan(ORBIT_LANDER_ROOT_TO_FOOT + 0.7);
		expect(after.parts).toHaveLength(7);
	}, 60_000);
});

describe('determinism', () => {
	async function scenario() {
		const { sim, id } = await padSim();
		run(sim, 4);
		sim.dispatch({ type: 'warp', factor: 777 });
		sim.step(30);
		sim.dispatch({ type: 'warp', factor: 1 });
		sim.dispatch({ type: 'throttle', vessel: id, value: 0.01 });
		run(sim, 6);
		return sim;
	}

	test('two runs of pad, rails, warp, wake, rails give byte-identical snapshots and world', async () => {
		const a = await scenario();
		const b = await scenario();
		expect(vesselOf(a).surface).toBe(true);
		expect(JSON.stringify(b.snapshot())).toBe(JSON.stringify(a.snapshot()));
		expect(JSON.stringify(b.world.serialize())).toBe(JSON.stringify(a.world.serialize()));
	});
});
