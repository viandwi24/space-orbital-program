import { describe, expect, test } from 'bun:test';
import {
	BoxGeometry,
	Group,
	Mesh,
	MeshStandardMaterial,
	RawShaderMaterial,
	Scene,
	ShaderMaterial
} from 'three';
import {
	parseRendererChoice,
	rendererBackendFrom,
	resolveRendererBackend
} from '../src/backend.ts';
import { hideUnported } from '../src/webgpu-compat.ts';

describe('renderer backend switch (plan 261)', () => {
	test('reads ?renderer=, null when the address asks for none', () => {
		expect(rendererBackendFrom('')).toBe(null);
		expect(rendererBackendFrom('?renderer=webgpu')).toBe('webgpu');
		expect(rendererBackendFrom('?x=1&renderer=webgpu-fallback')).toBe('webgpu-fallback');
		expect(rendererBackendFrom('?renderer=webgl')).toBe('webgl');
		expect(rendererBackendFrom('?renderer=vulkan')).toBe(null);
	});
	test("Automatic is WebGPU where the browser has it; the player's choice and then the address win", () => {
		expect(resolveRendererBackend('', 'auto', true)).toBe('webgpu');
		expect(resolveRendererBackend('', 'auto', false)).toBe('webgl');
		expect(resolveRendererBackend('', 'webgl', true)).toBe('webgl');
		expect(resolveRendererBackend('', 'webgpu', false)).toBe('webgpu');
		expect(resolveRendererBackend('?renderer=webgl', 'webgpu', true)).toBe('webgl');
		expect(parseRendererChoice('webgl')).toBe('webgl');
		expect(parseRendererChoice(null)).toBe('auto');
		expect(parseRendererChoice('webgpu-fallback')).toBe('auto');
	});
});

describe('hideUnported', () => {
	const geometry = new BoxGeometry();
	test('hides GLSL meshes for the frame and shows them again', () => {
		const scene = new Scene();
		const planet = new Mesh(geometry, new ShaderMaterial({ name: 'planet' }));
		const raw = new Mesh(geometry, new RawShaderMaterial());
		const part = new Mesh(geometry, new MeshStandardMaterial({ name: 'part' }));
		scene.add(planet, raw, part);
		const u = hideUnported(scene);
		expect(u.glsl).toEqual(['RawShaderMaterial', 'planet']);
		expect([planet.visible, raw.visible, part.visible]).toEqual([false, false, true]);
		u.restore();
		expect([planet.visible, raw.visible]).toEqual([true, true]);
	});

	test('leaves hidden meshes alone and lists patched materials', () => {
		const scene = new Scene();
		const off = new Mesh(geometry, new ShaderMaterial({ name: 'off' }));
		off.visible = false;
		const weathered = new MeshStandardMaterial({ name: 'weathered' });
		weathered.onBeforeCompile = () => {};
		const group = new Group();
		group.add(new Mesh(geometry, weathered));
		scene.add(off, group);
		const u = hideUnported(scene);
		expect(u.glsl).toEqual([]);
		expect(u.patched).toEqual(['weathered']);
		u.restore();
		expect(off.visible).toBe(false);
	});
});
