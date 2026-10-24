/**
 * Plan 406 (ADR 0346): a body whose ground is an image from a mod stands a vessel on the image's
 * height, the height the renderer draws (both read the same map by the body's seed).
 */
import { afterEach, describe, expect, test } from 'bun:test';
import {
	clearMapOverrides,
	createBodyTerrainField,
	GRAVITATIONAL_CONSTANT,
	installTerrainMaps,
	latLonDirection
} from '@orbital/core';
import { length } from '@orbital/kepler';
import Stock from '@orbital/mod-stock';
import { defineBody, definePlugin } from '@orbital/sdk';
import { createSim } from '../src/index.ts';
import { encodePng } from '../../../tools/mod-build/glb.ts';
import { rapier, stack } from './helpers/vessels.ts';

afterEach(() => clearMapOverrides());

const RADIUS = 120_000;
const orbit = { a: 9_000_000, e: 0, i: 0, raan: 0, argp: 0, m0: 2, epoch: 0 };

/** A 256 x 128 map: a highland (elevation 0.95) in the east, sea (0.1) elsewhere. */
function mapPng(): Uint8Array {
	const width = 256;
	const height = 128;
	const rgba = new Uint8Array(width * height * 4);
	for (let j = 0; j < height; j++)
		for (let i = 0; i < width; i++) {
			const high = i > width * 0.55 && i < width * 0.9 && j > height * 0.2 && j < height * 0.8;
			rgba.set([high ? 242 : 25, 128, 128, 0], (j * width + i) * 4);
		}
	return encodePng(width, height, rgba);
}

const MapWorld = definePlugin({
	meta: { id: 'mapmod', version: '1.0.0', api: '^0.1' },
	depends: [Stock],
	setup(ctx) {
		ctx.bodies.register(
			defineBody({
				id: 'mapmod.world',
				mass: 2e10 / GRAVITATIONAL_CONSTANT,
				radius: RADIUS,
				rotationPeriod: 50_000,
				parent: 'stock.home',
				orbit,
				terrain: { kind: 'hills', seed: 4242, map: 'maps/world.png' }
			})
		);
	}
});

describe('a mod planet from an image in the sim (plan 406)', () => {
	test('a pod put on the highland rests on the height of the image there, hundreds of metres up', async () => {
		const problems = await installTerrainMaps(
			[Stock, MapWorld],
			new Map([['mapmod', new Map([['maps/world.png', { bytes: mapPng() }]])]])
		);
		expect(problems).toEqual([]);
		const sim = await createSim({
			plugins: [Stock, MapWorld],
			backendFactory: rapier(16),
			seed: 1,
			terrain: createBodyTerrainField
		});
		try {
			// 12 degrees north, 70 degrees east: inside the highland (and 5 km flat zone far away)
			const latitude = 0.2;
			const longitude = 1.2;
			const expected = createBodyTerrainField(
				{ radius: RADIUS, terrain: { kind: 'hills', seed: 4242 } },
				{ seed: 4242, zones: [] }
			)!.heightAt(latLonDirection(latitude, longitude));
			expect(expected).toBeGreaterThan(300);
			const placed = sim.dispatch({
				type: 'load-vessel',
				design: stack('Pod', ['stock.command-pod'], []),
				placement: { kind: 'surface', body: 'mapmod.world' as never, latitude, longitude }
			});
			if (!placed.ok) throw new Error(placed.reason);
			for (let i = 0; i < 500; i++) sim.step(0.02);
			const v = sim.snapshot().vessels[0]!;
			// the ground under it is the image's, and it stands on it
			expect(Math.abs(v.terrainHeight! - expected)).toBeLessThan(2);
			expect(length(v.position) - RADIUS - v.terrainHeight!).toBeLessThan(3);
			expect(length(v.position) - RADIUS).toBeGreaterThan(300);
		} finally {
			sim.dispose();
		}
	}, 60_000);
});
