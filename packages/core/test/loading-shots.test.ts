/** Plan 379 (ADR 0349): a plugin registers loading-screen shots. */
import { describe, expect, test } from 'bun:test';
import { loadPlugins, loadingShotDefinitionSchema, type Plugin } from '../src/index.ts';

const plugin = (
	shots: ReadonlyArray<{ id: string; caption: string; image: string; order?: number }>
): Plugin => ({
	meta: { id: 'sample', version: '1.0.0', api: '^0.1' },
	depends: [],
	optional: [],
	setup(ctx) {
		for (const s of shots) ctx.loadingShots.register(s);
	}
});

describe('loading shots', () => {
	test('a plugin registers shots and the report names them by plugin', () => {
		const { registries, report } = loadPlugins([
			plugin([
				{ id: 'sample.dawn', caption: 'Dawn over the pad', image: 'shots/dawn.webp' },
				{ id: 'sample.dusk', caption: 'Dusk', image: 'shots/dusk.png', order: -1 }
			])
		]);
		expect(registries.loadingShots.list().map((s) => s.id)).toEqual(['sample.dawn', 'sample.dusk']);
		expect(registries.loadingShots.owner('sample.dawn')).toBe('sample');
		expect(report.registered['loading-shot']).toEqual([
			{ id: 'sample.dawn', by: 'sample' },
			{ id: 'sample.dusk', by: 'sample' }
		]);
	});

	test('the shape is checked: a caption, a .webp or .png path under the package', () => {
		const ok = { id: 'sample.a', caption: 'A', image: 'a.webp' };
		expect(loadingShotDefinitionSchema.safeParse(ok).success).toBe(true);
		expect(loadingShotDefinitionSchema.safeParse({ ...ok, caption: '' }).success).toBe(false);
		expect(loadingShotDefinitionSchema.safeParse({ ...ok, image: 'a.ktx2' }).success).toBe(false);
		expect(loadingShotDefinitionSchema.safeParse({ ...ok, image: '../a.webp' }).success).toBe(
			false
		);
		expect(loadingShotDefinitionSchema.safeParse({ ...ok, image: 'A.WEBP' }).success).toBe(false);
	});
});
