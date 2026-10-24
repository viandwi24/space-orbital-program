import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { slidesOf, type ShotSource } from './loading-slides';

const options = {
	builtin: new Set(['stock']),
	staticUrl: (file: string) => `/loading/${file}`,
	assetOf: (owner: string, path: string) =>
		owner === 'acme' && path === 'shots/dawn.webp' ? new Uint8Array([1, 2, 3]) : undefined,
	blobUrl: (_bytes: Uint8Array, path: string) => `blob:${path}`
};

describe('the loading screen slides (plan 379)', () => {
	it("stock registers its ten shots, in showing order, as files of the app's loading folder", () => {
		const { registries } = loadPlugins([Stock]);
		const shots = registries.loadingShots
			.entries()
			.map((e): ShotSource => ({ ...e.def, owner: e.by }));
		const slides = slidesOf(shots, options);
		expect(slides).toHaveLength(10);
		expect(slides[0]).toEqual({
			src: '/loading/pad-sunset.webp',
			caption: 'Kronos V on the pad at sunset'
		});
		expect(slides.at(-1)!.caption).toBe('The Space Center');
	});

	it("a mod's shot comes from its package, after the game's by order; one without its picture is left out", () => {
		const shots: ShotSource[] = [
			{ id: 'acme.dawn', caption: 'Dawn', image: 'shots/dawn.webp', owner: 'acme' },
			{ id: 'acme.gone', caption: 'Gone', image: 'shots/gone.webp', owner: 'acme' },
			{ id: 'stock.a', caption: 'A', image: 'a.webp', order: 5, owner: 'stock' },
			{ id: 'acme.first', caption: 'First', image: 'shots/dawn.webp', order: -1, owner: 'acme' }
		];
		expect(slidesOf(shots, options).map((s) => s.caption)).toEqual(['First', 'Dawn', 'A']);
		expect(slidesOf(shots, options)[0]!.src).toBe('blob:shots/dawn.webp');
	});
});
