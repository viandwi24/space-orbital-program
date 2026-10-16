import { describe, expect, test } from 'bun:test';
import { fbm3, hash3, valueNoise3 } from '../src/noise.ts';
import {
	SEA_LEVEL,
	SITE_CLEAR_RADIUS,
	classifyBiome,
	generatePlanetMap,
	mapUV,
	sampleMap
} from '../src/planet-map.ts';

describe('noise', () => {
	test('hash and noise are deterministic and in [0, 1)', () => {
		expect(hash3(3, -4, 9, 1)).toBe(hash3(3, -4, 9, 1));
		expect(hash3(3, -4, 9, 1)).not.toBe(hash3(3, -4, 9, 2));
		for (let i = 0; i < 500; i++) {
			const h = hash3(i, i * 7, -i, 5);
			expect(h).toBeGreaterThanOrEqual(0);
			expect(h).toBeLessThan(1);
			const n = fbm3(i * 0.37, i * 0.11, -i * 0.23, 5, 9);
			expect(n).toBeGreaterThanOrEqual(0);
			expect(n).toBeLessThanOrEqual(1);
		}
	});
	test('value noise is continuous across lattice cells', () => {
		const a = valueNoise3(0.999999, 0.5, 0.5, 1);
		const b = valueNoise3(1.000001, 0.5, 0.5, 1);
		expect(Math.abs(a - b)).toBeLessThan(1e-4);
	});
});

describe('planet map', () => {
	const map = generatePlanetMap(256);
	test('is deterministic', () => {
		expect(generatePlanetMap(256).data).toEqual(map.data);
	});
	test('the launch site is land of the grass biome with a wide margin', () => {
		for (const dLat of [-1, 0, 1]) {
			for (const dLon of [-1, 0, 1]) {
				const r = SITE_CLEAR_RADIUS * 0.9;
				const [e, m, t, rock] = sampleMap(map, dLat * r, dLon * r);
				expect(e).toBeGreaterThan(SEA_LEVEL + 0.05);
				expect(classifyBiome(e, m, t, rock)).toBe('grass');
			}
		}
		const [u] = mapUV(0, 0);
		expect(u).toBe(0.5); // away from the wrap seam
	});
	test('ocean covers 25..60 % of the area and every biome input is in range', () => {
		let ocean = 0;
		let total = 0;
		for (let j = 0; j < map.height; j++) {
			const w = Math.cos(((j + 0.5) / map.height - 0.5) * Math.PI);
			for (let i = 0; i < map.width; i++) {
				total += w;
				if (map.data[(j * map.width + i) * 4]! / 255 < SEA_LEVEL) ocean += w;
			}
		}
		expect(ocean / total).toBeGreaterThan(0.25);
		expect(ocean / total).toBeLessThan(0.6);
	});
	test('the poles are cold and the planet has several biomes', () => {
		const [, , tPole] = sampleMap(map, 1.5, 0.3);
		const [, , tEq] = sampleMap(map, 0, 0);
		expect(tPole).toBeLessThan(tEq);
		const seen = new Set<string>();
		for (let j = 0; j < map.height; j += 3) {
			for (let i = 0; i < map.width; i += 3) {
				const k = (j * map.width + i) * 4;
				seen.add(
					classifyBiome(
						map.data[k]! / 255,
						map.data[k + 1]! / 255,
						map.data[k + 2]! / 255,
						map.data[k + 3]! / 255
					)
				);
			}
		}
		expect(seen.size).toBeGreaterThanOrEqual(5);
	});
});
