/** Plan 406 (ADR 0346): a mod planet's continents come from an image, for the sim and the renderer alike. */
import { afterEach, describe, expect, test } from 'bun:test';
import {
	bodyTerrainSchema,
	clearMapOverrides,
	createBodyTerrainField,
	createTerrainField,
	decodePng,
	installTerrainMaps,
	latLonDirection,
	type BodyDefinition,
	type Plugin
} from '../src/index.ts';
import { encodePng } from '../../../tools/mod-build/glb.ts';

afterEach(() => clearMapOverrides());

/** A 256 x 128 map: a continent east of the middle (elevation 0.9), sea elsewhere (0.1). */
function continentPng(width = 256): Uint8Array {
	const height = width / 2;
	const rgba = new Uint8Array(width * height * 4);
	for (let j = 0; j < height; j++)
		for (let i = 0; i < width; i++) {
			const east = i > width * 0.55 && i < width * 0.9 && j > height * 0.25 && j < height * 0.75;
			rgba.set([east ? 230 : 25, 128, 128, 0], (j * width + i) * 4);
		}
	return encodePng(width, height, rgba);
}

const body = (map = 'maps/world.png', seed = 4242): BodyDefinition =>
	({
		id: 'tmod.world',
		mass: 6e23,
		radius: 600_000,
		rotationPeriod: 20_000,
		terrain: { kind: 'hills', seed, map }
	}) as BodyDefinition;

const plugin = (def: BodyDefinition): Plugin => ({
	meta: { id: 'tmod', version: '1.0.0', api: '^0.1' },
	depends: [],
	optional: [],
	setup(ctx) {
		ctx.bodies.register(def);
	}
});
const assets = (bytes: Uint8Array) => new Map([['tmod', new Map([['maps/world.png', { bytes }]])]]);

describe('a planet drawn from an image (plan 406)', () => {
	test('the PNG decoder reads back what the build tool wrote', async () => {
		const png = continentPng(256);
		const image = await decodePng(png);
		expect(typeof image).toBe('object');
		if (typeof image === 'string') return;
		expect([image.width, image.height]).toEqual([256, 128]);
		expect(image.data[(64 * 256 + 200) * 4]).toBe(230);
		expect(image.data[(64 * 256 + 10) * 4]).toBe(25);
		expect(await decodePng(new Uint8Array(40))).toContain('not a PNG');
	});

	test('the body has land where the image is high and sea where it is low, in the sim and in the renderer', async () => {
		const def = body();
		const problems = await installTerrainMaps([plugin(def)], assets(continentPng()));
		expect(problems).toEqual([]);
		const sim = createBodyTerrainField(def, { seed: 4242, zones: [] })!;
		// the renderer reads the home-style field of the same seed: the same function over the same map
		const render = createTerrainField({ radius: 600_000, seed: 4242 });
		const land = latLonDirection(0.1, 1.2);
		const sea = latLonDirection(0.1, -2);
		expect(sim.waterAt!(land)).toBe(false);
		expect(sim.heightAt(land)).toBeGreaterThan(300);
		expect(sim.waterAt!(sea)).toBe(true);
		let worst = 0;
		let seed = 1;
		const next = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
		for (let i = 0; i < 1000; i++) {
			const v = { x: next(), y: next(), z: next() };
			const l = Math.hypot(v.x, v.y, v.z) || 1;
			const n = { x: v.x / l, y: v.y / l, z: v.z / l };
			worst = Math.max(worst, Math.abs(sim.heightAt(n) - render.heightAt(n)));
		}
		expect(worst).toBeLessThan(0.01);
	});

	test('without the map the body has the continents of its seed, not the image', async () => {
		const def = body();
		const probe = latLonDirection(0.1, 1.2);
		const before = createBodyTerrainField(def, { seed: 4242, zones: [] })!.heightAt(probe);
		await installTerrainMaps([plugin(def)], assets(continentPng()));
		const after = createBodyTerrainField(def, { seed: 4242, zones: [] })!.heightAt(probe);
		expect(after).not.toBe(before);
		// and a world that boots without the mod forgets the image
		clearMapOverrides();
		expect(createBodyTerrainField(def, { seed: 4242, zones: [] })!.heightAt(probe)).toBe(before);
	});

	test('a missing, unreadable or mis-shaped map is reported with the body and the file, and the body keeps its seed', async () => {
		const def = body();
		const missing = await installTerrainMaps([plugin(def)], new Map());
		expect(missing).toEqual([
			{
				mod: 'tmod',
				body: 'tmod.world',
				path: 'maps/world.png',
				message: 'the image is not in the mod package'
			}
		]);
		const text = await installTerrainMaps(
			[plugin(def)],
			assets(new TextEncoder().encode('no png here, really'))
		);
		expect(text[0]!.message).toContain('not a PNG');
		const square = await installTerrainMaps(
			[plugin(def)],
			assets(encodePng(128, 128, new Uint8Array(128 * 128 * 4)))
		);
		expect(square[0]!.message).toContain('twice as wide');
		const tiny = await installTerrainMaps(
			[plugin(def)],
			assets(encodePng(64, 32, new Uint8Array(64 * 32 * 4)))
		);
		expect(tiny[0]!.message).toContain('128 to 4096');
	});

	test("the schema wants a .png path and the body's own seed", () => {
		expect(bodyTerrainSchema.safeParse({ kind: 'hills', seed: 7, map: 'maps/a.png' }).success).toBe(
			true
		);
		const noSeed = bodyTerrainSchema.safeParse({ kind: 'hills', map: 'maps/a.png' });
		expect(noSeed.success).toBe(false);
		expect(noSeed.success ? '' : noSeed.error.issues[0]!.path.join('.')).toBe('seed');
		expect(
			bodyTerrainSchema.safeParse({ kind: 'hills', seed: 7, map: 'maps/a.webp' }).success
		).toBe(false);
		expect(bodyTerrainSchema.safeParse({ kind: 'hills', seed: 7, map: 'Maps/A.png' }).success).toBe(
			false
		);
	});
});
