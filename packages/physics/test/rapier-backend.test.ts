import { afterEach, describe, expect, test } from 'bun:test';
import type { PhysicsBackend, BodyDesc } from '@orbital/core';
import { createMockBackend, createRapierBackend } from '../src/index.ts';
import { ID, relative, transformDistance } from './helpers.ts';

const DT = 0.02;
const box: BodyDesc['shape'] = { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } };
const origin = { x: 0, y: 0, z: 0 };

const live: PhysicsBackend[] = [];
async function rapier(): Promise<PhysicsBackend> {
	const b = await createRapierBackend();
	live.push(b);
	return b;
}
afterEach(() => {
	for (const b of live.splice(0)) b.dispose();
});

describe('rapier backend: plan 004 acceptance tests', () => {
	// Rapier's integrator is first order: with a constant force its position deviates from ½at² by
	// exactly a·dt·t/8 (2.5e-2 at dt = 0.02, t = 2). Measured in docs/research/rapier.md; the
	// criterion was corrected by the human to compare against the discrete solution.
	test('free fall under constant force matches ½at² + a·dt·t/8 and v = at within 1e-3 (2 s, dt 0.02)', async () => {
		const world = await rapier();
		const mass = 2;
		const force = 10;
		const a = force / mass;
		const h = world.createBody({ shape: box, mass, position: origin, rotation: ID });
		const steps = 100;
		for (let i = 0; i < steps; i++) {
			world.applyForce(h, { x: force, y: 0, z: 0 });
			world.step(DT);
		}
		const t = steps * DT;
		const x = world.getTransform(h).position.x;
		expect(Math.abs(x - (0.5 * a * t * t + (a * DT * t) / 8))).toBeLessThan(1e-3);
		expect(Math.abs(world.getVelocity(h).linear.x - a * t)).toBeLessThan(1e-3);
		expect(world.getTransform(h).position.y).toBe(0);
	});

	test('fixed joint keeps the relative transform within 1e-4 after 200 steps under a force on one body', async () => {
		const world = await rapier();
		const a = world.createBody({ shape: box, mass: 1, position: origin, rotation: ID });
		const b = world.createBody({
			shape: box,
			mass: 1,
			position: { x: 1, y: 0, z: 0 },
			rotation: ID
		});
		world.createFixedJoint(
			a,
			b,
			{ position: { x: 0.5, y: 0, z: 0 }, rotation: ID },
			{ position: { x: -0.5, y: 0, z: 0 }, rotation: ID }
		);
		const before = relative(world.getTransform(a), world.getTransform(b));
		for (let i = 0; i < 200; i++) {
			world.applyForce(a, { x: 0.3, y: 0.2, z: 0.1 }, { x: 0, y: 0.5, z: 0 });
			world.step(DT);
		}
		const after = relative(world.getTransform(a), world.getTransform(b));
		expect(transformDistance(before, after)).toBeLessThan(1e-4);
		// The pair genuinely moved and spun, so the check is not vacuous.
		expect(world.getTransform(a).position.x).toBeGreaterThan(1);
		expect(Math.abs(world.getVelocity(a).angular.z)).toBeGreaterThan(0.1);
	});

	test('determinism: identical inputs on fresh backends give identical transforms', async () => {
		async function run(): Promise<string> {
			const world = await rapier();
			const a = world.createBody({ shape: box, mass: 1.5, position: origin, rotation: ID });
			const b = world.createBody({
				shape: { type: 'capsule', halfHeight: 1, radius: 0.3 },
				mass: 0.7,
				position: { x: 0, y: 1.5, z: 0 },
				rotation: ID,
				angularVelocity: { x: 0.1, y: 0.2, z: 0.3 }
			});
			world.createFixedJoint(
				a,
				b,
				{ position: { x: 0, y: 0.75, z: 0 }, rotation: ID },
				{ position: { x: 0, y: -0.75, z: 0 }, rotation: ID }
			);
			for (let i = 0; i < 300; i++) {
				world.applyForce(a, { x: 5, y: -1, z: 0.5 }, { x: 0.2, y: 0, z: 0 });
				world.applyTorque(b, { x: 0, y: 0.1, z: 0 });
				world.step(DT);
			}
			return JSON.stringify([
				world.getTransform(a),
				world.getTransform(b),
				world.getVelocity(a),
				world.getVelocity(b)
			]);
		}
		expect(await run()).toBe(await run());
	});
});

describe('rapier backend: extras', () => {
	test('forces and torques last one step only', async () => {
		const world = await rapier();
		const h = world.createBody({ shape: box, mass: 1, position: origin, rotation: ID });
		world.applyForce(h, { x: 10, y: 0, z: 0 });
		world.applyTorque(h, { x: 0, y: 0, z: 1 });
		world.step(DT);
		const v1 = world.getVelocity(h);
		world.step(DT);
		world.step(DT);
		const v3 = world.getVelocity(h);
		expect(v1.linear.x).toBeCloseTo(10 * DT, 5);
		expect(v3.linear.x).toBeCloseTo(v1.linear.x, 6);
		expect(v3.angular.z).toBeCloseTo(v1.angular.z, 6);
	});

	test('torque uses the derived inertia (box: m/3·(x²+y²) about z) and local-frame axes', async () => {
		const world = await rapier();
		const h = world.createBody({ shape: box, mass: 6, position: origin, rotation: ID });
		world.applyTorque(h, { x: 0, y: 0, z: 1 });
		world.step(DT);
		// I_z = 6/3 · (0.25 + 0.25) = 1 → ω = τ·dt / I
		expect(world.getVelocity(h).angular.z).toBeCloseTo(DT, 5);
	});

	test('explicit inertia and setMass are honoured', async () => {
		const world = await rapier();
		const h = world.createBody({
			shape: box,
			mass: 1,
			inertia: { x: 4, y: 4, z: 4 },
			position: origin,
			rotation: ID
		});
		world.applyTorque(h, { x: 0, y: 0, z: 1 });
		world.step(DT);
		expect(world.getVelocity(h).angular.z).toBeCloseTo(DT / 4, 5);
		world.setMass(h, 4, { x: 4, y: 4, z: 4 });
		world.setVelocity(h, { linear: origin, angular: origin });
		world.applyForce(h, { x: 8, y: 0, z: 0 });
		world.step(DT);
		expect(world.getVelocity(h).linear.x).toBeCloseTo(2 * DT, 5);
	});

	test('force at an offset point produces torque', async () => {
		const world = await rapier();
		const h = world.createBody({ shape: box, mass: 1, position: origin, rotation: ID });
		world.applyForce(h, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 });
		world.step(DT);
		expect(world.getVelocity(h).angular.y).toBeLessThan(0);
	});

	test('kinematic bodies follow their velocity; fixed bodies stay put', async () => {
		const world = await rapier();
		const k = world.createBody({
			kind: 'kinematic',
			shape: box,
			mass: 1,
			position: origin,
			rotation: ID,
			linearVelocity: { x: 5, y: 0, z: 0 }
		});
		const f = world.createBody({
			kind: 'fixed',
			shape: { type: 'sphere', radius: 1 },
			mass: 1,
			position: { x: 0, y: 10, z: 0 },
			rotation: ID
		});
		world.applyForce(f, { x: 100, y: 0, z: 0 });
		for (let i = 0; i < 50; i++) world.step(DT);
		expect(world.getTransform(k).position.x).toBeCloseTo(5, 4);
		expect(world.getTransform(f).position).toEqual({ x: 0, y: 10, z: 0 });
	});

	test('setTransform and setVelocity round-trip', async () => {
		const world = await rapier();
		const h = world.createBody({ shape: box, mass: 1, position: origin, rotation: ID });
		world.setTransform(h, {
			position: { x: 1, y: 2, z: 3 },
			rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }
		});
		world.setVelocity(h, { linear: { x: 1, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0.5 } });
		const t = world.getTransform(h);
		expect(t.position).toEqual({ x: 1, y: 2, z: 3 });
		expect(t.rotation.z).toBeCloseTo(Math.SQRT1_2, 6);
		expect(world.getVelocity(h).angular.z).toBeCloseTo(0.5, 6);
	});

	test('removing a joint frees the bodies; removing a body drops its joints; stale handles throw', async () => {
		const world = await rapier();
		const a = world.createBody({ shape: box, mass: 1, position: origin, rotation: ID });
		const b = world.createBody({
			shape: box,
			mass: 1,
			position: { x: 1, y: 0, z: 0 },
			rotation: ID
		});
		const frames = [
			{ position: { x: 0.5, y: 0, z: 0 }, rotation: ID },
			{ position: { x: -0.5, y: 0, z: 0 }, rotation: ID }
		] as const;
		const j = world.createFixedJoint(a, b, frames[0], frames[1]);
		world.removeJoint(j);
		expect(() => world.removeJoint(j)).toThrow(/joint handle/);
		world.applyForce(a, { x: 0, y: 5, z: 0 });
		for (let i = 0; i < 20; i++) world.step(DT);
		expect(world.getTransform(b).position.y).toBe(0);
		const j2 = world.createFixedJoint(a, b, frames[0], frames[1]);
		world.removeBody(a);
		expect(() => world.getTransform(a)).toThrow(/body handle/);
		expect(() => world.removeJoint(j2)).toThrow(/joint handle/);
		world.step(DT);
	});

	test('rejects invalid mass, dt and use after dispose', async () => {
		const world = await createRapierBackend();
		expect(() => world.createBody({ shape: box, mass: 0, position: origin, rotation: ID })).toThrow(
			/mass/
		);
		expect(() => world.step(0)).toThrow(/dt/);
		world.dispose();
		expect(() => world.step(DT)).toThrow(/disposed/);
		world.dispose();
	});
});

describe('mock backend contract', () => {
	test('constant force: semi-implicit Euler, forces last one step', () => {
		const world = createMockBackend();
		const h = world.createBody({ shape: box, mass: 2, position: origin, rotation: ID });
		world.applyForce(h, { x: 10, y: 0, z: 0 });
		world.step(DT);
		world.step(DT);
		expect(world.getVelocity(h).linear.x).toBeCloseTo(5 * DT, 12);
		expect(world.getTransform(h).position.x).toBeCloseTo(5 * DT * DT * 2, 12);
	});

	test('torque, kinematic, fixed, joints and removal', () => {
		const world = createMockBackend();
		const s = world.createBody({
			shape: { type: 'sphere', radius: 1 },
			mass: 5,
			position: origin,
			rotation: ID
		});
		world.applyTorque(s, { x: 0, y: 0, z: 2 });
		world.step(DT);
		expect(world.getVelocity(s).angular.z).toBeCloseTo((2 * DT) / 2, 12); // I = 0.4·5·1 = 2
		const k = world.createBody({
			kind: 'kinematic',
			shape: box,
			mass: 1,
			position: origin,
			rotation: ID,
			linearVelocity: { x: 1, y: 0, z: 0 }
		});
		const f = world.createBody({
			kind: 'fixed',
			shape: box,
			mass: 1,
			position: origin,
			rotation: ID
		});
		world.applyForce(k, { x: 100, y: 0, z: 0 });
		world.step(1);
		expect(world.getTransform(k).position.x).toBe(1);
		expect(world.getTransform(f).position).toEqual(origin);
		const j = world.createFixedJoint(
			k,
			f,
			{ position: origin, rotation: ID },
			{ position: origin, rotation: ID }
		);
		world.removeJoint(j);
		world.removeBody(k);
		expect(() => world.getTransform(k)).toThrow(/body handle/);
	});
});
