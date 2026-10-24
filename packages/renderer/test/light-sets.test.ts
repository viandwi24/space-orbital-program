/** Plan 414 (ADR 0374): the ground, the site and its vegetation see only the sun and the sky. */
import { describe, expect, test } from 'bun:test';
import { MeshStandardMaterial } from 'three';
import { lightSetOf, restrictLights } from '../src/light-sets.ts';
import { LaunchSite } from '../src/site-meshes.ts';

describe('restricting the lights of a material', () => {
	test('sets the same light set on each material once, and leaves the others alone', () => {
		const a = new MeshStandardMaterial();
		const b = new MeshStandardMaterial();
		const vessel = new MeshStandardMaterial();
		const set = { sun: true };
		expect(restrictLights([a, b, a], set)).toBe(2);
		expect(lightSetOf(a)).toBe(set);
		expect(lightSetOf(b)).toBe(set);
		expect(lightSetOf(vessel)).toBeNull();
	});
});

describe('the site materials', () => {
	test('are all lit materials and all take the restricted set; none is left with every light', () => {
		const site = new LaunchSite(600_000, { latitude: 0, longitude: 0 }, 0, 0);
		const lit = site.litMaterials();
		expect(lit.length).toBeGreaterThan(8);
		const set = { sun: true };
		restrictLights(lit, set);
		for (const m of lit) expect(lightSetOf(m)).toBe(set);
		// every material the site's meshes are drawn with that is lit by the scene is in the list
		const used = new Set<unknown>();
		site.root.traverse((o) => {
			const m = (o as { material?: unknown }).material;
			if (m && (m as { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial) used.add(m);
		});
		for (const m of used) expect(lit).toContain(m as MeshStandardMaterial);
		site.dispose();
	});
});

describe('the moon and hills layers', () => {
	test('take the sun and sky only: the layer material is restricted where it is built', async () => {
		const src = await Bun.file(new URL('../src/tsl/moon.ts', import.meta.url)).text();
		const layer = src.slice(src.indexOf('new MoonMaterial()'));
		expect(layer.slice(0, 900)).toContain('restrictLights([m]');
		expect(layer.slice(0, 900)).toContain('this.lights.sun, this.lights.hemisphere');
	});
});
