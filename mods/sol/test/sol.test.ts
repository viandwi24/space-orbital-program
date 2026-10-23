/** The Sol pack through the loader (plan 124, ADR 0184): variants, patches, the bodies' data. */
import { describe, expect, test } from 'bun:test';
import { GRAVITATIONAL_CONSTANT, loadPlugins } from '@orbital/sdk';
import Stock from '@orbital/mod-stock';
import Sol, {
	RESCALE,
	RESCALE_DISTANCE,
	SOL_BODIES,
	SOL_VARIANTS,
	SolEarth,
	SolMoon
} from '../src/index.ts';

const load = (variant: string) => loadPlugins([Stock, Sol], { system: { id: 'sol', variant } });

describe('Sol variants', () => {
	for (const v of SOL_VARIANTS) {
		test(`${v.variant} loads with every patch applied and only Sol's bodies`, () => {
			const { registries, report } = load(v.variant);
			const ours = report.patches.filter((p) => p.by === 'sol');
			expect(ours.length).toBe(v.patches?.length ?? 0);
			expect(ours.filter((p) => p.disabled)).toEqual([]);
			expect(ours.every((p) => p.applied.length === 1)).toBe(true);
			expect(registries.bodies.list().map((b) => b.id)).toEqual(SOL_BODIES.map((b) => b.id));
			expect(v.facts.moonTransfer! / 86_400).toBeGreaterThan(3);
			expect(v.facts.moonTransfer! / 86_400).toBeLessThan(7);
		});
	}

	test('rescaled: sizes ×1/4, masses ×1/16, distances ×(1/4)^(2/3), the air halved', () => {
		const { registries } = load('rescaled');
		const earth = registries.bodies.get('sol.earth')!;
		const moon = registries.bodies.get('sol.moon')!;
		expect(earth.radius).toBeCloseTo(SolEarth.radius * RESCALE, 6);
		expect(earth.mass / SolEarth.mass).toBeCloseTo(RESCALE * RESCALE, 12);
		expect(moon.orbit!.a / SolMoon.orbit!.a).toBeCloseTo(RESCALE_DISTANCE, 12);
		expect(moon.orbit!.series!.parentRadius / SolMoon.orbit!.series!.parentRadius).toBeCloseTo(
			RESCALE_DISTANCE,
			12
		);
		expect(earth.atmosphere!.height).toBe(50_000);
		// surface gravity is the Earth's either way
		const g = (b: { mass: number; radius: number }) =>
			(GRAVITATIONAL_CONSTANT * b.mass) / b.radius ** 2;
		expect(g(earth)).toBeCloseTo(9.82, 1);
	});

	test('parts are the same in every system: no Sol patch targets a part (plan 380, ADR 0317)', () => {
		for (const v of SOL_VARIANTS)
			expect((v.patches ?? []).filter((p) => p.target !== 'body').map((p) => p.id)).toEqual([]);
		const parts = (system: { id: string; variant?: string }) =>
			JSON.stringify(loadPlugins([Stock, Sol], { system }).registries.parts.list());
		const stock = parts({ id: 'stock' });
		expect(parts({ id: 'sol', variant: '1:1' })).toBe(stock);
		expect(parts({ id: 'sol', variant: 'rescaled' })).toBe(stock);
	});

	test('a stock world loads no Sol body and no Sol patch', () => {
		const { registries, report } = loadPlugins([Stock, Sol], { system: { id: 'stock' } });
		expect(registries.bodies.list().some((b) => b.id.startsWith('sol.'))).toBe(false);
		expect(report.patches.some((p) => p.by === 'sol')).toBe(false);
		expect(registries.parts.get('stock.engine-lv')!.modules![0]![1]).toMatchObject({
			thrust: 215_000
		});
	});

	test('the bodies carry real data: J2000 spin, Level A paths, the Almanac Moon', () => {
		const earth = SolEarth;
		expect(earth.rotation!.epoch).toBe('j2000');
		expect(earth.orbit!.model).toBe('kepler-rates');
		expect(SolMoon.orbit!.model).toBe('series');
		// the Earth's pole is 23.44° from the ecliptic pole (+Y)
		expect(90 - (earth.rotation!.pole as { dec: number }).dec * (180 / Math.PI)).toBeCloseTo(
			23.44,
			2
		);
		// a sidereal day
		expect((2 * Math.PI) / earth.rotation!.wDot!).toBeCloseTo(86_164.1, 0);
	});
});
