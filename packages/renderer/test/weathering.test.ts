import { describe, expect, test } from 'bun:test';
import { MeshStandardMaterial, ShaderChunk } from 'three';
import { WEATHER_FADE, weatherFine, weatherMaterial, windMaterial } from '../src/weathering.ts';

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
	test('the fine octaves are full near, gone far, and fade monotonically with no pop', () => {
		expect(weatherFine(0)).toBe(1);
		expect(weatherFine(WEATHER_FADE.near)).toBe(1);
		expect(weatherFine(WEATHER_FADE.far)).toBe(0);
		expect(weatherFine(500)).toBe(0);
		let last = 1;
		let step = 0;
		for (let d = WEATHER_FADE.near; d <= WEATHER_FADE.far; d += 0.5) {
			const f = weatherFine(d);
			expect(f).toBeLessThanOrEqual(last);
			step = Math.max(step, last - f);
			last = f;
		}
		// a half metre of walking never moves it by more than a tenth
		expect(step).toBeLessThan(0.1);
	});
	test('the GLSL patch fades and skips the fine octaves by view depth', () => {
		const m = new MeshStandardMaterial();
		weatherMaterial(m);
		const shader = real();
		m.onBeforeCompile(shader, undefined as never);
		expect(shader.fragmentShader).toContain('vViewPosition.z');
		expect(shader.fragmentShader).toContain('if (fine > 0.0)');
		expect(ShaderChunk.meshphysical_frag).toContain('vViewPosition');
	});
});
