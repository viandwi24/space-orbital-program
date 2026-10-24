import { describe, expect, test } from 'bun:test';
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { paletteFor } from '../../../packages/renderer/src/effects/plasma-palette.ts';
import { activeProfile, postLook } from '../../../packages/renderer/src/post-profile.ts';
import VisualSample from '../src/index.ts';
import { buildMod } from '../../../tools/mod-build/build-mod.ts';

describe('the visual data sample mod (plan 405, ADR 0345)', () => {
	test('boots after stock, and its palette, plume template and profile reach what the renderer reads', () => {
		const { registries, report } = loadPlugins([Stock, VisualSample]);
		expect(report.patches.map((p) => [p.id, p.applied])).toEqual([
			['visual-sample.green-fire', ['stock.home']],
			['visual-sample.long-plume', ['stock.engine-lv']],
			['visual-sample.teal-world', ['stock.home']],
			['visual-sample.vesper-clouds', ['stock.vesper']]
		]);
		const home = registries.bodies.get('stock.home')!;
		const palette = paletteFor(home.id, home.atmosphere, home.plasma);
		expect(palette.glow.rgb).toEqual([0.1, 0.9, 0.25]);
		expect(palette.multipliers.strength).toBe(1.2);
		expect(registries.parts.get('stock.engine-lv')!.visual?.plume?.template?.lengthScale).toBe(2);
		expect(home.air?.mieG).toBe(0.7);
		expect(home.ocean?.shallow).toBe('#2fd0b0');
		expect(home.weather).toEqual({ mean: 0.6, span: 0.15 });
		expect(registries.bodies.get('stock.vesper')!.appearance?.clouds?.map).toBe(
			'vesper-clouds.png'
		);
		const look = postLook(activeProfile(registries.postProfiles.list()));
		expect(look.bloom).toEqual({ strength: 0.5, radius: 0.7, threshold: 3 });
		expect(look.exposure).toBe(0.85);
	});

	test('builds into a package that parses', async () => {
		const built = await buildMod(new URL('..', import.meta.url).pathname);
		const pkg = JSON.parse(built.text);
		expect(pkg.formatVersion).toBe(3); // an image makes it format 3
		expect(pkg.manifest.id).toBe('visual-sample');
		expect(Object.keys(pkg.assets)).toContain('vesper-clouds.png');
	});
});
