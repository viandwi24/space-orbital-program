/** System facts from the bodies (plan 380, ADR 0317): each system's own Δv, no constants. */
import { loadPlugins } from '@orbital/core';
import Sol from '@orbital/mod-sol';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { systemFacts } from './system-facts';

const bodies = (id: string, variant?: string) =>
	loadPlugins([Stock, Sol], {
		system: { id, ...(variant ? { variant } : {}) }
	}).registries.bodies.list();

describe('system facts', () => {
	const stock = systemFacts(bodies('stock'))!;
	const rescaled = systemFacts(bodies('sol', 'rescaled'), 'sol.earth')!;
	const real = systemFacts(bodies('sol', '1:1'), 'sol.earth')!;

	it('reads the home body and its air: 80 km low orbit at stock, 110 km on the real Earth', () => {
		expect(stock.home).toBe('stock.home');
		expect(stock.atmosphereTop).toBe(70_000);
		expect(stock.lowOrbit).toBe(80_000);
		expect(real.home).toBe('sol.earth');
		expect(real.lowOrbit).toBe(real.atmosphereTop! + 10_000);
		expect(rescaled.atmosphereTop).toBe(real.atmosphereTop! / 2);
	});

	it('orders the systems by difficulty: stock < Sol rescaled < Sol 1:1', () => {
		console.log(
			`Δv to orbit: stock ${stock.dvToOrbit.toFixed(0)}, rescaled ${rescaled.dvToOrbit.toFixed(0)}, 1:1 ${real.dvToOrbit.toFixed(0)} m/s; moon orbit ${stock.moon?.dvToOrbit.toFixed(0)}, ${rescaled.moon?.dvToOrbit.toFixed(0)}, ${real.moon?.dvToOrbit.toFixed(0)}`
		);
		expect(stock.dvToOrbit).toBeGreaterThan(3_000);
		expect(stock.dvToOrbit).toBeLessThan(3_800);
		expect(rescaled.dvToOrbit).toBeGreaterThan(stock.dvToOrbit);
		expect(real.dvToOrbit).toBeGreaterThan(8_500);
		expect(real.dvToOrbit).toBeLessThan(10_000);
		expect(real.moon?.name).toBe('Moon');
		expect([stock.difficulty, rescaled.difficulty, real.difficulty]).toEqual([
			'Easy · learning',
			'Medium',
			'Realistic'
		]);
		expect(real.moon!.dvToOrbit).toBeGreaterThan(real.dvToOrbit + 3_000);
	});
});
