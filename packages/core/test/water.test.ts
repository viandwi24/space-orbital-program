/** Where the water is (plan 067, ADR 0182 point 1). */
import { describe, expect, test } from 'bun:test';
import {
	cachedPlanetMap,
	createBodyTerrainField,
	createMoonTerrainField,
	createRng,
	latLonDirection,
	LEGACY_TERRAIN_SEED,
	sampleMap,
	SEA_LEVEL,
	TERRAIN_MAP_WIDTH,
	terrainShift,
	warpedLatLon,
	type Vec3
} from '../src/index.ts';

const R = 600_000;
const field = createBodyTerrainField({ radius: R, terrain: { kind: 'hills' } })!;
const directions = (n: number): Vec3[] => {
	const rng = createRng(11);
	return Array.from({ length: n }, () => {
		const y = rng.range(-1, 1);
		const a = rng.range(0, 2 * Math.PI);
		const r = Math.sqrt(1 - y * y);
		return { x: r * Math.cos(a), y, z: r * Math.sin(a) };
	});
};

describe('waterAt', () => {
	test('the sea is where the map is under sea level; water is always at height 0', () => {
		const map = cachedPlanetMap(TERRAIN_MAP_WIDTH);
		let water = 0;
		let lakes = 0;
		const dirs = directions(4_000);
		for (const d of dirs) {
			const [lat, lon] = warpedLatLon(d, R, terrainShift(LEGACY_TERRAIN_SEED));
			const sea = sampleMap(map, lat, lon)[0] < SEA_LEVEL;
			const wet = field.waterAt!(d);
			if (sea) expect(wet).toBe(true);
			if (wet) {
				water++;
				if (!sea) lakes++;
				expect(field.heightAt(d)).toBe(0);
			}
		}
		// the map is equalised: the sea covers about SEA_LEVEL of the sphere
		expect(water / dirs.length).toBeGreaterThan(SEA_LEVEL - 0.06);
		expect(water / dirs.length).toBeLessThan(SEA_LEVEL + 0.08);
		expect(lakes).toBeGreaterThanOrEqual(0);
		// the launch site is dry; the moon and a smooth sphere have no water
		expect(field.waterAt!(latLonDirection(0, 0))).toBe(false);
		expect(createMoonTerrainField({ radius: 190_000 }).waterAt).toBeUndefined();
	});
});
