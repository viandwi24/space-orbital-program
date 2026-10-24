import { afterEach, describe, expect, test } from 'bun:test';
import {
	bodyImageResident,
	bodyMapSize,
	clearMapOverrides,
	installBodyImages,
	loadBodyImage,
	createBodyTerrainField,
	decodeAssets,
	installTerrainMaps,
	latLonDirection
} from '@orbital/core';
import { length } from '@orbital/kepler';
import Stock from '@orbital/mod-stock';
import { createSim } from '../../../packages/sim/src/index.ts';
import { rapier, stack } from '../../../packages/sim/test/helpers/vessels.ts';
import { buildMod } from '../../../tools/mod-build/build-mod.ts';
import Planet, { Verdant } from '../src/index.ts';

afterEach(() => clearMapOverrides());

/** The package's assets as the host holds them: by mod id, then path. */
async function packaged() {
	const built = await buildMod(new URL('..', import.meta.url).pathname);
	const pkg = JSON.parse(built.text);
	const decoded = await decodeAssets(pkg.assets);
	if (!decoded.ok) throw new Error(decoded.errors.join('; '));
	return { pkg, assets: new Map([['planet-sample', decoded.assets]]) };
}

describe('the planet sample mod (plan 406, ADR 0346)', () => {
	test('builds into a format 3 package with its map, and the map installs', async () => {
		const { pkg, assets } = await packaged();
		expect(pkg.formatVersion).toBe(3);
		expect(pkg.assets['maps/verdant.png'].type).toBe('image/png');
		expect(await installTerrainMaps([Stock, Planet], assets)).toEqual([]);
		// the relief image is read lazily: its size is known, its pixels come on demand
		expect(await installBodyImages([Stock, Planet], assets)).toEqual([]);
		expect(bodyMapSize('planet-sample.verdant', 'normal')).toEqual({ width: 512, height: 256 });
		expect(bodyImageResident('planet-sample.verdant', 'normal')).toBe(false);
		const normals = await loadBodyImage('planet-sample.verdant', 'normal');
		expect(normals?.data[2]).toBeGreaterThan(127); // flat sea faces up the map's blue
	});

	test('a vessel set down on its highland rests on the height the image gives', async () => {
		const { assets } = await packaged();
		await installTerrainMaps([Stock, Planet], assets);
		const sim = await createSim({
			plugins: [Stock, Planet],
			backendFactory: rapier(16),
			seed: 1,
			terrain: createBodyTerrainField
		});
		try {
			// the first continent's highland: (150, 100) of 512 x 256 texels
			const longitude = ((150 + 0.5) / 512 - 0.5) * 2 * Math.PI;
			const latitude = ((100 + 0.5) / 256 - 0.5) * Math.PI;
			const expected = createBodyTerrainField(Verdant, { seed: 31337, zones: [] })!.heightAt(
				latLonDirection(latitude, longitude)
			);
			expect(expected).toBeGreaterThan(200);
			const placed = sim.dispatch({
				type: 'load-vessel',
				design: stack('Pod', ['stock.command-pod'], []),
				placement: { kind: 'surface', body: 'planet-sample.verdant' as never, latitude, longitude }
			});
			if (!placed.ok) throw new Error(placed.reason);
			for (let i = 0; i < 500; i++) sim.step(0.02);
			const v = sim.snapshot().vessels[0]!;
			expect(Math.abs(v.terrainHeight! - expected)).toBeLessThan(2);
			expect(length(v.position) - 400_000 - v.terrainHeight!).toBeLessThan(3);
		} finally {
			sim.dispose();
		}
	}, 60_000);
});
