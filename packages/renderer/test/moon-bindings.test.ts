/**
 * Plan 406 (ADR 0363): a hills body away from the home planet has sky (the air march and the shell), sea
 * (waves, glint, the mod's colours) and the ground in one fragment program, and it stays inside the 16
 * sampled textures WebGPU allows a stage. Counted from the GLSL the pass assembles, plus the ones three's
 * Lambert material adds (the colour map, the directional light's shadow map and an environment map).
 */
import { describe, expect, test } from 'bun:test';
import { moonAirFragmentCommon, moonSeaFragmentCommon } from '../src/moon-air.ts';
import {
	hillsFragmentColor,
	hillsFragmentCommon,
	hillsShadowCommon,
	moonFragmentCommon
} from '../src/shaders/moon.glsl.ts';

const samplers = (...chunks: string[]): Set<string> => {
	const names = new Set<string>();
	for (const chunk of chunks)
		for (const m of chunk.matchAll(/uniform\s+sampler(?:2D|Cube|3D)\s+(\w+)/g)) names.add(m[1]!);
	return names;
};

describe('the hills ground fragment of a mod planet', () => {
	const own = samplers(
		moonFragmentCommon,
		hillsFragmentCommon,
		hillsFragmentColor,
		hillsShadowCommon,
		moonSeaFragmentCommon,
		moonAirFragmentCommon
	);
	test('declares its textures, the biome map and the sea colours as uniforms', () => {
		expect(own.has('uMap')).toBe(true);
		expect(hillsFragmentCommon).toContain('uniform vec3 uSeaDeep');
		expect(hillsFragmentColor).toContain('uSeaShallow');
	});
	test("sampled textures stay within 16 with three's own three added", () => {
		expect(own.size + 3).toBeLessThanOrEqual(16);
	});
});
