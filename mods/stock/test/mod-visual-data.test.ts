/** Plan 405 (ADR 0345): a mod changes the look with data, and every field is validated where it is registered. */
import { describe, expect, test } from 'bun:test';
import { loadPlugins, type Plugin } from '@orbital/sdk';
import { Stock } from '../src/index.ts';

const GREEN = {
	glow: { rgb: [0.1, 0.9, 0.2], intensity: 0.5 },
	glowHot: { rgb: [0.8, 1, 0.9], intensity: 1 },
	trail: [{ rgb: [0.1, 1, 0.3] }, { rgb: [0.1, 0.6, 0.5] }, { rgb: [0.1, 0.2, 0.7] }],
	streak: { rgb: [0.7, 1, 0.8] },
	wrap: { rgb: [0.2, 0.8, 0.4] },
	shock: { rgb: [0.4, 0.9, 1] },
	gradient: [
		{ at: 0, rgb: [0, 0.4, 0.1] },
		{ at: 0.35, rgb: [0.1, 0.9, 0.2] },
		{ at: 0.7, rgb: [0.3, 1, 0.7] },
		{ at: 1, rgb: [0.8, 1, 1] }
	]
};

const mod = (setup: Plugin['setup']): Plugin => ({
	meta: { id: 'look', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	optional: [],
	setup
});

describe('mod visual data (plan 405)', () => {
	test('a patch gives the home body a plasma palette, and a plume template over a stock engine applies', () => {
		const { registries, report } = loadPlugins([
			Stock,
			mod((ctx) => {
				ctx.patches.register({
					id: 'look.home-plasma',
					target: 'body',
					select: { id: 'stock.home' },
					ops: [{ op: 'set', path: 'plasma', value: GREEN }]
				} as never);
				ctx.patches.register({
					id: 'look.long-plume',
					target: 'part',
					select: { id: 'stock.engine-lv' },
					ops: [
						{
							op: 'set',
							path: 'visual.plume.template',
							value: { propellant: 'hydrolox', lengthScale: 2 }
						}
					]
				} as never);
			})
		]);
		expect(report.patches.map((p) => p.applied.length)).toEqual([1, 1]);
		expect(registries.bodies.get('stock.home')!.plasma!.glow.rgb).toEqual([0.1, 0.9, 0.2]);
		const engine = registries.parts.get('stock.engine-lv')!;
		expect(engine.visual?.plume?.template).toMatchObject({
			propellant: 'hydrolox',
			lengthScale: 2
		});
	});

	test('a palette with a colour out of range or too few stops is refused, naming the field', () => {
		const bad = loadPlugins([
			Stock,
			mod((ctx) => {
				ctx.patches.register({
					id: 'look.bad',
					target: 'body',
					select: { id: 'stock.home' },
					ops: [
						{
							op: 'set',
							path: 'plasma',
							value: { ...GREEN, glow: { rgb: [2, 0, 0] }, gradient: GREEN.gradient.slice(0, 2) }
						}
					]
				} as never);
			})
		]);
		const text = JSON.stringify(bad.report.patches);
		expect(bad.report.patches[0]!.applied).toEqual([]);
		expect(text).toContain('plasma');
		expect(bad.registries.bodies.get('stock.home')!.plasma).toBeUndefined();
	});

	test('a post profile is registered, validated, and the last one is the one drawn', () => {
		const ok = loadPlugins([
			Stock,
			mod((ctx) => {
				ctx.postProfiles.register({ id: 'look.soft', bloom: { strength: 0.6 } });
				ctx.postProfiles.register({ id: 'look.dark', exposure: 0.7 });
			})
		]);
		expect(ok.registries.postProfiles.list().map((p) => p.id)).toEqual(['look.soft', 'look.dark']);
		expect(() =>
			loadPlugins([
				Stock,
				mod((ctx) => {
					ctx.postProfiles.register({ id: 'look.hot', exposure: 9 });
				})
			])
		).toThrow(/exposure/);
	});
});
