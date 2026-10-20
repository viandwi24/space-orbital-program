/** Plan 011 / ADR 0018: one rigid body per vessel (compound shape), rebuilt on every split. */
import { describe, expect, test } from 'bun:test';
import {
	partId,
	type BodyDesc,
	type BodyHandle,
	type PhysicsBackend,
	type Quat,
	type Vec3,
	type VesselDesign,
	type VesselSnapshot
} from '@orbital/core';
import { createRapierBackend } from '@orbital/physics';
import Stock from '@orbital/mod-stock';
import { definePart, definePlugin } from '@orbital/sdk';
import { add, cross, length, scale, sub } from '@orbital/kepler';
import { createSim, type Sim, type SimOptions } from '../src/index.ts';
import { diagonalise } from '../src/mass.ts';
import { partMassCentres, partMasses } from './helpers/measure.ts';
import { tower, twoStage } from './helpers/vessels.ts';
import { CYLINDER_SQUARES } from '../src/parts.ts';

interface Recorded {
	desc: BodyDesc;
	mass: number;
	inertia: Vec3;
	centerOfMass: Vec3;
	inertiaFrame: Quat;
}

/** A real Rapier backend that records every body, joint and mass update the sim performs. */
async function recording(): Promise<{
	backend: PhysicsBackend;
	live: Map<number, Recorded>;
	created: number[];
	joints: { count: number };
	massCalls: Array<{ handle: number; mass: number; inertia?: Vec3; com?: Vec3 }>;
}> {
	const real = await createRapierBackend({ solverIterations: 16 });
	const live = new Map<number, Recorded>();
	const created: number[] = [];
	const joints = { count: 0 };
	const massCalls: Array<{ handle: number; mass: number; inertia?: Vec3; com?: Vec3 }> = [];
	const ZERO = { x: 0, y: 0, z: 0 };
	const ID = { x: 0, y: 0, z: 0, w: 1 };
	const backend: PhysicsBackend = {
		...real,
		createBody(desc) {
			const h = real.createBody(desc);
			created.push(h);
			live.set(h, {
				desc,
				mass: desc.mass,
				inertia: desc.inertia!,
				centerOfMass: desc.centerOfMass ?? ZERO,
				inertiaFrame: desc.inertiaFrame ?? ID
			});
			return h;
		},
		removeBody(h) {
			live.delete(h);
			real.removeBody(h);
		},
		createFixedJoint(...args) {
			joints.count++;
			return real.createFixedJoint(...args);
		},
		setMass(h, mass, inertia, placement) {
			const r = live.get(h)!;
			r.mass = mass;
			if (inertia) r.inertia = inertia;
			r.centerOfMass = placement?.centerOfMass ?? ZERO;
			r.inertiaFrame = placement?.inertiaFrame ?? ID;
			massCalls.push({ handle: h, mass, inertia, com: placement?.centerOfMass });
			real.setMass(h, mass, inertia, placement);
		}
	};
	return { backend, live, created, joints, massCalls };
}

async function simWith(
	backend: PhysicsBackend,
	plugins: SimOptions['plugins'] = [Stock]
): Promise<Sim> {
	return createSim({
		plugins,
		backendFactory: () => backend,
		seed: 1,
		maxFlightFrames: 1
	});
}

const rot = (q: Quat, v: Vec3): Vec3 => {
	const u = { x: q.x, y: q.y, z: q.z };
	const t = scale(cross(u, v), 2);
	return add(add(v, scale(t, q.w)), cross(u, t));
};
const conj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** Free fall from 60 km: stays in flight mode (periapsis inside the atmosphere). */
const FALL = { x: 600_000 + 60_000, y: 0, z: 0 };

function load(sim: Sim, design: VesselDesign, velocity: Vec3 = { x: 0, y: 0, z: -300 }) {
	const r = sim.dispatch({
		type: 'load-vessel',
		design,
		placement: { kind: 'state', position: FALL, velocity }
	});
	if (!r.ok) throw new Error(r.reason);
	return r.vessel!;
}

describe('bodies (ADR 0018)', () => {
	test('a 100-part stack is one body and no joints; a split makes two', async () => {
		const rec = await recording();
		const sim = await simWith(rec.backend);
		const id = load(sim, tower(100, 50));
		expect(rec.live.size).toBe(1);
		expect(rec.joints.count).toBe(0);
		const shapes = [...rec.live.values()][0]!.desc.shape;
		// every part of the tower is a cylinder: `CYLINDER_SQUARES` boxes each (plan 264)
		expect(shapes.type === 'compound' && shapes.shapes.length).toBe(100 * CYLINDER_SQUARES);
		sim.dispatch({ type: 'stage', vessel: id }); // engine
		sim.step(0.02);
		expect(rec.live.size).toBe(1);
		sim.dispatch({ type: 'stage', vessel: id }); // decoupler: splits in two
		expect(rec.live.size).toBe(2);
		expect(rec.joints.count).toBe(0);
		const halves = sim.snapshot().vessels.map((v) => v.parts.length);
		expect(halves.sort((a, b) => a - b)).toEqual([50, 50]);
		sim.dispose();
	});

	test('the two-stage vessel is one body, two after its decoupler fires', async () => {
		const rec = await recording();
		const sim = await simWith(rec.backend);
		const id = load(sim, twoStage());
		expect(rec.live.size).toBe(1);
		sim.dispatch({ type: 'stage', vessel: id });
		sim.dispatch({ type: 'stage', vessel: id });
		expect(rec.live.size).toBe(2);
		expect(rec.joints.count).toBe(0);
		sim.dispose();
	});
});

/**
 * Mass, centre of mass, linear momentum and angular momentum (about the total centre of mass, in
 * the frame moving with it, so the huge orbital momentum does not drown the spin) of all live bodies.
 */
function totals(rec: Awaited<ReturnType<typeof recording>>, frameOrigin: Vec3) {
	const bodies = [...rec.live].map(([h, r]) => {
		const t = rec.backend.getTransform(h as BodyHandle);
		const v = rec.backend.getVelocity(h as BodyHandle);
		return { r, t, v, centre: add(frameOrigin, add(t.position, rot(t.rotation, r.centerOfMass))) };
	});
	const mass = bodies.reduce((s, b) => s + b.r.mass, 0);
	const com = scale(
		bodies.reduce((s, b) => add(s, scale(b.centre, b.r.mass)), { x: 0, y: 0, z: 0 }),
		1 / mass
	);
	const p = bodies.reduce((s, b) => add(s, scale(b.v.linear, b.r.mass)), { x: 0, y: 0, z: 0 });
	const v0 = scale(p, 1 / mass);
	let l: Vec3 = { x: 0, y: 0, z: 0 };
	for (const { r, t, v, centre } of bodies) {
		// World-frame spin angular momentum: R F diag(I) Fᵀ Rᵀ ω.
		const principal = rot(conj(r.inertiaFrame), rot(conj(t.rotation), v.angular));
		const spin = rot(
			t.rotation,
			rot(r.inertiaFrame, {
				x: r.inertia.x * principal.x,
				y: r.inertia.y * principal.y,
				z: r.inertia.z * principal.z
			})
		);
		l = add(l, add(spin, scale(cross(sub(centre, com), sub(v.linear, v0)), r.mass)));
	}
	return { mass, com, p, l };
}

describe('split continuity', () => {
	test('a spinning, moving two-stage vessel keeps mass, momentum, angular momentum and COM through its split', async () => {
		const rec = await recording();
		const sim = await simWith(rec.backend);
		const id = load(sim, twoStage());
		sim.dispatch({ type: 'stage', vessel: id });
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		for (let i = 0; i < 300; i++) {
			// Swing the stack with the reaction wheel (bending torque and thrust off the COM).
			sim.dispatch({ type: 'attitude', vessel: id, pitch: 1, yaw: 0.4, roll: 0.2 });
			sim.step(0.02);
		}
		const before = sim.snapshot().vessels[0]!;
		// Recorded poses are frame-local; the frame origin is what turns them into the snapshot's BCI.
		const origin = sub(comOf(sim, before), totals(rec, { x: 0, y: 0, z: 0 }).com);
		const b = totals(rec, origin);
		expect(length(b.l)).toBeGreaterThan(1); // it does spin
		sim.dispatch({ type: 'stage', vessel: id }); // decoupler fires (engine already lit)
		const after = sim.snapshot().vessels;
		expect(after).toHaveLength(2);
		const a = totals(rec, origin);

		// The body mass lags the parts by one step of burn (about 1.5 kg of 12 900).
		expect(Math.abs(a.mass - b.mass) / b.mass).toBeLessThan(1e-3);
		expect(length(sub(a.com, b.com))).toBeLessThan(0.05);
		expect(length(sub(a.p, b.p)) / length(b.p)).toBeLessThan(1e-3);
		expect(length(sub(a.l, b.l)) / length(b.l)).toBeLessThan(1e-3);

		// Each half's body mass is the sum of its part masses.
		const bodyMasses = [...rec.live.values()].map((r) => r.mass).sort((x, y) => x - y);
		const partSums = after
			.map((v) => partMasses(sim, v).reduce((s, m) => s + m, 0))
			.sort((x, y) => x - y);
		bodyMasses.forEach((m, i) => expect(Math.abs(m - partSums[i]!)).toBeLessThan(3));
		sim.dispose();
	});
});

/** Centre of mass (BCI) from a snapshot, with part masses. */
function comOf(sim: Sim, v: VesselSnapshot): Vec3 {
	const masses = partMasses(sim, v);
	const total = masses.reduce((s, m) => s + m, 0);
	const centres = partMassCentres(sim, v);
	let c: Vec3 = { x: 0, y: 0, z: 0 };
	centres.forEach((p, i) => (c = add(c, scale(add(v.position, p), masses[i]! / total))));
	return c;
}

/** A 1 m box of 1000 kg hung 0.4 m off the stack axis: the inertia tensor has an off-diagonal term. */
const Offset = definePlugin({
	meta: { id: 'test-offset', version: '1.0.0', api: '^0.1' },
	depends: [Stock],
	setup(ctx) {
		ctx.parts.register(
			definePart({
				id: 'test-offset.block',
				title: 'Offset block',
				mass: 1000,
				shape: { kind: 'box', size: [1, 1, 1] },
				attach: {
					top: { pos: [0.4, 0.5, 0], dir: [0, 1, 0] },
					bottom: { pos: [0, -0.5, 0], dir: [0, -1, 0] }
				}
			})
		);
	}
});

describe('inertia', () => {
	test('the pushed inertia tensor matches the analytic one (parallel axis) for an off-axis part', async () => {
		const rec = await recording();
		const sim = await simWith(rec.backend, [Stock, Offset]);
		const design: VesselDesign = {
			formatVersion: 1,
			name: 'Offset',
			parts: [
				{ index: 0, part: partId('stock.command-pod'), parent: null },
				{
					index: 1,
					part: partId('test-offset.block'),
					parent: { index: 0, parentNode: 'bottom', node: 'top' }
				}
			],
			stages: []
		};
		const id = load(sim, design);
		const v = sim.snapshot().vessels.find((s) => s.id === id)!;
		const masses = partMasses(sim, v);
		const pos = partMassCentres(sim, v).map((p) => rot(conj(v.orientation), p)); // mass centres, body axes, root at 0
		expect(pos[1]!.x).toBeCloseTo(-0.4, 9); // hung off the axis as designed (the block has no offset)
		const M = masses[0]! + masses[1]!;
		const com = scale(add(scale(pos[0]!, masses[0]!), scale(pos[1]!, masses[1]!)), 1 / M);
		// Own inertia: pod is a cylinder r 0.625 h 1; block a cube of side 1.
		const own = [
			{ x: (masses[0]! * (3 * 0.625 ** 2 + 1)) / 12, y: 0.5 * masses[0]! * 0.625 ** 2, z: 0 },
			{ x: masses[1]! / 6, y: masses[1]! / 6, z: masses[1]! / 6 }
		];
		own[0]!.z = own[0]!.x;
		const T = [0, 0, 0, 0, 0, 0, 0, 0, 0];
		pos.forEach((p, i) => {
			const r = sub(p, com);
			const m = masses[i]!;
			const r2 = dot(r, r);
			T[0]! += own[i]!.x + m * (r2 - r.x * r.x);
			T[4]! += own[i]!.y + m * (r2 - r.y * r.y);
			T[8]! += own[i]!.z + m * (r2 - r.z * r.z);
			T[1]! -= m * r.x * r.y;
			T[2]! -= m * r.x * r.z;
			T[5]! -= m * r.y * r.z;
		});
		expect(Math.abs(T[1]!)).toBeGreaterThan(1); // really off-diagonal
		// Tensor from what the sim handed to the backend: F diag(I) Fᵀ.
		const r = [...rec.live.values()][0]!;
		const axes = [
			{ x: 1, y: 0, z: 0 },
			{ x: 0, y: 1, z: 0 },
			{ x: 0, y: 0, z: 1 }
		].map((e) => rot(r.inertiaFrame, e));
		const pushed = [0, 0, 0, 0, 0, 0, 0, 0, 0];
		const principal = [r.inertia.x, r.inertia.y, r.inertia.z];
		axes.forEach((a, k) => {
			const c = [a.x, a.y, a.z];
			for (let i = 0; i < 3; i++)
				for (let j = 0; j < 3; j++) pushed[i * 3 + j]! += principal[k]! * c[i]! * c[j]!;
		});
		const scaleT = Math.max(T[0]!, T[4]!, T[8]!);
		const full = [T[0]!, T[1]!, T[2]!, T[1]!, T[4]!, T[5]!, T[2]!, T[5]!, T[8]!];
		for (let i = 0; i < 9; i++) expect(Math.abs(pushed[i]! - full[i]!) / scaleT).toBeLessThan(1e-6);
		// Centre of mass handed to the backend is where the masses put it.
		expect(length(sub(r.centerOfMass, com))).toBeLessThan(1e-9);
		sim.dispose();
	});

	test('the centre of mass handed to the backend follows the propellant', async () => {
		const rec = await recording();
		const sim = await simWith(rec.backend);
		const id = load(sim, twoStage());
		const initial = [...rec.live.values()][0]!.centerOfMass.y;
		sim.dispatch({ type: 'stage', vessel: id });
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		for (let i = 0; i < 1500; i++) sim.step(0.02);
		const v = sim.snapshot().vessels[0]!;
		const handle = [...rec.live.keys()][0]!;
		const last = rec.massCalls.filter((c) => c.handle === handle).at(-1)!;
		// Burning the lower tank moves the centre of mass up the stack (towards the pod).
		expect(last.com!.y).toBeGreaterThan(initial);
		const masses = partMasses(sim, v);
		const total = masses.reduce((s, m) => s + m, 0);
		const centres = partMassCentres(sim, v);
		const y =
			centres.reduce((s, p, i) => s + masses[i]! * rot(conj(v.orientation), p).y, 0) / total;
		expect(Math.abs(last.com!.y - y)).toBeLessThan(0.01); // one step of burn behind
		sim.dispose();
	});

	test('diagonalise reconstructs random symmetric matrices', () => {
		let seed = 12345;
		const rnd = (): number =>
			((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296) * 2 - 1;
		for (let n = 0; n < 50; n++) {
			const a = rnd() * 100,
				b = rnd() * 100,
				c = rnd() * 100,
				d = rnd() * 10,
				e = rnd() * 10,
				f = rnd() * 10;
			const m = [a, d, e, d, b, f, e, f, c] as Parameters<typeof diagonalise>[0];
			const { values, vectors } = diagonalise(m);
			const lam = [values.x, values.y, values.z];
			for (let i = 0; i < 3; i++) {
				for (let j = 0; j < 3; j++) {
					let s = 0;
					for (let k = 0; k < 3; k++) s += vectors[i * 3 + k]! * lam[k]! * vectors[j * 3 + k]!;
					expect(Math.abs(s - m[i * 3 + j]!)).toBeLessThan(1e-9 * 100);
				}
			}
		}
	});
});

describe('rigidity', () => {
	test('a 100-part stack under thrust and wheel torque keeps its shape to 1e-4 m for 10 s', async () => {
		const sim = await simWith(await createRapierBackend({ solverIterations: 16 }));
		const design = tower(100);
		const id = load(sim, design);
		sim.dispatch({ type: 'stage', vessel: id });
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		const heights = (name: string): number =>
			({
				'stock.command-pod': 1,
				'stock.reaction-wheel': 0.4,
				'stock.tank-small': 2,
				'stock.engine-lv': 1.2
			})[name]!;
		const offsets = [0];
		for (let i = 1; i < 100; i++) {
			offsets.push(
				offsets[i - 1]! + (heights(design.parts[i - 1]!.part) + heights(design.parts[i]!.part)) / 2
			);
		}
		let worst = 0;
		for (let i = 0; i < 500; i++) {
			sim.dispatch({
				type: 'attitude',
				vessel: id,
				pitch: Math.sin(i * 0.04) > 0 ? 1 : -1,
				yaw: 0,
				roll: 0
			});
			sim.step(0.02);
			const v = sim.snapshot().vessels[0]!;
			const root = v.parts[0]!.position;
			v.parts.forEach((p, k) => {
				worst = Math.max(worst, Math.abs(length(sub(p.position, root)) - offsets[k]!));
			});
		}
		expect(worst).toBeLessThan(1e-4);
		sim.dispose();
	});
});

describe('determinism', () => {
	test('a 100-part tower with a mid-stack split gives byte-identical snapshots and worlds at t = 100 s', async () => {
		const run = async (): Promise<string> => {
			const sim = await simWith(await createRapierBackend({ solverIterations: 16 }));
			const id = load(sim, tower(100, 50));
			for (let i = 0; i < 5_000; i++) {
				if (i === 0) {
					sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
					sim.dispatch({ type: 'stage', vessel: id });
				}
				if (i === 500)
					sim.dispatch({ type: 'attitude', vessel: id, pitch: 0.3, yaw: -0.2, roll: 0.1 });
				if (i === 1_500) sim.dispatch({ type: 'stage', vessel: id }); // fires the decoupler
				if (i === 2_000) sim.dispatch({ type: 'attitude', vessel: id, pitch: 0, yaw: 0, roll: 0 });
				sim.step(0.02);
			}
			const out = JSON.stringify([sim.snapshot(), sim.world.serialize()]);
			sim.dispose();
			return out;
		};
		const a = await run();
		const b = await run();
		expect(a).toBe(b);
		expect(JSON.parse(a)[0].vessels).toHaveLength(2);
	}, 60_000); // two 100-part runs: near bun's 5 s default on a loaded CI runner
});
