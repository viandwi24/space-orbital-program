/** Plan 405 (ADR 0362): a mod's cloud map PNG becomes its body's cover, or is reported. */
import { describe, expect, test } from 'bun:test';
import { bodyCloudImage, installBodyImages, type Plugin } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { encodePng } from '../../../tools/mod-build/glb.ts';

const deck: Plugin = {
	meta: { id: 'look', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	optional: [],
	setup(ctx) {
		ctx.patches.register({
			id: 'look.deck',
			target: 'body',
			select: { id: 'stock.vesper' },
			ops: [
				{
					op: 'set',
					path: 'appearance.clouds.map',
					value: 'maps/deck.png'
				}
			]
		} as never);
	}
};
const png = (w: number, h: number) => encodePng(w, h, new Uint8Array(w * h * 4).fill(200));
const files = (bytes: Uint8Array) => new Map([['look', new Map([['maps/deck.png', { bytes }]])]]);

describe('a cloud deck image', () => {
	test('a PNG twice as wide as high is installed for its body', async () => {
		expect(await installBodyImages([Stock, deck], files(png(256, 128)))).toEqual([]);
		expect(bodyCloudImage('stock.vesper')).toMatchObject({ width: 256, height: 128 });
	});
	test('a wrong shape, a wrong size, a missing file or junk is reported and leaves the generated cover', async () => {
		const square = await installBodyImages([Stock, deck], files(png(128, 128)));
		expect(square[0]).toMatchObject({ mod: 'look', body: 'stock.vesper', path: 'maps/deck.png' });
		expect(square[0]!.message).toContain('twice as wide');
		expect(bodyCloudImage('stock.vesper')).toBeUndefined();
		const small = await installBodyImages([Stock, deck], files(png(32, 16)));
		expect(small[0]!.message).toContain('outside');
		const missing = await installBodyImages([Stock, deck], new Map());
		expect(missing[0]!.message).toContain('not in the mod package');
		const junk = await installBodyImages([Stock, deck], files(new Uint8Array([1, 2, 3])));
		expect(junk).toHaveLength(1);
		expect(bodyCloudImage('stock.vesper')).toBeUndefined();
	});
});
