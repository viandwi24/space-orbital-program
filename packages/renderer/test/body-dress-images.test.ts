/** Plan 406 (ADR 0363): a mod's albedo and normal images are read when the body is near and let go when it is far. */
import { describe, expect, test } from 'bun:test';
import {
	bodyImageResident,
	bodyMapSize,
	installBodyImages,
	loadBodyImage,
	loadPlugins,
	type Plugin
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { SphereGeometry } from 'three';
import { encodePng } from '../../../tools/mod-build/glb.ts';
import { BodyDress, DRESS_FAR_PX, DRESS_NEAR_PX } from '../src/body-dress.ts';

const patch = (path: string, value: string): Plugin => ({
	meta: { id: 'look', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	optional: [],
	setup(ctx) {
		ctx.patches.register({
			id: `look.${path}`,
			target: 'body',
			select: { id: 'stock.vesper' },
			ops: [{ op: 'set', path, value }]
		} as never);
	}
});
const png = (w: number, h: number, v: number) => encodePng(w, h, new Uint8Array(w * h * 4).fill(v));
const files = new Map([
	[
		'look',
		new Map([
			['a.png', { bytes: png(256, 128, 90) }],
			['n.png', { bytes: png(256, 128, 128) }],
			['bad.png', { bytes: png(100, 100, 1) }]
		])
	]
]);
const tick = () => new Promise((r) => setTimeout(r, 20));

describe("a body's albedo and normal images", () => {
	test('install reads only the header; the pixels come on demand and go on release', async () => {
		const plugins = [Stock, patch('appearance.albedo', 'a.png')];
		expect(await installBodyImages(plugins, files)).toEqual([]);
		expect(bodyMapSize('stock.vesper', 'albedo')).toEqual({ width: 256, height: 128 });
		expect(bodyImageResident('stock.vesper', 'albedo')).toBe(false);
		const image = await loadBodyImage('stock.vesper', 'albedo');
		expect(image).toMatchObject({ width: 256, height: 128 });
		expect(bodyImageResident('stock.vesper', 'albedo')).toBe(true);
	});
	test('a wrong shape is reported with the body and the path', async () => {
		const problems = await installBodyImages([Stock, patch('appearance.normal', 'bad.png')], files);
		expect(problems[0]).toMatchObject({ body: 'stock.vesper', path: 'bad.png' });
		expect(bodyMapSize('stock.vesper', 'normal')).toBeUndefined();
	});
	test('the dress takes them near and drops them far', async () => {
		const both: Plugin = {
			meta: { id: 'look', version: '1.0.0', api: '^0.1' },
			depends: ['stock'],
			optional: [],
			setup(ctx) {
				ctx.patches.register({
					id: 'look.both',
					target: 'body',
					select: { id: 'stock.vesper' },
					ops: [
						{ op: 'set', path: 'appearance.albedo', value: 'a.png' },
						{ op: 'set', path: 'appearance.normal', value: 'n.png' }
					]
				} as never);
			}
		};
		expect(await installBodyImages([Stock, both], files)).toEqual([]);
		const look = loadPlugins([Stock, both]).registries.bodies.get('stock.vesper')!.appearance!;
		const dress = new BodyDress('stock.vesper', 1_000_000, look, new SphereGeometry(1, 8, 4));
		expect(dress.hasImages).toBe(true);
		// the far sphere's program never changes: it has a map and a normal map before, while and after the images
		const programKey = (): string => {
			const m = dress.far.material as unknown as { map: unknown; normalMap: unknown };
			return `${m.map !== null}:${m.normalMap !== null}`;
		};
		const before = programKey();
		expect(before).toBe('true:true');
		dress.frame(DRESS_NEAR_PX - 5, 1e6, false);
		await tick();
		expect(dress.authoredResident).toBe(false);
		dress.frame(DRESS_NEAR_PX + 5, 1e6, false);
		await tick();
		expect(dress.authoredResident).toBe(true);
		expect(bodyImageResident('stock.vesper', 'albedo')).toBe(true);
		expect(programKey()).toBe(before);
		dress.frame(DRESS_FAR_PX + 1, 1e6, false);
		expect(dress.authoredResident).toBe(true);
		dress.frame(DRESS_FAR_PX - 1, 1e6, false);
		expect(dress.authoredResident).toBe(false);
		expect(bodyImageResident('stock.vesper', 'albedo')).toBe(false);
		expect(programKey()).toBe(before);
		dress.dispose();
	});
});
