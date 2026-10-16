import { afterEach, describe, expect, test } from 'bun:test';
import type { BodyDesc, PhysicsBackend } from '@orbital/core';
import { createMockBackend, createRapierBackend } from '../src/index.ts';
import { ID, rotate } from './helpers.ts';

const DT = 0.02;
const origin = { x: 0, y: 0, z: 0 };
const half = { x: 0.5, y: 0.5, z: 0.5 };

/** Three unit boxes stacked along Y (centres at y = 0, 1, 2) as one compound body. */
const tower: BodyDesc['shape'] = {
	type: 'compound',
	shapes: [0, 1, 2].map((y) => ({
		shape: { type: 'box' as const, halfExtents: half },
		position: { x: 0, y, z: 0 }
	}))
};
const inertia = { x: 100, y: 20, z: 100 };

const live: PhysicsBackend[] = [];
async function rapier(): Promise<PhysicsBackend> {
	const b = await createRapierBackend();
	live.push(b);
	return b;
}
afterEach(() => {
	for (const b of live.splice(0)) b.dispose();
});

describe('compound bodies (plan 011)', () => {
	test('a force at the centre of mass does not spin the body; the velocity is the COM velocity', async () => {
		const world = await rapier();
		const h = world.createBody({
			shape: tower,
			mass: 30,
			inertia,
			centerOfMass: { x: 0, y: 1, z: 0 },
			position: origin,
			rotation: ID
		});
		for (let i = 0; i < 50; i++) {
			const p = world.getTransform(h).position;
			world.applyForce(h, { x: 30, y: 0, z: 0 }, { x: p.x, y: p.y + 1, z: p.z });
			world.step(DT);
		}
		expect(Math.abs(world.getVelocity(h).angular.z)).toBeLessThan(1e-6);
		expect(world.getVelocity(h).linear.x).toBeCloseTo(1, 4);
		// The same force through the origin (1 m below the COM) does spin it.
		const g = world.createBody({
			shape: tower,
			mass: 30,
			inertia,
			centerOfMass: { x: 0, y: 1, z: 0 },
			position: { x: 10, y: 0, z: 0 },
			rotation: ID
		});
		world.applyForce(g, { x: 30, y: 0, z: 0 }, { x: 10, y: 0, z: 0 });
		world.step(DT);
		// torque = r × F = (0,-1,0) × (30,0,0) = (0,0,30); α = 30 / 100
		expect(world.getVelocity(g).angular.z).toBeCloseTo((30 / 100) * DT, 6);
	});

	test('free spin turns about the centre of mass, which moves in a straight line', async () => {
		const world = await rapier();
		const h = world.createBody({
			shape: tower,
			mass: 30,
			inertia,
			centerOfMass: { x: 0, y: 1, z: 0 },
			position: origin,
			rotation: ID,
			linearVelocity: { x: 2, y: 0, z: 0 },
			angularVelocity: { x: 0, y: 0, z: 1 }
		});
		for (let i = 0; i < 100; i++) world.step(DT);
		const t = world.getTransform(h);
		const com = {
			x: t.position.x + rotate(t.rotation, { x: 0, y: 1, z: 0 }).x,
			y: t.position.y + rotate(t.rotation, { x: 0, y: 1, z: 0 }).y,
			z: 0
		};
		expect(com.x).toBeCloseTo(4, 3); // 2 m/s for 2 s
		expect(com.y).toBeCloseTo(1, 3);
	});

	test('setMass moves the centre of mass and keeps the COM velocity', async () => {
		const world = await rapier();
		const h = world.createBody({
			shape: tower,
			mass: 30,
			inertia,
			position: origin,
			rotation: ID,
			linearVelocity: { x: 0, y: 3, z: 0 }
		});
		world.step(DT);
		world.setMass(h, 20, inertia, { centerOfMass: { x: 0, y: 2, z: 0 } });
		world.step(DT);
		expect(world.getVelocity(h).linear.y).toBeCloseTo(3, 5);
		// A force through the new COM (y = 2 above the origin) causes no torque.
		const p = world.getTransform(h).position;
		world.applyForce(h, { x: 20, y: 0, z: 0 }, { x: p.x, y: p.y + 2, z: p.z });
		world.step(DT);
		expect(Math.abs(world.getVelocity(h).angular.z)).toBeLessThan(1e-6);
	});

	test('every primitive collides: a compound dropped on a fixed floor lands on its lowest box', async () => {
		const world = await rapier();
		world.createBody({
			kind: 'fixed',
			shape: { type: 'box', halfExtents: { x: 10, y: 0.5, z: 10 } },
			mass: 1,
			position: { x: 0, y: -0.5, z: 0 },
			rotation: ID
		});
		// Lowest box centre is 1 m above the origin of this body (boxes at y = 1, 2, 3).
		const h = world.createBody({
			shape: {
				type: 'compound',
				shapes: [1, 2, 3].map((y) => ({
					shape: { type: 'box' as const, halfExtents: half },
					position: { x: 0, y, z: 0 }
				}))
			},
			mass: 30,
			inertia,
			centerOfMass: { x: 0, y: 2, z: 0 },
			position: { x: 0, y: 0.5, z: 0 },
			rotation: ID
		});
		for (let i = 0; i < 100; i++) {
			world.applyForce(h, { x: 0, y: -30 * 9.81, z: 0 });
			world.step(DT);
		}
		// Resting: lowest box bottom at y = 0 -> its centre at 0.5 -> body origin at -0.5.
		expect(world.getTransform(h).position.y).toBeCloseTo(-0.5, 2);
	});

	test('rejects an empty compound, a compound without inertia, and a bad primitive', async () => {
		const world = await rapier();
		const base = { mass: 1, position: origin, rotation: ID };
		expect(() =>
			world.createBody({ ...base, shape: { type: 'compound', shapes: [] }, inertia })
		).toThrow(/at least one/);
		expect(() => world.createBody({ ...base, shape: tower })).toThrow(/explicit `inertia`/);
		expect(() =>
			world.createBody({
				...base,
				inertia,
				shape: {
					type: 'compound',
					shapes: [{ shape: { type: 'sphere', radius: 0 }, position: origin }]
				}
			})
		).toThrow(/invalid sphere/);
	});

	test('two runs with the same creation order give identical states (determinism)', async () => {
		const run = async (): Promise<string> => {
			const world = await rapier();
			const h = world.createBody({
				shape: tower,
				mass: 30,
				inertia,
				centerOfMass: { x: 0, y: 1, z: 0 },
				position: origin,
				rotation: ID,
				angularVelocity: { x: 0.3, y: 0.1, z: 0.5 }
			});
			for (let i = 0; i < 200; i++) {
				world.applyForce(h, { x: 5, y: 3, z: 1 }, { x: 0, y: 2, z: 0 });
				world.step(DT);
			}
			return JSON.stringify([world.getTransform(h), world.getVelocity(h)]);
		};
		expect(await run()).toBe(await run());
	});

	test('the mock backend accepts compound bodies', () => {
		const mock = createMockBackend();
		const h = mock.createBody({ shape: tower, mass: 30, inertia, position: origin, rotation: ID });
		mock.applyForce(h, { x: 30, y: 0, z: 0 });
		mock.step(1);
		expect(mock.getVelocity(h).linear.x).toBe(1);
	});
});
