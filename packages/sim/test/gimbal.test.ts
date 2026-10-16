/** Plan 033 / ADR 0045: thrust vector control. The torque must be the one a hand calculation gives. */
import { describe, expect, test } from 'bun:test';
import { partId, type Quat, type VesselDesign, type VesselSnapshot } from '@orbital/core';
import type { Sim } from '../src/index.ts';
import { THRUST, newTestSim } from './helpers/test-mod.ts';
import { partMasses } from './helpers/measure.ts';
import { saturn, stack } from './helpers/vessels.ts';
import { UP_Y, rotate } from './helpers/attitude.ts';
import { cross, dot, normalize } from '@orbital/kepler';

const TILT = (3 * Math.PI) / 180;
const RATE = (20 * Math.PI) / 180;

/** Pod, two tanks, engine: no wheel, so the engine is the only actuator. */
const rocket = (engine = 'stock.engine-lv'): VesselDesign =>
	stack(
		'Gimbal test',
		['stock.command-pod', 'stock.tank-small', 'stock.tank-small', engine],
		[[3]]
	);

const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };

/** Rotation angle of `q` (relative to the identity) about the given axis component, rad. */
const angleAbout = (q: Quat, axis: 'x' | 'y' | 'z'): number => 2 * Math.atan2(q[axis], q.w);

/** A rocket at rest 200 km up (no air), nose along +Y, and the sim with its vessel. */
async function launch(engine?: string) {
	const sim = await newTestSim();
	const res = sim.dispatch({
		type: 'load-vessel',
		design: rocket(engine),
		placement: {
			kind: 'state',
			position: { x: 800_000, y: 0, z: 0 },
			velocity: { x: 0, y: 0, z: 0 },
			orientation: IDENTITY
		}
	});
	if (!res.ok) throw new Error(res.reason);
	return { sim, id: res.vessel! };
}

/** Centre of mass (y) and transverse moment of inertia from the snapshot and the part shapes. */
function bodyProperties(sim: Sim, v: VesselSnapshot) {
	const masses = partMasses(sim, v);
	const total = masses.reduce((a, b) => a + b, 0);
	const ys = v.parts.map((p) => p.position.y);
	const cy = ys.reduce((a, y, i) => a + y * masses[i]!, 0) / total;
	let inertia = 0;
	v.parts.forEach((p, i) => {
		const s = sim.registries.parts.get(p.definition)!.shape!;
		if (s.kind !== 'cylinder') throw new Error('test expects cylinders');
		inertia += (masses[i]! * (3 * s.radius ** 2 + s.height ** 2)) / 12;
		inertia += masses[i]! * (ys[i]! - cy) ** 2;
	});
	return { cy, inertia, engineY: v.parts[3]!.position.y };
}

/**
 * The sim steps at 20 ms and the angle written at the start of a step acts over that step, so the
 * ramp leads the continuous one by half a step.
 */
const LEAD = 0.01;

/** Angle after `t` s when the torque ramps linearly to `alpha` over `tau` then stays: closed form. */
const rampedAngle = (alpha: number, tau: number, t: number): number =>
	t <= tau
		? (alpha * t ** 3) / (6 * tau)
		: (alpha * tau ** 2) / 6 + ((alpha * tau) / 2) * (t - tau) + (alpha * (t - tau) ** 2) / 2;

async function fly(
	axis: 'pitch' | 'yaw',
	demand: number,
	seconds: number,
	engine?: string,
	throttle = 0.2
) {
	const { sim, id } = await launch(engine);
	sim.dispatch({ type: 'throttle', vessel: id, value: throttle });
	sim.dispatch({ type: 'stage', vessel: id });
	sim.dispatch({
		type: 'attitude',
		vessel: id,
		pitch: axis === 'pitch' ? demand : 0,
		yaw: axis === 'yaw' ? demand : 0,
		roll: 0
	});
	const start = sim.snapshot().vessels[0]!;
	const props = bodyProperties(sim, start);
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
	const end = sim.snapshot().vessels[0]!;
	// Propellant leaves during the run: the hand calculation uses the mean of both ends.
	const after = bodyProperties(sim, end);
	const mean = {
		cy: (props.cy + after.cy) / 2,
		inertia: (props.inertia + after.inertia) / 2,
		engineY: (props.engineY + after.engineY) / 2
	};
	return { sim, id, start, end, props: mean };
}

describe('gimbal (ADR 0045)', () => {
	test('full pitch demand turns the rocket as T sin(range) * arm / I says, to 2 %', async () => {
		const { sim, end, props } = await fly('pitch', 1, 1);
		const throttle = 0.2;
		const alpha = (throttle * THRUST * Math.sin(TILT) * (props.cy - props.engineY)) / props.inertia;
		const expected = rampedAngle(alpha, TILT / RATE, 1 + LEAD);
		const got = angleAbout(end.orientation, 'x');
		console.log(
			`pitch: alpha ${alpha.toFixed(5)} rad/s2, expected ${expected.toFixed(5)}, got ${got.toFixed(5)}`
		);
		expect(Math.abs(got - expected) / expected).toBeLessThan(0.02);
		sim.dispose();
	});

	test('yaw demand turns it about Z by the same hand number; the wrong sign turns it back', async () => {
		const { sim, end, props } = await fly('yaw', 1, 1);
		const alpha = (0.2 * THRUST * Math.sin(TILT) * (props.cy - props.engineY)) / props.inertia;
		const expected = rampedAngle(alpha, TILT / RATE, 1 + LEAD);
		expect(Math.abs(angleAbout(end.orientation, 'z') - expected) / expected).toBeLessThan(0.02);
		sim.dispose();
		const back = await fly('pitch', -1, 1);
		expect(angleAbout(back.end.orientation, 'x')).toBeLessThan(0);
		back.sim.dispose();
	});

	test('half the demand uses half the range: half the torque', async () => {
		const full = await fly('pitch', 1, 2);
		const half = await fly('pitch', 0.5, 2);
		// Same ramp shape scaled, so the angle ratio is the demand ratio (the ramp is shorter).
		const ratio = angleAbout(half.end.orientation, 'x') / angleAbout(full.end.orientation, 'x');
		expect(ratio).toBeGreaterThan(0.48);
		expect(ratio).toBeLessThan(0.52);
		full.sim.dispose();
		half.sim.dispose();
	});

	test('no demand: no side force and the gimbal stays on the axis; no gimbal: the demand does nothing', async () => {
		const idle = await fly('pitch', 0, 1);
		expect(Math.abs(angleAbout(idle.end.orientation, 'x'))).toBeLessThan(1e-9);
		expect(Math.abs(angleAbout(idle.end.orientation, 'z'))).toBeLessThan(1e-9);
		const gimbal = idle.end.parts[3]!.modules['stock.engine'] as { gimbal: number[] };
		expect(gimbal.gimbal).toEqual([0, 0]);
		idle.sim.dispose();
		const fixed = await fly('pitch', 1, 1, 'test.engine-fixed');
		expect(Math.abs(angleAbout(fixed.end.orientation, 'x'))).toBeLessThan(1e-9);
		fixed.sim.dispose();
	});

	test('the angle slews at the configured rate and holds the range', async () => {
		const { sim, id } = await launch();
		sim.dispatch({ type: 'throttle', vessel: id, value: 0.2 });
		sim.dispatch({ type: 'stage', vessel: id });
		sim.dispatch({ type: 'attitude', vessel: id, pitch: 1, yaw: 0, roll: 0 });
		const read = () =>
			(sim.snapshot().vessels[0]!.parts[3]!.modules['stock.engine'] as { gimbal: number[] })
				.gimbal[1]!;
		for (let i = 0; i < 5; i++) sim.step(0.02);
		expect(Math.abs(read())).toBeCloseTo(5 * 0.02 * RATE, 6);
		for (let i = 0; i < 50; i++) sim.step(0.02);
		expect(Math.abs(read())).toBeCloseTo(TILT, 9);
		sim.dispatch({ type: 'attitude', vessel: id, pitch: 0, yaw: 0, roll: 0 });
		for (let i = 0; i < 50; i++) sim.step(0.02);
		expect(read()).toBe(0);
		sim.dispose();
	});

	test('two identical flights give identical snapshots (determinism)', async () => {
		const a = await fly('pitch', 0.7, 2);
		const b = await fly('pitch', 0.7, 2);
		expect(JSON.stringify(a.sim.snapshot())).toEqual(JSON.stringify(b.sim.snapshot()));
		a.sim.dispose();
		b.sim.dispose();
	});
});

/** The same vessel with every `stock.engine-lv` swapped for the engine without gimbal. */
const withoutGimbal = (design: VesselDesign): VesselDesign => ({
	...design,
	parts: design.parts.map((p) =>
		p.part === 'stock.engine-lv' ? { ...p, part: partId('test.engine-fixed') } : p
	)
});

describe('authority at high dynamic pressure (journal 026)', () => {
	const OMEGA = (2 * Math.PI) / 21_600;
	/** Largest angle the nose swings from its start in 3 s of full pitch demand, 8 km up at 400 m/s, no initial angle of attack. */
	async function swing(design: VesselDesign): Promise<number> {
		const sim = await newTestSim();
		const r = 600_000 + 8_000;
		const heading = { x: 1, y: 0, z: 0 };
		const axis = normalize(cross(UP_Y, heading));
		const half = Math.acos(dot(UP_Y, heading)) / 2;
		const loaded = sim.dispatch({
			type: 'load-vessel',
			design,
			placement: {
				kind: 'state',
				position: { x: r, y: 0, z: 0 },
				// Air velocity along the nose: the planet's turning carries the air at omega x r.
				velocity: { x: 400, y: 0, z: -OMEGA * r },
				orientation: {
					x: axis.x * Math.sin(half),
					y: axis.y * Math.sin(half),
					z: axis.z * Math.sin(half),
					w: Math.cos(half)
				}
			}
		});
		if (!loaded.ok) throw new Error(loaded.reason);
		const id = loaded.vessel!;
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		sim.dispatch({ type: 'stage', vessel: id });
		sim.dispatch({ type: 'attitude', vessel: id, pitch: 1, yaw: 0, roll: 0 });
		let peak = 0;
		for (let i = 0; i < 150; i++) {
			sim.step(0.02);
			const nose = rotate(sim.snapshot().vessels[0]!.orientation, UP_Y);
			peak = Math.max(peak, (Math.acos(Math.min(1, dot(nose, heading))) * 180) / Math.PI);
		}
		sim.dispose();
		return peak;
	}

	test('with one wheel the gimbal swings the finned 25 t rocket at least 4 times as far as the wheel alone, and further than three wheels', async () => {
		const gimbal = await swing(saturn(1));
		const wheel = await swing(withoutGimbal(saturn(1)));
		const three = await swing(withoutGimbal(saturn(3)));
		console.log(
			`peak swing in 3 s: one wheel ${wheel.toFixed(1)} deg, three wheels ${three.toFixed(1)}, one wheel + gimbal ${gimbal.toFixed(1)}`
		);
		expect(gimbal).toBeGreaterThan(4 * wheel);
		expect(gimbal).toBeGreaterThan(1.5 * three);
	}, 60_000);
});
