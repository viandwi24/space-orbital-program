/** A save's summary measures over the world's own home (system audit finding 28). */
import { loadPlugins } from '@orbital/core';
import Sol from '@orbital/mod-sol';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { homeRadiusOf, worldHomeRadius } from './home-radius';

describe('the home radius of a save summary', () => {
	it("is the running world's home: the Earth in a Sol world, not stock's Home", async () => {
		const sol = loadPlugins([Stock, Sol], { system: { id: 'sol', variant: '1:1' } }).registries;
		const catalog = { bodies: sol.bodies.list(), home: 'sol.earth' };
		expect(homeRadiusOf(catalog)).toBe(sol.bodies.get('sol.earth')!.radius);
		expect(await worldHomeRadius({ ready: Promise.resolve(catalog) })).toBeCloseTo(6_371_000, -4);
		const stock = loadPlugins([Stock]).registries;
		expect(homeRadiusOf({ bodies: stock.bodies.list() })).toBe(600_000);
	});

	it('is 0 when the world never starts', async () => {
		expect(await worldHomeRadius(null)).toBe(0);
		expect(await worldHomeRadius({ ready: Promise.reject(new Error('no')) })).toBe(0);
	});
});
