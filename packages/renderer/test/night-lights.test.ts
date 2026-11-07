/** Plan 403 (ADR 0342): the city lights of the bake. */
import { describe, expect, test } from 'bun:test';
import {
	createTerrainField,
	LEGACY_ZONE,
	latLonDirection,
	directionLatLon,
	terrainShift,
	LEGACY_TERRAIN_SEED
} from '@orbital/core';
import { LIGHTS_GAIN, lightsExposureScale, nightFactor, nightLights } from '../src/night-lights.ts';
import { DAY_EXPOSURE, NIGHT_EXPOSURE } from '../src/exposure.ts';

const RADIUS = 600_000;
const terrain = createTerrainField({ radius: RADIUS, zones: [LEGACY_ZONE] });
const shift = terrainShift(LEGACY_TERRAIN_SEED);
const at = (lat: number, lon: number): number => {
	const n = latLonDirection(lat, lon);
	const h = terrain.heightAt(n);
	const q = { x: (n.x * RADIUS) / 1000, y: (n.y * RADIUS) / 1000, z: (n.z * RADIUS) / 1000 };
	return nightLights(q, shift, h, directionLatLon(n)[0], terrain.waterAt?.(n) ?? false);
};

describe('night lights (plan 403)', () => {
	test('none on the day side: the factor is 0 where the sun is up and 1 deep in the night', () => {
		expect(nightFactor(0.5)).toBe(0);
		expect(nightFactor(0.05)).toBe(0);
		expect(nightFactor(-0.5)).toBe(1);
		expect(nightFactor(-0.03)).toBeGreaterThan(0);
		expect(nightFactor(-0.03)).toBeLessThan(1);
	});

	test('none on the ice, in the sea or on the high ground', () => {
		let polar = 0;
		let sea = 0;
		let high = 0;
		for (let i = 0; i < 400; i++) {
			const lon = (i / 400) * Math.PI * 2 - Math.PI;
			polar = Math.max(polar, at(1.3 + 0.01 * (i % 20), lon));
			const n = latLonDirection(0.2 + 0.001 * (i % 30), lon);
			if (terrain.waterAt?.(n)) sea = Math.max(sea, at(0.2 + 0.001 * (i % 30), lon));
			if (terrain.heightAt(n) > 1_500) high = Math.max(high, at(0.2 + 0.001 * (i % 30), lon));
		}
		expect(polar).toBe(0);
		expect(sea).toBe(0);
		expect(high).toBe(0);
	});

	test('lights exist on settled low land, and are the minority of the land', () => {
		let lit = 0;
		let land = 0;
		let brightest = 0;
		for (let j = 0; j < 90; j++)
			for (let i = 0; i < 180; i++) {
				const lat = -1.1 + (j / 90) * 2.2;
				const lon = -Math.PI + (i / 180) * 2 * Math.PI;
				const n = latLonDirection(lat, lon);
				if (terrain.waterAt?.(n) || terrain.heightAt(n) < LIGHTS_SHORE_TEST) continue;
				land++;
				const v = at(lat, lon);
				if (v > 0.02) lit++;
				brightest = Math.max(brightest, v);
			}
		expect(land).toBeGreaterThan(1_000);
		expect(lit).toBeGreaterThan(20);
		expect(lit / land).toBeLessThan(0.3);
		expect(brightest).toBeGreaterThan(0.2);
	});
});
const LIGHTS_SHORE_TEST = 4;

describe('night lights (plan 416)', () => {
	const q = (n: { x: number; y: number; z: number }) => ({
		x: (n.x * RADIUS) / 1000,
		y: (n.y * RADIUS) / 1000,
		z: (n.z * RADIUS) / 1000
	});

	test('none on water, more on a lowland coast than on the highland', () => {
		let water = 0;
		const probe = (height: number) => {
			let sum = 0;
			let count = 0;
			for (let j = 0; j < 120; j++)
				for (let i = 0; i < 240; i++) {
					const n = latLonDirection(-1.0 + (j / 120) * 2.0, -Math.PI + (i / 240) * 2 * Math.PI);
					const h = terrain.heightAt(n);
					if (terrain.waterAt?.(n)) {
						water = Math.max(water, nightLights(q(n), shift, h, directionLatLon(n)[0], true));
						continue;
					}
					if (h < height - 20 || h > height + 20) continue;
					sum += nightLights(q(n), shift, h, directionLatLon(n)[0], false);
					count++;
				}
			return [sum, count] as const;
		};
		const [coast, coastN] = probe(40);
		const [high, highN] = probe(900);
		expect(water).toBe(0);
		expect(coastN).toBeGreaterThan(50);
		expect(coast / coastN).toBeGreaterThan(0.02);
		expect(coast / coastN).toBeGreaterThan(5 * (high / Math.max(highN, 1)));
	});

	test('the exposure scale cancels the exposure: the lights read the same on screen at the day and the night exposure', () => {
		expect(lightsExposureScale(DAY_EXPOSURE)).toBe(1);
		expect(lightsExposureScale(NIGHT_EXPOSURE) * NIGHT_EXPOSURE).toBeCloseTo(DAY_EXPOSURE, 5);
		expect(LIGHTS_GAIN * DAY_EXPOSURE).toBeGreaterThan(0.5);
	});
});
