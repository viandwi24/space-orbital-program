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
import { rendererBackendFrom } from '../src/backend.ts';
import { hideUnported } from '../src/webgpu-compat.ts';

describe('renderer backend switch (plan 261)', () => {
	test('reads ?renderer= and defaults to WebGL', () => {
		expect(rendererBackendFrom('')).toBe('webgl');
		expect(rendererBackendFrom('?renderer=webgpu')).toBe('webgpu');
		expect(rendererBackendFrom('?x=1&renderer=webgpu-fallback')).toBe('webgpu-fallback');
		expect(rendererBackendFrom('?renderer=vulkan')).toBe('webgl');
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
