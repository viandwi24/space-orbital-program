/**
 * Plan 052, ADR 0067: the ground of a body follows its own `terrain` data. A body that a mod adds
 * (airless, with a parent, its own crater seed) stands a lander on its own craters; a body without
 * `terrain` is a smooth sphere whatever its parent or atmosphere.
 */
import { describe, expect, test } from 'bun:test';
import {
	createBodyTerrainField,
	createMoonTerrainField,
	GRAVITATIONAL_CONSTANT,
	latLonDirection
} from '@orbital/core';
import { length } from '@orbital/kepler';
import Stock from '@orbital/mod-stock';
import { defineBody, definePlugin } from '@orbital/sdk';
import { createSim } from '../src/index.ts';
import { rapier, stack } from './helpers/vessels.ts';

const RADIUS = 120_000;
const orbit = { a: 9_000_000, e: 0, i: 0, raan: 0, argp: 0, m0: 2, epoch: 0 };
const body = (id: string, extra: object) =>
	defineBody({
		id,
		mass: 2e10 / GRAVITATIONAL_CONSTANT, // mu 2e10: surface gravity 1.4 m/s^2
		radius: RADIUS,
		rotationPeriod: 50_000,
		parent: 'stock.home',
		orbit,
		...extra
	});
const Pebbles = definePlugin({
	meta: { id: 'test-pebbles', version: '1.0.0', api: '^0.1' },
	depends: [Stock],
	setup(ctx) {
		ctx.bodies.register(body('test.pebble', { terrain: { kind: 'craters', seed: 7 } }));
		ctx.bodies.register(body('test.smooth', {}));
		// Plan 059: a second planet with the home planet's hills, without and with an atmosphere.
		ctx.bodies.register(body('test.hills', { terrain: { kind: 'hills' } }));
		ctx.bodies.register(
			body('test.hills-air', {
				terrain: { kind: 'hills' },
				atmosphere: { scaleHeight: 4_000, surfacePressure: 20_000, height: 40_000 }
			})
		);
	}
});

/** 60 km from the landing plain: well into the craters. */
const LONGITUDE = 60_000 / RADIUS;

async function standOn(bodyId: string, longitude = LONGITUDE) {
	const sim = await createSim({
		plugins: [Stock, Pebbles],
		backendFactory: rapier(16),
		seed: 1,
		terrain: createBodyTerrainField
	});
	const reasons: string[] = [];
	sim.events.on('vessel:destroyed', (e) => reasons.push(e.reason));
	const placed = sim.dispatch({
		type: 'load-vessel',
		design: stack('Pod', ['stock.command-pod'], []),
		placement: { kind: 'surface', body: bodyId as never, latitude: 0, longitude }
	});
	if (!placed.ok) throw new Error(placed.reason);
	for (let i = 0; i < 500; i++) sim.step(0.02);
	const v = sim.snapshot().vessels[0];
	if (!v) throw new Error(`the vessel was lost: ${reasons.join(', ')}`);
	const altitude = length(v.position) - RADIUS;
	sim.dispose();
	return { terrainHeight: v.terrainHeight, altitude };
}

describe('terrain kind per body in the sim', () => {
	test("a mod's airless body stands the lander on its own seeded craters", async () => {
		const here = latLonDirection(0, LONGITUDE);
		const own = createBodyTerrainField({
			radius: RADIUS,
			terrain: { kind: 'craters', seed: 7 }
		})!.heightAt(here);
		const stock = createMoonTerrainField({ radius: RADIUS }).heightAt(here);
		expect(Math.abs(own - stock)).toBeGreaterThan(5); // a seed is its own ground
		const r = await standOn('test.pebble');
		// the vessel has settled a few millimetres from the placed spot
		expect(Math.abs(r.terrainHeight! - own)).toBeLessThan(0.05);
		expect(r.altitude).toBeGreaterThan(own);
		expect(r.altitude).toBeLessThan(own + 15);
	}, 30_000);

	test('a body with a parent and no atmosphere but no terrain is a smooth sphere', async () => {
		const r = await standOn('test.smooth');
		expect(r.terrainHeight).toBeUndefined();
		expect(r.altitude).toBeGreaterThan(0);
		expect(r.altitude).toBeLessThan(15);
	}, 30_000);

	// Plan 059. 42 km from the site the second planet's field is 130 m high on a 0.6 percent slope; 30 km
	// out it is 451 m high on a 30 degree one, where the lander slides a few decimetres while it settles.
	for (const id of ['test.hills', 'test.hills-air']) {
		const field = createBodyTerrainField({ radius: RADIUS, terrain: { kind: 'hills' } })!;
		test(`${id}: a lander rests on the gentle hills the renderer now draws`, async () => {
			const longitude = 42_000 / RADIUS;
			const own = field.heightAt(latLonDirection(0, longitude));
			expect(own).toBeGreaterThan(100);
			const r = await standOn(id, longitude);
			expect(Math.abs(r.terrainHeight! - own)).toBeLessThan(0.05);
			expect(r.altitude).toBeGreaterThan(own);
			expect(r.altitude).toBeLessThan(own + 15);
		}, 30_000);

		test(`${id}: and stays on a 30 degree hillside`, async () => {
			const longitude = 30_000 / RADIUS;
			const own = field.heightAt(latLonDirection(0, longitude));
			expect(own).toBeGreaterThan(400);
			const r = await standOn(id, longitude);
			expect(Math.abs(r.terrainHeight! - own)).toBeLessThan(0.5);
			expect(r.altitude).toBeGreaterThan(r.terrainHeight!);
			expect(r.altitude).toBeLessThan(r.terrainHeight! + 15);
		}, 30_000);
	}
});
