/** Plan 128 / ADR 0125 point 1: site zones flatten craters ground toward the centre's own height. */
import { describe, expect, test } from 'bun:test';
import {
	createBodyTerrainField,
	latLonDirection,
	moonHeight,
	type TerrainZone
} from '../src/index.ts';

const moon = { radius: 200_000, terrain: { kind: 'craters' as const, seed: 0 } };
const zone: TerrainZone = { latitude: 0.4, longitude: 1.2, flatRadius: 2_000, blendWidth: 3_000 };
const offset = (arc: number) => latLonDirection(zone.latitude + arc / moon.radius, zone.longitude);

describe('flat zones on craters ground', () => {
	test('inside the flat radius the ground is the centre height; beyond the blend it is raw', () => {
		const field = createBodyTerrainField(moon, { seed: 1, zones: [zone] })!;
		const centre = moonHeight(latLonDirection(zone.latitude, zone.longitude), moon.radius, 0);
		for (const arc of [0, 500, 1_500, 1_990]) expect(field.heightAt(offset(arc))).toBeCloseTo(centre, 9);
		for (const arc of [5_001, 8_000, 30_000])
			expect(field.heightAt(offset(arc))).toBe(moonHeight(offset(arc), moon.radius, 0));
		// in the blend it lies between the two
		const mid = offset(3_500);
		const raw = moonHeight(mid, moon.radius, 0);
		const h = field.heightAt(mid);
		expect(h).toBeGreaterThanOrEqual(Math.min(raw, centre) - 1e-9);
		expect(h).toBeLessThanOrEqual(Math.max(raw, centre) + 1e-9);
	});
	test('a craters body with no zones is unchanged', () => {
		const plain = createBodyTerrainField(moon, { seed: 1, zones: [] })!;
		const d = latLonDirection(0.3, -2);
		expect(plain.heightAt(d)).toBe(moonHeight(d, moon.radius, 0));
	});
});
