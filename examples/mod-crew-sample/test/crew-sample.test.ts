import { describe, expect, test } from 'bun:test';
import { decodeAssets, loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import CrewSample from '../src/index.ts';
import { bandPortrait } from '../assets.ts';
import { buildMod } from '../../../tools/mod-build/build-mod.ts';

describe('the crew sample mod (plan 375, ADR 0313)', () => {
	test('boots after stock: its walk wins, its patch recolours the mechanics', () => {
		const { registries, report } = loadPlugins([Stock, CrewSample]);
		const walks = registries.crewAnimations.list().filter((a) => a.role === 'walk');
		expect(walks.at(-1)?.id).toBe('crew-sample.march');
		expect(registries.crewOutfits.get('stock.mechanic')?.suit).toBe(0x1f8a8a);
		expect(report.patches.find((p) => p.id === 'crew-sample.teal-mechanics')?.applied).toEqual([
			'stock.mechanic'
		]);
	});

	test('builds into a format 3 package whose portrait image checks out', async () => {
		const built = await buildMod(new URL('..', import.meta.url).pathname);
		const pkg = JSON.parse(built.text);
		expect(pkg.formatVersion).toBe(3);
		expect(pkg.assets['portraits/band.png'].type).toBe('image/png');
		const decoded = await decodeAssets(pkg.assets);
		expect(decoded.ok).toBe(true);
		expect(bandPortrait().slice(0, 4)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
	});
});
