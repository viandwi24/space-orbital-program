/** Plan 128 / ADR 0125 point 1: the moon pass reads a craters body's base zones like the sim. */
import { describe, expect, test } from 'bun:test';
import { createBodyTerrainField, latLonDirection, type TerrainZone } from '@orbital/core';
import { MoonPass } from '../src/moon.ts';

const zone: TerrainZone = { latitude: -0.2, longitude: 0.7, flatRadius: 2_000, blendWidth: 3_000 };

describe('base zones on a craters body', () => {
	test("the pass's CPU height is the sim's zoned field, and the bakes carry the zone", () => {
		const pass = new MoonPass('test.moon', 200_000, { seed: 3, zones: [zone] });
		const sim = createBodyTerrainField(
			{ radius: 200_000, terrain: { kind: 'craters', seed: 3 } },
			{ seed: 1, zones: [zone] }
		)!;
		for (let k = 0; k < 40; k++) {
			const d = latLonDirection(zone.latitude + (k - 20) * 2e-4, zone.longitude + k * 1e-4);
			expect(pass.groundHeight(d)).toBe(sim.heightAt(d));
		}
		const mats = pass as unknown as {
			cubeMaterial: { uniforms: Record<string, { value: unknown }> };
			patchMaterial: { uniforms: Record<string, { value: unknown }> };
		};
		for (const m of [mats.cubeMaterial, mats.patchMaterial]) expect(m.uniforms.uCraterZoneCount!.value).toBe(1);
		const bare = new MoonPass('test.bare', 200_000, { seed: 3 }) as unknown as typeof mats;
		expect(bare.cubeMaterial.uniforms.uCraterZoneCount!.value).toBe(0);
	});
});
