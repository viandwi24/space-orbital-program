import { afterEach, describe, expect, test } from 'bun:test';
import type { PhysicsBackend } from '@orbital/core';
import { createMockBackend, createRapierBackend } from '../src/index.ts';
import { ID } from './helpers.ts';

const DT = 0.02;
const live: PhysicsBackend[] = [];
async function rapier(): Promise<PhysicsBackend> {
	const b = await createRapierBackend();
	live.push(b);
	return b;
}
afterEach(() => {
	for (const b of live.splice(0)) b.dispose();
});

/** A fixed 100 m wide slab with its top face at y = 0. */
function ground(world: PhysicsBackend, friction = 0.8) {
	return world.createBody({
		kind: 'fixed',
		shape: { type: 'box', halfExtents: { x: 50, y: 5, z: 50 } },
		mass: 1,
		inertia: { x: 1, y: 1, z: 1 },
		position: { x: 0, y: -5, z: 0 },
		rotation: ID,
		friction
	});
}
const half = { x: 0.5, y: 0.5, z: 0.5 };

describe('contact readback and material (plan 012)', () => {
	test('a falling compound body lands on a fixed slab; contacts name the collider and the distance', async () => {
		const world = await rapier();
		const floor = ground(world);
		const body = world.createBody({
			shape: {
				type: 'compound',
				shapes: [
					{ shape: { type: 'box', halfExtents: half }, position: { x: 0, y: 3, z: 0 } },
					{ shape: { type: 'box', halfExtents: half }, position: { x: 0, y: 0, z: 0 } }
				]
			},
			mass: 10,
			inertia: { x: 5, y: 5, z: 5 },
			centerOfMass: { x: 0, y: 1, z: 0 },
			position: { x: 0, y: 3, z: 0 },
			rotation: ID,
			friction: 0.8
		});
		expect(world.contacts(body, floor)).toEqual([]);
		for (let i = 0; i < 100; i++) {
			world.applyForce(body, { x: 0, y: -98.1, z: 0 });
			world.step(DT);
		}
		const contacts = world.contacts(body, floor);
		expect(contacts.length).toBeGreaterThanOrEqual(4);
		expect(new Set(contacts.map((c) => c.shape))).toEqual(new Set([1])); // the lower box only
		for (const c of contacts) {
			expect(c.distance).toBeLessThanOrEqual(0.02);
			expect(Math.abs(c.point.y)).toBeLessThan(0.05);
		}
		expect(Math.abs(world.getVelocity(body).linear.y)).toBeLessThan(0.05);
	});

	test('friction decides whether a sliding box stops', async () => {
		const stop: number[] = [];
		for (const friction of [0, 0.8]) {
			const world = await rapier();
			ground(world, friction);
			const box = world.createBody({
				shape: { type: 'box', halfExtents: half },
				mass: 10,
				position: { x: 0, y: 0.5, z: 0 },
				rotation: ID,
				linearVelocity: { x: 3, y: 0, z: 0 },
				friction
			});
			for (let i = 0; i < 150; i++) {
				world.applyForce(box, { x: 0, y: -98.1, z: 0 });
				world.step(DT);
			}
			stop.push(world.getVelocity(box).linear.x);
		}
		expect(stop[0]).toBeGreaterThan(2.9); // frictionless: keeps sliding
		expect(Math.abs(stop[1]!)).toBeLessThan(0.01); // v²/(2µg) = 0.57 m, 0.38 s
	});

	test('restitution bounces a ball-like box; zero does not', async () => {
		const peaks: number[] = [];
		for (const restitution of [0, 0.9]) {
			const world = await rapier();
			ground(world);
			const box = world.createBody({
				shape: { type: 'box', halfExtents: half },
				mass: 10,
				position: { x: 0, y: 0.5, z: 0 },
				rotation: ID,
				linearVelocity: { x: 0, y: -5, z: 0 },
				restitution
			});
			let up = 0;
			for (let i = 0; i < 20; i++) {
				world.applyForce(box, { x: 0, y: -98.1, z: 0 });
				world.step(DT);
				up = Math.max(up, world.getVelocity(box).linear.y);
			}
			peaks.push(up);
		}
		expect(peaks[0]!).toBeLessThan(0.1);
		expect(peaks[1]!).toBeGreaterThan(2);
	});

	test('friction and restitution are validated; the mock reports no contacts', async () => {
		const world = await rapier();
		const bad = {
			shape: { type: 'sphere' as const, radius: 1 },
			mass: 1,
			position: { x: 0, y: 0, z: 0 },
			rotation: ID
		};
		expect(() => world.createBody({ ...bad, friction: -1 })).toThrow(/friction/);
		expect(() => world.createBody({ ...bad, restitution: Number.NaN })).toThrow(/restitution/);
		const mock = createMockBackend();
		const a = mock.createBody(bad);
		const b = mock.createBody(bad);
		expect(mock.contacts(a, b)).toEqual([]);
	});
});
