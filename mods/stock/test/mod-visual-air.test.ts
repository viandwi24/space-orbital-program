/** Plan 405, stage 2 (ADR 0362): a mod's air, sea, weather and cloud image, validated where they are registered. */
import { describe, expect, test } from 'bun:test';
import { loadPlugins, type Plugin } from '@orbital/sdk';
import { Stock } from '../src/index.ts';

const mod = (setup: Plugin['setup']): Plugin => ({
	meta: { id: 'look', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	optional: [],
	setup
});
const patch = (path: string, value: unknown, body = 'stock.home') =>
	mod((ctx) => {
		ctx.patches.register({
			id: 'look.p',
			target: 'body',
			select: { id: body },
			ops: [{ op: 'set', path, value }]
		} as never);
	});

describe('air, sea and weather as data', () => {
	test('a patch gives Home a redder air, a green sea and a cloudier weather', () => {
		const { registries, report } = loadPlugins([
			Stock,
			mod((ctx) => {
				ctx.patches.register({
					id: 'look.air',
					target: 'body',
					select: { id: 'stock.home' },
					ops: [
						{ op: 'set', path: 'air', value: { rayleigh: [2, 1, 0.5], mie: 3, mieG: 0.5 } },
						{ op: 'set', path: 'ocean', value: { shallow: '#27c08a', deep: '#064a3a' } },
						{ op: 'set', path: 'weather', value: { mean: 0.7, span: 0.1 } }
					]
				} as never);
			})
		]);
		expect(report.patches[0]!.applied).toEqual(['stock.home']);
		expect(report.patches[0]!.changes).toHaveLength(3);
		const home = registries.bodies.get('stock.home')!;
		expect(home.air).toEqual({ rayleigh: [2, 1, 0.5], mie: 3, mieG: 0.5 });
		expect(home.ocean).toEqual({ shallow: '#27c08a', deep: '#064a3a' });
		expect(home.weather).toEqual({ mean: 0.7, span: 0.1 });
	});

	test('a coefficient out of range, a bad colour or a weather beyond its bounds is refused, naming the field', () => {
		for (const [path, value, named] of [
			['air', { mie: 20 }, 'air'],
			['air', { mieG: 1.2 }, 'air'],
			['air', { rayleigh: [1, 1] }, 'air'],
			['ocean', { shallow: 'green', deep: '#000000' }, 'ocean'],
			['weather', { mean: 0.99, span: 0.1 }, 'weather'],
			['weather', { mean: 0.5, span: 0.9 }, 'weather']
		] as const) {
			const bad = loadPlugins([Stock, patch(path, value)]);
			expect(bad.report.patches[0]!.applied, path).toEqual([]);
			expect(JSON.stringify(bad.report.patches), path).toContain(named);
			expect(bad.registries.bodies.get('stock.home')![path]).toBeUndefined();
		}
	});
});
