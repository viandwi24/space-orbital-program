/** Regions on bodies and dossiers (plan 104, ADR 0180). */
import { describe, expect, test } from 'bun:test';
import {
	cachedPlanetMap,
	classifyBiome,
	createRng,
	dossierOf,
	LEGACY_TERRAIN_SEED,
	regionAt,
	regionsOf,
	sampleMap,
	TERRAIN_MAP_WIDTH,
	terrainShift,
	warpedLatLon,
	type BodyDefinition,
	type DossierEntryDefinition,
	type Vec3
} from '../src/index.ts';

const home = {
	id: 'x.home',
	mass: 5.29e22,
	radius: 600_000,
	rotationPeriod: 21_600,
	atmosphere: { scaleHeight: 5_600, surfacePressure: 101_325, height: 70_000 },
	terrain: { kind: 'hills' },
	regions: { kind: 'biomes', regions: [{ id: 'desert', multiplier: 1.5 }] }
} as unknown as BodyDefinition;

const directions = (n: number, seed = 1): Vec3[] => {
	const rng = createRng(seed);
	return Array.from({ length: n }, () => {
		const y = rng.range(-1, 1);
		const a = rng.range(0, 2 * Math.PI);
		const r = Math.sqrt(1 - y * y);
		return { x: r * Math.cos(a), y, z: r * Math.sin(a) };
	});
};

describe('regionAt', () => {
	test('on the home body it is the biome the planet map colours, at 1 000 directions', () => {
		const map = cachedPlanetMap(TERRAIN_MAP_WIDTH);
		const seen = new Set<string>();
		for (const d of directions(1_000)) {
			const [lat, lon] = warpedLatLon(d, home.radius, terrainShift(LEGACY_TERRAIN_SEED));
			const region = regionAt(home, d);
			expect(region).toBe(classifyBiome(...sampleMap(map, lat, lon)));
			seen.add(region);
		}
		// a varied planet: most biomes are hit
		expect(seen.size).toBeGreaterThanOrEqual(5);
		expect(regionsOf(home).find((r) => r.id === 'desert')!.multiplier).toBe(1.5);
	});

	test('cells are deterministic and every region gets ground; bands follow the latitude', () => {
		const moon = {
			radius: 190_000,
			regions: {
				kind: 'cells',
				seed: 7,
				regions: [
					{ id: 'highlands', label: 'Highlands' },
					{ id: 'maria', label: 'Maria' },
					{ id: 'crater-fields', label: 'Crater fields' }
				]
			}
		} as unknown as BodyDefinition;
		const dirs = directions(2_000, 3);
		const first = dirs.map((d) => regionAt(moon, d));
		expect(dirs.map((d) => regionAt(moon, d))).toEqual(first);
		for (const id of ['highlands', 'maria', 'crater-fields']) {
			expect(first.filter((r) => r === id).length).toBeGreaterThan(200);
		}
		const banded = {
			radius: 1,
			regions: {
				kind: 'bands',
				bands: [
					{ id: 'tropics', label: 'Tropics', from: -0.4, to: 0.4 },
					{ id: 'north', label: 'North', from: 0.4, to: Math.PI / 2 }
				]
			}
		} as unknown as BodyDefinition;
		expect(regionAt(banded, { x: 1, y: 0, z: 0 })).toBe('tropics');
		expect(regionAt(banded, { x: 0, y: 1, z: 0 })).toBe('north');
		expect(regionAt(banded, { x: 0, y: -1, z: 0 })).toBe('global');
		expect(regionAt({ radius: 1 } as BodyDefinition, { x: 1, y: 0, z: 0 })).toBe('global');
	});
});

describe('dossierOf', () => {
	const entries: DossierEntryDefinition[] = [
		{
			id: 'x.atmosphere',
			label: 'Atmosphere profile',
			order: 0,
			fact: 'atmosphere',
			unlock: { situations: ['stock.flying-high'] }
		},
		{ id: 'x.regions', label: 'Regions found', order: 1, fact: 'regions', unlock: {} }
	];
	const subject = (situation: string, region: string, count = 1) => ({
		body: 'x.home',
		experiment: 'stock.pressure',
		situation,
		region,
		count
	});

	test('an entry unlocks with a matching result on the body and shows its facts', () => {
		const before = dossierOf(home, [subject('stock.landed', 'grass')], entries);
		expect(before.entries[0]).toMatchObject({
			unlocked: false,
			lines: [],
			needs: 'a result while stock.flying-high'
		});
		expect(before.entries[1]!.lines).toEqual([
			{ label: 'Found', value: '1 of 7' },
			{ label: 'Regions', value: 'Grasslands' }
		]);
		const after = dossierOf(
			home,
			[subject('stock.landed', 'grass'), subject('stock.flying-high', 'ocean')],
			entries
		);
		expect(after.entries[0]).toMatchObject({ unlocked: true, needs: '' });
		expect(after.entries[0]!.lines[0]).toEqual({ label: 'Height', value: '70 km' });
		// a subject without results and one on another body unlock nothing
		const none = dossierOf(
			home,
			[
				subject('stock.flying-high', 'ocean', 0),
				{ ...subject('stock.flying-high', 'ocean'), body: 'x.moon' }
			],
			entries
		);
		expect(none.entries.every((e) => !e.unlocked)).toBe(true);
	});
});
