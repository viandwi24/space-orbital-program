import { describe, expect, test } from 'bun:test';
import {
	PLANET_MAP_VERSION,
	cachedPlanetMap,
	exportPlanetMaps,
	importPlanetMaps,
	planetMapKey
} from '../src/planet-map.ts';

describe('the biome map cache a client can store (plan 364)', () => {
	test('keys carry the generator version, size, seed and sites', () => {
		const k = planetMapKey(64, { seed: 7, zones: [{ latitude: 0.1, longitude: 0.2 }] });
		expect(k).toBe(`v${PLANET_MAP_VERSION}|64|7|0.1,0.2`);
	});

	test('an imported map is returned without generating; a stale version or a short map is refused', () => {
		const opts = { seed: 991, zones: [{ latitude: 0, longitude: 0.5 }] };
		const key = planetMapKey(32, opts);
		const map = { width: 32, height: 16, data: new Uint8Array(32 * 16 * 4).fill(9) };
		expect(importPlanetMaps([{ key: key.replace(/^v\d+/, 'v0'), map }])).toBe(0);
		expect(importPlanetMaps([{ key, map: { ...map, data: new Uint8Array(8) } }])).toBe(0);
		expect(importPlanetMaps([{ key, map }])).toBe(1);
		expect(cachedPlanetMap(32, opts)).toBe(map);
		// already held: not replaced
		expect(importPlanetMaps([{ key, map }])).toBe(0);
	});

	test('export hands back what was generated, byte for byte', () => {
		const opts = { seed: 1234, zones: [{ latitude: 0.3, longitude: -0.2 }] };
		const made = cachedPlanetMap(16, opts);
		const out = exportPlanetMaps().find((e) => e.key === planetMapKey(16, opts));
		expect(out?.map).toBe(made);
	});
});
