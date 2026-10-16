import { describe, expect, test } from 'bun:test';
import { MeshStandardMaterial, ShaderChunk } from 'three';
import { weatherMaterial, windMaterial } from '../src/weathering.ts';

type Shader = Parameters<MeshStandardMaterial['onBeforeCompile']>[0];

/** The patches replace `#include` markers: if three renames one the patch would silently do nothing. */
const real = (): Shader =>
	({
		uniforms: {},
		vertexShader: ShaderChunk.meshphysical_vert,
		fragmentShader: ShaderChunk.meshphysical_frag
	}) as unknown as Shader;

describe('weathering and wind patches', () => {
	test('three still has every marker the patches rely on', () => {
		for (const marker of ['#include <common>', '#include <begin_vertex>']) {
			expect(ShaderChunk.meshphysical_vert).toContain(marker);
		}
		for (const marker of [
			'#include <common>',
			'#include <color_fragment>',
			'#include <roughnessmap_fragment>'
		]) {
			expect(ShaderChunk.meshphysical_frag).toContain(marker);
		}
	});
	test('weatherMaterial adds the site position varying, the wear code and optional rust', () => {
		const m = new MeshStandardMaterial();
		weatherMaterial(m, { rust: true, amount: 0.8 });
		const shader = real();
		m.onBeforeCompile(shader, undefined as never);
		expect(shader.vertexShader).toContain('vSitePos = position;');
		expect(shader.fragmentShader).toContain('streakMask');
		expect(shader.fragmentShader).toContain('roughnessFactor = clamp(');
		expect(shader.fragmentShader.startsWith('#define WEATHER_RUST')).toBe(true);
		const plain = new MeshStandardMaterial();
		weatherMaterial(plain);
		const s2 = real();
		plain.onBeforeCompile(s2, undefined as never);
		expect(s2.fragmentShader.startsWith('#define WEATHER_RUST')).toBe(false);
		// different options compile different programs
		expect(m.customProgramCacheKey()).not.toBe(plain.customProgramCacheKey());
	});
	test('windMaterial binds the shared time uniform and normalises the bend to the height', () => {
		const m = new MeshStandardMaterial();
		windMaterial(m, { height: 8, strength: 0.05, fade: [40, 70] });
		const shader = real();
		m.onBeforeCompile(shader, undefined as never);
		expect(shader.uniforms.uSiteTime).toBeDefined();
		expect(shader.vertexShader).toContain('position.y / 8.000');
		expect(shader.vertexShader).toContain('smoothstep(40.0, 70.0');
		const m2 = new MeshStandardMaterial();
		windMaterial(m2, { height: 8, strength: 0.05 });
		const s2 = real();
		m2.onBeforeCompile(s2, undefined as never);
		expect(s2.vertexShader).not.toContain('smoothstep(40.0');
	});
});
