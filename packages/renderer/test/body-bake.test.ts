/** A body's colour map baked from its own surface (plan 403): the same bytes every time, shaded by relief. */
import { describe, expect, test } from 'bun:test';
import { createBodyTerrainField, loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { bakeField, bakeMap, bakeRows } from '../src/body-bake.ts';
import { lookSeed, surfaceMap } from '../src/body-look.ts';

const { registries } = loadPlugins([Stock]);
const cinder = registries.bodies.get('stock.cinder')!;
const look = {
	palette: ['#c9c6c0', '#8f8c87', '#dedad3'],
	pattern: 'mottled'
} as never;
const seed = lookSeed(cinder.id);
const SIZE = { width: 128, height: 64 };
const same = (a: Uint8Array, b: Uint8Array): boolean =>
	a.length === b.length && a.every((v, i) => v === b[i]);

describe('the body bake', () => {
	test('a cratered body has a field to shade by; a smooth one does not', () => {
		expect(bakeField(cinder)).toBeDefined();
		expect(bakeField(registries.bodies.get('stock.home')!)).toBeUndefined();
		expect(bakeField(registries.bodies.get('stock.tempest')!)).toBeUndefined();
	});

	test('without a field it is the palette map, byte for byte', () => {
		expect(same(bakeMap(look, seed, undefined, SIZE), surfaceMap(look, seed, SIZE))).toBe(true);
	});

	test('the same bytes every time, and by slices as in one go', () => {
		const field = bakeField(cinder);
		const whole = bakeMap(look, seed, field, SIZE);
		expect(same(bakeMap(look, seed, bakeField(cinder), SIZE), whole)).toBe(true);
		const sliced = new Uint8Array(whole.length);
		for (let j = 0; j < SIZE.height; j += 5) bakeRows(look, seed, field, SIZE, sliced, j, j + 5);
		expect(same(sliced, whole)).toBe(true);
	});

	test('relief moves the colour: some texels brighter and some darker than the palette, none off the scale', () => {
		const plain = surfaceMap(look, seed, SIZE);
		const baked = bakeMap(look, seed, bakeField(cinder), SIZE);
		let brighter = 0;
		let darker = 0;
		for (let o = 0; o < baked.length; o += 4) {
			if (baked[o + 3] !== 255) throw new Error('opaque');
			const a = baked[o]! + baked[o + 1]! + baked[o + 2]!;
			const b = plain[o]! + plain[o + 1]! + plain[o + 2]!;
			if (a > b + 3) brighter++;
			if (a < b - 3) darker++;
		}
		expect(brighter).toBeGreaterThan(200);
		expect(darker).toBeGreaterThan(200);
	});

	test('a field from core is the sim field: the same heights', () => {
		const a = bakeField(cinder)!;
		const b = createBodyTerrainField(cinder)!;
		const d = { x: 0.6, y: 0.48, z: 0.64 };
		expect(a.heightAt(d)).toBe(b.heightAt(d));
	});
});
